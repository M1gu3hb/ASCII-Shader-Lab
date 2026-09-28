/**
 * Finishes: the photographic and print treatments of the studio (dithering, halftone, grain, glow, motion
 * blur…), applied to a layer's pixels. CONTRACT for the compositor (project/compositor.ts): the signatures
 * below are fixed; lane «fx» fills in the implementation and the catalog.
 *
 * Every finish:
 *   - keeps alpha (cutouts stay cut out; transparent pixels stay transparent unless the finish adds pixels,
 *     like glow or shadow);
 *   - is deterministic for (pixels, finishes, t, seed): grain and noise are seeded, never Math.random();
 *   - measures sizes in OUTPUT pixels and multiplies by ctx.scale, so a preview at half size looks like the
 *     final render at full size.
 *
 * Everything runs on the CPU over ImageData (typed arrays), so the studio works without WebGL 2. Module map:
 *   catalog.ts   names, groups and params (Spanish) of every finish, the dither algorithms
 *   params.ts    validation of params (clamping, options, colours), `when` visibility rules
 *   pipeline.ts  runFinishes on plain RGBA buffers (DOM-free: tests, workers) and the op table
 *   canvas.ts    applyFinishes on canvases with the output-canvas pool and shared scratch memory
 *   dither.ts, palettes.ts, bluenoise.ts, kernels.ts, ops/*.ts   the algorithms
 */
import type { Finish, FinishKind } from '../project/types';
import { CATALOG } from './catalog';
import { applyFinishesCanvas } from './canvas';
import { normalizeFinishWith } from './params';

/**
 * A param of a finish. `when` (optional) lists values of other params for which this one applies, e.g.
 * { color: ['bn', 'tonos'] }: the studio hides it otherwise (see paramVisible).
 */
export type ParamDef = (
  | { key: string; label: string; type: 'range'; min: number; max: number; step: number; def: number; unit?: string; help?: string }
  | { key: string; label: string; type: 'select'; options: Array<[string, string]>; def: string; help?: string }
  | { key: string; label: string; type: 'toggle'; def: boolean; help?: string }
  | { key: string; label: string; type: 'color'; def: string; help?: string }
) & { when?: Record<string, Array<string | boolean>> };

export interface FinishDef {
  kind: FinishKind;
  /** Spanish name and one line of what it does. */
  name: string;
  blurb: string;
  group: 'tramado' | 'tono' | 'luz' | 'movimiento' | 'textura' | 'color';
  params: ParamDef[];
}

export interface FinishContext {
  /** Project time in seconds (animated grain, scanline roll…). */
  t: number;
  /** Seed for deterministic noise. */
  seed: string;
  /** Output px per pixel of the input canvas (1 for the final render, 0.5 for a half-size preview…). */
  scale: number;
  quality: 'preview' | 'final';
}

export type Source2D = HTMLCanvasElement | OffscreenCanvas | ImageBitmap | HTMLImageElement;

/** The catalog shown in the studio (filled by lane «fx»). */
export const FINISHES: FinishDef[] = CATALOG;

export function finishDef(kind: FinishKind): FinishDef | undefined {
  return FINISHES.find(f => f.kind === kind);
}

/** A finish with its defaults. */
export function defaultFinish(kind: FinishKind): Finish {
  const d = finishDef(kind);
  const params: Finish['params'] = {};
  for (const p of d?.params ?? []) params[p.key] = p.def;
  return { kind, on: true, amount: 1, params };
}

/**
 * Applies the finishes that are on, in order, to `input` and returns a canvas of the same size with the
 * result. The returned canvas belongs to the caller until the next call with the same `pool` key.
 * Each finish is mixed with its own input by `amount`; with no active finish the result is a copy.
 * Pooling and memory: see canvas.ts (releaseFinishes frees a key or everything).
 */
export function applyFinishes(input: Source2D, finishes: Finish[], ctx: FinishContext, pool = 'default'): HTMLCanvasElement {
  return applyFinishesCanvas(input, finishes, ctx, pool);
}

/** A Finish read from untrusted input (project files): null for unknown kinds, params validated. */
export function normalizeFinish(input: unknown): Finish | null {
  return normalizeFinishWith(input, finishDef);
}

export { releaseFinishes, finishPoolStats } from './canvas';
export { runFinishes, finishValues, activeFinishes, finishesDependOnTime, finishBleed } from './pipeline';
export { resolveParams, resolveParam, paramVisible } from './params';
export { DITHER_ALGOS, type DitherAlgo } from './catalog';
export { PALETTES, type PalettePreset } from './palettes';
export type { Img as ImageDataLike } from './core';
