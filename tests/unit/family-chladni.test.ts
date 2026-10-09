import { describe, expect, it } from 'vitest';
import { besselDerivZero, besselJ, create, modeField } from '../../src/families/sims/chladni';
import { META } from '../../src/families/meta/chladni';
import { defaultParams } from '../../src/families/params';

/** Chladni: the mode functions and Bessel zeros are right, and the sand ends up where the plate is still. */

const G = 128;

describe('Chladni y cimática', () => {
  it('Bessel: valores y ceros conocidos', () => {
    expect(besselJ(0, 0)).toBeCloseTo(1, 12);
    expect(besselJ(1, 0)).toBeCloseTo(0, 12);
    expect(besselJ(0, 2.404825557695773)).toBeCloseTo(0, 9);
    expect(besselJ(2, 5.135622301840683)).toBeCloseTo(0, 9);
    // zeros of J_n' (free edge): j'_{0,1}, j'_{1,1}, j'_{2,1}, j'_{1,2}
    expect(besselDerivZero(0, 1)).toBeCloseTo(3.831705970207512, 7);
    expect(besselDerivZero(1, 1)).toBeCloseTo(1.841183781340659, 7);
    expect(besselDerivZero(2, 1)).toBeCloseTo(3.054236928227140, 7);
    expect(besselDerivZero(1, 2)).toBeCloseTo(5.331442773525033, 7);
  });

  it('placa cuadrada antisimétrica: la diagonal es nodal; con n y m de la misma paridad, también la otra', () => {
    const f = modeField('cuadrada', 3, 5, -1);
    for (let i = 0; i < G; i++) {
      expect(Math.abs(f[i * G + i])).toBeLessThan(1e-6);
      expect(Math.abs(f[i * G + (G - 1 - i)])).toBeLessThan(1e-6);
    }
    // and it is a real mode, not zero everywhere
    let mx = 0;
    for (const v of f) mx = Math.max(mx, Math.abs(v));
    expect(mx).toBeCloseTo(1, 6);
  });

  it('placa circular: n diámetros nodales (u = 0 a lo largo de θ = π/2n)', () => {
    const n = 3, f = modeField('circular', n, 2, -1);
    for (let r = 0.1; r < 0.95; r += 0.1) {
      const th = Math.PI / (2 * n), x = Math.round(((r * Math.cos(th) + 1) / 2) * G - 0.5), y = Math.round(((r * Math.sin(th) + 1) / 2) * G - 0.5);
      expect(Math.abs(f[y * G + x])).toBeLessThan(0.08);
    }
  });

  it('la arena se concentra donde la placa no se mueve (|u| pequeño)', () => {
    const params = { ...defaultParams(META), plate: 'cuadrada', n: 2, m: 5, mix: -1, seq: 'fijo', count: 6000 };
    const m = create({ seed: 'arena', params, res: 48 });
    const f = modeField('cuadrada', 2, 5, -1);
    const at = (x: number, y: number) => Math.abs(f[Math.min(G - 1, Math.floor((y * 0.5 + 0.5) * G)) * G + Math.min(G - 1, Math.floor((x * 0.5 + 0.5) * G))]);
    const meanU = () => {
      const pos = m.snapshot().arrays.pos as Float32Array;
      let s = 0;
      for (let i = 0; i < pos.length / 2; i++) s += at(pos[i * 2], pos[i * 2 + 1]);
      return s / (pos.length / 2);
    };
    let plate = 0;
    for (const v of f) plate += Math.abs(v);
    plate /= f.length;
    // at first the grains are spread evenly: their mean |u| is the plate's
    expect(meanU()).toBeGreaterThan(plate * 0.8);
    m.step(240);
    expect(meanU()).toBeLessThan(plate * 0.25);
    // «Golpe» throws the gathered grains under the touch back onto the moving parts of the plate
    const before = (m.snapshot().arrays.pos as Float32Array).slice();
    m.stroke!({ brush: 'golpe', x0: 0, y0: 0, x1: 0, y1: 0, r: 0.2, strength: 1 });
    const after = m.snapshot().arrays.pos as Float32Array;
    let moved = 0;
    for (let i = 0; i < before.length / 2; i++) if (Math.hypot(after[i * 2] - before[i * 2], after[i * 2 + 1] - before[i * 2 + 1]) > 0.05) moved++;
    expect(moved).toBeGreaterThan(50);
  });
});
