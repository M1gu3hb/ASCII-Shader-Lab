/**
 * Fonts of the real-character layers: which CSS font a style asks for, the font size that fits its cell
 * and the few measurements the drawing needs (advances, the box of the full block and of the full braille
 * cell). Everything is cached per font and invalidated when a web font finishes loading (a font still on its
 * way measures as its fallback, and that measure must not outlive the load: same rule as engine/atlas.ts).
 */
import { FONTS, fontById, nearestWeight } from '../engine/catalog';

export interface FontSpec {
  /** Catalog id when the style names one of the studio's fonts ('' for a free CSS family). */
  id: string;
  stack: string;
  weight: number;
  /** Font size in px for the cell it was made for. */
  fs: number;
  /** CSS font shorthand for Canvas 2D. */
  css: string;
  /** Advance of «0» in em (the monospace pitch; 0.6 when nothing can be measured). */
  adv: number;
}

const MONO_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** The CSS stack and the weight a style's font resolves to (catalog ids, or any CSS family as a fallback). */
export function resolveFont(font: string, weight: number): { id: string; stack: string; weight: number } {
  const f = FONTS.find(x => x.id === font);
  const w = Number.isFinite(weight) ? Math.round(weight) : 400;
  if (f) return { id: f.id, stack: f.stack, weight: nearestWeight(f, w) };
  const name = (font || '').trim();
  if (!name) { const d = fontById('jetbrains'); return { id: d.id, stack: d.stack, weight: nearestWeight(d, w) }; }
  const stack = /[,"']/.test(name) ? name : `"${name.replace(/["\\]/g, '')}", ${MONO_FALLBACK}`;
  return { id: '', stack, weight: Math.min(900, Math.max(100, Math.round(w / 100) * 100)) };
}

/**
 * Grows each time a web font finishes loading, so measurements taken with a fallback face are redone once
 * the real one is there (mirror of the engine atlas).
 */
export function loadedFonts(): number {
  const set = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!set || typeof set.forEach !== 'function') return 0;
  let n = 0;
  set.forEach(f => { if (f.status === 'loaded') n++; });
  return n;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
let mctx: Ctx2D | null | undefined;
/** A small context for measuring text (null without a DOM or OffscreenCanvas: unit tests in Node). */
export function measureContext(): Ctx2D | null {
  if (mctx !== undefined) return mctx;
  try {
    if (typeof document !== 'undefined') mctx = document.createElement('canvas').getContext('2d');
    else if (typeof OffscreenCanvas !== 'undefined') mctx = new OffscreenCanvas(8, 8).getContext('2d');
    else mctx = null;
  } catch { mctx = null; }
  return mctx ?? null;
}

const advCache = new Map<string, number>();
/** Advance of a character in em for this stack and weight (measured at 100 px, cached). */
export function advanceEm(c: string, stack: string, weight: number): number {
  const key = c + '|' + weight + '|' + stack + '|' + loadedFonts();
  const hit = advCache.get(key);
  if (hit !== undefined) return hit;
  const x = measureContext();
  let v = 0.6;
  if (x) {
    x.font = `${weight} 100px ${stack}`;
    const w = x.measureText(c).width / 100;
    if (w > 0) v = w;
  }
  if (advCache.size > 8000) advCache.clear();
  advCache.set(key, v);
  return v;
}

/**
 * The font for a cell of cw × ch px: as large as the cell allows, with the monospace pitch equal to the cell
 * width when the cell is at least as tall as the glyph needs (so rows read like lines of a terminal).
 */
export function fontSpec(font: string, weight: number, cw: number, ch: number): FontSpec {
  const r = resolveFont(font, weight);
  const adv = Math.min(1.2, Math.max(0.3, advanceEm('0', r.stack, r.weight)));
  const fs = Math.max(1, Math.min(ch * 0.9, cw / adv));
  return { id: r.id, stack: r.stack, weight: r.weight, fs, adv, css: `${r.weight} ${+fs.toFixed(3)}px ${r.stack}` };
}

/** Box of a glyph at a font size (alignment point at 0,0, textAlign left, textBaseline alphabetic). */
export interface GlyphBox { left: number; right: number; asc: number; desc: number }

const boxCache = new Map<string, GlyphBox | null>();
/** Ink box of one character in a CSS font (null when the font draws nothing for it). */
export function glyphBox(c: string, css: string): GlyphBox | null {
  const key = c + '|' + css + '|' + loadedFonts();
  if (boxCache.has(key)) return boxCache.get(key)!;
  const x = measureContext();
  let b: GlyphBox | null = null;
  if (x && 'actualBoundingBoxAscent' in TextMetrics.prototype) {
    x.font = css;
    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    const m = x.measureText(c);
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (w > 0.5 && h > 0.5) b = { left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent };
  }
  if (boxCache.size > 2000) boxCache.clear();
  boxCache.set(key, b);
  return b;
}

/**
 * Loads the style's web font (and the unicode ranges of the characters it will draw) before a render:
 * drawing is synchronous and a font still on its way draws as its fallback. Resolves false when the face
 * could not be confirmed (the fallback then draws, and measures, consistently).
 */
export async function ensureGlyphFont(font: string, weight: number, sample = 'AaMm@#01'): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return true;
  const r = resolveFont(font, weight);
  const probe = Array.from(new Set(Array.from(sample.replace(/\s+/g, '')))).slice(0, 160).join('') || 'Aa';
  try {
    const faces = await Promise.race([
      document.fonts.load(`${r.weight} 32px ${r.stack}`, probe),
      new Promise<FontFace[]>(res => setTimeout(() => res([]), 5000)),
    ]);
    return faces.length > 0;
  } catch {
    return false;
  }
}
