/**
 * Canvas 2D drawing of a glyph grid.
 *
 * Fast path: one font string; cells grouped by colour and opacity (a few fillStyle changes instead of one per
 * cell); inside a group, neighbouring cells of one row are written with ONE fillText («spans»): the
 * characters are separated by U+200C (zero-width non-joiner, so no ligature or contextual alternate can join
 * them) and letterSpacing makes the pitch exactly one cell. Every character still lands centred on its own
 * cell: the span path is checked once per font and cell size against the one-glyph-per-call path, pixel by
 * pixel, and is not used when they differ (or when the browser has no letterSpacing).
 *
 * Three families of characters are drawn so they tile the way a terminal shows them:
 *   - block elements (▀▄█▌▐, quadrants, eighths) as exact rectangles snapped to device pixels: fonts rarely
 *     fill a cell of an arbitrary proportion, and the gaps would show as lines;
 *   - box drawing and shades (─│┼═╬░▒▓) with the font, stretched so the font's full block spans the cell
 *     (lines then join from cell to cell);
 *   - braille with the font, stretched so the 2×4 dots spread over the cell like the sub-samples they show.
 * Characters wider than the cell (full-width, emoji) are squeezed into it.
 */
import type { GlyphStyle } from '../project/types';
import type { CellFx, GlyphGrid } from './index';
import { cellColors, parseHex } from './color';
import { fontSpec, glyphBox, loadedFonts, type FontSpec } from './font';

export const CLS_TEXT = 0, CLS_BLOCK = 1, CLS_FIT = 2, CLS_BRAILLE = 3;
const ZW = '‌';

/** Block elements U+2580–U+259F (not the shades) as rectangles: x, y, w, h in fractions of the cell. */
export const BLOCK_RECTS: Record<string, number[]> = {
  '▀': [0, 0, 1, 0.5], '▁': [0, 7 / 8, 1, 1 / 8], '▂': [0, 0.75, 1, 0.25], '▃': [0, 5 / 8, 1, 3 / 8], '▄': [0, 0.5, 1, 0.5],
  '▅': [0, 3 / 8, 1, 5 / 8], '▆': [0, 0.25, 1, 0.75], '▇': [0, 1 / 8, 1, 7 / 8], '█': [0, 0, 1, 1],
  '▉': [0, 0, 7 / 8, 1], '▊': [0, 0, 0.75, 1], '▋': [0, 0, 5 / 8, 1], '▌': [0, 0, 0.5, 1], '▍': [0, 0, 3 / 8, 1],
  '▎': [0, 0, 0.25, 1], '▏': [0, 0, 1 / 8, 1], '▐': [0.5, 0, 0.5, 1], '▔': [0, 0, 1, 1 / 8], '▕': [7 / 8, 0, 1 / 8, 1],
  '▖': [0, 0.5, 0.5, 0.5], '▗': [0.5, 0.5, 0.5, 0.5], '▘': [0, 0, 0.5, 0.5], '▝': [0.5, 0, 0.5, 0.5],
  '▙': [0, 0, 0.5, 1, 0.5, 0.5, 0.5, 0.5], '▚': [0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], '▛': [0, 0, 1, 0.5, 0, 0.5, 0.5, 0.5],
  '▜': [0, 0, 1, 0.5, 0.5, 0.5, 0.5, 0.5], '▞': [0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 0.5], '▟': [0.5, 0, 0.5, 1, 0, 0.5, 0.5, 0.5],
};

