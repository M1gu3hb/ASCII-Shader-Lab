/**
 * The editable document of «Crea tus GLYPHOS» (/studio/glifos/): a typographic project in progress. It is
 * what the person draws and corrects; the engines never read it. Compiling it (compile.ts) gives a GlyphSet
 * (src/glyphset/set.ts), the derived form the atlas draws, named by content id.
 *
 * Coordinates are font units, y up, baseline at 0, `metrics.upm` units per em (1000 by default), like a
 * font file. Handles are absolute positions. Pure: no DOM.
 */
import { drawableCodePoint, keyCodePoint } from '../glyphset/set';

export const GLYPH_DOC_FORMAT = 1 as const;
export const GLYPH_DOC_KIND = 'glyphos-glifos-doc';

export const DOC_FUTURE = 'Este proyecto de glifos viene de una versión más nueva de GLYPHOS: se abre sólo para mirar y no se sobrescribe. Actualiza el estudio para editarlo.';

/**
 * vacio: nothing drawn. dibujado: drawn or imported by the person. propuesto: the assistant's proposal,
 * waiting for review. aceptado: the person accepted it (a proposal, or their own drawing). bloqueado: never
 * touched by the assistant or by any action on a group (references are locked as soon as they are used).
 */
export type GlyphStatus = 'vacio' | 'dibujado' | 'propuesto' | 'aceptado' | 'bloqueado';
export const GLYPH_STATUSES: GlyphStatus[] = ['vacio', 'dibujado', 'propuesto', 'aceptado', 'bloqueado'];
export const STATUS_NAMES: Record<GlyphStatus, string> = {
  vacio: 'Vacío', dibujado: 'Dibujado', propuesto: 'Propuesto', aceptado: 'Aceptado', bloqueado: 'Bloqueado',
};

export interface Pt { x: number; y: number }

export interface PathNode {
  x: number;
  y: number;
  /** smooth: its handles stay aligned when one moves. */
  smooth?: boolean;
  /** Handle towards the previous node (absolute). Absent: the segment arrives straight. */
  hi?: Pt;
  /** Handle towards the next node (absolute). Absent: the segment leaves straight. */
  ho?: Pt;
}

/** A closed contour fills (non-zero winding; a contour turning the other way cuts a hole); an open one is a guide line until closed. */
export interface Contour { closed: boolean; nodes: PathNode[] }

/** A glyph used inside another (an accent over a letter): drawn from its current shape, moved and scaled. */
export interface ComponentRef {
  of: string;
  dx: number;
  dy: number;
  /** Scale (1 when absent). */
  s?: number;
  /**
   * Placed by anchors (base's anchor 'top' meets the mark's '_top'…) unless the person moved it by hand:
   * then `manual` is true and dx/dy are kept as they are when the base or the mark change.
   */
  manual?: boolean;
}

export interface Anchor { name: string; x: number; y: number }

/** A picture under or in a glyph (an imported PNG), kept as it came: vectorising it never replaces it. */
export interface RasterLayer {
  /** Content id of the image in this browser's storage (and in the project file). */
  img: string;
  /** Crop in image pixels. */
  crop: { x: number; y: number; w: number; h: number };
  /** Where its top-left corner goes (font units) and how many units one pixel takes. */
  x: number;
  y: number;
  s: number;
  /** Alpha (or darkness, for pictures without transparency) above which a pixel is ink, 0..1. */
  threshold: number;
  /** 'transparencia' reads the alpha channel; 'oscuro' reads dark pixels on a light background. */
  read: 'transparencia' | 'oscuro';
  /** guia: shown under the drawing only. glifo: the glyph IS these pixels (until vectorised). */
  use: 'guia' | 'glifo';
  visible: boolean;
}

export type GlyphOrigin = 'manual' | 'asistente' | 'svg' | 'png' | 'vectorizado' | 'fuente' | 'componentes';

export interface Glyph {
  ch: string;
  status: GlyphStatus;
  contours: Contour[];
  components: ComponentRef[];
  anchors: Anchor[];
  /** Advance width (font units). In an ASCII set it follows the cell unless `ownAdv`. */
  adv: number;
  ownAdv?: boolean;
  raster?: RasterLayer;
  origin: GlyphOrigin;
  /** The person changed it after the assistant proposed it: no regeneration replaces it without asking. */
  corrected?: boolean;
  /** The style model (its hash) and the variant the assistant used, to know what «regenerar» would change. */
  gen?: { style: string; variant: number };
  /** ASCII sets: the person's ink value 0..1 for the ramp (absent: measured). */
  ink?: number;
}

