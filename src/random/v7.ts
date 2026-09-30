import type { Archetype } from './archetypes';
import { ARCHETYPES_V6, SPACE_ARCHS_V6 } from './v6';

/** New particle fields and gallery colors enter only version 7: old seeds still replay. */
const PARTICLES: Record<string, Record<string, number>> = {
  minimal: { ondas_estelares: .6, nieve_orbital: .55, floracion_luz: .45 },
  neon: { estela_cometas: .7, orbitas_gemelas: .65, vortice_polvo: .65, enjambre_vivo: .5 },
  organico: { cardumen_luz: .7, floracion_luz: .65, mariposa_puntos: .6, enjambre_vivo: .5 },
  geometrico: { constelacion_dinamica: .65, orbitas_gemelas: .65, ondas_estelares: .5 },
  glitch: { enjambre_vivo: .65, lluvia_ascendente: .55, vortice_polvo: .5 },
  retro: { lluvia_ascendente: .65, constelacion_dinamica: .45 },
  cosmico: { constelacion_dinamica: .75, orbitas_gemelas: .65, vortice_polvo: .65, estela_cometas: .55 },
  tinta: { nieve_orbital: .55, floracion_luz: .6, mariposa_puntos: .5 },
  brutal: { vortice_polvo: .55, corazon_particulas: .35, estela_cometas: .55 },
  vapor: { cardumen_luz: .6, ondas_estelares: .65, nieve_orbital: .6 },
  solidos: { orbitas_gemelas: .5, enjambre_vivo: .5 },
  op: { ondas_estelares: .6, constelacion_dinamica: .5 },
  fractal: { floracion_luz: .6, vortice_polvo: .6, mariposa_puntos: .5 },
  grabado: { constelacion_dinamica: .5, nieve_orbital: .5 },
};

export const ARCHETYPES_V7: readonly Archetype[] = ARCHETYPES_V6.map(a => ({
  ...a,
  patterns: { ...a.patterns, ...PARTICLES[a.id] },
  palettes: { ...a.palettes, galeria: .75 },
}));
export const SPACE_ARCHS_V7: Record<string, Record<string, number>> = Object.fromEntries(
  Object.entries(SPACE_ARCHS_V6).map(([id, archs]) => [id, { ...archs }]),
);
