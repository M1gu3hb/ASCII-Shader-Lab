/**
 * History and collection data: types and pure policies (normalisation, pruning, merging).
 * No storage and no UI here, so the rules can be tested on their own; `store.ts` applies them.
 */
import { normalizeRecipe, type Recipe } from '../engine/recipe';
import { PATTERN_IDS } from '../engine/catalog';
import { spaceById, type SpaceId } from '../random/spaces';

export type EntryKind = 'inicio' | 'azar' | 'variación' | 'receta' | 'importado' | 'favorito' | 'enlace' | 'espacio';
const KINDS: EntryKind[] = ['inicio', 'azar', 'variación', 'receta', 'importado', 'favorito', 'enlace', 'espacio'];

export interface Entry {
  id: string;
  recipe: Recipe;
  origin: Recipe;
  kind: EntryKind;
  label?: string;
  seed?: string;
  arch?: string;
  space: SpaceId;
  created: number;
  /** Last edit (undo and redo count), so a session from another computer can tell which version is newer. */
  updated?: number;
  edited: boolean;
  thumb?: string;
  favId?: string;
}

export interface Favorite {
  id: string;
  name: string;
  recipe: Recipe;
  thumb?: string;
  created: number;
  updated: number;
  space: SpaceId;
}

/** Results kept in this browser. Past it, the oldest non-favourite results are discarded. */
export const HISTORY_LIMIT = 1000;
/** Share of the limit at which the person is warned (once per session). */
export const HISTORY_WARN = 0.9;

/** The permanent counter shown where the history lives. */
export const historyLabel = (count: number, limit: number) => `Historial: ${count} de ${limit} · lo guardado con ★ no se descarta`;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const str = (v: unknown, max: number) => (typeof v === 'string' && v ? v.slice(0, max) : undefined);
const thumbOf = (v: unknown) => (typeof v === 'string' && v.startsWith('data:image/') && v.length < 400_000 ? v : undefined);
const time = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fb);

/** Sanitises a stored or imported history entry. Returns null when there is no recipe at all. */
export function normalizeEntry(x: unknown): Entry | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (!o.recipe || typeof o.recipe !== 'object') return null;
  const recipe = normalizeRecipe(o.recipe, PATTERN_IDS);
  const e: Entry = {
    id: str(o.id, 40) ?? uid(),
    recipe,
    origin: normalizeRecipe(o.origin ?? o.recipe, PATTERN_IDS),
    kind: KINDS.includes(o.kind as EntryKind) ? (o.kind as EntryKind) : 'importado',
    space: spaceById(String(o.space ?? recipe.meta.space ?? '')).id,
    created: time(o.created, Date.now()),
    edited: typeof o.edited === 'boolean' ? o.edited : false,
  };
  if (typeof o.updated === 'number' && Number.isFinite(o.updated) && o.updated > 0) e.updated = o.updated;
  const label = str(o.label, 80), seed = str(o.seed, 80), arch = str(o.arch, 40), thumb = thumbOf(o.thumb), favId = str(o.favId, 40);
  if (label) e.label = label;
  if (seed) e.seed = seed;
  if (arch) e.arch = arch;
  if (thumb) e.thumb = thumb;
  if (favId) e.favId = favId;
  return e;
}

export function normalizeFavorite(x: unknown): Favorite | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (!o.recipe || typeof o.recipe !== 'object') return null;
  const now = Date.now();
  const f: Favorite = {
    id: str(o.id, 40) ?? uid(),
    name: str(o.name, 80) ?? 'Importado',
    recipe: normalizeRecipe(o.recipe, PATTERN_IDS),
    created: time(o.created, now),
    updated: time(o.updated, now),
    space: spaceById(String(o.space ?? '')).id,
  };
  const thumb = thumbOf(o.thumb);
  if (thumb) f.thumb = thumb;
  return f;
}

/** The entry as stored in its own record: everything but the thumbnail (stored apart). */
export function entryBody(e: Entry): Omit<Entry, 'thumb'> {
  const { thumb: _thumb, ...rest } = e;
  return rest;
}

/** Same stored body (the store replaces objects on change, so references are enough). */
export function sameBody(a: Entry, b: Entry): boolean {
  return a.recipe === b.recipe && a.origin === b.origin && a.kind === b.kind && a.label === b.label && a.seed === b.seed
    && a.arch === b.arch && a.space === b.space && a.created === b.created && a.updated === b.updated && a.edited === b.edited
    && a.favId === b.favId && a.id === b.id;
}

