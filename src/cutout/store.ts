/**
 * Model files: download (only when asked, after the person agreed), sha256 verification, storage in Cache Storage
 * keyed by the hash, and removal. Works on the page and in the ML worker (which only reads).
 *
 * Sources, in order: a same-origin mirror when /models/manifest.json exists (written by the optional
 * scripts/fetch-models.mjs), else the pinned Hugging Face URL (resolve/<commit>/<path>, which redirects to the
 * Hugging Face CDN with CORS «*»). Nothing is ever uploaded: these are GET requests for public files.
 */
import { baseName, fileUrl, type ModelFile, type ModelSpec } from './models';
import { MB } from './caps';

export const CACHE_NAME = 'glyphos-modelos-v1';
const KEY_PREFIX = '/__glyphos-modelos/';

const origin = () => (globalThis as { location?: Location }).location?.origin ?? 'http://localhost';

/** The Cache Storage key of a file: its hash (the path does not exist on the server). */
export const cacheKey = (sha256: string) => `${origin()}${KEY_PREFIX}${sha256}`;

export class CutoutError extends Error {
  constructor(message: string, readonly code: 'needs-download' | 'integrity' | 'network' | 'quota' | 'aborted' | 'unavailable' | 'model') {
    super(message);
    this.name = code === 'aborted' ? 'AbortError' : 'CutoutError';
  }
}

export const abortError = () => new CutoutError('Cancelado.', 'aborted');

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

/** Checks size and hash; throws a CutoutError('integrity') in Spanish when they differ. */
export async function verifyBytes(data: ArrayBuffer | Uint8Array, f: Pick<ModelFile, 'sha256' | 'bytes' | 'path'>): Promise<void> {
  const size = data.byteLength;
  if (size !== f.bytes) throw new CutoutError(`La descarga de ${baseName(f.path)} no tiene el tamaño publicado (${size} de ${f.bytes} bytes). No se usó.`, 'integrity');
  const got = await sha256Hex(data);
  if (got !== f.sha256) throw new CutoutError(`La descarga de ${baseName(f.path)} no coincide con el modelo publicado (sha256). No se usó.`, 'integrity');
}

async function openCache(): Promise<Cache> {
  if (typeof caches === 'undefined') throw new CutoutError('Este navegador no permite guardar modelos (Cache Storage no disponible; hace falta https).', 'unavailable');
  return caches.open(CACHE_NAME);
}

export async function hasFile(f: ModelFile): Promise<boolean> {
  try {
    const res = await (await openCache()).match(cacheKey(f.sha256));
    return !!res && Number(res.headers.get('x-bytes')) === f.bytes;
  } catch { return false; }
}

/** The stored bytes of a verified file (throws 'needs-download' when absent). */
export async function readFile(f: ModelFile): Promise<Uint8Array> {
  const res = await (await openCache()).match(cacheKey(f.sha256));
  if (!res) throw new CutoutError(`Falta el archivo ${baseName(f.path)}: descarga el modelo primero.`, 'needs-download');
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength !== f.bytes) throw new CutoutError(`El archivo guardado ${baseName(f.path)} está incompleto: bórralo y descárgalo otra vez.`, 'integrity');
  return buf;
}

export async function deleteFiles(files: ModelFile[]): Promise<void> {
  const c = await openCache();
  await Promise.all(files.map(f => c.delete(cacheKey(f.sha256))));
}

/** Bytes kept by every downloaded model (for «Borrar modelos descargados»). */
export async function storedBytes(): Promise<number> {
  try {
    const c = await openCache();
    let n = 0;
    for (const req of await c.keys()) {
      const res = await c.match(req);
      n += Number(res?.headers.get('x-bytes') ?? 0);
    }
    return n;
  } catch { return 0; }
}

export async function deleteAll(): Promise<void> {
  if (typeof caches !== 'undefined') await caches.delete(CACHE_NAME);
}

/* ------------------------------------------------------------------ mirror */

export interface MirrorManifest {
  glyphos: 'models';
  version: 1;
  files: Array<{ sha256: string; bytes: number; url: string; source?: string }>;
}

let mirrorP: Promise<Map<string, string>> | null = null;

