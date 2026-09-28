/**
 * evaluate(project, t): what the frame at time t is made of. Pure (no DOM, no clock, no Math.random): the
 * same project at the same t always gives the same FrameState, and the compositor draws a FrameState the
 * same way at any scale, so the preview and the exported files cannot disagree.
 *
 * For every layer, bottom to top:
 *   1. skipped when hidden or outside its span;
 *   2. keyframe tracks applied (numbers interpolate with the left key's easing; strings and booleans switch
 *      at their key; before the first key the first value holds, after the last the last one);
 *   3. clips applied in order (clips.ts): property changes, an opacity factor, a mask, per-cell hooks;
 *   4. values brought back into range (normLayer), so a keyframe can never push a layer out of its limits;
 *   5. the time of its source frame (video: seconds into the file; sequence: which photo).
 */
import { clipTime, hashString, paramsOf, templateById, type CellFxFactory, type ClipEffect, type ParamValue, type RevealFactory, type TileFactory } from './clips';
import { easeAt } from './ease';
import { normLayer } from './normalize';
// the first templates register themselves with clips.ts (a project that uses them evaluates anywhere)
import './templates';
import type { CellFx } from '../glyphs/index';
import { finishesDependOnTime } from '../fx/index';
import type { Finish, Id, Key, Layer, Mask, Project, Source, Track } from './types';

export interface ClipState {
  id: Id;
  template: string;
  /** Eased progress 0..1. */
  p: number;
  /** The playhead is inside the clip. */
  active: boolean;
  /** The template is not registered here (made with a newer catalog): the clip does nothing. */
  unknown: boolean;
}

export interface LayerFrame {
  /** The layer as it is at t (tracks and clips applied): a copy, never the project's own object. */
  layer: Layer;
  /** Position in project.layers. */
  index: number;
  /** Seconds since the layer's span began (t when it has none). */
  local: number;
  /** The layer's picture source (null for 'below', 'style', text and shapes). */
  source: Source | null;
  /** Time of the source frame to draw: seconds into a video; into a sequence (the provider picks the photo). */
  srcTime: number;
  /** Per-cell changes from clips ('glyphs' layers), composed in clip order. */
  cells: CellFxFactory | null;
  /** Per-cell visibility from clips ('ascii' and 'glyphs' layers), multiplied in clip order. */
  reveal: RevealFactory | null;
  /** Per-tile movement of the layer's picture from clips (offsets add, scales multiply), and the tile size for layers without a grid. */
  tiles: TileFactory | null;
  tileCell: number;
  /** Masks from clips the layer must also be inside (after its own mask). */
  within: Mask[];
  /** Characters clips may draw on a glyph layer (their font is loaded first). */
  glyphs: string;
  clips: ClipState[];
}

export interface FrameState {
  project: Project;
  t: number;
  w: number;
  h: number;
  bg: string;
  transparent: boolean;
  seed: string;
  /** Visible layers at t, bottom to top. */
  layers: LayerFrame[];
}

/* ------------------------------------------------------------------ paths */

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

/** Value at a dot path ('xf.x', 'finishes.0.amount'…), or undefined. */
export function getPath(o: unknown, path: string): unknown {
  let cur: unknown = o;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || UNSAFE.has(k)) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/**
 * Sets an existing value at a dot path, in place, when the new value has the same type as the old one
 * (a number track never turns a colour into a number). Returns whether it changed anything.
 */
export function setPath(o: unknown, path: string, v: ParamValue): boolean {
  const keys = path.split('.');
  let cur: unknown = o;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur === null || typeof cur !== 'object' || UNSAFE.has(keys[i])) return false;
    cur = (cur as Record<string, unknown>)[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (cur === null || typeof cur !== 'object' || UNSAFE.has(last)) return false;
  const rec = cur as Record<string, unknown>;
  const old = rec[last];
  if (old === undefined) {
    // a colour that can be empty (paper, fill, stroke) takes a colour; nothing else is created
    if (!(last in rec) || typeof v !== 'string') return false;
  } else if (old !== null && typeof old !== typeof v) return false;
  else if (old === null && typeof v !== 'string') return false;
  if (typeof v === 'number' && !Number.isFinite(v)) return false;
  rec[last] = v;
  return true;
}

/* ------------------------------------------------------------------ tracks */

/** The value of a track at t (see the top of this file). */
export function trackValue(keys: readonly Key[], t: number): ParamValue | undefined {
  const n = keys.length;
  if (!n) return undefined;
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[n - 1].t) return keys[n - 1].v;
  // last key at or before t (keys are sorted; later duplicates win)
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keys[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  const a = keys[lo], b = keys[lo + 1];
  if (!b) return a.v;
  if (typeof a.v !== 'number' || typeof b.v !== 'number') {
    if (a.ease.kind === 'step') return b.v;
    return a.v;
  }
  const span = b.t - a.t;
  const k = span > 0 ? easeAt(a.ease, (t - a.t) / span) : 1;
  return a.v + (b.v - a.v) * k;
}

