import type { Recipe } from '../../engine/recipe';
import { getEngine } from '../engineBridge';
import { offscreenEngine, stageSize } from '../offscreen';

/**
 * Small offscreen renders of recipes for choosing and comparing (style grids, comparison strips).
 * One job at a time (each job borrows one hidden engine), cancellable, and cached per recipe and
 * size, so going back to a step or re-opening a comparison shows the images at once.
 */
export interface CropSpec {
  w: number;
  h: number;
  /** Share of the stage shown: 1 is the whole composition, less zooms into its centre (to see glyphs). */
  zoom: number;
}
export interface Signal { cancelled: boolean }

const cache = new Map<string, string>();
const CACHE_MAX = 120;
let chain: Promise<void> = Promise.resolve();

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r(null)));

function keyOf(r: Recipe, o: CropSpec, stage: { cssW: number; cssH: number }) {
  return `${o.w}x${o.h}@${o.zoom}|${Math.round(stage.cssW)}x${Math.round(stage.cssH)}|${JSON.stringify(r)}`;
}

function remember(k: string, url: string) {
  cache.delete(k);
  cache.set(k, url);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

/**
 * Renders each recipe and calls `onEach(i, dataUrl)` (null when this browser cannot render it).
 * Cached images arrive synchronously; the rest after the jobs queued before this one.
 */
export function renderCrops(recipes: Recipe[], o: CropSpec, onEach: (i: number, url: string | null) => void, signal: Signal) {
  const stage = stageSize();
  const todo: number[] = [];
  recipes.forEach((r, i) => {
    // the camera changes every frame: never cached
    const hit = r.source !== 'camera' ? cache.get(keyOf(r, o, stage)) : undefined;
    if (hit) onEach(i, hit); else todo.push(i);
  });
  if (!todo.length) return;
  chain = chain.then(() => run(recipes, todo, o, onEach, signal)).catch(() => undefined);
}

async function run(recipes: Recipe[], todo: number[], o: CropSpec, onEach: (i: number, url: string | null) => void, signal: Signal) {
  if (signal.cancelled) return;
  const stage = stageSize();
  const { cssW, cssH } = stage;
  const aspect = o.w / o.h;
  const regW = Math.min(cssW, cssH * aspect) * Math.max(0.1, Math.min(1, o.zoom)), regH = regW / aspect;
  const pr = Math.min(2, o.w / regW);
  let eng: Awaited<ReturnType<typeof offscreenEngine>>;
  try {
    eng = await offscreenEngine(recipes[todo[0]], { cssW, cssH, pixelRatio: pr });
  } catch {
    for (const i of todo) if (!signal.cancelled) onEach(i, null);
    return;
  }
  const out = document.createElement('canvas');
  out.width = o.w; out.height = o.h;
  const ctx = out.getContext('2d')!;
  const t = getEngine()?.time ?? 3;
  try {
    for (const i of todo) {
      if (signal.cancelled) break;
      eng.set(recipes[i]);
      await eng.ready();
      if (signal.cancelled) break;
      eng.renderAt(t);
      const W = eng.canvas.width, H = eng.canvas.height, sw = regW * pr, sh = regH * pr;
      ctx.clearRect(0, 0, o.w, o.h);
      ctx.drawImage(eng.canvas, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, o.w, o.h);
      const url = out.toDataURL('image/webp', 0.82);
      if (recipes[i].source !== 'camera') remember(keyOf(recipes[i], o, stage), url);
      onEach(i, url);
      await nextFrame();
    }
  } finally {
    eng.destroy();
  }
}
