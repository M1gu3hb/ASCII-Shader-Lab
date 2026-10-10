import type { BlendMode, ColorMap, GlyphMode, InteractMode, LetterAnimKind, MsgMode, SourceKind, XformKind } from './recipe';
import { FAMILIES, FAMILY_IDS, familyById } from '../families/registry';

export type PatternFamily = 'organico' | 'geometrico' | 'ondas' | 'espacio' | 'solidos' | 'matematico' | 'formas' | 'señal' | 'particulas';

export interface PatternInfo {
  id: string;
  name: string;
  family: PatternFamily;
  a: string;   // label of parameter a
  b: string;   // label of parameter b
  /** relative GPU cost 1..3, used by the generator to keep stacks light */
  cost: number;
}

export const FAMILY_NAMES: Record<PatternFamily, string> = {
  organico: 'Orgánico',
  geometrico: 'Geométrico',
  ondas: 'Ondas',
  espacio: 'Espacio',
  solidos: 'Sólidos 3D',
  matematico: 'Matemático',
  formas: 'Formas',
  señal: 'Señal',
  particulas: 'Partículas',
};

export const PATTERNS: PatternInfo[] = [
  { id: 'nube', name: 'Nubes', family: 'organico', a: 'Detalle', b: 'Deriva', cost: 2 },
  { id: 'marmol', name: 'Mármol', family: 'organico', a: 'Torsión', b: 'Frecuencia', cost: 3 },
  { id: 'crestas', name: 'Crestas', family: 'organico', a: 'Filo', b: 'Frecuencia', cost: 2 },
  { id: 'fuego', name: 'Fuego', family: 'organico', a: 'Altura', b: 'Turbulencia', cost: 2 },
  { id: 'aurora', name: 'Aurora', family: 'organico', a: 'Separación', b: 'Finura', cost: 2 },
  { id: 'causticas', name: 'Cáusticas', family: 'organico', a: 'Escala', b: 'Nitidez', cost: 2 },
  { id: 'lava', name: 'Lava', family: 'organico', a: 'Tamaño', b: 'Suavidad', cost: 1 },
  { id: 'celulas', name: 'Células', family: 'organico', a: 'Densidad', b: 'Relieve', cost: 2 },
  { id: 'grietas', name: 'Grietas', family: 'organico', a: 'Densidad', b: 'Grosor', cost: 2 },
  { id: 'dunas', name: 'Dunas', family: 'organico', a: 'Líneas', b: 'Ondulación', cost: 2 },
  { id: 'bruma_lejana', name: 'Bruma lejana', family: 'organico', a: 'Relieve', b: 'Difuminado', cost: 2 },
  { id: 'luciernagas', name: 'Luciérnagas', family: 'organico', a: 'Cantidad', b: 'Nitidez', cost: 1 },
  { id: 'bambu', name: 'Jardín de bambú', family: 'organico', a: 'Tallos', b: 'Grosor', cost: 1 },
  { id: 'estrella_mar', name: 'Estrella de mar', family: 'organico', a: 'Brazos', b: 'Finura', cost: 1 },

  { id: 'anillos', name: 'Anillos', family: 'geometrico', a: 'Frecuencia', b: 'Dureza', cost: 1 },
  { id: 'cuadros', name: 'Cuadros', family: 'geometrico', a: 'Frecuencia', b: 'Dureza', cost: 1 },
  { id: 'rayos', name: 'Rayos', family: 'geometrico', a: 'Cantidad', b: 'Giro', cost: 1 },
  { id: 'tablero', name: 'Tablero', family: 'geometrico', a: 'Casillas', b: 'Oleaje', cost: 1 },
  { id: 'truchet', name: 'Laberinto', family: 'geometrico', a: 'Densidad', b: 'Grosor', cost: 1 },
  { id: 'hex', name: 'Panal', family: 'geometrico', a: 'Densidad', b: 'Borde', cost: 1 },
  { id: 'trama', name: 'Trama', family: 'geometrico', a: 'Lineatura', b: 'Nube', cost: 2 },
  { id: 'moire', name: 'Moiré', family: 'geometrico', a: 'Finura', b: 'Deriva', cost: 1 },
  { id: 'rombos', name: 'Rombos', family: 'geometrico', a: 'Densidad', b: 'Anillos', cost: 1 },
  { id: 'franjas', name: 'Franjas', family: 'geometrico', a: 'Cantidad', b: 'Inclinación', cost: 1 },
  { id: 'caleido', name: 'Caleidoscopio', family: 'geometrico', a: 'Espejos', b: 'Detalle', cost: 2 },
  { id: 'circuitos', name: 'Circuitos', family: 'geometrico', a: 'Densidad', b: 'Brillo', cost: 1 },
  { id: 'entrelazado', name: 'Entrelazado', family: 'geometrico', a: 'Densidad', b: 'Brillo', cost: 1 },
  { id: 'quasicristal', name: 'Cuasicristal', family: 'geometrico', a: 'Frecuencia', b: 'Contraste', cost: 1 },

  { id: 'ondas', name: 'Ondas', family: 'ondas', a: 'Frecuencia', b: 'Oleaje', cost: 1 },
  { id: 'interferencia', name: 'Interferencia', family: 'ondas', a: 'Frecuencia', b: 'Separación', cost: 1 },
  { id: 'plasma', name: 'Plasma', family: 'ondas', a: 'Escala', b: 'Remolino', cost: 1 },
  { id: 'lissajous', name: 'Lissajous', family: 'ondas', a: 'Ritmo X', b: 'Ritmo Y', cost: 3 },
  { id: 'ecualizador', name: 'Ecualizador', family: 'ondas', a: 'Bandas', b: 'Separación', cost: 1 },
  { id: 'horizonte', name: 'Horizonte', family: 'ondas', a: 'Líneas', b: 'Pico', cost: 3 },
  { id: 'topografia', name: 'Topografía', family: 'ondas', a: 'Detalle', b: 'Curvas', cost: 2 },
  { id: 'mareas_lentas', name: 'Mareas lentas', family: 'ondas', a: 'Frecuencia', b: 'Finura', cost: 1 },
  { id: 'jardin_zen', name: 'Arena rastrillada', family: 'ondas', a: 'Surcos', b: 'Filo', cost: 2 },
  { id: 'lluvia_mansa', name: 'Ondas de lluvia', family: 'ondas', a: 'Alcance', b: 'Grosor', cost: 1 },
  { id: 'respiracion', name: 'Respiración', family: 'ondas', a: 'Nitidez', b: 'Núcleo', cost: 1 },
  { id: 'estuario', name: 'Estuario', family: 'ondas', a: 'Curva', b: 'Líneas', cost: 2 },
  { id: 'campo_flujo', name: 'Campo de flujo', family: 'ondas', a: 'Ondulación', b: 'Líneas', cost: 1 },
  { id: 'radar', name: 'Radar', family: 'señal', a: 'Estela', b: 'Anillos', cost: 1 },

  { id: 'tunel', name: 'Túnel', family: 'espacio', a: 'Paredes', b: 'Avance', cost: 1 },
  { id: 'espiral', name: 'Espiral', family: 'espacio', a: 'Brazos', b: 'Torsión', cost: 1 },
  { id: 'estrellas', name: 'Estrellas', family: 'espacio', a: 'Densidad', b: 'Brillo', cost: 1 },
  { id: 'hiper', name: 'Hiperespacio', family: 'espacio', a: 'Densidad', b: 'Impulso', cost: 1 },
  { id: 'galaxia', name: 'Galaxia', family: 'espacio', a: 'Brazos', b: 'Torsión', cost: 2 },
  { id: 'rejilla', name: 'Rejilla infinita', family: 'espacio', a: 'Horizonte', b: 'Avance', cost: 1 },

  { id: 'dona', name: 'Dona', family: 'solidos', a: 'Grosor', b: 'Giro', cost: 3 },
  { id: 'esfera', name: 'Esfera', family: 'solidos', a: 'Relieve', b: 'Rayas', cost: 2 },
  { id: 'cubo', name: 'Cubo', family: 'solidos', a: 'Redondez', b: 'Aristas', cost: 3 },
  { id: 'nudo', name: 'Nudo', family: 'solidos', a: 'Grosor', b: 'Vueltas', cost: 3 },
  { id: 'poliedro', name: 'Poliedro', family: 'solidos', a: 'Caras', b: 'Aristas', cost: 2 },
  { id: 'giroide', name: 'Giroide', family: 'solidos', a: 'Densidad', b: 'Grosor', cost: 3 },
  { id: 'moebius', name: 'Cinta de Möbius', family: 'solidos', a: 'Ancho', b: 'Medias vueltas', cost: 3 },
  { id: 'adn', name: 'Doble hélice', family: 'solidos', a: 'Torsión', b: 'Peldaños', cost: 3 },
  { id: 'planeta', name: 'Planeta', family: 'solidos', a: 'Anillos', b: 'Inclinación', cost: 2 },
  { id: 'voxeles', name: 'Vóxeles', family: 'solidos', a: 'Altura', b: 'Bloques', cost: 3 },
  { id: 'metabolas', name: 'Metal líquido', family: 'solidos', a: 'Tamaño', b: 'Fusión', cost: 3 },
  { id: 'engranajes', name: 'Engranajes', family: 'solidos', a: 'Dientes', b: 'Radios', cost: 3 },
  { id: 'cristales', name: 'Cristales', family: 'solidos', a: 'Cantidad', b: 'Largo', cost: 3 },
  { id: 'obelisco', name: 'Obelisco', family: 'solidos', a: 'Anchura', b: 'Grabado', cost: 3 },
  { id: 'prisma', name: 'Prisma hexagonal', family: 'solidos', a: 'Anchura', b: 'Bandas', cost: 3 },
  { id: 'reloj_arena', name: 'Reloj de arena', family: 'solidos', a: 'Anchura', b: 'Arena', cost: 3 },
  { id: 'simbiosis', name: 'Simbiosis', family: 'solidos', a: 'Volumen', b: 'Fusión', cost: 3 },
  { id: 'pendulos', name: 'Péndulos', family: 'solidos', a: 'Balanceo', b: 'Tamaño', cost: 3 },
  { id: 'cinta_ola', name: 'Cinta ondulante', family: 'solidos', a: 'Anchura', b: 'Grosor', cost: 3 },
  { id: 'jade_vivo', name: 'Jade vivo', family: 'solidos', a: 'Tamaño', b: 'Relieve', cost: 3 },
  { id: 'caliz', name: 'Cáliz', family: 'solidos', a: 'Apertura', b: 'Grosor', cost: 3 },
  { id: 'medusa', name: 'Medusa', family: 'solidos', a: 'Cúpula', b: 'Tentáculos', cost: 3 },
  { id: 'esferas_orbita', name: 'Esferas en órbita', family: 'solidos', a: 'Velocidad', b: 'Tamaño', cost: 3 },

  { id: 'julia', name: 'Julia', family: 'matematico', a: 'Zoom', b: 'Deriva', cost: 3 },
  { id: 'rosa', name: 'Rosa polar', family: 'matematico', a: 'Pétalos', b: 'Trazo', cost: 1 },
  { id: 'degradado', name: 'Degradado', family: 'matematico', a: 'Ángulo', b: 'Ondulación', cost: 1 },
  { id: 'mandelbrot', name: 'Mandelbrot', family: 'matematico', a: 'Zoom', b: 'Bandas', cost: 3 },
  { id: 'sierpinski', name: 'Tapiz fractal', family: 'matematico', a: 'Repetición', b: 'Relleno', cost: 1 },
  { id: 'filotaxis', name: 'Semillas de girasol', family: 'matematico', a: 'Separación', b: 'Tamaño', cost: 3 },
  { id: 'espirografo', name: 'Espirógrafo', family: 'matematico', a: 'Lóbulos', b: 'Brazo', cost: 3 },
  { id: 'lemniscata', name: 'Lemniscata', family: 'matematico', a: 'Apertura', b: 'Trazo', cost: 1 },
  { id: 'superformula', name: 'Superfórmula', family: 'matematico', a: 'Simetría', b: 'Forma', cost: 1 },
  { id: 'armonografo', name: 'Armonógrafo', family: 'matematico', a: 'Desfase', b: 'Decaimiento', cost: 3 },
  { id: 'catenaria', name: 'Catenarias', family: 'matematico', a: 'Caída', b: 'Trazo', cost: 1 },
  { id: 'apolonio', name: 'Círculos anidados', family: 'matematico', a: 'Separación', b: 'Trazo', cost: 1 },
  { id: 'flor_armonica', name: 'Flor armónica', family: 'matematico', a: 'Pétalos', b: 'Trazo', cost: 1 },

  { id: 'forma', name: 'Polígono', family: 'formas', a: 'Lados', b: 'Contorno', cost: 1 },
  { id: 'estrella', name: 'Estrella', family: 'formas', a: 'Puntas', b: 'Contorno', cost: 1 },
  { id: 'latido', name: 'Latido', family: 'formas', a: 'Tamaño', b: 'Contorno', cost: 1 },

  { id: 'lluvia', name: 'Lluvia digital', family: 'señal', a: 'Columnas', b: 'Caída', cost: 1 },
  { id: 'glitch', name: 'Glitch', family: 'señal', a: 'Bandas', b: 'Frecuencia', cost: 2 },
  { id: 'ruido', name: 'Estática', family: 'señal', a: 'Contraste', b: 'Frecuencia', cost: 1 },

  { id: 'enjambre_vivo', name: 'Enjambre', family: 'particulas', a: 'Radio', b: 'Tamaño', cost: 3 },
  { id: 'estela_cometas', name: 'Cometas', family: 'particulas', a: 'Estela', b: 'Tamaño', cost: 3 },
  { id: 'lluvia_ascendente', name: 'Lluvia ascendente', family: 'particulas', a: 'Estela', b: 'Tamaño', cost: 3 },
  { id: 'orbitas_gemelas', name: 'Órbitas gemelas', family: 'particulas', a: 'Separación', b: 'Tamaño', cost: 3 },
  { id: 'corazon_particulas', name: 'Corazón de puntos', family: 'particulas', a: 'Latido', b: 'Tamaño', cost: 3 },
  { id: 'cardumen_luz', name: 'Cardumen', family: 'particulas', a: 'Ondulación', b: 'Tamaño', cost: 3 },
  { id: 'vortice_polvo', name: 'Vórtice de polvo', family: 'particulas', a: 'Estela', b: 'Tamaño', cost: 3 },
  { id: 'ondas_estelares', name: 'Anillos de puntos', family: 'particulas', a: 'Separación', b: 'Tamaño', cost: 3 },
  { id: 'mariposa_puntos', name: 'Mariposa de puntos', family: 'particulas', a: 'Aleteo', b: 'Tamaño', cost: 3 },
  { id: 'nieve_orbital', name: 'Nieve', family: 'particulas', a: 'Vaivén', b: 'Tamaño', cost: 3 },
  { id: 'floracion_luz', name: 'Floración', family: 'particulas', a: 'Pétalos', b: 'Tamaño', cost: 3 },
  { id: 'constelacion_dinamica', name: 'Constelación', family: 'particulas', a: 'Vínculos', b: 'Tamaño', cost: 3 },
];

