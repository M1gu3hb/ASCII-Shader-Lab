import type { Archetype } from './archetypes';
import { libraryArchetypes } from './library';
import type { SpaceId } from './spaces';
import { ARCHETYPES_V2 } from './v2';

/*
 * Generator version 5: its styles and each space's weights over them. Built from the fourteen styles of
 * versions 2–4 with the pattern library's weights (library.ts: its patterns, character sets and particle
 * motions) and this version's palettes (palettes5.ts), plus five new styles. Measured and tuned with
 * scripts/azar-report.mjs and the contact sheets of dev/azar.html; once published, never edited (a later
 * change is version 6).
 */

type W = Record<string, number>;

/** Palettes of version 5 per style (the gallery by mood, and the new families of palettes5.ts). */
const PALETTES5: Record<string, W> = {
  minimal: { acento: 1.4, mono5: 1, 'g-calma': 1.6, pastel5: 1, papel5: 1, noche: 0.9, duo: 0.5 },
  neon: { neon: 1.5, vivo: 1.4, 'g-energia': 1.4, noche: 1, triada: 0.8, duo: 0.8, curado5: 0.6 },
  organico: { vivo: 1.2, 'g-naturaleza': 1, noche: 1, 'g-calma': 0.8, pastel5: 0.8, mono5: 0.8, curado5: 0.8, triada: 0.5 },
  geometrico: { duo: 1.4, cartel: 1.2, triada: 1, acento: 1, papel5: 0.8, riso: 0.8, vivo: 0.8 },
  glitch: { neon: 1.4, duo: 1.2, acento: 1, fosforo: 0.6, triada: 0.8, 'g-energia': 1, cartel: 0.5 },
  retro: { fosforo: 3.5, acento: 0.6, noche: 0.6, curado5: 0.5 },
  cosmico: { 'g-cosmos': 2, noche: 1.5, vivo: 1, neon: 0.8, triada: 0.6, cosmico: 0.6 },
  tinta: { papel5: 2, riso: 1.5, 'g-tinta': 1.8, cartel: 0.8, pastel5: 0.6, duo: 0.4 },
  brutal: { cartel: 2, duo: 1.4, acento: 1.2, riso: 0.8, triada: 0.5 },
  vapor: { pastel5: 1.6, neon: 1.2, vivo: 1, noche: 1, triada: 0.8, 'g-energia': 0.6 },
  solidos: { noche: 1.4, vivo: 1.2, acento: 1.2, fosforo: 0.8, 'g-cosmos': 0.8, mono5: 1, duo: 0.8 },
  op: { acento: 1.2, duo: 1.4, cartel: 1.2, triada: 0.8, gris: 0.4 },
  fractal: { vivo: 1.3, 'g-cosmos': 1, triada: 1, noche: 1, 'g-energia': 0.8, papel5: 0.6, duo: 0.6 },
  grabado: { papel5: 2, 'g-tinta': 1.5, riso: 1.2, cartel: 0.8, pastel5: 0.5 },
};

/** Other changes to the styles of versions 2–4 (fewer greys and dim shades; a particle motion over a field now and then). */
const TWEAKS: Record<string, Partial<Archetype>> = {
  minimal: { shade: [0, 0.15], particleOverlay: 0.12 },
  organico: { particleOverlay: 0.2 },
  cosmico: { particleOverlay: 0.3 },
  neon: { particleOverlay: 0.15 },
  vapor: { particleOverlay: 0.15 },
  fractal: { particleOverlay: 0.12 },
  tinta: { shade: [0, 0.2] },
  grabado: { shade: [0, 0.15] },
};