const clsCache = new Map<string, number>();
/** How a character is drawn (see the module comment). */
export function glyphClass(c: string): number {
  let k = clsCache.get(c);
  if (k !== undefined) return k;
  const cp = c.codePointAt(0) ?? 32;
  if (BLOCK_RECTS[c]) k = CLS_BLOCK;
  else if ((cp >= 0x2500 && cp <= 0x257f) || (cp >= 0x2591 && cp <= 0x2593)) k = CLS_FIT;
  else if (cp >= 0x2800 && cp <= 0x28ff) k = CLS_BRAILLE;
  else k = CLS_TEXT;
  if (clsCache.size > 4000) clsCache.clear();
  clsCache.set(c, k);
  return k;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type SpacingCtx = Ctx & { letterSpacing: string; fontKerning: CanvasFontKerning };

/** Stretch that maps a reference glyph's ink box onto a box of the cell (see module comment). */
interface Fit { sx: number; sy: number; ox: number; oy: number }

/** A character in the drawing font: its class, advance (px, no spacing), whether it is too wide for a cell and its pitch class (spans). */
interface GInfo { cls: number; w: number; wide: boolean; pc: number }

/** Calibration of letterSpacing for spans in one font: pitch = advance + m·spacing. */
interface SpanCal { m: number; space: number }

interface Kit {
  spec: FontSpec;
  cw: number;
  ch: number;
  nudge: number;
  fill: Fit | null;
  braille: Fit | null;
  info: Map<string, GInfo>;
  /** Advance of each pitch class (px); a span of class k uses letterSpacing (cw − pitch[k]) / m. */
  pitch: number[];
  cal: SpanCal | null;
}

function fitOf(c: string, css: string, bw: number, bh: number, bx: number, by: number): Fit | null {
  const b = glyphBox(c, css);
  if (!b) return null;
  const sx = bw / (b.left + b.right), sy = bh / (b.asc + b.desc);
  // drawn at (X, Y) under scale(sx, sy): the box lands at (X - left)·sx, (Y - asc)·sy
  return { sx, sy, ox: bx / sx + b.left, oy: by / sy + b.asc };
}

/** Pitch of a character repeated in a span (difference of two lengths, so the ends do not count). */
function spanPitch(ctx: Ctx, c: string): number {
  const probe = (k: number) => (c + ZW).repeat(k - 1) + c;
  return (ctx.measureText(probe(24)).width - ctx.measureText(probe(8)).width) / 16;
}

const calCache = new Map<string, SpanCal | null>();
const infoCache = new Map<string, Map<string, GInfo>>();
const pitchCache = new Map<string, number[]>();
const testCache = new Map<string, boolean>();

/** Measures with ctx in the drawing font and no letter spacing (the caller restores its own state). */
function makeKit(ctx: Ctx, spec: FontSpec, cw: number, ch: number): Kit {
  const key = spec.css + '|' + loadedFonts();
  const sc = ctx as SpacingCtx;
  const spacing = 'letterSpacing' in ctx;
  let cal = calCache.get(key);
  if (cal === undefined) {
    cal = null;
    if (spacing) {
      sc.letterSpacing = '0px';
      const a0 = spanPitch(ctx, '0');
      sc.letterSpacing = '8px';
      const a8 = spanPitch(ctx, '0');
      sc.letterSpacing = '0px';
      const m = (a8 - a0) / 8;
      if (m > 0.5 && m < 2.5 && a0 > 0) cal = { m, space: spanPitch(ctx, ' ') };
    }
    if (calCache.size > 64) calCache.clear();
    calCache.set(key, cal);
  }
  // pitches depend on the font only; «too wide» also on the cell width
  let pitch = pitchCache.get(key);
  if (!pitch) { pitch = []; if (pitchCache.size > 64) pitchCache.clear(); pitchCache.set(key, pitch); }
  const ikey = key + '|' + cw.toFixed(3);
  let info = infoCache.get(ikey);
  if (!info) { info = new Map(); if (infoCache.size > 64) infoCache.clear(); infoCache.set(ikey, info); }
  return {
    spec, cw, ch, info, pitch, cal,
    nudge: spec.fs * 0.04,
    fill: fitOf('█', spec.css, cw, ch, 0, 0),
    braille: fitOf('⣿', spec.css, cw * 0.8, ch * 0.88, cw * 0.1, ch * 0.06),
  };
}

/** What the kit knows about a character (measured once per font; ctx must be in the drawing font, spacing 0). */
function infoOf(ctx: Ctx, kit: Kit, c: string): GInfo {
  let g = kit.info.get(c);
  if (g) return g;
  const cls = glyphClass(c);
  const w = ctx.measureText(c).width;
  let pc = -1;
  if (cls === CLS_TEXT && kit.cal && w > 0) {
    const p = Math.round(spanPitch(ctx, c) * 1000) / 1000;
    pc = kit.pitch.indexOf(p);
    if (pc < 0) { pc = kit.pitch.length; kit.pitch.push(p); }
  }
  g = { cls, w, wide: w > kit.cw * 1.06, pc };
  kit.info.set(c, g);
  return g;
}

/**
 * Draws a probe of ligature-prone characters one by one and as a span, and compares the pixels: spans are
 * used only when both are the same (a font whose shaping still changes glyphs inside a span, or a browser
 * that places them differently, keeps the one-glyph-per-call path).
 */
function spansAgree(kit: Kit, sample: Ctx): boolean {
  const key = kit.spec.css + '|' + kit.cw.toFixed(3) + '|' + kit.ch.toFixed(3) + '|' + loadedFonts();
  const hit = testCache.get(key);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    const probe = Array.from('==->::##..--!=<=>=www||//__**++%%@@00ffiifl');
    const W = Math.ceil(probe.length * kit.cw) + 2, H = Math.ceil(kit.ch) + 2;
    const mk = () => {
      const cv = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(W, H);
      cv.width = W; cv.height = H;
      const x = cv.getContext('2d', { willReadFrequently: true }) as SpacingCtx;
      x.font = kit.spec.css; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.letterSpacing = '0px';
      x.fontKerning = 'none';
      return x;
    };
    const a = mk(), b = mk();
    const infos = probe.map(c => infoOf(a, kit, c));
    const pc = infos[0].pc;
    if (pc >= 0 && infos.every(g => g.pc === pc)) {
      const y = kit.ch / 2 + kit.nudge + 1, off = (kit.cw - kit.pitch[pc]) / 2 + 1;
      probe.forEach((c, k) => a.fillText(c, k * kit.cw + (kit.cw - infos[k].w) / 2 + 1, y));
      b.letterSpacing = (kit.cw - kit.pitch[pc]) / kit.cal!.m + 'px';
      b.fillText(probe.join(ZW), off, y);
      const da = a.getImageData(0, 0, W, H).data, db = b.getImageData(0, 0, W, H).data;
      let ink = 0, bad = 0;
      for (let i = 3; i < da.length; i += 4) {
        if (da[i] > 32) ink++;
        if (Math.abs(da[i] - db[i]) > 96) bad++;
      }
      ok = ink > 0 && bad <= Math.max(2, ink * 0.01);
    }
  } catch { ok = false; }
  void sample;
  if (testCache.size > 256) testCache.clear();
  testCache.set(key, ok);
  return ok;
}

