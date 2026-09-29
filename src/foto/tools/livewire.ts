/**
 * «Contorno preciso»: intelligent scissors (Mortensen & Barrett, «Intelligent Scissors for Image Composition»,
 * SIGGRAPH 1995), pure and DOM-free.
 *
 *   cost map   from the photo at ≤ 1024 px: luminance, lightly smoothed; Sobel gradient magnitude and direction;
 *              Laplacian zero-crossings. The cost of stepping from p to a neighbour q is
 *                0.43·fZ(q) + 0.43·fG(q) + 0.14·fD(p, q)
 *              fZ = 0 on a zero-crossing, 1 elsewhere; fG = 1 − G/Gmax (× 1/√2 for straight steps, which are
 *              shorter); fD = how much the step turns away from the edge's own direction at p and at q.
 *              Costs are integers 0..255 so the search can use a bucket queue (Dial's algorithm).
 *   search     from the last anchor, a Dijkstra that settles pixels in cost order and keeps its state between
 *              pointer moves: each move only expands until the pixel under the pointer is settled, within a
 *              bounded window around the anchor and a per-move budget of settled pixels (a few milliseconds);
 *              the path is then read back through the predecessors.
 *   cooling    points that stay on the live path for several moves become anchors by themselves («the path
 *              settles»), so long outlines need few clicks.
 */

export interface CostMap {
  w: number;
  h: number;
  /** Static part of the cost of entering a pixel (fZ and fG), 0..1. */
  node: Float32Array;
  /** Unit vector perpendicular to the gradient (the edge's direction), per pixel. */
  dx: Float32Array;
  dy: Float32Array;
  /** Gradient magnitude normalised to 0..1 (for tests and the overlay). */
  mag: Float32Array;
}

const WZ = 0.43, WG = 0.43, WD = 0.14;

/** Luminance of RGBA pixels (0..1). */
export function luminance(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0, o = 0; i < out.length; i++, o += 4) out[i] = (0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]) / 255;
  return out;
}

/** 3×3 binomial blur (edges clamped). */
function smooth3(src: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      const a = src[r + (x > 0 ? x - 1 : x)], b = src[r + x], c = src[r + (x < w - 1 ? x + 1 : x)];
      tmp[r + x] = (a + 2 * b + c) / 4;
    }
  }
  for (let y = 0; y < h; y++) {
    const u = (y > 0 ? y - 1 : y) * w, m = y * w, d = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) out[m + x] = (tmp[u + x] + 2 * tmp[m + x] + tmp[d + x]) / 4;
  }
  return out;
}

/** The cost map of a greyscale picture (0..1 per pixel). */
export function costMapFromLuma(luma: Float32Array, w: number, h: number): CostMap {
  const g = smooth3(luma, w, h);
  const n = w * h;
  const mag = new Float32Array(n), dx = new Float32Array(n), dy = new Float32Array(n), lap = new Float32Array(n);
  const at = (x: number, y: number) => g[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
  let gmax = 1e-6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), c = g[i], r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const gx = (tr + 2 * r + br - tl - 2 * l - bl) / 8;
      const gy = (bl + 2 * b + br - tl - 2 * t - tr) / 8;
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > gmax) gmax = m;
      // the edge runs perpendicular to the gradient
      if (m > 1e-9) { dx[i] = gy / m; dy[i] = -gx / m; }
      lap[i] = t + b + l + r - 4 * c;
    }
  }
  const node = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = mag[i] / gmax;
      mag[i] = m;
      // a zero-crossing of the Laplacian: its sign changes towards a neighbour, and this pixel is the one closer to 0
      const v = lap[i];
      let zc = false;
      if (m > 0.02) {
        if (x < w - 1) { const q = lap[i + 1]; if (v * q < 0 && Math.abs(v) <= Math.abs(q)) zc = true; }
        if (!zc && x > 0) { const q = lap[i - 1]; if (v * q < 0 && Math.abs(v) <= Math.abs(q)) zc = true; }
        if (!zc && y < h - 1) { const q = lap[i + w]; if (v * q < 0 && Math.abs(v) <= Math.abs(q)) zc = true; }
        if (!zc && y > 0) { const q = lap[i - w]; if (v * q < 0 && Math.abs(v) <= Math.abs(q)) zc = true; }
      }
      node[i] = WZ * (zc ? 0 : 1) + WG * (1 - m);
    }
  }
  return { w, h, node, dx, dy, mag };
}

export const costMapFromRGBA = (rgba: Uint8ClampedArray | Uint8Array, w: number, h: number) => costMapFromLuma(luminance(rgba, w, h), w, h);

/* ------------------------------------------------------------------ search */

const NX = [1, 1, 0, -1, -1, -1, 0, 1];
const NY = [0, 1, 1, 1, 0, -1, -1, -1];
const MAXC = 255;
/** acos on [−1, 1] through a table (the direction term runs for every relaxed link). */
const ACOS = (() => { const t = new Float32Array(257); for (let i = 0; i <= 256; i++) t[i] = Math.acos(i / 128 - 1); return t; })();
const acosT = (v: number) => ACOS[Math.round((v < -1 ? -1 : v > 1 ? 1 : v) * 128 + 128)];

/** Integer cost 0..255 of the step from p to its neighbour k (direction index). */
function linkCost(m: CostMap, p: number, q: number, k: number): number {
  const diag = k & 1;
  const lx = NX[k] / (diag ? Math.SQRT2 : 1), ly = NY[k] / (diag ? Math.SQRT2 : 1);
  // the link is oriented so it runs along p's edge direction (dp ≥ 0), as the paper does; q is judged against it
  let dp = m.dx[p] * lx + m.dy[p] * ly, dq = m.dx[q] * lx + m.dy[q] * ly;
  if (dp < 0) { dp = -dp; dq = -dq; }
  const fD = ((acosT(dp) + acosT(dq)) * 2) / (3 * Math.PI); // 0..1
  // straight steps are shorter: their static cost counts less (1/√2)
  const stat = m.node[q] * (diag ? 1 : Math.SQRT1_2);
  const c = stat + WD * fD;
  return Math.min(MAXC, Math.max(0, Math.round(c * MAXC)));
}

