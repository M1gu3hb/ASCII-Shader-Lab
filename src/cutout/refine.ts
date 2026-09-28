/**
 * Matte refinement on the CPU: no DOM, no dependencies (runs in the ML worker, on the page and in Node tests).
 *
 *   - guided-filter upsampling (He, Sun & Tang, «Guided Image Filtering»; He & Sun, «Fast Guided Filter»): the
 *     model's low-resolution matte is filtered with the photo as the guide at a working resolution, and the
 *     linear coefficients (a, b) are upsampled and applied to the full-resolution photo, so the matte follows the
 *     photo's own edges (hair strands, fur) instead of the model's 512 px grid;
 *   - blur-fusion foreground colour estimation (Forte & Pitié, «Approximate Fast Foreground Colour Estimation»,
 *     ICIP 2021): the old background's colour is removed from semi-transparent edge pixels (decontamination);
 *   - edge shift (grey erosion/dilation with a disc), feather (Gaussian), brush strokes, colour selection.
 *
 * Mattes are 0..255 per pixel (Uint8ClampedArray); intermediate maths in Float32/Float64.
 */

/* ------------------------------------------------------------------ basics */

export interface Plane { w: number; h: number; data: Float32Array }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Mean over a (2r+1)² window clipped to the image (the window shrinks at the borders, as in the guided filter
 * paper's box filter divided by N). Running sums: O(1) per pixel whatever the radius.
 */
export function boxMean(src: Float32Array, w: number, h: number, r: number, out = new Float32Array(w * h)): Float32Array {
  if (r <= 0) { if (out !== src) out.set(src); return out; }
  const tmp = new Float32Array(w * h);
  // Horizontal.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    const first = Math.min(r, w - 1);
    for (let x = 0; x <= first; x++) sum += src[row + x];
    for (let x = 0; x < w; x++) {
      const lo = x - r < 0 ? 0 : x - r, hi = x + r > w - 1 ? w - 1 : x + r;
      tmp[row + x] = sum / (hi - lo + 1);
      if (x + r + 1 < w) sum += src[row + x + r + 1];
      if (x - r >= 0) sum -= src[row + x - r];
    }
  }
  // Vertical, row-major with one running sum per column.
  const acc = new Float64Array(w);
  const firstRows = Math.min(r, h - 1);
  for (let y = 0; y <= firstRows; y++) { const row = y * w; for (let x = 0; x < w; x++) acc[x] += tmp[row + x]; }
  for (let y = 0; y < h; y++) {
    const lo = y - r < 0 ? 0 : y - r, hi = y + r > h - 1 ? h - 1 : y + r;
    const inv = 1 / (hi - lo + 1), row = y * w;
    for (let x = 0; x < w; x++) out[row + x] = acc[x] * inv;
    if (y + r + 1 < h) { const add = (y + r + 1) * w; for (let x = 0; x < w; x++) acc[x] += tmp[add + x]; }
    if (y - r >= 0) { const sub = (y - r) * w; for (let x = 0; x < w; x++) acc[x] -= tmp[sub + x]; }
  }
  return out;
}

/** Bilinear resize with pixel centres aligned (align_corners = false), edges clamped. */
export function resizeBilinear(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  const out = new Float32Array(dw * dh);
  if (sw === dw && sh === dh) { out.set(src); return out; }
  const sx = sw / dw, sy = sh / dh;
  const x0s = new Int32Array(dw), x1s = new Int32Array(dw), fxs = new Float32Array(dw);
  for (let x = 0; x < dw; x++) {
    let u = (x + 0.5) * sx - 0.5; if (u < 0) u = 0; if (u > sw - 1) u = sw - 1;
    const x0 = Math.floor(u); x0s[x] = x0; x1s[x] = Math.min(x0 + 1, sw - 1); fxs[x] = u - x0;
  }
  for (let y = 0; y < dh; y++) {
    let v = (y + 0.5) * sy - 0.5; if (v < 0) v = 0; if (v > sh - 1) v = sh - 1;
    const y0 = Math.floor(v), y1 = Math.min(y0 + 1, sh - 1), fy = v - y0;
    const r0 = y0 * sw, r1 = y1 * sw, row = y * dw;
    for (let x = 0; x < dw; x++) {
      const a = src[r0 + x0s[x]], b = src[r0 + x1s[x]], c = src[r1 + x0s[x]], d = src[r1 + x1s[x]], fx = fxs[x];
      const top = a + (b - a) * fx, bot = c + (d - c) * fx;
      out[row + x] = top + (bot - top) * fy;
    }
  }
  return out;
}