const styleCache = new Map<number, string>();
function fillOf(v: number): string {
  let s = styleCache.get(v);
  if (!s) {
    s = '#' + (v & 0xffffff).toString(16).padStart(6, '0');
    if (styleCache.size > 70000) styleCache.clear();
    styleCache.set(v, s);
  }
  return s;
}

/** 5 bits per channel, spread back over 0..255 (grouping key for picture colours: ≤ 4/255 off). */
const quant = (v: number) => {
  const r = (v >> 16) & 0xf8, g = (v >> 8) & 0xf8, b = v & 0xf8;
  return ((r | (r >> 5)) << 16) | ((g | (g >> 5)) << 8) | (b | (b >> 5));
};

const SLOT = 4194304; // 2^22: cells per grid the grouping key can address
/** Empty cells a span may bridge (as spaces) before it is cut in two. */
const GAP = 12;

interface Solo { i: number; c: string; col: number; a: number; dx: number; dy: number; s: number; r: number }

export interface DrawOptions {
  /** false forces one fillText per character (tests, comparisons). */
  spans?: boolean;
}

/**
 * Draws the grid into ctx at 0,0 (paper first when the style has one). `cellFx` lets animations hide,
 * move, recolour, swap, scale or rotate single cells; cells without scale/rotation stay in the fast path.
 */
