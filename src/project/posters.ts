/**
 * Posters and compositions for print and social: layouts that are built OVER the person's photo (or video)
 * as ordinary layers — photo, real characters, shader ASCII, text and shapes, each with its own mask and
 * finishes — so everything stays editable afterwards (nothing is flattened).
 *
 *   POSTER_SIZES   print (A4, A3, Carta, Tabloide at 300 ppp, optional 3 mm bleed) and social formats
 *                  (4:5, 9:16, 1:1, 16:9), with the safe area the layouts keep their text inside;
 *   POSTERS        the layouts (annotated poster, round patches, magazine page, title and figure, triptych,
 *                  contact sheet, spiral text, Swiss grid, zine cover, vertical story), each drawn for any
 *                  aspect: panels, type sizes and grids are computed from the frame, and titles are fitted
 *                  to their box (never larger than the room they have);
 *   posterProject / applyPoster   a new project from a photo, or the open project's composition replaced
 *                  by a poster (its sources, cut-outs and subject masks are reused);
 *   posterFields / setPosterField  the person's texts (title, subtitle, labels…) stay findable after the
 *                  poster is applied: a text changed later is fitted to the same room again;
 *   posterGuides   trim, bleed and safe area of a canvas that has a known size (drawn by the studio over
 *                  the viewport, never exported).
 *
 * Pure: no DOM. Type is measured with an estimate of each font's advance (a little wide, so a title that
 * fits the estimate fits the page) or with a measuring function the studio passes (canvas measureText).
 */
import type { MediaRef, Recipe } from '../engine/recipe';
import { PRESETS } from '../studio/presets';
import { cloneProject, newLayer, newProject, normalizeProject, sourceFromMedia, uid } from './normalize';
import type {
  AsciiLayer, Finish, GlyphStyle, GlyphsLayer, Id, Layer, LayerTransform, Mask, MaskPart, PhotoLayer, Project, ShapeLayer, Source, TextLayer,
} from './types';

/* ------------------------------------------------------------------ sizes */

export type PosterGroup = 'impresion' | 'social';

export interface PosterSize {
  id: string;
  name: string;
  group: PosterGroup;
  /** Pixels (portrait for print sizes). */
  w: number;
  h: number;
  /** Print sizes: millimetres of the trimmed page. */
  mm?: [number, number];
  blurb: string;
}

export const DPI = 300;
export const BLEED_MM = 3;
export const SAFE_MM = 5;
export const mmToPx = (mm: number) => Math.round((mm / 25.4) * DPI);

const print = (id: string, name: string, mm: [number, number], blurb: string): PosterSize =>
  ({ id, name, group: 'impresion', w: mmToPx(mm[0]), h: mmToPx(mm[1]), mm, blurb });

export const POSTER_SIZES: PosterSize[] = [
  print('a4', 'A4', [210, 297], '210 × 297 mm'),
  print('a3', 'A3', [297, 420], '297 × 420 mm'),
  print('carta', 'Carta', [215.9, 279.4], '8,5 × 11 in'),
  print('tabloide', 'Tabloide', [279.4, 431.8], '11 × 17 in'),
  { id: 'vertical', name: 'Vertical 4:5', group: 'social', w: 1080, h: 1350, blurb: 'Publicación vertical' },
  { id: 'historia', name: 'Historia 9:16', group: 'social', w: 1080, h: 1920, blurb: 'Historias y reels' },
  { id: 'cuadrado', name: 'Cuadrado 1:1', group: 'social', w: 1080, h: 1080, blurb: 'Publicación cuadrada' },
  { id: 'horizontal', name: 'Horizontal 16:9', group: 'social', w: 1920, h: 1080, blurb: 'Pantallas, video, portadas' },
];

export const posterSize = (id: string) => POSTER_SIZES.find(s => s.id === id) ?? POSTER_SIZES[4];

export interface PosterFormat {
  size: string;
  /** Print sizes only: portrait (default) or landscape. */
  orient?: 'vertical' | 'horizontal';
  /** Print sizes only: 3 mm of bleed around the trimmed page (the canvas grows by it). */
  bleed?: boolean;
}

/** Frame-unit rectangle (0..1 of the canvas, origin top-left). */
export interface Rect { x: number; y: number; w: number; h: number }

export interface PosterFrame {
  size: PosterSize;
  orient: 'vertical' | 'horizontal';
  /** Canvas pixels (the trimmed page plus bleed). */
  w: number;
  h: number;
  /** Bleed in px (0 without). */
  bleed: number;
  /** The trimmed page and the area type must stay in (frame units). */
  trim: Rect;
  safe: Rect;
  /** Story formats: the bands the apps cover with their own interface (frame units). */
  zones: Rect[];
}

const inset = (r: Rect, l: number, t: number, rt = l, b = t): Rect => ({ x: r.x + l, y: r.y + t, w: r.w - l - rt, h: r.h - t - b });

export function posterFrame(f: PosterFormat): PosterFrame {
  const size = posterSize(f.size);
  const orient = size.group === 'impresion' && f.orient === 'horizontal' ? 'horizontal' : 'vertical';
  let tw = size.w, th = size.h;
  if (orient === 'horizontal') [tw, th] = [th, tw];
  const bleed = size.group === 'impresion' && f.bleed ? mmToPx(BLEED_MM) : 0;
  const w = tw + bleed * 2, h = th + bleed * 2;
  const trim: Rect = { x: bleed / w, y: bleed / h, w: tw / w, h: th / h };
  let safe: Rect;
  const zones: Rect[] = [];
  if (size.group === 'impresion') {
    const s = mmToPx(SAFE_MM);
    safe = inset(trim, s / w, s / h);
  } else if (size.id === 'historia') {
    // the apps draw their bars over the top ~13 % and the bottom ~18 % of a story
    zones.push({ x: 0, y: 0, w: 1, h: 0.13 }, { x: 0, y: 0.82, w: 1, h: 0.18 });
    safe = inset(trim, 0.06, 0.13, 0.06, 0.18);
  } else safe = inset(trim, 0.035 * Math.min(w, h) / w, 0.035 * Math.min(w, h) / h);
  return { size, orient, w, h, bleed, trim, safe, zones };
}

