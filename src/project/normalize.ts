/**
 * Everything that enters the studio as a project goes through normalizeProject(): saved projects, opened
 * files, undo snapshots from an older version. It never throws and always returns a complete, valid Project:
 * every field present, numbers clamped to their range, unknown layer or mask kinds dropped, keyframes of
 * layers that no longer exist dropped. Parameters of finishes and animation clips are kept even when this
 * version does not know them (a newer catalog may), as long as they are plain values.
 *
 * Also here: the constructors of new projects (blank, from a photo, a video, a photo sequence, a lab piece)
 * and of new layers, with the defaults the studio starts from.
 */
import { PATTERN_IDS } from '../engine/catalog';
import { cloneRecipe, defaultRecipe, normHex, normMediaRef, normalizeRecipe, type MediaRef, type Recipe } from '../engine/recipe';
import {
  PROJECT_VERSION,
  type Adjust, type AnimClip, type AsciiLayer, type CompositeBlend, type CutoutRefine, type Ease, type Finish, type FinishKind, type GlyphStyle,
  type GlyphsLayer, type Id, type Key, type Layer, type LayerBase, type LayerFit, type LayerKind, type LayerTransform, type Mask, type MaskOp,
  type MaskPart, type PhotoLayer, type Project, type ProjectMeta, type ShapeKind, type ShapeLayer, type Source, type SourceKind, type TextLayer,
  type Track,
} from './types';

/* ------------------------------------------------------------------ limits */

/** Upper bounds that keep a crafted or damaged file from taking the page down. */
export const LIMITS = {
  sources: 64,
  sequence: 400,
  layers: 48,
  tracks: 512,
  keys: 1000,
  finishes: 12,
  clips: 24,
  parts: 64,
  /** Numbers in one polygon, stroke or polyline (x, y pairs). */
  pts: 40_000,
  canvasMin: 16,
  canvasMax: 8192,
  duration: 3600,
  text: 5000,
} as const;

export const LAYER_KINDS: LayerKind[] = ['photo', 'ascii', 'glyphs', 'text', 'shape'];
export const SOURCE_KINDS: SourceKind[] = ['image', 'video', 'sequence', 'cutout'];
export const COMPOSITE_BLENDS: CompositeBlend[] = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'add',
];
export const FINISH_KINDS: FinishKind[] = [
  'dither', 'halftone', 'grain', 'glow', 'shadow', 'motionblur', 'blur', 'sharpen',
  'invert', 'threshold', 'posterize', 'levels', 'mono', 'duotone', 'palette',
  'crosshatch', 'scanlines', 'chroma', 'vignette', 'pixelate', 'edges', 'noise',
];
export const SHAPE_KINDS: ShapeKind[] = ['rect', 'ellipse', 'line', 'polyline', 'bracket', 'crosshair', 'callout'];
const FITS: LayerFit[] = ['cover', 'contain', 'fill'];
const OPS: MaskOp[] = ['add', 'subtract', 'intersect'];
const EASES = ['linear', 'in', 'out', 'inOut', 'step', 'hold'] as const;
const ORIGINS = ['photo', 'video', 'sequence', 'lab', 'blank'] as const;
const RASTER_ORIGINS = ['paint', 'object', 'subject', 'background', 'track'] as const;
const PATH_KINDS = ['arc', 'circle', 'spiral'] as const;

/** Name of each kind of layer, for new layers and the layer list. */
export const LAYER_NAMES: Record<LayerKind, string> = { photo: 'Foto', ascii: 'ASCII', glyphs: 'Caracteres', text: 'Texto', shape: 'Forma' };

/* ------------------------------------------------------------------ ids */

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * A new id: 12 characters from a random source (crypto when there is one). Only for identities (projects,
 * layers, clips, versions): nothing that decides pixels uses it, so the render stays deterministic.
 */
export function uid(): string {
  const A = 'abcdefghijkmnopqrstuvwxyz23456789';
  const b = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (const x of b) s += A[x % A.length];
  return s;
}