export interface WireSearch {
  readonly seed: number;
  /**
   * Settles pixels until `target` is settled, or `budget` pixels were settled, or `ms` milliseconds passed.
   * True when the target is settled (call again to continue).
   */
  reach(target: number, budget?: number, ms?: number): boolean;
  /** The path from the seed to a settled pixel (seed first), as pixel indices. */
  path(target: number): number[];
  settled(i: number): boolean;
  /** Pixels settled so far (for timing and tests). */
  readonly count: number;
}

/**
 * A Dijkstra search from `seed` over the cost map, limited to a square window of `radius` px around it. The
 * bucket queue is circular (link costs are 0..255), so each pixel is inserted a few times at most and settled once.
 */
export function wireSearch(m: CostMap, seed: number, radius = 320): WireSearch {
  const { w, h } = m;
  const sx = seed % w, sy = (seed / w) | 0;
  const x0 = Math.max(0, sx - radius), x1 = Math.min(w - 1, sx + radius), y0 = Math.max(0, sy - radius), y1 = Math.min(h - 1, sy + radius);
  const ww = x1 - x0 + 1, wh = y1 - y0 + 1, wn = ww * wh;
  // window-local arrays: cost so far, predecessor (window index), settled flag
  const cost = new Float64Array(wn).fill(Infinity);
  const prev = new Int32Array(wn).fill(-1);
  const done = new Uint8Array(wn);
  const toWin = (i: number) => { const x = i % w, y = (i / w) | 0; return x < x0 || x > x1 || y < y0 || y > y1 ? -1 : (y - y0) * ww + (x - x0); };
  const toMap = (j: number) => (y0 + ((j / ww) | 0)) * w + x0 + (j % ww);
  const B = MAXC + 1;
  const buckets: number[][] = Array.from({ length: B }, () => []);
  let cur = 0, pending = 0, count = 0;
  const s = toWin(seed);
  cost[s] = 0;
  buckets[0].push(s);
  pending = 1;
  const settleOne = (): number => {
    while (pending > 0) {
      const b = buckets[cur % B];
      while (b.length) {
        const j = b.pop()!;
        pending--;
        if (done[j] || cost[j] !== cur) continue; // a stale entry (a cheaper one came later)
        done[j] = 1;
        count++;
        const i = toMap(j), x = i % w, y = (i / w) | 0;
        for (let k = 0; k < 8; k++) {
          const nx = x + NX[k], ny = y + NY[k];
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          const nj = (ny - y0) * ww + (nx - x0);
          if (done[nj]) continue;
          const c = cur + linkCost(m, i, ny * w + nx, k);
          if (c < cost[nj]) { cost[nj] = c; prev[nj] = j; buckets[c % B].push(nj); pending++; }
        }
        return j;
      }
      cur++;
    }
    return -1;
  };
  return {
    seed,
    get count() { return count; },
    settled(i) { const j = toWin(i); return j >= 0 && !!done[j]; },
    reach(target, budget = 60_000, ms = Infinity) {
      const t = toWin(target);
      if (t < 0) return false;
      const end = ms === Infinity ? Infinity : performance.now() + ms;
      let n = 0;
      while (!done[t] && n < budget) {
        if (settleOne() < 0) break;
        n++;
        if ((n & 511) === 0 && performance.now() > end) break;
      }
      return !!done[t];
    },
    path(target) {
      let j = toWin(target);
      if (j < 0 || !done[j]) return [];
      const out: number[] = [];
      while (j >= 0) { out.push(toMap(j)); j = prev[j]; }
      return out.reverse();
    },
  };
}

/** Clamps a pixel position into the window a search covers (the nearest pixel it can reach). */
export function clampToWindow(m: CostMap, seed: number, radius: number, x: number, y: number): number {
  const sx = seed % m.w, sy = (seed / m.w) | 0;
  const cx = Math.round(Math.min(Math.min(m.w - 1, sx + radius), Math.max(Math.max(0, sx - radius), x)));
  const cy = Math.round(Math.min(Math.min(m.h - 1, sy + radius), Math.max(Math.max(0, sy - radius), y)));
  return cy * m.w + cx;
}

/* ------------------------------------------------------------------ path cooling */

/**
 * Tracks the live path between moves: pixels that stay on it (a common prefix from the anchor) grow older; when
 * a point far enough along has stayed `moves` updates, everything up to it can become fixed.
 */
export class PathCooling {
  private last: number[] = [];
  private age: number[] = [];
  constructor(private moves = 6, private minLen = 24) {}

  reset(): void { this.last = []; this.age = []; }

  /** Feeds the new live path; returns the index (in it) of a point that should become an anchor, or −1. */
  update(path: readonly number[]): number {
    let common = 0;
    const n = Math.min(path.length, this.last.length);
    while (common < n && path[common] === this.last[common]) common++;
    const age = new Array<number>(path.length);
    for (let i = 0; i < path.length; i++) age[i] = i < common ? (this.age[i] ?? 0) + 1 : 0;
    this.last = path.slice();
    this.age = age;
    // the farthest stable point, not the end itself (the pointer is still moving there)
    for (let i = Math.min(common, path.length - 2); i >= this.minLen; i--) if (age[i] >= this.moves) return i;
    return -1;
  }
}
