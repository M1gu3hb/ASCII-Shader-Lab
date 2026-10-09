/**
 * The local geometric assistant: proposes glyphs drawn from the skeletons with the document's style model.
 * It never touches what the person drew, accepted or locked, nor corrected proposals or the reference letters;
 * it returns new documents and says, in Spanish, what it kept and why. Accented letters become components
 * (base + mark) whenever both pieces exist. Pure: no DOM.
 */
import { MARKS, emptyGlyph, hasDrawing, assistantMayReplace, type Glyph, type GlyphDoc, type PathNode, type StyleModel } from '../doc';
import { bboxOf, transformContours } from '../geom/ops';
import { drawSkeleton, drawStyle, placeDrawn, type DrawStyle } from './outline';
import { SKELETONS, composeAccents } from './skeletons';
import { styleHash } from './style';

/**
 * Design alternatives the assistant can propose for one style:
 * 0: the style as estimated or set.
 * 1: softer: round terminals and corners, rounder bowls, a little less contrast.
 * 2: narrower and more contrasted, with the pen turned 15° (a calligraphic stress).
 */
export const VARIANTS = [
  'El estilo tal como está',
  'Más suave: remates y esquinas redondos',
  'Más estrecha y con más contraste',
] as const;

export function variantStyle(st: DrawStyle, variant: number): DrawStyle {
  switch (variant) {
    case 1: return { ...st, terminal: 'redondo', corner: 'redondo', round: Math.min(1, st.round + 0.15), contrast: Math.min(1, st.contrast + 0.1) };
    case 2: return { ...st, width: st.width * 0.86, contrast: Math.max(0.15, st.contrast * 0.6), angle: st.angle + 15 };
    default: return st;
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const roundNode = (n: PathNode): PathNode => {
  const o: PathNode = { x: r1(n.x), y: r1(n.y) };
  if (n.smooth) o.smooth = true;
  if (n.hi) o.hi = { x: r1(n.hi.x), y: r1(n.hi.y) };
  if (n.ho) o.ho = { x: r1(n.ho.x), y: r1(n.ho.y) };
  return o;
};

/**
 * Draws one character with a style (and a variant). Text documents get the metrics' side bearings around the
 * ink; ASCII documents centre the ink in the cell (narrowing it when it would not fit). Accented letters are
 * drawn whole (base and mark placed by anchors). Returns null for characters without a skeleton.
 */
export function generateGlyph(doc: GlyphDoc, ch: string, style: StyleModel, variant = 0): Glyph | null {
  const m = doc.metrics;
  const v = Math.max(0, Math.min(VARIANTS.length - 1, Math.floor(variant) || 0));
  const gen = { style: styleHash(style), variant: v };
  const acc = MARKS[ch];
  if (acc) {
    const base = generateGlyph(doc, acc.base, style, v), mark = generateGlyph(doc, acc.mark, style, v);
    if (!base || !mark) return null;
    const top = base.anchors.find(a => a.name === 'top'), under = mark.anchors.find(a => a.name === '_top');
    if (!top || !under) return null;
    const moved = transformContours(mark.contours, [1, 0, 0, 1, top.x - under.x, top.y - under.y]).map(c => ({ closed: c.closed, nodes: c.nodes.map(roundNode) }));
    return { ch, status: 'propuesto', contours: [...base.contours, ...moved], components: [], anchors: [], adv: base.adv, origin: 'asistente', gen };
  }
  const sk = SKELETONS[ch];
  if (!sk) return null;
  let st = variantStyle(drawStyle(style), v);
  let drawn = drawSkeleton(sk, st, m);
  let box = bboxOf(drawn.contours);
  if (!box) return null;
  let adv: number, dx: number;
  if (doc.mode === 'ascii') {
    const room = m.cell * 0.88;
    if (box.x1 - box.x0 > room) {
      // too wide for the cell: narrower skeleton, same pen
      const k = Math.max(0.3, (room - st.weight) / Math.max(1, box.x1 - box.x0 - st.weight));
      st = { ...st, width: st.width * k };
      drawn = drawSkeleton(sk, st, m);
      box = bboxOf(drawn.contours)!;
    }
    adv = m.cell;
    dx = (m.cell - (box.x1 - box.x0)) / 2 - box.x0;
  } else {
    adv = 0;
    dx = m.lsb - box.x0;
  }
  const placed = placeDrawn(drawn, dx);
  const contours = placed.contours.map(c => ({ closed: c.closed, nodes: c.nodes.map(roundNode) }));
  // the advance follows the outline as stored (rounded to tenths)
  const fin = bboxOf(contours)!;
  if (doc.mode !== 'ascii') adv = Math.max(1, Math.round(fin.x1 - fin.x0 + m.lsb + m.rsb));
  return { ch, status: 'propuesto', contours, components: [], anchors: placed.anchors, adv, origin: 'asistente', gen };
}

/** Why the assistant leaves a glyph alone, or null when it may propose one. */
function keepReason(doc: GlyphDoc, ch: string, replace: 'pendientes' | 'nada'): string | null {
  const g = doc.glyphs[ch];
  if (!g) return 'no está en el tablero';
  if (doc.refs.includes(ch)) return 'es una referencia del estilo';
  if (!assistantMayReplace(g)) {
    switch (g.status) {
      case 'dibujado': return 'lo dibujaste tú';
      case 'aceptado': return 'ya lo aceptaste';
      case 'bloqueado': return 'está bloqueado';
      default: return 'es una propuesta que corregiste';
    }
  }
  if (g.status === 'propuesto' && replace === 'nada') return 'ya tiene una propuesta pendiente';
  if (ch === ' ') return 'el espacio no se dibuja';
  if (!SKELETONS[ch] && !MARKS[ch]) return 'el asistente no tiene un esqueleto para este carácter';
  return null;
}

/**
 * Proposes glyphs for `chars` in a copy of the document. Only empty glyphs and the assistant's own pending,
 * uncorrected proposals are replaced (or only empty ones with `replace: 'nada'`). Accented letters become
 * components when their base and mark have a drawing (also when they are proposed in this same call).
 */
export function proposeGlyphs(doc: GlyphDoc, chars: string[], o: { variant?: number; replace?: 'pendientes' | 'nada' } = {}): { doc: GlyphDoc; changed: string[]; kept: Array<{ ch: string; why: string }> } {
  const out: GlyphDoc = structuredClone(doc);
  const replace = o.replace ?? 'pendientes', variant = o.variant ?? 0;
  const changed: string[] = [], kept: Array<{ ch: string; why: string }> = [];
  const todo: string[] = [];
  for (const ch of [...new Set(chars)]) {
    const why = keepReason(out, ch, replace);
    if (why) kept.push({ ch, why });
    else todo.push(ch);
  }
  const put = (ch: string, g: Glyph) => {
    const old = out.glyphs[ch];
    // a guide picture under an empty glyph stays where it was
    if (old?.raster) g.raster = old.raster;
    if (old?.ownAdv) { g.ownAdv = true; g.adv = old.adv; }
    out.glyphs[ch] = g;
    changed.push(ch);
  };
  // letters and marks first, so accented letters can be built from them
  for (const ch of todo.filter(c => !MARKS[c])) {
    const g = generateGlyph(out, ch, out.style, variant);
    if (g) put(ch, g);
    else kept.push({ ch, why: 'no se pudo dibujar' });
  }
  const accents = todo.filter(c => MARKS[c]);
  if (accents.length) {
    const comps = composeAccents(out);
    for (const ch of accents) {
      const { base, mark } = MARKS[ch];
      const parts = comps[ch];
      if (parts && hasDrawing(out.glyphs[base]) && hasDrawing(out.glyphs[mark])) {
        const g: Glyph = { ...emptyGlyph(ch, out), status: 'propuesto', components: parts, origin: 'componentes', gen: { style: styleHash(out.style), variant } };
        g.adv = out.mode === 'ascii' ? out.metrics.cell : out.glyphs[base].adv;
        put(ch, g);
      } else {
        const g = generateGlyph(out, ch, out.style, variant);
        if (g) put(ch, g);
        else kept.push({ ch, why: 'no se pudo dibujar' });
      }
    }
  }
  return { doc: out, changed, kept };
}

/** n design alternatives of one character (default 3) to compare side by side; not written into the document. */
export function compareVariants(doc: GlyphDoc, ch: string, n = 3): Glyph[] {
  const out: Glyph[] = [];
  for (let v = 0; v < Math.min(n, VARIANTS.length); v++) {
    const g = generateGlyph(doc, ch, doc.style, v);
    if (g) out.push(g);
  }
  return out;
}

/** The reference letters with a drawing become locked (a copy of the document): the assistant learns from originals only. */
export function lockReferences(doc: GlyphDoc): GlyphDoc {
  const out: GlyphDoc = structuredClone(doc);
  for (const ch of out.refs) {
    const g = out.glyphs[ch];
    if (g && hasDrawing(g)) g.status = 'bloqueado';
  }
  return out;
}
