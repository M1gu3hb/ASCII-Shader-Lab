/**
 * Dense optical flow on luma (pure, CPU): pyramidal Lucas–Kanade with a box window, the fallback of the WebGL2
 * version (flow-gl.ts, same maths) and what the unit tests check.
 *
 * Convention: flow(a, b) returns f with a(x) ≈ b(x + f(x)) — for every pixel of `a`, where it is in `b`. So a
 * picture of frame b is brought onto frame a by sampling b at x + f(x) (warp()). To carry a mask from frame j−1
 * to frame j: warp(mask[j−1], flow(luma[j], luma[j−1])).
 *
 * Per pyramid level, coarse to fine: the flow of the coarser level (×2) is the start; a few Gauss–Newton steps
 * refine it with the structure tensor of `a` summed over a (2r+1)² window (constant, so it is computed once per
 * level) and the error a(x) − b(x + f); then pixels with too little texture to decide (the smaller eigenvalue of
 * the tensor is low: flat inside of an object) take the confidence-weighted mean of their neighbours, so a flat
 * object moves with its edges instead of standing still.
 */

export interface Luma {
  w: number;
  h: number;
  /** Row-major, 0..1. */
  data: Float32Array;
}

export interface FlowField {
  w: number;
  h: number;
  /** Interleaved dx, dy per pixel. */
  data: Float32Array;
}

export interface FlowOptions {
  /** Window radius (7×7 by default). */
  radius?: number;
  /** Pyramid levels (clamped so the coarsest side stays ≥ 12 px). */
  levels?: number;
  /** Gauss–Newton steps per level. */
  iterations?: number;
}

/** Luma of RGBA bytes (Rec. 709), 0..1. */
export function lumaOf(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Luma {
  const data = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) data[i] = (0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2]) / 255;
  return { w, h, data };
}

/** Bilinear sample with clamped edges. */
export function sample(src: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
  if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
  const x0 = x | 0, y0 = y | 0;
  const x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
  const fx = x - x0, fy = y - y0;
  const a = src[y0 * w + x0], b = src[y0 * w + x1], c = src[y1 * w + x0], d = src[y1 * w + x1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** Half size with a 2×2 box (after the 1-2-1 blur that keeps it from aliasing). */
export function downsample(l: Luma): Luma {
  const w = Math.max(1, l.w >> 1), h = Math.max(1, l.h >> 1);
  const blurred = blur121(l);
  const out = new Float32Array(w * h);
  const W = l.w;
  for (let y = 0; y < h; y++) {
    const y0 = Math.min(l.h - 1, y * 2), y1 = Math.min(l.h - 1, y * 2 + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.min(l.w - 1, x * 2), x1 = Math.min(l.w - 1, x * 2 + 1);
      out[y * w + x] = 0.25 * (blurred[y0 * W + x0] + blurred[y0 * W + x1] + blurred[y1 * W + x0] + blurred[y1 * W + x1]);
    }
  }
  return { w, h, data: out };
}

function blur121(l: Luma): Float32Array {
  const { w, h, data } = l;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      const a = data[r + (x > 0 ? x - 1 : x)], c = data[r + (x < w - 1 ? x + 1 : x)];
      tmp[r + x] = 0.25 * a + 0.5 * data[r + x] + 0.25 * c;
    }
  }
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : y) * w, dn = (y < h - 1 ? y + 1 : y) * w, r = y * w;
    for (let x = 0; x < w; x++) out[r + x] = 0.25 * tmp[up + x] + 0.5 * tmp[r + x] + 0.25 * tmp[dn + x];
  }
  return out;
}

/** Sum over a (2r+1)² box around each pixel (edges clamped), O(n) with running sums. */
export function boxSum(src: Float32Array, w: number, h: number, r: number, into?: Float32Array): Float32Array {
  const out: Float32Array = into ?? new Float32Array(w * h);
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s;
      s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

function pyramid(l: Luma, levels: number): Luma[] {
  const out = [l];
  while (out.length < levels) {
    const last = out[out.length - 1];
    if (Math.min(last.w, last.h) < 24) break;
    out.push(downsample(last));
  }
  return out;
}

/** The flow of a coarser level brought to a size twice as big (vectors doubled). */
export function upsampleFlow(f: FlowField, w: number, h: number): FlowField {
  const out = new Float32Array(w * h * 2);
  const sx = f.w / w, sy = f.h / h;
  const dx = new Float32Array(f.w * f.h), dy = new Float32Array(f.w * f.h);
  for (let i = 0; i < dx.length; i++) { dx[i] = f.data[i * 2]; dy[i] = f.data[i * 2 + 1]; }
  const kx = w / f.w, ky = h / f.h;
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) * sy - 0.5;
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) * sx - 0.5;
      const o = (y * w + x) * 2;
      out[o] = sample(dx, f.w, f.h, fx, fy) * kx;
      out[o + 1] = sample(dy, f.w, f.h, fx, fy) * ky;
    }
  }
  return { w, h, data: out };
}

