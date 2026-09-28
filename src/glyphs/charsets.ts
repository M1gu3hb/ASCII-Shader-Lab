/**
 * The alphabets of the real-character layers («Imagen a ASCII»): presets from the classic ASCII art
 * tools (Estándar, Extendido alto, Código 437…) plus sub-cell modes that read the picture inside each
 * cell (Braille 2×4 dots, Bloques 2×2/octavos) and the user's own characters or words.
 *
 * Ramps go from empty to full. Presets with `sort` are re-ordered by the ink each glyph really leaves in a
 * cell of the chosen font (measured once per font, weight and cell proportion: see ramp.ts), so «Estándar»
 * in JetBrains Mono and in VT323 both go from light to dark.
 */
import type { CharsetDef } from './index';

/**
 * How a cell turns into a character:
 *   - 'ramp'    its brightness picks a glyph along the ramp (the classic «Imagen a ASCII»);
 *   - 'braille' its 2×4 sub-samples are thresholded one by one: each lit sub-sample is a dot (U+2800 + bits);
 *   - 'blocks'  its four quadrants (2×2) are thresholded one by one: one of the 16 quadrant blocks (▘▝▀▖▌▞▛▗▚▐▜▄▙▟█);
 *   - 'arrows'  its brightness picks the weight (· → ⇒) and the local gradient the direction (arrows point to the light).
 */
export type CharsetMode = 'ramp' | 'braille' | 'blocks' | 'arrows';

export interface CharsetInfo extends CharsetDef {
  mode: CharsetMode;
  /** Braille or blocks with an ordered (Bayer 4×4) dither instead of a threshold. */
  dither?: boolean;
  /**
   * Two-level: the cut between empty and full follows the picture: at least its mean brightness, and a little
   * under the local mean around each cell (an adaptive threshold: shapes keep their edges inside bright areas).
   */
  auto?: boolean;
  /** Every glyph is printable ASCII (safe in any terminal, README or code comment). */
  ascii: boolean;
  /**
   * Contour glyphs for the edge option, in this order: vertical, «/» diagonal, horizontal, «\» diagonal and
   * a horizontal edge that falls in the lower part of the cell. Default «|/-\_».
   */
  edges?: string;
  /** The user types them: 'custom' (characters) or 'words' (text that flows over the figure). */
  user?: 'chars' | 'words';
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i)).join('');
const LOWER = range(0x61, 0x7a);
const UPPER = range(0x41, 0x5a);
const DIGITS = '0123456789';
/** Every printable ASCII character (0x20–0x7E). */
const PRINTABLE = range(0x20, 0x7e);
/** Half-width katakana U+FF66–U+FF9D (one terminal column each); the half-width middle dot U+FF65 is the lightest step. */
const KATAKANA = range(0xff66, 0xff9d);

/** Quadrant blocks by bits (1 = upper left, 2 = upper right, 4 = lower left, 8 = lower right). */
export const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';
/** Bars that fill the cell from the bottom, empty to full (drawn as exact rectangles, see draw.ts). */
export const BARS = ' ▁▂▃▄▅▆▇█';
/** Braille by number of dots: the ramp of «Braille (densidad)». */
export const BRAILLE_RAMP = ' ⠁⠃⠇⠏⠟⠿⡿⣿';
/** Arrow glyphs by direction (y down): →, ↘, ↓, ↙, ←, ↖, ↑, ↗ (single, then double). */
export const ARROWS_1 = '→↘↓↙←↖↑↗';
export const ARROWS_2 = '⇒⇘⇓⇙⇐⇖⇑⇗';
export const DEFAULT_EDGES = '|/-\\_';

