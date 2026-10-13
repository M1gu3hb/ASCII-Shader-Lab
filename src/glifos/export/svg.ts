/**
 * SVG exports of a compiled glyph set: one glyph on its own, a sheet with all of them, and a .zip with both
 * (plus a LEEME.txt). Pure strings, no DOM: paths are written from the set's path data with y flipped (font
 * units go up, SVG goes down), filled non-zero like the atlas and a font rasteriser. Glyphs that are pictures
 * go in as PNG (encoded here, see png.ts).
 */
import { placeGlyph } from '../../glyphset/paint';
import { setChars, type GlyphBitmap, type GlyphSet, type GlyphShape } from '../../glyphset/set';
import { zip } from '../../shared/zip';
import { cpLabel } from '../doc';
import { parsePath, pathBounds, writePath } from './path';
import { base64ToBytes, bytesToBase64, encodeAlphaPng } from './png';

const XML: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => XML[c]);
const n = (v: number) => String(Math.round(v * 100) / 100 || 0);
const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';

const pngs = new WeakMap<GlyphBitmap, string>();

/** The picture of a glyph as a PNG data URL, black ink with the bitmap's alpha. */
function bitmapUrl(b: GlyphBitmap): string {
  let url = pngs.get(b);
  if (!url) {
    const a = base64ToBytes(b.a);
    url = 'data:image/png;base64,' + bytesToBase64(encodeAlphaPng(b.w, b.h, a));
    pngs.set(b, url);
  }
  return url;
}

const flip = (y: number) => -y;

/** A character's description for titles and labels: the character itself (or its name) and its code point. */
const describe = (ch: string) => `${ch === ' ' ? 'espacio' : `«${ch}»`} ${cpLabel(ch)}`;

/**
 * One glyph as a standalone SVG. The viewBox is in font units (y flipped) and holds the advance and the em
 * box from descender to ascender, plus `pad` around (5 % of the em by default). `metricsLines` draws the
 * baseline, x-height, cap height, ascender, descender and the advance's edges as thin lines.
 */
export function glyphSvg(set: GlyphSet, ch: string, o: { pad?: number; metricsLines?: boolean } = {}): string {
  const shape = set.glyphs[ch];
  if (!shape) throw new Error(`${describe(ch)} no está en este juego de glifos.`);
  const pad = Math.max(0, o.pad ?? Math.round(set.upm * 0.05));
  const cmds = shape.d ? parsePath(shape.d) : [];
  let x0 = Math.min(0, shape.a), x1 = Math.max(0, shape.a), y0 = Math.min(set.desc, 0), y1 = Math.max(set.asc, 0);
  const pb = pathBounds(cmds);
  if (pb) { x0 = Math.min(x0, pb.x0); x1 = Math.max(x1, pb.x1); y0 = Math.min(y0, pb.y0); y1 = Math.max(y1, pb.y1); }
  const b = shape.b;
  if (b) { x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.w * b.s); y0 = Math.min(y0, b.y - b.h * b.s); y1 = Math.max(y1, b.y); }
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const W = x1 - x0, H = y1 - y0, px = 256 / set.upm;
  const out = [
    `<svg ${NS} viewBox="${n(x0)} ${n(-y1)} ${n(W)} ${n(H)}" width="${n(W * px)}" height="${n(H * px)}">`,
    `<title>${esc(`${describe(ch)} · ${set.name}`)}</title>`,
  ];
  if (o.metricsLines) {
    const sw = n(set.upm / 500);
    const h = (y: number, what: string) => `<line x1="${n(x0)}" y1="${n(-y)}" x2="${n(x1)}" y2="${n(-y)}" data-linea="${what}"/>`;
    const v = (x: number, what: string) => `<line x1="${n(x)}" y1="${n(-y1)}" x2="${n(x)}" y2="${n(-y0)}" data-linea="${what}"/>`;
    out.push(`<g fill="none" stroke="#8a8f98" stroke-width="${sw}" opacity="0.7">`,
      h(0, 'base'), h(set.asc, 'ascendente'), h(set.desc, 'descendente'), h(set.xh, 'altura-x'), h(set.cap, 'mayusculas'),
      v(0, 'origen'), v(shape.a, 'avance'), '</g>');
  }
  if (b) out.push(`<image x="${n(b.x)}" y="${n(-b.y)}" width="${n(b.w * b.s)}" height="${n(b.h * b.s)}" preserveAspectRatio="none" xlink:href="${bitmapUrl(b)}"/>`);
  if (cmds.length) out.push(`<path d="${writePath(cmds, flip)}" fill="#000" fill-rule="nonzero"/>`);
  out.push('</svg>');
  return out.join('\n') + '\n';
}

/** The order a sheet shows: an ASCII set's ramp (then anything not in it), else code point order. */
function sheetOrder(set: GlyphSet): string[] {
  const all = setChars(set);
  if (set.mode !== 'ascii' || !set.ramp) return all;
  const ramp = Array.from(set.ramp).filter(c => set.glyphs[c]);
  return [...ramp, ...all.filter(c => !ramp.includes(c))];
}

