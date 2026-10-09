import { Accum, OrbitCamera } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params } from '../types';

/**
 * Strange attractors as density images.
 *  - Iterated maps (a histogram of visits): Clifford x' = sin(a y) + c cos(a x), y' = sin(b x) + d cos(b y);
 *    Peter de Jong x' = sin(a y) − cos(b x), y' = sin(c x) − cos(d y). ORBITS orbits run side by side; each
 *    step adds «Puntos» iterations to a float histogram that first decays by «Estela».
 *  - The Lorenz flow x' = σ(y − x), y' = x(ρ − z) − y, z' = xy − βz (a → σ, b → ρ, c → β, d → speed),
 *    integrated with RK4 for many particles that keep a trail of their last positions, drawn through a
 *    camera that swings slowly in front of the wings (the render depends on t; the state does not).
 * «Deriva» moves the four coefficients along a closed path that starts at their values (integer frequencies,
 * phases from the seed), so the figure morphs and the decaying histogram follows; where the coefficients fall
 * in a periodic window (the orbits land on a few points) the drift crosses it 40 times faster. The picture is
 * the density through a log tone mapping (the maps' histogram lightly blurred for display).
 */

const ID = 'atractor', V = 1;
/**
 * 0..1 → a byte in steps of 4 (64 levels): a sample halfway between two or four texels is then a whole level
 * in both engines (the GPU's float32 and the CPU's float64 would otherwise round an exact .5 apart and pick
 * different glyphs).
 */
const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 252 : ((v * 63 + 0.5) | 0) * 4);

const ORBITS = 256;
const MAX_PARTICLES = 600;
const TRAIL = 120;
const MORPH = 0.35;
const FREQ = [1, 2, 1, 3];

