import { AsciiEngine } from '../engine/engine';
import { PATTERN_GLSL } from '../engine/glsl/patterns';
import type { Recipe } from '../engine/recipe';
import { getEngine, studioFonts } from './engineBridge';
import { mediaElement } from './media';

export interface OffscreenSize { cssW: number; cssH: number; pixelRatio: number }

/** Size of the live stage, so offscreen renders keep the same composition (same grid). */
export function stageSize(): { cssW: number; cssH: number } {
  const c = getEngine()?.canvas;
  return { cssW: Math.max(200, c?.clientWidth || 1280), cssH: Math.max(120, c?.clientHeight || 720) };
}

/** Creates a hidden engine with a fixed size (exports, thumbnails, explorer). */
export async function offscreenEngine(recipe: Recipe, size: OffscreenSize, opts: { transparent?: boolean } = {}) {
  const canvas = document.createElement('canvas');
  const eng = new AsciiEngine(canvas, recipe, {
    library: PATTERN_GLSL, fonts: studioFonts, fixedSize: { width: size.cssW, height: size.cssH, pixelRatio: size.pixelRatio },
    autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true, alpha: true,
  });
  eng.transparent = !!opts.transparent;
  for (const k of ['image', 'video', 'camera'] as const) {
    const el = mediaElement(k);
    if (el) eng.setMedia(k, el);
  }
  await eng.ready();
  return eng;
}

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r(null)));

export async function renderThumbs(recipes: Recipe[], w: number, onEach: (i: number, url: string) => void, signal?: { cancelled: boolean }) {
  if (!recipes.length) return;
  const { cssW, cssH } = stageSize();
  const eng = await offscreenEngine(recipes[0], { cssW, cssH, pixelRatio: w / cssW });
  const t = getEngine()?.time ?? 3;
  try {
    for (let i = 0; i < recipes.length; i++) {
      if (signal?.cancelled) break;
      eng.set(recipes[i]);
      await eng.ready();
      eng.renderAt(t);
      onEach(i, eng.canvas.toDataURL('image/webp', 0.8));
      await nextFrame();
    }
  } finally {
    eng.destroy();
  }
}
