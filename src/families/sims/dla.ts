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
 *
 * «Renovación» (renew = 'si') never stops, with the same look at every resolution (walkers scale with the
 * lattice):
 *  - points, several points and the ring grow in a bath: walkers are released anywhere with room around
 *    them (never inside a fjord, which they would only fill) and wander until a crystal catches them. Each
 *    crystal lives about «Vida» seconds, growing all the while; then it stops catching and sublimates as a
 *    whole, cell by cell with a fixed grain, while new crystals nucleate where the field has room. On the
 *    ring (which stays), every walker that lands on it starts a ray of its own: rays sprout, spread and go;
 *  - a floor or a ceiling: the domain advances with the front (the picture scrolls, smooth between rows),
 *    so the branches keep growing while the oldest ones leave by the far side.
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
/** Renewal: rows the walkers' numbers are tuned for, and steps per second. */
const REF = 64, RATE = 30;
/**
 * Renewal in a bath: walkers per «Caminantes» (scaled by the lattice's area), crystal labels (0: the ring),
 * the steps over which a crystal's cells go (by their grain) and each one fades before it goes.
 */
const BATH = 6, LABELS = 256, SPREAD = 75, FADE = 30;
/** Bath: the share of the lattice its particles may cover before the oldest crystal begins to sublimate. */
const COVER: Record<string, number> = { punto: 0.14, varios: 0.16, anillo: 0.1 };
/** Bath: the share of the lattice one crystal may take before it stops catching walkers (they walk on). */
const CRYSTAL: Record<string, number> = { punto: 0.035, varios: 0.02, anillo: 0.012 };

interface P { seed: string; stick: number; bias: number; dir: string; walkers: number; width: number; age: string; renew: string; life: number }
const read = (p: Params): P => ({
  seed: String(p.seed ?? 'punto'), stick: Number(p.stick ?? 0.9), bias: Number(p.bias ?? 0.1), dir: String(p.dir ?? 'fuera'),
  walkers: Math.max(1, Math.min(MAX_WALKERS, Math.round(Number(p.walkers ?? 16)))), width: Number(p.width ?? 0.8), age: String(p.age ?? 'nuevas'),
  renew: String(p.renew ?? 'no'), life: Math.max(2, Number(p.life ?? 18)),
});

/** Walker drift for a growth direction (rows grow downward): walkers move against it. */
const DRIFT: Record<string, [number, number]> = { abajo: [0, -1], arriba: [0, 1], izquierda: [1, 0], derecha: [-1, 0] };

