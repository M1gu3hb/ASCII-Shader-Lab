import { describe, expect, it } from 'vitest';
import { impl, trace } from '../../src/families/analytic/lente.cpu';
import { META } from '../../src/families/meta/lente_gravitacional';
import { defaultParams, packParams, timeContract } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/**
 * Mechanism checks of «Agujero negro»: the null geodesics of Schwarzschild (r_s = 1), u'' = −u + 3/2 u².
 * A ray from far away with impact parameter b starts at u0 ≈ 0 with du/dφ = √(1/b² − u0²(1 − u0)).
 */

const B_CRIT = (3 * Math.sqrt(3)) / 2;
const fromFar = (b: number, u0 = 1e-6) => trace(u0, Math.sqrt(1 / (b * b) - u0 * u0 * (1 - u0)), 20000);

// (generous time when the suite shares the machine)
describe('agujero negro', { timeout: 60_000 }, () => {
  it('b > (3√3/2) r_s escapa y b < (3√3/2) r_s cae dentro', () => {
    for (const b of [1, 2, 2.5, B_CRIT * 0.99, B_CRIT * 0.999]) expect(fromFar(b).fate, `b=${b}`).toBe('capture');
    for (const b of [B_CRIT * 1.001, B_CRIT * 1.01, 2.8, 4, 10]) expect(fromFar(b).fate, `b=${b}`).toBe('escape');
  });

  it('cerca de b crítico la luz da vueltas: el ángulo barrido crece sin límite', () => {
    const a = fromFar(B_CRIT * 1.05).phi, b = fromFar(B_CRIT * 1.001).phi, c = fromFar(B_CRIT * 1.00001).phi;
    expect(b).toBeGreaterThan(a + 2);
    expect(c).toBeGreaterThan(b + 3);
  });

  it('para b grande la desviación es 2 r_s / b (más el término de segundo orden 15π/16 r_s²/b²)', () => {
    for (const b of [30, 60, 120, 400]) {
      const u0 = 1e-6;
      // the ray starts asin(u0 b) short of its incoming asymptote; it sweeps π + δ between asymptotes
      const delta = fromFar(b, u0).phi + Math.asin(u0 * b) - Math.PI;
      const weak = 2 / b, second = weak + (15 * Math.PI) / (16 * b * b);
      expect(Math.abs(delta - second) / weak, `b=${b}`).toBeLessThan(0.01);
      expect(Math.abs(delta - weak) / weak, `b=${b}`).toBeLessThan(0.06);
    }
  });

  it('la sombra tiene el radio angular que ve un observador estático: sen ψ = b_c √(1 − r_s/D) / D', () => {
    for (const D of [8, 14, 25]) {
      const p = { ...defaultParams(META), dist: D, disk: 0, bg: 'estrellas', orbit: 0, incl: 30 };
      const k = packParams(META, p);
      impl.prep!(0, k);
      const psi = Math.asin((B_CRIT * Math.sqrt(1 - 1 / D)) / D), xs = 1.1 * Math.tan(psi);
      // inside: captured (black); outside: the sky (the star field never goes fully dark)
      expect(impl.cpu(xs * 0.97, 0, 0, k), `D=${D} dentro`).toBe(0);
      expect(impl.cpu(0, xs * 0.97, 0, k), `D=${D} dentro`).toBe(0);
      expect(impl.cpu(xs * 1.03, 0, 0, k), `D=${D} fuera`).toBeGreaterThan(0);
      expect(impl.cpu(-xs * 1.03, 0, 0, k), `D=${D} fuera`).toBeGreaterThan(0);
    }
  });

  it('el disco tapa la sombra por delante y su cara de atrás asoma por encima (lente)', () => {
    const p = { ...defaultParams(META), dist: 20, incl: 9, disk: 1, bg: 'estrellas', orbit: 0, rout: 10 };
    const k = packParams(META, p);
    impl.prep!(0, k);
    // straight up from the centre, past the shadow's edge: the far side of the disk, lifted by the lens
    let lifted = 0;
    for (let y = 0.2; y < 0.3; y += 0.005) lifted = Math.max(lifted, impl.cpu(0, y, 0, k));
    expect(lifted).toBeGreaterThan(0.3);
    // without the hole its far edge (r = 10 behind it) would show only this high above the centre
    const i = (9 * Math.PI) / 180;
    const flatTop = 1.1 * Math.tan(i - Math.atan((20 * Math.sin(i)) / (20 * Math.cos(i) + 10)));
    expect(flatTop).toBeLessThan(0.07);
  });

  /** The CPU twin over the 2:1 domain at time t. */
  const frame = (p: Params, t: number, w = 64, h = 32) => {
    const k = packParams(META, { ...defaultParams(META), ...p });
    impl.prep!(t, k);
    const o: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.push(impl.cpu(((x + 0.5) / w - 0.5) * 2, 0.5 - (y + 0.5) / h, t, k));
    return o;
  };
  const mad = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
  const lit = (a: number[]) => a.filter(v => v > 24 / 255).length / a.length;

  it('contrato: con el disco quieto, bucle exacto (la rejilla sola cada 15° de vuelta); girando, continuo', () => {
    for (const pr of META.presets) {
      const tc = timeContract(META, { ...defaultParams(META), ...pr.params });
      expect(tc, pr.id).toBe(pr.params.spin === 0 ? 'bucle' : 'continuo');
      expect(pr.period !== undefined, pr.id).toBe(tc === 'bucle');
      if (tc !== 'bucle') continue;
      // the camera comes back after 60 / orbit s; with the grid alone, after a 24th of that
      const full = 60 / Math.abs(pr.params.orbit as number);
      expect(pr.period).toBeCloseTo(pr.params.disk === 0 && pr.params.bg === 'rejilla' ? full / 24 : full, 9);
      for (const t of [0.4, 7.3]) {
        expect(mad(frame(pr.params, t), frame(pr.params, t + pr.period!)), `${pr.id} t=${t}`).toBeLessThan(1e-5);
        expect(mad(frame(pr.params, t), frame(pr.params, t + pr.period! / 2)), `${pr.id} medio periodo`).toBeGreaterThan(0.01);
      }
    }
  });

  it('ningún preset se queda quieto ni vacío, tampoco a los diez minutos', () => {
    for (const pr of META.presets) {
      for (const t of [1, 61, 600]) {
        const a = frame(pr.params, t), b = frame(pr.params, t + 2);
        expect(mad(a, b), `${pr.id} t=${t}`).toBeGreaterThan(0.003);
        expect(lit(b), `${pr.id} t=${t}`).toBeGreaterThan(0.02);
        expect(lit(b), `${pr.id} t=${t}`).toBeLessThan(0.97);
      }
    }
  });
});
