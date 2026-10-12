import { describe, expect, it } from 'vitest';
import { impl } from '../../src/families/analytic/mandala.cpu';
import { META } from '../../src/families/meta/mandala_capas';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/**
 * Mechanism of «Mandala de capas» (I-07): three concentric layers (flower of life, golden spirals, rosette) that
 * turn in opposite senses, and the whole mandala comes back exactly after its cycle.
 */
const PX = 1 / 72;
const only = (layer: 'flower' | 'spiral' | 'outer', extra: Params = {}): Params => ({
  ...defaultParams(META), flower: 0, spiral: 0, outer: 0, center: 0, glow: 0, fill: 0, breathe: 0, [layer]: 1, ...extra,
});
const sample = (p: Params) => {
  const k = packParams(META, p);
  return (x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); };
};
const R0 = 0.46;

/** The angle (radians, counter-clockwise positive) a ring of the image turns between t and t + dt. */
function turn(p: Params, radius: number, t: number, dt: number) {
  const f = sample(p);
  const N = 1440;
  const ring = (tt: number) => Array.from({ length: N }, (_, i) => { const a = (i / N) * 2 * Math.PI; return f(radius * Math.cos(a), radius * Math.sin(a), tt); });
  const a = ring(t), b = ring(t + dt);
  let best = 0, bestC = -Infinity;
  for (let s = -120; s <= 120; s++) {
    let c = 0;
    for (let i = 0; i < N; i++) c += a[i] * b[(i + s + N) % N];
    if (c > bestC) { bestC = c; best = s; }
  }
  return (best / N) * 2 * Math.PI;
}

// (dense samplings of the CPU twin: generous time when the suite shares the machine)
describe('mandala de capas', { timeout: 60_000 }, () => {
  it('cada capa ocupa su anillo: la flor dentro, las espirales en medio, el rosetón fuera', () => {
    const t = 3.7;
    for (const [layer, lo, hi] of [['flower', 0, 0.42 * R0], ['spiral', 0.42 * R0, 0.74 * R0], ['outer', 0.74 * R0, R0]] as const) {
      const f = sample(only(layer));
      let inside = 0;
      for (let y = -0.5; y <= 0.5; y += 0.01) for (let x = -0.6; x <= 0.6; x += 0.01) {
        const r = Math.hypot(x, y), v = f(x, y, t);
        // (the borders between the layers belong to any of them)
        if (r < lo - 0.02 || r > hi + 0.04) expect(v, `${layer} r=${r.toFixed(3)}`).toBeLessThan(0.02);
        else if (v > 0.5) inside++;
      }
      expect(inside, layer).toBeGreaterThan(20);
    }
  });

  it('la flor y el rosetón giran en un sentido; las espirales en el contrario', () => {
    const base = { cycle: 30, turns: 2, counter: 3 };
    const wf = turn(only('flower', base), 0.3 * R0, 2, 0.5);
    const ws = turn(only('spiral', base), 0.58 * R0, 2, 0.5);
    const wo = turn(only('outer', base), 0.85 * R0, 2, 0.5);
    expect(wf).toBeGreaterThan(0.01);
    expect(wo).toBeGreaterThan(0.01);
    expect(ws).toBeLessThan(-0.01);
    // the speeds the cycle asks for: whole steps of each layer's symmetry per cycle
    expect(wf).toBeCloseTo((2 * Math.PI * 0.5 * 2) / (30 * 6), 2);
    expect(ws).toBeCloseTo(-(2 * Math.PI * 0.5 * 3) / (30 * 5), 2);
    expect(wo).toBeCloseTo((2 * Math.PI * 0.5 * 3 * 2) / (30 * 12), 2);
  });

  it('cada preset vuelve exactamente a su inicio al cabo de su ciclo', () => {
    for (const pr of META.presets) {
      const f = sample({ ...defaultParams(META), ...pr.params });
      const P = pr.period!;
      expect(P).toBe(pr.params.cycle);
      let same = 0, half = 0;
      for (const t0 of [0, 7.3]) for (let y = -0.48; y <= 0.48; y += 0.03) for (let x = -0.5; x <= 0.5; x += 0.03) {
        same = Math.max(same, Math.abs(f(x, y, t0) - f(x, y, t0 + P)));
        half += Math.abs(f(x, y, t0) - f(x, y, t0 + P / 2));
      }
      expect(same, pr.id).toBeLessThan(1e-3);
      expect(half, pr.id).toBeGreaterThan(1);
    }
  });
});
