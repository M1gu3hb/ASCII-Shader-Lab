import type { BlendMode, InteractMode, Layer } from '../engine/recipe';
import type { PaletteMood } from './palette-gallery';
import type { SpaceId } from './spaces';

/**
 * The composed scenes of the studio (src/studio/scenes.ts), as starting points of the dice's «Escenas» style
 * (version 5): their layers, palette, characters and motion. A copy of the studio's data (the dice do not load
 * the studio): tests/unit/azar-v5.test.ts checks that both say the same. Once version 5 is published, this copy
 * stays as it is even if a scene of the studio changes (its seeds must keep weaving the same piece).
 */
export interface SceneSeed {
  id: string;
  space: Exclude<SpaceId, 'componentes'>;
  mood: PaletteMood;
  palette: string;
  charset: string;
  layers: Array<Partial<Layer> & { pattern: string; blend?: BlendMode }>;
  cell?: number;
  speed?: number;
  glow?: number;
  bloom?: number;
  grain?: number;
  interaction?: InteractMode;
  gamma?: number;
  contrast?: number;
}

const L = (pattern: string, o: Partial<Layer> = {}) => ({ pattern, ...o });

export const SCENE_SEEDS: readonly SceneSeed[] = [
  { id: 'enjambre-atlas', space: 'arte', mood: 'cosmos', palette: 'frontera-estelar', charset: 'detallado', cell: 8, speed: 0.55, glow: 0.2, gamma: 0.85, layers: [L('enjambre_vivo', { a: 0.6, b: 0.55 }), L('constelacion_dinamica', { blend: 'screen', mix: 0.55, scale: 1.2, speed: 0.38, phase: 7 })], interaction: 'swirl' },
  { id: 'bruma-estelar', space: 'fondos', mood: 'calma', palette: 'mar-de-estrellas', charset: 'suave', cell: 10, speed: 0.3, gamma: 0.85, layers: [L('bruma_lejana', { a: 0.45, b: 0.45, mix: 0.85 }), L('nieve_orbital', { blend: 'screen', mix: 0.75, b: 0.4, speed: 0.45, phase: 12 })] },
  { id: 'jardin-de-fotones', space: 'arte', mood: 'naturaleza', palette: 'helechos', charset: 'detallado', cell: 8, speed: 0.45, glow: 0.12, gamma: 0.8, layers: [L('bambu', { a: 0.3, b: 0.5, mix: 0.8 }), L('floracion_luz', { blend: 'screen', mix: 1, scale: 1.15, speed: 0.7 })], interaction: 'light' },
  { id: 'rio-de-cometas', space: 'fondos', mood: 'cosmos', palette: 'pulsar', charset: 'puntuacion', cell: 10, speed: 0.5, glow: 0.15, layers: [L('mareas_lentas', { a: 0.35, b: 0.7, mix: 0.4, scale: 1.1 }), L('estela_cometas', { blend: 'screen', mix: 1, a: 0.6, speed: 0.9, phase: 6 })] },
  { id: 'impresion-viva', space: 'arte', mood: 'tinta', palette: 'prensa-azul', charset: 'puntos', cell: 7, speed: 0.33, grain: 0.08, contrast: 1.15, layers: [L('catenaria', { a: 0.42, b: 0.7, mix: 0.9 }), L('lluvia_ascendente', { blend: 'screen', mix: 0.7, scale: 1.05, speed: 0.72 })] },
  { id: 'constelacion-de-tinta', space: 'arte', mood: 'tinta', palette: 'indigo-impreso', charset: 'geometria', cell: 8, speed: 0.3, grain: 0.06, layers: [L('constelacion_dinamica', { a: 0.65, b: 0.6 }), L('apolonio', { blend: 'screen', mix: 0.45, scale: 1.1, speed: 0.13, b: 0.3 })], interaction: 'lens' },
  { id: 'dos-orbitas', space: 'arte', mood: 'cosmos', palette: 'obsidiana-lunar', charset: 'detallado', cell: 8, speed: 0.65, glow: 0.12, layers: [L('orbitas_gemelas', { a: 0.6, b: 0.7 }), L('esferas_orbita', { blend: 'screen', mix: 0.6, scale: 0.88, speed: 0.4, phase: 4 })], interaction: 'swirl' },
  { id: 'mariposa-neon', space: 'arte', mood: 'energia', palette: 'voltaje', charset: 'diagonales', cell: 7, speed: 0.64, bloom: 0.38, layers: [L('mariposa_puntos', { a: 0.55, b: 0.82, scale: 1.2 }), L('campo_flujo', { blend: 'screen', mix: 0.23, scale: 0.73, speed: -0.28 })], interaction: 'light' },
  { id: 'polvo-y-jade', space: 'arte', mood: 'naturaleza', palette: 'musgo-profundo', charset: 'suave', cell: 8, speed: 0.48, glow: 0.21, layers: [L('jade_vivo', { a: 0.48, b: 0.63, speed: 0.48 }), L('vortice_polvo', { blend: 'screen', mix: 0.65, scale: 1.4, speed: 1.2 })], interaction: 'swirl' },
  { id: 'cielo-respirando', space: 'fondos', mood: 'calma', palette: 'lago-al-alba', charset: 'suave', cell: 10, speed: 0.3, gamma: 0.85, layers: [L('respiracion', { a: 0.6, b: 0.55, scale: 1.2 }), L('ondas_estelares', { blend: 'screen', mix: 0.8, scale: 1.4, speed: 0.6 })] },
  { id: 'lluvia-de-sal', space: 'fondos', mood: 'calma', palette: 'sal-marina', charset: 'puntos', cell: 10, speed: 0.27, gamma: 0.8, layers: [L('bruma_lejana', { a: 0.4, b: 0.5, mix: 0.75 }), L('nieve_orbital', { blend: 'screen', mix: 0.9, a: 0.6, b: 0.5, speed: 0.6, phase: 10 })] },
  { id: 'espiral-de-fuego', space: 'arte', mood: 'energia', palette: 'magma-azul', charset: 'barras_ascii', cell: 8, speed: 0.68, bloom: 0.35, layers: [L('vortice_polvo', { a: 0.82, b: 0.67 }), L('simbiosis', { blend: 'screen', mix: 0.35, scale: 0.9, speed: 0.35 })], interaction: 'repel' },
  { id: 'coral-luminoso', space: 'arte', mood: 'naturaleza', palette: 'arrecife', charset: 'suave', cell: 8, speed: 0.42, glow: 0.12, layers: [L('cardumen_luz', { a: 0.42, b: 0.6 }), L('giroide', { blend: 'screen', mix: 0.35, scale: 0.88, speed: 0.45, phase: 9 })], interaction: 'light' },
  { id: 'ondas-de-cobre', space: 'fondos', mood: 'naturaleza', palette: 'cobre-humedo', charset: 'suave', cell: 11, speed: 0.3, layers: [L('estuario', { a: 0.52, b: 0.43, mix: 0.7 }), L('ondas_estelares', { blend: 'screen', mix: 0.6, scale: 1.2, speed: 0.7 })] },
  { id: 'semillas-del-viento', space: 'fondos', mood: 'naturaleza', palette: 'bosque-brumoso', charset: 'puntuacion', cell: 11, speed: 0.29, layers: [L('campo_flujo', { a: 0.23, b: 0.45, mix: 0.45 }), L('cardumen_luz', { blend: 'screen', mix: 0.9, scale: 1.3, speed: 0.65 })] },
  { id: 'porcelana-dinamica', space: 'fondos', mood: 'calma', palette: 'cielo-de-porcelana', charset: 'lineas', cell: 11, speed: 0.26, contrast: 1.2, layers: [L('jardin_zen', { a: 0.25, b: 0.5, mix: 0.9 }), L('nieve_orbital', { blend: 'screen', mix: 0.5, speed: 0.65 })] },
  { id: 'pulso-coral', space: 'arte', mood: 'energia', palette: 'fosforo-coral', charset: 'detallado', cell: 8, speed: 0.62, glow: 0.2, layers: [L('corazon_particulas', { b: 0.9 }), L('respiracion', { blend: 'screen', mix: 0.4, scale: 1.35, speed: 0.52 })], interaction: 'ripple' },
  { id: 'eclipse-fragmentado', space: 'arte', mood: 'cosmos', palette: 'eclipse', charset: 'geometria', cell: 8, speed: 0.38, bloom: 0.24, layers: [L('caliz', { a: 0.45, b: 0.4, mix: 0.85 }), L('constelacion_dinamica', { blend: 'screen', mix: 0.48, scale: 1.45, speed: 0.72 })], interaction: 'lens' },
  { id: 'postal-de-arena', space: 'tipo', mood: 'tinta', palette: 'papel-quemado', charset: 'puntos', cell: 7, speed: 0.24, grain: 0.08, contrast: 1.2, layers: [L('mareas_lentas', { a: 0.3, b: 0.53, mix: 0.5 }), L('nieve_orbital', { blend: 'screen', mix: 0.4, scale: 1.1, speed: 0.5 })] },
  { id: 'senal-entre-estrellas', space: 'tipo', mood: 'cosmos', palette: 'pulsar', charset: 'terminal_densa', cell: 8, speed: 0.42, glow: 0.18, layers: [L('constelacion_dinamica', { mix: 0.8 }), L('orbitas_gemelas', { blend: 'screen', mix: 0.5, speed: 0.4 })] },
  { id: 'florece', space: 'tipo', mood: 'naturaleza', palette: 'helechos', charset: 'pincel', cell: 8, speed: 0.36, gamma: 0.85, layers: [L('floracion_luz', { mix: 0.9 }), L('bambu', { blend: 'screen', mix: 0.3, scale: 1.35, speed: 0.4 })] },
  { id: 'luz-que-llega', space: 'tipo', mood: 'energia', palette: 'laser-granate', charset: 'barras_ascii', cell: 8, speed: 0.55, glow: 0.3, layers: [L('enjambre_vivo', { a: 0.75, b: 0.6, mix: 0.8 }), L('estela_cometas', { blend: 'screen', mix: 0.6, scale: 1.2, speed: 0.8 })] },
  { id: 'consola-celeste', space: 'terminal', mood: 'cosmos', palette: 'mar-de-estrellas', charset: 'clasico', cell: 10, speed: 0.3, layers: [L('constelacion_dinamica', { b: 0.55, mix: 0.9 }), L('orbitas_gemelas', { blend: 'screen', mix: 0.4, scale: 1.1, speed: 0.4 })] },
  { id: 'consola-meteoros', space: 'terminal', mood: 'energia', palette: 'acido-azul', charset: 'clasico', cell: 10, speed: 0.55, layers: [L('lluvia_ascendente', { a: 0.7, b: 0.55, mix: 0.9 }), L('estela_cometas', { blend: 'screen', mix: 0.6, speed: 0.6 })] },
  { id: 'retrato-estelar', space: 'media', mood: 'cosmos', palette: 'frontera-estelar', charset: 'detallado', cell: 7, speed: 0.35, glow: 0.15, contrast: 1.15, layers: [L('constelacion_dinamica', { mix: 0.7 }), L('orbitas_gemelas', { blend: 'screen', mix: 0.5, speed: 0.4 })] },
  { id: 'retrato-riso', space: 'media', mood: 'tinta', palette: 'riso-mandarina', charset: 'puntos', cell: 7, speed: 0.28, grain: 0.1, contrast: 1.15, layers: [L('floracion_luz', { mix: 0.7 }), L('catenaria', { blend: 'screen', mix: 0.5, speed: 0.25 })] },
  { id: 'retrato-bruma', space: 'media', mood: 'calma', palette: 'niebla-de-perla', charset: 'suave', cell: 8, speed: 0.3, contrast: 1.15, layers: [L('bruma_lejana', { mix: 0.6 }), L('nieve_orbital', { blend: 'screen', mix: 0.6, speed: 0.52 })] },
  { id: 'retrato-electrico', space: 'media', mood: 'energia', palette: 'cromo-electrico', charset: 'diagonales', cell: 7, speed: 0.48, glow: 0.2, contrast: 1.15, layers: [L('campo_flujo', { mix: 0.45 }), L('enjambre_vivo', { blend: 'screen', mix: 0.6, speed: 0.7 })] },
];

/** The scenes a space's dice may start from (Componentes: those of Fondos; a space without enough: Arte's too). */
export function sceneSeedsFor(space: SpaceId): readonly SceneSeed[] {
  const sp = space === 'componentes' ? 'fondos' : space;
  const own = SCENE_SEEDS.filter(s => s.space === sp);
  return own.length >= 4 ? own : [...own, ...SCENE_SEEDS.filter(s => s.space === 'arte')];
}
