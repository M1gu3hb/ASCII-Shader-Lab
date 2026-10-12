import type { Layer } from '../engine/recipe';
import type { BasicPattern } from '../engine/basic/patterns';
import type { FamilyHost } from './host';
import { currentPX } from '../engine/basic/px';
import { analyticOf } from './models';
import { packParams } from './params';
import { familyById } from './registry';
import { sampleRaster } from './sample';
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
  const meta = familyById(l.pattern);
  if (!meta || !l.fam) return null;
  if (meta.kind === 'analytic') {
    const impl = analyticOf(meta.id);
    if (!impl) return meta.color ? EMPTY_COLOUR : EMPTY;
    const k = packParams(meta, l.fam.p);
    const cpuColor = impl.cpuColor;
    return {
      f: (x, y, t) => impl.cpu(x, y, t, k),
      prep: impl.prep ? t => impl.prep!(t, k, pal, currentPX()) : undefined,
      ...(meta.color && cpuColor ? { col: (x: number, y: number, t: number, out: Float64Array) => cpuColor(x, y, t, k, out) } : {}),
    };
  }
  const R = host?.raster(i);
  if (!R) return EMPTY;
  return { f: (x, y) => sampleRaster(R, x, y) };
}
