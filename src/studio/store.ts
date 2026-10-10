import { create } from 'zustand';
import { cloneRecipe, sameRecipe, syncVersion, type Recipe } from '../engine/recipe';
import { fingerprint, mutate, roll, archById, spaceById, type LockGroup, type SpaceId } from '../random';
import { presetsFor, spaceAccepts, starterFor } from './presets';
import { ownText } from './ownWords';
import {
  HISTORY_LIMIT, HISTORY_WARN, allRecipes, entryBody, mediaIdsOf, mergeSession, normalizeEntry, normalizeFavorite, pruneHistory,
  recipeVersion, sameBody, uid, type Entry, type EntryKind, type Favorite,
} from './history';
import { idbKeys, idbRead, idbValues, idbWrite, isQuotaError } from './idb';
import { gcMedia } from './mediaStore';
import { gcStates, rawStateIds, stateIdsOf } from './stateStore';
import { glyphSetIdsOf, rawGlyphSetIds, recordLabUses } from './glyphSets';
import { within } from './deadline';
import { DEFAULT_VIEW_OPTS, normalizeViewOpts, normalizeViews, type ViewId, type ViewOpts } from './views/views';

export type { Entry, EntryKind, Favorite } from './history';
export { HISTORY_LIMIT, uid } from './history';

export type ChangeKind = 'edit' | 'nav' | 'roll' | 'load';

export interface UIState {
  panel: boolean;
  characterShortcuts: boolean;
  hideUI: boolean;
  tab: Partial<Record<SpaceId, string>>;
  /** Destination preview chosen in each space (views/views.ts; the default depends on the space). */
  views: Partial<Record<SpaceId, ViewId>>;
  viewOpts: ViewOpts;
  terminal: { cols: number; rows: number };
  sheet: 'none' | 'export' | 'collection' | 'shortcuts' | 'explore' | 'seed';
  component: string | null;
}

interface State {
  ready: boolean;
  space: SpaceId;
  entries: Entry[];
  cursor: number;
  favorites: Favorite[];
  locks: LockGroup[];
  arch: string | null;
  amount: number;
  change: { kind: ChangeKind; n: number };
  playing: boolean;
  reducedMotion: boolean;
  ui: UIState;
  /** Live grid, frame rate and the pixel ratio the stage renders at (0 until the first frame). */
  stats: { cols: number; rows: number; fps: number; pr: number };
  undoTick: number;
  /** Results kept in this browser before the oldest are discarded (HISTORY_LIMIT). */
  histLimit: number;
  /** Results discarded by that limit during this session. */
  pruned: number;
  /**
   * Whether this browser keeps what the studio saves: 'unavailable' (IndexedDB blocked, e.g. site data
   * turned off), 'full' (out of space), or 'protected' (an unsafe read / incomplete boot).
   * While it is not 'ok' the work lives only in this tab.
   */
  storage: 'ok' | 'unavailable' | 'full' | 'protected';
  /** Another tab took the studio over (tabs.ts): this one no longer saves. `saved`: its work was saved first. */
  away: { saved: boolean } | null;
}

const K_FAV = 'mt.v2.favorites', K_SEEN = 'mt.v2.seen', K_PREFS = 'mt.v2.prefs';
/** Previous layout: the whole history in one record (migrated to v3 on first load). */
const K_HIST_V2 = 'mt.v2.history';
/** v3 layout: an index { v: 3, ids, cursor } plus one record per entry and one per thumbnail. */
const K_INDEX = 'mt.v3.history';
const P_ENTRY = 'mt.v3.e:', P_THUMB = 'mt.v3.t:';
const kEntry = (id: string) => P_ENTRY + id;
const kThumb = (id: string) => P_THUMB + id;
/** Token of the tab that owns the studio data (see tabs.ts and idbWrite's fence). */
const K_OWNER = 'mt.v3.owner';
/**
 * Testing aid only: a lower history limit read at load (localStorage 'mt.histLimit', 5..999),
 * so the pruning can be exercised without a thousand rolls. Never set by the app itself.
 */
const K_TEST_LIMIT = 'mt.histLimit';

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const useStudio = create<State>(() => ({
  ready: false,
  space: 'arte',
  entries: [],
  cursor: -1,
  favorites: [],
  locks: [],
  arch: null,
  amount: 0.35,
  change: { kind: 'load', n: 0 },
  playing: !reduced,
  reducedMotion: reduced,
  ui: { characterShortcuts: true, panel: true, hideUI: false, tab: {}, views: {}, viewOpts: DEFAULT_VIEW_OPTS, terminal: { cols: 80, rows: 24 }, sheet: 'none', component: null },
  stats: { cols: 0, rows: 0, fps: 0, pr: 0 },
  undoTick: 0,
  histLimit: HISTORY_LIMIT,
  pruned: 0,
  storage: 'ok',
  away: null,
}));

const set = useStudio.setState;
const S = useStudio.getState;

