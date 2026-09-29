/**
 * GIF pieces that do not need a browser (pure, unit-tested): size limits, frame delays, the pixels a global
 * palette is built from, the nearest-colour lookup and the three ways of mapping pixels to a palette — none,
 * ordered (Bayer 8×8) and error diffusion (Floyd–Steinberg). The palette itself comes from gifenc's quantizer
 * (lazy-loaded by movie.ts); gifenc has no dithering, hence these.
 *
 * Transparency: GIF has 1-bit alpha. A transparent export reserves the last palette entry for «no pixel» and
 * maps every pixel with alpha < 128 to it; semi-transparent edges become either solid or empty.
 */

export type Palette = number[][];
export type Dither = 'none' | 'bayer' | 'floyd';

/** Longest side of a GIF (larger outputs are scaled down, with a note). */
export const GIF_MAX_SIDE = 1080;
/** Pixels of all frames together (w·h·frames): beyond this the GIF is scaled down (memory and file size). */
export const GIF_MAX_TOTAL = 160e6;
/** GIF delays are whole centiseconds and browsers slow down delays under 2 cs: 50 fps at most. */
export const GIF_MAX_FPS = 50;

export interface GifPlan { w: number; h: number; fps: number; notes: string[] }

/** The size and rate a GIF export will really use, and why they changed (Spanish notes). */
export function gifPlan(w: number, h: number, frames: number, fps: number): GifPlan {
  const notes: string[] = [];
  const bySide = Math.min(1, GIF_MAX_SIDE / Math.max(1, w, h));
  const total = w * h * bySide * bySide * Math.max(1, frames);
  const byTotal = total > GIF_MAX_TOTAL ? Math.sqrt(GIF_MAX_TOTAL / total) : 1;
  const k = bySide * byTotal;
  const W = k < 1 ? Math.max(16, Math.round(w * k)) : w, H = k < 1 ? Math.max(16, Math.round(h * k)) : h;
  if (byTotal < 1) notes.push(`GIF reducido a ${W}×${H} por su duración (${frames} cuadros): así cabe en memoria y pesa menos. Para el tamaño completo usa MP4 o WebM, o acorta el tramo.`);
  else if (bySide < 1) notes.push(`GIF reducido a ${W}×${H}: más grande pesaría decenas de MB y muchos sitios no lo aceptan. Para el tamaño completo usa MP4 o WebM.`);
  let f = fps;
  if (f > GIF_MAX_FPS) {
    f = GIF_MAX_FPS;
    notes.push(`GIF a ${GIF_MAX_FPS} cuadros por segundo: los navegadores ralentizan los GIF más rápidos.`);
  }
  return { w: W, h: H, fps: f, notes };
}

/** Delay of frame i in ms, from whole centiseconds accumulated so the clip keeps its exact length (e.g. 24 fps). */
export function gifDelay(i: number, fps: number): number {
  const cs = (k: number) => Math.round((k * 100) / fps);
  return (cs(i + 1) - cs(i)) * 10;
}

/** Up to `maxPixels` opaque pixels taken evenly from several frames (for one palette shared by all). */
export function paletteSample(frames: ReadonlyArray<Uint8ClampedArray | Uint8Array>, maxPixels = 400_000): Uint8Array {
  let total = 0;
  for (const f of frames) total += f.length >> 2;
  const step = Math.max(1, Math.ceil(total / maxPixels));
  const out: number[] = [];
  let k = 0;
  for (const f of frames) {
    for (let i = 0; i < f.length; i += 4, k++) {
      if (k % step !== 0 || f[i + 3] < 128) continue;
      out.push(f[i], f[i + 1], f[i + 2], 255);
    }
  }
  return Uint8Array.from(out);
}

/**
 * Nearest palette entry (squared RGB distance) for any colour, cached on a 5-6-5 grid computed from each cell's
 * centre: the answer does not depend on which pixel asked first (deterministic, same frames → same bytes).
 * Entries at index ≥ `usable` (the transparent slot) are never chosen.
 */