/** The five styles version 5 adds. */
const NEW: Archetype[] = [
  {
    id: 'particulas', name: 'Partículas', blurb: 'Enjambres, cometas, nieve y constelaciones que se mueven solos sobre un fondo con color.',
    patterns: {
      enjambre_vivo: 1, estela_cometas: 1, lluvia_ascendente: 0.8, orbitas_gemelas: 1, corazon_particulas: 0.6, cardumen_luz: 1,
      vortice_polvo: 1, ondas_estelares: 0.9, mariposa_puntos: 0.9, nieve_orbital: 0.9, floracion_luz: 1, constelacion_dinamica: 1, luciernagas: 0.6,
    },
    overlays: { bruma_lejana: 1, mareas_lentas: 1, nube: 0.8, estrellas: 1, respiracion: 0.8, aurora: 0.7, campo_flujo: 0.6 },
    layers: [1, 2], blends: { screen: 2, add: 1.2, lighten: 1 },
    palettes: { noche: 1.6, vivo: 1.4, 'g-cosmos': 1.2, 'g-energia': 1, neon: 1, triada: 0.8, duo: 0.6 },
    charsets: { puntos: 1.5, estrellas: 1.2, suave: 1, media_luna: 1, puntuacion: 0.8, detallado: 0.8, diagonales: 0.6, clasico: 0.6 },
    fonts: { jetbrains: 1.5, plex: 1, martian: 1, space: 0.8 }, weights: [400, 700],
    cell: [7, 11], glyphModes: { density: 6, scramble: 0.5 }, speed: [0.5, 1.1], scale: [0.85, 1.3],
    warp: [0.1, 0.05, 0.25], fx: { glow: [0.6, 0.2, 0.7], bloom: [0.5, 0.2, 0.8], vig: [0.5, 0.2, 0.45] },
    interact: { swirl: 2, repel: 1.5, ripple: 1, lens: 1, light: 0.8 }, colorMap: { luma: 3, radial: 1, angle: 0.6, noise: 0.5 },
    contrast: [1, 1.35], cycle: [0.25, 0.02, 0.1],
  },
  {
    id: 'curvas', name: 'Curvas', blurb: 'Armonógrafos, espirógrafos, lemniscatas y flores: líneas que se dibujan solas.',
    patterns: {
      armonografo: 1.2, espirografo: 1.2, lemniscata: 1, superformula: 1, catenaria: 0.9, flor_armonica: 1, apolonio: 0.9,
      rosa: 0.9, lissajous: 1, estrella_mar: 0.6, filotaxis: 0.7,
    },
    overlays: { trama: 0.8, estrellas: 0.8, nieve_orbital: 0.6, ondas_estelares: 0.5 },
    layers: [1, 2], blends: { screen: 1.5, multiply: 1, difference: 0.6 },
    palettes: { papel5: 1.4, cartel: 1, duo: 1.2, vivo: 1.2, 'g-tinta': 1, noche: 1, acento: 0.8 },
    charsets: { detallado: 1.2, clasico: 1, puntos: 1, lineas: 1, diagonales: 0.9, pincel: 0.8, tejido_fino: 0.7, geometria: 0.6 },
    fonts: { plex: 1.2, jetbrains: 1.2, serif: 0.6, martian: 1, space: 0.8 }, weights: [300, 700],
    cell: [6, 10], glyphModes: { density: 5, lines: 1.2 }, speed: [0.35, 0.9], scale: [0.85, 1.2],
    warp: [0.08, 0.05, 0.2], fx: { glow: [0.35, 0.15, 0.5], grain: [0.25, 0.04, 0.15], vig: [0.4, 0.15, 0.4] },
    interact: { lens: 1.5, swirl: 1.2, paint: 0.8, light: 1 }, colorMap: { luma: 2.5, angle: 1, radial: 1, x: 0.6 },
    contrast: [1.05, 1.45], edge: [0.2, 0.2, 0.5],
  },
  {
    id: 'calma', name: 'Calma', blurb: 'Bruma, mareas y respiraciones lentas: fondos serenos que no apagan el color.',
    patterns: {
      bruma_lejana: 1.2, mareas_lentas: 1.2, respiracion: 1, jardin_zen: 1, lluvia_mansa: 1, estuario: 1, dunas: 1, topografia: 0.9,
      campo_flujo: 0.9, aurora: 0.8, nube: 0.8, ondas: 0.7, bambu: 0.6,
    },
    overlays: { nieve_orbital: 1, ondas_estelares: 0.8, luciernagas: 1, estrellas: 0.6, cardumen_luz: 0.5 },
    layers: [1, 2], blends: { screen: 1.6, lighten: 1, overlay: 0.8, multiply: 0.6 },
    palettes: { 'g-calma': 2, 'g-naturaleza': 0.9, pastel5: 1.2, noche: 1.3, mono5: 0.9, papel5: 0.6, acento: 0.5, vivo: 0.5 },
    charsets: { suave: 1.5, puntos: 1.5, minimo: 1, media_luna: 1, tejido_fino: 0.8, sismografo: 0.8, puntuacion: 0.6, clasico: 0.6 },
    fonts: { jetbrains: 1.5, plex: 1.5, martian: 0.6, system: 0.6 }, weights: [300, 500],
    cell: [9, 15], glyphModes: { density: 1 }, speed: [0.18, 0.5], scale: [0.8, 1.4],
    warp: [0.35, 0.1, 0.4], fx: { vig: [0.5, 0.1, 0.35], grain: [0.2, 0.03, 0.12], glow: [0.25, 0.1, 0.35] },
    interact: { ripple: 2, light: 1.5, swirl: 1, paint: 0.5 }, colorMap: { luma: 3, y: 1.2, radial: 0.8, noise: 0.6 },
    contrast: [0.9, 1.2], shade: [0, 0.1], particleOverlay: 0.35,
  },
  {
    id: 'cartel', name: 'Cartel', blurb: 'Colores planos a todo volumen: tinta sobre papel de color, bloques grandes y mucho contraste.',
    patterns: {
      forma: 1.2, cuadros: 1, anillos: 1, franjas: 1, estrella: 1, rayos: 0.8, tablero: 0.8, superformula: 1, sierpinski: 0.8,
      quasicristal: 0.8, truchet: 0.8, hex: 0.7, latido: 0.6, espiral: 0.6, entrelazado: 0.6,
    },
    layers: [1, 2], blends: { multiply: 1.5, difference: 1.5, mask: 1, cutout: 0.8 },
    palettes: { cartel: 3, duo: 1.2, triada: 0.8, riso: 0.8, acento: 0.6 },
    charsets: { bloques: 1.6, medios: 1.2, marcos: 1, cajas: 1, clasico: 1, geometria: 0.8, barras_ascii: 0.6 },
    fonts: { martian: 2, space: 1.2, pixel: 0.8, silk: 0.6, jetbrains: 0.8 }, weights: [700, 800],
    cell: [12, 24], aspect: [1, 1.4], glyphModes: { density: 5, lines: 0.4 }, speed: [0.3, 1], scale: [0.7, 1.25],
    warp: [0.15, 0.05, 0.25], fx: { cellBg: [0.35, 0.15, 0.55], grid: [0.2, 0.2, 0.6] },
    interact: { repel: 1.5, lens: 1.5, erase: 1, ripple: 0.8 }, colorMap: { luma: 3, x: 0.8, y: 0.6 },
    contrast: [1.3, 2], levels: [0.45, 2, 5], hold: [0.25, 4, 10], pulse: [0.25, 0.3, 0.8],
  },
  {
    id: 'escena', name: 'Escenas', blurb: 'Un campo y un enjambre que se mueven cada uno a su ritmo, como las escenas compuestas del estudio.',
    // the layers, palette and characters come from a scene (scenes5.ts); these weights are the fallbacks
    patterns: { bruma_lejana: 1, mareas_lentas: 1, campo_flujo: 1, respiracion: 1, catenaria: 0.8, bambu: 0.8, jade_vivo: 0.6 },
    overlays: { constelacion_dinamica: 1, nieve_orbital: 1, estela_cometas: 1, floracion_luz: 1, orbitas_gemelas: 1, cardumen_luz: 1 },
    layers: [2, 2], blends: { screen: 3, add: 1 },
    palettes: { 'g-cosmos': 1, 'g-calma': 1, 'g-naturaleza': 1, 'g-energia': 1, 'g-tinta': 0.8, noche: 0.8, vivo: 0.8 },
    charsets: { detallado: 1, suave: 1, puntos: 1, puntuacion: 0.8, diagonales: 0.8, barras_ascii: 0.6, media_luna: 0.8, pincel: 0.6 },
    fonts: { jetbrains: 1.5, plex: 1, martian: 1 }, weights: [400, 600],
    cell: [7, 10], glyphModes: { density: 1 }, speed: [0.3, 0.7], scale: [0.9, 1.3],
    warp: [0.1, 0.05, 0.2], fx: { glow: [0.4, 0.1, 0.3], bloom: [0.25, 0.2, 0.4], grain: [0.2, 0.04, 0.1] },
    interact: { swirl: 1.5, light: 1.2, lens: 1, ripple: 1, repel: 0.8 }, colorMap: { luma: 4, radial: 0.6 },
    contrast: [1, 1.25],
  },
];

