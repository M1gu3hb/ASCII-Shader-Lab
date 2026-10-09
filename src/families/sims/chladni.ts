import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Chladni figures: sand on a plate vibrating in one of its standing-wave modes gathers on the nodal lines,
 * where the plate does not move. The modes, from the classic closed forms:
 *  - square plate (x, y ∈ [0, 1]): u = cos(nπx) cos(mπy) + c · cos(mπx) cos(nπy), with c = «Mezcla»
 *    (−1: the antisymmetric figures Chladni drew; +1: the symmetric ones);
 *  - circular plate (r ∈ [0, 1]): u = J_n(k r) cos(nθ), k the m-th zero of J_n' (free edge), plus «Mezcla»
 *    of the ring mode J_0 of the same order. J_n comes from its integral form (trapezoid rule, which
 *    converges exponentially for this periodic integrand); the zeros, by scanning and bisection, cached.
 * Each grain does a seeded random walk whose step is proportional to |u| where it stands: it bounces where
 * the plate moves and rests where it does not, so its density ends up ∝ 1/u² and draws the nodal lines.
 * A mode sequence moves to other (n, m) every few seconds with a smooth blend, and the sand migrates.
 * The picture: grain density accumulated with persistence, the field's nodal lines, or both.
 */

const ID = 'chladni', V = 1;
const hyp = (x: number, y: number) => Math.sqrt(x * x + y * y);
const RATE = 30;
const MAX_SAND = 40000;
const G = 128;
/** Plate half-size in domain units (the plate is centred, a square or a disc of this radius). */
const HALF = 0.47;

interface P { plate: string; n: number; m: number; mix: number; seq: string; count: number; agit: number; persist: number; view: string }
const read = (p: Params): P => ({
  plate: String(p.plate ?? 'cuadrada'),
  n: Math.max(0, Math.min(10, Math.round(Number(p.n ?? 3)))), m: Math.max(1, Math.min(10, Math.round(Number(p.m ?? 5)))),
  mix: Number(p.mix ?? -1), seq: String(p.seq ?? 'fijo'),
  count: Math.max(1000, Math.min(MAX_SAND, Math.round(Number(p.count ?? 5000)))),
  agit: Number(p.agit ?? 1), persist: Number(p.persist ?? 0.85), view: String(p.view ?? 'arena'),
});

/* ---------------- Bessel functions ---------------- */

/** J_n(x) = (1/π) ∫₀^π cos(nτ − x sin τ) dτ, by the trapezoid rule. */
export function besselJ(n: number, x: number): number {
  if (n < 0) return (n & 1 ? -1 : 1) * besselJ(-n, x);
  const M = 48 + Math.ceil(Math.abs(x) + n);
  let s = 0.5 * (1 + Math.cos(n * Math.PI));
  for (let k = 1; k < M; k++) { const t = (Math.PI * k) / M; s += Math.cos(n * t - x * Math.sin(t)); }
  return s / M;
}

const zeroCache = new Map<string, number>();
/** The m-th positive zero of J_n' (m ≥ 1), from a scan and bisection; x = 0 is not counted. */
export function besselDerivZero(n: number, m: number): number {
  const key = `${n}|${m}`;
  const hit = zeroCache.get(key);
  if (hit !== undefined) return hit;
  const d = (x: number) => 0.5 * (besselJ(n - 1, x) - besselJ(n + 1, x));
  let found = 0, x0 = 0.3, f0 = d(x0), z = NaN;
  for (let x1 = x0 + 0.05; x1 < 80; x1 += 0.05) {
    const f1 = d(x1);
    if (f0 === 0 || f0 * f1 < 0) {
      let a = x0, b = x1, fa = f0;
      for (let i = 0; i < 50; i++) { const c = 0.5 * (a + b), fc = d(c); if (fa * fc <= 0) b = c; else { a = c; fa = fc; } }
      if (++found === m) { z = 0.5 * (a + b); break; }
    }
    x0 = x1; f0 = f1;
  }
  zeroCache.set(key, z);
  return z;
}

/* ---------------- mode fields ---------------- */

