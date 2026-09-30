/**
 * Recipe: the complete, serialisable description of a creation.
 * Everything the engine draws comes from a Recipe (plus optional media the user loads locally).
 * Recipes are plain JSON so they can be saved, shared in URLs, diffed and exported.
 */

export const RECIPE_VERSION = 2 as const;

export type SourceKind = 'pattern' | 'image' | 'video' | 'camera' | 'text';
export type BlendMode =
  | 'normal' | 'add' | 'multiply' | 'screen' | 'overlay' | 'difference'
  | 'lighten' | 'darken' | 'mask' | 'cutout' | 'subtract';
export type GlyphMode = 'density' | 'lines' | 'scramble' | 'words';
export type ColorMode = 'ramp' | 'source';
export type ColorMap = 'luma' | 'x' | 'y' | 'radial' | 'angle' | 'noise';
export type InteractMode = 'none' | 'light' | 'ripple' | 'lens' | 'repel' | 'swirl' | 'erase' | 'paint' | 'scramble'
  | 'trail' | 'blossom' | 'rings' | 'sparks' | 'stretch' | 'reveal' | 'zoom' | 'magnet' | 'follow';
/** Which characters a touch leaves (Rastro, Florecer, Anillos, Chispas): dense ones, random ones, or the piece's own. */
export type TouchGlyphs = 'dense' | 'random' | 'piece';
export type MsgMode = 'static' | 'type' | 'decode' | 'marquee' | 'words';

/**
 * Transformations of the source (a picture, a video frame, the camera or the big text) before it becomes
 * characters, applied in order on the cell grid (see engine/xform.ts). Each kind at most once.
 */
export type XformKind = 'semitono' | 'contorno' | 'bandas' | 'arrastre' | 'desplazar' | 'caleido' | 'ondular' | 'estela' | 'canales' | 'bloques';
export interface Xform {
  kind: XformKind;
  on: boolean;
  amount: number;   // 0..1: 0 leaves the source as it is
  p: number;        // 0..1: the kind's own setting (dot size, thickness, inks…)
}

/** Per-letter animation of the big text or of the message (see engine/letters.ts). */
export type LetterAnimKind = 'ola' | 'rebote' | 'latido' | 'revolver' | 'palabras' | 'explosion' | 'brillo' | 'color' | 'orbita' | 'enjambre' | 'cascada';
export interface LetterAnim {
  kind: LetterAnimKind;
  amount: number;   // 0..1 how far letters move (or how many take part)
  speed: number;    // 0.1..3 multiplier
}
export type Fit = 'cover' | 'contain' | 'stretch';
export type DitherKind = 'bayer' | 'noise';
export type Align = 'left' | 'center' | 'right';

export interface Layer {
  on: boolean;
  pattern: string;
  blend: BlendMode;
  mix: number;      // 0..1
  scale: number;    // 0.2..5
  speed: number;    // -3..3 multiplier of global time
  rot: number;      // degrees
  x: number;        // offset (screen heights)
  y: number;
  a: number;        // pattern-specific shape parameter 0..1
  b: number;        // pattern-specific shape parameter 0..1
  invert: boolean;
  phase: number;    // time offset, seconds
}

/**
 * A local image or video a piece was made with. The file never goes into the recipe: it stays in
 * this browser's media store and only travels inside an exported project or session.
 * Share links drop `id` and `name` (file names can be personal) but keep kind and size, so whoever
 * opens the link is told what is missing.
 */
export interface MediaRef {
  /** Content hash of the file (16 hex chars). Absent when the file did not travel with the recipe. */
  id?: string;
  kind: 'image' | 'video';
  name?: string;
  type?: string;     // MIME type
  size?: number;     // bytes
  w: number;         // original pixel size
  h: number;
}

