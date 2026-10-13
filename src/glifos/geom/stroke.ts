/**
 * Centrelines → outlines. A stroke is drawn with a broad-nib pen whose thickness depends on the direction it
 * travels: with contrast c (thin/thick, 0.15..1) and the pen's thin direction `angle`,
 *
 *   thickness(θ) = width · (c + (1 − c) · |sin(θ − angle)|)
 *
 * so at angle 0 a vertical stroke (θ = 90°) is `width` thick and a horizontal one `c · width`, as in most text
 * faces. Each stroke becomes one ring (both sides of the pen plus caps and joins) that may cross itself on the
 * inner side of tight turns; that ring is read with the non-zero rule and cleaned by a union, which is what
 * strokePolyline returns. Pure: no DOM.
 */
import type { Contour, Pt } from '../doc';
import { geometryToContours, unionPolygons } from './ops';

export type Cap = 'recto' | 'redondo' | 'cuna';
export type Join = 'redondo' | 'inglete';

export interface StrokeOptions {
  /** Thickest stroke, font units. */
  width: number;
  closed?: boolean;
  /** recto: cut square at the end point. redondo: a half disc. cuna: a wedge (flared and cut at an angle). */
  cap?: Cap;
  /** How sharp turns are joined on their outer side. */
  join?: Join;
  /** Thin / thick ratio, 0.15..1 (1 = monoline). */
  contrast?: number;
  /** Direction of the pen's thinnest stroke, degrees (0 = horizontal strokes are the thin ones). */
  angle?: number;
  /** Width multiplier along the stroke, t = 0..1 of its length. */
  widthAt?: (t: number) => number;
  /** Fitting tolerance of strokePolyline's result (font units, 0.5 by default). */
  tolerance?: number;
}

/** Thickness of the pen travelling in direction `theta` (radians). */
export function penThickness(width: number, contrast: number, angleDeg: number, theta: number): number {
  const c = Math.max(0.15, Math.min(1, contrast));
  return width * (c + (1 - c) * Math.abs(Math.sin(theta - (angleDeg * Math.PI) / 180)));
}

/** Turns below this are smooth (offset lines meet); above it the join style decides the outer side. */
const SMOOTH = (25 * Math.PI) / 180;
const MITER_LIMIT = 3;
/** How far a wedge terminal flares (× width) and by how much (× half-width). */
export const WEDGE = { length: 1.2, flare: 0.35, cut: 0.6 } as const;

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Pt) => Math.hypot(a.x, a.y);

function intersect(p: Pt, q: Pt, r: Pt, s: Pt): { pt: Pt; t: number; u: number } | null {
  const d1 = sub(q, p), d2 = sub(s, r);
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-12) return null;
  const w = sub(r, p);
  const t = (w.x * d2.y - w.y * d2.x) / den, u = (w.x * d1.y - w.y * d1.x) / den;
  return { pt: { x: p.x + d1.x * t, y: p.y + d1.y * t }, t, u };
}

/** Points on an arc around c from a to b turning `sweep` radians (sign = direction), radius interpolated. */
function arc(c: Pt, a: Pt, b: Pt, sweep: number, out: Pt[]) {
  const a0 = Math.atan2(a.y - c.y, a.x - c.x), r0 = len(sub(a, c)), r1 = len(sub(b, c));
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
  out.push(a);
  for (let k = 1; k < n; k++) {
    const t = k / n, ang = a0 + sweep * t, r = r0 + (r1 - r0) * t;
    out.push({ x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r });
  }
  out.push(b);
}

/** A round or square dot of diameter d centred at c (counter-clockwise). */
export function dotPolygon(c: Pt, d: number, shape: 'redondo' | 'recto'): Pt[] {
  const r = d / 2;
  if (shape === 'recto') return [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y - r }, { x: c.x + r, y: c.y + r }, { x: c.x - r, y: c.y + r }];
  return Array.from({ length: 32 }, (_, k) => ({ x: c.x + r * Math.cos((k * Math.PI) / 16), y: c.y + r * Math.sin((k * Math.PI) / 16) }));
}

/** Extra points near the ends so a flared (wedge) terminal has room to widen. */
function refineEnds(pts: Pt[], flareLen: number): Pt[] {
  const out: Pt[] = [pts[0]];
  const total = pts.slice(1).reduce((s, p, i) => s + len(sub(p, pts[i])), 0);
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = len(sub(b, a));
    const nearStart = s < flareLen, nearEnd = s + l > total - flareLen;
    if (nearStart || nearEnd) {
      const k = Math.min(12, Math.ceil(l / (flareLen / 5)));
      for (let j = 1; j < k; j++) out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
    }
    out.push(b);
    s += l;
  }
  return out;
}

