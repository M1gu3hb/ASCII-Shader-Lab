import { Accum, OrbitCamera, toBytes } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params } from '../types';

/**
 * Lindenmayer systems: an axiom rewritten by rules for a number of generations (bounded), then read by a
 * 3D turtle (F draws forward, G moves forward, + − yaw, & ^ pitch, \ / roll, | turns round, [ ] push and
 * pop). The structure is built once from the seed and the grammar; the run's steps reveal it growing from
 * the root (each segment appears when the growth front reaches its distance along the path), then it sways.
 * The state is the growth step: the geometry is a function of (seed, grammar, angle, lengths, variation).
 * «Tiempo» offers two more ways (see garden() and folding()): a garden of plants at different ages that grow,
 * wither and are replaced (continuous), and a figure that folds and unfolds in an exact cycle (a loop).
 */

const ID = 'sistema_l', V = 1;
const MAX_SYMBOLS = 200_000;
const MAX_SEGMENTS = 40_000;

interface Model { axiom: string; rules: string; up: 1 | -1; turn3d: boolean }
const MODELS: Record<string, Model> = {
  helecho: { axiom: 'X', rules: 'X=F+[[X]-X]-F[-FX]+X;F=FF', up: 1, turn3d: false },
  arbusto: { axiom: 'F', rules: 'F=FF+[+F-F-F]-[-F+F+F]', up: 1, turn3d: false },
  arbol3d: { axiom: 'FA', rules: 'A=[&FA]/////[&FA]/////[&FA]', up: 1, turn3d: true },
  raices: { axiom: 'X', rules: 'X=F[+X]F[-X]+X;F=FF', up: -1, turn3d: false },
  koch: { axiom: 'F--F--F', rules: 'F=F+F--F+F', up: 1, turn3d: false },
  dragon: { axiom: 'FX', rules: 'X=X+YF+;Y=-FX-Y', up: 1, turn3d: false },
};

/** Parses «A=…;B=…» into a rule table (later rules for the same symbol win). */
export function parseRules(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of text.split(';')) {
    const k = part.indexOf('=');
    if (k !== 1) continue;
    m.set(part[0], part.slice(2));
  }
  return m;
}

/** Rewrites the axiom `gens` times, stopping before a generation that would exceed MAX_SYMBOLS. */
export function expand(axiom: string, rules: Map<string, string>, gens: number): { text: string; gens: number } {
  let s = axiom || 'F';
  let g = 0;
  for (; g < gens; g++) {
    let len = 0;
    for (const c of s) len += rules.get(c)?.length ?? 1;
    if (len > MAX_SYMBOLS) break;
    let out = '';
    for (const c of s) out += rules.get(c) ?? c;
    s = out;
  }
  return { text: s, gens: g };
}

interface Geometry {
  /** Per segment: x0 y0 z0 x1 y1 z1 (model units). */
  seg: Float32Array;
  /** Per segment: distance from the root along the path at its start, and its depth (bracket level). */
  dist: Float32Array;
  depth: Uint8Array;
  n: number;
  maxDist: number;
  maxDepth: number;
  /** Bounding sphere (centre and radius) for a fit that does not change while it turns. */
  cx: number; cy: number; cz: number; radius: number;
  /** Bounding box of the 2D layout. */
  minX: number; maxX: number; minY: number; maxY: number;
}