/** Area-average downsample of RGBA bytes into three 0..1 planes (the guide at the working resolution). */
export function downsampleRGB(rgba: Uint8ClampedArray | Uint8Array, W: number, H: number, dw: number, dh: number): [Float32Array, Float32Array, Float32Array] {
  const R = new Float32Array(dw * dh), G = new Float32Array(dw * dh), B = new Float32Array(dw * dh);
  if (dw === W && dh === H) {
    for (let i = 0, j = 0; i < dw * dh; i++, j += 4) { R[i] = rgba[j] / 255; G[i] = rgba[j + 1] / 255; B[i] = rgba[j + 2] / 255; }
    return [R, G, B];
  }
  const sx = W / dw, sy = H / dh;
  for (let y = 0; y < dh; y++) {
    const ya = Math.floor(y * sy), yb = Math.max(ya + 1, Math.min(H, Math.round((y + 1) * sy)));
    for (let x = 0; x < dw; x++) {
      const xa = Math.floor(x * sx), xb = Math.max(xa + 1, Math.min(W, Math.round((x + 1) * sx)));
      let r = 0, g = 0, b = 0;
      for (let yy = ya; yy < yb; yy++) {
        let j = (yy * W + xa) * 4;
        for (let xx = xa; xx < xb; xx++, j += 4) { r += rgba[j]; g += rgba[j + 1]; b += rgba[j + 2]; }
      }
      const n = 255 * (yb - ya) * (xb - xa), i = y * dw + x;
      R[i] = r / n; G[i] = g / n; B[i] = b / n;
    }
  }
  return [R, G, B];
}

/* ------------------------------------------------------------------ guided filter */

/**
 * Colour guided filter coefficients at one resolution (He et al., Algorithm 2 with a 3×3 covariance).
 * Returns the box-averaged coefficients interleaved per pixel: [a_r, a_g, a_b, b].
 */
export function guidedCoefficients(I: [Float32Array, Float32Array, Float32Array], p: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = w * h;
  const [Ir, Ig, Ib] = I;
  const box = (a: Float32Array) => boxMean(a, w, h, r);
  const mul = (a: Float32Array, b: Float32Array) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = a[i] * b[i]; return o; };
  const mR = box(Ir), mG = box(Ig), mB = box(Ib), mP = box(p);
  const mRp = box(mul(Ir, p)), mGp = box(mul(Ig, p)), mBp = box(mul(Ib, p));
  const vRR = box(mul(Ir, Ir)), vRG = box(mul(Ir, Ig)), vRB = box(mul(Ir, Ib));
  const vGG = box(mul(Ig, Ig)), vGB = box(mul(Ig, Ib)), vBB = box(mul(Ib, Ib));
  const aR = new Float32Array(n), aG = new Float32Array(n), aB = new Float32Array(n), bb = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const mr = mR[i], mg = mG[i], mb = mB[i], mp = mP[i];
    const cr = mRp[i] - mr * mp, cg = mGp[i] - mg * mp, cb = mBp[i] - mb * mp;
    const rr = vRR[i] - mr * mr + eps, rg = vRG[i] - mr * mg, rb = vRB[i] - mr * mb;
    const gg = vGG[i] - mg * mg + eps, gb = vGB[i] - mg * mb, b2 = vBB[i] - mb * mb + eps;
    // Inverse of the symmetric 3×3 [[rr rg rb][rg gg gb][rb gb b2]].
    const i00 = gg * b2 - gb * gb, i01 = gb * rb - rg * b2, i02 = rg * gb - gg * rb;
    const i11 = rr * b2 - rb * rb, i12 = rb * rg - rr * gb, i22 = rr * gg - rg * rg;
    const det = rr * i00 + rg * i01 + rb * i02;
    const inv = det !== 0 ? 1 / det : 0;
    const ar = (i00 * cr + i01 * cg + i02 * cb) * inv;
    const ag = (i01 * cr + i11 * cg + i12 * cb) * inv;
    const ab = (i02 * cr + i12 * cg + i22 * cb) * inv;
    aR[i] = ar; aG[i] = ag; aB[i] = ab;
    bb[i] = mp - ar * mr - ag * mg - ab * mb;
  }
  const mAR = box(aR), mAG = box(aG), mAB = box(aB), mBB = box(bb);
  const coef = new Float32Array(n * 4);
  for (let i = 0, j = 0; i < n; i++, j += 4) { coef[j] = mAR[i]; coef[j + 1] = mAG[i]; coef[j + 2] = mAB[i]; coef[j + 3] = mBB[i]; }
  return coef;
}

