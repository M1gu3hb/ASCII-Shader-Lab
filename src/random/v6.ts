import type { Archetype } from './archetypes';
import { ARCHETYPES_V5, SPACE_ARCHS_V5 } from './v5';

/** Additive weights; version 5 and earlier continue to replay exactly. */
const ADD: Record<string, Record<string, number>> = {
  minimal: { mareas_lentas: .8, jardin_zen: .7, respiracion: .7, bruma_lejana: .5, catenaria: .45, caliz: .35 },
  neon: { luciernagas: .6, simbiosis: .55, esferas_orbita: .55, campo_flujo: .5, medusa: .4 },
  organico: { bruma_lejana: .7, bambu: .65, estuario: .65, flor_armonica: .55, medusa: .55, estrella_mar: .45, simbiosis: .55 },
  geometrico: { apolonio: .7, superformula: .65, lemniscata: .5, catenaria: .4, pendulos: .5, cinta_ola: .45 },
  glitch: { campo_flujo: .55, cinta_ola: .4, esferas_orbita: .35 },
  retro: { pendulos: .7, catenaria: .55, armonografo: .6, caliz: .35 },
  cosmico: { luciernagas: .55, esferas_orbita: .65, jade_vivo: .55, superformula: .5 },
  tinta: { bambu: .7, jardin_zen: .75, armonografo: .7, catenaria: .5, apolonio: .4, flor_armonica: .45 },
  brutal: { superformula: .7, lemniscata: .55, cinta_ola: .4, jade_vivo: .35 },
  vapor: { mareas_lentas: .7, lluvia_mansa: .7, estuario: .55, medusa: .5, luciernagas: .45 },
  solidos: { simbiosis: 1.1, pendulos: 1, cinta_ola: 1, jade_vivo: 1, caliz: .9, medusa: 1.1, esferas_orbita: 1 },
  op: { lemniscata: .8, superformula: .8, apolonio: .7, flor_armonica: .7, armonografo: .6 },
  fractal: { apolonio: .8, superformula: .7, flor_armonica: .7, armonografo: .55 },
  grabado: { bambu: .5, caliz: .7, catenaria: .75, jardin_zen: .7, pendulos: .55 },
};

/** The new character ramps belong to the same coherent moods as the patterns. */
const GLYPHS: Record<string, Record<string, number>> = {
  minimal: { media_luna: 1, tejido_fino: .7, sismografo: .55 },
  neon: { diagonales: .8, media_luna: .5, barras_ascii: .6 },
  organico: { pincel: .8, media_luna: .65, sismografo: .5 },
  geometrico: { marcos: .9, diagonales: .75, tejido_fino: .65 },
  glitch: { terminal_densa: .8, barras_ascii: .75, puntuacion: .5 },
  retro: { terminal_densa: 1, barras_ascii: .6, numeros: .5 },
  cosmico: { media_luna: .8, diagonales: .55, puntuacion: .45 },
  tinta: { pincel: 1, tejido_fino: .5, puntuacion: .4 },
  brutal: { marcos: 1, diagonales: .8, barras_ascii: .7 },
  vapor: { media_luna: .7, sismografo: .65, pincel: .45 },
  solidos: { terminal_densa: .6, diagonales: .5, marcos: .5 },
  op: { diagonales: 1, marcos: .75, sismografo: .65 },
  fractal: { sismografo: .7, tejido_fino: .65, media_luna: .5 },
  grabado: { pincel: .9, marcos: .7, barras_ascii: .55 },
};

export const ARCHETYPES_V6: readonly Archetype[] = ARCHETYPES_V5.map(a => ({
  ...a, patterns: { ...a.patterns, ...ADD[a.id] }, charsets: { ...a.charsets, ...GLYPHS[a.id] },
}));
export const SPACE_ARCHS_V6: Record<string, Record<string, number>> = Object.fromEntries(
  Object.entries(SPACE_ARCHS_V5).map(([id, archs]) => [id, { ...archs }]),
);
