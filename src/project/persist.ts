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
import { createStore, del, get, getMany, keys, type UseStore } from 'idb-keyval';
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
  /** Changes with every save of the project (see `fence` in saveProject). */
  rev?: string;
}

/**
 * 'ok'; 'full' (no space left); 'unavailable' (storage blocked: the work lives only in this tab); 'conflict'
 * (another tab saved this project since this tab opened or last saved it: this tab no longer writes it).
 */
export type SaveResult = 'ok' | 'full' | 'unavailable' | 'conflict';

const isQuota = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');

export function summaryOf(p: Project, thumb?: string, rev?: string): ProjectSummary {
  return {
    id: p.id, name: p.name, created: p.created, updated: p.updated, w: p.canvas.w, h: p.canvas.h, layers: p.layers.length,
    duration: p.time.duration, ...(p.meta.origin ? { origin: p.meta.origin } : {}), ...(thumb ? { thumb } : {}), ...(rev ? { rev } : {}),
  };
}

/** Media a project and its versions use (what its refs record lists). */
function idsWith(p: Project, versions?: VersionList | null): Set<string> {
  const ids = projectMediaIds(p);
  for (const v of versions?.list ?? []) for (const id of projectMediaIds(v.project)) ids.add(id);
  return ids;
}

/** Thumbnails of saved summaries this tab has seen: a save made as the page is left cannot read them first. */
const knownThumb = new Map<Id, string>();
/** Saves started per project: a save that a later one overtook while it waited writes nothing. */
const started = new Map<Id, number>();
const startSave = (id: Id) => { const n = (started.get(id) ?? 0) + 1; started.set(id, n); return n; };

/** The project, its summary and (when given) its versions: one transaction, so they never disagree. */
function records(p: Project, thumb: string | undefined, versions: VersionList | null | undefined, rev: string): Array<[string, unknown]> {
  if (thumb) knownThumb.set(p.id, thumb);
  const out: Array<[string, unknown]> = [[P + p.id, p], [S + p.id, summaryOf(p, thumb, rev)]];
  if (versions) out.push([V + p.id, versions]);
  return out;
}

/*
 * Two tabs with the same project open: each would save its own copy over the other's work. Every save writes a
 * new `rev` in the summary; this tab remembers the revs it read (opening the project) and wrote. A fenced save
 * (the autosave's) writes only while the stored rev is one of those; otherwise another tab saved in between:
 * nothing is written, the save says 'conflict', and this tab stops writing that project until it is opened again.
 */
