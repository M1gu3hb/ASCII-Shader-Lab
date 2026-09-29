/**
 * Masks: where a layer shows. A Mask (types.ts) becomes an alpha picture at the render size, computed on
 * the CPU in plain arrays, so it is the same in every browser and at every scale (sizes in output px are
 * multiplied by `scale`), and can be tested without a DOM.
 *
 *   parts, in order, each drawn as coverage 0..1 (anti-aliased edges) times its strength (`alpha`):
 *     rect / ellipse  frame units, rotated around their centre (in pixels, so a square stays square),
 *                     `soft` = Gaussian blur of that part only (σ in output px);
 *     polygon         closed, non-zero winding (a lasso that crosses itself stays filled), `soft` as above;
 *     stroke          a brush along the points: diameter `size` × the frame's shorter side × pressure,
 *                     `hardness` = the share of the radius at full strength (the rest fades smoothly);
 *     raster          a stored picture (white = shows, times its own alpha), per-time frames for video
 *                     (nearest earlier frame, or a blend of the two around t with `interp`), `soft` blur;
 *     color           pixels of a source close to a colour: RGB distance (0..1) up to `tol` shows, then a
 *                     ramp of width `soft` to nothing;
 *     gradient        a graded zone: alpha0 → alpha1 along a segment (linear) or out from a centre (radial),
 *                     in pixels (a radial one is round whatever the frame's aspect), shaped by `ease`;
 *   combined in order: add = union (a + c − a·c), subtract = a·(1 − c), intersect = a·c; the first part
 *   starts from nothing when it adds and from everything when it subtracts or intersects; no parts = all;
 *   then `feather` (blur of the whole edge, σ in output px), `invert`, `opacity`.
 */
import type { MediaRef } from '../engine/recipe';
import { easeAt } from './ease';
import type { Mask, MaskColorPart, MaskGradientPart, MaskOp, MaskPart, MaskRasterPart, MaskStrokePart } from './types';

export interface MaskInputs {
  /** Render size in px. */
  w: number;
  h: number;
  /** Render px per output px (soft, feather and blur sizes are output px). */
  scale: number;
  /** Project time (raster frames). */
  t: number;
  /** Coverage 0..255 (w·h) of a stored mask picture at this size, or null when it is not available. */
  raster?: (media: MediaRef) => Uint8ClampedArray | null;
  /** RGBA pixels (w·h·4) of a source placed in the frame at this size, or null. */
  pixels?: (sourceId: string) => Uint8ClampedArray | null;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ------------------------------------------------------------------ blur */

/** Box sizes whose three passes approximate a Gaussian of deviation σ (W. Jarosz / I. Kutskir). */
export function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i < m ? wl : wu);
  return out;
}

function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const iarr = 1 / (r + r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const first = src[row];
    // window [x − r, x + r], indices clamped to the row
    let acc = r * first;
    for (let j = 0; j < r; j++) acc += src[row + Math.min(w - 1, j)];
    for (let x = 0; x < w; x++) {
      const add = src[row + Math.min(w - 1, x + r)];
      acc += add;
      dst[row + x] = acc * iarr;
      acc -= x - r >= 0 ? src[row + x - r] : first;
    }
  }
}

function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const iarr = 1 / (r + r + 1);
  for (let x = 0; x < w; x++) {
    const first = src[x];
    let acc = r * first;
    for (let j = 0; j < r; j++) acc += src[Math.min(h - 1, j) * w + x];
    for (let y = 0; y < h; y++) {
      acc += src[Math.min(h - 1, y + r) * w + x];
      dst[y * w + x] = acc * iarr;
      acc -= y - r >= 0 ? src[(y - r) * w + x] : first;
    }
  }
}

/** Gaussian-like blur (three box passes, edges clamped) of deviation σ px, in place. */
export function blurAlpha(a: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (!(sigma > 0.3) || w < 2 || h < 2) return a;
  const tmp = new Float32Array(a.length);
  for (const size of boxesForGauss(sigma)) {
    const r = Math.max(0, (size - 1) >> 1);
    if (!r) continue;
    boxH(a, tmp, w, h, r);
    boxV(tmp, a, w, h, r);
  }
  return a;
}

