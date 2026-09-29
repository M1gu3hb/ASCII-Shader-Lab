import { describe, expect, it } from 'vitest';
import { PATTERN_IDS, PATTERNS, defaultRecipe, normalizeRecipe } from '../../src/engine';
import { EXTRA_GLSL } from '../../src/engine/glsl/patterns-extra';
import { evalPattern } from '../../src/engine/basic/patterns';
import { EXTRA_BASIC } from '../../src/engine/basic/patterns-extra';
import { generate } from '../../src/random/generator';
import { PRESETS } from '../../src/studio/presets';

const IDS = ['mandelbrot', 'sierpinski', 'filotaxis', 'quasicristal', 'topografia', 'espirografo',
  'circuitos', 'dunas', 'entrelazado', 'obelisco', 'prisma', 'reloj_arena'];

describe('biblioteca nueva', () => {
  it('has the same ids in the catalog and both renderers', () => {
    for (const id of IDS) {
      expect(PATTERN_IDS.has(id)).toBe(true);
      expect(EXTRA_GLSL[id]).toContain(`P_${id}`);
      expect(EXTRA_BASIC[id]).toBeTruthy();
    }
  });

  it('draws nonempty, different states within usable parameters', () => {
    for (const id of IDS) {
      const values: number[] = [];
      for (const t of [0, 3.3]) for (const a of [0.2, 0.65]) {
        let total = 0;
        for (let y = -0.45; y <= 0.45; y += 0.05) for (let x = -0.7; x <= 0.7; x += 0.05) {
          const v = evalPattern(id, x, y, t, a, 0.5, 0.014);
          expect(Number.isFinite(v), id).toBe(true);
          expect(v, id).toBeGreaterThanOrEqual(0);
          expect(v, id).toBeLessThanOrEqual(1);
          total += v;
        }
        values.push(total);
      }
      expect(Math.max(...values), id).toBeGreaterThan(4);
      expect(Math.max(...values) - Math.min(...values), id).toBeGreaterThan(0.1);
    }
  });

  it('makes valid recipes and preserves generator versions 1–4', () => {
    const newPresets = Object.values(PRESETS).flat().filter(p => p.make().layers.some(l => IDS.includes(l.pattern)));
    expect(newPresets.length).toBeGreaterThanOrEqual(15);
    for (const p of newPresets) expect(normalizeRecipe(p.make(), PATTERN_IDS)).toEqual(p.make());
    for (const gen of [1, 2, 3, 4]) for (const i of Array.from({ length: 20 }, (_, j) => j)) {
      const r = generate({ seed: `legacy-${i}`, space: 'arte', base: defaultRecipe(), gen });
      expect(r.layers.every(l => !IDS.includes(l.pattern))).toBe(true);
    }
    const v5 = PATTERNS.filter(p => IDS.includes(p.id));
    expect(v5.length).toBe(12);
  });
});
