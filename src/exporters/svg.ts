/**
 * Vector export. Every glyph becomes its real outline (read from the font file with opentype.js),
 * defined once and reused with <use>. Result: an SVG that looks identical in any editor, no fonts needed.
 * Pixel effects (glow, bloom, scanlines, CRT curvature, grain, chromatic aberration) cannot be vector and are left out.
 */
import type { GridSnapshot } from '../engine/engine';
import { fontById, nearestWeight } from '../engine/catalog';
import type { Recipe } from '../engine/recipe';

import jb300 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-300-normal.woff?url';
import jb400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';
import jb500 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff?url';
import jb700 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url';
import jb800 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-800-normal.woff?url';
import px300 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-300-normal.woff?url';
import px400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff?url';
import px500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff?url';
import px700 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff?url';
import sp400 from '@fontsource/space-mono/files/space-mono-latin-400-normal.woff?url';
import sp700 from '@fontsource/space-mono/files/space-mono-latin-700-normal.woff?url';
import fc400 from '@fontsource/fira-code/files/fira-code-latin-400-normal.woff?url';
import fc600 from '@fontsource/fira-code/files/fira-code-latin-600-normal.woff?url';
import vt400 from '@fontsource/vt323/files/vt323-latin-400-normal.woff?url';
import ps400 from '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff?url';
import sk400 from '@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff?url';
import sk700 from '@fontsource/silkscreen/files/silkscreen-latin-700-normal.woff?url';
import is400 from '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff?url';
import mm300 from '@fontsource/martian-mono/files/martian-mono-latin-300-normal.woff?url';
import mm400 from '@fontsource/martian-mono/files/martian-mono-latin-400-normal.woff?url';
import mm700 from '@fontsource/martian-mono/files/martian-mono-latin-700-normal.woff?url';
import mm800 from '@fontsource/martian-mono/files/martian-mono-latin-800-normal.woff?url';

const FILES: Record<string, Record<number, string>> = {
  jetbrains: { 300: jb300, 400: jb400, 500: jb500, 700: jb700, 800: jb800 },
  plex: { 300: px300, 400: px400, 500: px500, 700: px700 },
  space: { 400: sp400, 700: sp700 },
  fira: { 400: fc400, 600: fc600 },
  vt: { 400: vt400 },
  pixel: { 400: ps400 },
  silk: { 400: sk400, 700: sk700 },
  serif: { 400: is400 },
  martian: { 300: mm300, 400: mm400, 700: mm700, 800: mm800 },
};

interface OFont {
  unitsPerEm: number; ascender: number; descender: number;
  /** 0 = not in the font (.notdef). opentype's hasChar() is true for every character, so it can't be used. */
  charToGlyphIndex(c: string): number;
  charToGlyph(c: string): { advanceWidth?: number; getPath(x: number, y: number, size: number): { toPathData(d: number): string } };
}

const cache = new Map<string, Promise<OFont>>();

async function loadFont(fontId: string, weight: number): Promise<{ font: OFont; substituted: boolean }> {
  let id = fontId, substituted = false;
  if (!FILES[id]) { id = 'jetbrains'; substituted = true; }
  const ws = Object.keys(FILES[id]).map(Number);
  const w = ws.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a), ws[0]);
  const url = FILES[id][w];
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      const [{ default: opentype }, buf] = await Promise.all([import('opentype.js'), fetch(url).then(r => r.arrayBuffer())]);
      return opentype.parse(buf) as unknown as OFont;
    })();
    cache.set(url, p);
  }
  return { font: await p, substituted };
}

