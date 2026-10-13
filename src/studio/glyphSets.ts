import { entries, get, set } from 'idb-keyval';
import { create } from 'zustand';
import type { Recipe } from '../engine/recipe';
import { glyphSetStatus, provideGlyphSet, watchGlyphSets } from '../glyphset/registry';
import { glyphStore as store, installLocalGlyphSets } from '../glyphset/local';
export { missingSetNotice } from '../glyphset/local';
import { glyphSetBytes, isGlyphSetId, parseGlyphSet, setRamp, type GlyphSet } from '../glyphset/set';
import { hashBytes } from './mediaStore';

/**
 * The lab's side of the glyph sets made in «Crea tus GLYPHOS» (/studio/glifos/). They live in that studio's
 * store in this browser ('glyphos-glifos' / 'datos', key `g:<content id>`); the lab reads them for its
 * engines, lists them in the Glifos tab, stores the ones a project or a session brings, and tells that
 * studio which ones its pieces use (`u:lab`), so deleting a glyph project never deletes a set a piece needs.
 * No engine code here.
 */

interface StoredSet { bytes: Uint8Array; name: string; mode: 'texto' | 'ascii'; doc?: string; rev?: number; added: number }

const K = (id: string) => 'g:' + id;
const USES = 'u:lab';

/** The engines ask for sets they do not hold: they come from this browser's storage, or are declared missing. */
export const installGlyphSetLoader = installLocalGlyphSets;

export interface SetSummary { id: string; name: string; mode: 'texto' | 'ascii'; doc?: string; rev?: number; added: number }

/** The sets of this browser, newest revision of each glyph project first (older revisions only when asked). */
export async function listGlyphSets(all = false): Promise<SetSummary[]> {
  let rows: Array<[IDBValidKey, StoredSet]>;
  try { rows = await entries<IDBValidKey, StoredSet>(store()); } catch { return []; }
  const out: SetSummary[] = [];
  for (const [k, v] of rows) {
    if (typeof k !== 'string' || !k.startsWith('g:') || !v || typeof v !== 'object') continue;
    const id = k.slice(2);
    if (!isGlyphSetId(id)) continue;
    out.push({ id, name: String(v.name ?? 'Sin nombre').slice(0, 60), mode: v.mode === 'ascii' ? 'ascii' : 'texto', doc: v.doc, rev: v.rev, added: Number(v.added) || 0 });
  }
  out.sort((a, b) => b.added - a.added);
  if (all) return out;
  const seen = new Set<string>();
  return out.filter(s => {
    if (!s.doc) return true;
    if (seen.has(s.doc)) return false;
    seen.add(s.doc);
    return true;
  });
}

/** Stores a set that came in a project or a session (checked: its id must be the hash of its bytes). */
export async function importGlyphSet(bytes: Uint8Array, expectId?: string): Promise<string | null> {
  let s: GlyphSet;
  try { s = parseGlyphSet(bytes); } catch { return null; }
  const canon = glyphSetBytes(s);
  const id = await hashBytes(canon);
  if (expectId && expectId !== id) return null;
  try {
    const had = await get<StoredSet>(K(id), store());
    if (!had) await set(K(id), { bytes: canon, name: s.name, mode: s.mode, doc: s.doc?.id, rev: s.doc?.rev, added: Date.now() } satisfies StoredSet, store());
  } catch { /* storage unavailable: the set still draws in this tab */ }
  provideGlyphSet(id, s);
  return id;
}

/** The canonical bytes of a set a recipe uses (for projects, sessions and exported code), or null. */
export async function glyphSetFile(id: string): Promise<Uint8Array | null> {
  try {
    const r = await get<StoredSet>(K(id), store());
    return r?.bytes ? (r.bytes instanceof Uint8Array ? r.bytes : new Uint8Array(r.bytes as ArrayBuffer)) : null;
  } catch { return null; }
}

/** Glyph set ids recipes name. */
export function glyphSetIdsOf(recipes: Iterable<Recipe | undefined>): Set<string> {
  const ids = new Set<string>();
  for (const r of recipes) if (r?.glyph?.set) ids.add(r.glyph.set);
  return ids;
}

/** Glyph set ids in raw stored recipes (entries, favourites). */
export function rawGlyphSetIds(list: unknown[], ids: Set<string>) {
  const add = (r: unknown) => { const id = (r as { glyph?: { set?: unknown } } | null)?.glyph?.set; if (isGlyphSetId(id)) ids.add(id); };
  for (const x of list) { const o = x as { recipe?: unknown; origin?: unknown } | null; add(o?.recipe); add(o?.origin); }
}

/**
 * Tells «Crea tus GLYPHOS» which sets the lab's pieces use: it never deletes those. `add` only adds (a set
 * just applied); otherwise the list is replaced by what the history, the collection and undo name now.
 */
export async function recordLabUses(ids: Set<string>, add = false) {
  try {
    const prev = add ? await get<{ ids?: unknown }>(USES, store()) : undefined;
    const all = new Set(ids);
    if (Array.isArray(prev?.ids)) for (const id of prev.ids) if (isGlyphSetId(id)) all.add(id);
    await set(USES, { ids: [...all], at: Date.now() }, store());
  } catch { /* storage unavailable */ }
}

/* ------------------------------------------------------------------ */
/* Applying a set to a piece                                           */
/* ------------------------------------------------------------------ */

/**
 * The recipe change of choosing a set: a symbol set brings its ramp (in its own order: sorting would undo
 * the person's ramp); a text set keeps the piece's characters and draws the ones it has.
 */
export function applySet(r: Recipe, id: string, s: GlyphSet) {
  r.glyph.set = id;
  r.glyph.setName = s.name;
  if (s.mode === 'ascii') { r.glyph.charset = setRamp(s); r.glyph.sort = false; }
}

export function dropSet(r: Recipe) {
  delete r.glyph.set;
  delete r.glyph.setName;
}

/* ------------------------------------------------------------------ */
/* Availability, for notices                                           */
/* ------------------------------------------------------------------ */

const useAvail = create<{ gen: number }>(() => ({ gen: 0 }));
watchGlyphSets(() => useAvail.setState(s => ({ gen: s.gen + 1 })));

/** 'ok', 'missing' (this browser does not have it) or 'pending' for the set a recipe names; null without one. */
export function useGlyphSetStatus(id: string | undefined): 'ok' | 'missing' | 'pending' | null {
  useAvail(s => s.gen);
  return id ? glyphSetStatus(id) : null;
}
