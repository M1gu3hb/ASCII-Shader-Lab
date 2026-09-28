import { describe, expect, it } from 'vitest';
import { binomial3, boxFor, coarseTone, expandCoarse4, gaussBlur, shiftMix4 } from '../../src/fx/kernels';
import { fromPremul, makeImg, toPremul } from '../../src/fx/core';
import { meanAbsDiff, photo } from './fx-fixtures';

/** Variance of the 1-D impulse response of a blur applied to a row. */
function impulseVariance(blur: (row: Float32Array) => void, n = 301): number {
  const row = new Float32Array(n);
  row[n >> 1] = 1;
  blur(row);
  let s = 0, m = 0, v = 0;
  for (let i = 0; i < n; i++) { s += row[i]; m += i * row[i]; }
  m /= s;
  for (let i = 0; i < n; i++) v += (i - m) ** 2 * row[i];
  return v / s;
}

describe('blur kernels', () => {
  it('gives three extended boxes the variance of the requested Gaussian, continuously', () => {
    for (const sigma of [0.4, 0.8, 1, 1.7, 3, 6.5, 12, 30]) {
      const v = impulseVariance(row => gaussBlur(row, new Float32Array(row.length), row.length, 1, 1, sigma));
      expect(Math.sqrt(v), `σ ${sigma}`).toBeCloseTo(sigma, 1);
    }
    // the fractional part moves smoothly with σ (no whole-pixel jumps)
    const a = boxFor(2.0), b = boxFor(2.05);
    expect(a.r === b.r ? Math.abs(a.a - b.a) : 1).toBeLessThan(0.2);
    expect(Math.sqrt(impulseVariance(row => binomial3(row, new Float32Array(row.length), row.length, 1)))).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it('keeps the total and a flat image unchanged, borders included', () => {
    const w = 37, h = 23;
    const flat = new Float32Array(w * h * 4).fill(100);
    gaussBlur(flat, new Float32Array(flat.length), w, h, 4, 5);
    for (const v of flat) expect(v).toBeCloseTo(100, 3);
  });

  it('moves a picture by a constant offset exactly (whole and fractional pixels)', () => {
    const w = 16, h = 9, src = new Float32Array(w * h * 4), dst = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) src[i * 4] = i % w; // red = x
    shiftMix4(src, dst, w, h, 0, 0, 0, 3, 0, 1);
    expect(dst[(4 * w + 5) * 4]).toBeCloseTo(8, 5);
    shiftMix4(src, dst, w, h, 0, 0, 0, 2.25, 1, 1);
    expect(dst[(4 * w + 5) * 4]).toBeCloseTo(7.25, 5);
    shiftMix4(src, dst, w, h, -1, 0, 0.5, 1, 0, 0.5); // the two-tap pass
    expect(dst[(4 * w + 5) * 4]).toBeCloseTo(5, 5);
  });

  it('blurs wide radii on a coarse grid within a hair of the full Gaussian', () => {
    const P = photo(160, 120);
    for (const sigma of [5, 9, 20]) {
      const full = makeImg(160, 120), fast = makeImg(160, 120);
      const buf = toPremul(P, new Float32Array(160 * 120 * 4));
      gaussBlur(buf, new Float32Array(buf.length), 160, 120, 4, sigma);
      fromPremul(buf, full);
      const c = coarseTone(P.data, 160, 120, sigma, 4, n => new Float32Array(n), n => new Float32Array(n), 2.5);
      expandCoarse4(c, fast.data, 160, 120);
      expect(meanAbsDiff(full, fast), `σ ${sigma}`).toBeLessThan(1.2);
    }
  });
});
