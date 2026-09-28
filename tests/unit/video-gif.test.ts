import { describe, expect, it } from 'vitest';
import { GIFEncoder, quantize } from 'gifenc';
import { BAYER8, gifDelay, gifPlan, indexedError, indexPixels, nearestLookup, paletteSample } from '../../src/video/gifcore';

/** A horizontal grey ramp w×h, RGBA. */
const ramp = (w: number, h: number) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = Math.round((x / (w - 1)) * 255), o = (y * w + x) * 4;
    d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
  }
  return d;
};

describe('GIF limits and timing', () => {
  it('keeps small GIFs as they are', () => {
    expect(gifPlan(640, 360, 60, 30)).toEqual({ w: 640, h: 360, fps: 30, notes: [] });
  });
  it('scales down big frames and long clips, and says so', () => {
    const big = gifPlan(1920, 1080, 30, 30);
    expect(big.w).toBe(1080);
    expect(big.notes[0]).toMatch(/1080×608/);
    const long = gifPlan(1080, 1080, 1800, 30);
    expect(long.w * long.h * 1800).toBeLessThanOrEqual(160e6 * 1.01);
    expect(long.notes[0]).toMatch(/duración/);
    expect(gifPlan(100, 100, 10, 60).fps).toBe(50);
  });
  it('delays add up to the exact length in whole centiseconds', () => {
    const d = Array.from({ length: 24 }, (_, i) => gifDelay(i, 24));
    expect(d.reduce((a, b) => a + b, 0)).toBe(1000);
    for (const x of d) expect([40, 50]).toContain(x);
    const d30 = Array.from({ length: 30 }, (_, i) => gifDelay(i, 30));
    expect(d30.reduce((a, b) => a + b, 0)).toBe(1000);
    for (const x of d30) expect(x).toBeGreaterThanOrEqual(20);
  });
});

describe('palette and dithering', () => {
  const w = 128, h = 8;
  const px = ramp(w, h);
  const pal = [[0, 0, 0], [85, 85, 85], [170, 170, 170], [255, 255, 255]];

  it('the Bayer matrix holds 0..63 once each', () => {
    expect([...BAYER8].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i));
  });

  it('nearest lookup is deterministic and never picks a reserved slot', () => {
    const near = nearestLookup([...pal, [0, 0, 0]], 4);
    expect(near(10, 10, 10)).toBe(0);
    expect(near(250, 250, 250)).toBe(3);
    const noBlack = nearestLookup([[255, 255, 255], [0, 0, 0]], 1);
    expect(noBlack(0, 0, 0)).toBe(0);
  });

  it('dithering keeps the average tone of a ramp that 4 greys cannot show', () => {
    const mean = (idx: Uint8Array, x0: number, x1: number) => {
      let s = 0, n = 0;
      for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) { s += pal[idx[y * w + x]][0]; n++; }
      return s / n;
    };
    const none = indexPixels(px, w, h, pal, 'none');
    const bayer = indexPixels(px, w, h, pal, 'bayer');
    const floyd = indexPixels(px, w, h, pal, 'floyd');
    // columns 16..32 average ~48: without dithering they collapse to 0 or 85
    const want = (16 + 31) / 2 / 127 * 255;
    expect(Math.abs(mean(none, 16, 32) - want)).toBeGreaterThan(10);
    expect(Math.abs(mean(bayer, 16, 32) - want)).toBeLessThan(10);
    expect(Math.abs(mean(floyd, 16, 32) - want)).toBeLessThan(6);
    // each is deterministic
    expect(indexPixels(px, w, h, pal, 'floyd')).toEqual(floyd);
    expect(indexPixels(px, w, h, pal, 'bayer')).toEqual(bayer);
    // plain mapping has the lowest per-pixel error, dithering trades it for tone
    expect(indexedError(px, none, pal)).toBeLessThan(indexedError(px, floyd, pal));
  });

  it('transparent pixels go to the reserved index', () => {
    const d = ramp(4, 1);
    d[3] = 0;
    const idx = indexPixels(d, 4, 1, [...pal, [0, 0, 0]], 'floyd', 4);
    expect(idx[0]).toBe(4);
    expect(idx[1]).toBeLessThan(4);
  });

  it('a global palette from several frames covers colours of all of them', () => {
    const red = new Uint8ClampedArray(64 * 4), blue = new Uint8ClampedArray(64 * 4);
    for (let i = 0; i < 64; i++) { red.set([255, 0, 0, 255], i * 4); blue.set([0, 0, 255, 255], i * 4); }
    const s = paletteSample([red, blue]);
    const palette = quantize(s, 16);
    const near = nearestLookup(palette);
    expect(palette[near(255, 0, 0)][0]).toBeGreaterThan(200);
    expect(palette[near(0, 0, 255)][2]).toBeGreaterThan(200);
  });

  it('gifenc writes a looping GIF with our indices', () => {
    const gif = GIFEncoder();
    const idx = indexPixels(px, w, h, pal, 'bayer');
    gif.writeFrame(idx, w, h, { palette: pal, delay: 100, repeat: 0 });
    gif.writeFrame(idx, w, h, { delay: 100 });
    gif.finish();
    const bytes = gif.bytes();
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a');
    // NETSCAPE2.0 loop extension present
    expect(new TextDecoder().decode(bytes)).toContain('NETSCAPE2.0');
  });
});
