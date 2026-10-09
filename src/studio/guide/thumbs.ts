import { previewTime } from '../../families/host';
import type { Recipe } from '../../engine/recipe';
import { getEngine } from '../engineBridge';
import { canvasUrl, snapshotCanvas, stageSize, withOffscreen } from '../offscreen';

/**
 * Small offscreen renders of recipes for choosing and comparing (style grids, comparison strips).
 * One job at a time (each job borrows the studio's shared hidden renderer, see offscreen.ts),
 * cancellable, and cached per recipe and size, so going back to a step or re-opening a comparison
 * shows the images at once.
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

/** A source whose picture changes over time (its renders are never reused). */
const live = (r: Recipe) => r.source === 'camera' || r.source === 'video';

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
    // the camera and a playing video change every frame: never cached
    const hit = live(r) ? undefined : cache.get(keyOf(r, o, stage));
    if (hit) onEach(i, hit); else todo.push(i);
  });
  if (!todo.length) return;
  void run(recipes, todo, o, onEach, signal);
}

async function run(recipes: Recipe[], todo: number[], o: CropSpec, onEach: (i: number, url: string | null) => void, signal: Signal) {
  if (signal.cancelled) return;
  const stage = stageSize();
  const { cssW, cssH } = stage;
  const aspect = o.w / o.h;
  const regW = Math.min(cssW, cssH * aspect) * Math.max(0.1, Math.min(1, o.zoom)), regH = regW / aspect;
  const pr = Math.min(2, o.w / regW);
  const t = getEngine()?.time ?? 3;
  for (const i of todo) {
    if (signal.cancelled) break;
    let url: string | null = null;
    try {
      // one render per turn of the shared renderer: history thumbnails can go in between
      const c = await withOffscreen({ cssW, cssH, pixelRatio: pr }, recipes[i], async eng => {
        if (signal.cancelled) return null;
        eng.set(recipes[i]);
        await eng.ready();
        if (signal.cancelled) return null;
        // (a family with memory: an early moment of its run, not a fast-forward to the stage's clock)
        eng.renderAt(previewTime(recipes[i], t));
        const W = eng.canvas.width, H = eng.canvas.height, sw = regW * pr, sh = regH * pr;
        return snapshotCanvas(eng, (W - sw) / 2, (H - sh) / 2, sw, sh, o.w, o.h);
      });
      url = c ? await canvasUrl(c, 0.82) : null;
    } catch {
      url = null;
    }
    if (signal.cancelled) break;
    if (url && !live(recipes[i])) remember(keyOf(recipes[i], o, stage), url);
    onEach(i, url);
    await nextFrame();
  }
}
