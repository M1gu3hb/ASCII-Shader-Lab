import { describe, expect, it } from 'vitest';
import { blurAlpha, boxesForGauss, combine, partCoverage, rasterFrames, rasterizeMask, type MaskInputs } from '../../src/project/masks';
import type { Mask, MaskPart } from '../../src/project/types';

const W = 200, H = 100;
const inp = (o: Partial<MaskInputs> = {}): MaskInputs => ({ w: W, h: H, scale: 1, t: 0, ...o });
const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);
const at = (a: Float32Array, x: number, y: number, w = W) => a[y * w + x];
const mask = (parts: MaskPart[], o: Partial<Mask> = {}): Mask => ({ invert: false, feather: 0, opacity: 1, parts, ...o });
const rect = (x: number, y: number, w: number, h: number, o: Partial<MaskPart> = {}): MaskPart => ({ kind: 'rect', op: 'add', x, y, w, h, rot: 0, soft: 0, alpha: 1, ...o } as MaskPart);
const ellipse = (x: number, y: number, w: number, h: number, o: Partial<MaskPart> = {}): MaskPart => ({ kind: 'ellipse', op: 'add', x, y, w, h, rot: 0, soft: 0, alpha: 1, ...o } as MaskPart);

describe('mask geometry', () => {
  it('a rectangle covers its pixels exactly (area, inside, outside)', () => {
    const c = partCoverage(rect(0.25, 0.2, 0.5, 0.6), inp())!;
    expect(sum(c)).toBeCloseTo(0.5 * W * 0.6 * H, 0);
    expect(at(c, 100, 50)).toBe(1);
    expect(at(c, 49, 50)).toBe(0);
    expect(at(c, 50, 50)).toBe(1);
    expect(at(c, 150, 50)).toBe(0);
  });

  it('a rotated square (90°) is the same square; 45° keeps its area', () => {
    const sq = rect(0.3, 0.2, 0.3, 0.6); // 60×60 px
    const a = partCoverage(sq, inp())!, b = partCoverage({ ...sq, rot: 90 } as MaskPart, inp())!;
    let d = 0;
    for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
    expect(d).toBeLessThan(1e-3);
    expect(sum(partCoverage({ ...sq, rot: 45 } as MaskPart, inp())!) / 3600).toBeCloseTo(1, 2);
  });

  it('an ellipse has area πab and anti-aliased edges', () => {
    const c = partCoverage(ellipse(0.2, 0.1, 0.6, 0.8), inp())!; // 120×80 px → a = 60, b = 40
    expect(sum(c) / (Math.PI * 60 * 40)).toBeCloseTo(1, 2);
    const partial = Array.from(c).filter(v => v > 0 && v < 1).length;
    expect(partial).toBeGreaterThan(50);
  });

  it('a polygon covers its area; a crossing lasso stays filled (non-zero winding)', () => {
    const tri = partCoverage({ kind: 'polygon', op: 'add', pts: [0.1, 0.1, 0.9, 0.1, 0.1, 0.9], soft: 0, alpha: 1 }, inp())!;
    expect(sum(tri) / (0.5 * 160 * 80)).toBeCloseTo(1, 2);
    // a loop drawn twice round (winding 2) is filled once, not cancelled
    const sq = [0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8];
    const twice = partCoverage({ kind: 'polygon', op: 'add', pts: [...sq, ...sq], soft: 0, alpha: 1 }, inp())!;
    expect(sum(twice) / (120 * 60)).toBeCloseTo(1, 2);
  });

  it('a stroke is a capsule: 2rL + πr², thinner with less pressure, soft with less hardness', () => {
    const base = { kind: 'stroke' as const, op: 'add' as const, pts: [0.25, 0.5, 0.75, 0.5], size: 0.2, hardness: 1, alpha: 1 };
    const r = 0.2 * H / 2, L = 100;
    expect(sum(partCoverage(base, inp())!) / (2 * r * L + Math.PI * r * r)).toBeCloseTo(1, 1);
    const light = partCoverage({ ...base, pressure: [0.5, 0.5] }, inp())!;
    expect(sum(light) / (2 * r / 2 * L + Math.PI * r * r / 4)).toBeCloseTo(1, 1);
    const soft = partCoverage({ ...base, hardness: 0 }, inp())!;
    expect(at(soft, 125, 50)).toBeGreaterThan(0.98);
    expect(at(soft, 125, 50 + 5)).toBeGreaterThan(0.2);
    expect(at(soft, 125, 50 + 5)).toBeLessThan(0.9);
    expect(sum(partCoverage({ ...base, pressure: [0, 0] }, inp())!)).toBe(0);
    // one point: a dot
    expect(sum(partCoverage({ ...base, pts: [0.5, 0.5] }, inp())!) / (Math.PI * r * r)).toBeCloseTo(1, 1);
  });

  it('strength scales a part; soft blurs it without moving its mass', () => {
    const c = partCoverage(rect(0.3, 0.3, 0.4, 0.4, { alpha: 0.5 }), inp())!;
    expect(at(c, 100, 50)).toBe(0.5);
    const hard = partCoverage(rect(0.3, 0.3, 0.4, 0.4), inp())!;
    const soft = partCoverage(rect(0.3, 0.3, 0.4, 0.4, { soft: 4 } as Partial<MaskPart>), inp())!;
    expect(sum(soft)).toBeCloseTo(sum(hard), -1);
    expect(at(soft, 60, 50)).toBeGreaterThan(0.3);
    expect(at(soft, 60, 50)).toBeLessThan(0.7);
  });
});

