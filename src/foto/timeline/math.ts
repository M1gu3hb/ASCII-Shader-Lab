/**
 * The timeline's pure math: time ↔ px, zoom around a point (wheel, buttons, pinch), snapping to keys,
 * clip edges, the playhead and the frame grid, drags turned into times, ruler ticks with readable labels,
 * frame steps and the lanes of overlapping clips. No DOM, no store: tested in tests/unit/anim-timeline.
 */
import type { AnimClip } from '../../project/types';

export interface View {
  /** Pixels per second. */
  pps: number;
  /** Seconds at the left edge of the lanes (the scroll position). */
  start: number;
  /** Width of the lanes in px. */
  width: number;
}

export const MIN_PPS = 8;
export const MAX_PPS = 2400;

export const timeToX = (v: View, t: number) => (t - v.start) * v.pps;
export const xToTime = (v: View, x: number) => v.start + x / v.pps;

/** A view that shows the whole duration (plus a margin) in `width` px. */
export function fitView(duration: number, width: number, margin = 0.04): View {
  const d = Math.max(0.5, duration);
  const pps = clampPps((Math.max(40, width) * (1 - margin * 2)) / d);
  return { pps, start: -d * margin, width };
}

export const clampPps = (pps: number) => Math.min(MAX_PPS, Math.max(MIN_PPS, pps));

/** Zoom by `factor` keeping the time under `anchorX` px where it is. */
export function zoomAt(v: View, factor: number, anchorX: number): View {
  const pps = clampPps(v.pps * factor);
  const t = xToTime(v, anchorX);
  return { ...v, pps, start: t - anchorX / pps };
}

/** Pinch: the view from the gesture's start, zoomed by the ratio of finger distances around their midpoint. */
export function pinchZoom(from: View, d0: number, d1: number, mid0: number, mid1: number): View {
  const factor = d0 > 0 ? d1 / d0 : 1;
  const pps = clampPps(from.pps * factor);
  // the time under the first midpoint stays under the (moving) midpoint
  const t = xToTime(from, mid0);
  return { ...from, pps, start: t - mid1 / pps };
}

/** Keeps the view within [−margin, duration + margin] (as far as its width allows). */
export function clampView(v: View, duration: number, margin = 0.5): View {
  const span = v.width / v.pps;
  const lo = -margin, hi = Math.max(lo, duration + margin - span);
  return { ...v, start: Math.min(hi, Math.max(lo, v.start)) };
}

/** Scroll the view so time t is visible (with `pad` px on each side). */
export function reveal(v: View, t: number, pad = 40): View {
  const x = timeToX(v, t);
  if (x < pad) return { ...v, start: t - pad / v.pps };
  if (x > v.width - pad) return { ...v, start: t - (v.width - pad) / v.pps };
  return v;
}

/* ------------------------------------------------------------------ snapping */

export interface SnapResult { t: number; snapped: boolean; to?: number }

/**
 * The nearest candidate within `px` pixels of t (at this zoom), or t on the frame grid when `fps` is given,
 * or t itself.
 */
export function snapTime(t: number, candidates: readonly number[], v: Pick<View, 'pps'>, o: { px?: number; fps?: number } = {}): SnapResult {
  const tol = (o.px ?? 8) / v.pps;
  let best = t, bd = Infinity;
  for (const c of candidates) { const d = Math.abs(c - t); if (d < bd) { bd = d; best = c; } }
  if (bd <= tol) return { t: best, snapped: true, to: best };
  if (o.fps && o.fps > 0) return { t: Math.round(t * o.fps) / o.fps, snapped: false };
  return { t, snapped: false };
}

/** Where a clip may snap when moved: both of its edges are tried, the one that snaps closest wins. */
export function snapClipStart(start: number, dur: number, candidates: readonly number[], v: Pick<View, 'pps'>, o: { px?: number; fps?: number } = {}): SnapResult {
  const a = snapTime(start, candidates, v, { px: o.px });
  const b = snapTime(start + dur, candidates, v, { px: o.px });
  if (a.snapped && (!b.snapped || Math.abs(a.t - start) <= Math.abs(b.t - start - dur))) return { t: a.t, snapped: true, to: a.t };
  if (b.snapped) return { t: b.t - dur, snapped: true, to: b.t };
  return { t: o.fps && o.fps > 0 ? Math.round(start * o.fps) / o.fps : start, snapped: false };
}

/** A pointer drag of dx px turned into a new time from `t0` (never before 0). */
export const dragTo = (t0: number, dx: number, v: Pick<View, 'pps'>) => Math.max(0, t0 + dx / v.pps);

