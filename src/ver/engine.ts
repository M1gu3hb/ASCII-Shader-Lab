/**
 * The viewer's engine, a chunk of its own: the page paints and reads the link without it. WebGL 2 when the
 * browser runs it, the basic engine (Canvas 2D, one more chunk) otherwise.
 *
 * The canvas is drawn at a pixel ratio of exactly 1 and never lowers its resolution by itself: the frame it
 * draws is the one the link fixes (src/shared/frame.ts), whatever the screen's density or speed.
 */
import { createRenderer, loadBasicEngine } from '../engine/create';
import { createFontLoader } from '../engine/fonts';
import { PATTERN_GLSL } from '../engine/glsl/patterns';
import type { Recipe } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import { probeWebGL } from '../engine/support';
// every face a piece can use (they download only when the piece asks for one)
import '../landing/fonts';

if (probeWebGL().reason !== 'ok') void loadBasicEngine().catch(() => undefined);

const fonts = createFontLoader({ google: false });

export async function mountPiece(canvas: HTMLCanvasElement, recipe: Recipe, o: { playing: boolean; reduced: boolean; onError: (m: string) => void }): Promise<{ renderer: Renderer } | null> {
  try {
    const { renderer } = await createRenderer(canvas, recipe, {
      library: PATTERN_GLSL, fonts, interactive: true, pointerTarget: 'canvas', adaptive: false, maxPixelRatio: 1,
      autoplay: o.playing, reducedMotion: o.reduced, onError: o.onError,
    });
    renderer.setQuality({ maxPixelRatio: 1, adaptive: false });
    return { renderer };
  } catch {
    return null;
  }
}