/**
 * Every pattern id a recipe may name: the catalog's patterns and the visual families (src/families). The
 * families live apart from PATTERNS on purpose: the generator's frozen versions read PATTERNS, and a new
 * entry there would change what an old seed gives.
 */
export const PATTERN_IDS = new Set([...PATTERNS.map(p => p.id), ...FAMILY_IDS]);
/** Name of a pattern or of a visual family. */
export const patternName = (id: string) => familyById(id)?.name ?? PATTERNS.find(p => p.id === id)?.name ?? id;
export { FAMILIES };

/**
 * Figures drawn around the centre (the 3D objects, the shapes, the centred curves and the particle figures).
 * Patterns are sized to the canvas's height, which on a canvas taller than wide (a phone held upright, a 9:16
 * story, a column on a page) cut these figures at the sides: there they are sized to its width instead
 * (figureFit). Patterns that fill the canvas (fields, fractals, space) keep their scale. On a canvas as wide as
 * tall or wider nothing changes.
 */
export const FIGURES: ReadonlySet<string> = new Set([
  ...PATTERNS.filter(p => p.family === 'solidos' || p.family === 'formas').map(p => p.id),
  ...FAMILIES.filter(f => f.figure).map(f => f.id),
  'lissajous', 'estrella_mar', 'respiracion', 'radar', 'galaxia',
  'rosa', 'espirografo', 'lemniscata', 'superformula', 'armonografo', 'apolonio', 'flor_armonica', 'filotaxis',
  'corazon_particulas', 'enjambre_vivo', 'mariposa_puntos', 'orbitas_gemelas', 'vortice_polvo', 'floracion_luz', 'ondas_estelares',
]);
/** How much a layer's scale grows so its figure fits a W×H canvas (1 unless it is a figure on a canvas taller than wide). */
export const figureFit = (id: string, W: number, H: number) => (H > W && W > 0 && FIGURES.has(id) ? H / W : 1);

