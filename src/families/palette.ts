import { hexToRgb } from '../engine/color';
import type { Recipe } from '../engine/recipe';
import { famColours, famReads } from './params';
import { familyById, isColorFamily, isColourRaster } from './registry';
import type { Palette } from './types';

/**
 * Colour families (FamilyMeta.color) read the piece's palette: its stops, dark → light, as sRGB 0..1. The
 * shader gets the same six colours (uPal, uPalN) that the CPU twin gets here.
 */
export function paletteOf(stops: readonly string[], out?: Palette): Palette {
  const p = out ?? { n: 0, rgb: new Float32Array(18) };
  const list = stops.length ? stops.slice(0, 6) : ['#000000', '#ffffff'];
  p.n = list.length;
  p.rgb.fill(0);
  list.forEach((h, i) => { const c = hexToRgb(h); p.rgb[i * 3] = Math.fround(c[0]); p.rgb[i * 3 + 1] = Math.fround(c[1]); p.rgb[i * 3 + 2] = Math.fround(c[2]); });
  return p;
}

/** A raster colour family layer whose run gives its cells colour (FamilyMeta.colorSince), and whether it reads the source. */
function rasterColour(l: Recipe['layers'][number]): { gives: boolean; reads: boolean } {
  if (!l.fam || !isColourRaster(l.pattern)) return { gives: false, reads: false };
  const meta = familyById(l.pattern);
  const v = typeof l.fam.v === 'number' ? l.fam.v : meta?.version ?? 1;
  return meta ? { gives: famColours(meta, v), reads: famReads(meta, v, 'source') } : { gives: false, reads: false };
}

/**
 * Whether a piece's cells carry their own colour from a colour family: its pattern source has one on, or (text
 * source) a raster colour family that reads the words gives the letters' cells their colour (it draws them).
 */
export const hasColourFamily = (r: Recipe) => {
  const on = r.layers.filter(l => l.on).slice(0, 4);
  if (r.source === 'pattern') return on.some(l => isColorFamily(l.pattern) || rasterColour(l).gives);
  if (r.source === 'text') return on.some(l => { const c = rasterColour(l); return c.gives && c.reads; });
  return false;
};