// the system setting can change while the studio is open: transitions and autoplay follow it
if (typeof matchMedia === 'function') {
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', ev => set(ev.matches ? { reducedMotion: true, playing: false } : { reducedMotion: false }));
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export const currentEntry = (s: State = S()): Entry | undefined => s.entries[s.cursor];
export const currentRecipe = (s: State = S()): Recipe => s.entries[s.cursor]?.recipe ?? starterFor('arte');
export const useRecipe = () => useStudio(s => s.entries[s.cursor]?.recipe);
export const useEntry = () => useStudio(s => s.entries[s.cursor]);

/* ------------------------------------------------------------------ */
/* Seen fingerprints (avoid repeats across sessions)                   */
/* ------------------------------------------------------------------ */

let seen = new Set<string>();

/* ------------------------------------------------------------------ */
/* Undo per entry                                                      */
/* ------------------------------------------------------------------ */

interface Stack { past: Recipe[]; future: Recipe[]; key: string; t: number }
const stacks = new Map<string, Stack>();
const stackOf = (id: string) => { let s = stacks.get(id); if (!s) { s = { past: [], future: [], key: '', t: 0 }; stacks.set(id, s); } return s; };

export function canUndo() { const e = currentEntry(); return !!e && stackOf(e.id).past.length > 0; }
export function canRedo() { const e = currentEntry(); return !!e && stackOf(e.id).future.length > 0; }

/* ------------------------------------------------------------------ */
/* History limit                                                       */
/* ------------------------------------------------------------------ */

export type HistoryEvent =
  | { type: 'near'; count: number; limit: number }
  | { type: 'pruned'; dropped: number; limit: number };

let onEvent: ((e: HistoryEvent) => void) | null = null;
/** The UI shows these once per session (the store stays free of UI code). */
export function onHistoryEvent(fn: (e: HistoryEvent) => void) { onEvent = fn; }
let warnedNear = false, warnedPruned = false;

/** Keeps the history within the limit: drops the oldest results that are not favourites nor the current one. */
function limitHistory(entries: Entry[], cursor: number, favorites = S().favorites) {
  const favIds = new Set(favorites.map(f => f.id));
  const p = pruneHistory(entries, cursor, S().histLimit, e => e.edited || (!!e.favId && favIds.has(e.favId)));
  for (const e of p.dropped) stacks.delete(e.id);
  if (p.dropped.length) scheduleGc();
  return p;
}

function afterGrowth(count: number, dropped: number) {
  const limit = S().histLimit;
  if (dropped && !warnedPruned) { warnedPruned = warnedNear = true; onEvent?.({ type: 'pruned', dropped, limit }); }
  else if (!warnedNear && count >= Math.ceil(limit * HISTORY_WARN)) { warnedNear = true; onEvent?.({ type: 'near', count, limit }); }
  if (count > 50) askPersist();
}

/* ------------------------------------------------------------------ */
/* Storage that lasts                                                  */
/* ------------------------------------------------------------------ */

let persistAsked = false;
/**
 * Asks the browser not to evict this site's data under storage pressure. Called when the history
 * starts to matter (first favourite, more than 50 results). Some browsers decide silently.
 */
function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!st?.persist) return;
  void st.persisted().then(p => (p ? true : st.persist())).catch(() => false);
}

/* ------------------------------------------------------------------ */
/* Media no longer referenced                                          */
/* ------------------------------------------------------------------ */

/** Media ids still needed: history (current and original versions), collection and undo steps. */
export function referencedMediaIds(): Set<string> {
  const s = S();
  const ids = mediaIdsOf(allRecipes(s.entries, s.favorites));
  for (const st of stacks.values()) for (const id of mediaIdsOf([...st.past, ...st.future])) ids.add(id);
  return ids;
}

/** Saved family states (layer.fam.ck) still needed: history, collection and undo steps. */
function referencedStateIds(): Set<string> {
  const s = S();
  const ids = stateIdsOf(allRecipes(s.entries, s.favorites));
  for (const st of stacks.values()) for (const id of stateIdsOf([...st.past, ...st.future])) ids.add(id);
  return ids;
}

/** Saved family states named by the stored history and collection. Rejects (nothing collected) when unreadable. */
async function storedStateIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const [bodies, [fav]] = await Promise.all([idbValues(P_ENTRY), idbRead([K_FAV])]);
  rawStateIds(bodies, ids);
  if (Array.isArray(fav)) rawStateIds(fav, ids);
  return ids;
}

/** Media ids in raw stored data (entries, favourites, a v2 history): what IndexedDB says is in use. */
function storedRefs(list: unknown[], ids: Set<string>) {
  const add = (r: unknown) => {
    const id = (r as { media?: { ref?: { id?: unknown } } } | null)?.media?.ref?.id;
    if (typeof id === 'string' && id) ids.add(id);
  };
  for (const x of list) { const o = x as { recipe?: unknown; origin?: unknown } | null; add(o?.recipe); add(o?.origin); }
}

/**
 * (Exported for the photo and video studio's own collection, src/project/persist.ts: media the lab's saved
 * history and collection use must survive it too.)
 */
export async function storedMediaIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const [bodies, [fav, h2]] = await Promise.all([idbValues(P_ENTRY), idbRead([K_FAV, K_HIST_V2])]);
  storedRefs(bodies, ids);
  if (Array.isArray(fav)) storedRefs(fav, ids);
  const old = (h2 as { entries?: unknown } | undefined)?.entries;
  if (Array.isArray(old)) storedRefs(old, ids);
  return ids;
}

let gcT = 0;
let gcNow = false;
/**
 * Collects media nothing uses any more, `ms` from now. `grace: false` (after «Vaciar historial»)
 * also takes files loaded in the last minutes that no piece uses.
 */
function scheduleGc(ms = 3000, grace = true) {
  if (typeof window === 'undefined' || savingBlocked) return;
  if (!grace) gcNow = true;
  clearTimeout(gcT);
  gcT = window.setTimeout(() => void collectMedia(), ms);
}