/** The styles of version 5: those of versions 2–4 with the library and this version's palettes, then the new ones. */
export const ARCHETYPES_V5: readonly Archetype[] = [
  ...libraryArchetypes(ARCHETYPES_V2).map(a => ({ ...a, ...TWEAKS[a.id], palettes: PALETTES5[a.id] ?? a.palettes })),
  ...NEW,
];

/**
 * Each space's weights over the styles, version 5. Fondos leans on calm fields and scenes but keeps colour;
 * Arte has every style; Imagen favours what reads over a photo; Texto what keeps the words legible; Terminal
 * what lives in 80 columns of ASCII.
 */
export const SPACE_ARCHS_V5: Record<SpaceId, Record<string, number>> = {
  fondos: { calma: 2.2, minimal: 1.3, organico: 1.4, escena: 1.4, cosmico: 1, particulas: 0.8, geometrico: 0.8, tinta: 0.8, vapor: 0.7, curvas: 0.6, neon: 0.6, op: 0.4, fractal: 0.5 },
  arte: {
    neon: 1, organico: 0.9, geometrico: 0.9, glitch: 0.8, cosmico: 0.9, tinta: 0.7, brutal: 0.7, vapor: 0.8, solidos: 1.1, op: 0.7, fractal: 0.9,
    retro: 0.6, grabado: 0.7, particulas: 1.1, curvas: 1, cartel: 0.9, escena: 1.1, calma: 0.5, minimal: 0.4,
  },
  media: { minimal: 0.8, neon: 1, retro: 1, tinta: 1, glitch: 0.9, brutal: 0.8, organico: 0.7, op: 0.5, geometrico: 0.6, cosmico: 0.5, cartel: 1, escena: 0.8, particulas: 0.5, calma: 0.5 },
  tipo: {
    tinta: 1, brutal: 1, neon: 1, retro: 0.8, glitch: 0.9, vapor: 0.8, minimal: 0.6, op: 0.6, geometrico: 0.6, organico: 0.5, cosmico: 0.5,
    fractal: 0.4, cartel: 1.2, particulas: 0.8, escena: 0.8, calma: 0.5, curvas: 0.4,
  },
  terminal: { retro: 1.8, solidos: 1.3, cosmico: 0.9, minimal: 0.7, glitch: 1, fractal: 0.9, geometrico: 0.8, op: 0.6, brutal: 0.6, particulas: 1, curvas: 0.8, escena: 0.7, cartel: 0.5 },
  componentes: { minimal: 2, neon: 1, organico: 1, geometrico: 1, tinta: 1, calma: 1.2, particulas: 0.6 },
};
