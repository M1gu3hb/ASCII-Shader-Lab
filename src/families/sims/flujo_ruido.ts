import { Accum } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * «Líneas de flujo» (I-01, I-31: «Mejora de campo_flujo»): where campo_flujo draws regular sines, here thousands
 * of particles follow the angle of a noise field, θ = «Dirección» + 2π·«Enredo»·N(p, t), and leave ink on a canvas
 * that fades (each step every pixel keeps e^(−dt/«Estela») of its ink). The trails are the field's streamlines:
 * they curl, knot and part where the noise turns, and they change as the noise slides through time. A particle
 * lives a while («Vida») and is born again somewhere else, so the canvas keeps being drawn.
 *  - N is a 3D gradient noise (seeded permutation, quintic fade), periodic across the domain in x and y (its lattice
 *    wraps every «Remolinos» cells per screen height), so the canvas tiles without a seam and the particles live on
 *    a torus; its third coordinate is time («Cambio del campo»). «Detalle» adds an octave at twice the frequency.
 *  - The ink is additive (where trails cross or crowd, it darkens like ink) and read through 1 − e^(−k·ink).
 * Written from the idea of a flow field (particles stepping along a noise angle), not from any code.
 */

const ID = 'flujo_ruido', V = 1, RATE = 30, DT = 1 / RATE;
const MAX_PARTICLES = 3000;

/**
 * 0..1 → a byte in steps of 4 (64 levels): a sample halfway between two or four texels is then a whole level
 * in both engines (the GPU's float32 and the CPU's float64 would otherwise round an exact .5 apart).
 */
const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 252 : ((v * 63 + 0.5) | 0) * 4);

interface P {
  count: number; cells: number; tangle: number; detail: number; speed: number; trail: number;
  evolve: number; life: number; wind: number; width: number; ink: number;
}
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const read = (p: Params): P => ({
  count: Math.max(50, Math.min(MAX_PARTICLES, Math.round(num(p.count, 600)))), cells: Math.max(1, Math.min(8, Math.round(num(p.cells, 3)))),
  tangle: num(p.tangle, 1), detail: num(p.detail, 0.4), speed: num(p.speed, 0.35), trail: Math.max(0.1, num(p.trail, 3)),
  evolve: num(p.evolve, 0.3), life: Math.max(0.2, num(p.life, 4)), wind: num(p.wind, 0), width: num(p.width, 0.4), ink: num(p.ink, 1),
});

/**
 * The noise field of a seed: angle(x, y, τ, …) in radians at a domain point (x ∈ [−1, 1), y ∈ [−0.5, 0.5)) at
 * τ seconds. Periodic in x (period 2) and y (period 1) for any whole number of cells. Exported for the tests.
 */