export interface Metrics {
  upm: number;
  asc: number;
  desc: number;
  xh: number;
  cap: number;
  /** ASCII sets: the cell's advance (every symbol takes one cell). */
  cell: number;
  /** Default side bearings for new glyphs of a text set. */
  lsb: number;
  rsb: number;
}

export type Terminal = 'recto' | 'redondo' | 'cuna';
export type Corner = 'vivo' | 'redondo';
export type StyleKey = 'weight' | 'contrast' | 'angle' | 'slant' | 'width' | 'terminal' | 'corner' | 'xh' | 'cap' | 'round';

/**
 * The editable style model of the assistant. Every property says where its value comes from: measured on a
 * reference glyph, set by the person, or a default because nothing could estimate it.
 */
export interface StyleModel {
  /** Stem thickness, font units. */
  weight: number;
  /** Thin / thick stroke ratio, 0.15..1 (1 = monoline). */
  contrast: number;
  /** Angle of the pen's thin direction, degrees (0 = horizontal thins, as in most text faces). */
  angle: number;
  /** Slant, degrees (positive leans right). */
  slant: number;
  /** Width factor (1 = the skeletons' own proportions). */
  width: number;
  terminal: Terminal;
  corner: Corner;
  /** x-height and cap height, font units. */
  xh: number;
  cap: number;
  /** Roundness of bowls, 0 (squared) .. 1 (round). */
  round: number;
  source: Record<StyleKey, string>;
}

export interface DocLicense { author: string; copyright: string; license: string }

export interface GlyphDoc {
  kind: typeof GLYPH_DOC_KIND;
  v: number;
  id: string;
  /** +1 on every saved change. */
  rev: number;
  name: string;
  /** texto: an alphabet for words (proportional, kerning). ascii: symbols for cells (fixed width, a ramp). */
  mode: 'texto' | 'ascii';
  created: number;
  updated: number;
  metrics: Metrics;
  glyphs: Record<string, Glyph>;
  /** The board's order: the standard groups the person chose and their own code points. */
  chars: string[];
  /** Kerning pairs "AV" → units. */
  kern: Record<string, number>;
  /** ASCII sets: the ramp from empty to full; manual once the person reorders it. */
  ramp: { order: string[]; manual: boolean };
  style: StyleModel;
  /** Characters the assistant learns from (their glyphs are locked). */
  refs: string[];
  /** Images this document uses (content id → name and size); their bytes live in storage and in the file. */
  images: Record<string, { name: string; w: number; h: number }>;
  license: DocLicense;
  /** Sets compiled from it and used in the lab: revision → content id. */
  published: Array<{ rev: number; set: string; at: number }>;
  /** The person's guides, shared by every glyph: a vertical line at x, or a horizontal one at y (font units). */
  guides: Array<{ axis: 'x' | 'y'; at: number }>;
}

export const DOC_LIMITS = {
  glyphs: 1200,
  contours: 300,
  nodes: 6000,
  components: 8,
  anchors: 12,
  kern: 20_000,
  images: 64,
  name: 60,
  coord: 20_000,
  bytes: 24 * 1024 * 1024,
} as const;

/* ------------------------------------------------------------------ */
/* Character groups of the board                                       */
/* ------------------------------------------------------------------ */

export interface CharGroup { id: string; name: string; chars: string[] }

const range = (a: string, b: string) => Array.from({ length: b.codePointAt(0)! - a.codePointAt(0)! + 1 }, (_, i) => String.fromCodePoint(a.codePointAt(0)! + i));

export const CHAR_GROUPS: CharGroup[] = [
  { id: 'mayusculas', name: 'Mayúsculas', chars: range('A', 'Z') },
  { id: 'minusculas', name: 'Minúsculas', chars: range('a', 'z') },
  { id: 'espanol', name: 'Español', chars: Array.from('ñÑáéíóúÁÉÍÓÚüÜ¿¡') },
  // the pieces accented letters are built from: marks that sit on a base, and i without its dot for í
  { id: 'acentos', name: 'Acentos (piezas)', chars: Array.from('´¨˜ı') },
  { id: 'cifras', name: 'Cifras', chars: range('0', '9') },
  { id: 'espacio', name: 'Espacio', chars: [' '] },
  { id: 'puntuacion', name: 'Puntuación', chars: Array.from('.,:;!?\'"-–—()[]{}/\\«»@#&*+=<>_%$€|~^`') },
];

