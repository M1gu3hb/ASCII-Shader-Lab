/**
 * The studio's state (zustand): the open project, the list of saved ones, undo/redo and the versions.
 *
 * Every change goes through edit(): it works on a copy (projects in the store are never changed in place,
 * so snapshots can share them safely), keeps the previous project for undo (up to UNDO_LIMIT steps;
 * changes with the same `key` within COALESCE_MS, like the steps of a slider drag, are one step), stamps
 * `updated` and asks the autosaver, when there is one, to save a moment later.
 *
 * Versions (versions.ts) are separate from undo: undo walks back through edits; versions are the moments
 * worth keeping (rolls of the dice, variations, a «guardar versión»), each restorable exactly, with
 * favourites and links to the version a roll came from.
 */
import { create } from 'zustand';
import type { LockGroup } from '../random/spaces';
import { rollProject, varyProject, type DiceOptions, type DiceResult } from './dice';
import { cloneProject, normalizeProject } from './normalize';
import { projectMediaIds } from './refs';
import {
  autosaver, deleteProject, listProjects, loadProject, loadVersions, saveProject, type Autosaver, type ProjectSummary, type SaveResult,
} from './persist';
import type { Ease, Id, Layer, Project } from './types';
import {
  addVersion, emptyVersions, goVersion as goV, indexOfVersion, projectOf, setThumb, toggleFavorite as favV, type Version, type VersionKind, type VersionList,
} from './versions';

export const UNDO_LIMIT = 200;
export const COALESCE_MS = 700;

export interface ProjectState {
  project: Project | null;
  /** Saved projects (refreshSaved). */
  saved: ProjectSummary[];
  /** Selected layers (ids), for the UI. */
  selection: Id[];
  /** Playhead (seconds). */
  time: number;
  canUndo: boolean;
  canRedo: boolean;
  versions: VersionList;
  /** Locks of the dice (the lab's groups) and the studio's «keep» set. */
  locks: LockGroup[];
  keep: Array<'seleccion' | 'paleta'>;
  /** Result of the last save. */
  storage: SaveResult | 'idle';
}

export const useProject = create<ProjectState>(() => ({
  project: null, saved: [], selection: [], time: 0, canUndo: false, canRedo: false,
  versions: emptyVersions(), locks: [], keep: [], storage: 'idle',
}));

const S = () => useProject.getState();

/* ------------------------------------------------------------------ undo */

let past: Project[] = [];
let future: Project[] = [];
let lastKey = '';
let lastAt = 0;
let saver: Autosaver | null = null;

function flags() {
  useProject.setState({ canUndo: past.length > 0, canRedo: future.length > 0 });
}

/** Opens a project (a new one, a saved one, one from a file): clean undo, its versions (or none). */
export function openProject(p: Project, o: { versions?: VersionList; select?: Id[] } = {}): void {
  past = []; future = []; lastKey = ''; lastAt = 0;
  useProject.setState({
    project: p, versions: o.versions ?? emptyVersions(), selection: o.select ?? [], time: 0, canUndo: false, canRedo: false, storage: 'idle',
  });
}

export function closeProject(): void {
  void saver?.flush();
  past = []; future = [];
  useProject.setState({ project: null, versions: emptyVersions(), selection: [], canUndo: false, canRedo: false });
}

/**
 * Changes the project. `fn` gets a copy to change (or returns a new project). Edits with the same `key`
 * within COALESCE_MS are one undo step. Returns the new project (null when none is open).
 */
export function edit(fn: (draft: Project) => void | Project, key = '', o: { stamp?: boolean } = {}): Project | null {
  const cur = S().project;
  if (!cur) return null;
  const draft = cloneProject(cur);
  const next = fn(draft) ?? draft;
  if (o.stamp !== false) next.updated = Date.now();
  const now = Date.now();
  const coalesce = !!key && key === lastKey && now - lastAt < COALESCE_MS && past.length > 0;
  if (!coalesce) {
    past.push(cur);
    if (past.length > UNDO_LIMIT) past.splice(0, past.length - UNDO_LIMIT);
  }
  future = [];
  lastKey = key; lastAt = now;
  useProject.setState({ project: next });
  flags();
  saver?.schedule();
  return next;
}

export function undo(): boolean {
  const cur = S().project;
  const prev = past.pop();
  if (!cur || !prev) return false;
  future.push(cur);
  lastKey = '';
  useProject.setState({ project: prev });
  flags();
  saver?.schedule();
  return true;
}

