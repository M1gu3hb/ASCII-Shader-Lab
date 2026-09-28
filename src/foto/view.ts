/**
 * Viewport geometry: where the frame (the project's canvas) sits in the viewport for a zoom and a pan,
 * and the conversions tools need (client px ↔ frame units). Pure functions plus one live snapshot of the
 * mounted viewport (setViewport), which the ToolHost reads.
 *
 * The frame is centred in the viewport's free area (the viewport minus what covers it: on a phone, the
 * tools sheet), moved by `pan` (CSS px), scaled by k (CSS px per project px).
 */
import type { Pt, View } from './tools/types';

export interface Rect { x: number; y: number; w: number; h: number }

/** Room kept around the frame when it is fitted (CSS px). */
export const FIT_PAD = 20;
export const ZOOM_MIN = 0.02;
export const ZOOM_MAX = 16;

export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/** CSS px per project px for 'fit' (or the number given), within the zoom limits. */
export function zoomValue(zoom: 'fit' | number, area: Rect, cw: number, ch: number, pad = FIT_PAD): number {
  if (zoom !== 'fit') return clampZoom(zoom);
  const k = Math.min((area.w - pad * 2) / cw, (area.h - pad * 2) / ch);
  return clampZoom(Number.isFinite(k) && k > 0 ? k : 1);
}

/** The frame's rectangle in viewport CSS px: centred in `area`, moved by `pan`. */
export function frameRect(k: number, pan: { x: number; y: number }, area: Rect, cw: number, ch: number): Rect {
  const w = cw * k, h = ch * k;
  return { x: area.x + area.w / 2 - w / 2 + pan.x, y: area.y + area.h / 2 - h / 2 + pan.y, w, h };
}

/** Keeps at least `keep` CSS px of the frame inside the area (a pan can never lose the picture). */
export function clampPan(pan: { x: number; y: number }, k: number, area: Rect, cw: number, ch: number, keep = 48): { x: number; y: number } {
  const w = cw * k, h = ch * k;
  const mx = Math.max(0, area.w / 2 + w / 2 - keep), my = Math.max(0, area.h / 2 + h / 2 - keep);
  return { x: Math.min(mx, Math.max(-mx, pan.x)), y: Math.min(my, Math.max(-my, pan.y)) };
}

/**
 * The pan that keeps the frame point under (sx, sy) (viewport CSS px) in place when the zoom goes from k0
 * to k1: zooming around the cursor or the fingers.
 */
export function panForZoom(pan: { x: number; y: number }, k0: number, k1: number, sx: number, sy: number, area: Rect): { x: number; y: number } {
  const ax = area.x + area.w / 2, ay = area.y + area.h / 2;
  const cx = ax + pan.x, cy = ay + pan.y;
  const r = k1 / k0;
  return { x: sx - (sx - cx) * r - ax, y: sy - (sy - cy) * r - ay };
}

/** A View (the tools' contract) for a frame rectangle inside an element whose client rect is `origin()`. */
export function makeView(frame: Rect, canvas: { w: number; h: number }, origin: () => { left: number; top: number }): View {
  return {
    frame,
    canvas,
    zoom: Math.min(frame.w, frame.h),
    toFrame(clientX: number, clientY: number): Pt {
      const o = origin();
      return { x: (clientX - o.left - frame.x) / frame.w, y: (clientY - o.top - frame.y) / frame.h };
    },
    toScreen(p: Pt): Pt {
      return { x: frame.x + p.x * frame.w, y: frame.y + p.y * frame.h };
    },
  };
}

/* ------------------------------------------------------------------ the mounted viewport */

let live: { view: View; el: HTMLElement } | null = null;

/** The viewport publishes its geometry here on every layout change (the ToolHost reads it). */
export function setViewport(v: { view: View; el: HTMLElement } | null) { live = v; }

/** The current View, or a neutral one when no viewport is mounted. */
export function currentView(): View {
  if (live) return live.view;
  return makeView({ x: 0, y: 0, w: 1, h: 1 }, { w: 1, h: 1 }, () => ({ left: 0, top: 0 }));
}

export const viewportEl = () => live?.el ?? null;
