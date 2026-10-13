import type { ModelState } from './types';

/**
 * Saved states (checkpoints) of stateful families, kept in memory for every engine on the page (stage,
 * exports, thumbnails), keyed by their content id. The studio stores them in this browser and loads them
 * when a recipe refers to one (layer.fam.ck); projects and sessions carry them as files.
 *
 * Format of a checkpoint file (binary, little-endian): the bytes «GLYPHOS-ESTADO\n», a uint32 with the length
 * of a UTF-8 JSON header, the header ({ kind: 'glyphos-estado', v: 1, id, fv, steps, res, seed, scalars,
 * arrays: [{ name, type, length }] }) and then each array's bytes in that order, each aligned to 4 bytes.
 */

export interface Checkpoint {
  /** Family id and algorithm version. */
  family: string;
  fv: number;
  seed: string;
  res: number;
  state: ModelState;
}

export const CHECKPOINT_FORMAT = 1;
const MAGIC = 'GLYPHOS-ESTADO\n';
/** Largest checkpoint accepted (bytes): a 512-row raster family keeps a few float arrays. */
export const CHECKPOINT_MAX = 48 * 1024 * 1024;

const TYPES = { f32: Float32Array, i32: Int32Array, u8: Uint8Array, u16: Uint16Array } as const;
type TypeName = keyof typeof TYPES;
const typeOf = (a: ModelState['arrays'][string]): TypeName =>
  a instanceof Float32Array ? 'f32' : a instanceof Int32Array ? 'i32' : a instanceof Uint16Array ? 'u16' : 'u8';

export function encodeCheckpoint(c: Checkpoint): Uint8Array {
  const names = Object.keys(c.state.arrays);
  const header = {
    kind: 'glyphos-estado', v: CHECKPOINT_FORMAT, family: c.family, fv: c.fv, seed: c.seed, res: c.res,
    steps: c.state.steps, scalars: c.state.scalars,
    arrays: names.map(n => ({ name: n, type: typeOf(c.state.arrays[n]), length: c.state.arrays[n].length })),
  };
  const head = new TextEncoder().encode(JSON.stringify(header));
  const magic = new TextEncoder().encode(MAGIC);
  const pad = (n: number) => (4 - (n % 4)) % 4;
  let size = magic.length + 4 + head.length;
  size += pad(size);
  for (const n of names) { const a = c.state.arrays[n]; size += a.byteLength + pad(a.byteLength); }
  const out = new Uint8Array(size);
  out.set(magic, 0);
  let o = magic.length;
  new DataView(out.buffer).setUint32(o, head.length, true);
  o += 4;
  out.set(head, o);
  o += head.length;
  o += pad(o);
  for (const n of names) {
    const a = c.state.arrays[n];
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), o);
    o += a.byteLength + pad(a.byteLength);
  }
  return out;
}

/** Reads a checkpoint file; throws a readable error on anything else (or a newer format). */
export function decodeCheckpoint(bytes: Uint8Array): Checkpoint {
  if (bytes.length > CHECKPOINT_MAX) throw new Error('El estado guardado es demasiado grande.');
  const magic = new TextEncoder().encode(MAGIC);
  if (bytes.length < magic.length + 4 || magic.some((b, i) => bytes[i] !== b)) throw new Error('Ese archivo no es un estado de GLYPHOS.');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hl = dv.getUint32(magic.length, true);
  let o = magic.length + 4;
  if (o + hl > bytes.length) throw new Error('El estado guardado está incompleto.');
  let h: Record<string, unknown>;
  try { h = JSON.parse(new TextDecoder().decode(bytes.subarray(o, o + hl))); } catch { throw new Error('El estado guardado está dañado.'); }
  if (h.kind !== 'glyphos-estado') throw new Error('Ese archivo no es un estado de GLYPHOS.');
  if (typeof h.v !== 'number' || h.v > CHECKPOINT_FORMAT) throw new Error('Ese estado viene de una versión más nueva de GLYPHOS.');
  o += hl;
  o += (4 - (o % 4)) % 4;
  const arrays: ModelState['arrays'] = {};
  const list = Array.isArray(h.arrays) ? h.arrays as Array<{ name: string; type: TypeName; length: number }> : [];
  for (const a of list) {
    const T = TYPES[a.type];
    if (!T || typeof a.name !== 'string' || !Number.isInteger(a.length) || a.length < 0) throw new Error('El estado guardado está dañado.');
    const bytesLen = a.length * T.BYTES_PER_ELEMENT;
    if (o + bytesLen > bytes.length) throw new Error('El estado guardado está incompleto.');
    // a copy, aligned: the file's buffer may be shared or unaligned
    const copy = new Uint8Array(bytesLen);
    copy.set(bytes.subarray(o, o + bytesLen));
    arrays[a.name] = new T(copy.buffer);
    o += bytesLen + ((4 - (bytesLen % 4)) % 4);
  }
  const scalars: Record<string, number> = {};
  const sc = h.scalars && typeof h.scalars === 'object' ? h.scalars as Record<string, unknown> : {};
  for (const [k, v] of Object.entries(sc)) if (typeof v === 'number' && Number.isFinite(v)) scalars[k] = v;
  const fam = String(h.family ?? '');
  return {
    family: fam,
    fv: Number(h.fv) || 1,
    seed: String(h.seed ?? ''),
    res: Number(h.res) || 0,
    state: { id: fam, v: Number(h.fv) || 1, steps: Number(h.steps) || 0, res: Number(h.res) || 0, scalars, arrays },
  };
}

/* ------------------------------------------------------------------ */
/* In-memory registry shared by the engines of the page                */
/* ------------------------------------------------------------------ */

const known = new Map<string, Checkpoint>();
let gen = 0;
let onMissing: ((id: string) => void) | null = null;
const asked = new Set<string>();

/** Bumped whenever a checkpoint arrives: hosts waiting for one look again. */
export const checkpointGen = () => gen;

export function provideCheckpoint(id: string, c: Checkpoint) {
  known.set(id, c);
  gen++;
}

export function getCheckpoint(id: string): Checkpoint | undefined {
  const c = known.get(id);
  if (!c && onMissing && !asked.has(id)) { asked.add(id); onMissing(id); }
  return c;
}

/** The studio fetches checkpoints this page does not hold yet (from this browser's storage). */
export function onMissingCheckpoint(fn: ((id: string) => void) | null) {
  onMissing = fn;
  asked.clear();
}

export function forgetCheckpoints() { known.clear(); asked.clear(); gen++; }
