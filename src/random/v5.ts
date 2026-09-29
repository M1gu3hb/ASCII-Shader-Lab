import { ARCHETYPES, type Archetype } from './archetypes';
import { SPACES } from './spaces';

/** Additive pools for generator 5: versions 1–4 keep their original weights. */
const ADD: Record<string, Record<string, number>> = {
  minimal: { dunas: .7, topografia: .55, entrelazado: .35 },
  neon: { quasicristal: .9, circuitos: .65, espirografo: .55, prisma: .45 },
  organico: { dunas: .9, filotaxis: .7, topografia: .7, reloj_arena: .35 },
  geometrico: { entrelazado: 1, circuitos: 1, quasicristal: .9, sierpinski: .7, filotaxis: .35, prisma: .45 },
  glitch: { circuitos: .85, sierpinski: .35, quasicristal: .3 },
  retro: { circuitos: 1, obelisco: .55, reloj_arena: .4, prisma: .4, topografia: .35 },
  cosmico: { quasicristal: .7, filotaxis: .65, espirografo: .55, mandelbrot: .5 },
  tinta: { topografia: 1, entrelazado: .7, filotaxis: .5, sierpinski: .5, dunas: .4 },
  brutal: { sierpinski: .7, obelisco: .55, quasicristal: .45, entrelazado: .5 },
  vapor: { dunas: .55, espirografo: .45, quasicristal: .35, prisma: .35 },
  solidos: { obelisco: 1.1, prisma: 1.1, reloj_arena: 1.1 },
  op: { quasicristal: 1.1, espirografo: .8, sierpinski: .6 },
  fractal: { mandelbrot: 1.2, sierpinski: 1, filotaxis: 1, espirografo: 1, quasicristal: .5 },
  grabado: { obelisco: 1, prisma: 1, reloj_arena: .8, topografia: .55 },
};

export const ARCHETYPES_V5: readonly Archetype[] = ARCHETYPES.map(a => ({
  ...a, patterns: { ...a.patterns, ...ADD[a.id] },
}));
export const SPACE_ARCHS_V5: Record<string, Record<string, number>> = Object.fromEntries(
  SPACES.map(s => [s.id, { ...s.archs }]),
);
