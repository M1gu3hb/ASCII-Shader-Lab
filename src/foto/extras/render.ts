/**
 * Rendering for the extras' previews (posters, sequences, parallax) and their type measuring. One small
 * compositor (two ASCII engines at most, so the viewport keeps its WebGL budget), released after a while
 * without work; renders run one at a time, and a newer request for the same canvas replaces an older one.
 */
import { Compositor } from '../../project/compositor';
import { fontStack, fontWeight } from '../../project/draw2d';
import { evaluate } from '../../project/evaluate';
import { estimateWidth, INTER, type Measure } from '../../project/posters';
import type { Project } from '../../project/types';

let comp: Compositor | null = null;
let idleT = 0;
let chain: Promise<unknown> = Promise.resolve();
const latest = new WeakMap<HTMLCanvasElement, number>();
let seq = 0;

function compositor(): Compositor {
  clearTimeout(idleT);
  return (comp ??= new Compositor({ maxEngines: 2 }));
}

function releaseSoon() {
  clearTimeout(idleT);
  idleT = window.setTimeout(() => { comp?.destroy(); comp = null; }, 15_000);
}

export function releaseExtrasRender() {
  clearTimeout(idleT);
  comp?.destroy();
  comp = null;
}

/**
 * Draws `p` at time t into `canvas`, `width` css px wide (times the device ratio, never above the project's
 * size). Resolves false when a newer render for the same canvas replaced this one.
 */
export function renderPreview(p: Project, canvas: HTMLCanvasElement, width: number, t = 0, o: { dpr?: number; light?: boolean } = {}): Promise<boolean> {
  const mine = ++seq;
  latest.set(canvas, mine);
  const job = chain.then(async () => {
    if (latest.get(canvas) !== mine) return false;
    const dpr = o.dpr ?? Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.min(1, (width * dpr) / p.canvas.w);
    try {
      const off = document.createElement('canvas');
      await compositor().render(evaluate(p, t), off, { scale, quality: o.light ? 'preview' : 'final' });
      if (latest.get(canvas) !== mine) { off.width = off.height = 0; return false; }
      canvas.width = off.width; canvas.height = off.height;
      canvas.getContext('2d')!.drawImage(off, 0, 0);
      off.width = off.height = 0;
      return true;
    } catch (e) {
      console.warn('extras: preview failed', e);
      return false;
    } finally { releaseSoon(); }
  });
  chain = job.catch(() => false);
  return job;
}

/* ------------------------------------------------------------------ type */

let mctx: CanvasRenderingContext2D | null = null;

/**
 * Type measured by this browser, as the compositor will draw it (the same font strings); the estimate's
 * value when it is wider (fonts still loading, a family the page lacks), so fitted titles never overflow.
 */
export const canvasMeasure: Measure = (text, font, weight, italic, px) => {
  mctx ??= document.createElement('canvas').getContext('2d');
  if (!mctx) return estimateWidth(text, font, weight, italic, px);
  mctx.font = `${italic ? 'italic ' : ''}${fontWeight(font, weight)} ${Math.max(0.5, px).toFixed(3)}px ${fontStack(font)}`;
  const w = mctx.measureText(text).width * 1.03;
  return Number.isFinite(w) && w > 0 ? w : estimateWidth(text, font, weight, italic, px);
};

let fontsReady: Promise<void> | null = null;

/** Loads the faces the posters set type in (once), so measuring and drawing agree. */
export function posterFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  const faces = [
    `800 40px "${INTER}"`, `600 40px "${INTER}"`, `400 40px "${INTER}"`, `300 40px "${INTER}"`,
    `400 40px ${fontStack('serif')}`, `italic 400 40px ${fontStack('serif')}`,
    `800 40px ${fontStack('martian')}`, `700 40px ${fontStack('martian')}`,
    `400 40px ${fontStack('jetbrains')}`, `500 40px ${fontStack('jetbrains')}`, `600 40px ${fontStack('jetbrains')}`, `700 40px ${fontStack('jetbrains')}`,
    `400 40px ${fontStack('plex')}`,
  ];
  fontsReady = Promise.race([
    Promise.all(faces.map(f => document.fonts?.load(f, 'AaÑñ¿?01').catch(() => undefined))).then(() => undefined),
    new Promise<void>(res => setTimeout(res, 4000)),
  ]);
  return fontsReady;
}
