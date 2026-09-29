/**
 * GLYPHOS projects: the model of the photo and video studio.
 *
 * A project is a stack of layers over one output frame, with a timeline. Everything the studio shows and
 * everything it exports comes from one pure function, evaluate(project, t) (evaluate.ts), and one renderer,
 * the compositor (compositor.ts): the preview and the exported files cannot disagree.
 *
 * Rules that keep projects durable:
 *   - the original media never changes: layers point to sources, sources point to files in the media store
 *     (content-addressed, see studio/mediaStore.ts) and travel inside the project file;
 *   - positions and sizes are normalised to the output frame (0..1, origin top-left), so a project can be
 *     rendered at any resolution;
 *   - every random choice is seeded (project.seed + layer id + time), so the same project at the same time
 *     gives the same pixels;
 *   - new fields are optional and read by normalizeProject() with defaults; `v` changes only when an old
 *     project needs a migration.
 *
 * Kinds of picture a layer can hold, kept distinct because they export differently:
 *   - 'photo'  the original pixels (with adjustments and finishes);
 *   - 'ascii'  a shader ASCII render of the engine (an existing lab Recipe): light, glow, patterns;
 *   - 'glyphs' real characters on a grid (copyable text, TXT/ANSI/SVG), drawn with a font;
 *   - 'text' / 'shape'  editorial typography and graphics (titles, labels, lines, frames).
 * Dithering, halftone, grain… are finishes (Finish) on any layer, not kinds of layer.
 */
import type { MediaRef, Recipe } from '../engine/recipe';

export const PROJECT_VERSION = 1 as const;
export type Id = string;

export interface Project {
  kind: 'glyphos-project';
  v: typeof PROJECT_VERSION;
  id: Id;
  name: string;
  created: number;
  updated: number;
  /** The output frame. w/h are the final render size in pixels; previews render a scaled copy. */
  canvas: { w: number; h: number; bg: string; transparent: boolean };
  /** A still has duration 0. fps is the render rate of animations and video exports. */
  time: { duration: number; fps: number; loop: boolean };
  /** Seed of every deterministic random choice (flicker, random style picks, fragment scatter…). */
  seed: string;
  sources: Source[];
  /** Bottom to top. */
  layers: Layer[];
  /** Keyframed properties (see Track.path). */
  tracks: Track[];
  meta: ProjectMeta;
}

export interface ProjectMeta {
  origin?: 'photo' | 'video' | 'sequence' | 'lab' | 'blank';
  /** The lab entry it came from, when it came from the lab. */
  labEntry?: Id;
  /** The id the project had in the file it was opened from (opening a file never overwrites a saved project). */
  openedFrom?: Id;
  note?: string;
}

/* ------------------------------------------------------------------ sources */

export type SourceKind = 'image' | 'video' | 'sequence' | 'cutout';

export interface Source {
  id: Id;
  kind: SourceKind;
  name: string;
  /** image/video/cutout: one file; sequence: one file per photo, in order. */
  media: MediaRef[];
  /** Pixel size of the (first) file. */
  w: number;
  h: number;
  /** video: seconds and frame rate of the file; sequence: seconds per photo in `hold`. */
  duration?: number;
  fps?: number;
  hold?: number;
  hasAudio?: boolean;
  /** A cutout is an image with real transparency made from another source (background removal). */
  cutout?: { from: Id; matte: MediaRef; refine?: CutoutRefine };
}

export interface CutoutRefine {
  /** Edge softness (px at source size), contraction(-)/expansion(+) of the edge, and colour decontamination 0..1. */
  feather: number;
  shift: number;
  decontaminate: number;
  /** Hair/fur detail preserved by the matting model 0..1. */
  detail: number;
}

/* ------------------------------------------------------------------ layers */

export type LayerKind = 'photo' | 'ascii' | 'glyphs' | 'text' | 'shape';

/** Canvas 2D composite operations (plus 'add' = 'lighter'). */
export type CompositeBlend =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity' | 'add';

export interface LayerTransform {
  /** Offset of the layer's centre from the frame's centre, in frame units (0.1 = 10 % of the width/height). */
  x: number;
  y: number;
  scale: number;
  /** Degrees. */
  rot: number;
}

