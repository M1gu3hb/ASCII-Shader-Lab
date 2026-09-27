import { describe, expect, it } from 'vitest';
import { defaultRecipe, DEFAULT_LAYER, normalizeRecipe } from '../../src/engine/recipe';
import { unsupportedFeatures } from '../../src/engine/basic/features';
import { PATTERNS } from '../../src/engine/catalog';

describe('unsupportedFeatures', () => {
  it('is empty for the default recipe', () => {
    expect(unsupportedFeatures(defaultRecipe())).toEqual([]);
  });

  it('is empty when every effect and pointer mode is in use (the basic engine renders them)', () => {
    const r = defaultRecipe();
    r.fx = { glow: 2, bloom: 2, scan: 1, vig: 1, curve: 1, chroma: 1, grain: 1, flicker: 1, cellBg: 1, grid: 1 };
    for (const mode of ['light', 'ripple', 'lens', 'repel', 'swirl', 'erase', 'paint', 'scramble'] as const) {
      r.interact.mode = mode;
      expect(unsupportedFeatures(r), mode).toEqual([]);
    }
  });

  it('is empty for every pattern of the library', () => {
    for (const p of PATTERNS) {
      const r = defaultRecipe();
      r.layers = [{ ...DEFAULT_LAYER, pattern: p.id }];
      expect(unsupportedFeatures(r), p.id).toEqual([]);
    }
  });

  it('flags a pattern without a CPU port once, and ignores layers that are off', () => {
    const r = normalizeRecipe({
      layers: [
        { pattern: 'futuro' }, { pattern: 'futuro', blend: 'screen' }, { pattern: 'otro', on: false }, { pattern: 'nube' },
      ],
    });
    expect(unsupportedFeatures(r)).toEqual([{ id: 'pattern:futuro', label: 'futuro (aproximado)' }]);
  });
});
