import { describe, expect, it } from 'vitest';
import { flow, impl } from '../../src/families/analytic/anillo_humo.cpu';
import { META } from '../../src/families/meta/anillo_humo';
import { defaultParams, packParams } from '../../src/families/params';
import type { Palette, Params } from '../../src/families/types';

/** Mechanism checks of «Anillo de humo» (I-26): a ring bent by polar noise, flowing outward, coloured by radius, exact loop. */

const PAL: Palette = { n: 5, rgb: new Float32Array([0.03, 0.02, 0.04, 0.23, 0.16, 0.36, 0.61, 0.37, 0.66, 0.94, 0.65, 0.72, 1, 0.95, 0.9, 0, 0, 0]) };
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const lum = (k: Float32Array, x: number, y: number, t: number) => { impl.prep!(t, k, PAL); return impl.cpu(x, y, t, k); };

describe('anillo de humo', () => {
  it('un anillo: denso a su radio, vacío en el centro y lejos de él', () => {
    const p = params('aro', { wisps: 0, core: 0 });
    const k = packParams(META, p);
    const R = p.radius as number;
    let ring = 0, inner = 0, outer = 0;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      ring += lum(k, R * c, R * s, 3); inner += lum(k, 0.25 * R * c, 0.25 * R * s, 3); outer += lum(k, (R + 0.3) * c, (R + 0.3) * s, 3);
    }
    expect(ring / 64).toBeGreaterThan(0.25);
    expect(inner / 64).toBeLessThan(0.05);
    expect(outer / 64).toBeLessThan(0.05);
  });

  it('el ruido polar dobla el anillo: su radio cambia con el ángulo (y sin ondulación no)', () => {
    const radiusAt = (k: Float32Array, a: number) => {
      let best = -1, rb = 0;
      for (let r = 0.1; r < 0.5; r += 0.002) { const v = lum(k, r * Math.cos(a), r * Math.sin(a), 4); if (v > best) { best = v; rb = r; } }
      return rb;
    };
    const sd = (k: Float32Array) => { const rs = Array.from({ length: 48 }, (_, i) => radiusAt(k, (i / 48) * Math.PI * 2)); const m = rs.reduce((s, v) => s + v, 0) / rs.length; return Math.sqrt(rs.reduce((s, v) => s + (v - m) ** 2, 0) / rs.length); };
    expect(sd(packParams(META, params('aro', { wobble: 1, wisps: 0, core: 0 })))).toBeGreaterThan(0.015);
    expect(sd(packParams(META, params('aro', { wobble: 0, wisps: 0, core: 0 })))).toBeLessThan(0.006);
  });

  it('el humo fluye hacia fuera: la textura de ahora aparece más lejos un instante después', () => {
    const L = 0.15 + 0.5 * 0.5;
    let out = 0, inward = 0;
    for (let i = 0; i < 400; i++) {
      const a = (i / 400) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a), r = 0.2 + (i % 7) * 0.03;
      // a little later, by dφ of the cycle: the same texture is found L·dφ farther out (not in)
      const ph = 0.3, d = 0.03;
      const now = flow(dx, dy, r, ph, 1.4, L, 0);
      out += Math.abs(flow(dx, dy, r + L * d, ph + d, 1.4, L, 0) - now);
      inward += Math.abs(flow(dx, dy, r - L * d, ph + d, 1.4, L, 0) - now);
    }
    expect(out).toBeLessThan(0.6 * inward);
  });

  it('el color depende del radio: el mismo a cualquier ángulo, distinto de dentro a fuera', () => {
    const k = packParams(META, params('corona'));
    impl.prep!(2, k, PAL);
    const C = new Float64Array(3);
    const hueAt = (r: number, a: number) => { impl.cpuColor!(r * Math.cos(a), r * Math.sin(a), 2, k, C); const m = Math.max(C[0], C[1], C[2], 1e-6); return [C[0] / m, C[1] / m, C[2] / m]; };
    for (const r of [0.2, 0.33, 0.45]) {
      const a = hueAt(r, 0.3), b = hueAt(r, 2.9);
      for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 6);
    }
    const inner = hueAt(0.2, 1), outer = hueAt(0.45, 1);
    expect(Math.abs(inner[0] - outer[0]) + Math.abs(inner[1] - outer[1]) + Math.abs(inner[2] - outer[2])).toBeGreaterThan(0.1);
  });

  it('bucle exacto: cada preset vuelve a su inicio al cabo de su ciclo', () => {
    for (const pr of META.presets) {
      const k = packParams(META, params(pr.id));
      expect(pr.period).toBe(pr.params.cycle);
      for (const t of [1.1, 6.4]) {
        let d = 0, dm = 0;
        for (let i = 0; i < 300; i++) {
          const x = -0.6 + (i % 20) * 0.06, y = -0.45 + Math.floor(i / 20) * 0.06;
          const a = lum(k, x, y, t);
          d += Math.abs(a - lum(k, x, y, t + pr.period!)); dm += Math.abs(a - lum(k, x, y, t + pr.period! / 3));
        }
        expect(d / 300, pr.id).toBeLessThan(1e-5);
        expect(dm / 300, pr.id).toBeGreaterThan(1e-3);
      }
    }
  });
});
