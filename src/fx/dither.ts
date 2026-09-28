/**
 * Dithering: error diffusion (Floyd–Steinberg, Atkinson, Jarvis–Judice–Ninke, Stucki, Burkes, Sierra,
 * Sierra two-row, Sierra Lite; serpentine or not), Riemersma (error history along a Hilbert curve —
 * the generalised "gilbert" curve, so any rectangle is covered without gaps), ordered matrices (Bayer
 * 2/4/8/16, clustered dot, blue noise), white noise and plain threshold.
 *
 * Colour modes: 1 bit (ink/paper), N tones between ink and paper, N levels per RGB channel, a palette.
 * Work happens at a coarser grid when `pixel` > 1 (area average down, nearest up: «blocky pixel»).
 * Values are floats in 0..1, in sRGB or, with `linear`, in linear light (so a 50 % grey dithers to the
 * share of paper that reflects half the light). In 1 bit and tones the value is the share of paper whose
 * mix with the ink has the pixel's brightness, so light ink on dark paper keeps the picture positive.
 *
 * Alpha: fully transparent pixels take no part (no error comes out of them, error sent to them is
 * dropped), and the output keeps the input alpha — times the ink coverage when the paper is transparent.
 */
import { clamp, makeImg, rand3, type Img, type RGB, type Scratch } from './core';
import { blueNoise, BLUE_N } from './bluenoise';
import { nearestFor, type Nearest } from './palettes';

export type DitherMode = 'bn' | 'tonos' | 'rgb' | 'paleta';

export interface DitherSpec {
  algo: string;
  serpentine: boolean;
  mode: DitherMode;
  ink: RGB;
  paper: RGB;
  /** Paper becomes transparent (bn/tonos). */
  clear: boolean;
  levels: number;
  /** Palette colours (mode 'paleta'). */
  colors: RGB[];
  /**
   * Size of a dither cell in INPUT pixels (may be fractional: cells follow the output grid, so a
   * half-size preview puts its blocks where the final render does). ≤ 1 dithers every pixel.
   */
  cell: number;
  bright: number;
  contrast: number;
  linear: boolean;
  seed: number;
  /** Ordered-dither strength for palettes (1 = automatic spread from the palette spacing). */
  spread?: number;
}

/* ------------------------------------------------------------------ kernels */

/** [dx, dy, weight] taps and divisor of each error-diffusion method. */
export const KERNELS: Record<string, { taps: Array<[number, number, number]>; div: number }> = {
  floyd: { taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]], div: 16 },
  atkinson: { taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]], div: 8 },
  jarvis: {
    taps: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]],
    div: 48,
  },
  stucki: {
    taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]],
    div: 42,
  },
  burkes: { taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]], div: 32 },
  sierra: {
    taps: [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2], [-1, 2, 2], [0, 2, 3], [1, 2, 2]],
    div: 32,
  },
  sierra2: { taps: [[1, 0, 4], [2, 0, 3], [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1]], div: 16 },
  sierralite: { taps: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]], div: 4 },
};

/* ------------------------------------------------------------------ threshold matrices */

/** n×n Bayer thresholds (M + 0.5) / n², n a power of two. */
export function bayerMatrix(n: number): Float32Array {
  let m = [0], s = 1;
  while (s < n) {
    const next = new Array<number>(4 * s * s);
    for (let y = 0; y < 2 * s; y++) for (let x = 0; x < 2 * s; x++) {
      const q = [[0, 2], [3, 1]][(y / s) | 0][(x / s) | 0];
      next[y * 2 * s + x] = 4 * m[(y % s) * s + (x % s)] + q;
    }
    m = next; s *= 2;
  }
  return Float32Array.from(m, v => (v + 0.5) / (n * n));
}

/**
 * 8×8 clustered-dot thresholds: pixels ranked by the spot function cos u + cos v (one dark and one light
 * cluster per tile, a 45° screen of period 8/√2 px); ties broken by distance to the dot centre, then index.
 */
export function clusterMatrix(): Float32Array {
  const n = 8, idx = Array.from({ length: n * n }, (_, i) => i);
  const spot = (i: number) => {
    const u = ((i % n) + 0.5) / n * Math.PI * 2, v = (((i / n) | 0) + 0.5) / n * Math.PI * 2;
    return Math.cos(u) + Math.cos(v);
  };
  idx.sort((a, b) => spot(b) - spot(a) || a - b);
  const out = new Float32Array(n * n);
  idx.forEach((p, r) => { out[p] = (r + 0.5) / (n * n); });
  return out;
}

