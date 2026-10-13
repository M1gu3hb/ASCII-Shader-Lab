/**
 * Operations on contours (font units, y up): bounding boxes, affine transforms, orientation and boolean path
 * operations (unir, restar, intersecar, excluir) for the glyph editor and the assistant. Pure: no DOM.
 *
 * Boolean operations run on polygons (polygon-clipping, MIT) and rebuild curves with fitCurve: the result has
 * the same shape within the tolerance, but its nodes are new (a deliberate, documented limitation: an
 * operation re-draws the curves; corners are kept as corners).
 */
import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Polygon, Ring } from 'polygon-clipping';
import type { Contour, PathNode, Pt } from '../doc';
import { flattenContour } from '../compile';
import { fitCurve } from './fit';
import { applyMatrix, multiply, type Matrix } from './svgpath';

export type { Matrix } from './svgpath';
export { IDENTITY, multiply, applyMatrix } from './svgpath';

export interface Box { x0: number; y0: number; x1: number; y1: number }

/* ------------------------------------------------------------------ */
/* Bounding box                                                        */
/* ------------------------------------------------------------------ */

/** Parameters in (0, 1) where one coordinate of a cubic has a zero derivative. */
function extremaT(a: number, b: number, c: number, d: number): number[] {
  // derivative / 3: (b - a)(1-t)² + 2(c - b)(1-t)t + (d - c)t²  →  A t² + B t + C
  const A = -a + 3 * b - 3 * c + d, B = 2 * (a - 2 * b + c), C = b - a;
  const out: number[] = [];
  if (Math.abs(A) < 1e-12) { if (Math.abs(B) > 1e-12) out.push(-C / B); }
  else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) { const s = Math.sqrt(disc); out.push((-B + s) / (2 * A), (-B - s) / (2 * A)); }
  }
  return out.filter(t => t > 0 && t < 1);
}

const cubicAt = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

