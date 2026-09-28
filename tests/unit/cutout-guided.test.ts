import { describe, expect, it } from 'vitest';
import { applyGuided, boxMean, guidedUpsample, planGuided, resizeBilinear } from '../../src/cutout/refine';

/** A W×H RGBA image: dark on the left of `edge`, bright on the right, with a little noise. */
function stepImage(W: number, H: number, edge: number, seed = 1): Uint8ClampedArray {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = (x < edge ? 40 : 210) + (rnd() - 0.5) * 12;
    const j = (y * W + x) * 4;
    px[j] = v; px[j + 1] = v * 0.9; px[j + 2] = v * 0.8; px[j + 3] = 255;
  }
  return px;
}

/** The model's view: the right side is the subject, seen at 1/8 resolution and blurred. */
function coarseMatte(W: number, H: number, edge: number, k = 8): { low: Float32Array; lw: number; lh: number } {
  const lw = W / k, lh = H / k;
  const sharp = new Float32Array(lw * lh);
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) sharp[y * lw + x] = (x + 0.5) * k >= edge ? 1 : 0;
  return { low: boxMean(sharp, lw, lh, 1), lw, lh };
}

/** Pixels between 10 % and 90 % along a row. */
function transitionWidth(alpha: Uint8ClampedArray, W: number, y: number): number {
  let n = 0;
  for (let x = 0; x < W; x++) { const v = alpha[y * W + x]; if (v > 25 && v < 230) n++; }
  return n;
}

describe('box filter and resize', () => {
  it('boxMean equals a brute-force clipped window mean', () => {
    const w = 23, h = 17, r = 3;
    const src = Float32Array.from({ length: w * h }, (_, i) => Math.sin(i * 1.7) * 3 + (i % 7));
    const got = boxMean(src, w, h, r);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) { s += src[yy * w + xx]; n++; }
      expect(got[y * w + x]).toBeCloseTo(s / n, 4);
    }
  });

  it('resizeBilinear keeps constants and the identity', () => {
    const c = new Float32Array(16).fill(0.25);
    expect(Array.from(resizeBilinear(c, 4, 4, 13, 9))).toEqual(new Array(117).fill(0.25));
    const r = Float32Array.from({ length: 12 }, (_, i) => i);
    expect(Array.from(resizeBilinear(r, 4, 3, 4, 3))).toEqual(Array.from(r));
  });
});

describe('guided upsampling', () => {
  const W = 256, H = 64, EDGE = 133;
  const img = stepImage(W, H, EDGE);
  const { low, lw, lh } = coarseMatte(W, H, EDGE);

  it('puts a blurry low-resolution edge where the photo has its edge', () => {
    const smooth = guidedUpsample(img, W, H, low, lw, lh, 0);
    const guided = guidedUpsample(img, W, H, low, lw, lh, 0.8);
    const y = H / 2;
    const maxStep = (a: Uint8ClampedArray) => { let m = 0; for (let x = 1; x < W; x++) m = Math.max(m, a[y * W + x] - a[y * W + x - 1]); return m; };
    // The model's edge is a ramp ≈ 3 low-res px wide; upsampled plainly it stays a ramp, guided it becomes a step.
    expect(transitionWidth(smooth, W, y)).toBeGreaterThanOrEqual(16);
    expect(maxStep(smooth)).toBeLessThan(20);
    expect(maxStep(guided)).toBeGreaterThan(120);
    expect(guided[y * W + EDGE] - guided[y * W + EDGE - 1]).toBe(maxStep(guided));
    // The 50 % crossing sits on the photo's edge.
    let cross = 0;
    for (let x = 1; x < W; x++) if (guided[y * W + x - 1] < 128 && guided[y * W + x] >= 128) cross = x;
    expect(Math.abs(cross - EDGE)).toBeLessThanOrEqual(1);
  });

  it('keeps flat inside and outside regions exactly opaque and transparent', () => {
    const guided = guidedUpsample(img, W, H, low, lw, lh, 1);
    for (let y = 0; y < H; y++) {
      expect(guided[y * W + 10]).toBe(0);
      expect(guided[y * W + W - 10]).toBe(255);
    }
  });

  it('at detail 0 is a smooth upsampling of the model matte', () => {
    const out = guidedUpsample(img, W, H, low, lw, lh, 0);
    const ref = resizeBilinear(low, lw, lh, W, H);
    let maxDiff = 0;
    for (let i = 0; i < out.length; i++) maxDiff = Math.max(maxDiff, Math.abs(out[i] - ref[i] * 255));
    // Two bilinear steps (low → working size → full size) instead of one: close, not identical.
    expect(maxDiff).toBeLessThanOrEqual(24);
  });

  it('plan + apply is the whole operation (the GPU path shares the plan)', () => {
    const plan = planGuided(img, W, H, low, lw, lh, 0.6);
    expect(Array.from(applyGuided(plan, img, W, H))).toEqual(Array.from(guidedUpsample(img, W, H, low, lw, lh, 0.6)));
    expect(plan.coef.length).toBe(plan.cw * plan.ch * 4);
  });

  it('follows a thin bright strand the coarse matte only half sees', () => {
    // A 2 px bright «hair» sticking out of the subject into the dark background.
    const w = 128, h = 128;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const inSubject = x >= 80;
      const strand = y >= 63 && y <= 64 && x >= 40;
      const v = inSubject || strand ? 220 : 30;
      const j = (y * w + x) * 4; px[j] = px[j + 1] = px[j + 2] = v; px[j + 3] = 255;
    }
    const k = 8, lw2 = w / k, lh2 = h / k;
    const lo = new Float32Array(lw2 * lh2);
    for (let y = 0; y < lh2; y++) for (let x = 0; x < lw2; x++) {
      const cx = (x + 0.5) * k, cy = (y + 0.5) * k;
      lo[y * lw2 + x] = cx >= 80 ? 1 : Math.abs(cy - 64) < 8 && cx >= 40 ? 0.25 : 0; // the strand, faint and blurred
    }
    const guided = guidedUpsample(px, w, h, lo, lw2, lh2, 1);
    const smooth = guidedUpsample(px, w, h, lo, lw2, lh2, 0);
    // On the strand the guided matte is higher than next to it; the smooth one cannot tell them apart.
    const on = guided[63 * w + 60], off = guided[56 * w + 60];
    expect(on - off).toBeGreaterThan(60);
    expect(Math.abs(smooth[63 * w + 60] - smooth[60 * w + 60])).toBeLessThan(40);
  });
});
