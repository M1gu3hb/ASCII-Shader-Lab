import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/lsystem';
import { META } from '../../src/families/meta/sistema_l';
import { defaultParams, timeContract } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** L-systems over time: the garden renews itself, the folding dragon loops exactly, the plain run holds. */

const preset = (id: string): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params });
const raster = (m: ReturnType<typeof create>, t = 0) => { const o = new Uint8Array(m.w * m.h); m.render(o, t); return o; };
const mad = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const lit = (a: Uint8Array) => a.reduce((s, v) => s + (v > 24 ? 1 : 0), 0) / a.length;

describe('sistemas L en el tiempo', () => {
  it('el contrato de cada preset dice la verdad', () => {
    const want: Record<string, string> = { helecho: 'construccion', arbol3d: 'construccion', raices: 'construccion', dragon: 'construccion', jardin: 'continuo', raices_vivas: 'continuo', dragon_pliegue: 'bucle' };
    for (const pr of META.presets) expect(timeContract(META, { ...defaultParams(META), ...pr.params }), pr.id).toBe(want[pr.id]);
  });

  it('el jardín sigue cambiando (con la cámara quieta), no se vacía y se restaura exacto', () => {
    for (const id of ['jardin', 'raices_vivas']) {
      const p = preset(id), m = create({ seed: 'jardin', res: 48, params: p });
      m.step(30 * 30);
      for (let k = 0; k < 5; k++) {
        const a = raster(m);
        m.step(30 * 6);
        const b = raster(m);
        expect(mad(a, b), `${id} ventana ${k}`).toBeGreaterThan(0.2);
        expect(lit(b), id).toBeGreaterThan(0.03);
      }
      const snap = m.snapshot();
      m.step(211);
      const r = create({ seed: 'jardin', res: 48, params: p });
      r.restore(snap);
      r.step(211);
      expect(mad(raster(m), raster(r)), id).toBe(0);
    }
  });

  it('el jardín releva sus plantas: al cabo de un rato ninguna es de las primeras', () => {
    const m = create({ seed: 'relevo', res: 48, params: preset('jardin') });
    const first = new Set(Array.from(m.snapshot().arrays.sid as Int32Array));
    m.step(30 * 180);
    const now = Array.from(m.snapshot().arrays.sid as Int32Array);
    expect(now.some(s => first.has(s))).toBe(false);
  });

  it('el dragón que se pliega es un bucle exacto de «period» segundos, y cambia dentro del ciclo', () => {
    const pr = META.presets.find(p => p.id === 'dragon_pliegue')!;
    const P = pr.period! * 30;
    expect(Number(pr.params.grow)).toBe(pr.period);
    const m = create({ seed: 'pliegue', res: 48, params: preset('dragon_pliegue') });
    const at = (s: number) => { const x = create({ seed: 'pliegue', res: 48, params: preset('dragon_pliegue') }); x.step(s); return raster(x, s / 30); };
    for (const s of [0, 97, 400]) {
      expect(mad(at(s), at(s + P)), `paso ${s}`).toBe(0);
      expect(mad(at(s), at(s + P * 3)), `paso ${s}`).toBe(0);
      expect(mad(at(s), at(s + Math.round(P / 3)))).toBeGreaterThan(0.5);
    }
    expect(m.w).toBe(96);
  });

  it('sin «Tiempo» nuevo, la construcción crece y después sólo la mece el viento', () => {
    const p = preset('dragon'), m = create({ seed: 'quieta', res: 48, params: p });
    m.step(30 * 20);
    const a = raster(m, 20);
    m.step(30 * 5);
    expect(mad(a, raster(m, 25))).toBe(0);
  });
});
