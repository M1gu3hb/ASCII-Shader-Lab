/**
 * Real characters: a grid of glyphs computed on the CPU from a picture and drawn with a font. Unlike the
 * shader ASCII of the engine, what this grid shows IS text: it can be copied, saved as TXT/ANSI/HTML and
 * written as SVG text. CONTRACT for the compositor and the animation templates: the signatures below are
 * fixed; lane «glyphs» fills in the implementation and the charsets.
 */
import type { GlyphStyle } from '../project/types';

export interface CharsetDef {
  id: string;
  /** Spanish name and a line on its character. */
  name: string;
  blurb: string;
  /** From empty to full (sorted by ink when `sort` is true). */
  chars: string;
  sort: boolean;
}

export interface GlyphGrid {
  cols: number;
  rows: number;
  /** Cell size in output px. */
  cw: number;
  ch: number;
  /** Row-major; ' ' for an empty cell. Wide characters take one cell here (drawn centred). */
  chars: string[];
  /** Per cell: source colour (rgb, 0..255), brightness after tone (0..1) and coverage (0..1, 0 = empty). */
  rgb: Uint8ClampedArray;
  lum: Float32Array;
  alpha: Float32Array;
}

/** Per-cell changes an animation can make while drawing (all optional). */
export interface CellFx {
  /** 0..1 visibility (0 = hidden). */
  visible?: number;
  /** Offset in output px. */
  dx?: number;
  dy?: number;
  /** Replace the glyph. */
  glyph?: string;
  /** Replace the colour (#rrggbb). */
  color?: string;
  scale?: number;
  rot?: number;
}

export type Source2D = HTMLCanvasElement | OffscreenCanvas | ImageBitmap | HTMLImageElement;

/** The alphabets offered in the studio (filled by lane «glyphs»). */
export const CHARSETS: CharsetDef[] = [];

/**
 * Computes the grid for a picture of the output size (out.w × out.h px): the source is sampled over each
 * cell (area average, not a point), toned, and mapped to the charset (or to the user's words).
 * STUB until lane «glyphs» implements it.
 */
export function glyphGrid(src: Source2D, style: GlyphStyle, out: { w: number; h: number }): GlyphGrid {
  void src;
  const cw = Math.max(2, style.cell), ch = Math.max(2, style.cell * style.aspect);
  const cols = Math.ceil(out.w / cw), rows = Math.ceil(out.h / ch), n = cols * rows;
  return { cols, rows, cw, ch, chars: new Array(n).fill(' '), rgb: new Uint8ClampedArray(n * 3), lum: new Float32Array(n), alpha: new Float32Array(n) };
}

/** Draws a grid (and its paper, if any) into ctx at 0,0; `cellFx` lets animations move, hide or swap cells. */
export function drawGlyphs(ctx: CanvasRenderingContext2D, grid: GlyphGrid, style: GlyphStyle, cellFx?: (i: number, col: number, row: number) => CellFx | null): void {
  void ctx; void grid; void style; void cellFx;
}
