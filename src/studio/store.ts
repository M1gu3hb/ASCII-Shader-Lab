import { create } from 'zustand';
import { del as idbDel, delMany, get as idbGet, getMany, set as idbSet, setMany } from 'idb-keyval';
import { cloneRecipe, normalizeRecipe, sameRecipe, type Recipe } from '../engine/recipe';
import { PATTERN_IDS } from '../engine/catalog';
import { fingerprint, mutate, roll, archById, spaceById, type LockGroup, type SpaceId } from '../random';
import { presetsFor, spaceAccepts, starterFor } from './presets';
import {
  HISTORY_LIMIT, HISTORY_WARN, allRecipes, entryBody, mediaIdsOf, mergeSession, normalizeEntry, normalizeFavorite, pruneHistory,
  sameBody, uid, type Entry, type EntryKind, type Favorite,
} from './history';
import { gcMedia } from './mediaStore';

export type { Entry, EntryKind, Favorite } from './history';
export { HISTORY_LIMIT, uid } from './history';

export type ChangeKind = 'edit' | 'nav' | 'roll' | 'load';

export interface UIState {
  panel: boolean;
  hideUI: boolean;
  tab: Partial<Record<SpaceId, string>>;
  preview: boolean;
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
  stats: { cols: number; rows: number; fps: number };
  undoTick: number;
  /** Results kept in this browser before the oldest are discarded (HISTORY_LIMIT). */
  histLimit: number;
  /** Results discarded by that limit during this session. */
  pruned: number;
}

const K_FAV = 'mt.v2.favorites', K_SEEN = 'mt.v2.seen', K_PREFS = 'mt.v2.prefs';
/** Previous layout: the whole history in one record (migrated to v3 on first load). */
const K_HIST_V2 = 'mt.v2.history';
/** v3 layout: an index { v: 3, ids, cursor } plus one record per entry and one per thumbnail. */
const K_INDEX = 'mt.v3.history';
const kEntry = (id: string) => 'mt.v3.e:' + id;
const kThumb = (id: string) => 'mt.v3.t:' + id;
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
  ui: { panel: true, hideUI: false, tab: {}, preview: false, terminal: { cols: 80, rows: 24 }, sheet: 'none', component: null },
  stats: { cols: 0, rows: 0, fps: 0 },
  undoTick: 0,
  histLimit: HISTORY_LIMIT,
  pruned: 0,
}));

const set = useStudio.setState;
const S = useStudio.getState;

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
  const p = pruneHistory(entries, cursor, S().histLimit, e => !!e.favId && favIds.has(e.favId));
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