/** Tight bounding box of the contours (curve extrema included, not just the handles), or null when empty. */
export function bboxOf(cs: Contour[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (x: number, y: number) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const c of cs) {
    const ns = c.nodes;
    for (const n of ns) take(n.x, n.y);
    const segs = c.closed ? ns.length : ns.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = ns[i], b = ns[(i + 1) % ns.length];
      if (!a.ho && !b.hi) continue;
      const p1 = a.ho ?? a, p2 = b.hi ?? b;
      for (const t of extremaT(a.x, p1.x, p2.x, b.x)) take(cubicAt(a.x, p1.x, p2.x, b.x, t), cubicAt(a.y, p1.y, p2.y, b.y, t));
      for (const t of extremaT(a.y, p1.y, p2.y, b.y)) take(cubicAt(a.x, p1.x, p2.x, b.x, t), cubicAt(a.y, p1.y, p2.y, b.y, t));
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/* ------------------------------------------------------------------ */
/* Transforms                                                          */
/* ------------------------------------------------------------------ */

export const translate = (dx: number, dy: number): Matrix => [1, 0, 0, 1, dx, dy];
export const scaleAbout = (sx: number, sy: number, cx: number, cy: number): Matrix => [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];
export function rotateAbout(deg: number, cx: number, cy: number): Matrix {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return multiply(multiply(translate(cx, cy), [c, s, -s, c, 0, 0]), translate(-cx, -cy));
}
/** Horizontal shear that leans the drawing right for positive degrees, keeping the line y = cy in place. */
export const skewX = (deg: number, cy = 0): Matrix => { const t = Math.tan((deg * Math.PI) / 180); return [1, 0, t, 1, -t * cy, 0]; };
/** Mirror across the vertical line x = cx (left ↔ right). */
export const mirrorX = (cx: number): Matrix => [-1, 0, 0, 1, 2 * cx, 0];
/** Mirror across the horizontal line y = cy (up ↔ down). */
export const mirrorY = (cy: number): Matrix => [1, 0, 0, -1, 0, 2 * cy];

/**
 * Applies a matrix to every node and handle. A matrix that mirrors (negative determinant) also reverses each
 * contour, so outer contours stay counter-clockwise and holes clockwise: the fill does not flip when the
 * mirrored copy meets other contours.
 */
export function transformContours(cs: Contour[], m: Matrix): Contour[] {
  const flip = m[0] * m[3] - m[1] * m[2] < 0;
  return cs.map(c => {
    const out: Contour = {
      closed: c.closed,
      nodes: c.nodes.map(n => {
        const o: PathNode = applyMatrix(m, n);
        if (n.smooth) o.smooth = true;
        if (n.hi) o.hi = applyMatrix(m, n.hi);
        if (n.ho) o.ho = applyMatrix(m, n.ho);
        return o;
      }),
    };
    return flip ? reverseContour(out) : out;
  });
}

/* ------------------------------------------------------------------ */
/* Orientation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Signed area (positive = counter-clockwise in y-up font units). Exact for cubic segments: the integrand of
 * Green's formula is a degree-5 polynomial, which 3-point Gauss–Legendre integrates exactly.
 */
export function signedArea(c: Contour): number {
  const ns = c.nodes;
  if (ns.length < 2) return 0;
  const G = [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]];
  let s = 0;
  for (let i = 0; i < ns.length; i++) {
    const a = ns[i], b = ns[(i + 1) % ns.length];
    if (!a.ho && !b.hi) { s += a.x * b.y - b.x * a.y; continue; }
    const p1 = a.ho ?? a, p2 = b.hi ?? b;
    for (const [g, w] of G) {
      const t = (g + 1) / 2, u = 1 - t;
      const x = u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x;
      const y = u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y;
      const dx = 3 * (u * u * (p1.x - a.x) + 2 * u * t * (p2.x - p1.x) + t * t * (b.x - p2.x));
      const dy = 3 * (u * u * (p1.y - a.y) + 2 * u * t * (p2.y - p1.y) + t * t * (b.y - p2.y));
      s += (w / 2) * (x * dy - y * dx);
    }
  }
  return s / 2;
}

/** The same contour drawn the other way (same start node for closed contours). */
export function reverseContour(c: Contour): Contour {
  const swap = (n: PathNode): PathNode => {
    const o: PathNode = { x: n.x, y: n.y };
    if (n.smooth) o.smooth = true;
    if (n.ho) o.hi = { ...n.ho };
    if (n.hi) o.ho = { ...n.hi };
    return o;
  };
  const ns = c.nodes.map(swap).reverse();
  if (c.closed && ns.length > 1) ns.unshift(ns.pop()!);
  return { closed: c.closed, nodes: ns };
}

/** Even-odd point in polygon. */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Winding number of a closed polygon around p (non-zero rule). */
function winding(p: Pt, poly: Pt[]): number {
  let w = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const cr = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
    if (a.y <= p.y) { if (b.y > p.y && cr > 0) w++; }
    else if (b.y <= p.y && cr < 0) w--;
  }
  return w;
}

const polyArea = (p: Pt[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return s / 2; };

/** A point just inside the polygon near its first edge (on the side its orientation fills). */
function probe(poly: Pt[]): Pt {
  const area = polyArea(poly);
  // the midpoint of the longest edge, nudged to the inner side, is safe even for thin shapes
  let best = 0, bl = -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], l = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (l > bl) { bl = l; best = i; }
  }
  const a = poly[best], b = poly[(best + 1) % poly.length], L = Math.sqrt(bl) || 1;
  const e = Math.min(1e-3 * L, 1e-2) * (area >= 0 ? 1 : -1);
  return { x: (a.x + b.x) / 2 - ((b.y - a.y) / L) * e, y: (a.y + b.y) / 2 + ((b.x - a.x) / L) * e };
}

interface Role { poly: Pt[]; area: number; hole: boolean; depth: number }

