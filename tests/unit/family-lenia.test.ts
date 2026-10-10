import { describe, expect, it } from 'vitest';
import { Convolver, RINGS, create, leniaKernel, leniaRows } from '../../src/families/sims/lenia';
import { META } from '../../src/families/meta/lenia';
import { defaultParams } from '../../src/families/params';

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
    // one creature (the smallest share) at R = 13, so it fits the 128 × 64 test torus
    const m = create({ seed: 'prueba', params: { ...defaultParams(META), ...pr.params, R: 13, density: 0.05 }, res: 64 });
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
});