function build(seed: string, p: Params): Geometry & { turn3d: boolean } {
  const name = String(p.model ?? 'helecho');
  const base = MODELS[name];
  const axiom = name === 'propio' || !base ? String(p.axiom ?? 'X') : base.axiom;
  const rules = parseRules(name === 'propio' || !base ? String(p.rules ?? '') : base.rules);
  const up = base?.up ?? 1;
  const gens = Math.max(1, Math.min(9, Math.round(Number(p.gens ?? 5))));
  const ang = (Number(p.angle ?? 25) * Math.PI) / 180;
  const decay = Number(p.decay ?? 1), jitter = Number(p.jitter ?? 0);
  const rng = new SimRng(`${ID}|${V}|${seed}`);
  const { text } = expand(axiom, rules, gens);
  // turtle: position, heading H, left L, up U
  let x = 0, y = 0, z = 0;
  let H = [0, up, 0], L = [-1, 0, 0], U = [0, 0, 1];
  let dist = 0, depth = 0;
  const stack: Array<[number, number, number, number[], number[], number[], number, number]> = [];
  const seg: number[] = [], dists: number[] = [], depths: number[] = [];
  const rot = (a: number[], b: number[], th: number): [number[], number[]] => {
    const c = Math.cos(th), s = Math.sin(th);
    return [[a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s], [b[0] * c - a[0] * s, b[1] * c - a[1] * s, b[2] * c - a[2] * s]];
  };
  const turn = () => ang * (1 + jitter * 0.35 * rng.gauss());
  let maxDepth = 0;
  for (const c of text) {
    if (c === 'F' || c === 'G') {
      const len = Math.pow(decay, depth) * (1 + jitter * 0.5 * (rng.next() - 0.5));
      const nx = x + H[0] * len, ny = y + H[1] * len, nz = z + H[2] * len;
      if (c === 'F') {
        if (seg.length / 6 >= MAX_SEGMENTS) break;
        seg.push(x, y, z, nx, ny, nz); dists.push(dist); depths.push(Math.min(255, depth));
      }
      x = nx; y = ny; z = nz; dist += len;
    } else if (c === '+') [H, L] = rot(H, L, turn());
    else if (c === '-') [H, L] = rot(H, L, -turn());
    else if (c === '&') [H, U] = rot(H, U, turn());
    else if (c === '^') [H, U] = rot(H, U, -turn());
    else if (c === '\\') [L, U] = rot(L, U, turn());
    else if (c === '/') [L, U] = rot(L, U, -turn());
    else if (c === '|') { H = H.map(v => -v); L = L.map(v => -v); }
    else if (c === '[') { stack.push([x, y, z, H, L, U, dist, depth]); depth++; maxDepth = Math.max(maxDepth, depth); }
    else if (c === ']') { const s = stack.pop(); if (s) [x, y, z, H, L, U, dist, depth] = s; }
  }
  const n = seg.length / 6;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity, maxDist = 0;
  for (let i = 0; i < n; i++) {
    for (const k of [0, 3]) {
      const a = seg[i * 6 + k], b = seg[i * 6 + k + 1], cz = seg[i * 6 + k + 2];
      if (a < minX) minX = a; if (a > maxX) maxX = a; if (b < minY) minY = b; if (b > maxY) maxY = b; if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz;
    }
    maxDist = Math.max(maxDist, dists[i] + Math.hypot(seg[i * 6 + 3] - seg[i * 6], seg[i * 6 + 4] - seg[i * 6 + 1], seg[i * 6 + 5] - seg[i * 6 + 2]));
  }
  if (!n) { minX = maxX = minY = maxY = minZ = maxZ = 0; }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  let radius = 1e-6;
  for (let i = 0; i < n * 2; i++) {
    const o = Math.floor(i / 2) * 6 + (i % 2) * 3;
    radius = Math.max(radius, Math.hypot(seg[o] - cx, seg[o + 1] - cy, seg[o + 2] - cz));
  }
  return {
    seg: new Float32Array(seg), dist: new Float32Array(dists), depth: new Uint8Array(depths), n, maxDist: Math.max(1e-6, maxDist),
    maxDepth, cx, cy, cz, radius, minX, maxX, minY, maxY, turn3d: base ? base.turn3d : /[&^\\/]/.test(text),
  };
}

