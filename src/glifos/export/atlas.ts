/**
 * A glyph set as a texture atlas: a transparent PNG with one glyph per cell and a JSON manifest that says
 * where each character is and how it was placed, for using the set outside GLYPHOS (a game, a shader, another
 * ASCII renderer). Glyphs are painted with paint.ts, exactly as the engines' own atlas paints them
 * (src/engine/atlas.ts): same em size, same placement, so the PNG matches what the lab draws.
 */
import { paintGlyph } from '../../glyphset/paint';
import { setChars, type GlyphSet, type GlyphSetMode } from '../../glyphset/set';

export interface AtlasManifest {
  kind: 'glyphos-atlas';
  v: 1;
  /** Content id of the set. */
  set: string;
  name: string;
  mode: GlyphSetMode;
  /** Cell size in px. */
  cell: { w: number; h: number };
  cols: number;
  rows: number;
  /** One entry per cell, left to right and top to bottom: a single code point each (never a UTF-16 half). */
  chars: string[];
  /** The same characters as code point numbers. */
  codes: number[];
  /** rampa: an ASCII set's ramp, from empty to full; codigo: code point order. */
  order: 'rampa' | 'codigo';
  /** Em size in px the glyphs were drawn at. */
  em: number;
  metrics: { upm: number; asc: number; desc: number; xh: number; cap: number };
  /** How a glyph is placed in its cell, in words. */
  placement: string;
}

/** The em size the engines' atlas gives a cell: min(cellH·0.82, cellW·1.55). */
export const atlasEm = (cellW: number, cellH: number) => Math.min(cellH * 0.82, cellW * 1.55);

/** The characters of an atlas in its order: the ramp (then anything not in it), or code point order. */
export function atlasChars(set: GlyphSet, order: 'rampa' | 'codigo'): string[] {
  const all = setChars(set);
  if (order === 'codigo' || !set.ramp) return all;
  const ramp: string[] = [];
  for (const c of Array.from(set.ramp)) if (set.glyphs[c] && !ramp.includes(c)) ramp.push(c);
  return [...ramp, ...all.filter(c => !ramp.includes(c))];
}

/** A number as the studio's Spanish texts write it (decimal comma). */
const decimal = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

/** Pure: the manifest of an atlas laid out with these cells, columns and characters (one per cell, in order). */
export function atlasManifest(set: GlyphSet, setId: string, o: { cellW: number; cellH: number; cols: number; chars: string[] }): AtlasManifest {
  // split into code points: an astral character is one cell, whatever the caller's string units were
  const chars = o.chars.flatMap(s => Array.from(s));
  const cols = Math.max(1, Math.round(o.cols));
  const em = atlasEm(o.cellW, o.cellH);
  const code = setChars(set);
  const order = chars.length === code.length && chars.every((c, i) => c === code[i]) ? 'codigo' : 'rampa';
  return {
    kind: 'glyphos-atlas', v: 1, set: setId, name: set.name, mode: set.mode,
    cell: { w: o.cellW, h: o.cellH }, cols, rows: Math.ceil(chars.length / cols),
    chars, codes: chars.map(c => c.codePointAt(0)!), order, em,
    metrics: { upm: set.upm, asc: set.asc, desc: set.desc, xh: set.xh, cap: set.cap },
    placement: `Cada glifo ocupa una celda de ${o.cellW} × ${o.cellH} px, de izquierda a derecha y de arriba abajo en el orden de «chars». `
      + `Se dibuja con un eme de ${decimal(em)} px (el menor entre 0,82 × el alto y 1,55 × el ancho de la celda), centrado horizontalmente en su avance `
      + 'y con su caja de eme (de descendente a ascendente) centrada verticalmente en la celda y bajada un 4 % del eme, igual que el atlas de los motores de GLYPHOS. '
      + 'Fondo transparente; la tinta del glifo está en el canal alfa.',
  };
}

const MAX_SIDE = 16_384;
/** Safari's largest canvas (in pixels): the atlas must fit in every browser. */
const MAX_AREA = 16_777_216;

/**
 * Paints the atlas (browser only): transparent background, glyphs in white or `color`. The space and
 * characters the set lacks leave their cell empty.
 */
export async function renderAtlas(set: GlyphSet, setId: string, o: { cellW: number; cellH: number; cols?: number; order?: 'rampa' | 'codigo'; color?: string }): Promise<{ png: Blob; manifest: AtlasManifest }> {
  const hasDoc = typeof document !== 'undefined', hasOff = typeof OffscreenCanvas !== 'undefined';
  if (!hasDoc && !hasOff) throw new Error('El atlas PNG sólo se puede crear en el navegador.');
  const cellW = Math.round(o.cellW), cellH = Math.round(o.cellH);
  if (!(cellW >= 4 && cellW <= 1024 && cellH >= 4 && cellH <= 1024)) throw new Error('El tamaño de la celda debe estar entre 4 y 1024 px.');
  const chars = atlasChars(set, o.order ?? (set.mode === 'ascii' && set.ramp ? 'rampa' : 'codigo'));
  if (!chars.length) throw new Error('El juego no tiene glifos para el atlas.');
  const cols = Math.max(1, Math.min(chars.length, Math.round(o.cols ?? Math.min(16, chars.length))));
  const W = cols * cellW, H = Math.ceil(chars.length / cols) * cellH;
  if (W > MAX_SIDE || H > MAX_SIDE || W * H > MAX_AREA) throw new Error('El atlas sería demasiado grande para el navegador: usa celdas más pequeñas o cambia el número de columnas.');
  const canvas = hasDoc ? Object.assign(document.createElement('canvas'), { width: W, height: H }) : new OffscreenCanvas(W, H);
  const cx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!cx) throw new Error('Este navegador no pudo preparar el lienzo del atlas.');
  cx.clearRect(0, 0, W, H);
  cx.fillStyle = '#fff';
  const fs = atlasEm(cellW, cellH);
  chars.forEach((c, i) => {
    if (c === ' ') return;
    const x0 = (i % cols) * cellW, y0 = Math.floor(i / cols) * cellH;
    // clipped to its cell, as the engines' atlas does: a glyph wider than its cell never bleeds into the next
    cx.save();
    cx.beginPath();
    cx.rect(x0, y0, cellW, cellH);
    cx.clip();
    paintGlyph(cx, set, c, x0 + cellW / 2, y0 + cellH / 2, fs);
    cx.restore();
  });
  if (o.color) {
    // pictures are painted white whatever the fill: tint everything drawn, keeping its alpha
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = o.color;
    cx.fillRect(0, 0, W, H);
    cx.globalCompositeOperation = 'source-over';
  }
  // (HTMLCanvasElement does not exist in a worker: tell them apart by what they can do)
  const png = 'convertToBlob' in canvas
    ? await canvas.convertToBlob({ type: 'image/png' })
    : await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('El navegador no pudo crear el PNG del atlas.'))), 'image/png'));
  return { png, manifest: atlasManifest(set, setId, { cellW, cellH, cols, chars }) };
}
