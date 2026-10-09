import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params } from '../types';

/**
 * Wave Function Collapse, simple tiled model (after Maxim Gumin's algorithm, written here from its
 * description): a grid of cells, each with the set of tiles it may still hold. Tiles are small bitmaps drawn
 * for GLYPHOS; their edge sockets are their edge pixels, so two tiles may touch where their facing edges are
 * identical. Rotations and reflections come from each tile's symmetry (identical bitmaps are merged; a side
 * view with gravity only takes mirror images). Each step collapses «Ritmo» cells: the undecided cell of
 * lowest Shannon entropy (ties broken by the distance to a seeded starting point, so the board grows as a
 * front) takes one of its tiles at random by weight, and the removal of the others propagates to every cell
 * (AC-3 with support counts). A contradiction (a cell with no tile left) is repaired by reopening the cells
 * around it; after REPAIRS repairs the board starts again with the next variant, at most RESTARTS times. A
 * finished board holds for «Espera» seconds and is then rebuilt with the next variant.
 * Constraint-based generation: nothing quantum is simulated.
 */

const ID = 'wfc', V = 1;
/**
 * 0..1 → a byte in steps of 4 (64 levels): a sample halfway between two or four texels is then a whole level
 * in both engines (the GPU's float32 and the CPU's float64 would otherwise round an exact .5 apart and pick
 * different glyphs).
 */
const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 252 : ((v * 63 + 0.5) | 0) * 4);

const RATE = 30;
const REPAIRS = 6;
const RESTARTS = 3;
const FLASH = 8;

/* ------------------------------------------------------------------ */
/* Tilesets                                                            */
/* ------------------------------------------------------------------ */

/** Pixel values of the bitmaps' characters, and their value in the «Sólo líneas» view. */
const VALUE: Record<string, number> = { '.': 0, ':': 0.3, '#': 1, 'o': 0.85, 'X': 0.42, '=': 0.62 };
const LINE: Record<string, number> = { '#': 1, 'o': 1, '=': 0.7 };

interface Tile { bits: string; w: number; empty: boolean }
/** border: the socket each side of the frame imposes with «Bordes: vacíos» (N, E, S, W; null: free). */
interface Tileset { S: number; tiles: Tile[]; border: Array<string | null> }

const rotate = (b: string, S: number) => { let o = ''; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) o += b[(S - 1 - x) * S + y]; return o; };
const mirror = (b: string, S: number) => { let o = ''; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) o += b[y * S + S - 1 - x]; return o; };

/**
 * A base tile and its distinct rotations and reflections (or, in a side view with gravity, its mirror image
 * only); the weight is shared among them.
 */
function variants(rows: string[], w: number, empty = false, mirrorOnly = false): Tile[] {
  const S = rows.length, seen = new Set<string>();
  let b = rows.join('');
  for (let m = 0; m < 2; m++) {
    for (let r = 0; r < 4; r++) { seen.add(b); if (mirrorOnly) break; b = rotate(b, S); }
    b = mirror(b, S);
  }
  return [...seen].map(bits => ({ bits, w: w / seen.size, empty }));
}

