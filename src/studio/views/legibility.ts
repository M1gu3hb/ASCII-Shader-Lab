import { useEffect, type RefObject } from 'react';
import { create } from 'zustand';
import type { Recipe } from '../../engine/recipe';
import { getEngine } from '../engineBridge';
import { legibility, previewInk, type Legibility } from '../guide/paths';
import type { InkMode } from './views';

/**
 * Legibility of the test headline over a web background («Fondo web» view and the fondo guide).
 * One meter runs while the headline is on screen; everything that shows the estimate reads it here.
 */
export interface Estimate { ratio: number; level: Legibility }

export const useLegibility = create<{ est: Estimate | null }>(() => ({ est: null }));

export const VERDICT: Record<Legibility, string> = {
  buena: 'Se lee bien',
  justa: 'Vale para titulares grandes; para texto normal, baja la presencia',
  baja: 'Cuesta leer: baja la presencia',
};

/** Colour of the page text: near black on light backgrounds and white on dark ones, unless chosen. */
export const inkFor = (mode: InkMode, bg: string) => (mode === 'light' ? '#ffffff' : mode === 'dark' ? '#111111' : previewInk(bg));

/**
 * Samples the rendered stage behind `target` (the headline) and estimates its contrast with `ink`.
 * Runs while `on`: after each change and every second and a half (the background moves).
 */
export function useLegibilityMeter(on: boolean, recipe: Recipe | undefined, ink: string, target: RefObject<HTMLElement | null>) {
  // an estimate is only true while its headline is there
  useEffect(() => () => useLegibility.setState({ est: null }), []);
  useEffect(() => {
    if (!on || !recipe) { useLegibility.setState({ est: null }); return; }
    let alive = true;
    const measure = () => {
      const eng = getEngine();
      const h1 = target.current;
      if (!eng || !h1 || !alive) return;
      const c = eng.canvas, cr = c.getBoundingClientRect(), hr = h1.getBoundingClientRect();
      const x0 = Math.max(hr.left, cr.left), y0 = Math.max(hr.top, cr.top);
      const x1 = Math.min(hr.right, cr.right), y1 = Math.min(hr.bottom, cr.bottom);
      if (x1 - x0 < 4 || y1 - y0 < 4 || !cr.width || !cr.height) return;
      const kx = c.width / cr.width, ky = c.height / cr.height;
      const sw = (x1 - x0) * kx, sh = (y1 - y0) * ky;
      const k = Math.min(1, 360 / sw);
      const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
      const t = document.createElement('canvas');
      t.width = w; t.height = h;
      const x = t.getContext('2d', { willReadFrequently: true });
      if (!x) return;
      try {
        eng.renderNow();
        x.drawImage(c, (x0 - cr.left) * kx, (y0 - cr.top) * ky, sw, sh, 0, 0, w, h);
        const block = Math.max(3, Math.round(recipe.glyph.cell * kx * k * 2));
        useLegibility.setState({ est: legibility(x.getImageData(0, 0, w, h).data, w, h, ink, block) });
      } catch { /* a canvas we cannot read: no estimate */ }
    };
    // the first sample waits for a style's crossfade to settle
    const first = setTimeout(measure, 700);
    const every = setInterval(measure, 1500);
    return () => { alive = false; clearTimeout(first); clearInterval(every); };
  }, [on, recipe, ink, target]);
}
