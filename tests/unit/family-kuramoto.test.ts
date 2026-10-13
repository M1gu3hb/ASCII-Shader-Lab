import { describe, expect, it } from 'vitest';
import { KU_ROWS, create, offsets } from '../../src/families/sims/kuramoto';
import { META } from '../../src/families/meta/kuramoto';
import { defaultParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Coupled phase oscillators (Kuramoto): coupling builds order, free oscillators keep their own rhythm. */

const run = (p: Params, steps: number, seed = 'k') => {
  const m = create({ seed, params: { ...defaultParams(META), ...p }, res: 48 });
  m.step(steps);
  return m;
};
/** Global order parameter |⟨e^{iθ}⟩|. */
const order = (th: Float32Array) => {
  let s = 0, c = 0;
  for (const t of th) { s += Math.sin(t); c += Math.cos(t); }
  return Math.hypot(s, c) / th.length;
};
const phases = (m: ReturnType<typeof create>) => m.snapshot().arrays.th as Float32Array;

describe('osciladores acoplados', () => {
  it('vecindades de 4, 8, 12 y 28 vecinos', () => {
    expect(offsets('n4')).toHaveLength(4);
    expect(offsets('n8')).toHaveLength(8);
    expect(offsets('r2')).toHaveLength(12);
    expect(offsets('r3')).toHaveLength(28);
  });

  it('el orden crece con el acoplamiento', () => {
    const p = { spread: 0.02, lag: 0, noise: 0, init: 'ondas', neigh: 'r3' };
    const free = order(phases(run({ ...p, K: 0 }, 600)));
    const weak = order(phases(run({ ...p, K: 0.5 }, 600)));
    const strong = order(phases(run({ ...p, K: 5, init: 'aleatoria' }, 600)));
    expect(free).toBeLessThan(0.2);
    // coupling cannot unwind the waves (they wrap the torus) but it smooths everything else
    const local = (m: ReturnType<typeof create>) => {
      const th = phases(m), w = 2 * Math.round(m.h / 2);
      let s = 0;
      for (let i = 0; i < th.length; i++) s += Math.cos(th[i] - th[(i % w) === w - 1 ? i - w + 1 : i + 1]);
      return s / th.length;
    };
    expect(local(run({ ...p, K: 3 }, 600))).toBeGreaterThan(local(run({ ...p, K: 0 }, 600)) + 0.2);
    expect(strong).toBeGreaterThan(Math.max(free, weak));
  });

  it('sin acoplamiento ni diversidad, cada oscilador gira a la frecuencia media', () => {
    const a = run({ K: 0, spread: 0, noise: 0, freq: 0.3 }, 0), b = run({ K: 0, spread: 0, noise: 0, freq: 0.3 }, 10);
    const ta = phases(a), tb = phases(b), turn = 2 * Math.PI * 0.3 * 0.05 * 10;
    for (let i = 0; i < ta.length; i += 97) {
      let d = tb[i] - ta[i] - turn;
      d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
      expect(Math.abs(d)).toBeLessThan(1e-4);
    }
  });

  it('el ruido desordena: menos orden local con más ruido', () => {
    const p = { K: 3, spread: 0.02, lag: 0, init: 'ondas', neigh: 'n8' };
    const loc = (m: ReturnType<typeof create>) => {
      const th = phases(m), w = 2 * Math.round(m.h / 2);
      let s = 0;
      for (let i = 0; i < th.length; i++) s += Math.cos(th[i] - th[(i % w) === w - 1 ? i - w + 1 : i + 1]);
      return s / th.length;
    };
    expect(loc(run({ ...p, noise: 0 }, 300))).toBeGreaterThan(loc(run({ ...p, noise: 1 }, 300)) + 0.05);
  });

  it('versión 2: la misma rejilla de osciladores con cualquier número de filas (A-05); la versión 1 usa media resolución', () => {
    const p = { ...defaultParams(META), init: 'espirales' };
    const a = create({ seed: 'v', params: p, res: 48 }), b = create({ seed: 'v', params: p, res: 192 }), c = create({ seed: 'v', params: p, res: 2 * KU_ROWS });
    for (const m of [a, b, c]) m.step(120);
    expect(phases(a)).toEqual(phases(c));
    expect(phases(b)).toEqual(phases(c));
    expect([a.w, a.h, b.w, b.h]).toEqual([96, 48, 384, 192]);
    expect(phases(create({ seed: 'v', params: p, res: 48, v: 1 })).length).toBe(48 * 24);
    // at the default rows both versions are the same run
    const v1 = create({ seed: 'v', params: p, res: 2 * KU_ROWS, v: 1 });
    v1.step(120);
    expect(phases(v1)).toEqual(phases(c));
  });

  // every preset is continuous: past its first minute, at the smallest canvas, it keeps changing, neither empty nor full
  for (const pr of META.presets) {
    it(`«${pr.name}» sigue cambiando y no se apaga ni se satura`, () => {
      const m = create({ seed: 'c', params: { ...defaultParams(META), ...pr.params }, res: META.budget.res![0] });
      m.step(META.budget.warmup! + 60 * META.budget.rate!);
      const a = new Uint8Array(m.w * m.h), b = new Uint8Array(m.w * m.h);
      m.render(a, 0);
      m.step(Math.round(0.5 * META.budget.rate!));
      m.render(b, 0);
      let lit = 0, d = 0;
      for (let i = 0; i < b.length; i++) { if (b[i] > 24) lit++; d += Math.abs(a[i] - b[i]); }
      expect(lit / b.length).toBeGreaterThan(0.02);
      expect(lit / b.length).toBeLessThan(0.97);
      expect(d / b.length).toBeGreaterThan(0.5);
    });
  }
});
