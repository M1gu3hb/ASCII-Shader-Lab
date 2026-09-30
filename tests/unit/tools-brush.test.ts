import { describe, expect, it } from 'vitest';
import { flattenRun, LazyBrush, needsFlatten, planFlatten, stepSize, StrokeBuilder, strokeRuns } from '../../src/foto/tools/brush';
import { colorDistance, colorShare, colorStrength, fromHex, pickColor, toHex } from '../../src/foto/tools/color';
import { rasterizeMask, type MaskInputs } from '../../src/project/masks';
import type { Mask, MaskPart, MaskRasterPart, MaskStrokePart } from '../../src/project/types';

const W = 160, H = 100;
const inp = (o: Partial<MaskInputs> = {}): MaskInputs => ({ w: W, h: H, scale: 1, t: 0, ...o });
const stroke = (op: MaskStrokePart['op'], pts: number[], o: Partial<MaskStrokePart> = {}): MaskStrokePart => ({ kind: 'stroke', op, pts, size: 0.12, hardness: 0.6, alpha: 1, ...o });

/** Replaces each flatten plan by raster parts whose pictures the returned `raster` callback serves. */
function applyPlans(parts: MaskPart[]) {
  const store = new Map<string, Uint8ClampedArray>();
  const out = parts.slice();
  for (const plan of planFlatten(parts, inp())) {
    const pieces: MaskRasterPart[] = plan.pieces.map((pc, k) => {
      const id = `${plan.start}${k}`.padEnd(16, '0');
      store.set(id, pc.coverage);
      return { kind: 'raster', op: pc.op, media: { id, kind: 'image', w: W, h: H }, soft: 0, alpha: 1, origin: 'paint' };
    });
    out.splice(plan.start, plan.end - plan.start, ...pieces);
  }
  return { parts: out, raster: (m: { id?: string }) => store.get(m.id ?? '') ?? null };
}

const maxDiff = (a: Float32Array, b: Float32Array) => { let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d; };

describe('flattening strokes keeps the pixels', () => {
  const strokes = (): MaskPart[] => [
    stroke('add', [0.1, 0.2, 0.5, 0.3, 0.9, 0.2]),
    stroke('add', [0.2, 0.8, 0.4, 0.5], { pressure: [0.3, 1], hardness: 0 }),
    stroke('subtract', [0.1, 0.25, 0.9, 0.25], { size: 0.05, alpha: 0.7 }),
    stroke('add', [0.6, 0.6, 0.7, 0.9], { size: 0.2 }),
    stroke('intersect', [0.5, 0.5, 0.52, 0.5], { size: 1.5, hardness: 0.2 }),
  ];

  it('a mask made only of strokes (the run starts the mask: one add picture)', () => {
    const parts = strokes();
    const mask: Mask = { invert: false, feather: 0, opacity: 1, parts };
    const before = rasterizeMask(mask, inp());
    const { parts: flat, raster } = applyPlans(parts);
    expect(flat.length).toBe(1);
    expect(flat[0]).toMatchObject({ kind: 'raster', op: 'add' });
    const after = rasterizeMask({ ...mask, parts: flat }, inp({ raster }));
    expect(maxDiff(before, after)).toBeLessThanOrEqual(0.5 / 255 + 1e-6);
  });

  it('a run of mixed strokes between other parts (subtract + add pictures), with feather and invert after', () => {
    const parts: MaskPart[] = [
      { kind: 'rect', op: 'add', x: 0.2, y: 0.1, w: 0.5, h: 0.6, rot: 10, soft: 2, alpha: 1 },
      ...strokes(),
      { kind: 'ellipse', op: 'subtract', x: 0.6, y: 0.1, w: 0.3, h: 0.3, rot: 0, soft: 0, alpha: 0.5 },
    ];
    const mask: Mask = { invert: true, feather: 3, opacity: 0.9, parts };
    const before = rasterizeMask(mask, inp());
    const { parts: flat, raster } = applyPlans(parts);
    expect(flat.map(p => p.kind)).toEqual(['rect', 'raster', 'raster', 'ellipse']);
    expect(flat.slice(1, 3).map(p => p.op)).toEqual(['subtract', 'add']);
    const after = rasterizeMask({ ...mask, parts: flat }, inp({ raster }));
    // two 8-bit pictures: within about 2/255 anywhere
    expect(maxDiff(before, after)).toBeLessThan(2.5 / 255);
  });

  it('a subtract-only run in the middle becomes one subtract picture', () => {
    const parts: MaskPart[] = [
      { kind: 'rect', op: 'add', x: 0, y: 0, w: 1, h: 1, rot: 0, soft: 0, alpha: 1 },
      stroke('subtract', [0.2, 0.5, 0.8, 0.5]),
      stroke('subtract', [0.5, 0.2, 0.5, 0.8]),
    ];
    const plan = flattenRun(parts, 1, 3, inp());
    expect(plan.pieces.map(p => p.op)).toEqual(['subtract']);
  });

  it('runs and thresholds', () => {
    const p: MaskPart[] = [stroke('add', [0, 0]), { kind: 'rect', op: 'add', x: 0, y: 0, w: 1, h: 1, rot: 0, soft: 0, alpha: 1 }, stroke('add', [0, 0]), stroke('add', [0, 0])];
    expect(strokeRuns(p)).toEqual([[2, 4]]);
    expect(strokeRuns(p, 1)).toEqual([[0, 1], [2, 4]]);
    expect(needsFlatten(p)).toBe(false);
    expect(needsFlatten(Array.from({ length: 12 }, () => stroke('add', [0, 0])))).toBe(true);
    expect(needsFlatten([stroke('add', new Array(3000).fill(0.5))])).toBe(true);
  });
});

