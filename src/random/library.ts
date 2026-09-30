import type { LetterAnimKind } from '../engine/recipe';
import { ARCHETYPES, type Archetype } from './archetypes';
import type { PaletteStyle } from './palettes';

/**
 * What the Codex branch meant the dice to do with the library (its unpublished versions 5, 6 and 7,
 * merged): extra weights per style (archetype) for the new patterns, character sets, palettes and
 * letter animations. DATA ONLY: generate() does not read it (GEN_VERSION stays 4 and versions 1–4 stay
 * exact). The next generator version (5) builds its tables from it, for example
 *   TABLES[5] = { archs: libraryArchetypes(), spaces: …the spaces' weights… }
 * and weighs TEXT_ANIM_W / MSG_ANIM_W with LIBRARY_TEXT_ANIMS / LIBRARY_MSG_ANIMS when gen >= 5.
 * Every id here is checked by tests/unit/library.test.ts.
 */
type W = Record<string, number>;

/** Codex's version 5: the first batch (fractals, fields, three solids). */
const PATTERNS_A: Record<string, W> = {
  minimal: { dunas: 0.7, topografia: 0.55, entrelazado: 0.35 },
  neon: { quasicristal: 0.9, circuitos: 0.65, espirografo: 0.55, prisma: 0.45 },
  organico: { dunas: 0.9, filotaxis: 0.7, topografia: 0.7, reloj_arena: 0.35 },
  geometrico: { entrelazado: 1, circuitos: 1, quasicristal: 0.9, sierpinski: 0.7, filotaxis: 0.35, prisma: 0.45 },
  glitch: { circuitos: 0.85, sierpinski: 0.35, quasicristal: 0.3 },
  retro: { circuitos: 1, obelisco: 0.55, reloj_arena: 0.4, prisma: 0.4, topografia: 0.35 },
  cosmico: { quasicristal: 0.7, filotaxis: 0.65, espirografo: 0.55, mandelbrot: 0.5 },
  tinta: { topografia: 1, entrelazado: 0.7, filotaxis: 0.5, sierpinski: 0.5, dunas: 0.4 },
  brutal: { sierpinski: 0.7, obelisco: 0.55, quasicristal: 0.45, entrelazado: 0.5 },
  vapor: { dunas: 0.55, espirografo: 0.45, quasicristal: 0.35, prisma: 0.35 },
  solidos: { obelisco: 1.1, prisma: 1.1, reloj_arena: 1.1 },
  op: { quasicristal: 1.1, espirografo: 0.8, sierpinski: 0.6 },
  fractal: { mandelbrot: 1.2, sierpinski: 1, filotaxis: 1, espirografo: 1, quasicristal: 0.5 },
  grabado: { obelisco: 1, prisma: 1, reloj_arena: 0.8, topografia: 0.55 },
};

/** Codex's version 6: the second batch (calm fields, curves, seven solids). */
const PATTERNS_B: Record<string, W> = {
  minimal: { mareas_lentas: 0.8, jardin_zen: 0.7, respiracion: 0.7, bruma_lejana: 0.5, catenaria: 0.45, caliz: 0.35 },
  neon: { luciernagas: 0.6, simbiosis: 0.55, esferas_orbita: 0.55, campo_flujo: 0.5, medusa: 0.4 },
  organico: { bruma_lejana: 0.7, bambu: 0.65, estuario: 0.65, flor_armonica: 0.55, medusa: 0.55, estrella_mar: 0.45, simbiosis: 0.55 },
  geometrico: { apolonio: 0.7, superformula: 0.65, lemniscata: 0.5, catenaria: 0.4, pendulos: 0.5, cinta_ola: 0.45 },
  glitch: { campo_flujo: 0.55, cinta_ola: 0.4, esferas_orbita: 0.35 },
  retro: { pendulos: 0.7, catenaria: 0.55, armonografo: 0.6, caliz: 0.35 },
  cosmico: { luciernagas: 0.55, esferas_orbita: 0.65, jade_vivo: 0.55, superformula: 0.5 },
  tinta: { bambu: 0.7, jardin_zen: 0.75, armonografo: 0.7, catenaria: 0.5, apolonio: 0.4, flor_armonica: 0.45 },
  brutal: { superformula: 0.7, lemniscata: 0.55, cinta_ola: 0.4, jade_vivo: 0.35 },
  vapor: { mareas_lentas: 0.7, lluvia_mansa: 0.7, estuario: 0.55, medusa: 0.5, luciernagas: 0.45 },
  solidos: { simbiosis: 1.1, pendulos: 1, cinta_ola: 1, jade_vivo: 1, caliz: 0.9, medusa: 1.1, esferas_orbita: 1 },
  op: { lemniscata: 0.8, superformula: 0.8, apolonio: 0.7, flor_armonica: 0.7, armonografo: 0.6 },
  fractal: { apolonio: 0.8, superformula: 0.7, flor_armonica: 0.7, armonografo: 0.55 },
  grabado: { bambu: 0.5, caliz: 0.7, catenaria: 0.75, jardin_zen: 0.7, pendulos: 0.55 },
};

