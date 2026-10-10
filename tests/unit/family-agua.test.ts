import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/agua';
import { META } from '../../src/families/meta/agua';
import { defaultParams } from '../../src/families/params';
import type { FieldModel, Params } from '../../src/families/types';

/** Mechanism checks of the damped wave equation under the pool. */

const calm = (p: Params = {}): Params => ({ ...defaultParams(META), rain: 0, paddle: 0, obst: 'ninguno', ...p });
const tap = (m: FieldModel, x = 0, y = 0) => m.stroke!({ brush: 'gota', x0: x, y0: y, x1: x, y1: y, r: 0.05, strength: 1 });
const fields = (m: FieldModel) => { const s = m.snapshot(); return { h: s.arrays.h as Float32Array, v: s.arrays.v as Float32Array }; };

/** Discrete energy of the scheme: kinetic Σ v² plus potential c² Σ (Δh)² over the grid's edges. */
function energy(m: FieldModel, c: number) {
  const { h, v } = fields(m), W = m.w, H = m.h;
  let e = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    e += v[k] * v[k];
    if (x < W - 1) e += c * c * (h[k + 1] - h[k]) ** 2;
    if (y < H - 1) e += c * c * (h[k + W] - h[k]) ** 2;
  }
  return e;
}

describe('agua: mecanismo', () => {
  it('la energía de una gota sólo disminuye, y mucho antes con amortiguación', () => {
    const run = (damp: number) => {
      const m = create({ seed: 'gota', params: calm({ damp, speed: 0.5, drop: 2 }), res: 64 });
      m.stroke!({ brush: 'gota', x0: 0, y0: 0, x1: 0, y1: 0, r: 0.08, strength: 1 });
      m.step(10);
      const es = [energy(m, 0.5)];
      for (let i = 0; i < 6; i++) { m.step(40); es.push(energy(m, 0.5)); }
      return es;
    };
    const free = run(0), damped = run(1);
    // a closed pool with reflecting walls: nothing adds energy, so it can only fall
    for (const es of [free, damped]) for (let i = 1; i < es.length; i++) expect(es[i]).toBeLessThan(es[i - 1]);
    // with little damping most of it is still there while the waves bounce; with full damping almost none
    expect(free[6] / free[0]).toBeGreaterThan(0.3);
    expect(damped[6] / damped[0]).toBeLessThan(0.02 * (free[6] / free[0]));
  });

  it('una onda llega a un punto lejano con un retraso proporcional a la distancia (velocidad c)', () => {
    for (const c of [0.35, 0.6]) {
      const m = create({ seed: 'frente', params: calm({ damp: 0, speed: c }), res: 64 });
      tap(m);
      const W = m.w, cx = W / 2, cy = m.h / 2, peak = Math.max(...fields(m).h.map(Math.abs));
      const probes = [14, 28, 42].map(d => Math.floor(cy) * W + Math.floor(cx + d));
      const arrival = probes.map(() => -1);
      for (let t = 1; t <= 200 && arrival.includes(-1); t++) {
        m.step(1);
        const { h } = fields(m);
        probes.forEach((k, i) => { if (arrival[i] < 0 && Math.abs(h[k]) > 0.02 * peak) arrival[i] = t; });
      }
      expect(arrival.every(a => a > 0)).toBe(true);
      // 14 cells further takes 14 / c steps more (the front of the discrete wave travels at c)
      for (let i = 1; i < 3; i++) expect((arrival[i] - arrival[i - 1]) * c / 14, `c=${c}`).toBeCloseTo(1, 0);
    }
  });

  it('el muro refleja las olas de la pala; lo que pasa por las dos rendijas forma franjas de interferencia', () => {
    const run = (obst: string) => {
      const m = create({ seed: 'muro', params: calm({ damp: 0.1, paddle: 0.8, obst, speed: 0.6 }), res: 64 });
      m.step(300);
      const W = m.w, H = m.h, x = Math.round(W * 0.72), line = new Float64Array(H);
      let behind = 0;
      for (let t = 0; t < 120; t++) {
        m.step(1);
        const { h } = fields(m);
        for (let y = 0; y < H; y++) { line[y] += h[y * W + x] ** 2; for (let xx = Math.round(W * 0.45); xx < W * 0.9; xx++) behind += h[y * W + xx] ** 2; }
      }
      // fringe contrast of the time-averaged intensity along a line behind the wall (away from the banks)
      const band = Array.from(line).slice(Math.round(H * 0.15), Math.round(H * 0.85));
      const mx = Math.max(...band), mn = Math.min(...band);
      return { behind, contrast: (mx - mn) / (mx + mn) };
    };
    const slits = run('rendijas'), open = run('ninguno');
    expect(slits.behind).toBeLessThan(0.3 * open.behind);
    expect(slits.contrast).toBeGreaterThan(0.6);
    expect(slits.contrast).toBeGreaterThan(open.contrast + 0.15);
  });
});