/**
 * The outline of one stroke as a single ring (font units) with both sides of the pen, caps and joins, to be read
 * with the non-zero rule: it may cross itself inside the ink (tight turns, crossing centrelines) and still fill
 * exactly the area the pen sweeps. A single point gives a dot; empty input gives [].
 */
export function strokeRings(points: Pt[], o: StrokeOptions): Pt[][] {
  let pts: Pt[] = [];
  for (const p of points) if (Number.isFinite(p.x) && Number.isFinite(p.y) && (!pts.length || len(sub(p, pts[pts.length - 1])) > 1e-6)) pts.push(p);
  const closed = !!o.closed && pts.length >= 3;
  if (closed && len(sub(pts[0], pts[pts.length - 1])) < 1e-6) pts.pop();
  if (!pts.length) return [];
  const width = Math.max(1e-3, o.width), contrast = o.contrast ?? 1, angle = o.angle ?? 0, cap = o.cap ?? 'recto', join = o.join ?? 'inglete';
  if (pts.length === 1) return [dotPolygon(pts[0], width, cap === 'recto' ? 'recto' : 'redondo')];
  const flareLen = WEDGE.length * width;
  if (cap === 'cuna' && !closed) pts = refineEnds(pts, flareLen);
  const n = pts.length, m = closed ? n : n - 1;
  const d: Pt[] = [], nr: Pt[] = [], th: number[] = [];
  for (let i = 0; i < m; i++) {
    const v = sub(pts[(i + 1) % n], pts[i]), l = len(v);
    d.push({ x: v.x / l, y: v.y / l });
    nr.push({ x: -v.y / l, y: v.x / l });
    th.push(Math.atan2(v.y, v.x));
  }
  // arc length at each vertex, for widthAt and the wedge flare
  const s: number[] = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + len(sub(pts[i], pts[i - 1])));
  const L = closed ? s[n - 1] + len(sub(pts[0], pts[n - 1])) : s[n - 1];
  const mult = (j: number) => {
    let k = o.widthAt ? Math.max(0.05, o.widthAt(L > 0 ? s[j] / L : 0)) : 1;
    if (cap === 'cuna' && !closed) {
      const e = Math.min(s[j], L - s[j]);
      k *= 1 + WEDGE.flare * Math.max(0, 1 - e / flareLen) ** 2;
    }
    return k;
  };
  const turnAt = (j: number) => {
    const u = (j - 1 + m) % m, v = j % m;
    return Math.atan2(d[u].x * d[v].y - d[u].y * d[v].x, d[u].x * d[v].x + d[u].y * d[v].y);
  };
  const isJoint = (j: number) => closed || (j > 0 && j < n - 1);
  const corner = (j: number) => !isJoint(j) || Math.abs(turnAt(j)) > SMOOTH;
  // half-width of the pen: at a smooth vertex it follows the tangent there, at a corner each segment keeps its own
  const half = (j: number, seg: number) => {
    if (corner(j)) return (penThickness(width, contrast, angle, th[seg]) / 2) * mult(j);
    const u = (j - 1 + m) % m, v = j % m;
    return (penThickness(width, contrast, angle, Math.atan2(d[u].y + d[v].y, d[u].x + d[v].x)) / 2) * mult(j);
  };
  const A: Array<{ L: Pt; R: Pt }> = [], B: Array<{ L: Pt; R: Pt }> = [];
  for (let i = 0; i < m; i++) {
    const p = pts[i], q = pts[(i + 1) % n], a = half(i, i), b = half((i + 1) % n, i);
    A.push({ L: { x: p.x + nr[i].x * a, y: p.y + nr[i].y * a }, R: { x: p.x - nr[i].x * a, y: p.y - nr[i].y * a } });
    B.push({ L: { x: q.x + nr[i].x * b, y: q.y + nr[i].y * b }, R: { x: q.x - nr[i].x * b, y: q.y - nr[i].y * b } });
  }
  /** Points of the outer side of joint j (from the end of the incoming offset to the start of the outgoing one). */
  const outerJoin = (j: number, side: 'L' | 'R', turn: number, out: Pt[]) => {
    const u = (j - 1 + m) % m, v = j % m, p = pts[j % n];
    const bu = B[u][side], av = A[v][side];
    const x = intersect(A[u][side], bu, av, B[v][side]);
    if (Math.abs(turn) < SMOOTH && x) { out.push(x.pt); return; }
    // the outer offset turns with the centreline: same sweep as the turn
    if (join === 'redondo') { arc(p, bu, av, turn, out); return; }
    const hw = Math.max(len(sub(bu, p)), len(sub(av, p)));
    if (x && len(sub(x.pt, p)) <= MITER_LIMIT * hw) out.push(x.pt);
    else out.push(bu, av);
  };
  const joint = (j: number, side: 'L' | 'R', out: Pt[]) => {
    const u = (j - 1 + m) % m, v = j % m;
    const bu = B[u][side], av = A[v][side];
    const turn = turnAt(j);
    if (Math.abs(turn) < 1e-4) { out.push({ x: (bu.x + av.x) / 2, y: (bu.y + av.y) / 2 }); return; }
    if (side === (turn > 0 ? 'R' : 'L')) { outerJoin(j, side, turn, out); return; }
    // inner side: where the offsets cross within the near halves of both segments; when the turn is tighter
    // than the pen (the side would fold over and leave a false hole) the ring goes through the centreline point
    // instead, which the non-zero rule fills correctly
    const x = intersect(A[u][side], bu, av, B[v][side]);
    if (x && x.t >= 0.5 && x.u <= 0.5) out.push(x.pt);
    else out.push(bu, pts[j % n], av);
  };
  const endCap: Pt[] = [], startCap: Pt[] = [];
  if (!closed) {
    const pe = pts[n - 1], de = d[m - 1], p0 = pts[0], d0 = d[0];
    if (cap === 'redondo') {
      arc(pe, B[m - 1].L, B[m - 1].R, -Math.PI, endCap);
      arc(p0, A[0].R, A[0].L, -Math.PI, startCap);
    } else if (cap === 'cuna') {
      // the upper corner (the right one when level) reaches further: an angled cut
      const ext = (q: Pt, dir: Pt, h: number) => ({ x: q.x + dir.x * h * WEDGE.cut, y: q.y + dir.y * h * WEDGE.cut });
      const upper = (l: Pt, r: Pt) => (l.y > r.y + 1e-6 || (Math.abs(l.y - r.y) <= 1e-6 && l.x > r.x) ? 'L' : 'R');
      const he = len(sub(B[m - 1].L, pe)), h0 = len(sub(A[0].L, p0));
      if (upper(B[m - 1].L, B[m - 1].R) === 'L') endCap.push(B[m - 1].L, ext(B[m - 1].L, de, he), B[m - 1].R);
      else endCap.push(B[m - 1].L, ext(B[m - 1].R, de, he), B[m - 1].R);
      const back = { x: -d0.x, y: -d0.y };
      if (upper(A[0].L, A[0].R) === 'L') startCap.push(A[0].R, ext(A[0].L, back, h0), A[0].L);
      else startCap.push(A[0].R, ext(A[0].R, back, h0), A[0].L);
    }
  }
  const Lc: Pt[] = [], Rc: Pt[] = [];
  if (closed) for (let j = 0; j < n; j++) { joint(j, 'L', Lc); joint(j, 'R', Rc); }
  else {
    Lc.push(A[0].L);
    Rc.push(A[0].R);
    for (let j = 1; j < n - 1; j++) { joint(j, 'L', Lc); joint(j, 'R', Rc); }
    Lc.push(B[m - 1].L);
    Rc.push(B[m - 1].R);
  }
  // one ring: closed strokes go round the left loop forward and the right loop backward, joined by a seam
  // that cancels out under the non-zero rule
  if (closed) return [[...Lc, Lc[0], Rc[0], ...Rc.slice(1).reverse(), Rc[0]]];
  return [[...Lc, ...endCap, ...Rc.reverse(), ...startCap]];
}

/**
 * Expands a centreline into closed outline contours (no self-intersections: the pen's outline is united with
 * itself and its curves fitted). Returns [] for empty input.
 */
export function strokePolyline(points: Pt[], o: StrokeOptions): Contour[] {
  const rings = strokeRings(points, o);
  if (!rings.length) return [];
  return geometryToContours(unionPolygons(rings), o.tolerance ?? 0.5);
}
