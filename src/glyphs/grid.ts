/**
 * From a picture to a grid of characters.
 *
 * Sampling: the picture is reduced with high-quality smoothing (halving steps, then one smoothed draw) to a
 * fine grid of SUB_X × SUB_Y samples per cell. The cell's colour is the area average of its samples
 * (weighted by alpha, so a cut-out's transparent pixels do not darken its edge); the samples themselves feed
 * the modes that read the shape inside a cell (braille dots, block shapes) and the position of an edge.
 *
 * Tone: saturation around the luma, then brightness/contrast/gamma per channel (the same curve as the engine:
 * l = ((v − 0.5)·contrast + 0.5 + bright)^gamma), then luma (Rec. 709) → brightness `lum`. Invert flips which
 * end of the ramp is «full». Cells whose (inverted) brightness is under `cutoff` stay empty.
 */
import type { GlyphStyle } from '../project/types';
import type { GlyphGrid, Source2D } from './index';
import { ARROWS_1, ARROWS_2, QUADRANTS } from './charsets';
import type { Ramp } from './ramp';

export const SUB_X = 2, SUB_Y = 4;
const SUBS = SUB_X * SUB_Y;

/** RGBA samples, SUB_X × SUB_Y per cell, row-major (w = cols·SUB_X, h = rows·SUB_Y). */
export interface FineSample { data: Uint8ClampedArray | Uint8Array; w: number; h: number }

export interface GridDims { cols: number; rows: number; cw: number; ch: number; w: number; h: number }

/** Cell size and count of a style over an output of w × h px (the contract's formula: partial cells round up). */
export function gridDims(style: Pick<GlyphStyle, 'cell' | 'aspect'>, out: { w: number; h: number }): GridDims {
  const cell = Number.isFinite(style.cell) ? style.cell : 10, aspect = Number.isFinite(style.aspect) && style.aspect > 0 ? style.aspect : 2;
  const cw = Math.max(2, cell), ch = Math.max(2, cell * aspect);
  const w = Math.max(1, out.w), h = Math.max(1, out.h);
  return { cw, ch, cols: Math.max(1, Math.ceil(w / cw)), rows: Math.max(1, Math.ceil(h / ch)), w, h };
}

/* ------------------------------------------------------------------ sampling (browser) */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
interface Pooled { cv: HTMLCanvasElement | OffscreenCanvas; x: Ctx2D }
const pool = new Map<string, Pooled>();

function pooled(name: string, w: number, h: number, read = false): Pooled {
  let p = pool.get(name);
  if (!p) {
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1);
    // only the canvas read back asks for CPU memory; the reduction steps stay where the browser draws fastest
    const x = cv.getContext('2d', read ? { willReadFrequently: true } : undefined) as Ctx2D | null;
    if (!x) throw new Error('Canvas 2D no disponible');
    p = { cv, x };
    pool.set(name, p);
  }
  if (p.cv.width !== w || p.cv.height !== h) { p.cv.width = w; p.cv.height = h; }
  return p;
}

/** Frees the sampling canvases (a studio leaving the photo editor). */
export function releaseSampling() {
  for (const p of pool.values()) { p.cv.width = 1; p.cv.height = 1; }
  pool.clear();
}

function sizeOf(src: Source2D): { w: number; h: number } {
  const s = src as { naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number; width: number; height: number };
  const w = s.naturalWidth || s.videoWidth || s.width || 0;
  const h = s.naturalHeight || s.videoHeight || s.height || 0;
  return { w, h };
}

/**
 * Pictures that cannot change (decoded bitmaps, loaded images) keep their last fine sample; so does any
 * picture sampled with a `version` (the caller promises the same version means the same pixels: a still
 * layer re-framed only when its framing changes, a video frame at the same time…).
 */
const still = new WeakMap<object, { key: string; fine: FineSample }>();
function stillKey(src: Source2D, d: GridDims, version?: string): string | null {
  const dims = `${d.cols}x${d.rows}|${d.cw}x${d.ch}|${d.w}x${d.h}`;
  if (version !== undefined) return dims + '|v:' + version;
  if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) return dims;
  if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) return src.complete ? dims + '|' + src.currentSrc : null;
  return null;
}

