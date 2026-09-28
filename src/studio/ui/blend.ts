import type { BlendMode } from '../../engine/recipe';

/**
 * The engine's blend (GLSL_BLEND in engine/glsl/core.ts) in TypeScript, for the pickers' diagrams:
 * `a` is what is below, `b` this layer, at full strength. Kept in step with the shader by a unit test.
 */
const BLEND_INDEX: Record<BlendMode, number> = {
  normal: 0, add: 1, multiply: 2, screen: 3, overlay: 4, difference: 5, lighten: 6, darken: 7, mask: 8, cutout: 9, subtract: 10,
};

const smooth = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export function blendValue(mode: BlendMode, a: number, b: number): number {
  let r = b;
  switch (BLEND_INDEX[mode]) {
    case 1: r = a + b; break;
    case 2: r = a * b; break;
    case 3: r = 1 - (1 - a) * (1 - b); break;
    case 4: r = a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b); break;
    case 5: r = Math.abs(a - b); break;
    case 6: r = Math.max(a, b); break;
    case 7: r = Math.min(a, b); break;
    case 8: r = a * smooth(0.42, 0.58, b); break;
    case 9: r = a * (1 - smooth(0.42, 0.58, b)); break;
    case 10: r = a - b; break;
  }
  return Math.max(0, Math.min(1, r));
}

/** The index the shader uses for each mode (the order of `m` in GLSL_BLEND). */
export const blendIndex = (m: BlendMode) => BLEND_INDEX[m];
