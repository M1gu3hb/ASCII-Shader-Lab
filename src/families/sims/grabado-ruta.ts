/**
 * «Grabado láser» (C-07): the geometry of the route the tip follows. Pure functions, no DOM:
 *  - iso-contours of a sampled field (marching squares with saddles resolved by the cell's mean, segments joined
 *    into closed polylines, simplified);
 *  - the distance from the inside of a mask to its edge (exact Euclidean transform, Felzenszwalb–Huttenlocher),
 *    whose level sets are the parallel cuts inside a letter, and the mask's connected parts (the letters);
 *  - the strokes of the person's words read from a SourceFeed: their outlines (holes included: O, B, Ñ…), the
 *    cuts inside, grouped by letter;
 *  - the route: strokes ordered by nearness, letter by letter (outline first, then the cuts inside), joined by
 *    straight moves with the laser off, parametrised by arc length; the tip runs it at a defined speed
 *    (moves four times faster) and engraves only along the strokes.
 * Domain coordinates: x ∈ [−1, 1], y ∈ [−0.5, 0.5], y up (types.ts).
 */
import type { SourceFeed } from '../types';

/** A line to engrave, in domain coordinates. */
export interface Trazo {
  /** x0, y0, x1, y1, … */
  pts: Float64Array;
  /** Closed: the last point joins the first (a contour). */
  closed: boolean;
  /** What it belongs to (a letter, a figure): the planner engraves a group whole before the next one. */
  group: number;
  /** Cut within its group: 0 the outline or the line itself, 1, 2… the parallel cuts inside or beside it. */
  level: number;
}

/* ------------------------------------------------------------------ */
/* Contours                                                            */
/* ------------------------------------------------------------------ */

/**
 * Iso-contours of a grid (gw × gh values, row 0 at the top) at level `iso`, as closed polylines in grid
 * coordinates (x = column, y = row, at the samples). Outside the grid counts as below the level, so every contour
 * closes; a saddle cell is resolved by its mean (the two «inside» corners join when the mean is inside).
 */
export function isoContours(v: ArrayLike<number>, gw: number, gh: number, iso: number): Float64Array[] {
  const W = gw + 2, H = gh + 2, nk = W * H * 2;
  const val = (i: number, j: number) => (i < 0 || j < 0 || i >= gw || j >= gh ? iso - 1 : v[j * gw + i]);
  const nb1 = new Int32Array(nk).fill(-1), nb2 = new Int32Array(nk).fill(-1);
  const px = new Float64Array(nk), py = new Float64Array(nk);
  // edge points: horizontal edge (i, j)–(i + 1, j) and vertical edge (i, j)–(i, j + 1), in the padded grid
  const hk = (i: number, j: number) => ((j + 1) * W + (i + 1)) * 2;
  const vk = (i: number, j: number) => ((j + 1) * W + (i + 1)) * 2 + 1;
  const lerp = (a: number, b: number) => { const d = b - a; return Math.abs(d) < 1e-12 ? 0.5 : Math.min(1, Math.max(0, (iso - a) / d)); };
  const pointH = (i: number, j: number) => { const k = hk(i, j); px[k] = i + lerp(val(i, j), val(i + 1, j)); py[k] = j; return k; };
  const pointV = (i: number, j: number) => { const k = vk(i, j); px[k] = i; py[k] = j + lerp(val(i, j), val(i, j + 1)); return k; };
  const link = (a: number, b: number) => {
    if (nb1[a] < 0) nb1[a] = b; else nb2[a] = b;
    if (nb1[b] < 0) nb1[b] = a; else nb2[b] = a;
  };
  for (let j = -1; j < gh; j++) {
    for (let i = -1; i < gw; i++) {
      const a = val(i, j), b = val(i + 1, j), c = val(i + 1, j + 1), d = val(i, j + 1);
      const A = a >= iso, B = b >= iso, C = c >= iso, D = d >= iso;
      const top = A !== B, right = B !== C, bottom = D !== C, left = A !== D;
      const n = +top + +right + +bottom + +left;
      if (n === 0) continue;
      if (n === 2) {
        const e: number[] = [];
        if (top) e.push(pointH(i, j));
        if (right) e.push(pointV(i + 1, j));
        if (bottom) e.push(pointH(i, j + 1));
        if (left) e.push(pointV(i, j));
        link(e[0], e[1]);
        continue;
      }
      // a saddle: two diagonal corners inside
      const T = pointH(i, j), R = pointV(i + 1, j), Bo = pointH(i, j + 1), L = pointV(i, j);
      const mid = (a + b + c + d) / 4 >= iso;
      // cut off the corners that are not joined through the middle
      const cutTLBR = A ? !mid : mid; // the corners top-left and bottom-right are the ones cut off
      if (cutTLBR) { link(T, L); link(R, Bo); } else { link(T, R); link(L, Bo); }
    }
  }
  const out: Float64Array[] = [];
  const seen = new Uint8Array(nk);
  for (let k0 = 0; k0 < nk; k0++) {
    if (nb1[k0] < 0 || seen[k0]) continue;
    const pts: number[] = [];
    let prev = -1, cur = k0;
    for (let guard = 0; guard < nk; guard++) {
      seen[cur] = 1;
      pts.push(px[cur], py[cur]);
      const next = nb1[cur] !== prev || nb2[cur] < 0 ? nb1[cur] : nb2[cur];
      prev = cur; cur = next;
      if (cur < 0 || cur === k0 || seen[cur]) break;
    }
    if (pts.length >= 6) out.push(Float64Array.from(pts));
  }
  return out;
}