/**
 * Keeps the history within `limit` by discarding the oldest entries (by the date they were made, so
 * an older session opened later goes before today's results) that are neither the current one nor
 * kept (favourites). If everything left is kept, the history may stay over the limit.
 */
export function pruneHistory<E extends { id: string; created: number }>(entries: E[], cursor: number, limit: number, keep: (e: E) => boolean): { entries: E[]; cursor: number; dropped: E[] } {
  const excess = entries.length - Math.max(1, limit);
  if (excess <= 0) return { entries, cursor, dropped: [] };
  // candidates, oldest first (ties: earlier in the history first)
  const order = entries.map((_e, i) => i).filter(i => i !== cursor && !keep(entries[i]))
    .sort((a, b) => entries[a].created - entries[b].created || a - b);
  const drop = new Set(order.slice(0, excess));
  if (!drop.size) return { entries, cursor, dropped: [] };
  const kept: E[] = [], dropped: E[] = [];
  entries.forEach((e, i) => (drop.has(i) ? dropped : kept).push(e));
  const cur = entries[cursor];
  return { entries: kept, cursor: cur ? kept.indexOf(cur) : kept.length - 1, dropped };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** When an entry last changed: its last edit, or when it was made. */
export const entryTime = (e: Entry) => e.updated ?? e.created;

/**
 * Adds an imported session after the current history. An entry or favourite already here (same id)
 * is not duplicated: when both versions differ, the one changed last is kept (a session carried to
 * another computer and back brings the edits made there). `replaced` lists the entries whose local
 * version gave way, so it can stay one undo step away. The cursor moves to the session's current entry.
 */
export function mergeSession(
  cur: { entries: Entry[]; cursor: number; favorites: Favorite[] },
  inc: { entries: Entry[]; cursor: number; favorites: Favorite[] },
): {
  entries: Entry[]; cursor: number; favorites: Favorite[];
  added: number; updated: number; skipped: number; favAdded: number; favUpdated: number; replaced: Entry[];
} {
  const at0 = new Map(cur.entries.map((e, i) => [e.id, i]));
  const entries = cur.entries.slice();
  const add: Entry[] = [];
  const replaced: Entry[] = [];
  const seenIds = new Set<string>();
  let skipped = 0;
  for (const e of inc.entries) {
    if (seenIds.has(e.id)) continue;
    seenIds.add(e.id);
    const i = at0.get(e.id);
    if (i === undefined) { add.push(e); continue; }
    const mine = entries[i];
    if (entryTime(e) > entryTime(mine) && !(sameJson(e.recipe, mine.recipe) && sameJson(e.origin, mine.origin))) {
      replaced.push(mine);
      entries[i] = { ...e, thumb: e.thumb ?? mine.thumb };
    } else skipped++;
  }
  entries.push(...add);
  const target = inc.entries[inc.cursor]?.id;
  const at = target ? entries.findIndex(e => e.id === target) : -1;
  const favAt = new Map(cur.favorites.map((f, i) => [f.id, i]));
  const favorites = cur.favorites.slice();
  const favNew: Favorite[] = [];
  let favUpdated = 0;
  for (const f of inc.favorites) {
    const i = favAt.get(f.id);
    if (i === undefined) { favAt.set(f.id, -1); favNew.push(f); continue; }
    if (i < 0) continue;
    const mine = favorites[i];
    if (f.updated > mine.updated && !(sameJson(f.recipe, mine.recipe) && f.name === mine.name)) { favorites[i] = { ...f, thumb: f.thumb ?? mine.thumb }; favUpdated++; }
  }
  return {
    entries,
    cursor: at >= 0 ? at : add.length ? entries.length - 1 : cur.cursor,
    favorites: [...favorites, ...favNew],
    added: add.length,
    updated: replaced.length,
    skipped,
    favAdded: favNew.length,
    favUpdated,
    replaced,
  };
}

/** Media ids that recipes point to. */
export function mediaIdsOf(recipes: Iterable<Recipe | undefined>): Set<string> {
  const ids = new Set<string>();
  for (const r of recipes) { const id = r?.media.ref?.id; if (id) ids.add(id); }
  return ids;
}

/** Every recipe of the history (current and original version of each entry) and of the collection. */
export function* allRecipes(entries: Entry[], favorites: Favorite[]): Generator<Recipe> {
  for (const e of entries) { yield e.recipe; yield e.origin; }
  for (const f of favorites) yield f.recipe;
}
