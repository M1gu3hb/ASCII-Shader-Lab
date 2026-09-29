/**
 * The characters a glyph layer shows at one instant, AS DRAWN: the layer's grid at t (keyframes and clips
 * applied to its style) with what the clips do per cell (CellFx: hidden, swapped, recoloured characters; the
 * cell reveal; tiles), the layer's mask and opacity, and its position. Text has no sub-cell positions, turns
 * or sizes, so:
 *   - a character moved by a fraction of a cell goes to the nearest whole cell (counted in the notes);
 *   - turned or scaled characters stay upright and at size (counted: the export says so);
 *   - masks apply per cell (a character shows when enough of its cell is inside, with that strength);
 *   - finishes (glow, grain…), a turned/scaled layer and stretches are pixels: left out, and said.
 *
 * This file is the pure part (unit-tested); frames.ts reads the project in the browser with the same steps as
 * the compositor (the same feed, grid, font and clip hooks), so the text of a frame is what the studio draws
 * for that frame.
 */
import type { CellFx, GlyphGrid } from '../../glyphs/index';
import { parseHex } from '../../glyphs/color';
import type { TileFx } from '../../project/clips';
import type { GlyphStyle } from '../../project/types';

/* ------------------------------------------------------------------ pure part */

export interface FrameEffects {
  /** Per-cell changes of the clips (the compositor's `lf.cells(grid)`). */
  cells?: ((i: number, col: number, row: number) => CellFx | null) | null;
  /** Per-cell visibility of the clips (`lf.reveal(grid)`). */
  reveal?: ((col: number, row: number) => number) | null;
  /** Per-cell movement of the drawing (`lf.tiles(grid)`), applied after the characters. */
  tiles?: ((col: number, row: number) => TileFx | null) | null;
  /** Mask strength per cell 0..1 (the layer's mask and the clips' masks, averaged over each cell). */
  coverage?: ArrayLike<number> | null;
  /** The layer's opacity at t (clips included). */
  opacity?: number;
  /** The layer's offset from its place, output px (its position); moved by whole cells. */
  offset?: { x: number; y: number };
}

/** What a frame's text could not keep (counts of cells, per frame or summed over frames). */
export interface FrameNotes {
  /** Cells whose move was not a whole number of cells (placed on the nearest cell). */
  rounded: number;
  /** Cells turned or scaled by the clips (drawn upright and at size in text). */
  turned: number;
  scaled: number;
  /** Frames with a mask applied per cell. */
  masked: number;
  /** Frames where the layer's own offset was not a whole number of cells. */
  offset: number;
  /** Frames with things text cannot have at all (Spanish names: finishes, layer turn/scale, stretch). */
  pixels: string[];
  /** The grid changed size between frames (a clip or keyframe changed the cell size). */
  resized: boolean;
  /** Frames where the layer did not show (hidden, outside its span): blank text frames. */
  blank: number;
}

export const emptyNotes = (): FrameNotes => ({ rounded: 0, turned: 0, scaled: 0, masked: 0, offset: 0, pixels: [], resized: false, blank: 0 });

export function mergeNotes(a: FrameNotes, b: FrameNotes): FrameNotes {
  return {
    rounded: a.rounded + b.rounded, turned: a.turned + b.turned, scaled: a.scaled + b.scaled, masked: a.masked + b.masked, offset: a.offset + b.offset,
    pixels: [...new Set([...a.pixels, ...b.pixels])], resized: a.resized || b.resized, blank: a.blank + b.blank,
  };
}

const EPS = 0.02;
/** Offset in px → whole cells, and whether it was a fraction of a cell. */
function toCells(d: number, size: number): { n: number; frac: boolean } {
  if (!d) return { n: 0, frac: false };
  const k = d / size, n = Math.round(k);
  return { n, frac: Math.abs(k - n) > EPS };
}

/**
 * The frame's grid: characters, the colour each is drawn with (as `rgb`, so every text exporter and the
 * SVG writer read it with colour mode 'source') and its strength (`alpha`), after every effect (see the top
 * of this file). `colors` are the layer's drawn colours before the clips (cellColors of its style).
 */
