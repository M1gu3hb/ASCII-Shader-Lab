/**
 * The photo studio's interface state (zustand): what the screen shows, never what the project is. The
 * project, its undo and its versions live in src/project/store (useProject); this store holds the view
 * (zoom, pan, compare), the active tool, the open sheet, the phone layout and the status line.
 */
import { create } from 'zustand';
import type { MaskOp } from '../project/types';

export type MaskView = 'tint' | 'grey' | 'off';
export type SheetId = 'none' | 'export' | 'help' | 'styles' | 'versions' | 'settings' | 'camera' | 'saveas' | 'new';
/** Snap points of the phone's tools sheet. */
export type Snap = 'closed' | 'peek' | 'half' | 'full';
export type MobileTab = 'herramientas' | 'capas' | 'capa' | 'explorar';
export type Quality = 'auto' | 'ligera';

export interface RenderInfo {
  /** Milliseconds of the last render, its scale (render px per output px) and whether it was the light one. */
  ms: number;
  scale: number;
  light: boolean;
  w: number;
  h: number;
  warnings: string[];
  /** ASCII layers drawn by the Canvas 2D basic engine (no WebGL 2 here, or ?motor=basico). */
  basic: boolean;
  /** Renders so far (tests wait for a new one). */
  n: number;
}

export interface FotoUI {
  screen: 'start' | 'edit';
  /** The active tool (an id of TOOLS, or 'mano' for the built-in pan tool), or null. */
  tool: string | null;
  op: MaskOp;
  maskView: MaskView;
  /** Before/after: the original on the left of the divider (split 0..1 of the frame's width). */
  compare: boolean;
  split: number;
  /** «Mantén para ver el original». */
  holding: boolean;
  /** CSS px per project px, or 'fit'. */
  zoom: 'fit' | number;
  /** The zoom in effect (CSS px per project px), set by the viewport (also when fitted). */
  zk: number;
  pan: { x: number; y: number };
  sheet: SheetId;
  /** The «Recorte» side panel. */
  cutout: boolean;
  /** Phones: the tools sheet and its tab. */
  snap: Snap;
  mtab: MobileTab;
  /** Height of the phone's tools sheet in view (px): the viewport keeps the art above it. */
  sheetH: number;
  /** Phones: only the art and the four actions. */
  immersive: boolean;
  status: string;
  /** Screen-reader announcement (cleared a few seconds later). */
  live: string;
  diceScope: 'capa' | 'todo';
  quality: Quality;
  render: RenderInfo;
  playing: boolean;
  /** A version to compare with the current one (the versions sheet). */
  compareWith: string | null;
  /** An edit waits to be saved. */
  saving: boolean;
  /** Bumped when the tool list changes (the palette re-reads TOOLS). */
  toolsV: number;
}

const narrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px), (max-height: 500px) and (orientation: landscape) and (max-width: 1000px)').matches;

function loadQuality(): Quality {
  try { return localStorage.getItem('glyphos.foto.calidad') === 'ligera' ? 'ligera' : 'auto'; } catch { return 'auto'; }
}

export const useFoto = create<FotoUI>(() => ({
  screen: 'start', tool: null, op: 'add', maskView: 'tint', compare: false, split: 0.5, holding: false,
  zoom: 'fit', zk: 1, pan: { x: 0, y: 0 }, sheet: 'none', cutout: false, snap: 'closed', mtab: 'capas', sheetH: 0, immersive: narrow(),
  status: '', live: '', diceScope: 'capa', quality: loadQuality(),
  render: { ms: 0, scale: 0, light: false, w: 0, h: 0, warnings: [], basic: false, n: 0 }, playing: false, compareWith: null, toolsV: 0, saving: false,
}));

export const ui = () => useFoto.getState();
export const setUI = (p: Partial<FotoUI>) => useFoto.setState(p);

export function setQuality(q: Quality) {
  setUI({ quality: q });
  try { localStorage.setItem('glyphos.foto.calidad', q); } catch { /* storage unavailable */ }
}

let liveT = 0;
let statusT = 0;
/** The status line and a screen-reader announcement (both in Spanish). */
export function say(msg: string, o: { keep?: boolean } = {}) {
  clearTimeout(liveT);
  clearTimeout(statusT);
  setUI({ status: msg, live: '' });
  requestAnimationFrame(() => setUI({ live: msg }));
  liveT = window.setTimeout(() => setUI({ live: '' }), 7000);
  if (!o.keep) statusT = window.setTimeout(() => { if (ui().status === msg) setUI({ status: '' }); }, 6000);
}

export const openSheet = (sheet: SheetId) => setUI({ sheet });
export const closeSheet = () => setUI({ sheet: 'none' });