/** The marks Spanish letters are built from, and how (base, mark, anchor). */
export const MARKS: Record<string, { base: string; mark: string; anchor: 'top' | 'bottom' }> = {
  'á': { base: 'a', mark: '´', anchor: 'top' }, 'é': { base: 'e', mark: '´', anchor: 'top' }, 'í': { base: 'ı', mark: '´', anchor: 'top' },
  'ó': { base: 'o', mark: '´', anchor: 'top' }, 'ú': { base: 'u', mark: '´', anchor: 'top' }, 'ü': { base: 'u', mark: '¨', anchor: 'top' },
  'ñ': { base: 'n', mark: '˜', anchor: 'top' },
  'Á': { base: 'A', mark: '´', anchor: 'top' }, 'É': { base: 'E', mark: '´', anchor: 'top' }, 'Í': { base: 'I', mark: '´', anchor: 'top' },
  'Ó': { base: 'O', mark: '´', anchor: 'top' }, 'Ú': { base: 'U', mark: '´', anchor: 'top' }, 'Ü': { base: 'U', mark: '¨', anchor: 'top' },
  'Ñ': { base: 'N', mark: '˜', anchor: 'top' },
};

export const DEFAULT_ASCII_RAMP = Array.from(' .:-=+*#%@');

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_METRICS: Metrics = { upm: 1000, asc: 800, desc: -200, xh: 500, cap: 700, cell: 600, lsb: 60, rsb: 60 };

export function defaultStyle(m: Metrics = DEFAULT_METRICS): StyleModel {
  const d = 'predeterminado (no estimado)';
  return {
    weight: 90, contrast: 0.8, angle: 0, slant: 0, width: 1, terminal: 'recto', corner: 'vivo', xh: m.xh, cap: m.cap, round: 0.85,
    source: { weight: d, contrast: d, angle: d, slant: d, width: d, terminal: d, corner: d, xh: d, cap: d, round: d },
  };
}

export function newId(): string {
  const r = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint8Array(8)) : Uint8Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
  return 'gl-' + Array.from(r, b => b.toString(16).padStart(2, '0')).join('');
}

export function emptyGlyph(ch: string, doc: Pick<GlyphDoc, 'mode' | 'metrics'>): Glyph {
  const m = doc.metrics;
  const adv = doc.mode === 'ascii' ? m.cell : ch === ' ' ? Math.round(m.upm * 0.28) : Math.round(m.upm * 0.6);
  return { ch, status: 'vacio', contours: [], components: [], anchors: [], adv, origin: 'manual' };
}

export function newDoc(o: { name?: string; mode: 'texto' | 'ascii'; groups?: string[]; now?: number; id?: string }): GlyphDoc {
  const now = o.now ?? Date.now();
  const metrics = { ...DEFAULT_METRICS };
  const groups = o.groups ?? (o.mode === 'ascii' ? [] : ['mayusculas', 'minusculas', 'espanol', 'acentos', 'cifras', 'espacio', 'puntuacion']);
  const chars: string[] = [];
  for (const g of CHAR_GROUPS) if (groups.includes(g.id)) for (const c of g.chars) if (!chars.includes(c)) chars.push(c);
  if (o.mode === 'ascii') for (const c of DEFAULT_ASCII_RAMP) if (!chars.includes(c)) chars.push(c);
  const doc: GlyphDoc = {
    kind: GLYPH_DOC_KIND, v: GLYPH_DOC_FORMAT, id: o.id ?? newId(), rev: 0,
    name: (o.name ?? '').trim().slice(0, DOC_LIMITS.name) || (o.mode === 'ascii' ? 'Mis símbolos' : 'Mi alfabeto'),
    mode: o.mode, created: now, updated: now, metrics, glyphs: {}, chars, kern: {},
    ramp: { order: o.mode === 'ascii' ? [...DEFAULT_ASCII_RAMP] : [], manual: false },
    style: defaultStyle(metrics), refs: [], images: {}, license: { author: '', copyright: '', license: 'Todos los derechos reservados' }, published: [], guides: [],
  };
  for (const c of chars) doc.glyphs[c] = emptyGlyph(c, doc);
  return doc;
}

