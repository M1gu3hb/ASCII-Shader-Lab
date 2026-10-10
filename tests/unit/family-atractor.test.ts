import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/atractor';
import { META } from '../../src/families/meta/atractor';
import { defaultParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Strange attractors: the maps iterate their formulas, the histogram's mass is bounded, Lorenz stays bounded. */

const params = (p: Params = {}): Params => ({ ...defaultParams(META), ...p });
const ORBITS = 256;

describe('atractores extraños', () => {
  for (const type of ['clifford', 'dejong'] as const) {
    it(`${type}: cada órbita avanza exactamente según su fórmula (deriva 0)`, () => {
      const p = params({ type, drift: 0, points: 2560 });
      const m = create({ seed: 'formula', res: 48, params: p });
      m.step(3);
      const s0 = m.snapshot();
      m.step(1);
      const s1 = m.snapshot();
      // with no drift the coefficients are exactly the ones set
      const [A, B, C, D] = ['a', 'b', 'c', 'd'].map(k => p[k] as number);
      expect(s1.scalars.phase).toBe(0);
      const ox0 = s0.arrays.ox as Float32Array, oy0 = s0.arrays.oy as Float32Array;
      const ox1 = s1.arrays.ox as Float32Array, oy1 = s1.arrays.oy as Float32Array;
      const per = 2560 / ORBITS;
      for (let o = 0; o < ORBITS; o++) {
        let x = ox0[o], y = oy0[o];
        for (let k = 0; k < per; k++) {
          const nx = type === 'dejong' ? Math.sin(A * y) - Math.cos(B * x) : Math.sin(A * y) + C * Math.cos(A * x);
          const ny = type === 'dejong' ? Math.sin(C * x) - Math.cos(D * y) : Math.sin(B * x) + D * Math.cos(B * y);
          x = nx; y = ny;
        }
        expect(Math.fround(x)).toBe(ox1[o]);
        expect(Math.fround(y)).toBe(oy1[o]);
      }
    });
  }

  it('la masa del histograma no supera la serie geométrica de su estela', () => {
    const p = params({ drift: 0, points: 8000, trail: 0.3 });
    const m = create({ seed: 'masa', res: 48, params: p });
    const decay = Math.pow(0.5, 1 / (3 + 300 * 0.3 * 0.3));
    const bound = 8000 / (1 - decay);
    let last = 0;
    for (let k = 0; k < 8; k++) {
      m.step(50);
      const H = m.snapshot().arrays.H as Float32Array;
      let sum = 0;
      for (const v of H) { expect(v).toBeGreaterThanOrEqual(0); sum += v; }
      expect(sum).toBeLessThanOrEqual(bound * 1.001);
      last = sum;
    }
    // near the steady state after many half-lives (points that fall outside the frame do not count)
    expect(last).toBeGreaterThan(bound * 0.5);
  });

  it('Lorenz: las partículas siguen en la región del atractor en todos los extremos', () => {
    for (const v of [-3, 0, 3]) {
      const m = create({ seed: 'lorenz', res: 48, params: params({ type: 'lorenz', a: v, b: v, c: v, d: v, drift: 1 }) });
      m.step(600);
      const pos = m.snapshot().arrays.pos as Float32Array;
      for (let i = 0; i < pos.length; i += 3) {
        expect(Number.isFinite(pos[i])).toBe(true);
        expect(Math.abs(pos[i])).toBeLessThan(80);
        expect(Math.abs(pos[i + 1])).toBeLessThan(80);
        expect(pos[i + 2]).toBeGreaterThan(-20);
        expect(pos[i + 2]).toBeLessThan(120);
      }
    }
  });
});