async function collectMedia() {
  const now = gcNow;
  gcNow = false;
  if (!S().ready || S().away || savingBlocked || S().storage === 'unavailable') return;
  try {
    // compare with what is stored, not only with this tab's memory: what IndexedDB lists is in use too
    await persistNow();
    const ids = await storedMediaIds();
    if (S().away || savingBlocked) return;
    for (const id of referencedMediaIds()) ids.add(id);
    await gcMedia(ids, now ? 0 : undefined);
    // saved states of family layers: the same rule (stored and in-memory references keep them)
    const states = await storedStateIds();
    if (S().away || savingBlocked) return;
    for (const id of referencedStateIds()) states.add(id);
    await gcStates(states, now ? 0 : undefined);
    // glyph sets belong to «Crea tus GLYPHOS»: the lab never deletes one, it tells that studio which ones its pieces use
    const sets = new Set<string>();
    const [bodies, [fav]] = await Promise.all([idbValues(P_ENTRY), idbRead([K_FAV])]);
    rawGlyphSetIds(bodies, sets);
    if (Array.isArray(fav)) rawGlyphSetIds(fav, sets);
    const st = S();
    for (const id of glyphSetIdsOf(allRecipes(st.entries, st.favorites))) sets.add(id);
    for (const k of stacks.values()) for (const id of glyphSetIdsOf([...k.past, ...k.future])) sets.add(id);
    await recordLabUses(sets);
    await sweepOrphans();
  } catch { /* storage unavailable: nothing is collected */ }
}

/** Entry and thumbnail records no index lists (left by an interrupted save of an earlier version). */
async function sweepOrphans() {
  if (savingBlocked) return;
  // the index and the record keys from the same snapshot: a save in between cannot make a new record look orphaned
  const { values: [idx], keys: [eKeys, tKeys] } = await idbKeys([K_INDEX], [P_ENTRY, P_THUMB]);
  const listed = (idx as { ids?: unknown } | undefined)?.ids;
  if ((idx as { v?: unknown } | undefined)?.v !== 3 || !Array.isArray(listed)) return;
  const keep = new Set(listed.filter((x): x is string => typeof x === 'string'));
  // and whatever this tab has now (e.g. a session opened meanwhile, whose save may be on its way)
  for (const e of S().entries) keep.add(e.id);
  const orphans = [
    ...eKeys.filter(k => !keep.has(k.slice(P_ENTRY.length))),
    ...tKeys.filter(k => !keep.has(k.slice(P_THUMB.length))),
  ];
  if (orphans.length && !S().away && !savingBlocked) {
    const r = await idbWrite([], orphans, { fence: [K_OWNER, token] });
    if (r === 'fenced') lose();
  }
}

/* ------------------------------------------------------------------ */
/* Local media link (media.ts registers it; the store does not import media) */
/* ------------------------------------------------------------------ */

interface MediaLink {
  /** Reference of the file loaded for a kind, if any. */
  refFor(kind: 'image' | 'video'): Recipe['media']['ref'];
  /** True while the stage cannot show this entry's media (a thumbnail now would show only the pattern). */
  holdThumb(e: Entry): boolean;
}
let mediaLink: MediaLink | null = null;
export function linkMedia(l: MediaLink) { mediaLink = l; }

/** A piece that turns to an image or video without naming one takes the file on stage (what the person sees). */
function nameLoadedMedia(r: Recipe) {
  if ((r.source === 'image' || r.source === 'video') && r.media.ref?.kind !== r.source) {
    const ref = mediaLink?.refFor(r.source);
    if (ref) r.media.ref = { ...ref };
  }
}

/* ------------------------------------------------------------------ */
/* Entries                                                             */
/* ------------------------------------------------------------------ */

function bump(kind: ChangeKind) { return { kind, n: S().change.n + 1 }; }

function pushEntry(e: Omit<Entry, 'id' | 'created' | 'edited' | 'origin'> & { origin?: Recipe }, kind: ChangeKind = 'roll') {
  const s = S();
  nameLoadedMedia(e.recipe);
  const entry: Entry = { ...e, origin: cloneRecipe(e.origin ?? e.recipe), id: uid(), created: Date.now(), edited: false };
  const all = [...s.entries, entry];
  const p = limitHistory(all, all.length - 1);
  set({ entries: p.entries, cursor: p.cursor, change: bump(kind), pruned: s.pruned + p.dropped.length });
  seen.add(fingerprint(entry.recipe));
  persistSoon();
  afterGrowth(p.entries.length, p.dropped.length);
  return entry;
}

/** The latest results of the current space, oldest first: the dice make repeating them less likely. */
function recentIn(s: State, n = 10): Recipe[] {
  const out: Recipe[] = [];
  for (let i = s.entries.length - 1; i >= 0 && out.length < n; i--) if (s.entries[i].space === s.space) out.push(s.entries[i].recipe);
  return out.reverse();
}

/** A new result from the dice; `seed` (and its generator version `gen`) reproduces a given one. */
export function rollDice(seed?: string, gen?: number) {
  const s = S();
  const base = currentRecipe(s);
  // Texto: the person's words stay, a word nobody typed changes (ownWords.ts)
  const own = s.space === 'tipo' ? ownText(s.entries, base) : undefined;
  const res = roll({ space: s.space, arch: s.arch ?? undefined, base, locks: s.locks, seen, seed, gen, recent: recentIn(s), ownText: own });
  seen.add(res.fp);
  return pushEntry({ recipe: res.recipe, kind: 'azar', seed: res.seed, arch: res.recipe.meta.arch, space: s.space });
}

