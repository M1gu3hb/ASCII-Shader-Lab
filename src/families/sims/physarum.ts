import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Physarum transport networks (Jones 2010, written here from the paper's description): agents on a 2:1 torus
 * at raster resolution, each with three forward sensors (left, front, right) at «Ángulo de los sensores» and
 * «Alcance». Every step, each agent reads the trail under its sensors and turns: it keeps its heading when the
 * front is strongest, turns by «Giro» towards the stronger side, and turns either way at random when the front
 * is the weakest. Then it tries to move «Paso» cells: as in the paper, a cell holds one agent, so a move into
 * an occupied cell fails and the agent picks a new random heading instead; a successful move deposits trail
 * in the cell it reaches. The trail map is blended with its 3×3 mean («Difusión») and decays («Evaporación»).
 * Positions are continuous; the occupancy grid is derived from them (it is not part of the saved state).
 */

const ID = 'physarum', V = 1;
export const MAX_AGENTS = 60_000;
const DEG = Math.PI / 180, TAU = Math.PI * 2;
/**
 * Brightest byte of the raster: just under white, so a sample half-way between a full and an empty texel is no
 * exact half (the two engines round such ties to different glyphs).
 */
const TOP = 250;

interface P {
  sensorAngle: number; sensorDist: number; turn: number; stepSize: number;
  density: number; deposit: number; decay: number; diffuse: number; layout: string;
}
const read = (p: Params): P => ({
  sensorAngle: Number(p.sensorAngle ?? 22.5), sensorDist: Number(p.sensorDist ?? 5), turn: Number(p.turn ?? 45),
  stepSize: Number(p.stepSize ?? 1), density: Number(p.density ?? 6), deposit: Number(p.deposit ?? 1),
  decay: Number(p.decay ?? 0.1), diffuse: Number(p.diffuse ?? 1), layout: String(p.layout ?? 'disco'),
});

/** Agents for a population (percent of the cells), within the hard limit. */
export const agentCount = (w: number, h: number, density: number) =>
  Math.max(1, Math.min(MAX_AGENTS, Math.round((density / 100) * w * h)));

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h, n = w * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  let steps = 0;
  const N = agentCount(w, h, p.density);
  const X = new Float32Array(N), Y = new Float32Array(N), H = new Float32Array(N);
  /** Agents per cell (normally 0 or 1; a brush may stack them for a moment). */
  const occ = new Uint16Array(n);
  let T = new Float32Array(n), T2 = new Float32Array(n);
  // neighbour tables of the torus
  const xl = new Int32Array(w), xr = new Int32Array(w), yu = new Int32Array(h), yd = new Int32Array(h);
  for (let x = 0; x < w; x++) { xl[x] = (x + w - 1) % w; xr[x] = (x + 1) % w; }
  for (let y = 0; y < h; y++) { yu[y] = ((y + h - 1) % h) * w; yd[y] = ((y + 1) % h) * w; }

  // positions are stored as float32: wrap and round first, so a cell is always computed from the stored value
  const wrapX = (x: number) => Math.fround(x < 0 || x >= w ? ((x % w) + w) % w : x);
  const wrapY = (y: number) => Math.fround(y < 0 || y >= h ? ((y % h) + h) % h : y);
  const cell = (x: number, y: number) => {
    let ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || ix >= w) ix = ((ix % w) + w) % w;
    if (iy < 0 || iy >= h) iy = ((iy % h) + h) % h;
    return iy * w + ix;
  };

  // ---- layout (deterministic from the seed): one agent per cell, the shapes grown to hold the population
  const cx = w / 2, cy = h / 2;
  const fit = (r: number, fill: number) => Math.min(h * 0.49, Math.max(r, Math.sqrt(N / (Math.PI * fill))));
  for (let i = 0; i < N; i++) {
    let x = 0, y = 0, a = 0;
    for (let tries = 0; tries < 24; tries++) {
      switch (p.layout) {
        case 'aleatorio': x = rng.next() * w; y = rng.next() * h; a = rng.next() * TAU; break;
        case 'anillo': {
          // on a ring, heading inwards: the ring tightens and tears into a network
          const t = rng.next() * TAU, r = h * 0.36, th = Math.max(2, N / (TAU * r * 0.6));
          const rr = r + th * (rng.next() - 0.5);
          x = cx + Math.cos(t) * rr; y = cy + Math.sin(t) * rr; a = t + Math.PI + 0.3 * (rng.next() - 0.5);
          break;
        }
        case 'centro': {
          // a small dense spot, heading outwards: a burst that spreads and organises
          const t = rng.next() * TAU, r = fit(h * 0.05, 0.6) * Math.sqrt(rng.next());
          x = cx + Math.cos(t) * r; y = cy + Math.sin(t) * r; a = t;
          break;
        }
        default: {
          const t = rng.next() * TAU, r = fit(h * 0.3, 0.3) * Math.sqrt(rng.next());
          x = cx + Math.cos(t) * r; y = cy + Math.sin(t) * r; a = rng.next() * TAU;
        }
      }
      x = wrapX(x); y = wrapY(y);
      if (!occ[cell(x, y)]) break;
    }
    let c = cell(x, y);
    if (occ[c]) {
      // crowded: the next free cell in reading order
      let k = c;
      while (occ[k]) k = (k + 1) % n;
      c = k; x = wrapX((k % w) + 0.5); y = wrapY(Math.floor(k / w) + 0.5);
    }
    occ[c]++;
    X[i] = x; Y[i] = y; H[i] = ((a % TAU) + TAU) % TAU;
  }

  const step1 = () => {
    const sa = p.sensorAngle * DEG, ra = p.turn * DEG, so = p.sensorDist, ss = p.stepSize, dep = p.deposit;
    const csa = Math.cos(sa), ssa = Math.sin(sa);
    for (let i = 0; i < N; i++) {
      const x = X[i], y = Y[i];
      let a = H[i];
      // sense
      const c = Math.cos(a), s = Math.sin(a);
      const f = T[cell(x + c * so, y + s * so)];
      const fl = T[cell(x + (c * csa - s * ssa) * so, y + (s * csa + c * ssa) * so)];
      const fr = T[cell(x + (c * csa + s * ssa) * so, y + (s * csa - c * ssa) * so)];
      if (f > fl && f > fr) { /* keep going */ }
      else if (f < fl && f < fr) a += rng.next() < 0.5 ? ra : -ra;
      else if (fl > fr) a += ra;
      else if (fr > fl) a -= ra;
      if (a < 0) a += TAU; else if (a >= TAU) a -= TAU;
      // move: into a free cell (or within its own), else a new random heading
      const nx = wrapX(x + Math.cos(a) * ss), ny = wrapY(y + Math.sin(a) * ss);
      const from = cell(x, y), to = cell(nx, ny);
      if (to !== from && occ[to]) { H[i] = rng.next() * TAU; continue; }
      occ[from]--; occ[to]++;
      X[i] = nx; Y[i] = ny; H[i] = a;
      T[to] += dep;
    }
    // trail: blend with the 3×3 mean, then decay
    const m = p.diffuse, keep = 1 - p.decay, m9 = m / 9;
    for (let y = 0; y < h; y++) {
      const o = y * w, ou = yu[y], od = yd[y];
      for (let x = 0; x < w; x++) {
        const l = xl[x], r = xr[x];
        const sum = T[ou + l] + T[ou + x] + T[ou + r] + T[o + l] + T[o + x] + T[o + r] + T[od + l] + T[od + x] + T[od + r];
        T2[o + x] = ((1 - m) * T[o + x] + m9 * sum) * keep;
      }
    }
    const t = T; T = T2; T2 = t;
    steps++;
  };

  /** Trail of a steady population, per cell: agents per cell × deposit / decay (without the deposit). */
  const ref = () => (N / n) / Math.max(0.01, p.decay);

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = read(np); },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      // fixed exposure on trail × decay (a cell crossed every step holds deposit / decay), log-compressed so
      // thin veins stay visible; a busy vein (0.15 of that) is white, and the deposit brightens everything
      const g = 40 * p.decay, lg = 1 / Math.log(1 + 40 * 0.15);
      for (let i = 0; i < n; i++) {
        const v = Math.log(1 + T[i] * g) * lg;
        out[i] = v >= 1 ? TOP : (v * TOP + 0.5) | 0;
      }
    },
    stroke(s: Stroke) {
      const ax = (s.x0 * 0.5 + 0.5) * w, ay = (0.5 - s.y0) * h, bx = (s.x1 * 0.5 + 0.5) * w, by = (0.5 - s.y1) * h;
      const R = Math.max(1.5, s.r * h), len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.ceil(len / (R * 0.5)));
      const food = 3 * ref() * (0.25 + s.strength);
      for (let j = 0; j <= k; j++) {
        const px = ax + ((bx - ax) * j) / k, py = ay + ((by - ay) * j) / k;
        for (let y = Math.floor(py - R); y <= Math.ceil(py + R); y++) for (let x = Math.floor(px - R); x <= Math.ceil(px + R); x++) {
          const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
          if (d > R) continue;
          const i = (((y % h) + h) % h) * w + (((x % w) + w) % w);
          if (s.brush === 'dispersar') T[i] = 0;
          else T[i] += food * (1 - d / R);
        }
        if (s.brush !== 'dispersar') continue;
        // agents inside the disc are pushed out to its rim, heading away from the centre
        for (let i = 0; i < N; i++) {
          let dx = X[i] - px, dy = Y[i] - py;
          if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
          if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
          const d = Math.hypot(dx, dy);
          if (d >= R) continue;
          const a = d > 1e-6 ? Math.atan2(dy, dx) : (i * 2.399963) % TAU;
          const nx = wrapX(px + Math.cos(a) * R), ny = wrapY(py + Math.sin(a) * R);
          occ[cell(X[i], Y[i])]--; occ[cell(nx, ny)]++;
          X[i] = nx; Y[i] = ny; H[i] = a < 0 ? a + TAU : a;
        }
      }
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = {};
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { X: X.slice(), Y: Y.slice(), H: H.slice(), T: T.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta simulación.');
      const a = s.arrays;
      const ok = (v: unknown, len: number) => v instanceof Float32Array && v.length === len;
      if (!ok(a.X, N) || !ok(a.Y, N) || !ok(a.H, N) || !ok(a.T, n)) throw new Error('El estado guardado está incompleto.');
      X.set(a.X); Y.set(a.Y); H.set(a.H); T.set(a.T);
      occ.fill(0);
      for (let i = 0; i < N; i++) occ[cell(X[i], Y[i])]++;
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
