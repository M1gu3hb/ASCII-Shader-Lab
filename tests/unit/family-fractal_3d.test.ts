import { describe, expect, it } from 'vitest';
import { impl } from '../../src/families/analytic/fractal3d.cpu';
import { META } from '../../src/families/meta/fractal_3d';
import { defaultParams, packParams, timeContract } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** «Fractales 3D»: contracts and periods of its presets, the forms drawn for glyphs, and that nothing stands still. */

const frame = (p: Params, t: number, w = 64, h = 32) => {
  const k = packParams(META, { ...defaultParams(META), ...p });
  impl.prep!(t, k);
  const o: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.push(impl.cpu(((x + 0.5) / w - 0.5) * 2, 0.5 - (y + 0.5) / h, t, k));
  return o;
};
const mad = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
const lit = (a: number[]) => a.filter(v => v > 24 / 255).length / a.length;

// (ray marching on the CPU: generous time when the suite shares the machine)
describe('fractales 3D', { timeout: 60_000 }, () => {
  it('contrato: sin respiración, bucle de la cámara (el Mandelbox, cada cuarto de vuelta); con ella, continuo', () => {
    for (const pr of META.presets) {
      const tc = timeContract(META, { ...defaultParams(META), ...pr.params });
      expect(tc, pr.id).toBe(pr.params.breathe === 0 ? 'bucle' : 'continuo');
      expect(pr.period !== undefined, pr.id).toBe(tc === 'bucle');
      if (tc !== 'bucle') continue;
      const turn = 6 / Math.abs(pr.params.orbit as number), box = String(pr.params.form).includes('caja') || pr.params.form === 'box';
      expect(pr.period, pr.id).toBeCloseTo(box ? turn / 4 : turn, 9);
      for (const t of [0.5, 7.7]) {
        const a = frame(pr.params, t), b = frame(pr.params, t + pr.period!);
        // (a ray that grazes the surface can land on either side of it)
        expect(a.filter((v, i) => Math.abs(v - b[i]) > 0.02).length / a.length, `${pr.id} t=${t}`).toBeLessThan(0.01);
        expect(mad(a, frame(pr.params, t + pr.period! / 2.3)), `${pr.id} entre medias`).toBeGreaterThan(0.01);
      }
    }
  });

  it('ningún preset se queda quieto ni vacío, tampoco a los diez minutos', () => {
    for (const pr of META.presets) for (const t of [1, 61, 600]) {
      const a = frame(pr.params, t), b = frame(pr.params, t + 2);
      expect(mad(a, b), `${pr.id} t=${t}`).toBeGreaterThan(0.003);
      expect(lit(b), `${pr.id} t=${t}`).toBeGreaterThan(0.05);
      expect(lit(b), `${pr.id} t=${t}`).toBeLessThan(0.9);
    }
  });

  it('las formas lisas se leen a tamaño de glifo: menos grano que las de siempre', () => {
    // grain: the mean jump between neighbouring cells inside the figure, on a glyph-sized grid
    const grain = (p: Params) => {
      const w = 96, h = 48, f = frame(p, 3, w, h);
      let s = 0, n = 0;
      for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) {
        const a = f[y * w + x], b = f[y * w + x - 1];
        if (a > 0.02 && b > 0.02) { s += Math.abs(a - b); n++; }
      }
      return s / Math.max(1, n);
    };
    const base = { power: 8, iters: 6, cut: 0, orbit: 0.2, dist: 3, breathe: 0, light: 0.6 };
    expect(grain({ ...base, form: 'liso' })).toBeLessThan(grain({ ...base, form: 'bulb' }) * 0.8);
    expect(grain({ ...base, form: 'cajalisa', iters: 9 })).toBeLessThan(grain({ ...base, form: 'box', iters: 9 }) * 0.8);
  });

  it('la Julia cambia de forma con la respiración y la potencia elige otra concha', () => {
    const j = { form: 'julia', power: 7, iters: 9, cut: 0, orbit: 0, dist: 2.6, breathe: 0.6, light: 0.5 };
    expect(mad(frame(j, 0), frame(j, 4))).toBeGreaterThan(0.02);
    expect(mad(frame({ ...j, breathe: 0 }, 0), frame({ ...j, breathe: 0 }, 4))).toBe(0);
    expect(mad(frame({ ...j, breathe: 0 }, 0), frame({ ...j, breathe: 0, power: 2 }, 0))).toBeGreaterThan(0.02);
  });
});
