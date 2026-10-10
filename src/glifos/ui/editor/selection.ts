/**
 * What is selected in the editor and how a transform applies to it (pure).
 *
 * Nodes are "ci:ni" keys. Contours picked whole keep their own ordered list: path operations take the
 * first one(s) picked as the subject. Moving a node moves its handles with it; a handle of a smooth node
 * keeps the other one aligned unless the alignment is broken (Alt).
 */
import type { Anchor, ComponentRef, Contour, PathNode, Pt } from '../../doc';
import type { Matrix } from '../../geom/svgpath';
import { applyM, boxOfPoints, copyContour, dist, matrixScale, transformNode, unionBox, type Box } from './math';

export interface Selection {
  nodes: string[];
  /** Contours selected whole, in the order they were picked. */
  contours: number[];
  components: number[];
  anchors: number[];
}

export const EMPTY_SEL: Selection = { nodes: [], contours: [], components: [], anchors: [] };

export interface GlyphPart { contours: Contour[]; components: ComponentRef[]; anchors: Anchor[] }

export const nodeKey = (ci: number, ni: number) => `${ci}:${ni}`;
export const parseKey = (k: string): [number, number] => { const [a, b] = k.split(':'); return [Number(a), Number(b)]; };

export const selIsEmpty = (s: Selection) => !s.nodes.length && !s.contours.length && !s.components.length && !s.anchors.length;

/** Every node the selection moves: its nodes and all nodes of its whole contours. */
export function movedNodes(s: Selection, contours: Contour[]): Set<string> {
  const out = new Set(s.nodes);
  for (const ci of s.contours) contours[ci]?.nodes.forEach((_, ni) => out.add(nodeKey(ci, ni)));
  return out;
}

/** Contours taken whole: those picked whole (in order), then those with every node selected. */
export function wholeContours(s: Selection, contours: Contour[]): number[] {
  const out = s.contours.filter(ci => contours[ci]);
  const ns = new Set(s.nodes);
  contours.forEach((c, ci) => {
    if (!out.includes(ci) && c.nodes.length && c.nodes.every((_, ni) => ns.has(nodeKey(ci, ni)))) out.push(ci);
  });
  return out;
}

/** Drops what no longer exists (after an undo, or a change from elsewhere). */
export function sanitizeSel(s: Selection, g: GlyphPart): Selection {
  const nodes = s.nodes.filter(k => { const [ci, ni] = parseKey(k); return !!g.contours[ci]?.nodes[ni]; });
  const contours = s.contours.filter(ci => !!g.contours[ci]);
  const components = s.components.filter(i => !!g.components[i]);
  const anchors = s.anchors.filter(i => !!g.anchors[i]);
  if (nodes.length === s.nodes.length && contours.length === s.contours.length && components.length === s.components.length && anchors.length === s.anchors.length) return s;
  return { nodes, contours, components, anchors };
}

/** Adds to a selection (Shift: toggles what is already in it). */
export function addToSel(s: Selection, add: Partial<Selection>, toggle: boolean): Selection {
  const merge = (a: Array<string | number>, b: Array<string | number> = []) => {
    const out = [...a];
    for (const x of b) {
      const i = out.indexOf(x);
      if (i >= 0) { if (toggle) out.splice(i, 1); } else out.push(x);
    }
    return out;
  };
  return {
    nodes: merge(s.nodes, add.nodes) as string[], contours: merge(s.contours, add.contours) as number[],
    components: merge(s.components, add.components) as number[], anchors: merge(s.anchors, add.anchors) as number[],
  };
}

export function selectAll(g: GlyphPart): Selection {
  return { nodes: [], contours: g.contours.map((_, i) => i), components: g.components.map((_, i) => i), anchors: [] };
}

/**
 * Applies a matrix to what is selected: nodes with their handles, anchors, and components (which only
 * move and scale: their origin goes through the matrix and their scale takes its uniform part).
 */
