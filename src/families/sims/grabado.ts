import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, SourceFeed } from '../types';
import { maskStrokes, offsetLine, planRoute, routeAt, routeEnd, sampleMask, sideOffset, walkCut, type Route, type TextCuts, type Trazo } from './grabado-ruta';
import { FIGURES, figureStrokes, signatureStrokes, wordStrokes, type Figure } from './grabado-trazos';

/**
 * «Grabado láser» (C-07 of the PR #10 inventory): a hot tip runs a route P(s) at a defined speed and cuts a
 * groove into a plate.
 *
 *  - The route (grabado-ruta.ts): the outlines of the person's words read from the piece's text (marching squares
 *    on the letters' mask, holes and accents included) and parallel cuts inside each letter (level sets of the
 *    distance to its edge), or the layer's own word in a single-stroke type, a figure or a signature
 *    (grabado-trazos.ts). Strokes go letter by letter by nearness; between them the tip moves with the laser off
 *    (four times faster) and cuts nothing.
 *  - The cut: along what it engraves in each step the tip lays heat (a Gaussian across the line); the heat cools
 *    (τ 0.3 s) and, while hot, digs: the groove deepens and widens behind the tip. The groove is a depth field
 *    drawn as relief: its normal under a light from the upper left gives a lit wall and a shaded one; the fresh
 *    cut keeps a tempered tint for a few seconds. Hot metal glows; the tip is a white core with a flickering halo.
 *  - Sparks (seeded, gravity, drag) fly back and up from the tip; smoke puffs rise, wobble and spread.
 *  - When the shape is done the plate cools (1.2 s); then, «sin fin», another pass starts from where the tip is
 *    (the same words with the inner cuts shifted half a step, the next figure or signature) while older grooves
 *    fade with the persistence; «una vez», it holds the finished plate (a construction).
 *  - Other words, another origin or other cuts start a new route from where the tip is: what was engraved
 *    dissolves in half a second, nothing jumps.
 * The state (depth, heat, temper, sparks, smoke, where the tip is on its route, the RNG) is a function of the seed,
 * the parameters, the source and the steps; the route is rebuilt from them, never stored.
 */

const ID = 'grabado', V = 1, RATE = 30, DT = 1 / RATE;
const MAX_SPARKS = 320, MAX_PUFFS = 240, SPARK = 6, PUFF = 6;
/** Steps the plate cools after a shape is done. */
const COOL_STEPS = 36;
/** Distance between parallel cuts (domain heights). */
export const SPACING = 0.03;
/** Groove half-width at «Grosor» 1 (domain heights). */
const HALF = 0.0085;
/** Heat a cell receives as the tip passes over its centre, and how fast heat turns into depth. */
const E0 = 1.25, DIG = 5, TAU_HEAT = 0.16, TAU_WIPE = 0.45, TAU_TEMPER = 2.5;
/** Energy of a parallel cut, relative to the outline's. */
const INNER = 0.55;
const WORK = 0, COOL = 1, HOLD = 2;

/** 0..1 → a byte in steps of 4 (as the other models: both engines then round a half-texel sample alike). */
const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 252 : ((v * 63 + 0.5) | 0) * 4);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

interface P {
  origen: 'texto' | 'forma' | 'curva'; palabra: string; figura: string; velocidad: number; grosor: number; pasadas: number;
  chispas: number; humo: number; persistencia: number; material: 'acero' | 'laton' | 'madera'; ciclo: 'continuo' | 'una';
}
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const read = (p: Params): P => ({
  origen: p.origen === 'forma' || p.origen === 'curva' ? p.origen : 'texto',
  palabra: typeof p.palabra === 'string' ? p.palabra : 'GLYPHOS',
  figura: typeof p.figura === 'string' ? p.figura : 'serie',
  velocidad: Math.max(0.05, num(p.velocidad, 0.45)), grosor: Math.max(0.2, num(p.grosor, 1)),
  pasadas: Math.max(1, Math.min(6, Math.round(num(p.pasadas, 2)))),
  chispas: clamp01(num(p.chispas, 0.6)), humo: clamp01(num(p.humo, 0.35)), persistencia: clamp01(num(p.persistencia, 0.85)),
  material: p.material === 'laton' || p.material === 'madera' ? p.material : 'acero',
  ciclo: p.ciclo === 'una' ? 'una' : 'continuo',
});
/** What the route depends on (besides the source and the pass): a change starts a new route. */
const routeKey = (p: P) => `${p.origen}|${p.palabra}|${p.figura}|${p.pasadas}`;