/**
 * What each closed contour is under a fill rule: outer boundary of ink or boundary of a hole.
 * evenodd: by nesting depth. nonzero: from the winding the other contours give just inside it.
 */
function roles(cs: Contour[], rule: 'evenodd' | 'nonzero'): Role[] {
  const polys = cs.map(c => flattenContour(c, 16));
  return polys.map((poly, i) => {
    const area = polyArea(poly);
    if (poly.length < 3 || Math.abs(area) < 1e-12) return { poly, area, hole: false, depth: 0 };
    const p = probe(poly);
    let depth = 0, w = 0;
    for (let j = 0; j < polys.length; j++) {
      if (j === i || polys[j].length < 3) continue;
      if (pointInPolygon(p, polys[j])) depth++;
      w += winding(p, polys[j]);
    }
    const own = area > 0 ? 1 : -1;
    const hole = rule === 'evenodd' ? depth % 2 === 1 : w !== 0 && w + own === 0;
    return { poly, area, hole, depth };
  });
}

/**
 * Outer contours counter-clockwise (positive area), holes clockwise. Holes are found by nesting depth
 * (even-odd: what most drawings mean) or, with `rule = 'nonzero'`, from the winding of the authored directions.
 * Open contours are kept as they are.
 */
export function normalizeOrientation(cs: Contour[], rule: 'evenodd' | 'nonzero' = 'evenodd'): Contour[] {
  const closed = cs.filter(c => c.closed && c.nodes.length > 1);
  const r = roles(closed, rule);
  const fixed = new Map<Contour, Contour>();
  closed.forEach((c, i) => {
    const area = signedArea(c);
    const want = r[i].hole ? -1 : 1;
    fixed.set(c, area * want < 0 ? reverseContour(c) : c);
  });
  return cs.map(c => fixed.get(c) ?? c);
}

/* ------------------------------------------------------------------ */
/* Boolean operations                                                  */
/* ------------------------------------------------------------------ */

export type PathOp = 'unir' | 'restar' | 'intersecar' | 'excluir';

const toRing = (p: Pt[]): Ring => p.map(q => [q.x, q.y] as [number, number]);
const fromRing = (r: Ring): Pt[] => {
  const pts = r.map(([x, y]) => ({ x, y }));
  if (pts.length > 1) { const a = pts[0], z = pts[pts.length - 1]; if (a.x === z.x && a.y === z.y) pts.pop(); }
  return pts;
};

/**
 * Closed contours as polygon-clipping geometry with the non-zero rule the glyphs are drawn with: each hole is
 * given to the smallest outer contour that holds it, so islands inside holes stay ink.
 */
function toGeometry(cs: Contour[]): MultiPolygon {
  const closed = cs.filter(c => c.closed && c.nodes.length > 2 || (c.closed && c.nodes.length === 2 && c.nodes.some(n => n.hi || n.ho)));
  const r = roles(closed, 'nonzero').filter(x => x.poly.length >= 3 && Math.abs(x.area) > 1e-9);
  const outers = r.filter(x => !x.hole), holes = r.filter(x => x.hole);
  const polys: Polygon[] = outers.map(o => [toRing(o.poly)]);
  for (const h of holes) {
    const p = h.poly[0];
    let best = -1, ba = Infinity;
    outers.forEach((o, i) => { const a = Math.abs(o.area); if (a > Math.abs(h.area) && a < ba && pointInPolygon(p, o.poly)) { ba = a; best = i; } });
    if (best >= 0) polys[best].push(toRing(h.poly));
  }
  return polys;
}

