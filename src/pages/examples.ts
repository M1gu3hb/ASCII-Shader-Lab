import type { Recipe } from '../engine/recipe';
import type { Guide } from '../shared/site';
import { PRESETS } from '../studio/presets';

/**
 * The example shown on each guide page. The same definition renders the committed poster
 * (scripts/posters.mjs → public/ex/) and the live demo (src/pages/demo.ts), so the demo takes over
 * from the poster without a visible jump.
 */
export interface Example {
  recipe: () => Recipe;
  /** photo: the still sample landscape; scene: the landscape in motion, fed as a video source. */
  media: 'photo' | 'scene' | null;
  /** Time of the poster frame (and first live frame), in seconds. */
  t: number;
  /** Terminal examples are text: a grid of cols × rows characters instead of a canvas. */
  grid?: { cols: number; rows: number };
}

type Space = keyof typeof PRESETS;
const preset = (space: Space, id: string) => PRESETS[space].find(p => p.id === id)!.make();

export const EXAMPLES: Record<Guide['id'], Example> = {
  imagen: {
    media: 'photo', t: 3,
    recipe: () => { const r = preset('media', 'retrato'); r.interact.auto = true; return r; },
  },
  video: {
    media: 'scene', t: 3,
    recipe: () => { const r = preset('media', 'fosforo'); r.source = 'video'; r.interact.auto = true; return r; },
  },
  fondos: {
    media: null, t: 4,
    recipe: () => { const r = preset('fondos', 'marea'); r.interact.auto = true; return r; },
  },
  texto: {
    media: null, t: 3,
    recipe: () => { const r = preset('tipo', 'neon'); r.interact.auto = true; return r; },
  },
  terminal: {
    media: null, t: 1, grid: { cols: 80, rows: 24 },
    recipe: () => preset('terminal', 'donut'),
  },
};

/** Pixel size of a cols × rows text grid, computed like the studio's text export (captureGrid). */
export function gridSize(r: Recipe, cols: number, rows: number) {
  const cw = Math.max(2, Math.round(r.glyph.cell)), ch = Math.max(2, Math.round(r.glyph.cell * r.glyph.aspect));
  return { width: cols * cw, height: rows * ch };
}
