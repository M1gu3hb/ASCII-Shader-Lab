/**
 * The controls of a real-character layer, described as data for the studio UI: Spanish label, range,
 * default, a one-line hint and when the control applies. Keys are GlyphStyle fields (tracks animate them
 * as 'glyphs.<key>').
 */
import { FONTS } from '../engine/catalog';
import type { GlyphStyle } from '../project/types';
import { CHARSET_LIST, charsetInfo } from './charsets';

export type GlyphParamDef =
  | { key: keyof GlyphStyle; label: string; type: 'range'; min: number; max: number; step: number; def: number; unit?: string; help: string; show?: (s: GlyphStyle) => boolean }
  | { key: keyof GlyphStyle; label: string; type: 'select'; options: Array<[string, string]>; def: string; help: string; show?: (s: GlyphStyle) => boolean }
  | { key: keyof GlyphStyle; label: string; type: 'toggle'; def: boolean; help: string; show?: (s: GlyphStyle) => boolean }
  | { key: keyof GlyphStyle; label: string; type: 'color'; def: string; help: string; show?: (s: GlyphStyle) => boolean }
  /** A colour or «transparente» (null). */
  | { key: keyof GlyphStyle; label: string; type: 'paper'; def: string | null; help: string; show?: (s: GlyphStyle) => boolean }
  | { key: keyof GlyphStyle; label: string; type: 'text'; def: string; max: number; help: string; show?: (s: GlyphStyle) => boolean }
  | { key: keyof GlyphStyle; label: string; type: 'palette'; def: string[]; min: number; max: number; help: string; show?: (s: GlyphStyle) => boolean };

/** Words fill: the style asks the user's text to flow over the figure. */
export const usesWords = (s: Pick<GlyphStyle, 'fill' | 'charset'>) => s.fill === 'words' || charsetInfo(s.charset).user === 'words';

/** A new layer's style: bone characters on ink paper, the classic ramp, terminal-like cells. */
export function defaultGlyphStyle(): GlyphStyle {
  return {
    charset: 'estandar',
    chars: '',
    fill: 'ramp',
    font: 'jetbrains',
    weight: 500,
    cell: 10,
    aspect: 2,
    bright: 0,
    contrast: 1,
    gamma: 1,
    sat: 1,
    invert: false,
    edge: 0,
    cutoff: 0,
    color: 'mono',
    ink: '#ede6da',
    paper: '#0c0b0a',
    palette: ['#0c0b0a', '#5b544c', '#ede6da', '#ff5b1f'],
  };
}

const D = defaultGlyphStyle();

