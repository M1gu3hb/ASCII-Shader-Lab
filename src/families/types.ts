/**
 * Visual families (familias visuales): pattern kinds with typed parameters, presets and declared
 * capabilities, drawn through the same ASCII pipeline as every other pattern (field → glyph selection →
 * composition). Three execution contracts:
 *
 *  - 'analytic': a field evaluated at any time t (GLSL chunk F_<id> plus a line-by-line CPU port for the
 *    basic engine). Pure function of (p, t, params): repeats exactly, supports «Bucle perfecto».
 *  - 'geometry': a generator that builds a structure (a grammar, a tiling solved under constraints, field
 *    lines) with a construction state that grows step by step and is then drawn, possibly through a camera.
 *  - 'simulation': a model with memory that evolves in fixed steps from a seed (reaction–diffusion, agents,
 *    fluids…). Its state at step n is a function of (seed, version, resolution, params, actions): it is not a
 *    function of t alone, so it never claims a perfect loop.
 *
 * Geometry and simulation families ("raster" families) run in TypeScript on the CPU, the same code for the
 * WebGL 2 and the basic engine, and hand the engines an 8-bit raster of their domain each frame; the field
 * pass samples it at the layer's coordinates. Pure modules: no DOM, so they run in tests and in workers.
 */

export type FamilyKind = 'analytic' | 'geometry' | 'simulation';

/** Library groups the studio shows (the existing pattern families stay as they are). */
export type FamilyGroup = 'vida' | 'fisica' | 'forma' | 'ciencia' | 'materia';

/** How the mechanism is grouped in «Cómo funciona» and the docs (the library groups by use: PresetUse). */
export const FAMILY_GROUP_NAMES: Record<FamilyGroup, string> = {
  vida: 'Vida y química',
  fisica: 'Física y movimiento',
  forma: 'Forma y geometría',
  ciencia: 'Figuras y espacio',
  materia: 'Color, materia y óptica',
};

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

interface ParamBase {
  key: string;
  label: string;
  /** One line that says what the control changes, in product language. */
  hint?: string;
  /** Changing it rebuilds the model from its seed (a new grammar, a new plate) instead of acting live. */
  rebuild?: boolean;
  /** Shown only in the «Más» section of the panel. */
  advanced?: boolean;
}

export interface NumberParam extends ParamBase {
  type: 'number';
  min: number;
  max: number;
  def: number;
  step?: number;
  /** How the value reads (unit, decimals). */
  unit?: string;
  digits?: number;
}

export interface IntParam extends ParamBase {
  type: 'int';
  min: number;
  max: number;
  def: number;
  unit?: string;
}

export interface ChoiceParam extends ParamBase {
  type: 'choice';
  options: ReadonlyArray<{ id: string; label: string }>;
  def: string;
}

export interface BoolParam extends ParamBase {
  type: 'bool';
  def: boolean;
}

export interface TextParam extends ParamBase {
  type: 'text';
  def: string;
  /** Longest accepted text (characters). */
  max: number;
  /** Only these characters are kept (a grammar's alphabet), checked character by character. */
  allowed?: string;
}

export type ParamSpec = NumberParam | IntParam | ChoiceParam | BoolParam | TextParam;

/**
 * How a piece behaves in time (PR #10 review, A-04): what the studio promises and the probes check.
 *  - 'continuo': keeps changing for as long as it runs, with no visible restart (checked over ten minutes at
 *    several seeds and resolutions). It is not periodic: «Bucle perfecto» does not make it loop.
 *  - 'bucle': exactly periodic in state, colour and camera with `period` seconds of layer time.
 *  - 'construccion': a finite process that builds something and then holds it still (or rebuilds after a
 *    designed pause). Said in the panel and the library: it is an experiment to watch, not a background.
 */
export type TimeContract = 'continuo' | 'bucle' | 'construccion';

/**
 * What decides a family's contract: one for all its settings, the value of one parameter, or (when it hangs on
 * several at once: rain and swell, wind and sphere, drift and speed…) a function of all of them.
 */
export type TimeRule = TimeContract | { param: string; values: Record<string, TimeContract>; else: TimeContract } | ((p: Params) => TimeContract);

