/**
 * «Ajustar a» (pure): a point moved, clicked or drawn sticks to the nearest node, guide or metric line
 * within a reach given in screen pixels (the same at any zoom); what nothing catches falls on the grid
 * when the grid is on. The result says what caught it, so the canvas can draw the snap line.
 */
import type { Glyph, GlyphDoc, Pt } from '../../doc';
import { dist } from './math';

export interface SnapLine { axis: 'x' | 'y'; at: number; kind: 'guia' | 'metrica' | 'nodo' }
export interface SnapTargets {
  /** Vertical lines (x = at) and horizontal lines (y = at). */
  xs: Array<{ at: number; kind: 'guia' | 'metrica' }>;
  ys: Array<{ at: number; kind: 'guia' | 'metrica' }>;
  points: Pt[];
}
export interface SnapOptions {
  /** Reach in screen px. */
  tolPx: number;
  /** View scale (px per font unit). */
  scale: number;
  /** Grid step in font units; 0 or absent: no grid. */
  grid?: number;
}
export interface SnapResult { p: Pt; lines: SnapLine[]; node?: Pt; grid: boolean }

export const NO_TARGETS: SnapTargets = { xs: [], ys: [], points: [] };

function nearestLine(v: number, lines: SnapTargets['xs'], tol: number) {
  let best: SnapTargets['xs'][number] | null = null, bd = tol;
  for (const l of lines) { const d = Math.abs(l.at - v); if (d <= bd) { bd = d; best = l; } }
  return best;
}

export function snapPoint(p: Pt, t: SnapTargets, o: SnapOptions): SnapResult {
  const tol = o.tolPx / Math.max(1e-9, o.scale);
  let bn: Pt | null = null, bd = tol;
  for (const q of t.points) { const d = dist(p, q); if (d <= bd) { bd = d; bn = q; } }
  if (bn) return { p: { x: bn.x, y: bn.y }, lines: [], node: bn, grid: false };
  const lx = nearestLine(p.x, t.xs, tol), ly = nearestLine(p.y, t.ys, tol);
  const g = o.grid && o.grid > 0 ? o.grid : 0;
  const out: SnapResult = { p: { x: p.x, y: p.y }, lines: [], grid: false };
  if (lx) { out.p.x = lx.at; out.lines.push({ axis: 'x', at: lx.at, kind: lx.kind }); }
  else if (g) { out.p.x = Math.round(p.x / g) * g; out.grid = true; }
  if (ly) { out.p.y = ly.at; out.lines.push({ axis: 'y', at: ly.at, kind: ly.kind }); }
  else if (g) { out.p.y = Math.round(p.y / g) * g; out.grid = true; }
  return out;
}

/**
 * What a glyph offers to snap to: the doc's guides and the metric lines (when `lines`), and its nodes
 * (when `nodes`) except those in `skip` ("ci:ni" keys: the nodes being moved).
 */
export function snapTargets(doc: GlyphDoc, g: Glyph | undefined, adv: number, o: { lines: boolean; nodes: boolean; skip?: Set<string> }): SnapTargets {
  const t: SnapTargets = { xs: [], ys: [], points: [] };
  if (o.lines) {
    const m = doc.metrics;
    t.xs.push({ at: 0, kind: 'metrica' }, { at: adv, kind: 'metrica' });
    for (const y of [0, m.xh, m.cap, m.asc, m.desc]) t.ys.push({ at: y, kind: 'metrica' });
    for (const gd of doc.guides) (gd.axis === 'x' ? t.xs : t.ys).push({ at: gd.at, kind: 'guia' });
  }
  if (o.nodes && g) {
    g.contours.forEach((c, ci) => c.nodes.forEach((n, ni) => { if (!o.skip?.has(`${ci}:${ni}`)) t.points.push({ x: n.x, y: n.y }); }));
    for (const a of g.anchors) t.points.push({ x: a.x, y: a.y });
  }
  return t;
}

/** Shift while moving or drawing: the point keeps to the horizontal, vertical or diagonal through `from`. */
export function constrain45(from: Pt, p: Pt): Pt {
  const dx = p.x - from.x, dy = p.y - from.y;
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const L = Math.hypot(dx, dy) * Math.cos(Math.atan2(dy, dx) - a);
  return { x: from.x + Math.cos(a) * L, y: from.y + Math.sin(a) * L };
}
