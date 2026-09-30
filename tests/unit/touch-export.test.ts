import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildRuntimes } from '../../scripts/runtime-plugin';
import { normalizeRecipe } from '../../src/engine/recipe';

vi.mock('virtual:mt-runtime', () => ({ default: '/* runtime */' }));
vi.mock('virtual:mt-runtime-basic', () => ({ runtime: '/* runtime + basic */', patterns: {} }));

/**
 * What exported code carries of this lane: both runtimes bring the gesture modes (the touch field, its
 * uniforms, touch-action for a page that must keep scrolling) and the code keeps the studio's glyph
 * order, so a page without its web font draws the same characters.
 */
let built: Awaited<ReturnType<typeof buildRuntimes>>;
beforeAll(async () => { built = await buildRuntimes(); }, 60_000);

describe('exported code', () => {
  it('both runtimes carry the gesture modes and let a page keep scrolling', () => {
    for (const [name, code] of [['webgl', built.runtime], ['basic', built.basic]] as const) {
      expect(code, name).toContain('pan-y');
      expect(code, name).toContain('2.4.0');
      // the new modes by name (normalizeRecipe keeps them) and the passes' touch inputs
      for (const m of ['trail', 'blossom', 'rings', 'sparks', 'stretch', 'reveal', 'zoom', 'magnet', 'follow']) expect(code, `${name} ${m}`).toContain(`"${m}"`);
    }
    for (const u of ['uTouch', 'uTouchMark', 'uTouchDisp', 'uView', 'uTouchReveal']) expect(built.runtime).toContain(u);
  });

  it('keeps the studio\'s glyph order when it is given, and the gesture settings', async () => {
    const { exportRecipe, DEFAULT_CODE } = await import('../../src/exporters/code');
    const r = normalizeRecipe({ glyph: { charset: ' .:-=+*#%@', sort: true }, interact: { mode: 'rings', decay: 0.8, glyphs: 'random' } });
    const kept = exportRecipe(r, { ...DEFAULT_CODE, ramp: [' ', '.', '-', ':', '=', '+', '*', '#', '%', '@'] }).recipe;
    expect(kept.glyph.charset).toBe(' .-:=+*#%@');
    expect(kept.glyph.sort).toBe(false);
    expect(kept.interact).toEqual({ mode: 'rings', strength: 0.4, radius: 0.18, auto: false, decay: 0.8, glyphs: 'random' });
    // without it (or with the piece's own order) nothing changes
    expect(exportRecipe(r, DEFAULT_CODE).recipe.glyph).toMatchObject({ charset: ' .:-=+*#%@', sort: true });
    const own = normalizeRecipe({ glyph: { charset: '@#. ', sort: false } });
    expect(exportRecipe(own, { ...DEFAULT_CODE, ramp: [' ', '.', '#', '@'] }).recipe.glyph).toMatchObject({ charset: '@#. ', sort: false });
  });
});
