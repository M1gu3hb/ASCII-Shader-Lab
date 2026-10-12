import { describe, expect, it } from 'vitest';
import { impl, ringOf } from '../../src/families/analytic/arcos_parciales.cpu';
import { META } from '../../src/families/meta/arcos_parciales';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Arcos parciales» (I-30): incomplete arcs turning at different rates in an inclined plane. */

const PX = 14 / 720;
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const v = (k: Float32Array, x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); };
const RG = new Float64Array(7);

describe('arcos parciales', () => {
  it('cada anillo es un arco incompleto: se enciende una parte de su vuelta, no toda', () => {
    for (const id of ['orbitas', 'saturnal']) {
      const p = params(id, { balance: 0 });
      const k = packParams(META, p);
      const ct = Math.cos(((p.tilt as number) * Math.PI) / 180);
      for (let i = 0; i < (p.rings as number); i++) {
        ringOf(i, 4, k, RG, PX);
        let lit = 0;
        for (let s = 0; s < 360; s++) {
          const a = (s / 360) * Math.PI * 2;
          if (v(k, RG[0] * Math.cos(a), RG[0] * Math.sin(a) * ct, 4) > 0.25) lit++;
        }
        expect(lit / 360, `${id} anillo ${i}`).toBeGreaterThan(0.04);
        expect(lit / 360, `${id} anillo ${i}`).toBeLessThan(0.97);
      }
    }
  });

  it('los anillos giran a ritmos distintos: vueltas enteras por ciclo, en un sentido o en el otro', () => {
    const k = packParams(META, params('engranaje'));
    const rates = new Set<number>();
    for (let i = 0; i < 7; i++) {
      ringOf(i, 0, k, RG, PX);
      const a0 = RG[4], turns = RG[3];
      expect(Number.isInteger(turns)).toBe(true);
      ringOf(i, 1, k, RG, PX);
      // the start angle advances by 2π·turns per cycle
      expect(RG[4] - a0).toBeCloseTo((2 * Math.PI * turns) / (params('engranaje').cycle as number), 6);
      rates.add(turns);
    }
    expect(rates.size).toBeGreaterThanOrEqual(3);
  });

  it('el plano está inclinado: cada anillo se ve como una elipse aplastada en vertical', () => {
    const p = params('saturnal', { balance: 0, span: 1, per: 1, tail: 0 });
    const k = packParams(META, p);
    const ct = Math.cos(((p.tilt as number) * Math.PI) / 180);
    const R = ringOf(p.rings as number - 1, 2, k, RG, PX)[0];
    // along the vertical axis the ring is lit at R·cos(tilt), not at R
    let atEllipse = 0, atCircle = 0;
    for (const t of [2, 9, 17, 26]) { atEllipse += Math.max(v(k, 0, R * ct, t), v(k, 0, -R * ct, t)); atCircle += Math.max(v(k, 0, R, t), v(k, 0, -R, t)); }
    expect(atEllipse).toBeGreaterThan(1);
    expect(atCircle).toBe(0);
  });

  it('bucle exacto: cada preset vuelve a su inicio al cabo de su ciclo', () => {
    for (const pr of META.presets) {
      const k = packParams(META, params(pr.id));
      expect(pr.period).toBe(pr.params.cycle);
      for (const t of [0.9, 7.7]) {
        let d = 0, dm = 0;
        for (let i = 0; i < 400; i++) {
          const x = -0.5 + (i % 20) * 0.05, y = -0.47 + Math.floor(i / 20) * 0.048;
          const a = v(k, x, y, t);
          d += Math.abs(a - v(k, x, y, t + pr.period!)); dm += Math.abs(a - v(k, x, y, t + pr.period! / 4));
        }
        expect(d / 400, pr.id).toBeLessThan(1e-5);
        expect(dm / 400, pr.id).toBeGreaterThan(1e-3);
      }
    }
  });
});
