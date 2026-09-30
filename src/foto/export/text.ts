/**
 * Real characters out of the studio: a glyph layer's frame (or its frames) as text files, terminal players,
 * web players and a README. Everything here is written from frame grids (frameGrid.ts), so what is written is
 * what the studio draws, with the limits frameGrid states.
 */
import { gridText, gridToSvgText, toGridSnapshot, type GlyphGrid } from '../../glyphs/index';
import { resolveFont } from '../../glyphs/font';
import { gridToAnsi, gridToHtmlPage, gridToText, toAsciicast, toNodePlayer, toPythonPlayer, toShellBanner, type ColorDepth, type Frames } from '../../exporters/text';
import { toPlayerPage, toWebPlayer, type ColorFrames, type PlayerLook } from '../../exporters/player';
import { markdownBlock, nonAscii } from '../../studio/views/views';
import type { GlyphStyle } from '../../project/types';

export type StillTextFormat = 'txt' | 'ansi' | 'html' | 'svg-text' | 'shell';
export type MovingTextFormat = 'cast' | 'node' | 'python' | 'html-anim' | 'web';

export interface TextOut { text: string; ext: string; mime: string }

export interface FrameLike { grid: GlyphGrid; style: GlyphStyle; bg: string; paper: boolean; name: string }

/** A grid as the text exporters' snapshot (its colours are final: see frameGrid). */
export const snapshotOf = (g: GlyphGrid, bg: string) => toGridSnapshot(g, bg);

/** One frame in a text format. */
export function stillText(f: FrameLike, format: StillTextFormat, o: { depth?: ColorDepth; title?: string } = {}): TextOut {
  const depth = o.depth ?? 'truecolor';
  const title = o.title ?? f.name;
  switch (format) {
    case 'txt': return { text: gridText(f.grid), ext: 'txt', mime: 'text/plain' };
    case 'ansi': return { text: gridToAnsi(snapshotOf(f.grid, f.bg), depth), ext: 'ans', mime: 'text/plain' };
    case 'html': return { text: gridToHtmlPage(snapshotOf(f.grid, f.bg), title), ext: 'html', mime: 'text/html' };
    case 'svg-text': return { text: gridToSvgText(f.grid, f.style, { paper: f.paper, title }), ext: 'svg', mime: 'image/svg+xml' };
    case 'shell': {
      const art = depth === 'none' ? gridToText(snapshotOf(f.grid, f.bg)) : gridToAnsi(snapshotOf(f.grid, f.bg), depth);
      return { text: toShellBanner(art), ext: 'sh', mime: 'text/x-shellscript' };
    }
  }
}

export interface FramesLike { frames: GlyphGrid[]; fps: number; cols: number; rows: number; bg: string; paper: boolean; style: GlyphStyle; name: string }

/** Frames as the terminal players take them (ANSI or plain, no trailing newline). */
export function terminalFrames(fr: FramesLike, depth: ColorDepth, withBg = true): Frames {
  return {
    cols: fr.cols, rows: fr.rows, fps: fr.fps,
    frames: fr.frames.map(g => {
      const snap = snapshotOf(g, fr.bg);
      return (depth === 'none' ? gridToText(snap) : gridToAnsi(snap, depth, withBg)).replace(/\n$/, '');
    }),
  };
}

/** Frames as the web player takes them. */
export function colorFrames(fr: FramesLike, loop: boolean): ColorFrames {
  return {
    cols: fr.cols, rows: fr.rows, fps: fr.fps, loop,
    frames: fr.frames.map(g => {
      const n = g.cols * g.rows;
      const colors = new Uint32Array(n);
      for (let i = 0; i < n; i++) colors[i] = (g.rgb[i * 3] << 16) | (g.rgb[i * 3 + 1] << 8) | g.rgb[i * 3 + 2];
      return { chars: g.chars, colors, alpha: g.alpha };
    }),
  };
}