/** Persistence → time constant of the groove's fading (s): 1 s at 0, two minutes at 1. */
export const fadeTau = (pers: number) => Math.pow(120, pers);

/* ---- materials: the plate, the cut and their colours ------------------------------------------------------- */

/**
 * A material: the plate's light (a base and its texture's amount) and colour, the cut's light, its colour and its
 * lit wall's, the tint of a fresh cut and the smoke's colour. Light always means ink (the cut is drawn with dense
 * glyphs); wood's colours are dark (a burn) for a light background (its presets' look).
 */
interface Mat {
  plate: number; amp: number; plateC: number[]; cut: number; cutC: number[]; litC: number[]; temperC: number[]; smokeC: number[];
  /** The tip's core and halo, the sparks, and how far up the heat's colour ramp goes (embers on wood stay orange). */
  coreC: number[]; haloC: number[]; sparkC: number[]; heatCap: number;
}
const MATS: Record<P['material'], Mat> = {
  // brushed steel: a dark plate, the cut bright and cold
  acero: { plate: 0, amp: 0.075, plateC: [0.30, 0.33, 0.38], cut: 0.74, cutC: [0.70, 0.76, 0.84], litC: [0.94, 0.97, 1], temperC: [1, 0.72, 0.38], smokeC: [0.62, 0.66, 0.72],
    coreC: [1, 0.97, 0.9], haloC: [1, 0.55, 0.16], sparkC: [1, 0.82, 0.45], heatCap: 2.2 },
  // brass: warm plate, golden cut
  laton: { plate: 0, amp: 0.07, plateC: [0.42, 0.29, 0.10], cut: 0.76, cutC: [0.96, 0.74, 0.34], litC: [1, 0.93, 0.66], temperC: [1, 0.55, 0.3], smokeC: [0.6, 0.58, 0.55],
    coreC: [1, 0.97, 0.88], haloC: [1, 0.6, 0.18], sparkC: [1, 0.85, 0.5], heatCap: 2.2 },
  // wood: the grain in a few strokes and the burn in dark browns, for a light background (pyrography)
  madera: { plate: 0, amp: 0.1, plateC: [0.52, 0.33, 0.17], cut: 0.78, cutC: [0.17, 0.07, 0.025], litC: [0.34, 0.16, 0.06], temperC: [0.62, 0.2, 0.04], smokeC: [0.42, 0.38, 0.36],
    coreC: [1, 0.48, 0.08], haloC: [0.86, 0.24, 0.04], sparkC: [0.95, 0.4, 0.06], heatCap: 1 },
};

/** Colour of hot metal (0 → dark red, 1 → orange, 2 → yellow-white) into out. */
function heatColour(h: number, cap: number, out: Float64Array) {
  const t = Math.min(cap, h);
  if (t < 1) { out[0] = 0.6 + 0.4 * t; out[1] = 0.08 + 0.4 * t; out[2] = 0.02 + 0.06 * t; }
  else { const u = (t - 1) / 1.2; out[0] = 1; out[1] = 0.48 + 0.47 * u; out[2] = 0.08 + 0.72 * u; }
}

/* ---- value noise for the plate's texture (seeded) ----------------------------------------------------------- */