const matrices = new Map<string, { m: Float32Array; n: number }>();
function matrixFor(algo: string): { m: Float32Array; n: number } | null {
  let e = matrices.get(algo);
  if (e) return e;
  if (algo.startsWith('bayer')) { const n = Number(algo.slice(5)); e = { m: bayerMatrix(n), n }; }
  else if (algo === 'cluster') e = { m: clusterMatrix(), n: 8 };
  else if (algo === 'bluenoise') e = { m: blueNoise(), n: BLUE_N };
  else return null;
  matrices.set(algo, e);
  return e;
}

/* ------------------------------------------------------------------ gilbert curve */

/** The last two curves (a preview and a final render alternate sizes). */
const curveCache: Array<{ w: number; h: number; path: Int32Array }> = [];

/** Pixel indices of a w×h rectangle in the order of the generalised Hilbert curve (Červený's gilbert2d). */
export function gilbertPath(w: number, h: number): Int32Array {
  const hit = curveCache.find(c => c.w === w && c.h === h);
  if (hit) return hit.path;
  const out = new Int32Array(w * h);
  let n = 0;
  const sgn = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const gen = (x: number, y: number, ax: number, ay: number, bx: number, by: number): void => {
    const W = Math.abs(ax + ay), H = Math.abs(bx + by);
    const dax = sgn(ax), day = sgn(ay), dbx = sgn(bx), dby = sgn(by);
    if (H === 1) { for (let i = 0; i < W; i++) { out[n++] = y * w + x; x += dax; y += day; } return; }
    if (W === 1) { for (let i = 0; i < H; i++) { out[n++] = y * w + x; x += dbx; y += dby; } return; }
    let ax2 = Math.floor(ax / 2), ay2 = Math.floor(ay / 2), bx2 = Math.floor(bx / 2), by2 = Math.floor(by / 2);
    const W2 = Math.abs(ax2 + ay2), H2 = Math.abs(bx2 + by2);
    if (2 * W > 3 * H) {
      if ((W2 & 1) && W > 2) { ax2 += dax; ay2 += day; }
      gen(x, y, ax2, ay2, bx, by);
      gen(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by);
    } else {
      if ((H2 & 1) && H > 2) { bx2 += dbx; by2 += dby; }
      gen(x, y, bx2, by2, ax2, ay2);
      gen(x + bx2, y + by2, ax, ay, bx - bx2, by - by2);
      gen(x + (ax - dax) + (bx2 - dbx), y + (ay - day) + (by2 - dby), -bx2, -by2, -(ax - ax2), -(ay - ay2));
    }
  };
  if (w > 0 && h > 0) { if (w >= h) gen(0, 0, w, 0, 0, h); else gen(0, 0, 0, h, w, 0); }
  curveCache.unshift({ w, h, path: out });
  curveCache.length = Math.min(curveCache.length, 2);
  return out;
}

/* ------------------------------------------------------------------ colour spaces */

const TO_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; TO_LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const SRGB_N = 4096;
const TO_SRGB = new Float32Array(SRGB_N + 1);
for (let i = 0; i <= SRGB_N; i++) { const c = i / SRGB_N; TO_SRGB[i] = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
const linToSrgb = (v: number) => TO_SRGB[v <= 0 ? 0 : v >= 1 ? SRGB_N : (v * SRGB_N + 0.5) | 0];

/* ------------------------------------------------------------------ the core */

interface Prepared {
  C: 1 | 3;
  L: number;
  /** byte → working value (tone curve, then linear light when asked). */
  lut: Float32Array;
  /** Palette entries in working space (3 per colour) and their lookup. */
  pal: Float32Array | null;
  near: Nearest | null;
  spread: number;
}

function prepare(s: DitherSpec): Prepared {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    let v = (i / 255 - 0.5) * s.contrast + 0.5 + s.bright;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    lut[i] = s.linear ? TO_LIN[Math.round(v * 255)] : v;
  }
  if (s.mode === 'paleta') {
    const near = nearestFor(s.colors);
    const pal = new Float32Array(s.colors.length * 3);
    s.colors.forEach((c, i) => {
      for (let k = 0; k < 3; k++) pal[i * 3 + k] = s.linear ? TO_LIN[c[k]] : c[k] / 255;
    });
    const spread = clamp(near.spacing() / 255, 0.08, 1) * (s.spread ?? 1);
    return { C: 3, L: 0, lut, pal, near, spread };
  }
  const L = s.mode === 'bn' ? 2 : clamp(Math.round(s.levels), 2, 256);
  if (s.mode === 'bn' || s.mode === 'tonos') {
    // the value becomes the share of paper whose mix with the ink has the pixel's brightness, so light
    // ink on dark paper (or a grey paper) keeps the picture's tones instead of inverting or flattening them
    const lum = (c: RGB) => { const y = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; return s.linear ? TO_LIN[Math.round(y)] : y / 255; };
    const li = lum(s.ink), lp = lum(s.paper);
    if (Math.abs(lp - li) >= 0.08) for (let i = 0; i < 256; i++) lut[i] = clamp((lut[i] - li) / (lp - li), 0, 1);
  }
  return { C: s.mode === 'rgb' ? 3 : 1, L, lut, pal: null, near: null, spread: 1 };
}

