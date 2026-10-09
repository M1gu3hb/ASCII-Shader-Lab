import { FRACTAL3D_GLSL } from './fractal3d';

/**
 * GLSL chunks of the analytic families, each defining `float F_<id>(vec2 p, float t, vec4 k0, vec4 k1)`
 * (p in screen heights, y up; t the layer's time; k0/k1 the first eight parameters, see params.ts
 * packParams). The field shader includes only the ones a piece uses.
 */
export const FAMILY_GLSL: Record<string, string> = {
  fractal_3d: FRACTAL3D_GLSL,
};