let mutCounter = 0;
export function vary(amount = S().amount) {
  const s = S();
  const e = currentEntry(s);
  if (!e) return;
  const mseed = `${e.seed ?? e.id}~${++mutCounter}-${Date.now().toString(36)}`;
  const recipe = mutate(e.recipe, amount, mseed, s.locks);
  return pushEntry({ recipe, kind: 'variación', seed: e.seed, arch: e.arch, space: s.space, label: 'Variación' });
}

/** Candidate variations for the explorer grid (not added to history until chosen). */
export function variations(n: number, amount: number): Recipe[] {
  const s = S(), e = currentEntry(s);
  if (!e) return [];
  const t = Date.now().toString(36);
  return Array.from({ length: n }, (_, i) => mutate(e.recipe, amount, `${e.seed ?? e.id}~x${i}-${t}`, s.locks));
}

export function applyRecipe(recipe: Recipe, kind: EntryKind, label?: string, extra: Partial<Entry> = {}) {
  const s = S();
  return pushEntry({ recipe: cloneRecipe(recipe), kind, label, space: s.space, seed: recipe.meta.seed, arch: recipe.meta.arch, ...extra }, 'load');
}

export function go(i: number) {
  const s = S();
  if (i < 0 || i >= s.entries.length || i === s.cursor) return;
  const e = s.entries[i];
  set({ cursor: i, space: e.space, change: bump('nav') });
  persistSoon();
}
export function back() { go(S().cursor - 1); }
export function forward() {
  const s = S();
  if (s.cursor < s.entries.length - 1) go(s.cursor + 1);
  else rollDice();
}

/** Amends the current entry. `key` groups rapid edits (slider drags) into one undo step. */
export function edit(fn: (r: Recipe) => void, key = '') {
  const s = S();
  const e = currentEntry(s);
  if (!e) return;
  const next = cloneRecipe(e.recipe);
  fn(next);
  // a visual family added or removed changes the recipe's format (v3 only while one is there)
  syncVersion(next);
  if (next.source !== e.recipe.source) nameLoadedMedia(next);
  // the camera's mirror is the camera's (setCameraMirror): a photo or video that takes its place starts as
  // it is, not flipped (the front camera is mirrored by default, and that used to stay with the new picture)
  if (e.recipe.source === 'camera' && next.source !== 'camera' && next.media.mirror === e.recipe.media.mirror) next.media.mirror = false;
  if (sameRecipe(next, e.recipe) && JSON.stringify(next.meta) === JSON.stringify(e.recipe.meta)) return;
  const st = stackOf(e.id), now = performance.now();
  if (!(key && st.key === key && now - st.t < 900)) {
    st.past.push(e.recipe);
    if (st.past.length > 100) st.past.shift();
  }
  st.future = [];
  st.key = key; st.t = now;
  replaceCurrent({ ...e, recipe: next, edited: !sameRecipe(next, e.origin) }, 'edit');
}

function replaceCurrent(e: Entry, kind: ChangeKind) {
  const s = S();
  const entries = s.entries.slice();
  entries[s.cursor] = { ...e, updated: Date.now() };
  set({ entries, change: bump(kind), undoTick: s.undoTick + 1 });
  persistSoon();
}

export function undo() {
  const e = currentEntry(); if (!e) return;
  const st = stackOf(e.id); const prev = st.past.pop(); if (!prev) return;
  st.future.push(e.recipe); st.key = '';
  replaceCurrent({ ...e, recipe: prev, edited: !sameRecipe(prev, e.origin) }, 'edit');
}
export function redo() {
  const e = currentEntry(); if (!e) return;
  const st = stackOf(e.id); const nx = st.future.pop(); if (!nx) return;
  st.past.push(e.recipe); st.key = '';
  replaceCurrent({ ...e, recipe: nx, edited: !sameRecipe(nx, e.origin) }, 'edit');
}
/**
 * The camera's own orientation (media.ts, cameraMirror.ts): the current camera piece takes the mirror of
 * the camera that is on. It is not an edit: the piece, the result it came from and its undo steps all
 * change together, so it is not marked «editado» and undo never brings the other orientation back.
 */
export function setCameraMirror(mirror: boolean) {
  const e = currentEntry();
  if (!e || e.recipe.source !== 'camera' || e.recipe.media.mirror === mirror) return;
  const turn = (r: Recipe) => {
    if (r.source !== 'camera' || r.media.mirror === mirror) return r;
    const x = cloneRecipe(r);
    x.media.mirror = mirror;
    return x;
  };
  const st = stacks.get(e.id);
  if (st) { st.past = st.past.map(turn); st.future = st.future.map(turn); }
  const recipe = turn(e.recipe), origin = turn(e.origin);
  replaceCurrent({ ...e, recipe, origin, edited: !sameRecipe(recipe, origin) }, 'edit');
}
export function restoreOrigin() {
  const e = currentEntry(); if (!e || !e.edited) return;
  edit(r => Object.assign(r, cloneRecipe(e.origin)), 'restore');
}

/**
 * Stores the thumbnail rendered from version `v` of an entry's recipe (thumbs.ts), only while the entry
 * still has that recipe: a picture never lands on an entry that changed in the meantime. A favourite
 * saved from that same recipe takes it too.
 */