export function applyFrame(grid: GlyphGrid, colors: ArrayLike<number>, fx: FrameEffects = {}, notes: FrameNotes = emptyNotes()): GlyphGrid {
  const { cols, rows, cw, ch } = grid;
  const n = cols * rows;
  const chars: string[] = new Array(n).fill(' ');
  const alpha = new Float32Array(n);
  const col = new Uint32Array(n);
  const lum = new Float32Array(n);
  const put = (j: number, c: string, a: number, k: number, l: number) => {
    // two characters landing on one cell: the stronger one is the one read (ties: the later one, drawn on top)
    if (a < alpha[j] && chars[j] !== ' ') return;
    chars[j] = c; alpha[j] = a; col[j] = k; lum[j] = l;
  };
  // 1. characters (CellFx and the reveal), as drawGrid applies them
  for (let i = 0; i < n; i++) {
    const c0 = i % cols, r0 = (i / cols) | 0;
    let c = grid.chars[i] ?? ' ';
    let a = grid.alpha[i] ?? 0;
    let k = colors[i] ?? 0;
    let f: CellFx | null = fx.cells ? fx.cells(i, c0, r0) : null;
    if (fx.reveal) {
      const v = fx.reveal(c0, r0);
      if (v < 1) f = { ...(f ?? {}), visible: (f?.visible ?? 1) * v };
    }
    let dx = 0, dy = 0;
    if (f) {
      if (f.visible !== undefined) a *= Math.max(0, f.visible);
      if (f.glyph !== undefined) {
        c = f.glyph;
        // a glyph swapped into an empty cell shows with the visibility the animation gives it
        if (!(a > 0) && f.visible !== undefined) a = Math.max(0, f.visible);
      }
      if (f.color) k = parseHex(f.color, k);
      const s = f.scale ?? 1, rot = f.rot ?? 0;
      if (s !== 1 || rot) {
        if (!(s > 0)) continue;
        if (a > 0.004 && c && c !== ' ') {
          if (rot && Math.abs(rot % 360) > 0.5) notes.turned++;
          if (Math.abs(s - 1) > 0.02) notes.scaled++;
        }
      }
      dx = f.dx ?? 0; dy = f.dy ?? 0;
    }
    if (!(a > 0.004) || !c || c === ' ') continue;
    const mx = toCells(dx, cw), my = toCells(dy, ch);
    if (mx.frac || my.frac) notes.rounded++;
    const tc = c0 + mx.n, tr = r0 + my.n;
    if (tc < 0 || tc >= cols || tr < 0 || tr >= rows) continue;
    put(tr * cols + tc, c, Math.min(1, a), k, grid.lum[i] ?? 0);
  }
  // 2. tiles: each moved tile takes its drawn cell elsewhere (the origin is cleared), with its alpha
  if (fx.tiles) {
    const moves: Array<{ i: number; f: TileFx }> = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const f = fx.tiles(c, r);
      if (!f) continue;
      if (!f.dx && !f.dy && (f.scale ?? 1) === 1 && (f.sy ?? 1) === 1 && !f.rot && (f.alpha ?? 1) >= 1) continue;
      moves.push({ i: r * cols + c, f });
    }
    if (moves.length) {
      const src = { chars: chars.slice(), alpha: alpha.slice(), col: col.slice(), lum: lum.slice() };
      for (const { i } of moves) { chars[i] = ' '; alpha[i] = 0; }
      for (const { i, f } of moves) {
        const a = src.alpha[i] * Math.min(1, Math.max(0, f.alpha ?? 1));
        const s = f.scale ?? 1, sy = f.sy ?? 1;
        if (!(a > 0.003) || !(s > 0.001) || !(sy > 0.0005) || src.chars[i] === ' ') continue;
        if (f.rot && Math.abs(f.rot % 360) > 0.5) notes.turned++;
        if (Math.abs(s - 1) > 0.02 || Math.abs(sy - 1) > 0.02) notes.scaled++;
        const mx = toCells(f.dx ?? 0, cw), my = toCells(f.dy ?? 0, ch);
        if (mx.frac || my.frac) notes.rounded++;
        const tc = (i % cols) + mx.n, tr = ((i / cols) | 0) + my.n;
        if (tc < 0 || tc >= cols || tr < 0 || tr >= rows) continue;
        const j = tr * cols + tc;
        // a moved tile is drawn over what is there
        chars[j] = src.chars[i]; alpha[j] = a; col[j] = src.col[i]; lum[j] = src.lum[i];
      }
    }
  }
  // 3. the mask (per cell) and the layer's opacity
  const op = fx.opacity === undefined ? 1 : Math.min(1, Math.max(0, fx.opacity));
  if (fx.coverage || op < 1) {
    for (let i = 0; i < n; i++) if (alpha[i] > 0) alpha[i] *= (fx.coverage ? Math.min(1, Math.max(0, fx.coverage[i] ?? 0)) : 1) * op;
  }
  if (fx.coverage) notes.masked++;
  // 4. the layer's position, by whole cells
  let out = { chars, alpha, col, lum };
  if (fx.offset && (fx.offset.x || fx.offset.y)) {
    const mx = toCells(fx.offset.x, cw), my = toCells(fx.offset.y, ch);
    if (mx.frac || my.frac) notes.offset++;
    if (mx.n || my.n) {
      const o = { chars: new Array<string>(n).fill(' '), alpha: new Float32Array(n), col: new Uint32Array(n), lum: new Float32Array(n) };
      for (let i = 0; i < n; i++) {
        if (!(alpha[i] > 0)) continue;
        const tc = (i % cols) + mx.n, tr = ((i / cols) | 0) + my.n;
        if (tc < 0 || tc >= cols || tr < 0 || tr >= rows) continue;
        const j = tr * cols + tc;
        o.chars[j] = chars[i]; o.alpha[j] = alpha[i]; o.col[j] = col[i]; o.lum[j] = lum[i];
      }
      out = o;
    }
  }
  const rgb = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) { const k = out.col[i]; rgb[i * 3] = (k >> 16) & 255; rgb[i * 3 + 1] = (k >> 8) & 255; rgb[i * 3 + 2] = k & 255; }
  for (let i = 0; i < n; i++) if (!(out.alpha[i] > 0)) out.chars[i] = ' ';
  return { cols, rows, cw, ch, ...(grid.w ? { w: grid.w } : {}), ...(grid.h ? { h: grid.h } : {}), chars: out.chars, rgb, lum: out.lum, alpha: out.alpha };
}