/* ------------------------------------------------------------------ spans and sources */

/** Whether a layer shows at t: visible and inside its span (in ≤ t < out). */
export function inSpan(l: Pick<Layer, 'visible' | 'span'>, t: number): boolean {
  if (!l.visible) return false;
  return !l.span || (t >= l.span.in && t < l.span.out);
}

/**
 * Seconds into a source for project time t. A video plays from the start of the project and starts again
 * when it ends; a sequence is handed the project time (its provider picks the photo by `hold`).
 */
export function sourceTime(s: Source | null, t: number): number {
  if (!s) return 0;
  if (s.kind === 'video') {
    const d = s.duration ?? 0;
    if (!(d > 0)) return Math.max(0, t);
    const x = t % d;
    return x < 0 ? x + d : x;
  }
  if (s.kind === 'sequence') return Math.max(0, t);
  return 0;
}

/** Which photo of a sequence shows at t (looping through the list). */
export function sequenceIndex(s: Pick<Source, 'media' | 'hold'>, t: number): number {
  const n = s.media.length;
  if (n <= 1) return 0;
  const hold = s.hold && s.hold > 0 ? s.hold : 1;
  const i = Math.floor(Math.max(0, t) / hold + 1e-9) % n;
  return i;
}

/* ------------------------------------------------------------------ clips */

function composeCells(a: CellFxFactory | null, b: CellFxFactory): CellFxFactory {
  if (!a) return b;
  return grid => {
    const fa = a(grid), fb = b(grid);
    return (i, col, row) => {
      const x = fa(i, col, row), y = fb(i, col, row);
      if (!x) return y;
      if (!y) return x;
      const out: CellFx = { ...x, ...y };
      if (x.visible !== undefined && y.visible !== undefined) out.visible = x.visible * y.visible;
      if (x.dx !== undefined && y.dx !== undefined) out.dx = x.dx + y.dx;
      if (x.dy !== undefined && y.dy !== undefined) out.dy = x.dy + y.dy;
      if (x.scale !== undefined && y.scale !== undefined) out.scale = x.scale * y.scale;
      if (x.rot !== undefined && y.rot !== undefined) out.rot = x.rot + y.rot;
      return out;
    };
  };
}

function composeTiles(a: TileFactory | null, b: TileFactory): TileFactory {
  if (!a) return b;
  return grid => {
    const fa = a(grid), fb = b(grid);
    return (col, row) => {
      const x = fa(col, row), y = fb(col, row);
      if (!x) return y;
      if (!y) return x;
      return {
        dx: (x.dx ?? 0) + (y.dx ?? 0), dy: (x.dy ?? 0) + (y.dy ?? 0), scale: (x.scale ?? 1) * (y.scale ?? 1), sy: (x.sy ?? 1) * (y.sy ?? 1),
        rot: (x.rot ?? 0) + (y.rot ?? 0), alpha: (x.alpha ?? 1) * (y.alpha ?? 1),
      };
    };
  };
}

function composeReveal(a: RevealFactory | null, b: RevealFactory): RevealFactory {
  if (!a) return b;
  return grid => {
    const fa = a(grid), fb = b(grid);
    return (col, row) => fa(col, row) * fb(col, row);
  };
}

/* ------------------------------------------------------------------ evaluate */

/** Tracks of each layer, by layer id. */
function tracksByLayer(tracks: readonly Track[]): Map<Id, Track[]> {
  const m = new Map<Id, Track[]>();
  for (const tr of tracks) {
    const list = m.get(tr.layer);
    if (list) list.push(tr); else m.set(tr.layer, [tr]);
  }
  return m;
}

const clone = <T>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