/** sha256 → same-origin URL, from /models/manifest.json when the deployment has one (empty map otherwise). */
export function mirror(): Promise<Map<string, string>> {
  if (mirrorP) return mirrorP;
  mirrorP = (async () => {
    const map = new Map<string, string>();
    try {
      const base = import.meta.env.BASE_URL ?? '/';
      const res = await fetch(`${base}models/manifest.json`, { cache: 'no-cache', credentials: 'same-origin' });
      if (!res.ok || !/json/.test(res.headers.get('content-type') ?? '')) return map;
      const j = (await res.json()) as MirrorManifest;
      if (j?.glyphos !== 'models' || !Array.isArray(j.files)) return map;
      for (const f of j.files) {
        if (typeof f?.sha256 !== 'string' || typeof f.url !== 'string') continue;
        const u = new URL(f.url, `${origin()}${base}models/`);
        if (u.origin === origin()) map.set(f.sha256, u.href);
      }
    } catch { /* no mirror */ }
    return map;
  })();
  return mirrorP;
}

/** Test hook: forget the mirror lookup. */
export const resetMirror = () => { mirrorP = null; };

/* ------------------------------------------------------------------ download */

export interface DownloadProgress { loaded: number; total: number }

async function fetchBytes(url: string, expected: number, onBytes: (n: number) => void, signal?: AbortSignal): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(url, { signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  } catch (e) {
    if (signal?.aborted) throw abortError();
    throw new CutoutError(`No se pudo descargar el modelo (${(e as Error).message || 'sin conexión'}).`, 'network');
  }
  if (!res.ok || !res.body) throw new CutoutError(`No se pudo descargar el modelo (respuesta ${res.status}).`, 'network');
  const reader = res.body.getReader();
  const out = new Uint8Array(expected);
  let off = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (off + value.byteLength > expected) throw new CutoutError('La descarga es más grande que el modelo publicado. No se usó.', 'integrity');
      out.set(value, off);
      off += value.byteLength;
      onBytes(value.byteLength);
    }
  } catch (e) {
    if (signal?.aborted) throw abortError();
    if (e instanceof CutoutError) throw e;
    throw new CutoutError(`La descarga se interrumpió (${(e as Error).message || 'error de red'}).`, 'network');
  }
  return off === expected ? out : out.subarray(0, off);
}

/**
 * Downloads, verifies and stores the files that are not stored yet. Each file tries the mirror, then Hugging
 * Face. Progress counts the bytes of all missing files.
 */
export async function downloadFiles(spec: ModelSpec, files: ModelFile[], onProgress: (p: DownloadProgress) => void, signal?: AbortSignal): Promise<void> {
  const missing: ModelFile[] = [];
  for (const f of files) if (!(await hasFile(f))) missing.push(f);
  const total = missing.reduce((n, f) => n + f.bytes, 0);
  let loaded = 0;
  onProgress({ loaded, total });
  const cache = await openCache();
  const mirrors = await mirror();
  for (const f of missing) {
    if (signal?.aborted) throw abortError();
    const urls = [mirrors.get(f.sha256), fileUrl(spec, f)].filter((u): u is string => !!u);
    let lastErr: unknown = null;
    for (const url of urls) {
      const start = loaded;
      try {
        const bytes = await fetchBytes(url, f.bytes, n => { loaded += n; onProgress({ loaded, total }); }, signal);
        await verifyBytes(bytes, f);
        try {
          await cache.put(cacheKey(f.sha256), new Response(bytes as BodyInit, {
            headers: { 'content-type': 'application/octet-stream', 'x-bytes': String(f.bytes), 'x-sha256': f.sha256 },
          }));
        } catch (e) {
          throw new CutoutError(`No hay espacio en este navegador para guardar el modelo (${MB(f.bytes)}). Libera espacio o borra modelos descargados.`, (e as Error)?.name === 'QuotaExceededError' ? 'quota' : 'quota');
        }
        lastErr = null;
        break;
      } catch (e) {
        if ((e as CutoutError)?.code === 'aborted' || signal?.aborted) throw abortError();
        if ((e as CutoutError)?.code === 'quota') throw e;
        lastErr = e;
        loaded = start;
        onProgress({ loaded, total });
      }
    }
    if (lastErr) throw lastErr;
  }
  // Ask the browser to keep the models when it cleans up storage (granted silently or not at all in most
  // browsers; Firefox may ask the person).
  try {
    const st = globalThis.navigator?.storage;
    if (st?.persist && !(await st.persisted?.())) await st.persist();
  } catch { /* optional */ }
}
