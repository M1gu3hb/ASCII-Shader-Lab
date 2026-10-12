import { describe, expect, it } from 'vitest';
import { impl, node, view } from '../../src/families/analytic/globo_puntos.cpu';
import { META } from '../../src/families/meta/globo_puntos';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Globo de constelaciones» (I-29): points on a turning sphere, links between neighbours, arcs, exact loop. */

const PX = 14 / 720;
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const v = (k: Float32Array, x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); };

/** A node of the lattice as the camera sees it at time t: [x, y, depth] in screen units, or null when it does not live. */
function seen(a: number, b: number, t: number, k: Float32Array, R: number) {
  impl.prep!(t, k, undefined, PX);
  const N = node(a, b, k[1], k[2]);
  if (N[3] < 0.5) return null;
  const V = view(N[0], N[1], N[2]);
  return [V[0] * R, V[1] * R, V[2]];
}

describe('globo de constelaciones', () => {
  it('los puntos están sobre la esfera: sin arcos, nada se enciende fuera del disco', () => {
    const p = params('red', { arcs: 0 });
    const k = packParams(META, p);
    const R = p.size as number;
    let outside = 0, inside = 0;
    for (let x = -0.85; x < 0.85; x += 0.01) for (let y = -0.49; y < 0.49; y += 0.01) {
      const r = Math.hypot(x, y), l = v(k, x, y, 5);
      if (r > R + 1.2 * PX) outside += l; else if (l > 0.5) inside++;
    }
    expect(outside).toBe(0);
    expect(inside).toBeGreaterThan(100);
  });

  it('el globo gira: un punto de delante se mueve de lado y vuelve a su sitio al cabo de una vuelta', () => {
    const p = params('nodos');
    const k = packParams(META, p);
    const R = p.size as number, P = p.cycle as number;
    const a0 = seen(3, 6, 2, k, R)!, a1 = seen(3, 6, 2 + P / 8, k, R)!, a2 = seen(3, 6, 2 + P, k, R)!;
    expect(Math.hypot(a1[0] - a0[0], a1[1] - a0[1])).toBeGreaterThan(0.05);
    expect(a2[0]).toBeCloseTo(a0[0], 6);
    expect(a2[1]).toBeCloseTo(a0[1], 6);
  });

  it('los vecinos enlazados se unen con un segmento: su punto medio se enciende, y sin enlaces no', () => {
    const linked = packParams(META, params('malla', { links: 1, arcs: 0, back: 0 })), loose = packParams(META, params('malla', { links: 0, arcs: 0, back: 0 }));
    const R = params('malla').size as number;
    let checked = 0;
    for (let a = 0; a < 32 && checked < 12; a++) for (let b = 4; b < 12 && checked < 12; b++) {
      const A = seen(a, b, 3, linked, R), E = seen(a + 1, b, 3, linked, R);
      if (!A || !E || A[2] < 0.4 || E[2] < 0.4) continue;
      const len = Math.hypot(E[0] - A[0], E[1] - A[1]);
      if (len < 3 * PX) continue;
      const mx = (A[0] + E[0]) / 2, my = (A[1] + E[1]) / 2;
      expect(v(linked, mx, my, 3), `${a},${b}`).toBeGreaterThan(0.3);
      expect(v(loose, mx, my, 3), `${a},${b}`).toBeLessThan(0.1);
      checked++;
    }
    expect(checked).toBeGreaterThan(6);
  });

  it('los arcos vuelan por encima de la superficie: con arcos hay luz fuera del disco', () => {
    const p = params('rutas');
    const k = packParams(META, p);
    const R = p.size as number;
    let lit = 0;
    for (const t of [3, 11, 19]) for (let x = -0.85; x < 0.85; x += 0.008) for (let y = -0.49; y < 0.49; y += 0.008) {
      if (Math.hypot(x, y) > R * 1.08 && v(k, x, y, t) > 0.2) lit++;
    }
    expect(lit).toBeGreaterThan(20);
  });

  it('bucle exacto: cada preset vuelve a su inicio al cabo de una vuelta', () => {
    for (const pr of META.presets) {
      const k = packParams(META, params(pr.id));
      expect(pr.period).toBe(pr.params.cycle);
      for (const t of [1.3, 8.2]) {
        let d = 0, dm = 0;
        for (let i = 0; i < 400; i++) {
          const x = -0.5 + (i % 20) * 0.05, y = -0.47 + Math.floor(i / 20) * 0.048;
          const a = v(k, x, y, t);
          d += Math.abs(a - v(k, x, y, t + pr.period!)); dm += Math.abs(a - v(k, x, y, t + pr.period! / 5));
        }
        expect(d / 400, pr.id).toBeLessThan(1e-5);
        expect(dm / 400, pr.id).toBeGreaterThan(1e-3);
      }
    }
  });
});
