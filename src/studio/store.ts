import { create } from 'zustand';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { cloneRecipe, normalizeRecipe, sameRecipe, type Recipe } from '../engine/recipe';
import { PATTERN_IDS } from '../engine/catalog';
import { fingerprint, mutate, roll, archById, spaceById, type LockGroup, type SpaceId } from '../random';
import { presetsFor, spaceAccepts, starterFor } from './presets';

export type EntryKind = 'inicio' | 'azar' | 'variación' | 'receta' | 'importado' | 'favorito' | 'enlace' | 'espacio';

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
}

const MAX_ENTRIES = 200;
const K_HIST = 'mt.v2.history', K_FAV = 'mt.v2.favorites', K_SEEN = 'mt.v2.seen', K_PREFS = 'mt.v2.prefs';

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
}));

const set = useStudio.setState;
const S = useStudio.getState;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

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
/* Entries                                                             */
/* ------------------------------------------------------------------ */

function bump(kind: ChangeKind) { return { kind, n: S().change.n + 1 }; }

function pushEntry(e: Omit<Entry, 'id' | 'created' | 'edited' | 'origin'> & { origin?: Recipe }, kind: ChangeKind = 'roll') {
  const s = S();
  const entry: Entry = { ...e, origin: cloneRecipe(e.origin ?? e.recipe), id: uid(), created: Date.now(), edited: false };
  let entries = [...s.entries, entry];
  if (entries.length > MAX_ENTRIES) {
    const drop = entries.findIndex((x, i) => i < entries.length - 1 && !x.favId);
    entries = entries.filter((_, i) => i !== (drop >= 0 ? drop : 0));
  }
  set({ entries, cursor: entries.length - 1, change: bump(kind) });
  seen.add(fingerprint(entry.recipe));
  persistSoon();
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
  if (i < 0) return;
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
  return fav;
}

export function removeFavorite(id: string) {
  const s = S();
  set({
    favorites: s.favorites.filter(f => f.id !== id),
    entries: s.entries.map(e => (e.favId === id ? { ...e, favId: undefined } : e)),
  });
  persistSoon();
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
  saveT = window.setTimeout(persistNow, 500);
}
export async function persistNow() {
  const s = S();
  try {
    await idbSet(K_HIST, { v: 2, entries: s.entries, cursor: s.cursor });
    await idbSet(K_FAV, s.favorites);
    await idbSet(K_SEEN, [...seen].slice(-6000));
  } catch { /* private mode: keep working in memory */ }
}

export async function hydrate() {
  let entries: Entry[] = [], cursor = -1, favorites: Favorite[] = [];
  try {
    const h = await idbGet(K_HIST);
    if (h && Array.isArray(h.entries)) {
      entries = h.entries.filter((e: Entry) => e && e.recipe).map((e: Entry) => ({
        ...e, recipe: normalizeRecipe(e.recipe, PATTERN_IDS), origin: normalizeRecipe(e.origin ?? e.recipe, PATTERN_IDS),
        space: spaceById(e.space).id,
      }));
      cursor = Math.min(Math.max(0, h.cursor ?? entries.length - 1), entries.length - 1);
    }
    const f = await idbGet(K_FAV);
    if (Array.isArray(f)) favorites = f.map((x: Favorite) => ({ ...x, recipe: normalizeRecipe(x.recipe, PATTERN_IDS), space: spaceById(x.space).id }));
    const sn = await idbGet(K_SEEN);
    if (Array.isArray(sn)) seen = new Set(sn.filter((x: unknown) => typeof x === 'string'));
  } catch { /* ignore */ }
  let prefs: Record<string, unknown> = {};
  try { prefs = JSON.parse(localStorage.getItem(K_PREFS) || '{}'); } catch { /* ignore */ }
  const ui = { ...S().ui, ...(prefs.ui as object || {}), sheet: 'none' as const, hideUI: false, component: null };
  if (typeof innerWidth === 'number' && innerWidth < 900) ui.panel = false;
  const space = spaceById(String(prefs.space ?? entries[cursor]?.space ?? 'arte')).id;
  set({
    entries, cursor, favorites, ready: true, ui,
    space: entries[cursor]?.space ?? space,
    locks: Array.isArray(prefs.locks) ? (prefs.locks as LockGroup[]) : [],
    arch: typeof prefs.arch === 'string' ? prefs.arch : null,
    amount: typeof prefs.amount === 'number' ? prefs.amount : 0.35,
  });
  if (!entries.length) {
    const p = presetsFor('arte')[0];
    set({ space: 'arte' });
    pushEntry({ recipe: p.make(), kind: 'inicio', label: p.name, space: 'arte' }, 'load');
  }
  addEventListener('pagehide', () => { void persistNow(); });
}

export const seenCount = () => seen.size;