/** Length of a polyline (closed: back to its first point too). */
export function polyLength(p: Float64Array, closed: boolean): number {
  let L = 0;
  const n = p.length / 2;
  for (let i = 1; i < n; i++) L += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
  if (closed && n > 1) L += Math.hypot(p[0] - p[n * 2 - 2], p[1] - p[n * 2 - 1]);
  return L;
}

/** Ramer–Douglas–Peucker on a polyline (closed ones keep their first point and close on it). */
export function simplify(p: Float64Array, closed: boolean, eps: number): Float64Array {
  const n = p.length / 2;
  if (n < 4) return p;
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < n; i++) { xs.push(p[i * 2]); ys.push(p[i * 2 + 1]); }
  if (closed) {
    // split at the point farthest from the first: two open halves
    let far = 0, fd = -1;
    for (let i = 1; i < n; i++) { const d = (xs[i] - xs[0]) ** 2 + (ys[i] - ys[0]) ** 2; if (d > fd) { fd = d; far = i; } }
    const a = rdp(xs, ys, 0, far, eps), b = rdp([...xs, xs[0]], [...ys, ys[0]], far, n, eps);
    const keep = [...a, ...b.slice(1, -1)];
    if (keep.length < 3) return p;
    const o = new Float64Array(keep.length * 2);
    keep.forEach((k, i) => { o[i * 2] = k < n ? xs[k] : xs[0]; o[i * 2 + 1] = k < n ? ys[k] : ys[0]; });
    return o;
  }
  const keep = rdp(xs, ys, 0, n - 1, eps);
  const o = new Float64Array(keep.length * 2);
  keep.forEach((k, i) => { o[i * 2] = xs[k]; o[i * 2 + 1] = ys[k]; });
  return o;
}

function rdp(xs: number[], ys: number[], a: number, b: number, eps: number): number[] {
  const keep = new Uint8Array(b - a + 1);
  keep[0] = keep[b - a] = 1;
  const stack: Array<[number, number]> = [[a, b]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const dx = xs[i1] - xs[i0], dy = ys[i1] - ys[i0], L = Math.hypot(dx, dy) || 1e-12;
    let worst = -1, wd = eps;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs(dy * (xs[i] - xs[i0]) - dx * (ys[i] - ys[i0])) / L;
      if (d > wd) { wd = d; worst = i; }
    }
    if (worst >= 0) { keep[worst - a] = 1; stack.push([i0, worst], [worst, i1]); }
  }
  const out: number[] = [];
  for (let i = 0; i < keep.length; i++) if (keep[i]) out.push(a + i);
  return out;
}

