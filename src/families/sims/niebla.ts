import { Accum } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Cloud chamber (written from the physics): charged particles in a uniform magnetic field perpendicular to the
 * picture, slowed by the gas, leave trails of droplets that drift and fade.
 *   dv/dt = (q B / m) (v_y, −v_x) − γ v
 * The magnetic term only turns the velocity (radius r = m v / (q B)); the drag takes energy away, so the radius
 * shrinks and every curved track closes into a spiral. Species (from the seed, at a rate per second):
 *  - electrons and positrons: light, they curl strongly; thin dotted tracks that get denser as they slow down;
 *  - alpha particles: heavy and doubly charged, barely bent, stopped within a short range: short thick tracks,
 *    brightest at their end (the ionisation grows as they slow down); along the way they knock out delta rays
 *    (tiny electron curls);
 *  - muons: fast and heavy, crossing the whole chamber almost straight;
 *  - photons: invisible until they convert into an electron–positron pair that opens in a «V», each arm curling
 *    the other way.
 * Particles come in from the edges, from the top (cosmic rays) or from a point source. The trails are drawn
 * into a buffer that fades exponentially and spreads a little (the vapour diffuses), plus a faint mist of
 * stray droplets. «Grosor de traza» (PR #10 close-out) scales the traces' width: a trace about one character
 * wide reads as a chain of glyphs, two characters wide it splits into two dim rows (1: the earlier width).
 * Version 2 (PR #10 close-out): a fresh trace is drawn brighter, so that it saturates and a character that only
 * half meets it still gets a dense glyph, and the faint haze of old vapour is cut from the picture: at 10 px
 * characters the traces read as clearly as version 1's did at 16 px; and the point source sits near the middle.
 * Recipes made with version 1 keep its drawing.
 */

const ID = 'niebla', V = 2, RATE = 30, SUB = 3, DT = 1 / (RATE * SUB);
/** Version 2: how much brighter a fresh trace is drawn (it saturates), and the haze cut off the picture. */
const INK2 = 1.7, HAZE2 = 0.06;
const MAXP = 192;
/** Margin outside the visible 16:9 frame where particles are born and die. */
const EDGE_X = 0.95, EDGE_Y = 0.54;
const KIND_E = 1, KIND_ALPHA = 2, KIND_MU = 3, KIND_PHOTON = 4;

/**
 * 0..1 → a byte in steps of 4 (64 levels): a sample halfway between two or four texels is then a whole level
 * in both engines (the GPU's float32 and the CPU's float64 would otherwise round an exact .5 apart).
 */
const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 252 : ((v * 63 + 0.5) | 0) * 4);

interface P { field: number; drag: number; rate: number; trace: number; pairs: number; alphas: number; muons: number; energy: number; source: string; mist: number; grain: number; width: number }
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const read = (p: Params): P => ({
  field: num(p.field, 0.6), drag: num(p.drag, 0.4), rate: num(p.rate, 4), trace: num(p.trace, 0.5), pairs: num(p.pairs, 0.25),
  alphas: num(p.alphas, 0.15), muons: num(p.muons, 0.2), energy: num(p.energy, 0.5), source: String(p.source ?? 'bordes'),
  mist: num(p.mist, 0.3), grain: num(p.grain, 0.5), width: num(p.width, 1),
});

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h, n = w * h;
  const v2 = (cfg.v ?? V) >= 2;
  // (the stream keeps the version-1 key: both versions see the same particles)
  const rng = new SimRng(`${ID}|1|${cfg.seed}`);
  let p = read(cfg.params);
  let steps = 0;

  // ---- particles (fixed pool)
  const kind = new Uint8Array(MAXP), q = new Float32Array(MAXP);
  const px = new Float32Array(MAXP), py = new Float32Array(MAXP), vx = new Float32Array(MAXP), vy = new Float32Array(MAXP);
  const arc = new Float32Array(MAXP), conv = new Float32Array(MAXP), age = new Float32Array(MAXP);
  // the point source (a radioactive sample), from the seed (version 2: near the middle, where its star of
  // tracks has room on every side; version 1 left it in the left third)
  const srcX = rng.range(-0.55, -0.3) * (v2 ? 0.3 : 1), srcY = rng.range(-0.15, 0.15);

  const trail = new Accum(w, h), T = trail.d, tmp = new Float32Array(n), blurTmp = new Float32Array(n);
  const sx = (x: number) => (x * 0.5 + 0.5) * w;
  const sy = (y: number) => (0.5 - y) * h;

  const free = () => { for (let i = 0; i < MAXP; i++) if (!kind[i]) return i; return -1; };
  const add = (k: number, x: number, y: number, ang: number, speed: number, charge: number) => {
    const i = free();
    if (i < 0) return -1;
    kind[i] = k; q[i] = charge; px[i] = x; py[i] = y; vx[i] = Math.cos(ang) * speed; vy[i] = Math.sin(ang) * speed;
    arc[i] = 0; age[i] = 0; conv[i] = k === KIND_PHOTON ? rng.range(0.12, 0.7) : 0;
    return i;
  };

  /** One new event: a particle (or a photon that will become a pair) entering the chamber. */
  const spawn = () => {
    const e = 0.55 + 0.9 * p.energy;
    let x: number, y: number, ang: number;
    const fromSource = p.source === 'fuente' && rng.next() < 0.7;
    if (fromSource) { x = srcX; y = srcY; ang = rng.range(0, Math.PI * 2); }
    else if (p.source === 'arriba') { x = rng.range(-EDGE_X, EDGE_X); y = EDGE_Y; ang = -Math.PI / 2 + rng.range(-0.45, 0.45); }
    else {
      // a point on the border, heading inwards within ±60° of the normal
      const s = rng.next() * 2 * (2 * EDGE_X + 2 * EDGE_Y);
      let nx: number;
      if (s < 2 * EDGE_X) { x = -EDGE_X + s; y = EDGE_Y; nx = -Math.PI / 2; }
      else if (s < 2 * EDGE_X + 2 * EDGE_Y) { x = EDGE_X; y = EDGE_Y - (s - 2 * EDGE_X); nx = Math.PI; }
      else if (s < 4 * EDGE_X + 2 * EDGE_Y) { x = EDGE_X - (s - 2 * EDGE_X - 2 * EDGE_Y); y = -EDGE_Y; nx = Math.PI / 2; }
      else { x = -EDGE_X; y = -EDGE_Y + (s - 4 * EDGE_X - 2 * EDGE_Y); nx = 0; }
      ang = nx + rng.range(-1.05, 1.05);
    }
    const r = rng.next();
    const pa = fromSource ? 0.8 : p.alphas, pm = fromSource ? 0 : p.muons, pp = fromSource ? 0.05 : p.pairs;
    if (r < pa) add(KIND_ALPHA, x, y, ang, rng.range(0.35, 0.55) * e, 2);
    else if (r < pa + pm) add(KIND_MU, x, y, ang, rng.range(1.6, 2.4) * e, rng.next() < 0.55 ? 1 : -1);
    else if (r < pa + pm + pp) add(KIND_PHOTON, x, y, ang, 1.6 * e, 0);
    else add(KIND_E, x, y, ang, rng.range(0.5, 1.3) * e, rng.next() < 0.75 ? -1 : 1);
  };

  /** Moves particle i one substep and draws its segment; returns false when it is gone. */
  const move = (i: number) => {
    const k = kind[i];
    const B = 0.5 + 9 * p.field;
    // q/m (rad/s per unit field) and drag (1/s) by species
    let qm = 0, g = 0, wd = 1.5, ion = 0.6;
    const speed0 = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
    // (the loss grows as a particle slows down, as ionisation does: spirals tighten fast at their end)
    if (k === KIND_E) { qm = q[i]; g = (0.08 + 1.1 * p.drag) * (1 + 0.25 / (speed0 + 0.05)); wd = 1.4; ion = Math.min(1, 0.82 + 0.1 / (speed0 + 0.15)); }
    else if (k === KIND_ALPHA) { qm = 0.02 * q[i]; g = (0.5 + 3 * p.drag) * (1 + 0.1 / (speed0 + 0.02)); wd = 2.6; ion = Math.min(1, 0.85 + 0.08 / (speed0 + 0.05)); }
    else if (k === KIND_MU) { qm = 0.02 * q[i]; g = 0.01 + 0.06 * p.drag; wd = 1.25; ion = 0.78; }
    const om = qm * B * DT, c = Math.cos(om), s = Math.sin(om), damp = Math.exp(-g * DT);
    // exact rotation of the velocity by the field, then the drag
    const nvx = (vx[i] * c + vy[i] * s) * damp, nvy = (-vx[i] * s + vy[i] * c) * damp;
    const x0 = px[i], y0 = py[i], x1 = x0 + 0.5 * (vx[i] + nvx) * DT, y1 = y0 + 0.5 * (vy[i] + nvy) * DT;
    vx[i] = nvx; vy[i] = nvy; px[i] = x1; py[i] = y1;
    const dl = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
    arc[i] += dl; age[i] += DT;
    if (k === KIND_PHOTON) {
      // invisible: at its conversion point it becomes a pair opening in a V
      if (arc[i] >= conv[i]) {
        const a = Math.atan2(vy[i], vx[i]), open = rng.range(0.08, 0.28), sp = speed0 * rng.range(0.35, 0.6);
        add(KIND_E, x1, y1, a + open, sp, -1);
        add(KIND_E, x1, y1, a - open, sp * rng.range(0.7, 1.3), 1);
        return false;
      }
    } else {
      // droplets: the trail is beaded along its length (a hash of the arc length)
      const bead = p.grain > 0 ? 1 - p.grain * 0.4 * (0.5 + 0.5 * Math.sin(arc[i] * 173 + i * 7.1) * Math.sin(arc[i] * 61 + i)) : 1;
      // («Grosor de traza» scales the width: thin traces for small characters, thick ones for big)
      trail.line(sx(x0), sy(y0), sx(x1), sy(y1), wd * 1.5 * (h / 80) * p.width, ion * bead * (v2 ? INK2 : 1));
      // alphas and muons knock out delta rays now and then
      if ((k === KIND_ALPHA || k === KIND_MU) && rng.next() < (k === KIND_ALPHA ? 0.012 : 0.004)) {
        const a = Math.atan2(vy[i], vx[i]) + (rng.next() < 0.5 ? 1 : -1) * rng.range(0.6, 1.4);
        add(KIND_E, x1, y1, a, rng.range(0.25, 0.5), -1);
      }
    }
    const v = Math.sqrt(nvx * nvx + nvy * nvy);
    return v > 0.035 && age[i] < 12 && Math.abs(x1) < EDGE_X + 0.08 && Math.abs(y1) < EDGE_Y + 0.08;
  };

  const step1 = () => {
    // the trails fade (time constant from «Largo de traza») and the vapour spreads a little
    const tau = 0.25 + 4.5 * p.trace * p.trace;
    trail.scale(Math.exp(-1 / (tau * RATE)));
    if (steps % 6 === 0) {
      // a fraction of a 1-2-1 blur: older trails widen and soften
      tmp.set(T);
      trail.blur(1, false, blurTmp);
      for (let i = 0; i < n; i++) T[i] = 0.85 * tmp[i] + 0.15 * T[i];
    }
    // new events: a chance per step from the rate (a Bernoulli count, close to a Poisson stream)
    for (let lam = p.rate / RATE; lam > 0; lam -= 1) if (rng.next() < Math.min(1, lam)) spawn();
    for (let s = 0; s < SUB; s++) for (let i = 0; i < MAXP; i++) if (kind[i] && !move(i)) kind[i] = 0;
    // the mist: stray droplets
    const drops = Math.floor(p.mist * 6 * (w / 160) + rng.next());
    for (let k = 0; k < drops; k++) trail.splat(rng.range(0, w), rng.range(0, h), rng.range(0.5, 0.8), rng.range(0.12, 0.3));
    steps++;
  };

  const render = (out: Uint8Array) => {
    if (v2) {
      // version 2: the faint haze of old vapour is cut, so the traces stand out at any size of character
      for (let i = 0; i < n; i++) { const v = (T[i] - HAZE2) / (1 - HAZE2); out[i] = byte(v >= 1 ? 1 : v <= 0 ? 0 : Math.pow(v, 0.6)); }
      return;
    }
    for (let i = 0; i < n; i++) { const v = T[i]; out[i] = byte(v >= 1 ? 1 : Math.pow(v, 0.6)); }
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = read(np); },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) { render(out); },
    stroke(s: Stroke) {
      // a burst of electrons from where you touch, outward in every direction
      const cnt = 2 + Math.round(6 * Math.max(0, Math.min(1, s.strength)));
      for (let k = 0; k < cnt; k++) add(KIND_E, s.x1, s.y1, rng.range(0, Math.PI * 2), rng.range(0.4, 1.1), rng.next() < 0.5 ? -1 : 1);
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = {};
      rng.save(scalars);
      return {
        id: ID, v: v2 ? 2 : 1, steps, res: h, scalars,
        arrays: { kind: kind.slice(), q: q.slice(), px: px.slice(), py: py.slice(), vx: vx.slice(), vy: vy.slice(), arc: arc.slice(), conv: conv.slice(), age: age.slice(), T: T.slice() },
      };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta cámara de niebla.');
      const A = s.arrays;
      const f32 = (x: unknown, len: number): x is Float32Array => x instanceof Float32Array && x.length === len;
      if (!(A.kind instanceof Uint8Array) || A.kind.length !== MAXP || !f32(A.q, MAXP) || !f32(A.px, MAXP) || !f32(A.py, MAXP) || !f32(A.vx, MAXP)
        || !f32(A.vy, MAXP) || !f32(A.arc, MAXP) || !f32(A.conv, MAXP) || !f32(A.age, MAXP) || !f32(A.T, n)) throw new Error('El estado guardado está incompleto.');
      kind.set(A.kind); q.set(A.q); px.set(A.px); py.set(A.py); vx.set(A.vx); vy.set(A.vy); arc.set(A.arc); conv.set(A.conv); age.set(A.age); T.set(A.T);
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