export interface Recipe {
  v: 2;
  source: SourceKind;
  layers: Layer[];
  motion: {
    speed: number;     // global time multiplier
    warp: number;      // domain warp amount
    warpScale: number;
    hold: number;      // 0 = smooth, otherwise frames per second (stop motion)
    loop: number;      // 0 = off, otherwise seconds (crossfade loop)
    pulse: number;     // beat pulse amount
    bpm: number;
  };
  media: {
    fit: Fit;
    zoom: number;
    panX: number;
    panY: number;
    mirror: boolean;
    mix: number;       // amount of pattern layered over the media
    blend: BlendMode;
    reveal: number;    // show the original picture through the ASCII (0..1)
    rate: number;      // video playback rate
    ref?: MediaRef;    // which local file the piece was made with (never the file itself)
    /** Transformations of the source, in order (absent when there are none: older recipes stay as they were). */
    xform?: Xform[];
  };
  text: {
    content: string;
    font: string;
    weight: number;
    size: number;      // 0.1..1.6 relative fit
    tracking: number;  // em
    leading: number;
    align: Align;
    italic: boolean;
    morph: number;     // 0 = off; seconds of a text ⇄ pattern dissolve cycle
    /** Letters that move on their own (absent: still letters). */
    anim?: LetterAnim;
  };
  interact: {
    mode: InteractMode;
    strength: number;
    radius: number;    // fraction of screen height
    auto: boolean;     // wandering ghost pointer when nobody interacts
    /**
     * How long a touch's trace lasts, 0..1 (see engine/touch.ts; absent: 0.5, which is what Pincel and
     * Borrador always did). The three optional keys are absent until someone sets them: older recipes
     * stay as they were.
     */
    decay?: number;
    /** How much of the palette's brightest colour what you touch takes, 0..1 (absent: 0.6). */
    ink?: number;
    /** Which characters a touch leaves (absent: 'dense'). */
    glyphs?: TouchGlyphs;
  };
  glyph: {
    cell: number;      // css px
    aspect: number;    // cell height / width
    charset: string;
    sort: boolean;
    font: string;
    weight: number;
    scale: number;     // glyph size inside the cell
    mode: GlyphMode;
    words: string;
    edge: number;      // 0..1 contour strength
    dither: number;
    ditherKind: DitherKind;
    jitter: number;    // animation rate for scramble / words
  };
  tone: {
    bright: number;
    contrast: number;
    gamma: number;
    invert: boolean;
    levels: number;    // 0 = continuous, else posterise bands
  };
  color: {
    mode: ColorMode;
    stops: string[];   // 1..6 hex colours, dark → light
    bg: string;
    map: ColorMap;
    shift: number;
    cycle: number;
    hue: number;       // 0..1 rotation
    sat: number;
    vivid: number;
    shade: number;     // how much glyph colour follows luminance
  };
  fx: {
    glow: number;
    bloom: number;
    scan: number;
    vig: number;
    curve: number;
    chroma: number;
    grain: number;
    flicker: number;
    cellBg: number;
    grid: number;
  };
  msg: {
    on: boolean;
    text: string;
    mode: MsgMode;
    speed: number;     // characters per second
    x: number;         // 0..1 anchor
    y: number;
    align: Align;
    color: string;     // '' = follow palette
    box: number;       // plate behind the message 0..1
    cursor: boolean;
    hold: number;      // seconds
    /** Letters of the message that move or change colour (absent: still letters). */
    anim?: LetterAnim;
  };
  meta: {
    name?: string;
    seed?: string;
    arch?: string;
    space?: string;
    gen?: number;
  };
}

export const DEFAULT_LAYER: Layer = {
  on: true, pattern: 'nube', blend: 'normal', mix: 1, scale: 1, speed: 1, rot: 0,
  x: 0, y: 0, a: 0.5, b: 0.5, invert: false, phase: 0,
};

export const CHARSET_DEFAULT = ' .:-=+*#%@';