export function flowField(seed: string) {
  const rng = new SimRng(`${ID}|${V}|${seed}|campo`);
  const perm = new Uint8Array(512);
  const a = new Uint8Array(256);
  for (let i = 0; i < 256; i++) a[i] = i;
  for (let i = 255; i > 0; i--) { const j = rng.int(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = a[i & 255];
  const GX = [1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0], GY = [1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1], GZ = [0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1];
  const gx = new Float64Array(512), gy = new Float64Array(512), gz = new Float64Array(512);
  for (let i = 0; i < 512; i++) { const g = perm[i] % 12; gx[i] = GX[g]; gy[i] = GY[g]; gz[i] = GZ[g]; }
  const fade = (f: number) => f * f * f * (f * (f * 6 - 15) + 10);
  /** Gradient noise at lattice coordinates (x, y, z), its lattice wrapping every px cells in x and py in y. */
  const noise = (x: number, y: number, z: number, px: number, py: number) => {
    const fx0 = Math.floor(x), fy0 = Math.floor(y), fz0 = Math.floor(z);
    const fx = x - fx0, fy = y - fy0, fz = z - fz0;
    const x0 = ((fx0 % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((fy0 % py) + py) % py, y1 = (y0 + 1) % py, z0 = fz0 & 255, z1 = (z0 + 1) & 255;
    const u = fade(fx), v = fade(fy), w = fade(fz);
    const c = (ix: number, iy: number, iz: number, dx: number, dy: number, dz: number) => {
      const h = perm[perm[perm[ix] + iy] + iz];
      return gx[h] * dx + gy[h] * dy + gz[h] * dz;
    };
    const n000 = c(x0, y0, z0, fx, fy, fz), n100 = c(x1, y0, z0, fx - 1, fy, fz);
    const n010 = c(x0, y1, z0, fx, fy - 1, fz), n110 = c(x1, y1, z0, fx - 1, fy - 1, fz);
    const n001 = c(x0, y0, z1, fx, fy, fz - 1), n101 = c(x1, y0, z1, fx - 1, fy, fz - 1);
    const n011 = c(x0, y1, z1, fx, fy - 1, fz - 1), n111 = c(x1, y1, z1, fx - 1, fy - 1, fz - 1);
    const nx00 = n000 + u * (n100 - n000), nx10 = n010 + u * (n110 - n010), nx01 = n001 + u * (n101 - n001), nx11 = n011 + u * (n111 - n011);
    const nxy0 = nx00 + v * (nx10 - nx00), nxy1 = nx01 + v * (nx11 - nx01);
    return nxy0 + w * (nxy1 - nxy0);
  };
  return {
    noise,
    /** The flow's angle at (x, y) at τ seconds. */
    angle(x: number, y: number, tau: number, p: { cells: number; tangle: number; detail: number; evolve: number; wind: number }) {
      const c = p.cells, px = 2 * c, z = tau * p.evolve * 0.35;
      // lattice coordinates: the domain [−1, 1) × [−0.5, 0.5) spans px × c cells
      const lx = (x + 1) * c, ly = (y + 0.5) * c;
      let n = noise(lx, ly, z, px, c);
      if (p.detail > 0) n += 0.5 * p.detail * noise(lx * 2 + 0.5, ly * 2 + 0.5, z * 1.7 + 31.3, px * 2, c * 2);
      return (p.wind * Math.PI) / 180 + 2 * Math.PI * p.tangle * n;
    },
  };
}

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h, n = w * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  const field = flowField(cfg.seed);
  let p = read(cfg.params);
  let steps = 0;

  // particles on the torus x ∈ [−1, 1), y ∈ [−0.5, 0.5)
  const pos = new Float32Array(MAX_PARTICLES * 2), age = new Float32Array(MAX_PARTICLES), span = new Float32Array(MAX_PARTICLES);
  const spawn = (i: number, first: boolean) => {
    pos[i * 2] = rng.range(-1, 1); pos[i * 2 + 1] = rng.range(-0.5, 0.5);
    span[i] = rng.range(0.5, 1.5);
    age[i] = first ? rng.next() * span[i] : 0;
  };
  for (let i = 0; i < MAX_PARTICLES; i++) spawn(i, true);

  // the canvas of ink (memory: it only fades)
  const acc = new Accum(w, h), ink = acc.d;
  const view = new Accum(w, h), tmp = new Float32Array(n);

  /** Adds ink along a short step from (ax, ay) to (bx, by) (pixels), split into bilinear samples a pixel apart. */
  const deposit = (ax: number, ay: number, bx: number, by: number, amount: number) => {
    const len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.ceil(len));
    const a = amount / k;
    for (let s = 0; s < k; s++) {
      const f = (s + 0.5) / k, x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
      const fx = x - 0.5, fy = y - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const x0 = ((ix % w) + w) % w, x1 = (x0 + 1) % w, y0 = ((iy % h) + h) % h, y1 = (y0 + 1) % h;
      ink[y0 * w + x0] += a * (1 - tx) * (1 - ty); ink[y0 * w + x1] += a * tx * (1 - ty);
      ink[y1 * w + x0] += a * (1 - tx) * ty; ink[y1 * w + x1] += a * tx * ty;
    }
  };

  const step1 = () => {
    const tau = steps * DT;
    const keep = Math.exp(-DT / p.trail);
    for (let i = 0; i < n; i++) ink[i] *= keep;
    const v = p.speed * 0.6 * DT, np = p.count;
    // ink per step and particle: in the steady state the canvas holds about the same ink whatever the number of
    // particles and the trail's length (those change how it is drawn, not how much); «Tinta» sets how much
    const amount = (0.35 * p.ink * n) / (np * RATE * Math.max(0.5, p.trail));
    const life = p.life;
    for (let i = 0; i < np; i++) {
      const o = i * 2;
      const x = pos[o], y = pos[o + 1];
      const th = field.angle(x, y, tau, p);
      let nx = x + Math.cos(th) * v, ny = y + Math.sin(th) * v;
      // across the edge: the torus (no ink for this step, the line would cross the canvas)
      let wrapped = false;
      if (nx >= 1) { nx -= 2; wrapped = true; } else if (nx < -1) { nx += 2; wrapped = true; }
      if (ny >= 0.5) { ny -= 1; wrapped = true; } else if (ny < -0.5) { ny += 1; wrapped = true; }
      if (!wrapped) {
        // a fresh particle fades in over its first steps (no blot where it is born)
        const fadeIn = Math.min(1, age[i] / (0.25 * span[i] * life + DT));
        deposit((x * 0.5 + 0.5) * w, (0.5 - y) * h, (nx * 0.5 + 0.5) * w, (0.5 - ny) * h, amount * fadeIn);
      }
      pos[o] = nx; pos[o + 1] = ny;
      age[i] += DT;
      if (age[i] >= span[i] * life) spawn(i, false);
    }
    steps++;
  };

  const render = (out: Uint8Array) => {
    // soft passes for the view only (the state keeps its ink): wider lines with «Grosor»
    view.d.set(ink);
    const passes = Math.round(2 * p.width);
    if (passes > 0) view.blur(passes, true, tmp);
    // exposure against the mean ink where there is ink: a sparse field of lines and a dense tangle both read
    // across the ramp; «Tinta» sets the exposure
    const d = view.d;
    let all = 0;
    for (let i = 0; i < n; i++) all += d[i];
    all /= n;
    let sum = 0, cnt = 0;
    const lo = 0.2 * all;
    for (let i = 0; i < n; i++) if (d[i] > lo) { sum += d[i]; cnt++; }
    if (!cnt || sum <= 0) { out.fill(0, 0, n); return; }
    // the old, faint end of the trails is cut (θ): a trail reads as a line that ends, not as a haze; a crowded river
    // of streamlines saturates softly
    const m = sum / cnt, th = 0.25 * m, g = (1.4 * p.ink) / m;
    for (let i = 0; i < n; i++) out[i] = byte(1 - Math.exp(-Math.max(0, d[i] - th) * g));
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = read(np); },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) { render(out); },
    stroke(s: Stroke) {
      // fresh particles along the stroke: they set off along the field from there
      const cnt = Math.min(p.count, Math.round(20 + 180 * Math.max(0, Math.min(1, s.strength))));
      for (let k = 0; k < cnt; k++) {
        const i = rng.int(p.count), f = rng.next();
        pos[i * 2] = Math.max(-1, Math.min(0.999, s.x0 + (s.x1 - s.x0) * f + rng.gauss() * s.r * 0.5));
        pos[i * 2 + 1] = Math.max(-0.5, Math.min(0.499, s.y0 + (s.y1 - s.y0) * f + rng.gauss() * s.r * 0.5));
        age[i] = 0.25 * span[i] * p.life;
      }
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = {};
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { pos: pos.slice(), age: age.slice(), span: span.slice(), ink: ink.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a estas líneas de flujo.');
      const A = s.arrays;
      const ok = (x: unknown, len: number): x is Float32Array => x instanceof Float32Array && x.length === len;
      if (!ok(A.pos, pos.length) || !ok(A.age, age.length) || !ok(A.span, span.length) || !ok(A.ink, n)) throw new Error('El estado guardado está incompleto.');
      pos.set(A.pos); age.set(A.age); span.set(A.span); ink.set(A.ink);
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
