import { cloneRecipe, type Recipe } from '../engine/recipe';
import type { LockGroup } from './spaces';

/** Puts back a locked group of `base` into a freshly woven recipe (every generator version). */
export function copyGroup(r: Recipe, base: Recipe, g: LockGroup) {
  const b = cloneRecipe(base);
  switch (g) {
    case 'forma': r.layers = b.layers; r.motion.warp = b.motion.warp; r.motion.warpScale = b.motion.warpScale; break;
    case 'color': r.color = b.color; break;
    case 'glifos': r.glyph = b.glyph; r.tone = b.tone; break;
    case 'movimiento':
      r.motion = { ...b.motion, warp: r.motion.warp, warpScale: r.motion.warpScale };
      r.interact = b.interact; break;
    case 'efectos': r.fx = b.fx; break;
    case 'fuente': r.source = b.source; r.media = b.media; r.text = b.text; r.msg = b.msg; break;
  }
}
