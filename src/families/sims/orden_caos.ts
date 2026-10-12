import { Accum } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Order and chaos: particles with a resting place on a lattice (square or hexagonal) that a front melts and
 * lets crystallise again, in a continuous cycle. Every particle carries a melt state m ∈ [0, 1] that relaxes
 * towards the heat of the front at its lattice site:
 *  - «Barrido»: a straight front goes across and back (behind it, molten);
 *  - «Radial»: a crystal grows from the centre outwards and melts back inwards;
 *  - «Onda de calor»: a hot band crosses the crystal and leaves it whole behind.
 * Its acceleration mixes two regimes by m:
 *  - order: a damped spring towards its site, a ≈ −K (x − h) − C v, plus a thermal tremor;
 *  - chaos: the velocity is pulled towards a divergence-free flow, v = (∂ψ/∂y, −∂ψ/∂x) of a 3D gradient noise
 *    ψ(x, y, t) (a 2D curl-noise flow that changes in time).
 * Picture: every particle as a short streak along its velocity, brighter the faster it goes (cold crystal dim,
 * molten flow bright), and the lattice bonds between neighbours that are both ordered and close (they break as
 * the crystal melts and close again when it re-forms).
 */

const ID = 'orden_caos', V = 1, RATE = 30, DT = 1 / RATE;
const MAX_SITES = 4096;
/** Speed limit (heights per second). */
const VMAX = 3;

/**
 * 0..1 → a byte in steps of 4 (64 levels): a sample halfway between two or four texels is then a whole level
 * in both engines (the GPU's float32 and the CPU's float64 would otherwise round an exact .5 apart).
 */
const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 252 : ((v * 63 + 0.5) | 0) * 4);
/** Distance from the walls over which the flow turns parallel to them. */
const WALL = 0.12;
/** Derivative of smoothstep(0, WALL, d) with respect to d. */
const dsstep = (d: number) => { const t = d / WALL; return t <= 0 || t >= 1 ? 0 : (6 * t * (1 - t)) / WALL; };
/** Corner offsets of the noise cube. */
const OX = [0, 1, 0, 1, 0, 1, 0, 1], OY = [0, 0, 1, 1, 0, 0, 1, 1], OZ = [0, 0, 0, 0, 1, 1, 1, 1];
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