/** Radius (working px), eps and blend of the guided filter for a «detail» setting 0..1. */
export function detailParams(detail: number, workLong: number, lowLong: number) {
  const d = clamp01(detail);
  const scale = Math.max(1, workLong / Math.max(1, lowLong));
  return {
    r: Math.max(2, Math.round(2 * scale)),
    eps: Math.pow(10, -2 - 3 * d),
    /** 0 = plain smooth upsampling, 1 = fully guided. */
    t: d <= 0 ? 0 : d >= 0.3 ? 1 : (d / 0.3) * (d / 0.3) * (3 - 2 * (d / 0.3)),
  };
}

/** Working resolution: twice the matte's (512 to `maxLong` px on the long side), never above the photo's. */
export function workSize(W: number, H: number, lowLong: number, maxLong = 2048): { w: number; h: number } {
  const long = Math.max(W, H);
  const target = Math.min(long, Math.max(512, Math.min(maxLong, lowLong * 2)));
  const s = target / long;
  return { w: Math.max(1, Math.round(W * s)), h: Math.max(1, Math.round(H * s)) };
}

export interface GuidedPlan {
  /** Coefficients [a_r, a_g, a_b, b] at cw × ch (blend already folded in). */
  coef: Float32Array;
  cw: number;
  ch: number;
}

/**
 * Everything of the guided upsampling that happens at the working resolution. The last step (upsample the
 * coefficients and apply them to the full-resolution photo) is `applyGuided` on the CPU or the WebGL2 version in
 * gl.ts; both give the same bytes within ±1.
 */
export function planGuided(rgba: Uint8ClampedArray | Uint8Array, W: number, H: number, low: Float32Array, lw: number, lh: number, detail: number): GuidedPlan {
  const { w: cw, h: ch } = workSize(W, H, Math.max(lw, lh));
  const p = resizeBilinear(low, lw, lh, cw, ch);
  const { r, eps, t } = detailParams(detail, Math.max(cw, ch), Math.max(lw, lh));
  const n = cw * ch;
  const coef = new Float32Array(n * 4);
  if (t <= 0) {
    for (let i = 0; i < n; i++) coef[i * 4 + 3] = p[i];
    return { coef, cw, ch };
  }
  const I = downsampleRGB(rgba, W, H, cw, ch);
  const g = guidedCoefficients(I, p, cw, ch, r, eps);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    coef[j] = g[j] * t; coef[j + 1] = g[j + 1] * t; coef[j + 2] = g[j + 2] * t;
    coef[j + 3] = g[j + 3] * t + p[i] * (1 - t);
  }
  return { coef, cw, ch };
}

/** q = a·I + b at full resolution with the coefficients bilinearly upsampled (CPU reference). */
export function applyGuided(plan: GuidedPlan, rgba: Uint8ClampedArray | Uint8Array, W: number, H: number, out = new Uint8ClampedArray(W * H)): Uint8ClampedArray {
  const { coef, cw, ch } = plan;
  const sx = cw / W, sy = ch / H;
  const x0s = new Int32Array(W), x1s = new Int32Array(W), fxs = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let u = (x + 0.5) * sx - 0.5; if (u < 0) u = 0; if (u > cw - 1) u = cw - 1;
    const x0 = Math.floor(u); x0s[x] = x0 * 4; x1s[x] = Math.min(x0 + 1, cw - 1) * 4; fxs[x] = u - x0;
  }
  for (let y = 0; y < H; y++) {
    let v = (y + 0.5) * sy - 0.5; if (v < 0) v = 0; if (v > ch - 1) v = ch - 1;
    const y0 = Math.floor(v), y1 = Math.min(y0 + 1, ch - 1), fy = v - y0;
    const r0 = y0 * cw * 4, r1 = y1 * cw * 4;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, fx = fxs[x];
      const a0 = r0 + x0s[x], a1 = r0 + x1s[x], b0 = r1 + x0s[x], b1 = r1 + x1s[x];
      const w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
      const ar = coef[a0] * w00 + coef[a1] * w01 + coef[b0] * w10 + coef[b1] * w11;
      const ag = coef[a0 + 1] * w00 + coef[a1 + 1] * w01 + coef[b0 + 1] * w10 + coef[b1 + 1] * w11;
      const ab = coef[a0 + 2] * w00 + coef[a1 + 2] * w01 + coef[b0 + 2] * w10 + coef[b1 + 2] * w11;
      const bb = coef[a0 + 3] * w00 + coef[a1 + 3] * w01 + coef[b0 + 3] * w10 + coef[b1 + 3] * w11;
      const j = i * 4;
      const q = ar * (rgba[j] / 255) + ag * (rgba[j + 1] / 255) + ab * (rgba[j + 2] / 255) + bb;
      out[i] = q <= 0 ? 0 : q >= 1 ? 255 : Math.round(q * 255);
    }
  }
  return out;
}