/** One pass of Chaikin's corner cutting (smooths the stairs of a contour read on a grid). */
export function chaikin(p: Float64Array, closed: boolean): Float64Array {
  const n = p.length / 2;
  if (n < 3) return p;
  const o: number[] = [];
  if (!closed) o.push(p[0], p[1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    const ax = p[i * 2], ay = p[i * 2 + 1], bx = p[j * 2], by = p[j * 2 + 1];
    o.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
  }
  if (!closed) o.push(p[n * 2 - 2], p[n * 2 - 1]);
  return Float64Array.from(o);
}

/* ------------------------------------------------------------------ */
/* Distance inside a mask, and its parts                               */
/* ------------------------------------------------------------------ */

const INF = 1e20;

/** Squared distance transform of a 1D function (Felzenszwalb and Huttenlocher 2012). */
function dt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * Distance (in samples) from each inside sample of a w × h mask to the nearest outside one (0 outside); the
 * grid's border counts as outside.
 */
export function distanceInside(inside: Uint8Array, w: number, h: number): Float32Array {
  // padded by one outside sample on every side
  const W = w + 2, H = h + 2, g = new Float64Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = i - 1, y = j - 1;
    g[j * W + i] = x >= 0 && y >= 0 && x < w && y < h && inside[y * w + x] ? INF : 0;
  }
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) f[j] = g[j * W + i];
    dt1(f, H, d, v, z);
    for (let j = 0; j < H; j++) g[j * W + i] = d[j];
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) f[i] = g[j * W + i];
    dt1(f, W, d, v, z);
    for (let i = 0; i < W; i++) g[j * W + i] = d[i];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(g[(y + 1) * W + x + 1]);
  return out;
}

/** Connected parts of a mask (4-neighbourhood): a label per sample (0 outside, 1… a part) and how many. */
export function parts(inside: Uint8Array, w: number, h: number): { label: Int32Array; n: number; size: Int32Array } {
  const label = new Int32Array(w * h), q = new Int32Array(w * h), sizes: number[] = [0];
  let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (!inside[s] || label[s]) continue;
    n++;
    let head = 0, tail = 0, count = 0;
    q[tail++] = s; label[s] = n;
    while (head < tail) {
      const c = q[head++]; count++;
      const x = c % w, y = (c - x) / w;
      if (x > 0 && inside[c - 1] && !label[c - 1]) { label[c - 1] = n; q[tail++] = c - 1; }
      if (x < w - 1 && inside[c + 1] && !label[c + 1]) { label[c + 1] = n; q[tail++] = c + 1; }
      if (y > 0 && inside[c - w] && !label[c - w]) { label[c - w] = n; q[tail++] = c - w; }
      if (y < h - 1 && inside[c + w] && !label[c + w]) { label[c + w] = n; q[tail++] = c + w; }
    }
    sizes.push(count);
  }
  return { label, n, size: Int32Array.from(sizes) };
}

/* ------------------------------------------------------------------ */
/* The person's words                                                  */
/* ------------------------------------------------------------------ */

/** A source sampled on a grid over the whole domain (gw = 2 gh samples, square in domain units). */
export interface MaskGrid { m: Float32Array; w: number; h: number }

/** Samples a source's mask (its luminance: the letters) at the centres of a 2·gh × gh grid over the domain. */
export function sampleMask(src: SourceFeed, gh: number): MaskGrid {
  const h = Math.max(8, Math.round(gh)), w = 2 * h, m = new Float32Array(w * h), o = new Float64Array(4);
  for (let j = 0; j < h; j++) {
    const y = 0.5 - (j + 0.5) / h;
    for (let i = 0; i < w; i++) {
      src.at((i + 0.5) / h - 1, y, o);
      m[j * w + i] = o[3];
    }
  }
  return { m, w, h };
}

/** Grid coordinates (samples) → domain coordinates, in place. */
function toDomain(p: Float64Array, h: number) {
  for (let i = 0; i < p.length; i += 2) { p[i] = (p[i] + 0.5) / h - 1; p[i + 1] = 0.5 - (p[i + 1] + 0.5) / h; }
  return p;
}

export interface TextCuts {
  strokes: Trazo[];
  /** Letters (connected parts) found. */
  letters: number;
  /** Typical width of the letters' strokes (the median part's, domain units). */
  stroke: number;
  /**
   * How the cuts fit the letters (0.6..1): 1 when the strokes are at least two spacings wide; less for small or thin
   * letters (a long text), whose cuts come closer together and whose groove should be narrower (the model reads it).
   */
  fit: number;
}

/**
 * The strokes of a mask of letters: for every connected part (a letter, an accent, the dot of an i), its outline
 * (the 0.5 level of the mask: outer edge and holes) and up to `passes − 1` cuts inside it, each `spacing · fit`
 * domain units further in (level sets of the distance to the edge; `phase` in [0, 1) shifts them by half a
 * spacing). Parts smaller than a few samples are noise and left out.
 */