/* ------------------------------------------------------------------ primitives */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
function num(v: unknown, fb: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fb;
  return Math.min(max, Math.max(min, n));
}
const int = (v: unknown, fb: number, min: number, max: number) => Math.round(num(v, fb, min, max));
const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);
const str = (v: unknown, fb: string, max = 200) => (typeof v === 'string' ? v.slice(0, max) : fb);
function oneOf<T extends string>(v: unknown, list: readonly T[], fb: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fb;
}
/** Plain JSON: no undefined keys, no −0 (a normalised project survives a save and a reload unchanged). */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const idOr = (v: unknown, fb: () => string) => (typeof v === 'string' && ID_RE.test(v) ? v : fb());
const color = (v: unknown, fb: string) => normHex(v, fb);
const colorOrNull = (v: unknown, fb: string | null) => (v === null ? null : typeof v === 'string' ? normHex(v, fb ?? '#000000') : fb);
/** Plain values only (what a param can hold): finite numbers, short strings, booleans. */
function params(v: unknown): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  let n = 0;
  for (const [k, x] of Object.entries(obj(v))) {
    if (n >= 64 || !/^[A-Za-z0-9_.-]{1,40}$/.test(k)) continue;
    if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
    else if (typeof x === 'string') out[k] = x.slice(0, 400);
    else if (typeof x === 'boolean') out[k] = x;
    else continue;
    n++;
  }
  return out;
}
/** Finite numbers, clamped, at most `max` of them (and an even count when `pairs`). */
function nums(v: unknown, min: number, max: number, count: number, pairs = true): number[] {
  const out: number[] = [];
  for (const x of arr(v)) {
    if (out.length >= count) break;
    const n = typeof x === 'number' ? x : NaN;
    out.push(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0);
  }
  if (pairs && out.length % 2) out.pop();
  return out;
}

/* ------------------------------------------------------------------ defaults */

export const defaultTransform = (): LayerTransform => ({ x: 0, y: 0, scale: 1, rot: 0 });

export const defaultAdjust = (): Adjust => ({
  bright: 0, contrast: 1, gamma: 1, sat: 1, hue: 0, temp: 0, blur: 0, sharpen: 0, invert: false, mono: false,
});

export const defaultGlyphStyle = (): GlyphStyle => ({
  charset: 'custom', chars: ' .:-=+*#%@', fill: 'ramp', font: 'jetbrains', weight: 500, cell: 12, aspect: 1.6,
  bright: 0, contrast: 1, gamma: 1, sat: 1, invert: false, edge: 0, cutoff: 0,
  color: 'source', ink: '#ede6da', paper: null, palette: ['#0c0b0a', '#ff5b1f', '#ede6da'],
});

export const defaultMask = (): Mask => ({ invert: false, feather: 0, opacity: 1, parts: [] });

export const defaultEase = (): Ease => ({ kind: 'linear' });

/** An ASCII style for a layer over a photo: the lab's default, reading the picture, characters only. */
export function defaultAsciiStyle(): Recipe {
  const r = defaultRecipe();
  r.source = 'image';
  r.interact = { ...r.interact, mode: 'none', auto: false };
  r.color = { ...r.color, mode: 'source' };
  r.glyph = { ...r.glyph, cell: 10 };
  return r;
}

/* ------------------------------------------------------------------ easing, keys, clips */

export function normEase(v: unknown): Ease {
  const o = obj(v);
  if (o.kind === 'bezier') {
    const p = arr(o.p);
    return { kind: 'bezier', p: [num(p[0], 0.25, 0, 1), num(p[1], 0.1, -5, 5), num(p[2], 0.25, 0, 1), num(p[3], 1, -5, 5)] };
  }
  return { kind: oneOf(o.kind, EASES, 'linear') };
}

function normKey(v: unknown): Key | null {
  const o = obj(v);
  const t = num(o.t, NaN, 0, LIMITS.duration);
  if (!Number.isFinite(t)) return null;
  const x = o.v;
  const val = typeof x === 'number' ? (Number.isFinite(x) ? x : null) : typeof x === 'string' ? x.slice(0, 400) : typeof x === 'boolean' ? x : null;
  if (val === null) return null;
  return { t, v: val, ease: normEase(o.ease) };
}

const PATH_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+){0,6}$/;

function normTrack(v: unknown, layers: Set<string>): Track | null {
  const o = obj(v);
  if (typeof o.layer !== 'string' || !layers.has(o.layer)) return null;
  if (typeof o.path !== 'string' || !PATH_RE.test(o.path) || o.path.split('.').some(k => k === '__proto__' || k === 'constructor' || k === 'prototype')) return null;
  const keys: Key[] = [];
  for (const k of arr(o.keys)) {
    if (keys.length >= LIMITS.keys) break;
    const n = normKey(k);
    if (n) keys.push(n);
  }
  if (!keys.length) return null;
  // stable sort by time: keys at the same time keep their order (the later one wins from then on)
  keys.sort((a, b) => a.t - b.t);
  return { layer: o.layer, path: o.path, keys };
}

