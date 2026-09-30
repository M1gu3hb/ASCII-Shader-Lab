import type { Recipe } from '../engine/recipe';

/**
 * The frame a piece was seen in, so a shared link shows the same composition on any screen.
 *
 * Both engines size their grid from the canvas they draw into (engine.ts and basic/engine.ts, resize()):
 * W = round(cssW · pr), cw = max(2, round(cell · pr)), ch = max(2, round(cell · aspect · pr)),
 * cols = ceil(W / cw), rows = ceil(H / ch), and every cell reads the pattern at p = ((i + ½)·cw − W/2) / H.
 * A receiver whose screen has another size or pixel ratio would get another grid and another crop of the
 * pattern (a wide piece cut to a phone's column). So the link carries the four integers that fix all of it,
 * in device pixels: the canvas (w × h) and the cell (cw × ch). The viewer lays its canvas out at w × h CSS
 * pixels with a pixel ratio of 1 and a cell of exactly cw × ch (frameRecipe): the engine then computes the
 * very same numbers, and the canvas is scaled as a whole to fit the screen (letterboxed, never reflowed).
 * Pure: no DOM (unit tested in tests/unit/share-frame.test.ts).
 */
export interface Frame {
  /** Canvas width and height in device pixels. */
  w: number;
  h: number;
  /** Cell width and height in device pixels. */
  cw: number;
  ch: number;
}

/** Limits a frame read from a link must respect (the engines clamp canvases to 8192 px). */
export const FRAME_MAX = 8192;
const CELL_MAX = 1024;
/**
 * The smallest cell a stage makes: 3 px wide (a cell is at least 3 CSS px, drawn at a pixel ratio of 1 or
 * more) and 2 px tall (the engines' own minimum, which a 3 px cell with a flat shape reaches on a 1× screen).
 */
const CELL_MIN_W = 3, CELL_MIN_H = 2;
/**
 * The most cells a link's frame may have. Every cell costs the basic engine (Canvas 2D) about a microsecond a
 * frame: a crafted 8191 × 8191 frame of 2 × 2 cells (16.8 M cells) took the viewer 16 s a frame. Real stages
 * stay under it with the smallest cells there are: an 8192 px wide stage at pixel ratio 2 (16:10, 6 × 3 cells:
 * 2.3 M), a 7680 × 2160 ultrawide or a 5K screen at pixel ratio 1 (3 × 2 cells: 2.8 M and 2.5 M).
 */
export const GRID_MAX = 3_000_000;
/** What a link without a frame shows (older viewer links, or a piece shared with no stage on screen). */
export const DEFAULT_FRAME_CSS = { w: 1280, h: 720 };

/** The grid a frame makes: what the engines compute from it. */
export function gridOf(f: Frame): { cols: number; rows: number } {
  return { cols: Math.max(1, Math.ceil(f.w / f.cw)), rows: Math.max(1, Math.ceil(f.h / f.ch)) };
}

/**
 * The frame an engine draws for a canvas of cssW × cssH CSS pixels at pixel ratio `pr`, with a recipe's
 * cell size and aspect: the same arithmetic as the engines' resize(). Very large canvases are clamped to
 * FRAME_MAX as the engines do.
 */
export function frameFor(cssW: number, cssH: number, pr: number, cell: number, aspect: number): Frame {
  let p = pr > 0 && Number.isFinite(pr) ? pr : 1;
  const w0 = Math.max(1, cssW), h0 = Math.max(1, cssH);
  if (w0 * p > FRAME_MAX || h0 * p > FRAME_MAX) p = Math.min(FRAME_MAX / w0, FRAME_MAX / h0);
  return {
    w: Math.max(1, Math.round(w0 * p)),
    h: Math.max(1, Math.round(h0 * p)),
    cw: Math.max(2, Math.round(cell * p)),
    ch: Math.max(2, Math.round(cell * aspect * p)),
  };
}

/** The default frame for a recipe (1280 × 720 CSS px at pixel ratio 1). */
export const defaultFrame = (r: Recipe): Frame => frameFor(DEFAULT_FRAME_CSS.w, DEFAULT_FRAME_CSS.h, 1, r.glyph.cell, r.glyph.aspect);