const BLOCKS: Record<string, Array<[number, number, number, number, number]>> = {
  // x, y, w, h (fractions of the cell), opacity
  '█': [[0, 0, 1, 1, 1]], '▀': [[0, 0, 1, 0.5, 1]], '▄': [[0, 0.5, 1, 0.5, 1]], '▌': [[0, 0, 0.5, 1, 1]], '▐': [[0.5, 0, 0.5, 1, 1]],
  '░': [[0, 0, 1, 1, 0.25]], '▒': [[0, 0, 1, 1, 0.5]], '▓': [[0, 0, 1, 1, 0.75]],
  '▁': [[0, 7 / 8, 1, 1 / 8, 1]], '▂': [[0, 6 / 8, 1, 2 / 8, 1]], '▃': [[0, 5 / 8, 1, 3 / 8, 1]], '▅': [[0, 3 / 8, 1, 5 / 8, 1]],
  '▆': [[0, 2 / 8, 1, 6 / 8, 1]], '▇': [[0, 1 / 8, 1, 7 / 8, 1]],
};

/** Braille U+2800–28FF: dots 1-3 and 7 in the left column, 4-6 and 8 in the right one (bit order). */
const BRAILLE_DOTS: Array<[number, number]> = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [0, 3], [1, 3]];
function brailleDots(chr: string): Array<[number, number]> | null {
  const cp = chr.codePointAt(0) ?? 0;
  if (cp < 0x2800 || cp > 0x28ff) return null;
  return BRAILLE_DOTS.filter((_, b) => (cp - 0x2800) & (1 << b));
}

const hex = (g: GridSnapshot, i: number) => '#' + [0, 1, 2].map(k => g.rgb[i * 3 + k].toString(16).padStart(2, '0')).join('');
const n = (v: number) => +v.toFixed(2);
// XML 1.0 forbids C0 control characters (a piece name could carry one): drop them
const escXml = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface SvgResult { svg: string; notes: string[]; textFallback: number }

/**
 * `g.width`/`g.height` (the rendered canvas, when known) size the SVG like the PNG of the same frame:
 * the last column and row are cut exactly where the canvas cuts them.
 */
