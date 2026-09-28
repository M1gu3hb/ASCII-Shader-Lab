import { describe, expect, it } from 'vitest';
import { defaultFinish, FINISHES, runFinishes, type ImageDataLike } from '../../src/fx';
import type { Finish, FinishKind } from '../../src/project/types';
import { clone, cutoutAt, downsample, img, meanAbsDiff, photoAt, soften } from './fx-fixtures';

/**
 * Scale invariance: the final render (scale 1) of a picture, reduced by 2, should look like the preview
 * (scale 0.5) of the reduced picture. The tolerances are tight: ignoring the scale fails them by far
 * (checked below).
 */
const W = 240, H = 180;
const big = img(W, H, (x, y) => {
  const u = (x + 0.5) / W, v = (y + 0.5) / H;
  // a photo on the left, a cutout disc on transparency on the right
  const c = cutoutAt(u, v, W);
  return c[3] > 0 && u > 0.5 ? c : u < 0.45 ? photoAt(u, v) : [0, 0, 0, 0];
});
const small = downsample(big, 2);

function compare(f: Finish, soft: number, previewScale = 0.5): number {
  const fin = runFinishes(clone(big), [f], { t: 0.5, seed: 'escala', scale: 1, quality: 'final' });
  const pre = runFinishes(clone(small), [f], { t: 0.5, seed: 'escala', scale: previewScale, quality: 'final' });
  let a: ImageDataLike = downsample(fin, 2), b: ImageDataLike = pre;
  if (soft > 0) { a = soften(a, soft); b = soften(b, soft); }
  return meanAbsDiff(a, b);
}

const withP = (k: FinishKind, params: Finish['params']): Finish => {
  const f = defaultFinish(k);
  return { ...f, params: { ...f.params, ...params } };
};

/**
 * Blur radius (preview px) before comparing, and the tolerance (mean absolute difference, 0..255).
 * Screens and hatching are compared dot for dot (they are anchored to the output grid); random textures
 * after a 1 px blur (the preview averages grains it cannot show one by one).
 */
const TOL: Partial<Record<FinishKind, [number, number]>> = {
  dither: [0, 1], palette: [0, 1], halftone: [0, 3], crosshatch: [0, 5], pixelate: [0, 1],
  edges: [0, 3], grain: [1, 1.5], noise: [1, 2], scanlines: [0, 1], threshold: [0, 1], sharpen: [0, 1],
};

describe('scale invariance (preview at half size ≈ final reduced by 2)', () => {
  for (const def of FINISHES) {
    it(def.kind, () => {
      const [soft, tol] = TOL[def.kind] ?? [0, 1.5];
      const d = compare(defaultFinish(def.kind), soft);
      expect(d, `${def.kind}: ${d.toFixed(2)}`).toBeLessThan(tol);
    });
  }

  it('fails when the scale is ignored (the comparison can tell)', () => {
    for (const k of ['blur', 'glow', 'shadow', 'motionblur', 'halftone', 'crosshatch', 'chroma', 'grain', 'scanlines', 'pixelate', 'dither'] as FinishKind[]) {
      const [soft, tol] = TOL[k] ?? [0, 1.5];
      expect(compare(defaultFinish(k), soft, 1), k).toBeGreaterThan(tol * 0.3);
      expect(compare(defaultFinish(k), soft, 1), k).toBeGreaterThan(compare(defaultFinish(k), soft) * 3);
    }
  });

  it('keeps big dither blocks where the final render puts them', () => {
    const f = withP('dither', { pixel: 8, algo: 'bayer4' });
    const fin = downsample(runFinishes(clone(big), [f], { t: 0, seed: 's', scale: 1, quality: 'final' }), 2);
    const pre = runFinishes(clone(small), [f], { t: 0, seed: 's', scale: 0.5, quality: 'final' });
    // same block grid: compare the block colours at the block centres
    let same = 0, total = 0;
    for (let by = 0; by < 22; by++) for (let bx = 0; bx < 30; bx++) {
      const i = ((by * 4 + 2) * 120 + bx * 4 + 2) * 4;
      if (fin.data[i + 3] < 255) continue;
      total++;
      if (Math.abs(fin.data[i] - pre.data[i]) < 3) same++;
    }
    expect(same / total).toBeGreaterThan(0.85);
  });

  it('matches for strong settings too (long motion blur, big glow, coarse halftone)', () => {
    expect(compare(withP('motionblur', { distance: 120, angle: 30 }), 0)).toBeLessThan(5);
    expect(compare(withP('motionblur', { mode: 'zoom', amount: 0.4, trail: true }), 0)).toBeLessThan(6);
    expect(compare(withP('glow', { radius: 90, threshold: 0.3, strength: 2 }), 0)).toBeLessThan(6);
    expect(compare(withP('halftone', { freq: 4, color: 'cmyk' }), 6)).toBeLessThan(10);
    expect(compare(withP('shadow', { mode: 'long', distance: 60 }), 0)).toBeLessThan(6);
  });
});
