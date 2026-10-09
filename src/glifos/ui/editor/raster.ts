/**
 * The picture layer of a glyph (pure): where it sits in font units and what «Vectorizar» does with the
 * outlines traced from it. Vectorising never removes the picture: it stays as a guide under the drawing.
 */
import type { Contour, Glyph, RasterLayer } from '../../doc';
import type { Box } from './math';

/** The crop's box in font units: its top-left corner at (x, y), one pixel = s units. */
export function rasterBox(r: RasterLayer): Box {
  return { x0: r.x, y1: r.y, x1: r.x + r.crop.w * r.s, y0: r.y - r.crop.h * r.s };
}

/**
 * Where the traced pixels go: the crop's top-left corner, and the units per pixel of the ink grid (which
 * may be smaller than the crop when the shell reduced it).
 */
export function tracePlace(r: RasterLayer, ink: { w: number; h: number }): { x: number; y: number; s: number } {
  return { x: r.x, y: r.y, s: r.s * (r.crop.w / Math.max(1, ink.w)) };
}

export type VectorizeMode = 'reemplazar' | 'anadir';

export function applyVectorized(g: Glyph, traced: Contour[], mode: VectorizeMode): void {
  g.contours = mode === 'reemplazar' ? traced : [...g.contours, ...traced];
  g.origin = 'vectorizado';
  if (g.raster) g.raster.use = 'guia';
}
