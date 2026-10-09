/**
 * Small raster toolkit for the family models: a float buffer over the 2 × 1 domain (x ∈ [−1, 1],
 * y ∈ [−0.5, 0.5], y up; pixel row 0 at the top) with anti-aliased lines, splats, decay and blur, and the
 * conversion to the 8-bit raster the engines read. Pure and deterministic (no canvas, no DOM).
 */

export class Accum {
  readonly w: number;
  readonly h: number;
  readonly d: Float32Array;
  constructor(w: number, h: number) { this.w = w; this.h = h; this.d = new Float32Array(w * h); }

  /** Domain x → pixel x (continuous; pixel centres at i + 0.5). */
  px(x: number) { return (x * 0.5 + 0.5) * this.w; }
  /** Domain y → pixel y. */
  py(y: number) { return (0.5 - y) * this.h; }
  /** Domain length → pixels. */
  len(l: number) { return l * this.h; }

  clear(v = 0) { this.d.fill(v); }
  scale(k: number) { const d = this.d; for (let i = 0; i < d.length; i++) d[i] *= k; }

  /** Adds `amount` with a soft disc of radius r (pixels) centred at (cx, cy) (pixels). */
  splat(cx: number, cy: number, r: number, amount: number, wrap = false) {
    const w = this.w, h = this.h, d = this.d;
    const R = Math.max(0.5, r), ri = Math.ceil(R + 1);
    const x0 = Math.floor(cx - ri), x1 = Math.ceil(cx + ri), y0 = Math.floor(cy - ri), y1 = Math.ceil(cy + ri);
    for (let y = y0; y <= y1; y++) {
      let yy = y;
      if (wrap) yy = ((y % h) + h) % h; else if (y < 0 || y >= h) continue;
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        let xx = x;
        if (wrap) xx = ((x % w) + w) % w; else if (x < 0 || x >= w) continue;
        const dx = x + 0.5 - cx;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const k = dist <= R - 0.5 ? 1 : dist >= R + 0.5 ? 0 : R + 0.5 - dist;
        if (k > 0) d[yy * w + xx] += amount * k;
      }
    }
  }

  /** Adds a gaussian blob (sigma in pixels). */
  blob(cx: number, cy: number, sigma: number, amount: number, wrap = false) {
    const w = this.w, h = this.h, d = this.d;
    const s = Math.max(0.35, sigma), ri = Math.ceil(s * 2.5);
    const k2 = 1 / (2 * s * s);
    const x0 = Math.floor(cx - ri), x1 = Math.ceil(cx + ri), y0 = Math.floor(cy - ri), y1 = Math.ceil(cy + ri);
    for (let y = y0; y <= y1; y++) {
      let yy = y;
      if (wrap) yy = ((y % h) + h) % h; else if (y < 0 || y >= h) continue;
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        let xx = x;
        if (wrap) xx = ((x % w) + w) % w; else if (x < 0 || x >= w) continue;
        const dx = x + 0.5 - cx;
        d[yy * w + xx] += amount * Math.exp(-(dx * dx + dy * dy) * k2);
      }
    }
  }

  /**
   * Adds an anti-aliased segment of width `wd` (pixels) from (ax, ay) to (bx, by) (pixels): every pixel gets
   * `amount` × coverage, coverage falling linearly over one pixel at the edge (max, not sum, along the
   * segment, so joints do not double up).
   */
  line(ax: number, ay: number, bx: number, by: number, wd: number, amount: number) {
    const w = this.w, h = this.h, d = this.d;
    const hw = Math.max(0.5, wd * 0.5);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw - 1)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + hw + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - hw - 1)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + hw + 1));
    const vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy;
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        let t = vv > 1e-9 ? ((px - ax) * vx + (py - ay) * vy) / vv : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const k = dist <= hw - 0.5 ? 1 : dist >= hw + 0.5 ? 0 : hw + 0.5 - dist;
        if (k > 0) { const i = y * w + x, v = amount * k; if (v > d[i]) d[i] = v; }
      }
    }
  }

  /** Separable 3-tap blur (1 2 1)/4, `n` times, wrapping or clamping at the edges. */
  blur(n = 1, wrap = false, tmp?: Float32Array) {
    const w = this.w, h = this.h, d = this.d, t = tmp && tmp.length === d.length ? tmp : new Float32Array(d.length);
    for (let k = 0; k < n; k++) {
      for (let y = 0; y < h; y++) {
        const o = y * w;
        for (let x = 0; x < w; x++) {
          const xl = x > 0 ? x - 1 : wrap ? w - 1 : 0, xr = x < w - 1 ? x + 1 : wrap ? 0 : w - 1;
          t[o + x] = (d[o + xl] + 2 * d[o + x] + d[o + xr]) * 0.25;
        }
      }
      for (let y = 0; y < h; y++) {
        const yu = y > 0 ? y - 1 : wrap ? h - 1 : 0, yd = y < h - 1 ? y + 1 : wrap ? 0 : h - 1;
        const o = y * w, ou = yu * w, od = yd * w;
        for (let x = 0; x < w; x++) d[o + x] = (t[ou + x] + 2 * t[o + x] + t[od + x]) * 0.25;
      }
    }
  }
}

/**
 * Writes a float field into the 8-bit raster: v' = (v × gain)^(1/gamma), clamped to 0..1. With `tone` 'log'
 * the field is compressed as log(1 + v·gain)/log(1 + gain) first (density histograms).
 */
export function toBytes(src: Float32Array, out: Uint8Array, gain = 1, gamma = 1, tone: 'linear' | 'log' = 'linear') {
  const n = Math.min(src.length, out.length);
  const ig = 1 / gamma, lg = tone === 'log' ? 1 / Math.log(1 + gain) : 0;
  for (let i = 0; i < n; i++) {
    let v = tone === 'log' ? Math.log(1 + Math.max(0, src[i]) * gain) * lg : src[i] * gain;
    v = v <= 0 ? 0 : v >= 1 ? 1 : gamma === 1 ? v : Math.pow(v, ig);
    out[i] = (v * 255 + 0.5) | 0;
  }
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** A simple perspective camera that orbits the origin: projects 3D points to the domain's pixels. */
export class OrbitCamera {
  private cy = 1; private sy = 0; private cx = 1; private sx = 0;
  dist = 3;
  fov = 1.2;
  /** yaw around the vertical axis, pitch over the horizon (radians). */
  set(yaw: number, pitch: number, dist: number) {
    this.cy = Math.cos(yaw); this.sy = Math.sin(yaw); this.cx = Math.cos(pitch); this.sx = Math.sin(pitch); this.dist = dist;
  }
  /** Camera-space depth and the projected point in domain units (x ∈ [−1, 1], y ∈ [−.5, .5]); null behind. */
  project(x: number, y: number, z: number, out: Float64Array): boolean {
    // yaw around y, then pitch around x
    const x1 = this.cy * x + this.sy * z, z1 = -this.sy * x + this.cy * z;
    const y2 = this.cx * y - this.sx * z1, z2 = this.sx * y + this.cx * z1;
    const depth = this.dist - z2;
    if (depth <= 0.05) return false;
    const k = this.fov / depth;
    out[0] = x1 * k * 0.5; out[1] = y2 * k * 0.5; out[2] = depth;
    return true;
  }
}
