import type { GlyphSet, GlyphShape } from './set';

/**
 * Paints a glyph of a custom set where the atlas would write a font's character: same em size, centred on
 * its advance, its em box centred on the cell like `textBaseline = 'middle'` does for a font. The atlas, the
 * ink measure of the ramp and the SVG export share this placement, so a set looks the same in the WebGL 2
 * engine, the basic engine, a thumbnail and a vector export.
 */

export interface Placement {
  /** Font units → px. */
  k: number;
  /** Left edge of the glyph's advance and its baseline, relative to the cell's centre. */
  x: number;
  y: number;
}

/** `fs` is the em size in px the atlas would give a font; `nudge` the same small offset it adds (fs·0.04). */
export function placeGlyph(set: GlyphSet, shape: GlyphShape, fs: number): Placement {
  const k = fs / set.upm;
  return { k, x: -(shape.a * k) / 2, y: fs * 0.04 + ((set.asc + set.desc) / 2) * k };
}

const paths = new WeakMap<GlyphShape, Path2D | null>();
const bitmaps = new WeakMap<GlyphShape, HTMLCanvasElement | OffscreenCanvas | null>();

function pathOf(shape: GlyphShape): Path2D | null {
  let p = paths.get(shape);
  if (p === undefined) {
    p = shape.d && typeof Path2D !== 'undefined' ? new Path2D(shape.d) : null;
    paths.set(shape, p);
  }
  return p;
}

function decodeB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bitmapOf(shape: GlyphShape): HTMLCanvasElement | OffscreenCanvas | null {
  let c = bitmaps.get(shape);
  if (c !== undefined) return c;
  c = null;
  const b = shape.b;
  if (b) {
    const alpha = decodeB64(b.a);
    c = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: b.w, height: b.h }) : new OffscreenCanvas(b.w, b.h);
    const cx = c.getContext('2d') as CanvasRenderingContext2D | null;
    if (cx) {
      const img = cx.createImageData(b.w, b.h);
      for (let i = 0; i < b.w * b.h; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = alpha[i] ?? 0; }
      cx.putImageData(img, 0, 0);
    }
  }
  bitmaps.set(shape, c);
  return c;
}

/**
 * Fills one glyph in the context's current fill style, its cell centred at (cx, cy). Returns false when the
 * set has no such character (the caller draws it with the piece's font).
 */
export function paintGlyph(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, set: GlyphSet, ch: string, cx: number, cy: number, fs: number): boolean {
  const shape = set.glyphs[ch];
  if (!shape) return false;
  const p = placeGlyph(set, shape, fs);
  if (shape.b) {
    const bm = bitmapOf(shape);
    if (bm) {
      const b = shape.b;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      // the bitmap is white with alpha: draw it as a mask of the current fill colour
      ctx.drawImage(bm as CanvasImageSource, cx + p.x + b.x * p.k, cy + p.y - b.y * p.k, b.w * b.s * p.k, b.h * b.s * p.k);
      ctx.restore();
    }
  }
  const path = pathOf(shape);
  if (path) {
    ctx.save();
    ctx.translate(cx + p.x, cy + p.y);
    ctx.scale(p.k, -p.k);
    ctx.fill(path, 'nonzero');
    ctx.restore();
  }
  return true;
}

/** The advance of a character in px at em size fs (text layout of words and messages). */
export function advanceOf(set: GlyphSet, ch: string, fs: number): number | null {
  const s = set.glyphs[ch];
  return s ? (s.a * fs) / set.upm : null;
}
