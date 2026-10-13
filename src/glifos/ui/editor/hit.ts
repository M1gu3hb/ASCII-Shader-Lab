/**
 * Hit testing of the editor (pure). Tolerances are screen pixels (the same reach at any zoom); geometry is
 * font units. Inside a contour means non-zero winding of its flattened outline, like the fill.
 */
import type { Anchor, Contour, Pt } from '../../doc';
import { flattenContour } from '../../compile';
import { cubicAt, dist, lerp, polyArea, segment, segmentCount, type Box } from './math';
import { toFont, toScreen, type View } from './view';

export interface NodeHit { ci: number; ni: number }
export interface HandleHit { ci: number; ni: number; which: 'hi' | 'ho' }
export interface SegmentHit { ci: number; si: number; t: number; d: number; p: Pt }

/** The node nearest to the screen point within `tol` px (the last drawn wins a tie: it is on top). */
export function hitNode(contours: Contour[], v: View, sp: Pt, tol: number): NodeHit | null {
  let best: NodeHit | null = null, bd = tol;
  contours.forEach((c, ci) => c.nodes.forEach((n, ni) => {
    const d = dist(toScreen(v, n), sp);
    if (d <= bd) { bd = d; best = { ci, ni }; }
  }));
  return best;
}

/** The handle nearest to the screen point within `tol` px; `shown` limits it to the handles on screen. */
export function hitHandle(contours: Contour[], v: View, sp: Pt, tol: number, shown: (ci: number, ni: number) => boolean = () => true): HandleHit | null {
  let best: HandleHit | null = null, bd = tol;
  contours.forEach((c, ci) => c.nodes.forEach((n, ni) => {
    if (!shown(ci, ni)) return;
    for (const which of ['hi', 'ho'] as const) {
      const h = n[which];
      if (!h || (h.x === n.x && h.y === n.y)) continue;
      const d = dist(toScreen(v, h), sp);
      if (d <= bd) { bd = d; best = { ci, ni, which }; }
    }
  }));
  return best;
}

/** The point of segment `si` nearest to `p` (font units): coarse samples, then refined around the best. */
export function nearestOnSegment(c: Contour, si: number, p: Pt): { t: number; d: number; p: Pt } {
  const s = segment(c, si);
  const at = (t: number) => (s.curve ? cubicAt(s.p0, s.p1, s.p2, s.p3, t) : lerp(s.p0, s.p3, t));
  if (!s.curve) {
    const dx = s.p3.x - s.p0.x, dy = s.p3.y - s.p0.y, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.min(1, Math.max(0, ((p.x - s.p0.x) * dx + (p.y - s.p0.y) * dy) / L2)) : 0;
    const q = at(t);
    return { t, d: dist(q, p), p: q };
  }
  let bt = 0, bd = Infinity;
  const N = 48;
  for (let i = 0; i <= N; i++) { const t = i / N, d = dist(at(t), p); if (d < bd) { bd = d; bt = t; } }
  let step = 1 / N;
  for (let k = 0; k < 40; k++) {
    step /= 2;
    for (const t of [bt - step, bt + step]) {
      if (t < 0 || t > 1) continue;
      const d = dist(at(t), p);
      if (d < bd) { bd = d; bt = t; }
    }
  }
  return { t: bt, d: bd, p: at(bt) };
}

/** The segment passing nearest to the screen point within `tol` px. */
export function hitSegment(contours: Contour[], v: View, sp: Pt, tol: number): SegmentHit | null {
  const p = toFont(v, sp), tolU = tol / v.s;
  let best: SegmentHit | null = null;
  contours.forEach((c, ci) => {
    for (let si = 0; si < segmentCount(c); si++) {
      const r = nearestOnSegment(c, si, p);
      if (r.d <= tolU && (!best || r.d < best.d)) best = { ci, si, t: r.t, d: r.d, p: r.p };
    }
  });
  return best;
}

/** Winding number of a polygon around a point (non-zero: inside). */
export function winding(poly: Pt[], p: Pt): number {
  let w = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (a.y <= p.y) {
      if (b.y > p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) > 0) w++;
    } else if (b.y <= p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) < 0) w--;
  }
  return w;
}

