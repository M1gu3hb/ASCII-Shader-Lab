/**
 * Saving projects in this browser (nothing is uploaded).
 *
 *   IndexedDB 'glyphos-projects' / 'projects' (a database of its own, apart from the lab's):
 *     p:<id>  the project (plain JSON)
 *     s:<id>  its summary for the list (name, size, dates, thumbnail)
 *     v:<id>  its versions (versions.ts)
 *   Media (originals, painted masks, mattes, cut-outs) go to the shared media store (studio/mediaStore.ts),
 *   content-addressed, so the lab and the studio share files. Each saved project lists the files it uses
 *   in the media store's refs ('proyecto:<id>'), which every collection honours: the lab's collection never
 *   deletes a studio file, and the studio's own (collectStudioMedia) never deletes one the lab uses.
 *
 * autosaver() saves a project a moment after it changes (and at once when the page is hidden or left).
 */
import { createStore, del, get, getMany, keys, set, type UseStore } from 'idb-keyval';
import type { MediaRef } from '../engine/recipe';
import { dropMediaRefs, gcMedia, put, setMediaRefs, type MediaKind } from '../studio/mediaStore';
import { normalizeProject } from './normalize';
import { projectMediaIds } from './refs';
import { keepBlob } from './sources';
import type { Id, Project } from './types';
import { normalizeVersions, type VersionList } from './versions';

let db: UseStore | null = null;
const store = () => (db ??= createStore('glyphos-projects', 'projects'));
const P = 'p:', S = 's:', V = 'v:';
const owner = (id: Id) => 'proyecto:' + id;

export interface ProjectSummary {
  id: Id;
  name: string;
  created: number;
  updated: number;
  w: number;
  h: number;
  layers: number;
  duration: number;
  origin?: string;
  thumb?: string;
}

/** 'ok'; 'full' (no space left); 'unavailable' (storage blocked: the work lives only in this tab). */
export type SaveResult = 'ok' | 'full' | 'unavailable';

const isQuota = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');

export function summaryOf(p: Project, thumb?: string): ProjectSummary {
  return {
    id: p.id, name: p.name, created: p.created, updated: p.updated, w: p.canvas.w, h: p.canvas.h, layers: p.layers.length,
    duration: p.time.duration, ...(p.meta.origin ? { origin: p.meta.origin } : {}), ...(thumb ? { thumb } : {}),
  };
}

/** Media a project and its versions use (what its refs record lists). */
function idsWith(p: Project, versions?: VersionList | null): Set<string> {
  const ids = projectMediaIds(p);
  for (const v of versions?.list ?? []) for (const id of projectMediaIds(v.project)) ids.add(id);
  return ids;
}

/**
 * Saves a project (and, when given, its versions and a thumbnail; a thumbnail not given keeps the saved one).
 * The media refs are written first: a collection running meanwhile already keeps the files.
 */
export async function saveProject(p: Project, o: { thumb?: string; versions?: VersionList; keep?: Iterable<string> } = {}): Promise<SaveResult> {
  try {
    let versions = o.versions ?? null;
    if (!versions) versions = normalizeVersions(await get(V + p.id, store()));
    // (`keep`: files the open project may get back, e.g. by undo, though it does not use them now)
    const ids = idsWith(p, versions);
    for (const id of o.keep ?? []) ids.add(id);
    await setMediaRefs(owner(p.id), ids);
    const prev = o.thumb ? undefined : await get<ProjectSummary>(S + p.id, store());
    await set(P + p.id, p, store());
    await set(S + p.id, summaryOf(p, o.thumb ?? prev?.thumb), store());
    if (o.versions) await set(V + p.id, o.versions, store());
    return 'ok';
  } catch (e) {
    return isQuota(e) ? 'full' : 'unavailable';
  }
}

/**
 * Replaces only the thumbnail of a saved project's summary (the project itself is not written): a picture
 * made after a save, without holding the save up while it renders.
 */
export async function saveThumb(id: Id, thumb: string): Promise<void> {
  try {
    const s = await get<ProjectSummary>(S + id, store());
    if (s) await set(S + id, { ...s, thumb }, store());
  } catch { /* storage unavailable */ }
}

/** A saved project (normalised), or null. */
export async function loadProject(id: Id): Promise<Project | null> {
  try {
    const raw = await get(P + id, store());
    return raw ? normalizeProject(raw) : null;
  } catch { return null; }
}

export async function loadVersions(id: Id): Promise<VersionList> {
  try { return normalizeVersions(await get(V + id, store())); } catch { return normalizeVersions(null); }
}