/** Runs a polygon-clipping operation; on its rare numeric failures, retries once on a coarser grid. */
function clip(op: 'union' | 'difference' | 'intersection' | 'xor', a: MultiPolygon, ...rest: MultiPolygon[]): MultiPolygon {
  try {
    return polygonClipping[op](a, ...rest);
  } catch {
    const snap = (g: MultiPolygon): MultiPolygon => g.map(p => p.map(r => r.map(([x, y]) => [Math.round(x * 64) / 64, Math.round(y * 64) / 64] as [number, number])));
    try { return polygonClipping[op](snap(a), ...rest.map(snap)); }
    catch { throw new Error('No se pudo calcular la operación de trazo: la geometría es demasiado irregular. Simplifica los contornos e inténtalo de nuevo.'); }
  }
}

/**
 * polygon-clipping output → fitted contours (outer counter-clockwise, holes clockwise). Slivers smaller than
 * a few square tolerances (numeric dust where many edges meet) are dropped.
 */
export function geometryToContours(g: MultiPolygon, tolerance = 1, cornerDeg = 50): Contour[] {
  const out: Contour[] = [];
  const dust = 4 * tolerance * tolerance;
  for (const poly of g) {
    poly.forEach((ring, k) => {
      const pts = fromRing(ring);
      if (pts.length < 3 || Math.abs(polyArea(pts)) < dust) return;
      let c = fitCurve(pts, true, tolerance, cornerDeg);
      if (c.nodes.length < 2) return;
      const a = signedArea(c);
      if ((k === 0 && a < 0) || (k > 0 && a > 0)) c = reverseContour(c);
      out.push(c);
    });
  }
  return out;
}

/** Union of raw polygons (each a ring read with the non-zero rule) → polygon-clipping geometry. */
export function unionPolygons(polys: Array<Pt[] | Pt[][]>): MultiPolygon {
  const geoms: Polygon[] = polys
    .map(p => (Array.isArray(p[0]) ? (p as Pt[][]).map(toRing) : [toRing(p as Pt[])]))
    .filter(p => p.length && p[0].length >= 3);
  if (!geoms.length) return [];
  return clip('union', geoms as MultiPolygon);
}

/** The part of a polygon-clipping geometry between two heights (a flat cut, e.g. a diagonal stroke at the baseline). */
export function clipToBand(g: MultiPolygon, lo: number, hi: number): MultiPolygon {
  if (!g.length) return g;
  const W = 1e6;
  return clip('intersection', g, [[[[-W, lo], [W, lo], [W, hi], [-W, hi]]]]);
}

const OPS: Record<PathOp, 'union' | 'difference' | 'intersection' | 'xor'> = { unir: 'union', restar: 'difference', intersecar: 'intersection', excluir: 'xor' };

/**
 * Boolean operation between two sets of closed contours (each read with the non-zero rule, so overlapping
 * contours of one operand count once). Curves are flattened, clipped and fitted again within `tolerance`
 * (font units, 1 by default): nodes change, the shape does not beyond the tolerance.
 */
export function pathOp(subject: Contour[], clipCs: Contour[], op: PathOp, opts: { tolerance?: number } = {}): Contour[] {
  const tol = opts.tolerance ?? 1;
  const a = toGeometry(subject), b = toGeometry(clipCs);
  // each operand is first united with itself: overlaps inside one operand never count twice (or as holes)
  const A = a.length ? clip('union', a) : [], B = b.length ? clip('union', b) : [];
  let g: MultiPolygon;
  if (!A.length && !B.length) return [];
  if (!A.length) g = op === 'unir' || op === 'excluir' ? B : [];
  else if (!B.length) g = op === 'intersecar' ? [] : A;
  else g = clip(OPS[op], A, B);
  return geometryToContours(g, tol);
}

/** One glyph's contours without overlaps (curves re-fitted; open contours dropped). */
export function unionAll(cs: Contour[], opts: { tolerance?: number } = {}): Contour[] {
  const g = toGeometry(cs);
  return g.length ? geometryToContours(clip('union', g), opts.tolerance ?? 1) : [];
}

/** «Quitar solapamientos»: same as unionAll (the curves are fitted again, so the nodes change). */
export const removeOverlaps = unionAll;