/* ------------------------------------------------------------------ shapes */

/** Coverage of a (rotated) rectangle or ellipse, anti-aliased over one pixel. */
function shapeCoverage(part: { kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; rot: number }, W: number, H: number, out: Float32Array) {
  const hw = Math.abs(part.w * W) / 2, hh = Math.abs(part.h * H) / 2;
  if (hw < 1e-3 || hh < 1e-3) return;
  const cx = (part.x + part.w / 2) * W, cy = (part.y + part.h / 2) * H;
  const a = (part.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  // bounding box of the rotated shape (+1 px for the edge)
  const ex = Math.abs(hw * cos) + Math.abs(hh * sin) + 1, ey = Math.abs(hw * sin) + Math.abs(hh * cos) + 1;
  const x0 = Math.max(0, Math.floor(cx - ex)), x1 = Math.min(W - 1, Math.ceil(cx + ex));
  const y0 = Math.max(0, Math.floor(cy - ey)), y1 = Math.min(H - 1, Math.ceil(cy + ey));
  const ellipse = part.kind === 'ellipse';
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      // into the shape's own axes
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
      let d: number;
      if (ellipse) {
        const qx = lx / hw, qy = ly / hh;
        const q = Math.sqrt(qx * qx + qy * qy);
        if (q < 1e-6) d = -Math.min(hw, hh);
        else {
          const gx = lx / (hw * hw), gy = ly / (hh * hh);
          const g = Math.sqrt(gx * gx + gy * gy) / q;
          d = (q - 1) / Math.max(1e-6, g);
        }
      } else {
        d = Math.max(Math.abs(lx) - hw, Math.abs(ly) - hh);
      }
      const c = clamp01(0.5 - d);
      if (c > 0) out[y * W + x] = c;
    }
  }
}

/**
 * Coverage of a closed polygon (frame units), non-zero winding, anti-aliased: four sub-scanlines per row and
 * fractional coverage at the ends of each span.
 */
function polygonCoverage(pts: readonly number[], W: number, H: number, out: Float32Array) {
  const n = pts.length >> 1;
  if (n < 3) return;
  const xs = new Float64Array(n), ys = new Float64Array(n);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    xs[i] = pts[i * 2] * W; ys[i] = pts[i * 2 + 1] * H;
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  const SUB = 4;
  const row = new Float32Array(W);
  const hits: Array<{ x: number; d: number }> = [];
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    row.fill(0);
    let any = false;
    for (let s = 0; s < SUB; s++) {
      const sy = y + (s + 0.5) / SUB;
      hits.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ya = ys[j], yb = ys[i];
        if (ya === yb) continue;
        const up = ya < yb;
        const lo = up ? ya : yb, hi = up ? yb : ya;
        if (sy < lo || sy >= hi) continue;
        const k = (sy - ya) / (yb - ya);
        hits.push({ x: xs[j] + k * (xs[i] - xs[j]), d: up ? 1 : -1 });
      }
      if (hits.length < 2) continue;
      hits.sort((a, b) => a.x - b.x);
      let wind = 0;
      for (let k = 0; k < hits.length - 1; k++) {
        wind += hits[k].d;
        if (wind === 0) continue;
        const a = Math.max(0, hits[k].x), b = Math.min(W, hits[k + 1].x);
        if (b <= a) continue;
        any = true;
        const ia = Math.floor(a), ib = Math.floor(b);
        if (ia === ib) { if (ia < W) row[ia] += (b - a) / SUB; continue; }
        row[ia] += (ia + 1 - a) / SUB;
        for (let x = ia + 1; x < ib; x++) row[x] += 1 / SUB;
        if (ib < W) row[ib] += (b - ib) / SUB;
      }
    }
    if (!any) continue;
    const o = y * W;
    for (let x = 0; x < W; x++) if (row[x] > 0) out[o + x] = Math.min(1, row[x]);
  }
}