/** A cell's fixed grain in 0..1: when, within its crystal's sublimation, it goes. */
const grain = (i: number) => (Math.imul(i ^ 0x5bd1e995, 0x9e3779b1) >>> 8) / 16777216;

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

  // ---- renewal: in a bath (points, ring) or with an advancing domain (floor, ceiling)
  const renew = p.renew === 'si';
  const bath = renew && !lines, advancing = renew && lines;
  // per crystal (bath): step it was born and it begins to sublimate at, first and last attach order, cells it has
  const cb = new Int32Array(bath ? LABELS : 0), cd = new Int32Array(bath ? LABELS : 0), cf = new Int32Array(bath ? LABELS : 0), cl = new Int32Array(bath ? LABELS : 0), cc = new Int32Array(bath ? LABELS : 0);
  // cells attached up to `base` are permanent (the ring); next label to try; nucleation wait; advance of the domain
  let base = 0, live = 0, nextL = 1, cool = 0, sub = 0;
  const ringR = h * 0.2;
  /** Rows the floor's (ceiling's) front keeps from the far side while the domain advances. */
  const gapRows = Math.round(h * 0.3);

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
    if (bath) { live++; cc[lb]++; if (!cf[lb]) cf[lb] = count; cl[lb] = count; return; }
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
  /** Bath: a free crystal label (no cells left), with its life from now (`share` of «Vida» at least). */
  const newCrystal = (share = 0.8): number => {
    for (let k = 0; k < LABELS - 1; k++) {
      const lb = 1 + ((nextL - 1 + k) % (LABELS - 1));
      if (cc[lb]) continue;
      nextL = 1 + (lb % (LABELS - 1));
      cb[lb] = steps; cd[lb] = steps + Math.round(p.life * RATE * rng.range(share, share + 0.4)); cf[lb] = 0; cl[lb] = 0;
      return lb;
    }
    return -1;
  };
  /** Bath: whether crystal lb still catches walkers (the ring always does): not once it is full grown or fading. */
  const maxCells = Math.round(n * (CRYSTAL[shape] ?? 0.035));
  const alive = (lb: number) => lb === 0 || (steps < cd[lb] && cc[lb] < maxCells);

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
    // (in a bath the ring stays: it never sublimates)
    if (bath) base = count;
  } else if (shape === 'varios') {
    const k = 5 + rng.int(3);
    for (let j = 0, tries = 0; j < k && tries < 200; tries++) {
      const x = Math.round(rng.range(0.14, 0.86) * w), y = Math.round(rng.range(0.2, 0.8) * h);
      let ok = true;
      for (let s = 0; s < nSeeds; s++) if (Math.hypot(x - sx[s], y - sy[s]) < h * 0.32) ok = false;
      if (!ok) continue;
      const lb = addSeed(x, y);
      attach(y * w + x, bath ? newCrystal(0.3) : lb);
      j++;
    }
  } else if (bath) {
    // three nuclei apart, with lives that end at different moments; others nucleate as the run goes
    for (let j = 0; j < 3; j++) {
      const x = Math.round(((j + 0.5) / 3 + rng.range(-0.08, 0.08)) * w), y = Math.round(rng.range(0.3, 0.7) * h);
      attach(y * w + x, newCrystal(0.35 + 0.3 * j));
    }
  } else {
    const x = Math.round(cx), y = Math.round(cy);
    attach(y * w + x, addSeed(x, y));
  }
  // initial cells do not count as having reached an edge
  edge = 0;

  /** Bath: whether a particle lies within `clear` cells of (x, y). */
  const clear = Math.max(3, Math.round(h * 0.06));
  const crowded = (x: number, y: number) => {
    for (let yy = Math.max(0, y - clear); yy <= Math.min(h - 1, y + clear); yy++) {
      const o = yy * w;
      for (let xx = Math.max(0, x - clear); xx <= Math.min(w - 1, x + clear); xx++) if (age[o + xx]) return true;
    }
    return false;
  };

  /** Releases walker i where walkers come from; false when there is no room left to release it. */
  const spawn = (i: number): boolean => {
    for (let tries = 0; tries < 12; tries++) {
      let x: number, y: number;
      // a branch at random (a floor or a ceiling is branch 0; strokes of the brush add more)
      const lb = bath ? 0 : !lines || nSeeds > 1 ? rng.int(nSeeds) : 0;
      if (bath) {
        // anywhere with room around it (outside the ring)
        x = 1 + rng.int(w - 2); y = 1 + rng.int(h - 2);
        if (shape === 'anillo' && Math.hypot(x - sx[0], y - sy[0]) < ringR + 2) continue;
        if (crowded(x, y)) continue;
      } else if (lines && lb === 0) {
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

  /** Whether walker i wandered too far from where it was released (in a bath, never: it is the bath). */
  const lost = (x: number, y: number, lb: number): boolean => {
    if (bath) return false;
    if (lines && lb === 0) return shape === 'suelo' ? y < front - SPAWN - 14 : y > front + SPAWN + 14;
    return (x - sx[lb]) ** 2 + (y - sy[lb]) ** 2 > kill2[lb];
  };

  const stopped = () => !renew && (edge === 1 || count >= cap);

  // walkers at once: as given; renewal keeps the look at every resolution (a bath fills the area)
  const walkersNow = () => {
    if (!renew) return p.walkers;
    const k = bath ? BATH * (h / REF) ** 2 : (h / REF) ** 1.7;
    return Math.max(1, Math.min(MAX_WALKERS, Math.round(p.walkers * k)));
  };

  /**
   * Bath: whether a walker that touched crystal lbl at cell j stays there (on the ring it starts a ray of its
   * own); a full-grown or fading crystal does not take it, and it walks on.
   */
  const settle = (j: number, lbl: number) => {
    if (!alive(lbl)) return false;
    if (lbl === 0) { const nl = newCrystal(); if (nl < 0) return false; attach(j, nl); return true; }
    attach(j, lbl);
    return true;
  };

  const step1 = () => {
    if (stopped()) { steps++; return; }
    const dr = DRIFT[p.dir];
    const toCentre = !dr;
    // (a bath of points has no centre to drift toward: «Fuera» means no drift there; around the ring, toward it)
    const pd = bath && toCentre && shape !== 'anillo' ? 0 : Math.min(0.6, p.bias * 0.6), stick = p.stick;
    const nw = walkersNow();
    // (a bath on a finer lattice: more moves per step, so that walkers cross the same share of the field)
    const moves = bath ? Math.round(MOVES * Math.max(1, (h / REF) ** 2)) : MOVES;
    for (let i = 0; i < nw; i++) {
      if (wl[i] === DEAD && !spawn(i)) continue;
      let x = wx[i], y = wy[i];
      const lb = wl[i];
      for (let m = 0; m < moves; m++) {
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
          if (bath) { if (!settle(j, lbl)) continue; } else attach(j, lbl);
          wl[i] = DEAD;
          break;
        }
        if (lost(x, y, lb)) { wl[i] = DEAD; break; }
      }
      if (wl[i] !== DEAD) { wx[i] = x; wy[i] = y; }
      if (stopped()) break;
    }
    if (bath) { sublimate(); nucleate(); }
    else if (advancing) advance();
    steps++;
  };

  /* ------------------------------------------------------------------ */
  /* Renewal                                                             */
  /* ------------------------------------------------------------------ */

  /** Whether some cell of the 3 × 3 block around (x, y) holds a particle. */
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && age[ny * w + nx]) return 1;
    }
    return 0;
  };
  /**
   * Bath: when the field is full, the oldest crystal begins to sublimate (one at a time); the cells of crystals
   * past their life go, each at its grain's moment, and the flags around them are mended.
   */
  const sublimate = () => {
    let any = false, oldest = -1;
    for (let lb = 1; lb < LABELS; lb++) {
      if (!cc[lb]) continue;
      if (steps >= cd[lb]) any = true;
      else if (oldest < 0 || cb[lb] < cb[oldest]) oldest = lb;
    }
    if (!any && oldest > 0 && live > n * (COVER[shape] ?? 0.14)) { cd[oldest] = steps; any = true; }
    if (!any) return;
    for (let i = 0; i < n; i++) {
      const lb = label[i];
      if (!lb || !age[i] || steps < cd[lb] + grain(i) * SPREAD) continue;
      age[i] = 0; label[i] = 0; live--; cc[lb]--;
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) adj[ny * w + nx] = near(nx, ny);
      }
    }
  };
  /** Bath: a new crystal starts where the field is emptiest, while there are fewer than a handful growing. */
  const nucleate = () => {
    if (shape === 'anillo') return;
    if (cool > 0) { cool--; return; }
    let growing = 0;
    for (let lb = 1; lb < LABELS; lb++) if (cc[lb] && steps < cd[lb]) growing++;
    if (growing >= (shape === 'varios' ? 10 : 6)) return;
    let best = 0, bi = -1;
    const R = Math.round(h * 0.3);
    for (let c = 0; c < 8; c++) {
      const x = 2 + rng.int(w - 4), y = 2 + rng.int(h - 4);
      // the room around it: the distance to the nearest particle, up to R cells
      let d2 = R * R;
      for (let yy = Math.max(0, y - R); yy <= Math.min(h - 1, y + R); yy += 2) for (let xx = Math.max(0, x - R); xx <= Math.min(w - 1, x + R); xx += 2) {
        if (age[yy * w + xx]) { const e = (xx - x) ** 2 + (yy - y) ** 2; if (e < d2) d2 = e; }
      }
      if (d2 > best) { best = d2; bi = y * w + x; }
    }
    cool = 15 + rng.int(30);
    if (bi < 0 || best < (h * (shape === 'varios' ? 0.12 : 0.18)) ** 2) return;
    const lb = newCrystal();
    if (lb > 0) attach(bi, lb);
  };

  /** Floor and ceiling: the domain follows the front, a fraction of a row per step (faster the closer it is). */
  const advance = () => {
    const ahead = shape === 'suelo' ? gapRows + 2 - front : front - (h - 3 - gapRows);
    if (ahead <= 0) return;
    sub += Math.min(0.5, ahead * 0.012);
    while (sub >= 1) { sub -= 1; shiftRow(); }
  };
  /** Moves the whole lattice one row away from the front: the far row leaves, an empty one comes in. */
  const shiftRow = () => {
    const down = shape === 'suelo';
    if (down) {
      age.copyWithin(w, 0, n - w); label.copyWithin(w, 0, n - w); adj.copyWithin(w, 0, n - w);
      age.fill(0, 0, w); label.fill(0, 0, w); adj.fill(0, 0, w);
      front++;
      for (let x = 0; x < w; x++) adj[(h - 1) * w + x] = near(x, h - 1);
    } else {
      age.copyWithin(0, w, n); label.copyWithin(0, w, n); adj.copyWithin(0, w, n);
      age.fill(0, n - w, n); label.fill(0, n - w, n); adj.fill(0, n - w, n);
      front--;
      for (let x = 0; x < w; x++) adj[x] = near(x, 0);
    }
    const d = down ? 1 : -1;
    for (let i = 0; i < MAX_WALKERS; i++) {
      if (wl[i] === DEAD) continue;
      wy[i] += d;
      if (wy[i] < 1 || wy[i] > h - 2) wl[i] = DEAD;
    }
    for (let k = 0; k < nSeeds; k++) sy[k] += d;
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
  /** Brightness for a particle's place in the arrival order, 0 oldest → 1 newest. */
  const shade = (t: number) => (p.age === 'plano' ? 1 : p.age === 'antiguas' ? 1 - 0.72 * Math.pow(t, 0.6) : 0.28 + 0.72 * Math.pow(t, 1.6));
  const splat = (i: number, v: number, o: number[], k: number[]) => {
    const x = i % w, y = (i - x) / w;
    for (let e = 0; e < k.length; e++) {
      const xx = x + o[2 * e], yy = y + o[2 * e + 1];
      if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
      const j = yy * w + xx, c = v * k[e];
      if (c > acc[j]) acc[j] = c;
    }
  };
  /** Renewal: in a bath each crystal is shaded over its own arrivals and fades as it sublimates; a floor over the arrivals on screen. */
  const renderRenew = (out: Uint8Array) => {
    acc.fill(0);
    const { o, k } = kernel(p.width);
    let lo = Infinity;
    if (advancing) for (let i = 0; i < n; i++) if (age[i] && age[i] < lo) lo = age[i];
    for (let i = 0; i < n; i++) {
      const a = age[i];
      if (!a) continue;
      let v: number;
      if (bath) {
        const lb = label[i];
        if (a <= base) v = shade(0.15);
        else {
          const t = (a - cf[lb]) / Math.max(1, cl[lb] - cf[lb]);
          v = shade(t < 0 ? 0 : t > 1 ? 1 : t);
          const left = cd[lb] + grain(i) * SPREAD - steps;
          if (left < FADE) v *= Math.max(0, left / FADE);
        }
      } else v = shade((a - lo) / Math.max(1, count - lo));
      splat(i, v, o, k);
    }
    if (advancing && sub > 0) {
      // between two rows: the picture has moved `sub` of a row toward the far side
      const s = sub;
      if (shape === 'suelo') for (let i = n - 1; i >= 0; i--) out[i] = byte(acc[i] * (1 - s) + (i >= w ? acc[i - w] : 0) * s);
      else for (let i = 0; i < n; i++) out[i] = byte(acc[i] * (1 - s) + (i < n - w ? acc[i + w] : 0) * s);
      return;
    }
    for (let i = 0; i < n; i++) out[i] = byte(acc[i]);
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { const q = read(np); p = { ...q, seed: shape, renew: renew ? 'si' : 'no' }; },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      const key = renew ? `${steps}|${count}|${p.width}|${p.age}` : `${count}|${p.width}|${p.age}`;
      if (key === cacheKey) { out.set(cache); return; }
      if (renew) renderRenew(out);
      else {
        acc.fill(0);
        const { o, k } = kernel(p.width);
        const inv = 1 / Math.max(1, count - 1);
        for (let i = 0; i < n; i++) {
          const a = age[i];
          if (!a) continue;
          splat(i, shade((a - 1) * inv), o, k);
        }
        for (let i = 0; i < n; i++) out[i] = byte(acc[i]);
      }
      cache.set(out);
      cacheKey = key;
    },
    stroke(s: Stroke) {
      if (s.brush !== 'semilla') return;
      const ax = (s.x0 * 0.5 + 0.5) * w, ay = (0.5 - s.y0) * h, bx = (s.x1 * 0.5 + 0.5) * w, by = (0.5 - s.y1) * h;
      const R = Math.max(0.8, s.r * h * (0.4 + 0.6 * s.strength)), len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.ceil(len / Math.max(0.5, R * 0.5)));
      // a stroke starts a new branch, with its own share of the walkers released around it (in a bath: a
      // crystal of its own, that the bath feeds and that sublimates in its turn)
      const lb = bath ? newCrystal() : addSeed(Math.max(0, Math.min(w - 1, Math.round(ax))), Math.max(0, Math.min(h - 1, Math.round(ay))));
      if (lb < 0) return;
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
      const arrays: ModelState['arrays'] = { age: age.slice(), adj: adj.slice(), label: label.slice(), wx: wx.slice(), wy: wy.slice(), wl: wl.slice(), sx: sx.slice(), sy: sy.slice(), sr2: sr2.slice() };
      if (renew) Object.assign(scalars, { base, live, nextL, cool, sub });
      if (bath) Object.assign(arrays, { cb: cb.slice(), cd: cd.slice(), cf: cf.slice(), cl: cl.slice(), cc: cc.slice() });
      return { id: ID, v: V, steps, res: h, scalars, arrays };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta agregación.');
      const A = s.arrays;
      const lab = (a: unknown) => a instanceof Int32Array && a.length === LABELS;
      const ok = A.age instanceof Int32Array && A.age.length === n && A.adj instanceof Uint8Array && A.adj.length === n
        && A.label instanceof Uint8Array && A.label.length === n && A.wx instanceof Int32Array && A.wx.length === MAX_WALKERS
        && A.wy instanceof Int32Array && A.wy.length === MAX_WALKERS && A.wl instanceof Uint8Array && A.wl.length === MAX_WALKERS
        && A.sx instanceof Int32Array && A.sx.length === MAX_SEEDS && A.sy instanceof Int32Array && A.sy.length === MAX_SEEDS
        && A.sr2 instanceof Int32Array && A.sr2.length === MAX_SEEDS && (!bath || (lab(A.cb) && lab(A.cd) && lab(A.cf) && lab(A.cl) && lab(A.cc)));
      if (!ok) throw new Error('El estado guardado está incompleto.');
      age.set(A.age); adj.set(A.adj); label.set(A.label); wx.set(A.wx); wy.set(A.wy); wl.set(A.wl); sx.set(A.sx); sy.set(A.sy); sr2.set(A.sr2);
      if (bath) { cb.set(A.cb); cd.set(A.cd); cf.set(A.cf); cl.set(A.cl); cc.set(A.cc); }
      const c = s.scalars;
      count = c.count ?? 0; nSeeds = c.nSeeds ?? 0; edge = c.edge ?? 0; front = c.front ?? 0;
      if (renew) { base = c.base ?? 0; live = c.live ?? 0; nextL = c.nextL ?? 1; cool = c.cool ?? 0; sub = c.sub ?? 0; }
      for (let k = 0; k < MAX_SEEDS; k++) killOf(k);
      steps = s.steps;
      rng.load(c);
      cacheKey = '';
    },
  };
}