/**
 * The fine sample of a picture for a grid. The picture covers the output (out.w × out.h) from 0,0; cells
 * past its right or bottom edge (the last partial column/row) sample transparency there.
 *
 * Reduction: bilinear steps of at most 2:1 down to twice the target, then one exact 2:1 step (a 2×2 box):
 * every source pixel counts (an area average, no aliasing of fine lines), and every browser computes the
 * same thing (unlike imageSmoothingQuality 'high', whose filter each engine picks). It reads the whole
 * picture once: the costly part of a grid (lab: ~20–50 ms for 1080×1350 on a software canvas), so a picture
 * that did not change is not sampled again (see `version`).
 */
export function sampleFine(src: Source2D, d: GridDims, version?: string): FineSample {
  const fw = d.cols * SUB_X, fh = d.rows * SUB_Y;
  const sk = stillKey(src, d, version);
  if (sk) { const hit = still.get(src); if (hit && hit.key === sk) return hit.fine; }
  const dst = pooled('fine', fw, fh, true);
  dst.x.clearRect(0, 0, fw, fh);
  const { w: sw, h: sh } = sizeOf(src);
  if (sw > 0 && sh > 0) {
    // target size of the whole picture in fine samples
    const tw = (d.w / d.cw) * SUB_X, th = (d.h / d.ch) * SUB_Y;
    let cur: CanvasImageSource = src as CanvasImageSource, w = sw, h = sh, flip = 0;
    const w2 = Math.ceil(tw * 2), h2 = Math.ceil(th * 2);
    for (;;) {
      const nw = w > w2 ? Math.max(w2, Math.ceil(w / 2)) : w;
      const nh = h > h2 ? Math.max(h2, Math.ceil(h / 2)) : h;
      if (nw === w && nh === h) break;
      const p = pooled(flip ? 'half1' : 'half0', nw, nh);
      p.x.clearRect(0, 0, nw, nh);
      p.x.imageSmoothingEnabled = true;
      p.x.imageSmoothingQuality = 'low';
      p.x.drawImage(cur, 0, 0, w, h, 0, 0, nw, nh);
      cur = p.cv as CanvasImageSource; w = nw; h = nh; flip ^= 1;
    }
    dst.x.imageSmoothingEnabled = true;
    // at most 2:1 left: bilinear is exact there; an enlargement gets the smoother filter
    dst.x.imageSmoothingQuality = w < tw || h < th ? 'high' : 'low';
    dst.x.drawImage(cur, 0, 0, w, h, 0, 0, tw, th);
  }
  const fine = { data: dst.x.getImageData(0, 0, fw, fh).data, w: fw, h: fh };
  if (sk) still.set(src, { key: sk, fine });
  return fine;
}

/* ------------------------------------------------------------------ grid (pure) */

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Cells brighter than this take part in «words» (besides the cutoff): pure black stays empty. */
export const WORDS_FLOOR = 0.06;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Tone curve per 8-bit channel value (index 0..255 → 0..1). */
function toneTable(style: GlyphStyle): Float32Array {
  const t = new Float32Array(256);
  const contrast = Number.isFinite(style.contrast) ? style.contrast : 1;
  const bright = Number.isFinite(style.bright) ? style.bright : 0;
  const gamma = Number.isFinite(style.gamma) && style.gamma > 0 ? style.gamma : 1;
  for (let i = 0; i < 256; i++) t[i] = Math.pow(clamp01((i / 255 - 0.5) * contrast + 0.5 + bright), gamma);
  return t;
}

/**
 * The grid of a style from a fine sample. Pure (no canvas): unit tests feed synthetic samples.
 */
