import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/atractor';
import { META } from '../../src/families/meta/atractor';
import { defaultParams, timeContract } from '../../src/families/params';
import type { FieldModel, Params } from '../../src/families/types';

/**
 * Strange attractors: the maps iterate their formulas, the histogram's mass is bounded, the flows stay bounded,
 * version 2 keeps its orbits apart (version 1 kept its path), depth controls act and continuous presets go on.
 */

const params = (p: Params = {}): Params => ({ ...defaultParams(META), ...p });
const ORBITS = 256, RENEW = 4;
const raster = (m: FieldModel, t = 0) => { const o = new Uint8Array(m.w * m.h); m.render(o, t); return o; };
const mad = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const lit = (a: Uint8Array) => { let c = 0; for (const v of a) if (v > 24) c++; return c / a.length; };

function advanced(type: 'clifford' | 'dejong', p: Params, x: number, y: number, per: number) {
  const [A, B, C, D] = ['a', 'b', 'c', 'd'].map(k => p[k] as number);
  for (let k = 0; k < per; k++) {
    const nx = type === 'dejong' ? Math.sin(A * y) - Math.cos(B * x) : Math.sin(A * y) + C * Math.cos(A * x);
    const ny = type === 'dejong' ? Math.sin(C * x) - Math.cos(D * y) : Math.sin(B * x) + D * Math.cos(B * y);
    x = nx; y = ny;
  }
  return [Math.fround(x), Math.fround(y)];
}

