import { describe, expect, it } from 'vitest';
import { LAST, impl } from '../../src/families/analytic/laceria.cpu';
import { META } from '../../src/families/meta/laceria';
import { defaultParams, packParams } from '../../src/families/params';
import { setPX } from '../../src/engine/basic/patterns';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Lacería»: the winding parity, the alternating weave and the exact loop. */

const k = (p: Params) => packParams(META, { ...defaultParams(META), ...p });

describe('lacería', () => {
  it('dentro de una estrella {N/k}, la paridad de vueltas es k menos las cuerdas que quedan por dentro (contra el rayo par-impar)', () => {
    const rnd = (() => { let s = 7; return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; })();
    for (const [N, kk] of [[6, 2], [8, 3], [8, 2], [10, 3], [10, 4], [12, 5], [12, 4]]) {
      const R = 1, d0 = R * Math.cos((Math.PI * kk) / N);
      const V = Array.from({ length: N }, (_, i) => [Math.cos((2 * Math.PI * i) / N), Math.sin((2 * Math.PI * i) / N)]);
      for (let q = 0; q < 300; q++) {
        const r = 0.98 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2, x = r * Math.cos(a), y = r * Math.sin(a);
        // even-odd: a ray to +x across every chord (vertex j to vertex j + k)
        let cross = 0;
        for (let j = 0; j < N; j++) {
          const [ax, ay] = V[j], [bx, by] = V[(j + kk) % N];
          if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) cross++;
        }
        let m = 0;
        for (let j = 0; j < N; j++) { const b = ((2 * j + kk) * Math.PI) / N; if (x * Math.cos(b) + y * Math.sin(b) > d0) m++; }
        expect(((kk - m) % 2 + 2) % 2, `{${N}/${kk}}`).toBe(cross % 2);
      }
    }
  });

  it('el tejido alterna: a lo largo de cada cinta, un cruce por encima y el siguiente por debajo', () => {
    setPX(14 / 720);
    for (const [sym, depth] of [['8', 3], ['12', 5], ['10', 3], ['10', 4], ['6', 2], ['12', 3]] as const) {
      const N = Number(sym);
      const kk = k({ sym, grid: 'roseton', depth, layers: 1, spin: 0, reveal: 0, cycle: 'bucle', width: 1.2 });
      impl.prep!(1, kk);
      // chord 0 of the star (radius .47, not turned): its normal at 3π/8·…, from one end to the other
      const R = 0.47, b = (depth * Math.PI) / N, d0 = R * Math.cos(b), hl = R * Math.sin(b);
      const nx = Math.cos(b), ny = Math.sin(b), tx = -ny, ty = nx;
      const seq: number[] = [];
      let lastOther = -1;
      for (let i = 0; i <= 4000; i++) {
        const s = -hl * 0.97 + (i / 4000) * hl * 1.94;
        impl.cpu(d0 * nx + s * tx, d0 * ny + s * ty, 1, kk);
        if (LAST.over === 0) continue;
        const firstIsMine = LAST.I1[0] === 0 && LAST.I1[1] === 0;
        const other = firstIsMine ? LAST.I2[1] : LAST.I1[1];
        if (other === lastOther) continue;
        lastOther = other;
        seq.push(firstIsMine === (LAST.over === 1) ? 1 : 0);
      }
      expect(seq.length, `{${N}/${depth}}`).toBe(2 * (depth - 1));
      for (let i = 1; i < seq.length; i++) expect(seq[i], `{${N}/${depth}} cruce ${i}: ${seq.join('')}`).not.toBe(seq[i - 1]);
    }
  });

  it('«Bucle de 32 s» vuelve exactamente a su inicio; «Continuo» no', () => {
    setPX(14 / 720);
    const img = (kk: Float32Array, t: number) => { impl.prep!(t, kk); const o: number[] = []; for (let i = 0; i < 600; i++) o.push(impl.cpu(-0.88 + (i % 30) * 0.06, -0.48 + Math.floor(i / 30) * 0.05, t, kk)); return o; };
    for (const pr of META.presets) {
      const kk = k(pr.params);
      for (const t of [3.3, 11.7, 27.1]) {
        const a = img(kk, t), b = img(kk, t + 32);
        const d = a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
        if (pr.params.cycle === 'bucle') { expect(pr.period).toBe(32); expect(d, `${pr.id} t=${t}`).toBeLessThan(1e-6); }
        else expect(d, `${pr.id} t=${t}`).toBeGreaterThan(1e-3);
      }
    }
  });
});