export function playerLook(fr: FramesLike, o: { title: string; transparent?: boolean }): PlayerLook {
  const f = resolveFont(fr.style.font, fr.style.weight);
  const g = fr.frames[0];
  return {
    title: o.title, bg: fr.paper ? fr.bg : o.transparent ? null : fr.bg, cw: g?.cw ?? 10, ch: g?.ch ?? 20,
    font: `${f.stack}, ui-monospace, monospace`, weight: f.weight,
  };
}

/** Moving frames in a player or recording format. */
export async function movingText(fr: FramesLike, format: MovingTextFormat, o: { depth?: ColorDepth; title?: string; loop?: boolean; transparent?: boolean } = {}): Promise<TextOut> {
  const title = o.title ?? fr.name;
  const depth = o.depth ?? 'truecolor';
  switch (format) {
    case 'cast': return { text: toAsciicast(terminalFrames(fr, depth), title), ext: 'cast', mime: 'application/x-asciicast' };
    case 'node': return { text: await toNodePlayer(terminalFrames(fr, depth), title), ext: 'mjs', mime: 'text/javascript' };
    case 'python': return { text: await toPythonPlayer(terminalFrames(fr, depth), title), ext: 'py', mime: 'text/x-python' };
    case 'html-anim': return { text: toPlayerPage(colorFrames(fr, o.loop ?? true), playerLook(fr, { title })), ext: 'html', mime: 'text/html' };
    case 'web': return { text: toWebPlayer(colorFrames(fr, o.loop ?? true), playerLook(fr, { title, transparent: o.transparent })), ext: 'html', mime: 'text/html' };
  }
}

/* ------------------------------------------------------------------ README */

export interface ReadmeParts {
  title: string;
  /** The picture's file name inside the bundle (GIF or PNG) and its alt text. */
  image: { file: string; alt: string; w: number; h: number; moving: boolean };
  /** The text version (a glyph layer's frame), if any. */
  text?: string;
}

/** The README's Markdown: the picture, and the text in a fenced block (with a note on characters GitHub may draw differently). */
export function readmeMarkdown(r: ReadmeParts): { md: string; snippet: string; notes: string[] } {
  const notes: string[] = [];
  const width = Math.min(800, r.image.w);
  // names are text, not Markdown or HTML (they can come from someone else's project file): one line, escaped
  // (a blank line inside the alt would end the <img> HTML block and let what follows be HTML of its own)
  const line = (s: string) => s.replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
  const attr = (s: string) => line(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const img = `<img src="${attr(r.image.file)}" alt="${attr(r.image.alt)}" width="${width}">`;
  const snippet = [img, ...(r.text ? ['', markdownBlock(r.text).trimEnd()] : [])].join('\n');
  if (r.text) {
    const odd = nonAscii(r.text);
    if (odd.length) notes.push(`El texto usa ${odd.length === 1 ? 'un carácter' : `${odd.length} caracteres`} fuera del ASCII básico (${odd.slice(0, 8).join(' ')}${odd.length > 8 ? '…' : ''}): GitHub puede dibujarlos con otra fuente y otro ancho.`);
    const widest = Math.max(...r.text.split('\n').map(l => Array.from(l).length));
    if (widest > 100) notes.push(`El texto tiene ${widest} columnas: en GitHub el bloque se desplaza de lado. Para que quepa (unas 100 columnas), agranda las celdas de la capa de caracteres.`);
  }
  if (r.image.moving) notes.push('GitHub reproduce los GIF en bucle; si pesan más de 10 MB no los muestra en el README.');
  const title = line(r.title).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || 'GLYPHOS';
  const md = `# ${title}\n\n${img}\n${r.text ? `\n${markdownBlock(r.text)}` : ''}\n<sub>Hecho con [GLYPHOS](https://glyphos-ascii.vercel.app).</sub>\n`;
  return { md, snippet, notes };
}