export function setThumb(entryId: string, thumb: string, v: string): boolean {
  const s = S();
  const i = s.entries.findIndex(e => e.id === entryId);
  if (i < 0 || recipeVersion(s.entries[i].recipe) !== v) return false;
  const e = s.entries[i];
  const entries = s.entries.slice();
  entries[i] = { ...e, thumb, thumbV: v };
  const fav = e.favId ? s.favorites.find(f => f.id === e.favId) : undefined;
  if (fav && fav.thumb !== thumb && recipeVersion(fav.recipe) === v) {
    set({ entries, favorites: s.favorites.map(f => (f === fav ? { ...f, thumb } : f)) });
    saveNow();
  } else {
    set({ entries });
    persistSoon();
  }
  return true;
}

export function clearHistory() {
  const s = S(), e = currentEntry(s);
  if (!e) return;
  stacks.clear();
  set({ entries: [{ ...e }], cursor: 0 });
  persistSoon();
  // «Vaciar historial» promises the files only the history used go too, even ones loaded just now
  scheduleGc(3000, false);
}

type SessionInput = { entries: unknown[]; favorites: unknown[]; cursor: number };

function mergeInput(inc: SessionInput) {
  if (inc.entries.length > 10_000 || inc.favorites.length > 10_000) throw new Error('El archivo supera el límite de 10 000 entradas o piezas.');
  const safe = <T,>(fn: (x: unknown) => T, x: unknown): T | null => { try { return fn(x); } catch { return null; } };
  const entries = inc.entries.map(x => safe(normalizeEntry, x)).filter((e): e is Entry => !!e);
  const favorites = inc.favorites.map(x => safe(normalizeFavorite, x)).filter((f): f is Favorite => !!f);
  const m = mergeSession(S(), { entries, favorites, cursor: Math.max(0, Math.min(entries.length - 1, inc.cursor | 0)) });
  return { entries, m, invalid: inc.entries.length - entries.length + inc.favorites.length - favorites.length };
}

/**
 * What opening a session would do, without doing it: how many results it adds, and how many the
 * history limit would then discard (the oldest by date), from the history here and from the session.
 */
export function planSession(inc: SessionInput): { added: number; count: number; dropOwn: number; dropIncoming: number } {
  const { m } = mergeInput(inc);
  const favIds = new Set(m.favorites.map(f => f.id));
  const p = pruneHistory(m.entries, m.cursor, S().histLimit, e => e.edited || (!!e.favId && favIds.has(e.favId)));
  const own = new Set(S().entries.map(e => e.id));
  const dropOwn = p.dropped.filter(e => own.has(e.id)).length;
  return { added: m.added, count: S().entries.length, dropOwn, dropIncoming: p.dropped.length - dropOwn };
}

/**
 * Adds the entries and favourites of a saved session to the history (see mergeSession: nothing is
 * duplicated, and the newer version of an entry or favourite that is in both wins) and moves to the
 * session's current entry. A local entry that gave way keeps its version one undo step away.
 */
export function importSession(inc: SessionInput) {
  const { entries, m, invalid } = mergeInput(inc);
  const s = S();
  for (const old of m.replaced) {
    const st = stackOf(old.id);
    st.past.push(old.recipe);
    if (st.past.length > 100) st.past.shift();
    st.future = []; st.key = '';
  }
  const p = limitHistory(m.entries, m.cursor, m.favorites);
  const cur = p.entries[p.cursor];
  set({ entries: p.entries, cursor: p.cursor, favorites: m.favorites, space: cur?.space ?? s.space, change: bump('load'), pruned: s.pruned + p.dropped.length, undoTick: s.undoTick + 1 });
  for (const e of entries) seen.add(fingerprint(e.recipe));
  persistSoon();
  if (m.favAdded || m.favUpdated) saveNow();
  if (m.favAdded || p.entries.length > 50) askPersist();
  return { preserved: m.preserved, invalid, added: m.added, updated: m.updated, skipped: m.skipped, favAdded: m.favAdded, favUpdated: m.favUpdated, dropped: p.dropped.length };
}

/* ------------------------------------------------------------------ */
/* Spaces                                                              */
/* ------------------------------------------------------------------ */

export function setSpace(space: SpaceId) {
  const s = S();
  if (s.space === space) return;
  set({ space });
  if (space === 'componentes') { persistPrefs(); return; }
  const cur = currentRecipe(S());
  if (!spaceAccepts(space, cur)) {
    const p = presetsFor(space)[0];
    applyRecipe(p.make(cur), 'espacio', p.name);
  } else {
    set({ change: bump('nav') });
  }
  persistPrefs();
}

/* ------------------------------------------------------------------ */
/* Favorites                                                           */
/* ------------------------------------------------------------------ */

function autoName(e: Entry): string {
  const arch = archById(e.arch)?.name;
  if (e.seed) return e.seed.replace(/-/g, ' ');
  if (e.label) return e.label;
  return `${arch ?? spaceById(e.space).name} ${new Date().toLocaleDateString()}`;
}

export function saveFavorite(name?: string): Favorite | null {
  const s = S(), e = currentEntry(s);
  if (!e) return null;
  const now = Date.now();
  const existing = e.favId ? s.favorites.find(f => f.id === e.favId) : undefined;
  let fav: Favorite;
  let favorites: Favorite[];
  if (existing) {
    fav = { ...existing, recipe: cloneRecipe(e.recipe), thumb: e.thumb ?? existing.thumb, updated: now, name: name ?? existing.name };
    favorites = s.favorites.map(f => (f.id === fav.id ? fav : f));
  } else {
    fav = { id: uid(), name: name ?? autoName(e), recipe: cloneRecipe(e.recipe), thumb: e.thumb, created: now, updated: now, space: e.space };
    favorites = [fav, ...s.favorites];
  }
  const entries = s.entries.slice();
  entries[s.cursor] = { ...e, favId: fav.id };
  set({ favorites, entries });
  saveNow();
  askPersist();
  return fav;
}

