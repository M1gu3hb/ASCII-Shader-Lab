import { describe, expect, it } from 'vitest';
import { PATTERN_IDS, defaultRecipe } from '../../src/engine';
import { NEXT_BASIC } from '../../src/engine/basic/patterns-next';
import { evalPattern } from '../../src/engine/basic/patterns';
import { NEXT_GLSL } from '../../src/engine/glsl/patterns-next';
import { generate, GEN_VERSION } from '../../src/random/generator';
import { PRESETS } from '../../src/studio/presets';

const IDS = Object.keys(NEXT_GLSL);
const SOLIDS = ['simbiosis', 'pendulos', 'cinta_ola', 'jade_vivo', 'caliz', 'medusa', 'esferas_orbita'];

describe('segunda ampliación de patrones', () => {
  it('keeps each field wired into both engines and the visible catalog', () => {
    expect(IDS).toHaveLength(23);
    expect(Object.keys(NEXT_BASIC).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      expect(PATTERN_IDS.has(id), id).toBe(true);
      expect(NEXT_GLSL[id], id).toContain(`P_${id}`);
    }
    expect(GEN_VERSION).toBe(6);
  });

  it('keeps signals finite and gives each shape a usable silhouette', () => {
    for (const id of IDS) {
      let peak = 0, mass = 0;
      for (let yi = -11; yi <= 11; yi++) for (let xi = -19; xi <= 19; xi++) {
        const v = evalPattern(id, xi / 29, yi / 25, 1.7, 0.46, 0.55, 0.016);
        expect(Number.isFinite(v), id).toBe(true);
        expect(v, id).toBeGreaterThanOrEqual(0);
        expect(v, id).toBeLessThanOrEqual(1);
        peak = Math.max(peak, v); mass += v;
      }
      expect(peak, id).toBeGreaterThan(0.27);
      expect(mass, id).toBeGreaterThan(3);
    }
  });

  it('animates the 3D figures and preserves generator versions 1–5', () => {
    for (const id of SOLIDS) {
      let delta = 0;
      for (let yi = -7; yi <= 7; yi++) for (let xi = -11; xi <= 11; xi++) {
        const x = xi / 21, y = yi / 19;
        delta += Math.abs(evalPattern(id, x, y, 0.2, .5, .5) - evalPattern(id, x, y, 4.1, .5, .5));
      }
      expect(delta, id).toBeGreaterThan(1);
    }
    for (const gen of [1, 2, 3, 4, 5]) for (let i = 0; i < 12; i++) {
      const r = generate({ seed: `legacy-next-${i}`, space: 'arte', base: defaultRecipe(), gen });
      expect(r.layers.every(l => !IDS.includes(l.pattern))).toBe(true);
    }
    const presets = Object.values(PRESETS).flat().filter(p => p.make().layers.some(l => IDS.includes(l.pattern)));
    expect(presets.length).toBeGreaterThanOrEqual(23);
  });
});
