/**
 * Signed distance fields of masks and the blend between two of them (pure). Used between tracking keyframes: on
 * each frame, the mask carried forward from the keyframe before and the one carried backward from the keyframe
 * after (two estimates of the same frame, a few pixels apart) are turned into signed distances and mixed by how
 * far the frame is from each keyframe: one solid outline in between, where a plain cross-fade of the two masks
 * would show both outlines half-transparent. (Two masks that do not overlap at all do not «move» by blending
 * their distances: they shrink and grow in place, which is why the carrying is done by the flow.)
 *
 * Distances are exact Euclidean (Felzenszwalb & Huttenlocher's 1-D lower envelope, twice), in pixels:
 * negative inside, positive outside, ±0.5 on the boundary between an inside and an outside pixel.
 */

const INF = 1e20;

/** 1-D squared distance transform of f (f[i] = 0 on sites, INF elsewhere), in place over `n` values. */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** Squared Euclidean distance of every pixel to the nearest pixel where `site(i)` holds. */
export function squaredDistance(w: number, h: number, site: (i: number) => boolean): Float64Array {
  const out = new Float64Array(w * h);
  const m = Math.max(w, h);
  const f = new Float64Array(m), d = new Float64Array(m), z = new Float64Array(m + 1);
  const v = new Int32Array(m);
  for (let i = 0; i < w * h; i++) out[i] = site(i) ? 0 : INF;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) f[x] = out[r + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[r + x] = d[x];
  }
  return out;
}

/**
 * Signed distance of a mask (coverage 0..1, inside where ≥ 0.5): negative inside, positive outside, in px.
 * An empty mask is +`far` everywhere, a full one −`far`.
 */
export function signedDistance(mask: ArrayLike<number>, w: number, h: number, far = Math.hypot(w, h)): Float32Array {
  const n = w * h;
  let inside = 0;
  for (let i = 0; i < n; i++) if (mask[i] >= 0.5) inside++;
  const out = new Float32Array(n);
  if (inside === 0) return out.fill(far);
  if (inside === n) return out.fill(-far);
  const toIn = squaredDistance(w, h, i => mask[i] >= 0.5);
  const toOut = squaredDistance(w, h, i => mask[i] < 0.5);
  for (let i = 0; i < n; i++) out[i] = mask[i] >= 0.5 ? 0.5 - Math.sqrt(toOut[i]) : Math.sqrt(toIn[i]) - 0.5;
  return out;
}

/**
 * Coverage (0..1) from a signed distance, with an anti-aliased edge `soft` px wide: 1 deep inside, 0 far outside,
 * 0.5 on the outline.
 */
export function coverageOf(sdf: Float32Array, soft = 1, out = new Float32Array(sdf.length)): Float32Array {
  const k = 1 / Math.max(1e-3, soft);
  for (let i = 0; i < sdf.length; i++) {
    const v = 0.5 - sdf[i] * k;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}

/**
 * The mask at a fraction `k` (0..1) of the way from mask A to mask B: their signed distances mixed linearly.
 * Overlapping shapes meet in between; a shape that grows changes its outline gradually; where one of them is
 * empty the other one fades by shrinking.
 */
export function blendMasks(a: ArrayLike<number>, b: ArrayLike<number>, w: number, h: number, k: number, soft = 1): Float32Array {
  const t = Math.min(1, Math.max(0, k));
  if (t === 0) return Float32Array.from(a as ArrayLike<number>);
  if (t === 1) return Float32Array.from(b as ArrayLike<number>);
  const far = Math.max(w, h) * 0.5;
  const sa = signedDistance(a, w, h, far), sb = signedDistance(b, w, h, far);
  for (let i = 0; i < sa.length; i++) sa[i] = sa[i] * (1 - t) + sb[i] * t;
  return coverageOf(sa, soft);
}

/** Intersection over union of two masks (inside where ≥ 0.5). 1 when both are empty. */
export function iou(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let inter = 0, uni = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] >= 0.5, y = b[i] >= 0.5;
    if (x && y) inter++;
    if (x || y) uni++;
  }
  return uni ? inter / uni : 1;
}

/** Share of pixels inside (≥ 0.5). */
export function areaOf(m: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < m.length; i++) if (m[i] >= 0.5) n++;
  return m.length ? n / m.length : 0;
}

/** Bounding box of the inside pixels, or null when empty. */
export function bboxOf(m: ArrayLike<number>, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (m[y * w + x] < 0.5) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