/**
 * Dithers `src` into `out` (same size): out.rgb = the chosen colour, out.a = ink coverage (255 unless the
 * paper is transparent). The caller multiplies by the source alpha.
 */
function ditherCore(src: Img, out: Img, s: DitherSpec, P: Prepared, scratch: Scratch): void {
  const { width: w, height: h } = src;
  const d = src.data, o = out.data;
  const { C, L, lut } = P;
  const n = w * h;
  const Lm = L - 1;

  // per level: output colour and coverage (bn/tonos); output byte (rgb)
  const tone = new Float32Array(Math.max(L, 1) * 4);
  const lv = new Float32Array(Math.max(L, 1)), lvByte = new Float32Array(Math.max(L, 1));
  for (let q = 0; q < L; q++) {
    lv[q] = q / Lm;
    const t = s.linear ? linToSrgb(q / Lm) : q / Lm;
    lvByte[q] = t * 255;
    if (C === 1) {
      const ink = s.ink, paper = s.paper;
      if (s.clear) { tone[q * 4] = ink[0]; tone[q * 4 + 1] = ink[1]; tone[q * 4 + 2] = ink[2]; tone[q * 4 + 3] = 255 * (1 - t); }
      else {
        for (let c = 0; c < 3; c++) tone[q * 4 + c] = ink[c] + (paper[c] - ink[c]) * t;
        tone[q * 4 + 3] = 255;
      }
    }
  }
  const pal = P.pal, near = P.near, colors = s.colors;
  const palByte = new Uint8ClampedArray(colors.length * 3);
  colors.forEach((c, i) => { palByte[i * 3] = c[0]; palByte[i * 3 + 1] = c[1]; palByte[i * 3 + 2] = c[2]; });
  const lin = s.linear;
  const algo = s.algo;
  const kernel = KERNELS[algo];

  if (kernel || algo === 'riemersma') {
    // working values in a buffer padded by 2 columns on each side and 2 rows below: error sent outside
    // the picture lands in the padding and is dropped, with no bounds checks in the loop
    const PW = w + 4;
    const work = scratch.f32('dither.work', PW * (h + 2) * C);
    work.fill(0);
    for (let y = 0; y < h; y++) {
      let wi = (y * PW + 2) * C, si = y * w * 4;
      if (C === 1) for (let x = 0; x < w; x++, si += 4) work[wi++] = lut[Math.round(0.299 * d[si] + 0.587 * d[si + 1] + 0.114 * d[si + 2])];
      else for (let x = 0; x < w; x++, si += 4) { work[wi++] = lut[d[si]]; work[wi++] = lut[d[si + 1]]; work[wi++] = lut[d[si + 2]]; }
    }
    const e = new Float64Array(3);
    /** Quantises the working value at wi (pixel si of the output); leaves the error in e. */
    const quant = (wi: number, oi: number) => {
      if (C === 1) {
        const v = work[wi];
        const q = v <= 0 ? 0 : v >= 1 ? Lm : (v * Lm + 0.5) | 0;
        e[0] = v - lv[q];
        const t = q * 4;
        o[oi] = tone[t]; o[oi + 1] = tone[t + 1]; o[oi + 2] = tone[t + 2]; o[oi + 3] = tone[t + 3];
      } else if (pal) {
        const r = work[wi], g = work[wi + 1], b = work[wi + 2];
        const k = lin ? near!.index(linToSrgb(r) * 255, linToSrgb(g) * 255, linToSrgb(b) * 255) : near!.index(r * 255, g * 255, b * 255);
        const k3 = k * 3;
        e[0] = r - pal[k3]; e[1] = g - pal[k3 + 1]; e[2] = b - pal[k3 + 2];
        o[oi] = palByte[k3]; o[oi + 1] = palByte[k3 + 1]; o[oi + 2] = palByte[k3 + 2]; o[oi + 3] = 255;
      } else {
        for (let c = 0; c < 3; c++) {
          const v = work[wi + c];
          const q = v <= 0 ? 0 : v >= 1 ? Lm : (v * Lm + 0.5) | 0;
          e[c] = v - lv[q];
          o[oi + c] = lvByte[q];
        }
        o[oi + 3] = 255;
      }
    };

    if (kernel) {
      const T = kernel.taps.length;
      const fwd = new Int32Array(T), rev = new Int32Array(T), wts = new Float64Array(T);
      kernel.taps.forEach(([dx, dy, wt], k) => { fwd[k] = (dy * PW + dx) * C; rev[k] = (dy * PW - dx) * C; wts[k] = wt / kernel.div; });
      if (C === 1) {
        // the common case (1 bit, tones), inlined: quantise, write, spread
        for (let y = 0; y < h; y++) {
          const back = s.serpentine && (y & 1) === 1;
          const offs = back ? rev : fwd, step = back ? -1 : 1;
          let x = back ? w - 1 : 0;
          let oi = (y * w + x) * 4, wi = y * PW + x + 2;
          for (let m = 0; m < w; m++, x += step, oi += step * 4, wi += step) {
            if (d[oi + 3] === 0) { o[oi] = 0; o[oi + 1] = 0; o[oi + 2] = 0; o[oi + 3] = 0; continue; }
            const v = work[wi];
            const q = v <= 0 ? 0 : v >= 1 ? Lm : (v * Lm + 0.5) | 0;
            const e0 = v - lv[q], t = q * 4;
            o[oi] = tone[t]; o[oi + 1] = tone[t + 1]; o[oi + 2] = tone[t + 2]; o[oi + 3] = tone[t + 3];
            for (let k = 0; k < T; k++) work[wi + offs[k]] += e0 * wts[k];
          }
        }
        return;
      }
      for (let y = 0; y < h; y++) {
        const back = s.serpentine && (y & 1) === 1;
        const offs = back ? rev : fwd, step = back ? -1 : 1;
        let x = back ? w - 1 : 0;
        for (let m = 0; m < w; m++, x += step) {
          const oi = (y * w + x) * 4;
          if (d[oi + 3] === 0) { o[oi] = 0; o[oi + 1] = 0; o[oi + 2] = 0; o[oi + 3] = 0; continue; }
          const wi = (y * PW + x + 2) * C;
          quant(wi, oi);
          const e0 = e[0], e1 = e[1], e2 = e[2];
          for (let k = 0; k < T; k++) {
            const j = wi + offs[k], wk = wts[k];
            work[j] += e0 * wk; work[j + 1] += e1 * wk; work[j + 2] += e2 * wk;
          }
        }
      }
    } else {
      // Riemersma: the error of the last Q pixels on the curve with weights w0·β^k, k = 0 (newest) … Q−1,
      // falling to 1/R. Kept as a running sum: S' = w0·e + β·(S − w_{Q−1}·e_{−Q}), O(1) per pixel.
      const Q = 16, R = 16;
      const beta = Math.pow(R, -1 / (Q - 1));
      let norm = 0;
      for (let k = 0; k < Q; k++) norm += Math.pow(beta, k);
      const w0 = 1 / norm, wLast = w0 * Math.pow(beta, Q - 1);
      const hist = new Float64Array(Q * 3);
      let head = 0, S0 = 0, S1 = 0, S2 = 0;
      const path = gilbertPath(w, h);
      for (let p = 0; p < n; p++) {
        const i = path[p], oi = i * 4;
        if (d[oi + 3] === 0) { o[oi] = 0; o[oi + 1] = 0; o[oi + 2] = 0; o[oi + 3] = 0; continue; }
        const wi = (((i / w) | 0) * PW + (i % w) + 2) * C;
        work[wi] += S0;
        if (C === 3) { work[wi + 1] += S1; work[wi + 2] += S2; }
        quant(wi, oi);
        // the oldest error leaves the window, the new one enters
        const h3 = head * 3;
        S0 = w0 * e[0] + beta * (S0 - wLast * hist[h3]);
        S1 = w0 * e[1] + beta * (S1 - wLast * hist[h3 + 1]);
        S2 = w0 * e[2] + beta * (S2 - wLast * hist[h3 + 2]);
        hist[h3] = e[0]; hist[h3 + 1] = e[1]; hist[h3 + 2] = e[2];
        head = head + 1 === Q ? 0 : head + 1;
      }
    }
    return;
  }

  // ---- ordered / random / threshold: one threshold per pixel, no state
  const mat = matrixFor(algo);
  const seed = s.seed;
  const mm = mat?.m ?? new Float32Array([0.5]), mn = mat?.n ?? 1, mask = mn - 1;
  const shift = algo === 'bluenoise' ? seed % BLUE_N : 0;
  const random = algo === 'random';
  const spread = P.spread;
  for (let y = 0; y < h; y++) {
    const mrow = ((y + shift) & mask) * mn;
    for (let x = 0; x < w; x++) {
      const oi = (y * w + x) * 4;
      if (d[oi + 3] === 0) { o[oi] = 0; o[oi + 1] = 0; o[oi + 2] = 0; o[oi + 3] = 0; continue; }
      const t = random ? rand3(x, y, seed) : mm[mrow + ((x + (shift >> 1)) & mask)];
      if (C === 1) {
        const v = lut[Math.round(0.299 * d[oi] + 0.587 * d[oi + 1] + 0.114 * d[oi + 2])];
        let q = Math.floor(v * Lm + t); q = q < 0 ? 0 : q > Lm ? Lm : q;
        const k = q * 4;
        o[oi] = tone[k]; o[oi + 1] = tone[k + 1]; o[oi + 2] = tone[k + 2]; o[oi + 3] = tone[k + 3];
      } else if (pal) {
        const off = (t - 0.5) * spread;
        const r = lut[d[oi]] + off, g = lut[d[oi + 1]] + off, b = lut[d[oi + 2]] + off;
        const k = (lin ? near!.index(linToSrgb(r) * 255, linToSrgb(g) * 255, linToSrgb(b) * 255) : near!.index(r * 255, g * 255, b * 255)) * 3;
        o[oi] = palByte[k]; o[oi + 1] = palByte[k + 1]; o[oi + 2] = palByte[k + 2]; o[oi + 3] = 255;
      } else {
        for (let c = 0; c < 3; c++) {
          let q = Math.floor(lut[d[oi + c]] * Lm + t); q = q < 0 ? 0 : q > Lm ? Lm : q;
          o[oi + c] = lvByte[q];
        }
        o[oi + 3] = 255;
      }
    }
  }
}