/** Codex's version 7: the twelve particle motions. */
const PARTICLES: Record<string, W> = {
  minimal: { ondas_estelares: 0.6, nieve_orbital: 0.55, floracion_luz: 0.45 },
  neon: { estela_cometas: 0.7, orbitas_gemelas: 0.65, vortice_polvo: 0.65, enjambre_vivo: 0.5 },
  organico: { cardumen_luz: 0.7, floracion_luz: 0.65, mariposa_puntos: 0.6, enjambre_vivo: 0.5 },
  geometrico: { constelacion_dinamica: 0.65, orbitas_gemelas: 0.65, ondas_estelares: 0.5 },
  glitch: { enjambre_vivo: 0.65, lluvia_ascendente: 0.55, vortice_polvo: 0.5 },
  retro: { lluvia_ascendente: 0.65, constelacion_dinamica: 0.45 },
  cosmico: { constelacion_dinamica: 0.75, orbitas_gemelas: 0.65, vortice_polvo: 0.65, estela_cometas: 0.55 },
  tinta: { nieve_orbital: 0.55, floracion_luz: 0.6, mariposa_puntos: 0.5 },
  brutal: { vortice_polvo: 0.55, corazon_particulas: 0.35, estela_cometas: 0.55 },
  vapor: { cardumen_luz: 0.6, ondas_estelares: 0.65, nieve_orbital: 0.6 },
  solidos: { orbitas_gemelas: 0.5, enjambre_vivo: 0.5 },
  op: { ondas_estelares: 0.6, constelacion_dinamica: 0.5 },
  fractal: { floracion_luz: 0.6, vortice_polvo: 0.6, mariposa_puntos: 0.5 },
  grabado: { constelacion_dinamica: 0.5, nieve_orbital: 0.5 },
};

/** Every style's extra pattern weights (the three tables above; their ids do not overlap). */
export const LIBRARY_PATTERNS: Readonly<Record<string, W>> = Object.fromEntries(
  ARCHETYPES.map(a => [a.id, { ...PATTERNS_A[a.id], ...PATTERNS_B[a.id], ...PARTICLES[a.id] }]),
);

/** The new character sets, in the moods of each style (Codex's version 6). */
export const LIBRARY_CHARSETS: Readonly<Record<string, W>> = {
  minimal: { media_luna: 1, tejido_fino: 0.7, sismografo: 0.55 },
  neon: { diagonales: 0.8, media_luna: 0.5, barras_ascii: 0.6 },
  organico: { pincel: 0.8, media_luna: 0.65, sismografo: 0.5 },
  geometrico: { marcos: 0.9, diagonales: 0.75, tejido_fino: 0.65 },
  glitch: { terminal_densa: 0.8, barras_ascii: 0.75, puntuacion: 0.5 },
  retro: { terminal_densa: 1, barras_ascii: 0.6, numeros: 0.5 },
  cosmico: { media_luna: 0.8, diagonales: 0.55, puntuacion: 0.45 },
  tinta: { pincel: 1, tejido_fino: 0.5, puntuacion: 0.4 },
  brutal: { marcos: 1, diagonales: 0.8, barras_ascii: 0.7 },
  vapor: { media_luna: 0.7, sismografo: 0.65, pincel: 0.45 },
  solidos: { terminal_densa: 0.6, diagonales: 0.5, marcos: 0.5 },
  op: { diagonales: 1, marcos: 0.75, sismografo: 0.65 },
  fractal: { sismografo: 0.7, tejido_fino: 0.65, media_luna: 0.5 },
  grabado: { pincel: 0.9, marcos: 0.7, barras_ascii: 0.55 },
};

/** The gallery's palettes, for every style (Codex's version 7 gave them 0.75 everywhere). */
export const LIBRARY_PALETTES: Readonly<Record<string, Partial<Record<PaletteStyle, number>>>> = Object.fromEntries(
  ARCHETYPES.map(a => [a.id, { galeria: 0.75 }]),
);

/** Weights of the three new letter animations, next to TEXT_ANIM_W / MSG_ANIM_W in generator.ts. */
export const LIBRARY_TEXT_ANIMS: Readonly<Partial<Record<LetterAnimKind, number>>> = { orbita: 0.85, enjambre: 0.7, cascada: 0.85 };
export const LIBRARY_MSG_ANIMS: Readonly<Partial<Record<LetterAnimKind, number>>> = { orbita: 0.75, enjambre: 0.55, cascada: 0.8 };

/** The styles with the library's weights added (new objects: ARCHETYPES is not changed). */
export function libraryArchetypes(base: readonly Archetype[] = ARCHETYPES): Archetype[] {
  return base.map(a => ({
    ...a,
    patterns: { ...a.patterns, ...LIBRARY_PATTERNS[a.id] },
    charsets: { ...a.charsets, ...LIBRARY_CHARSETS[a.id] },
    palettes: { ...a.palettes, ...LIBRARY_PALETTES[a.id] },
  }));
}