export interface LayerBase {
  id: Id;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  /** 0..1 */
  opacity: number;
  blend: CompositeBlend;
  /** Where the layer shows. null = everywhere. */
  mask: Mask | null;
  /** Seconds the layer is on; null = the whole timeline. */
  span: { in: number; out: number } | null;
  xf: LayerTransform;
  /** Applied to the layer's own pixels, in order, before the mask and the blend. */
  finishes: Finish[];
  /** Animation templates placed on this layer (registry: clips.ts; templates: templates.ts and later catalogs). */
  clips: AnimClip[];
  /** Depth for parallax camera moves (0 = on the frame plane). */
  depth?: number;
}

export interface Adjust {
  bright: number;    // -1..1
  contrast: number;  // 0..3 (1 = as is)
  gamma: number;     // 0.2..3
  sat: number;       // 0..3
  hue: number;       // degrees
  temp: number;      // -1..1 (cool..warm)
  blur: number;      // px at output size
  sharpen: number;   // 0..1
  invert: boolean;
  mono: boolean;
}

/** How a source picture is placed in the output frame. */
export type LayerFit = 'cover' | 'contain' | 'fill';

export interface PhotoLayer extends LayerBase {
  kind: 'photo';
  source: Id;
  fit: LayerFit;
  adjust: Adjust;
}

/**
 * Shader ASCII: an engine Recipe drawn over this layer's source. The recipe's own `source` and `media.ref`
 * are ignored: the layer's source feeds it ('below' = the composite of the layers under this one; 'style' =
 * no picture: the recipe's own pattern or big text, as the lab draws it).
 * Its media.fit/zoom/pan/mirror/xform still apply (to the source already placed in the frame with `fit`).
 */
export interface AsciiLayer extends LayerBase {
  kind: 'ascii';
  source: Id | 'below' | 'style';
  style: Recipe;
  /** How the layer's own source is placed in the frame before the engine reads it (default 'cover'). */
  fit?: LayerFit;
  /**
   * false/absent: only the characters (transparent between them), to lay over other layers.
   * true: the recipe's background colour too, and the effects that need it (reveal, bloom, grain, grid):
   * the piece exactly as the lab draws it.
   */
  opaque?: boolean;
}

/** Real characters (copyable): a grid computed on the CPU from the source and drawn with a font. */
export interface GlyphsLayer extends LayerBase {
  kind: 'glyphs';
  source: Id | 'below';
  glyphs: GlyphStyle;
  /** How the layer's own source is placed in the frame (default 'cover'). */
  fit?: LayerFit;
}

export interface GlyphStyle {
  /** A preset id (see glyphs/charsets.ts) or 'custom'. */
  charset: string;
  /** Characters from empty to full when charset is 'custom'; or the user's words when fill is 'words'. */
  chars: string;
  /** 'ramp': each cell picks by brightness; 'words': user text flows over the figure's cells. */
  fill: 'ramp' | 'words';
  font: string;
  weight: number;
  /** Cell width in output px, and height/width. */
  cell: number;
  aspect: number;
  /** Tone before picking: bright −1..1, contrast 0..3 (1 = as is), gamma 0.2..3, sat 0..3 (the studio's ranges). */
  bright: number;
  contrast: number;
  gamma: number;
  sat: number;
  invert: boolean;
  /** Edge emphasis 0..1 (outlines in the figure). */
  edge: number;
  /** Cells below this brightness stay empty (lets the photo or background show) 0..1. */
  cutoff: number;
  color: 'mono' | 'source' | 'palette';
  ink: string;
  /** null = transparent between characters. */
  paper: string | null;
  palette: string[];
  /** Words fill: break anywhere ('char', default) or only between words ('word'). */
  wrap?: 'char' | 'word';
}