/** Adds a character to the board (a Unicode code point, typed or as U+XXXX). Returns the character or an error. */
export function parseCodePoint(input: string): { ch: string } | { error: string } {
  const s = input.trim();
  let cp = -1;
  const m = /^(?:U\+|u\+|0x)?([0-9a-fA-F]{2,6})$/.exec(s);
  if (/^(U\+|u\+|0x)/.test(s) && m) cp = parseInt(m[1], 16);
  else if (Array.from(s).length === 1) cp = s.codePointAt(0)!;
  else if (m && s.length >= 4) cp = parseInt(m[1], 16);
  else return { error: 'Escribe un solo carácter o su código (por ejemplo U+00F1).' };
  if (!drawableCodePoint(cp)) return { error: 'Ese código no es un carácter que se pueda dibujar (control, mitad de un par sustituto o no-carácter).' };
  return { ch: String.fromCodePoint(cp) };
}

export const cpLabel = (ch: string) => 'U+' + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');

/* ------------------------------------------------------------------ */
/* Validation of a document read from anywhere                         */
/* ------------------------------------------------------------------ */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown, lo: number, hi: number, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb);
const C = DOC_LIMITS.coord;
const pt = (v: unknown): Pt | undefined => (isObj(v) && typeof v.x === 'number' && typeof v.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: fin(v.x, -C, C, 0), y: fin(v.y, -C, C, 0) } : undefined);

function normContour(v: unknown, budget: { nodes: number }): Contour | null {
  if (!isObj(v) || !Array.isArray(v.nodes)) return null;
  const nodes: PathNode[] = [];
  for (const n of v.nodes) {
    const p = pt(n);
    if (!p) continue;
    if (--budget.nodes < 0) throw new Error(`Un glifo tiene más de ${DOC_LIMITS.nodes} nodos.`);
    const o = n as Record<string, unknown>;
    const node: PathNode = { x: p.x, y: p.y };
    if (o.smooth === true) node.smooth = true;
    const hi = pt(o.hi), ho = pt(o.ho);
    if (hi) node.hi = hi;
    if (ho) node.ho = ho;
    nodes.push(node);
  }
  return nodes.length ? { closed: v.closed === true, nodes } : null;
}

function normGlyph(ch: string, v: unknown, doc: Pick<GlyphDoc, 'mode' | 'metrics'>): Glyph {
  const g = emptyGlyph(ch, doc);
  if (!isObj(v)) return g;
  g.status = (GLYPH_STATUSES as string[]).includes(v.status as string) ? v.status as GlyphStatus : 'vacio';
  const budget = { nodes: DOC_LIMITS.nodes };
  const contours = Array.isArray(v.contours) ? v.contours : [];
  if (contours.length > DOC_LIMITS.contours) throw new Error(`Un glifo tiene más de ${DOC_LIMITS.contours} contornos.`);
  g.contours = contours.map(c => normContour(c, budget)).filter((c): c is Contour => !!c);
  g.components = (Array.isArray(v.components) ? v.components : []).slice(0, DOC_LIMITS.components).flatMap(c => {
    if (!isObj(c) || typeof c.of !== 'string' || keyCodePoint(c.of) < 0 || c.of === ch) return [];
    const out: ComponentRef = { of: c.of, dx: fin(c.dx, -C, C, 0), dy: fin(c.dy, -C, C, 0) };
    if (typeof c.s === 'number' && c.s !== 1) out.s = fin(c.s, 0.05, 20, 1);
    if (c.manual === true) out.manual = true;
    return [out];
  });
  g.anchors = (Array.isArray(v.anchors) ? v.anchors : []).slice(0, DOC_LIMITS.anchors).flatMap(a => {
    const p = pt(a);
    return p && typeof (a as Record<string, unknown>).name === 'string' ? [{ name: String((a as Record<string, unknown>).name).slice(0, 20), ...p }] : [];
  });
  g.adv = fin(v.adv, 0, doc.metrics.upm * 8, g.adv);
  if (v.ownAdv === true) g.ownAdv = true;
  const origins: GlyphOrigin[] = ['manual', 'asistente', 'svg', 'png', 'vectorizado', 'fuente', 'componentes'];
  g.origin = origins.includes(v.origin as GlyphOrigin) ? v.origin as GlyphOrigin : 'manual';
  if (v.corrected === true) g.corrected = true;
  if (isObj(v.gen) && typeof v.gen.style === 'string') g.gen = { style: v.gen.style.slice(0, 40), variant: fin(v.gen.variant, 0, 99, 0) };
  if (typeof v.ink === 'number') g.ink = fin(v.ink, 0, 1, 0);
  if (isObj(v.raster) && typeof v.raster.img === 'string' && /^[0-9a-f]{16}$/.test(v.raster.img)) {
    const r = v.raster, cr = isObj(r.crop) ? r.crop : {};
    g.raster = {
      img: r.img as string,
      crop: { x: fin(cr.x, 0, 1e5, 0), y: fin(cr.y, 0, 1e5, 0), w: fin(cr.w, 1, 1e5, 1), h: fin(cr.h, 1, 1e5, 1) },
      x: fin(r.x, -C, C, 0), y: fin(r.y, -C, C, 0), s: fin(r.s, 0.01, 1000, 1), threshold: fin(r.threshold, 0, 1, 0.5),
      read: r.read === 'oscuro' ? 'oscuro' : 'transparencia', use: r.use === 'glifo' ? 'glifo' : 'guia', visible: r.visible !== false,
    };
  }
  return g;
}