/**
 * What the library ported from the pattern-library branch added (ids), for QA pages, tests and the next generator
 * version: 35 patterns (10 of them solids), 12 particle motions, 10 character sets, 3 letter animations.
 */
export const LIBRARY = {
  fields: ['dunas', 'bruma_lejana', 'luciernagas', 'bambu', 'estrella_mar', 'circuitos', 'entrelazado', 'quasicristal', 'topografia',
    'mareas_lentas', 'jardin_zen', 'lluvia_mansa', 'respiracion', 'estuario', 'campo_flujo', 'mandelbrot', 'sierpinski', 'filotaxis',
    'espirografo', 'lemniscata', 'superformula', 'armonografo', 'catenaria', 'apolonio', 'flor_armonica'],
  solids: ['obelisco', 'prisma', 'reloj_arena', 'simbiosis', 'pendulos', 'cinta_ola', 'jade_vivo', 'caliz', 'medusa', 'esferas_orbita'],
  particles: ['enjambre_vivo', 'estela_cometas', 'lluvia_ascendente', 'orbitas_gemelas', 'corazon_particulas', 'cardumen_luz', 'vortice_polvo',
    'ondas_estelares', 'mariposa_puntos', 'nieve_orbital', 'floracion_luz', 'constelacion_dinamica'],
  charsets: ['barras_ascii', 'terminal_densa', 'puntuacion', 'numeros', 'tejido_fino', 'diagonales', 'media_luna', 'marcos', 'sismografo', 'pincel'],
  letterAnims: ['orbita', 'enjambre', 'cascada'] as LetterAnimKind[],
} as const;
export const patternById = (id: string) => PATTERNS.find(p => p.id === id) ?? PATTERNS[0];