export function gridFromFine(fine: FineSample, style: GlyphStyle, d: GridDims, ramp: Ramp): GlyphGrid {
  const { cols, rows, cw, ch } = d;
  const n = cols * rows;
  const data = fine.data, FW = fine.w;
  const chars: string[] = new Array(n);
  const rgb = new Uint8ClampedArray(n * 3);
  const lum = new Float32Array(n);
  const alpha = new Float32Array(n);
  const v = new Float32Array(n);      // brightness after invert: what the ramp reads (0 = empty end)
  const vis = new Float32Array(n);    // 0..1 how much of the cell the picture covers (cut-outs)

  const T = toneTable(style);
  const sat = Number.isFinite(style.sat) ? style.sat : 1;
  const inv = !!style.invert;
  const cutoff = clamp01(Number.isFinite(style.cutoff) ? style.cutoff : 0);
  const mode = ramp.words ? 'words' : ramp.mode;
  const needSubs = mode === 'braille' || mode === 'blocks' || (style.edge > 0 && (mode === 'ramp' || mode === 'arrows'));

  // per sample: toned value after invert, times alpha (0 = no ink) and toned colour
  const sv = needSubs ? new Float32Array(n * SUBS) : null;
  const sc = mode === 'braille' || mode === 'blocks' ? new Uint8ClampedArray(n * SUBS * 3) : null;

  const tone3 = (r: number, g: number, b: number, o: number[]) => {
    if (sat !== 1) {
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = L + (r - L) * sat; g = L + (g - L) * sat; b = L + (b - L) * sat;
      r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
    }
    o[0] = T[Math.round(r)]; o[1] = T[Math.round(g)]; o[2] = T[Math.round(b)];
  };
  const tc = [0, 0, 0];
  // mean brightness of the picture before tone (after invert): the threshold of the two-level modes
  let meanV = 0, meanW = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      let sa = 0, sr = 0, sg = 0, sb = 0;
      for (let y = 0; y < SUB_Y; y++) {
        let p = ((row * SUB_Y + y) * FW + col * SUB_X) * 4;
        for (let x = 0; x < SUB_X; x++, p += 4) {
          const a = data[p + 3];
          sa += a; sr += data[p] * a; sg += data[p + 1] * a; sb += data[p + 2] * a;
          if (sv) {
            const k = i * SUBS + y * SUB_X + x;
            if (a > 0) {
              tone3(data[p], data[p + 1], data[p + 2], tc);
              const l = 0.2126 * tc[0] + 0.7152 * tc[1] + 0.0722 * tc[2];
              sv[k] = (inv ? 1 - l : l) * (a / 255);
              if (sc) { sc[k * 3] = tc[0] * 255; sc[k * 3 + 1] = tc[1] * 255; sc[k * 3 + 2] = tc[2] * 255; }
            } else sv[k] = 0;
          }
        }
      }
      const A = sa / (SUBS * 255);
      if (sa > 0) {
        const l0 = (0.2126 * sr + 0.7152 * sg + 0.0722 * sb) / (sa * 255);
        meanV += (inv ? 1 - l0 : l0) * A; meanW += A;
      }
      if (sa > 0) tone3(sr / sa, sg / sa, sb / sa, tc); else { tc[0] = tc[1] = tc[2] = 0; }
      const l = 0.2126 * tc[0] + 0.7152 * tc[1] + 0.0722 * tc[2];
      rgb[i * 3] = tc[0] * 255; rgb[i * 3 + 1] = tc[1] * 255; rgb[i * 3 + 2] = tc[2] * 255;
      lum[i] = l;
      v[i] = inv ? 1 - l : l;
      // a cell mostly outside the picture (a cut-out's background) is empty; its soft edge fades
      vis[i] = clamp01((A - 0.15) / 0.55);
    }
  }

  // gradient of the ink field (v × coverage) on the cell grid: Sobel, clamped at the borders
  let gx: Float32Array | null = null, gy: Float32Array | null = null, ink: Float32Array | null = null;
  const needGrad = style.edge > 0 || mode === 'arrows';
  if (needGrad) {
    ink = new Float32Array(n);
    for (let i = 0; i < n; i++) ink[i] = v[i] * vis[i];
    [gx, gy] = sobel(ink, cols, rows);
  }

  if (mode === 'words') {
    for (let i = 0; i < n; i++) chars[i] = ' ';
    const on = new Uint8Array(n);
    const floor = Math.max(cutoff, WORDS_FLOOR);
    for (let i = 0; i < n; i++) on[i] = vis[i] > 0 && v[i] >= floor ? 1 : 0;
    flowWords(ramp.words!, on, cols, rows, chars, wordWrapOf(style));
    const mono = style.color === 'mono';
    for (let i = 0; i < n; i++) alpha[i] = chars[i] === ' ' ? 0 : vis[i] * (mono ? 0.35 + 0.65 * v[i] : 1);
    return { cols, rows, cw, ch, w: d.w, h: d.h, chars, rgb, lum, alpha };
  }

  const R = ramp.chars, lut = ramp.lut;
  const edgeThr = 0.62 - 0.5 * clamp01(style.edge || 0);
  let blurred: [Float32Array, Float32Array] | null = null;
  // two-level modes: an adaptive cut, at least the picture's own mean (a dark subject still gets its shape)
  // and a little under the mean of the cells around (edges stay visible inside bright areas)
  const auto = ramp.info.auto ? Math.min(0.85, Math.max(0.15, meanW > 0 ? meanV / meanW : 0.5)) : 0.5;
  let thrAt: Float32Array | null = null;
  if (ramp.info.auto) {
    const e = new Float32Array(n);
    for (let i = 0; i < n; i++) e[i] = v[i] * vis[i];
    const local = boxMean(e, cols, rows, 3);
    thrAt = new Float32Array(n);
    for (let i = 0; i < n; i++) thrAt[i] = Math.min(0.92, Math.max(auto, local[i] - 0.08));
  }

  for (let i = 0; i < n; i++) {
    let c = ' ';
    if (vis[i] > 0 && v[i] >= cutoff) {
      if (mode === 'braille') {
        const dither = !!ramp.info.dither;
        const col = i % cols, row = (i / cols) | 0;
        let bits = 0, lit = 0, r = 0, g = 0, b = 0;
        for (let y = 0; y < SUB_Y; y++) for (let x = 0; x < SUB_X; x++) {
          const k = i * SUBS + y * SUB_X + x;
          const thr = dither ? (BAYER4[((row * SUB_Y + y) & 3) * 4 + ((col * SUB_X + x) & 3)] + 0.5) / 16 : thrAt ? thrAt[i] : 0.5;
          if (sv![k] > thr) {
            bits |= 1 << (y < 3 ? x * 3 + y : 6 + x);
            lit++; r += sc![k * 3]; g += sc![k * 3 + 1]; b += sc![k * 3 + 2];
          }
        }
        if (bits) {
          c = String.fromCharCode(0x2800 + bits);
          rgb[i * 3] = r / lit; rgb[i * 3 + 1] = g / lit; rgb[i * 3 + 2] = b / lit;
        }
      } else if (mode === 'blocks') {
        // quadrants: upper left = samples 0,2; upper right 1,3; lower left 4,6; lower right 5,7
        const o = i * SUBS;
        let bits = 0;
        if (ramp.info.dither) {
          // Bayer 4×4 over the grid of quadrants (two per cell in each direction)
          const qx = (i % cols) * 2, qy = ((i / cols) | 0) * 2;
          const th = (dx: number, dy: number) => (BAYER4[((qy + dy) & 3) * 4 + ((qx + dx) & 3)] + 0.5) / 16;
          if (sv![o] + sv![o + 2] > 2 * th(0, 0)) bits |= 1;
          if (sv![o + 1] + sv![o + 3] > 2 * th(1, 0)) bits |= 2;
          if (sv![o + 4] + sv![o + 6] > 2 * th(0, 1)) bits |= 4;
          if (sv![o + 5] + sv![o + 7] > 2 * th(1, 1)) bits |= 8;
        } else {
          const t = thrAt ? thrAt[i] : 0.5;
          if (sv![o] + sv![o + 2] > 2 * t) bits |= 1;
          if (sv![o + 1] + sv![o + 3] > 2 * t) bits |= 2;
          if (sv![o + 4] + sv![o + 6] > 2 * t) bits |= 4;
          if (sv![o + 5] + sv![o + 7] > 2 * t) bits |= 8;
        }
        c = QUADRANTS[bits];
        if (bits) {
          // the colour of the part the block covers (a half-lit cell keeps its bright half's colour)
          let w = 0, r = 0, g = 0, b = 0;
          for (let k = 0; k < SUBS; k++) {
            const qb = k < 4 ? ((k & 1) ? 2 : 1) : ((k & 1) ? 8 : 4);
            if (bits & qb) { const s3 = (o + k) * 3; w++; r += sc![s3]; g += sc![s3 + 1]; b += sc![s3 + 2]; }
          }
          rgb[i * 3] = r / w; rgb[i * 3 + 1] = g / w; rgb[i * 3 + 2] = b / w;
        }
      } else if (mode === 'arrows') {
        const x = v[i];
        if (x >= 0.1) {
          if (x < 0.28) c = '·';
          else {
            let ax = gx![i], ay = gy![i];
            if (ax * ax + ay * ay < 0.0016) {
              blurred ??= blurredGradient(v, vis, cols, rows);
              ax = blurred[0][i]; ay = blurred[1][i];
            }
            if (ax * ax + ay * ay < 1e-6) c = x < 0.6 ? '·' : '•';
            else {
              const ang = Math.atan2(ay / ch, ax / cw);
              const k = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
              c = (x < 0.6 ? ARROWS_1 : ARROWS_2)[k];
            }
          }
        }
      } else {
        c = R[lut[Math.round(clamp01(thrAt ? v[i] + 0.5 - thrAt[i] : v[i]) * 255)]];
      }
      if (style.edge > 0 && (mode === 'ramp' || mode === 'arrows')) {
        const ex = gx![i], ey = gy![i];
        const mag = Math.sqrt(ex * ex + ey * ey) / 4;
        // one cell thick: the stroke goes on the inked side of the edge only
        if (mag > edgeThr && ink![i] >= neighbourMean(ink!, i, cols, rows)) c = edgeGlyph(ex, ey, cw, ch, sv!, i, cols, rows, ramp.edges);
      }
    }
    chars[i] = c;
    alpha[i] = c === ' ' ? 0 : vis[i];
  }
  return { cols, rows, cw, ch, w: d.w, h: d.h, chars, rgb, lum, alpha };
}

