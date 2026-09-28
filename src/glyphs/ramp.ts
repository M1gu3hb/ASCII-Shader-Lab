/**
 * A style's ramp: its characters from empty to full, the ink each one leaves in a cell of the chosen font
 * and a 256-step table from brightness to character.
 *
 * Ink is measured by drawing every character with drawGrid itself (same font size, same stretching of
 * blocks, boxes and braille as the render) into a cell of the style's proportion and counting coverage,
 * so the order matches what the picture will show. Cached per characters, font, weight, proportion and the
 * set of loaded web fonts. Without a canvas (unit tests in Node) the preset order is kept and the ink is
 * assumed to grow evenly.
 */
import type { GlyphStyle } from '../project/types';
import type { GlyphGrid } from './index';
import { DEFAULT_EDGES, charsetInfo, uniqueGlyphs, type CharsetInfo, type CharsetMode } from './charsets';
import { drawGrid } from './draw';
import { loadedFonts, resolveFont } from './font';

export interface Ramp {
  info: CharsetInfo;
  mode: CharsetMode;
  /** Empty to full. */
  chars: string[];
  /** Ink of each character normalised to 0..1 over the ramp (0 = the emptiest, 1 = the fullest). */
  ink: Float32Array;
  /** Brightness (0..255) → index in `chars`. */
  lut: Uint16Array;
  /** Contour glyphs: vertical, «/», horizontal, «\», low horizontal. */
  edges: string[];
  /** 'words' when the user's text flows over the figure instead of a ramp. */
  words: string | null;
}

/** Share of the measured ink in the brightness → character table (the rest is the position in the ramp). */
export const INK_WEIGHT = 0.8;

const inkCache = new Map<string, Float32Array>();
const MW = 32;

/**
 * Raw coverage (0..1 of the cell) of each character in this font, weight and cell proportion, as drawGrid
 * draws it. Null when there is no canvas to measure with.
 */
export function measureInk(chars: string[], font: string, weight: number, aspect: number): Float32Array | null {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return null;
  const a = Math.min(4, Math.max(0.4, aspect || 1));
  const r = resolveFont(font, weight);
  const key = chars.join('') + '|' + r.stack + '|' + r.weight + '|' + a.toFixed(2) + '|' + loadedFonts();
  const hit = inkCache.get(key);
  if (hit) return hit;
  const MH = Math.round(MW * a);
  // every glyph in its own cell with an empty cell to its right and below: ink that spills out of a cell
  // (a tall «|», a wide «@») is not counted, as in the engine's atlas that clips each cell
  const per = Math.max(1, Math.min(chars.length, 24));
  const cols = per * 2, rows = Math.ceil(chars.length / per) * 2, n = cols * rows;
  let cv: HTMLCanvasElement | OffscreenCanvas;
  try {
    if (typeof document !== 'undefined') { cv = document.createElement('canvas'); cv.width = cols * MW; cv.height = rows * MH; }
    else cv = new OffscreenCanvas(cols * MW, rows * MH);
  } catch { return null; }
  const x = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!x) return null;
  const grid: GlyphGrid = {
    cols, rows, cw: MW, ch: MH, chars: new Array(n).fill(' '),
    rgb: new Uint8ClampedArray(n * 3).fill(255), lum: new Float32Array(n).fill(1), alpha: new Float32Array(n),
  };
  chars.forEach((c, k) => {
    const i = Math.floor(k / per) * 2 * cols + (k % per) * 2;
    grid.chars[i] = c;
    grid.alpha[i] = 1;
  });
  drawGrid(x, grid, { font, weight, color: 'mono', ink: '#ffffff', paper: null, palette: [] } as unknown as GlyphStyle);
  const d = x.getImageData(0, 0, cols * MW, rows * MH).data;
  const W = cols * MW;
  const out = new Float32Array(chars.length);
  chars.forEach((_, k) => {
    const x0 = (k % per) * 2 * MW, y0 = Math.floor(k / per) * 2 * MH;
    let s = 0;
    for (let y = y0; y < y0 + MH; y++) for (let xx = x0; xx < x0 + MW; xx++) s += d[(y * W + xx) * 4 + 3];
    out[k] = s / (255 * MW * MH);
  });
  if (inkCache.size > 200) inkCache.clear();
  inkCache.set(key, out);
  return out;
}

