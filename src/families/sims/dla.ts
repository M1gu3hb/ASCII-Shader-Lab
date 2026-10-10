import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Diffusion-limited aggregation (Witten and Sander 1981) on the raster's lattice: random walkers move to one
 * of their eight neighbours per move and stick, with probability «Adherencia», when they stand next to the
 * aggregate (8-neighbourhood). Walkers are released just outside the current aggregate: on a circle around a
 * seed point or ring (the radius of its branch plus a margin), or on a line beyond the front of a floor or a
 * ceiling; a walker that wanders too far is released again.
 * A drift biases the moves (walkers drift against the growth direction). Growth stops when a branch reaches
 * the far edge (the sides for points and rings, the opposite side for a floor or a ceiling) or the aggregate
 * covers 35 % of the lattice, and the picture then holds. A stroke of the brush starts a new branch with its
 * own walkers and revives a stopped run.
 */

const ID = 'dla', V = 1;
/**
 * 0..1 → a byte in steps of 4 (64 levels): a sample halfway between two or four texels is then a whole level
 * in both engines (the GPU's float32 and the CPU's float64 would otherwise round an exact .5 apart and pick
 * different glyphs).
 */
const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 252 : ((v * 63 + 0.5) | 0) * 4);

const MAX_WALKERS = 400;
const MOVES = 24;
const MAX_SEEDS = 24;
const SPAWN = 4;
const DEAD = 255;
const FILL = 0.35;
const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];

interface P { seed: string; stick: number; bias: number; dir: string; walkers: number; width: number; age: string }
const read = (p: Params): P => ({
  seed: String(p.seed ?? 'punto'), stick: Number(p.stick ?? 0.9), bias: Number(p.bias ?? 0.1), dir: String(p.dir ?? 'fuera'),
  walkers: Math.max(1, Math.min(MAX_WALKERS, Math.round(Number(p.walkers ?? 16)))), width: Number(p.width ?? 0.8), age: String(p.age ?? 'nuevas'),
});

