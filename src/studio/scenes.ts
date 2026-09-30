import { charsetById, CHARSETS } from '../engine/catalog';
import { DEFAULT_LAYER, defaultRecipe, normalizeRecipe, type BlendMode, type Layer, type Recipe } from '../engine/recipe';
import { galleryPalette, PALETTE_MOODS, type PaletteMood } from '../random/palette-gallery';
import type { SpaceId } from '../random/spaces';
import { keepMedia, keepText, type Preset } from './presets';

/**
 * Composed scenes (from the Codex branch): two layers moving at their own speeds, a palette of the gallery,
 * a character set and a motion, written as data. A scene becomes an ordinary recipe (makeScene), so every
 * layer, colour, glyph and speed stays editable, and Imagen scenes keep the person's photo, video or camera.
 * Browsing them (SceneExplorer) is not mounted in the panel yet: the recipe browser decides where it goes.
 */
export type SceneSpace = Exclude<SpaceId, 'componentes'>;
export interface SceneSpec {
  id: string;
  name: string;
  space: SceneSpace;
  mood: PaletteMood;
  /** id of a palette of the gallery (src/random/palette-gallery.ts) */
  palette: string;
  /** id of a character set (engine/catalog.ts) */
  charset: string;
  layers: Array<Partial<Layer> & Pick<Layer, 'pattern'>>;
  cell?: number;
  speed?: number;
  glow?: number;
  bloom?: number;
  grain?: number;
  /** Tipo: the big text (the person's own words are kept) */
  text?: string;
  /** Tipo and Terminal: a typed message */
  message?: string;
  interaction?: Recipe['interact']['mode'];
  /** Contrast and gamma of the piece (defaults: those of a new recipe). */
  tone?: Partial<Pick<Recipe['tone'], 'contrast' | 'gamma'>>;
  /** Tipo: how the layers mix with the letters (default screen, 0.5: the letters stay whole). */
  textBlend?: BlendMode;
  textMix?: number;
  /** Imagen: how much of the layers goes over the picture (screen; default 0.5). */
  mediaMix?: number;
}

const L = (pattern: string, other: Partial<Layer> = {}): SceneSpec['layers'][number] => ({ pattern, ...other });