export function normClip(v: unknown): AnimClip | null {
  const o = obj(v);
  if (typeof o.template !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(o.template)) return null;
  return {
    id: idOr(o.id, uid),
    template: o.template,
    start: num(o.start, 0, 0, LIMITS.duration),
    dur: num(o.dur, 1, 0.01, LIMITS.duration),
    params: params(o.params),
    reverse: bool(o.reverse, false),
    ease: normEase(o.ease),
    repeat: int(o.repeat, 1, 1, 100),
    pingpong: bool(o.pingpong, false),
  };
}

export function normFinish(v: unknown): Finish | null {
  const o = obj(v);
  if (!(FINISH_KINDS as string[]).includes(o.kind as string)) return null;
  return { kind: o.kind as FinishKind, on: bool(o.on, true), amount: num(o.amount, 1, 0, 1), params: params(o.params) };
}

/* ------------------------------------------------------------------ masks */

const soft = (v: unknown) => num(v, 0, 0, 1000);
const alpha = (v: unknown) => num(v, 1, 0, 1);

export function normMaskPart(v: unknown): MaskPart | null {
  const o = obj(v);
  const op = oneOf(o.op, OPS, 'add');
  switch (o.kind) {
    case 'rect': case 'ellipse':
      return {
        kind: o.kind, op,
        x: num(o.x, 0.25, -10, 10), y: num(o.y, 0.25, -10, 10), w: num(o.w, 0.5, 0, 20), h: num(o.h, 0.5, 0, 20),
        rot: num(o.rot, 0, -3600, 3600), soft: soft(o.soft), alpha: alpha(o.alpha),
      };
    case 'polygon': {
      const pts = nums(o.pts, -10, 10, LIMITS.pts);
      if (pts.length < 6) return null;
      return { kind: 'polygon', op, pts, soft: soft(o.soft), alpha: alpha(o.alpha) };
    }
    case 'stroke': {
      const pts = nums(o.pts, -10, 10, LIMITS.pts);
      if (pts.length < 2) return null;
      const part: MaskPart = { kind: 'stroke', op, pts, size: num(o.size, 0.05, 0.0005, 2), hardness: num(o.hardness, 0.8, 0, 1), alpha: alpha(o.alpha) };
      if (Array.isArray(o.pressure)) {
        const pr = nums(o.pressure, 0, 1, pts.length / 2, false);
        if (pr.length === pts.length / 2) part.pressure = pr;
      }
      return part;
    }
    case 'raster': {
      const media = normMediaRef(o.media);
      if (!media) return null;
      const part: MaskPart = { kind: 'raster', op, media, soft: soft(o.soft), alpha: alpha(o.alpha) };
      if (Array.isArray(o.frames)) {
        const frames: Array<{ t: number; media: MediaRef }> = [];
        for (const f of o.frames) {
          if (frames.length >= 20_000) break;
          const fo = obj(f), m = normMediaRef(fo.media), t = num(fo.t, NaN, 0, LIMITS.duration);
          if (m && Number.isFinite(t)) frames.push({ t, media: m });
        }
        frames.sort((a, b) => a.t - b.t);
        if (frames.length) part.frames = frames;
      }
      if (typeof o.interp === 'boolean') part.interp = o.interp;
      if (typeof o.origin === 'string' && (RASTER_ORIGINS as readonly string[]).includes(o.origin)) part.origin = o.origin as typeof RASTER_ORIGINS[number];
      if (Array.isArray(o.points)) {
        const points: Array<{ x: number; y: number; positive: boolean }> = [];
        for (const p of o.points) {
          if (points.length >= 256) break;
          const po = obj(p);
          points.push({ x: num(po.x, 0.5, -10, 10), y: num(po.y, 0.5, -10, 10), positive: bool(po.positive, true) });
        }
        part.points = points;
      }
      return part;
    }
    case 'color': {
      if (typeof o.source !== 'string' || !ID_RE.test(o.source)) return null;
      return { kind: 'color', op, source: o.source, color: color(o.color, '#ffffff'), tol: num(o.tol, 0.15, 0, 1), soft: num(o.soft, 0.1, 0, 1), alpha: alpha(o.alpha) };
    }
    default:
      return null;
  }
}

export function normMask(v: unknown): Mask | null {
  if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = obj(v);
  const parts: MaskPart[] = [];
  for (const p of arr(o.parts)) {
    if (parts.length >= LIMITS.parts) break;
    const n = normMaskPart(p);
    if (n) parts.push(n);
  }
  return { invert: bool(o.invert, false), feather: num(o.feather, 0, 0, 1000), opacity: num(o.opacity, 1, 0, 1), parts };
}