/** Snap targets of a project: 0, the end, every key, every clip edge, every span edge, the playhead. */
export function snapTargets(o: { duration: number; keys: readonly number[]; clips: ReadonlyArray<Pick<AnimClip, 'start' | 'dur' | 'id'>>; spans?: ReadonlyArray<{ in: number; out: number } | null>; playhead?: number; except?: string }): number[] {
  const s = new Set<number>([0, o.duration]);
  for (const k of o.keys) s.add(k);
  for (const c of o.clips) if (c.id !== o.except) { s.add(c.start); s.add(c.start + c.dur); }
  for (const sp of o.spans ?? []) if (sp) { s.add(sp.in); s.add(sp.out); }
  if (o.playhead !== undefined) s.add(o.playhead);
  return [...s].sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ frames */

/** One frame (or `n` frames) from t, on the frame grid, within [0, duration]. */
export function frameStep(t: number, fps: number, n: number, duration: number): number {
  const f = fps > 0 ? fps : 30;
  const frame = Math.round(t * f) + n;
  return Math.min(duration, Math.max(0, frame / f));
}

/** «00:01.25» (minutes:seconds.hundredths) or «1:02:03.00» past an hour; frames as «+12f» when asked. */
export function formatTime(t: number, fps?: number): string {
  const s = Math.max(0, t);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const ss = sec.toFixed(2).padStart(5, '0');
  const base = h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
  return fps ? `${base} · ${Math.round(s * fps)}f` : base;
}

/* ------------------------------------------------------------------ ruler */

export interface Tick { t: number; x: number; major: boolean; label?: string }

const STEPS = [1 / 60, 1 / 30, 1 / 10, 1 / 5, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/** Ticks for the ruler: major ticks at least `minPx` apart, with labels; minor ones in between. */
export function rulerTicks(v: View, minPx = 72): Tick[] {
  const major = STEPS.find(s => s * v.pps >= minPx) ?? STEPS[STEPS.length - 1];
  const minors = major >= 60 ? 6 : major >= 1 ? (major === 2 || major === 10 ? 4 : 5) : major >= 0.25 ? 5 : 2;
  const minor = major / minors;
  const t0 = Math.floor(v.start / minor) * minor, t1 = v.start + v.width / v.pps;
  const out: Tick[] = [];
  for (let k = 0, t = t0; t <= t1 + 1e-9 && k < 4000; k++, t = t0 + k * minor) {
    if (t < -1e-9) continue;
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    out.push({ t, x: timeToX(v, t), major: isMajor, ...(isMajor ? { label: tickLabel(t, major) } : {}) });
  }
  return out;
}

function tickLabel(t: number, step: number): string {
  if (step >= 60) return `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
  if (step >= 1) return t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : `${Math.round(t)} s`;
  const d = step >= 0.25 ? 2 : 2;
  return `${Number(t.toFixed(d))} s`;
}

/* ------------------------------------------------------------------ lanes */

/** Lane of each clip on a row: overlapping clips go to the next free lane. Returns lane per id and count. */
export function clipLanes(clips: ReadonlyArray<Pick<AnimClip, 'id' | 'start' | 'dur'>>): { lane: Map<string, number>; lanes: number } {
  const sorted = [...clips].sort((a, b) => a.start - b.start || b.dur - a.dur);
  const ends: number[] = [];
  const lane = new Map<string, number>();
  for (const c of sorted) {
    let k = ends.findIndex(e => e <= c.start + 1e-6);
    if (k < 0) { k = ends.length; ends.push(0); }
    ends[k] = c.start + c.dur;
    lane.set(c.id, k);
  }
  return { lane, lanes: Math.max(1, ends.length) };
}

/** Playback: the next time of a clock running at `rate` for `dt` seconds, with a loop region or the whole length. */
export function advance(t: number, dt: number, rate: number, o: { duration: number; region?: { in: number; out: number } | null; loop: boolean }): { t: number; ended: boolean } {
  const a = o.region ? o.region.in : 0, b = o.region ? o.region.out : o.duration;
  const len = b - a;
  let n = t + dt * rate;
  if (o.region || o.loop) {
    if (!(len > 1e-6)) return { t: a, ended: false };
    // outside the region (the playhead was elsewhere): start from its edge
    if (o.region && (t < a - 1e-9 || t > b + 1e-9)) return { t: rate >= 0 ? a : b, ended: false };
    n = a + ((((n - a) % len) + len) % len);
    return { t: n, ended: false };
  }
  if (n >= b) return { t: b, ended: rate > 0 };
  if (n <= a) return { t: a, ended: rate < 0 };
  return { t: n, ended: false };
}