/** Mean of the 8 neighbours of a cell (clamped at the borders). */
function neighbourMean(e: Float32Array, i: number, cols: number, rows: number): number {
  const c = i % cols, r = (i / cols) | 0;
  let s = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const y = r + dy < 0 ? 0 : r + dy >= rows ? rows - 1 : r + dy, x = c + dx < 0 ? 0 : c + dx >= cols ? cols - 1 : c + dx;
    s += e[y * cols + x];
  }
  return s / 8;
}

/** Mean of a field over a (2r+1)² window of cells (summed-area table; the window is cut at the borders). */
function boxMean(e: Float32Array, cols: number, rows: number, r: number): Float32Array {
  const W = cols + 1;
  const sat = new Float64Array(W * (rows + 1));
  for (let y = 0; y < rows; y++) {
    let run = 0;
    for (let x = 0; x < cols; x++) { run += e[y * cols + x]; sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + run; }
  }
  const out = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(rows, y + r + 1);
    for (let x = 0; x < cols; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(cols, x + r + 1);
      out[y * cols + x] = (sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0]) / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

function sobel(e: Float32Array, cols: number, rows: number): [Float32Array, Float32Array] {
  const n = cols * rows;
  const gx = new Float32Array(n), gy = new Float32Array(n);
  const at = (c: number, r: number) => e[(r < 0 ? 0 : r >= rows ? rows - 1 : r) * cols + (c < 0 ? 0 : c >= cols ? cols - 1 : c)];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tl = at(c - 1, r - 1), t = at(c, r - 1), tr = at(c + 1, r - 1);
    const l = at(c - 1, r), rr = at(c + 1, r);
    const bl = at(c - 1, r + 1), b = at(c, r + 1), br = at(c + 1, r + 1);
    gx[r * cols + c] = tr + 2 * rr + br - tl - 2 * l - bl;
    gy[r * cols + c] = bl + 2 * b + br - tl - 2 * t - tr;
  }
  return [gx, gy];
}

