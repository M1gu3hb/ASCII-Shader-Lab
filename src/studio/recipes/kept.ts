/**
 * The recipes' pictures kept between visits (in this browser only): a small IndexedDB database of its own,
 * apart from the history and the collection. Only pictures of the catalogue's own recipes are kept (never
 * one made with the person's photo, video, camera or words), each under a hash of the build and the
 * recipe, so a new version of the studio draws them again. At most MAX, the oldest used go first; a
 * picture is a few kilobytes. Everything here may fail (site data blocked, private windows, quota): the
 * pictures are then drawn again, nothing else changes.
 */

const DB = 'glyphos-recetas', STORE = 'fotos';
const MAX = 320;
/** The build this code comes from (a new deploy is a new module URL: its pictures are drawn again). */
const BUILD = typeof import.meta !== 'undefined' ? import.meta.url : '';

interface Kept { url: string; at: number }

let db: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  return (db ??= new Promise<IDBDatabase | null>(res => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE).createIndex('at', 'at');
      req.onsuccess = () => {
        const d = req.result;
        d.onversionchange = () => { d.close(); db = null; };
        res(d);
      };
      req.onerror = () => res(null);
      req.onblocked = () => res(null);
    } catch {
      res(null);
    }
  }));
}

/** A short, stable key for a picture (FNV-1a, 53 bits, of the build and the picture's own key). */
export function keptKey(key: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const s = BUILD + '|' + key;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return (h1 >>> 0).toString(36) + '-' + ((h2 >>> 0) & 0x1fffff).toString(36) + '-' + s.length.toString(36);
}

/** A kept picture, or null. */
export async function getKept(key: string): Promise<string | null> {
  const d = await open();
  if (!d) return null;
  return new Promise(res => {
    try {
      const tx = d.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const k = keptKey(key);
      const r = st.get(k);
      r.onsuccess = () => {
        const v = r.result as Kept | undefined;
        if (!v || typeof v.url !== 'string' || !v.url.startsWith('data:image/')) { res(null); return; }
        // used: it goes last in the line of the ones to drop
        st.put({ url: v.url, at: Date.now() }, k);
        res(v.url);
      };
      r.onerror = () => res(null);
      tx.onabort = () => res(null);
    } catch {
      res(null);
    }
  });
}

let puts = 0;
/** Keeps a picture (and, now and then, drops the oldest over MAX). */
export async function putKept(key: string, url: string) {
  const d = await open();
  if (!d) return;
  try {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ url, at: Date.now() } satisfies Kept, keptKey(key));
    if (++puts % 24 === 1) prune(d);
  } catch { /* full, or closed: drawn again next time */ }
}

function prune(d: IDBDatabase) {
  try {
    const tx = d.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    const c = st.count();
    c.onsuccess = () => {
      let extra = c.result - MAX;
      if (extra <= 0) return;
      const cur = st.index('at').openKeyCursor();
      cur.onsuccess = () => {
        const k = cur.result;
        if (!k || extra-- <= 0) return;
        st.delete(k.primaryKey);
        k.continue();
      };
    };
  } catch { /* nothing to drop */ }
}