/* ------------------------------------------------------------------ sources */

function normRefine(v: unknown): CutoutRefine {
  const o = obj(v);
  return { feather: num(o.feather, 0, 0, 200), shift: num(o.shift, 0, -100, 100), decontaminate: num(o.decontaminate, 0.5, 0, 1), detail: num(o.detail, 0.5, 0, 1) };
}

export function normSource(v: unknown): Source | null {
  const o = obj(v);
  const kind = oneOf(o.kind, SOURCE_KINDS, 'image');
  if (o.kind !== kind) return null;
  const media: MediaRef[] = [];
  const max = kind === 'sequence' ? LIMITS.sequence : 1;
  for (const m of arr(o.media)) {
    if (media.length >= max) break;
    const r = normMediaRef(m);
    if (r) media.push(r);
  }
  if (!media.length) return null;
  const first = media[0];
  const s: Source = {
    id: idOr(o.id, uid),
    kind,
    name: str(o.name, first.name ?? '', 200),
    media,
    w: int(o.w, first.w, 0, 100_000),
    h: int(o.h, first.h, 0, 100_000),
  };
  if (kind === 'video') {
    s.duration = num(o.duration, 0, 0, 24 * 3600);
    s.fps = num(o.fps, 30, 1, 240);
    s.hasAudio = bool(o.hasAudio, false);
  } else {
    if (o.duration !== undefined) s.duration = num(o.duration, 0, 0, 24 * 3600);
    if (o.fps !== undefined) s.fps = num(o.fps, 30, 1, 240);
    if (typeof o.hasAudio === 'boolean') s.hasAudio = o.hasAudio;
  }
  if (kind === 'sequence') s.hold = num(o.hold, 1, 0.02, 600);
  else if (o.hold !== undefined) s.hold = num(o.hold, 1, 0.02, 600);
  if (kind === 'cutout') {
    const c = obj(o.cutout), matte = normMediaRef(c.matte);
    if (typeof c.from === 'string' && ID_RE.test(c.from) && matte) {
      s.cutout = { from: c.from, matte, ...(c.refine !== undefined ? { refine: normRefine(c.refine) } : {}) };
    }
  }
  return s;
}

/* ------------------------------------------------------------------ layers */

export function normAdjust(v: unknown): Adjust {
  const o = obj(v), d = defaultAdjust();
  return {
    bright: num(o.bright, d.bright, -1, 1), contrast: num(o.contrast, d.contrast, 0, 3), gamma: num(o.gamma, d.gamma, 0.2, 3),
    sat: num(o.sat, d.sat, 0, 3), hue: num(o.hue, d.hue, -360, 360), temp: num(o.temp, d.temp, -1, 1), blur: num(o.blur, d.blur, 0, 500),
    sharpen: num(o.sharpen, d.sharpen, 0, 1), invert: bool(o.invert, d.invert), mono: bool(o.mono, d.mono),
  };
}

export function normGlyphStyle(v: unknown): GlyphStyle {
  const o = obj(v), d = defaultGlyphStyle();
  const palette = arr(o.palette).filter((c): c is string => typeof c === 'string').slice(0, 16).map(c => color(c, '#000000'));
  return {
    charset: typeof o.charset === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(o.charset) ? o.charset : d.charset,
    chars: str(o.chars, d.chars, 2000),
    fill: oneOf(o.fill, ['ramp', 'words'] as const, d.fill),
    font: str(o.font, d.font, 80) || d.font,
    weight: int(o.weight, d.weight, 100, 900),
    cell: num(o.cell, d.cell, 2, 400),
    aspect: num(o.aspect, d.aspect, 0.25, 4),
    bright: num(o.bright, d.bright, -1, 1),
    contrast: num(o.contrast, d.contrast, 0, 4),
    gamma: num(o.gamma, d.gamma, 0.2, 4),
    sat: num(o.sat, d.sat, 0, 3),
    invert: bool(o.invert, d.invert),
    edge: num(o.edge, d.edge, 0, 1),
    cutoff: num(o.cutoff, d.cutoff, 0, 1),
    color: oneOf(o.color, ['mono', 'source', 'palette'] as const, d.color),
    ink: color(o.ink, d.ink),
    paper: colorOrNull(o.paper, d.paper),
    palette: palette.length ? palette : d.palette,
  };
}

function normTransform(v: unknown): LayerTransform {
  const o = obj(v);
  return { x: num(o.x, 0, -10, 10), y: num(o.y, 0, -10, 10), scale: num(o.scale, 1, 0.01, 50), rot: num(o.rot, 0, -3600, 3600) };
}