/** Confidence below which a pixel's own estimate gives way to its neighbours' (smaller tensor eigenvalue per window pixel). */
const MIN_EIG = 2e-5;

/** One pyramid level: refines `f` in place. */
function refineLevel(a: Luma, b: Luma, f: FlowField, r: number, iterations: number) {
  const { w, h } = a;
  const n = w * h;
  const A = a.data, B = b.data;
  // gradients of a (central differences)
  const ix = new Float32Array(n), iy = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      ix[i] = 0.5 * (A[y * w + Math.min(w - 1, x + 1)] - A[y * w + Math.max(0, x - 1)]);
      iy[i] = 0.5 * (A[Math.min(h - 1, y + 1) * w + x] - A[Math.max(0, y - 1) * w + x]);
    }
  }
  const t = new Float32Array(n);
  for (let i = 0; i < n; i++) t[i] = ix[i] * ix[i];
  const gxx = boxSum(t, w, h, r);
  for (let i = 0; i < n; i++) t[i] = ix[i] * iy[i];
  const gxy = boxSum(t, w, h, r);
  for (let i = 0; i < n; i++) t[i] = iy[i] * iy[i];
  const gyy = boxSum(t, w, h, r);
  const area = (2 * r + 1) * (2 * r + 1);
  const lambda = 1e-6 * area;
  // confidence: the smaller eigenvalue of the tensor, per window pixel
  const conf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const tr = gxx[i] + gyy[i], det = gxx[i] * gyy[i] - gxy[i] * gxy[i];
    const disc = Math.sqrt(Math.max(0, tr * tr * 0.25 - det));
    conf[i] = Math.max(0, tr * 0.5 - disc) / area;
  }
  const ex = new Float32Array(n), ey = new Float32Array(n);
  const wx = new Float32Array(n), wy = new Float32Array(n);
  const D = f.data;
  for (let it = 0; it < iterations; it++) {
    // gradient of b where each pixel looks now, averaged with a's (symmetric: steadier than either alone)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const px = x + D[i * 2], py = y + D[i * 2 + 1];
        const e = sample(B, w, h, px, py) - A[i];
        const gx = 0.5 * (ix[i] + 0.5 * (sample(B, w, h, px + 1, py) - sample(B, w, h, px - 1, py)));
        const gy = 0.5 * (iy[i] + 0.5 * (sample(B, w, h, px, py + 1) - sample(B, w, h, px, py - 1)));
        wx[i] = gx; wy[i] = gy;
        ex[i] = gx * e;
        ey[i] = gy * e;
      }
    }
    for (let i = 0; i < n; i++) t[i] = wx[i] * wx[i];
    boxSum(t, w, h, r, gxx);
    for (let i = 0; i < n; i++) t[i] = wx[i] * wy[i];
    boxSum(t, w, h, r, gxy);
    for (let i = 0; i < n; i++) t[i] = wy[i] * wy[i];
    boxSum(t, w, h, r, gyy);
    const bx = boxSum(ex, w, h, r), by = boxSum(ey, w, h, r);
    for (let i = 0; i < n; i++) {
      const g11 = gxx[i] + lambda, g22 = gyy[i] + lambda, g12 = gxy[i];
      const det = g11 * g22 - g12 * g12;
      if (!(det > 1e-12)) continue;
      // Gauss–Newton step: G·Δ = −Σ∇a·e
      let ux = -(g22 * bx[i] - g12 * by[i]) / det, uy = -(g11 * by[i] - g12 * bx[i]) / det;
      // one step never moves more than a few px (keeps flat, noisy windows from jumping)
      const m = Math.hypot(ux, uy);
      if (m > 2) { ux *= 2 / m; uy *= 2 / m; }
      D[i * 2] += ux;
      D[i * 2 + 1] += uy;
    }
    // every pixel's window used its neighbours' own positions: a small average keeps them from drifting apart
    smoothFlow(f, 1);
  }
  fillWeak(f, conf, r);
}

/** Box average of the flow over a (2r+1)² window (in place). */
function smoothFlow(f: FlowField, r: number) {
  const { w, h, data } = f;
  const n = w * h;
  const vx = new Float32Array(n), vy = new Float32Array(n);
  for (let i = 0; i < n; i++) { vx[i] = data[i * 2]; vy[i] = data[i * 2 + 1]; }
  const sx = boxSum(vx, w, h, r), sy = boxSum(vy, w, h, r);
  const k = 1 / ((2 * r + 1) * (2 * r + 1));
  for (let i = 0; i < n; i++) { data[i * 2] = sx[i] * k; data[i * 2 + 1] = sy[i] * k; }
}

