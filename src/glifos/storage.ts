/**
 * This browser's storage of «Crea tus GLYPHOS» (nothing is uploaded).
 *
 *   IndexedDB 'glyphos-glifos' / 'datos' (a database of its own):
 *     d:<docId>  the document (GlyphDoc)
 *     s:<docId>  its summary for the list { id, name, mode, rev, updated, glyphs, thumb?, v }
 *     i:<imgId>  a picture { blob, type, name, w, h, added }, named by the hash of its bytes
 *     g:<setId>  a compiled set { bytes, name, doc, rev, added }, named by the hash of its canonical bytes
 *     x:<docId>  the raw copy of a document that could not be read, kept apart: while it is there no save of
 *                that id writes anything, until the person discards it (discardBroken)
 *
 * A document and its summary are written in one transaction, after checking (in that same transaction when
 * the backend can) that the stored revision is the one this tab expects: two tabs never write over each other.
 * Content-addressed pictures and sets are stored once however many times they are put or imported, and a
 * set a lab piece uses is never deleted. The backend is injectable (useKV) so this runs in Node tests.
 */
import { createStore, del, get, keys, set, setMany, type UseStore } from 'idb-keyval';
import { glyphSetBytes, isGlyphSetId, normalizeGlyphSet, parseGlyphSet, type GlyphSet } from '../glyphset/set';
import { hashBytes } from '../studio/mediaStore';
import { GLYPH_DOC_FORMAT, hasDrawing, newId, normalizeDoc, type GlyphDoc } from './doc';
import { asCopy, PACKAGE_LIMITS, planMerge, sniffImage, type readPackage } from './export/package';

/* ------------------------------------------------------------------ */
/* Backends                                                            */
/* ------------------------------------------------------------------ */

export interface KV {
  get(k: string): Promise<unknown>;
  set(k: string, v: unknown): Promise<void>;
  del(k: string): Promise<void>;
  keys(): Promise<string[]>;
  /** Writes every entry in one transaction: all or none. */
  setMany(entries: Array<[string, unknown]>): Promise<void>;
  /**
   * Optional: reads `check`, and writes `entries` only if `ok` accepts their values, all in one transaction
   * (a check-then-write that another tab cannot slip into). Resolves false when `ok` refused.
   */
  setManyIf?(check: string[], ok: (current: unknown[]) => boolean, entries: Array<[string, unknown]>): Promise<boolean>;
}

export function idbKV(): KV {
  let st: UseStore | null = null;
  // opened on first use: a browser without IndexedDB fails the call (a rejection), not the module
  const s = () => (st ??= createStore('glyphos-glifos', 'datos'));
  return {
    get: k => get(k, s()),
    set: (k, v) => set(k, v, s()),
    del: k => del(k, s()),
    keys: async () => (await keys(s())).filter((k): k is string => typeof k === 'string'),
    setMany: entries => setMany(entries, s()),
    setManyIf: (check, ok, entries) => s()('readwrite', store => new Promise<boolean>((res, rej) => {
      const tx = store.transaction;
      const vals: unknown[] = new Array(check.length);
      let left = check.length, refused = false;
      const write = () => {
        if (!ok(vals)) { refused = true; try { tx.abort(); } catch { /* already finishing */ } return; }
        for (const [k, v] of entries) store.put(v, k);
      };
      // requests run in order within the transaction: the reads come back before any put is made
      check.forEach((k, i) => { const r = store.get(k); r.onsuccess = () => { vals[i] = r.result; if (--left === 0) write(); }; });
      if (!check.length) write();
      tx.oncomplete = () => res(true);
      tx.onabort = () => (refused ? res(false) : rej(tx.error ?? new Error('La escritura se canceló.')));
    })),
  };
}