function normSpan(v: unknown): { in: number; out: number } | null {
  if (!v || typeof v !== 'object') return null;
  const o = obj(v);
  const a = num(o.in, NaN, 0, LIMITS.duration), b = num(o.out, NaN, 0, LIMITS.duration);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return { in: a, out: b };
}

const sourceId = (v: unknown) => (typeof v === 'string' && ID_RE.test(v) ? v : '');

function normBase(o: Obj, kind: LayerKind, id: string): LayerBase {
  const finishes: Finish[] = [];
  for (const f of arr(o.finishes)) { if (finishes.length >= LIMITS.finishes) break; const n = normFinish(f); if (n) finishes.push(n); }
  const clips: AnimClip[] = [];
  const clipIds = new Set<string>();
  for (const c of arr(o.clips)) {
    if (clips.length >= LIMITS.clips) break;
    const n = normClip(c);
    if (!n) continue;
    if (clipIds.has(n.id)) n.id = uid();
    clipIds.add(n.id);
    clips.push(n);
  }
  const base: LayerBase = {
    id, name: str(o.name, LAYER_NAMES[kind], 120) || LAYER_NAMES[kind], kind,
    visible: bool(o.visible, true), locked: bool(o.locked, false), opacity: num(o.opacity, 1, 0, 1),
    blend: oneOf(o.blend, COMPOSITE_BLENDS, 'normal'), mask: normMask(o.mask), span: normSpan(o.span),
    xf: normTransform(o.xf), finishes, clips,
  };
  if (o.depth !== undefined) base.depth = num(o.depth, 0, -100, 100);
  return base;
}

function normPath(v: unknown): TextLayer['path'] | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = obj(v);
  const kind = oneOf(o.kind, PATH_KINDS, 'arc');
  if (o.kind !== kind) return undefined;
  const p: NonNullable<TextLayer['path']> = { kind, cx: num(o.cx, 0.5, -10, 10), cy: num(o.cy, 0.5, -10, 10), r: num(o.r, 0.3, 0.001, 10), start: num(o.start, 0, -3600, 3600) };
  if (kind === 'spiral' || o.turns !== undefined) p.turns = num(o.turns, 3, 0.1, 50);
  return p;
}

/** Points a shape needs: 4 for the box shapes, pairs (at least two points) for the lines. */
function shapePts(shape: ShapeKind, v: unknown): number[] {
  const box = shape === 'rect' || shape === 'ellipse' || shape === 'bracket' || shape === 'crosshair';
  const pts = nums(v, -10, 10, box ? 4 : LIMITS.pts);
  if (box) return pts.length === 4 ? pts : [0.25, 0.25, 0.5, 0.5];
  return pts.length >= 4 ? pts : [0.2, 0.5, 0.8, 0.5];
}

export function normLayer(v: unknown, id?: string): Layer | null {
  const o = obj(v);
  if (!(LAYER_KINDS as string[]).includes(o.kind as string)) return null;
  const kind = o.kind as LayerKind;
  const base = normBase(o, kind, id ?? idOr(o.id, uid));
  switch (kind) {
    case 'photo':
      return { ...base, kind, source: sourceId(o.source), fit: oneOf(o.fit, FITS, 'cover'), adjust: normAdjust(o.adjust) } satisfies PhotoLayer;
    case 'ascii': {
      const src = o.source === 'below' || o.source === 'style' ? o.source : sourceId(o.source) || 'below';
      const style = plain(normalizeRecipe(o.style ?? defaultAsciiStyle(), PATTERN_IDS));
      const l: AsciiLayer = { ...base, kind, source: src, style };
      if (o.fit !== undefined) l.fit = oneOf(o.fit, FITS, 'cover');
      if (typeof o.opaque === 'boolean') l.opaque = o.opaque;
      return l;
    }
    case 'glyphs': {
      const src = o.source === 'below' ? 'below' : sourceId(o.source) || 'below';
      const l: GlyphsLayer = { ...base, kind, source: src, glyphs: normGlyphStyle(o.glyphs) };
      if (o.fit !== undefined) l.fit = oneOf(o.fit, FITS, 'cover');
      return l;
    }
    case 'text': {
      const b = obj(o.box);
      const l: TextLayer = {
        ...base, kind, text: str(o.text, 'GLYPHOS', LIMITS.text), font: str(o.font, 'martian', 80) || 'martian', weight: int(o.weight, 700, 100, 900),
        size: num(o.size, 0.08, 0.002, 3), color: color(o.color, '#ede6da'), align: oneOf(o.align, ['left', 'center', 'right'] as const, 'left'),
        box: { x: num(b.x, 0.08, -10, 10), y: num(b.y, 0.08, -10, 10), w: num(b.w, 0.84, 0.005, 20) },
        tracking: num(o.tracking, 0, -0.5, 3), leading: num(o.leading, 1.1, 0.4, 4), italic: bool(o.italic, false), upper: bool(o.upper, false),
      };
      const path = normPath(o.path);
      if (path) l.path = path;
      return l;
    }
    case 'shape': {
      const shape = oneOf(o.shape, SHAPE_KINDS, 'rect');
      const dash = Array.isArray(o.dash) ? nums(o.dash, 0, 1000, 16, false).filter(x => x >= 0) : null;
      const l: ShapeLayer = {
        ...base, kind, shape, pts: shapePts(shape, o.pts),
        stroke: o.stroke === undefined ? '#ede6da' : colorOrNull(o.stroke, '#ede6da'),
        width: num(o.width, 2, 0, 500),
        fill: o.fill === undefined ? null : colorOrNull(o.fill, null),
        dash: dash && dash.length && dash.some(x => x > 0) ? dash : null,
      };
      if (o.label && typeof o.label === 'object') {
        const lb = obj(o.label);
        l.label = { text: str(lb.text, '', 400), font: str(lb.font, 'jetbrains', 80) || 'jetbrains', size: num(lb.size, 0.022, 0.002, 1), color: color(lb.color, '#ede6da') };
      }
      return l;
    }
  }
}