export const BLEND_NAMES: Record<BlendMode, string> = {
  normal: 'Normal', add: 'Sumar', multiply: 'Multiplicar', screen: 'Trama (screen)', overlay: 'Superponer',
  difference: 'Diferencia', lighten: 'Aclarar', darken: 'Oscurecer', mask: 'Máscara', cutout: 'Recorte', subtract: 'Restar',
};
export const BLEND_IDS = Object.keys(BLEND_NAMES) as BlendMode[];

export const SOURCE_NAMES: Record<SourceKind, string> = {
  pattern: 'Patrón', image: 'Imagen', video: 'Video', text: 'Texto', camera: 'Cámara',
};

export const GLYPH_MODE_NAMES: Record<GlyphMode, string> = {
  density: 'Densidad', lines: 'Líneas', scramble: 'Caos', words: 'Palabras',
};

export const COLOR_MAP_NAMES: Record<ColorMap, string> = {
  luma: 'Por brillo', x: 'Horizontal', y: 'Vertical', radial: 'Radial', angle: 'Angular', noise: 'Nubes',
};

export const INTERACT_NAMES: Record<InteractMode, string> = {
  none: 'Ninguna', light: 'Linterna', ripple: 'Ondas', lens: 'Lupa', repel: 'Empuje', swirl: 'Remolino',
  erase: 'Borrador', paint: 'Pincel', scramble: 'Caos',
  trail: 'Rastro', blossom: 'Florecer', rings: 'Anillos', sparks: 'Chispas', stretch: 'Estirar', reveal: 'Revelar',
  zoom: 'Zoom con los dedos', magnet: 'Imán', follow: 'Seguir',
};