/** One layer at time t, or null when it does not show then. */
export function evaluateLayer(project: Project, index: number, t: number, tracks?: Track[]): LayerFrame | null {
  const base = project.layers[index];
  if (!base || !inSpan(base, t)) return null;
  let layer: Layer = base;
  let touched = false;
  const own = () => { if (!touched) { layer = clone(base); touched = true; } return layer; };
  for (const tr of tracks ?? []) {
    const v = trackValue(tr.keys, t);
    if (v === undefined) continue;
    const cur = getPath(layer, tr.path);
    if (cur === v) continue;
    setPath(own(), tr.path, v);
  }
  let opacity = 1;
  let mask: Mask | null | undefined;
  let cells: CellFxFactory | null = null;
  let reveal: RevealFactory | null = null;
  let tiles: TileFactory | null = null;
  let tileCell = 32;
  const within: Mask[] = [];
  const added: Finish[] = [];
  let glyphs = '';
  const states: ClipState[] = [];
  for (const clip of base.clips) {
    const def = templateById(clip.template);
    const ct = clipTime(clip, t);
    states.push({ id: clip.id, template: clip.template, p: ct.p, active: ct.active, unknown: !def });
    if (!def || !def.kinds.includes(base.kind)) continue;
    let fx: ClipEffect | null = null;
    try {
      fx = def.apply({
        layer, clip, params: paramsOf(def, clip), p: ct.p, linear: ct.linear, raw: ct.raw, local: ct.local, pos: ct.pos, t,
        seed: `${project.seed}|${base.id}|${clip.id}`, project,
      });
    } catch {
      fx = null;
    }
    if (!fx) continue;
    if (fx.set) for (const [path, v] of Object.entries(fx.set)) setPath(own(), path, v);
    if (typeof fx.opacity === 'number' && Number.isFinite(fx.opacity)) opacity *= Math.min(1, Math.max(0, fx.opacity));
    if (fx.mask !== undefined) mask = fx.mask;
    if (fx.cells) cells = composeCells(cells, fx.cells);
    if (fx.reveal) reveal = composeReveal(reveal, fx.reveal);
    if (fx.tiles) {
      tiles = composeTiles(tiles, fx.tiles);
      if (typeof fx.tileCell === 'number' && Number.isFinite(fx.tileCell)) tileCell = Math.min(512, Math.max(2, fx.tileCell));
    }
    if (fx.within) within.push(clone(fx.within));
    if (fx.finishes?.length) added.push(...fx.finishes);
    if (fx.glyphs) glyphs += fx.glyphs;
  }
  if (touched || mask !== undefined || opacity !== 1 || added.length) {
    const l = own();
    if (mask !== undefined) l.mask = mask ? clone(mask) : null;
    // (finishes past the limit of a layer are left out; normLayer checks each one)
    if (added.length) l.finishes = [...l.finishes, ...clone(added)];
    // back into range (a keyframe or a template may have pushed a value past its limits)
    layer = normLayer(l, l.id) ?? l;
    layer.opacity *= opacity;
  }
  const srcId = 'source' in layer ? layer.source : null;
  const source = srcId ? project.sources.find(s => s.id === srcId) ?? null : null;
  const local = base.span ? t - base.span.in : t;
  return { layer, index, local, source, srcTime: sourceTime(source, t), cells, reveal, tiles, tileCell, within, glyphs, clips: states };
}

/** The frame at time t (see the top of this file). */
export function evaluate(project: Project, t: number): FrameState {
  const time = Number.isFinite(t) ? Math.max(0, t) : 0;
  const byLayer = tracksByLayer(project.tracks);
  const layers: LayerFrame[] = [];
  for (let i = 0; i < project.layers.length; i++) {
    const lf = evaluateLayer(project, i, time, byLayer.get(project.layers[i].id));
    if (lf) layers.push(lf);
  }
  return {
    project, t: time, w: project.canvas.w, h: project.canvas.h, bg: project.canvas.bg, transparent: project.canvas.transparent,
    seed: project.seed, layers,
  };
}

/** Times of the frames of a clip of the project: t = start + i / fps (the export loop). */
export function frameTimes(project: Pick<Project, 'time'>, o: { fps?: number; from?: number; to?: number } = {}): number[] {
  const fps = o.fps && o.fps > 0 ? o.fps : project.time.fps;
  const from = Math.max(0, o.from ?? 0);
  const to = o.to ?? project.time.duration;
  if (!(to > from)) return [from];
  const n = Math.max(1, Math.round((to - from) * fps));
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = from + i / fps;
  return out;
}

/** A stable number for a string (seeds of layers and clips). */
export const seedOf = hashString;

/**
 * Whether the picture of a project changes with time (for a studio deciding to redraw when the playhead
 * moves, or to export one still instead of a clip): a video or photo sequence, keyframes, clips, ASCII
 * layers (their patterns move unless their speed is 0), finishes that move (animated grain, rolling
 * scanlines, chroma jitter).
 */
export function dependsOnTime(p: Project): boolean {
  if (p.tracks.length) return true;
  for (const l of p.layers) {
    if (!l.visible) continue;
    if (l.span || l.clips.length || finishesDependOnTime(l.finishes)) return true;
    if (l.kind === 'ascii' && l.style.motion.speed !== 0) return true;
    if ('source' in l) {
      const s = p.sources.find(x => x.id === l.source);
      if (s && (s.kind === 'video' || (s.kind === 'sequence' && s.media.length > 1))) return true;
    }
  }
  return false;
}
