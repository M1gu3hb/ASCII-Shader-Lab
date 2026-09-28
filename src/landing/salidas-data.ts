import type { ColorDepth } from '../exporters/text';
import { charsetById } from '../engine/catalog';
import type { Recipe } from '../engine/recipe';
import { PRESETS } from '../studio/presets';

/**
 * The one piece the landing's «Salidas» block takes to every destination. scripts/posters.mjs exports it
 * with the studio's own functions into public/ex/salidas/ (PNG, SVG, WebM/MP4, Web Component, Node script,
 * recipe); the page shows those files, never a mock-up of them.
 */
export const SALIDA = {
  /** File names follow the studio's (pieceFileBase): glyphos-<name>. */
  base: 'glyphos-saturno',
  /** «1200×630 (redes)», one of the studio's export sizes. */
  size: { w: 1200, h: 630 },
  fps: 24,
  termFps: 12,
  termDepth: '256' as ColorDepth,
  recipe(): Recipe {
    const r = PRESETS.arte.find(p => p.id === 'saturno')!.make();
    r.meta = { ...r.meta, name: 'Saturno', space: 'arte' };
    // the planet a little to the right, so a page's content can sit on the left (see the «Web» tab)
    r.layers[0].x = 0.42;
    r.layers[0].scale = 0.8;
    // «Bucle perfecto» in the studio: the clip and the script end where they begin
    r.motion.loop = 3;
    return r;
  },
  /** The same piece set for a terminal: cells twice as tall as wide, like a terminal's characters. */
  terminal(): Recipe {
    const r = SALIDA.recipe();
    r.glyph.aspect = 2;
    r.glyph.cell = 9;
    // at 80×24 a short ramp reads better than the detailed one, and the planet takes the middle
    r.glyph.charset = charsetById('clasico')!.chars;
    r.layers[0].x = 0;
    r.layers[0].scale = 0.62;
    r.layers[1].mix = 0.3;
    return r;
  },
};