export const MSG_MODE_NAMES: Record<MsgMode, string> = {
  static: 'Fijo', type: 'Máquina de escribir', decode: 'Descifrar', marquee: 'Marquesina', words: 'Palabra a palabra',
};

/* ------------------------------------------------------------------ */
/* Transformations of the source, per-letter animations                */
/* ------------------------------------------------------------------ */

export interface XformInfo {
  id: XformKind;
  name: string;
  /** What it does, in one line. */
  desc: string;
  /** Names of its two settings: `amount` (0 leaves the source as it is) and its own `p`. */
  amount: string;
  p: string;
  /** The value of `p` as people read it (dots of 5 cells, 4 inks…). */
  pFmt: (p: number) => string;
  /** Where it starts when added. */
  defaults: { amount: number; p: number };
  /** Only shows with a moving source (video, camera, animated letters). */
  motion?: boolean;
}

const deg = (p: number) => Math.round(p * 360) + '°';
export const XFORMS: XformInfo[] = [
  { id: 'semitono', name: 'Semitono', desc: 'Puntos de imprenta: cada punto crece con el brillo de su zona.', amount: 'Fuerza', p: 'Tamaño del punto', pFmt: p => xformK('semitono', p).toFixed(1) + ' celdas', defaults: { amount: 1, p: 0.12 } },
  { id: 'contorno', name: 'Contorno neón', desc: 'Sólo quedan los bordes, encendidos con su propio color.', amount: 'Fuerza', p: 'Grosor', pFmt: p => { const k = xformK('contorno', p); return k + (k === 1 ? ' celda' : ' celdas'); }, defaults: { amount: 1, p: 0.2 } },
  { id: 'bandas', name: 'Bandas', desc: 'Pocas tintas planas, como un cartel serigrafiado.', amount: 'Fuerza', p: 'Tintas', pFmt: p => xformK('bandas', p) + ' por canal', defaults: { amount: 1, p: 0.15 } },
  { id: 'arrastre', name: 'Arrastre', desc: 'Lo claro se ordena en franjas verticales, del más oscuro arriba al más claro abajo.', amount: 'Largo', p: 'Umbral', pFmt: p => Math.round((0.15 + 0.7 * p) * 100) + ' % de brillo', defaults: { amount: 0.5, p: 0.4 } },
  { id: 'desplazar', name: 'Desplazar con el patrón', desc: 'El patrón de capas empuja la fuente, como un cristal que la refracta.', amount: 'Distancia', p: 'Dirección', pFmt: deg, defaults: { amount: 0.4, p: 0.12 } },
  { id: 'caleido', name: 'Caleidoscopio', desc: 'Espejos alrededor del centro que repiten un gajo de la fuente.', amount: 'Fuerza', p: 'Espejos', pFmt: p => String(xformK('caleido', p)), defaults: { amount: 1, p: 0.4 } },
  { id: 'ondular', name: 'Ondular', desc: 'La fuente ondea como una bandera; se mueve sola, también una foto.', amount: 'Amplitud', p: 'Frecuencia', pFmt: p => xformK('ondular', p).toFixed(1), defaults: { amount: 0.5, p: 0.3 } },
  { id: 'estela', name: 'Estela', desc: 'Lo que se mueve deja un rastro de luz que se apaga.', amount: 'Fuerza', p: 'Duración', pFmt: p => xformK('estela', p).toFixed(1) + ' s', defaults: { amount: 0.8, p: 0.35 }, motion: true },
  { id: 'canales', name: 'Canales RGB', desc: 'Separa el rojo y el azul, como una señal desajustada.', amount: 'Distancia', p: 'Dirección', pFmt: deg, defaults: { amount: 0.4, p: 0 } },
  { id: 'bloques', name: 'Píxeles grandes', desc: 'Agrupa las celdas en bloques de un mismo carácter.', amount: 'Fuerza', p: 'Tamaño del bloque', pFmt: p => xformK('bloques', p) + ' celdas', defaults: { amount: 1, p: 0.3 } },
];
export const xformById = (id: string) => XFORMS.find(x => x.id === id);

