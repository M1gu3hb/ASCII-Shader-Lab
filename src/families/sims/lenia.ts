import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Lenia (B. W.-C. Chan 2019), written from the paper's equations: a continuous field A ∈ [0, 1] on a 2:1 torus,
 *   A ← clip(A + dt · G(K ∗ A), 0, 1),   G(u) = 2 exp(−(u − μ)² / 2σ²) − 1,
 * K a shell kernel of radius R cells with B rings of peak weights β: K(r) = β⌊B·r⌋ · core(B·r mod 1) for
 * r = distance / R < 1, core(q) = exp(4 − 1 / (q (1 − q))), normalised to sum 1. The convolution runs in the
 * frequency domain with an own radix-2 FFT (two real rows per complex transform, half spectra in between);
 * the kernel's transform is kept until R, the rings or the grid change. So the grid is a power of two: the
 * rows asked for round to the nearest one (64, 128, 256) and the columns are twice that. R is capped at
 * 0.4 × rows so the kernel never wraps onto itself.
 */

const ID = 'lenia', V = 1;
const TAU = Math.PI * 2;
/**
 * Brightest byte of the raster: just under white, so a sample half-way between a full and an empty texel is no
 * exact half (the two engines round such ties to different glyphs).
 */
const TOP = 250;

/** Ring weights β of each kernel shape. */
export const RINGS: Record<string, number[]> = { uno: [1], dos: [1, 0.5], tres: [0.5, 1, 0.667] };

/** Grid rows for the rows asked for: the nearest power of two (16 at least). */
export const leniaRows = (res: number) => 2 ** Math.max(4, Math.round(Math.log2(Math.max(1, res))));

/** In-place iterative radix-2 complex FFT of a fixed power-of-two length (the inverse is unscaled). */
export class FFT {
  readonly n: number;
  private rev: Uint32Array;
  private cs: Float64Array;
  private sn: Float64Array;
  constructor(n: number) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error('FFT: la longitud debe ser una potencia de dos.');
    this.n = n;
    const bits = Math.round(Math.log2(n));
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cs = new Float64Array(n / 2); this.sn = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) { this.cs[k] = Math.cos((TAU * k) / n); this.sn[k] = Math.sin((TAU * k) / n); }
  }
  run(re: Float64Array, im: Float64Array, inverse: boolean) {
    const n = this.n, rev = this.rev, cs = this.cs, sn = this.sn, sg = inverse ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    // the first two stages have trivial twiddles (1, and ∓i)
    for (let i = 0; i < n; i += 2) {
      const ar = re[i], ai = im[i], br = re[i + 1], bi = im[i + 1];
      re[i] = ar + br; im[i] = ai + bi; re[i + 1] = ar - br; im[i + 1] = ai - bi;
    }
    if (n >= 4) for (let i = 0; i < n; i += 4) {
      let ar = re[i], ai = im[i], br = re[i + 2], bi = im[i + 2];
      re[i] = ar + br; im[i] = ai + bi; re[i + 2] = ar - br; im[i + 2] = ai - bi;
      ar = re[i + 1]; ai = im[i + 1]; br = re[i + 3]; bi = im[i + 3];
      const xr = -sg * bi, xi = sg * br;
      re[i + 1] = ar + xr; im[i + 1] = ai + xi; re[i + 3] = ar - xr; im[i + 3] = ai - xi;
    }
    for (let size = 8; size <= n; size <<= 1) {
      const half = size >> 1, stride = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += stride) {
          const a = i + j, b = a + half, wr = cs[k], wi = sg * sn[k];
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }
}

/**
 * Circular convolution of a real w × h field with a real kernel. Spectra are halves (columns kx = 0..w/2),
 * stored column by column, as real rows have conjugate-symmetric transforms.
 */