interface P { lattice: string; spacing: number; front: string; period: number; angle: number; width: number; turb: number; stiff: number; jitter: number; bonds: number; glow: number }
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const read = (p: Params): P => ({
  lattice: String(p.lattice ?? 'cuadrada'), spacing: num(p.spacing, 0.05), front: String(p.front ?? 'barrido'), period: Math.max(4, num(p.period, 16)),
  angle: num(p.angle, 0), width: num(p.width, 0.25), turb: num(p.turb, 0.6), stiff: num(p.stiff, 0.6), jitter: num(p.jitter, 0.2),
  bonds: num(p.bonds, 0.6), glow: num(p.glow, 0.7),
});

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h, n = w * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  const hex = p.lattice === 'hex';
  let steps = 0;

  // ---- the lattice (structural: built once from the spacing and the kind)
  const a = Math.max(0.02, p.spacing);
  const rowH = hex ? (a * Math.sqrt(3)) / 2 : a;
  const cols = Math.max(2, Math.min(256, Math.floor(2 / a))), rows = Math.max(2, Math.min(Math.floor(MAX_SITES / cols), Math.floor(1 / rowH)));
  const N = cols * rows;
  const hx = new Float32Array(N), hy = new Float32Array(N);
  const x0 = -((cols - 1) * a) / 2, y0 = ((rows - 1) * rowH) / 2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    hx[i] = x0 + c * a + (hex && r % 2 ? a / 2 : 0) - (hex ? a / 4 : 0);
    hy[i] = y0 - r * rowH;
  }
  // neighbour bonds: right; down (square) or down-left and down-right (hex)
  const bondA: number[] = [], bondB: number[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (c + 1 < cols) { bondA.push(i); bondB.push(i + 1); }
    if (r + 1 < rows) {
      if (!hex) { bondA.push(i); bondB.push(i + cols); }
      else {
        const shift = r % 2 ? 0 : -1;
        for (const dc of [shift, shift + 1]) if (c + dc >= 0 && c + dc < cols) { bondA.push(i); bondB.push((r + 1) * cols + c + dc); }
      }
    }
  }
  const BA = Int32Array.from(bondA), BB = Int32Array.from(bondB);

  // ---- state
  const x = Float32Array.from(hx), y = Float32Array.from(hy);
  const vx = new Float32Array(N), vy = new Float32Array(N), melt = new Float32Array(N);

  // ---- gradient noise (seeded permutation), only its gradient is needed
  const perm = new Uint8Array(512);
  {
    const t = new Uint8Array(256);
    for (let i = 0; i < 256; i++) t[i] = i;
    for (let i = 255; i > 0; i--) { const j = rng.int(i + 1); const s = t[i]; t[i] = t[j]; t[j] = s; }
    for (let i = 0; i < 512; i++) perm[i] = t[i & 255];
  }
  const GX = [1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0], GY = [1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1], GZ = [0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1];
  const gxs = new Float64Array(512), gys = new Float64Array(512), gzs = new Float64Array(512);
  for (let i = 0; i < 512; i++) { const g = perm[i] % 12; gxs[i] = GX[g]; gys[i] = GY[g]; gzs[i] = GZ[g]; }
  const ND = new Float64Array(3), HC = new Int32Array(8);
  /** x and y derivatives of the gradient noise at (x, y, z) into ND[0..1], its value into ND[2]. */
  const noiseGrad = (px: number, py: number, pz: number) => {
    let ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    const fx = px - ix, fy = py - iy, fz = pz - iz;
    ix &= 255; iy &= 255; iz &= 255;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10), uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const dux = 30 * fx * fx * (fx - 1) * (fx - 1), duy = 30 * fy * fy * (fy - 1) * (fy - 1);
    const a0 = perm[ix] + iy, a1 = perm[ix + 1] + iy;
    HC[0] = perm[perm[a0] + iz]; HC[1] = perm[perm[a1] + iz]; HC[2] = perm[perm[a0 + 1] + iz]; HC[3] = perm[perm[a1 + 1] + iz];
    HC[4] = perm[perm[a0] + iz + 1]; HC[5] = perm[perm[a1] + iz + 1]; HC[6] = perm[perm[a0 + 1] + iz + 1]; HC[7] = perm[perm[a1 + 1] + iz + 1];
    let gxSum = 0, gySum = 0, val = 0;
    // n = Σ_k W_k(u) (g_k · (f − o_k)); ∂n/∂x = Σ W_k g_k.x + Σ ∂W_k/∂x (g_k · (f − o_k))
    for (let k = 0; k < 8; k++) {
      const hk = HC[k], dxk = fx - OX[k], dyk = fy - OY[k], dzk = fz - OZ[k];
      const v = gxs[hk] * dxk + gys[hk] * dyk + gzs[hk] * dzk;
      const wx = OX[k] ? ux : 1 - ux, wy = OY[k] ? uy : 1 - uy, wz = OZ[k] ? uz : 1 - uz;
      const W = wx * wy * wz;
      val += W * v;
      gxSum += W * gxs[hk] + (OX[k] ? dux : -dux) * wy * wz * v;
      gySum += W * gys[hk] + (OY[k] ? duy : -duy) * wx * wz * v;
    }
    ND[0] = gxSum; ND[1] = gySum; ND[2] = val;
  };

  /** The heat of the front (0 crystal … 1 molten) at a lattice site at time τ. */
  const heat = (sx: number, sy: number, tau: number) => {
    const ph = tau / p.period - Math.floor(tau / p.period);
    const ang = (p.angle * Math.PI) / 180, u = sx * Math.cos(ang) + sy * Math.sin(ang), wd = Math.max(0.02, p.width);
    // a triangle wave with eased turns: the front never lingers long at either end
    const tri = 1 - Math.abs(2 * ph - 1), e = tri * tri * (3 - 2 * tri) * 0.35 + tri * 0.65;
    if (p.front === 'radial') {
      // the crystal grows from the centre (radius R) and melts back
      const R = 0.02 + 1.08 * e, r = Math.sqrt(sx * sx + 2.2 * sy * sy);
      return sstep(-wd, wd, r - R);
    }
    if (p.front === 'onda') {
      // a hot band crosses and leaves the crystal whole behind it
      const c = -1.5 + 3 * ph;
      return 1 - sstep(0.35 * wd, wd, Math.abs(u - c));
    }
    // a front goes across and back: molten behind it
    const f = -1.02 + 2.04 * e;
    return sstep(-wd, wd, f - u);
  };

  const step1 = () => {
    const tau = steps * DT;
    const K = 40 * (0.25 + p.stiff), C = 2 * Math.sqrt(K) * 0.55;
    const flow = 0.3 * p.turb, kf = 7, trem = 0.9 * p.jitter;
    for (let i = 0; i < N; i++) {
      const m = (melt[i] += (heat(hx[i], hy[i], tau) - melt[i]) * Math.min(1, 3.5 * DT));
      let ax = 0, ay = 0;
      if (m < 0.999) {
        // order: a damped spring to its site and a thermal tremor
        const o = 1 - m;
        ax += o * (-K * (x[i] - hx[i]) - C * vx[i] + trem * rng.gauss());
        ay += o * (-K * (y[i] - hy[i]) - C * vy[i] + trem * rng.gauss());
      }
      if (m > 0.001) {
        // ψ' = ψ · b, b going to 0 at the walls: the flow runs along them instead of piling particles there
        noiseGrad(x[i] * 2.6 + 3.1, y[i] * 2.6 + 7.7, tau * 0.18);
        const dxw = 1 - Math.abs(x[i]), dyw = 0.5 - Math.abs(y[i]);
        const bx = sstep(0, WALL, dxw), by = sstep(0, WALL, dyw), b = bx * by;
        const dbx = dxw < WALL ? -Math.sign(x[i]) * dsstep(dxw) * by : 0, dby = dyw < WALL ? -Math.sign(y[i]) * dsstep(dyw) * bx : 0;
        const psx = 2.6 * ND[0] * b + ND[2] * dbx, psy = 2.6 * ND[1] * b + ND[2] * dby;
        const fx = psy * flow, fy = -psx * flow;
        ax += m * kf * (fx - vx[i]); ay += m * kf * (fy - vy[i]);
      }
      let nvx = vx[i] + ax * DT, nvy = vy[i] + ay * DT;
      const sp = Math.sqrt(nvx * nvx + nvy * nvy);
      if (sp > VMAX) { nvx *= VMAX / sp; nvy *= VMAX / sp; }
      let nx = x[i] + nvx * DT, ny = y[i] + nvy * DT;
      // the walls of the domain reflect
      if (nx < -1) { nx = -2 - nx; nvx = -nvx; } else if (nx > 1) { nx = 2 - nx; nvx = -nvx; }
      if (ny < -0.5) { ny = -1 - ny; nvy = -nvy; } else if (ny > 0.5) { ny = 1 - ny; nvy = -nvy; }
      x[i] = nx; y[i] = ny; vx[i] = nvx; vy[i] = nvy;
    }
    steps++;
  };

  // ---- render
  const acc = new Accum(w, h), A = acc.d;
  const render = (out: Uint8Array) => {
    acc.clear();
    const s = h, cx = w / 2, cy = h / 2, wd = Math.max(1, h / 72);
    if (p.bonds > 0) {
      const maxD2 = (1.35 * a) * (1.35 * a);
      for (let k = 0; k < BA.length; k++) {
        const i = BA[k], j = BB[k];
        const mm = Math.max(melt[i], melt[j]);
        if (mm > 0.6) continue;
        const dx = x[i] - x[j], dy = y[i] - y[j];
        if (dx * dx + dy * dy > maxD2) continue;
        acc.line(cx + x[i] * s, cy - y[i] * s, cx + x[j] * s, cy - y[j] * s, wd, p.bonds * 0.75 * (1 - mm / 0.6));
      }
    }
    for (let i = 0; i < N; i++) {
      const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      const b = 0.62 + 0.38 * (1 - Math.exp(-sp * 4 * p.glow));
      // a streak back along the velocity: a dot when still, a dash when it flows
      const tl = 0.07;
      acc.line(cx + x[i] * s, cy - y[i] * s, cx + (x[i] - vx[i] * tl) * s, cy - (y[i] - vy[i] * tl) * s, wd * 1.7, b);
    }
    for (let i = 0; i < n; i++) { const v = A[i]; out[i] = byte(v >= 1 ? 1 : Math.pow(v, 0.8)); }
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = { ...read(np), lattice: hex ? 'hex' : 'cuadrada', spacing: a }; },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) { render(out); },
    stroke(st: Stroke) {
      // a touch of heat: the lattice near the stroke melts for a moment (its particles are kicked outwards)
      const R = Math.max(0.04, st.r * 1.5), str = Math.max(0, Math.min(1, st.strength));
      for (let i = 0; i < N; i++) {
        const dx = x[i] - st.x1, dy = y[i] - st.y1, d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;
        const f = (1 - d / R) * str;
        melt[i] = Math.max(melt[i], f);
        vx[i] += (dx / (d + 1e-6)) * f * 1.2 + (st.x1 - st.x0) * 4 * f; vy[i] += (dy / (d + 1e-6)) * f * 1.2 + (st.y1 - st.y0) * 4 * f;
      }
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = {};
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { x: x.slice(), y: y.slice(), vx: vx.slice(), vy: vy.slice(), melt: melt.slice() } };
    },
    restore(st: ModelState) {
      if (st.id !== ID || st.res !== h) throw new Error('El estado guardado no corresponde a este cristal.');
      const A2 = st.arrays;
      const ok = (z: unknown): z is Float32Array => z instanceof Float32Array && z.length === N;
      if (!ok(A2.x) || !ok(A2.y) || !ok(A2.vx) || !ok(A2.vy) || !ok(A2.melt)) throw new Error('El estado guardado está incompleto.');
      x.set(A2.x); y.set(A2.y); vx.set(A2.vx); vy.set(A2.vy); melt.set(A2.melt);
      steps = st.steps;
      rng.load(st.scalars);
    },
  };
}