/** A backend in memory, for tests: values are cloned like IndexedDB clones them. */
export function memoryKV(): KV {
  const m = new Map<string, unknown>();
  const clone = (v: unknown) => { try { return structuredClone(v); } catch { return v; } };
  // all cloned first: a value that cannot be stored leaves nothing half written
  const putAll = (entries: Array<[string, unknown]>) => { const c = entries.map(([k, v]) => [k, clone(v)] as const); for (const [k, v] of c) m.set(k, v); };
  return {
    async get(k) { return clone(m.get(k)); },
    async set(k, v) { m.set(k, clone(v)); },
    async del(k) { m.delete(k); },
    async keys() { return [...m.keys()]; },
    async setMany(entries) { putAll(entries); },
    async setManyIf(check, ok, entries) {
      if (!ok(check.map(k => clone(m.get(k))))) return false;
      putAll(entries);
      return true;
    },
  };
}

let kv: KV | null = null;
const store = () => (kv ??= idbKV());

/** Swaps the backend (tests use memoryKV). */
export function useKV(next: KV) { kv = next; }

let clock: () => number = () => Date.now();
/** Swaps the clock (tests move it past the grace period). */
export function setClock(fn: () => number) { clock = fn; }

const isQuota = (e: unknown) => { const n = (e as { name?: unknown } | null)?.name; return n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED'; };

/** Sets added this recently are never collected: a document may be about to publish one, a piece about to use it. */
export const SET_GRACE_MS = 5 * 60_000;

const D = 'd:', S = 's:', I = 'i:', G = 'g:', X = 'x:';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isContentId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export interface DocSummary {
  id: string;
  name: string;
  mode: 'texto' | 'ascii';
  rev: number;
  updated: number;
  /** Characters with a drawing. */
  glyphs: number;
  thumb?: string;
  /** Format of the stored document. */
  v?: number;
}

export function summaryOf(doc: GlyphDoc, thumb?: string): DocSummary {
  const glyphs = doc.chars.filter(c => hasDrawing(doc.glyphs[c])).length;
  return { id: doc.id, name: doc.name, mode: doc.mode, rev: doc.rev, updated: doc.updated, glyphs, ...(thumb ? { thumb } : {}), v: doc.v };
}

/** A summary as stored, made safe to show (whatever wrote it). */
function cleanSummary(v: unknown, id: string): DocSummary {
  const s = isObj(v) ? v : {};
  const num = (x: unknown, fb: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fb);
  return {
    id, name: typeof s.name === 'string' && s.name ? s.name.slice(0, 120) : 'Sin nombre', mode: s.mode === 'ascii' ? 'ascii' : 'texto',
    rev: num(s.rev, 0), updated: num(s.updated, 0), glyphs: num(s.glyphs, 0),
    ...(typeof s.thumb === 'string' ? { thumb: s.thumb } : {}), ...(typeof s.v === 'number' ? { v: s.v } : {}),
  };
}

function brokenReason(raw: unknown): string {
  try { normalizeDoc(raw); return 'Este proyecto de glifos no se pudo leer.'; } catch (e) { return (e as Error).message || 'El proyecto de glifos está dañado.'; }
}

/** The documents of this browser, most recently changed first; damaged ones say why, newer-format ones say so. */
export async function listDocs(): Promise<Array<DocSummary & { broken?: string; future?: boolean }>> {
  try {
    const db = store();
    const ks = await db.keys();
    const out: Array<DocSummary & { broken?: string; future?: boolean }> = [];
    const seen = new Set<string>();
    const broken = new Map<string, string>();
    for (const k of ks) if (k.startsWith(X)) broken.set(k.slice(2), brokenReason(await db.get(k)));
    for (const k of ks) {
      if (!k.startsWith(S)) continue;
      const id = k.slice(2);
      seen.add(id);
      const s = cleanSummary(await db.get(k), id);
      out.push({ ...s, ...(broken.has(id) ? { broken: broken.get(id)! } : {}), ...((s.v ?? 0) > GLYPH_DOC_FORMAT ? { future: true } : {}) });
    }
    for (const [id, why] of broken) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ ...cleanSummary(await db.get(X + id), id), broken: why });
    }
    // a document without its summary (written by something else): listed from the document itself
    for (const k of ks) {
      const id = k.slice(2);
      if (!k.startsWith(D) || seen.has(id)) continue;
      try {
        const { doc, future } = normalizeDoc(await db.get(k));
        out.push({ ...summaryOf(doc), id, ...(future ? { future: true } : {}) });
      } catch (e) {
        out.push({ ...cleanSummary(null, id), broken: (e as Error).message });
      }
    }
    return out.sort((a, b) => b.updated - a.updated);
  } catch {
    return [];
  }
}

