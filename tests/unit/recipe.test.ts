import { describe, expect, it } from 'vitest';
import { defaultRecipe, migrateV1, normalizeRecipe, isV1Settings } from '../../src/engine';
import { encodeRecipe, decodeRecipe, parseRecipe, recipeFile } from '../../src/shared/share';
import { GEN_VERSION, generate } from '../../src/random';

describe('recipes', () => {
  it('normalises garbage into a valid default recipe', () => {
    const r = normalizeRecipe({ layers: 'x', glyph: { cell: -4, charset: 7 }, color: { stops: ['#zzz', '#abc'] } });
    expect(r.glyph.cell).toBe(3);
    expect(r.color.stops).toEqual(['#aabbcc']);
    expect(r.layers.length).toBe(1);
  });

  it('migrates settings exported by the original single-file lab', () => {
    const v1 = { source: 'pattern', patA: 7, patB: 0, blend: 2, mix: 0.45, scale: 1, scaleB: 1.4, speed: 1, speedB: 0.4, rot: 0, warp: 0,
      mouse: 0.4, cell: 14, aspect: 1.3, charset: ' .:-=+*#%@', sortDensity: true, font: 'vt', weight: 400, glyph: 1, bright: 0, contrast: 1.35,
      gamma: 1, invert: false, dither: 0, edge: 0, colorMode: 1, colA: '#c8ffd8', colB: '#0a5a26', bg: '#000000', sat: 1, hue: 0, vivid: 0.5,
      cycle: 0, cellBg: 0, glow: 0.6, scan: 0.2, vig: 0.5, paused: false, mediaSrc: '' };
    expect(isV1Settings(v1)).toBe(true);
    const r = migrateV1(v1);
    expect(r.layers.map(l => l.pattern)).toEqual(['lluvia', 'nube']);
    expect(r.layers[1].blend).toBe('multiply');
    expect(r.color.stops).toEqual(['#0a5a26', '#c8ffd8']);
    expect(r.glyph.font).toBe('vt');
    expect(r.fx.glow).toBe(0.6);
    expect(parseRecipe(JSON.stringify(v1))?.layers[0].pattern).toBe('lluvia');
  });

  it('round-trips through share links', async () => {
    const r = generate({ seed: 'eco-azul-123', space: 'arte', base: defaultRecipe() });
    const s = await encodeRecipe(r);
    expect(s.startsWith('z')).toBe(true);
    expect(s.length).toBeLessThan(1600);
    const back = await decodeRecipe(s);
    expect(back?.layers).toEqual(r.layers);
    expect(back?.color).toEqual(r.color);
    expect(back?.meta.seed).toBe('eco-azul-123');
    // and the generator version that wove the seed (opened from a link, the seed says which version repeats it)
    expect(r.meta.gen).toBe(GEN_VERSION);
    expect(back?.meta.gen).toBe(GEN_VERSION);
    const old = await decodeRecipe(await encodeRecipe(generate({ seed: 'eco-azul-123', space: 'arte', base: defaultRecipe(), gen: 2 })));
    expect(old?.meta.gen).toBe(2);
  });

  it('round-trips through recipe files and rejects junk', () => {
    const r = defaultRecipe();
    expect(parseRecipe(recipeFile(r))?.glyph).toEqual(r.glyph);
    expect(parseRecipe('{"hola":1}')).toBeNull();
    expect(parseRecipe('no json')).toBeNull();
  });
});
