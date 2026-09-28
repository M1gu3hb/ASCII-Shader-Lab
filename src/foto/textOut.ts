/**
 * Real characters out of a characters (glyphs) layer: the same grid the compositor draws, computed at the
 * project's size (or a given width) from the layer's source, as text, ANSI, HTML or SVG text. Only glyphs
 * layers give text: an ASCII (shader) layer is a picture.
 */
import { glyphGridWith, gridText, gridToSvgText, toGridSnapshot, type GlyphGrid } from '../glyphs/index';
import { gridToAnsi, gridToHtmlPage } from '../exporters/text';
import { useProject } from '../project/store';
import type { GlyphsLayer, Id } from '../project/types';
import { sourcePixels } from './host';

/** The layer's grid at the project's canvas size (null when its picture is missing). */
export async function glyphGridOf(id: Id): Promise<{ grid: GlyphGrid; layer: GlyphsLayer } | null> {
  const p = useProject.getState().project;
  const l = p?.layers.find(x => x.id === id);
  if (!p || !l || l.kind !== 'glyphs') return null;
  const feed = await sourcePixels(id);
  if (!feed) return null;
  const grid = glyphGridWith(feed, l.glyphs, { w: p.canvas.w, h: p.canvas.h });
  feed.width = feed.height = 0;
  return { grid, layer: l };
}

export type TextFormat = 'txt' | 'ansi' | 'html' | 'svg';

export const TEXT_FORMATS: Array<{ id: TextFormat; label: string; ext: string; mime: string; note: string }> = [
  { id: 'txt', label: 'Texto (TXT)', ext: 'txt', mime: 'text/plain', note: 'Los caracteres tal cual, una línea por fila: se pega en cualquier editor o terminal.' },
  { id: 'ansi', label: 'ANSI (color de terminal)', ext: 'ans', mime: 'text/plain', note: 'Con colores de 24 bits: se ve en terminales que los aceptan (cat archivo.ans).' },
  { id: 'html', label: 'HTML', ext: 'html', mime: 'text/html', note: 'Una página con el texto coloreado en su fuente; se abre en el navegador.' },
  { id: 'svg', label: 'SVG con texto', ext: 'svg', mime: 'image/svg+xml', note: 'Texto de verdad dentro del SVG: la fuente la pone quien lo abre (puede verse distinto sin ella).' },
];

/** The layer's characters in a text format. */
export async function layerText(id: Id, format: TextFormat): Promise<{ text: string; name: string } | null> {
  const got = await glyphGridOf(id);
  if (!got) return null;
  const { grid, layer } = got;
  const bg = layer.glyphs.paper ?? '#0c0b0a';
  let text: string;
  switch (format) {
    case 'txt': text = gridText(grid); break;
    case 'ansi': text = gridToAnsi(toGridSnapshot(grid, bg, layer.glyphs), 'truecolor'); break;
    case 'html': text = gridToHtmlPage(toGridSnapshot(grid, bg, layer.glyphs), layer.name); break;
    default: text = gridToSvgText(grid, layer.glyphs, { paper: layer.glyphs.paper !== null, title: layer.name }); break;
  }
  return { text, name: layer.name };
}
