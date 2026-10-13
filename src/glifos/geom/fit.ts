/**
 * Polylines → Bézier contours: Ramer–Douglas–Peucker simplification and Schneider's least-squares cubic fitting
 * («An Algorithm for Automatically Fitting Digitized Curves», Graphics Gems, 1990), with corner detection so
 * that stems keep their sharp corners and bowls come out as a few smooth nodes. Used after boolean operations,
 * stroking and tracing, which all work on polygons. Pure: no DOM.
 */
import type { Contour, PathNode, Pt } from '../doc';

const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const norm = (a: Pt): Pt => { const l = Math.hypot(a.x, a.y); return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }; };

/** Squared distance from p to the segment ab. */
function segDist2(p: Pt, a: Pt, b: Pt): number {
  const l2 = dist2(a, b);
  if (l2 < 1e-18) return dist2(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  return dist2(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

function rdp(pts: Pt[], lo: number, hi: number, tol2: number, keep: Uint8Array) {
  // iterative, so a long noisy outline cannot overflow the stack
  const stack: Array<[number, number]> = [[lo, hi]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1, bd = tol2;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(pts[i], pts[a], pts[b]);
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
}

/** Ramer–Douglas–Peucker: the fewest points that stay within `tolerance` of the polyline. */
export function simplify(points: Pt[], tolerance: number, closed: boolean): Pt[] {
  const pts = dedupe(points, closed);
  if (pts.length <= 2) return pts.map(p => ({ x: p.x, y: p.y }));
  const tol2 = Math.max(0, tolerance) ** 2;
  const keep = new Uint8Array(pts.length);
  if (!closed) {
    keep[0] = keep[pts.length - 1] = 1;
    rdp(pts, 0, pts.length - 1, tol2, keep);
  } else {
    // split the loop at the point farthest from the first one and simplify both halves
    let far = 1, fd = -1;
    for (let i = 1; i < pts.length; i++) { const d = dist2(pts[i], pts[0]); if (d > fd) { fd = d; far = i; } }
    const ring = [...pts, pts[0]];
    keep[0] = keep[far] = 1;
    const k2 = new Uint8Array(ring.length);
    rdp(ring, 0, far, tol2, k2);
    rdp(ring, far, ring.length - 1, tol2, k2);
    for (let i = 0; i < pts.length; i++) if (k2[i]) keep[i] = 1;
  }
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push({ x: pts[i].x, y: pts[i].y });
  return out;
}

/** Drops repeated points (and the closing repeat of a closed polyline). */
function dedupe(points: Pt[], closed: boolean, minDist = 1e-9): Pt[] {
  const out: Pt[] = [];
  const m2 = minDist * minDist;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (!out.length || dist2(out[out.length - 1], p) > m2) out.push(p);
  }
  if (closed) while (out.length > 1 && dist2(out[0], out[out.length - 1]) <= m2) out.pop();
  return out;
}

/* ------------------------------------------------------------------ */
/* Schneider fitting                                                   */
/* ------------------------------------------------------------------ */

type Bez = [Pt, Pt, Pt, Pt];
interface Seg { p0: Pt; p3: Pt; c1?: Pt; c2?: Pt }

const bez = (b: Bez, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * u * b[0].x + 3 * u * u * t * b[1].x + 3 * u * t * t * b[2].x + t * t * t * b[3].x,
    y: u * u * u * b[0].y + 3 * u * u * t * b[1].y + 3 * u * t * t * b[2].y + t * t * t * b[3].y,
  };
};
const bezD1 = (b: Bez, t: number): Pt => {
  const u = 1 - t;
  return {
    x: 3 * (u * u * (b[1].x - b[0].x) + 2 * u * t * (b[2].x - b[1].x) + t * t * (b[3].x - b[2].x)),
    y: 3 * (u * u * (b[1].y - b[0].y) + 2 * u * t * (b[2].y - b[1].y) + t * t * (b[3].y - b[2].y)),
  };
};
const bezD2 = (b: Bez, t: number): Pt => {
  const u = 1 - t;
  return {
    x: 6 * (u * (b[2].x - 2 * b[1].x + b[0].x) + t * (b[3].x - 2 * b[2].x + b[1].x)),
    y: 6 * (u * (b[2].y - 2 * b[1].y + b[0].y) + t * (b[3].y - 2 * b[2].y + b[1].y)),
  };
};

function chordParams(pts: Pt[], a: number, b: number): number[] {
  const u = [0];
  for (let i = a + 1; i <= b; i++) u.push(u[u.length - 1] + Math.sqrt(dist2(pts[i], pts[i - 1])));
  const L = u[u.length - 1] || 1;
  return u.map(v => v / L);
}

function generate(pts: Pt[], a: number, b: number, u: number[], t1: Pt, t2: Pt): Bez {
  const p0 = pts[a], p3 = pts[b];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < u.length; i++) {
    const t = u[i], s = 1 - t;
    const b1 = 3 * t * s * s, b2 = 3 * t * t * s;
    const A1 = mul(t1, b1), A2 = mul(t2, b2);
    c00 += dot(A1, A1); c01 += dot(A1, A2); c11 += dot(A2, A2);
    const tmp = sub(pts[a + i], add(mul(p0, s * s * s + b1), mul(p3, b2 + t * t * t)));
    x0 += dot(A1, tmp); x1 += dot(A2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  const seg = Math.sqrt(dist2(p0, p3));
  let al = 0, ar = 0;
  if (Math.abs(det) > 1e-12) { al = (x0 * c11 - x1 * c01) / det; ar = (c00 * x1 - c01 * x0) / det; }
  // degenerate or backwards handles: Wu/Barsky heuristic
  if (!(al > seg * 1e-6) || !(ar > seg * 1e-6) || al > seg * 4 || ar > seg * 4) al = ar = seg / 3;
  return [p0, add(p0, mul(t1, al)), add(p3, mul(t2, ar)), p3];
}

function maxError(pts: Pt[], a: number, b: number, bz: Bez, u: number[]): { err: number; at: number } {
  let err = 0, at = Math.floor((a + b) / 2);
  for (let i = a + 1; i < b; i++) {
    const d = dist2(bez(bz, u[i - a]), pts[i]);
    if (d >= err) { err = d; at = i; }
  }
  return { err, at };
}

function reparam(pts: Pt[], a: number, bz: Bez, u: number[]): number[] {
  return u.map((t, i) => {
    const p = pts[a + i], q = bez(bz, t), d1 = bezD1(bz, t), d2 = bezD2(bz, t);
    const num = (q.x - p.x) * d1.x + (q.y - p.y) * d1.y;
    const den = d1.x * d1.x + d1.y * d1.y + (q.x - p.x) * d2.x + (q.y - p.y) * d2.y;
    const nt = Math.abs(den) > 1e-12 ? t - num / den : t;
    return Number.isFinite(nt) ? Math.max(0, Math.min(1, nt)) : t;
  });
}

function fitRun(pts: Pt[], a: number, b: number, t1: Pt, t2: Pt, tol2: number, out: Seg[], depth: number) {
  const n = b - a + 1;
  // straight enough: a line (no handles), which keeps stems and bars exact
  let flat = true;
  for (let i = a + 1; i < b && flat; i++) if (segDist2(pts[i], pts[a], pts[b]) > tol2) flat = false;
  if (n <= 2 || flat) { out.push({ p0: pts[a], p3: pts[b] }); return; }
  let u = chordParams(pts, a, b);
  let bz = generate(pts, a, b, u, t1, t2);
  let { err, at } = maxError(pts, a, b, bz, u);
  if (err < tol2) { out.push({ p0: bz[0], c1: bz[1], c2: bz[2], p3: bz[3] }); return; }
  if (err < tol2 * 16) {
    for (let k = 0; k < 6; k++) {
      u = reparam(pts, a, bz, u);
      bz = generate(pts, a, b, u, t1, t2);
      ({ err, at } = maxError(pts, a, b, bz, u));
      if (err < tol2) { out.push({ p0: bz[0], c1: bz[1], c2: bz[2], p3: bz[3] }); return; }
    }
  }
  if (depth > 24) { out.push({ p0: bz[0], c1: bz[1], c2: bz[2], p3: bz[3] }); return; }
  at = Math.max(a + 1, Math.min(b - 1, at));
  let tc = norm(sub(pts[at - 1], pts[at + 1]));
  if (!tc.x && !tc.y) tc = norm(sub(pts[at - 1], pts[at]));
  fitRun(pts, a, at, t1, tc, tol2, out, depth + 1);
  fitRun(pts, at, b, mul(tc, -1), t2, tol2, out, depth + 1);
}

/** Merges points closer than `d` to the previous kept one (tiny edges near corners hide the corner). */
function mergeClose(pts: Pt[], d: number, closed: boolean): Pt[] {
  if (pts.length < 3) return pts;
  const d2 = d * d, out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const last = !closed && i === pts.length - 1;
    if (dist2(out[out.length - 1], pts[i]) >= d2 || last) {
      if (last && out.length > 1 && dist2(out[out.length - 1], pts[i]) < d2) out.pop();
      out.push(pts[i]);
    }
  }
  if (closed) while (out.length > 3 && dist2(out[0], out[out.length - 1]) < d2) out.pop();
  return out.length >= 2 ? out : pts;
}

/**
 * Corners: vertices where the direction turns more than `deg`, measured over a short window (`win` of arc
 * length on each side) so a corner cut into two half-turns by a tiny edge still reads as one corner.
 */
function findCorners(pts: Pt[], closed: boolean, deg: number, win: number): boolean[] {
  const n = pts.length, out = new Array<boolean>(n).fill(false);
  if (n < 3) return out;
  const cosT = Math.cos((deg * Math.PI) / 180);
  const turn: number[] = new Array(n).fill(1);
  const at = (i: number) => pts[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    let j = i - 1, k = i + 1, lb = Math.sqrt(dist2(at(j), at(i))), lf = Math.sqrt(dist2(at(k), at(i)));
    // extend the window until each side spans `win`, without wrapping past the ends of an open polyline
    while (lb < win && (closed ? i - j < n / 2 : j > 0)) { j--; lb = Math.sqrt(dist2(at(j), at(i))); }
    while (lf < win && (closed ? k - i < n / 2 : k < n - 1)) { k++; lf = Math.sqrt(dist2(at(k), at(i))); }
    const din = norm(sub(at(i), at(j))), dout = norm(sub(at(k), at(i)));
    turn[i] = dot(din, dout);
  }
  // candidates closer than the window to the previous one are the same corner smeared by the window: keep the
  // sharpest of such a run; candidates farther apart are distinct corners
  const cand = turn.map(t => t <= cosT);
  const first = closed ? Math.max(0, cand.indexOf(false)) : 0;
  let best = -1, prev = -1;
  for (let s = 0; s <= n; s++) {
    const i = (first + s) % n;
    const isCand = s < n && cand[i];
    const near = isCand && prev >= 0 && Math.sqrt(dist2(pts[i], pts[prev])) < win;
    if (best >= 0 && !near) { out[best] = true; best = -1; }
    if (isCand) {
      if (best < 0 || turn[i] < turn[best]) best = i;
      prev = i;
    } else prev = -1;
  }
  if (best >= 0) out[best] = true;
  return out;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const rp = (p: Pt): Pt => ({ x: r3(p.x), y: r3(p.y) });

/** Segments → document nodes: absolute handles, `smooth` where the fit kept the tangent continuous. */
function toContour(segs: Seg[], closed: boolean, cornerAt: Set<Pt>): Contour {
  const nodes: PathNode[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const node: PathNode = rp(s.p0);
    if (s.c1) node.ho = rp(s.c1);
    const prev = i > 0 ? segs[i - 1] : closed ? segs[segs.length - 1] : null;
    if (prev?.c2) node.hi = rp(prev.c2);
    if (prev && !cornerAt.has(s.p0) && (node.hi || node.ho)) node.smooth = true;
    nodes.push(node);
  }
  if (!closed && segs.length) {
    const last = segs[segs.length - 1];
    const node: PathNode = rp(last.p3);
    if (last.c2) node.hi = rp(last.c2);
    nodes.push(node);
  }
  return { closed, nodes };
}

/**
 * Fits cubic Béziers to a polyline within `tolerance` (font units). Vertices turning more than `cornerDeg`
 * (50° by default) stay corners; between them the curve is smooth (`smooth: true` nodes). A closed loop
 * starts at a corner when it has one. Tiny inputs (≤ 3 points) come back as straight segments.
 */
export function fitCurve(points: Pt[], closed: boolean, tolerance: number, cornerDeg = 50): Contour {
  const tol = Math.max(1e-6, tolerance);
  let pts = dedupe(points, closed);
  if (pts.length === 0) return { closed, nodes: [] };
  if (pts.length <= 3) return { closed, nodes: pts.map(rp) };
  pts = mergeClose(pts, tol * 0.5, closed);
  if (pts.length <= 3) return { closed, nodes: pts.map(rp) };
  const corner0 = findCorners(pts, closed, cornerDeg, tol * 2);
  // least squares only sees the samples: long edges get intermediate points, or a cubic could pass through a
  // vertex of a sparse polygon and bulge between the samples
  const step = Math.max(4 * tol, 1e-3);
  const dense: Pt[] = [], dc: boolean[] = [];
  const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < pts.length; i++) {
    dense.push(pts[i]);
    dc.push(corner0[i]);
    if (i >= m) continue;
    const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.sqrt(dist2(a, b));
    const k = Math.min(400, Math.floor(l / step));
    for (let j = 1; j < k; j++) { dense.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k }); dc.push(false); }
  }
  pts = dense;
  const corner = dc;
  const tol2 = tol * tol;
  const segs: Seg[] = [];
  const corners = new Set<Pt>();
  const tangentAt = (arr: Pt[], i: number, dir: 1 | -1): Pt => {
    // direction into the run, from a few points along it (robust on noisy data)
    const j = Math.max(0, Math.min(arr.length - 1, i + dir));
    return norm(sub(arr[j], arr[i]));
  };
  if (!closed) {
    const idx = [0];
    for (let i = 1; i < pts.length - 1; i++) if (corner[i]) idx.push(i);
    idx.push(pts.length - 1);
    for (const i of idx) corners.add(pts[i]);
    for (let k = 0; k < idx.length - 1; k++) {
      const a = idx[k], b = idx[k + 1];
      fitRun(pts, a, b, tangentAt(pts, a, 1), tangentAt(pts, b, -1), tol2, segs, 0);
    }
    return toContour(segs, false, corners);
  }
  const start = corner.indexOf(true);
  if (start < 0) {
    // smooth loop: one run around, tangent continuous at the seam
    const ring = [...pts, pts[0]];
    const n = pts.length;
    const t = norm(sub(pts[1], pts[n - 1]));
    fitRun(ring, 0, n, t, mul(t, -1), tol2, segs, 0);
    return toContour(segs, true, corners);
  }
  const ring = [...pts.slice(start), ...pts.slice(0, start), pts[start]];
  const flags = [...corner.slice(start), ...corner.slice(0, start), true];
  const idx: number[] = [];
  for (let i = 0; i < ring.length; i++) if (flags[i]) idx.push(i);
  for (const i of idx) corners.add(ring[i]);
  for (let k = 0; k < idx.length - 1; k++) {
    const a = idx[k], b = idx[k + 1];
    fitRun(ring, a, b, tangentAt(ring, a, 1), tangentAt(ring, b, -1), tol2, segs, 0);
  }
  return toContour(segs, true, corners);
}