/**
 * Pixels whose window has too little texture take the confidence-weighted mean flow around them (a wide
 * normalised box filter); confident pixels keep their own estimate.
 */
function fillWeak(f: FlowField, conf: Float32Array, r: number) {
  const { w, h, data } = f;
  const n = w * h;
  const wgt = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = conf[i] > MIN_EIG ? conf[i] : 0;
    wgt[i] = c; vx[i] = c * data[i * 2]; vy[i] = c * data[i * 2 + 1];
  }
  let R = Math.max(2, r * 3);
  const sw = boxSum(wgt, w, h, R), sx = boxSum(vx, w, h, R), sy = boxSum(vy, w, h, R);
  // a second, wider pass for large flat areas
  R = Math.max(R * 4, Math.round(Math.min(w, h) / 4));
  const sw2 = boxSum(wgt, w, h, R), sx2 = boxSum(vx, w, h, R), sy2 = boxSum(vy, w, h, R);
  for (let i = 0; i < n; i++) {
    if (conf[i] > MIN_EIG) continue;
    if (sw[i] > 0) { data[i * 2] = sx[i] / sw[i]; data[i * 2 + 1] = sy[i] / sw[i]; }
    else if (sw2[i] > 0) { data[i * 2] = sx2[i] / sw2[i]; data[i * 2 + 1] = sy2[i] / sw2[i]; }
  }
}

/** Dense flow from a to b (see the top of this file). a and b have the same size. */
export function flow(a: Luma, b: Luma, o: FlowOptions = {}): FlowField {
  if (a.w !== b.w || a.h !== b.h) throw new Error('flow: sizes differ');
  const r = Math.max(1, o.radius ?? 3);
  const levels = Math.max(1, Math.min(6, o.levels ?? 4));
  const iterations = Math.max(1, o.iterations ?? 5);
  const pa = pyramid(a, levels), pb = pyramid(b, pa.length);
  let f: FlowField = { w: pa[pa.length - 1].w, h: pa[pa.length - 1].h, data: new Float32Array(pa[pa.length - 1].w * pa[pa.length - 1].h * 2) };
  for (let l = pa.length - 1; l >= 0; l--) {
    if (f.w !== pa[l].w || f.h !== pa[l].h) f = upsampleFlow(f, pa[l].w, pa[l].h);
    refineLevel(pa[l], pb[l], f, r, iterations);
  }
  return f;
}