/** Coverage of a brush stroke: capsules between points, radius by pressure, soft edge by hardness. */
function strokeCoverage(part: MaskStrokePart, W: number, H: number, out: Float32Array) {
  const n = part.pts.length >> 1;
  if (!n) return;
  const R = (part.size * Math.min(W, H)) / 2;
  const hard = clamp01(part.hardness);
  const px = (i: number) => part.pts[i * 2] * W, py = (i: number) => part.pts[i * 2 + 1] * H;
  const rad = (i: number) => R * (part.pressure ? clamp01(part.pressure[i]) : 1);
  const paint = (ax: number, ay: number, ar: number, bx: number, by: number, br: number) => {
    const rmax = Math.max(ar, br);
    if (rmax < 0.05) return;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rmax - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + rmax + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rmax - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + rmax + 1));
    const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy;
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5;
        let k = len2 > 0 ? ((cx - ax) * vx + (cy - ay) * vy) / len2 : 0;
        k = k < 0 ? 0 : k > 1 ? 1 : k;
        const qx = ax + vx * k - cx, qy = ay + vy * k - cy;
        const d = Math.sqrt(qx * qx + qy * qy);
        const r = ar + (br - ar) * k;
        if (d >= r + 0.5) continue;
        const inner = r * hard;
        let c: number;
        if (d <= inner) c = 1;
        else if (hard >= 0.999 || r - inner < 0.5) c = clamp01(r - d + 0.5);
        else { const f = clamp01((d - inner) / (r - inner)); c = 1 - f * f * (3 - 2 * f); }
        const at = y * W + x;
        if (c > out[at]) out[at] = c;
      }
    }
  };
  if (n === 1) { paint(px(0), py(0), rad(0), px(0), py(0), rad(0)); return; }
  for (let i = 0; i < n - 1; i++) paint(px(i), py(i), rad(i), px(i + 1), py(i + 1), rad(i + 1));
}

/** Pixels of a source close to a colour (RGB distance normalised to 0..1), times the pixel's own alpha. */
function colorCoverage(part: MaskColorPart, rgba: Uint8ClampedArray, W: number, H: number, out: Float32Array) {
  const c = hexRgb(part.color);
  const norm = 1 / (255 * Math.sqrt(3));
  const tol = part.tol, soft = Math.max(1e-4, part.soft);
  const n = Math.min(W * H, rgba.length >> 2);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const dr = rgba[o] - c[0], dg = rgba[o + 1] - c[1], db = rgba[o + 2] - c[2];
    const d = Math.sqrt(dr * dr + dg * dg + db * db) * norm;
    const v = d <= tol ? 1 : clamp01(1 - (d - tol) / soft);
    out[i] = v * (rgba[o + 3] / 255);
  }
}

/**
 * Coverage of a gradient part (before its overall strength): alpha0 → alpha1 along the segment (linear) or out
 * from the centre (radial), measured in pixels, eased through a lookup table (a bézier per pixel would be slow).
 */
function gradientCoverage(part: MaskGradientPart, W: number, H: number, out: Float32Array) {
  const ax = part.x0 * W, ay = part.y0 * H, bx = part.x1 * W, by = part.y1 * H;
  const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy;
  const a0 = clamp01(part.alpha0), a1 = clamp01(part.alpha1);
  const N = 1024;
  const lut = new Float32Array(N + 1);
  const e = part.ease;
  for (let i = 0; i <= N; i++) lut[i] = a0 + (a1 - a0) * (e && e.kind !== 'linear' ? easeAt(e, i / N) : i / N);
  // a gradient with no length is its end strength everywhere (as if the ramp were infinitely steep)
  if (len2 < 1e-9) { out.fill(a1); return; }
  const radial = part.shape === 'radial';
  const inv = radial ? 1 / Math.sqrt(len2) : 1 / len2;
  for (let y = 0; y < H; y++) {
    const dy = y + 0.5 - ay, row = y * W;
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - ax;
      let k = radial ? Math.sqrt(dx * dx + dy * dy) * inv : (dx * vx + dy * vy) * inv;
      k = k < 0 ? 0 : k > 1 ? 1 : k;
      out[row + x] = lut[Math.round(k * N)];
    }
  }
}

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const v = m ? parseInt(m[1], 16) : 0xffffff;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/* ------------------------------------------------------------------ raster frames */