export const SCENES: SceneSpec[] = [
  { id: 'enjambre-atlas', name: 'Atlas del enjambre', space: 'arte', mood: 'cosmos', palette: 'frontera-estelar', charset: 'detallado', cell: 8, speed: 0.55, glow: 0.2, tone: { gamma: 0.85 }, layers: [L('enjambre_vivo', { a: 0.6, b: 0.55 }), L('constelacion_dinamica', { blend: 'screen', mix: 0.55, scale: 1.2, speed: 0.38, phase: 7 })], interaction: 'swirl' },
  { id: 'bruma-estelar', name: 'Bruma estelar', space: 'fondos', mood: 'calma', palette: 'mar-de-estrellas', charset: 'suave', cell: 10, speed: 0.3, tone: { gamma: 0.85 }, layers: [L('bruma_lejana', { a: 0.45, b: 0.45, mix: 0.85 }), L('nieve_orbital', { blend: 'screen', mix: 0.75, b: 0.4, speed: 0.45, phase: 12 })] },
  { id: 'jardin-de-fotones', name: 'Jardín de fotones', space: 'arte', mood: 'naturaleza', palette: 'helechos', charset: 'detallado', cell: 8, speed: 0.45, glow: 0.12, tone: { gamma: 0.8 }, layers: [L('bambu', { a: 0.3, b: 0.5, mix: 0.8 }), L('floracion_luz', { blend: 'screen', mix: 1, scale: 1.15, speed: 0.7 })], interaction: 'light' },
  { id: 'rio-de-cometas', name: 'Río de cometas', space: 'fondos', mood: 'cosmos', palette: 'pulsar', charset: 'puntuacion', cell: 10, speed: 0.5, glow: 0.15, layers: [L('mareas_lentas', { a: 0.35, b: 0.7, mix: 0.4, scale: 1.1 }), L('estela_cometas', { blend: 'screen', mix: 1, a: 0.6, speed: 0.9, phase: 6 })] },
  { id: 'impresion-viva', name: 'Impresión viva', space: 'arte', mood: 'tinta', palette: 'prensa-azul', charset: 'puntos', cell: 7, speed: 0.33, grain: 0.08, tone: { contrast: 1.15 }, layers: [L('catenaria', { a: 0.42, b: 0.7, mix: 0.9 }), L('lluvia_ascendente', { blend: 'screen', mix: 0.7, scale: 1.05, speed: 0.72 })] },
  { id: 'constelacion-de-tinta', name: 'Constelación de tinta', space: 'arte', mood: 'tinta', palette: 'indigo-impreso', charset: 'geometria', cell: 8, speed: 0.3, grain: 0.06, layers: [L('constelacion_dinamica', { a: 0.65, b: 0.6 }), L('apolonio', { blend: 'screen', mix: 0.45, scale: 1.1, speed: 0.13, b: 0.3 })], interaction: 'lens' },
  { id: 'dos-orbitas', name: 'Dos órbitas', space: 'arte', mood: 'cosmos', palette: 'obsidiana-lunar', charset: 'detallado', cell: 8, speed: 0.65, glow: 0.12, layers: [L('orbitas_gemelas', { a: 0.6, b: 0.7 }), L('esferas_orbita', { blend: 'screen', mix: 0.6, scale: 0.88, speed: 0.4, phase: 4 })], interaction: 'swirl' },
  { id: 'mariposa-neon', name: 'Mariposa eléctrica', space: 'arte', mood: 'energia', palette: 'voltaje', charset: 'diagonales', cell: 7, speed: 0.64, bloom: 0.38, layers: [L('mariposa_puntos', { a: 0.55, b: 0.82, scale: 1.2 }), L('campo_flujo', { blend: 'screen', mix: 0.23, scale: 0.73, speed: -0.28 })], interaction: 'light' },
  { id: 'polvo-y-jade', name: 'Polvo y jade', space: 'arte', mood: 'naturaleza', palette: 'musgo-profundo', charset: 'suave', cell: 8, speed: 0.48, glow: 0.21, layers: [L('jade_vivo', { a: 0.48, b: 0.63, speed: 0.48 }), L('vortice_polvo', { blend: 'screen', mix: 0.65, scale: 1.4, speed: 1.2 })], interaction: 'swirl' },
  { id: 'cielo-respirando', name: 'Cielo que respira', space: 'fondos', mood: 'calma', palette: 'lago-al-alba', charset: 'suave', cell: 10, speed: 0.3, tone: { gamma: 0.85 }, layers: [L('respiracion', { a: 0.6, b: 0.55, scale: 1.2 }), L('ondas_estelares', { blend: 'screen', mix: 0.8, scale: 1.4, speed: 0.6 })] },
  { id: 'lluvia-de-sal', name: 'Lluvia de sal', space: 'fondos', mood: 'calma', palette: 'sal-marina', charset: 'puntos', cell: 10, speed: 0.27, tone: { gamma: 0.8 }, layers: [L('bruma_lejana', { a: 0.4, b: 0.5, mix: 0.75 }), L('nieve_orbital', { blend: 'screen', mix: 0.9, a: 0.6, b: 0.5, speed: 0.6, phase: 10 })] },
  { id: 'espiral-de-fuego', name: 'Espiral de fuego', space: 'arte', mood: 'energia', palette: 'magma-azul', charset: 'barras_ascii', cell: 8, speed: 0.68, bloom: 0.35, layers: [L('vortice_polvo', { a: 0.82, b: 0.67 }), L('simbiosis', { blend: 'screen', mix: 0.35, scale: 0.9, speed: 0.35 })], interaction: 'repel' },
  { id: 'coral-luminoso', name: 'Coral luminoso', space: 'arte', mood: 'naturaleza', palette: 'arrecife', charset: 'suave', cell: 8, speed: 0.42, glow: 0.12, layers: [L('cardumen_luz', { a: 0.42, b: 0.6 }), L('giroide', { blend: 'screen', mix: 0.35, scale: 0.88, speed: 0.45, phase: 9 })], interaction: 'light' },
  { id: 'ondas-de-cobre', name: 'Ondas de cobre', space: 'fondos', mood: 'naturaleza', palette: 'cobre-humedo', charset: 'suave', cell: 11, speed: 0.3, layers: [L('estuario', { a: 0.52, b: 0.43, mix: 0.7 }), L('ondas_estelares', { blend: 'screen', mix: 0.6, scale: 1.2, speed: 0.7 })] },
  { id: 'semillas-del-viento', name: 'Semillas del viento', space: 'fondos', mood: 'naturaleza', palette: 'bosque-brumoso', charset: 'puntuacion', cell: 11, speed: 0.29, layers: [L('campo_flujo', { a: 0.23, b: 0.45, mix: 0.45 }), L('cardumen_luz', { blend: 'screen', mix: 0.9, scale: 1.3, speed: 0.65 })] },
  { id: 'porcelana-dinamica', name: 'Porcelana dinámica', space: 'fondos', mood: 'calma', palette: 'cielo-de-porcelana', charset: 'lineas', cell: 11, speed: 0.26, tone: { contrast: 1.2 }, layers: [L('jardin_zen', { a: 0.25, b: 0.5, mix: 0.9 }), L('nieve_orbital', { blend: 'screen', mix: 0.5, speed: 0.65 })] },
  { id: 'pulso-coral', name: 'Pulso coral', space: 'arte', mood: 'energia', palette: 'fosforo-coral', charset: 'detallado', cell: 8, speed: 0.62, glow: 0.2, layers: [L('corazon_particulas', { b: 0.9 }), L('respiracion', { blend: 'screen', mix: 0.4, scale: 1.35, speed: 0.52 })], interaction: 'ripple' },
  { id: 'eclipse-fragmentado', name: 'Eclipse fragmentado', space: 'arte', mood: 'cosmos', palette: 'eclipse', charset: 'geometria', cell: 8, speed: 0.38, bloom: 0.24, layers: [L('caliz', { a: 0.45, b: 0.4, mix: 0.85 }), L('constelacion_dinamica', { blend: 'screen', mix: 0.48, scale: 1.45, speed: 0.72 })], interaction: 'lens' },
  { id: 'postal-de-arena', name: 'Postal de arena', space: 'tipo', mood: 'tinta', palette: 'papel-quemado', charset: 'puntos', cell: 7, speed: 0.24, grain: 0.08, tone: { contrast: 1.2 }, text: 'MAREA', textBlend: 'multiply', textMix: 0.45, message: 'una postal de movimiento', layers: [L('mareas_lentas', { a: 0.3, b: 0.53, mix: 0.5 }), L('nieve_orbital', { blend: 'screen', mix: 0.4, scale: 1.1, speed: 0.5 })] },
  { id: 'senal-entre-estrellas', name: 'Señal entre estrellas', space: 'tipo', mood: 'cosmos', palette: 'pulsar', charset: 'terminal_densa', cell: 8, speed: 0.42, glow: 0.18, text: 'GLYPHOS', message: 'recibida desde otro cielo', layers: [L('constelacion_dinamica', { mix: 0.8 }), L('orbitas_gemelas', { blend: 'screen', mix: 0.5, speed: 0.4 })] },
  { id: 'florece', name: 'Florece', space: 'tipo', mood: 'naturaleza', palette: 'helechos', charset: 'pincel', cell: 8, speed: 0.36, tone: { gamma: 0.85 }, text: 'FLORECE', layers: [L('floracion_luz', { mix: 0.9 }), L('bambu', { blend: 'screen', mix: 0.3, scale: 1.35, speed: 0.4 })] },
  { id: 'luz-que-llega', name: 'Luz que llega', space: 'tipo', mood: 'energia', palette: 'laser-granate', charset: 'barras_ascii', cell: 8, speed: 0.55, glow: 0.3, text: 'LUZ', message: 'algo está a punto de aparecer', layers: [L('enjambre_vivo', { a: 0.75, b: 0.6, mix: 0.8 }), L('estela_cometas', { blend: 'screen', mix: 0.6, scale: 1.2, speed: 0.8 })] },
  { id: 'consola-celeste', name: 'Consola celeste', space: 'terminal', mood: 'cosmos', palette: 'mar-de-estrellas', charset: 'clasico', cell: 10, speed: 0.3, message: '> buscando constelaciones...', layers: [L('constelacion_dinamica', { b: 0.55, mix: 0.9 }), L('orbitas_gemelas', { blend: 'screen', mix: 0.4, scale: 1.1, speed: 0.4 })] },
  { id: 'consola-meteoros', name: 'Consola de meteoros', space: 'terminal', mood: 'energia', palette: 'acido-azul', charset: 'clasico', cell: 10, speed: 0.55, message: '> meteoros activos', layers: [L('lluvia_ascendente', { a: 0.7, b: 0.55, mix: 0.9 }), L('estela_cometas', { blend: 'screen', mix: 0.6, speed: 0.6 })] },
  { id: 'retrato-estelar', name: 'Retrato estelar', space: 'media', mood: 'cosmos', palette: 'frontera-estelar', charset: 'detallado', cell: 7, speed: 0.35, glow: 0.15, tone: { contrast: 1.15 }, mediaMix: 0.6, layers: [L('constelacion_dinamica', { mix: 0.7 }), L('orbitas_gemelas', { blend: 'screen', mix: 0.5, speed: 0.4 })] },
  { id: 'retrato-riso', name: 'Retrato risográfico', space: 'media', mood: 'tinta', palette: 'riso-mandarina', charset: 'puntos', cell: 7, speed: 0.28, grain: 0.1, tone: { contrast: 1.15 }, mediaMix: 0.6, layers: [L('floracion_luz', { mix: 0.7 }), L('catenaria', { blend: 'screen', mix: 0.5, speed: 0.25 })] },
  { id: 'retrato-bruma', name: 'Retrato entre brumas', space: 'media', mood: 'calma', palette: 'niebla-de-perla', charset: 'suave', cell: 8, speed: 0.3, tone: { contrast: 1.15 }, mediaMix: 0.55, layers: [L('bruma_lejana', { mix: 0.6 }), L('nieve_orbital', { blend: 'screen', mix: 0.6, speed: 0.52 })] },
  { id: 'retrato-electrico', name: 'Retrato eléctrico', space: 'media', mood: 'energia', palette: 'cromo-electrico', charset: 'diagonales', cell: 7, speed: 0.48, glow: 0.2, tone: { contrast: 1.15 }, mediaMix: 0.6, layers: [L('campo_flujo', { mix: 0.45 }), L('enjambre_vivo', { blend: 'screen', mix: 0.6, speed: 0.7 })] },
];

