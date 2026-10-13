/**
 * The editor's view: font units (y up) ↔ screen CSS pixels (y down). Pure.
 * screen = (ox + x·s, oy − y·s).
 */
import type { Metrics, Pt } from '../../doc';
import { clamp, type Box } from './math';

export interface View { s: number; ox: number; oy: number }

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 40;

export const toScreen = (v: View, p: Pt): Pt => ({ x: v.ox + p.x * v.s, y: v.oy - p.y * v.s });
export const toFont = (v: View, p: Pt): Pt => ({ x: (p.x - v.ox) / v.s, y: (v.oy - p.y) / v.s });

/** Zooms by `factor` keeping the font point under the screen point `at` where it is. */
export function zoomAbout(v: View, factor: number, at: Pt, min = MIN_SCALE, max = MAX_SCALE): View {
  const s = clamp(v.s * factor, min, max);
  const k = s / v.s;
  return { s, ox: at.x - (at.x - v.ox) * k, oy: at.y - (at.y - v.oy) * k };
}

export const panBy = (v: View, dx: number, dy: number): View => ({ s: v.s, ox: v.ox + dx, oy: v.oy + dy });

/**
 * Two fingers: the font point that was under their first midpoint follows the midpoint, and the scale
 * follows their distance.
 */
export function pinchView(v0: View, a0: Pt, b0: Pt, a1: Pt, b1: Pt): View {
  const d0 = Math.max(1, Math.hypot(b0.x - a0.x, b0.y - a0.y)), d1 = Math.max(1, Math.hypot(b1.x - a1.x, b1.y - a1.y));
  const s = clamp(v0.s * (d1 / d0), MIN_SCALE, MAX_SCALE);
  const m0 = toFont(v0, { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 });
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  return { s, ox: m1.x - m0.x * s, oy: m1.y + m0.y * s };
}

/** The view that shows `box` whole and centred in a w×h area with `pad` pixels around it. */
export function fitView(box: Box, w: number, h: number, pad = 32): View {
  const bw = Math.max(1, box.x1 - box.x0), bh = Math.max(1, box.y1 - box.y0);
  const s = clamp(Math.min(Math.max(1, w - 2 * pad) / bw, Math.max(1, h - 2 * pad) / bh), MIN_SCALE, MAX_SCALE);
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  return { s, ox: w / 2 - cx * s, oy: h / 2 + cy * s };
}

/** What the editor frames on open: the advance box from descender to ascender, and the drawing if it overflows. */
export function glyphFrame(adv: number, m: Metrics, drawing: Box | null): Box {
  const b = { x0: 0, y0: Math.min(m.desc, 0), x1: Math.max(1, adv), y1: Math.max(m.asc, m.cap, m.xh) };
  if (!drawing) return b;
  return { x0: Math.min(b.x0, drawing.x0), y0: Math.min(b.y0, drawing.y0), x1: Math.max(b.x1, drawing.x1), y1: Math.max(b.y1, drawing.y1) };
}

const LEVELS = [0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];

/** The next zoom level up or down from `s` (the − and + buttons). */
export function stepZoom(s: number, dir: 1 | -1): number {
  if (dir > 0) return LEVELS.find(l => l > s * 1.01) ?? MAX_SCALE;
  for (let i = LEVELS.length - 1; i >= 0; i--) if (LEVELS[i] < s / 1.01) return LEVELS[i];
  return MIN_SCALE;
}