/* ------------------------------------------------------------------ project */

function normMeta(v: unknown): ProjectMeta {
  const o = obj(v), m: ProjectMeta = {};
  if (typeof o.origin === 'string' && (ORIGINS as readonly string[]).includes(o.origin)) m.origin = o.origin as ProjectMeta['origin'];
  if (typeof o.labEntry === 'string' && ID_RE.test(o.labEntry)) m.labEntry = o.labEntry;
  if (typeof o.openedFrom === 'string' && ID_RE.test(o.openedFrom)) m.openedFrom = o.openedFrom;
  if (typeof o.note === 'string' && o.note) m.note = o.note.slice(0, 4000);
  return m;
}

/** A project always has an output frame: from the input, or from its first source, or 1920×1080. */
function normCanvas(v: unknown, sources: Source[]): Project['canvas'] {
  const o = obj(v);
  const s = sources.find(x => x.w > 0 && x.h > 0);
  let dw = 1920, dh = 1080;
  if (s) {
    const k = Math.min(1, 4096 / Math.max(s.w, s.h));
    dw = Math.round(s.w * k); dh = Math.round(s.h * k);
  }
  return {
    w: int(o.w, dw, LIMITS.canvasMin, LIMITS.canvasMax),
    h: int(o.h, dh, LIMITS.canvasMin, LIMITS.canvasMax),
    bg: color(o.bg, '#0c0b0a'),
    transparent: bool(o.transparent, false),
  };
}

/**
 * Any input → a complete, valid project (see the top of this file). Garbage gives a blank project, so the
 * caller decides from isProjectLike() whether the input was a project at all.
 */
export function normalizeProject(input: unknown): Project {
  try {
    return normalizeUnsafe(input);
  } catch {
    // a getter that throws, a cyclic structure… never take the studio down: start blank
    return newProject();
  }
}

function normalizeUnsafe(input: unknown): Project {
  const o = obj(input);
  const now = Date.now();
  const sources: Source[] = [];
  const srcIds = new Set<string>();
  for (const s of arr(o.sources)) {
    if (sources.length >= LIMITS.sources) break;
    const n = normSource(s);
    if (!n) continue;
    if (srcIds.has(n.id)) n.id = uid();
    srcIds.add(n.id);
    sources.push(n);
  }
  const layers: Layer[] = [];
  const layerIds = new Set<string>();
  for (const l of arr(o.layers)) {
    if (layers.length >= LIMITS.layers) break;
    const n = normLayer(l);
    if (!n) continue;
    // a second layer with the same id gets its own (its keyframes stay with the first one)
    if (layerIds.has(n.id)) n.id = uid();
    layerIds.add(n.id);
    layers.push(n);
  }
  const tracks: Track[] = [];
  const seen = new Set<string>();
  for (const t of arr(o.tracks)) {
    if (tracks.length >= LIMITS.tracks) break;
    const n = normTrack(t, layerIds);
    if (!n || seen.has(n.layer + '|' + n.path)) continue;
    seen.add(n.layer + '|' + n.path);
    tracks.push(n);
  }
  const tm = obj(o.time);
  const created = num(o.created, now, 0, 8.64e15);
  return plain<Project>({
    kind: 'glyphos-project',
    v: PROJECT_VERSION,
    id: idOr(o.id, uid),
    name: str(o.name, 'Proyecto sin título', 200).trim() || 'Proyecto sin título',
    created,
    updated: num(o.updated, created, 0, 8.64e15),
    canvas: normCanvas(o.canvas, sources),
    time: { duration: num(tm.duration, 0, 0, LIMITS.duration), fps: num(tm.fps, 30, 1, 120), loop: bool(tm.loop, true) },
    seed: typeof o.seed === 'string' && o.seed.trim() ? o.seed.trim().slice(0, 64) : uid(),
    sources,
    layers,
    tracks,
    meta: normMeta(o.meta),
  });
}