interface P { type: string; a: number; b: number; c: number; d: number; drift: number; trail: number; points: number; zoom: number; gain: number }
const read = (p: Params): P => ({
  type: String(p.type ?? 'clifford'), a: Number(p.a ?? 1.53), b: Number(p.b ?? 2.91), c: Number(p.c ?? 1.63), d: Number(p.d ?? 0.33),
  drift: Number(p.drift ?? 0.15), trail: Number(p.trail ?? 0.6), points: Math.max(1000, Math.min(60000, Math.round(Number(p.points ?? 6000)))),
  zoom: Number(p.zoom ?? 1), gain: Number(p.gain ?? 1),
});

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h, n = w * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  const type = p.type, lorenz = type === 'lorenz';
  let steps = 0, phase = 0;
  // seeded phases of the morph path
  const th = [0, 0, 0, 0].map(() => rng.next() * Math.PI * 2);
  // (the path starts at the coefficients as set: with no drift they are exactly those)
  const coef = (k: number, ph = phase) => [p.a, p.b, p.c, p.d][k] + MORPH * (Math.sin(FREQ[k] * ph + th[k]) - Math.sin(th[k]));

  // ---- maps: histogram and orbits
  const H = new Float32Array(lorenz ? 0 : n);
  const ox = new Float32Array(ORBITS), oy = new Float32Array(ORBITS);
  // ---- Lorenz: particles and their trails (ring buffer by step)
  const NP = lorenz ? MAX_PARTICLES : 0;
  const pos = new Float32Array(NP * 3), trail = new Float32Array(NP * TRAIL * 3);
  let head = 0;

  const lorenzK = () => {
    const sigma = 10 + 2 * coef(0), rho = 28 + 4 * coef(1), beta = (8 / 3) * (1 + 0.25 * coef(2)), tau = 0.006 * Math.pow(2, coef(3) / 3);
    return { sigma, rho, beta: Math.max(0.2, beta), tau };
  };
  const rk4 = (s: Float64Array, sigma: number, rho: number, beta: number, dt: number) => {
    const f = (x: number, y: number, z: number, o: number[]) => { o[0] = sigma * (y - x); o[1] = x * (rho - z) - y; o[2] = x * y - beta * z; };
    const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0];
    f(s[0], s[1], s[2], k1);
    f(s[0] + k1[0] * dt / 2, s[1] + k1[1] * dt / 2, s[2] + k1[2] * dt / 2, k2);
    f(s[0] + k2[0] * dt / 2, s[1] + k2[1] * dt / 2, s[2] + k2[2] * dt / 2, k3);
    f(s[0] + k3[0] * dt, s[1] + k3[1] * dt, s[2] + k3[2] * dt, k4);
    for (let i = 0; i < 3; i++) s[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    // a runaway (outside every range of the parameters) comes back near the origin
    if (!(Math.abs(s[0]) < 1e3 && Math.abs(s[1]) < 1e3 && Math.abs(s[2]) < 1e3)) { s[0] = 1; s[1] = 1; s[2] = 1; }
  };
  const S = new Float64Array(3);

  if (lorenz) {
    // onto the attractor, then a whole trail of positions (one per step, as the steps will add them)
    const { sigma, rho, beta, tau } = lorenzK();
    const sub = Math.max(1, Math.ceil(tau / 0.004)), dt = tau / sub;
    for (let i = 0; i < NP; i++) {
      S[0] = rng.range(-15, 15); S[1] = rng.range(-15, 15); S[2] = rng.range(5, 45);
      for (let k = 0; k < 150; k++) rk4(S, sigma, rho, beta, 0.005);
      for (let t = 0; t < TRAIL; t++) {
        for (let k = 0; k < sub; k++) rk4(S, sigma, rho, beta, dt);
        const o = (i * TRAIL + t) * 3;
        trail[o] = S[0]; trail[o + 1] = S[1]; trail[o + 2] = S[2];
      }
      pos.set(trail.subarray((i * TRAIL + TRAIL - 1) * 3, (i * TRAIL + TRAIL) * 3), i * 3);
    }
    head = TRAIL - 1;
  } else {
    for (let i = 0; i < ORBITS; i++) { ox[i] = rng.range(-1, 1); oy[i] = rng.range(-1, 1); }
  }

  /** Scale from attractor units to domain units (the map's bounding box fitted to the frame's height). */
  const fit = () => {
    const X = type === 'dejong' ? 2 : 1 + Math.abs(p.c) + MORPH, Y = type === 'dejong' ? 2 : 1 + Math.abs(p.d) + MORPH;
    return p.zoom * Math.min(0.96 / X, 0.47 / Y);
  };

  // pixels hit in the current step (scratch, by a generation that only grows: not part of the state)
  const mark = new Int32Array(lorenz ? 0 : n);
  let gen = 0;
  /** Iterates the map; returns how many distinct pixels this step's points landed on. */
  const stepMap = () => {
    gen++;
    let distinct = 0;
    const decay = Math.pow(0.5, 1 / (3 + 300 * p.trail * p.trail));
    for (let i = 0; i < n; i++) H[i] *= decay;
    const a = coef(0), b = coef(1), c = coef(2), d = coef(3);
    const per = Math.max(1, Math.round(p.points / ORBITS));
    // pixel of a point: nearest one (pixel centres at i + 0.5; the display blur smooths the histogram)
    const s = fit() * h, cxp = w / 2, cyp = h / 2;
    const deposit = (x: number, y: number) => {
      const fx = cxp + x * s, fy = cyp - y * s;
      if (!(fx >= 0 && fy >= 0 && fx < w && fy < h)) return;
      const j = (fy | 0) * w + (fx | 0);
      H[j] += 1;
      if (mark[j] !== gen) { mark[j] = gen; distinct++; }
    };
    if (type === 'dejong') {
      for (let o = 0; o < ORBITS; o++) {
        let x = ox[o], y = oy[o];
        for (let k = 0; k < per; k++) {
          const nx = Math.sin(a * y) - Math.cos(b * x), ny = Math.sin(c * x) - Math.cos(d * y);
          x = nx; y = ny;
          deposit(x, y);
        }
        ox[o] = x; oy[o] = y;
      }
    } else {
      for (let o = 0; o < ORBITS; o++) {
        let x = ox[o], y = oy[o];
        for (let k = 0; k < per; k++) {
          const nx = Math.sin(a * y) + c * Math.cos(a * x), ny = Math.sin(b * x) + d * Math.cos(b * y);
          x = nx; y = ny;
          deposit(x, y);
        }
        ox[o] = x; oy[o] = y;
      }
    }
    return distinct;
  };

  const stepLorenz = () => {
    const { sigma, rho, beta, tau } = lorenzK();
    const sub = Math.max(1, Math.ceil(tau / 0.004)), dt = tau / sub;
    const np = Math.min(NP, Math.round(p.points / 100));
    head = (head + 1) % TRAIL;
    for (let i = 0; i < NP; i++) {
      // (resting particles keep their place, so that their trail stays whole if they wake up)
      if (i < np) {
        S[0] = pos[i * 3]; S[1] = pos[i * 3 + 1]; S[2] = pos[i * 3 + 2];
        for (let k = 0; k < sub; k++) rk4(S, sigma, rho, beta, dt);
        pos[i * 3] = S[0]; pos[i * 3 + 1] = S[1]; pos[i * 3 + 2] = S[2];
      }
      const o = (i * TRAIL + head) * 3;
      trail[o] = pos[i * 3]; trail[o + 1] = pos[i * 3 + 1]; trail[o + 2] = pos[i * 3 + 2];
    }
  };

  // ---- render
  const acc = new Float32Array(n);
  const soft = new Accum(lorenz ? 1 : w, lorenz ? 1 : h), tmp = new Float32Array(lorenz ? 1 : n);
  const cam = new OrbitCamera();
  const P = new Float64Array(3), Q = new Float64Array(3);
  const deposit = (fx: number, fy: number, v: number) => {
    const ix = Math.floor(fx), iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= w - 1 || iy >= h - 1) return;
    const tx = fx - ix, ty = fy - iy, j = iy * w + ix;
    acc[j] += v * (1 - tx) * (1 - ty); acc[j + 1] += v * tx * (1 - ty); acc[j + w] += v * (1 - tx) * ty; acc[j + w + 1] += v * tx * ty;
  };
  const tone = (src: Float32Array, out: Uint8Array) => {
    // log tone mapping, normalised by the mean of the visited pixels so that the exposure does not depend
    // on how much has been accumulated
    let sum = 0, cnt = 0;
    for (let i = 0; i < n; i++) if (src[i] > 0) { sum += src[i]; cnt++; }
    if (!cnt || sum <= 0) { out.fill(0, 0, n); return; }
    const k = (cnt / sum) * 0.35 * p.gain, L = 1 / Math.log(1 + 12);
    for (let i = 0; i < n; i++) {
      const v = Math.log(1 + 12 * Math.min(1, src[i] * k)) * L;
      out[i] = byte(v);
    }
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = { ...read(np), type }; },
    step(k: number) {
      for (let i = 0; i < k; i++) {
        // a periodic window (the orbits fall onto a few points) is crossed 40 times faster while drifting
        let hurry = 1;
        if (lorenz) stepLorenz();
        else if (stepMap() < Math.max(64, p.points / 100)) hurry = 40;
        phase = (phase + p.drift * 0.004 * hurry) % (Math.PI * 2);
        steps++;
      }
    },
    render(out: Uint8Array, t: number) {
      if (!lorenz) {
        // a light blur of a copy: a dusty attractor reads as a cloud, not as noise, at the size of a glyph
        soft.d.set(H);
        soft.blur(1, false, tmp);
        tone(soft.d, out);
        return;
      }
      acc.fill(0);
      const { rho } = lorenzK();
      // the camera swings ±35° around the view that separates the wings most (their fixed points lie along
      // x = y); edge-on, the wings would collapse into a line
      cam.set(Math.PI / 4 + 0.6 * Math.sin(th[0] + (t * Math.PI * 2) / 60), 0.2, 3.2);
      cam.fov = 3 * p.zoom;
      const k = 1 / 22, zc = Math.max(1, rho - 1);
      const np = Math.min(NP, Math.round(p.points / 100));
      const len = Math.max(2, Math.round(TRAIL * (0.15 + 0.85 * p.trail)));
      for (let i = 0; i < np; i++) {
        let has = false;
        for (let a = 0; a < len - 1; a++) {
          const o = (i * TRAIL + ((head - a + TRAIL) % TRAIL)) * 3;
          // model space: Lorenz z is up, centred on the wings' fixed points
          if (!cam.project(trail[o] * k, (trail[o + 2] - zc) * k, trail[o + 1] * k, Q)) { has = false; continue; }
          if (has) {
            const ax = (P[0] * 0.5 + 0.5) * w, ay = (0.5 - P[1]) * h, bx = (Q[0] * 0.5 + 0.5) * w, by = (0.5 - Q[1]) * h;
            const ex = bx - ax, ey = by - ay, segs = Math.min(16, Math.max(1, Math.ceil(Math.sqrt(ex * ex + ey * ey) / 0.8)));
            const v = (1 - a / len) / segs;
            for (let s = 0; s < segs; s++) deposit(ax + ((bx - ax) * (s + 0.5)) / segs - 0.5, ay + ((by - ay) * (s + 0.5)) / segs - 0.5, v);
          }
          P[0] = Q[0]; P[1] = Q[1]; P[2] = Q[2];
          has = true;
        }
      }
      tone(acc, out);
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { phase, head };
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { H: H.slice(), ox: ox.slice(), oy: oy.slice(), pos: pos.slice(), trail: trail.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a este atractor.');
      const A = s.arrays;
      const ok = A.H instanceof Float32Array && A.H.length === H.length && A.ox instanceof Float32Array && A.ox.length === ORBITS
        && A.oy instanceof Float32Array && A.oy.length === ORBITS && A.pos instanceof Float32Array && A.pos.length === pos.length
        && A.trail instanceof Float32Array && A.trail.length === trail.length;
      if (!ok) throw new Error('El estado guardado está incompleto.');
      H.set(A.H); ox.set(A.ox); oy.set(A.oy); pos.set(A.pos); trail.set(A.trail);
      phase = s.scalars.phase ?? 0; head = s.scalars.head ?? 0;
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