/**
 * Where a preset is offered in the library (PR #10 review, A-06): by use and look, never by mechanism.
 * `<space>/<section>` with the lab's spaces and sections (src/studio/recipes/catalog.ts):
 *  - fondos/color · fondos/materia · fondos/vivas · fondos/ondas · fondos/organicas · fondos/geometricas · fondos/espacio
 *    (only continuous or exactly looping presets that fill the canvas: never a figure drawn in the middle);
 *  - arte/figuras (3D figures and space: Saturn, the black hole) · arte/organicas · arte/geometricas · arte/curvas · arte/optica;
 *  - terminal/consola · terminal/figuras (only where it reads at terminal sizes);
 *  - tipo/texturas (a texture inside the person's words) · media/efectos (over the person's picture).
 * The same preset can be in several places: one id, several entries.
 */
export type PresetUse =
  | 'fondos/color' | 'fondos/materia' | 'fondos/vivas' | 'fondos/ondas' | 'fondos/organicas' | 'fondos/geometricas' | 'fondos/espacio'
  | 'arte/figuras' | 'arte/organicas' | 'arte/geometricas' | 'arte/curvas' | 'arte/optica'
  | 'terminal/consola' | 'terminal/figuras'
  | 'tipo/texturas' | 'media/efectos';

/** A named starting point that shows a distinct regime of the family (never a recolouring alone). */
export interface FamilyPreset {
  id: string;
  /** A short visual name in Spanish: what it looks like, not the mechanism (that goes in «Cómo funciona»). */
  name: string;
  params: Params;
  /** Where the library offers it (see PresetUse). */
  uses?: PresetUse[];
  /** Other names it is found by (a scientific name, the name it had before): search only, never shown as its name. */
  aka?: string[];
  /** Exactly periodic presets ('bucle'): the period in seconds of layer time. */
  period?: number;
  /** Suggested look: palette stops (dark → light), background, character set and cell size. */
  look?: {
    stops?: string[]; bg?: string; charset?: string; cell?: number; glyphMode?: 'density' | 'lines';
    /** Colour families: 'source' keeps each cell's own colour (default: the palette by brightness). */
    colorMode?: 'source';
    /** How strongly the cells' own colour shows (0..1, see recipe color.vivid). */
    vivid?: number;
  };
  /** Layer transform the preset is designed for. */
  layer?: { scale?: number; speed?: number };
  /** Simulation rows (raster families). */
  res?: number;
}

/** A brush a person can use on the stage with this family (raster families). */
export interface BrushSpec {
  id: string;
  label: string;
  hint: string;
}

export interface FamilyCaps {
  /** «Bucle perfecto» keeps continuity: only analytic families. */
  loop: boolean;
  /** How it behaves in time (see TimeContract): for every setting, or by the value of one parameter. */
  time: TimeRule;
  /** Implementation in the basic engine: the same model ('full'), a lighter faithful port ('reduced'). */
  basic: 'full' | 'reduced';
  /** What 'reduced' leaves out, in product language (shown in basic mode). */
  basicNote?: string;
  /** The state can be captured and restored exactly (snapshot / checkpoint). */
  checkpoint: boolean;
  brushes?: BrushSpec[];
}

/** Explicit budget of a model: what it allocates and costs at most. */
export interface FamilyBudget {
  /** Raster / simulation rows: [min, max, default]. Columns are twice the rows (2:1 domain). */
  res?: [number, number, number];
  /** Fixed simulation steps per second of layer time. */
  rate?: number;
  /** Steps run from the seed before the first frame (the clip's defined warm-up). */
  warmup?: number;
}

/** What the studio and the docs say about where the model comes from. */
export interface FamilySource {
  label: string;
  url: string;
}

/**
 * What the studio says about a family, apart from its spec (meta/<id>.doc.ts): loaded with its panel, the
 * recipe browser or the docs, never with the first view of a page that does not show a family.
 */
export interface FamilyDoc {
  /** One line for the library card. */
  blurb: string;
  /** How it works, two or three sentences. */
  mechanism: string;
  /** How time behaves, in product language (continuous evolution, clip, loop). */
  time: string;
  /** Human-readable limits (agents, nodes, iterations, ray steps, memory). */
  limits: string;
  sources: FamilySource[];
  /** Parameter key → what it does (one line). */
  hints: Record<string, string>;
  /** Preset id → what makes that regime different (one line). */
  presets: Record<string, string>;
}