export function nearestLookup(palette: Palette, usable = palette.length): (r: number, g: number, b: number) => number {
  const cache = new Int16Array(1 << 16).fill(-1);
  const n = Math.min(usable, palette.length);
  return (r, g, b) => {
    const key = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
    let v = cache[key];
    if (v >= 0) return v;
    const cr = ((r >> 3) << 3) + 4, cg = ((g >> 2) << 2) + 2, cb = ((b >> 3) << 3) + 4;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const p = palette[i];
      const d = (p[0] - cr) ** 2 + (p[1] - cg) ** 2 + (p[2] - cb) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    v = best;
    cache[key] = v;
    return v;
  };
}

/** The 8×8 Bayer matrix, values 0..63. */
export const BAYER8: readonly number[] = (() => {
  const m = [[0]];
  let cur = m;
  for (let s = 1; s < 8; s *= 2) {
    const next: number[][] = [];
    for (let y = 0; y < s * 2; y++) {
      next.push([]);
      for (let x = 0; x < s * 2; x++) {
        const q = cur[y % s][x % s] * 4;
        next[y].push(q + [0, 2, 3, 1][(y < s ? 0 : 2) + (x < s ? 0 : 1)]);
      }
    }
    cur = next;
  }
  return cur.flat();
})();

/**
 * Palette indices of RGBA pixels. `transparent`: index for pixels with alpha < 128 (or −1: none, alpha ignored).
 * 'bayer' adds an ordered threshold (amplitude ≈ the palette's typical step) before the lookup; 'floyd' spreads each
 * pixel's error to its right and lower neighbours (7/16, 3/16, 5/16, 1/16), left to right on every row.
 */
export function indexPixels(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, palette: Palette, dither: Dither, transparent = -1, usable = transparent >= 0 ? transparent : palette.length): Uint8Array {
  const out = new Uint8Array(w * h);
  const near = nearestLookup(palette, usable);
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  if (dither === 'floyd') {
    // error buffers for this row and the next (3 channels)
    let cur = new Float32Array((w + 2) * 3), nxt = new Float32Array((w + 2) * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, j = i * 4;
        if (transparent >= 0 && rgba[j + 3] < 128) { out[i] = transparent; continue; }
        const e = (x + 1) * 3;
        const r = clamp(rgba[j] + cur[e]), g = clamp(rgba[j + 1] + cur[e + 1]), b = clamp(rgba[j + 2] + cur[e + 2]);
        const k = near(r, g, b);
        out[i] = k;
        const p = palette[k];
        const er = r - p[0], eg = g - p[1], eb = b - p[2];
        cur[e + 3] += er * 7 / 16; cur[e + 4] += eg * 7 / 16; cur[e + 5] += eb * 7 / 16;
        nxt[e - 3] += er * 3 / 16; nxt[e - 2] += eg * 3 / 16; nxt[e - 1] += eb * 3 / 16;
        nxt[e] += er * 5 / 16; nxt[e + 1] += eg * 5 / 16; nxt[e + 2] += eb * 5 / 16;
        nxt[e + 3] += er / 16; nxt[e + 4] += eg / 16; nxt[e + 5] += eb / 16;
      }
      const t = cur; cur = nxt; nxt = t; nxt.fill(0);
    }
    return out;
  }
  // ordered: amplitude from the palette's spread (a small palette needs a stronger threshold)
  const amp = dither === 'bayer' ? Math.min(64, 255 / Math.max(2, Math.cbrt(Math.max(2, usable)))) : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, j = i * 4;
      if (transparent >= 0 && rgba[j + 3] < 128) { out[i] = transparent; continue; }
      if (amp) {
        const d = ((BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64 - 0.5) * amp;
        out[i] = near(clamp(rgba[j] + d), clamp(rgba[j + 1] + d), clamp(rgba[j + 2] + d));
      } else out[i] = near(rgba[j], rgba[j + 1], rgba[j + 2]);
    }
  }
  return out;
}

/** Mean absolute error (per channel, 0..255) of an indexed picture against the original: for tests. */
export function indexedError(rgba: Uint8ClampedArray | Uint8Array, index: Uint8Array, palette: Palette): number {
  let s = 0;
  for (let i = 0; i < index.length; i++) {
    const p = palette[index[i]], j = i * 4;
    s += Math.abs(p[0] - rgba[j]) + Math.abs(p[1] - rgba[j + 1]) + Math.abs(p[2] - rgba[j + 2]);
  }
  return s / (index.length * 3);
}
