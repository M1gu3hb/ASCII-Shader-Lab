import type { Optics } from './recipe';

/** The glass's uniforms (glsl/optics.ts): the same numbers for the shader and the CPU port. */
export function opticsUniforms(o: Optics): { a: [number, number, number, number]; b: [number, number, number, number] } {
  return {
    a: [o.kind === 'lluvia' ? 1 : 2, o.amount, o.scale, o.speed],
    b: [(o.angle * Math.PI) / 180, o.profile, o.shine, o.fog],
  };
}