/** Saved projects, most recently changed first. */
export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const ks = (await keys<string>(store())).filter(k => typeof k === 'string' && k.startsWith(S));
    const list = (await getMany<ProjectSummary>(ks, store())).filter((s): s is ProjectSummary => !!s && typeof s.id === 'string');
    return list.sort((a, b) => b.updated - a.updated);
  } catch { return []; }
}

/** Deletes a saved project and its versions; its files go at the next collection unless something else uses them. */
export async function deleteProject(id: Id): Promise<void> {
  try {
    await del(P + id, store());
    await del(S + id, store());
    await del(V + id, store());
    await dropMediaRefs(owner(id));
  } catch { /* storage unavailable */ }
}

/** Stores a picked or made file (photo, video, painted mask, matte) and returns its reference. */
export async function putMedia(blob: Blob, meta: { kind: MediaKind; name: string; w: number; h: number; lastModified?: number }): Promise<MediaRef & { stored: boolean }> {
  const r = await put(blob, meta);
  // a file the store could not keep still works while this tab lives
  if (!r.stored) keepBlob(r.id, blob, meta.name);
  return { id: r.id, kind: meta.kind, name: meta.name.slice(0, 200), ...(blob.type ? { type: blob.type } : {}), size: blob.size, w: meta.w, h: meta.h, stored: r.stored };
}

/** Media every saved project (and its versions) uses, from what they recorded. */
export async function allProjectMediaIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const ks = (await keys<string>(store())).filter(k => typeof k === 'string' && (k.startsWith(P) || k.startsWith(V)));
  for (const raw of await getMany(ks, store())) {
    if (!raw) continue;
    if ((raw as { kind?: unknown }).kind === 'glyphos-project') for (const id of projectMediaIds(normalizeProject(raw))) ids.add(id);
    else for (const v of normalizeVersions(raw).list) for (const id of projectMediaIds(v.project)) ids.add(id);
  }
  return ids;
}

/** Files added this recently are never collected by the studio (a project may be about to use them). */
const STUDIO_GRACE = 30 * 60_000;

/**
 * Deletes stored media nothing uses: not a saved project, not a version, not the lab's history or
 * collection (read from the lab's own storage), and nothing added in the last half hour. Returns what
 * was freed; nothing when any of those cannot be read.
 */
export async function collectStudioMedia(extra: Iterable<string> = [], grace = STUDIO_GRACE): Promise<{ count: number; bytes: number }> {
  try {
    const ids = await allProjectMediaIds();
    for (const id of extra) ids.add(id);
    const { storedMediaIds } = await import('../studio/store');
    for (const id of await storedMediaIds()) ids.add(id);
    return await gcMedia(ids, grace);
  } catch {
    return { count: 0, bytes: 0 };
  }
}

/* ------------------------------------------------------------------ autosave */

export interface Autosaver {
  /** The project changed: save it a moment from now. */
  schedule(): void;
  /** Saves now if something is waiting. */
  flush(): Promise<SaveResult | null>;
  /** Stops listening (a pending save is flushed). */
  stop(): Promise<void>;
}

export function autosaver(o: {
  get: () => Project | null;
  versions?: () => VersionList | null;
  /** Media to keep listed besides the project's own (what undo and redo can bring back). */
  keep?: () => Iterable<string>;
  thumb?: (p: Project) => Promise<string | null>;
  delay?: number;
  onSaved?: (r: SaveResult, p: Project) => void;
}): Autosaver {
  const delay = o.delay ?? 900;
  let timer = 0, dirty = false, running: Promise<SaveResult | null> | null = null;
  const run = async (): Promise<SaveResult | null> => {
    if (running) await running;
    if (!dirty) return null;
    dirty = false;
    const p = o.get();
    if (!p) return null;
    const job = (async () => {
      const thumb = o.thumb ? await o.thumb(p).catch(() => null) : null;
      const r = await saveProject(p, { ...(thumb ? { thumb } : {}), ...(o.versions?.() ? { versions: o.versions()! } : {}), ...(o.keep ? { keep: o.keep() } : {}) });
      o.onSaved?.(r, p);
      return r;
    })();
    running = job;
    try { return await job; } finally { running = null; }
  };
  const onHide = () => { if (document.visibilityState === 'hidden' && dirty) { clearTimeout(timer); void run(); } };
  const onLeave = () => { if (dirty) { clearTimeout(timer); void run(); } };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
  }
  return {
    schedule() {
      dirty = true;
      clearTimeout(timer);
      timer = window.setTimeout(() => void run(), delay);
    },
    flush() { clearTimeout(timer); return run(); },
    async stop() {
      clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onLeave);
      }
      await run();
    },
  };
}