function hash2(x: number, y: number, s: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h, n = w * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  const seedN = Math.floor(rng.next() * 1e6);
  let p = read(cfg.params);
  let steps = 0;

  // ---- state
  const G = new Float32Array(n);   // groove depth 0..1
  const W = new Float32Array(n);   // what was engraved before a change, dissolving
  const H = new Float32Array(n);   // heat
  const C = new Float32Array(n);   // step of the last cut through the cell (temper)
  const SP = new Float32Array(MAX_SPARKS * SPARK); // x, y, vx, vy, life left, life
  const PF = new Float32Array(MAX_PUFFS * PUFF);   // x, y, vx, vy, age, life
  const S = {
    phase: WORK, phaseSteps: 0, k: 0, cost: 0, tipX: -0.85, tipY: 0.3, tipOn: 0, dirX: 1, dirY: 0, sx: -0.85, sy: 0.3,
    hasSig: 0, sigN: 0, sigCut: 0, sigX0: 0, sigY0: 0, sigX1: 0, sigY1: 0,
    spHead: 0, pfHead: 0, bx0: 0, by0: 0, bx1: -1, by1: -1, wOn: 0,
  };

  // ---- the route (rebuilt from the seed, parameters, source and pass; never stored)
  let src: SourceFeed | null = null;
  /** The words' strokes by pass parity (the inner cuts shift half a step every other pass). */
  const maskCache = new Map<string, TextCuts>();
  let route: Route | null = null;
  /** The route must be rebuilt (source or parameters changed, or a restored state): same work, or a new one. */
  let dirty = true;
  let rk = routeKey(p);

  /** How the groove fits the route's letters (TextCuts.fit): narrower on small letters; 1 for every other route. */
  let fit = 1;
  const textStrokes = (k: number): TextCuts | null => {
    if (!src || src.kind !== 2 || !(src.text ?? '').trim()) return null;
    const phase = k % 2, gh = Math.min(192, Math.max(64, 2 * h));
    const key = `${gh}|${p.pasadas}|${phase}`;
    let st = maskCache.get(key);
    if (!st) { st = maskStrokes(sampleMask(src, gh), p.pasadas, SPACING, phase); maskCache.set(key, st); }
    return st;
  };
  /** Parallel cuts beside open lines (own type, signatures): alternately on each side. */
  const beside = (base: Trazo[], k: number): Trazo[] => {
    const out = base.slice();
    for (const t of base) for (let j = 1; j < p.pasadas; j++) {
      const d = sideOffset(j, SPACING) * (k % 2 ? -1 : 1);
      out.push({ pts: offsetLine(t.pts, t.closed, d), closed: t.closed, group: t.group, level: j });
    }
    return out;
  };
  const figureOf = (k: number): Figure => (FIGURES as readonly string[]).includes(p.figura) ? (p.figura as Figure) : FIGURES[(k + seedN) % FIGURES.length];
  const strokesFor = (k: number): Trazo[] => {
    fit = 1;
    if (p.origen === 'texto') {
      const t = textStrokes(k);
      if (t?.strokes.length) { fit = t.fit; return t.strokes; }
      // no words in the piece: the layer's own word, in the single-stroke type; with no word either, a figure
      const own = wordStrokes(p.palabra);
      if (own.length) return beside(own, k);
      return figureStrokes(figureOf(k), k, cfg.seed, p.pasadas);
    }
    if (p.origen === 'curva') return beside(signatureStrokes(k, cfg.seed), k);
    return figureStrokes(figureOf(k), k, cfg.seed, p.pasadas);
  };
  const sigOf = (r: Route) => ({ n: r.strokes, cut: r.cut, box: r.box });
  const sameSig = (r: Route) => {
    if (!S.hasSig) return false;
    const b = r.box, tol = 0.012;
    return r.strokes === S.sigN && Math.abs(r.cut - S.sigCut) <= 0.03 * S.sigCut + 0.02
      && Math.abs(b[0] - S.sigX0) < tol && Math.abs(b[1] - S.sigY0) < tol && Math.abs(b[2] - S.sigX1) < tol && Math.abs(b[3] - S.sigY1) < tol;
  };
  const keepSig = (r: Route) => {
    const g = sigOf(r);
    S.hasSig = 1; S.sigN = g.n; S.sigCut = g.cut; [S.sigX0, S.sigY0, S.sigX1, S.sigY1] = g.box;
  };
  /** A new work from where the tip is: route k, from its start. */
  const begin = (k: number) => {
    S.k = k; S.sx = S.tipX; S.sy = S.tipY; S.cost = 0; S.phase = WORK; S.phaseSteps = 0;
    route = planRoute(strokesFor(k), S.sx, S.sy);
    keepSig(route);
  };
  const ensureRoute = () => {
    if (!dirty && route) return;
    dirty = false;
    const r = planRoute(strokesFor(S.k), S.sx, S.sy);
    if (!S.hasSig) { route = r; keepSig(r); return; }
    if (sameSig(r)) { route = r; S.cost = Math.min(S.cost, routeEnd(r)); return; }
    // other words, another origin, other cuts: what was engraved dissolves, a new route starts from the tip
    for (let i = 0; i < n; i++) { if (G[i] > W[i]) W[i] = G[i]; G[i] = 0; }
    S.wOn = 1;
    begin(S.k + 1);
  };

  // ---- the plate's texture (from the seed and the material; not state)
  const tex = new Float32Array(n);
  let texFor = '';
  const makeTex = () => {
    if (texFor === p.material) return;
    texFor = p.material;
    for (let j = 0; j < h; j++) {
      const y = 0.5 - (j + 0.5) / h;
      for (let i = 0; i < w; i++) {
        const x = (i + 0.5) / h - 1;
        let v: number;
        // metals: sparse highlights (cubed), so the plate reads as a few brushed streaks or hammer marks, not a field
        if (p.material === 'acero') { v = 0.6 * vnoise(x * 3, y * 95, seedN) + 0.4 * vnoise(x * 0.9, y * 22, seedN + 1); v = v * v * v * 1.6; }
        else if (p.material === 'laton') { v = 0.65 * vnoise(x * 13, y * 13, seedN) + 0.35 * vnoise(x * 38, y * 38, seedN + 2); v = v * v * v * 1.6; }
        else {
          const g = y * 34 + 2.6 * vnoise(x * 1.6, y * 3.2, seedN) + 0.6 * vnoise(x * 6, y * 9, seedN + 3);
          // thin grain lines (a sharp peak of a sine bent by noise) and a little pore noise
          v = Math.pow(0.5 + 0.5 * Math.sin(g * Math.PI), 6);
          v = 0.85 * v + 0.2 * vnoise(x * 40, y * 4, seedN + 4) * v + 0.15 * Math.pow(vnoise(x * 30, y * 30, seedN + 5), 4);
        }
        tex[j * w + i] = v;
      }
    }
  };

  // ---- the cut
  const stamp = (x: number, y: number, dl: number, level: number) => {
    const sig = Math.max(0.45, HALF * p.grosor * fit * h * 0.85);
    const fx = ((x + 1) * 0.5) * w - 0.5, fy = (0.5 - y) * h - 0.5;
    // the parallel cuts are shallower than the outline: the letter keeps its edge, its inside reads as hatching
    const R = Math.ceil(2.6 * sig), e = ((level > 0 ? INNER : 1) * E0 * dl * h) / (Math.sqrt(2 * Math.PI) * sig), inv = 1 / (2 * sig * sig);
    const ix = Math.round(fx), iy = Math.round(fy);
    for (let j = iy - R; j <= iy + R; j++) {
      if (j < 0 || j >= h) continue;
      for (let i = ix - R; i <= ix + R; i++) {
        if (i < 0 || i >= w) continue;
        const d2 = (i - fx) * (i - fx) + (j - fy) * (j - fy), q = Math.exp(-d2 * inv);
        if (q < 0.01) continue;
        const k = j * w + i;
        H[k] += e * q;
        if (q > 0.25) C[k] = steps;
      }
    }
    if (S.bx1 < S.bx0) { S.bx0 = ix - R; S.bx1 = ix + R; S.by0 = iy - R; S.by1 = iy + R; }
    else { S.bx0 = Math.min(S.bx0, ix - R); S.bx1 = Math.max(S.bx1, ix + R); S.by0 = Math.min(S.by0, iy - R); S.by1 = Math.max(S.by1, iy + R); }
  };
  const DIR = new Float64Array(2);
  const onSample = (x: number, y: number, ux: number, uy: number, dl: number, level: number) => { stamp(x, y, dl, level); DIR[0] = ux; DIR[1] = uy; };

  const TIP = new Float64Array(4);
  const step1 = () => {
    ensureRoute();
    const r = route!;
    let cut = 0;
    if (S.phase === WORK) {
      const end = routeEnd(r), c0 = S.cost, c1 = Math.min(end, c0 + p.velocidad * DT);
      DIR[0] = S.dirX; DIR[1] = S.dirY;
      cut = walkCut(r, c0, c1, 0.35 / h, onSample);
      S.dirX = DIR[0]; S.dirY = DIR[1];
      S.cost = c1;
      routeAt(r, c1, TIP);
      S.tipX = TIP[0]; S.tipY = TIP[1]; S.tipOn = TIP[2] && cut > 0 ? 1 : 0;
      if (c1 >= end - 1e-12) { S.phase = COOL; S.phaseSteps = 0; S.tipOn = 0; }
    } else if (S.phase === COOL) {
      S.tipOn = 0;
      if (++S.phaseSteps >= COOL_STEPS) {
        if (p.ciclo === 'continuo') begin(S.k + 1);
        else S.phase = HOLD;
      }
    } else {
      S.tipOn = 0;
      if (p.ciclo === 'continuo') begin(S.k + 1);
    }

    // heat digs while it cools (only where it is: the box around the recent cut)
    if (S.bx1 >= S.bx0) {
      const cool = Math.exp(-DT / TAU_HEAT), dig = DIG * DT;
      const x0 = Math.max(0, S.bx0), x1 = Math.min(w - 1, S.bx1), y0 = Math.max(0, S.by0), y1 = Math.min(h - 1, S.by1);
      let nx0 = w, nx1 = -1, ny0 = h, ny1 = -1;
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const k = j * w + i, hv = H[k];
        if (hv <= 0) continue;
        const g = G[k] + dig * hv;
        G[k] = g > 1 ? 1 : g;
        const nh = hv * cool;
        if (nh < 2e-3) { H[k] = 0; continue; }
        H[k] = nh;
        if (i < nx0) nx0 = i; if (i > nx1) nx1 = i; if (j < ny0) ny0 = j; if (j > ny1) ny1 = j;
      }
      if (nx1 < 0) { S.bx0 = 0; S.bx1 = -1; S.by0 = 0; S.by1 = -1; } else { S.bx0 = nx0; S.bx1 = nx1; S.by0 = ny0; S.by1 = ny1; }
    }
    // the groove fades with the persistence (only «sin fin»: a finished plate holds); a dissolving route faster
    if (p.ciclo === 'continuo') {
      const f = Math.exp(-DT / fadeTau(p.persistencia));
      for (let i = 0; i < n; i++) G[i] *= f;
    }
    if (S.wOn) {
      const f = Math.exp(-DT / TAU_WIPE);
      let any = false;
      for (let i = 0; i < n; i++) { const v = W[i] * f; W[i] = v < 1e-3 ? 0 : v; any ||= v >= 1e-3; }
      if (!any) S.wOn = 0;
    }

    // sparks: born at the tip while it cuts, flying back and up, falling
    const frac = cut / Math.max(1e-9, p.velocidad * DT);
    if (cut > 0 && p.chispas > 0) {
      const born = Math.floor(p.chispas * 7 * frac + rng.next());
      for (let b = 0; b < born; b++) {
        const o = S.spHead * SPARK;
        S.spHead = (S.spHead + 1) % MAX_SPARKS;
        const bx = -S.dirX * 0.6, by = -S.dirY * 0.6 + 0.85, ba = Math.atan2(by, bx) + rng.range(-1.15, 1.15);
        const sp = rng.range(0.35, 1.4) * (0.75 + 0.5 * p.chispas), life = rng.range(0.18, 0.6);
        SP[o] = S.tipX + rng.range(-0.3, 0.3) / h; SP[o + 1] = S.tipY + rng.range(-0.3, 0.3) / h;
        SP[o + 2] = Math.cos(ba) * sp; SP[o + 3] = Math.sin(ba) * sp; SP[o + 4] = life; SP[o + 5] = life;
      }
    }
    for (let s = 0; s < MAX_SPARKS; s++) {
      const o = s * SPARK;
      if (SP[o + 4] <= 0) continue;
      SP[o + 3] -= 2.4 * DT;
      SP[o + 2] *= 0.985; SP[o + 3] *= 0.985;
      SP[o] += SP[o + 2] * DT; SP[o + 1] += SP[o + 3] * DT;
      SP[o + 4] -= DT;
    }
    // smoke: puffs from the cut that rise, wobble and spread
    if (cut > 0 && p.humo > 0) {
      const born = Math.floor(p.humo * 1.6 * frac + rng.next());
      for (let b = 0; b < born; b++) {
        const o = S.pfHead * PUFF;
        S.pfHead = (S.pfHead + 1) % MAX_PUFFS;
        PF[o] = S.tipX + rng.range(-0.004, 0.004); PF[o + 1] = S.tipY + 0.004;
        PF[o + 2] = rng.range(-0.03, 0.03); PF[o + 3] = rng.range(0.07, 0.15); PF[o + 4] = 0; PF[o + 5] = rng.range(1.8, 3.4);
      }
    }
    for (let s = 0; s < MAX_PUFFS; s++) {
      const o = s * PUFF;
      if (PF[o + 5] <= 0 || PF[o + 4] >= PF[o + 5]) continue;
      const age = PF[o + 4];
      PF[o] += (PF[o + 2] + 0.035 * Math.sin(s * 1.7 + 9 * PF[o + 1] + 1.3 * age)) * DT;
      PF[o + 1] += PF[o + 3] * DT;
      PF[o + 3] *= 0.998;
      PF[o + 4] = age + DT;
    }
    steps++;
  };

  // ---- drawing
  const L = new Float32Array(n), RGB = new Float32Array(n * 3), SM = new Float32Array(n), GM = new Float32Array(n);
  const OUT = new Uint8Array(n * 3);
  let drawnSteps = -1, drawnKey = '';
  const HC = new Float64Array(3);
  /** Adds light dl of colour (r, g, b) to cell k: the cell's colour is the light-weighted mean. */
  const addLight = (k: number, dl: number, r: number, g: number, b: number) => {
    if (dl <= 0) return;
    const l0 = L[k], l1 = l0 + dl, o = k * 3;
    RGB[o] = (RGB[o] * l0 + r * dl) / l1; RGB[o + 1] = (RGB[o + 1] * l0 + g * dl) / l1; RGB[o + 2] = (RGB[o + 2] * l0 + b * dl) / l1;
    L[k] = l1;
  };
  const splat = (x: number, y: number, sig: number, amp: number, r: number, g: number, b: number) => {
    const fx = ((x + 1) * 0.5) * w - 0.5, fy = (0.5 - y) * h - 0.5, R = Math.ceil(2.5 * sig), inv = 1 / (2 * sig * sig);
    const ix = Math.round(fx), iy = Math.round(fy);
    for (let j = iy - R; j <= iy + R; j++) {
      if (j < 0 || j >= h) continue;
      for (let i = ix - R; i <= ix + R; i++) {
        if (i < 0 || i >= w) continue;
        const q = Math.exp(-((i - fx) * (i - fx) + (j - fy) * (j - fy)) * inv);
        if (q > 0.01) addLight(j * w + i, amp * q, r, g, b);
      }
    }
  };
  const draw = () => {
    ensureRoute();
    makeTex();
    const key = `${p.material}|${p.humo}|${p.chispas}|${p.grosor}`;
    if (drawnSteps === steps && drawnKey === key) return;
    drawnSteps = steps; drawnKey = key;
    const M = MATS[p.material];
    // light from the upper left, a little above the plate
    const lx = -0.55, ly = 0.62, lz = 0.56, ln = Math.hypot(lx, ly, lz), Lx = lx / ln, Ly = ly / ln, Lz = lz / ln;
    const relief = 3.2;
    // the depth drawn: the groove, and what dissolves after a change
    let D = G;
    if (S.wOn) { D = GM; for (let k = 0; k < n; k++) GM[k] = G[k] > W[k] ? G[k] : W[k]; }
    const pc0 = M.plateC[0], pc1 = M.plateC[1], pc2 = M.plateC[2];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i, o = k * 3;
        const g = D[k];
        const gl = i > 0 ? D[k - 1] : g, gr = i < w - 1 ? D[k + 1] : g;
        const gu = j > 0 ? D[k - w] : g, gd = j < h - 1 ? D[k + w] : g;
        const plate = M.plate + M.amp * tex[k];
        if (g === 0 && gl === 0 && gr === 0 && gu === 0 && gd === 0) {
          // untouched plate (most of it): its texture, and the heat if the tip is about to cut here
          L[k] = plate; RGB[o] = pc0; RGB[o + 1] = pc1; RGB[o + 2] = pc2;
          const hv = H[k];
          if (hv > 0.004) { heatColour(hv, M.heatCap, HC); addLight(k, 0.95 * (1 - Math.exp(-1.3 * hv)), HC[0], HC[1], HC[2]); }
          continue;
        }
        // the groove is a dip: its surface z = −g; normal from the gradient
        const nx = (gr - gl) * 0.5 * relief, ny = (gu - gd) * 0.5 * relief, nl = Math.sqrt(nx * nx + ny * ny + 1);
        const lit = (nx * Lx + ny * Ly + Lz) / nl - Lz;
        const ink = smooth(0.03, 0.7, g);
        let l = plate * (1 - ink) + ink * M.cut * (0.65 + 0.35 * g) + 0.8 * lit;
        l = l < 0 ? 0 : l;
        // colour: plate, cut (the lit wall whiter), a fresh cut tempered warm for a few seconds
        const lt = clamp01(lit * 2.2);
        let r = M.plateC[0] * (1 - ink) + ink * (M.cutC[0] + (M.litC[0] - M.cutC[0]) * lt);
        let gg = M.plateC[1] * (1 - ink) + ink * (M.cutC[1] + (M.litC[1] - M.cutC[1]) * lt);
        let b = M.plateC[2] * (1 - ink) + ink * (M.cutC[2] + (M.litC[2] - M.cutC[2]) * lt);
        if (ink > 0.05 && C[k] > 0) {
          const tp = Math.exp(-(steps - C[k]) / (TAU_TEMPER * RATE)) * ink;
          if (tp > 0.01) {
            const tr = M.temperC[0], tg = M.temperC[1], tb = M.temperC[2];
            r += (tr - r) * tp * 0.7; gg += (tg - gg) * tp * 0.7; b += (tb - b) * tp * 0.7;
          }
        }
        L[k] = l; RGB[o] = r; RGB[o + 1] = gg; RGB[o + 2] = b;
        // hot metal glows
        const hv = H[k];
        if (hv > 0.004) { heatColour(hv, M.heatCap, HC); addLight(k, 0.95 * (1 - Math.exp(-1.3 * hv)), HC[0], HC[1], HC[2]); }
      }
    }
    // smoke: soft puffs that veil the plate (lighter and greyer where they are)
    if (p.humo > 0) {
      // on a half-resolution grid (smoke is soft), each puff a smooth bump (1 − d²/R²)²
      SM.fill(0);
      const sw = w >> 1, sh = h >> 1;
      for (let s = 0; s < MAX_PUFFS; s++) {
        const o = s * PUFF, life = PF[o + 5], age = PF[o + 4];
        if (life <= 0 || age >= life) continue;
        const u = age / life, a = p.humo * Math.pow(1 - u, 1.5) * Math.min(1, age / 0.15) * 0.55;
        const R = (0.025 + 0.085 * u) * sh, R2 = R * R;
        const fx = ((PF[o] + 1) * 0.5) * sw - 0.5, fy = (0.5 - PF[o + 1]) * sh - 0.5;
        const j0 = Math.max(0, Math.ceil(fy - R)), j1 = Math.min(sh - 1, Math.floor(fy + R)), i0 = Math.max(0, Math.ceil(fx - R)), i1 = Math.min(sw - 1, Math.floor(fx + R));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const q = 1 - ((i - fx) * (i - fx) + (j - fy) * (j - fy)) / R2;
          if (q > 0) SM[j * sw + i] += a * q * q;
        }
      }
      const sc = M.smokeC;
      for (let k = 0, j = 0, i = 0; k < n; k++, i++) {
        if (i === w) { i = 0; j++; }
        const sv = SM[Math.min(sh - 1, j >> 1) * sw + Math.min(sw - 1, i >> 1)];
        if (sv <= 0.003) continue;
        const v = Math.min(1, sv);
        const o = k * 3;
        L[k] = L[k] * (1 - 0.3 * v) + 0.11 * v;
        RGB[o] += (sc[0] - RGB[o]) * v * 0.8; RGB[o + 1] += (sc[1] - RGB[o + 1]) * v * 0.8; RGB[o + 2] += (sc[2] - RGB[o + 2]) * v * 0.8;
      }
    }
    // sparks: short streaks back along their flight
    for (let s = 0; s < MAX_SPARKS; s++) {
      const o = s * SPARK, left = SP[o + 4];
      if (left <= 0) continue;
      const f = Math.sqrt(left / SP[o + 5]), x = SP[o], y = SP[o + 1], vx = SP[o + 2], vy = SP[o + 3];
      for (let q = 0; q < 3; q++) {
        const b = q / 3;
        splat(x - vx * 0.03 * b, y - vy * 0.03 * b, 0.55, 0.85 * f * (1 - 0.45 * b), M.sparkC[0], M.sparkC[1], M.sparkC[2]);
      }
    }
    // the tip: a white core with a flickering halo while it cuts; a dim point while it moves with the laser off
    if (S.phase === WORK) {
      if (S.tipOn) {
        const fl = 0.8 + 0.2 * hash2(steps, 7, seedN);
        splat(S.tipX, S.tipY, 2.2, 0.42 * fl, M.haloC[0], M.haloC[1], M.haloC[2]);
        splat(S.tipX, S.tipY, 0.75, 1.3, M.coreC[0], M.coreC[1], M.coreC[2]);
      } else splat(S.tipX, S.tipY, 0.6, 0.32, 0.62, 0.72, 0.82);
    }
    for (let k = 0; k < n; k++) {
      const o = k * 3;
      OUT[o] = Math.round(clamp01(RGB[o]) * 255); OUT[o + 1] = Math.round(clamp01(RGB[o + 1]) * 255); OUT[o + 2] = Math.round(clamp01(RGB[o + 2]) * 255);
    }
  };

  const model: FieldModel & { debug(): { route: Route | null; state: typeof S } } = {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) {
      p = read(np);
      const nk = routeKey(p);
      if (nk !== rk) { rk = nk; maskCache.clear(); dirty = true; }
    },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array, _t: number) {
      draw();
      for (let k = 0; k < n; k++) out[k] = byte(L[k]);
    },
    renderColor(out: Uint8Array, _t: number) {
      draw();
      out.set(OUT);
    },
    feed(s: SourceFeed | null) {
      // only words: a picture is not something this tip follows
      const next = s && s.kind === 2 ? s : null;
      if (!next && !src) return;
      src = next; maskCache.clear();
      dirty = true;
      drawnSteps = -1;
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { ...S };
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { G: G.slice(), W: W.slice(), H: H.slice(), C: C.slice(), SP: SP.slice(), PF: PF.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a este grabado.');
      const A = s.arrays;
      const ok = (x: unknown, len: number): x is Float32Array => x instanceof Float32Array && x.length === len;
      if (!ok(A.G, n) || !ok(A.W, n) || !ok(A.H, n) || !ok(A.C, n) || !ok(A.SP, SP.length) || !ok(A.PF, PF.length)) throw new Error('El estado guardado está incompleto.');
      G.set(A.G); W.set(A.W); H.set(A.H); C.set(A.C); SP.set(A.SP); PF.set(A.PF);
      for (const key of Object.keys(S) as Array<keyof typeof S>) if (typeof s.scalars[key] === 'number') S[key] = s.scalars[key];
      steps = s.steps;
      rng.load(s.scalars);
      route = null; dirty = true; drawnSteps = -1;
    },
    debug() { ensureRoute(); return { route, state: S }; },
  };
  return model;
}