/**
 * Reads a document from storage or a file. Throws a readable error when it is not one, is damaged beyond
 * repair or exceeds the limits; a document from a newer format is returned with `future` so it opens read-only.
 */
export function normalizeDoc(input: unknown): { doc: GlyphDoc; future: boolean } {
  if (!isObj(input) || input.kind !== GLYPH_DOC_KIND) throw new Error('Ese archivo no es un proyecto de glifos de GLYPHOS.');
  if (typeof input.v !== 'number' || input.v < 1) throw new Error('El proyecto de glifos está dañado.');
  const future = input.v > GLYPH_DOC_FORMAT;
  const mode = input.mode === 'ascii' ? 'ascii' : 'texto';
  const mi = isObj(input.metrics) ? input.metrics : {};
  const upm = fin(mi.upm, 16, 16384, 1000);
  const metrics: Metrics = {
    upm, asc: fin(mi.asc, -upm * 4, upm * 4, upm * 0.8), desc: fin(mi.desc, -upm * 4, upm * 4, -upm * 0.2),
    xh: fin(mi.xh, 0, upm * 4, upm / 2), cap: fin(mi.cap, 0, upm * 4, upm * 0.7), cell: fin(mi.cell, 1, upm * 8, upm * 0.6),
    lsb: fin(mi.lsb, -upm, upm, 60), rsb: fin(mi.rsb, -upm, upm, 60),
  };
  const id = typeof input.id === 'string' && /^[a-z0-9-]{1,40}$/.test(input.id) ? input.id : newId();
  const base = { mode, metrics } as Pick<GlyphDoc, 'mode' | 'metrics'>;
  const gIn = isObj(input.glyphs) ? input.glyphs : {};
  const keys = Object.keys(gIn).filter(k => keyCodePoint(k) >= 0);
  if (keys.length > DOC_LIMITS.glyphs) throw new Error(`El proyecto tiene más de ${DOC_LIMITS.glyphs} caracteres.`);
  const glyphs: Record<string, Glyph> = {};
  for (const k of keys) glyphs[k] = normGlyph(k, gIn[k], base);
  const chars: string[] = [];
  for (const c of Array.isArray(input.chars) ? input.chars : []) if (typeof c === 'string' && keyCodePoint(c) >= 0 && !chars.includes(c)) chars.push(c);
  for (const k of keys) if (!chars.includes(k)) chars.push(k);
  for (const c of chars) glyphs[c] ??= emptyGlyph(c, base);
  if (chars.length > DOC_LIMITS.glyphs) throw new Error(`El proyecto tiene más de ${DOC_LIMITS.glyphs} caracteres.`);
  const kern: Record<string, number> = {};
  let nk = 0;
  for (const [p, v] of Object.entries(isObj(input.kern) ? input.kern : {})) {
    if (Array.from(p).length !== 2 || typeof v !== 'number' || !Number.isFinite(v) || !v) continue;
    if (++nk > DOC_LIMITS.kern) break;
    kern[p] = Math.round(fin(v, -upm, upm, 0));
  }
  const rIn = isObj(input.ramp) ? input.ramp : {};
  const ramp = { order: (Array.isArray(rIn.order) ? rIn.order : []).filter((c): c is string => typeof c === 'string' && keyCodePoint(c) >= 0).filter((c, i, a) => a.indexOf(c) === i), manual: rIn.manual === true };
  const sIn = isObj(input.style) ? input.style : {};
  const ds = defaultStyle(metrics);
  const srcIn = isObj(sIn.source) ? sIn.source : {};
  const style: StyleModel = {
    weight: fin(sIn.weight, 4, upm, ds.weight), contrast: fin(sIn.contrast, 0.15, 1, ds.contrast), angle: fin(sIn.angle, -90, 90, ds.angle),
    slant: fin(sIn.slant, -30, 30, ds.slant), width: fin(sIn.width, 0.5, 1.8, ds.width),
    terminal: (['recto', 'redondo', 'cuna'] as Terminal[]).includes(sIn.terminal as Terminal) ? sIn.terminal as Terminal : ds.terminal,
    corner: sIn.corner === 'redondo' ? 'redondo' : 'vivo', xh: fin(sIn.xh, 0, upm * 2, metrics.xh), cap: fin(sIn.cap, 0, upm * 2, metrics.cap),
    round: fin(sIn.round, 0, 1, ds.round),
    source: Object.fromEntries((Object.keys(ds.source) as StyleKey[]).map(k => [k, typeof srcIn[k] === 'string' ? String(srcIn[k]).slice(0, 80) : ds.source[k]])) as Record<StyleKey, string>,
  };
  const images: GlyphDoc['images'] = {};
  for (const [k, v] of Object.entries(isObj(input.images) ? input.images : {}).slice(0, DOC_LIMITS.images)) {
    if (/^[0-9a-f]{16}$/.test(k) && isObj(v)) images[k] = { name: String(v.name ?? '').slice(0, 120), w: fin(v.w, 1, 1e5, 1), h: fin(v.h, 1, 1e5, 1) };
  }
  const lIn = isObj(input.license) ? input.license : {};
  const str = (v: unknown, n: number, fb = '') => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n) : fb);
  const doc: GlyphDoc = {
    kind: GLYPH_DOC_KIND, v: future ? input.v as number : GLYPH_DOC_FORMAT, id, rev: Math.max(0, Math.floor(fin(input.rev, 0, 1e9, 0))),
    name: str(input.name, DOC_LIMITS.name).trim() || 'Sin nombre', mode,
    created: fin(input.created, 0, 1e15, Date.now()), updated: fin(input.updated, 0, 1e15, Date.now()),
    metrics, glyphs, chars, kern, ramp, style,
    refs: (Array.isArray(input.refs) ? input.refs : []).filter((c): c is string => typeof c === 'string' && !!glyphs[c]).slice(0, 12),
    images,
    license: { author: str(lIn.author, 120), copyright: str(lIn.copyright, 200), license: str(lIn.license, 200, 'Todos los derechos reservados') },
    published: (Array.isArray(input.published) ? input.published : []).flatMap(p => (isObj(p) && typeof p.set === 'string' && /^[0-9a-f]{16}$/.test(p.set) ? [{ rev: fin(p.rev, 0, 1e9, 0), set: p.set, at: fin(p.at, 0, 1e15, 0) }] : [])).slice(-50),
    guides: (Array.isArray(input.guides) ? input.guides : []).flatMap(g => (isObj(g) && (g.axis === 'x' || g.axis === 'y') && typeof g.at === 'number' && Number.isFinite(g.at) ? [{ axis: g.axis as 'x' | 'y', at: fin(g.at, -C, C, 0) }] : [])).slice(0, 64),
  };
  return { doc, future };
}

/** The glyphs that draw something (own contours, components or a raster used as the glyph). */
export const hasDrawing = (g: Glyph | undefined) => !!g && (g.contours.some(c => c.closed && c.nodes.length > 1) || g.components.length > 0 || g.raster?.use === 'glifo');

/** What the assistant may replace without asking: empty glyphs and its own pending proposals. */
export const assistantMayReplace = (g: Glyph) => g.status === 'vacio' || (g.status === 'propuesto' && !g.corrected);