export function removeFavorite(id: string) {
  const s = S();
  set({
    favorites: s.favorites.filter(f => f.id !== id),
    entries: s.entries.map(e => (e.favId === id ? { ...e, favId: undefined } : e)),
  });
  saveNow();
  scheduleGc();
}

export function renameFavorite(id: string, name: string) {
  set({ favorites: S().favorites.map(f => (f.id === id ? { ...f, name: name.slice(0, 80) || f.name, updated: Date.now() } : f)) });
  saveNow();
}

export function duplicateFavorite(id: string) {
  const f = S().favorites.find(x => x.id === id);
  if (!f) return;
  const now = Date.now();
  set({ favorites: [{ ...f, id: uid(), name: f.name + ' (copia)', created: now, updated: now }, ...S().favorites] });
  saveNow();
}

export function openFavorite(id: string) {
  const f = S().favorites.find(x => x.id === id);
  if (!f) return;
  set({ space: f.space });
  applyRecipe(f.recipe, 'favorito', f.name, { favId: f.id, thumb: f.thumb, space: f.space });
}

/** Imports bounded, individually validated items, including legacy collections without ids. */
export function importFavorites(list: unknown[]) {
  if (list.length > 10_000) throw new Error('La colección supera el límite de 10 000 piezas por archivo.');
  const valid: Favorite[] = [];
  let invalid = 0;
  for (const item of list) {
    let f: Favorite | null;
    try { f = normalizeFavorite(item); } catch { invalid++; continue; }
    if (!f) { invalid++; continue; }
    const raw = item as Record<string, unknown>;
    if (typeof raw.id !== 'string' || !raw.id) {
      f.id = 'legacy-' + recipeVersion(f.recipe);
      f.created = f.updated = 1;
      // A legacy backup may already have been imported by an older studio under a generated id.
      const existing = S().favorites.find(x => sameRecipe(x.recipe, f.recipe));
      if (existing) f.id = existing.id;
    }
    valid.push(f);
  }
  const m = mergeSession(S(), { entries: [], cursor: 0, favorites: valid });
  set({ favorites: m.favorites });
  if (m.favAdded || m.favUpdated) saveNow();
  return { added: m.favAdded, updated: m.favUpdated, skipped: valid.length - m.favAdded - m.favUpdated, invalid };
}

/* ------------------------------------------------------------------ */
/* Preferences & UI                                                    */
/* ------------------------------------------------------------------ */

export function setUI(p: Partial<UIState>) { set({ ui: { ...S().ui, ...p } }); persistPrefs(); }
export function setLocks(locks: LockGroup[]) { set({ locks }); persistPrefs(); }
export function toggleLock(g: LockGroup) { const l = S().locks; setLocks(l.includes(g) ? l.filter(x => x !== g) : [...l, g]); }
export function setArch(arch: string | null) { set({ arch }); persistPrefs(); }
export function setAmount(amount: number) { set({ amount }); persistPrefs(); }
export function setPlaying(playing: boolean) { set({ playing }); }
export function setStats(stats: State['stats']) { set({ stats }); }