/** Characters re-ordered from the emptiest to the fullest in this font (stable for equal ink). */
export function sortByInk(chars: string[], font: string, weight: number, aspect: number): { chars: string[]; ink: number[] } {
  const ink = measureInk(chars, font, weight, aspect);
  if (!ink) return { chars: chars.slice(), ink: chars.map((_, i) => (chars.length > 1 ? i / (chars.length - 1) : 1)) };
  const o = chars.map((c, i) => ({ c, v: ink[i], i })).sort((p, q) => p.v - q.v || p.i - q.i);
  return { chars: o.map(e => e.c), ink: o.map(e => e.v) };
}

const rampCache = new Map<string, Ramp>();

/** The words text of a style ('' when it has none). */
export function wordsOf(style: Pick<GlyphStyle, 'chars'>): string {
  return (style.chars ?? '').replace(/[\r\n\t\f\v]+/g, ' ').trim();
}

/** The ramp of a style for cells of cw × ch px. */
export function resolveRamp(style: GlyphStyle, cw: number, ch: number): Ramp {
  const info = charsetInfo(style.charset);
  const wantsWords = style.fill === 'words' || info.user === 'words';
  const words = wantsWords ? wordsOf(style) : '';
  // the ramp behind words decides nothing but a fallback: the preset itself, or Estándar
  const base = info.user ? charsetInfo(info.user === 'chars' ? 'custom' : 'estandar') : info;
  const custom = base.user === 'chars';
  let chars = uniqueGlyphs(custom ? style.chars ?? '' : base.chars);
  const src = chars.length ? base : charsetInfo('estandar');
  if (!chars.length) chars = uniqueGlyphs(src.chars);
  const aspect = ch / Math.max(cw, 1e-6);
  const key = [src.id, chars.join(''), style.font, style.weight, aspect.toFixed(2), loadedFonts(), words].join('|');
  const hit = rampCache.get(key);
  if (hit) return hit;

  let ink: number[];
  if (src.sort && !custom && chars.length > 1) ({ chars, ink } = sortByInk(chars, style.font, style.weight, aspect));
  else ink = chars.map((_, i) => (chars.length > 1 ? i / (chars.length - 1) : 1));
  const lo = Math.min(...ink), hi = Math.max(...ink);
  const norm = Float32Array.from(ink, v => (hi > lo ? (v - lo) / (hi - lo) : 0));
  const monotonic = norm.every((v, i) => i === 0 || v >= norm[i - 1]);

  // brightness → character: mostly by measured ink (the tone of the picture survives: dark areas stay
  // sparse even with 95 characters), a little by position (so every glyph of a long ramp still gets used)
  const N = chars.length;
  const lut = new Uint16Array(256);
  for (let s = 0; s < 256; s++) {
    const v = s / 255;
    const byPos = v * (N - 1);
    let byInk = byPos;
    if (monotonic && N > 1) {
      let j = 0;
      while (j < N - 1 && norm[j + 1] < v) j++;
      const a = norm[j], b = norm[Math.min(N - 1, j + 1)];
      byInk = b > a ? j + (v - a) / (b - a) : j;
      byInk = Math.min(N - 1, Math.max(0, byInk));
    }
    lut[s] = Math.min(N - 1, Math.max(0, Math.round(monotonic ? byInk * INK_WEIGHT + byPos * (1 - INK_WEIGHT) : byPos)));
  }
  const edges = Array.from(src.edges ?? DEFAULT_EDGES);
  const ramp: Ramp = { info: src, mode: src.mode, chars, ink: norm, lut, edges, words: wantsWords && words ? words : null };
  if (rampCache.size > 120) rampCache.clear();
  rampCache.set(key, ramp);
  return ramp;
}