function cellGlyph(set: GlyphSet, shape: GlyphShape, cx: number, cy: number, fs: number): string {
  const p = placeGlyph(set, shape, fs);
  let s = '';
  const b = shape.b;
  // the same placement as paint.ts: the picture by its top-left corner, the outline from its origin, y flipped
  if (b) s += `<image x="${n(cx + p.x + b.x * p.k)}" y="${n(cy + p.y - b.y * p.k)}" width="${n(b.w * b.s * p.k)}" height="${n(b.h * b.s * p.k)}" preserveAspectRatio="none" xlink:href="${bitmapUrl(b)}"/>`;
  const k = String(+p.k.toPrecision(6));
  if (shape.d) s += `<path transform="translate(${n(cx + p.x)} ${n(cy + p.y)}) scale(${k} -${k})" d="${esc(shape.d)}" fill="#000" fill-rule="nonzero"/>`;
  return s;
}

/** Every glyph of the set on a grid of `cell`-px cells (`cols` across), each with its character and code point. */
export function sheetSvg(set: GlyphSet, o: { cols?: number; cell?: number; labels?: boolean } = {}): string {
  const chars = sheetOrder(set);
  const cols = Math.max(1, Math.min(64, Math.round(o.cols ?? Math.min(12, Math.max(1, chars.length)))));
  const cell = Math.max(16, Math.min(1024, Math.round(o.cell ?? 96)));
  const labels = o.labels !== false;
  const lh = labels ? Math.round(cell * 0.24) : 0;
  const m = Math.round(cell * 0.15);
  const rows = Math.ceil(chars.length / cols);
  const W = cols * cell + 2 * m, H = Math.max(1, rows) * (cell + lh) + 2 * m;
  const fs = cell * 0.7;
  const out = [
    `<svg ${NS} viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<title>${esc(`${set.name}: ${chars.length} glifos`)}</title>`,
    `<rect width="${W}" height="${H}" fill="#fff"/>`,
  ];
  chars.forEach((ch, i) => {
    const x = m + (i % cols) * cell, y = m + Math.floor(i / cols) * (cell + lh);
    out.push(`<g><rect x="${x}" y="${y}" width="${cell}" height="${cell + lh}" fill="none" stroke="#e2e2e2"/>`
      + cellGlyph(set, set.glyphs[ch], x + cell / 2, y + cell / 2, fs)
      + (labels ? `<text x="${n(x + cell / 2)}" y="${n(y + cell + lh * 0.62)}" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="${n(lh * 0.5)}" text-anchor="middle" fill="#555">${esc(describe(ch))}</text>` : '')
      + '</g>');
  });
  out.push('</svg>');
  return out.join('\n') + '\n';
}

/** File name of a glyph's SVG: its code point, and the character itself when it is a plain letter or digit. */
export function glyphFileName(ch: string): string {
  return cpLabel(ch) + (/^[A-Za-z0-9]$/.test(ch) ? '-' + ch : '') + '.svg';
}

function readme(set: GlyphSet): string {
  const pics = Object.values(set.glyphs).some(s => s.b);
  return [
    `Glifos de «${set.name}» en SVG`,
    '',
    'Este .zip tiene los glifos de tu juego como dibujos vectoriales (SVG), hechos en «Crea tus GLYPHOS».',
    '',
    '- U+XXXX.svg: un archivo por carácter, con su contorno. El nombre es el código Unicode del carácter; cuando es una letra o una cifra sin acento, también lo lleva al final (por ejemplo, U+0041-A.svg).',
    '- hoja.svg: todos los glifos en una cuadrícula, cada uno con su carácter y su código.',
    '- LEEME.txt: este archivo.',
    '',
    `Las coordenadas de cada glifo están en unidades de fuente: ${set.upm} unidades por eme, con la línea base en y = 0, el ascendente en ${set.asc} y el descendente en ${set.desc}. En SVG el eje y va hacia abajo, así que los valores de y aparecen con el signo cambiado. El viewBox de cada archivo abarca el avance del glifo y su caja de eme, con un pequeño margen.`,
    'Los contornos se rellenan con la regla «nonzero»: un contorno que gira en sentido contrario abre un hueco.',
    ...(pics ? ['Los glifos que son una imagen (mapa de bits) van incrustados como PNG.'] : []),
    '',
  ].join('\n');
}

/** A .zip with one SVG per character (U+XXXX.svg), the sheet (hoja.svg) and a LEEME.txt. */
export async function svgZip(set: GlyphSet): Promise<Blob> {
  const files = setChars(set).map(ch => ({ name: glyphFileName(ch), data: glyphSvg(set, ch) }));
  files.push({ name: 'hoja.svg', data: sheetSvg(set) }, { name: 'LEEME.txt', data: readme(set) });
  return zip(files);
}
