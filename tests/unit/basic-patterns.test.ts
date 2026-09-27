import { describe, expect, it } from 'vitest';
import { PATTERNS } from '../../src/engine/catalog';
import { PATTERN_GLSL } from '../../src/engine/glsl/patterns';
import { BASIC_APPROX, BASIC_PATTERNS, evalPattern } from '../../src/engine/basic/patterns';
import { blendf, fbm, gnoise, hash12, hash22, V2 } from '../../src/engine/basic/core';

const XS = [-0.93, -0.61, -0.37, -0.12, 0, 0.004, 0.21, 0.48, 0.77, 0.95];
const YS = [-0.52, -0.33, -0.18, -0.05, 0, 0.09, 0.26, 0.41, 0.55];
const TS = [0, 1.7, 12.3, 97.25];
const AB: Array<[number, number]> = [[0, 0], [0.5, 0.5], [1, 1], [0.2, 0.85]];

describe('basic engine patterns', () => {
  it('ports every pattern of the GLSL library', () => {
    expect(Object.keys(BASIC_PATTERNS).sort()).toEqual(Object.keys(PATTERN_GLSL).sort());
    expect(PATTERNS.every(p => BASIC_PATTERNS[p.id])).toBe(true);
    for (const [id, stand] of BASIC_APPROX) expect(BASIC_PATTERNS[stand], id).toBeTruthy();
  });

  it.each(PATTERNS.map(p => p.id))('%s is finite, in 0..1 and deterministic', id => {
    const seen = new Set<number>();
    for (const t of TS) for (const [a, b] of AB) for (const y of YS) for (const x of XS) {
      const v = evalPattern(id, x, y, t, a, b, 0.019);
      expect(Number.isFinite(v), `${id}(${x}, ${y}, t=${t}, a=${a}, b=${b}) = ${v}`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
      expect(evalPattern(id, x, y, t, a, b, 0.019)).toBe(v);
      seen.add(Math.round(v * 64));
    }
    // not a constant: every pattern draws something over this sample
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('basic engine core helpers', () => {
  it('hashes stay in 0..1', () => {
    for (let i = 0; i < 200; i++) {
      const h = hash12(i * 1.37, i * 0.73 - 50);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      hash22(i, -i);
      expect(V2[0]).toBeGreaterThanOrEqual(0); expect(V2[1]).toBeLessThan(1);
    }
  });

  it('noise stays close to 0..1', () => {
    let lo = 1, hi = 0;
    for (let i = 0; i < 400; i++) {
      const v = gnoise(i * 0.173, i * 0.311 - 3), f = fbm(i * 0.05, -i * 0.07);
      lo = Math.min(lo, v, f); hi = Math.max(hi, v, f);
    }
    expect(lo).toBeGreaterThan(-0.3);
    expect(hi).toBeLessThan(1.3);
  });

  it('blend operators follow GLSL_BLEND', () => {
    expect(blendf(0.2, 0.6, 0, 1)).toBeCloseTo(0.6);
    expect(blendf(0.2, 0.6, 1, 1)).toBeCloseTo(0.8);
    expect(blendf(0.5, 0.6, 2, 1)).toBeCloseTo(0.3);
    expect(blendf(0.2, 0.6, 5, 1)).toBeCloseTo(0.4);
    expect(blendf(0.2, 0.6, 10, 1)).toBe(0);
    expect(blendf(0.2, 0.6, 2, 0.5)).toBeCloseTo(0.2 * 0.5 + 0.12 * 0.5);
  });
});