/**
 * The value each engine uses for a transformation's own setting `p` (computed once, here, so the WebGL
 * and the basic engine get the very same number): dot period in cells, contour step, inks per channel,
 * mirrors, wave frequency, trail life in seconds, block size in cells. Others use `p` as it is.
 */
export function xformK(kind: XformKind, p: number): number {
  switch (kind) {
    case 'semitono': return 3 + 9 * p;
    case 'contorno': return 1 + Math.floor(p * 2.99);
    case 'bandas': return Math.floor(2 + 6 * p + 0.5);
    case 'caleido': return Math.floor(2 + 10 * p + 0.5);
    case 'ondular': return 1 + 11 * p;
    case 'estela': return 0.15 + 2.35 * p;
    case 'bloques': return Math.floor(2 + 10 * p + 0.5);
    default: return p;
  }
}

export interface AnimInfo { id: LetterAnimKind; name: string; desc: string; amount: string; icon: string }
/** Animations of the big text (Texto) and of the message (Mensaje): the same name means the same idea. */
export const LETTER_ANIMS: Record<LetterAnimKind, AnimInfo> = {
  ola: { id: 'ola', name: 'Ola', desc: 'Las letras suben y bajan en una ola que recorre la palabra.', amount: 'Altura', icon: '∿∿' },
  rebote: { id: 'rebote', name: 'Rebote', desc: 'Cada letra salta a su turno, como una pelota.', amount: 'Altura', icon: '╭╮' },
  latido: { id: 'latido', name: 'Latido', desc: 'Las letras se hinchan una tras otra.', amount: 'Tamaño', icon: 'oO' },
  revolver: { id: 'revolver', name: 'Revolver', desc: 'Las letras se revuelven en otros caracteres y vuelven a su sitio.', amount: 'Cuántas letras', icon: '#?' },
  palabras: { id: 'palabras', name: 'Palabra a palabra', desc: 'Las palabras aparecen una tras otra, se quedan y se van.', amount: 'Salto', icon: 'A·B' },
  explosion: { id: 'explosion', name: 'Explosión', desc: 'Las letras salen volando, giran y se recomponen.', amount: 'Alcance', icon: '<*>' },
  brillo: { id: 'brillo', name: 'Luz que recorre', desc: 'Un brillo pasa letra a letra; con la paleta por brillo, cambia su color.', amount: 'Contraste', icon: '░▓' },
  color: { id: 'color', name: 'Color por letra', desc: 'Cada letra toma otro color de la paleta y los colores avanzan.', amount: 'Mezcla', icon: '▚▞' },
  orbita: { id: 'orbita', name: 'Órbita', desc: 'Cada letra describe una pequeña elipse y vuelve a su sitio sin perder el orden.', amount: 'Radio', icon: '◌↻' },
  enjambre: { id: 'enjambre', name: 'Enjambre', desc: 'Las letras se dispersan despacio, flotan y vuelven a formar el texto.', amount: 'Dispersión', icon: '✦·' },
  cascada: { id: 'cascada', name: 'Cascada', desc: 'Las letras caen una tras otra desde arriba, se quedan un momento y siguen cayendo.', amount: 'Caída', icon: '↓·' },
};

