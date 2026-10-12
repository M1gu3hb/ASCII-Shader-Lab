import type { Layer } from '../engine/recipe';
import type { BasicPattern } from '../engine/basic/patterns';
import type { FamilyHost } from './host';
import { currentPX } from '../engine/basic/px';
import { analyticOf } from './models';
import { checkedFam, famReads, packParams } from './params';
import { familyById, isColorFamily, isFamily } from './registry';
import { sampleRaster, sampleRasterC } from './sample';
import type { Palette } from './types';

const EMPTY: BasicPattern = { f: () => 0 };
// a colour family whose code has not arrived: no ink, and black like the shader's stub
const EMPTY_COLOUR: BasicPattern = { f: () => 0, col: (_x, _y, _t, out) => { out[0] = out[1] = out[2] = 0; } };

/**
 * The basic engine's pattern for a family layer (layer index i among the on-layers): the raster its run
 * computed, sampled as the shader samples it, or the CPU twin of an analytic family with its packed
 * parameters. Null for layers that are not families. A family whose code has not arrived draws empty.
 */
export function familyPattern(l: Layer, i: number, host: FamilyHost | null | undefined, pal?: Palette): BasicPattern | null {
  if (!l.fam || !isFamily(l.pattern)) return null;
  // a family whose spec has not arrived draws empty, like one whose code has not
  const meta = familyById(l.pattern);
  if (!meta) return isColorFamily(l.pattern) ? EMPTY_COLOUR : EMPTY;
  if (meta.kind === 'analytic') {
    const impl = analyticOf(meta.id);
    if (!impl) return meta.color ? EMPTY_COLOUR : EMPTY;
    const fam = checkedFam(meta, l.fam);
    const k = packParams(meta, fam.p, undefined, fam.v);
    const cpuColor = impl.cpuColor;
    return {
      f: (x, y, t) => impl.cpu(x, y, t, k),
      prep: impl.prep ? t => impl.prep!(t, k, pal, currentPX()) : undefined,
      ...(meta.color && cpuColor ? { col: (x: number, y: number, t: number, out: Float64Array) => cpuColor(x, y, t, k, out) } : {}),
      ...(famReads(meta, fam.v, 'source') || famReads(meta, fam.v, 'below') ? { reads: true, srcColour: meta.color && famReads(meta, fam.v, 'source') } : {}),
    };
  }
  const R = host?.raster(i);
  if (!R) return EMPTY;
  // a colour family's raster: the cell's colour where its run gives it (and, like the shader, nothing of SC otherwise);
  // one that reads the piece gives the picture's or the letters' cells its colour (SRCC in the shader)
  if (meta.color && R.rgb) {
    const reads = famReads(meta, checkedFam(meta, l.fam).v, 'source');
    return { f: (x, y) => sampleRaster(R, x, y), col: (x, y, _t, out) => { sampleRasterC(R, x, y, out); }, ...(reads ? { reads: true, srcColour: true } : {}) };
  }
  return { f: (x, y) => sampleRaster(R, x, y) };
}