/** Walker drift for a growth direction (rows grow downward): walkers move against it. */
const DRIFT: Record<string, [number, number]> = { abajo: [0, -1], arriba: [0, 1], izquierda: [1, 0], derecha: [-1, 0] };

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h, n = w * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  const shape = p.seed;
  const cap = Math.floor(n * FILL);
  // lattice: attach order (0 empty), next-to-aggregate flag, branch label (seed index)
  const age = new Int32Array(n), adj = new Uint8Array(n), label = new Uint8Array(n);
  const wx = new Int32Array(MAX_WALKERS), wy = new Int32Array(MAX_WALKERS), wl = new Uint8Array(MAX_WALKERS).fill(DEAD);
  // seed points and the squared radius of each one's branch
  const sx = new Int32Array(MAX_SEEDS), sy = new Int32Array(MAX_SEEDS), sr2 = new Int32Array(MAX_SEEDS);
  // (derived) squared distance from a seed beyond which its walkers are lost
  const kill2 = new Float64Array(MAX_SEEDS);
  const killOf = (lb: number) => { const r = Math.sqrt(sr2[lb]) + SPAWN, k = r + Math.max(10, r * 0.6); kill2[lb] = k * k; };
  let nSeeds = 0, count = 0, steps = 0, edge = 0;
  // floor: top-most row of the aggregate; ceiling: bottom-most
  const lines = shape === 'suelo' || shape === 'techo';
  let front = shape === 'suelo' ? h - 1 : 0;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;

  /** Adds cell i to branch lb. A brushed cell starts its own branch and never counts as reaching an edge. */
  const attach = (i: number, lb: number, brushed = false) => {
    if (age[i]) return;
    age[i] = ++count;
    label[i] = lb;
    const x = i % w, y = (i - x) / w;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) adj[ny * w + nx] = 1;
    }
    adj[i] = 1;
    if (lines && lb === 0) {
      if (shape === 'suelo') { if (y < front) front = y; if (front - SPAWN < 1) edge = 1; }
      else { if (y > front) front = y; if (front + SPAWN > h - 2) edge = 1; }
      return;
    }
    const d = (x - sx[lb]) ** 2 + (y - sy[lb]) ** 2;
    if (d > sr2[lb]) { sr2[lb] = d; killOf(lb); }
    if (!lines && !brushed && (x <= 2 || x >= w - 3)) edge = 1;
  };
  const addSeed = (x: number, y: number) => {
    if (nSeeds >= MAX_SEEDS) return nSeeds - 1;
    sx[nSeeds] = x; sy[nSeeds] = y; sr2[nSeeds] = 0; killOf(nSeeds);
    return nSeeds++;
  };

  // ---- seeding (deterministic from the seed)
  if (lines) {
    const row = shape === 'suelo' ? h - 1 : 0;
    addSeed(0, row);
    for (let x = 0; x < w; x++) attach(row * w + x, 0);
    front = row;
  } else if (shape === 'anillo') {
    // a closed ring two cells thick around the centre (walkers come from outside it)
    const lb = addSeed(Math.round(cx), Math.round(cy)), R = h * 0.2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (Math.abs(Math.hypot(x - sx[lb], y - sy[lb]) - R) <= 1) attach(y * w + x, lb);
    }
  } else if (shape === 'varios') {
    const k = 5 + rng.int(3);
    for (let j = 0, tries = 0; j < k && tries < 200; tries++) {
      const x = Math.round(rng.range(0.14, 0.86) * w), y = Math.round(rng.range(0.2, 0.8) * h);
      let ok = true;
      for (let s = 0; s < nSeeds; s++) if (Math.hypot(x - sx[s], y - sy[s]) < h * 0.32) ok = false;
      if (!ok) continue;
      attach(y * w + x, addSeed(x, y));
      j++;
    }
  } else {
    const x = Math.round(cx), y = Math.round(cy);
    attach(y * w + x, addSeed(x, y));
  }
  // initial cells do not count as having reached an edge
  edge = 0;

  /** Releases walker i where walkers come from; false when there is no room left to release it. */
  const spawn = (i: number): boolean => {
    for (let tries = 0; tries < 12; tries++) {
      let x: number, y: number;
      // a branch at random (a floor or a ceiling is branch 0; strokes of the brush add more)
      const lb = !lines || nSeeds > 1 ? rng.int(nSeeds) : 0;
      if (lines && lb === 0) {
        x = 1 + rng.int(w - 2);
        y = shape === 'suelo' ? front - SPAWN : front + SPAWN;
        if (y < 1 || y > h - 2) return false;
      } else {
        const r = Math.sqrt(sr2[lb]) + SPAWN, a = rng.next() * Math.PI * 2;
        x = Math.round(sx[lb] + r * Math.cos(a)); y = Math.round(sy[lb] + r * Math.sin(a));
      }
      if (x < 1 || x > w - 2 || y < 1 || y > h - 2) continue;
      const j = y * w + x;
      if (age[j] || adj[j]) continue;
      wx[i] = x; wy[i] = y; wl[i] = lb;
      return true;
    }
    wl[i] = DEAD;
    return false;
  };

  /** Whether walker i wandered too far from where it was released. */
  const lost = (x: number, y: number, lb: number): boolean => {
    if (lines && lb === 0) return shape === 'suelo' ? y < front - SPAWN - 14 : y > front + SPAWN + 14;
    return (x - sx[lb]) ** 2 + (y - sy[lb]) ** 2 > kill2[lb];
  };

  const stopped = () => edge === 1 || count >= cap;

  const step1 = () => {
    if (stopped()) { steps++; return; }
    const pd = Math.min(0.6, p.bias * 0.6), stick = p.stick;
    const dr = DRIFT[p.dir];
    const toCentre = !dr;
    for (let i = 0; i < p.walkers; i++) {
      if (wl[i] === DEAD && !spawn(i)) continue;
      let x = wx[i], y = wy[i];
      const lb = wl[i];
      for (let m = 0; m < MOVES; m++) {
        const r = rng.next();
        let nx: number, ny: number;
        if (r < pd) {
          if (toCentre) {
            // drift toward the walker's seed point (a floor's or a ceiling's walkers: toward the centre)
            const line0 = lines && lb === 0, tx = line0 ? cx : sx[lb], ty = line0 ? cy : sy[lb];
            const ax = Math.abs(tx - x), ay = Math.abs(ty - y);
            if (ax + ay < 0.5) { nx = x; ny = y; }
            else if (rng.next() * (ax + ay) < ax) { nx = x + Math.sign(tx - x); ny = y; }
            else { nx = x; ny = y + Math.sign(ty - y); }
          } else { nx = x + dr[0]; ny = y + dr[1]; }
        } else {
          const k = Math.floor(((r - pd) / (1 - pd)) * 8) & 7;
          nx = x + DX[k]; ny = y + DY[k];
        }
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && !age[ny * w + nx]) { x = nx; y = ny; }
        const j = y * w + x;
        if (adj[j] && rng.next() < stick) {
          // stick to the branch of a touching neighbour
          let lbl = 0;
          for (let k = 0; k < 8; k++) {
            const ax = x + DX[k], ay = y + DY[k];
            if (ax >= 0 && ax < w && ay >= 0 && ay < h && age[ay * w + ax]) { lbl = label[ay * w + ax]; break; }
          }
          attach(j, lbl);
          wl[i] = DEAD;
          break;
        }
        if (lost(x, y, lb)) { wl[i] = DEAD; break; }
      }
      if (wl[i] !== DEAD) { wx[i] = x; wy[i] = y; }
      if (stopped()) break;
    }
    steps++;
  };

  // ---- render: each cell a disc of «Grosor», shaded by its order of arrival (cached: no time dependence)
  const acc = new Float32Array(n);
  let cacheKey = '';
  const cache = new Uint8Array(n);
  const kernel = (g: number) => {
    const R = 0.5 + g, ri = Math.ceil(R + 0.5), o: number[] = [], k: number[] = [];
    for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
      const d = Math.hypot(dx, dy), v = d <= R - 0.5 ? 1 : d >= R + 0.5 ? 0 : R + 0.5 - d;
      if (v > 0) { o.push(dx, dy); k.push(v); }
    }
    return { o, k };
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { const q = read(np); p = { ...q, seed: shape }; },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      const key = `${count}|${p.width}|${p.age}`;
      if (key === cacheKey) { out.set(cache); return; }
      acc.fill(0);
      const { o, k } = kernel(p.width);
      const inv = 1 / Math.max(1, count - 1);
      for (let i = 0; i < n; i++) {
        const a = age[i];
        if (!a) continue;
        const t = (a - 1) * inv;
        const v = p.age === 'plano' ? 1 : p.age === 'antiguas' ? 1 - 0.72 * Math.pow(t, 0.6) : 0.28 + 0.72 * Math.pow(t, 1.6);
        const x = i % w, y = (i - x) / w;
        for (let e = 0; e < k.length; e++) {
          const xx = x + o[2 * e], yy = y + o[2 * e + 1];
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const j = yy * w + xx, c = v * k[e];
          if (c > acc[j]) acc[j] = c;
        }
      }
      for (let i = 0; i < n; i++) out[i] = byte(acc[i]);
      cache.set(out);
      cacheKey = key;
    },
    stroke(s: Stroke) {
      if (s.brush !== 'semilla') return;
      const ax = (s.x0 * 0.5 + 0.5) * w, ay = (0.5 - s.y0) * h, bx = (s.x1 * 0.5 + 0.5) * w, by = (0.5 - s.y1) * h;
      const R = Math.max(0.8, s.r * h * (0.4 + 0.6 * s.strength)), len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.ceil(len / Math.max(0.5, R * 0.5)));
      // a stroke starts a new branch, with its own share of the walkers released around it
      const lb = addSeed(Math.max(0, Math.min(w - 1, Math.round(ax))), Math.max(0, Math.min(h - 1, Math.round(ay))));
      for (let j = 0; j <= k; j++) {
        const px = ax + ((bx - ax) * j) / k, py = ay + ((by - ay) * j) / k;
        for (let y = Math.floor(py - R); y <= Math.ceil(py + R); y++) for (let x = Math.floor(px - R); x <= Math.ceil(px + R); x++) {
          if (x < 0 || x >= w || y < 0 || y >= h || Math.hypot(x + 0.5 - px, y + 0.5 - py) > R) continue;
          attach(y * w + x, lb, true);
        }
      }
      // a stroke revives a run that had reached its edge (until a branch reaches one again; the 35 % cap stays)
      edge = 0;
      cacheKey = '';
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { count, nSeeds, edge, front };
      rng.save(scalars);
      return {
        id: ID, v: V, steps, res: h, scalars,
        arrays: { age: age.slice(), adj: adj.slice(), label: label.slice(), wx: wx.slice(), wy: wy.slice(), wl: wl.slice(), sx: sx.slice(), sy: sy.slice(), sr2: sr2.slice() },
      };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta agregación.');
      const A = s.arrays;
      const ok = A.age instanceof Int32Array && A.age.length === n && A.adj instanceof Uint8Array && A.adj.length === n
        && A.label instanceof Uint8Array && A.label.length === n && A.wx instanceof Int32Array && A.wx.length === MAX_WALKERS
        && A.wy instanceof Int32Array && A.wy.length === MAX_WALKERS && A.wl instanceof Uint8Array && A.wl.length === MAX_WALKERS
        && A.sx instanceof Int32Array && A.sx.length === MAX_SEEDS && A.sy instanceof Int32Array && A.sy.length === MAX_SEEDS
        && A.sr2 instanceof Int32Array && A.sr2.length === MAX_SEEDS;
      if (!ok) throw new Error('El estado guardado está incompleto.');
      age.set(A.age); adj.set(A.adj); label.set(A.label); wx.set(A.wx); wy.set(A.wy); wl.set(A.wl); sx.set(A.sx); sy.set(A.sy); sr2.set(A.sr2);
      const c = s.scalars;
      count = c.count ?? 0; nSeeds = c.nSeeds ?? 0; edge = c.edge ?? 0; front = c.front ?? 0;
      for (let k = 0; k < MAX_SEEDS; k++) killOf(k);
      steps = s.steps;
      rng.load(c);
      cacheKey = '';
    },
  };
}