export function create(cfg: ModelConfig): FieldModel {
  // «Tiempo»: a garden that renews itself, or a figure that folds in a cycle (the plain run below otherwise)
  const mode = String(cfg.params.mode ?? 'crece');
  if (mode === 'jardin') return garden(cfg);
  if (mode === 'pliegue') return folding(cfg);
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  let p = cfg.params;
  const g = build(cfg.seed, p);
  const acc = new Accum(w, h);
  const cam = new OrbitCamera();
  const P = new Float64Array(3), Q = new Float64Array(3);
  let steps = 0;
  const rate = 30;
  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = np; },
    step(k: number) { steps += k; },
    render(out: Uint8Array, t: number) {
      acc.clear();
      const grow = Math.max(0.5, Number(p.grow ?? 8));
      const front = Math.min(1, steps / (grow * rate)) * g.maxDist;
      const wind = Number(p.wind ?? 0), turnRate = Number(p.turn ?? 0), width = Number(p.width ?? 1.4);
      const lw = width * (h / 192);
      const fitR = g.radius;
      // 2D layouts fit their box; 3D ones their bounding sphere, so turning never changes their size
      const fit2 = Math.min(1.8 / Math.max(1e-6, g.maxX - g.minX), 0.92 / Math.max(1e-6, g.maxY - g.minY));
      const yaw = g.turn3d ? (t * turnRate * Math.PI * 2) / 60 * 1 : 0;
      cam.set(yaw, g.turn3d ? 0.12 : 0, 3.2);
      const sway = (yn: number, ph: number) => wind * 0.06 * yn * yn * Math.sin(t * 1.3 + ph);
      for (let i = 0; i < g.n; i++) {
        const d0 = g.dist[i];
        if (d0 > front) continue;
        const o = i * 6;
        const segLen = Math.hypot(g.seg[o + 3] - g.seg[o], g.seg[o + 4] - g.seg[o + 1], g.seg[o + 5] - g.seg[o + 2]);
        const part = segLen > 0 ? Math.min(1, (front - d0) / segLen) : 1;
        let ax: number, ay: number, bx: number, by: number;
        const ex = g.seg[o] + (g.seg[o + 3] - g.seg[o]) * part, ey = g.seg[o + 1] + (g.seg[o + 4] - g.seg[o + 1]) * part, ez = g.seg[o + 2] + (g.seg[o + 5] - g.seg[o + 2]) * part;
        if (g.turn3d) {
          const k = 1 / fitR;
          if (!cam.project((g.seg[o] - g.cx) * k, (g.seg[o + 1] - g.cy) * k, (g.seg[o + 2] - g.cz) * k, P)) continue;
          if (!cam.project((ex - g.cx) * k, (ey - g.cy) * k, (ez - g.cz) * k, Q)) continue;
          ax = P[0] * 2.4; ay = P[1] * 2.4; bx = Q[0] * 2.4; by = Q[1] * 2.4;
        } else {
          ax = (g.seg[o] - (g.minX + g.maxX) / 2) * fit2; ay = (g.seg[o + 1] - (g.minY + g.maxY) / 2) * fit2;
          bx = (ex - (g.minX + g.maxX) / 2) * fit2; by = (ey - (g.minY + g.maxY) / 2) * fit2;
        }
        if (wind > 0) {
          const ya = ay + 0.46, yb = by + 0.46;
          ax += sway(ya, ay * 3); bx += sway(yb, by * 3);
        }
        const dk = g.maxDepth > 0 ? g.depth[i] / g.maxDepth : 0;
        acc.line(acc.px(ax), acc.py(ay), acc.px(bx), acc.py(by), Math.max(0.8, lw * (1.6 - dk)), 1 - 0.45 * dk);
      }
      toBytes(acc.d, out, 1, 1);
    },
    snapshot(): ModelState { return { id: ID, v: V, steps, res: h, scalars: {}, arrays: {} }; },
    restore(s: ModelState) {
      if (s.id !== ID) throw new Error('El estado guardado no corresponde a este sistema L.');
      steps = s.steps;
    },
  };
}

/* ------------------------------------------------------------------ */
/* «Tiempo: jardín» and «Tiempo: pliegue»                              */
/* ------------------------------------------------------------------ */