/**
 * A stored document. One that does not read is moved to x:<id> and reported as broken (with its raw value,
 * so the studio can offer it as a file); from then on that id stays as it is until discardBroken.
 */
export async function loadDoc(id: string): Promise<{ doc: GlyphDoc; future: boolean } | { broken: string; raw: unknown }> {
  let raw: unknown;
  try {
    const db = store();
    const kept = await db.get(X + id);
    if (kept !== undefined) return { broken: brokenReason(kept), raw: kept };
    raw = await db.get(D + id);
  } catch {
    return { broken: 'El almacenamiento de este navegador no está disponible: no se pudo abrir el proyecto.', raw: undefined };
  }
  if (raw === undefined) return { broken: 'Ese proyecto de glifos ya no está en este navegador.', raw: undefined };
  try {
    const r = normalizeDoc(raw);
    // the key names it (a damaged id would otherwise give it a new one, and a second copy at the next save)
    if (/^[a-z0-9-]{1,40}$/.test(id)) r.doc.id = id;
    return r;
  } catch (e) {
    const why = (e as Error).message || 'El proyecto de glifos está dañado.';
    try {
      const db = store();
      await db.set(X + id, raw);
      await db.del(D + id);
    } catch { /* storage refused: it stays where it was, and is reported all the same */ }
    return { broken: why, raw };
  }
}

/** Forgets a broken document for good (its raw copy, and whatever is left under its id). */
export async function discardBroken(id: string): Promise<void> {
  try {
    const db = store();
    await db.del(X + id);
    await db.del(D + id);
    await db.del(S + id);
  } catch { /* storage unavailable */ }
}

export type SaveDocResult = 'ok' | 'conflict' | 'future' | 'full' | 'unavailable';

/**
 * Saves a document and its summary (one transaction). The revision is the caller's (+1 per change); with
 * `expectRev`, nothing is written unless the stored revision is that one ('conflict': another tab saved it
 * since). A stored document from a newer format, or the document itself being one, is never written
 * ('future'); an id whose broken copy is kept apart is not written either ('conflict'). A thumbnail not
 * given keeps the stored one.
 */
export async function saveDoc(doc: GlyphDoc, o: { expectRev?: number; thumb?: string } = {}): Promise<SaveDocResult> {
  if (doc.v > GLYPH_DOC_FORMAT) return 'future';
  try {
    const db = store();
    const prev = await db.get(S + doc.id);
    const ps = isObj(prev) ? prev : null;
    // our summaries carry the stored format and revision; anything else is judged from the document itself
    const check = ps && typeof ps.v === 'number' && typeof ps.rev === 'number' ? [S + doc.id, X + doc.id] : [S + doc.id, X + doc.id, D + doc.id];
    let verdict: SaveDocResult = 'ok';
    const ok = ([s, x, d]: unknown[]) => {
      const sum = isObj(s) ? s : null, raw = isObj(d) ? d : null;
      const v = typeof sum?.v === 'number' ? sum.v : raw?.v;
      const rev = typeof sum?.rev === 'number' ? sum.rev : raw?.rev;
      if (x !== undefined) verdict = 'conflict';
      else if (typeof v === 'number' && v > GLYPH_DOC_FORMAT) verdict = 'future';
      else if (o.expectRev !== undefined && typeof rev === 'number' && rev !== o.expectRev) verdict = 'conflict';
      else verdict = 'ok';
      return verdict === 'ok';
    };
    const thumb = o.thumb ?? (typeof ps?.thumb === 'string' ? ps.thumb : undefined);
    const entries: Array<[string, unknown]> = [[D + doc.id, doc], [S + doc.id, summaryOf(doc, thumb)]];
    if (db.setManyIf) return (await db.setManyIf(check, ok, entries)) ? 'ok' : verdict;
    if (!ok(await Promise.all(check.map(k => db.get(k))))) return verdict;
    await db.setMany(entries);
    return 'ok';
  } catch (e) {
    return isQuota(e) ? 'full' : 'unavailable';
  }
}