/** A canvas of a known size (either orientation, with or without bleed): its guides. */
export function posterGuides(canvas: { w: number; h: number }): (PosterFrame & { label: string }) | null {
  for (const size of POSTER_SIZES) {
    for (const orient of ['vertical', 'horizontal'] as const) {
      if (orient === 'horizontal' && size.group !== 'impresion') continue;
      for (const bleed of [false, true]) {
        if (bleed && size.group !== 'impresion') continue;
        const fr = posterFrame({ size: size.id, orient, bleed });
        if (fr.w === canvas.w && fr.h === canvas.h) {
          const label = size.group === 'impresion'
            ? `${size.name} ${orient === 'horizontal' ? 'horizontal' : 'vertical'} a ${DPI} ppp${bleed ? ` · sangrado de ${BLEED_MM} mm` : ''}`
            : size.name;
          return { ...fr, label };
        }
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ fields */

export interface PosterFields {
  kicker: string;
  title: string;
  subtitle: string;
  caption: string;
  labels: string[];
}

export type FieldKey = 'kicker' | 'title' | 'subtitle' | 'caption' | `label${number}`;

export const FIELD_NAMES: Record<string, string> = {
  kicker: 'Antetítulo', title: 'Título', subtitle: 'Subtítulo', caption: 'Pie o texto',
};
export function fieldName(k: string): string {
  if (FIELD_NAMES[k]) return FIELD_NAMES[k];
  const m = /^([a-z]+)([0-9]+)$/.exec(k);
  if (m && m[1] === 'label') return `Etiqueta ${Number(m[2]) + 1}`;
  if (m && FIELD_NAMES[m[1]]) return `${FIELD_NAMES[m[1]]}, línea ${Number(m[2]) + 1}`;
  return k;
}

/* ------------------------------------------------------------------ type measuring */

/** Width in px of `text` set in a font at `px` (without tracking). */
export type Measure = (text: string, font: string, weight: number, italic: boolean, px: number) => number;

export const INTER = 'Inter Tight Variable';

/** Average advance of a lowercase letter, in em, per font (a little generous). */
function fontEm(font: string, weight: number, italic: boolean): { em: number; mono: boolean } {
  switch (font) {
    case 'martian': return { em: 0.71, mono: true };
    case 'jetbrains': case 'plex': case 'space': case 'fira': case 'courier': case 'system': return { em: 0.61, mono: true };
    case 'vt': return { em: 0.52, mono: true };
    case 'pixel': return { em: 1.01, mono: true };
    case 'silk': return { em: 0.72, mono: false };
    case 'serif': return { em: italic ? 0.4 : 0.44, mono: false };
    case 'sans': return { em: weight >= 800 ? 0.62 : 0.55, mono: false };
    case INTER: return { em: weight >= 700 ? 0.53 : 0.49, mono: false };
    default: return { em: 0.6, mono: false };
  }
}

/** Relative width of a character in a proportional font (lowercase ≈ 1). */
function charK(ch: string): number {
  if (ch === ' ') return 0.56;
  if ('iljtf.,:;\'!|()[]'.includes(ch)) return 0.55;
  if ('mwMW@'.includes(ch)) return 1.65;
  if (/[0-9]/.test(ch)) return 1.12;
  if (ch !== ch.toLowerCase()) return 1.34;
  return 1;
}

/** The estimate used when no measuring function is given (pure, deterministic, errs on the wide side). */
export const estimateWidth: Measure = (text, font, weight, italic, px) => {
  const { em, mono } = fontEm(font, weight, italic);
  let w = 0;
  for (const ch of text) w += mono ? em : em * charK(ch);
  return w * px * 1.04;
};

export interface TypeStyle { font: string; weight: number; italic?: boolean; upper?: boolean; tracking?: number; leading?: number }

const shown = (text: string, st: TypeStyle) => (st.upper ? text.toLocaleUpperCase('es') : text);

/** Lines of `text` wrapped at `maxPx` (the studio's wrap: by words, words longer than a line cut). */
export function wrapLines(text: string, st: TypeStyle, px: number, maxPx: number, measure: Measure = estimateWidth): string[] {
  const t = shown(text, st);
  const track = (st.tracking ?? 0) * px;
  const width = (s: string) => measure(s, st.font, st.weight, !!st.italic, px) + Array.from(s).length * track;
  const out: string[] = [];
  for (const para of t.split('\n')) {
    const words = para.split(/(\s+)/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const next = line + w;
      if (!line || width(next.trimEnd()) <= maxPx) { line = next; continue; }
      out.push(line.trimEnd());
      if (/^\s+$/.test(w)) { line = ''; continue; }
      line = w;
      while (width(line) > maxPx && line.length > 1) {
        let k = line.length - 1;
        while (k > 1 && width(line.slice(0, k)) > maxPx) k--;
        out.push(line.slice(0, k));
        line = line.slice(k);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Height in px of `n` lines set at `px` with a leading (ascent of the first line to descent of the last). */
export const blockHeight = (px: number, n: number, leading: number) => px * (0.92 + Math.max(0, n - 1) * leading + 0.26);

/**
 * The largest size (≤ maxPx) at which `text` fits in `boxPx` wide on at most `lines` lines with no word cut
 * (a single word wider than the box shrinks the size too). At least `minPx`.
 */
export function fitSize(text: string, st: TypeStyle, boxPx: number, maxPx: number, lines: number, minPx = 1, measure: Measure = estimateWidth): number {
  const t = shown(text, st);
  if (!t.trim()) return maxPx;
  const track = (st.tracking ?? 0);
  const longest = Math.max(...t.split(/\s+/).map(w => measure(w, st.font, st.weight, !!st.italic, 100) / 100 + Array.from(w).length * track));
  let px = Math.min(maxPx, longest > 0 ? boxPx / longest : maxPx);
  for (let i = 0; i < 60 && px > minPx; i++) {
    if (wrapLines(text, st, px, boxPx, measure).length <= lines) break;
    px *= 0.95;
  }
  return Math.max(minPx, Math.min(maxPx, px));
}

/* ------------------------------------------------------------------ poster field markers */

/**
 * The layers of a poster that hold the person's texts carry the field in their id:
 * pf_<field>_<lines>_<max size in 1/10000 of the frame height>_<random>. Ids never change with edits and
 * normalizeProject keeps them, so a title can be found and refitted after any number of changes.
 */
const FIELD_RE = /^pf_([a-z]+[0-9]*)_([0-9]{1,2})_([0-9]{1,5})_[a-z0-9]{4,12}$/;

function fieldId(field: string, lines: number, maxSize: number): Id {
  return `pf_${field}_${Math.max(1, Math.min(99, lines))}_${Math.max(1, Math.min(99999, Math.round(maxSize * 10000)))}_${uid().slice(0, 8)}`;
}

export interface FieldRef { field: string; layer: Id; lines: number; maxSize: number; kind: 'text' | 'label' }

export function fieldOf(layerId: Id): { field: string; lines: number; maxSize: number } | null {
  const m = FIELD_RE.exec(layerId);
  return m ? { field: m[1], lines: Number(m[2]), maxSize: Number(m[3]) / 10000 } : null;
}

/** The poster fields of a project (text layers and shape labels), in layer order. */
export function posterFields(p: Project): FieldRef[] {
  const out: FieldRef[] = [];
  for (const l of p.layers) {
    const f = fieldOf(l.id);
    if (!f) continue;
    if (l.kind === 'text') out.push({ ...f, layer: l.id, kind: 'text' });
    else if (l.kind === 'shape' && l.label) out.push({ ...f, layer: l.id, kind: 'label' });
  }
  return out;
}

/** The current text of a field ('' when the project has none). */
export function posterFieldText(p: Project, field: string): string {
  const ref = posterFields(p).find(f => f.field === field);
  const l = ref && p.layers.find(x => x.id === ref.layer);
  if (!l) return '';
  return l.kind === 'text' ? l.text : l.kind === 'shape' ? l.label?.text ?? '' : '';
}

/**
 * Changes a field's text in a draft project: text layers get the new text, fitted again to their box (the
 * same number of lines, never larger than the size the poster gave them); labels just change.
 */
export function setPosterField(d: Project, field: string, value: string, measure: Measure = estimateWidth): boolean {
  let changed = false;
  for (const ref of posterFields(d)) {
    if (ref.field !== field) continue;
    const l = d.layers.find(x => x.id === ref.layer);
    if (!l) continue;
    if (l.kind === 'text') {
      // a text on a spiral or a circle keeps its length: the new phrase is repeated along the path
      const old = l.text.length;
      l.text = l.path && value.trim() && old > value.length ? `${value.trim()} · `.repeat(Math.ceil(old / (value.trim().length + 3))).slice(0, Math.min(5000, old)) : value.slice(0, 5000);
      if (!l.path) {
        const px = fitSize(value || ' ', { font: l.font, weight: l.weight, italic: l.italic, upper: l.upper, tracking: l.tracking }, l.box.w * d.canvas.w * 0.995, Math.max(ref.maxSize * d.canvas.h, d.canvas.h * 0.0021), ref.lines, d.canvas.h * 0.0021, measure);
        l.size = px / d.canvas.h;
      }
      changed = true;
    } else if (l.kind === 'shape' && l.label) {
      l.label = { ...l.label, text: value.slice(0, 400) };
      changed = true;
    }
  }
  return changed;
}

/* ------------------------------------------------------------------ the builder */

const INK = '#0c0b0a', BONE = '#ede6da', CREAM = '#efe9df', VERM = '#ff5b1f';

export interface PosterInput {
  /** The picture the poster is built over (an image, a video or a sequence). */
  main: Source;
  /** A cut-out of it (background removed), when there is one: subject layers read it. */
  cutout?: Source | null;
  /** A subject mask already made (a raster part from «Quitar fondo»), used when there is no cut-out. */
  subject?: MaskPart | null;
  /** Width / height of the canvas the subject mask was made for (a raster mask stretches with the frame). */
  subjectAspect?: number;
  /** Where the subject is in the frame (frame units), when known. */
  subjectBox?: Rect | null;
  /** Mean brightness of the picture 0..1, when known (light photos are typed in dark ink, dark ones the other way). */
  tone?: number | null;
}

export interface PosterOptions {
  format?: PosterFormat;
  fields?: Partial<PosterFields>;
  measure?: Measure;
}

interface B {
  W: number; H: number; k: number; portrait: boolean; wide: boolean;
  /** 1 % of the shorter side, in px. */
  u: number;
  fr: PosterFrame;
  print: boolean;
  /** Content area (safe area with the poster's own margin). */
  area: Rect;
  src: Id;
  cut: Id | null;
  subject: MaskPart | null;
  sbox: Rect;
  hasSubject: boolean;
  tone: number | null;
  f: PosterFields;
  layers: Layer[];
  measure: Measure;
  notes: string[];
}

const fx = (b: B, px: number) => px / b.W;
const fy = (b: B, px: number) => px / b.H;
const clamp = (v: number, a: number, z: number) => Math.min(z, Math.max(a, v));
const r4 = (v: number) => Math.round(v * 1e5) / 1e5 || 0;
const add = <L extends Layer>(b: B, l: L): L => { b.layers.push(l); return l; };

/**
 * The content area: print pages inside the trimmed page by `m` × its shorter side (never outside the safe
 * area); social formats inside their safe area by that much more.
 */
function areaOf(fr: PosterFrame, m: number): Rect {
  const s = Math.min(fr.w, fr.h) * m;
  if (fr.size.group !== 'impresion') return inset(fr.safe, s / fr.w, s / fr.h);
  const safe = mmToPx(SAFE_MM);
  const d = Math.max(s, safe);
  return inset(fr.trim, d / fr.w, d / fr.h);
}

interface TextOpts extends TypeStyle {
  px: number;
  color: string;
  x: number; y: number; w: number;
  align?: 'left' | 'center' | 'right';
  name: string;
  /** A poster field: the id marks it (and the lines it may take when refitted). */
  field?: string;
  lines?: number;
  opacity?: number;
  path?: TextLayer['path'];
}

function textLayer(b: B, text: string, o: TextOpts): TextLayer {
  const size = o.px / b.H;
  const init = {
    name: o.name, text, font: o.font, weight: o.weight, size: Math.floor(size * 1e5) / 1e5, color: o.color, align: o.align ?? 'left',
    box: { x: r4(o.x), y: r4(o.y), w: r4(o.w) }, tracking: o.tracking ?? 0, leading: o.leading ?? 1.1, italic: !!o.italic, upper: !!o.upper,
    ...(o.path ? { path: o.path } : {}), ...(o.opacity !== undefined ? { opacity: o.opacity } : {}),
  };
  const l = newLayer('text', init);
  if (o.field) l.id = fieldId(o.field, o.lines ?? 1, size);
  return add(b, l);
}

/** A fitted text block: returns the layer and its height (frame units). */
function fitted(b: B, text: string, o: Omit<TextOpts, 'px'> & { max: number; min?: number; lines: number }): { layer: TextLayer; h: number; px: number; n: number } {
  // (a hair narrower than the box: the stored numbers are rounded)
  const boxPx = o.w * b.W * 0.995;
  // (never under the smallest type a project keeps: 0.2 % of the frame height)
  const px = fitSize(text || " ", o, boxPx, Math.max(o.max, b.H * 0.0021), o.lines, Math.max(o.min ?? o.max * 0.3, b.H * 0.0021), b.measure);
  const fit = truncate(text, o, px, boxPx, o.lines, b.measure);
  const n = Math.max(1, Math.min(o.lines, wrapLines(fit || ' ', o, px, boxPx, b.measure).length));
  const layer = textLayer(b, fit, { ...o, px });
  return { layer, h: fy(b, blockHeight(px, n, o.leading ?? 1.1)), px, n };
}

/** The text cut (at a word, with «…») to what `lines` lines hold at this size: a block never grows past its room. */
export function truncate(text: string, st: TypeStyle, px: number, boxPx: number, lines: number, measure: Measure = estimateWidth): string {
  if (wrapLines(text || ' ', st, px, boxPx, measure).length <= lines) return text;
  const words = text.split(/(\s+)/);
  let lo = 0, hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const cand = words.slice(0, mid).join('').trimEnd() + '…';
    if (wrapLines(cand, st, px, boxPx, measure).length <= lines) lo = mid; else hi = mid - 1;
  }
  return lo > 0 ? words.slice(0, lo).join('').trimEnd() + '…' : '…';
}

/** Height (frame units) a fitted block would take, without adding it. */
function measureBlock(b: B, text: string, o: TypeStyle & { w: number; max: number; min?: number; lines: number }): { h: number; px: number; n: number } {
  const boxPx = o.w * b.W * 0.995;
  // (never under the smallest type a project keeps: 0.2 % of the frame height)
  const px = fitSize(text || " ", o, boxPx, Math.max(o.max, b.H * 0.0021), o.lines, Math.max(o.min ?? o.max * 0.3, b.H * 0.0021), b.measure);
  const n = Math.max(1, Math.min(o.lines, wrapLines(truncate(text, o, px, boxPx, o.lines, b.measure) || ' ', o, px, boxPx, b.measure).length));
  return { h: fy(b, blockHeight(px, n, o.leading ?? 1.1)), px, n };
}

function shape(b: B, name: string, kind: ShapeLayer['shape'], pts: number[], o: { stroke?: string | null; width?: number; fill?: string | null; dash?: number[] | null; label?: { text: string; px: number; color: string; font?: string; field?: string }; opacity?: number; mask?: Mask | null }): ShapeLayer {
  const l = newLayer('shape', {
    name, shape: kind, pts: pts.map(r4), stroke: o.stroke === undefined ? BONE : o.stroke, width: o.width ?? 2, fill: o.fill ?? null, dash: o.dash ?? null,
    ...(o.label ? { label: { text: o.label.text, font: o.label.font ?? 'jetbrains', size: r4(o.label.px / b.H), color: o.label.color } } : {}),
    ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.mask !== undefined ? { mask: o.mask } : {}),
  });
  if (o.label?.field) l.id = fieldId(o.label.field, 1, o.label.px / b.H);
  return add(b, l);
}

const rectPart = (r: Rect, soft = 0): MaskPart => ({ kind: 'rect', op: 'add', x: r4(r.x), y: r4(r.y), w: r4(r.w), h: r4(r.h), rot: 0, soft, alpha: 1 });
const maskOf = (parts: MaskPart[], feather = 0): Mask => ({ invert: false, feather, opacity: 1, parts });

/**
 * Places a full-frame layer inside a panel of the frame: its picture (placed in the whole frame) is cut to
 * the largest rectangle of the panel's proportion around `focus` (layer frame units) and scaled into the
 * panel. The layer keeps its own settings; mask and placement can be edited like any other.
 */
function panelXf(b: B, r: Rect, focus = { x: 0.5, y: 0.5 }): { xf: LayerTransform; cut: Rect; s: number } {
  const pw = r.w * b.W, ph = r.h * b.H;
  let Rw: number, Rh: number;
  if (pw / ph >= b.W / b.H) { Rw = b.W; Rh = (b.W * ph) / pw; } else { Rh = b.H; Rw = (b.H * pw) / ph; }
  const s = pw / Rw;
  const hw = Rw / b.W / 2, hh = Rh / b.H / 2;
  const cx = clamp(focus.x, hw, 1 - hw), cy = clamp(focus.y, hh, 1 - hh);
  const xf: LayerTransform = { x: r4(r.x + r.w / 2 - 0.5 - s * (cx - 0.5)), y: r4(r.y + r.h / 2 - 0.5 - s * (cy - 0.5)), scale: r4(s), rot: 0 };
  return { xf, cut: { x: cx - hw, y: cy - hh, w: hw * 2, h: hh * 2 }, s };
}

/** A point of the frame in the layer space of a panel placement. */
function toLayer(xf: LayerTransform, x: number, y: number): { x: number; y: number } {
  return { x: 0.5 + (x - 0.5 - xf.x) / xf.scale, y: 0.5 + (y - 0.5 - xf.y) / xf.scale };
}

/** A circle of radius `rpx` (px of the frame) at a frame point, as a mask part of a panel-placed layer. */
function circleIn(b: B, xf: LayerTransform, cx: number, cy: number, rpx: number, soft = 0): MaskPart {
  const c = toLayer(xf, cx, cy), r = rpx / xf.scale;
  return { kind: 'ellipse', op: 'add', x: r4(c.x - r / b.W), y: r4(c.y - r / b.H), w: r4((2 * r) / b.W), h: r4((2 * r) / b.H), rot: 0, soft, alpha: 1 };
}

/** A frame rectangle as a mask part of a panel-placed layer. */
function rectIn(xf: LayerTransform, r: Rect, soft = 0): MaskPart {
  const a = toLayer(xf, r.x, r.y), z = toLayer(xf, r.x + r.w, r.y + r.h);
  return rectPart({ x: a.x, y: a.y, w: z.x - a.x, h: z.y - a.y }, soft);
}

/** Rotates a full-frame layer by `deg` around a frame point (shapes, stickers, tape). */
function rotateAbout(b: B, l: Layer, cx: number, cy: number, deg: number) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = (cx - 0.5) * b.W, dy = (cy - 0.5) * b.H;
  const tx = dx - (c * dx - s * dy), ty = dy - (s * dx + c * dy);
  l.xf = { x: r4(tx / b.W), y: r4(ty / b.H), scale: 1, rot: deg };
}

function photo(b: B, name: string, o: Partial<PhotoLayer> = {}): PhotoLayer {
  return add(b, newLayer('photo', { name, source: b.src, fit: 'cover', ...o }));
}

function glyphs(b: B, name: string, st: Partial<GlyphStyle>, o: Partial<GlyphsLayer> = {}): GlyphsLayer {
  const base: GlyphStyle = {
    charset: 'estandar', chars: '', fill: 'ramp', font: 'jetbrains', weight: 500, cell: 10, aspect: 2, bright: 0, contrast: 1, gamma: 1, sat: 1,
    invert: false, edge: 0, cutoff: 0, color: 'mono', ink: BONE, paper: null, palette: [INK, '#5b544c', BONE, VERM],
  };
  const g = { ...base, ...st };
  g.cell = Math.round(clamp(g.cell, 3, 256) * 10) / 10;
  return add(b, newLayer('glyphs', { name, source: b.src, glyphs: g, ...o }));
}

function ascii(b: B, name: string, style: Recipe, o: Partial<AsciiLayer> = {}): AsciiLayer {
  return add(b, newLayer('ascii', { name, source: b.src, style, opaque: true, ...o }));
}

/** A lab preset as an ASCII layer's style, cells in output px. */
function labStyle(id: string, cell: number, tone: Partial<Recipe['tone']> = {}): Recipe {
  const p = PRESETS.media.find(x => x.id === id) ?? PRESETS.media[0];
  const r = p.make();
  r.tone = { ...r.tone, ...tone };
  r.interact = { ...r.interact, mode: 'none', auto: false };
  r.glyph = { ...r.glyph, cell: Math.round(clamp(cell, 4, 200)) };
  // posters are stills: the style holds still unless someone animates it
  r.motion = { ...r.motion, speed: 0 };
  return r;
}

const finish = (kind: Finish['kind'], params: Finish['params'], amount = 1): Finish => ({ kind, on: true, amount, params });
const grainStill = (b: B, amount = 0.2): Finish => finish('grain', { amount, size: Math.max(0.6, Math.round(b.u * 0.12 * 10) / 10), color: false, anim: false });

/** The subject: its own layer source (cut-out), a mask copied from the project, or a soft oval (with a note). */
function subjectLayerSetup(b: B): { source: Id; mask: Mask | null } {
  if (b.cut) return { source: b.cut, mask: null };
  if (b.subject) return { source: b.src, mask: maskOf([{ ...b.subject, op: 'add' } as MaskPart], Math.round(b.u * 0.4)) };
  const s = b.sbox;
  return { source: b.src, mask: maskOf([{ kind: 'ellipse', op: 'add', x: r4(s.x), y: r4(s.y), w: r4(s.w), h: r4(s.h), rot: 0, soft: Math.round(b.u * 2.5), alpha: 1 }]) };
}

/* ------------------------------------------------------------------ the posters */

export interface PosterDef {
  id: string;
  name: string;
  blurb: string;
  /** The format it is drawn for first (the size picker starts there). */
  format: PosterFormat;
  bg: string;
  fields: PosterFields;
  /** Fields the poster shows (the others are kept for later changes of poster). */
  uses: string[];
  build(b: B): void;
}

const labelKeys = (n: number) => Array.from({ length: n }, (_, i) => `label${i}`);

export const POSTERS: PosterDef[] = [
  /* ---------------------------------------------------------------- 1. annotated */
  {
    id: 'anotado', name: 'Cartel anotado', blurb: 'Sólo el sujeto en caracteres, con líneas finas de anotación, etiquetas en caja y un bloque de pie.',
    format: { size: 'vertical' }, bg: INK,
    fields: { kicker: 'Registro 01 — Estudio de la llama', title: 'Arde en caracteres', subtitle: 'La foto queda como fondo; sólo lo que importa se vuelve texto, medido y anotado como una lámina técnica.', caption: 'Celda 12 px\nTinta de la foto\nBrillo 1,2\nCapas 9', labels: ['FL33', 'PW33', 'AS07'] },
    uses: ['kicker', 'title', 'subtitle', 'caption', ...labelKeys(3)],
    build(b) {
      const { u } = b;
      const a = b.area;
      photo(b, 'Foto de fondo', {
        adjust: { bright: -0.28, contrast: 1.12, gamma: 1, sat: 0.45, hue: 0, temp: 0.1, blur: 0, sharpen: 0, invert: false, mono: false },
        finishes: [finish('vignette', { amount: 0.65, size: 0.45, soft: 0.7, round: 0.5, color: '#000000' }), grainStill(b, 0.25)],
      });
      const subj = subjectLayerSetup(b);
      glyphs(b, 'Sujeto en caracteres', {
        charset: 'estandar', font: 'jetbrains', weight: 700, cell: Math.max(7, b.u * 1.05), aspect: 1.8, color: 'source',
        bright: 0.12, contrast: 1.5, gamma: 0.9, sat: 1.35, edge: 0.3, cutoff: 0.05,
      }, { source: subj.source, mask: subj.mask, finishes: [finish('glow', { threshold: 0.3, radius: Math.round(u * 2.2), strength: 1.1, tint: '#ffb27a', blend: 'screen' }, 0.9)] });
      // the subject's box, drawn and annotated
      const s = b.sbox;
      const line = Math.max(1, Math.round(u * 0.13 * 10) / 10);
      shape(b, 'Marco del sujeto', 'bracket', [s.x, s.y, s.w, s.h], { stroke: BONE, width: line, opacity: 0.55 });
      const cs = Math.min(s.w * b.W, s.h * b.H) * 0.14;
      shape(b, 'Mira', 'crosshair', [s.x + s.w * 0.5 - fx(b, cs) / 2, s.y + s.h * 0.42 - fy(b, cs) / 2, fx(b, cs), fy(b, cs)], { stroke: VERM, width: line * 1.4 });
      const lpx = Math.max(10, u * 1.35);
      const L = [b.f.labels[0] ?? '', b.f.labels[1] ?? '', b.f.labels[2] ?? ''];
      const targets = [
        { x: s.x + s.w * 0.34, y: s.y + s.h * 0.26, side: -1, ly: s.y + s.h * 0.1 },
        { x: s.x + s.w * 0.72, y: s.y + s.h * 0.42, side: 1, ly: s.y + s.h * 0.26 },
        { x: s.x + s.w * 0.4, y: s.y + s.h * 0.74, side: -1, ly: s.y + s.h * 0.56 },
      ];
      targets.forEach((t, i) => {
        if (!L[i]) return;
        // the box opens away from the frame's centre: the leader reaches it from the outside with a short stub
        const stub = fx(b, u * 1.6);
        const lx = t.side < 0 ? a.x + stub : a.x + a.w - stub;
        const ex = t.side < 0 ? a.x : a.x + a.w;
        const ly = clamp(t.ly, a.y + fy(b, lpx * 5), a.y + a.h * 0.62);
        shape(b, `Nota ${L[i]}`, 'callout', [t.x, t.y, ex, ly, lx, ly], { stroke: BONE, width: line, label: { text: L[i], px: lpx, color: BONE, field: `label${i}` } });
      });
      // top line
      const small = Math.max(9, u * 1.2);
      fitted(b, b.f.kicker, { name: 'Antetítulo', field: 'kicker', font: 'jetbrains', weight: 500, color: BONE, x: a.x, y: a.y, w: a.w * 0.62, max: small, lines: 1, upper: true, tracking: 0.14, opacity: 0.85 });
      shape(b, 'Regla superior', 'line', [a.x, a.y + fy(b, small * 2.1), a.x + a.w, a.y + fy(b, small * 2.1)], { stroke: BONE, width: line, opacity: 0.35 });
      // the caption block, from the bottom up
      const colW = a.w * (b.portrait ? 0.64 : 0.56);
      const sub = measureBlock(b, b.f.subtitle, { font: 'jetbrains', weight: 400, w: colW, max: u * 1.45, min: 8, lines: 4, leading: 1.5 });
      const title = measureBlock(b, b.f.title, { font: 'martian', weight: 800, upper: true, tracking: -0.02, leading: 0.98, w: colW, max: u * (b.portrait ? 7.2 : 6), lines: 2 });
      const gap = fy(b, u * 1.4);
      const bottom = a.y + a.h;
      const subY = bottom - sub.h;
      const titleY = subY - gap - title.h;
      const ruleY = titleY - gap * 1.2;
      shape(b, 'Regla del pie', 'line', [a.x, ruleY, a.x + a.w, ruleY], { stroke: BONE, width: line, opacity: 0.5 });
      fitted(b, b.f.title, { name: 'Título', field: 'title', font: 'martian', weight: 800, upper: true, tracking: -0.02, leading: 0.98, color: BONE, x: a.x, y: titleY, w: colW, max: u * (b.portrait ? 7.2 : 6), lines: 2 });
      fitted(b, b.f.subtitle, { name: 'Subtítulo', field: 'subtitle', font: 'jetbrains', weight: 400, color: '#bdb5a9', x: a.x, y: subY, w: colW, max: u * 1.45, min: 8, lines: 4, leading: 1.5 });
      const capW = a.w * 0.26;
      const cap = measureBlock(b, b.f.caption, { font: 'jetbrains', weight: 500, upper: true, tracking: 0.08, leading: 1.7, w: capW, max: u * 1.15, min: 7, lines: 5 });
      fitted(b, b.f.caption, { name: 'Datos', field: 'caption', font: 'jetbrains', weight: 500, upper: true, tracking: 0.08, leading: 1.7, color: VERM, x: a.x + a.w - capW, y: bottom - cap.h, w: capW, max: u * 1.15, min: 7, lines: 5, align: 'right' });
    },
  },

  /* ---------------------------------------------------------------- 2. round patches */
  {
    id: 'parches', name: 'Parches redondos', blurb: 'Círculos de letras y cuadros tramados sobre la foto, con marco de papel y pie.',
    format: { size: 'vertical' }, bg: CREAM,
    fields: { kicker: '', title: 'Parches de letra y trama', subtitle: '', caption: 'Pintura, tinta y tramado: tres maneras de mirar la misma foto.', labels: ['Letras', 'Braille', 'Bloques', 'Tramado'] },
    uses: ['title', 'caption', ...labelKeys(4)],
    build(b) {
      const { u } = b;
      const a = b.area;
      const capH = fy(b, u * (b.portrait ? 9 : 7.5));
      const panel: Rect = { x: a.x, y: a.y, w: a.w, h: a.h - capH };
      const P = panelXf(b, panel);
      const s = P.s;
      photo(b, 'Foto', {
        mask: maskOf([rectPart(P.cut)]), xf: P.xf,
        adjust: { bright: 0, contrast: 1.08, gamma: 1, sat: 1.12, hue: 0, temp: 0.12, blur: 0, sharpen: 0.2, invert: false, mono: false },
        finishes: [grainStill(b, 0.14)],
      });
      const pmin = Math.min(panel.w * b.W, panel.h * b.H);
      // patches sit on the subject's edges (where the detail is), kept inside the panel
      const sb = b.sbox;
      const around = (sx: number, sy: number, rpx: number) => {
        const x = clamp(sb.x + sb.w * sx, panel.x + fx(b, rpx * 1.05), panel.x + panel.w - fx(b, rpx * 1.05));
        const y = clamp(sb.y + sb.h * sy, panel.y + fy(b, rpx * 1.05), panel.y + panel.h - fy(b, rpx * 1.05));
        return { x: (x - panel.x) / panel.w, y: (y - panel.y) / panel.h };
      };
      const at = (px: number, py: number) => ({ x: panel.x + panel.w * px, y: panel.y + panel.h * py });
      const c1 = around(0.12, 0.2, pmin * 0.2), c2 = around(0.98, 0.55, pmin * 0.15), c3 = around(0.02, 0.64, pmin * 0.105);
      const circles: Array<{ c: { x: number; y: number }; r: number; name: string; st: Partial<GlyphStyle> }> = [
        { c: at(c1.x, c1.y), r: pmin * 0.2, name: `Círculo · ${b.f.labels[0] || 'letras'}`, st: { charset: 'estandar', font: 'jetbrains', weight: 700, color: 'mono', ink: '#1c1a17', paper: '#f3eee4', invert: true, contrast: 1.45, gamma: 0.9, cell: (u * 0.95) / s, aspect: 1.8 } },
        { c: at(c2.x, c2.y), r: pmin * 0.15, name: `Círculo · ${b.f.labels[1] || 'braille'}`, st: { charset: 'braille', font: 'jetbrains', weight: 500, color: 'source', paper: '#141210', contrast: 1.3, bright: 0.08, sat: 1.5, cell: (u * 0.85) / s, aspect: 2 } },
        { c: at(c3.x, c3.y), r: pmin * 0.105, name: `Círculo · ${b.f.labels[2] || 'bloques'}`, st: { charset: 'bloques', font: 'jetbrains', weight: 500, color: 'source', sat: 1.3, contrast: 1.2, paper: '#1c1a17', cell: (u * 1.15) / s, aspect: 1.1 } },
      ];
      for (const c of circles) glyphs(b, c.name, c.st, { mask: maskOf([circleIn(b, P.xf, c.c.x, c.c.y, c.r)]), xf: P.xf });
      const sq = (px: number, py: number, side: number): Rect => { const p = at(px, py); return { x: p.x, y: p.y, w: fx(b, side), h: fy(b, side) }; };
      const squares: Array<{ r: Rect; name: string; fin: Finish }> = [
        { r: sq(0.6, 0.05, pmin * 0.24), name: `Cuadro · ${b.f.labels[3] || 'tramado'}`, fin: finish('dither', { algo: 'atkinson', color: 'bn', ink: '#1c1a17', paper: '#f3eee4', pixel: Math.max(2, Math.round(u * 0.55)), contrast: 1.25, serpentine: true }) },
        { r: sq(0.04, 0.46, pmin * 0.13), name: 'Cuadro · Bayer', fin: finish('dither', { algo: 'bayer8', color: 'rgb', levels: 2, pixel: Math.max(1, Math.round(u * 0.4)), contrast: 1.15 }) },
        { r: sq(0.7, 0.8, pmin * 0.14), name: 'Cuadro · CMYK', fin: finish('halftone', { shape: 'dot', freq: clamp(100 / (u * 0.75), 2, 40), angle: 45, contrast: 1.2, bright: 0, color: 'cmyk', ink: INK, paper: '#f3eee4', clear: false }) },
      ];
      for (const q of squares) {
        photo(b, q.name, { mask: maskOf([rectIn(P.xf, q.r)]), xf: P.xf, finishes: [q.fin] });
      }
      // the caption under the panel
      const line = Math.max(1, Math.round(u * 0.12 * 10) / 10);
      const y0 = panel.y + panel.h + fy(b, u * 1.6);
      const tW = a.w * 0.6;
      const t = measureBlock(b, b.f.title, { font: 'serif', weight: 400, italic: true, w: tW, max: u * 4.2, lines: 1, leading: 1 });
      fitted(b, b.f.title, { name: 'Título', field: 'title', font: 'serif', weight: 400, italic: true, color: '#1c1a17', x: a.x, y: y0, w: tW, max: u * 4.2, lines: 1, leading: 1 });
      const capW = a.w * 0.36;
      fitted(b, b.f.caption, { name: 'Pie', field: 'caption', font: 'jetbrains', weight: 400, color: '#4a4540', x: a.x + a.w - capW, y: y0 + fy(b, u * 0.5), w: capW, max: u * 1.2, min: 7, lines: 3, leading: 1.45, align: 'right' });
      shape(b, 'Regla', 'line', [a.x, y0 + t.h + fy(b, u * 0.9), a.x + a.w * 0.6, y0 + t.h + fy(b, u * 0.9)], { stroke: '#1c1a17', width: line, opacity: 0.4 });
    },
  },

  /* ---------------------------------------------------------------- 3. magazine page */
  {
    id: 'revista', name: 'Página de revista', blurb: 'Tu foto escrita a máquina en una columna, con titular, entradilla, texto y folio.',
    format: { size: 'a4' }, bg: '#f1ece1',
    fields: {
      kicker: 'GLYPHOS · Cuaderno de tipos · Nº 04', title: 'La máquina de escribir retratos',
      subtitle: 'Setenta caracteres de una vieja máquina bastan para dibujar una cara: el punto para la luz, la arroba para la sombra.',
      caption: 'Antes de las pantallas, los operadores de teletipo dibujaban con lo que tenían a mano: letras, signos y espacios. Cada tecla deja una mancha distinta, y una mancha distinta es un gris distinto. Esta página hace lo mismo con tu foto: mide la luz de cada celda y escoge la letra que mancha lo justo. Lo que ves a la izquierda es texto de verdad, carácter por carácter; se puede copiar y pegar.',
      labels: ['42', 'Fig. 1 — la foto original, en pequeño.'],
    },
    uses: ['kicker', 'title', 'subtitle', 'caption', 'label0', 'label1'],
    build(b) {
      const { u } = b;
      const a = b.area;
      const ink = '#1b1a18';
      const line = Math.max(1, Math.round(u * 0.1 * 10) / 10);
      // folio
      const small = Math.max(8, u * 1.05);
      fitted(b, b.f.kicker, { name: 'Folio', field: 'kicker', font: 'jetbrains', weight: 500, color: ink, x: a.x, y: a.y, w: a.w * 0.75, max: small, min: 7, lines: 1, upper: true, tracking: 0.12 });
      fitted(b, b.f.labels[0] ?? '', { name: 'Página', field: 'label0', font: 'jetbrains', weight: 500, color: ink, x: a.x + a.w * 0.8, y: a.y, w: a.w * 0.2, max: small, min: 7, lines: 1, align: 'right' });
      const ruleY = a.y + fy(b, small * 2);
      shape(b, 'Regla del folio', 'line', [a.x, ruleY, a.x + a.w, ruleY], { stroke: ink, width: line * 2 });
      const top = ruleY + fy(b, u * 2.2);
      const gut = fx(b, u * 2.4);
      if (b.portrait || b.k < 1.2) {
        // headline across, then figure column + text column
        const t = fitted(b, b.f.title, { name: 'Título', field: 'title', font: 'serif', weight: 400, italic: true, color: ink, x: a.x, y: top, w: a.w, max: u * 8.5, lines: 2, leading: 0.98, tracking: -0.01 });
        const y1 = top + t.h + fy(b, u * 2);
        shape(b, 'Regla del título', 'line', [a.x, y1, a.x + a.w, y1], { stroke: ink, width: line });
        const colA = a.w * 0.56, colB = a.w - colA - gut;
        const figH = a.y + a.h - (y1 + fy(b, u * 2)) - fy(b, u * 3.5);
        placeTypewriter(b, { x: a.x, y: y1 + fy(b, u * 2), w: colA, h: figH }, ink);
        textColumn(b, { x: a.x + colA + gut, y: y1 + fy(b, u * 2), w: colB, h: a.y + a.h - (y1 + fy(b, u * 2)) }, ink);
      } else {
        const colA = a.w * 0.44, colB = a.w - colA - gut;
        placeTypewriter(b, { x: a.x, y: top, w: colA, h: a.y + a.h - top - fy(b, u * 3.5) }, ink);
        const t = fitted(b, b.f.title, { name: 'Título', field: 'title', font: 'serif', weight: 400, italic: true, color: ink, x: a.x + colA + gut, y: top, w: colB, max: u * 8, lines: 3, leading: 0.98, tracking: -0.01 });
        const y1 = top + t.h + fy(b, u * 1.6);
        shape(b, 'Regla del título', 'line', [a.x + colA + gut, y1, a.x + a.w, y1], { stroke: ink, width: line });
        textColumn(b, { x: a.x + colA + gut, y: y1 + fy(b, u * 1.6), w: colB, h: a.y + a.h - y1 - fy(b, u * 1.6) }, ink);
      }
    },
  },

  /* ---------------------------------------------------------------- 4. title and figure */
  {
    id: 'figura', name: 'Título y figura', blurb: 'Una figura enorme hecha de caracteres y un título a toda anchura.',
    format: { size: 'vertical' }, bg: INK,
    fields: { kicker: 'Serie de caracteres', title: 'Ruido de fondo', subtitle: 'Cinco tintas, una celda de 28 píxeles y nada más: la figura se lee de lejos y se deshace de cerca.', caption: '', labels: ['01 / 05'] },
    uses: ['kicker', 'title', 'subtitle', 'label0'],
    build(b) {
      const { u } = b;
      const a = b.area;
      const subj = subjectLayerSetup(b);
      const cell = Math.max(9, Math.min(b.W, b.H) / 34);
      glyphs(b, 'Figura en caracteres', {
        charset: 'estandar', font: 'martian', weight: 800, cell, aspect: 1.35, color: 'palette',
        palette: ['#2a1c15', '#6e2b14', '#c7431a', VERM, '#ffb489', BONE], contrast: 1.35, bright: 0.04, cutoff: 0.08, sat: 1.1,
      }, { source: subj.source, mask: b.cut ? null : maskOf([rectPart({ x: 0, y: 0, w: 1, h: 1 })]) });
      const small = Math.max(9, u * 1.2);
      fitted(b, b.f.kicker, { name: 'Antetítulo', field: 'kicker', font: 'jetbrains', weight: 600, color: BONE, x: a.x, y: a.y, w: a.w * 0.6, max: small, lines: 1, upper: true, tracking: 0.16 });
      fitted(b, b.f.labels[0] ?? '', { name: 'Número', field: 'label0', font: 'jetbrains', weight: 600, color: VERM, x: a.x + a.w * 0.65, y: a.y, w: a.w * 0.35, max: small, lines: 1, align: 'right', tracking: 0.1 });
      const tSt = { font: INTER, weight: 800, upper: true, tracking: -0.035, leading: 0.9 };
      const sub = measureBlock(b, b.f.subtitle, { font: 'jetbrains', weight: 400, w: a.w * (b.portrait ? 0.7 : 0.5), max: u * 1.5, min: 8, lines: 3, leading: 1.45 });
      const t = measureBlock(b, b.f.title, { ...tSt, w: a.w, max: u * (b.portrait ? 17 : 14), lines: 2 });
      const bottom = a.y + a.h;
      const subY = bottom - sub.h;
      const tY = subY - fy(b, u * 1.8) - t.h;
      shape(b, 'Regla', 'line', [a.x, tY - fy(b, u * 2.6), a.x + a.w * 0.18, tY - fy(b, u * 2.6)], { stroke: VERM, width: Math.max(2, u * 0.45) });
      fitted(b, b.f.title, { ...tSt, name: 'Título', field: 'title', color: BONE, x: a.x, y: tY, w: a.w, max: u * (b.portrait ? 17 : 14), lines: 2 });
      fitted(b, b.f.subtitle, { name: 'Subtítulo', field: 'subtitle', font: 'jetbrains', weight: 400, color: '#b9b0a4', x: a.x, y: subY, w: a.w * (b.portrait ? 0.7 : 0.5), max: u * 1.5, min: 8, lines: 3, leading: 1.45 });
    },
  },

  /* ---------------------------------------------------------------- 5. triptych */
  {
    id: 'triptico', name: 'Tríptico', blurb: 'La misma foto tres veces: tramado, caracteres reales y ASCII del laboratorio.',
    format: { size: 'horizontal' }, bg: BONE,
    fields: { kicker: 'Tres lecturas de una foto', title: 'Tríptico', subtitle: 'Tramado de Atkinson, letras de máquina de escribir y el motor ASCII del laboratorio: la misma luz contada tres veces.', caption: '', labels: ['Tramado', 'A máquina', 'ASCII'] },
    uses: ['kicker', 'title', 'subtitle', ...labelKeys(3)],
    build(b) {
      const { u } = b;
      const a = b.area;
      const ink = '#1c1a17';
      const line = Math.max(1, Math.round(u * 0.1 * 10) / 10);
      const labPx = Math.max(8, u * 1.1);
      const g = u * 1.6;
      const colW = (a.w * b.W - 2 * g) / 3;
      // the header, the panels (at most a little taller than wide… or much taller on a tall page) and their names,
      // as one block a little above the middle of the page
      const tW = b.portrait ? a.w : a.w * 0.45;
      const t = measureBlock(b, b.f.title, { font: 'serif', weight: 400, italic: true, w: tW, max: u * (b.portrait ? 9 : 7), lines: 1, leading: 1 });
      const subW = b.portrait ? a.w * 0.8 : a.w * 0.44;
      const sub = measureBlock(b, b.f.subtitle, { font: 'jetbrains', weight: 400, w: subW, max: u * 1.25, min: 7, lines: 3, leading: 1.45 });
      const headH = b.portrait ? t.h + fy(b, u * 1.2) + sub.h + fy(b, u * 1.4) : Math.max(t.h, sub.h) + fy(b, u * 1.2);
      const labH = fy(b, labPx * 2.6);
      const room = a.h - headH - fy(b, u * 2.4) - labH - fy(b, labPx * 2.4);
      const ph = Math.min(room * b.H, colW / (b.portrait ? 0.46 : 0.62));
      const blockH = headH + fy(b, u * 2.4) + fy(b, ph) + labH;
      const top = a.y + Math.max(0, (a.h - fy(b, labPx * 2.4) - blockH) * 0.4);
      fitted(b, b.f.title, { name: 'Título', field: 'title', font: 'serif', weight: 400, italic: true, color: ink, x: a.x, y: top, w: tW, max: u * (b.portrait ? 9 : 7), lines: 1, leading: 1 });
      if (b.portrait) fitted(b, b.f.subtitle, { name: 'Subtítulo', field: 'subtitle', font: 'jetbrains', weight: 400, color: '#4a4540', x: a.x, y: top + t.h + fy(b, u * 1.2), w: subW, max: u * 1.25, min: 7, lines: 3, leading: 1.45 });
      else fitted(b, b.f.subtitle, { name: 'Subtítulo', field: 'subtitle', font: 'jetbrains', weight: 400, color: '#4a4540', x: a.x + a.w - subW, y: top + fy(b, u * 0.4), w: subW, max: u * 1.25, min: 7, lines: 3, leading: 1.45, align: 'right' });
      const hdr = top + headH;
      shape(b, 'Regla', 'line', [a.x, hdr, a.x + a.w, hdr], { stroke: ink, width: line });
      const py = hdr + fy(b, u * 2.4);
      const roman = ['I', 'II', 'III'];
      for (let i = 0; i < 3; i++) {
        const r: Rect = { x: a.x + fx(b, i * (colW + g)), y: py, w: fx(b, colW), h: fy(b, ph) };
        const P = panelXf(b, r, { x: 0.5, y: 0.42 });
        const m = maskOf([rectPart(P.cut)]);
        const name = `${roman[i]} · ${b.f.labels[i] || ''}`.trim();
        if (i === 0) photo(b, name, { mask: m, xf: P.xf, finishes: [finish('dither', { algo: 'atkinson', color: 'bn', ink, paper: '#f3eee4', pixel: Math.max(1, Math.round((u * 0.32) / P.s)), contrast: 1.25, serpentine: true })] });
        else if (i === 1) glyphs(b, name, { charset: 'estandar2', font: 'plex', weight: 500, color: 'mono', ink, paper: '#f3eee4', invert: !!b.cut || (b.tone ?? 0.5) > 0.42, contrast: 1.35, cell: (u * 0.62) / P.s, aspect: 1.75 }, { source: b.cut ?? b.src, mask: m, xf: P.xf });
        else ascii(b, name, labStyle('bloques', (u * 0.95) / P.s, { bright: 0.05 }), { mask: m, xf: P.xf });
        shape(b, `Marco ${roman[i]}`, 'rect', [r.x, r.y, r.w, r.h], { stroke: ink, width: line, opacity: 0.6 });
        fitted(b, `${roman[i]} — ${b.f.labels[i] ?? ''}`, { name: `Rótulo ${roman[i]}`, field: `label${i}`, font: 'jetbrains', weight: 500, color: ink, x: r.x, y: r.y + r.h + fy(b, labPx * 0.9), w: r.w, max: labPx, min: 7, lines: 1, upper: true, tracking: 0.1 });
      }
      fitted(b, b.f.kicker, { name: 'Antetítulo', field: 'kicker', font: 'jetbrains', weight: 500, color: '#4a4540', x: a.x, y: a.y + a.h - fy(b, labPx * 1.3), w: a.w * 0.6, max: labPx, min: 7, lines: 1, upper: true, tracking: 0.14 });
    },
  },

  /* ---------------------------------------------------------------- 6. contact sheet */
  {
    id: 'contactos', name: 'Hoja de contactos', blurb: 'Una rejilla de variantes numeradas como en el cuarto oscuro, con la elegida marcada en rojo.',
    format: { size: 'vertical' }, bg: '#121110',
    fields: { kicker: 'Hoja de contactos — variantes', title: 'Doce maneras', subtitle: 'Tramas, caracteres y tintas sobre la misma toma. La marcada es la que se imprime.', caption: '', labels: ['GLYPHOS 400'] },
    uses: ['kicker', 'title', 'subtitle', 'label0'],
    build(b) {
      const { u } = b;
      const a = b.area;
      const edge = '#e9a23b';
      const small = Math.max(8, u * 1.1);
      fitted(b, b.f.kicker, { name: 'Antetítulo', field: 'kicker', font: 'jetbrains', weight: 600, color: edge, x: a.x, y: a.y, w: a.w * 0.62, max: small, min: 7, lines: 1, upper: true, tracking: 0.14 });
      fitted(b, b.f.labels[0] ?? '', { name: 'Película', field: 'label0', font: 'jetbrains', weight: 600, color: edge, x: a.x + a.w * 0.64, y: a.y, w: a.w * 0.36, max: small, min: 7, lines: 1, align: 'right', upper: true, tracking: 0.14 });
      const tSt = { font: 'martian', weight: 700, upper: true, tracking: -0.01, leading: 1 };
      const sub = measureBlock(b, b.f.subtitle, { font: 'jetbrains', weight: 400, w: a.w * 0.55, max: u * 1.3, min: 7, lines: 3, leading: 1.45 });
      const t = measureBlock(b, b.f.title, { ...tSt, w: a.w * 0.42, max: u * 4.2, lines: 2 });
      const footH = Math.max(sub.h, t.h) + fy(b, u * 2);
      const gridTop = a.y + fy(b, small * 3);
      const gridH = a.y + a.h - footH - gridTop;
      const many = !b.print;
      const [cols, rows] = b.k < 0.9 ? (many ? [3, 4] : [2, 3]) : b.k > 1.2 ? (many ? [4, 3] : [3, 2]) : (many ? [3, 3] : [2, 2]);
      const g = u * 1.3, lab = Math.max(7, u * 0.95);
      const cw = (a.w * b.W - (cols - 1) * g) / cols;
      const ch = (gridH * b.H - rows * lab * 1.6 - (rows - 1) * g) / rows;
      // frames keep the photo's shape when they can (a little squarer at most)
      const fw = Math.min(cw, ch * 1.5), fh = Math.min(ch, fw * 1.25);
      const x0 = a.x + (a.w - fx(b, cols * fw + (cols - 1) * g)) / 2;
      const variants: Array<(r: Rect, n: string) => void> = [
        (r, n) => { const P = panelXf(b, r); photo(b, n, { mask: maskOf([rectPart(P.cut)]), xf: P.xf }); },
        (r, n) => { const P = panelXf(b, r); photo(b, n, { mask: maskOf([rectPart(P.cut)]), xf: P.xf, finishes: [finish('dither', { algo: 'bayer8', color: 'rgb', levels: 2, pixel: Math.max(1, Math.round((u * 0.35) / P.s)), contrast: 1.2 })] }); },
        (r, n) => { const P = panelXf(b, r); glyphs(b, n, { charset: 'estandar', color: 'mono', ink: BONE, paper: INK, cell: (u * 0.62) / P.s, aspect: 1.9, contrast: 1.3 }, { mask: maskOf([rectPart(P.cut)]), xf: P.xf }); },
        (r, n) => { const P = panelXf(b, r); photo(b, n, { mask: maskOf([rectPart(P.cut)]), xf: P.xf, finishes: [finish('halftone', { shape: 'dot', freq: clamp(100 / ((u * 0.6) / P.s), 2, 40), angle: 45, contrast: 1.2, bright: 0, color: 'tinta', ink: '#1c1a17', paper: '#efe9df', clear: false })] }); },
        (r, n) => { const P = panelXf(b, r); glyphs(b, n, { charset: 'braille', color: 'source', paper: '#0e0d0c', cell: (u * 0.55) / P.s, aspect: 2, sat: 1.4, contrast: 1.2 }, { mask: maskOf([rectPart(P.cut)]), xf: P.xf }); },
        (r, n) => { const P = panelXf(b, r); photo(b, n, { mask: maskOf([rectPart(P.cut)]), xf: P.xf, finishes: [finish('duotone', { dark: '#1b1446', light: '#ff9b5e', contrast: 1.2, balance: 0 })] }); },
        (r, n) => { const P = panelXf(b, r); photo(b, n, { mask: maskOf([rectPart(P.cut)]), xf: P.xf, finishes: [finish('dither', { algo: 'atkinson', color: 'bn', ink: INK, paper: BONE, pixel: Math.max(1, Math.round((u * 0.3) / P.s)), contrast: 1.2, serpentine: true })] }); },
        (r, n) => { const P = panelXf(b, r); glyphs(b, n, { charset: 'bloques', color: 'source', paper: INK, cell: (u * 0.8) / P.s, aspect: 1.1, sat: 1.2 }, { mask: maskOf([rectPart(P.cut)]), xf: P.xf }); },
        (r, n) => { const P = panelXf(b, r); photo(b, n, { mask: maskOf([rectPart(P.cut)]), xf: P.xf, finishes: [finish('crosshatch', { spacing: Math.max(3, (u * 0.55) / P.s), width: 0.42, angle: 45, layers: 3, wobble: 0.25, bright: 0, color: 'tinta', ink: '#1a1714', paper: BONE, clear: false })] }); },
        (r, n) => { const P = panelXf(b, r); photo(b, n, { mask: maskOf([rectPart(P.cut)]), xf: P.xf, finishes: [finish('threshold', { level: 0.5, soft: 0.02, mode: 'local', radius: Math.max(2, (u * 1.2) / P.s), ink: INK, paper: '#f2e7d0', clear: false })] }); },
        (r, n) => { const P = panelXf(b, r); photo(b, n, { mask: maskOf([rectPart(P.cut)]), xf: P.xf, finishes: [finish('edges', { mode: 'boceto', threshold: 0.22, width: Math.max(0.5, (u * 0.12) / P.s), color: '#16130f', paper: '#efe6d2' })] }); },
        (r, n) => { const P = panelXf(b, r); photo(b, n, { mask: maskOf([rectPart(P.cut)]), xf: P.xf, finishes: [finish('palette', { palette: 'gameboy', dither: 'bayer4', pixel: Math.max(1, Math.round((u * 0.45) / P.s)), count: 4 })] }); },
      ];
      const n = Math.min(variants.length, cols * rows);
      const pick = Math.min(n - 1, cols + 1);
      for (let i = 0; i < n; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const x = x0 + fx(b, c * (fw + g));
        const y = gridTop + fy(b, lab * 1.6) + fy(b, r * (fh + g + lab * 1.6));
        const rect: Rect = { x, y, w: fx(b, fw), h: fy(b, fh) };
        variants[i](rect, `Variante ${i + 1}`);
        shape(b, `Cuadro ${i + 1}`, 'rect', [rect.x, rect.y, rect.w, rect.h], { stroke: '#3a3631', width: Math.max(1, u * 0.1), label: { text: `${i + 1}${i % 2 ? 'A' : ''}  ▸`, px: lab, color: edge } });
        if (i === pick) {
          const pad = u * 1.1;
          const e = shape(b, 'Elegida', 'ellipse', [rect.x - fx(b, pad), rect.y - fy(b, pad), rect.w + fx(b, 2 * pad), rect.h + fy(b, 2 * pad)], { stroke: VERM, width: Math.max(2, u * 0.5) });
          rotateAbout(b, e, rect.x + rect.w / 2, rect.y + rect.h / 2, -5);
        }
      }
      const fy0 = a.y + a.h - Math.max(sub.h, t.h);
      fitted(b, b.f.title, { ...tSt, name: 'Título', field: 'title', color: BONE, x: a.x, y: fy0, w: a.w * 0.42, max: u * 4.2, lines: 2 });
      fitted(b, b.f.subtitle, { name: 'Subtítulo', field: 'subtitle', font: 'jetbrains', weight: 400, color: '#a39b90', x: a.x + a.w * 0.45, y: fy0, w: a.w * 0.55, max: u * 1.3, min: 7, lines: 3, leading: 1.45 });
    },
  },

  /* ---------------------------------------------------------------- 7. spiral text */
  {
    id: 'espiral', name: 'Texto en espiral', blurb: 'Tu frase gira en espiral sobre un disco de semitono con la foto.',
    format: { size: 'cuadrado' }, bg: CREAM,
    fields: { kicker: 'Rotación 01', title: 'Todo gira', subtitle: 'una foto · una frase · una espiral', caption: 'lo que se escribe también da vueltas', labels: [] },
    uses: ['kicker', 'title', 'subtitle', 'caption'],
    build(b) {
      const { u } = b;
      const a = b.area;
      const ink = '#1c1a17';
      const small = Math.max(8, u * 1.15);
      const t = measureBlock(b, b.f.title, { font: 'serif', weight: 400, italic: true, w: a.w * 0.6, max: u * 6, lines: 1, leading: 1 });
      const top = a.y + fy(b, small * 2.2);
      const bottom = a.y + a.h - t.h - fy(b, u * 2);
      const cx = a.x + a.w / 2, cy = (top + bottom) / 2;
      const R = Math.min(a.w * b.W, (bottom - top) * b.H) / 2;
      const disc = photo(b, 'Disco de semitono', {
        mask: maskOf([{ kind: 'ellipse', op: 'add', x: r4(cx - fx(b, R * 0.9)), y: r4(cy - fy(b, R * 0.9)), w: r4(fx(b, R * 1.8)), h: r4(fy(b, R * 1.8)), rot: 0, soft: 0, alpha: 1 }]),
        finishes: [finish('halftone', { shape: 'dot', freq: clamp(100 / (u * 0.95), 2, 40), angle: 45, contrast: 1.35, bright: 0.05, color: 'tinta', ink: '#2a2622', paper: CREAM, clear: false })],
      });
      // the disc shows the middle of the photo whatever the page's shape
      const P = panelXf(b, { x: cx - fx(b, R * 0.9), y: cy - fy(b, R * 0.9), w: fx(b, R * 1.8), h: fy(b, R * 1.8) });
      disc.xf = P.xf;
      disc.mask = maskOf([circleIn(b, P.xf, cx, cy, R * 0.9)]);
      // the spiral: the phrase repeated as long as the path
      const px = Math.max(9, u * 1.9);
      const phrase = (b.f.caption || b.f.title || 'GLYPHOS').trim() + ' · ';
      const turns = 4.2;
      const length = 2 * Math.PI * (R * 0.8) * 0.58 * turns;
      const adv = estimateWidth('M', 'martian', 700, false, px) + px * 0.04;
      const need = Math.ceil(length / adv) + 12;
      const text = phrase.repeat(Math.ceil(need / phrase.length)).slice(0, Math.min(4800, need));
      textLayer(b, text, { name: 'Espiral', field: 'caption', font: 'martian', weight: 700, px, color: VERM, x: 0, y: 0, w: 1, upper: true, tracking: 0.04, path: { kind: 'spiral', cx: r4(cx), cy: r4(cy), r: r4((R * 0.8) / b.H), start: 0, turns } });
      // the ring: the subtitle repeated all the way round
      const ringR = R * 0.97;
      const ringAdv = estimateWidth('m', 'jetbrains', 500, false, small) + small * 0.22;
      const ringN = Math.floor((2 * Math.PI * ringR) / ringAdv) - 2;
      const unit = `${(b.f.subtitle || ' ').trim()} · `;
      const ring = unit.repeat(Math.max(1, Math.floor(ringN / unit.length)));
      textLayer(b, ring.slice(0, 1200), { name: 'Anillo', field: 'subtitle', font: 'jetbrains', weight: 500, px: small, color: ink, x: 0, y: 0, w: 1, upper: true, tracking: 0.22, path: { kind: 'circle', cx: r4(cx), cy: r4(cy), r: r4((R * 0.97) / b.H), start: 0 } });
      fitted(b, b.f.kicker, { name: 'Antetítulo', field: 'kicker', font: 'jetbrains', weight: 600, color: ink, x: a.x, y: a.y, w: a.w * 0.5, max: small, lines: 1, upper: true, tracking: 0.14 });
      fitted(b, b.f.title, { name: 'Título', field: 'title', font: 'serif', weight: 400, italic: true, color: ink, x: a.x, y: a.y + a.h - t.h, w: a.w * 0.6, max: u * 6, lines: 1, leading: 1 });
      shape(b, 'Punto', 'ellipse', [a.x + a.w - fx(b, u * 2.4), a.y + a.h - fy(b, u * 3.2), fx(b, u * 2.4), fy(b, u * 2.4)], { stroke: null, fill: VERM });
    },
  },

  /* ---------------------------------------------------------------- 8. Swiss grid */
  {
    id: 'suizo', name: 'Retícula suiza', blurb: 'Rejilla estricta, grotesca grande, la foto en su módulo y un cuadro de caracteres.',
    format: { size: 'a3' }, bg: '#f3f0e9',
    fields: { kicker: '01', title: 'Forma y carácter', subtitle: 'Una rejilla de seis columnas ordena la foto, el texto y un módulo de caracteres. Nada se sale de su sitio.', caption: 'Fotografía y caracteres reales compuestos en el estudio de foto y video de GLYPHOS.', labels: [] },
    uses: ['kicker', 'title', 'subtitle', 'caption'],
    build(b) {
      const { u } = b;
      const a = b.area;
      const ink = '#111111';
      const line = Math.max(1, Math.round(u * 0.1 * 10) / 10);
      const cols = b.k > 1.2 ? 12 : 6, rows = b.k > 1.2 ? 6 : 8;
      const g = u * 1.5;
      const cw = (a.w * b.W - (cols - 1) * g) / cols, rh = (a.h * b.H - (rows - 1) * g) / rows;
      const X = (c: number) => a.x + fx(b, c * (cw + g)), Y = (r: number) => a.y + fy(b, r * (rh + g));
      const span = (c0: number, c1: number, r0: number, r1: number): Rect => ({ x: X(c0), y: Y(r0), w: fx(b, (c1 - c0 + 1) * cw + (c1 - c0) * g), h: fy(b, (r1 - r0 + 1) * rh + (r1 - r0) * g) });
      const tSt = { font: INTER, weight: 800, tracking: -0.045, leading: 0.92 };
      if (cols === 6) {
        const T = span(0, 5, 0, 1);
        fitted(b, b.f.title, { ...tSt, name: 'Título', field: 'title', color: ink, x: T.x, y: T.y, w: T.w, max: Math.min(u * 13, T.h * b.H * 0.52), lines: 2 });
        const ph = span(2, 5, 2, 6);
        const P = panelXf(b, ph);
        photo(b, 'Foto', { mask: maskOf([rectPart(P.cut)]), xf: P.xf, adjust: { bright: 0, contrast: 1.1, gamma: 1, sat: 0, hue: 0, temp: 0, blur: 0, sharpen: 0.3, invert: false, mono: true } });
        const tile = span(0, 1, 5, 6);
        const Q = panelXf(b, tile);
        glyphs(b, 'Módulo de caracteres', { charset: 'bloques', color: 'mono', ink, paper: null, invert: true, contrast: 1.4, cell: (u * 1.5) / Q.s, aspect: 1.1 }, { mask: maskOf([rectPart(Q.cut)]), xf: Q.xf });
        const sq = span(0, 0, 2, 2);
        const side = Math.min(sq.w * b.W, sq.h * b.H);
        shape(b, 'Cuadro rojo', 'rect', [sq.x, sq.y, fx(b, side), fy(b, side)], { stroke: null, fill: VERM });
        const ry = Y(7) - fy(b, g / 2);
        shape(b, 'Regla', 'line', [a.x, ry, a.x + a.w, ry], { stroke: ink, width: line });
        const c1 = span(0, 2, 7, 7), c2 = span(3, 5, 7, 7);
        fitted(b, b.f.subtitle, { name: 'Subtítulo', field: 'subtitle', font: INTER, weight: 600, color: ink, x: c1.x, y: c1.y, w: c1.w, max: u * 1.6, min: 8, lines: 4, leading: 1.3 });
        fitted(b, b.f.caption, { name: 'Pie', field: 'caption', font: INTER, weight: 400, color: '#555049', x: c2.x, y: c2.y, w: c2.w, max: u * 1.3, min: 7, lines: 4, leading: 1.4 });
        fitted(b, b.f.kicker, { name: 'Número', field: 'kicker', font: INTER, weight: 300, color: ink, x: X(0), y: Y(3), w: span(0, 1, 3, 3).w, max: Math.min(u * 9, rh * 0.9), lines: 1, tracking: -0.04 });
      } else {
        const ph = span(6, 11, 0, 5);
        const P = panelXf(b, ph);
        photo(b, 'Foto', { mask: maskOf([rectPart(P.cut)]), xf: P.xf, adjust: { bright: 0, contrast: 1.1, gamma: 1, sat: 0, hue: 0, temp: 0, blur: 0, sharpen: 0.3, invert: false, mono: true } });
        const T = span(0, 5, 0, 2);
        fitted(b, b.f.title, { ...tSt, name: 'Título', field: 'title', color: ink, x: T.x, y: T.y, w: T.w, max: Math.min(u * 12, T.h * b.H * 0.5), lines: 2 });
        const tile = span(3, 5, 3, 4);
        const Q = panelXf(b, tile);
        glyphs(b, 'Módulo de caracteres', { charset: 'bloques', color: 'mono', ink, paper: null, invert: true, contrast: 1.4, cell: (u * 1.3) / Q.s, aspect: 1.1 }, { mask: maskOf([rectPart(Q.cut)]), xf: Q.xf });
        const sq = span(0, 0, 3, 3);
        const side = Math.min(sq.w * b.W, sq.h * b.H);
        shape(b, 'Cuadro rojo', 'rect', [sq.x, sq.y, fx(b, side), fy(b, side)], { stroke: null, fill: VERM });
        const ry = Y(5) - fy(b, g / 2);
        shape(b, 'Regla', 'line', [a.x, ry, X(5) + fx(b, cw), ry], { stroke: ink, width: line });
        const c1 = span(0, 2, 5, 5), c2 = span(3, 5, 5, 5);
        fitted(b, b.f.subtitle, { name: 'Subtítulo', field: 'subtitle', font: INTER, weight: 600, color: ink, x: c1.x, y: c1.y, w: c1.w, max: u * 1.5, min: 7, lines: 4, leading: 1.3 });
        fitted(b, b.f.caption, { name: 'Pie', field: 'caption', font: INTER, weight: 400, color: '#555049', x: c2.x, y: c2.y, w: c2.w, max: u * 1.25, min: 7, lines: 4, leading: 1.4 });
        fitted(b, b.f.kicker, { name: 'Número', field: 'kicker', font: INTER, weight: 300, color: ink, x: X(0), y: Y(4), w: span(0, 2, 4, 4).w, max: Math.min(u * 9, rh * 0.9), lines: 1, tracking: -0.04 });
      }
    },
  },

  /* ---------------------------------------------------------------- 9. zine cover */
  {
    id: 'fanzine', name: 'Portada de fanzine', blurb: 'Fotocopia de alto contraste, títulos en tiras negras, cinta, una franja de caracteres y una pegatina.',
    format: { size: 'carta' }, bg: '#e6e1d4',
    fields: { kicker: 'Hecho a mano, impreso a fotocopia', title: 'Ruido\nde fondo', subtitle: 'Fanzine de arte ASCII', caption: '24 pp · tiraje de 100', labels: ['Nº 3'] },
    uses: ['kicker', 'title', 'subtitle', 'caption', 'label0'],
    build(b) {
      const { u } = b;
      const a = b.area;
      const ink = '#141210', paper = '#e6e1d4';
      const panel: Rect = inset(a, 0, fy(b, u * 7), 0, fy(b, u * 6));
      const P = panelXf(b, panel);
      const rot = -1.6;
      const xf = { ...P.xf, rot };
      photo(b, 'Foto fotocopiada', {
        mask: maskOf([rectPart(P.cut)]), xf,
        finishes: [finish('threshold', { level: 0.5, soft: 0.02, mode: 'local', radius: Math.max(3, Math.round((u * 1.1) / P.s)), ink, paper: '#f1ede2', clear: false }), grainStill(b, 0.3)],
      });
      // a torn strip of characters across the photo
      const band: Rect = { x: panel.x, y: panel.y + panel.h * 0.64, w: panel.w, h: panel.h * 0.1 };
      glyphs(b, 'Franja de caracteres', { charset: 'estandar', font: 'courier', weight: 700, color: 'mono', ink, paper: '#f4d23c', invert: true, contrast: 1.4, cell: (u * 0.9) / P.s, aspect: 1.8 }, { mask: maskOf([rectIn(P.xf, band)]), xf });
      // tape at the top corners
      const tw = u * 12, th = u * 3.2;
      for (const [x, deg] of [[panel.x + fx(b, u * 2), -32], [panel.x + panel.w - fx(b, u * 2) - fx(b, tw), 28]] as const) {
        const r: Rect = { x, y: panel.y - fy(b, th * 0.5), w: fx(b, tw), h: fy(b, th) };
        const tape = shape(b, 'Cinta', 'rect', [r.x, r.y, r.w, r.h], { stroke: null, fill: '#f3e7c2', opacity: 0.78 });
        rotateAbout(b, tape, r.x + r.w / 2, r.y + r.h / 2, deg);
      }
      // the title: one black strip per line
      const lines = (b.f.title || ' ').split('\n').slice(0, 3);
      const tSt = { font: 'martian', weight: 800, upper: true, tracking: -0.02, leading: 1 };
      const maxW = a.w * 0.86;
      let px = u * 9;
      for (const ln of lines) px = Math.min(px, fitSize(ln || ' ', tSt, maxW * b.W - u * 3, u * 9, 1, 8, b.measure));
      let y = a.y + fy(b, u * 1);
      const degs = [-3, 2, -1.5];
      lines.forEach((ln, i) => {
        const w = Math.min(maxW * b.W, b.measure(ln.toLocaleUpperCase('es'), 'martian', 800, false, px) * 1.02 + px * 0.04 * ln.length + u * 3);
        const h = px * 1.25;
        const x = a.x + fx(b, i % 2 ? u * 4 : 0);
        const bar = shape(b, `Tira ${i + 1}`, 'rect', [x, y, fx(b, w), fy(b, h)], { stroke: null, fill: ink });
        const tx = textLayer(b, ln, { name: `Título ${i + 1}`, field: i === 0 ? 'title' : `title${i}`, font: 'martian', weight: 800, px, color: paper, x: x + fx(b, u * 1.5), y: y + fy(b, (h - px * 1.0) / 2), w: fx(b, w), upper: true, tracking: -0.02, leading: 1 });
        rotateAbout(b, bar, x + fx(b, w) / 2, y + fy(b, h) / 2, degs[i]);
        rotateAbout(b, tx, x + fx(b, w) / 2, y + fy(b, h) / 2, degs[i]);
        y += fy(b, h * 1.12);
      });
      // the sticker
      const sr = u * 8.5;
      const scx = a.x + a.w - fx(b, sr * 1.05), scy = panel.y + panel.h - fy(b, sr * 0.6);
      const st = shape(b, 'Pegatina', 'ellipse', [scx - fx(b, sr), scy - fy(b, sr), fx(b, 2 * sr), fy(b, 2 * sr)], { stroke: null, fill: VERM });
      rotateAbout(b, st, scx, scy, 12);
      const spx = fitSize(b.f.labels[0] || ' ', { font: 'martian', weight: 800 }, sr * 1.5, sr * 0.75, 1, 8, b.measure);
      const stx = textLayer(b, b.f.labels[0] ?? '', { name: 'Pegatina', field: 'label0', font: 'martian', weight: 800, px: spx, color: paper, x: scx - fx(b, sr), y: scy - fy(b, spx * 0.62), w: fx(b, 2 * sr), align: 'center' });
      rotateAbout(b, stx, scx, scy, 12);
      // foot
      const small = Math.max(8, u * 1.25);
      const fy0 = a.y + a.h - fy(b, small * 1.3);
      fitted(b, b.f.subtitle, { name: 'Subtítulo', field: 'subtitle', font: 'courier', weight: 700, color: ink, x: a.x, y: fy0 - fy(b, small * 1.6), w: a.w * 0.6, max: small * 1.25, min: 7, lines: 1, upper: true, tracking: 0.06 });
      fitted(b, b.f.kicker, { name: 'Antetítulo', field: 'kicker', font: 'courier', weight: 400, color: ink, x: a.x, y: fy0, w: a.w * 0.6, max: small, min: 7, lines: 1 });
      fitted(b, b.f.caption, { name: 'Pie', field: 'caption', font: 'courier', weight: 700, color: ink, x: a.x + a.w * 0.62, y: fy0, w: a.w * 0.38, max: small, min: 7, lines: 1, align: 'right', upper: true });
    },
  },

  /* ---------------------------------------------------------------- 10. vertical story */
  {
    id: 'historia', name: 'Historia vertical', blurb: 'Foto a sangre, caracteres que suben desde abajo y un título grande en la zona segura.',
    format: { size: 'historia' }, bg: INK,
    fields: { kicker: 'Nuevo · 01', title: 'Hecha de caracteres', subtitle: 'Desliza para ver cómo se escribe una foto, letra por letra.', caption: '', labels: ['celda 11 px'] },
    uses: ['kicker', 'title', 'subtitle', 'label0'],
    build(b) {
      const { u } = b;
      const a = b.area;
      photo(b, 'Foto a sangre', { adjust: { bright: -0.04, contrast: 1.06, gamma: 1, sat: 0.9, hue: 0, temp: 0.05, blur: 0, sharpen: 0.2, invert: false, mono: false } });
      // photo above, characters below: a graded zone where the picture turns into text on the dark
      glyphs(b, 'Caracteres que suben', { charset: 'estandar', font: 'jetbrains', weight: 700, color: 'source', paper: INK, cell: Math.max(7, u * 1.05), aspect: 1.85, contrast: 1.4, bright: 0.12, sat: 1.3, cutoff: 0.03 }, {
        mask: maskOf([{ kind: 'gradient', op: 'add', shape: 'linear', x0: 0.5, y0: 0.34, x1: 0.5, y1: 0.7, alpha0: 0, alpha1: 1, alpha: 1, ease: { kind: 'inOut' } }]),
        finishes: [finish('glow', { threshold: 0.35, radius: Math.round(u * 1.6), strength: 0.9, tint: '#ffffff', blend: 'screen' }, 0.75)],
      });
      shape(b, 'Sombra inferior', 'rect', [0, 0, 1, 1], {
        stroke: null, fill: INK,
        mask: maskOf([{ kind: 'gradient', op: 'add', shape: 'linear', x0: 0.5, y0: 0.62, x1: 0.5, y1: 1, alpha0: 0, alpha1: 0.72, alpha: 1, ease: { kind: 'in' } }]),
      });
      const small = Math.max(9, u * 1.4);
      const kW = Math.min(a.w * 0.7, fx(b, b.measure((b.f.kicker || ' ').toLocaleUpperCase('es'), 'jetbrains', 600, false, small) + small * 0.14 * (b.f.kicker.length) + small * 3));
      shape(b, 'Marco del antetítulo', 'rect', [a.x, a.y, kW, fy(b, small * 2.3)], { stroke: BONE, width: Math.max(1, u * 0.15) });
      fitted(b, b.f.kicker, { name: 'Antetítulo', field: 'kicker', font: 'jetbrains', weight: 600, color: BONE, x: a.x + fx(b, small * 1.1), y: a.y + fy(b, small * 0.62), w: kW - fx(b, small * 1.6), max: small, min: 7, lines: 1, upper: true, tracking: 0.14 });
      const tSt = { font: INTER, weight: 800, tracking: -0.035, leading: 0.94 };
      const sub = measureBlock(b, b.f.subtitle, { font: 'jetbrains', weight: 400, w: a.w * 0.9, max: u * 2.1, min: 8, lines: 3, leading: 1.4 });
      const t = measureBlock(b, b.f.title, { ...tSt, w: a.w, max: u * 12, lines: 3 });
      const subY = a.y + a.h - sub.h;
      const tY = subY - fy(b, u * 2) - t.h;
      fitted(b, b.f.title, { ...tSt, name: 'Título', field: 'title', color: BONE, x: a.x, y: tY, w: a.w, max: u * 12, lines: 3 });
      fitted(b, b.f.subtitle, { name: 'Subtítulo', field: 'subtitle', font: 'jetbrains', weight: 400, color: '#cfc7ba', x: a.x, y: subY, w: a.w * 0.9, max: u * 2.1, min: 8, lines: 3, leading: 1.4 });
      const s = b.sbox;
      if (b.f.labels[0]) {
        const ly = clamp(s.y + s.h * 0.35, a.y + fy(b, small * 5), tY - fy(b, u * 8));
        // the box opens to the left of its point: the leader comes from the margin with a short stub
        shape(b, 'Nota', 'callout', [s.x + s.w * 0.62, s.y + s.h * 0.45, a.x + a.w, ly, a.x + a.w - fx(b, u * 1.6), ly], { stroke: BONE, width: Math.max(1, u * 0.14), label: { text: b.f.labels[0], px: small, color: BONE, field: 'label0' } });
      }
    },
  },
];

/* ------------------------------------------------------------------ magazine helpers */

function placeTypewriter(b: B, r: Rect, ink: string) {
  const { u } = b;
  const capPx = Math.max(7, u * 1.0);
  const fig: Rect = { x: r.x, y: r.y, w: r.w, h: r.h - fy(b, capPx * 2.4) };
  const P = panelXf(b, fig);
  // a light photo is typed where it is dark (ink for shadows); a dark one where it is light (the figure out of the dark)
  // (a cut-out: only the subject is typed, on the bare paper)
  const light = !!b.cut || (b.tone ?? 0.5) > 0.42;
  glyphs(b, 'Retrato a máquina', {
    charset: 'estandar2', font: 'plex', weight: 500, color: 'mono', ink, paper: null, invert: light, contrast: light ? 1.3 : 1.45, gamma: light ? 1.05 : 0.9,
    cutoff: light ? 0 : 0.1, cell: (u * 0.78) / P.s, aspect: 1.75,
  }, { source: b.cut ?? b.src, mask: maskOf([rectPart(P.cut)]), xf: P.xf });
  fitted(b, `Fig. 1 — ${b.f.title}`.slice(0, 120), { name: 'Pie de figura', font: 'jetbrains', weight: 400, color: '#5a554e', x: r.x, y: fig.y + fig.h + fy(b, capPx * 0.8), w: r.w, max: capPx, min: 6, lines: 1, italic: false });
}

function textColumn(b: B, r: Rect, ink: string) {
  const { u } = b;
  const deck = fitted(b, b.f.subtitle, { name: 'Entradilla', field: 'subtitle', font: 'serif', weight: 400, color: ink, x: r.x, y: r.y, w: r.w, max: u * 2.5, min: 9, lines: 6, leading: 1.18 });
  const thumbH = Math.min(r.w * b.W * 0.72, r.h * b.H * 0.26);
  const capPx = Math.max(7, u * 0.95);
  const bodyY = r.y + deck.h + fy(b, u * 2);
  const bodyH = r.y + r.h - bodyY - fy(b, thumbH + capPx * 3.2 + u * 2);
  // the body at the size that fills the room it has (never smaller than legible)
  const st = { font: 'plex', weight: 400, leading: 1.55 } as const;
  let px = u * 1.35;
  for (let i = 0; i < 40 && px > 7; i++) {
    const n = wrapLines(b.f.caption || ' ', st, px, r.w * b.W, b.measure).length;
    if (fy(b, blockHeight(px, n, 1.55)) <= bodyH) break;
    px *= 0.96;
  }
  const lines = Math.max(1, Math.floor((bodyH * b.H / px - 0.92 - 0.26) / 1.55) + 1);
  fitted(b, b.f.caption, { name: 'Texto', field: 'caption', font: 'plex', weight: 400, color: '#2c2a27', x: r.x, y: bodyY, w: r.w, max: px, min: 6, lines, leading: 1.55 });
  const ty = r.y + r.h - fy(b, thumbH + capPx * 2.4);
  const tr: Rect = { x: r.x, y: ty, w: r.w, h: fy(b, thumbH) };
  const P = panelXf(b, tr);
  photo(b, 'Foto original', { mask: maskOf([rectPart(P.cut)]), xf: P.xf, adjust: { bright: 0, contrast: 1.05, gamma: 1, sat: 0.85, hue: 0, temp: 0.05, blur: 0, sharpen: 0, invert: false, mono: false } });
  shape(b, 'Marco de la foto', 'rect', [tr.x, tr.y, tr.w, tr.h], { stroke: ink, width: Math.max(1, u * 0.1) });
  fitted(b, b.f.labels[1] ?? '', { name: 'Pie de foto', field: 'label1', font: 'jetbrains', weight: 400, color: '#5a554e', x: r.x, y: ty + tr.h + fy(b, capPx * 0.7), w: r.w, max: capPx, min: 6, lines: 1 });
}

export const posterById = (id: string) => POSTERS.find(p => p.id === id);

/* ------------------------------------------------------------------ building */

/** The fields of a poster: its examples with the person's texts over them. */
export function fieldsFor(def: PosterDef, given: Partial<PosterFields> = {}): PosterFields {
  const f = def.fields;
  const labels = f.labels.map((l, i) => (given.labels && typeof given.labels[i] === 'string' ? given.labels[i] : l));
  return {
    kicker: given.kicker ?? f.kicker, title: given.title ?? f.title, subtitle: given.subtitle ?? f.subtitle, caption: given.caption ?? f.caption, labels,
  };
}

/** Where a subject is assumed to be without a cut-out: an upright oval a little above the middle. */
function defaultSubjectBox(k: number): Rect {
  const w = k >= 1 ? 0.34 : 0.56, h = k >= 1 ? 0.7 : 0.58;
  return { x: 0.5 - w / 2, y: 0.47 - h / 2, w, h };
}

export interface PosterResult { layers: Layer[]; canvas: { w: number; h: number; bg: string }; notes: string[] }

/** The layers of a poster over the given picture (the builder, pure). */
export function buildPoster(def: PosterDef, input: PosterInput, o: PosterOptions = {}): PosterResult {
  const fr = posterFrame(o.format ?? def.format);
  const W = fr.w, H = fr.h;
  const k = W / H;
  // a painted subject mask covers the frame it was made in: on a page of another shape it would not fit the photo
  const subjectFits = !!input.subject && (!input.subjectAspect || Math.abs(input.subjectAspect - k) < 0.01);
  const hasSubject = !!(input.cutout || subjectFits);
  const b: B = {
    W, H, k, portrait: k < 0.95, wide: k > 1.3, u: Math.min(W, H) / 100, fr, print: fr.size.group === 'impresion',
    area: areaOf(fr, fr.size.group === 'impresion' ? 0.05 : 0.02),
    src: input.main.id, cut: input.cutout?.id ?? null, subject: subjectFits ? input.subject ?? null : null,
    sbox: input.subjectBox ?? defaultSubjectBox(k), hasSubject, tone: input.tone ?? null,
    f: fieldsFor(def, o.fields), layers: [], measure: o.measure ?? estimateWidth, notes: [],
  };
  def.build(b);
  if (input.subject && !subjectFits && !input.cutout && POSTER_NEEDS_SUBJECT.has(def.id)) {
    b.notes.push('La máscara del sujeto se hizo para otro tamaño de lienzo: el cartel usa un óvalo en el centro. «Quitar fondo» con «Recorte como capa» da un sujeto que sirve en cualquier tamaño.');
  } else if (!hasSubject && POSTER_NEEDS_SUBJECT.has(def.id)) {
    b.notes.push('Sin recorte, el sujeto se toma de un óvalo en el centro. Usa «Quitar fondo» y vuelve a aplicar el cartel para que sólo el sujeto quede en caracteres.');
  }
  return { layers: b.layers, canvas: { w: W, h: H, bg: def.bg }, notes: b.notes };
}

/** Posters whose look depends on the subject being separated from its background. */
export const POSTER_NEEDS_SUBJECT = new Set(['anotado', 'figura']);

/** What a project offers a poster: its main picture, a cut-out of it and a subject mask. */
export function posterInputOf(p: Project): PosterInput | null {
  const photoL = p.layers.find(l => l.kind === 'photo' && l.source && p.sources.some(s => s.id === l.source && s.kind !== 'cutout')) as PhotoLayer | undefined;
  const main = (photoL && p.sources.find(s => s.id === photoL.source)) ?? p.sources.find(s => s.kind !== 'cutout') ?? null;
  if (!main) return null;
  const cutout = p.sources.find(s => s.kind === 'cutout' && s.cutout?.from === main.id) ?? p.sources.find(s => s.kind === 'cutout') ?? null;
  let subject: MaskPart | null = null;
  for (const l of p.layers) for (const part of l.mask?.parts ?? []) if (part.kind === 'raster' && part.origin === 'subject' && !subject) subject = { ...part, op: 'add' };
  return { main, cutout, subject, subjectAspect: p.canvas.w / p.canvas.h };
}

/** A new project: the poster over a stored photo or video. */
export function posterProject(id: string, ref: MediaRef, o: PosterOptions & { video?: { duration: number; fps?: number; hasAudio?: boolean } } = {}): Project {
  const def = posterById(id) ?? POSTERS[0];
  const src = sourceFromMedia(ref, o.video ?? {});
  const res = buildPoster(def, { main: src }, o);
  const p = newProject({
    name: `${def.name}${o.fields?.title ? ` · ${o.fields.title.split('\n')[0].slice(0, 60)}` : ''}`, w: res.canvas.w, h: res.canvas.h, bg: res.canvas.bg,
    ...(o.video ? { duration: o.video.duration, fps: Math.min(60, o.video.fps ?? 30) } : {}),
  });
  p.sources.push(src);
  p.layers = res.layers;
  p.meta = { origin: ref.kind === 'video' ? 'video' : 'photo', ...(res.notes.length ? { note: res.notes.join(' ') } : {}) };
  // in the form every saved project has (finishes with all their parameters, plain numbers)
  return normalizeProject(p);
}

/**
 * The open project's composition replaced by a poster (one undo step when used through edit()): its
 * sources stay (the poster reads the main picture and its cut-out), its layers and keyframes are replaced,
 * the canvas takes the poster's size. Returns null when the project has no picture.
 */
export function applyPoster(p: Project, id: string, o: PosterOptions & { subjectBox?: Rect | null; tone?: number | null } = {}): { project: Project; notes: string[] } | null {
  const def = posterById(id);
  const input = posterInputOf(p);
  if (!def || !input) return null;
  const res = buildPoster(def, { ...input, ...(o.subjectBox ? { subjectBox: o.subjectBox } : {}), ...(typeof o.tone === 'number' ? { tone: o.tone } : {}) }, o);
  const q = cloneProject(p);
  q.layers = res.layers;
  q.tracks = [];
  q.canvas = { ...q.canvas, w: res.canvas.w, h: res.canvas.h, bg: res.canvas.bg, transparent: false };
  if (res.notes.length) q.meta = { ...q.meta, note: res.notes.join(' ') };
  return { project: normalizeProject(q), notes: res.notes };
}

/** The media a poster's thumbnail needs is the picture's own: nothing else to fetch. */
export const POSTER_COUNT = POSTERS.length;
