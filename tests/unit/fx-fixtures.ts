/** Small synthetic pictures for the finishes tests (no DOM): plain RGBA buffers. */
import type { ImageDataLike } from '../../src/fx';

export function img(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): ImageDataLike {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a] = f(x, y);
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
  return { data, width: w, height: h };
}

/** A smooth colourful "photo" with a bright spot and some edges; u, v in 0..1. */
export function photoAt(u: number, v: number): [number, number, number, number] {
  const sun = Math.max(0, 1 - Math.hypot(u - 0.62, v - 0.35) * 4);
  const ridge = v > 0.55 + 0.08 * Math.sin(u * 9) ? 0.35 : 1;
  const r = (70 + 150 * (1 - v) + 120 * sun) * ridge;
  const g = (40 + 90 * (1 - v) + 140 * sun) * ridge;
  const b = (110 + 60 * v + 60 * sun) * ridge;
  return [r, g, b, 255];
}

export const photo = (w: number, h: number) => img(w, h, (x, y) => photoAt((x + 0.5) / w, (y + 0.5) / h));

/** A disc "cutout" (soft 1 px edge) on full transparency, shaded like a sphere. */
export function cutoutAt(u: number, v: number, w: number): [number, number, number, number] {
  const d = Math.hypot(u - 0.5, v - 0.5) * w;
  const R = w * 0.3;
  const a = Math.max(0, Math.min(1, R - d + 0.5));
  if (a <= 0) return [0, 0, 0, 0];
  const shade = Math.max(0, 1 - Math.hypot(u - 0.42, v - 0.4) * 2.4);
  return [60 + 190 * shade, 120 + 100 * shade, 40 + 60 * shade, a * 255];
}

export const cutout = (w: number, h: number) => img(w, h, (x, y) => cutoutAt((x + 0.5) / w, (y + 0.5) / h, w));

export const clone = (i: ImageDataLike): ImageDataLike => ({ data: new Uint8ClampedArray(i.data), width: i.width, height: i.height });

/** Box downsample by an integer factor, premultiplied (like the browser's area average). */
export function downsample(i: ImageDataLike, f: number): ImageDataLike {
  const w = Math.floor(i.width / f), h = Math.floor(i.height / f);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const j = ((y * f + dy) * i.width + x * f + dx) * 4, al = i.data[j + 3];
      r += i.data[j] * al; g += i.data[j + 1] * al; b += i.data[j + 2] * al; a += al;
    }
    const o = (y * w + x) * 4;
    if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
    out[o + 3] = a / (f * f);
  }
  return { data: out, width: w, height: h };
}

export const luma = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

export function meanLuma(i: ImageDataLike): number {
  let s = 0;
  for (let j = 0; j < i.data.length; j += 4) s += luma(i.data, j);
  return s / (i.width * i.height);
}

/** Mean absolute difference of premultiplied RGBA (0..255) between two pictures of the same size. */
export function meanAbsDiff(a: ImageDataLike, b: ImageDataLike): number {
  let s = 0;
  for (let j = 0; j < a.data.length; j += 4) {
    const aa = a.data[j + 3] / 255, ab = b.data[j + 3] / 255;
    for (let c = 0; c < 3; c++) s += Math.abs(a.data[j + c] * aa - b.data[j + c] * ab);
    s += Math.abs(a.data[j + 3] - b.data[j + 3]);
  }
  return s / (a.width * a.height * 4);
}

/** Gaussian-ish blur (3 box passes, radius r) of a picture, for comparing textures by their tone. */
export function soften(i: ImageDataLike, r: number): ImageDataLike {
  const { width: w, height: h } = i;
  let src = Float32Array.from(i.data, (v, k) => (k % 4 === 3 ? v : v * i.data[k - (k % 4) + 3] / 255));
  let dst = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) for (const horiz of [true, false]) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = horiz ? Math.min(w - 1, Math.max(0, x + k)) : x, yy = horiz ? y : Math.min(h - 1, Math.max(0, y + k));
        s += src[(yy * w + xx) * 4 + c]; n++;
      }
      dst[(y * w + x) * 4 + c] = s / n;
    }
    const t = src; src = dst; dst = t;
  }
  const out = new Uint8ClampedArray(src.length);
  for (let j = 0; j < src.length; j += 4) {
    const a = src[j + 3];
    out[j + 3] = a;
    if (a > 0) for (let c = 0; c < 3; c++) out[j + c] = (src[j + c] * 255) / a;
  }
  return { data: out, width: w, height: h };
}