/** «Circuitos»: traces, corners, junctions, vias, capacitors and chips (5 × 5). */
function circuits(): Tileset {
  const T: Tile[] = [
    ...variants(['.....', '.....', '.....', '.....', '.....'], 6, true),
    ...variants(['..#..', '..#..', '..#..', '..#..', '..#..'], 3),
    ...variants(['..#..', '..#..', '..###', '.....', '.....'], 2),
    ...variants(['..#..', '..#..', '#####', '.....', '.....'], 1),
    ...variants(['..#..', '..#..', '#####', '..#..', '..#..'], 0.4),
    ...variants(['..#..', '.ooo.', '.o.o.', '.ooo.', '.....'], 0.7),
    ...variants(['..#..', '.###.', '.....', '.###.', '..#..'], 0.35),
    // chips: body, body with a mark, edge, edge with a pin, corner
    ...variants(['XXXXX', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX'], 0.5),
    ...variants(['XXXXX', 'XXXXX', 'XX.XX', 'XXXXX', 'XXXXX'], 0.08),
    ...variants(['.....', '.....', 'XXXXX', 'XXXXX', 'XXXXX'], 0.35),
    ...variants(['..#..', '..=..', 'XXXXX', 'XXXXX', 'XXXXX'], 0.6),
    ...variants(['.....', '.....', '..XXX', '..XXX', '..XXX'], 0.3),
  ];
  return { S: 5, tiles: T, border: ['.....', '.....', '.....', '.....'] };
}

/**
 * «Muros»: a floor plan (6 × 6). Walls two pixels thick run from the centre to some of the four edges;
 * the regions between them are rooms (':') or outside ('.'), and a wall never stands in the open (it has
 * a room on at least one side). Doors, windows and columns decorate some of them.
 */
function walls(): Tileset {
  const T: Tile[] = [];
  const F = ['.', ':'];
  for (let mask = 0; mask < 16; mask++) {
    const n = !!(mask & 1), e = !!(mask & 2), s = !!(mask & 4), w = !!(mask & 8);
    const arms = +n + +e + +s + +w;
    for (let q = 0; q < 16; q++) {
      // quadrant fills: NW, NE, SE, SW
      const nw = F[q & 1], ne = F[(q >> 1) & 1], se = F[(q >> 2) & 1], sw = F[(q >> 3) & 1];
      // quadrants not split by an arm are one region
      if (!n && nw !== ne) continue; if (!e && ne !== se) continue; if (!s && se !== sw) continue; if (!w && sw !== nw) continue;
      // every arm has a room on one side at least
      if ((n && nw === '.' && ne === '.') || (e && ne === '.' && se === '.') || (s && se === '.' && sw === '.') || (w && sw === '.' && nw === '.')) continue;
      if (arms === 1 && nw === '.') continue;
      const px = (x: number, y: number, door = false) => {
        const vx = x === 2 || x === 3, hy = y === 2 || y === 3;
        if (vx && hy) return arms && !door ? '#' : x === 2 ? (y === 2 ? nw : sw) : y === 2 ? ne : se;
        if (vx) return (y < 2 ? n : s) && !(door && y > 0 && y < 5) ? '#' : x === 2 ? (y < 2 ? nw : sw) : y < 2 ? ne : se;
        if (hy) return (x < 2 ? w : e) && !(door && x > 0 && x < 5) ? '#' : y === 2 ? (x < 2 ? nw : ne) : x < 2 ? sw : se;
        return x < 2 ? (y < 2 ? nw : sw) : y < 2 ? ne : se;
      };
      const make = (f: (x: number, y: number) => string) => { let b = ''; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) b += f(x, y); return b; };
      const weight = arms === 0 ? (nw === '.' ? 1.5 : 6) : arms === 1 ? 0.2 : arms === 2 ? (n === s ? 1.2 : 0.6) : arms === 3 ? 0.5 : 0.2;
      T.push({ bits: make((x, y) => px(x, y)), w: weight, empty: arms === 0 });
      const straight = arms === 2 && n === s;
      if (straight && nw === ':' && se === ':') T.push({ bits: make((x, y) => px(x, y, true)), w: 0.6, empty: false });
      if (straight && nw !== se) {
        // a window in a façade: the middle of the wall turns to glass
        T.push({ bits: make((x, y) => { const c = px(x, y); return c === '#' && (n ? y > 0 && y < 5 : x > 0 && x < 5) ? '=' : c; }), w: 0.4, empty: false });
      }
      if (arms === 0 && nw === ':') T.push({ bits: make((x, y) => (x === 2 || x === 3) && (y === 2 || y === 3) ? 'o' : ':'), w: 0.1, empty: false });
    }
  }
  return { S: 6, tiles: T, border: ['......', '......', '......', '......'] };
}

/**
 * «Acueducto»: a side view with gravity (6 × 6, mirror images only). A deck on arches rests on pillars, and
 * a pillar's foot can only be a pillar down to a ground line that crosses the whole frame over the earth;
 * clouds, trees and broken pillars. With «Bordes: vacíos» the sky is above and the earth below.
 */
function aqueduct(): Tileset {
  const m = (rows: string[], w: number, empty = false) => variants(rows, w, empty, true);
  const T: Tile[] = [
    ...m(['......', '......', '......', '......', '......', '......'], 8, true),
    ...m(['......', '..==..', '.====.', '......', '......', '......'], 0.12),
    ...m(['......', '......', '......', '######', '::::::', '::::::'], 3),
    ...m(['::::::', '::::::', '::::::', '::::::', '::::::', '::::::'], 1.5, true),
    // arch between two pillars, pillar under the deck, end of the deck on its last pillar
    ...m(['......', '######', '######', '##..##', '#....#', '......'], 0.9),
    ...m(['......', '######', '######', '######', '#.##.#', '..##..'], 0.9),
    ...m(['......', '####..', '####..', '####..', '#.##..', '..##..'], 0.6),
    // pillar, its foot on the ground, a broken one; a tree (its trunk on the ground, its crown above)
    ...m(['..##..', '..##..', '..##..', '..##..', '..##..', '..##..'], 1.2),
    ...m(['..##..', '..##..', '.####.', '######', '::::::', '::::::'], 0.6),
    ...m(['......', '......', '..#...', '..##..', '..##..', '..##..'], 0.1),
    ...m(['..#...', '..#...', '..#...', '######', '::::::', '::::::'], 0.2),
    ...m(['......', '..oo..', '.oooo.', '.oooo.', '..oo..', '..#...'], 0.2),
  ];
  return { S: 6, tiles: T, border: ['......', null, '::::::', null] };
}

interface Compiled {
  set: Tileset;
  T: number;
  /** prop[d][t]: tiles that may stand at the neighbour of t in direction d (0 N, 1 E, 2 S, 3 W). */
  prop: Int32Array[][];
  /** Tiles whose socket toward direction d is the one the frame imposes there (borders «Vacíos»). */
  emptyAt: Uint8Array[];
  val: Float32Array;
  line: Float32Array;
}
const COMPILED = new Map<string, Compiled>();
function compile(id: string): Compiled {
  let c = COMPILED.get(id);
  if (c) return c;
  const set = id === 'muros' ? walls() : id === 'acueducto' ? aqueduct() : circuits();
  const S = set.S, T = set.tiles.length;
  const edge = (b: string, d: number) => {
    let o = '';
    for (let i = 0; i < S; i++) o += d === 0 ? b[i] : d === 2 ? b[(S - 1) * S + i] : d === 3 ? b[i * S] : b[i * S + S - 1];
    return o;
  };
  const sock = set.tiles.map(t => [0, 1, 2, 3].map(d => edge(t.bits, d)));
  const prop: Int32Array[][] = [0, 1, 2, 3].map(d => sock.map(a => Int32Array.from(sock.map((b, j) => (a[d] === b[(d + 2) & 3] ? j : -1)).filter(j => j >= 0))));
  const emptyAt = [0, 1, 2, 3].map(d => Uint8Array.from(sock.map(s => (set.border[d] === null || s[d] === set.border[d] ? 1 : 0))));
  const val = new Float32Array(T * S * S), line = new Float32Array(T * S * S);
  set.tiles.forEach((t, i) => { for (let k = 0; k < S * S; k++) { val[i * S * S + k] = VALUE[t.bits[k]] ?? 0; line[i * S * S + k] = LINE[t.bits[k]] ?? 0; } });
  c = { set, T, prop, emptyAt, val, line };
  COMPILED.set(id, c);
  return c;
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

interface P { set: string; rows: number; density: number; pace: number; hold: number; edges: string; view: string }
const read = (p: Params): P => ({
  set: String(p.set ?? 'circuitos'), rows: Math.max(4, Math.min(28, Math.round(Number(p.rows ?? 12)))), density: Number(p.density ?? 0.5),
  pace: Number(p.pace ?? 60), hold: Number(p.hold ?? 6), edges: String(p.edges ?? 'vacios'), view: String(p.view ?? 'piezas'),
});

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  const fixed = { set: p.set, rows: p.rows, edges: p.edges };
  const C = compile(fixed.set), T = C.T, S = C.set.S;
  const GH = fixed.rows, GW = 2 * GH, cells = GW * GH;
  // the wave: which tiles each cell may still hold, how many, and the supports of each (cell, tile, side)
  const wave = new Uint8Array(cells * T), cnt = new Uint16Array(cells), compat = new Uint8Array(cells * T * 4);
  // step at which a cell was decided (−1: undecided), and the seeded tie-break noise of the board
  const born = new Int32Array(cells), noise = new Float32Array(cells);
  let steps = 0, phase = 0, holdLeft = 0, carry = 0, repairs = 0, restarts = 0, board = 0;
  const stack: number[] = [];
  let contradiction = -1;

  const weights = new Float64Array(T), wlogw = new Float64Array(T);
  const setWeights = () => {
    const k = Math.pow(3, 1 - 2 * p.density);
    for (let t = 0; t < T; t++) { const v = C.set.tiles[t].w * (C.set.tiles[t].empty ? k : 1); weights[t] = v; wlogw[t] = v * Math.log(v); }
  };
  setWeights();

  const ban = (c: number, t: number) => {
    const i = c * T + t;
    if (!wave[i]) return;
    wave[i] = 0;
    if (--cnt[c] === 0 && contradiction < 0) contradiction = c;
    if (cnt[c] === 1 && born[c] < 0) born[c] = steps;
    stack.push(c, t);
  };
  const propagate = () => {
    while (stack.length && contradiction < 0) {
      const t = stack.pop()!, c = stack.pop()!;
      const x = c % GW, y = (c - x) / GW;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n = ny * GW + nx, od = (d + 2) & 3, list = C.prop[d][t];
        for (let k = 0; k < list.length; k++) {
          const t2 = list[k], j = (n * T + t2) * 4 + od;
          if (compat[j] > 0 && --compat[j] === 0) ban(n, t2);
        }
      }
    }
    stack.length = 0;
  };
  /** Supports of every (cell, tile, side) counted again from the wave (after a repair). */
  const recount = () => {
    for (let c = 0; c < cells; c++) {
      const x = c % GW, y = (c - x) / GW;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d], inside = nx >= 0 && ny >= 0 && nx < GW && ny < GH, n = ny * GW + nx;
        for (let t = 0; t < T; t++) {
          const list = C.prop[d][t];
          let k = list.length;
          if (inside) { k = 0; for (let e = 0; e < list.length; e++) if (wave[n * T + list[e]]) k++; }
          compat[(c * T + t) * 4 + d] = Math.min(255, k);
        }
      }
    }
  };
  const borderBans = (c: number) => {
    if (fixed.edges !== 'vacios') return;
    const x = c % GW, y = (c - x) / GW;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx >= 0 && ny >= 0 && nx < GW && ny < GH) continue;
      for (let t = 0; t < T; t++) if (!C.emptyAt[d][t]) ban(c, t);
    }
  };
  const fresh = () => {
    wave.fill(1); cnt.fill(T); born.fill(-1);
    for (let c = 0; c < cells; c++) for (let t = 0; t < T; t++) for (let d = 0; d < 4; d++) compat[(c * T + t) * 4 + d] = Math.min(255, C.prop[d][t].length);
    // ties go to the cell nearest a seeded starting point (with a little noise): the board grows as a front
    const sx = rng.next() * GW, sy = rng.next() * GH, far = Math.hypot(GW, GH);
    for (let c = 0; c < cells; c++) { const x = c % GW, y = (c - x) / GW; noise[c] = 1e-3 * (Math.hypot(x + 0.5 - sx, y + 0.5 - sy) / far) + 1e-4 * rng.next(); }
    contradiction = -1;
    for (let c = 0; c < cells; c++) borderBans(c);
    propagate();
    phase = 0; carry = 0; repairs = 0;
  };
  const newBoard = () => { board++; restarts = 0; fresh(); };

  /** Reopens the cells around a contradiction and makes the wave consistent again. */
  const repair = (c0: number) => {
    const r = 1 + repairs;
    repairs++;
    const x0 = c0 % GW, y0 = (c0 - x0) / GW;
    contradiction = -1;
    stack.length = 0;
    for (let y = Math.max(0, y0 - r); y <= Math.min(GH - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(GW - 1, x0 + r); x++) {
      const c = y * GW + x;
      wave.fill(1, c * T, (c + 1) * T); cnt[c] = T; born[c] = -1;
    }
    recount();
    for (let y = Math.max(0, y0 - r); y <= Math.min(GH - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(GW - 1, x0 + r); x++) borderBans(y * GW + x);
    // tiles left without support on some side go too
    for (let c = 0; c < cells; c++) for (let t = 0; t < T; t++) {
      if (!wave[c * T + t]) continue;
      const j = (c * T + t) * 4;
      if (!compat[j] || !compat[j + 1] || !compat[j + 2] || !compat[j + 3]) ban(c, t);
    }
    propagate();
  };

  /** Collapses one cell; false when the board is complete. */
  const collapse = (): boolean => {
    let best = -1, bestH = Infinity;
    for (let c = 0; c < cells; c++) {
      const k = cnt[c];
      if (k <= 1) continue;
      let sw = 0, swl = 0;
      const o = c * T;
      for (let t = 0; t < T; t++) if (wave[o + t]) { sw += weights[t]; swl += wlogw[t]; }
      const H = Math.log(sw) - swl / sw + noise[c];
      if (H < bestH) { bestH = H; best = c; }
    }
    if (best < 0) return false;
    let sw = 0;
    const o = best * T;
    for (let t = 0; t < T; t++) if (wave[o + t]) sw += weights[t];
    let r = rng.next() * sw, pick = -1;
    for (let t = 0; t < T; t++) if (wave[o + t]) { pick = t; r -= weights[t]; if (r <= 0) break; }
    for (let t = 0; t < T; t++) if (t !== pick) ban(best, t);
    born[best] = steps;
    propagate();
    return true;
  };

  const step1 = () => {
    steps++;
    if (phase !== 0) {
      if (--holdLeft <= 0) newBoard();
      return;
    }
    // «Ritmo» is in pieces per second of layer time
    carry += p.pace / RATE;
    while (carry >= 1 && phase === 0) {
      carry -= 1;
      const more = collapse();
      // a contradiction: repair around it, start the board again, or give up and hold it as it is
      while (contradiction >= 0) {
        if (repairs < REPAIRS) repair(contradiction);
        else if (restarts < RESTARTS) { restarts++; fresh(); }
        else { contradiction = -1; phase = 2; holdLeft = Math.round(p.hold * RATE); }
      }
      if (!more && phase === 0) { phase = 1; holdLeft = Math.round(p.hold * RATE); }
    }
  };

  fresh();

  // ---- render: the board at bitmap resolution, then box-sampled into the raster
  const BW = GW * S, BH = GH * S;
  const map = new Float32Array(BW * BH);
  let cacheKey = '';
  const cache = new Uint8Array(w * h);
  const draw = () => {
    const lines = p.view === 'lineas', ent = p.view === 'entropia';
    const src = lines ? C.line : C.val;
    let hMax = 1e-9;
    const Hc = new Float64Array(ent ? cells : 0);
    if (ent) {
      for (let c = 0; c < cells; c++) {
        if (cnt[c] <= 1) continue;
        let sw = 0, swl = 0;
        for (let t = 0; t < T; t++) if (wave[c * T + t]) { sw += weights[t]; swl += wlogw[t]; }
        Hc[c] = Math.log(sw) - swl / sw;
        if (Hc[c] > hMax) hMax = Hc[c];
      }
    }
    for (let c = 0; c < cells; c++) {
      const gx = c % GW, gy = (c - gx) / GW, o0 = gy * S * BW + gx * S;
      let t = -1;
      if (cnt[c] === 1) for (let k = 0; k < T; k++) if (wave[c * T + k]) { t = k; break; }
      if (t < 0) {
        // undecided: dark, or its entropy (low entropy, about to be decided, glows)
        const v = ent && cnt[c] > 1 ? 0.05 + 0.6 * Math.pow(1 - Hc[c] / hMax, 1.5) : 0;
        for (let y = 0; y < S; y++) map.fill(v, o0 + y * BW, o0 + y * BW + S);
        continue;
      }
      // a cell just decided flashes for a few steps
      const age = steps - born[c], f = age >= 0 && age < FLASH ? 1 - age / FLASH : 0;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const v = src[t * S * S + y * S + x];
        map[o0 + y * BW + x] = f > 0 ? v + (1 - v) * 0.4 * f : v;
      }
    }
    // box sampling: 3 × 3 samples per raster pixel
    const kx = BW / w, ky = BH / h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < 3; j++) {
        const by = Math.min(BH - 1, Math.floor((y + (j + 0.5) / 3) * ky)) * BW;
        for (let i = 0; i < 3; i++) s += map[by + Math.min(BW - 1, Math.floor((x + (i + 0.5) / 3) * kx))];
      }
      const v = s / 9;
      cache[y * w + x] = byte(v);
    }
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) {
      const q = read(np);
      const dens = q.density !== p.density;
      p = { ...q, set: fixed.set, rows: fixed.rows, edges: fixed.edges };
      if (dens) setWeights();
    },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      const key = `${steps}|${board}|${p.view}`;
      if (key !== cacheKey) { draw(); cacheKey = key; }
      out.set(cache);
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { phase, holdLeft, carry, repairs, restarts, board };
      rng.save(scalars);
      return {
        id: ID, v: V, steps, res: h, scalars,
        arrays: { wave: wave.slice(), cnt: cnt.slice(), compat: compat.slice(), born: born.slice(), noise: noise.slice() },
      };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta construcción.');
      const A = s.arrays;
      const ok = A.wave instanceof Uint8Array && A.wave.length === wave.length && A.cnt instanceof Uint16Array && A.cnt.length === cells
        && A.compat instanceof Uint8Array && A.compat.length === compat.length && A.born instanceof Int32Array && A.born.length === cells
        && A.noise instanceof Float32Array && A.noise.length === cells;
      if (!ok) throw new Error('El estado guardado está incompleto.');
      wave.set(A.wave); cnt.set(A.cnt); compat.set(A.compat); born.set(A.born); noise.set(A.noise);
      const c = s.scalars;
      phase = c.phase ?? 0; holdLeft = c.holdLeft ?? 0; carry = c.carry ?? 0; repairs = c.repairs ?? 0; restarts = c.restarts ?? 0; board = c.board ?? 0;
      steps = s.steps;
      rng.load(c);
      cacheKey = '';
    },
  };
}

/** For tests: a tileset's tiles, the frame's sockets and adjacency (whether b may stand at the d-neighbour of a). */
export function tilesetOf(id: string) {
  const c = compile(id);
  return { S: c.set.S, tiles: c.set.tiles.map(t => t.bits), border: c.set.border, fits: (a: number, b: number, d: number) => c.prop[d][a].includes(b) };
}