/** The stored picture(s) a raster part shows at t, and how much of the second one (interpolation). */
export function rasterFrames(part: MaskRasterPart, t: number): { a: MediaRef; b: MediaRef | null; k: number } {
  const f = part.frames;
  if (!f || !f.length) return { a: part.media, b: null, k: 0 };
  if (t < f[0].t) return { a: part.media, b: part.interp ? f[0].media : null, k: part.interp && f[0].t > 0 ? clamp01(t / f[0].t) : 0 };
  let i = 0;
  while (i + 1 < f.length && f[i + 1].t <= t) i++;
  const next = f[i + 1];
  if (!part.interp || !next) return { a: f[i].media, b: null, k: 0 };
  const span = next.t - f[i].t;
  return { a: f[i].media, b: next.media, k: span > 0 ? clamp01((t - f[i].t) / span) : 0 };
}

/* ------------------------------------------------------------------ parts and ops */

/** Coverage of one part (before its op), times its strength; null when it cannot be drawn (missing media). */
export function partCoverage(part: MaskPart, inp: MaskInputs): Float32Array | null {
  const { w, h } = inp;
  const out = new Float32Array(w * h);
  switch (part.kind) {
    case 'rect': case 'ellipse': shapeCoverage(part, w, h, out); break;
    case 'polygon': polygonCoverage(part.pts, w, h, out); break;
    case 'stroke': strokeCoverage(part, w, h, out); break;
    case 'raster': {
      const fr = rasterFrames(part, inp.t);
      const a = inp.raster?.(fr.a) ?? null;
      if (!a) return null;
      const b = fr.b && fr.k > 0 ? inp.raster?.(fr.b) ?? null : null;
      const n = Math.min(out.length, a.length);
      if (b) for (let i = 0; i < n; i++) out[i] = ((a[i] * (1 - fr.k) + b[i] * fr.k) / 255);
      else for (let i = 0; i < n; i++) out[i] = a[i] / 255;
      break;
    }
    case 'color': {
      const px = inp.pixels?.(part.source) ?? null;
      if (!px) return null;
      colorCoverage(part, px, w, h, out);
      break;
    }
    case 'gradient': gradientCoverage(part, w, h, out); break;
  }
  if ((part.kind === 'rect' || part.kind === 'ellipse' || part.kind === 'polygon' || part.kind === 'raster') && part.soft > 0) {
    blurAlpha(out, w, h, part.soft * inp.scale);
  }
  const s = clamp01(part.alpha);
  if (s < 1) for (let i = 0; i < out.length; i++) out[i] *= s;
  return out;
}

/** Combines a part's coverage into the mask so far (see the top of this file). */
export function combine(acc: Float32Array, c: Float32Array, op: MaskOp): void {
  const n = Math.min(acc.length, c.length);
  if (op === 'add') for (let i = 0; i < n; i++) { const a = acc[i], b = c[i]; acc[i] = a + b - a * b; }
  else if (op === 'subtract') for (let i = 0; i < n; i++) acc[i] *= 1 - c[i];
  else for (let i = 0; i < n; i++) acc[i] *= c[i];
}