export const CHARSET_LIST: CharsetInfo[] = [
  { id: 'estandar', name: 'Estándar', blurb: 'Los diez caracteres clásicos del arte ASCII. Se leen igual en cualquier terminal.', chars: ' .:-=+*#%@', sort: true, mode: 'ramp', ascii: true },
  { id: 'estandar2', name: 'Estándar 2', blurb: 'La rampa larga de 70 caracteres: más grises intermedios y una textura más fina.', chars: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$", sort: true, mode: 'ramp', ascii: true },
  { id: 'extendido', name: 'Extendido alto', blurb: 'La mitad alta de Latin-1: signos, acentos y ligaduras con un grano tipográfico fino.', chars: ' ·¸¨¯´°¹²³ºª¬¦¡¿±÷×¤¢£¥§µ¶©®¼½¾ÐÞØÆßÑÄÖÅ', sort: true, mode: 'ramp', ascii: false },
  { id: 'alfabetico', name: 'Alfabético', blurb: 'Sólo letras, minúsculas y mayúsculas: la imagen se lee como un texto.', chars: ' ' + LOWER + UPPER, sort: true, mode: 'ramp', ascii: true },
  { id: 'alfanumerico', name: 'Alfanumérico', blurb: 'Letras y cifras: más pasos de tinta que el alfabético.', chars: ' ' + LOWER + UPPER + DIGITS, sort: true, mode: 'ramp', ascii: true },
  { id: 'numerico', name: 'Numérico', blurb: 'Las diez cifras, del 1 casi vacío al 8 lleno: aire de hoja de datos.', chars: ' ' + DIGITS, sort: true, mode: 'ramp', ascii: true },
  { id: 'flechas', name: 'Flechas', blurb: 'Flechas que apuntan hacia la luz: finas en los tonos medios, dobles en los claros.', chars: ' ·' + ARROWS_1 + ARROWS_2, sort: false, mode: 'arrows', ascii: false },
  { id: 'cp437', name: 'Código 437', blurb: 'Cajas, líneas y sombras de la página de códigos de los PC de los 80: arte de BBS y DOS.', chars: ' ·∙─│┌┐└┘├┤┬┴┼═║╔╗╚╝╬░▒▓█', sort: true, mode: 'ramp', ascii: false, edges: '│╱─╲▁' },
  { id: 'grises', name: 'Escala de grises', blurb: 'Sólo las cuatro sombras ░▒▓█: tonos planos y limpios, como una trama de imprenta.', chars: ' ░▒▓█', sort: false, mode: 'ramp', ascii: false, edges: '│╱─╲▁' },
  { id: 'bloques', name: 'Bloques', blurb: 'Cuartos de bloque (▘▝▀▖▌▞▛▗▚▐▜▄▙▟█): cada celda dibuja su contorno en 2×2, como el píxel grueso de las terminales.', chars: QUADRANTS, sort: false, mode: 'blocks', auto: true, ascii: false },
  { id: 'bloques-trama', name: 'Bloques tramados', blurb: 'Los cuartos de bloque con una trama ordenada: los grises se vuelven damero de píxeles gruesos.', chars: QUADRANTS, sort: false, mode: 'blocks', dither: true, ascii: false },
  { id: 'barras', name: 'Barras', blurb: 'Octavos de bloque (▁▂▃▄▅▆▇█) que llenan la celda desde abajo: la luz se vuelve un gráfico de barras.', chars: BARS, sort: false, mode: 'ramp', ascii: false, edges: '▌▞▄▚▁' },
  { id: 'braille', name: 'Braille', blurb: 'Cada celda son 2×4 puntos que se encienden uno a uno (corte en el brillo medio de la imagen): ocho veces más resolución.', chars: BRAILLE_RAMP, sort: false, mode: 'braille', auto: true, ascii: false },
  { id: 'braille-trama', name: 'Braille tramado', blurb: 'Los puntos del braille con una trama ordenada: los grises se vuelven patrones de puntos.', chars: BRAILLE_RAMP, sort: false, mode: 'braille', dither: true, ascii: false },
  { id: 'braille-densidad', name: 'Braille (densidad)', blurb: 'Braille como rampa: más puntos donde hay más luz, sin leer la forma dentro de la celda.', chars: BRAILLE_RAMP, sort: true, mode: 'ramp', ascii: false },
  { id: 'matematicos', name: 'Símbolos matemáticos', blurb: 'Operadores, relaciones y conjuntos: una pizarra de fórmulas que forma la imagen.', chars: ' ·∙∘°+−±×÷=≠≈≡∼<>≤≥∝∞∫∑∏√∂∆∇∈∩∪⊂⊃⊕⊗∧∨¬∀∃', sort: true, mode: 'ramp', ascii: false },
  { id: 'minimalista', name: 'Minimalista', blurb: 'Cinco pasos y mucho aire: formas limpias, casi un dibujo a pluma.', chars: ' .-+#', sort: true, mode: 'ramp', ascii: true },
  { id: 'maximo', name: 'Máximo', blurb: 'Los 95 caracteres imprimibles del ASCII, ordenados por tinta: el máximo de matices.', chars: PRINTABLE, sort: true, mode: 'ramp', ascii: true },
  { id: 'byn', name: 'Blanco y negro', blurb: 'Dos glifos, lleno o vacío: siluetas de alto contraste cortadas en el brillo medio de la imagen (el brillo mueve el corte).', chars: ' #', sort: false, mode: 'ramp', auto: true, ascii: true },
  { id: 'katakana', name: 'Katakana', blurb: 'Katakana de ancho medio (una columna por carácter), el alfabeto de la lluvia digital.', chars: ' ･' + KATAKANA, sort: true, mode: 'ramp', ascii: false },
  { id: 'puntos', name: 'Puntos', blurb: 'Puntos y círculos de tamaño creciente: una trama de semitono hecha de texto.', chars: ' ·∙•◦○◎◉●', sort: true, mode: 'ramp', ascii: false },
  { id: 'lineas', name: 'Líneas', blurb: 'Guiones y rayas horizontales: la imagen se teje en líneas como un grabado.', chars: ' _-–—=≡≣', sort: true, mode: 'ramp', ascii: false },
  { id: 'custom', name: 'Tus caracteres', blurb: 'Escribe tus caracteres del más vacío al más lleno; el orden lo decides tú.', chars: '', sort: false, mode: 'ramp', ascii: false, user: 'chars' },
  { id: 'palabras', name: 'Tus palabras', blurb: 'Tu texto recorre la figura en orden de lectura, fila a fila, y se repite hasta llenarla.', chars: '', sort: false, mode: 'ramp', ascii: false, user: 'words' },
];

const BY_ID = new Map(CHARSET_LIST.map(c => [c.id, c]));
export const DEFAULT_CHARSET = 'estandar';

/** The preset with this id (unknown ids give Estándar, so an old or foreign project still draws). */
export function charsetInfo(id: string): CharsetInfo {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_CHARSET)!;
}

/** Characters of a string without line breaks, tabs or repeats (in order). */
export function uniqueGlyphs(s: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of Array.from(s)) {
    if (c === '\n' || c === '\r' || c === '\t') continue;
    if (!seen.has(c)) { seen.add(c); out.push(c); }
  }
  return out;
}
