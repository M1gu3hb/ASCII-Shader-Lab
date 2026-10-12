import { describe, expect, it } from 'vitest';
import { besselDerivZero, besselJ, create, modeField } from '../../src/families/sims/chladni';
import { META } from '../../src/families/meta/chladni';
import { defaultParams, timeContract } from '../../src/families/params';
import type { FieldModel } from '../../src/families/types';

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

describe('Chladni en todo el lienzo', () => {
  it('la placa del lienzo es el doble de ancha y la arena se junta donde no se mueve', () => {
    const f = modeField('lienzo', 3, 5, -1);
    expect(f.length).toBe(2 * G * G);
    const m = create({ seed: 'lienzo', params: { ...defaultParams(META), plate: 'lienzo', n: 3, m: 5, mix: -1, seq: 'fijo', count: 8000 }, res: 48 });
    const at = (x: number, y: number) => Math.abs(f[Math.min(G - 1, Math.floor((y * 0.5 + 0.5) * G)) * 2 * G + Math.min(2 * G - 1, Math.floor((x * 0.5 + 0.5) * 2 * G))]);
    const meanU = () => {
      const pos = m.snapshot().arrays.pos as Float32Array;
      let s = 0;
      for (let i = 0; i < pos.length / 2; i++) s += at(pos[i * 2], pos[i * 2 + 1]);
      return s / (pos.length / 2);
    };
    let plate = 0;
    for (const v of f) plate += Math.abs(v);
    plate /= f.length;
    expect(meanU()).toBeGreaterThan(plate * 0.8);
    m.step(300);
    expect(meanU()).toBeLessThan(plate * 0.3);
    // and it fills the canvas: sand on both sides and near the edges
    const r = new Uint8Array(m.w * m.h);
    m.render(r, 0);
    const quarter = (x0: number) => { let s = 0; for (let y = 0; y < m.h; y++) for (let x = x0; x < x0 + m.w / 4; x++) s += r[y * m.w + x]; return s; };
    expect(quarter(0)).toBeGreaterThan(0.5 * quarter(m.w / 4));
    expect(quarter((3 * m.w) / 4)).toBeGreaterThan(0.5 * quarter(m.w / 4));
  });
});

describe('Chladni: presets continuos', { timeout: 60_000 }, () => {
  const rate = META.budget.rate!, warm = META.budget.warmup!;
  const ras = (m: FieldModel, t: number) => { const o = new Uint8Array(m.w * m.h); m.render(o, t); return o; };
  const mad = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
  const lit = (a: Uint8Array) => { let n = 0; for (const v of a) if (v > 24) n++; return n / a.length; };
  for (const pr of META.presets) {
    const p = { ...defaultParams(META), ...pr.params };
    if (timeContract(META, p) !== 'continuo') continue;
    it(`«${pr.name}» sigue cambiando y no se vacía ni se llena (resolución mínima)`, () => {
      const m = create({ seed: 'continuo', params: p, res: META.budget.res![0] });
      m.step(warm + 8 * rate);
      // the state, with the camera held: the same t for both renders
      const a = ras(m, 8);
      m.step(rate);
      const b = ras(m, 8);
      expect(mad(a, b), pr.id).toBeGreaterThan(0.5);
      for (const r of [a, b]) { expect(lit(r), pr.id).toBeGreaterThan(0.02); expect(lit(r), pr.id).toBeLessThan(0.97); }
    });
  }
});

/* PR #10 close-out: the grey disc of «Mandala de arena» (version 2) */
describe('chladni v2: sin disco gris donde la placa apenas vibra', () => {
  const mandala = { ...defaultParams(META), ...META.presets.find(x => x.id === 'mandala')!.params };
  // at 33 s the sequence of «Mandala de arena» is in a mode whose middle barely moves: its sand stays spread
  // as the previous mode left it (version 1: a grey disc)
  const middle = (seed: string, v: number) => {
    const m = create({ seed, params: mandala, res: 96, v });
    m.step(60 + 33 * 30);
    const o = new Uint8Array(m.w * m.h); m.render(o, 0);
    let s = 0, k = 0, top = 0;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const px = ((x + 0.5) / m.w * 2 - 1) / 0.47, py = (0.5 - (y + 0.5) / m.h) / 0.47;
      if (Math.hypot(px, py) < 0.3) { s += o[y * m.w + x]; k++; }
      top = Math.max(top, o[y * m.w + x]);
    }
    return { mean: s / k, top };
  };
  it('la versión 1 dejaba el centro gris; la 2 lo oscurece y sigue dibujando sus líneas', { timeout: 60_000 }, () => {
    for (const seed of ['chladni-mandala', 'disco', 'otra']) {
      const v1 = middle(seed, 1), v2 = middle(seed, 2);
      expect(v2.mean, seed).toBeLessThan(0.7 * v1.mean);
      expect(v2.top, seed).toBeGreaterThan(200);
    }
  });
  it('los granos caminan igual en las dos versiones: sólo cambia el dibujo', () => {
    const a = create({ seed: 'granos', params: mandala, res: 64, v: 1 }), b = create({ seed: 'granos', params: mandala, res: 64, v: 2 });
    a.step(90); b.step(90);
    expect(b.snapshot().arrays.pos).toEqual(a.snapshot().arrays.pos);
  });
});
