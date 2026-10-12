import { describe, expect, it } from 'vitest';
import { SU, cuerdas, impl, pluckAmp, stringAt } from '../../src/families/analytic/cuerdas.cpu';
import { META } from '../../src/families/meta/cuerdas';
import { defaultParams, packParams } from '../../src/families/params';
import { setCurrentPX } from '../../src/engine/basic/px';
import type { Params } from '../../src/families/types';

/**
 * Mechanism checks of «Cuerdas vibrantes» (I-03): strings whose shape is a sum of 1–4 standing modes
 * sin(nπs)·cos(ωₙt) with a decaying envelope, plucked once per cycle (the triangle's sine series), an exact loop,
 * and a puff of rosin dust at the pluck.
 */

setCurrentPX(1 / 48);
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const W = 96, H = 48;
function frame(p: Params, t: number): Float64Array {
  const k = packParams(META, p);
  impl.prep!(t, k, undefined, 1 / H);
  const o = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = cuerdas(((x + 0.5) / W - 0.5) * 2, 0.5 - (y + 0.5) / H, t, k);
  return o;
}
const mad = (a: Float64Array, b: Float64Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

describe('cuerdas vibrantes', () => {
  it('al soltarla, la cuerda tiene la forma del pulso: la serie del triángulo, con su pico donde se pulsa', () => {
    for (const pk of [0.2, 0.35, 0.5]) {
      let best = 0, at = 0;
      for (let s = 0; s <= 1; s += 0.005) {
        stringAt(s, 0, 6, 4, pk, 1, 0.4, 0);
        // the sum of modes is exactly Σ aₙ sin(nπs) at the pluck
        let S = 0;
        for (let n = 1; n <= 4; n++) S += pluckAmp(n, pk) * Math.sin(n * Math.PI * s);
        expect(SU[0]).toBeCloseTo(S, 9);
        if (SU[0] > best) { best = SU[0]; at = s; }
      }
      expect(Math.abs(at - pk), `pico en ${pk}`).toBeLessThan(0.08);
      expect(best).toBeGreaterThan(0.85);
    }
  });

  it('pulsada en el centro, los armónicos pares no suenan y la forma es simétrica', () => {
    expect(Math.abs(pluckAmp(2, 0.5))).toBeLessThan(1e-12);
    expect(Math.abs(pluckAmp(4, 0.5))).toBeLessThan(1e-12);
    expect(Math.abs(pluckAmp(2, 0.2))).toBeGreaterThan(0.1);
    for (const tau of [0, 0.3, 1.1]) for (const s of [0.1, 0.27, 0.4]) {
      const a = stringAt(s, tau, 6, 4, 0.5, 1.3, 0.4, 0)[0], b = stringAt(1 - s, tau, 6, 4, 0.5, 1.3, 0.4, 0)[0];
      expect(a).toBeCloseTo(b, 9);
    }
  });

  it('vibra (cambia de signo en medio periodo del fundamental) y su envolvente se apaga', () => {
    const f1 = 1.2, s = 0.5;
    const u0 = stringAt(s, 0.02, 8, 1, 0.5, f1, 0.4, 0)[0];
    const uh = stringAt(s, 0.02 + 0.5 / f1, 8, 1, 0.5, f1, 0.4, 0)[0];
    expect(Math.sign(u0)).toBe(-Math.sign(uh));
    const e0 = stringAt(s, 0.05, 8, 3, 0.3, f1, 0.4, 0)[2], e1 = stringAt(s, 4, 8, 3, 0.3, f1, 0.4, 0)[2];
    expect(e0).toBeGreaterThan(3 * e1);
    // the higher modes die first: after a while the shape is mostly the fundamental
    const k = (tau: number) => { let hi = 0, lo = 0; for (let n = 1; n <= 3; n++) { const g = Math.exp(-(0.12 + 1.2 * 0.4) * (1 + 0.7 * (n - 1)) * tau); if (n === 1) lo = Math.abs(pluckAmp(n, 0.3)) * g; else hi += Math.abs(pluckAmp(n, 0.3)) * g; } return hi / lo; };
    expect(k(3)).toBeLessThan(0.5 * k(0));
  });

  it('el bucle es exacto: cada «Ciclo» todo vuelve a empezar; entre medias no', () => {
    for (const pr of META.presets) {
      const p = params(pr.id), P = p.period as number;
      expect(pr.period, pr.id).toBe(P);
      for (const t of [0.4, 2.7]) {
        expect(mad(frame(p, t), frame(p, t + P)), `${pr.id} t=${t}`).toBeLessThan(1e-6);
        expect(mad(frame(p, t), frame(p, t + P * 0.37)), `${pr.id} t=${t}`).toBeGreaterThan(1e-3);
      }
    }
  });

  it('justo antes del pulso el dedo ya la tensa hasta la forma del pulso: soltarla no es un salto', () => {
    const P = 6;
    const a = stringAt(0.3, P - 1e-6, P, 3, 0.3, 1.4, 0.4, 0.01)[0], b = stringAt(0.3, 0, P, 3, 0.3, 1.4, 0.4, 0.01)[0];
    expect(Math.abs(a - b)).toBeLessThan(1e-3);
  });

  it('al pulsar salta polvo de resina que luego se va', () => {
    const p = params('grave'), q = { ...p, rosin: 0 };
    // the only string is plucked at t = 0 (mod the cycle)
    const early = mad(frame(p, 0.6), frame(q, 0.6)), late = mad(frame(p, (p.period as number) * 0.9), frame(q, (p.period as number) * 0.9));
    expect(early).toBeGreaterThan(5e-4);
    expect(late).toBeLessThan(early * 0.1);
  });
});
