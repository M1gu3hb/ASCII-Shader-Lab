/**
 * Actions on the selection (pure): each takes the glyph's parts and the selection and returns new ones,
 * never changing what it was given. The editor wraps them in one undoable edit each.
 */
import type { Contour } from '../../doc';
import { mirrorX, mirrorY, pathOp, reverseContour, scaleAbout, translate, unionAll, type PathOp } from '../../geom/ops';
import type { Matrix } from '../../geom/svgpath';
import { copyContour, rotateCCW, type Box } from './math';
import { EMPTY_SEL, applyToSelection, movedNodes, wholeContours, type GlyphPart, type Selection } from './selection';
import { removeNodes } from './split';

export interface ActionResult { part: GlyphPart; sel: Selection }

export const DUPLICATE_OFFSET = 20;

export function moveSelection(g: GlyphPart, s: Selection, dx: number, dy: number): GlyphPart {
  return applyToSelection(g, s, translate(dx, dy));
}

export function transformSelection(g: GlyphPart, s: Selection, m: Matrix): GlyphPart {
  return applyToSelection(g, s, m);
}

/**
 * Delete: whole contours go; selected nodes go from their contour, which stays (closed if it was);
 * selected components and anchors go too.
 */
export function deleteSelection(g: GlyphPart, s: Selection): ActionResult {
  const whole = new Set(s.contours);
  let contours = g.contours.map((c, ci) => (whole.has(ci) ? { closed: c.closed, nodes: [] } : c));
  const keys = s.nodes.filter(k => !whole.has(Number(k.split(':')[0])));
  const r = removeNodes(contours, keys);
  contours = r.contours.filter(c => c.nodes.length > 0);
  return {
    part: {
      contours,
      components: g.components.filter((_, i) => !s.components.includes(i)),
      anchors: g.anchors.filter((_, i) => !s.anchors.includes(i)),
    },
    sel: EMPTY_SEL,
  };
}

/** Duplicate: copies of the contours touched by the selection, components and anchors, moved +20, +20; the copies become the selection. */
export function duplicateSelection(g: GlyphPart, s: Selection, off = DUPLICATE_OFFSET): ActionResult {
  const touched = new Set<number>(s.contours);
  for (const k of s.nodes) touched.add(Number(k.split(':')[0]));
  const copies = [...touched].filter(ci => g.contours[ci]).sort((a, b) => a - b).map(ci => copyContour(g.contours[ci]));
  const base = g.contours.length;
  const cs = [...g.contours, ...copies];
  const comps = [...g.components, ...s.components.filter(i => g.components[i]).map(i => ({ ...g.components[i], manual: true }))];
  const anchors = [...g.anchors, ...s.anchors.filter(i => g.anchors[i]).map(i => ({ ...g.anchors[i], name: g.anchors[i].name }))];
  const sel: Selection = {
    nodes: [], contours: copies.map((_, i) => base + i),
    components: comps.slice(g.components.length).map((_, i) => g.components.length + i),
    anchors: anchors.slice(g.anchors.length).map((_, i) => g.anchors.length + i),
  };
  return { part: applyToSelection({ contours: cs, components: comps, anchors }, sel, translate(off, off)), sel };
}

/**
 * Reflect about the selection's centre. A contour reflected whole turns the other way round, so it is
 * reversed after the mirror: fills and holes stay what they were.
 */
export function mirrorSelection(g: GlyphPart, s: Selection, axis: 'h' | 'v', box: Box): GlyphPart {
  const m = axis === 'h' ? mirrorX((box.x0 + box.x1) / 2) : mirrorY((box.y0 + box.y1) / 2);
  const out = applyToSelection(g, { ...s, components: [] }, m);
  const whole = new Set(wholeContours(s, g.contours));
  return { ...out, contours: out.contours.map((c, ci) => (whole.has(ci) ? reverseContour(c) : c)) };
}

export function rotateSelection(g: GlyphPart, s: Selection, deg: number, box: Box): GlyphPart {
  return applyToSelection(g, s, rotateCCW(deg, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2));
}

export function scaleSelection(g: GlyphPart, s: Selection, sx: number, sy: number, box: Box): GlyphPart {
  return applyToSelection(g, s, scaleAbout(sx, sy, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2));
}

/** Contours touched by the selection (picked whole or through any of their nodes), in order. */
export function touchedContours(s: Selection, contours: Contour[]): number[] {
  const out = new Set<number>(s.contours.filter(ci => contours[ci]));
  for (const k of movedNodes(s, contours)) out.add(Number(k.split(':')[0]));
  return [...out].filter(ci => contours[ci]).sort((a, b) => a - b);
}

export function setClosed(g: GlyphPart, s: Selection, closed: boolean): GlyphPart {
  const t = new Set(touchedContours(s, g.contours));
  return {
    ...g,
    contours: g.contours.map((c, ci) => {
      if (!t.has(ci) || c.closed === closed || (closed && c.nodes.length < 2)) return c;
      const o = copyContour(c);
      o.closed = closed;
      if (!closed) { delete o.nodes[0].hi; delete o.nodes[o.nodes.length - 1].ho; }
      return o;
    }),
  };
}

export function reverseSelection(g: GlyphPart, s: Selection): ActionResult {
  const t = new Set(touchedContours(s, g.contours));
  const contours = g.contours.map((c, ci) => (t.has(ci) ? reverseContour(c) : c));
  // node indices change when reversed: keep the contours picked, whole
  return { part: { ...g, contours }, sel: { ...EMPTY_SEL, contours: [...t], components: s.components, anchors: s.anchors } };
}

export const PATH_OP_NAMES: Record<PathOp, string> = { unir: 'Unir', restar: 'Restar', intersecar: 'Intersecar', excluir: 'Excluir' };

/**
 * Unir / Restar / Intersecar / Excluir: the first contour picked is the subject, the rest the clip. The
 * results take the place of both; null when fewer than two closed contours are selected.
 */
export function pathOpSelection(g: GlyphPart, s: Selection, op: PathOp): ActionResult | null {
  const order = wholeContours(s, g.contours).filter(ci => g.contours[ci].closed && g.contours[ci].nodes.length > 1);
  if (order.length < 2) return null;
  const subject = [g.contours[order[0]]];
  const clip = order.slice(1).map(ci => g.contours[ci]);
  const result = pathOp(subject, clip, op);
  const used = new Set(order);
  const kept = g.contours.filter((_, ci) => !used.has(ci));
  const contours = [...kept, ...result];
  return { part: { ...g, contours }, sel: { ...EMPTY_SEL, contours: result.map((_, i) => kept.length + i) } };
}

/** Quitar solapamientos: every closed contour of the glyph united; open contours stay as they are. */
export function removeOverlaps(g: GlyphPart): GlyphPart {
  const closed = g.contours.filter(c => c.closed && c.nodes.length > 1);
  const open = g.contours.filter(c => !(c.closed && c.nodes.length > 1));
  return { ...g, contours: [...unionAll(closed), ...open] };
}

/** Selected contours as a selection of contours whole (for actions that renumber). */
export const selectableCount = (s: Selection, contours: Contour[]) => wholeContours(s, contours).filter(ci => contours[ci].closed).length;
