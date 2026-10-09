/**
 * The pen tool as a pure state machine over a glyph's contours. A press adds a corner node; dragging
 * before release turns it smooth with symmetric handles; a press on the first node of the contour being
 * drawn closes it; Esc or Enter ends an open contour. With nothing being drawn, a press on a segment
 * inserts a node there without changing the shape, a press on an end of an open contour continues it,
 * and Alt+press on a node removes its handles.
 */
import type { Contour, Pt } from '../../doc';
import { reverseContour } from '../../geom/ops';
import { copyContour } from './math';
import { insertNode } from './split';

export interface PenState {
  /** The open contour being drawn (null: none). */
  ci: number | null;
  /** While pressed: the node the drag shapes. */
  drag: { ci: number; ni: number } | null;
}

export const PEN_IDLE: PenState = { ci: null, drag: null };

export type PenHit = { kind: 'node'; ci: number; ni: number } | { kind: 'segment'; ci: number; si: number; t: number };

export type PenEvent =
  | { type: 'down'; p: Pt; hit?: PenHit | null; alt?: boolean }
  | { type: 'drag'; p: Pt }
  | { type: 'up' }
  | { type: 'end' };

export interface PenResult {
  state: PenState;
  contours: Contour[];
  /** The contours changed (an edit to save), and its name for the undo list. */
  changed: boolean;
  label: string;
}

const same = (state: PenState, contours: Contour[]): PenResult => ({ state, contours, changed: false, label: '' });

/** The pen state is only meaningful while its contour still exists and is open (undo may change that). */
export function penSanitize(state: PenState, contours: Contour[]): PenState {
  if (state.ci === null) return state.drag && !contours[state.drag.ci]?.nodes[state.drag.ni] ? PEN_IDLE : state;
  const c = contours[state.ci];
  return c && !c.closed && c.nodes.length ? state : PEN_IDLE;
}

export function penReduce(state: PenState, contours: Contour[], ev: PenEvent): PenResult {
  switch (ev.type) {
    case 'down': {
      const hit = ev.hit ?? null;
      if (ev.alt && hit?.kind === 'node') {
        const out = contours.slice();
        const c = copyContour(out[hit.ci]);
        const n = c.nodes[hit.ni];
        if (!n.hi && !n.ho) return same(state, contours);
        delete n.hi; delete n.ho; delete n.smooth;
        out[hit.ci] = c;
        return { state, contours: out, changed: true, label: 'Quitar asas' };
      }
      if (state.ci !== null && contours[state.ci]) {
        const ci = state.ci;
        const c = copyContour(contours[ci]);
        const out = contours.slice();
        if (hit?.kind === 'node' && hit.ci === ci && hit.ni === 0 && c.nodes.length >= 2) {
          c.closed = true;
          out[ci] = c;
          return { state: { ci: null, drag: { ci, ni: 0 } }, contours: out, changed: true, label: 'Cerrar trazo' };
        }
        c.nodes.push({ x: ev.p.x, y: ev.p.y });
        out[ci] = c;
        return { state: { ci, drag: { ci, ni: c.nodes.length - 1 } }, contours: out, changed: true, label: 'Añadir nodo' };
      }
      if (hit?.kind === 'node') {
        const c = contours[hit.ci];
        if (c && !c.closed && c.nodes.length >= 1) {
          if (hit.ni === c.nodes.length - 1) return same({ ci: hit.ci, drag: null }, contours);
          if (hit.ni === 0) {
            const out = contours.slice();
            out[hit.ci] = reverseContour(c);
            return { state: { ci: hit.ci, drag: null }, contours: out, changed: true, label: 'Continuar trazo' };
          }
        }
        return same(state, contours);
      }
      if (hit?.kind === 'segment') {
        const out = contours.slice();
        out[hit.ci] = insertNode(contours[hit.ci], hit.si, hit.t);
        return { state, contours: out, changed: true, label: 'Insertar nodo' };
      }
      const out = [...contours, { closed: false, nodes: [{ x: ev.p.x, y: ev.p.y }] }];
      const ci = out.length - 1;
      return { state: { ci, drag: { ci, ni: 0 } }, contours: out, changed: true, label: 'Nuevo trazo' };
    }
    case 'drag': {
      const d = state.drag;
      if (!d || !contours[d.ci]?.nodes[d.ni]) return same(state, contours);
      const out = contours.slice();
      const c = copyContour(contours[d.ci]);
      const n = c.nodes[d.ni];
      if (Math.hypot(ev.p.x - n.x, ev.p.y - n.y) < 1e-6) {
        if (!n.hi && !n.ho) return same(state, contours);
        delete n.hi; delete n.ho; delete n.smooth;
      } else {
        n.ho = { x: ev.p.x, y: ev.p.y };
        n.hi = { x: 2 * n.x - ev.p.x, y: 2 * n.y - ev.p.y };
        n.smooth = true;
      }
      out[d.ci] = c;
      return { state, contours: out, changed: true, label: 'Curva' };
    }
    case 'up':
      return same({ ci: state.ci, drag: null }, contours);
    case 'end': {
      if (state.ci === null) return same(PEN_IDLE, contours);
      const c = contours[state.ci];
      if (c && c.nodes.length < 2) {
        const out = contours.filter((_, i) => i !== state.ci);
        return { state: PEN_IDLE, contours: out, changed: true, label: 'Quitar trazo' };
      }
      return same(PEN_IDLE, contours);
    }
  }
}