/** The style a frame grid is written with: its colours are final (`rgb`), so colour mode 'source'. */
export const frameStyle = (s: GlyphStyle): GlyphStyle => ({ ...s, color: 'source' });

/** A blank grid of cols × rows (a frame where the layer does not show). */
export function blankGrid(cols: number, rows: number, cw: number, ch: number, w?: number, h?: number): GlyphGrid {
  const n = cols * rows;
  return { cols, rows, cw, ch, ...(w ? { w } : {}), ...(h ? { h } : {}), chars: new Array(n).fill(' '), rgb: new Uint8ClampedArray(n * 3), lum: new Float32Array(n), alpha: new Float32Array(n) };
}

/** A grid padded (or cut) to cols × rows: frames of one animation share one size in the players. */
export function padGrid(g: GlyphGrid, cols: number, rows: number): GlyphGrid {
  if (g.cols === cols && g.rows === rows) return g;
  const out = blankGrid(cols, rows, g.cw, g.ch, g.w, g.h);
  for (let r = 0; r < Math.min(rows, g.rows); r++) for (let c = 0; c < Math.min(cols, g.cols); c++) {
    const i = r * g.cols + c, j = r * cols + c;
    out.chars[j] = g.chars[i]; out.alpha[j] = g.alpha[i]; out.lum[j] = g.lum[i];
    out.rgb[j * 3] = g.rgb[i * 3]; out.rgb[j * 3 + 1] = g.rgb[i * 3 + 1]; out.rgb[j * 3 + 2] = g.rgb[i * 3 + 2];
  }
  return out;
}

/** Mean of a coverage (w·h, 0..1) over each cell of a grid. */
export function cellCoverage(cov: ArrayLike<number>, w: number, h: number, cols: number, rows: number, cw: number, ch: number): Float32Array {
  const out = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.min(h, Math.round(r * ch)), y1 = Math.min(h, Math.round((r + 1) * ch));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.min(w, Math.round(c * cw)), x1 = Math.min(w, Math.round((c + 1) * cw));
      let s = 0, k = 0;
      for (let y = y0; y < y1; y++) { const o = y * w; for (let x = x0; x < x1; x++) { s += cov[o + x]; k++; } }
      out[r * cols + c] = k ? s / k : 0;
    }
  }
  return out;
}

/** Spanish sentences for what a text export could not keep (empty when it kept everything). */
export function notesText(n: FrameNotes, frames = 1): string[] {
  const out: string[] = [];
  const many = frames > 1;
  if (n.rounded) out.push(`El movimiento de los caracteres va por celdas enteras: ${many ? 'en algunos cuadros ' : ''}hay caracteres que en el estudio se mueven una fracción de celda y en el texto saltan a la más cercana.`);
  if (n.turned || n.scaled) out.push(`${[n.turned ? 'giran' : '', n.scaled ? 'cambian de tamaño' : ''].filter(Boolean).join(' y ')} caracteres: el texto no puede girar ni escalar una letra, así que quedan derechos y a su tamaño (para verlo tal cual, exporta video o GIF).`.replace(/^./, s => s.toUpperCase()));
  if (n.masked) out.push('La máscara se aplica por celda: cada carácter se ve entero o no se ve, según cuánto de su celda queda dentro (en el estudio el borde corta los caracteres).');
  if (n.offset) out.push('La posición de la capa se redondea a celdas enteras.');
  if (n.pixels.length) out.push(`Sin ${n.pixels.join(', ')}: son efectos de píxel y el texto no los lleva.`);
  if (n.resized) out.push('El tamaño de celda cambia durante la animación: los cuadros con menos columnas o filas se completan con espacios hasta el mayor.');
  if (n.blank) out.push(`${n.blank === frames ? 'La capa no se ve en este tramo' : `En ${n.blank} ${n.blank === 1 ? 'cuadro' : 'cuadros'} la capa no se ve`}: ${n.blank === frames ? 'el texto sale vacío' : 'esos cuadros van vacíos'}.`);
  return out;
}