export class Convolver {
  readonly w: number; readonly h: number;
  private fw: FFT; private fh: FFT;
  private zr: Float64Array; private zi: Float64Array;
  private sr: Float64Array; private si: Float64Array;
  private kr: Float64Array; private ki: Float64Array;
  private colR: Float64Array[]; private colI: Float64Array[];
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.fw = new FFT(w); this.fh = new FFT(h);
    this.zr = new Float64Array(w); this.zi = new Float64Array(w);
    const m = (w / 2 + 1) * h;
    this.sr = new Float64Array(m); this.si = new Float64Array(m);
    this.kr = new Float64Array(m); this.ki = new Float64Array(m);
    this.colR = []; this.colI = [];
    for (let k = 0; k <= w / 2; k++) { this.colR.push(this.sr.subarray(k * h, (k + 1) * h)); this.colI.push(this.si.subarray(k * h, (k + 1) * h)); }
  }

  /** Half spectrum of a real field into (sr, si). */
  private forward(src: ArrayLike<number>) {
    const { w, h, zr, zi, sr, si } = this;
    for (let y = 0; y < h; y += 2) {
      const o0 = y * w, o1 = o0 + w;
      for (let x = 0; x < w; x++) { zr[x] = src[o0 + x]; zi[x] = src[o1 + x]; }
      this.fw.run(zr, zi, false);
      // two real rows from one complex transform: Z = Fa + i·Fb
      for (let k = 0; k <= w / 2; k++) {
        const m = (w - k) & (w - 1), a = zr[k], b = zi[k], c = zr[m], d = zi[m], o = k * h + y;
        sr[o] = (a + c) * 0.5; si[o] = (b - d) * 0.5;
        sr[o + 1] = (b + d) * 0.5; si[o + 1] = (c - a) * 0.5;
      }
    }
    for (let k = 0; k <= w / 2; k++) this.fh.run(this.colR[k], this.colI[k], false);
  }

  /** Sets the kernel (w × h, origin at cell 0, wrapping). */
  setKernel(kernel: Float64Array) {
    this.forward(kernel);
    this.kr.set(this.sr); this.ki.set(this.si);
  }

  /** dst = kernel ∗ src. */
  apply(src: ArrayLike<number>, dst: Float64Array) {
    const { w, h, zr, zi, sr, si, kr, ki } = this;
    this.forward(src);
    for (let i = 0; i < sr.length; i++) {
      const a = sr[i], b = si[i];
      sr[i] = a * kr[i] - b * ki[i]; si[i] = a * ki[i] + b * kr[i];
    }
    for (let k = 0; k <= w / 2; k++) this.fh.run(this.colR[k], this.colI[k], true);
    const sc = 1 / (w * h);
    for (let y = 0; y < h; y += 2) {
      for (let k = 0; k <= w / 2; k++) {
        const o = k * h + y, p = sr[o], q = si[o], r = sr[o + 1], s = si[o + 1];
        zr[k] = p - s; zi[k] = q + r;
        if (k > 0 && k < w / 2) { zr[w - k] = p + s; zi[w - k] = r - q; }
      }
      this.fw.run(zr, zi, true);
      const o0 = y * w, o1 = o0 + w;
      for (let x = 0; x < w; x++) { dst[o0 + x] = zr[x] * sc; dst[o1 + x] = zi[x] * sc; }
    }
  }
}

/** The shell kernel on a w × h torus, centred on cell 0 and normalised to sum 1. */
export function leniaKernel(w: number, h: number, R: number, beta: number[]): Float64Array {
  const K = new Float64Array(w * h), B = beta.length, ri = Math.ceil(R);
  let sum = 0;
  for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
    const r = Math.hypot(dx, dy) / R;
    if (r >= 1) continue;
    const br = B * r, ring = Math.min(B - 1, Math.floor(br)), q = br - ring;
    const v = q > 0 && q < 1 ? beta[ring] * Math.exp(4 - 1 / (q * (1 - q))) : 0;
    if (v <= 0) continue;
    K[((dy + h) % h) * w + ((dx + w) % w)] += v;
    sum += v;
  }
  if (sum > 0) for (let i = 0; i < K.length; i++) K[i] /= sum;
  return K;
}