export async function gridToSvg(g: GridSnapshot & { width?: number; height?: number }, r: Recipe, opts: { mode: 'outline' | 'text'; transparent?: boolean }): Promise<SvgResult> {
  const notes: string[] = [];
  const { cw, ch } = g;
  const W = Math.min(g.cols * cw, g.width ?? Infinity), H = Math.min(g.rows * ch, g.height ?? Infinity);
  const info = fontById(r.glyph.font);
  const fs = Math.max(1, Math.min(ch * 0.82, cw * 1.55) * r.glyph.scale * (info.fit ?? 1));
  const pixelFx = (['glow', 'bloom', 'scan', 'curve', 'chroma', 'grain', 'flicker', 'vig'] as const).filter(k => r.fx[k] > 0.02);
  if (pixelFx.length) notes.push('Sin efectos de píxel (' + pixelFx.map(k => ({ glow: 'resplandor', bloom: 'bloom', scan: 'barrido', curve: 'curvatura', chroma: 'aberración', grain: 'grano', flicker: 'parpadeo', vig: 'viñeta' })[k]).join(', ') + '): no existen como vector.');

  let font: OFont | null = null;
  if (opts.mode === 'outline') {
    const f = await loadFont(r.glyph.font, nearestWeight(info, r.glyph.weight));
    font = f.font;
    if (f.substituted) notes.push(`«${info.name}» no se puede incrustar; los contornos usan JetBrains Mono.`);
  }
  const defs = new Map<string, { id: string; adv: number }>();
  const paths: string[] = [];
  const groups = new Map<string, string[]>();
  const rects: string[] = [];
  let textFallback = 0, geometric = 0;
  const k = font ? fs / font.unitsPerEm : 0;
  const baseline = font ? ch / 2 + fs * 0.04 + ((font.ascender + font.descender) / 2) * k : 0;
  const push = (key: string, s: string) => { let a = groups.get(key); if (!a) { a = []; groups.set(key, a); } a.push(s); };

  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      const i = y * g.cols + x;
      const x0 = x * cw, y0 = y * ch;
      const c = hex(g, i);
      if (r.fx.cellBg > 0 && g.lum[i] > 8) rects.push(`<rect x="${x0}" y="${y0}" width="${cw}" height="${ch}" fill="${c}" fill-opacity="${n((r.fx.cellBg * g.lum[i]) / 255)}"/>`);
      if (g.flags[i] && r.msg.on && r.msg.box > 0) rects.push(`<rect x="${x0}" y="${y0}" width="${cw}" height="${ch}" fill="${r.color.bg}" fill-opacity="${n(r.msg.box)}"/>`);
      const chr = g.chars[i];
      const a = g.alpha[i] / 255;
      if (chr === ' ' || a < 0.16) continue;
      const op = a < 0.98 ? n(a) : 1;
      const key = `${c}|${op}`;
      // block elements and braille are drawn as exact cell geometry: the embeddable font subsets don't have them
      const block = BLOCKS[chr];
      if (block) {
        geometric++;
        for (const [bx, by, bw, bh, bo] of block) push(key, `<rect x="${n(x0 + bx * cw)}" y="${n(y0 + by * ch)}" width="${n(bw * cw)}" height="${n(bh * ch)}"${bo < 1 ? ` opacity="${bo}"` : ''}/>`);
        continue;
      }
      const dots = brailleDots(chr);
      if (dots) {
        geometric++;
        const rad = n(Math.min(cw * 0.13, ch * 0.075));
        for (const [dx, dy] of dots) push(key, `<circle cx="${n(x0 + (0.3 + dx * 0.4) * cw)}" cy="${n(y0 + (0.2 + dy * 0.2) * ch)}" r="${rad}"/>`);
        continue;
      }
      if (font && font.charToGlyphIndex(chr) > 0) {
        let d = defs.get(chr);
        if (!d) {
          const gl = font.charToGlyph(chr);
          const adv = (gl.advanceWidth ?? font.unitsPerEm * 0.6) * k;
          const id = 'g' + defs.size.toString(36);
          defs.set(chr, d = { id, adv });
          paths.push(`<path id="${id}" d="${gl.getPath(0, 0, fs).toPathData(2)}"/>`);
        }
        push(key, `<use xlink:href="#${d.id}" x="${n(x0 + (cw - d.adv) / 2)}" y="${n(y0 + baseline)}"/>`);
      } else {
        textFallback++;
        push(key, `<text x="${n(x0 + cw / 2)}" y="${n(y0 + ch / 2)}">${escXml(chr)}</text>`);
      }
    }
  }
  if (geometric) notes.push('Bloques (█ ▓ ▒ ░ ▀ ▄…) y braille van como formas exactas de celda; en la vista dependen de la fuente de tu sistema y pueden verse algo distintos.');
  if (textFallback && opts.mode === 'outline') notes.push(`${textFallback} caracteres no están en la fuente incrustable y quedan como texto (dependen de las fuentes instaladas).`);
  const textAttrs = `font-family="${escXml(info.stack)}" font-size="${n(fs)}" font-weight="${r.glyph.weight}" text-anchor="middle" dominant-baseline="central"`;
  const body = [...groups.entries()].map(([key, items]) => {
    const [col, op] = key.split('|');
    return `<g fill="${col}"${op !== '1' ? ` fill-opacity="${op}"` : ''}${opts.mode === 'text' || items.some(s => s.startsWith('<text')) ? ' ' + textAttrs : ''}>${items.join('')}</g>`;
  }).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<title>${escXml(r.meta.name ?? r.meta.seed ?? 'GLYPHOS')}</title>
<desc>Arte ASCII hecho con GLYPHOS (ASCII Shader Lab). ${g.cols}×${g.rows} caracteres.</desc>
${opts.transparent ? '' : `<rect width="${W}" height="${H}" fill="${r.color.bg}"/>`}
${paths.length ? `<defs>${paths.join('')}</defs>` : ''}
${rects.join('')}
${body}
</svg>
`;
  return { svg, notes, textFallback };
}

/** Text-mode SVG: real, editable text (needs the font installed where it's opened). */
export async function gridToSvgText(g: GridSnapshot, r: Recipe, transparent = false) {
  return gridToSvg(g, r, { mode: 'text', transparent });
}
