import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Gray–Scott reaction–diffusion (Pearson 1993; the explicit scheme of K. Sims's tutorial, written here from
 * the equations): two concentrations A and B on a 2:1 grid,
 *   A' = A + (Da ∇²A − A B² + F (1 − A)) dt
 *   B' = B + (Db ∇²B + A B² − (k + F) B) dt
 * with a 9-point Laplacian (centre −1, sides 0.2, corners 0.05), Da = 1, Db = «Difusión de B», dt = 1.
 * «Escala» multiplies the reaction terms by 1/s², which scales the pattern's wavelength by s while keeping
 * the explicit scheme stable. Boundaries: periodic («Continuos») or zero-flux («Cerrados»).
 *
 * Version 2 (PR #10 review):
 *  - the chemistry runs on a grid of fixed size (RD_ROWS rows, twice as many columns) whatever the raster
 *    rows, so a pattern keeps its size and its timing at every resolution (A-05); more rows draw the same
 *    chemistry finer (bilinear resampling of the view, its contrast applied after the interpolation, so
 *    edges stay crisp). Recipes made with version 1 keep their path: there the grid is the raster.
 *  - «Mapa» makes the kill rate vary over the field and in time (k + «Intensidad» · DK · m(x, y, t)): tides
 *    that drift, bands that travel or an island whose shore breathes. Where the kill rises past the pattern's
 *    death line it dissolves; where it falls back, fronts from the living parts grow into the space again,
 *    so the pattern reorganises without end instead of settling.
 *  - «Heridas» clears a disc now and then and seeds its centre: a wound that heals with new fronts.
 *  - the «Ruido» seeding sows blocks of 3 × 3 cells: single cells died at once in the sparser regimes (the
 *    maze), and two seeds in three left an empty field.
 * Both draw from their own seeded streams, so with their defaults the run is exactly the version-1 one.
 */

const ID = 'reaccion_difusion', V = 2;
/** Rows of the chemistry grid from version 2 on (the default raster rows: there both versions coincide). */
export const RD_ROWS = 96;
/** Steps between two updates of the kill map (it changes over tens of seconds; 1/30 s apart is smooth). */
const MAP_EVERY = 20;
/** The family's rate (steps per second of layer time): the clock of the map and of renewal. */
const RATE = 600;
/** Kill offset at full map intensity: enough to take a pattern past its death line and back. */
export const DK = 0.009;
/** Map lattice of «Mareas» (cells per side of the torus): blobs about half the height across. */
const GX = 6, GY = 3;
/**
 * Share of the map's swing below the base kill: lowering the kill soon turns a pattern into a solid sea of
 * B, so the map mostly raises it (dissolving) and lowers it a little (denser growth).
 */
const LOW = 0.35;
const TAU = Math.PI * 2;

interface P {
  feed: number; kill: number; diff: number; scale: number; seedShape: string; edges: string; view: string;
  map: string; amp: number; drift: number;
}
const read = (p: Params): P => ({
  feed: Number(p.feed ?? 0.0545), kill: Number(p.kill ?? 0.062), diff: Number(p.diff ?? 0.5), scale: Number(p.scale ?? 1),
  seedShape: String(p.seedShape ?? 'manchas'), edges: String(p.edges ?? 'toro'), view: String(p.view ?? 'concentracion'),
  map: String(p.map ?? 'uniforme'), amp: Number(p.amp ?? 0.5), drift: Number(p.drift ?? 1),
});

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * One explicit step of the grid, (A, B) → (A2, B2), with the same arithmetic in the same order as version 1
 * (a uniform kill keeps its loop; a map reads the kill per cell in a copy of it, so neither pays a branch).
 */
function react(A: Float32Array, B: Float32Array, A2: Float32Array, B2: Float32Array, w: number, h: number,
  xl: Int32Array, xr: Int32Array, yu: Int32Array, yd: Int32Array, F: number, K: number, Db: number, r: number) {
  for (let y = 0; y < h; y++) {
    const o = y * w, ou = yu[y], od = yd[y];
    for (let x = 0; x < w; x++) {
      const i = o + x, l = xl[x], rr = xr[x];
      const a = A[i], b = B[i];
      const lapA = 0.2 * (A[o + l] + A[o + rr] + A[ou + x] + A[od + x]) + 0.05 * (A[ou + l] + A[ou + rr] + A[od + l] + A[od + rr]) - a;
      const lapB = 0.2 * (B[o + l] + B[o + rr] + B[ou + x] + B[od + x]) + 0.05 * (B[ou + l] + B[ou + rr] + B[od + l] + B[od + rr]) - b;
      const abb = a * b * b;
      let na = a + lapA + (F * (1 - a) - abb) * r;
      let nb = b + Db * lapB + (abb - (K + F) * b) * r;
      na = na < 0 ? 0 : na > 1 ? 1 : na;
      nb = nb < 0 ? 0 : nb > 1 ? 1 : nb;
      A2[i] = na; B2[i] = nb;
    }
  }
}
/** The same step with the kill read per cell (a map). */
function reactMap(A: Float32Array, B: Float32Array, A2: Float32Array, B2: Float32Array, w: number, h: number,
  xl: Int32Array, xr: Int32Array, yu: Int32Array, yd: Int32Array, F: number, km: Float32Array, Db: number, r: number) {
  for (let y = 0; y < h; y++) {
    const o = y * w, ou = yu[y], od = yd[y];
    for (let x = 0; x < w; x++) {
      const i = o + x, l = xl[x], rr = xr[x];
      const a = A[i], b = B[i];
      const lapA = 0.2 * (A[o + l] + A[o + rr] + A[ou + x] + A[od + x]) + 0.05 * (A[ou + l] + A[ou + rr] + A[od + l] + A[od + rr]) - a;
      const lapB = 0.2 * (B[o + l] + B[o + rr] + B[ou + x] + B[od + x]) + 0.05 * (B[ou + l] + B[ou + rr] + B[od + l] + B[od + rr]) - b;
      const abb = a * b * b;
      let na = a + lapA + (F * (1 - a) - abb) * r;
      let nb = b + Db * lapB + (abb - (km[i] + F) * b) * r;
      na = na < 0 ? 0 : na > 1 ? 1 : na;
      nb = nb < 0 ? 0 : nb > 1 ? 1 : nb;
      A2[i] = na; B2[i] = nb;
    }
  }
}

export function create(cfg: ModelConfig): FieldModel {
  const v = cfg.v ?? V;
  // the raster the engines read; the chemistry grid is the raster in version 1 and fixed from version 2
  const H = Math.max(8, Math.round(cfg.res)), W = 2 * H;
  const h = v >= 2 ? RD_ROWS : H, w = 2 * h, n = w * h;
  let A = new Float32Array(n), B = new Float32Array(n), A2 = new Float32Array(n), B2 = new Float32Array(n);
  // (the seeding stream keeps the version-1 key: at the default rows both versions seed the same field)
  const rng = new SimRng(`${ID}|1|${cfg.seed}`);
  const rngR = new SimRng(`${ID}|renovar|${cfg.seed}`);
  let p = read(cfg.params);
  let steps = 0;
  // neighbour tables (periodic and clamped)
  const xl = new Int32Array(w), xr = new Int32Array(w), yu = new Int32Array(h), yd = new Int32Array(h);
  const tables = (wrap: boolean) => {
    for (let x = 0; x < w; x++) { xl[x] = x > 0 ? x - 1 : wrap ? w - 1 : 0; xr[x] = x < w - 1 ? x + 1 : wrap ? 0 : w - 1; }
    for (let y = 0; y < h; y++) { yu[y] = (y > 0 ? y - 1 : wrap ? h - 1 : 0) * w; yd[y] = (y < h - 1 ? y + 1 : wrap ? 0 : h - 1) * w; }
  };
  tables(p.edges !== 'cerrado');

  // ---- seeding (deterministic from the seed)
  A.fill(1); B.fill(0);
  const rect = (cx: number, cy: number, rw: number, rh: number) => {
    for (let y = Math.max(0, Math.floor(cy - rh)); y < Math.min(h, Math.ceil(cy + rh)); y++)
      for (let x = Math.max(0, Math.floor(cx - rw)); x < Math.min(w, Math.ceil(cx + rw)); x++) { B[y * w + x] = 1; A[y * w + x] = 0.5; }
  };
  // (patterns have a size in grid cells, set by the diffusion: a seed smaller than a few cells dies at once)
  const s0 = Math.max(4, h * 0.04);
  switch (p.seedShape) {
    case 'centro': rect(w / 2, h / 2, s0 * 2, s0 * 2); break;
    case 'anillo': {
      const R = h * 0.3;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = Math.abs(Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) - R);
        if (d < s0 * 0.7) { B[y * w + x] = 1; A[y * w + x] = 0.5; }
      }
      break;
    }
    case 'lineas': {
      for (let k = 0; k < 5; k++) {
        const y0 = rng.range(0.1, 0.9) * h, slope = rng.range(-0.4, 0.4);
        for (let x = 0; x < w; x++) rect(x, y0 + slope * (x - w / 2), 0.6, s0 * 0.4);
      }
      break;
    }
    case 'ruido': {
      if (v >= 2) {
        // blocks of 3 × 3 cells (single cells die at once in the sparser regimes, and with them the whole run)
        for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
          if (rng.next() >= 0.12) continue;
          const b = 0.25 + 0.5 * rng.next();
          for (let yy = y; yy < Math.min(h, y + 3); yy++) for (let xx = x; xx < Math.min(w, x + 3); xx++) { B[yy * w + xx] = b; A[yy * w + xx] = 0.5; }
        }
      } else for (let i = 0; i < n; i++) if (rng.next() < 0.12) { B[i] = 0.25 + 0.5 * rng.next(); A[i] = 0.5; }
      break;
    }
    default: {
      const k = Math.max(6, Math.round((n / 900) * (0.7 + 0.6 * rng.next())));
      for (let i = 0; i < k; i++) rect(rng.next() * w, rng.next() * h, s0 * rng.range(0.6, 1.4), s0 * rng.range(0.6, 1.4));
    }
  }

  // ---- the kill map (version 2): its shape is drawn from its own stream, its clock is `tau` (seconds × «Deriva»)
  const mr = new SimRng(`${ID}|mapa|${cfg.seed}`);
  const nodePh = new Float64Array(GX * GY), nodeW = new Float64Array(GX * GY);
  for (let i = 0; i < GX * GY; i++) { nodePh[i] = mr.next() * TAU; nodeW[i] = (TAU / 70) * mr.range(0.6, 1.4); }
  // tides drift along a seeded heading, about a lattice cell every 40 s at «Deriva» 1
  const dHead = mr.next() * TAU, dU = Math.cos(dHead) / 40, dV = (Math.sin(dHead) / 40) * (GY / GX) * 2;
  // bands: one or two turns of the torus across, slanted or not, travelling one period in about 90 s
  const bKx = 1, bKy = mr.int(3) - 1, bPh = mr.next() * TAU;
  // island: the shore's own wobble (three lobes turning slowly)
  const iPh = mr.next() * TAU;
  let Km: Float32Array | null = null;
  const nodes = new Float64Array(GX * GY);
  const cu0 = new Int32Array(w), cu1 = new Int32Array(w), cfu = new Float64Array(w);
  const rv0 = new Int32Array(h), rv1 = new Int32Array(h), rfv = new Float64Array(h);
  let tau = 0, mapTau = 0, mapStep = -1, mapKey = '';
  /** The tide lattice at `t`: node values and, per column and row, its cells and weights (periodic). */
  const lattice = (t: number) => {
    for (let i = 0; i < GX * GY; i++) nodes[i] = Math.sin(nodeW[i] * t + nodePh[i]);
    const ou = dU * t, ov = dV * t;
    for (let x = 0; x < w; x++) {
      const u = ((((x + 0.5) / w) * GX + ou) % GX + GX) % GX, i0 = Math.floor(u);
      cu0[x] = i0 % GX; cu1[x] = (i0 + 1) % GX; cfu[x] = smooth(u - i0);
    }
    for (let y = 0; y < h; y++) {
      const u = ((((y + 0.5) / h) * GY + ov) % GY + GY) % GY, j0 = Math.floor(u);
      rv0[y] = (j0 % GY) * GX; rv1[y] = ((j0 + 1) % GY) * GX; rfv[y] = smooth(u - j0);
    }
  };
  const tide = (x: number, y: number) => {
    const a = nodes[rv0[y] + cu0[x]], b = nodes[rv0[y] + cu1[x]], c = nodes[rv1[y] + cu0[x]], d = nodes[rv1[y] + cu1[x]];
    const fu = cfu[x], fv = rfv[y];
    return (a + (b - a) * fu) + ((c + (d - c) * fu) - (a + (b - a) * fu)) * fv;
  };
  /** Recomputes the kill per cell for the map at clock t. */
  const buildMap = (t: number) => {
    if (!Km) Km = new Float32Array(n);
    const k0 = p.kill, s = p.amp * DK, km = Km;
    // below k = √F / 2 − F the uniform B-rich state exists and a lowered kill floods into a solid sea that
    // stays (bistable): the map never takes the kill under that line (nor under the base kill, if it is there)
    const kLow = Math.min(k0, Math.sqrt(p.feed) / 2 - p.feed + 0.001);
    const put = (i: number, m: number) => {
      const k = k0 + s * (m >= 1 ? 1 : m <= -1 ? -LOW : m < 0 ? m * LOW : m);
      km[i] = k < kLow ? kLow : k;
    };
    lattice(t);
    if (p.map === 'franjas') {
      const ph = bPh - (TAU / 90) * t;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const m = 0.8 * Math.sin(TAU * (bKx * (x + 0.5) / w + bKy * (y + 0.5) / h) + ph) + 0.35 * tide(x, y);
        put(y * w + x, m);
      }
    } else if (p.map === 'isla') {
      // inside the shore the kill falls (life), outside it rises; the shore breathes and wobbles
      const R = 0.62 + 0.16 * Math.sin((TAU / 80) * t);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - w / 2) / (h / 2), dy = (y + 0.5 - h / 2) / (h / 2);
        const r = Math.sqrt(dx * dx * 0.55 + dy * dy), a = Math.atan2(dy, dx);
        const shore = R + 0.08 * Math.sin(3 * a + iPh + (TAU / 120) * t) + 0.1 * tide(x, y);
        const m = (r - shore) * 4;
        put(y * w + x, m);
      }
    } else {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const m = 1.6 * tide(x, y);
        put(y * w + x, m);
      }
    }
    mapTau = t; mapStep = steps; mapKey = mapKeyOf(p);
  };
  const mapKeyOf = (q: P) => `${q.map}|${q.amp}|${q.kill}|${q.feed}`;
  const mapped = () => (p.map === 'mareas' || p.map === 'franjas' || p.map === 'isla') && p.amp > 0;

  // ---- «Heridas»: every so often a disc is cleared and its centre seeded (its own stream); «Intensidad» sets
  // their size (a twentieth to a sixth of the height), «Ritmo» how often (one every 2.5 s at 1)
  let racc = 0;
  const wound = () => {
    const cx = rngR.next() * w, cy = rngR.next() * h, R = h * (0.05 + 0.11 * p.amp) * rngR.range(0.7, 1.3);
    const wrap = p.edges !== 'cerrado';
    for (let y = Math.floor(cy - R - 1); y <= Math.ceil(cy + R + 1); y++) for (let x = Math.floor(cx - R - 1); x <= Math.ceil(cx + R + 1); x++) {
      if (!wrap && (x < 0 || y < 0 || x >= w || y >= h)) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      // a soft rim of a cell and a half, so the cut does not ring
      const k = d <= R - 1.5 ? 1 : d >= R ? 0 : (R - d) / 1.5;
      if (k <= 0) continue;
      const i = (((y % h) + h) % h) * w + (((x % w) + w) % w);
      A[i] += (1 - A[i]) * k; B[i] *= 1 - k;
    }
    const r = s0 * 0.8;
    for (let y = Math.floor(cy - r); y < Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x < Math.ceil(cx + r); x++) {
      if (!wrap && (x < 0 || y < 0 || x >= w || y >= h)) continue;
      const i = (((y % h) + h) % h) * w + (((x % w) + w) % w);
      B[i] = 1; A[i] = 0.5;
    }
  };

  const step1 = () => {
    if (mapped()) {
      if (mapStep < 0 || steps - mapStep >= MAP_EVERY || mapKey !== mapKeyOf(p)) buildMap(tau);
    }
    if (p.map === 'heridas') {
      racc += (p.drift * 0.4) / RATE;
      if (racc >= 1) { racc -= 1; wound(); }
    }
    const F = p.feed, Db = p.diff, r = 1 / (p.scale * p.scale);
    if (mapped()) reactMap(A, B, A2, B2, w, h, xl, xr, yu, yd, F, Km!, Db, r);
    else react(A, B, A2, B2, w, h, xl, xr, yu, yd, F, p.kill, Db, r);
    let t = A; A = A2; A2 = t;
    t = B; B = B2; B2 = t;
    tau += p.drift / RATE;
    steps++;
  };

  // ---- drawing: the view's value per grid cell, then the raster (directly, or resampled from the grid)
  const val = H === h ? null : new Float32Array(n);
  const view = (put: (i: number, v: number) => void) => {
    if (p.view === 'relieve') {
      for (let y = 0; y < h; y++) {
        const o = y * w, ou = yu[y], od = yd[y];
        for (let x = 0; x < w; x++) {
          const b = B[o + x];
          const gx = B[o + xr[x]] - B[o + xl[x]], gy = B[od + x] - B[ou + x];
          put(o + x, 0.15 + b * 1.6 + (gx * 0.7 - gy * 0.7) * 2.4);
        }
      }
    } else if (p.view === 'contorno') {
      for (let y = 0; y < h; y++) {
        const o = y * w, ou = yu[y], od = yd[y];
        for (let x = 0; x < w; x++) {
          const gx = B[o + xr[x]] - B[o + xl[x]], gy = B[od + x] - B[ou + x];
          put(o + x, Math.sqrt(gx * gx + gy * gy) * 7);
        }
      }
    } else {
      for (let i = 0; i < n; i++) put(i, (B[i] - 0.02) * 3.4);
    }
  };
  // resampling tables (raster pixel → grid cells and weights), by edge mode
  const sx0 = new Int32Array(W), sx1 = new Int32Array(W), sfx = new Float32Array(W);
  const sy0 = new Int32Array(H), sy1 = new Int32Array(H), sfy = new Float32Array(H);
  let sWrap: boolean | null = null;
  const resampleTables = (wrap: boolean) => {
    if (sWrap === wrap) return;
    sWrap = wrap;
    const axis = (N: number, M: number, i0: Int32Array, i1: Int32Array, f: Float32Array) => {
      for (let X = 0; X < N; X++) {
        const g = ((X + 0.5) * M) / N - 0.5, k = Math.floor(g);
        f[X] = g - k;
        i0[X] = wrap ? (k + M) % M : Math.max(0, k);
        i1[X] = wrap ? (k + 1) % M : Math.min(M - 1, k + 1);
      }
    };
    axis(W, w, sx0, sx1, sfx);
    axis(H, h, sy0, sy1, sfy);
  };
  const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0);

  return {
    w: W, h: H,
    get steps() { return steps; },
    setParams(np: Params) {
      const q = read(np);
      if (q.edges !== p.edges) tables(q.edges !== 'cerrado');
      p = q;
    },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      if (!val) { view((i, v) => { out[i] = byte(v); }); return; }
      view((i, v) => { val[i] = v; });
      resampleTables(p.edges !== 'cerrado');
      for (let Y = 0; Y < H; Y++) {
        const r0 = sy0[Y] * w, r1 = sy1[Y] * w, fy = sfy[Y], o = Y * W;
        for (let X = 0; X < W; X++) {
          const c0 = sx0[X], c1 = sx1[X], fx = sfx[X];
          const a = val[r0 + c0] + (val[r0 + c1] - val[r0 + c0]) * fx, b = val[r1 + c0] + (val[r1 + c1] - val[r1 + c0]) * fx;
          out[o + X] = byte(a + (b - a) * fy);
        }
      }
    },
    stroke(s: Stroke) {
      // along the segment, in cells of the grid (the domain wraps like the simulation)
      const ax = (s.x0 * 0.5 + 0.5) * w, ay = (0.5 - s.y0) * h, bx = (s.x1 * 0.5 + 0.5) * w, by = (0.5 - s.y1) * h;
      const R = Math.max(1.5, s.r * h), len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.ceil(len / (R * 0.5)));
      for (let j = 0; j <= k; j++) {
        const cx = ax + ((bx - ax) * j) / k, cy = ay + ((by - ay) * j) / k;
        for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d > R) continue;
          const i = (((y % h) + h) % h) * w + (((x % w) + w) % w);
          if (s.brush === 'borrar') { A[i] = 1; B[i] = 0; }
          else { B[i] = Math.min(1, B[i] + 0.5 * s.strength); A[i] = Math.min(A[i], 0.5); }
        }
      }
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { tau, mapTau, mapStep, racc };
      rng.save(scalars);
      rngR.save(scalars, 'rr');
      return { id: ID, v, steps, res: H, scalars, arrays: { A: A.slice(), B: B.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== H) throw new Error('El estado guardado no corresponde a esta simulación.');
      const a = s.arrays.A, b = s.arrays.B;
      if (!(a instanceof Float32Array) || !(b instanceof Float32Array) || a.length !== n || b.length !== n) throw new Error('El estado guardado está incompleto.');
      A.set(a); B.set(b);
      steps = s.steps;
      rng.load(s.scalars);
      // (a version-1 state has no renewal stream: it keeps its fresh one)
      if (s.scalars.rrA !== undefined) rngR.load(s.scalars, 'rr');
      tau = s.scalars.tau ?? 0; racc = s.scalars.racc ?? 0;
      // the map the run was using: rebuilt from its clock, at the step it was built
      mapStep = -1; mapKey = '';
      if (mapped() && (s.scalars.mapStep ?? -1) >= 0) { buildMap(s.scalars.mapTau ?? 0); mapStep = s.scalars.mapStep; }
    },
  };
}
