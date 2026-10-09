import { describe, expect, it } from 'vitest';
import { FOLD, fold, hyperbolicPQ, hyperbolicTriangle, impl } from '../../src/families/analytic/hiperbolico.cpu';
import { META } from '../../src/families/meta/hiperbolico';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Teselación hiperbólica»: the fundamental triangle, the fold and its symmetry. */

const rnd = (() => { let s = 12345; return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; })();
const PAIRS: Array<[number, number]> = [[7, 3], [3, 7], [4, 5], [6, 4], [5, 4], [8, 3], [12, 12]];

describe('teselación hiperbólica', () => {
  it('sólo dibuja {p,q} hiperbólicos: q sube al primer valor con (p − 2)(q − 2) > 4', () => {
    expect(hyperbolicPQ(7, 3)).toEqual([7, 3]);
    expect(hyperbolicPQ(4, 4)).toEqual([4, 5]);
    expect(hyperbolicPQ(3, 6)).toEqual([3, 7]);
    expect(hyperbolicPQ(6, 3)).toEqual([6, 4]);
    expect(hyperbolicPQ(5, 3)).toEqual([5, 4]);
    for (let p = 3; p <= 12; p++) for (let q = 3; q <= 12; q++) {
      const [P, Q] = hyperbolicPQ(p, q);
      expect((P - 2) * (Q - 2), `${p},${q}`).toBeGreaterThan(4);
    }
  });

  it('el triángulo fundamental tiene ángulos π/p, π/q y π/2, y el espejo corta el borde en ángulo recto', () => {
    for (const [p, q] of PAIRS) {
      const T = hyperbolicTriangle(p, q);
      // the edge mirror is orthogonal to the unit circle: c² = 1 + r²
      expect(T.cx * T.cx - T.cr * T.cr).toBeCloseTo(1, 9);
      // it crosses the real axis at the edge midpoint (right angle there: its centre is on that axis)
      expect(T.cx - T.cr).toBeCloseTo(T.m, 12);
      // the vertex lies on the mirror, and the mirror meets the spoke at angle π/q
      expect(Math.hypot(T.vx - T.cx, T.vy)).toBeCloseTo(T.cr, 9);
      const nx = (T.vx - T.cx) / T.cr, ny = T.vy / T.cr;
      const angle = Math.asin(Math.abs(Math.cos(T.an) * nx + Math.sin(T.an) * ny));
      expect(angle, `${p},${q}`).toBeCloseTo(Math.PI / q, 9);
      // the inradius b in the disk: tanh(b/2)
      expect(Math.tanh(T.b / 2)).toBeCloseTo(T.m, 9);
    }
  });

  it('el pliegue lleva cualquier punto del disco al triángulo fundamental', () => {
    for (const [p, q] of PAIRS) {
      const T = hyperbolicTriangle(p, q);
      for (let i = 0; i < 400; i++) {
        const r = 0.97 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2;
        fold(r * Math.cos(a), r * Math.sin(a), T.an, T.cx, T.cr);
        const ang = Math.atan2(FOLD.y, FOLD.x);
        expect(ang).toBeGreaterThanOrEqual(-1e-9);
        expect(ang).toBeLessThanOrEqual(T.an + 1e-9);
        expect(Math.hypot(FOLD.x - T.cx, FOLD.y)).toBeGreaterThanOrEqual(T.cr - 1e-9);
        expect(Math.hypot(FOLD.x, FOLD.y)).toBeLessThan(1);
        expect(FOLD.n).toBeLessThan(40);
      }
    }
  });

  it('la teselación no cambia al girar 2π/p ni al reflejar en una arista (la paridad sí, con el reflejo)', () => {
    for (const [p, q] of PAIRS) {
      const T = hyperbolicTriangle(p, q);
      const c = Math.cos((2 * Math.PI) / p), s = Math.sin((2 * Math.PI) / p);
      for (let i = 0; i < 200; i++) {
        const r = 0.9 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2, x = r * Math.cos(a), y = r * Math.sin(a);
        fold(x, y, T.an, T.cx, T.cr);
        const A = { ...FOLD };
        fold(c * x - s * y, s * x + c * y, T.an, T.cx, T.cr);
        expect(FOLD.x).toBeCloseTo(A.x, 6); expect(FOLD.y).toBeCloseTo(A.y, 6); expect(FOLD.par).toBe(A.par);
        // reflection in the edge mirror (an inversion in its circle)
        const dx = x - T.cx, dy = y, k = (T.cr * T.cr) / (dx * dx + dy * dy);
        fold(T.cx + dx * k, dy * k, T.an, T.cx, T.cr);
        expect(FOLD.x).toBeCloseTo(A.x, 6); expect(FOLD.y).toBeCloseTo(A.y, 6); expect(FOLD.par).toBe(1 - A.par);
      }
    }
  });

  it('la imagen quieta es simétrica por el giro 2π/p y la deriva vuelve a coincidir tras un polígono', () => {
    for (const pr of META.presets) {
      const p: Params = { ...defaultParams(META), ...pr.params, drift: 0, turn: 0 };
      const k = packParams(META, p);
      impl.prep!(0, k);
      const P = Math.round(Number(p.p));
      const c = Math.cos((2 * Math.PI) / P), s = Math.sin((2 * Math.PI) / P);
      let bad = 0, n = 0;
      for (let i = 0; i < 600; i++) {
        const r = 0.45 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2, x = r * Math.cos(a), y = r * Math.sin(a);
        const v0 = impl.cpu(x, y, 0, k), v1 = impl.cpu(c * x - s * y, s * x + c * y, 0, k);
        n++;
        if (Math.abs(v0 - v1) > 1e-3) bad++;
      }
      // (points that fall right on an edge can land on either side of it)
      expect(bad / n, pr.id).toBeLessThan(0.01);
    }
    // the drift: 8 s per polygon at speed 1 (one period of u), the turn off
    const p = { ...defaultParams(META), drift: 1, turn: 0 };
    const k = packParams(META, p);
    const img = (t: number) => { impl.prep!(t, k); const o: number[] = []; for (let i = 0; i < 300; i++) { const r = 0.45 * Math.sqrt((i + 0.5) / 300), a = i * 2.39996; o.push(impl.cpu(r * Math.cos(a), r * Math.sin(a), t, k)); } return o; };
    // just before u wraps (the half-turn about an edge midpoint, a symmetry) and just after it (no view)
    const a = img(8 - 1e-6), b = img(8 + 1e-6), mid = img(4);
    const diff = (u: number[], v: number[]) => u.filter((x, i) => Math.abs(x - v[i]) > 1e-3).length / u.length;
    expect(diff(a, b)).toBeLessThan(0.02);
    expect(diff(a, mid)).toBeGreaterThan(0.2);
  });
});
