import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Coupled phase oscillators on a lattice (Kuramoto 1975; with the phase lag of Sakaguchi and Kuramoto 1986),
 * written from the equations: every node of a 2:1 torus holds a phase θ and a natural frequency
 * ω = 2π (f₀ + Δf · z), z ~ N(0, 1) drawn from the seed, and follows
 *   dθᵢ/dt = ωᵢ + (K / Nᵢ) Σⱼ sin(θⱼ − θᵢ − α) + D ξᵢ(t)
 * over its Nᵢ neighbours (4, 8 or a disc of radius 2 or 3), with seeded gaussian noise ξ, integrated with
 * Euler–Maruyama at dt = 0.05 (one unit of model time per second at the family's rate). The neighbour sums
 * use sin(θⱼ − θᵢ) = sin θⱼ cos θᵢ − cos θⱼ sin θᵢ, so each step costs two sines per node. The lattice is half
 * the raster's resolution and is drawn upsampled (bilinear).
 */

const ID = 'kuramoto', V = 1;
const TAU = Math.PI * 2, DT = 0.05;
/** Phase over which a flash fades (radians). */
const FLASH = 1.4;
/**
 * Brightest byte of the raster: just under white, so a sample half-way between a full and an empty texel is no
 * exact half (the two engines round such ties to different glyphs).
 */
const TOP = 250;

/** Neighbour offsets of each neighbourhood. */
export function offsets(kind: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const r = kind === 'r3' ? 3 : kind === 'r2' ? 2 : 1;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (!dx && !dy) continue;
    if (kind === 'n4' && dx && dy) continue;
    if ((kind === 'r2' || kind === 'r3') && dx * dx + dy * dy > r * r + 0.5) continue;
    out.push([dx, dy]);
  }
  return out;
}

interface P { K: number; spread: number; freq: number; neigh: string; lag: number; noise: number; init: string; view: string }
const read = (p: Params): P => ({
  K: Number(p.K ?? 3), spread: Number(p.spread ?? 0.02), freq: Number(p.freq ?? 0.45), neigh: String(p.neigh ?? 'r2'),
  lag: Number(p.lag ?? 0.8), noise: Number(p.noise ?? 0), init: String(p.init ?? 'espirales'), view: String(p.view ?? 'fase'),
});

