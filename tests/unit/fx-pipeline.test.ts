import { describe, expect, it } from 'vitest';
import {
  defaultFinish, finishBleed, finishesDependOnTime, finishWeight, FINISHES, runFinishes, type ImageDataLike,
} from '../../src/fx';
import type { Finish, FinishKind } from '../../src/project/types';
import { clone, cutout, img, meanAbsDiff, photo } from './fx-fixtures';

const KINDS = FINISHES.map(f => f.kind);
const ctx = { t: 1.25, seed: 'semilla', scale: 1, quality: 'final' as const };
const run = (i: ImageDataLike, f: Finish | Finish[], c: Partial<typeof ctx> = {}) => runFinishes(clone(i), Array.isArray(f) ? f : [f], { ...ctx, ...c });
const withP = (k: FinishKind, params: Finish['params'], amount = 1): Finish => {
  const f = defaultFinish(k);
  return { ...f, amount, params: { ...f.params, ...params } };
};
const same = (a: ImageDataLike, b: ImageDataLike) => Buffer.compare(Buffer.from(a.data.buffer), Buffer.from(b.data.buffer)) === 0;

/** Finishes whose job is to paint where the layer had nothing, or to move its edge. */
const SPREADS: FinishKind[] = ['glow', 'shadow', 'motionblur', 'blur', 'chroma', 'edges', 'pixelate'];