/** Whether a parsed JSON looks like a studio project (as opposed to a lab recipe, a session or anything else). */
export function isProjectLike(v: unknown): boolean {
  const o = obj(v);
  return o.kind === 'glyphos-project' && Array.isArray(o.layers);
}

/** A deep copy (projects are plain JSON). */
export function cloneProject(p: Project): Project {
  return typeof structuredClone === 'function' ? structuredClone(p) : JSON.parse(JSON.stringify(p));
}

/* ------------------------------------------------------------------ constructors */

export interface NewProjectOptions { name?: string; w?: number; h?: number; bg?: string; transparent?: boolean; duration?: number; fps?: number; seed?: string }

/** An empty project (a poster from scratch). */
export function newProject(o: NewProjectOptions = {}): Project {
  const now = Date.now();
  return {
    kind: 'glyphos-project', v: PROJECT_VERSION, id: uid(), name: o.name ?? 'Proyecto sin título', created: now, updated: now,
    canvas: {
      w: int(o.w, 1920, LIMITS.canvasMin, LIMITS.canvasMax), h: int(o.h, 1080, LIMITS.canvasMin, LIMITS.canvasMax),
      bg: color(o.bg, '#0c0b0a'), transparent: !!o.transparent,
    },
    time: { duration: num(o.duration, 0, 0, LIMITS.duration), fps: num(o.fps, 30, 1, 120), loop: true },
    seed: o.seed ?? uid(),
    sources: [], layers: [], tracks: [], meta: { origin: 'blank' },
  };
}

/** Output size for a picture: its own size, the longer side at most `max` px. */
export function frameFor(w: number, h: number, max = 4096): { w: number; h: number } {
  if (!(w > 0 && h > 0)) return { w: 1920, h: 1080 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(LIMITS.canvasMin, Math.round(w * k)), h: Math.max(LIMITS.canvasMin, Math.round(h * k)) };
}

/** A source for one stored file (image or video). */
export function sourceFromMedia(ref: MediaRef, o: { name?: string; duration?: number; fps?: number; hasAudio?: boolean } = {}): Source {
  const s: Source = { id: uid(), kind: ref.kind, name: o.name ?? ref.name ?? (ref.kind === 'video' ? 'Video' : 'Foto'), media: [ref], w: ref.w, h: ref.h };
  if (ref.kind === 'video') { s.duration = o.duration ?? 0; s.fps = o.fps ?? 30; s.hasAudio = o.hasAudio ?? false; }
  return s;
}

type LayerInit<K extends LayerKind> = Partial<Omit<Extract<Layer, { kind: K }>, 'kind'>>;

/** A new layer of a kind with the studio's defaults (and the given fields). */
export function newLayer<K extends LayerKind>(kind: K, init: LayerInit<K> = {}): Extract<Layer, { kind: K }> {
  const base: LayerBase = {
    id: uid(), name: LAYER_NAMES[kind], kind, visible: true, locked: false, opacity: 1, blend: 'normal',
    mask: null, span: null, xf: defaultTransform(), finishes: [], clips: [],
  };
  let l: Layer;
  switch (kind) {
    case 'photo': l = { ...base, kind: 'photo', source: '', fit: 'cover', adjust: defaultAdjust() }; break;
    case 'ascii': l = { ...base, kind: 'ascii', source: 'below', style: defaultAsciiStyle() }; break;
    case 'glyphs': l = { ...base, kind: 'glyphs', source: 'below', glyphs: defaultGlyphStyle() }; break;
    case 'text': l = {
      ...base, kind: 'text', text: 'GLYPHOS', font: 'martian', weight: 700, size: 0.08, color: '#ede6da', align: 'left',
      box: { x: 0.08, y: 0.08, w: 0.84 }, tracking: 0, leading: 1.1, italic: false, upper: false,
    }; break;
    default: l = { ...base, kind: 'shape', shape: 'rect', pts: [0.25, 0.25, 0.5, 0.5], stroke: '#ede6da', width: 2, fill: null, dash: null }; break;
  }
  return { ...l, ...init, kind } as Extract<Layer, { kind: K }>;
}

