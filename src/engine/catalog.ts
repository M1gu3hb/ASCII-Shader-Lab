import type { BlendMode, ColorMap, GlyphMode, InteractMode, MsgMode, SourceKind } from './recipe';

export type PatternFamily = 'organico' | 'geometrico' | 'ondas' | 'espacio' | 'solidos' | 'matematico' | 'formas' | 'señal';

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

  { id: 'ondas', name: 'Ondas', family: 'ondas', a: 'Frecuencia', b: 'Oleaje', cost: 1 },
  { id: 'interferencia', name: 'Interferencia', family: 'ondas', a: 'Frecuencia', b: 'Separación', cost: 1 },
  { id: 'plasma', name: 'Plasma', family: 'ondas', a: 'Escala', b: 'Remolino', cost: 1 },
  { id: 'lissajous', name: 'Lissajous', family: 'ondas', a: 'Ritmo X', b: 'Ritmo Y', cost: 3 },
  { id: 'ecualizador', name: 'Ecualizador', family: 'ondas', a: 'Bandas', b: 'Separación', cost: 1 },
  { id: 'horizonte', name: 'Horizonte', family: 'ondas', a: 'Líneas', b: 'Pico', cost: 3 },
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

  { id: 'julia', name: 'Julia', family: 'matematico', a: 'Zoom', b: 'Deriva', cost: 3 },
  { id: 'rosa', name: 'Rosa polar', family: 'matematico', a: 'Pétalos', b: 'Trazo', cost: 1 },
  { id: 'degradado', name: 'Degradado', family: 'matematico', a: 'Ángulo', b: 'Ondulación', cost: 1 },

  { id: 'forma', name: 'Polígono', family: 'formas', a: 'Lados', b: 'Contorno', cost: 1 },
  { id: 'estrella', name: 'Estrella', family: 'formas', a: 'Puntas', b: 'Contorno', cost: 1 },
  { id: 'latido', name: 'Latido', family: 'formas', a: 'Tamaño', b: 'Contorno', cost: 1 },

  { id: 'lluvia', name: 'Lluvia digital', family: 'señal', a: 'Columnas', b: 'Caída', cost: 1 },
  { id: 'glitch', name: 'Glitch', family: 'señal', a: 'Bandas', b: 'Frecuencia', cost: 2 },
  { id: 'ruido', name: 'Estática', family: 'señal', a: 'Contraste', b: 'Frecuencia', cost: 1 },
];

export const PATTERN_IDS = new Set(PATTERNS.map(p => p.id));
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
};

export const MSG_MODE_NAMES: Record<MsgMode, string> = {
  static: 'Fijo', type: 'Máquina de escribir', decode: 'Descifrar', marquee: 'Marquesina',
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