let gcT = 0;
function scheduleGc(ms = 3000) {
  if (typeof window === 'undefined') return;
  clearTimeout(gcT);
  gcT = window.setTimeout(() => { if (S().ready) void gcMedia(referencedMediaIds()); }, ms);
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

export function rollDice(seed?: string) {
  const s = S();
  const base = currentRecipe(s);
  const res = roll({ space: s.space, arch: s.arch ?? undefined, base, locks: s.locks, seen, seed });
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
  if (next.source !== e.recipe.source) nameLoadedMedia(next);
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
  entries[s.cursor] = e;
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
export function restoreOrigin() {
  const e = currentEntry(); if (!e || !e.edited) return;
  edit(r => Object.assign(r, cloneRecipe(e.origin)), 'restore');
}

export function setThumb(entryId: string, thumb: string) {
  const s = S();
  const i = s.entries.findIndex(e => e.id === entryId);
  if (i < 0 || (s.entries[i].thumb && mediaLink?.holdThumb(s.entries[i]))) return;
  const entries = s.entries.slice();
  entries[i] = { ...entries[i], thumb };
  set({ entries });
  persistSoon();
}

export function clearHistory() {
  const s = S(), e = currentEntry(s);
  if (!e) return;
  stacks.clear();
  set({ entries: [{ ...e }], cursor: 0 });
  persistSoon();
  scheduleGc();
}

/**
 * Adds the entries and favourites of a saved session after the current history (entries and
 * favourites already here, by id, are skipped) and moves to the session's current entry.
 */
export function importSession(inc: { entries: unknown[]; favorites: unknown[]; cursor: number }) {
  const entries = inc.entries.map(normalizeEntry).filter((e): e is Entry => !!e);
  const favorites = inc.favorites.map(normalizeFavorite).filter((f): f is Favorite => !!f);
  const s = S();
  const m = mergeSession(s, { entries, favorites, cursor: Math.max(0, Math.min(entries.length - 1, inc.cursor | 0)) });
  const p = limitHistory(m.entries, m.cursor, m.favorites);
  const cur = p.entries[p.cursor];
  set({ entries: p.entries, cursor: p.cursor, favorites: m.favorites, space: cur?.space ?? s.space, change: bump('load'), pruned: s.pruned + p.dropped.length });
  for (const e of entries) seen.add(fingerprint(e.recipe));
  persistSoon();
  if (m.favAdded || p.entries.length > 50) askPersist();
  return { added: m.added, skipped: m.skipped, favAdded: m.favAdded, dropped: p.dropped.length };
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
  persistSoon();
  askPersist();
  return fav;
}

export function removeFavorite(id: string) {
  const s = S();
  set({
    favorites: s.favorites.filter(f => f.id !== id),
    entries: s.entries.map(e => (e.favId === id ? { ...e, favId: undefined } : e)),
  });
  persistSoon();
  scheduleGc();
}

export function renameFavorite(id: string, name: string) {
  set({ favorites: S().favorites.map(f => (f.id === id ? { ...f, name: name.slice(0, 80) || f.name, updated: Date.now() } : f)) });
  persistSoon();
}

export function duplicateFavorite(id: string) {
  const f = S().favorites.find(x => x.id === id);
  if (!f) return;
  const now = Date.now();
  set({ favorites: [{ ...f, id: uid(), name: f.name + ' (copia)', created: now, updated: now }, ...S().favorites] });
  persistSoon();
}

export function openFavorite(id: string) {
  const f = S().favorites.find(x => x.id === id);
  if (!f) return;
  set({ space: f.space });
  applyRecipe(f.recipe, 'favorito', f.name, { favId: f.id, thumb: f.thumb, space: f.space });
}

export function importFavorites(list: Array<{ name?: string; recipe: unknown; thumb?: string; space?: string }>): number {
  const now = Date.now();
  const add: Favorite[] = list.map(x => ({
    id: uid(), name: String(x.name ?? 'Importado').slice(0, 80), recipe: normalizeRecipe(x.recipe, PATTERN_IDS),
    thumb: typeof x.thumb === 'string' && x.thumb.startsWith('data:image/') ? x.thumb : undefined,
    created: now, updated: now, space: (spaceById(String(x.space ?? '')).id),
  }));
  set({ favorites: [...add, ...S().favorites] });
  persistSoon();
  return add.length;
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
  try {
    localStorage.setItem(K_PREFS, JSON.stringify({
      space: s.space, locks: s.locks, arch: s.arch, amount: s.amount,
      ui: { panel: s.ui.panel, tab: s.ui.tab, preview: s.ui.preview, terminal: s.ui.terminal },
    }));
  } catch { /* storage may be unavailable */ }
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

let saveT = 0;
export function persistSoon() {
  clearTimeout(saveT);
  saveT = window.setTimeout(() => void persistNow(), 500);
}

/** What IndexedDB holds, so each save writes only what changed (cheap even with a long history). */
let saved = new Map<string, { e: Entry; thumb?: string }>();
let savedIds: string[] = [];
let savedCursor = -2;
let savedFavs: Favorite[] | null = null;
let savedSeen = -1;
let chain: Promise<void> = Promise.resolve();

export function persistNow(): Promise<void> {
  clearTimeout(saveT);
  chain = chain.then(writeChanges, writeChanges);
  return chain;
}

async function writeChanges() {
  const s = S();
  if (!s.ready) return;
  try {
    const puts: Array<[IDBValidKey, unknown]> = [];
    const next = new Map<string, { e: Entry; thumb?: string }>();
    for (const e of s.entries) {
      const prev = saved.get(e.id);
      if (!prev || (prev.e !== e && !sameBody(prev.e, e))) puts.push([kEntry(e.id), entryBody(e)]);
      if (e.thumb && e.thumb !== prev?.thumb) puts.push([kThumb(e.id), e.thumb]);
      next.set(e.id, { e, thumb: e.thumb ?? prev?.thumb });
    }
    const ids = s.entries.map(e => e.id);
    const gone = [...saved.keys()].filter(id => !next.has(id));
    // records first, then the index that points to them, then what nothing points to any more
    if (puts.length) await setMany(puts);
    if (s.cursor !== savedCursor || ids.length !== savedIds.length || ids.some((id, i) => id !== savedIds[i])) {
      await idbSet(K_INDEX, { v: 3, ids, cursor: s.cursor });
      savedIds = ids; savedCursor = s.cursor;
    }
    if (gone.length) await delMany(gone.flatMap(id => [kEntry(id), kThumb(id)]));
    saved = next;
    if (s.favorites !== savedFavs) { await idbSet(K_FAV, s.favorites); savedFavs = s.favorites; }
    if (seen.size !== savedSeen) { const n = seen.size; await idbSet(K_SEEN, [...seen].slice(-6000)); savedSeen = n; }
  } catch { /* private mode or storage full: keep working in memory */ }
}

/** Reads the v3 layout. */
async function readV3(idx: { ids: unknown[]; cursor?: number }): Promise<{ entries: Entry[]; cursor: number }> {
  const ids = idx.ids.filter((x): x is string => typeof x === 'string');
  const [bodies, thumbs] = await Promise.all([getMany(ids.map(kEntry)), getMany<string>(ids.map(kThumb))]);
  const entries: Entry[] = [];
  ids.forEach((id, i) => {
    const e = bodies[i] && normalizeEntry({ ...bodies[i], id, thumb: thumbs[i] });
    if (!e) return;
    entries.push(e);
    saved.set(e.id, { e, thumb: e.thumb });
  });
  const want = ids[idx.cursor ?? -1];
  const at = entries.findIndex(e => e.id === want);
  savedIds = entries.map(e => e.id);
  savedCursor = at >= 0 ? at : entries.length - 1;
  return { entries, cursor: savedCursor };
}

/** Moves a v2 history (one big record) to the v3 layout. v2 is deleted only once v3 is written. */
async function migrateV2(h: { entries: unknown[]; cursor?: number }): Promise<{ entries: Entry[]; cursor: number }> {
  const entries = h.entries.map(normalizeEntry).filter((e): e is Entry => !!e);
  const cursor = Math.min(Math.max(0, h.cursor ?? entries.length - 1), entries.length - 1);
  try {
    await setMany(entries.flatMap(e => {
      const recs: Array<[IDBValidKey, unknown]> = [[kEntry(e.id), entryBody(e)]];
      if (e.thumb) recs.push([kThumb(e.id), e.thumb]);
      return recs;
    }));
    await idbSet(K_INDEX, { v: 3, ids: entries.map(e => e.id), cursor });
    for (const e of entries) saved.set(e.id, { e, thumb: e.thumb });
    savedIds = entries.map(e => e.id); savedCursor = cursor;
    await idbDel(K_HIST_V2);
  } catch { /* v2 stays where it was; the next load migrates again */ }
  return { entries, cursor };
}

/** Returns true on the very first visit (empty history). */
export async function hydrate(): Promise<boolean> {
  let entries: Entry[] = [], cursor = -1, favorites: Favorite[] = [];
  let histLimit = HISTORY_LIMIT;
  try {
    const n = parseInt(localStorage.getItem(K_TEST_LIMIT) ?? '', 10);
    if (n >= 5 && n < HISTORY_LIMIT) histLimit = n;
  } catch { /* ignore */ }
  try {
    const idx = await idbGet(K_INDEX);
    if (idx && idx.v === 3 && Array.isArray(idx.ids)) {
      ({ entries, cursor } = await readV3(idx));
      void idbDel(K_HIST_V2).catch(() => undefined); // leftover of an interrupted migration
    } else {
      const h = await idbGet(K_HIST_V2);
      if (h && Array.isArray(h.entries)) ({ entries, cursor } = await migrateV2(h));
    }
    const f = await idbGet(K_FAV);
    if (Array.isArray(f)) favorites = f.map(normalizeFavorite).filter((x): x is Favorite => !!x);
    savedFavs = favorites;
    const sn = await idbGet(K_SEEN);
    if (Array.isArray(sn)) seen = new Set(sn.filter((x: unknown) => typeof x === 'string'));
    savedSeen = seen.size;
  } catch { /* ignore */ }
  let prefs: Record<string, unknown> = {};
  try { prefs = JSON.parse(localStorage.getItem(K_PREFS) || '{}'); } catch { /* ignore */ }
  const ui = { ...S().ui, ...(prefs.ui as object || {}), sheet: 'none' as const, hideUI: false, component: null };
  if (typeof innerWidth === 'number' && innerWidth < 900) ui.panel = false;
  const space = spaceById(String(prefs.space ?? entries[cursor]?.space ?? 'arte')).id;
  set({
    entries, cursor, favorites, ready: true, ui, histLimit,
    space: entries[cursor]?.space ?? space,
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
  addEventListener('pagehide', () => { void persistNow(); });
  // media left behind by earlier sessions (e.g. replaced images whose undo steps are gone)
  scheduleGc(12_000);
  return first;
}

export const seenCount = () => seen.size;
