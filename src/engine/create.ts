import { AsciiEngine, type EngineOptions } from './engine';
import type { BasicEngine } from './basic/engine';
import type { Recipe } from './recipe';
import type { Renderer } from './renderer';
import { probeWebGL, type GLStatus } from './support';

export interface CreatedRenderer {
  renderer: Renderer;
  /** Why this renderer was chosen (see explainWebGL). */
  status: GLStatus;
}

export type BasicEngineClass = typeof BasicEngine;

/**
 * A canvas holds one kind of context for life: if the WebGL engine claimed it and then failed,
 * swap in a clean copy (same attributes, class and style) so the basic engine can draw.
 */
function canvasFor2d(c: HTMLCanvasElement): HTMLCanvasElement {
  if (c.getContext('2d')) return c;
  const fresh = c.cloneNode(false) as HTMLCanvasElement;
  c.replaceWith(fresh);
  return fresh;
}

/** The WebGL 2 engine when it starts; otherwise the canvas the basic engine should use, and why. */
function tryWebGL(canvas: HTMLCanvasElement, recipe: Recipe, opts: EngineOptions, o: { force?: 'basic' }):
  { renderer: Renderer; status: GLStatus } | { renderer: null; status: GLStatus; canvas: HTMLCanvasElement } {
  let status = probeWebGL();
  if (o.force === 'basic') status = { ...status, reason: 'forced' };
  if (status.reason === 'ok') {
    try {
      return { renderer: new AsciiEngine(canvas, recipe, opts), status };
    } catch (e) {
      const msg = (e as Error).message;
      status = { ...status, webgl2: false, reason: 'blocked', detail: msg === 'webgl2' ? status.detail : msg };
      opts.onError?.(msg === 'webgl2' ? 'webgl2: no se pudo crear el contexto; uso el motor básico' : msg);
      canvas = canvasFor2d(canvas);
    }
  }
  return { renderer: null, status, canvas };
}

let basicModule: Promise<typeof import('./basic/engine')> | null = null;

/**
 * The basic engine (Canvas 2D ports of every pattern) is its own chunk: browsers that run WebGL 2 never
 * download it. Call early when the probe already says it will be needed, so the fetch overlaps other work.
 */
export function loadBasicEngine(): Promise<typeof import('./basic/engine')> {
  basicModule ??= import('./basic/engine').catch(e => { basicModule = null; throw e; });
  return basicModule;
}

/**
 * Creates the best renderer this browser can run: the WebGL 2 engine when possible, otherwise the
 * Canvas 2D basic engine. Never rejects for missing WebGL (only when even a 2D canvas is impossible,
 * or the basic engine's chunk cannot be fetched).
 * `force: 'basic'` (or ?motor=basico / localStorage 'mt.motor' = 'basico') skips WebGL.
 * The WebGL engine is created synchronously, before this returns; the basic one once its chunk is here.
 * Note: after a WebGL failure the canvas may be replaced in the DOM; use `renderer.canvas`.
 */
export async function createRenderer(canvas: HTMLCanvasElement, recipe: Recipe, opts: EngineOptions, o: { force?: 'basic' } = {}): Promise<CreatedRenderer> {
  const r = tryWebGL(canvas, recipe, opts, o);
  if (r.renderer) return r;
  const { BasicEngine } = await loadBasicEngine();
  return { renderer: new BasicEngine(r.canvas, recipe, opts), status: r.status };
}

/**
 * Synchronous variant for pages that already hold the basic engine class (dev pages, tests):
 * same choice and fallbacks as createRenderer.
 */
export function createRendererWith(Basic: BasicEngineClass, canvas: HTMLCanvasElement, recipe: Recipe, opts: EngineOptions, o: { force?: 'basic' } = {}): CreatedRenderer {
  const r = tryWebGL(canvas, recipe, opts, o);
  if (r.renderer) return r;
  return { renderer: new Basic(r.canvas, recipe, opts), status: r.status };
}
