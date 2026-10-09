/**
 * Rectángulo, Elipse and Lápiz (pure). New shapes turn counter-clockwise (y up), like the outer contours
 * of a PostScript outline.
 */
import type { Contour, Pt, Terminal } from '../../doc';
import { fitCurve, simplify } from '../../geom/fit';
import { strokePolyline } from '../../geom/stroke';
import type { Box } from './math';

/** Circle approximation: handle length / radius for a quarter arc. */
export const KAPPA = 0.5523;

/**
 * The box a shape drag covers: from the press to the pointer; Shift makes it square, Alt grows it from
 * the press as its centre.
 */
export function dragBox(a: Pt, b: Pt, square: boolean, fromCenter: boolean): Box {
  let dx = b.x - a.x, dy = b.y - a.y;
  if (square) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * m;
    dy = Math.sign(dy || 1) * m;
  }
  const x0 = fromCenter ? a.x - dx : a.x, y0 = fromCenter ? a.y - dy : a.y, x1 = a.x + dx, y1 = a.y + dy;
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

export function rectContour(b: Box): Contour {
  return { closed: true, nodes: [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }] };
}

/** An ellipse in the box: four smooth nodes (right, top, left, bottom) with handles at KAPPA of the radius. */
export function ellipseContour(b: Box): Contour {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, rx = (b.x1 - b.x0) / 2, ry = (b.y1 - b.y0) / 2;
  const kx = rx * KAPPA, ky = ry * KAPPA;
  return {
    closed: true,
    nodes: [
      { x: cx + rx, y: cy, smooth: true, hi: { x: cx + rx, y: cy - ky }, ho: { x: cx + rx, y: cy + ky } },
      { x: cx, y: cy + ry, smooth: true, hi: { x: cx + kx, y: cy + ry }, ho: { x: cx - kx, y: cy + ry } },
      { x: cx - rx, y: cy, smooth: true, hi: { x: cx - rx, y: cy + ky }, ho: { x: cx - rx, y: cy - ky } },
      { x: cx, y: cy - ry, smooth: true, hi: { x: cx - kx, y: cy - ry }, ho: { x: cx + kx, y: cy - ry } },
    ],
  };
}

/**
 * A freehand line into outlines. `closed`: the drawn loop itself becomes one closed contour. Otherwise
 * the line is simplified and stroked with the given width (an outline around it), and each outline
 * without curves is fitted into curves (corners kept).
 */
export function pencilContours(points: Pt[], o: { width: number; closed: boolean; tolerance: number; cap: Terminal }): Contour[] {
  const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  if (pts.length < 2) return [];
  if (o.closed) {
    if (pts.length < 3) return [];
    const c = fitCurve(simplify(pts, o.tolerance, true), true, o.tolerance, 60);
    return c.nodes.length >= 2 ? [{ ...c, closed: true }] : [];
  }
  const line = simplify(pts, o.tolerance, false);
  const outlines = strokePolyline(line.length >= 2 ? line : [pts[0], pts[pts.length - 1]], { width: o.width, cap: o.cap, join: 'redondo' });
  return outlines.flatMap(c => {
    if (c.nodes.length < 2) return [];
    if (c.nodes.some(n => n.hi || n.ho) || c.nodes.length < 8) return [{ ...c, closed: true }];
    const f = fitCurve(c.nodes.map(n => ({ x: n.x, y: n.y })), true, o.tolerance, 60);
    return f.nodes.length >= 2 ? [{ ...f, closed: true }] : [];
  });
}