export function defaultRecipe(): Recipe {
  return {
    v: RECIPE_VERSION,
    source: 'pattern',
    layers: [{ ...DEFAULT_LAYER }],
    motion: { speed: 1, warp: 0, warpScale: 1, hold: 0, loop: 0, pulse: 0, bpm: 110 },
    media: { fit: 'cover', zoom: 1, panX: 0, panY: 0, mirror: false, mix: 0, blend: 'multiply', reveal: 0, rate: 1 },
    text: { content: 'GLYPHOS', font: 'martian', weight: 800, size: 1, tracking: 0, leading: 1, align: 'center', italic: false, morph: 0 },
    interact: { mode: 'light', strength: 0.4, radius: 0.18, auto: false },
    glyph: {
      cell: 10, aspect: 1.4, charset: CHARSET_DEFAULT, sort: true, font: 'jetbrains', weight: 500, scale: 1,
      mode: 'density', words: 'TEJE LUZ CON CARACTERES ', edge: 0, dither: 0, ditherKind: 'bayer', jitter: 0.5,
    },
    tone: { bright: 0, contrast: 1, gamma: 1, invert: false, levels: 0 },
    color: {
      mode: 'ramp', stops: ['#1a1410', '#ede6da'], bg: '#0b0a09', map: 'luma', shift: 0, cycle: 0,
      hue: 0, sat: 1, vivid: 0.5, shade: 0,
    },
    fx: { glow: 0, bloom: 0, scan: 0, vig: 0, curve: 0, chroma: 0, grain: 0, flicker: 0, cellBg: 0, grid: 0 },
    msg: {
      on: false, text: 'hola, mundo', mode: 'type', speed: 14, x: 0.5, y: 0.5, align: 'center',
      color: '', box: 0.85, cursor: true, hold: 2.5,
    },
    meta: {},
  };
}

/* ------------------------------------------------------------------ */
/* Validation / normalisation: anything imported goes through here.    */
/* ------------------------------------------------------------------ */

const SOURCES: SourceKind[] = ['pattern', 'image', 'video', 'camera', 'text'];
export const BLENDS: BlendMode[] = ['normal', 'add', 'multiply', 'screen', 'overlay', 'difference', 'lighten', 'darken', 'mask', 'cutout', 'subtract'];
const GLYPH_MODES: GlyphMode[] = ['density', 'lines', 'scramble', 'words'];
const COLOR_MODES: ColorMode[] = ['ramp', 'source'];
const COLOR_MAPS: ColorMap[] = ['luma', 'x', 'y', 'radial', 'angle', 'noise'];
/** Every pointer mode, in the order the engines index them (glsl/programs.ts, basic/field.ts). */
export const INTERACT: InteractMode[] = ['none', 'light', 'ripple', 'lens', 'repel', 'swirl', 'erase', 'paint', 'scramble',
  'trail', 'blossom', 'rings', 'sparks', 'stretch', 'reveal', 'zoom', 'magnet', 'follow'];
const TOUCH_GLYPHS: TouchGlyphs[] = ['dense', 'random', 'piece'];
const MSG_MODES: MsgMode[] = ['static', 'type', 'decode', 'marquee', 'words'];
/** Every transformation, in the order the engines index them (glsl/xform.ts, basic/xform.ts). */
export const XFORM_KINDS: XformKind[] = ['semitono', 'contorno', 'bandas', 'arrastre', 'desplazar', 'caleido', 'ondular', 'estela', 'canales', 'bloques'];
/** A source takes up to this many transformations. */
export const XFORM_MAX = 4;
/** Per-letter animations of the big text and of the message. */
export const TEXT_ANIMS: LetterAnimKind[] = ['ola', 'rebote', 'latido', 'revolver', 'palabras', 'explosion', 'brillo', 'orbita', 'enjambre', 'cascada'];
export const MSG_ANIMS: LetterAnimKind[] = ['ola', 'rebote', 'revolver', 'explosion', 'color', 'orbita', 'enjambre', 'cascada'];
const FITS: Fit[] = ['cover', 'contain', 'stretch'];
const ALIGNS: Align[] = ['left', 'center', 'right'];

const HEX = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