export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  /** A font id of the engine catalog (engine/catalog.ts FONTS: 'martian', 'serif'…) or a CSS family name. */
  font: string;
  weight: number;
  /** Size as a fraction of the frame height. */
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  /** Box in frame units: top-left x, y and width (text wraps inside it). */
  box: { x: number; y: number; w: number };
  /** Extra space between letters in em, and line height as a multiple of the size. */
  tracking: number;
  leading: number;
  italic: boolean;
  upper: boolean;
  /**
   * Optional path the text follows (then `box` and `align` are not used): centre in frame units, radius as a
   * fraction of the frame height, start angle in degrees (0 = top, clockwise). 'arc' centres the text on
   * `start`; 'circle' and 'spiral' start there; a spiral closes towards the centre over `turns` turns.
   */
  path?: { kind: 'arc' | 'circle' | 'spiral'; cx: number; cy: number; r: number; start: number; turns?: number };
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'polyline' | 'bracket' | 'crosshair' | 'callout';

export interface ShapeLayer extends LayerBase {
  kind: 'shape';
  shape: ShapeKind;
  /**
   * Frame-unit points: rect/ellipse/bracket/crosshair = [x, y, w, h]; line/polyline/callout = [x0, y0, x1, y1, …]
   * (a callout's first point is what it points at; its label sits at the last point, in a box).
   */
  pts: number[];
  stroke: string | null;
  /** Stroke width and dash lengths in output px (at the project's canvas size). */
  width: number;
  fill: string | null;
  dash: number[] | null;
  /** Small label drawn next to the shape (editorial annotations: «FL33», «PW33»…). */
  label?: { text: string; font: string; size: number; color: string };
}

export type Layer = PhotoLayer | AsciiLayer | GlyphsLayer | TextLayer | ShapeLayer;

/* ------------------------------------------------------------------ masks */

/** Where a layer shows: parts combined in order (add, subtract, intersect), then feather, invert, opacity. */
export interface Mask {
  /** Kept but not applied (the layer shows everywhere) while true: the studio's «Usar máscara» switch. */
  off?: boolean;
  invert: boolean;
  /** Blur of the whole mask edge, in output px. */
  feather: number;
  /** 0..1 */
  opacity: number;
  parts: MaskPart[];
}

export type MaskOp = 'add' | 'subtract' | 'intersect';

export interface MaskShapePart {
  kind: 'rect' | 'ellipse';
  op: MaskOp;
  /** Hidden: kept in the list but not applied (every part kind has it). */
  off?: boolean;
  /** Frame units, top-left + size; rot in degrees around the centre. */
  x: number; y: number; w: number; h: number; rot: number;
  /** Edge softness of this part only (output px). */
  soft: number;
  /** Strength 0..1 (a graded mix of photo and characters). */
  alpha: number;
}

export interface MaskPolygonPart {
  kind: 'polygon';
  op: MaskOp;
  off?: boolean;
  /** Frame units [x0, y0, x1, y1, …]; closed. Freehand lasso is a dense polygon. */
  pts: number[];
  soft: number;
  alpha: number;
}

/** A brush stroke: 'add' reveals the layer, 'subtract' erases it (restores what is under). */
export interface MaskStrokePart {
  kind: 'stroke';
  op: MaskOp;
  off?: boolean;
  /** Frame units [x0, y0, x1, y1, …] and, optionally, per-point pressure 0..1. */
  pts: number[];
  pressure?: number[];
  /** Brush diameter as a fraction of the frame's shorter side; hardness 0..1. */
  size: number;
  hardness: number;
  alpha: number;
}

/**
 * A painted, segmented or matted mask as an 8-bit image (white = shows) stored in the media store.
 * For video, `frames` holds per-time masks (tracking); between two frames the nearest earlier one is used
 * (or interpolated when `interp` is set).
 */
export interface MaskRasterPart {
  kind: 'raster';
  op: MaskOp;
  off?: boolean;
  media: MediaRef;
  frames?: Array<{ t: number; media: MediaRef }>;
  interp?: boolean;
  soft: number;
  alpha: number;
  /** How it was made (for re-editing): 'paint', 'object' (point selection), 'subject', 'background', 'track'. */
  origin?: 'paint' | 'object' | 'subject' | 'background' | 'track';
  /** Point prompts of an object selection, frame units, kept to refine it later. */
  points?: Array<{ x: number; y: number; positive: boolean }>;
}