export interface FamilyMeta {
  /** Pattern id used in recipes (layer.pattern). */
  id: string;
  name: string;
  group: FamilyGroup;
  kind: FamilyKind;
  /** Algorithm version: a recipe made with a newer one is refused, not reinterpreted. */
  version: number;
  params: ParamSpec[];
  presets: FamilyPreset[];
  caps: FamilyCaps;
  budget: FamilyBudget;
  /** Relation to an existing catalog entry, when there is one (an extension, not a duplicate). */
  extends?: string;
  /** Other names the family is found by (the scientific one: «Gray–Scott», «Wave Function Collapse»…). */
  aka?: string[];
  /**
   * Analytic families that draw their own colour per cell (PR #10 review, V-01/V-02/V-04): their chunk defines
   * `vec4 FC_<id>(vec2 p, float t, vec4 k0, vec4 k1)` (rgb, and the luminance that picks the glyph) and may read
   * the piece's palette (uPal[0..5], uPalN); their CPU twin has `cpuColor`. With «Colores de: la familia» the
   * cells keep that colour; with the palette, only the luminance counts, like any pattern.
   */
  color?: boolean;
  /**
   * Drawn around the centre (sized to the width on canvases taller than wide). A function of the layer's
   * settings and scale when some draw a figure and others fill the canvas (a map seen from above, a plate that
   * fills the frame, a tiling seen from so close that its disc overflows it).
   */
  figure?: boolean | ((p: Params, scale: number) => boolean);
  /** Raster families: how the domain repeats outside itself. */
  wrap?: 'repeat' | 'clamp';
  /** The model draws nothing at random: another seed gives the same run (tests then skip that check). */
  seedless?: boolean;
}

/* ------------------------------------------------------------------ */
/* Models (geometry and simulation families)                           */
/* ------------------------------------------------------------------ */

/** A stroke of a brush in domain coordinates: x in [-1, 1], y in [-0.5, 0.5] (y up), radius in the same units. */
export interface Stroke {
  brush: string;
  x0: number; y0: number; x1: number; y1: number;
  r: number;
  /** 0..1 */
  strength: number;
}

export interface ModelConfig {
  seed: string;
  params: Params;
  /** Raster rows; columns are 2 × rows (the domain is 2 × 1 screen heights). */
  res: number;
  /**
   * Algorithm version the recipe was made with (absent: the family's current one). A model whose version went
   * up keeps the earlier path for recipes made with it (tests/unit/families-compat.test.ts).
   */
  v?: number;
}

/** Exact state of a model: typed arrays plus the scalars it needs (RNG state included). */
export interface ModelState {
  /** Family id and algorithm version the state belongs to. */
  id: string;
  v: number;
  steps: number;
  res: number;
  scalars: Record<string, number>;
  arrays: Record<string, Float32Array | Int32Array | Uint8Array | Uint16Array>;
}

export interface FieldModel {
  readonly w: number;
  readonly h: number;
  /** Steps run since the seed (warm-up included). */
  readonly steps: number;
  /** Takes new parameters; structural ones (marked `rebuild`) are handled by the host with a new model. */
  setParams(p: Params): void;
  /** Advances n fixed steps. */
  step(n: number): void;
  /** Writes the raster (w × h, row 0 at the top, 0..255) as the layer shows it at layer time t. */
  render(out: Uint8Array, t: number): void;
  stroke?(s: Stroke): void;
  snapshot(): ModelState;
  restore(s: ModelState): void;
}

export type ModelFactory = (cfg: ModelConfig) => FieldModel;

/** Analytic families: the CPU twin of the GLSL chunk, reading the eight packed parameters. */
export type AnalyticFn = (x: number, y: number, t: number, k: Float32Array) => number;

export interface AnalyticImpl {
  /** GLSL chunk defining `float F_<id>(vec2 p, float t, vec4 k0, vec4 k1)` (colour families: `vec4 FC_<id>`). */
  glsl: string;
  cpu: AnalyticFn;
  /**
   * Optional per-frame CPU work that does not depend on the cell (as basic patterns' prep). `pal`: the palette;
   * `px`: the layer's cell size (the shader's PX), for twins that work per cell. A twin reads its cell size from
   * here, not from a module of its own: in exported code each family script carries its own copy of the engine's
   * modules, and only the engine's knows the size.
   */
  prep?: (t: number, k: Float32Array, pal?: Palette, px?: number) => void;
  /** Colour families: the cell's colour (0..1 rgb) written into out[0..2]; `cpu` gives its luminance. */
  cpuColor?: (x: number, y: number, t: number, k: Float32Array, out: Float64Array) => void;
}

/** The piece's palette as colour families read it: up to six sRGB colours (0..1), dark → light. */
export interface Palette { n: number; rgb: Float32Array }