export const sceneById = (id: string) => SCENES.find(s => s.id === id);

/**
 * The recipe of a scene. `base` (the piece on screen) lends what a scene must not take away: an Imagen
 * scene keeps the photo, video or camera (and its framing); a Tipo scene keeps the person's words.
 */
export function makeScene(scene: SceneSpec, base?: Recipe): Recipe {
  const r = defaultRecipe();
  const p = galleryPalette(scene.palette);
  if (p) { r.color.bg = p.bg; r.color.stops = p.stops.slice(); }
  r.glyph.charset = charsetById(scene.charset)?.chars ?? CHARSETS[0].chars;
  r.glyph.cell = scene.cell ?? 9;
  r.layers = scene.layers.map(l => ({ ...DEFAULT_LAYER, ...l }));
  r.motion.speed = scene.speed ?? 0.5;
  r.fx.glow = scene.glow ?? 0;
  r.fx.bloom = scene.bloom ?? 0;
  r.fx.grain = scene.grain ?? 0;
  if (scene.interaction) r.interact.mode = scene.interaction;
  if (scene.tone) Object.assign(r.tone, scene.tone);
  if (scene.space === 'tipo' && scene.text) {
    r.source = 'text';
    r.text = { ...r.text, content: scene.text, font: 'martian', weight: 800 };
    r.media.mix = scene.textMix ?? 0.5; r.media.blend = scene.textBlend ?? 'screen';
  }
  if (scene.message) {
    const term = scene.space === 'terminal';
    r.msg = { ...r.msg, on: true, text: scene.message, mode: 'type', speed: 12, box: 0.9, y: term ? 0.88 : 0.91, x: term ? 0.06 : 0.5, align: term ? 'left' : 'center' };
  }
  if (scene.space === 'terminal') { r.glyph.aspect = 2; r.glyph.font = 'jetbrains'; r.fx.scan = 0.2; }
  if (scene.space === 'media') { r.source = 'image'; r.media.mix = scene.mediaMix ?? 0.5; r.media.blend = 'screen'; }
  if (base) {
    if (scene.space === 'media') keepMedia(base, r);
    if (scene.space === 'tipo') keepText(base, r);
  }
  return normalizeRecipe(r);
}

/** The scenes as recipes of each space ({ id, name, make }, like PRESETS), for a browser of recipes. */
export const SCENE_PRESETS: Record<SceneSpace, Preset[]> = {
  fondos: [], arte: [], media: [], tipo: [], terminal: [],
};
for (const s of SCENES) SCENE_PRESETS[s.space].push({ id: s.id, name: s.name, make: base => makeScene(s, base) });

/** Scenes of a space (Componentes shows those of Fondos), of one mood or of all. */
export function scenesFor(space: SpaceId, mood?: PaletteMood): SceneSpec[] {
  const sp = space === 'componentes' ? 'fondos' : space;
  return SCENES.filter(s => s.space === sp && (!mood || s.mood === mood));
}

/** How a scene is described in a list: its mood and number of layers. */
export const sceneLine = (s: SceneSpec) => `${PALETTE_MOODS[s.mood]} · ${s.layers.length} capas`;
