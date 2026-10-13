/**
 * Advance and side bearings (pure). The left bearing is the space from 0 to the drawing's left edge, the
 * right one from its right edge to the advance. In an ASCII set the advance is the cell unless the glyph
 * has its own («Avance propio»).
 */
import type { Glyph, GlyphDoc } from '../../doc';
import type { Box } from './math';

export const advanceFollowsCell = (doc: Pick<GlyphDoc, 'mode'>, g: Pick<Glyph, 'ownAdv'>) => doc.mode === 'ascii' && !g.ownAdv;

export function effectiveAdvance(doc: Pick<GlyphDoc, 'mode' | 'metrics'>, g: Pick<Glyph, 'adv' | 'ownAdv'>): number {
  return advanceFollowsCell(doc, g) ? doc.metrics.cell : g.adv;
}

export function sidebearings(box: Box | null, adv: number): { lsb: number; rsb: number } | null {
  return box ? { lsb: box.x0, rsb: adv - box.x1 } : null;
}

/**
 * New left bearing: the drawing moves by dx so its left edge is at `lsb`; the advance grows by the same
 * dx so the right bearing stays (unless the advance is the cell, which does not move).
 */
export function lsbEdit(box: Box, adv: number, lsb: number, fixedAdvance: boolean): { dx: number; adv: number } {
  const dx = lsb - box.x0;
  return { dx, adv: fixedAdvance ? adv : adv + dx };
}

/** New right bearing: the advance ends `rsb` after the drawing's right edge (never below 0). */
export const rsbEdit = (box: Box, rsb: number): number => Math.max(0, box.x1 + rsb);

/** Moves everything a glyph draws sideways (contours, components, anchors, its picture). */
export function shiftGlyph(g: Glyph, dx: number): void {
  if (!dx) return;
  for (const c of g.contours) for (const n of c.nodes) {
    n.x += dx;
    if (n.hi) n.hi.x += dx;
    if (n.ho) n.ho.x += dx;
  }
  for (const k of g.components) k.dx += dx;
  for (const a of g.anchors) a.x += dx;
  if (g.raster) g.raster.x += dx;
}