export function normHex(v: unknown, fb: string): string {
  if (typeof v !== 'string') return fb;
  const s = v.trim();
  if (HEX.test(s)) return s.toLowerCase();
  if (HEX3.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  return fb;
}

function num(v: unknown, fb: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return fb;
  return Math.min(max, Math.max(min, n));
}
function bool(v: unknown, fb: boolean): boolean { return typeof v === 'boolean' ? v : fb; }
function oneOf<T extends string>(v: unknown, list: readonly T[], fb: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fb;
}
function str(v: unknown, fb: string, max = 4000): string {
  return typeof v === 'string' ? v.slice(0, max) : fb;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const MEDIA_ID = /^[0-9a-f]{16}$/;

/** Validates a media reference. Keys come out in a fixed order so recipe comparisons stay stable. */
export function normMediaRef(v: unknown): MediaRef | undefined {
  const o = obj(v);
  if (o.kind !== 'image' && o.kind !== 'video') return undefined;
  const size = typeof o.size === 'number' && Number.isFinite(o.size) && o.size >= 0 ? Math.round(o.size) : undefined;
  return {
    ...(typeof o.id === 'string' && MEDIA_ID.test(o.id) ? { id: o.id } : {}),
    kind: o.kind,
    ...(typeof o.name === 'string' && o.name.trim() ? { name: o.name.slice(0, 200) } : {}),
    ...(typeof o.type === 'string' && o.type ? { type: o.type.slice(0, 100) } : {}),
    ...(size !== undefined ? { size } : {}),
    w: Math.round(num(o.w, 0, 0, 100000)),
    h: Math.round(num(o.h, 0, 0, 100000)),
  };
}

/** Validates a transformation list: known kinds, each once, at most XFORM_MAX, in their order. */
export function normXforms(v: unknown): Xform[] {
  if (!Array.isArray(v)) return [];
  const out: Xform[] = [];
  for (const x of v) {
    const o = obj(x);
    if (!(XFORM_KINDS as string[]).includes(o.kind as string) || out.some(y => y.kind === o.kind)) continue;
    out.push({ kind: o.kind as XformKind, on: bool(o.on, true), amount: num(o.amount, 0.6, 0, 1), p: num(o.p, 0.5, 0, 1) });
    if (out.length >= XFORM_MAX) break;
  }
  return out;
}

/**
 * Validates the pointer settings. The optional keys (decay, ink, glyphs) come out only when given, after
 * the four that are always there and always in this order: an edited recipe and its normalised copy
 * compare equal (the studio writes them through this too).
 */
export function normInteract(v: unknown): Recipe['interact'] {
  const it = obj(v), d = defaultRecipe().interact;
  const given = (x: unknown) => typeof x === 'number' || (typeof x === 'string' && x.trim() !== '');
  return {
    mode: oneOf(it.mode, INTERACT, d.mode),
    strength: num(it.strength, d.strength, 0, 1),
    radius: num(it.radius, d.radius, 0.02, 0.8),
    auto: bool(it.auto, false),
    ...(given(it.decay) ? { decay: num(it.decay, 0.5, 0, 1) } : {}),
    ...(given(it.ink) ? { ink: num(it.ink, 0.6, 0, 1) } : {}),
    ...((TOUCH_GLYPHS as string[]).includes(it.glyphs as string) ? { glyphs: it.glyphs as TouchGlyphs } : {}),
  };
}

/** Validates a per-letter animation among the kinds its target has (undefined: none). */
export function normAnim(v: unknown, kinds: readonly LetterAnimKind[]): LetterAnim | undefined {
  const o = obj(v);
  if (!(kinds as readonly string[]).includes(o.kind as string)) return undefined;
  return { kind: o.kind as LetterAnimKind, amount: num(o.amount, 0.5, 0, 1), speed: num(o.speed, 1, 0.1, 3) };
}

export function normLayer(v: unknown, knownPatterns?: Set<string>): Layer {
  const o = obj(v), d = DEFAULT_LAYER;
  let pattern = str(o.pattern, d.pattern, 40);
  if (knownPatterns && !knownPatterns.has(pattern)) pattern = d.pattern;
  return {
    on: bool(o.on, true),
    pattern,
    blend: oneOf(o.blend, BLENDS, 'normal'),
    mix: num(o.mix, 1, 0, 1),
    scale: num(o.scale, 1, 0.05, 8),
    speed: num(o.speed, 1, -4, 4),
    rot: num(o.rot, 0, -360, 360),
    x: num(o.x, 0, -2, 2),
    y: num(o.y, 0, -2, 2),
    a: num(o.a, 0.5, 0, 1),
    b: num(o.b, 0.5, 0, 1),
    invert: bool(o.invert, false),
    phase: num(o.phase, 0, 0, 1000),
  };
}

/** Sanitises any unknown value into a valid Recipe. Never throws. */
export function normalizeRecipe(input: unknown, knownPatterns?: Set<string>): Recipe {
  const d = defaultRecipe();
  const o = obj(input);
  const m = obj(o.motion), me = obj(o.media), tx = obj(o.text), it = obj(o.interact);
  const g = obj(o.glyph), to = obj(o.tone), c = obj(o.color), fx = obj(o.fx), ms = obj(o.msg), meta = obj(o.meta);
  const layersIn = Array.isArray(o.layers) ? o.layers.slice(0, 4) : [];
  const layers = layersIn.length ? layersIn.map(l => normLayer(l, knownPatterns)) : d.layers;
  const stopsIn = Array.isArray(c.stops) ? c.stops.slice(0, 6) : [];
  const stops = stopsIn.map(s => normHex(s, '')).filter(Boolean);
  const ref = normMediaRef(me.ref);
  const xform = normXforms(me.xform);
  const textAnim = normAnim(tx.anim, TEXT_ANIMS), msgAnim = normAnim(ms.anim, MSG_ANIMS);
  const r: Recipe = {
    v: RECIPE_VERSION,
    source: oneOf(o.source, SOURCES, d.source),
    layers,
    motion: {
      speed: num(m.speed, d.motion.speed, 0, 4),
      warp: num(m.warp, d.motion.warp, 0, 2),
      warpScale: num(m.warpScale, d.motion.warpScale, 0.1, 4),
      hold: num(m.hold, d.motion.hold, 0, 30),
      loop: num(m.loop, d.motion.loop, 0, 60),
      pulse: num(m.pulse, d.motion.pulse, 0, 1),
      bpm: num(m.bpm, d.motion.bpm, 30, 200),
    },
    media: {
      fit: oneOf(me.fit, FITS, d.media.fit),
      zoom: num(me.zoom, d.media.zoom, 0.25, 8),
      panX: num(me.panX, 0, -1, 1),
      panY: num(me.panY, 0, -1, 1),
      mirror: bool(me.mirror, false),
      mix: num(me.mix, d.media.mix, 0, 1),
      blend: oneOf(me.blend, BLENDS, d.media.blend),
      reveal: num(me.reveal, 0, 0, 1),
      rate: num(me.rate, 1, 0.1, 4),
      ...(ref ? { ref } : {}),
      // (after ref, where an edit appends it: an edited recipe and its normalised copy keep one key order)
      ...(xform.length ? { xform } : {}),
    },
    text: {
      content: str(tx.content, d.text.content, 600),
      font: str(tx.font, d.text.font, 40),
      weight: num(tx.weight, d.text.weight, 100, 900),
      size: num(tx.size, d.text.size, 0.05, 2),
      tracking: num(tx.tracking, 0, -0.3, 1),
      leading: num(tx.leading, 1, 0.6, 2.5),
      align: oneOf(tx.align, ALIGNS, 'center'),
      italic: bool(tx.italic, false),
      morph: num(tx.morph, 0, 0, 60),
      ...(textAnim ? { anim: textAnim } : {}),
    },
    interact: normInteract(it),
    glyph: {
      cell: num(g.cell, d.glyph.cell, 3, 96),
      aspect: num(g.aspect, d.glyph.aspect, 0.5, 3),
      charset: str(g.charset, d.glyph.charset, 400) || d.glyph.charset,
      sort: bool(g.sort, true),
      font: str(g.font, d.glyph.font, 40),
      weight: num(g.weight, d.glyph.weight, 100, 900),
      scale: num(g.scale, 1, 0.2, 2),
      mode: oneOf(g.mode, GLYPH_MODES, 'density'),
      words: str(g.words, d.glyph.words, 2000),
      edge: num(g.edge, 0, 0, 1),
      dither: num(g.dither, 0, 0, 1),
      ditherKind: oneOf(g.ditherKind, ['bayer', 'noise'] as const, 'bayer'),
      jitter: num(g.jitter, 0.5, 0, 1),
    },
    tone: {
      bright: num(to.bright, 0, -1, 1),
      contrast: num(to.contrast, 1, 0, 4),
      gamma: num(to.gamma, 1, 0.1, 4),
      invert: bool(to.invert, false),
      levels: Math.round(num(to.levels, 0, 0, 16)),
    },
    color: {
      mode: oneOf(c.mode, COLOR_MODES, 'ramp'),
      stops: stops.length ? stops : d.color.stops,
      bg: normHex(c.bg, d.color.bg),
      map: oneOf(c.map, COLOR_MAPS, 'luma'),
      shift: num(c.shift, 0, -2, 2),
      cycle: num(c.cycle, 0, -1, 1),
      hue: num(c.hue, 0, 0, 1),
      sat: num(c.sat, 1, 0, 2),
      vivid: num(c.vivid, 0.5, 0, 1),
      shade: num(c.shade, 0, 0, 1),
    },
    fx: {
      glow: num(fx.glow, 0, 0, 2), bloom: num(fx.bloom, 0, 0, 2), scan: num(fx.scan, 0, 0, 1),
      vig: num(fx.vig, 0, 0, 1), curve: num(fx.curve, 0, 0, 1), chroma: num(fx.chroma, 0, 0, 1),
      grain: num(fx.grain, 0, 0, 1), flicker: num(fx.flicker, 0, 0, 1), cellBg: num(fx.cellBg, 0, 0, 1),
      grid: num(fx.grid, 0, 0, 1),
    },
    msg: {
      on: bool(ms.on, false),
      text: str(ms.text, d.msg.text, 1200),
      mode: oneOf(ms.mode, MSG_MODES, d.msg.mode),
      speed: num(ms.speed, d.msg.speed, 1, 120),
      x: num(ms.x, 0.5, 0, 1),
      y: num(ms.y, 0.5, 0, 1),
      align: oneOf(ms.align, ALIGNS, 'center'),
      color: ms.color === '' ? '' : normHex(ms.color, ''),
      box: num(ms.box, d.msg.box, 0, 1),
      cursor: bool(ms.cursor, true),
      hold: num(ms.hold, d.msg.hold, 0, 30),
      ...(msgAnim ? { anim: msgAnim } : {}),
    },
    meta: {
      name: typeof meta.name === 'string' ? meta.name.slice(0, 80) : undefined,
      seed: typeof meta.seed === 'string' ? meta.seed.slice(0, 80) : undefined,
      arch: typeof meta.arch === 'string' ? meta.arch.slice(0, 40) : undefined,
      space: typeof meta.space === 'string' ? meta.space.slice(0, 40) : undefined,
      gen: typeof meta.gen === 'number' ? meta.gen : undefined,
    },
  };
  return r;
}

export function cloneRecipe(r: Recipe): Recipe {
  return JSON.parse(JSON.stringify(r)) as Recipe;
}

/** Recipe without volatile metadata, for comparisons. */
export function recipeBody(r: Recipe): Omit<Recipe, 'meta'> {
  const { meta: _meta, ...rest } = r;
  return rest;
}

export function sameRecipe(a: Recipe, b: Recipe): boolean {
  return JSON.stringify(recipeBody(a)) === JSON.stringify(recipeBody(b));
}

/* ------------------------------------------------------------------ */
/* Migration from the original single-file lab (flat JSON settings).   */
/* ------------------------------------------------------------------ */

const V1_PATTERNS = ['nube', 'ondas', 'plasma', 'anillos', 'espiral', 'tunel', 'celulas', 'lluvia', 'lava', 'degradado',
  'tablero', 'rayos', 'interferencia', 'estrellas', 'fuego', 'cuadros'];
const V1_BLENDS: BlendMode[] = ['normal', 'add', 'multiply', 'difference', 'lighten', 'darken', 'screen', 'overlay'];
const V1_FONTS: Record<string, string> = { mono: 'system', jetbrains: 'jetbrains', plex: 'plex', space: 'space', fira: 'fira', vt: 'vt', courier: 'courier' };

export function isV1Settings(o: unknown): boolean {
  const x = obj(o);
  return 'patA' in x && 'charset' in x && !('v' in x);
}

/** Converts the flat settings object exported by the original "ASCII Shader Lab.html". */
export function migrateV1(input: unknown): Recipe {
  const o = obj(input);
  const r = defaultRecipe();
  const n = (k: string, fb: number) => (typeof o[k] === 'number' ? (o[k] as number) : fb);
  const b = (k: string, fb: boolean) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : fb);
  const s = (k: string, fb: string) => (typeof o[k] === 'string' ? (o[k] as string) : fb);
  const src = s('source', 'pattern');
  r.source = (SOURCES as string[]).includes(src) ? (src as SourceKind) : 'pattern';
  const scale = n('scale', 1), rot = n('rot', 0);
  r.layers = [{ ...DEFAULT_LAYER, pattern: V1_PATTERNS[n('patA', 0)] ?? 'nube', scale, rot }];
  const pb = n('patB', -1);
  if (pb >= 0) {
    r.layers.push({
      ...DEFAULT_LAYER, pattern: V1_PATTERNS[pb] ?? 'plasma', blend: V1_BLENDS[n('blend', 0)] ?? 'normal',
      mix: n('mix', 0.5), scale: scale * n('scaleB', 1), speed: n('speedB', 1), rot,
    });
  }
  r.motion.speed = n('speed', 1);
  r.motion.warp = n('warp', 0);
  r.interact = { mode: n('mouse', 0.4) > 0 ? 'light' : 'none', strength: n('mouse', 0.4), radius: 0.18, auto: false };
  r.media = {
    ...r.media, fit: (['cover', 'contain', 'stretch'] as Fit[])[n('fit', 0)] ?? 'cover', zoom: n('zoom', 1),
    panX: n('panX', 0), panY: n('panY', 0), mirror: b('mirror', false), mix: n('mediaMix', 0),
    blend: V1_BLENDS[n('mediaBlend', 2)] ?? 'multiply',
  };
  r.text.content = s('text', r.text.content);
  r.text.size = n('textSize', 1);
  r.text.font = 'sans';
  r.text.weight = 900;
  r.glyph = {
    ...r.glyph, cell: n('cell', 10), aspect: n('aspect', 1.4), charset: s('charset', CHARSET_DEFAULT),
    sort: b('sortDensity', true), font: V1_FONTS[s('font', 'mono')] ?? 'system', weight: n('weight', 500),
    scale: n('glyph', 1), dither: n('dither', 0), edge: n('edge', 0),
  };
  r.tone = { bright: n('bright', 0), contrast: n('contrast', 1), gamma: n('gamma', 1), invert: b('invert', false), levels: 0 };
  const mode = n('colorMode', 0);
  const colA = normHex(o.colA, '#ffffff'), colB = normHex(o.colB, '#14142a');
  r.color = {
    ...r.color, bg: normHex(o.bg, '#05060a'), hue: n('hue', 0), sat: n('sat', 1), vivid: n('vivid', 0.5),
    cycle: n('cycle', 0) * 3,
    mode: mode === 3 ? 'source' : 'ramp',
    stops: mode === 0 ? [colA] : mode === 1 ? [colB, colA] : cosineStops(n('hue', 0)),
    shade: mode === 0 ? 0 : 0,
  };
  if (mode === 2) r.color.hue = 0;
  r.fx = { ...r.fx, cellBg: n('cellBg', 0), glow: n('glow', 0), scan: n('scan', 0), vig: n('vig', 0) };
  r.meta = { name: 'Importado del laboratorio original' };
  return normalizeRecipe(r);
}

/** The original "Paleta" mode was a cosine palette; bake five stops of it. */
function cosineStops(hue: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const l = i / 4;
    const ch = [0, 0.33, 0.67].map(o => 0.5 + 0.5 * Math.cos(6.28318 * (o + l * 0.85 + hue)));
    out.push('#' + ch.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join(''));
  }
  return out;
}
