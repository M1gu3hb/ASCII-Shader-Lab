import { describe, expect, it } from 'vitest';
import { HC_E, HC_POLY, HC_V, HIPERCUBO_GLSL } from '../../src/families/analytic/hipercubo';
import { impl, project } from '../../src/families/analytic/hipercubo.cpu';
import { META } from '../../src/families/meta/hipercubo';
import { defaultParams, packParams } from '../../src/families/params';
import { setPX } from '../../src/engine/basic/patterns';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Hipercubo»: the polytopes' tables, the 4D perspective and the exact loop. */

const k = (p: Params) => packParams(META, { ...defaultParams(META), ...p });

describe('hipercubo', () => {
  it('teseracto 16/32, 16 celdas 8/24, 24 celdas 24/96: vértices en la esfera unidad y grado regular', () => {
    const want = [[16, 32, 4], [8, 24, 6], [24, 96, 8]];
    HC_POLY.forEach((P, i) => {
      expect([P.nv, P.ne]).toEqual(want[i].slice(0, 2));
      const deg = new Array(P.nv).fill(0);
      for (let e = P.e0; e < P.e0 + P.ne; e++) { deg[HC_E[e][0]]++; deg[HC_E[e][1]]++; }
      for (const d of deg) expect(d).toBe(want[i][2]);
      for (let v = P.v0; v < P.v0 + P.nv; v++) expect(Math.hypot(...HC_V[v])).toBeCloseTo(1, 9);
    });
    expect(HIPERCUBO_GLSL).toContain(`const ivec2 HC_E[${HC_E.length}]`);
  });

  it('perspectiva 4D: lo que está más cerca del ojo en w se ve más grande (el cubo interior es menor)', () => {
    const X = new Float64Array(96), Y = new Float64Array(96), W = new Float64Array(96), Z = new Float64Array(96);
    const kk = k({ poly: 'teseracto', xw: 0, yw: 0, zw: 0, dist4: 2 });
    project(0, kk, 0, { x: X, y: Y, w: W, z: Z });
    let outer = 0, inner = 0;
    for (let i = 0; i < 16; i++) { const r = Math.hypot(X[i], Y[i]); if (W[i] > 0) outer += r; else inner += r; }
    expect(outer / inner).toBeGreaterThan(1.5);
    // a turn in xw takes the outer cube inside: half a turn swaps them
    const kk2 = k({ poly: 'teseracto', xw: 1, yw: 0, zw: 0, dist4: 2, cycle: 40 });
    project(10, kk2, 0, { x: X, y: Y, w: W, z: Z });
    const w10 = Array.from(W.slice(0, 16));
    project(0, kk2, 0, { x: X, y: Y, w: W, z: Z });
    const w0 = Array.from(W.slice(0, 16));
    // a quarter of a cycle: a quarter turn in xw, w becomes ± x
    for (let i = 0; i < 16; i++) expect(Math.abs(w10[i])).toBeCloseTo(Math.abs(HC_V[i][0]), 6);
    expect(w0.map(Math.abs)).toEqual(Array(16).fill(0.5));
  });

  it('bucle exacto: cada preset vuelve a su inicio al cabo de su ciclo', () => {
    setPX(14 / 720);
    for (const pr of META.presets) {
      const kk = k(pr.params);
      expect(pr.period).toBe(pr.params.cycle);
      for (const t of [1.3, 7.9]) {
        const img = (tt: number) => { impl.prep!(tt, kk); const o: number[] = []; for (let i = 0; i < 900; i++) o.push(impl.cpu(-0.6 + (i % 30) * 0.04, -0.45 + Math.floor(i / 30) * 0.03, tt, kk)); return o; };
        const a = img(t), b = img(t + Number(pr.params.cycle)), c = img(t + Number(pr.params.cycle) / 3);
        expect(a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length, pr.id).toBeLessThan(1e-6);
        expect(a.reduce((s, v, i) => s + Math.abs(v - c[i]), 0) / a.length, pr.id).toBeGreaterThan(1e-3);
      }
    }
  });
});
