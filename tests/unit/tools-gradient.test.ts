import { describe, expect, it } from 'vitest';
import { partCoverage, rasterizeMask, type MaskInputs } from '../../src/project/masks';
import { normMask, normMaskPart } from '../../src/project/normalize';
import type { MaskGradientPart, MaskPart } from '../../src/project/types';

const W = 200, H = 100;
const inp = (o: Partial<MaskInputs> = {}): MaskInputs => ({ w: W, h: H, scale: 1, t: 0, ...o });
const at = (a: Float32Array, x: number, y: number) => a[y * W + x];
const grad = (o: Partial<MaskGradientPart> = {}): MaskGradientPart => ({
  kind: 'gradient', op: 'add', shape: 'linear', x0: 0.25, y0: 0.5, x1: 0.75, y1: 0.5, alpha0: 0, alpha1: 1, alpha: 1, ...o,
});

describe('gradient mask part: rasterisation', () => {
  it('a linear ramp goes from alpha0 to alpha1 along its segment and holds beyond both ends', () => {
    const c = partCoverage(grad(), inp())!;
    expect(at(c, 10, 50)).toBeCloseTo(0, 5);
    expect(at(c, 190, 50)).toBeCloseTo(1, 5);
    // x = 100 is the middle of [50, 150] (pixel centres at x + 0.5)
    expect(at(c, 100, 50)).toBeCloseTo(0.505, 2);
    expect(at(c, 75, 20)).toBeCloseTo(at(c, 75, 80), 6); // constant across the ramp
    // monotonic along the row
    for (let x = 1; x < W; x++) expect(at(c, x, 50)).toBeGreaterThanOrEqual(at(c, x - 1, 50) - 1e-6);
  });

  it('a diagonal ramp is measured in pixels (the frame is not square)', () => {
    const c = partCoverage(grad({ x0: 0, y0: 0, x1: 1, y1: 1 }), inp())!;
    // pixels on a line perpendicular to (200, 100) through the centre have the same strength
    const k = (x: number, y: number) => ((x + 0.5) * 200 + (y + 0.5) * 100) / (200 * 200 + 100 * 100);
    expect(at(c, 100, 50)).toBeCloseTo(k(100, 50), 2);
    expect(at(c, 110, 30)).toBeCloseTo(k(110, 30), 2);
    expect(at(c, 90, 70)).toBeCloseTo(k(90, 70), 2);
  });

  it('a radial one is round in pixels, alpha0 at the centre and alpha1 outside', () => {
    const c = partCoverage(grad({ shape: 'radial', x0: 0.5, y0: 0.5, x1: 0.7, y1: 0.5, alpha0: 1, alpha1: 0 }), inp())!; // radius 40 px
    expect(at(c, 100, 50)).toBeGreaterThan(0.98);
    expect(at(c, 100 + 20, 50)).toBeCloseTo(at(c, 100, 50 + 20), 2); // round, although the frame is 2:1
    expect(at(c, 100 + 20, 50)).toBeCloseTo(0.5, 1);
    expect(at(c, 100 + 45, 50)).toBe(0);
    expect(at(c, 5, 5)).toBe(0);
  });

  it('ease shapes the ramp; the overall strength scales it; a zero-length ramp is alpha1', () => {
    const lin = partCoverage(grad(), inp())!;
    const eased = partCoverage(grad({ ease: { kind: 'in' } }), inp())!;
    expect(at(eased, 100, 50)).toBeLessThan(at(lin, 100, 50) - 0.1);
    expect(at(eased, 149, 50)).toBeGreaterThan(0.95);
    const half = partCoverage(grad({ alpha: 0.5 }), inp())!;
    expect(at(half, 190, 50)).toBeCloseTo(0.5, 5);
    const zero = partCoverage(grad({ x1: 0.25, alpha1: 0.3 }), inp())!;
    expect(at(zero, 10, 10)).toBeCloseTo(0.3, 5);
    expect(at(zero, 190, 90)).toBeCloseTo(0.3, 5);
  });

  it('combines with the other parts like any part (a subtracted fade over a rectangle)', () => {
    const parts: MaskPart[] = [
      { kind: 'rect', op: 'add', x: 0, y: 0, w: 1, h: 1, rot: 0, soft: 0, alpha: 1 },
      grad({ op: 'subtract' }),
    ];
    const m = rasterizeMask({ invert: false, feather: 0, opacity: 1, parts }, inp());
    expect(at(m, 10, 50)).toBeCloseTo(1, 5);
    expect(at(m, 190, 50)).toBeCloseTo(0, 5);
    expect(at(m, 100, 50)).toBeCloseTo(0.495, 2);
  });
});

describe('gradient mask part: normalisation', () => {
  it('keeps a valid part as it is', () => {
    const g = grad({ shape: 'radial', ease: { kind: 'inOut' }, alpha: 0.8 });
    expect(normMaskPart(JSON.parse(JSON.stringify(g)))).toEqual(g);
  });

  it('fills defaults, clamps ranges, drops unknown shapes and bad eases to valid ones', () => {
    const n = normMaskPart({ kind: 'gradient', shape: 'conic', x0: 99, y0: 'x', alpha0: 3, alpha1: -2, ease: { kind: 'nope' } }) as MaskGradientPart;
    expect(n.kind).toBe('gradient');
    expect(n.shape).toBe('linear');
    expect(n.op).toBe('add');
    expect(n.x0).toBe(10);
    expect(n.y0).toBe(0.2);
    expect(n.alpha0).toBe(1);
    expect(n.alpha1).toBe(0);
    expect(n.alpha).toBe(1);
    expect(n.ease).toEqual({ kind: 'linear' });
    expect('ease' in (normMaskPart({ kind: 'gradient' }) as object)).toBe(false);
  });

  it('survives a mask round trip with the other parts', () => {
    const m = { invert: false, feather: 3, opacity: 1, parts: [grad(), { kind: 'rect', op: 'subtract', x: 0, y: 0, w: 0.5, h: 0.5, rot: 0, soft: 0, alpha: 1 }] };
    expect(normMask(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });
});