const wrapPi = (d: number) => (d > Math.PI ? d - TAU : d < -Math.PI ? d + TAU : d);

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  const gh = Math.max(8, Math.round(h / 2)), gw = 2 * gh, gn = gw * gh;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  let steps = 0;
  const th = new Float32Array(gn), z = new Float32Array(gn);
  const sn = new Float64Array(gn), cs = new Float64Array(gn);
  // neighbour index lists (torus), rebuilt when the neighbourhood changes
  let nbKind = '', nb = new Int32Array(0), nbN = 0;
  const neighbours = () => {
    if (nbKind === p.neigh) return;
    const off = offsets(p.neigh);
    nbN = off.length; nb = new Int32Array(gn * nbN);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const o = (y * gw + x) * nbN;
      off.forEach(([dx, dy], k) => { nb[o + k] = ((y + dy + gh) % gh) * gw + ((x + dx + gw) % gw); });
    }
    nbKind = p.neigh;
  };
  neighbours();

  // ---- frequencies and initial phases (deterministic from the seed)
  for (let i = 0; i < gn; i++) z[i] = rng.gauss();
  switch (p.init) {
    case 'ondas': {
      // a few plane waves that wind round the torus (whole numbers of turns, so they cannot unwind smoothly)
      const kx = 1 + rng.int(3), ky = rng.int(3) - 1;
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) th[y * gw + x] = TAU * (kx * x / gw + ky * y / gh) + 0.4 * (rng.next() - 0.5);
      break;
    }
    case 'espirales': {
      // seeded phase vortices of both signs
      const k = 4 + 2 * rng.int(3), pts: Array<[number, number, number]> = [];
      for (let i = 0; i < k; i++) pts.push([rng.next() * gw, rng.next() * gh, i % 2 ? 1 : -1]);
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        let a = 0;
        for (const [px, py, q] of pts) {
          let dx = x + 0.5 - px, dy = y + 0.5 - py;
          dx -= Math.round(dx / gw) * gw; dy -= Math.round(dy / gh) * gh;
          a += q * Math.atan2(dy, dx);
        }
        th[y * gw + x] = a;
      }
      break;
    }
    default:
      for (let i = 0; i < gn; i++) th[i] = rng.next() * TAU;
  }
  for (let i = 0; i < gn; i++) th[i] = ((th[i] % TAU) + TAU) % TAU;

  const step1 = () => {
    neighbours();
    for (let i = 0; i < gn; i++) { sn[i] = Math.sin(th[i]); cs[i] = Math.cos(th[i]); }
    const kn = p.K / nbN, ca = Math.cos(p.lag), sa = Math.sin(p.lag);
    const w0 = TAU * p.freq, dw = TAU * p.spread, dn = p.noise * Math.sqrt(DT);
    for (let i = 0; i < gn; i++) {
      let ss = 0, sc = 0;
      const o = i * nbN;
      for (let k = 0; k < nbN; k++) { const j = nb[o + k]; ss += sn[j]; sc += cs[j]; }
      const si = sn[i], ci = cs[i];
      // Σ sin(θj − θi − α) = Σ sin(θj − θi) cos α − Σ cos(θj − θi) sin α
      const sumSin = ss * ci - sc * si, sumCos = sc * ci + ss * si;
      let t = th[i] + DT * (w0 + dw * z[i] + kn * (sumSin * ca - sumCos * sa));
      if (dn > 0) t += dn * rng.gauss();
      if (t >= TAU) t -= TAU; else if (t < 0) t += TAU;
      th[i] = t < TAU ? t : 0;
    }
    steps++;
  };

  // per-node value of the current view, then the raster upsampled from it
  const val = new Float32Array(gn);
  const views = () => {
    if (p.view === 'destellos') {
      // a flash as the phase passes zero, fading over the next part of the turn (a firefly's cycle)
      for (let i = 0; i < gn; i++) val[i] = Math.exp(-th[i] / FLASH);
      return;
    }
    if (p.view === 'sincronia') {
      // local order parameter over the node and its neighbours
      neighbours();
      for (let i = 0; i < gn; i++) { sn[i] = Math.sin(th[i]); cs[i] = Math.cos(th[i]); }
      for (let i = 0; i < gn; i++) {
        let ss = sn[i], sc = cs[i];
        const o = i * nbN;
        for (let k = 0; k < nbN; k++) { const j = nb[o + k]; ss += sn[j]; sc += cs[j]; }
        const r = Math.hypot(ss, sc) / (nbN + 1);
        val[i] = r * r * r;
      }
      return;
    }
    for (let i = 0; i < gn; i++) val[i] = 0.5 + 0.5 * Math.cos(th[i]);
    if (p.view !== 'vortices') return;
    // phase singularities: the winding of the phase round each 2 × 2 plaquette, drawn over a dim phase
    for (let i = 0; i < gn; i++) val[i] *= 0.22;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const x1 = (x + 1) % gw, y1 = (y + 1) % gh;
      const a = th[y * gw + x], b = th[y * gw + x1], c = th[y1 * gw + x1], d = th[y1 * gw + x];
      const wind = wrapPi(b - a) + wrapPi(c - b) + wrapPi(d - c) + wrapPi(a - d);
      if (Math.abs(wind) < Math.PI) continue;
      const v = wind > 0 ? 1 : 0.75;
      for (const j of [y * gw + x, y * gw + x1, y1 * gw + x1, y1 * gw + x]) if (val[j] < v) val[j] = v;
    }
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = read(np); },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      views();
      const fx = gw / w, fy = gh / h;
      for (let y = 0; y < h; y++) {
        const gy = (y + 0.5) * fy - 0.5, y0 = Math.floor(gy), ty = gy - y0;
        const r0 = ((y0 + gh) % gh) * gw, r1 = ((y0 + 1) % gh) * gw;
        for (let x = 0; x < w; x++) {
          const gx = (x + 0.5) * fx - 0.5, x0 = Math.floor(gx), tx = gx - x0;
          const c0 = (x0 + gw) % gw, c1 = (x0 + 1) % gw;
          const v = (val[r0 + c0] * (1 - tx) + val[r0 + c1] * tx) * (1 - ty) + (val[r1 + c0] * (1 - tx) + val[r1 + c1] * tx) * ty;
          out[y * w + x] = v <= 0 ? 0 : v >= 1 ? TOP : (v * TOP + 0.5) | 0;
        }
      }
    },
    stroke(s: Stroke) {
      // a phase kick: the touched nodes jump ahead by up to half a turn
      const ax = (s.x0 * 0.5 + 0.5) * gw, ay = (0.5 - s.y0) * gh, bx = (s.x1 * 0.5 + 0.5) * gw, by = (0.5 - s.y1) * gh;
      const R = Math.max(1, s.r * gh), len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.ceil(len / Math.max(1, R * 0.5)));
      const kick = Math.PI * (0.3 + 0.7 * s.strength) / (k + 1);
      for (let j = 0; j <= k; j++) {
        const cx = ax + ((bx - ax) * j) / k, cy = ay + ((by - ay) * j) / k;
        for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
          if (d >= 1) continue;
          const i = (((y % gh) + gh) % gh) * gw + (((x % gw) + gw) % gw);
          const t = th[i] + kick * (1 - d * d);
          th[i] = t >= TAU ? t - TAU : t;
        }
      }
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = {};
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { th: th.slice(), z: z.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta simulación.');
      const a = s.arrays;
      const ok = (v: unknown) => v instanceof Float32Array && v.length === gn;
      if (!ok(a.th) || !ok(a.z)) throw new Error('El estado guardado está incompleto.');
      th.set(a.th as Float32Array); z.set(a.z as Float32Array);
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