/** A creature grown in a nursery: its field (n × n, centred) and the kernel radius it grew with. */
interface Creature { a: Float32Array; n: number; r: number }
const NURSERY = new Map<string, Creature | null>();

/**
 * Grows a creature with the current rule, procedurally: block-noise patches on a small torus (64 × 64, the
 * kernel at most 13 cells; larger kernels get the creature scaled up) run until their mass settles; the
 * first that settles without dying or filling the torus is kept. Patches are drawn from a fixed internal
 * seed, so the result depends only on the rule; it is memoised. Null when no patch settles within the
 * budget (the rule has no small creatures).
 */
export function nurseryCreature(mu: number, sigma: number, R: number, rings: string, dt: number): Creature | null {
  const beta = RINGS[rings] ?? RINGS.uno;
  const r = Math.min(R, 13), N = r * 4.5 <= 32 ? 32 : 64;
  const key = `${mu}|${sigma}|${r}|${rings}|${dt}`;
  if (NURSERY.has(key)) return NURSERY.get(key)!;
  const conv = new Convolver(N, N), n = N * N;
  conv.setKernel(leniaKernel(N, N, r, beta));
  const A = new Float32Array(n), U = new Float64Array(n);
  const rng = new SimRng(`${ID}|${V}|vivero`);
  const k2 = 1 / (2 * sigma * sigma);
  let found: Creature | null = null, budget = N === 32 ? 3200 : 1000;
  for (let attempt = 0; attempt < 24 && budget > 0 && !found; attempt++) {
    A.fill(0);
    const side = Math.min(N, Math.round(2.5 * r)), blk = Math.max(1, Math.round(r / 2)), nb = Math.ceil(side / blk);
    const vals = new Float32Array(nb * nb);
    for (let i = 0; i < vals.length; i++) vals[i] = rng.next();
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) A[y * N + x] = vals[Math.floor(y / blk) * nb + Math.floor(x / blk)];
    let prev = -1;
    for (let t = 1; t <= 400 && budget > 0; t++, budget--) {
      conv.apply(A, U);
      for (let i = 0; i < n; i++) { const d = U[i] - mu; const v = A[i] + dt * (2 * Math.exp(-d * d * k2) - 1); A[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
      if (t % 25) continue;
      let m = 0, c = 0;
      for (let i = 0; i < n; i++) { m += A[i]; if (A[i] > 0.1) c++; }
      if (m < 0.5 || c > 0.2 * n) break;
      if (t >= 150 && prev > 0 && Math.abs(m - prev) < 0.01 * m) {
        // centre it (circular mean) and keep it
        let sx = 0, cx = 0, sy = 0, cy = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const v = A[y * N + x], ax = (TAU * x) / N, ay = (TAU * y) / N;
          sx += v * Math.cos(ax); cx += v * Math.sin(ax); sy += v * Math.cos(ay); cy += v * Math.sin(ay);
        }
        const ox = Math.round((Math.atan2(cx, sx) / TAU) * N), oy = Math.round((Math.atan2(cy, sy) / TAU) * N);
        const a = new Float32Array(n);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) a[y * N + x] = A[(((y + oy - N / 2) % N + N) % N) * N + (((x + ox - N / 2) % N + N) % N)];
        found = { a, n: N, r };
        break;
      }
      prev = m;
    }
  }
  if (NURSERY.size > 16) NURSERY.clear();
  NURSERY.set(key, found);
  return found;
}

