/**
 * The landing's engine, as a separate chunk: the page paints and becomes interactive without it, and
 * browsers without WebGL 2 get the basic engine (Canvas 2D) instead of empty canvases.
 */
import { createRenderer, loadBasicEngine } from '../engine/create';
import type { EngineOptions } from '../engine/engine';
import { createFontLoader } from '../engine/fonts';
import { PATTERN_GLSL } from '../engine/glsl/patterns';
import type { Recipe } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import { explainWebGL, probeWebGL, type GLStatus } from '../engine/support';
import './basic.css';

// the probe runs once and is cached: when it already says «basic», fetch that chunk right away
if (probeWebGL().reason !== 'ok') void loadBasicEngine().catch(() => undefined);

const fonts = createFontLoader({ google: false });

export type LandingOptions = Partial<Omit<EngineOptions, 'library' | 'fonts'>>;

/**
 * The renderer this browser can run (never fails for missing WebGL); null only when nothing can draw.
 * The basic engine is one more chunk, fetched only by browsers that need it.
 */
export async function mount(canvas: HTMLCanvasElement, r: Recipe, o: LandingOptions): Promise<{ renderer: Renderer; status: GLStatus } | null> {
  try {
    return await createRenderer(canvas, r, { library: PATTERN_GLSL, fonts, ...o });
  } catch {
    return null;
  }
}

/** True when the landing will draw with the basic engine (the probe is cached; no extra cost). */
export const basicHere = () => probeWebGL().reason !== 'ok';

/** Short, precise words for the «modo básico» note: why, and what it means for what you see. */
export function basicWords(status: GLStatus): { title: string; body: string } {
  const e = explainWebGL(status);
  return {
    title: e.title,
    body: `${e.body} Se ve igual que con la tarjeta gráfica; las piezas pesadas pueden ir más lentas. En el estudio, «¿Por qué?» explica cómo recuperar el motor completo.`,
  };
}
