import { describe, expect, it } from 'vitest';
import { areaOf, bboxOf, blendMasks, coverageOf, iou, signedDistance } from '../../src/video/sdf';

const disc = (w: number, h: number, cx: number, cy: number, r: number) => {
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) m[y * w + x] = 1;
  return m;
};

describe('signed distance', () => {
  it('is negative inside, positive outside, exact along a row', () => {
    const w = 20, h = 1;
    const m = new Float32Array(w);
    for (let x = 5; x < 15; x++) m[x] = 1;
    const d = signedDistance(m, w, h);
    expect(d[10]).toBeCloseTo(-4.5, 5); // 5 px from the outside pixel at 15 (−(5 − 0.5))
    expect(d[5]).toBeCloseTo(-0.5, 5);
    expect(d[4]).toBeCloseTo(0.5, 5);
    expect(d[0]).toBeCloseTo(4.5, 5);
  });

  it('is Euclidean in 2-D', () => {
    const w = 41, h = 41;
    const m = new Float32Array(w * h);
    m[20 * w + 20] = 1;
    const d = signedDistance(m, w, h);
    expect(d[(20 + 3) * w + 20 + 4]).toBeCloseTo(5 - 0.5, 5);
  });

  it('round-trips a mask through coverage', () => {
    const w = 64, h = 48, m = disc(w, h, 30, 22, 12);
    const back = coverageOf(signedDistance(m, w, h), 1);
    expect(iou(back, m)).toBeGreaterThan(0.97);
  });

  it('handles empty and full masks', () => {
    const w = 8, h = 8;
    expect(signedDistance(new Float32Array(64), w, h)[0]).toBeGreaterThan(0);
    expect(signedDistance(new Float32Array(64).fill(1), w, h)[0]).toBeLessThan(0);
  });
});

describe('SDF blend between keyframes', () => {
  const w = 96, h = 64;
  it('meets two estimates of the same frame halfway: one solid outline, not two half-transparent ones', () => {
    // what the tracker blends: the mask carried forward and the one carried backward, a few px apart
    const a = disc(w, h, 40, 32, 12), b = disc(w, h, 48, 32, 12);
    const mid = blendMasks(a, b, w, h, 0.5);
    expect(iou(mid, disc(w, h, 44, 32, 12))).toBeGreaterThan(0.9);
    const box = bboxOf(mid, w, h)!;
    expect(box.x).toBeGreaterThanOrEqual(31);
    expect(box.x + box.w).toBeLessThanOrEqual(57);
    // a plain cross-fade would leave 0.5-alpha crescents on both sides
    let partial = 0;
    for (const v of mid) if (v > 0.2 && v < 0.8) partial++;
    expect(partial).toBeLessThan(80);
  });

  it('grows a disc smoothly', () => {
    const a = disc(w, h, 48, 32, 6), b = disc(w, h, 48, 32, 18);
    const areas = [0, 0.25, 0.5, 0.75, 1].map(k => areaOf(blendMasks(a, b, w, h, k)));
    for (let i = 1; i < areas.length; i++) expect(areas[i]).toBeGreaterThan(areas[i - 1]);
    const r = Math.sqrt(areas[2] * w * h / Math.PI);
    expect(r).toBeGreaterThan(10);
    expect(r).toBeLessThan(14);
  });

  it('keeps the ends exactly', () => {
    const a = disc(w, h, 24, 32, 10), b = disc(w, h, 64, 32, 10);
    expect(iou(blendMasks(a, b, w, h, 0), a)).toBe(1);
    expect(iou(blendMasks(a, b, w, h, 1), b)).toBe(1);
  });
});