/** A project that starts with one photo: the photo layer, at the photo's size. */
export function projectFromImage(ref: MediaRef, o: NewProjectOptions = {}): Project {
  const src = sourceFromMedia(ref);
  const f = frameFor(ref.w, ref.h);
  const p = newProject({ w: f.w, h: f.h, ...o, name: o.name ?? baseName(ref.name) ?? 'Foto' });
  p.sources.push(src);
  p.layers.push(newLayer('photo', { source: src.id, name: 'Foto original' }));
  p.meta = { origin: 'photo' };
  return p;
}

/** A project that starts with one video: its length, its frame rate, the video layer. */
export function projectFromVideo(ref: MediaRef, v: { duration: number; fps?: number; hasAudio?: boolean }, o: NewProjectOptions = {}): Project {
  const src = sourceFromMedia(ref, { duration: v.duration, fps: v.fps, hasAudio: v.hasAudio });
  const f = frameFor(ref.w, ref.h);
  const p = newProject({ w: f.w, h: f.h, duration: Math.min(LIMITS.duration, v.duration), fps: Math.min(60, v.fps ?? 30), ...o, name: o.name ?? baseName(ref.name) ?? 'Video' });
  p.sources.push(src);
  p.layers.push(newLayer('photo', { source: src.id, name: 'Video original' }));
  p.meta = { origin: 'video' };
  return p;
}

/** A project from several photos shown one after another, `hold` seconds each (an animation from stills). */
export function projectFromSequence(refs: MediaRef[], hold = 1, o: NewProjectOptions = {}): Project {
  const list = refs.slice(0, LIMITS.sequence);
  const first = list[0];
  const f = frameFor(first?.w ?? 0, first?.h ?? 0);
  const p = newProject({ w: f.w, h: f.h, duration: Math.max(0.1, list.length * hold), fps: 30, ...o, name: o.name ?? 'Secuencia' });
  if (!first) return p;
  const src: Source = { id: uid(), kind: 'sequence', name: o.name ?? 'Secuencia', media: list, w: first.w, h: first.h, hold };
  p.sources.push(src);
  p.layers.push(newLayer('photo', { source: src.id, name: 'Secuencia' }));
  p.meta = { origin: 'sequence' };
  return p;
}

/**
 * «Llevar al estudio de foto»: a lab piece as a project. With a picture: the photo layer and, over it, one
 * ASCII layer with the piece's recipe fed by that photo, drawn opaque (exactly as the lab showed it; mask it
 * to let the photo through). Without one: the recipe's own pattern or text as an ASCII layer.
 */
export function projectFromRecipe(
  recipe: Recipe, media: MediaRef | null = null,
  o: NewProjectOptions & { labEntry?: Id; video?: { duration: number; fps?: number; hasAudio?: boolean } } = {},
): Project {
  const style = plain(cloneRecipe(normalizeRecipe(recipe, PATTERN_IDS)));
  const name = o.name ?? style.meta.name ?? 'Pieza del laboratorio';
  const ref = media ?? (style.source === 'image' || style.source === 'video' ? style.media.ref ?? null : null);
  const usable = !!ref?.id;
  let p: Project;
  if (usable && ref) {
    p = ref.kind === 'video' ? projectFromVideo(ref, o.video ?? { duration: 10 }, { ...o, name }) : projectFromImage(ref, { ...o, name });
  } else {
    p = newProject({ ...o, name });
  }
  delete style.media.ref;
  const src = usable ? p.sources[0].id : 'style';
  if (!usable && (style.source === 'image' || style.source === 'video' || style.source === 'camera')) style.source = 'pattern';
  p.layers.push(newLayer('ascii', { name: style.meta.name ?? 'ASCII', source: src, style, opaque: true }));
  p.meta = { origin: 'lab', ...(o.labEntry ? { labEntry: o.labEntry } : {}) };
  return p;
}

function baseName(n?: string): string | undefined {
  if (!n) return undefined;
  const b = n.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
  return b ? b.slice(0, 120) : undefined;
}
