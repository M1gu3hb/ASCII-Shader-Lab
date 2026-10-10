import { hexToRgb } from '../engine/color';
import type { Recipe } from '../engine/recipe';
import { isColorFamily } from './registry';
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

/** Whether a piece's cells carry their own colour from a colour family (its pattern source has one on). */
export const hasColourFamily = (r: Recipe) => r.source === 'pattern' && r.layers.filter(l => l.on).slice(0, 4).some(l => isColorFamily(l.pattern));