/** Everything close to a colour of a source (select a sky, a green screen…). */
export interface MaskColorPart {
  kind: 'color';
  op: MaskOp;
  off?: boolean;
  source: Id;
  color: string;
  /** Distance in RGB (0..1) that still counts, and the soft ramp after it. */
  tol: number;
  soft: number;
  alpha: number;
}

/**
 * A graded zone (photo ↔ characters): the strength goes from `alpha0` at (x0, y0) to `alpha1` at (x1, y1).
 * 'linear': along that segment (constant across it; before the start alpha0, past the end alpha1);
 * 'radial': from the centre (x0, y0) out to the circle through (x1, y1) (a circle in pixels whatever the frame's
 * aspect), alpha1 outside it. `ease` shapes the ramp (default linear).
 */
export interface MaskGradientPart {
  kind: 'gradient';
  op: MaskOp;
  shape: 'linear' | 'radial';
  /** Frame units. */
  x0: number; y0: number; x1: number; y1: number;
  /** Strength at the start and at the end, 0..1. */
  alpha0: number;
  alpha1: number;
  ease?: Ease;
  /** Overall strength 0..1 (like every part's). */
  alpha: number;
  off?: boolean;
}

export type MaskPart = MaskShapePart | MaskPolygonPart | MaskStrokePart | MaskRasterPart | MaskColorPart | MaskGradientPart;

/* ------------------------------------------------------------------ finishes */

export type FinishKind =
  | 'dither' | 'halftone' | 'grain' | 'glow' | 'shadow' | 'motionblur' | 'blur' | 'sharpen'
  | 'invert' | 'threshold' | 'posterize' | 'levels' | 'mono' | 'duotone' | 'palette'
  | 'crosshatch' | 'scanlines' | 'chroma' | 'vignette' | 'pixelate' | 'edges' | 'noise';

/** One finish; params are described by the finish's schema (fx/catalog.ts) with defaults and ranges. */
export interface Finish {
  kind: FinishKind;
  on: boolean;
  /** Overall strength 0..1 (a mix with the unfinished pixels). */
  amount: number;
  params: Record<string, number | string | boolean>;
}

/* ------------------------------------------------------------------ time */

/**
 * Easing of a keyframe (applies from this key to the next) or of a clip. 'in'/'out'/'inOut' are the CSS
 * ease-in/ease-out/ease-in-out curves; 'hold' keeps this key's value until the next key; 'step' jumps to the
 * next key's value right after this key; 'bezier' is a CSS cubic-bezier(x1, y1, x2, y2).
 */
export type Ease =
  | { kind: 'linear' | 'in' | 'out' | 'inOut' | 'step' | 'hold' }
  | { kind: 'bezier'; p: [number, number, number, number] };

export interface Key {
  t: number;
  /** Numbers interpolate; strings (colours, charsets, recipe ids) switch at the key. */
  v: number | string | boolean;
  ease: Ease;
}

/**
 * Keyframes of one property of one layer. `path` is a dot path into the layer:
 * 'opacity', 'xf.x', 'mask.feather', 'mask.opacity', 'style.glyph.cell', 'glyphs.cell', 'glyphs.charset',
 * 'finishes.0.amount', 'adjust.contrast'…
 */
export interface Track {
  layer: Id;
  path: string;
  keys: Key[];
}

/**
 * An animation template placed on a layer (registered in clips.ts): «Escritura de terminal», «Foto → ASCII»,
 * «Fragmentar y recomponer»… The template turns (progress, params) into changes of the layer at that time.
 * Before its start a clip holds its first state and after its end its last one (like CSS fill: both), so an
 * entry keeps the layer hidden until it starts and an exit keeps it gone after it ends.
 */
export interface AnimClip {
  id: Id;
  template: string;
  /** Seconds on the project timeline. */
  start: number;
  dur: number;
  params: Record<string, number | string | boolean>;
  /** Play the template backwards (photo→ASCII becomes ASCII→photo). */
  reverse: boolean;
  ease: Ease;
  /** Repeat count within its duration (1 = once); 'pingpong' alternates direction. */
  repeat: number;
  pingpong: boolean;
}