/** Gradient of a softened field (three 5×5 box blurs): a direction for flat areas of the arrows mode. */
function blurredGradient(v: Float32Array, vis: Float32Array, cols: number, rows: number): [Float32Array, Float32Array] {
  let a: Float32Array = new Float32Array(v.length);
  for (let i = 0; i < a.length; i++) a[i] = v[i] * vis[i];
  for (let pass = 0; pass < 3; pass++) a = boxMean(a, cols, rows, 2);
  return sobel(a, cols, rows);
}

/**
 * Contour glyph of an edge cell from its gradient (y down): the stroke runs across the gradient. A
 * horizontal edge whose sharpest step sits in the lower half of the cell (or at its bottom border) takes the
 * low glyph («_»), read from the fine samples.
 */
function edgeGlyph(gx: number, gy: number, cw: number, ch: number, sv: Float32Array, i: number, cols: number, rows: number, edges: string[]): string {
  let a = Math.atan2(gy / ch, gx / cw);
  if (a < 0) a += Math.PI;
  const k = Math.round(a / (Math.PI / 4)) % 4; // 0 |, 1 /, 2 -, 3 \
  if (k === 2 && edges[4]) {
    const prof: number[] = [];
    for (let y = 0; y < SUB_Y; y++) prof.push((sv[i * SUBS + y * SUB_X] + sv[i * SUBS + y * SUB_X + 1]) / 2);
    const below = i + cols < cols * rows ? (sv[(i + cols) * SUBS] + sv[(i + cols) * SUBS + 1]) / 2 : prof[SUB_Y - 1];
    prof.push(below);
    let bk = 0, bd = -1;
    for (let y = 0; y < SUB_Y; y++) { const dd = Math.abs(prof[y + 1] - prof[y]); if (dd > bd) { bd = dd; bk = y; } }
    if (bk >= 2) return edges[4];
  }
  return edges[k];
}