/** u on a G × G grid over the plate's box, scaled so that max |u| = 1 (0 outside a circular plate). */
export function modeField(plate: string, n: number, m: number, mix: number): Float32Array {
  const f = new Float32Array(G * G);
  if (plate === 'circular') {
    const k = besselDerivZero(n, m), k0 = besselDerivZero(0, m), w0 = (1 + mix) * 0.5;
    // radial profiles tabulated once
    const R = 512, jn = new Float32Array(R + 1), j0 = new Float32Array(R + 1);
    for (let i = 0; i <= R; i++) { jn[i] = besselJ(n, (k * i) / R); j0[i] = w0 > 0 ? besselJ(0, (k0 * i) / R) : 0; }
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const px = ((x + 0.5) / G) * 2 - 1, py = ((y + 0.5) / G) * 2 - 1, r = hyp(px, py);
      if (r > 1) continue;
      const t = r * R, i = Math.min(R - 1, Math.floor(t)), a = t - i;
      const radial = jn[i] + (jn[i + 1] - jn[i]) * a, ring = j0[i] + (j0[i + 1] - j0[i]) * a;
      f[y * G + x] = radial * Math.cos(n * Math.atan2(py, px)) + w0 * ring;
    }
  } else {
    const cn = new Float32Array(G), cm = new Float32Array(G);
    for (let i = 0; i < G; i++) { const s = (i + 0.5) / G; cn[i] = Math.cos(n * Math.PI * s); cm[i] = Math.cos(m * Math.PI * s); }
    // n = m: both terms are the same product, kept as one
    const c = n === m ? 0 : mix;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) f[y * G + x] = cn[x] * cm[y] + c * cm[x] * cn[y];
  }
  let mx = 0;
  for (let i = 0; i < f.length; i++) mx = Math.max(mx, Math.abs(f[i]));
  if (mx > 0) for (let i = 0; i < f.length; i++) f[i] /= mx;
  return f;
}

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  const N = p.count;
  // grains in plate coordinates (−1..1 on both axes), the accumulated density
  const pos = new Float32Array(N * 2), dens = new Float32Array(w * h);
  let steps = 0;
  const inside = (x: number, y: number) => (p.plate === 'circular' ? x * x + y * y <= 1 : x >= -1 && x <= 1 && y >= -1 && y <= 1);
  for (let i = 0; i < N; i++) {
    let x = 0, y = 0;
    do { x = rng.range(-1, 1); y = rng.range(-1, 1); } while (x * x + y * y > 1 && p.plate === 'circular');
    pos[i * 2] = x; pos[i * 2 + 1] = y;
  }
  // the sequence of modes after the first (the first is «Modo n», «Modo m»), from the seed
  const SEQ = 32, seqSq: Array<[number, number]> = [], seqCi: Array<[number, number]> = [];
  for (let k = 0; k < SEQ; k++) {
    let a = 1, b = 1;
    do { a = 1 + rng.int(8); b = 1 + rng.int(8); } while (a === b || (k > 0 && a === seqSq[k - 1][0] && b === seqSq[k - 1][1]));
    seqSq.push([a, b]);
    let c = 0, d = 1;
    do { c = rng.int(7); d = 1 + rng.int(4); } while (k > 0 && c === seqCi[k - 1][0] && d === seqCi[k - 1][1]);
    seqCi.push([c, d]);
  }

  // fields, cached by mode
  const cache = new Map<string, Float32Array>();
  const field = (n: number, m: number) => {
    const key = `${p.plate}|${n}|${m}|${p.mix}`;
    let f = cache.get(key);
    if (!f) {
      f = modeField(p.plate, n, m, p.mix);
      cache.set(key, f);
      if (cache.size > 8) cache.delete(cache.keys().next().value as string);
    }
    return f;
  };
  /** The mode at simulated time T: the two fields and the blend between them. */
  const modeAt = (T: number): { a: Float32Array; b: Float32Array; s: number } => {
    const first = field(p.n, p.m);
    if (p.seq === 'fijo') return { a: first, b: first, s: 0 };
    const period = p.seq === 'rapido' ? 3.5 : 9, blend = period * 0.3;
    const k = Math.floor(T / period), t = T - k * period;
    const list = p.plate === 'circular' ? seqCi : seqSq;
    const at = (i: number) => (i === 0 ? first : field(list[(i - 1) % SEQ][0], list[(i - 1) % SEQ][1]));
    const sm = t < period - blend ? 0 : (t - (period - blend)) / blend;
    return { a: at(k), b: at(k + 1), s: sm * sm * (3 - 2 * sm) };
  };
  /** Bilinear lookup of a field at plate coordinates. */
  const look = (f: Float32Array, x: number, y: number) => {
    const fx = Math.min(G - 1.001, Math.max(0, (x * 0.5 + 0.5) * G - 0.5)), fy = Math.min(G - 1.001, Math.max(0, (y * 0.5 + 0.5) * G - 0.5));
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, o = y0 * G + x0;
    return (f[o] * (1 - tx) + f[o + 1] * tx) * (1 - ty) + (f[o + G] * (1 - tx) + f[o + G + 1] * tx) * ty;
  };
  // plate coordinates → raster pixels
  const toPx = (x: number) => (x * HALF * 0.5 + 0.5) * w - 0.5;
  const toPy = (y: number) => (0.5 - y * HALF) * h - 0.5;

  const step1 = () => {
    const { a, b, s } = modeAt(steps / RATE);
    const blend = s > 0 && a !== b;
    const amp = 0.07 * p.agit, circ = p.plate === 'circular';
    for (let i = 0; i < N; i++) {
      let x = pos[i * 2], y = pos[i * 2 + 1];
      const u = blend ? (1 - s) * look(a, x, y) + s * look(b, x, y) : look(a, x, y);
      const st = amp * (Math.abs(u) + 0.015);
      x += (rng.next() * 2 - 1) * st; y += (rng.next() * 2 - 1) * st;
      // the plate's edge reflects the grains back
      if (circ) {
        const r = hyp(x, y);
        if (r > 1) { const k = (2 - r) / r; x *= k; y *= k; }
      } else {
        if (x > 1) x = 2 - x; else if (x < -1) x = -2 - x;
        if (y > 1) y = 2 - y; else if (y < -1) y = -2 - y;
      }
      pos[i * 2] = x; pos[i * 2 + 1] = y;
    }
    // density with persistence: the old picture fades, every grain adds where it is
    const k = p.persist;
    for (let i = 0; i < dens.length; i++) dens[i] *= k;
    for (let i = 0; i < N; i++) {
      const fx = toPx(pos[i * 2]), fy = toPy(pos[i * 2 + 1]);
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
      const tx = fx - x0, ty = fy - y0, o = y0 * w + x0;
      dens[o] += (1 - tx) * (1 - ty); dens[o + 1] += tx * (1 - ty); dens[o + w] += (1 - tx) * ty; dens[o + w + 1] += tx * ty;
    }
    steps++;
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) {
      const q = { ...read(np), count: N };
      if (q.plate !== p.plate || q.mix !== p.mix) cache.clear();
      p = q;
    },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      // sand: density relative to an even spread over the plate (log tone), so the brightness does not
      // depend on the number of grains or the persistence
      const area = p.plate === 'circular' ? Math.PI * (HALF * h) ** 2 : (2 * HALF * h) ** 2;
      const norm = ((1 - p.persist) * area) / N;
      const sand = p.view !== 'campo', fieldOn = p.view !== 'arena';
      const { a, b, s } = fieldOn ? modeAt(steps / RATE) : { a: null, b: null, s: 0 };
      const lg = 1 / Math.log(1 + 6);
      for (let py = 0; py < h; py++) {
        const y = (0.5 - (py + 0.5) / h) / HALF;
        for (let px = 0; px < w; px++) {
          const x = (((px + 0.5) / w) * 2 - 1) / HALF, i = py * w + px;
          if (!inside(x, y)) { out[i] = 0; continue; }
          let v = 0;
          if (sand) v = Math.log(1 + 6 * Math.min(4, dens[i] * norm * 0.35)) * lg * 0.82;
          if (fieldOn && a && b) {
            const u = Math.abs(s > 0 ? (1 - s) * look(a, x, y) + s * look(b, x, y) : look(a, x, y));
            // nodal lines bright, the rest a faint relief of |u|
            const line = Math.exp(-(u * u) / 0.0016), relief = 0.12 * (1 - u);
            v = sand ? Math.max(v, 0.38 * line) : Math.max(line, relief);
          }
          // the plate itself reads as a faint ground
          v = Math.max(v, 0.05);
          out[i] = v >= 1 ? 255 : (v * 255 + 0.5) | 0;
        }
      }
    },
    stroke(st: Stroke) {
      // «Golpe»: the grains under the touch jump away at random (up to twice the radius)
      const cx = st.x1 / HALF, cy = st.y1 / HALF, R = Math.max(0.04, st.r) / HALF, R2 = R * R, jump = 2 * R * st.strength;
      for (let i = 0; i < N; i++) {
        const dx = pos[i * 2] - cx, dy = pos[i * 2 + 1] - cy;
        if (dx * dx + dy * dy > R2) continue;
        let x = pos[i * 2] + (rng.next() * 2 - 1) * jump, y = pos[i * 2 + 1] + (rng.next() * 2 - 1) * jump;
        if (!inside(x, y)) { x = pos[i * 2]; y = pos[i * 2 + 1]; }
        pos[i * 2] = x; pos[i * 2 + 1] = y;
      }
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = {};
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { pos: pos.slice(), dens: dens.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta placa.');
      const a = s.arrays;
      if (!(a.pos instanceof Float32Array) || a.pos.length !== N * 2 || !(a.dens instanceof Float32Array) || a.dens.length !== w * h) throw new Error('El estado guardado está incompleto.');
      pos.set(a.pos); dens.set(a.dens);
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