export function applyToSelection(g: GlyphPart, s: Selection, m: Matrix): GlyphPart {
  const moved = movedNodes(s, g.contours);
  const contours = g.contours.map((c, ci) => {
    if (!c.nodes.some((_, ni) => moved.has(nodeKey(ci, ni)))) return c;
    return { closed: c.closed, nodes: c.nodes.map((n, ni) => (moved.has(nodeKey(ci, ni)) ? transformNode(n, m) : n)) };
  });
  const k = matrixScale(m);
  const components = g.components.map((r, i) => {
    if (!s.components.includes(i)) return r;
    const o = applyM(m, { x: r.dx, y: r.dy });
    const out: ComponentRef = { ...r, dx: o.x, dy: o.y, manual: true };
    const ns = (r.s ?? 1) * k;
    if (Math.abs(ns - 1) > 1e-9) out.s = ns; else delete out.s;
    return out;
  });
  const anchors = g.anchors.map((a, i) => (s.anchors.includes(i) ? { name: a.name, ...applyM(m, a) } : a));
  return { contours, components, anchors };
}

/**
 * Turns the other handle of a smooth node to stay in line with `which` (keeping its own length).
 * Returns the node unchanged when either handle is missing or sits on the node.
 */
export function alignOpposite(n: PathNode, which: 'hi' | 'ho'): PathNode {
  const h = n[which], o = which === 'hi' ? 'ho' : 'hi', other = n[o];
  if (!h || !other) return n;
  const L = dist(n, other), dx = n.x - h.x, dy = n.y - h.y, D = Math.hypot(dx, dy);
  if (D < 1e-9 || L < 1e-9) return n;
  return { ...n, [o]: { x: n.x + (dx / D) * L, y: n.y + (dy / D) * L } };
}

/** Moves one handle; a smooth node turns its other handle with it unless `breakSmooth` (Alt), which makes it a corner. */
export function moveHandle(c: Contour, ni: number, which: 'hi' | 'ho', p: Pt, breakSmooth: boolean): Contour {
  const out = copyContour(c);
  let n: PathNode = { ...out.nodes[ni], [which]: { x: p.x, y: p.y } };
  if (breakSmooth) delete n.smooth;
  else if (n.smooth) n = alignOpposite(n, which);
  out.nodes[ni] = n;
  return out;
}

/**
 * Double click on a node: a smooth node becomes a corner (handles stay); a corner becomes smooth, its
 * handles turned onto one line (each keeps its length; a missing one is created along the neighbours).
 */
export function toggleSmooth(c: Contour, ni: number): Contour {
  const out = copyContour(c);
  const n = out.nodes[ni];
  if (n.smooth) { delete n.smooth; return out; }
  n.smooth = true;
  const len = out.nodes.length;
  const prev = out.nodes[(ni - 1 + len) % len], next = out.nodes[(ni + 1) % len];
  const hasPrev = c.closed || ni > 0, hasNext = c.closed || ni < len - 1;
  // the tangent: from the incoming handle (or previous node) to the outgoing one (or next node)
  const from = n.hi ?? (hasPrev ? prev : n), to = n.ho ?? (hasNext ? next : n);
  let tx = to.x - from.x, ty = to.y - from.y;
  const T = Math.hypot(tx, ty);
  if (T < 1e-9) return out;
  tx /= T; ty /= T;
  const li = n.hi ? dist(n, n.hi) : hasPrev ? dist(n, prev) / 3 : 0;
  const lo = n.ho ? dist(n, n.ho) : hasNext ? dist(n, next) / 3 : 0;
  if (li > 1e-9) n.hi = { x: n.x - tx * li, y: n.y - ty * li };
  if (lo > 1e-9) n.ho = { x: n.x + tx * lo, y: n.y + ty * lo };
  return out;
}

/** The box of what is selected (font units); `componentContours` resolves a component's drawing. */
export function selectionBox(g: GlyphPart, s: Selection, componentContours: (i: number) => Contour[]): Box | null {
  const pts: Pt[] = [];
  for (const k of movedNodes(s, g.contours)) { const [ci, ni] = parseKey(k); const n = g.contours[ci]?.nodes[ni]; if (n) pts.push(n); }
  for (const i of s.anchors) if (g.anchors[i]) pts.push(g.anchors[i]);
  let box = boxOfPoints(pts);
  for (const i of s.components) {
    if (!g.components[i]) continue;
    const cpts: Pt[] = [];
    for (const c of componentContours(i)) for (const n of c.nodes) cpts.push(n);
    box = unionBox(box, boxOfPoints(cpts));
  }
  return box;
}

/** How many things are selected, for the live region and the inspector. */
export function selCount(s: Selection, contours: Contour[]) {
  return { nodes: movedNodes(s, contours).size, contours: wholeContours(s, contours).length, components: s.components.length, anchors: s.anchors.length };
}