/* ------------------------------------------------------------------ */
/* Pictures and sets                                                   */
/* ------------------------------------------------------------------ */

export interface StoredImage { blob: Blob; type: string; name: string; w: number; h: number; added: number }

/** Stores a picture under the hash of its bytes (once, however many times it is put). Over 20 MB it is not kept. */
export async function putImage(blob: Blob, name: string, w: number, h: number): Promise<{ id: string; stored: boolean }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const id = await hashBytes(bytes);
  if (bytes.length > PACKAGE_LIMITS.image) return { id, stored: false };
  try {
    const db = store();
    const had = await db.get(I + id);
    if (isObj(had) && had.blob instanceof Blob) return { id, stored: true };
    const type = sniffImage(bytes) ?? (blob.type || 'application/octet-stream');
    const rec: StoredImage = { blob: blob.type === type ? blob : new Blob([bytes as BlobPart], { type }), type, name: name.slice(0, 200), w, h, added: clock() };
    await db.set(I + id, rec);
    return { id, stored: true };
  } catch {
    return { id, stored: false };
  }
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  if (!isContentId(id)) return undefined;
  try {
    const r = await store().get(I + id);
    return isObj(r) && r.blob instanceof Blob ? r as unknown as StoredImage : undefined;
  } catch { return undefined; }
}

export interface StoredSet { bytes: Uint8Array; name: string; doc?: string; rev?: number; added: number }

/**
 * Stores a compiled set (validated, in its canonical bytes) under the hash of those bytes. Putting it again
 * refreshes its date, so a collection running meanwhile leaves it alone.
 */
export async function putSet(input: GlyphSet): Promise<{ id: string; bytes: Uint8Array; stored: boolean }> {
  const clean = normalizeGlyphSet(input);
  const bytes = glyphSetBytes(clean);
  const id = await hashBytes(bytes);
  try {
    const db = store();
    const had = await db.get(G + id);
    const rec: StoredSet = isObj(had) && had.bytes instanceof Uint8Array
      ? { ...(had as unknown as StoredSet), added: clock() }
      : { bytes, name: clean.name, ...(clean.doc ? { doc: clean.doc.id, rev: clean.doc.rev } : {}), added: clock() };
    await db.set(G + id, rec);
    return { id, bytes, stored: true };
  } catch {
    return { id, bytes, stored: false };
  }
}

/** A stored set, validated (and checked against its id); undefined when missing or damaged. */
export async function getSet(id: string): Promise<GlyphSet | undefined> {
  if (!isGlyphSetId(id)) return undefined;
  try {
    const r = await store().get(G + id);
    if (!isObj(r) || !(r.bytes instanceof Uint8Array)) return undefined;
    const s = parseGlyphSet(r.bytes);
    return (await hashBytes(glyphSetBytes(s))) === id ? s : undefined;
  } catch { return undefined; }
}

export async function setIds(): Promise<string[]> {
  try { return (await store().keys()).filter(k => k.startsWith(G)).map(k => k.slice(2)); } catch { return []; }
}

/* ------------------------------------------------------------------ */
/* Deleting and collecting                                             */
/* ------------------------------------------------------------------ */