export function redo(): boolean {
  const cur = S().project;
  const next = future.pop();
  if (!cur || !next) return false;
  past.push(cur);
  lastKey = '';
  useProject.setState({ project: next });
  flags();
  saver?.schedule();
  return true;
}

/** Steps held for undo and redo (for the UI and tests). */
export const undoDepth = () => ({ past: past.length, future: future.length });

/**
 * Stored files that undo or redo can bring back (a deleted layer's painted mask, a replaced photo). Saves list
 * them with the project's own, so a media collection (the lab's, from another tab) does not delete them while
 * one undo would need them again.
 */
export function heldMediaIds(): Set<string> {
  const ids = new Set<string>();
  for (const p of [...past, ...future]) for (const id of idsOfSnapshot(p)) ids.add(id);
  return ids;
}

/** (Snapshots never change: their ids are worked out once, not at every save for up to 400 of them.) */
const snapshotIds = new WeakMap<Project, Set<string>>();
function idsOfSnapshot(p: Project): Set<string> {
  let s = snapshotIds.get(p);
  if (!s) snapshotIds.set(p, s = projectMediaIds(p));
  return s;
}

/* ------------------------------------------------------------------ layers */

/** Changes one layer (by a patch of fields or a function on its copy). */
export function updateLayer(id: Id, change: Partial<Layer> | ((l: Layer) => void), key = ''): void {
  edit(p => {
    const i = p.layers.findIndex(l => l.id === id);
    if (i < 0) return;
    if (typeof change === 'function') change(p.layers[i]);
    else p.layers[i] = { ...p.layers[i], ...change, id, kind: p.layers[i].kind } as Layer;
  }, key ? `${id}|${key}` : '');
}

/** Adds a layer at `index` (default: on top) and selects it. */
export function addLayer(layer: Layer, index?: number): void {
  edit(p => {
    const at = index === undefined ? p.layers.length : Math.max(0, Math.min(p.layers.length, index));
    p.layers.splice(at, 0, layer);
  });
  useProject.setState({ selection: [layer.id] });
}

/** Removes a layer and its keyframes. */
export function removeLayer(id: Id): void {
  edit(p => {
    p.layers = p.layers.filter(l => l.id !== id);
    p.tracks = p.tracks.filter(t => t.layer !== id);
  });
  useProject.setState({ selection: S().selection.filter(x => x !== id) });
}

/** Moves a layer to position `to` (0 = bottom). */
export function moveLayer(id: Id, to: number): void {
  edit(p => {
    const i = p.layers.findIndex(l => l.id === id);
    if (i < 0) return;
    const [l] = p.layers.splice(i, 1);
    p.layers.splice(Math.max(0, Math.min(p.layers.length, to)), 0, l);
  });
}

export function select(ids: Id[]): void { useProject.setState({ selection: ids }); }
export function setTime(t: number): void { useProject.setState({ time: Math.max(0, t) }); }

/* ------------------------------------------------------------------ keyframes */

/** Sets (or adds) the key of a layer's property at time t. */
export function setKey(layer: Id, path: string, t: number, v: number | string | boolean, ease: Ease = { kind: 'linear' }): void {
  edit(p => {
    let tr = p.tracks.find(x => x.layer === layer && x.path === path);
    if (!tr) { tr = { layer, path, keys: [] }; p.tracks.push(tr); }
    const k = tr.keys.find(x => Math.abs(x.t - t) < 1e-4);
    if (k) { k.v = v; k.ease = ease; } else tr.keys.push({ t, v, ease });
    tr.keys.sort((a, b) => a.t - b.t);
  }, `key|${layer}|${path}|${t}`);
}

/** Removes the key at time t (the track goes with its last key). */
export function removeKey(layer: Id, path: string, t: number): void {
  edit(p => {
    const tr = p.tracks.find(x => x.layer === layer && x.path === path);
    if (!tr) return;
    tr.keys = tr.keys.filter(x => Math.abs(x.t - t) >= 1e-4);
    if (!tr.keys.length) p.tracks = p.tracks.filter(x => x !== tr);
  });
}

/* ------------------------------------------------------------------ versions */

const current = (): Version | undefined => { const v = S().versions; return v.list[v.cursor]; };