/** Guided upsampling of a low-resolution matte (0..1) to the photo's size (CPU). */
export function guidedUpsample(rgba: Uint8ClampedArray | Uint8Array, W: number, H: number, low: Float32Array, lw: number, lh: number, detail: number): Uint8ClampedArray {
  return applyGuided(planGuided(rgba, W, H, low, lw, lh, detail), rgba, W, H);
}

/** Guided filtering of a full-resolution matte (when the model's low-resolution matte is not at hand). */
export function guidedRefine(rgba: Uint8ClampedArray | Uint8Array, W: number, H: number, alpha: Uint8ClampedArray, detail: number): Uint8ClampedArray {
  if (detail <= 0) return new Uint8ClampedArray(alpha);
  const n = W * H;
  const { w: lw, h: lh } = workSize(W, H, 512, 1024);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = alpha[i] / 255;
  const low = areaDownsample(buf, W, H, lw, lh);
  const plan = planGuided(rgba, W, H, low, lw, lh, detail);
  const guided = applyGuided(plan, rgba, W, H);
  // Keep the given matte where it is certain (fully in or out in a small neighbourhood): only edges change.
  for (let i = 0; i < n; i++) { const v = alpha[i]; buf[i] = v > 3 && v < 252 ? 1 : 0; }
  const unsure = boxMean(buf, W, H, 3, buf);
  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) out[i] = unsure[i] > 0 ? guided[i] : alpha[i];
  return out;
}

