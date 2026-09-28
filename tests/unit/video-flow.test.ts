import { describe, expect, it } from 'vitest';
import { boxSum, carryMask, fitAffine, flow, medianFlow, warp, warpAffine, type Luma } from '../../src/video/flow';
import { iou } from '../../src/video/sdf';

/** A textured test picture: smooth blobs (gradients everywhere) plus a bright square at (sx, sy). */
function scene(w: number, h: number, sx: number, sy: number, size = 18, shiftBg = 0): Luma {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x - shiftBg;
      const bg = 0.35 + 0.12 * Math.sin(X * 0.21) * Math.cos(y * 0.17) + 0.08 * Math.sin((X + y) * 0.09);
      const inside = x >= sx && x < sx + size && y >= sy && y < sy + size;
      data[y * w + x] = inside ? 0.85 + 0.08 * Math.sin((x - sx) * 0.7) * Math.cos((y - sy) * 0.6) : bg;
    }
  }
  return { w, h, data };
}

const squareMask = (w: number, h: number, sx: number, sy: number, size = 18) => {
  const m = new Float32Array(w * h);
  for (let y = sy; y < sy + size; y++) for (let x = sx; x < sx + size; x++) if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = 1;
  return m;
};

describe('box sums', () => {
  it('sum a (2r+1)² window with clamped edges', () => {
    const w = 5, h = 4;
    const src = new Float32Array(w * h).fill(1);
    const s = boxSum(src, w, h, 1);
    expect(s[2 * w + 2]).toBe(9);
    // a corner window repeats the edge pixels: still 9 samples
    expect(s[0]).toBe(9);
  });
});

describe('optical flow on synthetic translations', () => {
  const w = 96, h = 72;
  for (const [dx, dy] of [[3, 0], [0, -2], [4, 3], [-5, 2], [9, -6]] as const) {
    it(`recovers a global shift of (${dx}, ${dy}) px`, () => {
      const a = scene(w, h, 30, 24, 18, 0);
      // b = a moved by (dx, dy): everything, background included
      const b: Luma = { w, h, data: new Float32Array(w * h) };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const sx = Math.min(w - 1, Math.max(0, x - dx)), sy = Math.min(h - 1, Math.max(0, y - dy));
        b.data[y * w + x] = a.data[sy * w + sx];
      }
      const f = flow(a, b);
      // away from the borders (where the moved picture has no data)
      const m = medianFlow(f, i => { const x = i % w, y = (i - x) / w; return x > 12 && x < w - 12 && y > 12 && y < h - 12; });
      expect(m.dx).toBeCloseTo(dx, 0);
      expect(m.dy).toBeCloseTo(dy, 0);
    });
  }

  it('moves a square over a still background: the carried mask lands on the square', () => {
    const a = scene(w, h, 30, 24), b = scene(w, h, 36, 28);
    const mask = squareMask(w, h, 30, 24), want = squareMask(w, h, 36, 28);
    // where each pixel of a went in b; the object's motion fitted inside its (eroded) mask
    const fwd = flow(a, b);
    const carried = carryMask(mask, fwd);
    expect(iou(carried.mask, want)).toBeGreaterThan(0.9);
    // the square's centre moved by (6, 4)
    const [A0, A1, A2, A3, A4, A5] = carried.motion, cx = 39, cy = 33;
    expect(A0 * cx + A1 * cy + A2 - cx).toBeCloseTo(6, 0);
    expect(A3 * cx + A4 * cy + A5 - cy).toBeCloseTo(4, 0);
    // the per-pixel warp (flow from b back to a) lands there too
    const dense = warp(mask, flow(b, a));
    expect(iou(dense, want)).toBeGreaterThan(0.9);
    // the background stays put
    const bg = medianFlow(fwd, i => { const x = i % w; return x < 20 || x > 70; });
    expect(Math.abs(bg.dx)).toBeLessThan(0.5);
    expect(Math.abs(bg.dy)).toBeLessThan(0.5);
  });

  it('a flat-coloured square (no texture inside) still moves as a whole', () => {
    const flat = (sx: number, sy: number): Luma => {
      const L = scene(w, h, sx, sy);
      for (let y = sy; y < sy + 20; y++) for (let x = sx; x < sx + 20; x++) L.data[y * w + x] = 0.9;
      return L;
    };
    const carried = carryMask(squareMask(w, h, 34, 27, 20), flow(flat(34, 27), flat(40, 30)));
    expect(iou(carried.mask, squareMask(w, h, 40, 30, 20))).toBeGreaterThan(0.85);
  });

  it('fits rotation and scale, and ignores outliers', () => {
    const W = 64, H = 64;
    const A = [Math.cos(0.1) * 1.05, -Math.sin(0.1) * 1.05, 3, Math.sin(0.1) * 1.05, Math.cos(0.1) * 1.05, -2];
    const f = { w: W, h: H, data: new Float32Array(W * H * 2) };
    const inside = new Float32Array(W * H);
    for (let y = 16; y < 48; y++) for (let x = 16; x < 48; x++) {
      const i = y * W + x, cx = x + 0.5, cy = y + 0.5;
      inside[i] = 1;
      f.data[i * 2] = A[0] * cx + A[1] * cy + A[2] - cx;
      f.data[i * 2 + 1] = A[3] * cx + A[4] * cy + A[5] - cy;
      // one vector in ten is garbage
      if ((x * 7 + y * 3) % 10 === 0) { f.data[i * 2] = 25; f.data[i * 2 + 1] = -30; }
    }
    const fit = fitAffine(f, inside);
    for (let k = 0; k < 6; k++) expect(fit[k]).toBeCloseTo(A[k], 2);
    // and moving a picture by it and back gives the picture again
    const pic = new Float32Array(W * H);
    for (let i = 0; i < pic.length; i++) pic[i] = inside[i];
    const there = warpAffine(pic, W, H, fit);
    expect(iou(there, pic)).toBeLessThan(0.95);
  });
});
