/**
 * Shared machinery of the finishes: the pixel buffer type, the run context, reusable scratch memory,
 * seeded hashes, colours and small math. No DOM here: everything runs on plain RGBA buffers, so the unit
 * tests (node) and a future worker use the same code as the studio.
 *
 * Conventions
 *   - Img is ImageData-shaped: straight (un-premultiplied) sRGB RGBA, 8 bits per channel, row-major.
 *   - An op reads `src` and writes every pixel of `dst` (same size, never the same buffer).
 *   - Sizes in params are OUTPUT pixels; ops multiply them by run.scale to get input pixels.
 *   - Randomness comes from integer hashes of (output coordinates, seed, frame): never Math.random().
 */

export interface Img {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type Values = Record<string, number | string | boolean>;

export interface Run {
  /** Project time in seconds. */
  t: number;
  /** 32-bit hash of the seed string (see seedHash). */
  seed: number;
  /** Output px per input px. */
  scale: number;
  quality: 'preview' | 'final';
  scratch: Scratch;
}

export type Op = (src: Img, dst: Img, p: Values, run: Run) => void;

export function makeImg(width: number, height: number, data?: Uint8ClampedArray): Img {
  return { data: data ?? new Uint8ClampedArray(width * height * 4), width, height };
}

/* ------------------------------------------------------------------ scratch memory */

/**
 * Typed arrays reused between calls, keyed by name. Arrays only grow; `bytes` reports what is held and
 * `clear` drops everything. The contents of a returned array are stale: callers initialise what they read.
 */
export class Scratch {
  private f = new Map<string, Float32Array>();
  private u = new Map<string, Uint8ClampedArray>();
  private i = new Map<string, Int32Array>();

  f32(key: string, n: number): Float32Array {
    let a = this.f.get(key);
    if (!a || a.length < n) { a = new Float32Array(n); this.f.set(key, a); }
    return a.length === n ? a : a.subarray(0, n);
  }

  u8(key: string, n: number): Uint8ClampedArray {
    let a = this.u.get(key);
    if (!a || a.length < n) { a = new Uint8ClampedArray(n); this.u.set(key, a); }
    return a.length === n ? a : a.subarray(0, n);
  }

  i32(key: string, n: number): Int32Array {
    let a = this.i.get(key);
    if (!a || a.length < n) { a = new Int32Array(n); this.i.set(key, a); }
    return a.length === n ? a : a.subarray(0, n);
  }

  img(key: string, w: number, h: number): Img {
    return makeImg(w, h, this.u8(key, w * h * 4));
  }

  get bytes(): number {
    let n = 0;
    for (const m of [this.f, this.u, this.i]) for (const a of m.values()) n += a.byteLength;
    return n;
  }

  clear(): void { this.f.clear(); this.u.clear(); this.i.clear(); }
}

/* ------------------------------------------------------------------ math */

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const sat = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(e0: number, e1: number, x: number): number {
  let t = (x - e0) / (e1 - e0);
  t = t > 0 ? (t < 1 ? t : 1) : 0;
  return t * t * (3 - 2 * t);
}
export const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ seeded hashes */

/** FNV-1a of a string: the numeric seed of a run. */
export function seedHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Well-mixed 32-bit hash of three integers (lowbias32 finaliser over a linear combination). */
export function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b9);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Uniform in [0, 1). */
export const rand3 = (x: number, y: number, z: number) => hash3(x, y, z) / 4294967296;

/**
 * Approximately normal (mean 0, standard deviation 1) from one hash: the sum of three 10-bit uniforms
 * (Irwin–Hall), rescaled. Cheap, bounded to ±3, and smooth enough for grain and noise.
 */
export function gauss3(x: number, y: number, z: number): number {
  const h = hash3(x, y, z);
  return (((h & 1023) + ((h >>> 10) & 1023) + ((h >>> 20) & 1023)) / 1023 - 1.5) * 2;
}

/** Frame index of a time for effects that change over time (grain, noise, jitter) at `fps` changes per second. */
export const frameOf = (t: number, fps: number) => Math.floor(Math.max(0, t) * fps + 1e-6);

/* ------------------------------------------------------------------ colour */

export type RGB = [number, number, number];

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** '#rgb', '#rrggbb' or '#rrggbbaa' (alpha ignored) → [r, g, b]; anything else → null. */
export function parseHex(s: unknown): RGB | null {
  if (typeof s !== 'string') return null;
  const m = HEX.exec(s.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(c: RGB): string {
  return '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

/** A colour param, already validated by resolveParams (falls back to black). */
export const rgbOf = (v: unknown): RGB => parseHex(v) ?? [0, 0, 0];

/** Rec. 601 luma of 8-bit sRGB (what "brightness" means to the eye in photos), 0..255. */
export const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/* ------------------------------------------------------------------ premultiplied float buffers */

/** Straight RGBA bytes → premultiplied float RGBA (0..255). */
export function toPremul(src: Img, out: Float32Array): Float32Array {
  const d = src.data, n = src.width * src.height * 4;
  for (let i = 0; i < n; i += 4) {
    const a = d[i + 3], k = a / 255;
    out[i] = d[i] * k; out[i + 1] = d[i + 1] * k; out[i + 2] = d[i + 2] * k; out[i + 3] = a;
  }
  return out;
}

/** Premultiplied float RGBA → straight RGBA bytes (clamped). */
export function fromPremul(buf: Float32Array, dst: Img): void {
  const d = dst.data, n = dst.width * dst.height * 4;
  for (let i = 0; i < n; i += 4) {
    let a = buf[i + 3];
    if (a <= 0.5) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; continue; }
    if (a > 255) a = 255;
    const k = 255 / a;
    d[i] = buf[i] * k; d[i + 1] = buf[i + 1] * k; d[i + 2] = buf[i + 2] * k; d[i + 3] = a;
  }
}
