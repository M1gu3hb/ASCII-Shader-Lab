import { Accum, OrbitCamera, toBytes } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params } from '../types';

/**
 * Lindenmayer systems: an axiom rewritten by rules for a number of generations (bounded), then read by a
 * 3D turtle (F draws forward, G moves forward, + − yaw, & ^ pitch, \ / roll, | turns round, [ ] push and
 * pop). The structure is built once from the seed and the grammar; the run's steps reveal it growing from
 * the root (each segment appears when the growth front reaches its distance along the path), then it sways.
 * The state is the growth step: the geometry is a function of (seed, grammar, angle, lengths, variation).
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
