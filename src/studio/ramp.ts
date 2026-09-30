import { sortByDensity, uniqueChars } from '../engine/atlas';
import { fontById } from '../engine/catalog';
import { CHARSET_DEFAULT, type Recipe } from '../engine/recipe';
import { getEngine } from './engineBridge';

/**
 * The glyph order the studio measured for a piece (its ramp, from empty to full), for exported code: the
 * code carries it (exporters/code.ts, CodeOptions.ramp), so a page whose web font never arrives (offline,
 * blocked) draws the same picture with the fallback font instead of sorting the glyphs by that font's ink.
 * The live stage's own order when it shows this charset and font; measured here otherwise (the studio's
 * fonts are self-hosted and loaded). Undefined when the piece keeps its own order («Ordenar» off).
 */
export function studioRamp(r: Recipe): string[] | undefined {
  if (!r.glyph.sort) return undefined;
  const own = uniqueChars(r.glyph.charset);
  const set = own.length ? own : uniqueChars(CHARSET_DEFAULT);
  if (set.length < 2) return undefined;
  const e = getEngine(), lr = e?.recipe;
  if (e && lr && lr.glyph.sort && lr.glyph.charset === r.glyph.charset && lr.glyph.font === r.glyph.font && lr.glyph.weight === r.glyph.weight) {
    const live = e.glyphChars.slice(0, set.length);
    if (live.length === set.length && set.every(c => live.includes(c))) return live;
  }
  const cw = Math.max(2, Math.round(r.glyph.cell)), ch = Math.max(2, Math.round(r.glyph.cell * r.glyph.aspect));
  return sortByDensity(set, { stack: fontById(r.glyph.font).stack, weight: r.glyph.weight }, ch / cw);
}