/** Samples `src` (same size as the flow) at x + f(x): the picture of the other frame brought onto this one. */
export function warp(src: Float32Array, f: FlowField): Float32Array {
  const { w, h, data } = f;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      out[i] = sample(src, w, h, x + data[i * 2], y + data[i * 2 + 1]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ object motion */

/** x' = a·x + b·y + c, y' = d·x + e·y + f (pixel coordinates of pixel centres). */
export type Affine = [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 0, 1, 0];

/** Solves the 3×3 system M·p = v (Cramer); null when singular. */
function solve3(m: number[], v: number[]): [number, number, number] | null {
  const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  if (Math.abs(det) < 1e-9) return null;
  const d = (a: number[]) => a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const rep = (k: number) => m.map((x, i) => (i % 3 === k ? v[(i / 3) | 0] : x));
  return [d(rep(0)) / det, d(rep(1)) / det, d(rep(2)) / det];
}

/**
 * The motion of an object as one affine map, fitted to the flow vectors of `inside` pixels (weights 0..1) with
 * iteratively reweighted least squares (Tukey-like: vectors far from the fit count less), so pixels on the
 * edge whose windows also saw the background, and the odd wrong vector, do not pull it. Falls back to the median
 * translation when there are too few pixels or the fit is ill-conditioned.
 */
export function fitAffine(f: FlowField, inside: ArrayLike<number>, o: { rounds?: number } = {}): Affine {
  const { w, h, data } = f;
  const idx: number[] = [];
  for (let i = 0; i < w * h; i++) if (inside[i] > 0) idx.push(i);
  if (!idx.length) return [...IDENTITY];
  const med = medianFlow(f, i => inside[i] > 0);
  let A: Affine = [1, 0, med.dx, 0, 1, med.dy];
  if (idx.length < 12) return A;
  let scale = 2;
  for (let round = 0; round < (o.rounds ?? 5); round++) {
    const M = new Array(9).fill(0), vx = [0, 0, 0], vy = [0, 0, 0];
    const res: number[] = [];
    for (const i of idx) {
      const x = (i % w) + 0.5, y = ((i / w) | 0) + 0.5;
      const tx = x + data[i * 2], ty = y + data[i * 2 + 1];
      const px = A[0] * x + A[1] * y + A[2], py = A[3] * x + A[4] * y + A[5];
      const r = Math.hypot(tx - px, ty - py);
      res.push(r);
      const u = r / (scale * 3);
      const wgt = inside[i] * (u < 1 ? (1 - u * u) ** 2 : 0);
      if (wgt <= 0) continue;
      M[0] += wgt * x * x; M[1] += wgt * x * y; M[2] += wgt * x;
      M[4] += wgt * y * y; M[5] += wgt * y; M[8] += wgt;
      vx[0] += wgt * x * tx; vx[1] += wgt * y * tx; vx[2] += wgt * tx;
      vy[0] += wgt * x * ty; vy[1] += wgt * y * ty; vy[2] += wgt * ty;
    }
    M[3] = M[1]; M[6] = M[2]; M[7] = M[5];
    const px = solve3(M, vx), py = solve3(M, vy);
    if (!px || !py) break;
    A = [px[0], px[1], px[2], py[0], py[1], py[2]];
    res.sort((a, b) => a - b);
    scale = Math.max(0.5, 1.4826 * res[res.length >> 1]);
  }
  // an object's motion between two frames: no mirror, no collapse, no huge zoom
  const det = A[0] * A[4] - A[1] * A[3];
  if (!(det > 0.5 && det < 2)) return [1, 0, med.dx, 0, 1, med.dy];
  return A;
}

/** Inverse of an affine map (identity when singular). */
export function invertAffine(A: Affine): Affine {
  const det = A[0] * A[4] - A[1] * A[3];
  if (Math.abs(det) < 1e-9) return [...IDENTITY];
  const a = A[4] / det, b = -A[1] / det, d = -A[3] / det, e = A[0] / det;
  return [a, b, -(a * A[2] + b * A[5]), d, e, -(d * A[2] + e * A[5])];
}

/** A picture moved by an affine map: out(y) = src(A⁻¹·y) (bilinear, outside = 0). */
export function warpAffine(src: ArrayLike<number>, w: number, h: number, A: Affine): Float32Array {
  const inv = invertAffine(A);
  const out = new Float32Array(w * h);
  const s = src as Float32Array;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      const sx = inv[0] * cx + inv[1] * cy + inv[2] - 0.5, sy = inv[3] * cx + inv[4] * cy + inv[5] - 0.5;
      if (sx < -1 || sy < -1 || sx > w || sy > h) continue;
      out[y * w + x] = sample(s, w, h, sx, sy) * (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1 ? 0.5 : 1);
    }
  }
  return out;
}

/** Erosion of a mask by r px (box): the pixels whose flow comes from the object alone. */
export function erode(mask: ArrayLike<number>, w: number, h: number, r: number): Float32Array {
  const bin = new Float32Array(w * h);
  for (let i = 0; i < bin.length; i++) bin[i] = mask[i] >= 0.5 ? 1 : 0;
  const s = boxSum(bin, w, h, r);
  const full = (2 * r + 1) * (2 * r + 1) - 0.5;
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = s[i] >= full ? 1 : 0;
  return out;
}

/**
 * A mask of frame A carried to frame B: `fwd` = flow(A, B) (where each pixel of A went). The object's affine
 * motion is fitted inside the mask (eroded so edge windows that also saw the background are left out) and the
 * whole mask moves with it: the outline keeps its shape, which a per-pixel warp at a motion boundary does not.
 * Shape changes are the keyframes' job (a model decode there, SDF blends in between).
 */
export function carryMask(mask: ArrayLike<number>, fwd: FlowField, radius = 3): { mask: Float32Array; motion: Affine } {
  const { w, h } = fwd;
  let inner = erode(mask, w, h, Math.max(1, radius));
  let any = false;
  for (let i = 0; i < inner.length; i++) if (inner[i]) { any = true; break; }
  if (!any) inner = Float32Array.from(mask as ArrayLike<number>, v => (v >= 0.5 ? 1 : 0));
  const motion = fitAffine(fwd, inner);
  return { mask: warpAffine(mask, w, h, motion), motion };
}

/** Median of the flow vectors (a robust «how much did everything move» for tests and diagnostics). */
export function medianFlow(f: FlowField, where?: (i: number) => boolean): { dx: number; dy: number } {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < f.w * f.h; i++) {
    if (where && !where(i)) continue;
    xs.push(f.data[i * 2]); ys.push(f.data[i * 2 + 1]);
  }
  const med = (v: number[]) => { if (!v.length) return 0; v.sort((p, q) => p - q); return v[v.length >> 1]; };
  return { dx: med(xs), dy: med(ys) };
}
