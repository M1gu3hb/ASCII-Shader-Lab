/**
 * Versions of a project, like the lab's history: every roll of the dice, variation, restore or saved moment
 * is an entry with the exact project it had (restoring gives exactly that project back), a thumbnail, a
 * favourite flag and, for rolls and variations, the version it was made from (linked variants).
 * Pure functions over plain data; the store (store.ts) keeps the list and persist.ts saves it.
 */
import { cloneProject, normalizeProject, uid } from './normalize';
import type { Id, Project } from './types';

export type VersionKind = 'inicio' | 'azar' | 'variación' | 'edición' | 'guardado' | 'importado' | 'restaurado';
const KINDS: VersionKind[] = ['inicio', 'azar', 'variación', 'edición', 'guardado', 'importado', 'restaurado'];

export interface Version {
  id: Id;
  kind: VersionKind;
  label?: string;
  /** The version this one was made from (a roll or a variation of it). */
  parent?: Id;
  created: number;
  /** The project exactly as it was. */
  project: Project;
  /** A small picture of it (data URL). */
  thumb?: string;
  fav: boolean;
  /** The dice seed that made it, when a roll did. */
  seed?: string;
}

export interface VersionList { list: Version[]; cursor: number }

/** Versions kept per project; past it, the oldest that are not favourites go. */
export const VERSION_LIMIT = 200;

export const emptyVersions = (): VersionList => ({ list: [], cursor: -1 });

/** Adds a version at the end and makes it the current one. */
export function addVersion(vl: VersionList, project: Project, o: { kind: VersionKind; label?: string; parent?: Id; seed?: string; thumb?: string; limit?: number }): { vl: VersionList; version: Version } {
  const version: Version = {
    id: uid(), kind: o.kind, created: Date.now(), project: cloneProject(project), fav: false,
    ...(o.label ? { label: o.label } : {}), ...(o.parent ? { parent: o.parent } : {}), ...(o.seed ? { seed: o.seed } : {}), ...(o.thumb ? { thumb: o.thumb } : {}),
  };
  let list = [...vl.list, version];
  const limit = Math.max(2, o.limit ?? VERSION_LIMIT);
  while (list.length > limit) {
    const i = list.findIndex(v => !v.fav && v !== version);
    if (i < 0) break;
    list = list.filter((_, j) => j !== i);
  }
  return { vl: { list, cursor: list.length - 1 }, version };
}

export function indexOfVersion(vl: VersionList, id: Id): number {
  return vl.list.findIndex(v => v.id === id);
}

/** Moves the cursor to a version (by id, or by step −1/+1 from the current one). */
export function goVersion(vl: VersionList, to: Id | -1 | 1): VersionList {
  const i = typeof to === 'string' ? indexOfVersion(vl, to) : Math.min(vl.list.length - 1, Math.max(0, vl.cursor + to));
  return i < 0 || i === vl.cursor ? vl : { ...vl, cursor: i };
}

export function toggleFavorite(vl: VersionList, id: Id): VersionList {
  return { ...vl, list: vl.list.map(v => (v.id === id ? { ...v, fav: !v.fav } : v)) };
}

export function setThumb(vl: VersionList, id: Id, thumb: string): VersionList {
  return { ...vl, list: vl.list.map(v => (v.id === id ? { ...v, thumb } : v)) };
}

/** Versions made from `id` (its linked variants), oldest first. */
export function variantsOf(vl: VersionList, id: Id): Version[] {
  return vl.list.filter(v => v.parent === id);
}

/** A copy of the project a version holds (restoring never shares objects with the history). */
export function projectOf(v: Version): Project {
  return cloneProject(v.project);
}

const THUMB = /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Versions from storage or a file: plain data made valid (bad entries dropped). */
export function normalizeVersions(v: unknown): VersionList {
  const o = (v && typeof v === 'object' ? v : {}) as { list?: unknown; cursor?: unknown };
  const list: Version[] = [];
  const ids = new Set<string>();
  for (const x of Array.isArray(o.list) ? o.list : []) {
    if (list.length >= VERSION_LIMIT * 2) break;
    const e = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (!e.project || typeof e.project !== 'object') continue;
    const id = typeof e.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(e.id) && !ids.has(e.id) ? e.id : uid();
    ids.add(id);
    const ver: Version = {
      id, kind: KINDS.includes(e.kind as VersionKind) ? (e.kind as VersionKind) : 'edición',
      created: typeof e.created === 'number' && Number.isFinite(e.created) ? e.created : Date.now(),
      project: normalizeProject(e.project), fav: e.fav === true,
    };
    if (typeof e.label === 'string' && e.label) ver.label = e.label.slice(0, 200);
    if (typeof e.parent === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(e.parent)) ver.parent = e.parent;
    if (typeof e.seed === 'string' && e.seed) ver.seed = e.seed.slice(0, 64);
    if (typeof e.thumb === 'string' && e.thumb.length < 400_000 && THUMB.test(e.thumb)) ver.thumb = e.thumb;
    list.push(ver);
  }
  const c = typeof o.cursor === 'number' && Number.isInteger(o.cursor) ? o.cursor : list.length - 1;
  return { list, cursor: list.length ? Math.min(list.length - 1, Math.max(0, c)) : -1 };
}