describe('atractores extraños', () => {
  for (const type of ['clifford', 'dejong'] as const) {
    it(`${type}: cada órbita avanza exactamente según su fórmula (deriva 0; en la versión 2, salvo las que se renuevan)`, () => {
      const p = params({ type, drift: 0, points: 2560 });
      const per = 2560 / ORBITS;
      for (const v of [1, 2]) {
        const m = create({ seed: 'formula', res: 48, params: p, v });
        m.step(3);
        const s0 = m.snapshot();
        m.step(1);
        const s1 = m.snapshot();
        // with no drift the coefficients are exactly the ones set
        expect(s1.scalars.phase).toBe(0);
        const ox0 = s0.arrays.ox as Float32Array, oy0 = s0.arrays.oy as Float32Array;
        const ox1 = s1.arrays.ox as Float32Array, oy1 = s1.arrays.oy as Float32Array;
        const renewed = new Set<number>();
        if (v === 2) for (let r = 0; r < RENEW; r++) renewed.add((s0.scalars.renew + r) % ORBITS);
        expect(s1.scalars.renew, `v${v}`).toBe(v === 2 ? (s0.scalars.renew + RENEW) % ORBITS : 0);
        let same = 0;
        for (let o = 0; o < ORBITS; o++) {
          if (renewed.has(o)) continue;
          const [x, y] = advanced(type, p, ox0[o], oy0[o], per);
          expect(x).toBe(ox1[o]);
          expect(y).toBe(oy1[o]);
          same++;
        }
        expect(same).toBe(v === 2 ? ORBITS - RENEW : ORBITS);
      }
    });
  }

  it('la masa del histograma no supera la serie geométrica de su estela', () => {
    const p = params({ drift: 0, points: 8000, trail: 0.3 });
    const m = create({ seed: 'masa', res: 48, params: p });
    const decay = Math.pow(0.5, 1 / (3 + 300 * 0.3 * 0.3));
    const bound = 8000 / (1 - decay);
    let last = 0;
    for (let k = 0; k < 8; k++) {
      m.step(50);
      const H = m.snapshot().arrays.H as Float32Array;
      let sum = 0;
      for (const v of H) { expect(v).toBeGreaterThanOrEqual(0); sum += v; }
      expect(sum).toBeLessThanOrEqual(bound * 1.001);
      last = sum;
    }
    // near the steady state after many half-lives (points that fall outside the frame do not count)
    expect(last).toBeGreaterThan(bound * 0.5);
  });

  it('versión 2: tras una ventana periódica las órbitas vuelven a separarse (en la 1 seguían siendo una sola)', () => {
    // small coefficients: a contraction, every orbit falls onto one fixed point; then a chaotic set, live
    const calm = params({ type: 'clifford', a: 0.3, b: 0.3, c: 0.3, d: 0.3, drift: 0, points: 6000 });
    const wild = params({ type: 'clifford', a: 1.53, b: 2.91, c: 1.63, d: 0.33, drift: 0, points: 6000 });
    const distinct = (v: number) => {
      const m = create({ seed: 'ventana', res: 48, params: calm, v });
      m.step(200);
      m.setParams(wild);
      m.step(120);
      const s = m.snapshot(), ox = s.arrays.ox as Float32Array, oy = s.arrays.oy as Float32Array;
      return new Set(Array.from(ox, (x, i) => `${x},${oy[i]}`)).size;
    };
    expect(distinct(1)).toBeLessThan(4);
    expect(distinct(2)).toBeGreaterThan(ORBITS * 0.9);
  });

  it('versión 1 conserva su camino: la misma semilla y los mismos parámetros dan otra corrida en la 2', () => {
    const p = params();
    const a = create({ seed: 'v', res: 48, params: p, v: 1 }), b = create({ seed: 'v', res: 48, params: p });
    a.step(60); b.step(60);
    expect(a.snapshot().v).toBe(1);
    expect(b.snapshot().v).toBe(2);
    expect(mad(raster(a), raster(b))).toBeGreaterThan(0);
  });

  it('Lorenz: las partículas siguen en la región del atractor en todos los extremos', () => {
    for (const v of [-3, 0, 3]) {
      const m = create({ seed: 'lorenz', res: 48, params: params({ type: 'lorenz', a: v, b: v, c: v, d: v, drift: 1 }) });
      m.step(600);
      const pos = m.snapshot().arrays.pos as Float32Array;
      for (let i = 0; i < pos.length; i += 3) {
        expect(Number.isFinite(pos[i])).toBe(true);
        expect(Math.abs(pos[i])).toBeLessThan(80);
        expect(Math.abs(pos[i + 1])).toBeLessThan(80);
        expect(pos[i + 2]).toBeGreaterThan(-20);
        expect(pos[i + 2]).toBeLessThan(120);
      }
    }
  });

  it('Thomas, Aizawa y Halvorsen: acotados en todos los extremos, y se ven', () => {
    const box: Record<string, [number, number]> = { thomas: [-8, 8], aizawa: [-4, 4], halvorsen: [-25, 15] };
    for (const type of ['thomas', 'aizawa', 'halvorsen']) for (const v of [-3, 0, 3]) {
      const m = create({ seed: type, res: 48, params: params({ type, a: v, b: v, c: v, d: v, drift: 1, points: 8000 }) });
      m.step(400);
      const pos = m.snapshot().arrays.pos as Float32Array;
      for (let i = 0; i < 80 * 3; i++) {
        expect(Number.isFinite(pos[i]), `${type} ${v}`).toBe(true);
        expect(pos[i], `${type} ${v}`).toBeGreaterThan(box[type][0]);
        expect(pos[i], `${type} ${v}`).toBeLessThan(box[type][1]);
      }
      const l = lit(raster(m, 13));
      expect(l, `${type} ${v}`).toBeGreaterThan(0.01);
      expect(l, `${type} ${v}`).toBeLessThan(0.6);
    }
  });

  it('«Relieve» y «Capas» cambian el dibujo (mapas y 3D) y con 0 dibujan lo de siempre', () => {
    for (const type of ['clifford', 'lorenz', 'thomas']) {
      const run = (p: Params) => { const m = create({ seed: 'capas', res: 48, params: params({ type, ...p }) }); m.step(240); return raster(m, 8); };
      const base = run({}), zero = run({ relief: 0, layers: 0 });
      expect(mad(base, zero), type).toBe(0);
      expect(mad(base, run({ relief: 1 })), `${type} relieve`).toBeGreaterThan(0.5);
      expect(mad(base, run({ layers: 1 })), `${type} capas`).toBeGreaterThan(0.5);
    }
  });

  it('guardar y restaurar con la memoria de «Capas» continúa igual; un estado sin memoria (anterior) se acepta', () => {
    const p = params({ layers: 0.8, relief: 0.6 });
    const a = create({ seed: 'memoria', res: 48, params: p });
    a.step(150);
    const snap = a.snapshot();
    a.step(40);
    const b = create({ seed: 'memoria', res: 48, params: p });
    b.restore(snap);
    b.step(40);
    expect(mad(raster(a, 3), raster(b, 3))).toBe(0);
    const old = { ...snap, arrays: { ...snap.arrays } };
    delete (old.arrays as Record<string, unknown>).G;
    expect(() => create({ seed: 'memoria', res: 48, params: p }).restore(old)).not.toThrow();
  });

  it('contrato: continuo con deriva; sin deriva, construcción', () => {
    for (const pr of META.presets) expect(timeContract(META, params(pr.params)), pr.id).toBe('continuo');
    expect(timeContract(META, params({ drift: 0 }))).toBe('construccion');
  });

  it('cada preset continuo sigue cambiando y no se vacía (resolución mínima)', () => {
    const res = META.budget.res![0];
    for (const pr of META.presets) {
      const m = create({ seed: 'sigue', res, params: params(pr.params) });
      m.step(30 + 30 * 20);
      const a = raster(m, 20);
      m.step(30 * 3);
      const b = raster(m, 20);
      expect(mad(a, b), pr.id).toBeGreaterThan(0.3);
      expect(lit(b), pr.id).toBeGreaterThan(0.02);
      expect(lit(b), pr.id).toBeLessThan(0.97);
    }
  });
});
