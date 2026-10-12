import { describe, expect, it } from 'vitest';
import { impl, melt } from '../../src/families/analytic/estatica_vhs.cpu';
import { META } from '../../src/families/meta/estatica_vhs';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Estática de barras» (I-19): colour bars that melt column by column, tape cuts, scan lines, exact loop. */

const PX = 14 / 720;
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const C = new Float64Array(3);
const at = (k: Float32Array, x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); const l = impl.cpu(x, y, t, k); impl.cpuColor!(x, y, t, k, C); return [C[0], C[1], C[2], l]; };
const clean = { cuts: 0, snow: 0, bleed: 0, scan: 0, roll: 0 };

describe('estática de barras', () => {
  it('al empezar el ciclo, las siete barras de color de izquierda a derecha', () => {
    const k = packParams(META, params('carta', clean));
    const want = [[0.75, 0.75, 0.75], [0.75, 0.75, 0], [0, 0.75, 0.75], [0, 0.75, 0], [0.75, 0, 0.75], [0.75, 0, 0], [0, 0, 0.75]];
    want.forEach((c, b) => {
      const x = -0.9 + ((b + 0.5) / 7) * 1.8;
      const got = at(k, x, 0.3, 0.05);
      for (let i = 0; i < 3; i++) expect(got[i], `barra ${b}`).toBeCloseTo(c[i], 3);
    });
  });

  it('las barras se derriten por columnas: cada columna se hunde a su ritmo, cada vez más, y el borde de abajo gotea', () => {
    const p = params('deshielo', clean);
    const k = packParams(META, p);
    const P = p.cycle as number, w = p.drip as number;
    const cols = Array.from({ length: 40 }, (_, i) => -0.85 + (i + 0.5) * w);
    const early = cols.map(x => melt(x, 0.02 * P, k)), mid = cols.map(x => melt(x, 0.5 * P, k)), late = cols.map(x => melt(x, 0.9 * P, k));
    expect(Math.max(...early)).toBeLessThan(0.01);
    const sd = (a: number[]) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
    expect(sd(late)).toBeGreaterThan(0.03);
    cols.forEach((_, i) => expect(late[i], `columna ${i}`).toBeGreaterThanOrEqual(mid[i]));
    expect(late.reduce((s, v) => s + v, 0)).toBeGreaterThan(1.5 * mid.reduce((s, v) => s + v, 0));
    // under the bars (the strip at y = −0.2): at first the strip, late in the cycle the bars' colours have dripped into it
    let dripped = 0;
    for (const x of cols) {
      const a = at(k, x, -0.2, 0.02 * P), b = at(k, x, -0.2, 0.9 * P);
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 0.3) dripped++;
    }
    expect(dripped).toBeGreaterThan(8);
  });

  it('cortes de cinta: líneas desgarradas de lado y la banda de seguimiento; líneas de barrido una fila sí y otra no', () => {
    const torn = packParams(META, params('cinta', { ...clean, cuts: 1 })), calm = packParams(META, params('cinta', clean));
    let moved = 0;
    for (let row = 0; row < 40; row++) {
      const y = 0.45 - row * PX;
      if (Math.abs(at(torn, 0.05, y, 3.3)[3] - at(calm, 0.05, y, 3.3)[3]) > 0.05) moved++;
    }
    expect(moved).toBeGreaterThan(0);
    const scan = packParams(META, params('carta', { ...clean, scan: 1 })), flat = packParams(META, params('carta', clean));
    // two neighbouring rows inside the white bar: one is dimmer with scan lines, both the same without
    const y0 = 0.2 + 0.125 * PX;
    const r = (k: Float32Array) => at(k, -0.8, y0, 0.05)[3] / at(k, -0.8, y0 + PX, 0.05)[3];
    expect(Math.abs(Math.log(r(scan)))).toBeGreaterThan(0.2);
    expect(r(flat)).toBeCloseTo(1, 6);
  });

  it('bucle exacto: cada preset vuelve a su inicio al cabo de su ciclo', () => {
    for (const pr of META.presets) {
      const k = packParams(META, params(pr.id));
      expect(pr.period).toBe(pr.params.cycle);
      const P = pr.period!;
      for (const t of [0.7, 5.3]) {
        let d = 0, dm = 0;
        for (let i = 0; i < 400; i++) {
          const x = -0.85 + (i % 20) * 0.09, y = -0.48 + Math.floor(i / 20) * 0.05;
          const a = at(k, x, y, t), b = at(k, x, y, t + P), c = at(k, x, y, t + P / 2);
          d += Math.abs(a[3] - b[3]) + Math.abs(a[0] - b[0]); dm += Math.abs(a[3] - c[3]);
        }
        expect(d / 400, pr.id).toBeLessThan(1e-4);
        expect(dm / 400, pr.id).toBeGreaterThan(1e-3);
      }
    }
  });
});