/* ------------------------------------------------------------------ */
/* Character sets                                                      */
/* ------------------------------------------------------------------ */

export interface CharsetInfo { id: string; name: string; chars: string; ascii: boolean }

export const CHARSETS: CharsetInfo[] = [
  { id: 'clasico', name: 'Clásico', chars: ' .:-=+*#%@', ascii: true },
  { id: 'detallado', name: 'Detallado', chars: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$", ascii: true },
  { id: 'suave', name: 'Suave', chars: ' .·:;+=xX$&', ascii: false },
  { id: 'minimo', name: 'Mínimo', chars: ' .·:', ascii: false },
  { id: 'bloques', name: 'Bloques', chars: ' ░▒▓█', ascii: false },
  { id: 'medios', name: 'Medios bloques', chars: ' ▁▂▃▄▅▆▇█', ascii: false },
  { id: 'puntos', name: 'Puntos', chars: ' ·•●', ascii: false },
  { id: 'braille', name: 'Braille', chars: ' ⠁⠃⠇⠏⠟⠿⡿⣿', ascii: false },
  { id: 'binario', name: 'Binario', chars: ' 01', ascii: true },
  { id: 'hex', name: 'Hexadecimal', chars: ' 0123456789ABCDEF', ascii: true },
  { id: 'lineas', name: 'Líneas', chars: ' -=≡', ascii: false },
  { id: 'cajas', name: 'Cajas', chars: ' ·┼╋█', ascii: false },
  { id: 'geometria', name: 'Geometría', chars: ' ·∘○◎●', ascii: false },
  { id: 'simbolos', name: 'Símbolos', chars: ' .+x*#', ascii: true },
  { id: 'estrellas', name: 'Astros', chars: ' ·+*✦✧★', ascii: false },
  { id: 'matrix', name: 'Katakana', chars: ' ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ012345789:.=*+-<>', ascii: false },
  { id: 'letras', name: 'Alfabeto', chars: ' ilcoaexsnuvzrtfjkhbdpqgyNMWB', ascii: true },
  { id: 'tipografico', name: 'Tipográfico', chars: ' ,;!?¿¡()[]{}&§¶@', ascii: false },
  { id: 'flechas', name: 'Flechas', chars: ' ·←↖↑↗→↘↓↙', ascii: false },
  { id: 'musica', name: 'Música', chars: ' ·♩♪♫♬', ascii: false },
  { id: 'barras_ascii', name: 'Barras ASCII', chars: ' /|\\X#%@', ascii: true },
  { id: 'terminal_densa', name: 'Teletipo', chars: ' .,:;i1I0O8#@', ascii: true },
  { id: 'puntuacion', name: 'Puntuación', chars: ' .,:;!?()[]{}%&@', ascii: true },
  { id: 'numeros', name: 'Cifras', chars: ' 1234567890#@', ascii: true },
  { id: 'tejido_fino', name: 'Tejido fino', chars: ' .┄╴╶┈─╋█', ascii: false },
  { id: 'diagonales', name: 'Diagonales', chars: ' .╱╲╳▒▓█', ascii: false },
  { id: 'media_luna', name: 'Fases lunares', chars: ' ·◔◑◕●', ascii: false },
  { id: 'marcos', name: 'Marcos', chars: ' .─┐┘┼╬█', ascii: false },
  { id: 'sismografo', name: 'Sismógrafo', chars: ' ._~∿≈≋≡', ascii: false },
  { id: 'pincel', name: 'Pincel', chars: ' .‚’/╱╳█', ascii: false },
];
export const charsetById = (id: string) => CHARSETS.find(c => c.id === id);
export const charsetIdOf = (chars: string) => CHARSETS.find(c => c.chars === chars)?.id ?? 'custom';

/** Contour glyphs indexed by gradient direction (0°, 45°, 90°, 135°): the stroke runs perpendicular to it. */
export const EDGE_GLYPHS = ['|', '\\', '-', '/'];

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

export interface FontInfo {
  id: string;
  name: string;
  /** CSS family name as registered by the page (studio self-hosts these) */
  family: string | null;
  stack: string;
  /** Google Fonts css2 family spec, used by exported code */
  google: string | null;
  weights: number[];
  mono: boolean;
  /** usable for the big text source */
  display: boolean;
  /** optical size correction inside a cell */
  fit?: number;
}

const MONO_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export const FONTS: FontInfo[] = [
  { id: 'system', name: 'Mono del sistema', family: null, stack: MONO_FALLBACK, google: null, weights: [400, 700], mono: true, display: false },
  { id: 'jetbrains', name: 'JetBrains Mono', family: 'JetBrains Mono', stack: `"JetBrains Mono", ${MONO_FALLBACK}`, google: 'JetBrains+Mono:wght@100..800', weights: [100, 200, 300, 400, 500, 600, 700, 800], mono: true, display: true },
  { id: 'plex', name: 'IBM Plex Mono', family: 'IBM Plex Mono', stack: `"IBM Plex Mono", ${MONO_FALLBACK}`, google: 'IBM+Plex+Mono:wght@100;200;300;400;500;600;700', weights: [100, 200, 300, 400, 500, 600, 700], mono: true, display: true },
  { id: 'martian', name: 'Martian Mono', family: 'Martian Mono', stack: `"Martian Mono", "Martian Mono Variable", ${MONO_FALLBACK}`, google: 'Martian+Mono:wght@100..800', weights: [100, 200, 300, 400, 500, 600, 700, 800], mono: true, display: true },
  { id: 'space', name: 'Space Mono', family: 'Space Mono', stack: `"Space Mono", ${MONO_FALLBACK}`, google: 'Space+Mono:wght@400;700', weights: [400, 700], mono: true, display: true },
  { id: 'fira', name: 'Fira Code', family: 'Fira Code', stack: `"Fira Code", ${MONO_FALLBACK}`, google: 'Fira+Code:wght@300..700', weights: [300, 400, 500, 600, 700], mono: true, display: false },
  { id: 'vt', name: 'VT323 · terminal', family: 'VT323', stack: `"VT323", ${MONO_FALLBACK}`, google: 'VT323', weights: [400], mono: true, display: true, fit: 1.3 },
  { id: 'pixel', name: 'Press Start · píxel', family: 'Press Start 2P', stack: `"Press Start 2P", ${MONO_FALLBACK}`, google: 'Press+Start+2P', weights: [400], mono: true, display: true, fit: 0.72 },
  { id: 'silk', name: 'Silkscreen · píxel', family: 'Silkscreen', stack: `"Silkscreen", ${MONO_FALLBACK}`, google: 'Silkscreen:wght@400;700', weights: [400, 700], mono: false, display: true },
  { id: 'serif', name: 'Instrument Serif', family: 'Instrument Serif', stack: '"Instrument Serif", Georgia, "Times New Roman", serif', google: 'Instrument+Serif:ital@0;1', weights: [400], mono: false, display: true, fit: 1.2 },
  { id: 'sans', name: 'Grotesca pesada', family: null, stack: '"Helvetica Neue", "Arial Black", Arial, system-ui, sans-serif', google: null, weights: [400, 700, 900], mono: false, display: true },
  { id: 'courier', name: 'Courier', family: null, stack: '"Courier New", Courier, monospace', google: null, weights: [400, 700], mono: true, display: false },
];
export const fontById = (id: string) => FONTS.find(f => f.id === id) ?? FONTS[0];

export function nearestWeight(f: FontInfo, w: number): number {
  let best = f.weights[0];
  for (const x of f.weights) if (Math.abs(x - w) < Math.abs(best - w)) best = x;
  return best;
}
