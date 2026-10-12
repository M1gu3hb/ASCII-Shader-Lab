import { describe, expect, it } from 'vitest';
import { burbujasSites, impl } from '../../src/families/analytic/burbujas.cpu';
import { META } from '../../src/families/meta/burbujas';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/**
 * Mechanism of «Burbujas con nucleación» (I-02): bubbles are born only at the fixed nucleation points, rise,
 * leave a trail under them and burst at the surface (and nowhere else).
 */
const PX = 1 / 51;
const base = (extra: Params = {}): Params => ({ ...defaultParams(META), liquid: 0, foam: 0, ...extra });
const field = (p: Params) => {
  const k = packParams(META, p);
  return (x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); };
};
const surfaceY = (p: Params) => 0.18 + 0.29 * (p.surface as number);

// (dense samplings of the CPU twin: generous time when the suite shares the machine)
describe('burbujas con nucleación', { timeout: 60_000 }, () => {
  it('todo lo que se enciende está en la columna de un punto de nucleación fijo, y cada punto suelta burbujas', () => {
    for (const sites of [5, 8]) {
      const p = base({ sites, layout: 2 });
      const xs = burbujasSites(sites, 2);
      const f = field(p);
      const seen = new Array(sites).fill(0);
      for (let t = 0.3; t < 30; t += 0.61) {
        for (let y = -0.44; y < surfaceY(p) - 0.04; y += 0.01) for (let x = -0.88; x <= 0.88; x += 0.0125) {
          if (f(x, y, t) < 0.3) continue;
          const near = xs.map(xi => Math.abs(x - xi));
          const i = near.indexOf(Math.min(...near));
          expect(near[i], `t=${t} (${x.toFixed(3)}, ${y.toFixed(3)})`).toBeLessThan(0.1);
          seen[i]++;
        }
      }
      for (let i = 0; i < sites; i++) expect(seen[i], `punto ${i} de ${sites}`).toBeGreaterThan(5);
    }
  });

  it('las burbujas suben: el perfil de la columna se desplaza hacia arriba con el tiempo', () => {
    const p = base({ sites: 5, rate: 1, trail: 0 });
    const xi = burbujasSites(5, 0)[2];
    const f = field(p);
    const prof = (t: number) => {
      const o: number[] = [];
      for (let y = -0.45; y < 0.3; y += 0.002) { let m = 0; for (let dx = -0.05; dx <= 0.05; dx += 0.005) m = Math.max(m, f(xi + dx, y, t)); o.push(m); }
      return o;
    };
    for (const t of [4, 9.5, 17]) {
      const a = prof(t), b = prof(t + 0.08);
      // the shift (in samples) that best lines up the two moments
      let best = 0, bestE = Infinity;
      for (let s = -30; s <= 30; s++) {
        let e = 0;
        for (let i = 40; i < a.length - 40; i++) e += (a[i] - b[i + s]) ** 2;
        if (e < bestE) { bestE = e; best = s; }
      }
      expect(best, `t=${t}`).toBeGreaterThan(0);
    }
  });

  it('el estallido ocurre en la superficie: cambia sólo cerca de ella', () => {
    const f0 = field(base({ burst: 0 })), f1 = field(base({ burst: 1 }));
    const ys = surfaceY(base());
    let near = 0, below = 0;
    for (let t = 0.2; t < 20; t += 0.23) for (let x = -0.88; x <= 0.88; x += 0.0125) {
      for (let y = -0.44; y < ys + 0.08; y += 0.01) {
        const d = Math.abs(f0(x, y, t) - f1(x, y, t));
        if (y < ys - 0.1) below += d; else near += d;
      }
    }
    expect(below).toBeLessThan(1e-6);
    expect(near).toBeGreaterThan(5);
  });

  it('por encima de la superficie no hay nada: las gotitas del estallido no pasan de un palmo', () => {
    const p = base({ burst: 1 });
    const f = field(p);
    const ys = surfaceY(p);
    for (let t = 0.2; t < 20; t += 0.37) for (let x = -0.88; x <= 0.88; x += 0.02) for (let y = ys + 0.1; y < 0.5; y += 0.02) expect(f(x, y, t)).toBeLessThan(0.02);
  });

  it('la estela queda debajo de cada burbuja, no encima', () => {
    const f0 = field(base({ trail: 0 })), f1 = field(base({ trail: 1 }));
    // each difference the trail makes has a brighter bubble just above it
    let n = 0;
    for (let t = 1; t < 12; t += 0.53) for (let x = -0.88; x <= 0.88; x += 0.0125) for (let y = -0.4; y < 0.3; y += 0.01) {
      if (f1(x, y, t) - f0(x, y, t) < 0.05) continue;
      n++;
      let above = 0;
      for (let dy = 0.004; dy < 0.2; dy += 0.004) above = Math.max(above, f0(x, y + dy, t), f0(x - 0.01, y + dy, t), f0(x + 0.01, y + dy, t));
      expect(above, `t=${t} (${x.toFixed(3)}, ${y.toFixed(3)})`).toBeGreaterThan(0.35);
    }
    expect(n).toBeGreaterThan(10);
  });
});
