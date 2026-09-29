/**
 * Honest outputs of a glyph grid. Everything here is TEXT: the characters the grid holds, never a picture of
 * them.
 *   - toGridSnapshot: the shape the text exporters take (exporters/text.ts): gridToText, gridToAnsi,
 *     gridToHtml and the terminal players work on it unchanged;
 *   - gridToSvgText: one <text> per row with each character placed on its cell (x per character), the font
 *     family and the colours: selectable, searchable text. It shows with the fonts of whoever opens it
 *     (glyphs a font lacks fall back to another one), unlike the canvas render that stretches blocks and
 *     braille to fill their cells;
 *   - gridText / copyGridText: the plain text, for «Copiar como texto».
 */
import type { GridSnapshot } from '../engine/engine';
import { charWidth, gridToText } from '../exporters/text';
import type { GlyphStyle } from '../project/types';
import type { GlyphGrid } from './index';
import { cellColors } from './color';
import { fontSpec } from './font';

/**
 * The grid as the text exporters want it. Colours are the drawn ones when a style is given (ink, palette or
 * the picture's), the grid's picture colours otherwise; alpha and brightness become 0..255; empty cells ' '.
 */
export function toGridSnapshot(grid: GlyphGrid, bg: string, style?: Pick<GlyphStyle, 'color' | 'ink' | 'palette'>): GridSnapshot {
  const n = grid.cols * grid.rows;
  const cols = style ? cellColors(grid, style) : null;
  const rgb = new Uint8Array(n * 3), alpha = new Uint8Array(n), lum = new Uint8Array(n);
  const chars: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = grid.alpha[i];
    chars[i] = a > 0 && grid.chars[i] ? grid.chars[i] : ' ';
    alpha[i] = Math.round(Math.min(1, Math.max(0, a)) * 255);
    lum[i] = Math.round(Math.min(1, Math.max(0, grid.lum[i])) * 255);
    if (cols) { const c = cols[i]; rgb[i * 3] = c >> 16; rgb[i * 3 + 1] = (c >> 8) & 255; rgb[i * 3 + 2] = c & 255; }
    else { rgb[i * 3] = grid.rgb[i * 3]; rgb[i * 3 + 1] = grid.rgb[i * 3 + 1]; rgb[i * 3 + 2] = grid.rgb[i * 3 + 2]; }
  }
  return { cols: grid.cols, rows: grid.rows, chars, rgb, alpha, lum, flags: new Uint8Array(n), bg, cw: grid.cw, ch: grid.ch };
}

/** The grid as plain text (rows trimmed, one newline each): exactly what «Copiar como texto» copies. */
export function gridText(grid: GlyphGrid): string {
  return gridToText(toGridSnapshot(grid, '#000000'));
}

/** Copies the grid's text to the clipboard. Resolves false when the browser refused. */
export async function copyGridText(grid: GlyphGrid): Promise<boolean> {
  const text = gridText(grid);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the selection copy */ }
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

// XML 1.0 has no C0 controls (a name from a project file may carry them, and one makes the whole SVG unreadable)
const esc = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v: number) => String(+v.toFixed(2));
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/**
 * An SVG of real text: one <text> per row, runs of one colour as <tspan> with an x for every character (so
 * each glyph sits on its cell whatever the viewer's font advance is). Only for real characters (that is all a
 * grid holds). `paper: false` leaves the background out even when the style has one.
 */
export function gridToSvgText(grid: GlyphGrid, style: GlyphStyle, opts: { paper?: boolean; title?: string } = {}): string {
  const { cols, rows, cw, ch } = grid;
  const W = grid.w ?? cols * cw, H = grid.h ?? rows * ch;
  const spec = fontSpec(style.font, style.weight, cw, ch);
  const colors = cellColors(grid, style);
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${num(W)}" height="${num(H)}" viewBox="0 0 ${num(W)} ${num(H)}">`);
  if (opts.title) out.push(`<title>${esc(opts.title)}</title>`);
  if (style.paper && opts.paper !== false) out.push(`<rect width="100%" height="100%" fill="${esc(style.paper)}"/>`);
  out.push(`<g font-family="${esc(spec.stack)}" font-size="${num(spec.fs)}" font-weight="${spec.weight}" text-anchor="middle" dominant-baseline="central" xml:space="preserve">`);
  for (let r = 0; r < rows; r++) {
    const spans: string[] = [];
    let run = '', xs: string[] = [], col = -1, op = 1;
    const flush = () => {
      if (!run) return;
      spans.push(`<tspan x="${xs.join(' ')}" fill="${hex(col)}"${op < 1 ? ` fill-opacity="${op}"` : ''}>${esc(run)}</tspan>`);
      run = ''; xs = [];
    };
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const g = grid.chars[i];
      const a = grid.alpha[i];
      if (!g || g === ' ' || !(a > 0.004) || charWidth(g) === 0) { flush(); continue; }
      // the canvas draws opacity in sixteenths (drawGrid groups cells by it): the same steps here
      const o = a >= 1 ? 1 : +(Math.max(1, Math.round(a * 16)) / 16).toFixed(4);
      if (colors[i] !== col || o !== op) { flush(); col = colors[i]; op = o; }
      run += g;
      xs.push(num(c * cw + cw / 2));
    }
    flush();
    if (spans.length) out.push(`<text y="${num(r * ch + ch / 2 + spec.fs * 0.04)}">${spans.join('')}</text>`);
  }
  out.push('</g></svg>');
  return out.join('\n') + '\n';
}
