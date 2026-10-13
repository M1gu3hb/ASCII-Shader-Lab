/**
 * Small geometry helpers of the glyph editor (pure). Font units, y up. The affine `Matrix` is the
 * geometry lane's: x' = a·x + c·y + e, y' = b·x + d·y + f.
 */
import type { Contour, PathNode, Pt } from '../../doc';
import { flattenContour } from '../../compile';
import { rotateAbout } from '../../geom/ops';
import type { Matrix } from '../../geom/svgpath';

export interface Box { x0: number; y0: number; x1: number; y1: number }

export const applyM = (m: Matrix, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round1 = (v: number) => Math.round(v * 10) / 10;

export function cubicAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Segments of a contour: from node i to node i+1 (and back to 0 when closed). */
export const segmentCount = (c: Contour) => (c.nodes.length < 2 ? 0 : c.closed ? c.nodes.length : c.nodes.length - 1);

export interface Segment { a: PathNode; b: PathNode; curve: boolean; p0: Pt; p1: Pt; p2: Pt; p3: Pt }

export function segment(c: Contour, si: number): Segment {
  const a = c.nodes[si], b = c.nodes[(si + 1) % c.nodes.length];
  const curve = !!(a.ho || b.hi);
  return { a, b, curve, p0: a, p1: a.ho ?? a, p2: b.hi ?? b, p3: b };
}

export function segmentAt(c: Contour, si: number, t: number): Pt {
  const s = segment(c, si);
  return s.curve ? cubicAt(s.p0, s.p1, s.p2, s.p3, t) : lerp(s.p0, s.p3, t);
}

/** Signed area of a polygon (positive: counter-clockwise with y up). */
export function polyArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q.x * r.y - r.x * q.y; }
  return a / 2;
}

export const signedArea = (c: Contour) => polyArea(flattenContour({ ...c, closed: true }, 16));

export function boxOfPoints(ps: Pt[]): Box | null {
  if (!ps.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of ps) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}

export function unionBox(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

export const copyNode = (n: PathNode): PathNode => {
  const o: PathNode = { x: n.x, y: n.y };
  if (n.smooth) o.smooth = true;
  if (n.hi) o.hi = { x: n.hi.x, y: n.hi.y };
  if (n.ho) o.ho = { x: n.ho.x, y: n.ho.y };
  return o;
};
export const copyContour = (c: Contour): Contour => ({ closed: c.closed, nodes: c.nodes.map(copyNode) });

export function transformNode(n: PathNode, m: Matrix): PathNode {
  const o: PathNode = { ...applyM(m, n) };
  if (n.smooth) o.smooth = true;
  if (n.hi) o.hi = applyM(m, n.hi);
  if (n.ho) o.ho = applyM(m, n.ho);
  return o;
}

let rotSign = 0;
/**
 * Rotation by `deg` counter-clockwise (font units, y up) about (cx, cy). Built on the geometry lane's
 * rotateAbout, whose sign convention is read once from the matrix it returns, so the rotate handle
 * always turns the way the pointer goes.
 */
export function rotateCCW(deg: number, cx: number, cy: number): Matrix {
  if (!rotSign) rotSign = rotateAbout(90, 0, 0)[1] >= 0 ? 1 : -1;
  return rotateAbout(deg * rotSign, cx, cy);
}

/** Uniform part of a matrix's scale (for components, which only move and scale). */
export const matrixScale = (m: Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
