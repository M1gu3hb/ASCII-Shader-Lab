import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval';

/**
 * Local media store: the original bytes of the images and videos the person loads, kept in this
 * browser (IndexedDB) so pieces made with them survive a reload and can travel in a project or
 * session file. Nothing here is ever uploaded. Files are keyed by a hash of their content, so the
 * same photo loaded twice is stored once.
 */

export type MediaKind = 'image' | 'video';

export interface MediaMeta {
  id: string;
  kind: MediaKind;
  name: string;
  type: string;
  size: number;
  w: number;
  h: number;
  added: number;
}
export interface StoredMedia extends MediaMeta { blob: Blob }

/** Largest files kept in the browser. Bigger ones work while the tab is open but must be chosen again. */
export const MEDIA_LIMITS: Record<MediaKind, number> = { image: 40 * 1024 * 1024, video: 200 * 1024 * 1024 };

/** Media added this recently is never collected (it may not be referenced by a recipe yet). */
const GRACE_MS = 5 * 60_000;

let db: UseStore | null = null;
const store = () => (db ??= createStore('mt-media', 'blobs'));

const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

/** Content id: the first 16 hex characters of the SHA-256 of the bytes. */
export async function hashBytes(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (globalThis.crypto?.subtle) {
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))).slice(0, 16);
  }
  // insecure contexts have no WebCrypto: two FNV-1a passes, still stable for the same bytes
  let a = 0x811c9dc5, b = 0x01000193 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) { a = Math.imul(a ^ bytes[i], 0x01000193); b = Math.imul(b ^ bytes[i] ^ (i & 0xff), 0x01000193); }
  return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')).slice(0, 16);
}

export type PutResult =
  | { id: string; stored: true }
  | { id: string; stored: false; reason: 'too-big' | 'no-space' | 'unavailable' };

const isQuota = (e: unknown) => e instanceof DOMException && e.name === 'QuotaExceededError';

/**
 * Stores a file (original bytes) unless it is over the size limit.
 * Always returns an id: files too big to keep get one from their name, size and date instead of
 * their bytes, so they are still recognised within this tab.
 */
export async function put(file: Blob, meta: { kind: MediaKind; name: string; w: number; h: number; lastModified?: number }): Promise<PutResult> {
  const type = file.type || guessType(meta.name) || (meta.kind === 'image' ? 'image/*' : 'video/*');
  if (file.size > MEDIA_LIMITS[meta.kind]) {
    const id = await hashBytes(new TextEncoder().encode(`${meta.name}|${file.size}|${meta.lastModified ?? 0}|${type}`));
    return { id, stored: false, reason: 'too-big' };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = await hashBytes(bytes);
  try {
    if (await get(id, store())) return { id, stored: true };
    const rec: StoredMedia = {
      id, kind: meta.kind, name: meta.name.slice(0, 200), type, size: file.size, w: meta.w, h: meta.h, added: Date.now(),
      blob: new Blob([bytes as BlobPart], { type }),
    };
    await set(id, rec, store());
    return { id, stored: true };
  } catch (e) {
    return { id, stored: false, reason: isQuota(e) ? 'no-space' : 'unavailable' };
  }
}

export async function getMedia(id: string): Promise<StoredMedia | undefined> {
  try {
    const r = await get<StoredMedia>(id, store());
    return r && r.blob instanceof Blob ? r : undefined;
  } catch { return undefined; }
}

export async function hasMedia(id: string): Promise<boolean> {
  return !!(await getMedia(id));
}

/** Everything stored, without the bytes. */
export async function listMedia(): Promise<MediaMeta[]> {
  try {
    const all = await entries<string, StoredMedia>(store());
    return all.filter(([, r]) => r && typeof r === 'object').map(([, { blob: _blob, ...meta }]) => meta);
  } catch { return []; }
}

export async function deleteMedia(id: string): Promise<void> {
  try { await del(id, store()); } catch { /* ignore */ }
}

/** Bytes used by stored media (the ones given, or all). */
export async function mediaUsage(ids?: Set<string>): Promise<{ count: number; bytes: number }> {
  const list = (await listMedia()).filter(m => !ids || ids.has(m.id));
  return { count: list.length, bytes: list.reduce((n, m) => n + m.size, 0) };
}

/** Deletes stored media that nothing refers to any more. Returns what was freed. */
export async function gcMedia(referenced: Set<string>): Promise<{ count: number; bytes: number }> {
  const now = Date.now();
  let count = 0, bytes = 0;
  for (const m of await listMedia()) {
    if (referenced.has(m.id) || now - m.added < GRACE_MS) continue;
    await deleteMedia(m.id);
    count++; bytes += m.size;
  }
  return { count, bytes };
}

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp',
  svg: 'image/svg+xml', heic: 'image/heic', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg',
};

/** MIME type from a file name, for files that arrive without one (e.g. from a .zip). */
export function guessType(name: string): string {
  return TYPES[name.toLowerCase().split('.').pop() ?? ''] ?? '';
}

export function kindOfType(type: string): MediaKind | null {
  return type.startsWith('image/') ? 'image' : type.startsWith('video/') ? 'video' : null;
}