interface P { mu: number; sigma: number; R: number; dt: number; rings: string; seedShape: string; density: number; view: string }
const read = (p: Params): P => ({
  mu: Number(p.mu ?? 0.15), sigma: Number(p.sigma ?? 0.015), R: Number(p.R ?? 13), dt: Number(p.dt ?? 0.1),
  rings: String(p.rings ?? 'uno'), seedShape: String(p.seedShape ?? 'manchas'), density: Number(p.density ?? 0.5),
  view: String(p.view ?? 'materia'),
});

export function create(cfg: ModelConfig): FieldModel {
  const h = leniaRows(cfg.res), w = 2 * h, n = w * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  let steps = 0;
  const A = new Float32Array(n);
  const U = new Float64Array(n);
  let uFresh = false;
  const conv = new Convolver(w, h);
  const radius = (R: number) => Math.max(2, Math.min(R, h * 0.4));
  let kKey = '';
  const kernel = () => {
    const key = `${radius(p.R)}|${p.rings}`;
    if (key === kKey) return;
    conv.setKernel(leniaKernel(w, h, radius(p.R), RINGS[p.rings] ?? RINGS.uno));
    kKey = key;
    uFresh = false;
  };
  kernel();

  // ---- seeding (deterministic from the seed)
  const R0 = radius(p.R);
  /** A square of block noise (blocks of a third of R: the kernel sees structure, not grain). */
  const noise = (x0: number, y0: number, side: number, amp: number) => {
    const blk = Math.max(1, Math.round(radius(p.R) / 3));
    for (let by = 0; by < side; by += blk) for (let bx = 0; bx < side; bx += blk) {
      const v = amp * rng.next();
      for (let y = by; y < Math.min(side, by + blk); y++) for (let x = bx; x < Math.min(side, bx + blk); x++) {
        A[((((y0 + y) | 0) % h) + h) % h * w + ((((x0 + x) | 0) % w) + w) % w] = v;
      }
    }
  };
  /** A creature from the nursery, scaled to R, turned by th and centred at (cx, cy). */
  const stamp = (c: Creature, cx: number, cy: number, th: number) => {
    const k = R0 / c.r, half = (c.n / 2) * k, co = Math.cos(th), si = Math.sin(th);
    for (let y = Math.floor(cy - half); y <= Math.ceil(cy + half); y++) for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = (co * dx + si * dy) / k + c.n / 2 - 0.5, v = (-si * dx + co * dy) / k + c.n / 2 - 0.5;
      const ux = Math.floor(u), vy = Math.floor(v), fx = u - ux, fy = v - vy;
      if (ux < 0 || vy < 0 || ux >= c.n - 1 || vy >= c.n - 1) continue;
      const o = vy * c.n + ux;
      const val = (c.a[o] * (1 - fx) + c.a[o + 1] * fx) * (1 - fy) + (c.a[o + c.n] * (1 - fx) + c.a[o + c.n + 1] * fx) * fy;
      const i = (((y % h) + h) % h) * w + (((x % w) + w) % w);
      if (val > A[i]) A[i] = val;
    }
  };
  // sites on a jittered grid, about three kernel radii apart
  const sites: Array<[number, number]> = [];
  {
    const cs = Math.max(R0 * 3, 8), nx = Math.max(1, Math.floor(w / cs)), ny = Math.max(1, Math.floor(h / cs));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) sites.push([((i + 0.5) * w) / nx, ((j + 0.5) * h) / ny]);
    for (let i = sites.length - 1; i > 0; i--) { const j = rng.int(i + 1); const t = sites[i]; sites[i] = sites[j]; sites[j] = t; }
  }
  switch (p.seedShape) {
    case 'sopa':
      noise(0, 0, Math.max(w, h), p.density);
      break;
    case 'criaturas': {
      const c = nurseryCreature(p.mu, p.sigma, R0, p.rings, p.dt);
      // a school: all turned about the same way, so they swim side by side more than they collide
      const k = Math.min(sites.length, 1 + Math.round(p.density * 5)), th = rng.next() * TAU;
      for (let i = 0; i < k; i++) {
        const [sx, sy] = sites[i];
        if (c) stamp(c, sx + R0 * (rng.next() - 0.5), sy + R0 * (rng.next() - 0.5), th + 0.5 * (rng.next() - 0.5));
        else noise(sx - R0 * 1.25, sy - R0 * 1.25, Math.round(R0 * 2.5), 1);
      }
      break;
    }
    default: {
      // a patch of noise on a share of the sites (at least one)
      for (let i = 0; i < sites.length; i++) {
        if (i > 0 && rng.next() >= p.density) continue;
        const [sx, sy] = sites[i], side = Math.round(R0 * rng.range(1.8, 2.6));
        noise(sx - side / 2 + R0 * (rng.next() - 0.5), sy - side / 2 + R0 * (rng.next() - 0.5), side, 1);
      }
    }
  }

  const step1 = () => {
    kernel();
    conv.apply(A, U);
    const mu = p.mu, k2 = 1 / (2 * p.sigma * p.sigma), dt = p.dt;
    for (let i = 0; i < n; i++) {
      const d = U[i] - mu, e = d * d * k2;
      // far from μ the growth is exactly −1 in double precision (2·e^−40 < 2^−53): no exponential needed
      const v = A[i] + dt * (e > 40 ? -1 : 2 * Math.exp(-e) - 1);
      A[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    uFresh = false;
    steps++;
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = read(np); kernel(); },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      if (p.view === 'crecimiento') {
        // where matter grows (bright) or wastes away (dark), from the potential of the current field
        if (!uFresh) { kernel(); conv.apply(A, U); uFresh = true; }
        const k2 = 1 / (2 * p.sigma * p.sigma);
        for (let i = 0; i < n; i++) {
          const d = U[i] - p.mu, g = Math.exp(-d * d * k2);
          const v = 0.12 * A[i] + 0.88 * g;
          out[i] = v >= 1 ? TOP : (v * TOP + 0.5) | 0;
        }
      } else if (p.view === 'contorno') {
        for (let y = 0; y < h; y++) {
          const o = y * w, ou = ((y + h - 1) % h) * w, od = ((y + 1) % h) * w;
          for (let x = 0; x < w; x++) {
            const xl = (x + w - 1) % w, xr = (x + 1) % w;
            const gx = A[o + xr] - A[o + xl], gy = A[od + x] - A[ou + x];
            const v = Math.sqrt(gx * gx + gy * gy) * 2.2 + A[o + x] * 0.15;
            out[o + x] = v >= 1 ? TOP : (v * TOP + 0.5) | 0;
          }
        }
      } else {
        for (let i = 0; i < n; i++) {
          const v = Math.sqrt(A[i]);
          out[i] = v >= 1 ? TOP : (v * TOP + 0.5) | 0;
        }
      }
    },
    stroke(s: Stroke) {
      const ax = (s.x0 * 0.5 + 0.5) * w, ay = (0.5 - s.y0) * h, bx = (s.x1 * 0.5 + 0.5) * w, by = (0.5 - s.y1) * h;
      const R = Math.max(2, s.r * h), len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.ceil(len / (R * 0.5)));
      for (let j = 0; j <= k; j++) {
        const cx = ax + ((bx - ax) * j) / k, cy = ay + ((by - ay) * j) / k;
        if (s.brush === 'borrar') {
          for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
            if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > R) continue;
            A[(((y % h) + h) % h) * w + (((x % w) + w) % w)] = 0;
          }
        } else noise(cx - R, cy - R, Math.round(2 * R), 0.5 + 0.5 * s.strength);
      }
      uFresh = false;
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = {};
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { A: A.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta simulación.');
      const a = s.arrays.A;
      if (!(a instanceof Float32Array) || a.length !== n) throw new Error('El estado guardado está incompleto.');
      A.set(a);
      steps = s.steps;
      rng.load(s.scalars);
      uFresh = false;
    },
  };
}
