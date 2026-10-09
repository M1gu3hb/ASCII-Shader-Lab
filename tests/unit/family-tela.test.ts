import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/tela';
import { META } from '../../src/families/meta/tela';
import { defaultParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Cloth (XPBD): anchors hold, and the constraints are met better with more substeps or less compliance. */

// the low mesh: 24 × 16 particles over 1.6 × 1.0
const NX = 24, NY = 16, DX = 1.6 / (NX - 1), DY = 1.0 / (NY - 1);
const run = (over: Params, steps: number) => {
  const m = create({ seed: 'tela', params: { ...defaultParams(META), mesh: 'baja', anchors: 'borde', wind: 0, ...over }, res: 48 });
  m.step(steps);
  return m.snapshot().arrays.x as Float32Array;
};
/** Mean relative violation of the structural constraints (|d − L| / L). */
const stretch = (x: Float32Array) => {
  let s = 0, c = 0;
  const d = (a: number, b: number) => Math.hypot(x[a * 3] - x[b * 3], x[a * 3 + 1] - x[b * 3 + 1], x[a * 3 + 2] - x[b * 3 + 2]);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i;
    if (i + 1 < NX) { s += Math.abs(d(k, k + 1) - DX) / DX; c++; }
    if (j + 1 < NY) { s += Math.abs(d(k, k + NX) - DY) / DY; c++; }
  }
  return s / c;
};

describe('telas (XPBD)', () => {
  it('los puntos anclados no se mueven, aunque sople el viento', () => {
    const x0 = run({ wind: 0 }, 0), x = run({ wind: 1.5, gravity: 1.5 }, 200);
    for (let i = 0; i < NX; i++) for (let c = 0; c < 3; c++) expect(x[i * 3 + c]).toBe(x0[i * 3 + c]);
    // and the rest of the cloth did move
    expect(Math.abs(x[(NY - 1) * NX * 3 + 2] - x0[(NY - 1) * NX * 3 + 2])).toBeGreaterThan(0.01);
  });

  it('más subpasos cumplen mejor las restricciones', () => {
    const few = stretch(run({ substeps: 2, stiff: 1 }, 90)), many = stretch(run({ substeps: 20, stiff: 1 }, 90));
    expect(many).toBeLessThan(few * 0.5);
  });

  it('menos flexibilidad (más rigidez) estira menos la tela', () => {
    const soft = stretch(run({ stiff: 0.1 }, 90)), stiff = stretch(run({ stiff: 0.9 }, 90));
    expect(stiff).toBeLessThan(soft * 0.3);
  });

  it('«Empujar» mueve la tela bajo el dedo, de forma determinista', () => {
    const make = () => create({ seed: 'tela', params: { ...defaultParams(META), mesh: 'baja', anchors: 'borde', wind: 0 }, res: 48 });
    const a = make(), b = make(), c = make();
    for (const m of [a, b, c]) m.step(30);
    for (const m of [a, b]) { m.stroke!({ brush: 'empujar', x0: 0, y0: 0, x1: 0, y1: 0, r: 0.2, strength: 1 }); m.step(10); }
    c.step(10);
    const xa = a.snapshot().arrays.x as Float32Array, xb = b.snapshot().arrays.x as Float32Array, xc = c.snapshot().arrays.x as Float32Array;
    expect(xa).toEqual(xb);
    let moved = 0;
    for (let i = 0; i < xa.length; i++) moved = Math.max(moved, Math.abs(xa[i] - xc[i]));
    expect(moved).toBeGreaterThan(0.01);
  });

  it('sin anclajes cae y se queda sobre el suelo', () => {
    const x = run({ anchors: 'ninguno', sphere: 'ninguna' }, 150);
    let minY = Infinity, maxY = -Infinity;
    for (let k = 0; k < NX * NY; k++) { minY = Math.min(minY, x[k * 3 + 1]); maxY = Math.max(maxY, x[k * 3 + 1]); }
    expect(minY).toBeGreaterThanOrEqual(-0.62 - 1e-6);
    expect(maxY).toBeLessThan(-0.5);
  });
});
