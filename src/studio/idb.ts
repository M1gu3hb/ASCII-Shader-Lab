/**
 * The studio's own handle on the IndexedDB store the history and the collection live in: the same
 * database idb-keyval uses by default ('keyval-store', store 'keyval'), so nothing moves. A save is
 * one transaction (records, index, deletions together or not at all), and while the database is open
 * that transaction starts synchronously, so a save made as the page is being left starts before the
 * page is gone.
 */
const DB = 'keyval-store', STORE = 'keyval';

let db: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);
  return (opening ??= new Promise<IDBDatabase>((res, rej) => {
    // indexedDB itself throws where site data is blocked
    const req = indexedDB.open(DB);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const d = req.result;
      // a connection the browser closes (Safari does) or another version needs: open again next time
      const drop = () => { if (db === d) db = null; opening = null; };
      d.onclose = drop;
      d.onversionchange = () => { d.close(); drop(); };
      db = d;
      res(d);
    };
    req.onerror = () => { opening = null; rej(req.error); };
  }).catch(err => { opening = null; throw err; }));
}

const aborted = () => new DOMException('La transacción se interrumpió', 'AbortError');

/** Values of several keys (undefined where there is none), read together. */
export async function idbRead(keys: string[]): Promise<unknown[]> {
  const d = await openDb();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, 'readonly');
    const st = tx.objectStore(STORE);
    const reqs = keys.map(k => st.get(k));
    tx.oncomplete = () => res(reqs.map(r => r.result));
    tx.onabort = () => rej(tx.error ?? aborted());
  });
}

const range = (prefix: string) => IDBKeyRange.bound(prefix, prefix + '￿');

/** Some values and the keys that start with each prefix, from one snapshot (one transaction). */
export async function idbKeys(keys: string[], prefixes: string[]): Promise<{ values: unknown[]; keys: string[][] }> {
  const d = await openDb();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, 'readonly');
    const st = tx.objectStore(STORE);
    const vals = keys.map(k => st.get(k));
    const reqs = prefixes.map(p => st.getAllKeys(range(p)));
    tx.oncomplete = () => res({
      values: vals.map(r => r.result),
      keys: reqs.map(r => (r.result as IDBValidKey[]).filter((k): k is string => typeof k === 'string')),
    });
    tx.onabort = () => rej(tx.error ?? aborted());
  });
}

/** Values whose key starts with a prefix. */
export async function idbValues(prefix: string): Promise<unknown[]> {
  const d = await openDb();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll(range(prefix));
    tx.oncomplete = () => res(req.result);
    tx.onabort = () => rej(tx.error ?? aborted());
  });
}

/** Readwrite transactions still on their way (a save made as the page is left supersedes them). */
const inflight = new Set<IDBTransaction>();
const superseded = new WeakSet<IDBTransaction>();

export interface WriteOpts {
  /**
   * Written only while `key` holds `value` (or nothing): the tab that owns the studio data writes
   * its token there, so a tab that lost it (see tabs.ts) cannot overwrite what the new owner saved.
   */
  fence?: [string, string];
  /**
   * Commit at once instead of when the requests come back: for saves made as the page is left
   * (no fence then, since that needs a round trip first). Saves still on their way are aborted first
   * (they resolve 'superseded'): a fenced one waits for this page to answer its fence check, and a page
   * that is closing may never answer, so the save queued behind it would be lost with it. The caller
   * includes their changes in this one.
   */
  commit?: boolean;
}

/**
 * Puts and deletes in one readwrite transaction. Resolves 'fenced' when the fence did not match
 * (nothing was written), 'superseded' when a save made as the page was left took its place;
 * rejects with the browser's error (QuotaExceededError when full).
 */
export function idbWrite(puts: Array<[string, unknown]>, dels: string[], o: WriteOpts = {}): Promise<'ok' | 'fenced' | 'superseded'> {
  const run = (d: IDBDatabase) => new Promise<'ok' | 'fenced' | 'superseded'>((res, rej) => {
    let tx: IDBTransaction;
    let fenced = false;
    if (o.commit) {
      for (const t of inflight) { superseded.add(t); try { t.abort(); } catch { /* already finishing */ } }
      inflight.clear();
    }
    try {
      tx = d.transaction(STORE, 'readwrite');
      inflight.add(tx);
      const st = tx.objectStore(STORE);
      if (o.fence) {
        const [key, value] = o.fence;
        // requests run in order: this check comes back before any put or delete is applied
        const g = st.get(key);
        g.onsuccess = () => { if (g.result !== undefined && g.result !== value) { fenced = true; tx.abort(); } };
      }
      for (const [k, v] of puts) st.put(v, k);
      for (const k of dels) st.delete(k);
      if (o.commit && !o.fence) tx.commit?.();
    } catch (err) {
      // e.g. DataCloneError from put(): nothing is written
      try { tx!.abort(); } catch { /* already finished */ }
      if (tx!) inflight.delete(tx);
      rej(err);
      return;
    }
    tx.oncomplete = () => { inflight.delete(tx); res('ok'); };
    tx.onabort = () => {
      inflight.delete(tx);
      if (fenced) res('fenced');
      else if (superseded.has(tx)) res('superseded');
      else rej(tx.error ?? aborted());
    };
  });
  // synchronous start while the database is open (see above)
  return db ? run(db) : openDb().then(run);
}

export const isQuotaError = (e: unknown) =>
  e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