describe('mask ops', () => {
  it('add is a union (a + c − a·c), subtract removes, intersect keeps the overlap', () => {
    const a = new Float32Array([0, 0.5, 1, 0.5]), c = new Float32Array([0.5, 0.5, 0, 1]);
    const u = a.slice(); combine(u, c, 'add');
    expect(Array.from(u)).toEqual([0.5, 0.75, 1, 1]);
    const s = a.slice(); combine(s, c, 'subtract');
    expect(Array.from(s)).toEqual([0, 0.25, 1, 0]);
    const i = a.slice(); combine(i, c, 'intersect');
    expect(Array.from(i)).toEqual([0, 0.25, 0, 0.5]);
  });

  it('parts combine in order; a first subtract or intersect starts from everything; no parts = all', () => {
    const two = rasterizeMask(mask([rect(0, 0, 0.5, 1), rect(0.25, 0, 0.5, 1)]), inp());
    expect(sum(two)).toBeCloseTo(0.75 * W * H, 0);
    const hole = rasterizeMask(mask([rect(0, 0, 1, 1), ellipse(0.4, 0.3, 0.2, 0.4, { op: 'subtract' })]), inp());
    expect(at(hole, 100, 50)).toBe(0);
    expect(at(hole, 10, 10)).toBe(1);
    const firstSub = rasterizeMask(mask([rect(0, 0, 0.5, 1, { op: 'subtract' })]), inp());
    expect(sum(firstSub)).toBeCloseTo(0.5 * W * H, 0);
    const inter = rasterizeMask(mask([rect(0, 0, 0.6, 1), rect(0.4, 0, 0.6, 1, { op: 'intersect' })]), inp());
    expect(sum(inter)).toBeCloseTo(0.2 * W * H, 0);
    expect(sum(rasterizeMask(mask([]), inp()))).toBe(W * H);
  });

  it('invert, opacity and feather apply to the whole mask', () => {
    const m = mask([rect(0.25, 0.25, 0.5, 0.5)]);
    const inv = rasterizeMask({ ...m, invert: true }, inp());
    expect(sum(inv)).toBeCloseTo(0.75 * W * H, 0);
    const half = rasterizeMask({ ...m, opacity: 0.5 }, inp());
    expect(at(half, 100, 50)).toBe(0.5);
    const f = rasterizeMask({ ...m, feather: 6 }, inp());
    expect(sum(f)).toBeCloseTo(0.25 * W * H, -1);
    expect(at(f, 50, 50)).toBeGreaterThan(0.2);
    expect(at(f, 50, 50)).toBeLessThan(0.8);
    expect(at(f, 100, 50)).toBeCloseTo(1, 2);
  });

  it('sizes are output px: a half-size render of a feathered mask is the full one made smaller', () => {
    const m = mask([ellipse(0.2, 0.1, 0.6, 0.8)], { feather: 8 });
    const full = rasterizeMask(m, inp());
    const small = rasterizeMask(m, { w: W / 2, h: H / 2, scale: 0.5, t: 0 });
    let d = 0;
    for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) {
      const avg = (at(full, 2 * x, 2 * y) + at(full, 2 * x + 1, 2 * y) + at(full, 2 * x, 2 * y + 1) + at(full, 2 * x + 1, 2 * y + 1)) / 4;
      d = Math.max(d, Math.abs(avg - at(small, x, y, W / 2)));
    }
    expect(d).toBeLessThan(0.08);
  });

  it('a raster part reads its picture (and the right frame of a tracked one); a missing picture counts as empty', () => {
    const img = new Uint8ClampedArray(W * H);
    for (let i = 0; i < img.length; i++) img[i] = (i % W) < W / 2 ? 255 : 0;
    const ref = { id: 'aaaaaaaaaaaaaaaa', kind: 'image' as const, w: W, h: H };
    const part: MaskPart = { kind: 'raster', op: 'add', media: ref, soft: 0, alpha: 1 };
    const got = rasterizeMask(mask([part]), inp({ raster: r => (r.id === ref.id ? img : null) }));
    expect(sum(got)).toBeCloseTo(W * H / 2, 0);
    expect(sum(rasterizeMask(mask([part]), inp({ raster: () => null })))).toBe(0);
    const f1 = { ...ref, id: 'bbbbbbbbbbbbbbbb' }, f2 = { ...ref, id: 'cccccccccccccccc' };
    const tracked = { ...part, frames: [{ t: 1, media: f1 }, { t: 2, media: f2 }] } as Extract<MaskPart, { kind: 'raster' }>;
    expect(rasterFrames(tracked, 0.5).a.id).toBe(ref.id);
    expect(rasterFrames(tracked, 1.5).a.id).toBe(f1.id);
    expect(rasterFrames(tracked, 9).a.id).toBe(f2.id);
    expect(rasterFrames({ ...tracked, interp: true }, 1.25)).toMatchObject({ a: f1, b: f2, k: 0.25 });
  });

  it('a colour part keeps the pixels near a colour, with a soft ramp', () => {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const x = i % W;
      px[i * 4] = x < 100 ? 30 : 200; px[i * 4 + 1] = x < 100 ? 120 : 200; px[i * 4 + 2] = x < 100 ? 220 : 200; px[i * 4 + 3] = 255;
    }
    const part: MaskPart = { kind: 'color', op: 'add', source: 'foto', color: '#1e78dc', tol: 0.05, soft: 0.1, alpha: 1 };
    const got = rasterizeMask(mask([part]), inp({ pixels: id => (id === 'foto' ? px : null) }));
    expect(at(got, 10, 10)).toBe(1);
    expect(at(got, 150, 10)).toBe(0);
  });
});

describe('blur', () => {
  it('keeps a flat field flat (edges clamped) and the mass of an impulse', () => {
    const flat = new Float32Array(64 * 64).fill(0.7);
    blurAlpha(flat, 64, 64, 5);
    for (const v of flat) expect(v).toBeCloseTo(0.7, 5);
    const imp = new Float32Array(64 * 64);
    imp[32 * 64 + 32] = 1;
    blurAlpha(imp, 64, 64, 3);
    expect(sum(imp)).toBeCloseTo(1, 4);
    expect(imp[32 * 64 + 32]).toBeLessThan(0.1);
    expect(boxesForGauss(3)).toHaveLength(3);
  });
});
