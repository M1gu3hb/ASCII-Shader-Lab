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
 *  - Other flows in 3D, drawn the same way (FLOWS): Thomas' cyclically symmetric x' = sin y − bx (and its
 *    rotations), Aizawa's shell around an axis and Halvorsen's three blades.
 * «Deriva» moves the four coefficients along a closed path that starts at their values (integer frequencies,
 * phases from the seed), so the figure morphs and the decaying histogram follows; where the coefficients fall
 * in a periodic window (the orbits land on a few points) the drift crosses it 40 times faster. The picture is
 * the density through a log tone mapping (the maps' histogram lightly blurred for display).
 *
 * Algorithm version 2 (recipes made with version 1 keep their path, cfg.v === 1): a few map orbits start afresh
 * every step. In version 1, after a periodic window every orbit sat on the same cycle and kept on one shared
 * trajectory once the drift left it, so a single orbit drew the whole picture: sparse dust that the drift then
 * crossed 40 times faster, for good.
 *
 * Depth (both versions; new parameters whose defaults draw what version 1 drew): «Relieve» lights the maps'
 * density as a height field (ribbons with a lit and a shaded side) and dims the far parts of a 3D flow;
 * «Capas» shows, behind the fresh picture, a slow and out-of-focus memory of the earlier shapes (maps) or the
 * whole trail dimly (flows).
 */

const ID = 'atractor', V = 2;
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
/** Version 2: map orbits started afresh per step, and the transient they run off the record. */
const RENEW = 4, TRANSIENT = 24;
/** Half-life of the maps' slow memory («Capas»), in steps. */
const GHOST_HALF = 600;

/**
 * Flows other than Lorenz: the vector field (coefficients from the four drifting sliders), the step in time,
 * the box they live in (centre and scale to model units, about ±1) and the view.
 */
interface Flow {
  coef(c: (k: number) => number, o: Float64Array): void;
  f(x: number, y: number, z: number, k: Float64Array, o: Float64Array): void;
  /** Integration time per simulation step, before «d» (speed). */
  tau: number;
  /** Largest sub-step (stability). */
  dt: number;
  center: [number, number, number];
  scale: number;
  /** Where particles start, around a point in the attractor's basin (Aizawa also has a stable fixed point below). */
  spawn: [number, number, number, number];
  /** Camera: a full turn every `orbit` seconds (0: a ±`swing` rad sway every 60 s), its pitch and field of view. */
  orbit: number; swing: number; pitch: number; fov: number;
}
const FLOWS: Record<string, Flow> = {
  thomas: {
    // b from 0.175 to 0.19 (chaotic and spread out: below it wanders off, above it gathers on one side)
    coef: (c, o) => { o[0] = 0.1825 + 0.0025 * c(0); },
    f: (x, y, z, k, o) => { o[0] = Math.sin(y) - k[0] * x; o[1] = Math.sin(z) - k[0] * y; o[2] = Math.sin(x) - k[0] * z; },
    tau: 0.075, dt: 0.05, center: [0, 0, 0], scale: 1 / 4.4, spawn: [0.1, 0.3, -0.2, 1],
    orbit: 90, swing: 0, pitch: 0.35, fov: 2.9,
  },
  aizawa: {
    // α and δ (the turn around the axis) inside a chaotic patch: around it periodic windows abound
    coef: (c, o) => { o[0] = 0.995 + 0.004 * c(0); o[1] = 3.51 + 0.015 * c(1); o[2] = 0.1; },
    f: (x, y, z, k, o) => {
      o[0] = (z - 0.7) * x - k[1] * y;
      o[1] = k[1] * x + (z - 0.7) * y;
      o[2] = 0.6 + k[0] * z - (z * z * z) / 3 - (x * x + y * y) * (1 + 0.25 * z) + k[2] * z * x * x * x;
    },
    tau: 0.012, dt: 0.006, center: [0, 0, 0.73], scale: 1 / 1.4, spawn: [0.1, 0, 0.3, 0.3],
    orbit: 0, swing: 0.5, pitch: 0.42, fov: 2.7,
  },
  halvorsen: {
    // a from 1.40 to 1.48: the widest chaos (a periodic window opens at 1.5)
    coef: (c, o) => { o[0] = 1.44 + 0.012 * c(0); },
    f: (x, y, z, k, o) => {
      const a = k[0];
      o[0] = -a * x - 4 * y - 4 * z - y * y;
      o[1] = -a * y - 4 * z - 4 * x - z * z;
      o[2] = -a * z - 4 * x - 4 * y - x * x;
    },
    tau: 0.0045, dt: 0.003, center: [-3.6, -3.6, -3.6], scale: 1 / 11.5, spawn: [-1, 0, 0, 1],
    orbit: 120, swing: 0, pitch: 0.3, fov: 2.7,
  },
};

interface P { type: string; a: number; b: number; c: number; d: number; drift: number; trail: number; points: number; zoom: number; gain: number; relief: number; layers: number }
const read = (p: Params): P => ({
  type: String(p.type ?? 'clifford'), a: Number(p.a ?? 1.53), b: Number(p.b ?? 2.91), c: Number(p.c ?? 1.63), d: Number(p.d ?? 0.33),
  drift: Number(p.drift ?? 0.15), trail: Number(p.trail ?? 0.6), points: Math.max(1000, Math.min(60000, Math.round(Number(p.points ?? 6000)))),
  zoom: Number(p.zoom ?? 1), gain: Number(p.gain ?? 1),
  relief: Math.max(0, Math.min(1, Number(p.relief ?? 0))), layers: Math.max(0, Math.min(1, Number(p.layers ?? 0))),
});

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h, n = w * h;
  // the algorithm version the recipe was made with (absent: this one)
  const ver = cfg.v !== undefined && cfg.v < V ? 1 : V;
  const rng = new SimRng(`${ID}|${ver}|${cfg.seed}`);
  let p = read(cfg.params);
  const type = p.type, lorenz = type === 'lorenz', flow = FLOWS[type], flow3 = lorenz || !!flow;
  let steps = 0, phase = 0, renew = 0;
  // seeded phases of the morph path
  const th = [0, 0, 0, 0].map(() => rng.next() * Math.PI * 2);
  // (the path starts at the coefficients as set: with no drift they are exactly those)
  const coef = (k: number, ph = phase) => [p.a, p.b, p.c, p.d][k] + MORPH * (Math.sin(FREQ[k] * ph + th[k]) - Math.sin(th[k]));

  // ---- maps: histogram (and its slow memory) and orbits
  const H = new Float32Array(flow3 ? 0 : n), G = new Float32Array(flow3 ? 0 : n);
  const ox = new Float32Array(ORBITS), oy = new Float32Array(ORBITS);
  // ---- flows: particles and their trails (ring buffer by step)
  const NP = flow3 ? MAX_PARTICLES : 0;
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

  // ---- the other flows: RK4 on FLOWS[type]
  const FK = new Float64Array(4), q1 = new Float64Array(3), q2 = new Float64Array(3), q3 = new Float64Array(3), q4 = new Float64Array(3);
  const flowK = () => { flow!.coef(k => coef(k), FK); return flow!.tau * Math.pow(2, coef(3) / 3); };
  const rk4f = (s: Float64Array, dt: number) => {
    const F = flow!.f;
    F(s[0], s[1], s[2], FK, q1);
    F(s[0] + q1[0] * dt / 2, s[1] + q1[1] * dt / 2, s[2] + q1[2] * dt / 2, FK, q2);
    F(s[0] + q2[0] * dt / 2, s[1] + q2[1] * dt / 2, s[2] + q2[2] * dt / 2, FK, q3);
    F(s[0] + q3[0] * dt, s[1] + q3[1] * dt, s[2] + q3[2] * dt, FK, q4);
    for (let i = 0; i < 3; i++) s[i] += (dt / 6) * (q1[i] + 2 * q2[i] + 2 * q3[i] + q4[i]);
    // a runaway comes back into the box it lives in
    const c = flow!.center, R = 4 / flow!.scale;
    if (!(Math.abs(s[0] - c[0]) < R && Math.abs(s[1] - c[1]) < R && Math.abs(s[2] - c[2]) < R)) { s[0] = c[0] + 0.1; s[1] = c[1]; s[2] = c[2] - 0.1; }
  };
  /** One simulation step of a particle (S in, S out). */
  const advance = () => {
    if (lorenz) {
      const { sigma, rho, beta, tau } = lorenzK();
      const sub = Math.max(1, Math.ceil(tau / 0.004)), dt = tau / sub;
      for (let k = 0; k < sub; k++) rk4(S, sigma, rho, beta, dt);
    } else {
      const tau = flowK();
      const sub = Math.max(1, Math.ceil(tau / flow!.dt)), dt = tau / sub;
      for (let k = 0; k < sub; k++) rk4f(S, dt);
    }
  };

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
  } else if (flow) {
    const [x0, y0, z0, r] = flow.spawn;
    for (let i = 0; i < NP; i++) {
      S[0] = x0 + rng.range(-r, r); S[1] = y0 + rng.range(-r, r); S[2] = z0 + rng.range(-r, r);
      // onto the attractor (each particle a different time: they spread along it)
      const warm = 120 + rng.int(240);
      for (let k = 0; k < warm; k++) advance();
      for (let t = 0; t < TRAIL; t++) {
        advance();
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
  const mark = new Int32Array(flow3 ? 0 : n);
  let gen = 0;
  /** Iterates the map; returns how many distinct pixels this step's points landed on. */
  const stepMap = () => {
    gen++;
    let distinct = 0;
    const decay = Math.pow(0.5, 1 / (3 + 300 * p.trail * p.trail)), gdecay = Math.pow(0.5, 1 / GHOST_HALF);
    for (let i = 0; i < n; i++) { H[i] *= decay; G[i] *= gdecay; }
    const a = coef(0), b = coef(1), c = coef(2), d = coef(3);
    const dj = type === 'dejong';
    if (ver >= 2) {
      // a few orbits start afresh (off the record for a short transient), so they never all share one cycle
      for (let r = 0; r < RENEW; r++) {
        let x = rng.range(-1, 1), y = rng.range(-1, 1);
        for (let k = 0; k < TRANSIENT; k++) {
          const nx = dj ? Math.sin(a * y) - Math.cos(b * x) : Math.sin(a * y) + c * Math.cos(a * x);
          const ny = dj ? Math.sin(c * x) - Math.cos(d * y) : Math.sin(b * x) + d * Math.cos(b * y);
          x = nx; y = ny;
        }
        ox[renew] = x; oy[renew] = y;
        renew = (renew + 1) % ORBITS;
      }
    }
    const per = Math.max(1, Math.round(p.points / ORBITS));
    // pixel of a point: nearest one (pixel centres at i + 0.5; the display blur smooths the histogram)
    const s = fit() * h, cxp = w / 2, cyp = h / 2;
    const deposit = (x: number, y: number) => {
      const fx = cxp + x * s, fy = cyp - y * s;
      if (!(fx >= 0 && fy >= 0 && fx < w && fy < h)) return;
      const j = (fy | 0) * w + (fx | 0);
      H[j] += 1; G[j] += 1;
      if (mark[j] !== gen) { mark[j] = gen; distinct++; }
    };
    if (dj) {
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

  const stepFlow = () => {
    // (resting particles keep their place, so that their trail stays whole if they wake up)
    const np = Math.min(NP, Math.round(p.points / 100));
    head = (head + 1) % TRAIL;
    const still = 1e-5 / flow!.scale;
    for (let i = 0; i < NP; i++) {
      if (i < np) {
        S[0] = pos[i * 3]; S[1] = pos[i * 3 + 1]; S[2] = pos[i * 3 + 2];
        advance();
        if (Math.abs(S[0] - pos[i * 3]) + Math.abs(S[1] - pos[i * 3 + 1]) + Math.abs(S[2] - pos[i * 3 + 2]) < still) {
          // a particle caught at a fixed point starts again next to another one (its trail starts there too)
          const j = rng.int(np) * 3, e = 2e-3 / flow!.scale;
          S[0] = pos[j] + rng.range(-e, e); S[1] = pos[j + 1] + rng.range(-e, e); S[2] = pos[j + 2] + rng.range(-e, e);
          for (let t = 0; t < TRAIL; t++) trail.set(S, (i * TRAIL + t) * 3);
        }
        pos[i * 3] = S[0]; pos[i * 3 + 1] = S[1]; pos[i * 3 + 2] = S[2];
      }
      const o = (i * TRAIL + head) * 3;
      trail[o] = pos[i * 3]; trail[o + 1] = pos[i * 3 + 1]; trail[o + 2] = pos[i * 3 + 2];
    }
  };
  // (Lorenz as version 1 stepped it, kept as it was)
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
  const soft = new Accum(flow3 ? 1 : w, flow3 ? 1 : h), tmp = new Float32Array(flow3 ? 1 : n);
  // (depth: float tone of the fresh picture and of the memory)
  let F: Float32Array | null = null, M: Float32Array | null = null;
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
  /** The same tone mapping into floats (0..1); `hf` gets the height it comes from, before it saturates. */
  const toneF = (src: Float32Array, out: Float32Array, hf?: Float32Array) => {
    let sum = 0, cnt = 0;
    for (let i = 0; i < n; i++) if (src[i] > 0) { sum += src[i]; cnt++; }
    if (!cnt || sum <= 0) { out.fill(0); hf?.fill(0); return; }
    const k = (cnt / sum) * 0.35 * p.gain, L = 1 / Math.log(1 + 12);
    for (let i = 0; i < n; i++) {
      out[i] = Math.log(1 + 12 * Math.min(1, src[i] * k)) * L;
      if (hf) hf[i] = Math.log(1 + 12 * src[i] * k) * L;
    }
  };
  /**
   * «Relieve» on a map: the density lit as a height field from the upper left, so ribbons get a lit and a
   * shaded side (the slope read from the height before the tone saturates).
   */
  const emboss = (f: Float32Array, hf: Float32Array, k: number) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, v = f[i];
      if (v <= 0) continue;
      const gx = hf[y * w + Math.min(w - 1, x + 1)] - hf[y * w + Math.max(0, x - 1)];
      const gy = hf[Math.max(0, y - 1) * w + x] - hf[Math.min(h - 1, y + 1) * w + x];
      // rising toward the light (left and up) faces it
      const lam = Math.max(-1, Math.min(1, (0.7 * gx - 0.7 * gy) * 3));
      const sh = Math.max(0.1, 0.66 + 0.6 * lam);
      f[i] = Math.min(1, v * (1 - k + k * sh));
    }
  };

  const renderMap = (out: Uint8Array) => {
    // a light blur of a copy: a dusty attractor reads as a cloud, not as noise, at the size of a glyph
    soft.d.set(H);
    soft.blur(1, false, tmp);
    if (p.relief <= 0 && p.layers <= 0) { tone(soft.d, out); return; }
    F ??= new Float32Array(n);
    toneF(soft.d, F, acc);
    if (p.relief > 0) emboss(F, acc, p.relief);
    if (p.layers > 0) {
      // the memory: out of focus behind the fresh picture
      M ??= new Float32Array(n);
      soft.d.set(G);
      soft.blur(3, false, tmp);
      toneF(soft.d, M);
      const k = 0.55 * p.layers;
      for (let i = 0; i < n; i++) { const m = M[i] * k; if (m > F[i]) F[i] = m; }
    }
    for (let i = 0; i < n; i++) out[i] = byte(F[i]);
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
        else if (flow) stepFlow();
        else if (stepMap() < Math.max(64, p.points / 100)) hurry = 40;
        phase = (phase + p.drift * 0.004 * hurry) % (Math.PI * 2);
        steps++;
      }
    },
    render(out: Uint8Array, t: number) {
      if (!flow3) { renderMap(out); return; }
      acc.fill(0);
      // the scale and centre of the figure in model space (Lorenz: z is up, centred on the wings' fixed points)
      let k: number, cx: number, cy: number, cz: number;
      if (lorenz) {
        const { rho } = lorenzK();
        // the camera swings ±35° around the view that separates the wings most (their fixed points lie along
        // x = y); edge-on, the wings would collapse into a line
        cam.set(Math.PI / 4 + 0.6 * Math.sin(th[0] + (t * Math.PI * 2) / 60), 0.2, 3.2);
        cam.fov = 3 * p.zoom;
        k = 1 / 22; cx = 0; cy = 0; cz = Math.max(1, rho - 1);
      } else {
        const f = flow!;
        const yaw = f.orbit > 0 ? th[0] + (t * Math.PI * 2) / f.orbit : th[0] + f.swing * Math.sin(th[1] + (t * Math.PI * 2) / 60);
        cam.set(yaw, f.pitch + 0.08 * Math.sin(th[2] + (t * Math.PI * 2) / 47), 3.2);
        cam.fov = f.fov * p.zoom;
        k = f.scale; [cx, cy, cz] = f.center;
      }
      const np = Math.min(NP, Math.round(p.points / 100));
      const len = Math.max(2, Math.round(TRAIL * (0.15 + 0.85 * p.trail)));
      // depth: the near side of the figure brighter (camera at 3.2, the figure within about ±1.2)
      const rel = p.relief, ghost = p.layers * 0.3, all = ghost > 0 ? TRAIL : len;
      for (let i = 0; i < np; i++) {
        let has = false;
        for (let a = 0; a < all - 1; a++) {
          const o = (i * TRAIL + ((head - a + TRAIL) % TRAIL)) * 3;
          if (!cam.project((trail[o] - cx) * k, (trail[o + 2] - cz) * k, (trail[o + 1] - cy) * k, Q)) { has = false; continue; }
          if (has) {
            const ax = (P[0] * 0.5 + 0.5) * w, ay = (0.5 - P[1]) * h, bx = (Q[0] * 0.5 + 0.5) * w, by = (0.5 - Q[1]) * h;
            const ex = bx - ax, ey = by - ay, segs = Math.min(16, Math.max(1, Math.ceil(Math.sqrt(ex * ex + ey * ey) / 0.8)));
            let v = a < len ? (1 - a / len) / segs : ghost * (1 - a / TRAIL) / segs;
            if (rel > 0) {
              const dn = Math.max(0, Math.min(1, (4.3 - Q[2]) / 2.2));
              v *= 1 - rel + rel * (0.1 + 0.9 * dn * dn);
            }
            for (let s = 0; s < segs; s++) deposit(ax + ((bx - ax) * (s + 0.5)) / segs - 0.5, ay + ((by - ay) * (s + 0.5)) / segs - 0.5, v);
          }
          P[0] = Q[0]; P[1] = Q[1]; P[2] = Q[2];
          has = true;
        }
      }
      tone(acc, out);
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { phase, head, renew };
      rng.save(scalars);
      return { id: ID, v: ver, steps, res: h, scalars, arrays: { H: H.slice(), G: G.slice(), ox: ox.slice(), oy: oy.slice(), pos: pos.slice(), trail: trail.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a este atractor.');
      const A = s.arrays;
      const ok = A.H instanceof Float32Array && A.H.length === H.length && A.ox instanceof Float32Array && A.ox.length === ORBITS
        && A.oy instanceof Float32Array && A.oy.length === ORBITS && A.pos instanceof Float32Array && A.pos.length === pos.length
        && A.trail instanceof Float32Array && A.trail.length === trail.length
        // (states saved before «Capas» carry no memory: it starts empty)
        && (A.G === undefined || (A.G instanceof Float32Array && A.G.length === G.length));
      if (!ok) throw new Error('El estado guardado está incompleto.');
      H.set(A.H); ox.set(A.ox); oy.set(A.oy); pos.set(A.pos); trail.set(A.trail);
      if (A.G) G.set(A.G); else G.fill(0);
      phase = s.scalars.phase ?? 0; head = s.scalars.head ?? 0; renew = s.scalars.renew ?? 0;
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
