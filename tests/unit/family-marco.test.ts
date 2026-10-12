import { describe, expect, it } from 'vitest';
import { RR, impl, marcoRR } from '../../src/families/analytic/marco.cpu';
import { META } from '../../src/families/meta/marco';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Marco vivo»: the perimeter's arc length, a frame that hugs the canvas, comets that run. */

const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });

describe('marco vivo', () => {
  it('la longitud de arco recorre el perímetro una vez, en el sentido de las agujas del reloj y sin saltos', () => {
    for (const [bx, by, r] of [[0.85, 0.45, 0.1], [0.5, 0.5, 0.5], [0.85, 0.45, 0], [0.3, 0.45, 0.2]]) {
      const P = 4 * (bx + by - 2 * r + r * Math.PI * 0.5);
      // walk the outline clockwise from the top centre: points just outside it, by angle
      let prev = 0, total = 0;
      for (let i = 1; i <= 2000; i++) {
        const a = Math.PI / 2 - (i / 2000) * Math.PI * 2;
        // the point of the outline in direction a (bisection on the signed distance)
        let lo = 0, hi = 2;
        for (let j = 0; j < 40; j++) { const m = (lo + hi) / 2; marcoRR(Math.cos(a) * m, Math.sin(a) * m, bx, by, r); if (RR.sd < 0) lo = m; else hi = m; }
        marcoRR(Math.cos(a) * lo, Math.sin(a) * lo, bx, by, r);
        let d = RR.s - prev;
        if (d < -P / 2) d += P;
        expect(d, `${bx},${by},${r} paso ${i}`).toBeGreaterThanOrEqual(-1e-9);
        expect(d, `${bx},${by},${r} paso ${i}`).toBeLessThan(0.02);
        total += d; prev = RR.s;
      }
      expect(total).toBeCloseTo(P, 2);
    }
  });

  it('el marco abraza un lienzo de la proporción dada a la distancia del margen', () => {
    for (const ratio of [16 / 9, 1, 0.75]) {
      const p = params('terminal', { ratio, margin: 0.05, comets: 0 });
      const k = packParams(META, p);
      impl.prep!(3, k);
      const w = ratio / 2 - 0.05, h = 0.45;
      expect(impl.cpu(0, h, 3, k), `${ratio} arriba`).toBeGreaterThan(0.3);
      expect(impl.cpu(w, 0, 3, k), `${ratio} derecha`).toBeGreaterThan(0.3);
      expect(impl.cpu(0, -h, 3, k), `${ratio} abajo`).toBeGreaterThan(0.3);
      expect(impl.cpu(0, 0, 3, k), `${ratio} centro`).toBeLessThan(0.02);
    }
  });

  it('un cometa recorre el marco en el sentido de las agujas del reloj', () => {
    const p = params('terminal', { comets: 1 });
    const k = packParams(META, p);
    // the brightest point along the top edge moves right as time goes on (a little inside the line, where the
    // head and its tail do not saturate)
    const head = (t: number) => {
      impl.prep!(t, k);
      let best = -1, at = 0;
      for (let x = -0.8; x <= 0.8; x += 0.005) { const v = impl.cpu(x, 0.465 - 0.03, t, k); if (v > best) { best = v; at = x; } }
      return at;
    };
    const sp = 0.1 + 1.4 * (p.speed as number);
    const P = 4 * ((p.ratio as number) / 2 - 0.035 + 0.465 - 2 * 0.08 * 0.465 + 0.08 * 0.465 * Math.PI / 2);
    // the head is at the top centre when t · sp / P is a whole number
    const t0 = P / sp;
    expect(head(t0 + 0.2)).toBeGreaterThan(head(t0));
    expect(head(t0)).toBeCloseTo(0, 1);
  });
});