export const GLYPH_PARAMS: GlyphParamDef[] = [
  { key: 'charset', label: 'Caracteres', type: 'select', options: CHARSET_LIST.map(c => [c.id, c.name]), def: D.charset, help: 'El alfabeto que dibuja la imagen, del vacío al lleno.' },
  { key: 'chars', label: 'Tus caracteres', type: 'text', def: D.chars, max: 400, help: 'Escríbelos del más vacío al más lleno (el primero, normalmente un espacio).', show: s => charsetInfo(s.charset).user === 'chars' && !usesWords(s) },
  { key: 'fill', label: 'Relleno', type: 'select', options: [['ramp', 'Por brillo'], ['words', 'Tus palabras']], def: D.fill, help: 'Por brillo: cada celda elige su carácter. Palabras: tu texto recorre la figura en orden de lectura.' },
  { key: 'chars', label: 'Tus palabras', type: 'text', def: D.chars, max: 2000, help: 'El texto se repite por las celdas con imagen, fila a fila; los espacios se respetan.', show: s => usesWords(s) },
  { key: 'font', label: 'Fuente', type: 'select', options: FONTS.map(f => [f.id, f.name]), def: D.font, help: 'La tipografía con la que se escriben los caracteres (y el orden por tinta de cada alfabeto).' },
  { key: 'weight', label: 'Peso', type: 'range', min: 100, max: 900, step: 100, def: D.weight, help: 'Trazo más fino o más grueso (la fuente usa el peso más cercano que tenga).' },
  { key: 'cell', label: 'Tamaño de celda', type: 'range', min: 3, max: 64, step: 1, def: D.cell, unit: 'px', help: 'Ancho de cada carácter en la imagen final: pequeño da más detalle y más texto.' },
  { key: 'aspect', label: 'Proporción de celda', type: 'range', min: 0.8, max: 3, step: 0.05, def: D.aspect, help: 'Alto entre ancho de la celda: 2 es como una terminal (el TXT se ve bien proporcionado).' },
  { key: 'bright', label: 'Brillo', type: 'range', min: -1, max: 1, step: 0.01, def: D.bright, help: 'Aclara u oscurece la imagen antes de elegir caracteres.' },
  { key: 'contrast', label: 'Contraste', type: 'range', min: 0, max: 3, step: 0.01, def: D.contrast, help: 'Separa claros y oscuros: más contraste, formas más marcadas y menos grises.' },
  { key: 'gamma', label: 'Gamma', type: 'range', min: 0.2, max: 3, step: 0.01, def: D.gamma, help: 'Mueve los tonos medios sin tocar el blanco ni el negro: menos de 1 aclara, más de 1 oscurece.' },
  { key: 'sat', label: 'Saturación', type: 'range', min: 0, max: 3, step: 0.01, def: D.sat, help: 'Intensidad de los colores de la imagen (0 = gris); también cambia qué tan claro se lee cada color.' },
  { key: 'invert', label: 'Invertir', type: 'toggle', def: D.invert, help: 'Lo claro se vuelve vacío y lo oscuro, lleno: para tinta oscura sobre papel claro.' },
  { key: 'edge', label: 'Contornos', type: 'range', min: 0, max: 1, step: 0.01, def: D.edge, help: 'Dibuja los bordes con | / - \\ _ según su inclinación. Más valor, más bordes (no aplica a Braille ni Bloques).', show: s => !usesWords(s) && !['braille', 'blocks'].includes(charsetInfo(s.charset).mode) },
  { key: 'cutoff', label: 'Umbral de vacío', type: 'range', min: 0, max: 1, step: 0.01, def: D.cutoff, help: 'Las celdas más oscuras que este valor quedan vacías y dejan ver lo que hay debajo.' },
  { key: 'color', label: 'Color', type: 'select', options: [['mono', 'Tinta'], ['source', 'Color de la imagen'], ['palette', 'Paleta']], def: D.color, help: 'Un solo color, el color de la imagen bajo cada carácter o el color más cercano de una paleta.' },
  { key: 'ink', label: 'Tinta', type: 'color', def: D.ink, help: 'El color de los caracteres.', show: s => s.color === 'mono' },
  { key: 'palette', label: 'Paleta', type: 'palette', def: D.palette, min: 1, max: 12, help: 'Cada carácter toma el color de la paleta más parecido al de la imagen.', show: s => s.color === 'palette' },
  { key: 'paper', label: 'Papel', type: 'paper', def: D.paper, help: 'El fondo entre caracteres. Transparente deja ver las capas de abajo.' },
];

/** A style with every field valid (unknown or broken values replaced by the defaults). */
export function normalizeGlyphStyle(input: Partial<GlyphStyle> | null | undefined): GlyphStyle {
  const s = { ...D, ...(input ?? {}) } as GlyphStyle;
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const hexOk = (v: unknown) => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);
  const out: GlyphStyle = {
    charset: typeof s.charset === 'string' && CHARSET_LIST.some(c => c.id === s.charset) ? s.charset : D.charset,
    chars: typeof s.chars === 'string' ? s.chars.slice(0, 2000) : '',
    fill: s.fill === 'words' ? 'words' : 'ramp',
    font: typeof s.font === 'string' && s.font ? s.font : D.font,
    weight: num(s.weight, D.weight, 100, 900),
    cell: num(s.cell, D.cell, 2, 256),
    aspect: num(s.aspect, D.aspect, 0.25, 6),
    bright: num(s.bright, 0, -1, 1),
    contrast: num(s.contrast, 1, 0, 4),
    gamma: num(s.gamma, 1, 0.1, 4),
    sat: num(s.sat, 1, 0, 4),
    invert: !!s.invert,
    edge: num(s.edge, 0, 0, 1),
    cutoff: num(s.cutoff, 0, 0, 1),
    color: s.color === 'source' || s.color === 'palette' ? s.color : 'mono',
    ink: hexOk(s.ink) ? s.ink : D.ink,
    paper: s.paper === null ? null : hexOk(s.paper) ? s.paper : D.paper,
    palette: Array.isArray(s.palette) ? s.palette.filter(hexOk).slice(0, 16) : D.palette.slice(),
  };
  // proposed optional field (see grid.ts wordWrapOf): kept when valid
  if ((input as { wrap?: unknown } | null | undefined)?.wrap === 'word') Object.assign(out, { wrap: 'word' });
  return out;
}