/* ------------------------------------------------------------------ words */

/** How the user's words wrap inside a run of cells: anywhere ('char') or only between words ('word'). */
export type WordWrap = 'char' | 'word';

/** Extra option read from a style when present (proposed as GlyphStyle.wrap; 'char' otherwise). */
export function wordWrapOf(style: GlyphStyle): WordWrap {
  return (style as GlyphStyle & { wrap?: WordWrap }).wrap === 'word' ? 'word' : 'char';
}

/**
 * The user's text flows through the «on» cells in reading order (left to right, top to bottom), repeating
 * until the figure is full. A space of the text leaves its cell empty (the spacing is kept); a run of cells
 * never starts with a space. With 'word', a word that does not fit in what is left of a run moves to the next
 * run (a word longer than a whole run is split there).
 */
export function flowWords(text: string, on: Uint8Array, cols: number, rows: number, out: string[], wrap: WordWrap = 'char') {
  if (wrap === 'word') {
    const words = text.split(/ +/).filter(Boolean).map(w => Array.from(w));
    if (!words.length) return;
    let t = 0, part = 0;
    for (let r = 0; r < rows; r++) {
      let c = 0;
      while (c < cols) {
        if (!on[r * cols + c]) { c++; continue; }
        let end = c;
        while (end < cols && on[r * cols + end]) end++;
        const L = end - c;
        let o = 0;
        while (o < L) {
          const w = words[t % words.length];
          const rem = w.length - part;
          if (rem <= L - o) {
            for (let k = 0; k < rem; k++) out[r * cols + c + o + k] = w[part + k];
            o += rem; t++; part = 0;
            o++; // the space after the word
          } else if (o === 0) {
            for (let k = 0; k < L; k++) out[r * cols + c + k] = w[part + k];
            part += L; o = L;
          } else break;
        }
        c = end;
      }
    }
    return;
  }
  const s = Array.from(text);
  if (!s.length) return;
  if (s[s.length - 1] !== ' ') s.push(' ');
  const L = s.length;
  let pos = 0;
  for (let r = 0; r < rows; r++) {
    let prev = false;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!on[i]) { prev = false; continue; }
      if (!prev && s[pos % L] === ' ') pos++;
      out[i] = s[pos % L];
      pos++;
      prev = true;
    }
  }
}
