import { AsciiEngine, type EngineOptions } from './engine';
import { BasicEngine } from './basic/engine';
import type { Recipe } from './recipe';
import type { Renderer } from './renderer';
import { probeWebGL, type GLStatus } from './support';

export interface CreatedRenderer {
  renderer: Renderer;
  /** Why this renderer was chosen (see explainWebGL). */
  status: GLStatus;
}

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

/**
 * Creates the best renderer this browser can run: the WebGL 2 engine when possible, otherwise the
 * Canvas 2D basic engine. Never throws for missing WebGL (only when even a 2D canvas is impossible).
 * `force: 'basic'` (or ?motor=basico / localStorage 'mt.motor' = 'basico') skips WebGL.
 * Note: after a WebGL failure the canvas may be replaced in the DOM; use `renderer.canvas`.
 */
export function createRenderer(canvas: HTMLCanvasElement, recipe: Recipe, opts: EngineOptions, o: { force?: 'basic' } = {}): CreatedRenderer {
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
  return { renderer: new BasicEngine(canvas, recipe, opts), status };
}