const mine = new Map<Id, string[]>();
const lost = new Set<Id>();
function newRev(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
function remember(id: Id, rev: string) {
  const l = mine.get(id) ?? [];
  l.push(rev);
  mine.set(id, l.slice(-64));
}

/**
 * Writes a project's records in one readwrite transaction (started before this returns while the database is
 * open). `fence`: first checks the stored rev (see above), in the same transaction; `commit`: commits at once
 * (no fence then: that check needs a round trip first).
 */
function writeRecords(p: Project, puts: Array<[string, unknown]>, rev: string, o: { fence?: boolean; commit?: boolean }): Promise<SaveResult> {
  if (o.fence && lost.has(p.id)) return Promise.resolve('conflict');
  const own = mine.get(p.id);
  remember(p.id, rev);
  return store()('readwrite', st => new Promise<SaveResult>(res => {
    const tx = st.transaction;
    let clash = false;
    if (o.fence && own) {
      // requests run in order: this check comes back before any put is applied
      const g = st.get(S + p.id);
      g.onsuccess = () => {
        const s = g.result as ProjectSummary | undefined;
        if (s && !mine.get(p.id)?.includes(s.rev ?? '')) { clash = true; lost.add(p.id); try { tx.abort(); } catch { /* finishing */ } }
      };
    }
    for (const [k, v] of puts) st.put(v, k);
    if (o.commit && !(o.fence && own)) tx.commit?.();
    tx.oncomplete = () => res('ok');
    tx.onabort = () => res(clash ? 'conflict' : isQuota(tx.error) ? 'full' : 'unavailable');
  })).catch(e => (isQuota(e) ? 'full' : 'unavailable'));
}

/**
 * Saves a project (and, when given, its versions and a thumbnail; a thumbnail not given keeps the saved one).
 * The media refs are written first: a collection running meanwhile already keeps the files. A save that a
 * later save of the same project overtook while it waited (e.g. one made as the page was left) writes nothing.
 */
export async function saveProject(p: Project, o: { thumb?: string; versions?: VersionList; fence?: boolean } = {}): Promise<SaveResult> {
  const n = startSave(p.id);
  try {
    if (o.fence && lost.has(p.id)) return 'conflict';
    let versions = o.versions ?? null;
    if (!versions) versions = normalizeVersions(await get(V + p.id, store()));
    await setMediaRefs(owner(p.id), idsWith(p, versions));
    const prev = o.thumb ? undefined : await get<ProjectSummary>(S + p.id, store());
    if (started.get(p.id) !== n) return 'ok';
    const rev = newRev();
    return await writeRecords(p, records(p, o.thumb ?? prev?.thumb, o.versions, rev), rev, { fence: !!o.fence });
  } catch (e) {
    return isQuota(e) ? 'full' : 'unavailable';
  }
}

/**
 * Saves at once, for a page being left (or a project being replaced by another): the project, its summary
 * and its versions go in one transaction that starts before this returns (while the database is open) and
 * is committed at once, so it does not depend on the page living through a chain of awaits; the media refs
 * are written beside it. Saves of the same project still on their way write nothing after it.
 */
export function saveProjectAtOnce(p: Project, o: { versions?: VersionList; fence?: boolean } = {}): Promise<SaveResult> {
  startSave(p.id);
  try {
    if (o.fence && lost.has(p.id)) return Promise.resolve('conflict');
    if (o.versions) void setMediaRefs(owner(p.id), idsWith(p, o.versions)).catch(() => undefined);
    const rev = newRev();
    return writeRecords(p, records(p, knownThumb.get(p.id), o.versions, rev), rev, { fence: !!o.fence, commit: true });
  } catch (e) {
    return Promise.resolve(isQuota(e) ? 'full' : 'unavailable');
  }
}

/**
 * Replaces only the thumbnail of a saved project's summary (the project itself is not written): a picture
 * made after a save, without holding the save up while it renders.
 */
export async function saveThumb(id: Id, thumb: string): Promise<void> {
  try {
    knownThumb.set(id, thumb);
    // read and written in one transaction: a save landing in between is never put back to its older summary
    await store()('readwrite', st => new Promise<void>(res => {
      const g = st.get(S + id);
      g.onsuccess = () => { const s = g.result as ProjectSummary | undefined; if (s) st.put({ ...s, thumb }, S + id); };
      st.transaction.oncomplete = st.transaction.onabort = () => res();
    }));
  } catch { /* storage unavailable */ }
}

/** A saved project (normalised), or null. */
export async function loadProject(id: Id): Promise<Project | null> {
  try {
    const [raw, sum] = await getMany([P + id, S + id], store());
    const s = sum as ProjectSummary | undefined;
    if (typeof s?.thumb === 'string') knownThumb.set(id, s.thumb);
    // opened (again): this tab writes it from what it read
    lost.delete(id);
    mine.set(id, [typeof s?.rev === 'string' ? s.rev : '']);
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
    for (const s of list) if (typeof s.thumb === 'string') knownThumb.set(s.id, s.thumb);
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
  /**
   * Saves what is waiting at once, with a write that starts before this returns (saveProjectAtOnce): for a
   * page being hidden or left, and before the open project is replaced by another.
   */
  now(): void;
  /** Stops listening (a pending save is flushed). */
  stop(): Promise<void>;
}

export function autosaver(o: {
  get: () => Project | null;
  versions?: () => VersionList | null;
  thumb?: (p: Project) => Promise<string | null>;
  delay?: number;
  onSaved?: (r: SaveResult, p: Project) => void;
}): Autosaver {
  const delay = o.delay ?? 900;
  let timer = 0, dirty = false, running: Promise<SaveResult | null> | null = null;
  /** An edit not written yet (waiting for its moment, or on its way). */
  let unsaved = false;
  // on a reload pagehide comes too late for IndexedDB, beforeunload does not; it is listened to only while
  // something is unsaved (browsers keep pages that listen to it out of their back-forward cache)
  let guarding = false;
  const guard = (on: boolean) => {
    unsaved = on;
    if (typeof window === 'undefined' || on === guarding) return;
    guarding = on;
    if (on) window.addEventListener('beforeunload', onLeave);
    else window.removeEventListener('beforeunload', onLeave);
  };
  const run = async (): Promise<SaveResult | null> => {
    if (running) await running;
    if (!dirty) return null;
    dirty = false;
    const p = o.get();
    if (!p) { guard(false); return null; }
    const job = (async () => {
      const thumb = o.thumb ? await o.thumb(p).catch(() => null) : null;
      const r = await saveProject(p, { fence: true, ...(thumb ? { thumb } : {}), ...(o.versions?.() ? { versions: o.versions()! } : {}) });
      if (!dirty) guard(false);
      o.onSaved?.(r, p);
      return r;
    })();
    running = job;
    try { return await job; } finally { running = null; }
  };
  // (a page being left does not live through run()'s chain of awaits: what is unsaved is written at once,
  // also what a save on its way was writing)
  const now = (): void => {
    if (!unsaved) return;
    clearTimeout(timer);
    dirty = false;
    const p = o.get();
    if (!p) { guard(false); return; }
    const v = o.versions?.() ?? null;
    void saveProjectAtOnce(p, { fence: true, ...(v ? { versions: v } : {}) }).then(r => { if (!dirty) guard(false); o.onSaved?.(r, p); });
  };
  const onHide = () => { if (document.visibilityState === 'hidden') now(); };
  const onLeave = () => now();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
  }
  return {
    schedule() {
      dirty = true;
      guard(true);
      clearTimeout(timer);
      timer = window.setTimeout(() => void run(), delay);
    },
    flush() { clearTimeout(timer); return run(); },
    now,
    async stop() {
      clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onLeave);
      }
      await run();
      guard(false);
    },
  };
}