/** Pictures and published sets a stored document (or a broken one's raw copy) refers to, read leniently. */
function refsOf(raw: unknown): { images: Set<string>; sets: string[] } {
  const images = new Set<string>(), sets: string[] = [];
  if (!isObj(raw)) return { images, sets };
  if (isObj(raw.images)) for (const k of Object.keys(raw.images)) if (isContentId(k)) images.add(k);
  if (isObj(raw.glyphs)) for (const g of Object.values(raw.glyphs)) { const img = isObj(g) && isObj(g.raster) ? g.raster.img : null; if (isContentId(img)) images.add(img); }
  // in publishing order, as the document keeps them
  if (Array.isArray(raw.published)) for (const p of raw.published) if (isObj(p) && isGlyphSetId(p.set)) sets.push(p.set);
  return { images, sets };
}

/** The set a document published last (highest revision, then latest date). */
function latestPublished(raw: unknown): string | undefined {
  if (!isObj(raw) || !Array.isArray(raw.published)) return undefined;
  let best: { rev: number; at: number; set: string } | undefined;
  for (const p of raw.published) {
    if (!isObj(p) || !isGlyphSetId(p.set)) continue;
    const rev = typeof p.rev === 'number' ? p.rev : -1, at = typeof p.at === 'number' ? p.at : 0;
    if (!best || rev > best.rev || (rev === best.rev && at >= best.at)) best = { rev, at, set: p.set };
  }
  return best?.set;
}

/**
 * Deletes a document and its summary (and a broken copy under its id). Its sets go too, except the ones a lab
 * piece uses (`inUse`, returned in keptSets) and any another document published; its pictures go unless
 * another document uses them.
 */
export async function deleteDoc(id: string, inUse: (setId: string) => boolean): Promise<{ deleted: boolean; keptSets: string[] }> {
  let db: KV, ks: string[], raw: unknown;
  try {
    db = store();
    ks = await db.keys();
    if (![D, S, X].some(p => ks.includes(p + id))) return { deleted: false, keptSets: [] };
    raw = (await db.get(D + id)) ?? (await db.get(X + id));
    await db.del(D + id);
    await db.del(S + id);
    await db.del(X + id);
  } catch {
    return { deleted: false, keptSets: [] };
  }
  const keptSets: string[] = [];
  // the document is gone; what it used is cleaned up only when every other document could be read
  try {
    const mine = refsOf(raw);
    const sets = new Set(mine.sets);
    const others = { images: new Set<string>(), sets: new Set<string>() };
    for (const k of ks) {
      if (k.startsWith(G)) { const r = await db.get(k); if (isObj(r) && r.doc === id) sets.add(k.slice(2)); continue; }
      if (!(k.startsWith(D) || k.startsWith(X)) || k.slice(2) === id) continue;
      const r = refsOf(await db.get(k));
      for (const i of r.images) others.images.add(i);
      for (const s of r.sets) others.sets.add(s);
    }
    for (const s of sets) {
      if (!ks.includes(G + s)) continue;
      if (inUse(s)) { keptSets.push(s); continue; }
      if (!others.sets.has(s)) await db.del(G + s);
    }
    for (const i of mine.images) if (!others.images.has(i)) await db.del(I + i);
  } catch { /* leftovers: gcSets collects unused sets later */ }
  return { deleted: true, keptSets };
}

/**
 * Deletes the stored sets nothing needs: not used by a lab piece (`inUse`), not the latest published set of
 * an existing document (every set a broken document published is kept: it cannot be told which matters),
 * and not added in the last five minutes. Returns the ids removed; removes nothing when the documents
 * cannot be read.
 */