export function drawGrid(ctx: Ctx, grid: GlyphGrid, style: GlyphStyle, cellFx?: ((i: number, col: number, row: number) => CellFx | null) | null, opts: DrawOptions = {}): void {
  const { cols, rows, cw, ch } = grid;
  const n = cols * rows;
  if (!(cols > 0 && rows > 0)) return;
  const spec = fontSpec(style.font, style.weight, cw, ch);
  const colors = cellColors(grid, style);
  const q = style.color === 'source';
  const sc = ctx as SpacingCtx;

  ctx.save();
  const base = ctx.getTransform();
  if (style.paper) {
    ctx.fillStyle = style.paper;
    ctx.fillRect(0, 0, grid.w ?? cols * cw, grid.h ?? rows * ch);
  }
  ctx.font = spec.css;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const spacing = 'letterSpacing' in ctx;
  if (spacing) { sc.letterSpacing = '0px'; sc.fontKerning = 'none'; }
  const kit = makeKit(ctx, spec, cw, ch);
  const spansOn = opts.spans !== false && !!kit.cal && spansAgree(kit, ctx);

  let glyphs = grid.chars;
  let offX: Float32Array | null = null, offY: Float32Array | null = null;
  const solo: Solo[] = [];
  const grouped = n < SLOT;
  const keys = new Float64Array(grouped ? n : 0);
  const order: number[] = [];
  let m = 0;
  for (let i = 0; i < n; i++) {
    let c = glyphs[i];
    let a = grid.alpha[i];
    let col = colors[i];
    if (cellFx) {
      const fx = cellFx(i, i % cols, (i / cols) | 0);
      if (fx) {
        if (fx.visible !== undefined) a *= Math.max(0, fx.visible);
        if (fx.glyph !== undefined) {
          if (glyphs === grid.chars) glyphs = grid.chars.slice();
          glyphs[i] = c = fx.glyph;
          // a glyph swapped into an empty cell shows with the visibility the animation gives it
          if (!(a > 0) && fx.visible !== undefined) a = Math.max(0, fx.visible);
        }
        if (fx.color) col = parseHex(fx.color, col);
        const s = fx.scale ?? 1, rot = fx.rot ?? 0;
        if (s !== 1 || rot) {
          if (a > 0.004 && c && c !== ' ' && s > 0) solo.push({ i, c, col, a: Math.min(1, a), dx: fx.dx ?? 0, dy: fx.dy ?? 0, s, r: rot });
          continue;
        }
        if (fx.dx || fx.dy) {
          offX ??= new Float32Array(n); offY ??= new Float32Array(n);
          offX[i] = fx.dx ?? 0; offY[i] = fx.dy ?? 0;
        }
      }
    }
    if (!(a > 0.004) || !c || c === ' ') continue;
    const al = a >= 1 ? 16 : Math.max(1, Math.round(a * 16));
    const k = al * 16777216 + (q ? quant(col) : col);
    if (grouped) keys[m++] = k * SLOT + i;
    else { colors[i] = k; order.push(i); }
  }

  const pendFit: number[] = [], pendBr: number[] = [];
  const dsx = base.b === 0 && base.c === 0 ? base.a : 0, dsy = base.b === 0 && base.c === 0 ? base.d : 0;
  const snapX = (x: number) => (dsx ? (Math.round(x * dsx + base.e) - base.e) / dsx : x);
  const snapY = (y: number) => (dsy ? (Math.round(y * dsy + base.f) - base.f) / dsy : y);
  const hy = ch / 2 + kit.nudge;
  const spaceCls = kit.cal ? kit.pitch.indexOf(Math.round(kit.cal.space * 1000) / 1000) : -1;

  // the span being built: one row, one pitch class, its text and where it starts
  let sRow = -1, sPc = -1, sCol = 0, sLast = 0, sText = '', sN = 0;
  let curLs = 0;
  const flushSpan = () => {
    if (!sN) return;
    const p = kit.pitch[sPc];
    if (sN > 1) {
      const ls = (cw - p) / kit.cal!.m;
      if (ls !== curLs) { sc.letterSpacing = ls + 'px'; curLs = ls; }
    }
    ctx.fillText(sText, sCol * cw + (cw - p) / 2, sRow * ch + hy);
    sN = 0; sText = '';
  };
  const flush = () => {
    flushSpan();
    if (pendFit.length) { drawFitted(ctx, base, kit.fill, pendFit, glyphs, cols, cw, ch, offX, offY, kit); pendFit.length = 0; }
    if (pendBr.length) { drawFitted(ctx, base, kit.braille, pendBr, glyphs, cols, cw, ch, offX, offY, kit); pendBr.length = 0; }
  };
  const drawCell = (i: number) => {
    const c = glyphs[i];
    const g = infoOf(ctx, kit, c);
    const col = i % cols, row = (i / cols) | 0;
    if (g.cls === CLS_TEXT) {
      if (spansOn && g.pc >= 0 && !(offX && (offX[i] || offY![i]))) {
        if (sN && sPc === g.pc && sRow === row && (col === sLast + 1 || (g.pc === spaceCls && col - sLast - 1 <= GAP))) {
          for (let k = sLast + 1; k < col; k++) sText += ZW + ' ';
          sText += ZW + c; sLast = col; sN++;
        } else {
          flushSpan();
          sRow = row; sPc = g.pc; sCol = col; sLast = col; sText = c; sN = 1;
        }
        return;
      }
      const x0 = col * cw + (offX ? offX[i] : 0), y0 = row * ch + (offY ? offY[i] : 0);
      if (g.wide) ctx.fillText(c, x0, y0 + hy, cw);
      else ctx.fillText(c, x0 + (cw - g.w) / 2, y0 + hy);
    } else if (g.cls === CLS_BLOCK) {
      const x0 = col * cw + (offX ? offX[i] : 0), y0 = row * ch + (offY ? offY[i] : 0);
      const r = BLOCK_RECTS[c];
      for (let k = 0; k < r.length; k += 4) {
        const xa = snapX(x0 + r[k] * cw), ya = snapY(y0 + r[k + 1] * ch);
        const xb = snapX(x0 + (r[k] + r[k + 2]) * cw), yb = snapY(y0 + (r[k + 1] + r[k + 3]) * ch);
        ctx.fillRect(xa, ya, xb - xa, yb - ya);
      }
    } else if (g.cls === CLS_FIT) pendFit.push(i);
    else pendBr.push(i);
  };
  const setGroup = (k: number) => {
    const al = Math.floor(k / 16777216);
    ctx.fillStyle = fillOf(k - al * 16777216);
    ctx.globalAlpha = al / 16;
  };

  if (grouped) {
    const ks = keys.subarray(0, m);
    ks.sort();
    let cur = -1;
    for (let j = 0; j < m; j++) {
      const v = ks[j];
      const i = v % SLOT;
      const k = (v - i) / SLOT;
      if (k !== cur) { flush(); cur = k; setGroup(k); }
      drawCell(i);
    }
  } else {
    let cur = -1;
    for (const i of order) {
      if (colors[i] !== cur) { flush(); cur = colors[i]; setGroup(cur); }
      drawCell(i);
    }
  }
  flush();

  if (solo.length) {
    if (spacing) sc.letterSpacing = '0px';
    ctx.textAlign = 'center';
    for (const s of solo) {
      ctx.setTransform(base);
      ctx.translate((s.i % cols) * cw + cw / 2 + s.dx, ((s.i / cols) | 0) * ch + ch / 2 + s.dy);
      if (s.r) ctx.rotate((s.r * Math.PI) / 180);
      if (s.s !== 1) ctx.scale(s.s, s.s);
      ctx.fillStyle = fillOf(s.col);
      ctx.globalAlpha = s.a;
      const g = infoOf(ctx, kit, s.c);
      if (g.cls === CLS_BLOCK) {
        const r = BLOCK_RECTS[s.c];
        for (let k = 0; k < r.length; k += 4) ctx.fillRect(-cw / 2 + r[k] * cw, -ch / 2 + r[k + 1] * ch, r[k + 2] * cw, r[k + 3] * ch);
      } else if (g.wide) ctx.fillText(s.c, 0, kit.nudge, cw);
      else ctx.fillText(s.c, 0, kit.nudge);
    }
  }
  ctx.restore();
}

function drawFitted(ctx: Ctx, base: DOMMatrix, fit: Fit | null, list: number[], glyphs: string[], cols: number, cw: number, ch: number,
  offX: Float32Array | null, offY: Float32Array | null, kit: Kit) {
  if (!fit) {
    // the font has no such glyph box (nothing measurable): draw them as plain text
    for (const i of list) {
      const w = infoOf(ctx, kit, glyphs[i]).w;
      ctx.fillText(glyphs[i], (i % cols) * cw + (cw - w) / 2 + (offX ? offX[i] : 0), ((i / cols) | 0) * ch + ch / 2 + kit.nudge + (offY ? offY[i] : 0));
    }
    return;
  }
  ctx.setTransform(base);
  ctx.scale(fit.sx, fit.sy);
  ctx.textBaseline = 'alphabetic';
  const ix = 1 / fit.sx, iy = 1 / fit.sy;
  for (const i of list) {
    const x0 = (i % cols) * cw + (offX ? offX[i] : 0), y0 = ((i / cols) | 0) * ch + (offY ? offY[i] : 0);
    ctx.fillText(glyphs[i], x0 * ix + fit.ox, y0 * iy + fit.oy);
  }
  ctx.setTransform(base);
  ctx.textBaseline = 'middle';
}
