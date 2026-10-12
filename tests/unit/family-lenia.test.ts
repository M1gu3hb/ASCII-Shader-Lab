import { describe, expect, it } from 'vitest';
import { Convolver, LENIA_REF, RINGS, create, leniaGrid, leniaKernel, leniaRows } from '../../src/families/sims/lenia';
import { META } from '../../src/families/meta/lenia';
import { defaultParams, timeContract } from '../../src/families/params';
import type { FieldModel, Params } from '../../src/families/types';

/** Lenia (Chan 2019): kernel, own FFT and a regime that keeps its creatures. */

describe('lenia', () => {
  it('las filas se redondean a la potencia de dos más cercana', () => {
    expect(leniaRows(64)).toBe(64);
    expect(leniaRows(90)).toBe(64);
    expect(leniaRows(96)).toBe(128);
    expect(leniaRows(200)).toBe(256);
  });

  it('el núcleo suma 1, es simétrico y cada anillo tiene su peso', () => {
    for (const beta of Object.values(RINGS)) {
      const w = 64, h = 32, K = leniaKernel(w, h, 12, beta);
      let s = 0;
      for (const v of K) s += v;
      expect(s).toBeCloseTo(1, 10);
      for (const [dx, dy] of [[3, 1], [7, -4], [0, 9]]) {
        expect(K[((dy + h) % h) * w + ((dx + w) % w)]).toBeCloseTo(K[((-dy + h) % h) * w + ((-dx + w) % w)], 14);
      }
    }
    // three rings (½, 1, ⅔): the middle ring peaks highest, at r = 0.5 R
    const K = leniaKernel(64, 32, 12, RINGS.tres);
    const at = (r: number) => K[Math.round(r)];
    expect(at(6)).toBeGreaterThan(at(2));
    expect(at(6)).toBeGreaterThan(at(10));
  });

  it('la convolución por FFT coincide con la suma directa', () => {
    const w = 32, h = 16, n = w * h;
    let seed = 3;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const A = Float64Array.from({ length: n }, rnd), K = Float64Array.from({ length: n }, rnd);
    const c = new Convolver(w, h);
    c.setKernel(K);
    const out = new Float64Array(n);
    c.apply(A, out);
    let err = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let ky = 0; ky < h; ky++) for (let kx = 0; kx < w; kx++) s += K[ky * w + kx] * A[((y - ky + h) % h) * w + ((x - kx + w) % w)];
      err = Math.max(err, Math.abs(s - out[y * w + x]));
    }
    expect(err).toBeLessThan(1e-9);
  });

  it('Orbium: una criatura conserva su masa y se desplaza', () => {
    const pr = META.presets.find(p => p.id === 'orbium')!;
    // one creature (the smallest share) at R = 13 on the 128 × 64 torus of version 1
    const m = create({ seed: 'prueba', params: { ...defaultParams(META), ...pr.params, R: 13, density: 0.05 }, res: 64, v: 1 });
    const stats = () => {
      const A = m.snapshot().arrays.A as Float32Array;
      let s = 0, c = 0;
      for (const v of A) { s += v; if (v > 0.1) c++; }
      return { mass: s, cover: c / A.length, A: A.slice() };
    };
    m.step(100);
    const a = stats();
    m.step(700);
    const b = stats();
    // alive, not spreading over the field, and the same mass (whole creatures) as before
    expect(a.mass).toBeGreaterThan(20);
    expect(b.cover).toBeLessThan(0.1);
    expect(Math.abs(b.mass - a.mass) / a.mass).toBeLessThan(0.05);
    // they moved: the field is not the one it was
    let d = 0;
    for (let i = 0; i < a.A.length; i++) d += Math.abs(a.A[i] - b.A[i]);
    expect(d / a.mass).toBeGreaterThan(0.5);
  });

  it('versión 2: al menos 128 filas, y el radio crece con la rejilla (A-05); la versión 1 sigue igual', () => {
    expect([leniaGrid(64), leniaGrid(128), leniaGrid(256)]).toEqual([LENIA_REF, LENIA_REF, 256]);
    expect([leniaGrid(64, 1), leniaGrid(90, 1)]).toEqual([64, 64]);
    const p: Params = { ...defaultParams(META), seedShape: 'sopa' };
    const a = create({ seed: 'g', params: p, res: 64 }), b = create({ seed: 'g', params: p, res: 128 });
    a.step(20); b.step(20);
    expect(a.snapshot().arrays.A).toEqual(b.snapshot().arrays.A);
    // at the default rows version 2 is version 1
    const c = create({ seed: 'g', params: p, res: 128, v: 1 });
    c.step(20);
    expect(c.snapshot().arrays.A).toEqual(b.snapshot().arrays.A);
  });

  it('«Colonia» con las filas mínimas ya no se queda negra (A-05)', () => {
    const pr = META.presets.find(q => q.id === 'colonia')!;
    const m = create({ seed: 'colonia', params: { ...defaultParams(META), ...pr.params }, res: META.budget.res![0] });
    m.step(META.budget.warmup! + 20 * META.budget.rate!);
    const o = new Uint8Array(m.w * m.h);
    m.render(o, 0);
    let lit = 0;
    for (const v of o) if (v > 24) lit++;
    expect(lit / o.length).toBeGreaterThan(0.05);
  });

  it('«Repoblar»: un campo vacío vuelve a tener vida en la siguiente pesada, y se restaura exacto', () => {
    const p: Params = { ...defaultParams(META), mu: 0.15, sigma: 0.015, R: 13, seedShape: 'criaturas', density: 0.3, renew: true };
    const m = create({ seed: 'r', params: p, res: 128 });
    // (the weighing at step 48 records the most matter so far)
    m.step(49);
    const st = m.snapshot();
    const mass = (x: FieldModel) => { let s = 0; for (const v of x.snapshot().arrays.A as Float32Array) s += v; return s; };
    expect(mass(m)).toBeGreaterThan(10);
    // everything died: the next weighing (every 48 steps) sows a creature again
    m.restore({ ...st, arrays: { A: new Float32Array((st.arrays.A as Float32Array).length) } });
    m.step(48);
    expect(mass(m)).toBeGreaterThan(5);
    // and a restored run goes on exactly as the original
    const a = create({ seed: 'r', params: p, res: 128 });
    a.step(100);
    const snap = a.snapshot();
    a.step(60);
    const b = create({ seed: 'r', params: p, res: 128 });
    b.restore(snap);
    b.step(60);
    expect(b.snapshot().arrays.A).toEqual(a.snapshot().arrays.A);
  });

  it('el contrato temporal: sin «Repoblar» es una construcción; los fondos son continuos', () => {
    expect(timeContract(META, defaultParams(META))).toBe('construccion');
    for (const pr of META.presets) {
      const c = timeContract(META, { ...defaultParams(META), ...pr.params });
      if (pr.uses?.some(u => u.startsWith('fondos/'))) expect(c, pr.id).toBe('continuo');
    }
  });

  // every continuous preset: past its first half minute it is neither empty nor full and keeps changing
  for (const pr of META.presets) {
    const p = { ...defaultParams(META), ...pr.params };
    if (timeContract(META, p) !== 'continuo') continue;
    it(`«${pr.name}» sigue cambiando y no se vacía`, () => {
      const m = create({ seed: 'c', params: p, res: META.budget.res![0] });
      m.step(META.budget.warmup! + 30 * META.budget.rate!);
      const a = new Uint8Array(m.w * m.h), b = new Uint8Array(m.w * m.h);
      m.render(a, 0);
      m.step(2 * META.budget.rate!);
      m.render(b, 0);
      let lit = 0, d = 0;
      for (let i = 0; i < b.length; i++) { if (b[i] > 24) lit++; d += Math.abs(a[i] - b[i]); }
      expect(lit / b.length).toBeGreaterThan(0.02);
      expect(lit / b.length).toBeLessThan(0.97);
      expect(d / b.length).toBeGreaterThan(0.3);
    }, 30_000);
  }
});