/** The whole mask as coverage 0..1 per pixel (row-major, w·h). */
export function rasterizeMask(mask: Mask, inp: MaskInputs): Float32Array {
  const { w, h } = inp;
  // hidden parts (off) are kept in the list but take no part
  const parts = mask.parts.filter(p => !p.off);
  const first = parts[0];
  const acc = new Float32Array(w * h).fill(!first || first.op !== 'add' ? 1 : 0);
  for (const part of parts) {
    const c = partCoverage(part, inp);
    // a part whose picture is missing counts as empty (an add adds nothing; an intersect leaves nothing)
    combine(acc, c ?? new Float32Array(w * h), part.op);
  }
  if (mask.feather > 0) blurAlpha(acc, w, h, mask.feather * inp.scale);
  const op = clamp01(mask.opacity);
  for (let i = 0; i < acc.length; i++) {
    let v = clamp01(acc[i]);
    if (mask.invert) v = 1 - v;
    acc[i] = v * op;
  }
  return acc;
}

/* ------------------------------------------------------------------ canvas and cache */

/** What a mask depends on besides its JSON: the raster frames and source pixels it reads at t. */
function dynamicKey(mask: Mask, t: number, pixelsKey?: (sourceId: string) => string): string {
  let k = '';
  for (const p of mask.parts) {
    if (p.kind === 'raster' && p.frames?.length) {
      const f = rasterFrames(p, t);
      k += `|${f.a.id ?? '?'}>${f.b?.id ?? ''}@${Math.round(f.k * 64)}`;
    } else if (p.kind === 'color') k += `|${pixelsKey ? pixelsKey(p.source) : p.source}`;
  }
  return k;
}

interface CacheEntry { key: string; canvas: HTMLCanvasElement; coverage: Float32Array }
const cache: CacheEntry[] = [];
const CACHE_MAX = 10;
/**
 * Masks bigger than this (px) are not kept (the compositor's CACHE_MAX_PX): at print sizes each would hold a
 * canvas and a coverage array of ~70 MB, ten of them most of a browser's memory.
 */
const CACHE_MAX_PX = 4_200_000;

export interface MaskCanvasOptions extends MaskInputs {
  /** Identifies the pixels `pixels(sourceId)` returns now (a video's frame time), for the cache. */
  pixelsKey?: (sourceId: string) => string;
}

/**
 * The mask as a canvas of the render size whose alpha is the mask (white, so it can also be shown), for
 * 'destination-in'. Cached by the mask's content, the size, the scale and what it reads at t; the canvas
 * belongs to the cache (do not draw into it).
 */
export function maskCanvas(mask: Mask, o: MaskCanvasOptions): { canvas: HTMLCanvasElement; coverage: Float32Array } {
  const key = `${o.w}x${o.h}@${o.scale}|${JSON.stringify(mask)}${dynamicKey(mask, o.t, o.pixelsKey)}`;
  const i = cache.findIndex(e => e.key === key);
  if (i >= 0) {
    const [e] = cache.splice(i, 1);
    cache.push(e);
    return e;
  }
  const coverage = rasterizeMask(mask, o);
  const canvas = document.createElement('canvas');
  canvas.width = o.w; canvas.height = o.h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(o.w, o.h);
  const d = img.data;
  for (let j = 0; j < coverage.length; j++) {
    const q = j * 4;
    d[q] = d[q + 1] = d[q + 2] = 255;
    d[q + 3] = Math.round(coverage[j] * 255);
  }
  ctx.putImageData(img, 0, 0);
  const e = { key, canvas, coverage };
  if (o.w * o.h > CACHE_MAX_PX) return e;
  cache.push(e);
  while (cache.length > CACHE_MAX) cache.shift();
  return e;
}

/** Forgets cached masks (their canvases go with them). */
export function clearMaskCache(): void {
  cache.length = 0;
}

/**
 * Coverage (0..255, w·h) of a stored mask picture drawn over the whole frame: white shows, times the
 * picture's own alpha. For MaskInputs.raster.
 */
export function coverageOfImage(img: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    const lum = 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
    out[i] = Math.round((lum * d[o + 3]) / 255);
  }
  return out;
}

/** A mask coverage as an opaque greyscale PNG-ready canvas (white shows, black hides): mask exports. */
export function coverageToGrey(coverage: Float32Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const img = x.createImageData(w, h);
  for (let i = 0; i < coverage.length; i++) {
    const v = Math.round(clamp01(coverage[i]) * 255), o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