/** Dithers src into dst (same size), honouring the cell size and the source alpha. */
export function ditherImg(src: Img, dst: Img, s: DitherSpec, scratch: Scratch): void {
  const { width: w, height: h } = src;
  const P = prepare(s);
  const sd = src.data, dd = dst.data;
  const cell = s.cell;
  if (!(cell > 1.0001)) {
    ditherCore(src, dst, s, P, scratch);
    for (let i = 3; i < dd.length; i += 4) dd[i] = (sd[i] * dd[i]) / 255;
    return;
  }
  // cells anchored at the origin: input pixel x belongs to cell ⌊(x + ½) / cell⌋
  const colOf = scratch.i32('dither.col', w), rowOf = scratch.i32('dither.row', h);
  for (let x = 0; x < w; x++) colOf[x] = Math.floor((x + 0.5) / cell);
  for (let y = 0; y < h; y++) rowOf[y] = Math.floor((y + 0.5) / cell);
  const sw = colOf[w - 1] + 1, sh = rowOf[h - 1] + 1;
  const sums = scratch.f32('dither.sums', sw * sh * 5);
  sums.fill(0);
  for (let y = 0; y < h; y++) {
    const r = rowOf[y] * sw;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = sd[i + 3], k = (r + colOf[x]) * 5;
      sums[k] += sd[i] * a; sums[k + 1] += sd[i + 1] * a; sums[k + 2] += sd[i + 2] * a; sums[k + 3] += a; sums[k + 4] += 1;
    }
  }
  const small = makeImg(sw, sh, scratch.u8('dither.small', sw * sh * 4));
  const sm = small.data;
  for (let j = 0; j < sw * sh; j++) {
    const k = j * 5, o = j * 4, a = sums[k + 3];
    if (a > 0) { sm[o] = sums[k] / a; sm[o + 1] = sums[k + 1] / a; sm[o + 2] = sums[k + 2] / a; sm[o + 3] = Math.max(1, a / sums[k + 4]); }
    else { sm[o] = 0; sm[o + 1] = 0; sm[o + 2] = 0; sm[o + 3] = 0; }
  }
  const q = makeImg(sw, sh, scratch.u8('dither.q', sw * sh * 4));
  ditherCore(small, q, s, P, scratch);
  const qd = q.data;
  for (let y = 0; y < h; y++) {
    const r = rowOf[y] * sw;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, j = (r + colOf[x]) * 4;
      dd[i] = qd[j]; dd[i + 1] = qd[j + 1]; dd[i + 2] = qd[j + 2];
      dd[i + 3] = (sd[i + 3] * qd[j + 3]) / 255;
    }
  }
}