/** «1440x812-10x14»: canvas, then cell, in device pixels. */
export function encodeFrame(f: Frame): string {
  return `${f.w}x${f.h}-${f.cw}x${f.ch}`;
}

/**
 * A frame read from a link, or null when it is missing, malformed or out of range: a canvas the engines do
 * not draw, cells smaller than a stage makes, or more cells than any real stage has (GRID_MAX). The viewer
 * then shows the piece in the default frame.
 */
export function parseFrame(s: string | null | undefined): Frame | null {
  const m = /^(\d{1,5})x(\d{1,5})-(\d{1,4})x(\d{1,4})$/.exec((s ?? '').trim());
  if (!m) return null;
  const [w, h, cw, ch] = m.slice(1).map(Number);
  if (w < 16 || h < 16 || w > FRAME_MAX || h > FRAME_MAX) return null;
  if (cw < CELL_MIN_W || ch < CELL_MIN_H || cw > CELL_MAX || ch > CELL_MAX) return null;
  const g = gridOf({ w, h, cw, ch });
  if (g.cols * g.rows > GRID_MAX) return null;
  return { w, h, cw, ch };
}

/**
 * The recipe as the viewer renders it: drawn at pixel ratio 1 in a canvas of w × h CSS pixels, a cell of
 * cw × ch CSS pixels gives exactly the frame's cells (round(cw) = cw, round(cw · ch/cw) = ch). Only the
 * rendering uses it; the recipe that travels and opens in the studio is the original.
 */
export function frameRecipe(r: Recipe, f: Frame): Recipe {
  return { ...r, glyph: { ...r.glyph, cell: f.cw, aspect: f.ch / f.cw } };
}

/** Where a frame goes on a screen of vw × vh: scaled uniformly to fit whole (contain), centred. */
export function fitFrame(f: { w: number; h: number }, vw: number, vh: number): { scale: number; x: number; y: number; width: number; height: number } {
  const scale = Math.max(1e-4, Math.min(vw / f.w, vh / f.h));
  const width = f.w * scale, height = f.h * scale;
  return { scale, x: (vw - width) / 2, y: (vh - height) / 2, width, height };
}

/**
 * The same frame with fewer pixels, when that changes nothing but the sharpness of glyphs nobody can see:
 * dividing canvas and cell by the same whole number keeps the grid and every cell's place in the pattern
 * exactly (all ratios are the same). Used when the frame shows much smaller than it is (a desktop piece on a
 * phone): `shown` is the size it takes on screen in device pixels (its width). Only exact divisors are used,
 * and never below what the screen shows.
 */
export function reduceFrame(f: Frame, shown: number, maxPixels = 2_400_000): { frame: Frame; divisor: number } {
  if (f.w * f.h <= maxPixels) return { frame: f, divisor: 1 };
  for (const d of [4, 3, 2]) {
    if (f.w % d || f.h % d || f.cw % d || f.ch % d) continue;
    if (f.w / d < shown || f.cw / d < 2 || f.ch / d < 2) continue;
    return { frame: { w: f.w / d, h: f.h / d, cw: f.cw / d, ch: f.ch / d }, divisor: d };
  }
  return { frame: f, divisor: 1 };
}

/** «horizontal», «vertical» or «cuadrado», and the aspect as a ratio people know when it is one. */
export function describeFrame(f: { w: number; h: number }): string {
  const a = f.w / f.h;
  const shape = a > 1.08 ? 'horizontal' : a < 0.93 ? 'vertical' : 'cuadrado';
  const known: Array<[number, string]> = [[16 / 9, '16:9'], [9 / 16, '9:16'], [4 / 3, '4:3'], [3 / 4, '3:4'], [1, '1:1'], [3 / 2, '3:2'], [2 / 3, '2:3']];
  const hit = known.find(([k]) => Math.abs(a - k) / k < 0.012);
  return hit ? `${shape}, ${hit[1]}` : shape;
}