/** Area-average downsample of one plane. */
export function areaDownsample(src: Float32Array, W: number, H: number, dw: number, dh: number): Float32Array {
  const out = new Float32Array(dw * dh);
  const sx = W / dw, sy = H / dh;
  for (let y = 0; y < dh; y++) {
    const ya = Math.floor(y * sy), yb = Math.max(ya + 1, Math.min(H, Math.round((y + 1) * sy)));
    for (let x = 0; x < dw; x++) {
      const xa = Math.floor(x * sx), xb = Math.max(xa + 1, Math.min(W, Math.round((x + 1) * sx)));
      let s = 0;
      for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) s += src[yy * W + xx];
      out[y * dw + x] = s / ((yb - ya) * (xb - xa));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ foreground colour */

/** Radii of the two blur-fusion passes for an image size (the paper's 90 px and 6 px windows at ≈1 Mpx). */
export function fusionRadii(W: number, H: number) {
  const s = Math.min(4, Math.max(0.5, Math.max(W, H) / 1024));
  return { r1: Math.max(8, Math.round(45 * s)), r2: Math.max(1, Math.round(3 * s)) };
}

/** Box means of F·α / α and B·(1−α) / (1−α) over a (2r+1)² window (the smooth estimates of one step). */
function fusionMeans(F: Float32Array[], B: Float32Array[], A: Float32Array, w: number, h: number, r: number): { bF: Float32Array[]; bB: Float32Array[] } {
  const n = w * h;
  const bA = boxMean(A, w, h, r);
  const bF: Float32Array[] = [], bB: Float32Array[] = [];
  for (let c = 0; c < 3; c++) {
    const fa = new Float32Array(n), b1a = new Float32Array(n);
    for (let i = 0; i < n; i++) { fa[i] = F[c][i] * A[i]; b1a[i] = B[c][i] * (1 - A[i]); }
    const mf = boxMean(fa, w, h, r, fa), mb = boxMean(b1a, w, h, r, b1a);
    for (let i = 0; i < n; i++) { mf[i] /= bA[i] + 1e-5; mb[i] /= 1 - bA[i] + 1e-5; }
    bF.push(mf); bB.push(mb);
  }
  return { bF, bB };
}

/** One blur-fusion step: F and B re-estimated from the means (Forte & Pitié, eq. 3). */
function fusionPass(I: Float32Array[], F: Float32Array[], B: Float32Array[], A: Float32Array, w: number, h: number, r: number): { F: Float32Array[]; B: Float32Array[] } {
  const { bF, bB } = fusionMeans(F, B, A, w, h, r);
  const outF = bF.map((m, c) => {
    const f = new Float32Array(w * h);
    for (let i = 0; i < f.length; i++) { const a = A[i]; f[i] = clamp01(m[i] + a * (I[c][i] - a * m[i] - (1 - a) * bB[c][i])); }
    return f;
  });
  return { F: outF, B: bB };
}

/**
 * Blur-fusion foreground estimation (two passes: large then small window). Returns the estimated foreground
 * colour F (RGB bytes) wherever 0 < alpha < 255; elsewhere F = the photo. On large photos both passes average
 * on a reduced copy (their windows are wider than a reduced pixel) and only the final per-pixel formula runs at
 * full resolution, on the soft pixels.
 */
export function estimateForeground(rgba: Uint8ClampedArray | Uint8Array, alpha: Uint8ClampedArray, W: number, H: number, radii = fusionRadii(W, H)): Uint8ClampedArray {
  const n = W * H;
  const out = new Uint8ClampedArray(n * 3);
  for (let i = 0, j = 0; i < n; i++, j += 3) { out[j] = rgba[i * 4]; out[j + 1] = rgba[i * 4 + 1]; out[j + 2] = rgba[i * 4 + 2]; }
  const k = Math.max(1, Math.min(Math.floor(Math.sqrt(n / 600_000)), Math.floor(radii.r2 / 1.5) || 1));
  const w = Math.ceil(W / k), h = Math.ceil(H / k);
  // Planes at the averaging resolution.
  const A = new Float32Array(w * h);
  const I: Float32Array[] = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
  if (k === 1) {
    for (let i = 0, j = 0; i < n; i++, j += 4) { A[i] = alpha[i] / 255; I[0][i] = rgba[j] / 255; I[1][i] = rgba[j + 1] / 255; I[2][i] = rgba[j + 2] / 255; }
  } else {
    const full = new Float32Array(n);
    for (let i = 0; i < n; i++) full[i] = alpha[i] / 255;
    A.set(areaDownsample(full, W, H, w, h));
    for (let c = 0; c < 3; c++) { for (let i = 0; i < n; i++) full[i] = rgba[i * 4 + c] / 255; I[c].set(areaDownsample(full, W, H, w, h)); }
  }
  const p1 = fusionPass(I, I, I, A, w, h, Math.max(2, Math.round(radii.r1 / k)));
  const { bF, bB } = fusionMeans(p1.F, p1.B, A, w, h, Math.max(1, Math.round(radii.r2 / k)));
  // Final step at full resolution, soft pixels only: F = bF + α (I − α bF − (1 − α) bB).
  const sx = w / W, sy = h / H;
  for (let y = 0; y < H; y++) {
    let v = (y + 0.5) * sy - 0.5; if (v < 0) v = 0; if (v > h - 1) v = h - 1;
    const y0 = Math.floor(v), y1 = Math.min(y0 + 1, h - 1), fy = v - y0;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, a255 = alpha[i];
      if (a255 === 0 || a255 === 255) continue;
      let u = (x + 0.5) * sx - 0.5; if (u < 0) u = 0; if (u > w - 1) u = w - 1;
      const x0 = Math.floor(u), x1 = Math.min(x0 + 1, w - 1), fx = u - x0;
      const i00 = y0 * w + x0, i01 = y0 * w + x1, i10 = y1 * w + x0, i11 = y1 * w + x1;
      const w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
      const a = a255 / 255;
      for (let c = 0; c < 3; c++) {
        const mf = bF[c][i00] * w00 + bF[c][i01] * w01 + bF[c][i10] * w10 + bF[c][i11] * w11;
        const mb = bB[c][i00] * w00 + bB[c][i01] * w01 + bB[c][i10] * w10 + bB[c][i11] * w11;
        const f = mf + a * (rgba[i * 4 + c] / 255 - a * mf - (1 - a) * mb);
        out[i * 3 + c] = Math.round(clamp01(f) * 255);
      }
    }
  }
  return out;
}

/**
 * RGBA of the cut-out: colours decontaminated by `amount` (0 = the photo's colours, 1 = the estimated
 * foreground) and the matte as alpha (straight, not premultiplied).
 */
export function cutoutRGBA(rgba: Uint8ClampedArray | Uint8Array, alpha: Uint8ClampedArray, W: number, H: number, amount: number): Uint8ClampedArray {
  const n = W * H, out = new Uint8ClampedArray(n * 4);
  const k = clamp01(amount);
  const F = k > 0 ? estimateForeground(rgba, alpha, W, H) : null;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    if (F && alpha[i] > 0 && alpha[i] < 255) {
      const f = i * 3;
      out[j] = rgba[j] + (F[f] - rgba[j]) * k;
      out[j + 1] = rgba[j + 1] + (F[f + 1] - rgba[j + 1]) * k;
      out[j + 2] = rgba[j + 2] + (F[f + 2] - rgba[j + 2]) * k;
    } else { out[j] = rgba[j]; out[j + 1] = rgba[j + 1]; out[j + 2] = rgba[j + 2]; }
    out[j + 3] = alpha[i];
  }
  return out;
}

