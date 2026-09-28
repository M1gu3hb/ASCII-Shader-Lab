import { charsetIdOf, patternById } from '../engine/catalog';
import { hexToOklch } from '../engine/color';
import type { Recipe } from '../engine/recipe';

/**
 * How a piece looks at a glance, reduced to the decisions a person notices first: the lead shape and
 * its family, the palette (dominant hue, light or dark paper), the characters and their size, the
 * effects and the art direction. Used to measure how varied a run of results feels (lookDistance) and
 * by roll() to avoid serving something that looks like what was just on screen.
 */
export interface Look {
  lead: string;
  family: string;
  patterns: string[];
  arch: string;
  charset: string;
  font: string;
  mode: string;
  cell: number;
  aspect: number;
  /** hue (degrees) and chroma of the most colourful stop; chroma < 0.04 reads as neutral */
  hue: number;
  chroma: number;
  light: boolean;
  map: string;
  fx: string[];
  interact: string;
}

export function lookOf(r: Recipe): Look {
  const on = r.layers.filter(l => l.on);
  const lead = on[0]?.pattern ?? r.layers[0]?.pattern ?? '';
  let hue = 0, chroma = 0;
  for (const s of r.color.stops) {
    const [, C, h] = hexToOklch(s);
    if (C > chroma) { chroma = C; hue = h; }
  }
  return {
    lead,
    family: lead ? patternById(lead).family : '',
    patterns: [...new Set(on.map(l => l.pattern))],
    arch: r.meta.arch ?? '',
    charset: charsetIdOf(r.glyph.charset),
    font: r.glyph.font,
    mode: r.glyph.mode,
    cell: r.glyph.cell,
    aspect: r.glyph.aspect,
    hue, chroma,
    light: hexToOklch(r.color.bg)[0] > 0.6,
    map: r.color.map,
    // transformations of the source count as effects (a stack of them changes the look as much)
    fx: [...Object.entries(r.fx).filter(([, v]) => v > 0.2).map(([k]) => k), ...(r.source !== 'pattern' ? (r.media.xform ?? []).filter(x => x.on && x.amount > 0).map(x => 'x:' + x.kind) : [])].sort(),
    interact: r.interact.mode,
  };
}

const jaccard = (a: string[], b: string[]) => {
  if (!a.length && !b.length) return 0;
  const B = new Set(b);
  const inter = a.filter(x => B.has(x)).length;
  return 1 - inter / (a.length + b.length - inter);
};

/**
 * Perceptual distance between two looks, 0 (the same at a glance) … 1 (nothing in common).
 * Weights: shape 0.30 (lead pattern, its family, the other layers), palette 0.20, characters 0.28
 * (set, size, mode, font, cell proportion), effects 0.08, art direction 0.08, colour mapping and cursor 0.06.
 */
export function lookDistance(a: Look, b: Look): number {
  let d = 0;
  d += 0.22 * (a.lead === b.lead ? 0 : a.family === b.family ? 0.5 : 1);
  d += 0.08 * jaccard(a.patterns, b.patterns);
  const na = a.chroma < 0.04, nb = b.chroma < 0.04;
  const dh = Math.abs(((a.hue - b.hue) % 360 + 540) % 360 - 180);
  d += 0.12 * (na && nb ? 0 : na !== nb ? 1 : dh / 180);
  d += 0.08 * (a.light === b.light ? 0 : 1);
  d += 0.12 * (a.charset === b.charset ? 0 : 1);
  d += 0.06 * Math.min(1, Math.abs(Math.log2(a.cell / b.cell)));
  d += 0.04 * (a.mode === b.mode ? 0 : 1);
  d += 0.04 * (a.font === b.font ? 0 : 1);
  d += 0.02 * Math.min(1, Math.abs(a.aspect - b.aspect) / 0.6);
  d += 0.08 * jaccard(a.fx, b.fx);
  d += 0.08 * (a.arch === b.arch ? 0 : 1);
  d += 0.04 * (a.map === b.map ? 0 : 1);
  d += 0.02 * (a.interact === b.interact ? 0 : 1);
  return d;
}

/** Mean pairwise lookDistance of a run of results (how varied it feels as a whole). */
export function meanPairwiseDistance(looks: Look[]): number {
  let s = 0, n = 0;
  for (let i = 0; i < looks.length; i++) for (let j = i + 1; j < looks.length; j++) { s += lookDistance(looks[i], looks[j]); n++; }
  return n ? s / n : 0;
}
