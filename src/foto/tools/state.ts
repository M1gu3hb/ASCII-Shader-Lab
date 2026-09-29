/**
 * Settings of the tools (brush size, hardness, colour tolerance…) and the bits of live state their option bars
 * show (polygon vertices, object points…). A small zustand store: the tools read it with getState(), the option
 * bars subscribe. Settings are remembered in this browser (a convenience; everything works without storage).
 */
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import type { MaskOp } from '../../project/types';

export interface ToolSettings {
  /** Brush diameter as a fraction of the frame's shorter side; hardness, strength 0..1; smoothing 0..1. */
  brushSize: number;
  brushHardness: number;
  brushStrength: number;
  brushSmoothing: number;
  /** Use the pen's pressure when it reports one. */
  brushPressure: boolean;
  /** Edge softness of new shapes, polygons and lassos (output px). */
  shapeSoft: number;
  /** Strength of new shapes, polygons, lassos (0..1: a graded mix). */
  shapeAlpha: number;
  /** Colour selection. */
  colorTol: number;
  colorSoft: number;
  /** Gradient defaults. */
  gradShape: 'linear' | 'radial';
  gradFrom: number;
  gradTo: number;
  gradEase: 'linear' | 'inOut' | 'in' | 'out';
  /** Precise contour: automatic anchors when the path settles. */
  wireAuto: boolean;
}

export const DEFAULTS: ToolSettings = {
  brushSize: 0.06, brushHardness: 0.7, brushStrength: 1, brushSmoothing: 0.35, brushPressure: true,
  shapeSoft: 0, shapeAlpha: 1,
  colorTol: 0.12, colorSoft: 0.08,
  gradShape: 'linear', gradFrom: 1, gradTo: 0, gradEase: 'linear',
  wireAuto: true,
};

const KEY = 'glyphos.foto.herramientas.v1';

function load(): ToolSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const o = JSON.parse(raw) as Partial<ToolSettings>;
    const out = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS) as Array<keyof ToolSettings>) {
      if (typeof o[k] === typeof DEFAULTS[k]) (out as Record<string, unknown>)[k] = o[k];
    }
    return out;
  } catch { return { ...DEFAULTS }; }
}

export const useSettings = create<ToolSettings>(() => (typeof window === 'undefined' ? { ...DEFAULTS } : load()));

let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function setSettings(patch: Partial<ToolSettings>): void {
  useSettings.setState(patch);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(useSettings.getState())); } catch { /* storage unavailable */ }
  }, 300);
}

export const settings = () => useSettings.getState();

/* ------------------------------------------------------------------ live state for the option bars */

export interface ObjectPoint { x: number; y: number; positive: boolean }

export interface LiveState {
  /** Vertices placed by the polygon / contour tools (0 when nothing is being drawn). */
  vertices: number;
  /** Strokes (and points) in the target's mask, for «Aplanar trazos». */
  strokes: number;
  flattening: boolean;
  /** Colour tool: the colour of the part being made or edited. */
  color: string | null;
  colorShare: number | null;
  /** Object tool. */
  object: {
    phase: 'idle' | 'consent' | 'downloading' | 'encoding' | 'ready' | 'busy' | 'error';
    progress: number | null;
    label: string;
    points: ObjectPoint[];
    box: { x: number; y: number; w: number; h: number } | null;
    /** Next tap adds a positive (true) or a negative (false) point (touch has no modifier keys). */
    positive: boolean;
    /** Re-editing an existing object part (its index), or null for a new one. */
    editing: number | null;
    consent: { name: string; size: string; text: string; licence: string; note?: string; from: string } | null;
    error: string | null;
  };
  /** Part editor: the selected part (index) and its kind, the selected vertex. */
  edit: { index: number; kind: string; op: MaskOp; vertex: number } | null;
  /** Contour tool: building the edge map. */
  wire: 'idle' | 'building' | 'ready' | 'error';
}

export const useLive = create<LiveState>(() => ({
  vertices: 0, strokes: 0, flattening: false, color: null, colorShare: null,
  object: { phase: 'idle', progress: null, label: '', points: [], box: null, positive: true, editing: null, consent: null, error: null },
  edit: null,
  wire: 'idle',
}));

export const live = () => useLive.getState();
export const setLive = (patch: Partial<LiveState>) => useLive.setState(patch);
export const setObject = (patch: Partial<LiveState['object']>) => useLive.setState(s => ({ object: { ...s.object, ...patch } }));

export type { MaskOp };

/** A tiny change signal: a tool bumps it, its option bar re-renders (use() inside the component). */
export function signal() {
  let v = 0;
  const subs = new Set<() => void>();
  return {
    bump() { v++; subs.forEach(f => f()); },
    use() { return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => v); },
  };
}
