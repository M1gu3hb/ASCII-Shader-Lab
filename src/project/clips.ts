/**
 * Animation clips: templates placed on a layer for a stretch of the timeline («Foto → ASCII», «Escritura de
 * terminal»…). This file is the registry and the time math every template shares; the templates themselves
 * live in catalogs that register here (templates.ts has the first two; a later catalog adds the rest).
 *
 * A template is a pure function of (progress, params, layer at t) → changes of that layer:
 *   - `set`: property values by dot path, like keyframe tracks ('opacity', 'style.glyph.cell', 'text'…);
 *   - `opacity`: a factor on the layer's opacity;
 *   - `mask`: a mask to use instead of the layer's own;
 *   - `cells`: per-cell changes (CellFx) for 'glyphs' layers: hide, move, swap or recolour characters;
 *   - `reveal`: per-cell visibility 0..1 for 'ascii' (and 'glyphs') layers: a cell pattern that uncovers
 *     or hides the shader characters, drawn on the engine's own cell grid.
 * Progress runs 0 → 1 over the clip (after repeats, ping-pong and easing); 1 is the template's end state.
 * Reverse plays the clip backwards in time (real reverse: the frame at τ is the forward frame at dur − τ),
 * so an entry becomes an exit (photo → ASCII becomes ASCII → photo) with the same cells in reverse order.
 * All randomness comes from `ctx.seed` (project seed + layer + clip): the same clip gives the same frames.
 */
import type { ParamDef } from '../fx/index';
import type { CellFx } from '../glyphs/index';
import { easeAt } from './ease';
import type { AnimClip, Layer, LayerKind, Mask, Project } from './types';

export type ParamValue = number | string | boolean;

/** Grid a per-cell hook works on (the glyph grid, or the engine's cell grid for 'ascii' layers). */
export interface CellGrid {
  cols: number;
  rows: number;
  /** The characters of a glyph grid (row-major, ' ' = empty); absent for shader ASCII. */
  chars?: readonly string[];
}

/** Per-cell changes of a glyph layer for one frame: made once per frame for its grid, then asked per cell. */
export type CellFxFactory = (grid: CellGrid) => (i: number, col: number, row: number) => CellFx | null;
/** Per-cell visibility 0..1 for one frame (1 = as drawn). */
export type RevealFactory = (grid: CellGrid) => (col: number, row: number) => number;

export interface ClipEffect {
  set?: Record<string, ParamValue>;
  opacity?: number;
  mask?: Mask | null;
  cells?: CellFxFactory;
  reveal?: RevealFactory;
}

export interface ClipContext {
  /** The layer at this time, with its keyframes and the clips before this one applied. Read only. */
  layer: Readonly<Layer>;
  clip: Readonly<AnimClip>;
  /** The template's params with their defaults filled in. */
  params: Record<string, ParamValue>;
  /** Progress 0..1 after repeats, ping-pong, reverse and easing (1 = the template's end state). */
  p: number;
  /** Progress of the current cycle before easing, in the direction played (for effects that need linear time). */
  linear: number;
  /** Position on the clip 0..1 (before repeats and reverse): 0 before its start, 1 after its end. */
  raw: number;
  /** Seconds since the clip started (0..dur). */
  local: number;
  /** Project time. */
  t: number;
  /** Deterministic seed for this clip on this layer. */
  seed: string;
  project: Readonly<Project>;
}

export type TemplateGroup = 'entrada' | 'salida' | 'transformación' | 'énfasis' | 'bucle';

export interface TemplateDef {
  id: string;
  /** Spanish name and one line on what it does. */
  name: string;
  blurb: string;
  group: TemplateGroup;
  /** Kinds of layer it works on. */
  kinds: LayerKind[];
  /** Suggested duration in seconds for a new clip. */
  dur: number;
  params: ParamDef[];
  apply(ctx: ClipContext): ClipEffect | null;
}

const registry = new Map<string, TemplateDef>();

/** Adds (or replaces) a template. Catalogs call this once when they load. */
export function registerTemplate(def: TemplateDef): void {
  registry.set(def.id, def);
}

export function templateById(id: string): TemplateDef | undefined {
  return registry.get(id);
}

/** Every registered template (in registration order), optionally only those for a kind of layer. */
export function templates(kind?: LayerKind): TemplateDef[] {
  const all = [...registry.values()];
  return kind ? all.filter(d => d.kinds.includes(kind)) : all;
}

/** A template's params: defaults, overridden by the clip's own values of the same type. */
export function paramsOf(def: TemplateDef, clip: Pick<AnimClip, 'params'>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const p of def.params) {
    const v = clip.params[p.key];
    if (p.type === 'range') out[p.key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.def;
    else if (p.type === 'toggle') out[p.key] = typeof v === 'boolean' ? v : p.def;
    else if (p.type === 'select') out[p.key] = typeof v === 'string' && p.options.some(([k]) => k === v) ? v : p.def;
    else out[p.key] = typeof v === 'string' ? v : p.def;
  }
  // unknown params stay available (a newer catalog may read them)
  for (const [k, v] of Object.entries(clip.params)) if (!(k in out)) out[k] = v;
  return out;
}

/* ------------------------------------------------------------------ time */

export interface ClipTime {
  /** Eased progress 0..1 (see ClipContext.p). */
  p: number;
  linear: number;
  raw: number;
  local: number;
  /** The playhead is inside the clip. */
  active: boolean;
  /** 1 when this cycle plays forwards, -1 backwards (reverse, or the way back of a ping-pong). */
  dir: 1 | -1;
}

/**
 * Where a clip is at project time t. Outside its span it holds its first (before) or last (after) state.
 * With `repeat` n the clip runs n cycles inside its duration; with `pingpong` every other cycle runs back.
 */
export function clipTime(clip: Pick<AnimClip, 'start' | 'dur' | 'repeat' | 'pingpong' | 'reverse' | 'ease'>, t: number): ClipTime {
  const dur = Math.max(1e-6, clip.dur);
  const raw = Math.min(1, Math.max(0, (t - clip.start) / dur));
  const active = t >= clip.start && t <= clip.start + dur;
  const n = Math.max(1, Math.round(clip.repeat));
  // the reversed clip at τ is the forward clip at dur − τ
  const r = clip.reverse ? 1 - raw : raw;
  const x = r * n;
  let cycle = Math.floor(x), f = x - cycle;
  if (cycle >= n) { cycle = n - 1; f = 1; }
  let back = false;
  if (clip.pingpong && cycle % 2 === 1) { f = 1 - f; back = true; }
  const dir: 1 | -1 = (clip.reverse ? !back : back) ? -1 : 1;
  return { p: easeAt(clip.ease, f), linear: f, raw, local: raw * dur, active, dir };
}

/* ------------------------------------------------------------------ deterministic noise */

/** 32-bit hash of a string (FNV-1a with a final avalanche). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return mix32(h >>> 0);
}

function mix32(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A number in [0, 1) for (seed, a, b): the same inputs always give the same value. */
export function rand01(seed: number, a: number, b = 0): number {
  const inner = mix32((Math.imul(a | 0, 0x9e3779b1) ^ mix32((Math.imul(b | 0, 0x85ebca6b) + 0x632be5ab) >>> 0)) >>> 0);
  return mix32((seed + inner) >>> 0) / 4294967296;
}
