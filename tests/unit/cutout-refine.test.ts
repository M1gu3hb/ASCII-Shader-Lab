import { describe, expect, it } from 'vitest';
import {
  colorMatte, combine, cutoutRGBA, estimateForeground, featherMatte, gaussBoxes, iou, parseColor, shiftMatte, stampStroke,
} from '../../src/cutout/refine';

const disc = (w: number, h: number, cx: number, cy: number, r: number) => {
  const a = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) a[y * w + x] = 255;
  return a;
};
const area = (a: Uint8ClampedArray) => a.reduce((n, v) => n + v / 255, 0);
const radiusOf = (a: Uint8ClampedArray) => Math.sqrt(area(a) / Math.PI);

describe('foreground colour estimation (blur fusion)', () => {
  it.each([[160, 40, 1], [2200, 1200, 4]])('removes the old background colour from semi-transparent edge pixels (%i × %i)', (W, H, S) => {
    // Composite I = αF + (1-α)B: a red subject over a blue-green background that changes across the image,
    // with a soft alpha ramp (hair-like). The large image goes through the reduced-resolution averaging.
    const F = [220, 40, 30];
    const alpha = new Uint8ClampedArray(W * H);
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = Math.min(1, Math.max(0, (x - 60 * S) / (24 * S)));
      const B = [20, 90 + (x / S) * 0.5, 200];
      const i = y * W + x;
      alpha[i] = Math.round(a * 255);
      for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(a * F[c] + (1 - a) * B[c]);
      rgba[i * 4 + 3] = 255;
    }
    const est = estimateForeground(rgba, alpha, W, H, { r1: 30 * S, r2: 3 * S });
    let errI = 0, errF = 0, n = 0;
    for (let y = 5; y < H - 5; y += S) for (let x = 66 * S; x < 82 * S; x++) { // the soft band, away from its ends
      const i = y * W + x;
      for (let c = 0; c < 3; c++) { errI += Math.abs(rgba[i * 4 + c] - F[c]); errF += Math.abs(est[i * 3 + c] - F[c]); }
      n++;
    }
    expect(errF / n).toBeLessThan(0.4 * (errI / n));
    // Opaque pixels keep the photo's colour exactly.
    const i = 20 * W + W - 10;
    expect([est[i * 3], est[i * 3 + 1], est[i * 3 + 2]]).toEqual([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
  });

  it('cutoutRGBA blends by the amount and carries the matte as alpha', () => {
    const W = 4, H = 1;
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
    const alpha = new Uint8ClampedArray([0, 255, 255, 0]);
    const out = cutoutRGBA(rgba, alpha, W, H, 0);
    expect(Array.from(out)).toEqual([10, 20, 30, 0, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 0]);
  });
});

describe('edge shift', () => {
  const W = 120, H = 120;
  const a = disc(W, H, 60, 60, 30);

  it('expands and contracts by the given pixels', () => {
    expect(radiusOf(shiftMatte(a, W, H, 3))).toBeCloseTo(33, 0);
    expect(radiusOf(shiftMatte(a, W, H, -3))).toBeCloseTo(27, 0);
    expect(radiusOf(shiftMatte(a, W, H, 8))).toBeCloseTo(38, 0);
  });

  it('is round (a disc stays a disc) and fractional shifts fall in between', () => {
    const s = shiftMatte(a, W, H, 6);
    expect(iou(s, disc(W, H, 60, 60, 36))).toBeGreaterThan(0.95);
    const r2 = radiusOf(shiftMatte(a, W, H, 2)), r25 = radiusOf(shiftMatte(a, W, H, 2.5)), r3 = radiusOf(shiftMatte(a, W, H, 3));
    expect(r25).toBeGreaterThan(r2);
    expect(r25).toBeLessThan(r3);
  });

  it('does not touch the input and 0 is a copy', () => {
    const copy = new Uint8ClampedArray(a);
    shiftMatte(a, W, H, -4);
    expect(a).toEqual(copy);
    expect(shiftMatte(a, W, H, 0)).toEqual(a);
  });
});

describe('feather', () => {
  it('softens a hard edge while keeping the area', () => {
    const W = 100, H = 100;
    const a = disc(W, H, 50, 50, 25);
    const f = featherMatte(a, W, H, 8);
    expect(Math.abs(area(f) - area(a)) / area(a)).toBeLessThan(0.03);
    let soft = 0, hardSoft = 0;
    for (let i = 0; i < a.length; i++) { if (f[i] > 10 && f[i] < 245) soft++; if (a[i] > 10 && a[i] < 245) hardSoft++; }
    expect(hardSoft).toBe(0);
    expect(soft).toBeGreaterThan(2 * Math.PI * 25 * 6);
    expect(f[50 * W + 50]).toBe(255);
  });

  it('approximates a Gaussian with three boxes', () => {
    const r = gaussBoxes(4);
    expect(r).toHaveLength(3);
    const variance = r.reduce((s, k) => s + ((2 * k + 1) ** 2 - 1) / 12, 0);
    expect(Math.sqrt(variance)).toBeCloseTo(4, 0);
  });
});

describe('brush strokes', () => {
  const W = 64, H = 64;

  it('keep paints opaque along the path, remove paints transparent', () => {
    const m = new Uint8ClampedArray(W * H);
    const rect = stampStroke(m, W, H, [{ x: 10, y: 32 }, { x: 54, y: 32 }], 'keep', 8, 1);
    for (let x = 10; x <= 54; x++) expect(m[32 * W + x]).toBe(255);
    expect(m[20 * W + 32]).toBe(0);
    expect(rect).toEqual({ x: 6, y: 28, w: 53, h: 9 });
    stampStroke(m, W, H, [{ x: 32, y: 20 }, { x: 32, y: 44 }], 'remove', 6, 1);
    expect(m[32 * W + 32]).toBe(0);
    expect(m[32 * W + 20]).toBe(255);
  });

  it('soft brushes fall off and do not build up when dabs overlap', () => {
    const a = new Uint8ClampedArray(W * H);
    stampStroke(a, W, H, [{ x: 32, y: 32 }], 'keep', 30, 0);
    expect(a[32 * W + 32]).toBeGreaterThan(240);
    expect(a[32 * W + 42]).toBeGreaterThan(0);
    expect(a[32 * W + 42]).toBeLessThan(a[32 * W + 36]);
    const b = new Uint8ClampedArray(a);
    stampStroke(b, W, H, [{ x: 32, y: 32 }, { x: 32, y: 32 }], 'keep', 30, 0);
    expect(b).toEqual(a);
  });

  it('pressure scales the dab and opacity caps it', () => {
    const a = new Uint8ClampedArray(W * H), b = new Uint8ClampedArray(W * H);
    stampStroke(a, W, H, [{ x: 32, y: 32, pressure: 1 }], 'keep', 20, 1);
    stampStroke(b, W, H, [{ x: 32, y: 32, pressure: 0.5 }], 'keep', 20, 1);
    expect(area(b)).toBeLessThan(area(a) / 3);
    const c = new Uint8ClampedArray(W * H);
    stampStroke(c, W, H, [{ x: 32, y: 32 }], 'keep', 20, 1, 0.5);
    expect(c[32 * W + 32]).toBe(128);
  });
});

describe('colour selection and combining', () => {
  it('selects by normalised RGB distance with a soft ramp', () => {
    const px = new Uint8ClampedArray([0, 0, 255, 255, 30, 30, 255, 255, 255, 0, 0, 255]);
    const m = colorMatte(px, 3, 1, '#0000ff', 0.05, 0.1);
    expect(m[0]).toBe(255);
    expect(m[1]).toBeGreaterThan(0);
    expect(m[1]).toBeLessThan(255);
    expect(m[2]).toBe(0);
    expect(parseColor('#fa0')).toEqual([255, 170, 0]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
  });

  it('adds, subtracts and intersects', () => {
    const a = new Uint8ClampedArray([255, 255, 0, 100]), b = new Uint8ClampedArray([255, 0, 255, 200]);
    expect(Array.from(combine(a, b, 'add'))).toEqual([255, 255, 255, 200]);
    expect(Array.from(combine(a, b, 'subtract'))).toEqual([0, 255, 0, 55]);
    expect(Array.from(combine(a, b, 'intersect'))).toEqual([255, 0, 0, 100]);
  });
});