describe('brush input', () => {
  it('the lazy brush ignores moves within its string and follows beyond it', () => {
    const b = new LazyBrush({ x: 0, y: 0 }, 10);
    expect(b.update({ x: 6, y: 0 })).toBe(false);
    expect(b.brush).toEqual({ x: 0, y: 0 });
    expect(b.update({ x: 25, y: 0 })).toBe(true);
    expect(b.brush.x).toBeCloseTo(15, 9);
    const none = new LazyBrush({ x: 0, y: 0 }, 0);
    none.update({ x: 3, y: 4 });
    expect(none.brush).toEqual({ x: 3, y: 4 });
  });

  it('a stroke keeps points spaced on screen, with pressure only when asked', () => {
    const s = new StrokeBuilder(4, true);
    expect(s.add({ x: 0.1, y: 0.1 }, { x: 0, y: 0 }, 0.4)).toBe(true);
    expect(s.add({ x: 0.1, y: 0.1 }, { x: 2, y: 0 }, 0.5)).toBe(false);
    expect(s.add({ x: 0.2, y: 0.1 }, { x: 5, y: 0 }, 0.6)).toBe(true);
    const part = s.part({ op: 'add', size: 0.1, hardness: 0.5, alpha: 1 });
    expect(part.pts).toEqual([0.1, 0.1, 0.2, 0.1]);
    expect(part.pressure).toEqual([0.4, 0.6]);
    const m = new StrokeBuilder(4, false);
    m.add({ x: 0.1, y: 0.1 }, { x: 0, y: 0 }, 0.4);
    expect(m.part({ op: 'add', size: 0.1, hardness: 0.5, alpha: 1 }).pressure).toBeUndefined();
    expect(stepSize(0.1, 1)).toBeCloseTo(0.125, 6);
    expect(stepSize(0.1, -1)).toBeCloseTo(0.08, 6);
    expect(stepSize(0.49, 1)).toBe(0.5);
  });
});

describe('colour pick maths', () => {
  const img = (w: number, h: number, f: (x: number, y: number) => [number, number, number, number]) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4);
    return d;
  };

  it('distance is RGB Euclidean / (255·√3): black–white is 1, the same colour 0', () => {
    expect(colorDistance([0, 0, 0], [255, 255, 255])).toBeCloseTo(1, 9);
    expect(colorDistance([10, 20, 30], [10, 20, 30])).toBe(0);
    expect(colorDistance([255, 0, 0], [0, 0, 0])).toBeCloseTo(1 / Math.sqrt(3), 9);
    expect(toHex(fromHex('#1a2B3c'))).toBe('#1a2b3c');
  });

  it('the pick averages a small window (a noisy pixel does not decide) and ignores transparency', () => {
    const d = img(5, 5, (x, y) => (x === 2 && y === 2 ? [255, 255, 255, 255] : [100, 50, 0, 255]));
    const c = pickColor(d, 5, 5, 2.4, 2.6, 1)!;
    expect(c[0]).toBe(Math.round((8 * 100 + 255) / 9));
    expect(pickColor(d, 5, 5, 2, 2, 0)).toEqual([255, 255, 255]);
    expect(pickColor(d, 5, 5, -1, 2)).toBeNull();
    const t = img(3, 3, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 0, 255, 0]));
    expect(pickColor(t, 3, 3, 1, 1, 1)).toEqual([255, 0, 0]);
  });

  it('strength: 1 up to tol, a linear ramp of width soft, 0 beyond; share of the picture', () => {
    expect(colorStrength([100, 100, 100], [100, 100, 100], 0.1, 0.1)).toBe(1);
    const d = 0.15 * 255 * Math.sqrt(3) / Math.sqrt(3); // move each channel so the distance is 0.15
    expect(colorStrength([100 + d, 100 + d, 100 + d], [100, 100, 100], 0.1, 0.1)).toBeCloseTo(0.5, 2);
    expect(colorStrength([255, 255, 255], [0, 0, 0], 0.1, 0.1)).toBe(0);
    const half = img(8, 8, x => (x < 4 ? [0, 255, 0, 255] : [255, 0, 255, 255]));
    expect(colorShare(half, 8, 8, [0, 255, 0], 0.05, 0.05, 1)).toBeCloseTo(0.5, 6);
  });
});