/** Inside the fill of several contours together (non-zero winding: a contour turning the other way cuts a hole). */
export function insideFill(contours: Contour[], p: Pt): boolean {
  let w = 0;
  for (const c of contours) if (c.closed && c.nodes.length > 1) w += winding(flattenContour(c, 16), p);
  return w !== 0;
}

/**
 * The contour under a screen point: its outline within `tol` px, else the smallest closed contour that
 * encloses the point (so a click inside a counter picks the counter).
 */
export function hitContour(contours: Contour[], v: View, sp: Pt, tol: number): number | null {
  const seg = hitSegment(contours, v, sp, tol);
  if (seg) return seg.ci;
  const p = toFont(v, sp);
  let best: number | null = null, ba = Infinity;
  contours.forEach((c, ci) => {
    if (!c.closed || c.nodes.length < 2) return;
    const poly = flattenContour(c, 16);
    if (winding(poly, p) === 0) return;
    const a = Math.abs(polyArea(poly));
    if (a < ba) { ba = a; best = ci; }
  });
  return best;
}

/** Nodes inside a box (font units) as "ci:ni" keys. */
export function marquee(contours: Contour[], box: Box): string[] {
  const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1), y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
  const out: string[] = [];
  contours.forEach((c, ci) => c.nodes.forEach((n, ni) => { if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) out.push(`${ci}:${ni}`); }));
  return out;
}

export function hitAnchor(anchors: Anchor[], v: View, sp: Pt, tol: number): number | null {
  let best: number | null = null, bd = tol;
  anchors.forEach((a, i) => { const d = dist(toScreen(v, a), sp); if (d <= bd) { bd = d; best = i; } });
  return best;
}

/** A guide line within `tol` px of the screen point. */
export function hitGuide(guides: Array<{ axis: 'x' | 'y'; at: number }>, v: View, sp: Pt, tol: number): number | null {
  let best: number | null = null, bd = tol;
  guides.forEach((g, i) => {
    const d = g.axis === 'x' ? Math.abs(v.ox + g.at * v.s - sp.x) : Math.abs(v.oy - g.at * v.s - sp.y);
    if (d <= bd) { bd = d; best = i; }
  });
  return best;
}

export type BoxHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot';

/** Screen positions of the transform box's handles (the rotate handle sits `rotGap` px above the top edge). */
export function boxHandles(box: Box, v: View, rotGap = 26): Array<{ id: BoxHandle; p: Pt }> {
  const a = toScreen(v, { x: box.x0, y: box.y1 }), b = toScreen(v, { x: box.x1, y: box.y0 });
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return [
    { id: 'nw', p: { x: a.x, y: a.y } }, { id: 'n', p: { x: mx, y: a.y } }, { id: 'ne', p: { x: b.x, y: a.y } }, { id: 'e', p: { x: b.x, y: my } },
    { id: 'se', p: { x: b.x, y: b.y } }, { id: 's', p: { x: mx, y: b.y } }, { id: 'sw', p: { x: a.x, y: b.y } }, { id: 'w', p: { x: a.x, y: my } },
    { id: 'rot', p: { x: mx, y: a.y - rotGap } },
  ];
}

export function hitBoxHandle(box: Box, v: View, sp: Pt, tol: number): BoxHandle | null {
  let best: BoxHandle | null = null, bd = tol;
  for (const h of boxHandles(box, v)) { const d = dist(h.p, sp); if (d <= bd) { bd = d; best = h.id; } }
  return best;
}

/** Inside a box given in font units, with a margin in screen px. */
export function inBox(box: Box, v: View, sp: Pt, pad = 0): boolean {
  const a = toScreen(v, { x: box.x0, y: box.y1 }), b = toScreen(v, { x: box.x1, y: box.y0 });
  return sp.x >= a.x - pad && sp.x <= b.x + pad && sp.y >= a.y - pad && sp.y <= b.y + pad;
}