export function maskStrokes(g: MaskGrid, passes: number, spacing: number, phase = 0): TextCuts {
  const { m, w, h } = g, inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inside[i] = m[i] >= 0.5 ? 1 : 0;
  const { label, n, size } = parts(inside, w, h);
  if (!n) return { strokes: [], letters: 0, stroke: 0, fit: 1 };
  const d = distanceInside(inside, w, h);
  // each part's thickest point: twice its largest distance to the edge is its stroke's width
  const deep = new Float32Array(n + 1);
  for (let i = 0; i < w * h; i++) { const l = label[i]; if (l && d[i] > deep[l]) deep[l] = d[i]; }
  const widths = [...deep.subarray(1)].filter((_, i) => size[i + 1] >= 3).map(v => (2 * Math.max(0.5, v - 0.5)) / h).sort((a, b) => a - b);
  const stroke = widths.length ? widths[Math.floor(widths.length / 2)] : 0;
  const fit = Math.max(0.6, Math.min(1, stroke / (2 * spacing)));
  spacing *= fit;
  const groupOf = (pts: Float64Array): number => {
    // the part a contour belongs to: the label of an inside sample next to one of its points
    for (let k = 0; k < pts.length; k += 2) {
      const x = pts[k], y = pts[k + 1];
      const xs = [Math.floor(x), Math.ceil(x)], ys = [Math.floor(y), Math.ceil(y)];
      for (const yy of ys) for (const xx of xs) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const l = label[yy * w + xx];
        if (l) return l;
      }
    }
    return 0;
  };
  const minSize = 3, eps = 0.18, strokes: Trazo[] = [];
  const add = (loops: Float64Array[], level: number, smooth: boolean) => {
    for (const lp of loops) {
      if (polyLength(lp, true) < 2.2) continue;
      const gid = groupOf(lp);
      if (!gid || size[gid] < minSize) continue;
      let p = smooth ? chaikin(lp, true) : lp;
      p = simplify(p, true, eps);
      strokes.push({ pts: toDomain(Float64Array.from(p), h), closed: true, group: gid, level });
    }
  };
  add(isoContours(m, w, h, 0.5), 0, false);
  if (passes > 1) {
    // a light blur: the distance's level sets come out smooth instead of in stairs
    const s = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let acc = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        acc += d[yy * w + xx]; c++;
      }
      s[y * w + x] = inside[y * w + x] ? acc / c : 0;
    }
    const step = spacing * h;
    for (let k = 1; k < passes; k++) {
      // the edge sits half a sample from the last inside sample's centre
      const iso = 0.5 + (k + phase * 0.5) * step;
      add(isoContours(s, w, h, iso), k, true);
    }
  }
  return { strokes, letters: n, stroke, fit };
}

/* ------------------------------------------------------------------ */
/* Parallel cuts beside a line (letters of the own type, signatures)   */
/* ------------------------------------------------------------------ */

/** A polyline moved `d` along its normals (left of the direction of travel; miters limited). */
export function offsetLine(p: Float64Array, closed: boolean, d: number): Float64Array {
  const n = p.length / 2, o = new Float64Array(p.length);
  const nx = (i: number, j: number) => { const dx = p[j * 2] - p[i * 2], dy = p[j * 2 + 1] - p[i * 2 + 1], L = Math.hypot(dx, dy) || 1e-12; return [-dy / L, dx / L]; };
  for (let i = 0; i < n; i++) {
    const hasPrev = closed || i > 0, hasNext = closed || i < n - 1;
    const a = hasPrev ? nx((i - 1 + n) % n, i) : null, b = hasNext ? nx(i, (i + 1) % n) : null;
    let mx = (a?.[0] ?? 0) + (b?.[0] ?? 0), my = (a?.[1] ?? 0) + (b?.[1] ?? 0);
    const L = Math.hypot(mx, my);
    if (L < 1e-9) { mx = (b ?? a)![0]; my = (b ?? a)![1]; } else { mx /= L; my /= L; }
    // miter: 1 / cos of half the turn, at most 2.5
    const ref = b ?? a!, cos = Math.max(0.4, mx * ref[0] + my * ref[1]);
    o[i * 2] = p[i * 2] + (mx * d) / cos;
    o[i * 2 + 1] = p[i * 2 + 1] + (my * d) / cos;
  }
  return o;
}

/** The cut k beside a line (k = 1, 2…): alternately on each side, further out every two. */
export const sideOffset = (k: number, d: number) => (k % 2 ? 1 : -1) * Math.ceil(k / 2) * d;

/* ------------------------------------------------------------------ */
/* The route                                                           */
/* ------------------------------------------------------------------ */

