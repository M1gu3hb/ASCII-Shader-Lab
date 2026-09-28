/**
 * The finishes pipeline on plain RGBA buffers (no DOM): each finish that is on runs in order and is mixed
 * with its own input by `amount` (premultiplied, so a half-strength glow fades its halo too).
 */
import type { Finish, FinishKind } from '../project/types';
import type { FinishContext } from './index';
import { CATALOG } from './catalog';
import { clamp, rgbOf, Scratch, seedHash, type Img, type Op, type Run, type Values } from './core';
import { ditherImg, type DitherMode, type DitherSpec } from './dither';
import { resolvePalette } from './palettes';
import { resolveParams } from './params';
import { crosshatch, edges, halftone, pixelate } from './ops/screen';
import { duotone, invert, levels, mono, posterize, threshold } from './ops/tone';
import { glow, shadow, vignette } from './ops/light';
import { blur, chroma, motionblur, sharpen } from './ops/motion';
import { grain, noise, scanlines } from './ops/texture';

const dither: Op = (src, dst, p, run) => {
  const mode = p.color as DitherMode;
  const spec: DitherSpec = {
    algo: p.algo as string,
    serpentine: p.serpentine === true,
    mode,
    ink: rgbOf(p.ink), paper: rgbOf(p.paper), clear: p.clear === true,
    levels: p.levels as number,
    colors: mode === 'paleta' ? resolvePalette(p.palette as string, p, src) : [],
    cell: (p.pixel as number) * run.scale,
    bright: p.bright as number, contrast: p.contrast as number, linear: p.linear === true,
    seed: run.seed,
  };
  ditherImg(src, dst, spec, run.scratch);
};

const palette: Op = (src, dst, p, run) => {
  const algo = p.dither === 'none' ? 'threshold' : (p.dither as string);
  ditherImg(src, dst, {
    algo, serpentine: true, mode: 'paleta', ink: [0, 0, 0], paper: [255, 255, 255], clear: false, levels: 2,
    colors: resolvePalette(p.palette as string, p, src),
    cell: (p.pixel as number) * run.scale, bright: 0, contrast: 1, linear: false, seed: run.seed,
  }, run.scratch);
};

export const OPS: Record<FinishKind, Op> = {
  dither, palette, halftone, crosshatch, pixelate, edges,
  levels, threshold, posterize, invert, mono, duotone,
  glow, shadow, vignette,
  motionblur, blur, sharpen, chroma,
  grain, noise, scanlines,
};

const DEFS = new Map(CATALOG.map(d => [d.kind, d]));

/** The finishes that will actually do something: on, known and with amount > 0. */
export function activeFinishes(finishes: readonly Finish[] | null | undefined): Finish[] {
  return (finishes ?? []).filter(f => !!f && f.on !== false && !!OPS[f.kind] && DEFS.has(f.kind) && !(Number(f.amount) <= 0));
}

export function makeRun(ctx: Partial<FinishContext> | undefined, scratch: Scratch): Run {
  const scale = Number(ctx?.scale);
  const t = Number(ctx?.t);
  return {
    t: Number.isFinite(t) ? t : 0,
    seed: seedHash(String(ctx?.seed ?? '')),
    scale: Number.isFinite(scale) && scale > 0 ? clamp(scale, 1 / 64, 64) : 1,
    quality: ctx?.quality === 'preview' ? 'preview' : 'final',
    scratch,
  };
}

/** Premultiplied mix: b ← a·(1 − t) + b·t. */
function mixInto(a: Img, b: Img, t: number): void {
  const A = a.data, B = b.data;
  for (let i = 0; i < A.length; i += 4) {
    const aa = A[i + 3], ab = B[i + 3];
    if (aa === ab) {
      B[i] = A[i] + (B[i] - A[i]) * t; B[i + 1] = A[i + 1] + (B[i + 1] - A[i + 1]) * t; B[i + 2] = A[i + 2] + (B[i + 2] - A[i + 2]) * t;
      continue;
    }
    const pa = aa * (1 - t), pb = ab * t, ao = pa + pb;
    if (ao <= 0) { B[i] = 0; B[i + 1] = 0; B[i + 2] = 0; B[i + 3] = 0; continue; }
    B[i] = (A[i] * pa + B[i] * pb) / ao; B[i + 1] = (A[i + 1] * pa + B[i + 1] * pb) / ao; B[i + 2] = (A[i + 2] * pa + B[i + 2] * pb) / ao;
    B[i + 3] = ao;
  }
}

let defaultScratch: Scratch | null = null;
export function sharedScratch(): Scratch { return (defaultScratch ??= new Scratch()); }
export function dropSharedScratch(): void { defaultScratch?.clear(); defaultScratch = null; }

/** Params of a finish, validated, with defaults. */
export function finishValues(f: Finish): Values { return resolveParams(DEFS.get(f.kind), f.params); }

/**
 * Runs the active finishes over `img` IN PLACE (img.data holds the result) and returns it.
 * `scratch` holds the temporary buffers (the shared one when omitted).
 */
export function runFinishes<T extends Img>(img: T, finishes: readonly Finish[], ctx?: Partial<FinishContext>, scratch = sharedScratch()): T {
  const list = activeFinishes(finishes);
  if (!list.length || img.width < 1 || img.height < 1) return img;
  const run = makeRun(ctx, scratch);
  let cur: Img = img;
  let other: Img = scratch.img('pipeline.pp', img.width, img.height);
  for (const f of list) {
    const amount = clamp(Number.isFinite(Number(f.amount)) ? Number(f.amount) : 1, 0, 1);
    OPS[f.kind](cur, other, finishValues(f), run);
    if (amount < 1) mixInto(cur, other, amount);
    const t = cur; cur = other; other = t;
  }
  if (cur !== img) img.data.set(cur.data);
  return img;
}

/** Whether the pixels depend on the time (animated grain/noise, rolling scanlines, VHS jitter). */
export function finishesDependOnTime(finishes: readonly Finish[] | null | undefined): boolean {
  return activeFinishes(finishes).some(f => {
    const p = finishValues(f);
    return (f.kind === 'grain' || f.kind === 'noise') ? p.anim === true
      : f.kind === 'scanlines' ? p.roll !== 0
      : f.kind === 'chroma' ? (p.jitter as number) > 0 : false;
  });
}

/**
 * How far (in output px) the finishes can paint outside the layer's visible pixels — glow halos,
 * shadows, blurs. A compositor that crops layers must keep this margin; Infinity = anywhere in the frame.
 */
export function finishBleed(finishes: readonly Finish[] | null | undefined): number {
  let m = 0;
  for (const f of activeFinishes(finishes)) {
    const p = finishValues(f);
    const n = (k: string) => Number(p[k]) || 0;
    switch (f.kind) {
      case 'glow': m += n('radius') * 2.5; break;
      case 'shadow': m += n('distance') + n('blur') * 1.5; break;
      case 'blur': m += n('radius') * 3; break;
      case 'motionblur': m = p.mode === 'linear' ? m + n('distance') : Infinity; break;
      case 'chroma': m += n('amount') + n('jitter') * 33; break; // the shift, plus the widest VHS tear
      case 'edges': m += n('width') + 2; break;
      case 'pixelate': m += n('size'); break;
      default: break;
    }
  }
  return m;
}
