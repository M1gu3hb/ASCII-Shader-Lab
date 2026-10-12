import { describe, expect, it } from 'vitest';
import { impl, orbitOf, stepOf } from '../../src/families/analytic/puntos_orbita.cpu';
import { META } from '../../src/families/meta/puntos_orbita';
import { defaultParams, packParams } from '../../src/families/params';
import type { Palette, Params } from '../../src/families/types';

/** Mechanism checks of «Puntos en órbita» (I-25): a dot that orbits each Voronoi site, colour per cell in steps. */

const PX = 14 / 720;
const PAL: Palette = { n: 5, rgb: new Float32Array([0.04, 0.04, 0.08, 0.24, 0.16, 0.48, 0.89, 0.28, 0.48, 1, 0.7, 0.28, 0.5, 0.88, 0.82, 0, 0, 0]) };
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const O = new Float64Array(6);

describe('puntos en órbita', () => {
  it('cada punto da vueltas alrededor del centro de su celda: misma distancia, ángulo que avanza', () => {
    const k = packParams(META, params('confeti', { drift: 0 }));
    for (const [ix, iy] of [[0, 0], [2, -1], [-3, 2], [5, 1]]) {
      const ang: number[] = [];
      for (const t of [0, 0.5, 1, 1.5]) {
        orbitOf(ix, iy, t, k, O);
        expect(Math.hypot(O[2] - O[0], O[3] - O[1])).toBeCloseTo(O[4], 9);
        ang.push(Math.atan2(O[3] - O[1], O[2] - O[0]));
      }
      // equal steps of angle in equal times (a uniform orbit), and not zero
      const d = ang.slice(1).map((a, i) => Math.atan2(Math.sin(a - ang[i]), Math.cos(a - ang[i])));
      expect(Math.abs(d[0])).toBeGreaterThan(0.05);
      for (const x of d) expect(x).toBeCloseTo(d[0], 6);
    }
  });

  it('el punto brilla donde su órbita lo pone en cada momento, y no al otro lado de la órbita', () => {
    const p = params('reloj', { orbit: 1, dot: 0.3, drift: 0, edges: 0, fill: 0, track: 0 });
    const k = packParams(META, p);
    const S = p.size as number;
    let opposite = 0, n = 0;
    for (const [ix, iy] of [[1, 0], [-2, 1], [3, -1]]) for (const t of [1, 4, 9, 13]) {
      impl.prep!(t, k, PAL, PX);
      orbitOf(ix, iy, t, k, O);
      expect(impl.cpu(O[2] * S, O[3] * S, t, k), `${ix},${iy} t=${t}`).toBeGreaterThan(0.69);
      if (impl.cpu((2 * O[0] - O[2]) * S, (2 * O[1] - O[3]) * S, t, k) < 0.3) opposite++;
      n++;
    }
    expect(opposite / n).toBeGreaterThan(0.75);
  });

  it('color por celda en pasos: el color de cada celda es el de su paso, y no hay más colores que pasos', () => {
    const C = new Float64Array(3);
    for (const steps of [2, 3, 4]) {
      const p = params('confeti', { steps, track: 0, edges: 0, drift: 0 });
      const k = packParams(META, p);
      const S = p.size as number, fill = p.fill as number;
      impl.prep!(3, k, PAL, PX);
      const seen = new Set<string>();
      let checked = 0;
      for (let x = -0.85; x < 0.85; x += 0.021) for (let y = -0.48; y < 0.48; y += 0.021) {
        // the nearest site (Voronoi cell) and whether any dot reaches this point
        const ux = x / S, uy = y / S, nx = Math.floor(ux), ny = Math.floor(uy);
        let best = 9, cx = 0, cy = 0, dot = false;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          orbitOf(nx + i, ny + j, 3, k, O);
          const d = Math.hypot(ux - O[0], uy - O[1]);
          if (d < best) { best = d; cx = nx + i; cy = ny + j; }
          if (Math.hypot(ux - O[2], uy - O[3]) < O[5] * 1.01) dot = true;
        }
        if (dot) continue;
        impl.cpuColor!(x, y, 3, k, C);
        const q = Math.floor(stepOf(cx, cy, steps));
        for (let c = 0; c < 3; c++) expect(C[c]).toBeCloseTo(PAL.rgb[q * 3 + c] * (0.35 + 0.65 * fill), 5);
        seen.add(String(q));
        checked++;
      }
      expect(checked).toBeGreaterThan(500);
      expect(seen.size, `pasos ${steps}`).toBeLessThanOrEqual(steps);
      expect(seen.size, `pasos ${steps}`).toBeGreaterThanOrEqual(2);
    }
  });
});