/** With the laser off the tip moves this many times faster. */
export const TRAVEL = 4;

/**
 * The tip's path: vertices joined by segments that either engrave (on) or are moves with the laser off. P(s) is
 * the polyline by arc length `s`; the tip's clock is the cost `c` (engraved length, plus moves at 1/TRAVEL),
 * which the model advances at the chosen speed: constant speed along every segment.
 */
export interface Route {
  n: number;
  x: Float64Array; y: Float64Array;
  /** Segment i (vertex i → i + 1): 1 engraves, 0 is a move with the laser off. */
  on: Uint8Array;
  /** Stroke (index into the planned strokes) each segment engraves; −1 for a move. */
  stroke: Int32Array;
  /** Level of the stroke each segment engraves (0 the outline or line, 1… the parallel cuts); −1 for a move. */
  level: Int8Array;
  /** Arc length at each vertex. */
  s: Float64Array;
  /** Cost at each vertex. */
  c: Float64Array;
  /** Engraved length (moves excluded). */
  cut: number;
  /** Strokes planned. */
  strokes: number;
  /** Bounding box of what is engraved. */
  box: [number, number, number, number];
}

const d2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

/** Where a stroke is best entered from (x, y): the nearest vertex of a closed one, the nearer end of an open one. */
function entry(t: Trazo, x: number, y: number): { i: number; d: number; rev: boolean } {
  const p = t.pts, n = p.length / 2;
  if (!t.closed) {
    const a = d2(x, y, p[0], p[1]), b = d2(x, y, p[n * 2 - 2], p[n * 2 - 1]);
    return a <= b ? { i: 0, d: a, rev: false } : { i: n - 1, d: b, rev: true };
  }
  let best = 0, bd = Infinity;
  for (let i = 0; i < n; i++) { const d = d2(x, y, p[i * 2], p[i * 2 + 1]); if (d < bd) { bd = d; best = i; } }
  return { i: best, d: bd, rev: false };
}

/**
 * Orders the strokes and joins them into a route starting at (sx, sy). Groups go by nearness from where the
 * tip is (going back to the left costs a little more, so a line of letters reads in order); inside a group its
 * outline goes first, then each level of cuts, strokes by nearness. Between strokes the tip moves straight with
 * the laser off.
 */
export function planRoute(strokes: Trazo[], sx: number, sy: number): Route {
  const X: number[] = [sx], Y: number[] = [sy], ON: number[] = [], ST: number[] = [];
  let x = sx, y = sy;
  const push = (nx: number, ny: number, on: number, st: number) => {
    if (Math.abs(nx - x) < 1e-9 && Math.abs(ny - y) < 1e-9) return;
    X.push(nx); Y.push(ny); ON.push(on); ST.push(st);
    x = nx; y = ny;
  };
  const groups = new Map<number, number[]>();
  strokes.forEach((t, i) => { const g = groups.get(t.group); if (g) g.push(i); else groups.set(t.group, [i]); });
  const pending = [...groups.keys()];
  const minLevel = (g: number) => Math.min(...groups.get(g)!.map(i => strokes[i].level));
  while (pending.length) {
    // the nearest group (by the entry of its outline), a bit dearer to the left
    let gi = 0, gc = Infinity;
    for (let k = 0; k < pending.length; k++) {
      const g = pending[k], lv = minLevel(g);
      for (const i of groups.get(g)!) {
        if (strokes[i].level !== lv) continue;
        const e = entry(strokes[i], x, y), p = strokes[i].pts;
        const cost = Math.sqrt(e.d) + 0.35 * Math.max(0, x - p[e.i * 2]);
        if (cost < gc) { gc = cost; gi = k; }
      }
    }
    const g = pending.splice(gi, 1)[0];
    const members = groups.get(g)!.slice().sort((a, b) => strokes[a].level - strokes[b].level);
    let li = 0;
    while (li < members.length) {
      const lv = strokes[members[li]].level;
      const level: number[] = [];
      while (li < members.length && strokes[members[li]].level === lv) level.push(members[li++]);
      while (level.length) {
        let bi = 0, bd = Infinity, be = { i: 0, d: 0, rev: false };
        for (let k = 0; k < level.length; k++) { const e = entry(strokes[level[k]], x, y); if (e.d < bd) { bd = e.d; bi = k; be = e; } }
        const si = level.splice(bi, 1)[0], t = strokes[si], p = t.pts, n = p.length / 2;
        push(p[be.i * 2], p[be.i * 2 + 1], 0, -1);
        if (t.closed) {
          for (let k = 1; k <= n; k++) { const j = (be.i + k) % n; push(p[j * 2], p[j * 2 + 1], 1, si); }
        } else if (be.rev) {
          for (let j = n - 2; j >= 0; j--) push(p[j * 2], p[j * 2 + 1], 1, si);
        } else {
          for (let j = 1; j < n; j++) push(p[j * 2], p[j * 2 + 1], 1, si);
        }
      }
    }
  }
  const n = X.length;
  const s = new Float64Array(n), c = new Float64Array(n);
  let cut = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 1; i < n; i++) {
    const L = Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
    s[i] = s[i - 1] + L;
    c[i] = c[i - 1] + (ON[i - 1] ? L : L / TRAVEL);
    if (ON[i - 1]) {
      cut += L;
      x0 = Math.min(x0, X[i], X[i - 1]); x1 = Math.max(x1, X[i], X[i - 1]);
      y0 = Math.min(y0, Y[i], Y[i - 1]); y1 = Math.max(y1, Y[i], Y[i - 1]);
    }
  }
  return {
    n, x: Float64Array.from(X), y: Float64Array.from(Y), on: Uint8Array.from(ON), stroke: Int32Array.from(ST),
    level: Int8Array.from(ST.map(si => (si < 0 ? -1 : Math.min(127, strokes[si].level)))), s, c, cut, strokes: strokes.length,
    box: cut > 0 ? [x0, y0, x1, y1] : [0, 0, 0, 0],
  };
}