/* ------------------------------------------------------------------ edge shift and feather */

/** Grey dilation (max) or erosion (min) with a disc of integer radius r. */
function morphDisc(src: Uint8ClampedArray, w: number, h: number, r: number, dilate: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  if (r <= 0) { out.set(src); return out; }
  out.fill(dilate ? 0 : 255);
  // Half-widths per row offset; rows with the same half-width share one horizontal pass.
  const half: number[] = [];
  for (let dy = -r; dy <= r; dy++) half.push(Math.floor(Math.sqrt((r + 0.35) * (r + 0.35) - dy * dy)));
  let H = new Uint8ClampedArray(src);
  let tmp = new Uint8ClampedArray(w * h);
  for (let k = 0; k <= r; k++) {
    if (k > 0) {
      // H_k(x) = max/min(H_{k-1}(x-1), H_{k-1}(x), H_{k-1}(x+1)).
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const a = H[row + x], l = x > 0 ? H[row + x - 1] : a, rr = x < w - 1 ? H[row + x + 1] : a;
          tmp[row + x] = dilate ? (a > l ? (a > rr ? a : rr) : (l > rr ? l : rr)) : (a < l ? (a < rr ? a : rr) : (l < rr ? l : rr));
        }
      }
      const s = H; H = tmp; tmp = s;
    }
    for (let i = 0; i < half.length; i++) {
      if (half[i] !== k) continue;
      const dy = i - r;
      for (let y = 0; y < h; y++) {
        const sy = y + dy;
        if (sy < 0 || sy >= h) continue;
        const row = y * w, srow = sy * w;
        if (dilate) for (let x = 0; x < w; x++) { const v = H[srow + x]; if (v > out[row + x]) out[row + x] = v; }
        else for (let x = 0; x < w; x++) { const v = H[srow + x]; if (v < out[row + x]) out[row + x] = v; }
      }
    }
  }
  return out;
}

/** Moves the edge outwards (px > 0) or inwards (px < 0), fractional pixels blended. */
export function shiftMatte(alpha: Uint8ClampedArray, w: number, h: number, px: number): Uint8ClampedArray {
  if (!px) return new Uint8ClampedArray(alpha);
  const dilate = px > 0, r = Math.min(64, Math.abs(px));
  const r0 = Math.floor(r), f = r - r0;
  const a = morphDisc(alpha, w, h, r0, dilate);
  if (f < 1e-3) return a;
  const b = morphDisc(alpha, w, h, r0 + 1, dilate);
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(a[i] + (b[i] - a[i]) * f);
  return out;
}

/** Box radii of three passes approximating a Gaussian of standard deviation sigma. */
export function gaussBoxes(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => ((i < m ? wl : wu) - 1) / 2);
}

