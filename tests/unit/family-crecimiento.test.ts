import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/crecimiento';
import { META } from '../../src/families/meta/crecimiento';
import { defaultParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Differential growth: the curve lengthens by splitting edges, keeps its folds apart and stays bounded. */

const params = (p: Params = {}): Params => ({ ...defaultParams(META), ...p });
function nodes(m: ReturnType<typeof create>) {
  const s = m.snapshot(), N = s.scalars.N;
  return { N, x: (s.arrays.px as Float32Array).subarray(0, N), y: (s.arrays.py as Float32Array).subarray(0, N), s };
}

describe('crecimiento diferencial', () => {
  it('los nodos aumentan y ningún tramo supera la arista máxima', () => {
    const p = params();
    const m = create({ seed: 'crece', res: 64, params: p });
    let prev = nodes(m).N;
    for (let k = 0; k < 6; k++) {
      m.step(100);
      const { N, x, y } = nodes(m);
      expect(N).toBeGreaterThan(prev);
      prev = N;
      // a closed curve: every edge, the last one included, at most «Arista máxima» × «Separación»
      let longest = 0;
      for (let i = 0; i < N; i++) { const j = (i + 1) % N; longest = Math.max(longest, Math.hypot(x[j] - x[i], y[j] - y[i])); }
      expect(longest).toBeLessThanOrEqual((p.edge as number) * (p.sep as number) * 1.0001);
    }
  });

  it('la repulsión mantiene los pliegues separados: nodos no vecinos a más de 0,4 × separación', () => {
    const p = params({ sprout: 1 });
    const m = create({ seed: 'separa', res: 64, params: p });
    m.step(900);
    const { N, x, y } = nodes(m);
    expect(N).toBeGreaterThan(300);
    const R = p.sep as number;
    let closest = Infinity;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      // neighbours along the curve (within a few links) are allowed to be close
      const links = Math.min(j - i, N - (j - i));
      if (links < 6) continue;
      closest = Math.min(closest, Math.hypot(x[j] - x[i], y[j] - y[i]));
    }
    expect(closest).toBeGreaterThan(0.4 * R);
  });

  it('se queda dentro de su límite, deja de crecer y se congela', () => {
    for (const bound of ['circulo', 'rect']) {
      const m = create({ seed: 'limite', res: 48, params: params({ bound, sep: 0.07, sprout: 2 }) });
      m.step(4000);
      const { N, x, y, s } = nodes(m);
      for (let i = 0; i < N; i++) {
        if (bound === 'rect') { expect(Math.abs(x[i])).toBeLessThanOrEqual(0.97 + 1e-6); expect(Math.abs(y[i])).toBeLessThanOrEqual(0.47 + 1e-6); }
        else expect(Math.hypot(x[i], y[i])).toBeLessThanOrEqual(0.47 + 1e-5);
      }
      expect(s.scalars.frozen).toBe(1);
      const before = nodes(m);
      m.step(50);
      expect(nodes(m).x).toEqual(before.x);
    }
  });

  it('con renovación (presets continuos) sigue cambiando, no se vacía ni se congela y se restaura exacto', () => {
    const raster = (m: ReturnType<typeof create>) => { const o = new Uint8Array(m.w * m.h); m.render(o, 0); return o; };
    const mad = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
    const lit = (a: Uint8Array) => a.reduce((s, v) => s + (v > 24 ? 1 : 0), 0) / a.length;
    for (const id of ['coral_vivo', 'meandros', 'colonia_viva']) {
      const p = params(META.presets.find(q => q.id === id)!.params);
      const m = create({ seed: 'continuo', res: 48, params: p });
      m.step(150 + 30 * 40);
      for (let k = 0; k < 3; k++) {
        const a = raster(m);
        m.step(30 * 10);
        const b = raster(m);
        expect(mad(a, b), `${id} ventana ${k}`).toBeGreaterThan(0.3);
        expect(lit(b), id).toBeGreaterThan(0.02);
        expect(lit(b), id).toBeLessThan(0.97);
        expect(m.snapshot().scalars.frozen, id).toBe(0);
      }
      const snap = m.snapshot();
      m.step(61);
      const r = create({ seed: 'continuo', res: 48, params: p });
      r.restore(snap);
      r.step(61);
      expect(mad(raster(m), raster(r)), id).toBe(0);
    }
  });

  it('con renovación las curvas viejas se deshacen y nacen otras', () => {
    const p = params(META.presets.find(q => q.id === 'colonia_viva')!.params);
    const m = create({ seed: 'relevo', res: 48, params: p });
    const births = () => { const s = m.snapshot(); return Array.from((s.arrays.born as Int32Array).subarray(0, s.scalars.nc)); };
    m.step(150);
    const start = births();
    m.step(30 * 120);
    const later = births();
    // rings born during the run stand where the first curves were
    expect(later.some(b => b > 150)).toBe(true);
    expect(later.length).toBeGreaterThan(0);
    expect(start.every(b => b === 0)).toBe(true);
  });

  it('una línea abierta conserva sus extremos anclados', () => {
    const m = create({ seed: 'linea', res: 48, params: params({ shape: 'linea', bound: 'rect' }) });
    const a = nodes(m), first = [a.x[0], a.y[0]], last = [a.x[a.N - 1], a.y[a.N - 1]];
    m.step(400);
    const b = nodes(m);
    expect(b.N).toBeGreaterThan(a.N);
    expect([b.x[0], b.y[0]]).toEqual(first);
    expect([b.x[b.N - 1], b.y[b.N - 1]]).toEqual(last);
  });
});