/** Total cost of a route (its clock at the end). */
export const routeEnd = (r: Route) => (r.n ? r.c[r.n - 1] : 0);

/** The segment the cost c falls in (−1 before any). */
export function segmentAt(r: Route, c: number): number {
  if (r.n < 2) return -1;
  let lo = 0, hi = r.n - 1;
  if (c >= r.c[hi]) return r.n - 2;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.c[m] <= c) lo = m; else hi = m; }
  return lo;
}

/** The tip at cost c: position into out[0..1], whether it engraves there into out[2], arc length into out[3]. */
export function routeAt(r: Route, c: number, out: Float64Array) {
  if (r.n < 2) { out[0] = r.n ? r.x[0] : 0; out[1] = r.n ? r.y[0] : 0; out[2] = 0; out[3] = 0; return; }
  const i = segmentAt(r, c), span = r.c[i + 1] - r.c[i];
  const f = span > 0 ? Math.min(1, Math.max(0, (c - r.c[i]) / span)) : 1;
  out[0] = r.x[i] + (r.x[i + 1] - r.x[i]) * f;
  out[1] = r.y[i] + (r.y[i + 1] - r.y[i]) * f;
  out[2] = r.on[i];
  out[3] = r.s[i] + (r.s[i + 1] - r.s[i]) * f;
}

/**
 * Walks the engraved part of the route between costs c0 and c1, calling fn(x, y, ux, uy, dl, level) every `ds` of
 * arc length or less (and at the end of each engraved piece): the point, the unit direction of travel, the length
 * the sample stands for and the stroke's level. Moves call nothing: the laser is off. Returns the length engraved.
 */
export function walkCut(r: Route, c0: number, c1: number, ds: number, fn: (x: number, y: number, ux: number, uy: number, dl: number, level: number) => void): number {
  if (r.n < 2 || c1 <= c0) return 0;
  let i = Math.max(0, segmentAt(r, c0)), cut = 0;
  for (; i < r.n - 1 && r.c[i] < c1; i++) {
    if (!r.on[i]) continue;
    const a = Math.max(c0, r.c[i]), b = Math.min(c1, r.c[i + 1]);
    if (b <= a) continue;
    const span = r.c[i + 1] - r.c[i];
    const fa = (a - r.c[i]) / span, fb = (b - r.c[i]) / span;
    const dx = r.x[i + 1] - r.x[i], dy = r.y[i + 1] - r.y[i], L = Math.hypot(dx, dy);
    const len = L * (fb - fa);
    const k = Math.max(1, Math.ceil(len / ds));
    for (let j = 1; j <= k; j++) {
      const f = fa + ((fb - fa) * j) / k;
      fn(r.x[i] + dx * f, r.y[i] + dy * f, dx / (L || 1), dy / (L || 1), len / k, r.level[i]);
    }
    cut += len;
  }
  return cut;
}
