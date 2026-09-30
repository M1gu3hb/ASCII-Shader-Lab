import { describe, expect, it } from 'vitest';
import { CHARSETS, PATTERN_IDS, defaultRecipe, normalizeRecipe } from '../../src/engine';
import { CURATED, ensureContrast } from '../../src/random/palettes';
import { PALETTE_GALLERY } from '../../src/random/palette-gallery';
import { generate } from '../../src/random/generator';
import { SCENES, makeScene } from '../../src/studio/scenes';
import { PARTICLE_IDS } from '../../src/engine/glsl/particles';
import { evalPattern } from '../../src/engine/basic/patterns';

describe('curated scenes and particle fields', () => {
  it('keeps a broad usable color selection with no duplicated name or invalid stop', () => {
    expect(PALETTE_GALLERY.length).toBeGreaterThanOrEqual(35);
    const all = [...CURATED, ...PALETTE_GALLERY];
    expect(new Set(all.map(p => p.name)).size).toBe(all.length);
    for (const p of all) {
      expect(p.stops.length).toBeGreaterThanOrEqual(2);
      expect(p.stops.length).toBeLessThanOrEqual(6);
      expect([p.bg, ...p.stops].every(c => /^#[0-9a-f]{6}$/i.test(c)), p.name).toBe(true);
      expect(ensureContrast(p).stops.at(-1)).toBeTruthy();
    }
  });

  it('makes every composition editable and preserves uploaded media when applied', () => {
    expect(SCENES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(SCENES.map(s => s.id)).size).toBe(SCENES.length);
    for (const scene of SCENES) {
      const r = makeScene(scene);
      expect(r.layers.length, scene.id).toBeGreaterThanOrEqual(2);
      expect(r.layers.every(l => PATTERN_IDS.has(l.pattern)), scene.id).toBe(true);
      expect(r.glyph.charset.length).toBeGreaterThan(0);
      expect(normalizeRecipe(r, PATTERN_IDS), scene.id).toEqual(r);
      if (scene.space === 'terminal') expect([...r.glyph.charset].every(c => c.charCodeAt(0) <= 127)).toBe(true);
      if (scene.space === 'media') {
        const uploaded = defaultRecipe();
        uploaded.source = 'image';
        uploaded.media.ref = { kind: 'image', id: 'abcdef1234567890', w: 800, h: 600 };
        expect(makeScene(scene, uploaded).media.ref?.id).toBe('abcdef1234567890');
      }
    }
    expect(CHARSETS.length).toBeGreaterThan(20);
  });

  it('supports a stable time on all 12 animated particle fields and protects older seed versions', () => {
    expect(PARTICLE_IDS.length).toBe(12);
    for (const id of PARTICLE_IDS) {
      let massA = 0, delta = 0;
      for (let yi = -10; yi <= 10; yi++) for (let xi = -16; xi <= 16; xi++) {
        const x = xi / 25, y = yi / 23;
        const a = evalPattern(id, x, y, 2.3, .52, .65);
        const b = evalPattern(id, x, y, 6.3, .52, .65);
        expect(Number.isFinite(a) && a >= 0 && a <= 1, id).toBe(true);
        massA += a; delta += Math.abs(a - b);
      }
      expect(massA, id).toBeGreaterThan(5);
      expect(delta, id).toBeGreaterThan(.5);
    }
    for (let v = 1; v <= 6; v++) {
      const r = generate({ seed: 'particulas-legado', space: 'arte', gen: v, base: defaultRecipe() });
      expect(r.layers.every(l => !(PARTICLE_IDS as readonly string[]).includes(l.pattern))).toBe(true);
    }
  });
});
