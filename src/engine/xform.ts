/**
 * Transformations of the source before it becomes characters (recipe.media.xform): what both engines
 * share. They work on the cell grid: the source is first averaged into one colour per cell (the same four
 * taps the field pass takes), then each transformation reads the previous grid and writes a new one, in
 * order; the field pass reads the last grid instead of the picture or the text. The WebGL passes are in
 * glsl/xform.ts, their CPU twins in basic/xform.ts; the numbers they need are computed here, once.
 * Pure: no DOM.
 */
import { xformK } from './catalog';
import { XFORM_KINDS, type Recipe, type Xform, type XformKind } from './recipe';

/** Stage codes of the transformation pass besides the kinds (0..9, the index in XFORM_KINDS). */
export const XF_MEDIA = -1;
export const XF_TEXT = -2;
/** Estela: the trail is updated, and the stage's input kept for the next frame, in passes of their own. */
export const XF_TRAIL = 20;
export const XF_COPY = 21;

/** One transformation as the engines run it. */
export interface XformStage { kind: XformKind; code: number; amount: number; p: number; k: number }

/** The transformations a recipe applies to a source of this kind: those switched on, in order. */
export function activeXforms(r: Recipe, src: 'pattern' | 'media' | 'text'): Xform[] {
  if (src === 'pattern' || !r.media.xform?.length) return [];
  return r.media.xform.filter(x => x.on && x.amount > 0);
}

/**
 * Stages for a grid of cols × rows cells whose cells are `aspect` times taller than wide. `k` is the
 * number each kind reads besides amount and p (see xformK), and the reach of the ones that move the
 * source (a share of the grid, so the look does not change with the cell size).
 */
export function xformStages(list: Xform[], cols: number, rows: number, aspect: number): XformStage[] {
  const span = Math.min(cols, rows * aspect);
  return list.map(x => {
    let k = xformK(x.kind, x.p);
    if (x.kind === 'desplazar') k = span;
    else if (x.kind === 'canales') k = 1 + span * 0.03;
    else if (x.kind === 'arrastre') k = Math.floor(x.amount * 48 + 0.5);
    return { kind: x.kind, code: XFORM_KINDS.indexOf(x.kind), amount: x.amount, p: x.p, k };
  });
}

/** Whether a stage list needs the pattern's values (Desplazar) or keeps state between frames (Estela). */
export const needsPattern = (s: XformStage[]) => s.some(x => x.kind === 'desplazar');
export const trailStage = (s: XformStage[]) => s.find(x => x.kind === 'estela') ?? null;

/** How much a trail keeps after dt seconds (the same number for both engines). */
export const trailDecay = (dt: number, seconds: number) => Math.exp(-Math.max(0, dt) / Math.max(0.05, seconds));