const RATE = 30;
/** Garden: plants at once, and the share of a plant's growth time it stands grown and it withers. */
const PLANTS = 7, STAND: [number, number] = [0.8, 1.6], WITHER = 0.7;

/**
 * «Jardín»: PLANTS plants of the grammar along the ground (or hanging from the top, for roots), each with its
 * own seed, size and lean, at different ages. A plant grows from its root as the plain run does, stands a
 * while swaying in the wind, then withers from its finest branches to its trunk (bending toward the ground
 * and dimming) and is gone; a moment later another is born in its place. The state is the plants (their
 * seeds, births and lives) and the run's generator: each plant's geometry is built again from its seed.
 */
function garden(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  let p = cfg.params;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}|jardin`);
  const up = MODELS[String(p.model ?? 'helecho')]?.up ?? 1;
  const gens = Math.max(1, Math.min(9, Math.round(Number(p.gens ?? 5))));
  // per plant: seed number, birth step, steps growing, standing and withering, place, height, side
  const sid = new Int32Array(PLANTS), born = new Int32Array(PLANTS), gT = new Int32Array(PLANTS), sT = new Int32Array(PLANTS), wT = new Int32Array(PLANTS);
  const px = new Float32Array(PLANTS), sc = new Float32Array(PLANTS), side = new Int8Array(PLANTS);
  let steps = 0, next = 0;
  const geo = new Map<number, Geometry>();
  const growS = () => Math.max(0.5, Number(p.grow ?? 8)) * RATE;
  /** A new plant in slot k, born at step b. */
  const sow = (k: number, b: number) => {
    sid[k] = next++; born[k] = b;
    gT[k] = Math.round(growS() * rng.range(0.8, 1.25)); sT[k] = Math.round(gT[k] * rng.range(STAND[0], STAND[1])); wT[k] = Math.round(gT[k] * WITHER);
    px[k] = -1 + (2 * (k + 0.5)) / PLANTS + rng.range(-0.6, 0.6) / PLANTS;
    sc[k] = rng.range(0.5, 0.95); side[k] = rng.next() < 0.5 ? -1 : 1;
  };
  const lifeOf = (k: number) => gT[k] + sT[k] + wT[k];
  // the garden starts at different ages: the first plants were born before the run began
  for (let k = 0; k < PLANTS; k++) sow(k, 0);
  for (let k = 0; k < PLANTS; k++) born[k] = -Math.round(lifeOf(k) * ((k * 3) % PLANTS) / PLANTS);
  const geometry = (k: number): Geometry => {
    let g = geo.get(sid[k]);
    if (!g) {
      // one plant in three a generation smaller
      g = build(`${cfg.seed}|planta${sid[k]}`, { ...p, gens: sid[k] % 3 === 2 ? Math.max(1, gens - 1) : gens });
      geo.set(sid[k], g);
    }
    return g;
  };
  const prune = () => { const keep = new Set(Array.from(sid)); for (const s of [...geo.keys()]) if (!keep.has(s)) geo.delete(s); };
  const acc = new Accum(w, h);
  const step1 = () => {
    steps++;
    for (let k = 0; k < PLANTS; k++) {
      // a plant gone: another is born in its place after a short pause
      if (steps - born[k] >= lifeOf(k)) { sow(k, steps + rng.int(Math.round(RATE * 1.5))); prune(); }
    }
  };
  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = np; },
    step(n: number) { for (let i = 0; i < n; i++) step1(); },
    render(out: Uint8Array, t: number) {
      acc.clear();
      const wind = Number(p.wind ?? 0), width = Number(p.width ?? 1.4), lw = width * (h / 192);
      for (let k = 0; k < PLANTS; k++) {
        const a = steps - born[k];
        if (a < 0) continue;
        const g = geometry(k);
        const grow = Math.min(1, a / Math.max(1, gT[k])), front = grow * g.maxDist;
        const wi = Math.max(0, Math.min(1, (a - gT[k] - sT[k]) / Math.max(1, wT[k])));
        const H = Math.max(1e-6, g.maxY - g.minY), k1 = sc[k] / H, x0 = px[k], s = side[k];
        const ph = sid[k] * 1.7;
        const at = (x: number, y: number, o: Float64Array) => {
          // height along the plant (0 root, 1 top), the wind's sway and the withering's droop
          const yn = up > 0 ? (y - Math.max(g.minY, 0)) / H : (Math.min(g.maxY, 0) - y) / H;
          let X = x0 + s * x * k1, Y = up > 0 ? -0.5 + (y - Math.max(g.minY, 0)) * k1 : 0.5 - (Math.min(g.maxY, 0) - y) * k1;
          X += wind * 0.06 * yn * yn * Math.sin(t * 1.3 + ph + yn * 2) * sc[k];
          X += s * wi * 0.3 * sc[k] * yn * yn; Y -= up * wi * 0.25 * sc[k] * yn * yn;
          o[0] = X; o[1] = Y;
        };
        const A = new Float64Array(2), B = new Float64Array(2);
        for (let i = 0; i < g.n; i++) {
          const d0 = g.dist[i];
          if (d0 > front) continue;
          const dk = g.maxDepth > 0 ? g.depth[i] / g.maxDepth : 0;
          // withering: the finest branches go first, the trunk last
          const keep = Math.min(1, (1.1 * (1 - wi) - 0.9 * dk) * 5);
          if (keep <= 0) continue;
          const o = i * 6;
          const segLen = Math.hypot(g.seg[o + 3] - g.seg[o], g.seg[o + 4] - g.seg[o + 1]);
          const part = segLen > 0 ? Math.min(1, (front - d0) / segLen) : 1;
          at(g.seg[o], g.seg[o + 1], A);
          at(g.seg[o] + (g.seg[o + 3] - g.seg[o]) * part, g.seg[o + 1] + (g.seg[o + 4] - g.seg[o + 1]) * part, B);
          acc.line(acc.px(A[0]), acc.py(A[1]), acc.px(B[0]), acc.py(B[1]), Math.max(0.8, lw * (1.6 - dk) * (0.6 + 0.4 * sc[k])), (1 - 0.45 * dk) * (1 - 0.5 * wi) * keep);
        }
      }
      toBytes(acc.d, out, 1, 1);
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { next };
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { sid: sid.slice(), born: born.slice(), gT: gT.slice(), sT: sT.slice(), wT: wT.slice(), px: px.slice(), sc: sc.slice(), side: new Uint8Array(side.map(v => v + 1)) } };
    },
    restore(s: ModelState) {
      if (s.id !== ID) throw new Error('El estado guardado no corresponde a este sistema L.');
      const A = s.arrays, int = (a: unknown) => a instanceof Int32Array && a.length === PLANTS, flt = (a: unknown) => a instanceof Float32Array && a.length === PLANTS;
      if (!(int(A.sid) && int(A.born) && int(A.gT) && int(A.sT) && int(A.wT) && flt(A.px) && flt(A.sc) && A.side instanceof Uint8Array && A.side.length === PLANTS)) throw new Error('El estado guardado está incompleto.');
      sid.set(A.sid); born.set(A.born); gT.set(A.gT); sT.set(A.sT); wT.set(A.wT); px.set(A.px); sc.set(A.sc);
      for (let k = 0; k < PLANTS; k++) side[k] = (A.side as Uint8Array)[k] - 1;
      next = s.scalars.next ?? 0;
      rng.load(s.scalars);
      steps = s.steps;
      geo.clear();
    },
  };
}

/**
 * «Pliegue»: the figure folds and unfolds in an exact cycle of «Crecimiento» seconds. The dragon curve is a
 * strip of paper folded in half N times (N: «Generaciones»): its 2^N − 1 creases follow the regular
 * paperfolding sequence, crease i folding left or right as the odd part of i is 1 or 3 mod 4, and belonging
 * to the fold its power of two names. Each fold has its own angle, 0 to 90° and back, on a wave that runs from
 * the coarsest fold to the finest, so the strip passes through spirals, meanders and the dragon itself. Any
 * other grammar breathes the same way: each branching level opens and closes its angles on the wave. The
 * picture is a function of the step within the cycle (and the fit of its bounding box): no state but the clock.
 */
function folding(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  let p = cfg.params;
  const name = String(p.model ?? 'helecho');
  const dragon = name === 'dragon';
  const gens = Math.max(1, Math.min(9, Math.round(Number(p.gens ?? 5))));
  // the dragon: 2^N segments of a folded strip (as many as its grammar draws); others: the grammar's turtle program
  const N = gens, nSeg = 1 << N;
  const turn = new Int8Array(dragon ? nSeg : 0), fold = new Uint8Array(dragon ? nSeg : 0);
  for (let i = 1; i < (dragon ? nSeg : 0); i++) {
    let v = 0, k = i;
    while (!(k & 1)) { k >>= 1; v++; }
    turn[i] = (k & 3) === 1 ? 1 : -1; fold[i] = v;
  }
  const prog = dragon ? null : program(cfg.seed, p);
  const acc = new Accum(w, h);
  let steps = 0;
  const xs = new Float32Array(dragon ? nSeg + 1 : 0), ys = new Float32Array(dragon ? nSeg + 1 : 0);
  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = np; },
    step(n: number) { steps += n; },
    render(out: Uint8Array) {
      acc.clear();
      const P = Math.max(1, Math.round(Math.max(1, Number(p.grow ?? 8)) * RATE));
      const tau = (steps % P) / P, width = Number(p.width ?? 1.4), lw = Math.max(0.8, width * (h / 192));
      // a fold's opening on the wave: 0 (flat) … 1 (folded), the coarse folds leading
      const wave = (level: number, levels: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * (tau - (level / Math.max(1, levels)) * 0.45));
      if (dragon) {
        const ang = new Float64Array(N);
        for (let v = 0; v < N; v++) ang[v] = (Math.PI / 2) * (0.4 + 0.6 * wave(N - 1 - v, N));
        let x = 0, y = 0, hd = 0, minX = 0, maxX = 0, minY = 0, maxY = 0;
        xs[0] = 0; ys[0] = 0;
        for (let i = 0; i < nSeg; i++) {
          if (i > 0) hd += turn[i] * ang[fold[i]];
          x += Math.cos(hd); y += Math.sin(hd);
          xs[i + 1] = x; ys[i + 1] = y;
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        const k = Math.min(1.8 / Math.max(1e-6, maxX - minX), 0.9 / Math.max(1e-6, maxY - minY)), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        for (let i = 0; i < nSeg; i++) {
          // brighter toward the strip's free end: the folds over each other read apart
          acc.line(acc.px((xs[i] - cx) * k), acc.py((ys[i] - cy) * k), acc.px((xs[i + 1] - cx) * k), acc.py((ys[i + 1] - cy) * k), lw, 0.55 + 0.45 * (i / nSeg));
        }
      } else if (prog) {
        const segs = walk(prog, d => 0.45 + 0.55 * wave(d, prog.maxDepth + 1));
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < segs.n * 4; i += 2) { const x = segs.s[i], y = segs.s[i + 1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        if (segs.n) {
          const k = Math.min(1.8 / Math.max(1e-6, maxX - minX), 0.9 / Math.max(1e-6, maxY - minY)), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
          for (let i = 0; i < segs.n; i++) {
            const o = i * 4, dk = prog.maxDepth > 0 ? segs.d[i] / prog.maxDepth : 0;
            acc.line(acc.px((segs.s[o] - cx) * k), acc.py((segs.s[o + 1] - cy) * k), acc.px((segs.s[o + 2] - cx) * k), acc.py((segs.s[o + 3] - cy) * k), Math.max(0.8, lw * (1.6 - dk)), 1 - 0.45 * dk);
          }
        }
      }
      toBytes(acc.d, out, 1, 1);
    },
    snapshot(): ModelState { return { id: ID, v: V, steps, res: h, scalars: {}, arrays: {} }; },
    restore(s: ModelState) {
      if (s.id !== ID) throw new Error('El estado guardado no corresponde a este sistema L.');
      steps = s.steps;
    },
  };
}

/** A grammar's turtle program, flat (2D: the 3D turns read as their projection): codes, draws from the seed, depth. */
interface Program { code: Uint8Array; len: Float32Array; ang: Float32Array; depth: Uint8Array; n: number; maxDepth: number }
function program(seed: string, p: Params): Program {
  const name = String(p.model ?? 'helecho');
  const base = MODELS[name];
  const axiom = name === 'propio' || !base ? String(p.axiom ?? 'X') : base.axiom;
  const rules = parseRules(name === 'propio' || !base ? String(p.rules ?? '') : base.rules);
  const gens = Math.max(1, Math.min(9, Math.round(Number(p.gens ?? 5))));
  const ang = (Number(p.angle ?? 25) * Math.PI) / 180, decay = Number(p.decay ?? 1), jitter = Number(p.jitter ?? 0);
  const rng = new SimRng(`${ID}|${V}|${seed}|pliegue`);
  const { text } = expand(axiom, rules, gens);
  const n = Math.min(text.length, MAX_SYMBOLS);
  const code = new Uint8Array(n), len = new Float32Array(n), a = new Float32Array(n), depth = new Uint8Array(n);
  let d = 0, maxDepth = 0, i = 0;
  for (const c of text) {
    if (i >= n) break;
    // 1 forward (drawn), 2 forward, 3 turn, 4 turn round, 5 push, 6 pop, 0 nothing
    if (c === 'F' || c === 'G') { code[i] = c === 'F' ? 1 : 2; len[i] = Math.pow(decay, d) * (1 + jitter * 0.5 * (rng.next() - 0.5)); }
    else if (c === '+' || c === '-' || c === '&' || c === '^') { code[i] = 3; a[i] = (c === '+' || c === '&' ? 1 : -1) * ang * (1 + jitter * 0.35 * rng.gauss()); }
    else if (c === '|') code[i] = 4;
    else if (c === '[') { code[i] = 5; d++; if (d > maxDepth) maxDepth = d; }
    else if (c === ']') { code[i] = 6; d = Math.max(0, d - 1); }
    depth[i] = Math.min(255, d);
    i++;
  }
  return { code, len, ang: a, depth, n, maxDepth };
}
/** Walks a program with each turn's angle scaled by `open(depth)`: segments (x0 y0 x1 y1) and their depths. */
function walk(g: Program, open: (depth: number) => number): { s: Float32Array; d: Uint8Array; n: number } {
  const s = new Float32Array(Math.min(MAX_SEGMENTS, g.n) * 4), dd = new Uint8Array(Math.min(MAX_SEGMENTS, g.n));
  const scale = new Float64Array(g.maxDepth + 1);
  for (let k = 0; k <= g.maxDepth; k++) scale[k] = open(k);
  let x = 0, y = 0, hd = Math.PI / 2, n = 0;
  const stack: number[] = [];
  for (let i = 0; i < g.n; i++) {
    const c = g.code[i];
    if (c === 1 || c === 2) {
      const nx = x + Math.cos(hd) * g.len[i], ny = y + Math.sin(hd) * g.len[i];
      if (c === 1 && n < dd.length) { s[n * 4] = x; s[n * 4 + 1] = y; s[n * 4 + 2] = nx; s[n * 4 + 3] = ny; dd[n] = g.depth[i]; n++; }
      x = nx; y = ny;
    } else if (c === 3) hd += g.ang[i] * scale[g.depth[i]];
    else if (c === 4) hd += Math.PI;
    else if (c === 5) stack.push(x, y, hd);
    else if (c === 6 && stack.length) { hd = stack.pop()!; y = stack.pop()!; x = stack.pop()!; }
  }
  return { s, d: dd, n };
}