describe('finishes pipeline', () => {
  const P = photo(40, 30), C = cutout(36, 36);

  it('is deterministic for the same pixels, params, time and seed', () => {
    for (const k of KINDS) {
      for (const src of [P, C]) {
        const a = run(src, defaultFinish(k)), b = run(src, defaultFinish(k));
        expect(same(a, b), k).toBe(true);
      }
    }
  });

  it('changes something on a photo with its defaults (each finish does its job)', () => {
    for (const k of KINDS) {
      if (k === 'shadow') continue; // a shadow needs transparency to show
      expect(meanAbsDiff(run(P, defaultFinish(k)), P), k).toBeGreaterThan(0.5);
    }
    expect(meanAbsDiff(run(C, defaultFinish('shadow')), C)).toBeGreaterThan(0.5);
  });

  it('keeps alpha exactly, except the finishes that spread or add pixels', () => {
    for (const k of KINDS) {
      if (SPREADS.includes(k)) continue;
      const out = run(C, defaultFinish(k));
      for (let i = 3; i < C.data.length; i += 4) {
        if (out.data[i] !== C.data[i]) throw new Error(`${k} changed alpha at ${(i - 3) / 4}: ${C.data[i]} → ${out.data[i]}`);
      }
    }
  });

  it('never makes pixels appear on an empty layer, and transparent paper only removes ink', () => {
    const empty = img(24, 20, () => [0, 0, 0, 0]);
    for (const k of KINDS) {
      const out = run(empty, defaultFinish(k));
      expect(out.data.every((v, i) => i % 4 !== 3 || v === 0), k).toBe(true);
    }
    for (const k of ['dither', 'halftone', 'crosshatch', 'threshold'] as const) {
      const out = run(C, withP(k, { clear: true }));
      for (let i = 3; i < C.data.length; i += 4) expect(out.data[i]).toBeLessThanOrEqual(C.data[i]);
      expect(meanAbsDiff(out, C), k).toBeGreaterThan(1);
    }
  });

  it('keeps the spreading finishes near the layer: far transparent pixels stay empty', () => {
    // a small dot in the middle of a big transparent frame
    const dot = img(120, 120, (x, y) => (Math.hypot(x - 60, y - 60) < 5 ? [255, 240, 200, 255] : [0, 0, 0, 0]));
    for (const k of SPREADS) {
      const out = run(dot, defaultFinish(k));
      for (const [x, y] of [[2, 2], [117, 2], [2, 117], [117, 117]]) expect(out.data[(y * 120 + x) * 4 + 3], `${k} at ${x},${y}`).toBe(0);
    }
    // glow and shadow do add pixels next to it
    const g = run(dot, defaultFinish('glow'));
    expect(g.data[(60 * 120 + 72) * 4 + 3]).toBeGreaterThan(0);
    const sh = run(dot, withP('shadow', { angle: 0, distance: 12, blur: 0, opacity: 1 }));
    expect(sh.data[(60 * 120 + 72) * 4 + 3]).toBe(255);
  });

  it('mixes each finish with its input by amount; 0 is no change and off is skipped', () => {
    const inv = run(P, withP('invert', {}, 0.5));
    for (let i = 0; i < P.data.length; i += 4) expect(Math.abs(inv.data[i] - 127.5)).toBeLessThanOrEqual(1);
    expect(same(run(P, withP('grain', {}, 0)), P)).toBe(true);
    expect(same(run(P, { ...defaultFinish('invert'), on: false }), P)).toBe(true);
    expect(same(run(P, []), P)).toBe(true);
    // unknown kinds from newer projects are skipped, not fatal
    expect(same(run(P, [{ kind: 'sparkles' as FinishKind, on: true, amount: 1, params: {} }]), P)).toBe(true);
  });

  it('keeps the tones with light ink on dark paper (no accidental negative)', () => {
    const ramp = img(96, 24, x => { const v = Math.round((x / 95) * 255); return [v, v, v, 255]; });
    const meanOf = (o: ImageDataLike, x0: number, x1: number) => {
      let s = 0, n = 0;
      for (let y = 0; y < 24; y++) for (let x = x0; x < x1; x++) { s += o.data[(y * 96 + x) * 4]; n++; }
      return s / n;
    };
    const light = { ink: '#ffffff', paper: '#000000' };
    for (const f of [withP('dither', { ...light, pixel: 1 }), withP('halftone', { ...light, freq: 25 }), withP('crosshatch', { ...light, spacing: 4 }), withP('threshold', light)]) {
      const o = run(ramp, f);
      expect(meanOf(o, 72, 96), f.kind).toBeGreaterThan(meanOf(o, 0, 24) + 100);
    }
  });

  it('does not draw dark or bright rims on the edge of a flat-coloured cutout', () => {
    const disc = img(60, 60, (x, y) => { const a = Math.max(0, Math.min(1, 20 - Math.hypot(x - 30, y - 30))); return [200, 80, 40, a * 255]; });
    for (const f of [withP('sharpen', { amount: 3 }), withP('blur', { radius: 3 }), withP('blur', { radius: 9 }), withP('motionblur', { distance: 20 }), withP('chroma', { amount: 0 })]) {
      const o = run(disc, f);
      for (let i = 0; i < o.data.length; i += 4) {
        if (o.data[i + 3] < 8) continue; // colour of nearly invisible pixels is rounding noise
        expect(Math.abs(o.data[i] - 200) + Math.abs(o.data[i + 1] - 80) + Math.abs(o.data[i + 2] - 40), `${f.kind} at ${i / 4}`).toBeLessThan(12);
      }
    }
  });

  it('applies the finishes in order', () => {
    const a = run(P, [defaultFinish('invert'), withP('threshold', { level: 0.5 })]);
    const b = run(P, [withP('threshold', { level: 0.5 }), defaultFinish('invert')]);
    expect(same(a, b)).toBe(false);
  });

  it('seeds grain and noise: a different seed changes them, the same seed repeats them', () => {
    for (const k of ['grain', 'noise'] as const) {
      expect(same(run(P, defaultFinish(k), { seed: 'a' }), run(P, defaultFinish(k), { seed: 'a' }))).toBe(true);
      expect(same(run(P, defaultFinish(k), { seed: 'a' }), run(P, defaultFinish(k), { seed: 'b' }))).toBe(false);
    }
  });

  it('animates with t only when asked', () => {
    const g = defaultFinish('grain');
    expect(same(run(P, g, { t: 0 }), run(P, g, { t: 0.5 }))).toBe(false);
    const still = withP('grain', { anim: false });
    expect(same(run(P, still, { t: 0 }), run(P, still, { t: 3 }))).toBe(true);
    // within one grain frame (1/24 s) nothing changes
    expect(same(run(P, g, { t: 1.001 }), run(P, g, { t: 1.03 }))).toBe(true);
    const roll = withP('scanlines', { roll: 40 });
    expect(same(run(P, roll, { t: 0 }), run(P, roll, { t: 0.05 }))).toBe(false); // half a line
    expect(same(run(P, roll, { t: 0 }), run(P, roll, { t: 0.1 }))).toBe(true); // one whole spacing
    expect(finishesDependOnTime([g])).toBe(true);
    expect(finishesDependOnTime([still, defaultFinish('scanlines'), defaultFinish('chroma')])).toBe(false);
    expect(finishesDependOnTime([withP('chroma', { jitter: 0.5 })])).toBe(true);
  });

  it('rolls scanlines down with a positive speed', () => {
    const grey = img(8, 32, () => [180, 180, 180, 255]);
    const darkest = (o: ImageDataLike) => {
      let best = 0, v = Infinity;
      for (let y = 0; y < 8; y++) if (o.data[y * 8 * 4] < v) { v = o.data[y * 8 * 4]; best = y; }
      return best;
    };
    const f = withP('scanlines', { spacing: 8, roll: 40 });
    const a = darkest(run(grey, f, { t: 0 })), b = darkest(run(grey, f, { t: 0.05 })); // 2 px later
    expect((b - a + 8) % 8).toBe(2);
  });

  it('tells light finishes from heavy ones', () => {
    expect(finishWeight(defaultFinish('levels'))).toBe('ligero');
    expect(finishWeight(defaultFinish('dither'))).toBe('ligero'); // 2 px blocks
    expect(finishWeight(withP('dither', { pixel: 1 }))).toBe('medio');
    expect(finishWeight(withP('dither', { pixel: 1, algo: 'bayer8' }))).toBe('ligero');
    expect(finishWeight(withP('halftone', { color: 'cmyk' }))).toBe('pesado');
    expect(finishWeight(defaultFinish('motionblur'))).toBe('pesado');
    for (const k of KINDS) expect(['ligero', 'medio', 'pesado']).toContain(finishWeight(defaultFinish(k)));
  });

  it('reports how far finishes can paint outside the layer', () => {
    expect(finishBleed([defaultFinish('levels')])).toBe(0);
    expect(finishBleed([defaultFinish('glow')])).toBeGreaterThan(28);
    expect(finishBleed([withP('motionblur', { mode: 'zoom' })])).toBe(Infinity);
  });

  it('survives odd sizes and contexts', () => {
    for (const k of KINDS) {
      for (const [w, h] of [[1, 1], [1, 7], [9, 1]]) {
        const o = run(photo(w, h), defaultFinish(k), { scale: 0.37 });
        expect(o.data.length).toBe(w * h * 4);
      }
    }
    // a bad scale falls back to 1; a missing seed is the empty seed
    const a = runFinishes(clone(P), [defaultFinish('grain')], { t: 0, seed: '', scale: Number.NaN, quality: 'final' });
    const b = runFinishes(clone(P), [defaultFinish('grain')], { t: 0, seed: '', scale: 1, quality: 'final' });
    expect(same(a, b)).toBe(true);
  });
});