function persistPrefs() {
  const s = S();
  if (paused || savingBlocked) return;
  try {
    localStorage.setItem(K_PREFS, JSON.stringify({
      space: s.space, locks: s.locks, arch: s.arch, amount: s.amount,
      ui: { characterShortcuts: s.ui.characterShortcuts, panel: s.ui.panel, tab: s.ui.tab, views: s.ui.views, viewOpts: s.ui.viewOpts, terminal: s.ui.terminal },
    }));
  } catch { /* storage may be unavailable */ }
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

let saveT = 0;
/** Bumped by every change to save; a save that started at the same count leaves nothing behind. */
let edits = 0;
export function persistSoon() {
  if (paused || savingBlocked) return;
  edits++;
  guardUnload(true);
  clearTimeout(saveT);
  saveT = window.setTimeout(() => void persistNow(), 500);
}

/** What IndexedDB holds, so each save writes only what changed (cheap even with a long history). */
let saved = new Map<string, { e: Entry; thumb?: string }>();
let savedIds: string[] = [];
let savedCursor = -2;
let savedFavs: Favorite[] | null = null;
let savedSeen = -1;
/** This tab's owner token (tabs.ts), written when it takes the studio data (again on the next save if that failed). */
let token = '';
let tokenStored = false;
/** Set once another tab owns the data: nothing is written from here any more. */
let paused = false;
/** A failed/incompatible read is not an empty store. No write, claim or cleanup until a reload. */
let savingBlocked = false;

export function protectStudio() {
  savingBlocked = true;
  clearTimeout(saveT);
  clearTimeout(gcT);
  guardUnload(false);
  set({ storage: 'protected', ready: true });
  if (!S().entries.length) {
    const p = presetsFor('arte')[0];
    pushEntry({ recipe: p.make(), kind: 'inicio', label: p.name, space: 'arte' }, 'load');
  }
}

let lastWrite: Promise<void> = Promise.resolve();
/** Saves now what changed (only while this tab still owns the data). */
export function persistNow(): Promise<void> {
  clearTimeout(saveT);
  return (lastWrite = writeChanges('now'));
}

/** A change that must not wait for the debounce (the collection): saved at once. */
function saveNow() {
  if (paused || savingBlocked) return;
  edits++;
  guardUnload(true);
  void persistNow();
}

/** Resolves once the latest save has finished (then `storage` says whether it was kept). */
export const whenSaved = () => lastWrite;

let flushedAt = -1;
/**
 * The page is being left or hidden: whatever changed goes out in one transaction that commits at
 * once. Saves still on their way are included again (they may not finish once the page is gone).
 */
function flush() {
  if (paused || savingBlocked || flushedAt === edits) return;
  flushedAt = edits;
  clearTimeout(saveT);
  void writeChanges('leave');
}

/**
 * While something is unsaved, leaving the page flushes it first: on a reload pagehide comes too late
 * for IndexedDB and beforeunload does not. It is only listened to while needed, since browsers keep
 * pages that listen to it out of their back-forward cache.
 */
let guarding = false;
function guardUnload(on: boolean) {
  if (typeof window === 'undefined' || on === guarding) return;
  guarding = on;
  if (on) addEventListener('beforeunload', flush);
  else removeEventListener('beforeunload', flush);
}

function setStorage(storage: State['storage']) {
  if (S().storage !== storage) set({ storage });
}

/**
 * `now`: a normal save, written only while this tab still owns the data. `leave`: the page is going
 * away. `claim`: this tab takes the data over (hydrate): writes its token and drops a v2 history.
 */
/** A v2 history to delete: kept until a save that carries the deletion lands (a save made as the page is
 * hidden can take the place of the load's one, and would otherwise leave it behind to be added again). */
let dropV2Pending = false;
async function writeChanges(kind: 'now' | 'leave' | 'claim', dropV2 = false): Promise<void> {
  if (dropV2) dropV2Pending = true;
  const s = S();
  if (!s.ready || paused || savingBlocked) return;
  const at = edits;
  const puts: Array<[string, unknown]> = [];
  const next = new Map<string, { e: Entry; thumb?: string }>();
  for (const e of s.entries) {
    const prev = saved.get(e.id);
    if (!prev || (prev.e !== e && !sameBody(prev.e, e))) puts.push([kEntry(e.id), entryBody(e)]);
    if (e.thumb && e.thumb !== prev?.thumb) puts.push([kThumb(e.id), e.thumb]);
    next.set(e.id, { e, thumb: e.thumb ?? prev?.thumb });
  }
  const ids = s.entries.map(e => e.id);
  const index = s.cursor !== savedCursor || ids.length !== savedIds.length || ids.some((id, i) => id !== savedIds[i]);
  if (index) puts.push([K_INDEX, { v: 3, ids, cursor: s.cursor }]);
  const dels = [...saved.keys()].filter(id => !next.has(id)).flatMap(id => [kEntry(id), kThumb(id)]);
  const favs = s.favorites;
  if (favs !== savedFavs) puts.push([K_FAV, favs]);
  const nSeen = seen.size;
  if (nSeen !== savedSeen) puts.push([K_SEEN, [...seen].slice(-6000)]);
  const claim = kind === 'claim' || !tokenStored;
  if (claim) puts.push([K_OWNER, token]);
  const dropping = dropV2Pending;
  if (dropping) dels.push(K_HIST_V2);
  if (!puts.length && !dels.length) { if (at === edits) guardUnload(false); return; }
  try {
    // one transaction: the records, the index that points to them and what nothing points to any more
    const r = await idbWrite(puts, dels, kind === 'now' && !claim ? { fence: [K_OWNER, token] } : { commit: kind === 'leave' });
    if (r === 'fenced') { lose(); return; }
    // the page is being left: the save made then carries these changes too
    if (r === 'superseded') return;
    if (savingBlocked) return; // a boot deadline may have fired while this transaction was pending
    if (claim) tokenStored = true;
    if (dropping) dropV2Pending = false;
    saved = next;
    if (index) { savedIds = ids; savedCursor = s.cursor; }
    savedFavs = favs;
    savedSeen = nSeen;
    setStorage('ok');
    if (at === edits) guardUnload(false);
  } catch (err) {
    if (savingBlocked) return; // A late failure must not replace the permanent recovery warning.
    // blocked or full: the work stays in this tab, and the studio says so (StorageNote)
    setStorage(isQuotaError(err) ? 'full' : 'unavailable');
  }
}

/* ------------------------------------------------------------------ */
/* Another tab took the studio over (tabs.ts)                          */
/* ------------------------------------------------------------------ */

let onLost: (() => void) | null = null;
/** tabs.ts: what to do when a save finds that another tab owns the data (let go of the lock). */
export function onOwnershipLost(fn: () => void) { onLost = fn; }

/** Stops saving from this tab. `saved`: what it had was saved before letting go. */
export function pauseStudio(saved: boolean) {
  if (paused) return;
  paused = true;
  clearTimeout(saveT);
  clearTimeout(gcT);
  guardUnload(false);
  set({ away: { saved }, playing: false });
}

/** A save found another tab's token: that tab owns the data now. */
function lose() {
  pauseStudio(false);
  onLost?.();
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

/** Reads the v3 layout. */
async function readV3(idx: { ids: unknown[]; cursor?: number }): Promise<{ entries: Entry[]; cursor: number }> {
  const ids = idx.ids.filter((x): x is string => typeof x === 'string');
  if (ids.length !== idx.ids.length || new Set(ids).size !== ids.length) throw new Error('Índice de historial inválido');
  const [bodies, thumbs] = await Promise.all([idbRead(ids.map(kEntry)), idbRead(ids.map(kThumb))]);
  const entries: Entry[] = [];
  ids.forEach((id, i) => {
    const body = bodies[i];
    const e = body && typeof body === 'object' ? normalizeEntry({ ...body, id, thumb: thumbs[i] }) : null;
    if (!e) throw new Error('No se pudo leer una pieza del historial');
    entries.push(e);
    saved.set(e.id, { e, thumb: e.thumb });
  });
  const want = ids[idx.cursor ?? -1];
  const at = entries.findIndex(e => e.id === want);
  savedIds = entries.map(e => e.id);
  savedCursor = at >= 0 ? at : entries.length - 1;
  return { entries, cursor: savedCursor };
}

type StoredIndex = { v?: number; ids?: unknown[]; cursor?: number } | undefined;
type StoredV2 = { entries?: unknown[]; cursor?: number } | undefined;

/** Returns true on the very first visit (empty history). */
export async function hydrate(signal?: AbortSignal): Promise<boolean> {
  let entries: Entry[] = [], cursor = -1, favorites: Favorite[] = [];
  let histLimit = HISTORY_LIMIT;
  let storage: State['storage'] = 'ok';
  let dropV2 = false;
  try {
    const n = parseInt(localStorage.getItem(K_TEST_LIMIT) ?? '', 10);
    if (n >= 5 && n < HISTORY_LIMIT) histLimit = n;
  } catch { /* ignore */ }
  try {
    await within((async () => {
      const [idx, h2, f, sn] = await idbRead([K_INDEX, K_HIST_V2, K_FAV, K_SEEN]) as [StoredIndex, StoredV2, unknown, unknown];
      if (idx !== undefined && (!idx || idx.v !== 3 || !Array.isArray(idx.ids))) throw new Error('Formato de historial desconocido');
      if (h2 !== undefined && (!h2 || !Array.isArray(h2.entries))) throw new Error('Historial anterior inválido');
      if (idx && idx.v === 3 && Array.isArray(idx.ids)) ({ entries, cursor } = await readV3({ ids: idx.ids, cursor: idx.cursor }));
      if (h2 && Array.isArray(h2.entries)) {
        // a v2 history: never moved, left behind by an interrupted move, or kept up by a tab of the
        // previous version after the move. What the v3 index lacks is added; the claim writes it.
        dropV2 = true;
        const old = h2.entries.map(normalizeEntry).filter((e): e is Entry => !!e);
        if (!entries.length) {
          entries = old;
          cursor = Math.min(Math.max(0, h2.cursor ?? old.length - 1), old.length - 1);
        } else {
          const have = new Set(entries.map(e => e.id));
          entries.push(...old.filter(e => !have.has(e.id)));
        }
      }
      if (Array.isArray(f)) favorites = f.map(normalizeFavorite).filter((x): x is Favorite => !!x);
      savedFavs = favorites;
      if (Array.isArray(sn)) seen = new Set(sn.filter((x: unknown) => typeof x === 'string'));
      savedSeen = seen.size;
    })(), 8000, signal);
  } catch {
    // Preserve everything already stored, even if IndexedDB becomes available again this visit.
    savingBlocked = true;
    storage = 'protected';
  }
  if (S().ready) return false; // the boot deadline already opened a protected studio
  let prefs: Record<string, unknown> = {};
  try { prefs = JSON.parse(localStorage.getItem(K_PREFS) || '{}'); } catch { /* ignore */ }
  const ui0 = (prefs.ui || {}) as Record<string, unknown>;
  const ui = {
    ...S().ui, ...ui0, characterShortcuts: ui0.characterShortcuts !== false, sheet: 'none' as const, hideUI: false, component: null,
    views: normalizeViews(ui0.views, ui0.preview), viewOpts: normalizeViewOpts(ui0.viewOpts),
  };
  // (the old «Recetas» zone's fold, kept by earlier versions: the recipe line starts closed now)
  delete (ui as { recipes?: unknown }).recipes;
  if (typeof innerWidth === 'number' && innerWidth < 900) ui.panel = false;
  const space = spaceById(String(prefs.space ?? entries[cursor]?.space ?? 'arte')).id;
  // this tab owns the data now (tabs.ts): its token goes in with the first save, below
  token = uid() + uid();
  set({
    entries, cursor, favorites, ready: true, ui, histLimit, storage,
    space: space === 'componentes' || !entries[cursor] || spaceAccepts(space, entries[cursor].recipe) ? space : entries[cursor].space,
    locks: Array.isArray(prefs.locks) ? (prefs.locks as LockGroup[]) : [],
    arch: typeof prefs.arch === 'string' ? prefs.arch : null,
    amount: typeof prefs.amount === 'number' ? prefs.amount : 0.35,
  });
  const first = !entries.length;
  if (first) {
    const p = presetsFor('arte')[0];
    set({ space: 'arte' });
    pushEntry({ recipe: p.make(), kind: 'inicio', label: p.name, space: 'arte' }, 'load');
  }
  // the token, with what the load had to move (a v2 history) and the first piece of a first visit
  if (storage === 'ok') await writeChanges('claim', dropV2);
  // pagehide alone is unreliable on phones (tabs are often frozen or discarded without it)
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  // media left behind by earlier sessions (e.g. replaced images whose undo steps are gone)
  scheduleGc(12_000);
  return first && !savingBlocked;
}

export const seenCount = () => seen.size;
