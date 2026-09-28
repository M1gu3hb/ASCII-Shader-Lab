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
 *
 * Cost (lab numbers, not a promise: 4 shared vCPUs Xeon 2.1 GHz, Node 22, load average 5–7 from other
 * work; each finish alone in its own process, best of 5, default params, 1080×1350 final / 540×675
 * preview at scale 0.5, in ms of CPU):
 *   levels 6/1 · invert 5/1 · posterize 10/2 · scanlines 12/4 · vignette 21/7 · duotone 25/6 · mono 27/6
 *   threshold 31/4 · pixelate 31/10 · palette 34/8 · dither 41/19 · noise 51/16 · chroma 71/38
 *   edges 76/16 · shadow 78/25 · blur 83/61 · sharpen 89/40 · grain 90/34 · glow 99/41 · halftone 106/31
 *   crosshatch 125/55 · motionblur 177/67 · zoom 302/92 · spin 324/92 · halftone CMYK 372/132
 *   dither at pixel 1, 1 bit: ordered/noise 47–57, error diffusion 56–80 (Floyd 57, Atkinson 61,
 *   Jarvis 80, Stucki 75, Riemersma 73); PICO-8: Floyd 65, Jarvis 107, Stucki 103, Bayer 8 32.
 * In the browser (Chromium, dev/fx.html «Medir tiempos») add the canvas round trip of applyFinishes —
 * drawImage + getImageData + putImageData, ~70 ms at 1080×1350 here with WebGL on SwiftShader, ~17 ms at
 * 540×675 — and expect run-to-run noise when the machine is busy. finishWeight() turns these numbers into
 * a light/medium/heavy hint for the studio.
 *
 * WebGL 2 is not used: on this machine it runs on SwiftShader (the CPU), so a GPU path could not be shown
 * to pay here, and each context would compete with the ASCII layers' engines for the context budget.
 * The blurs (blur, glow, motion blur) and the CMYK halftone are the candidates if real devices need one.
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
export { runFinishes, finishValues, activeFinishes, finishesDependOnTime, finishBleed, finishWeight, type FinishWeight } from './pipeline';
export { resolveParams, resolveParam, paramVisible } from './params';
export { DITHER_ALGOS, type DitherAlgo } from './catalog';
export { PALETTES, type PalettePreset } from './palettes';
export type { Img as ImageDataLike } from './core';
