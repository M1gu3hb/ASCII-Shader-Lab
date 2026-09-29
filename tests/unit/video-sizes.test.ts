import { describe, expect, it } from 'vitest';
import { etaText, memoryCap, outputSize, videoBytes } from '../../src/video/sizes';

const p = (w: number, h: number) => ({ canvas: { w, h, bg: '#000', transparent: false } });

describe('output size', () => {
  it('defaults to the project size; one side keeps the aspect', () => {
    expect(outputSize(p(1920, 1080), {}, true)).toMatchObject({ W: 1920, H: 1080, scale: 1, notes: [] });
    expect(outputSize(p(1920, 1080), { width: 1280 }, true)).toMatchObject({ W: 1280, H: 720 });
    expect(outputSize(p(1920, 1080), { height: 360 }, false)).toMatchObject({ W: 640, H: 360 });
  });
  it('even sizes for video (4:2:0), odd kept for GIF/PNG', () => {
    expect(outputSize(p(321, 181), {}, true)).toMatchObject({ W: 320, H: 180 });
    expect(outputSize(p(321, 181), {}, false)).toMatchObject({ W: 321, H: 181 });
  });
  it('caps video at 4K and says so; another aspect is covered and cropped', () => {
    const big = outputSize(p(8000, 4000), {}, true);
    expect(big.W).toBe(3840);
    expect(big.notes[0]).toMatch(/4K/);
    const sq = outputSize(p(1920, 1080), { width: 1080, height: 1080 }, true);
    expect(sq.scale).toBeCloseTo(1, 6);
    expect(sq.notes[0]).toMatch(/recorta/);
  });
});

describe('memory of an export', () => {
  it('estimates a minute of 1080p in tens of MB, and refuses hours of 4K', () => {
    const minute = videoBytes('av1', 1920, 1080, 60);
    expect(minute).toBeGreaterThan(20e6);
    expect(minute).toBeLessThan(80e6);
    expect(videoBytes('avc', 3840, 2160, 3600)).toBeGreaterThan(memoryCap(8));
    expect(videoBytes('vp9', 1280, 720, 10, true)).toBeGreaterThan(videoBytes('vp9', 1280, 720, 10));
  });
  it('a smaller cap on devices that report little memory', () => {
    expect(memoryCap(2)).toBeLessThan(memoryCap(8));
    expect(memoryCap(undefined)).toBe(1.5e9);
  });
  it('ETA in words', () => {
    expect(etaText(3)).toBe('unos segundos');
    expect(etaText(42)).toBe('≈40 s');
    expect(etaText(600)).toBe('≈10 min');
    expect(etaText(NaN)).toBe('');
  });
});
