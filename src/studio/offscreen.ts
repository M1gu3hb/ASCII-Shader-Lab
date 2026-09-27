import { createRenderer } from '../engine/create';
import { PATTERN_GLSL } from '../engine/glsl/patterns';
import type { Recipe } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import { useCaps } from './caps';
import { getEngine, studioFonts } from './engineBridge';
import { mediaElement } from './media';

export interface OffscreenSize { cssW: number; cssH: number; pixelRatio: number }

/** Size of the live stage, so offscreen renders keep the same composition (same grid). */
export function stageSize(): { cssW: number; cssH: number } {
  const c = getEngine()?.canvas;
  return { cssW: Math.max(200, c?.clientWidth || 1280), cssH: Math.max(120, c?.clientHeight || 720) };
}

/**
 * Creates a hidden renderer with a fixed size (exports, thumbnails, explorer). It is the same kind as the
 * live one: when the stage runs the basic engine, exports do too (WebGL is not there, or not reliable).
 */
export async function offscreenEngine(recipe: Recipe, size: OffscreenSize, opts: { transparent?: boolean } = {}): Promise<Renderer> {
  const canvas = document.createElement('canvas');
  const basic = (getEngine()?.kind ?? useCaps.getState().renderer) === 'basic';
  const { renderer: eng } = await createRenderer(canvas, recipe, {
    library: PATTERN_GLSL, fonts: studioFonts, fixedSize: { width: size.cssW, height: size.cssH, pixelRatio: size.pixelRatio },
    autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true, alpha: true,
  }, basic ? { force: 'basic' } : {});
  eng.transparent = !!opts.transparent;
  for (const k of ['image', 'video', 'camera'] as const) {
    const el = mediaElement(k);
    if (el) eng.setMedia(k, el);
  }
  await eng.ready();
  return eng;
}

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r(null)));

/** WebP when this browser encodes it (smaller), JPEG otherwise; never the silent PNG fallback. */
function thumbUrl(c: HTMLCanvasElement) {
  const url = c.toDataURL('image/webp', 0.8);
  return url.startsWith('data:image/webp') ? url : c.toDataURL('image/jpeg', 0.82);
}

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
      onEach(i, thumbUrl(eng.canvas));
      await nextFrame();
    }
  } finally {
    eng.destroy();
  }
}