/** Softens the edge: Gaussian blur with sigma = px / 2 (px ≈ the width of the soft transition added). */
export function featherMatte(alpha: Uint8ClampedArray, w: number, h: number, px: number): Uint8ClampedArray {
  if (px <= 0) return new Uint8ClampedArray(alpha);
  let p: Float32Array = Float32Array.from(alpha);
  for (const r of gaussBoxes(px / 2)) if (r > 0) p = boxMean(p, w, h, r);
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(p[i]);
  return out;
}

/* ------------------------------------------------------------------ brush, colour, combine */

export interface BrushPoint { x: number; y: number; pressure?: number }

/**
 * Stamps a keep (paint opaque) or remove (paint transparent) stroke into a matte, in place. Soft round dabs
 * along the path; overlapping dabs do not build up (max/min compositing). Returns the touched rectangle.
 */
export function stampStroke(alpha: Uint8ClampedArray, w: number, h: number, stroke: BrushPoint[], mode: 'keep' | 'remove', size: number, hardness: number, opacity = 1): { x: number; y: number; w: number; h: number } | null {
  if (!stroke.length || size <= 0) return null;
  const hard = clamp01(hardness), op = clamp01(opacity);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const dab = (cx: number, cy: number, pr: number) => {
    const rad = Math.max(0.5, (size / 2) * pr);
    const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(w - 1, Math.ceil(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(h - 1, Math.ceil(cy + rad));
    if (x0 > x1 || y0 > y1) return;
    if (x0 < minX) minX = x0; if (y0 < minY) minY = y0; if (x1 > maxX) maxX = x1; if (y1 > maxY) maxY = y1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad;
        if (d >= 1) continue;
        let v = 1;
        if (d > hard) { const t = (d - hard) / (1 - hard); v = 1 - t * t * (3 - 2 * t); }
        v *= op;
        const i = y * w + x;
        if (mode === 'keep') { const nv = Math.round(v * 255); if (nv > alpha[i]) alpha[i] = nv; }
        else { const nv = Math.round((1 - v) * 255); if (nv < alpha[i]) alpha[i] = nv; }
      }
    }
  };
  const spacing = Math.max(0.5, size * 0.12);
  const p0 = stroke[0];
  dab(p0.x, p0.y, p0.pressure ?? 1);
  for (let k = 1; k < stroke.length; k++) {
    const a = stroke[k - 1], b = stroke[k];
    const len = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      dab(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, (a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * t);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Parses '#rgb', '#rrggbb' or 'rgb(r, g, b)' to bytes. */
export function parseColor(c: string | [number, number, number]): [number, number, number] {
  if (Array.isArray(c)) return [c[0], c[1], c[2]];
  const s = c.trim();
  let m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (m) { const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  m = /^#?([0-9a-f]{3})$/i.exec(s);
  if (m) return [0, 1, 2].map(i => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  throw new Error(`Color no válido: ${c}`);
}

/**
 * Everything close to a colour: RGB distance normalised to 0..1 (Euclidean / √3 · 255). Distance ≤ tol → 255,
 * ≥ tol + soft → 0, linear in between. Same meaning as the project's MaskColorPart {tol, soft}.
 */
export function colorMatte(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, color: string | [number, number, number], tol: number, soft: number): Uint8ClampedArray {
  const [cr, cg, cb] = parseColor(color);
  const out = new Uint8ClampedArray(w * h);
  const k = 1 / (255 * Math.sqrt(3));
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    const d = Math.hypot(rgba[j] - cr, rgba[j + 1] - cg, rgba[j + 2] - cb) * k;
    out[i] = d <= tol ? 255 : soft <= 0 || d >= tol + soft ? 0 : Math.round((1 - (d - tol) / soft) * 255);
  }
  return out;
}

/** add = max, subtract = a without b, intersect = min. */
export function combine(a: Uint8ClampedArray, b: Uint8ClampedArray, op: 'add' | 'subtract' | 'intersect'): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = op === 'add' ? Math.max(a[i], b[i]) : op === 'intersect' ? Math.min(a[i], b[i]) : Math.min(a[i], 255 - b[i]);
  }
  return out;
}

/* ------------------------------------------------------------------ scores */

/** Intersection over union of two mattes thresholded at 50 %. */
export function iou(a: ArrayLike<number>, b: ArrayLike<number>, threshold = 128): number {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] >= threshold, y = b[i] >= threshold;
    if (x && y) inter++;
    if (x || y) uni++;
  }
  return uni ? inter / uni : 1;
}
