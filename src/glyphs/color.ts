/**
 * Colour of each character: the ink (mono), the picture's own colour under the cell (source) or the nearest
 * colour of a palette (palette). One resolver serves the canvas drawing, the text/ANSI/HTML snapshot and the
 * SVG, so every output of a grid shows the same colours.
 */
import type { GlyphStyle } from '../project/types';
import type { GlyphGrid } from './index';

/** '#rgb', '#rrggbb' or '#rrggbbaa' → 0xrrggbb (alpha ignored); bad input → fallback. */
export function parseHex(s: string | null | undefined, fallback = 0xede6da): number {
  if (typeof s !== 'string') return fallback;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s.trim());
  if (!m) return fallback;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return parseInt(h.slice(0, 6), 16);
}

const HEX: string[] = [];
/** 0xrrggbb → '#rrggbb' (cached for the colours drawing asks for most). */
export function hex24(v: number): string {
  if (v < 0x8000 && HEX[v]) return HEX[v];
  const s = '#' + (v & 0xffffff).toString(16).padStart(6, '0');
  if (v < 0x8000) HEX[v] = s;
  return s;
}

/** Perceptual-ish RGB distance («redmean»): cheap and much closer to what the eye sees than plain RGB. */
function dist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const rm = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

/** Index of the palette colour nearest to r,g,b. */
export function nearestIndex(pal: number[], r: number, g: number, b: number): number {
  let best = 0, bd = Infinity;
  for (let k = 0; k < pal.length; k++) {
    const p = pal[k];
    const d = dist(r, g, b, p >> 16, (p >> 8) & 255, p & 255);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/** The colour each cell is drawn with (0xrrggbb per cell) for this style. */
export function cellColors(grid: GlyphGrid, style: Pick<GlyphStyle, 'color' | 'ink' | 'palette'>): Uint32Array {
  const n = grid.cols * grid.rows;
  const out = new Uint32Array(n);
  const ink = parseHex(style.ink);
  const pal = (style.palette ?? []).map(p => parseHex(p, -1)).filter(p => p >= 0);
  const rgb = grid.rgb;
  if (style.color === 'source') {
    for (let i = 0; i < n; i++) out[i] = (rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2];
  } else if (style.color === 'palette' && pal.length) {
    const memo = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const k = (rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2];
      let c = memo.get(k);
      if (c === undefined) { c = pal[nearestIndex(pal, rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])]; memo.set(k, c); }
      out[i] = c;
    }
  } else {
    out.fill(ink);
  }
  return out;
}
