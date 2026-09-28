/**
 * Real characters: a grid of glyphs computed on the CPU from a picture and drawn with a font. Unlike the
 * shader ASCII of the engine, what this grid shows IS text: it can be copied, saved as TXT/ANSI/HTML and
 * written as SVG text. CONTRACT for the compositor and the animation templates: the signatures below are
 * fixed; lane «glyphs» fills in the implementation and the charsets.
 *
 * Usage (compositor):
 *   await ensureGlyphFont(style.font, style.weight, sampleOf(style))   // once per style change
 *   const grid = glyphGrid(layerPicture, style, { w, h });             // when the picture or the style changes
 *     (or glyphGridWith(picture, style, out, { version }) to skip re-reading a picture that did not change)
 *   drawGlyphs(ctx, grid, style, cellFx);                               // per frame
 * Lab timings (this machine, headless Chromium, software canvas, CPU shared; 1080×1350, 8 px square cells =
 * 22 815 cells, medians): drawGlyphs 2.6–14 ms (+2–11 ms raster flush; Katakana 12 + 21 ms: CJK fallback
 * font); glyphGrid 25–45 ms, of which sampling 20–35 ms and mapping 2–7 ms (11 ms for Flechas).
 * Text outputs: toGridSnapshot(grid, bg, style) → exporters/text.ts; gridToSvgText(grid, style); gridText(grid).
 */
import type { GlyphStyle } from '../project/types';
import { CHARSET_LIST, charsetInfo } from './charsets';
import { drawGrid } from './draw';
import { gridDims, gridFromFine, sampleFine } from './grid';
import { resolveRamp, wordsOf } from './ramp';

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
  /** Output size the grid was made for (the last column/row may be partial); cols·cw × rows·ch when absent. */
  w?: number;
  h?: number;
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
  /** Size of the glyph around its cell centre (1 = as is). */
  scale?: number;
  /** Rotation in degrees around the cell centre. */
  rot?: number;
}

export type Source2D = HTMLCanvasElement | OffscreenCanvas | ImageBitmap | HTMLImageElement;

/** The alphabets offered in the studio (filled by lane «glyphs»). */
export const CHARSETS: CharsetDef[] = CHARSET_LIST;

/**
 * Computes the grid for a picture of the output size (out.w × out.h px): the source is sampled over each
 * cell (area average, not a point), toned, and mapped to the charset (or to the user's words).
 * The source is stretched over the output (the compositor frames it first).
 */
export function glyphGrid(src: Source2D, style: GlyphStyle, out: { w: number; h: number }): GlyphGrid {
  const d = gridDims(style, out);
  const ramp = resolveRamp(style, d.cw, d.ch);
  return gridFromFine(sampleFine(src, d), style, d, ramp);
}

/**
 * glyphGrid for callers that know when their picture changes: with the same `version` for the same source
 * object and grid size, the picture is not read again (only tone and mapping run: a slider drag on a still
 * layer costs the mapping, ~2–7 ms in the lab, not the sampling).
 */
export function glyphGridWith(src: Source2D, style: GlyphStyle, out: { w: number; h: number }, opts: { version?: string } = {}): GlyphGrid {
  const d = gridDims(style, out);
  const ramp = resolveRamp(style, d.cw, d.ch);
  return gridFromFine(sampleFine(src, d, opts.version), style, d, ramp);
}

/** Draws a grid (and its paper, if any) into ctx at 0,0; `cellFx` lets animations move, hide or swap cells. */
export function drawGlyphs(ctx: CanvasRenderingContext2D, grid: GlyphGrid, style: GlyphStyle, cellFx?: (i: number, col: number, row: number) => CellFx | null): void {
  drawGrid(ctx, grid, style, cellFx);
}

/** The characters a style can draw (to load the font's unicode ranges before rendering). */
export function sampleOf(style: GlyphStyle): string {
  const info = charsetInfo(style.charset);
  if (style.fill === 'words' || info.user === 'words') return wordsOf(style) + '|/-\\_';
  if (info.user === 'chars') return (style.chars || '') + '|/-\\_';
  if (info.mode === 'braille') return '⠁⠃⠇⡇⣇⣧⣷⣿';
  return info.chars + (info.edges ?? '|/-\\_');
}

export { CHARSET_LIST, charsetInfo, type CharsetInfo, type CharsetMode } from './charsets';
export { defaultGlyphStyle, normalizeGlyphStyle, usesWords, GLYPH_PARAMS, type GlyphParamDef } from './params';
export { toGridSnapshot, gridToSvgText, gridText, copyGridText } from './exports';
export { ensureGlyphFont, fontSpec } from './font';
export { resolveRamp, sortByInk, measureInk, type Ramp } from './ramp';
export { gridDims, gridFromFine, sampleFine, releaseSampling, flowWords, type FineSample, type WordWrap } from './grid';
export { cellColors } from './color';