/** Keeps the project as it is now as a version (kind, label, the version it came from). */
export function commitVersion(kind: VersionKind, o: { label?: string; parent?: Id; seed?: string; thumb?: string } = {}): Version | null {
  const p = S().project;
  if (!p) return null;
  const { vl, version } = addVersion(S().versions, p, { kind, ...o });
  useProject.setState({ versions: vl });
  saver?.schedule();
  return version;
}

/**
 * Shows a version: the project becomes exactly the one it holds (every field, `updated` included), and
 * what was there is one undo step away.
 */
export function restoreVersion(id: Id): boolean {
  const vl = S().versions;
  const i = indexOfVersion(vl, id);
  if (i < 0 || !S().project) return false;
  const v = vl.list[i];
  edit(() => projectOf(v), '', { stamp: false });
  useProject.setState({ versions: goV(S().versions, id) });
  return true;
}

export function prevVersion(): boolean { const vl = S().versions; return vl.cursor > 0 && restoreVersion(vl.list[vl.cursor - 1].id); }
export function nextVersion(): boolean { const vl = S().versions; return vl.cursor < vl.list.length - 1 && restoreVersion(vl.list[vl.cursor + 1].id); }

export function toggleFavorite(id: Id): void {
  useProject.setState({ versions: favV(S().versions, id) });
  saver?.schedule();
}

export function setVersionThumb(id: Id, thumb: string): void {
  useProject.setState({ versions: setThumb(S().versions, id, thumb) });
}

/* ------------------------------------------------------------------ dice */

export function setLocks(locks: LockGroup[], keep = S().keep): void { useProject.setState({ locks, keep }); }

/**
 * Rolls the dice on an ASCII layer (dice.ts) with the store's locks, applies it as an edit and keeps it as
 * an 'azar' version linked to the version it came from. The first roll also keeps what was there before.
 */
export function rollDice(o: Omit<DiceOptions, 'locks' | 'keep'> = {}): DiceResult | null {
  return diceStep('azar', p => rollProject(p, { ...o, locks: S().locks, keep: S().keep }));
}

/** A variation of an ASCII layer's style, kept as a 'variación' version linked to its parent. */
export function vary(o: Omit<DiceOptions, 'locks' | 'keep'> & { amount?: number } = {}): DiceResult | null {
  return diceStep('variación', p => varyProject(p, { ...o, locks: S().locks, keep: S().keep }));
}

function diceStep(kind: VersionKind, run: (p: Project) => DiceResult): DiceResult | null {
  const p = S().project;
  if (!p) return null;
  const res = run(p);
  if (!res.layer) return res;
  if (!S().versions.list.length) commitVersion('inicio');
  const parent = current()?.id;
  edit(() => res.project);
  commitVersion(kind, { ...(parent ? { parent } : {}), ...(res.seed ? { seed: res.seed } : {}) });
  return res;
}

/* ------------------------------------------------------------------ saving */

/**
 * Saves the open project a moment after each change (and when the page is hidden or left). `thumb` makes
 * the list's picture (e.g. export.thumbnail). Returns a function that stops it (saving what is pending).
 */
export function startAutosave(o: { thumb?: (p: Project) => Promise<string | null>; delay?: number } = {}): () => Promise<void> {
  void saver?.stop();
  const s = autosaver({
    get: () => S().project, versions: () => S().versions, keep: heldMediaIds, ...(o.thumb ? { thumb: o.thumb } : {}), ...(o.delay ? { delay: o.delay } : {}),
    onSaved: r => { useProject.setState({ storage: r }); void refreshSaved(); },
  });
  saver = s;
  return async () => { if (saver === s) saver = null; await s.stop(); };
}

export async function saveNow(): Promise<SaveResult | null> {
  const p = S().project;
  if (!p) return null;
  if (saver) { saver.schedule(); return saver.flush(); }
  const r = await saveProject(p, { versions: S().versions, keep: heldMediaIds() });
  useProject.setState({ storage: r });
  await refreshSaved();
  return r;
}

export async function refreshSaved(): Promise<void> {
  useProject.setState({ saved: await listProjects() });
}

/** Opens a saved project with its versions. False when it is not there. */
export async function openSaved(id: Id): Promise<boolean> {
  await saver?.flush();
  const p = await loadProject(id);
  if (!p) return false;
  openProject(normalizeProject(p), { versions: await loadVersions(id) });
  return true;
}

export async function deleteSaved(id: Id): Promise<void> {
  if (S().project?.id === id) closeProject();
  await deleteProject(id);
  await refreshSaved();
}
