/**
 * The model of the small curve editor of keyframes and clips (pure functions; the timeline draws it):
 * an Ease as two bezier handles, the box it is drawn in (with room for overshoot), the SVG path, hit
 * tests, dragging (x kept inside 0..1 so time never runs backwards; y free within limits, with snapping to
 * 0 and 1) and keyboard nudges.
 */
import { easeAt } from '../project/ease';
import type { Ease } from '../project/types';

/** x1, y1, x2, y2 of a CSS cubic-bezier. */
export type Handles = [number, number, number, number];

/** Limits of y a handle can take (normEase keeps −5..5; the editor stays readable within these). */
export const Y_MIN = -1.5, Y_MAX = 2.5;

const NAMED: Record<string, Handles> = {
  linear: [1 / 3, 1 / 3, 2 / 3, 2 / 3], in: [0.42, 0, 1, 1], out: [0, 0, 0.58, 1], inOut: [0.42, 0, 0.58, 1],
};

/** The handles of an ease; null for step and hold (they have none: the editor shows them as stairs). */
export function handlesOf(e: Ease): Handles | null {
  if (e.kind === 'bezier') return [e.p[0], e.p[1], e.p[2], e.p[3]];
  const h = NAMED[e.kind];
  return h ? [h[0], h[1], h[2], h[3]] : null;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** An ease from handles: x kept in 0..1, y in Y_MIN..Y_MAX, rounded to 4 decimals. */
export function easeOfHandles(h: Handles): Ease {
  const cx = (v: number) => r4(Math.min(1, Math.max(0, v)));
  const cy = (v: number) => r4(Math.min(Y_MAX, Math.max(Y_MIN, v)));
  return { kind: 'bezier', p: [cx(h[0]), cy(h[1]), cx(h[2]), cy(h[3])] };
}

/** The drawing box: w×h px with `pad` px around, y from ymin to ymax (0..1 plus any overshoot). */
export interface CurveBox { w: number; h: number; pad: number; ymin: number; ymax: number }

/** Lowest and highest y of an ease (its handles too, so they stay in view while dragged). */
export function yRange(e: Ease): [number, number] {
  let lo = 0, hi = 1;
  for (let i = 0; i <= 48; i++) { const y = easeAt(e, i / 48); if (y < lo) lo = y; if (y > hi) hi = y; }
  const h = handlesOf(e);
  if (h) { lo = Math.min(lo, h[1], h[3]); hi = Math.max(hi, h[1], h[3]); }
  return [Math.max(Y_MIN, lo), Math.min(Y_MAX, hi)];
}

export function curveBox(e: Ease, w: number, h: number, pad = 10): CurveBox {
  const [lo, hi] = yRange(e);
  const m = (hi - lo) * 0.06;
  return { w, h, pad, ymin: lo - m, ymax: hi + m };
}

/** Curve units → box px (y up). */
export function toPx(b: CurveBox, x: number, y: number): [number, number] {
  const iw = b.w - 2 * b.pad, ih = b.h - 2 * b.pad;
  return [b.pad + x * iw, b.pad + (1 - (y - b.ymin) / (b.ymax - b.ymin)) * ih];
}

/** Box px → curve units. */
export function fromPx(b: CurveBox, px: number, py: number): [number, number] {
  const iw = Math.max(1, b.w - 2 * b.pad), ih = Math.max(1, b.h - 2 * b.pad);
  return [(px - b.pad) / iw, b.ymin + (1 - (py - b.pad) / ih) * (b.ymax - b.ymin)];
}

/** The SVG path of an ease in a box (a true cubic for beziers, stairs for step/hold). */
export function curvePath(e: Ease, b: CurveBox): string {
  const f = (x: number, y: number) => toPx(b, x, y).map(v => Math.round(v * 100) / 100).join(' ');
  if (e.kind === 'step') return `M ${f(0, 0)} L ${f(0, 1)} L ${f(1, 1)}`;
  if (e.kind === 'hold') return `M ${f(0, 0)} L ${f(1, 0)} L ${f(1, 1)}`;
  const h = handlesOf(e)!;
  return `M ${f(0, 0)} C ${f(h[0], h[1])}, ${f(h[2], h[3])}, ${f(1, 1)}`;
}

/** Which handle (1 or 2) is under a point within `radius` px, or null. */
export function hitHandle(b: CurveBox, h: Handles, px: number, py: number, radius = 14): 1 | 2 | null {
  const [ax, ay] = toPx(b, h[0], h[1]), [bx, by] = toPx(b, h[2], h[3]);
  const da = Math.hypot(px - ax, py - ay), db = Math.hypot(px - bx, py - by);
  if (Math.min(da, db) > radius) return null;
  return da <= db ? 1 : 2;
}

/** Handles with one moved to (x, y) in curve units; values near 0 and 1 snap (within `snap`). */
export function dragHandle(h: Handles, which: 1 | 2, x: number, y: number, snap = 0.025): Handles {
  const s = (v: number) => (Math.abs(v) < snap ? 0 : Math.abs(v - 1) < snap ? 1 : v);
  const nx = Math.min(1, Math.max(0, s(x))), ny = Math.min(Y_MAX, Math.max(Y_MIN, s(y)));
  const out: Handles = [...h];
  if (which === 1) { out[0] = nx; out[1] = ny; } else { out[2] = nx; out[3] = ny; }
  return out;
}

/** Keyboard: a handle moved by (dx, dy) curve units (arrows 0.01, with shift 0.1). */
export function nudgeHandle(h: Handles, which: 1 | 2, dx: number, dy: number): Handles {
  const i = which === 1 ? 0 : 2;
  return dragHandle(h, which, h[i] + dx, h[i + 1] + dy, 0);
}

/** Handles mirrored in time (the curve of the same ease played backwards). */
export function reverseHandles(h: Handles): Handles {
  return [1 - h[2], 1 - h[3], 1 - h[0], 1 - h[1]];
}
