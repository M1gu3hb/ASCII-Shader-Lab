/**
 * Easing curves shared by keyframes and clips (see Ease in types.ts). Pure math, no DOM.
 */
import type { Ease } from './types';

/** CSS's named curves as cubic-bezier control points. */
const NAMED: Record<'in' | 'out' | 'inOut', [number, number, number, number]> = {
  in: [0.42, 0, 1, 1],
  out: [0, 0, 0.58, 1],
  inOut: [0.42, 0, 0.58, 1],
};

/**
 * y of a CSS cubic-bezier(x1, y1, x2, y2) at x (0..1): x(s) is solved for s by Newton's method, with
 * bisection when the slope is too flat, then y(s) is returned.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  x1 = Math.min(1, Math.max(0, x1)); x2 = Math.min(1, Math.max(0, x2));
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (s: number) => ((ax * s + bx) * s + cx) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  let s = x;
  for (let i = 0; i < 8; i++) {
    const e = sx(s) - x;
    if (Math.abs(e) < 1e-7) return ((ay * s + by) * s + cy) * s;
    const d = dx(s);
    if (Math.abs(d) < 1e-6) break;
    s -= e / d;
  }
  let lo = 0, hi = 1;
  s = x;
  for (let i = 0; i < 40; i++) {
    const v = sx(s);
    if (Math.abs(v - x) < 1e-7) break;
    if (v < x) lo = s; else hi = s;
    s = (lo + hi) / 2;
  }
  return ((ay * s + by) * s + cy) * s;
}

/**
 * The eased value of x (0..1). 'hold' stays at 0 until the end (the value of the key it starts from);
 * 'step' jumps to 1 right away (the next key's value).
 */
export function easeAt(e: Ease, x: number): number {
  const t = Math.min(1, Math.max(0, x));
  switch (e.kind) {
    case 'linear': return t;
    case 'hold': return t >= 1 ? 1 : 0;
    case 'step': return t > 0 ? 1 : 0;
    case 'bezier': return cubicBezier(e.p[0], e.p[1], e.p[2], e.p[3], t);
    default: {
      const c = NAMED[e.kind];
      return c ? cubicBezier(c[0], c[1], c[2], c[3], t) : t;
    }
  }
}