export async function gcSets(inUse: (setId: string) => boolean): Promise<string[]> {
  const removed: string[] = [];
  try {
    const db = store();
    const ks = await db.keys();
    const now = clock();
    const keep = new Set<string>();
    for (const k of ks) {
      if (k.startsWith(D)) { const s = latestPublished(await db.get(k)); if (s) keep.add(s); }
      else if (k.startsWith(X)) for (const s of refsOf(await db.get(k)).sets) keep.add(s);
    }
    for (const k of ks) {
      if (!k.startsWith(G)) continue;
      const id = k.slice(2);
      if (keep.has(id) || inUse(id)) continue;
      const r = await db.get(k);
      const added = isObj(r) && typeof r.added === 'number' ? r.added : 0;
      if (now - added < SET_GRACE_MS) continue;
      await db.del(k);
      removed.push(id);
    }
  } catch { /* stop here: what was removed so far is reported */ }
  return removed;
}

/* ------------------------------------------------------------------ */
/* Importing a package                                                 */
/* ------------------------------------------------------------------ */

/** nuevo, igual (nothing imported), reemplazado, copia, futuro (a newer-format document: not stored, open it read-only). */
export type ImportAction = 'nuevo' | 'igual' | 'reemplazado' | 'copia' | 'futuro';

const SAVE_ERRORS: Partial<Record<SaveDocResult, string>> = {
  full: 'No queda espacio en este navegador para guardar el proyecto de glifos.',
  unavailable: 'El almacenamiento de este navegador no está disponible: el proyecto de glifos no se pudo guardar.',
};

/**
 * Stores what a package brings: its pictures and sets (by content id, so importing twice adds nothing) and
 * its document as planMerge says. 'auto' replaces with a newer revision and imports older or diverging ones
 * as a copy; 'reemplazar' also replaces a diverging one; 'copia' always copies. A newer local document is
 * never overwritten, and the same revision is never duplicated.
 */
export async function importPackage(pkg: Awaited<ReturnType<typeof readPackage>>, mode: 'reemplazar' | 'copia' | 'auto'): Promise<{ docId: string; action: ImportAction }> {
  const doc = pkg.doc;
  if (pkg.future) return { docId: doc.id, action: 'futuro' };
  for (const img of pkg.images) {
    const meta = doc.images[img.id];
    if (!(await putImage(img.blob, meta?.name ?? img.id, meta?.w ?? 1, meta?.h ?? 1)).stored) throw new Error('Las imágenes del proyecto no se pudieron guardar en este navegador (puede que no quede espacio).');
  }
  for (const s of pkg.sets) {
    if (!(await putSet(s.set)).stored) throw new Error('Los juegos de glifos del proyecto no se pudieron guardar en este navegador (puede que no quede espacio).');
  }
  const local = await listDocs();
  const here = local.find(d => d.id === doc.id);
  let { action } = planMerge(local, { id: doc.id, rev: doc.rev, updated: doc.updated, name: doc.name });
  // a damaged or newer-format copy here is never written over
  if (here && (here.broken || here.future)) action = 'divergente';
  if (action === 'igual') return { docId: doc.id, action: 'igual' };

  const finish = async (d: GlyphDoc, done: ImportAction, expectRev?: number) => {
    const r = await saveDoc(d, expectRev === undefined ? {} : { expectRev });
    if (r === 'ok') return { docId: d.id, action: done };
    if (SAVE_ERRORS[r]) throw new Error(SAVE_ERRORS[r]);
    return null;
  };
  const copy = async () => {
    const r = await finish(asCopy(doc, newId()), 'copia');
    if (!r) throw new Error('El proyecto de glifos no se pudo guardar como copia.');
    return r;
  };
  if (action === 'nuevo') return (await finish(doc, 'nuevo')) ?? copy();
  const replace = (action === 'mas-nuevo' && mode !== 'copia') || (action === 'divergente' && mode === 'reemplazar');
  // replacing checks the revision it read: a save from another tab in between makes it a copy instead
  if (replace && here) return (await finish(doc, 'reemplazado', here.rev)) ?? copy();
  return copy();
}
