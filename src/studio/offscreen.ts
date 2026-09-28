import { createRenderer } from '../engine/create';
import { PATTERN_GLSL } from '../engine/glsl/patterns';
import type { Recipe } from '../engine/recipe';
import type { Renderer, RendererKind } from '../engine/renderer';
import { useCaps } from './caps';
import { getEngine, studioFonts } from './engineBridge';
import { mediaElement } from './media';

export interface OffscreenSize { cssW: number; cssH: number; pixelRatio: number }

/** Size of the live stage, so offscreen renders keep the same composition (same grid). */
export function stageSize(): { cssW: number; cssH: number } {
  const c = getEngine()?.canvas;
  return { cssW: Math.max(200, c?.clientWidth || 1280), cssH: Math.max(120, c?.clientHeight || 720) };
}

/** The kind of renderer offscreen work should use: the live one's. */
const liveKind = (): RendererKind | null => getEngine()?.kind ?? useCaps.getState().renderer;

/**
 * Creates a hidden renderer with a fixed size (exports, thumbnails, explorer). It is the same kind as the
 * live one: when the stage runs the basic engine, exports do too (WebGL is not there, or not reliable).
 */
export async function offscreenEngine(recipe: Recipe, size: OffscreenSize, opts: { transparent?: boolean; readback?: boolean } = {}): Promise<Renderer> {
  const canvas = document.createElement('canvas');
  const basic = liveKind() === 'basic';
  const { renderer: eng } = await createRenderer(canvas, recipe, {
    library: PATTERN_GLSL, fonts: studioFonts, fixedSize: { width: size.cssW, height: size.cssH, pixelRatio: size.pixelRatio },
    autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true, alpha: true, readback: opts.readback,
  }, basic ? { force: 'basic' } : {});
  eng.transparent = !!opts.transparent;
  stageMedia(eng);
  await eng.ready();
  return eng;
}

/** Gives a renderer the media the stage shows (or none). */
export function stageMedia(eng: Renderer) {
  for (const k of ['image', 'video', 'camera'] as const) eng.setMedia(k, mediaElement(k));
}

/* ------------------------------------------------------------------ */
/* One shared hidden renderer                                          */
/* ------------------------------------------------------------------ */

/**
 * Small renders for the studio (history thumbnails, the explorer, the guides' comparisons) share one
 * hidden renderer instead of each creating its own: a WebGL context, its shaders and its glyph atlas are
 * made once. Jobs run one at a time, in the order asked; the renderer goes away after a while unused, or
 * when the stage changes kind (e.g. to the basic engine after losing WebGL).
 */
let shared: { eng: Renderer; kind: RendererKind | null; lost: boolean } | null = null;
let creating: Promise<Renderer> | null = null;
let chain: Promise<unknown> = Promise.resolve();
let idleT = 0;
let active = 0;
/** An offscreen render is under way (slow stage frames now say little about the stage). */
export const offscreenActive = () => active > 0;
const IDLE_MS = 30_000;

async function sharedEngine(recipe: Recipe, size: OffscreenSize): Promise<Renderer> {
  const kind = liveKind();
  if (shared && (shared.kind !== kind || shared.lost)) { shared.eng.destroy(); shared = null; }
  if (shared) { shared.eng.setFixedSize(size.cssW, size.cssH, size.pixelRatio); return shared.eng; }
  creating ??= offscreenEngine(recipe, size, { readback: true }).then(eng => {
    const s = { eng, kind, lost: false };
    // a WebGL context the browser takes back (too many at once, a GPU reset): make a new renderer next time
    eng.canvas.addEventListener('webglcontextlost', () => { s.lost = true; });
    shared = s;
    return eng;
  }).finally(() => { creating = null; });
  return creating;
}

/**
 * Runs `job` with the shared hidden renderer, sized as asked (CSS size of the stage and a pixel ratio),
 * with the stage's media and an opaque background. Jobs never overlap; a failing job does not stop the next.
 */
export function withOffscreen<T>(size: OffscreenSize, first: Recipe, job: (eng: Renderer) => Promise<T>): Promise<T> {
  const run = async () => {
    clearTimeout(idleT);
    active++;
    // the stage's frames may slow down meanwhile: not a reason to lower its resolution
    getEngine()?.holdAdaptive(performance.now() + 20_000);
    try {
      const eng = await sharedEngine(first, size);
      eng.transparent = false;
      stageMedia(eng);
      return await job(eng);
    } finally {
      active--;
      if (!active) getEngine()?.holdAdaptive(performance.now() + 500);
      idleT = window.setTimeout(releaseOffscreen, IDLE_MS);
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

/** Frees the shared renderer (its WebGL context and buffers). The next job makes a new one. */
export function releaseOffscreen() {
  clearTimeout(idleT);
  shared?.eng.destroy();
  shared = null;
}

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r(null)));

/** A canvas kept in memory (never on the GPU), so reading or encoding it does not wait for one. */
function memCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d', { willReadFrequently: true })! };
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>(res => {
  try { c.toBlob(b => res(b), type, q); } catch { res(null); }
});

/** A canvas as a data URL: WebP when this browser encodes it (smaller), JPEG otherwise; encoded off the main thread. */
export async function canvasUrl(c: HTMLCanvasElement, q = 0.8): Promise<string | null> {
  const webp = await toBlob(c, 'image/webp', q);
  const b = webp && webp.type === 'image/webp' ? webp : await toBlob(c, 'image/jpeg', q + 0.02);
  if (!b) return null;
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(typeof fr.result === 'string' ? fr.result : null);
    fr.onerror = () => res(null);
    fr.readAsDataURL(b);
  });
}

/**
 * A region of a renderer's last frame, scaled to `w`×`h` (smoothly), in a canvas kept in memory. The
 * pixels come through Renderer.snapshot, so the page never waits for the GPU (a plain drawImage or
 * toDataURL of a WebGL canvas does, and under a software GPU that was seconds).
 */
export async function snapshotCanvas(eng: Renderer, sx: number, sy: number, sw: number, sh: number, w: number, h: number): Promise<HTMLCanvasElement | null> {
  const img = await eng.snapshot(sx, sy, sw, sh);
  if (!img) return null;
  const src = memCanvas(img.width, img.height);
  src.x.putImageData(img, 0, 0);
  const out = memCanvas(w, h);
  out.x.imageSmoothingEnabled = true;
  out.x.imageSmoothingQuality = 'high';
  out.x.drawImage(src.c, 0, 0, w, h);
  return out.c;
}

export async function renderThumbs(recipes: Recipe[], w: number, onEach: (i: number, url: string) => void, signal?: { cancelled: boolean }) {
  if (!recipes.length) return;
  const { cssW, cssH } = stageSize();
  const t = getEngine()?.time ?? 3;
  for (let i = 0; i < recipes.length; i++) {
    if (signal?.cancelled) break;
    const c = await withOffscreen({ cssW, cssH, pixelRatio: w / cssW }, recipes[i], async eng => {
      if (signal?.cancelled) return null;
      eng.set(recipes[i]);
      await eng.ready();
      eng.renderAt(t);
      const W = eng.canvas.width, H = eng.canvas.height;
      return snapshotCanvas(eng, 0, 0, W, H, W, H);
    });
    const url = c && !signal?.cancelled ? await canvasUrl(c) : null;
    if (url && !signal?.cancelled) onEach(i, url);
    // one per frame: the stage keeps drawing in between
    await nextFrame();
  }
}
