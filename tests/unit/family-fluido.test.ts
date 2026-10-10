import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/fluido';
import { META } from '../../src/families/meta/fluido';
import { defaultParams } from '../../src/families/params';
import type { FieldModel, Params } from '../../src/families/types';

/** Mechanism checks of the stable-fluids model (MAC grid: u on vertical faces, v on horizontal ones). */

const base = (p: Params = {}): Params => ({ ...defaultParams(META), ...p });
const grid = (m: FieldModel) => {
  const s = m.snapshot(), u = s.arrays.u as Float32Array, v = s.arrays.v as Float32Array;
  const sh = Math.round(Math.sqrt((s.arrays.p as Float32Array).length / 2)), sw = 2 * sh;
  return { u, v, sw, sh, dye: s.arrays.dye as Float32Array };
};

/** RMS of the divergence over the cells, against the RMS of the velocity differences that make it up. */
function divergence(m: FieldModel) {
  const { u, v, sw, sh } = grid(m);
  let d2 = 0, g2 = 0;
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
    const du = u[j * (sw + 1) + i + 1] - u[j * (sw + 1) + i], dv = v[(j + 1) * sw + i] - v[j * sw + i];
    d2 += (du + dv) ** 2; g2 += du * du + dv * dv;
  }
  return Math.sqrt(d2 / g2);
}

function enstrophy(m: FieldModel) {
  const { u, v, sw, sh } = grid(m);
  let s = 0;
  for (let j = 0; j < sh - 1; j++) for (let i = 0; i < sw - 1; i++) {
    // curl at the cell corner (i + 1, j + 1)
    const w = (v[(j + 1) * sw + i + 1] - v[(j + 1) * sw + i]) - (u[(j + 1) * (sw + 1) + i + 1] - u[j * (sw + 1) + i + 1]);
    s += w * w;
  }
  return s / ((sw - 1) * (sh - 1));
}

describe('fluido: mecanismo', () => {
  it('la proyección de presión deja la velocidad casi sin divergencia (y mejor con más iteraciones)', () => {
    const run = (iters: number) => { const m = create({ seed: 'div', params: base({ jets: 6, force: 3, iters, obst: 3 }), res: 64 }); m.step(90); return divergence(m); };
    const many = run(40), few = run(4);
    // without projection the divergence is of the order of the differences themselves (ratio ~ 1)
    expect(many).toBeLessThan(0.02);
    expect(few).toBeGreaterThan(many * 5);
  });

  it('el pincel echa tinta y empuja en su dirección; sin chorros, la tinta sólo disminuye, al ritmo de su disipación', () => {
    const m = create({ seed: 'tinta', params: base({ jets: 0, vort: 0.5, dyeDiss: 0.3 }), res: 64 });
    m.stroke!({ brush: 'tinta', x0: -0.6, y0: 0, x1: 0.4, y1: 0, r: 0.08, strength: 1 });
    const mass = () => grid(m).dye.reduce((a, b) => a + b, 0);
    const m0 = mass();
    let prev = m0;
    expect(m0).toBeGreaterThan(10);
    for (let i = 0; i < 90; i++) {
      m.step(1);
      const now = mass();
      expect(now, `paso ${i}`).toBeLessThan(prev);
      prev = now;
      if (i === 4) {
        // around the middle of the stroke (domain x = −0.1, y = 0) the flow runs to the right
        const { u, sw, sh } = grid(m), cx = Math.round(0.45 * sw), cy = Math.round(sh / 2);
        let s = 0;
        for (let j = cy - 2; j <= cy + 2; j++) for (let k = cx - 4; k <= cx + 4; k++) s += u[j * (sw + 1) + k];
        expect(s / 45).toBeGreaterThan(0.3);
      }
    }
    // the advection moves it without creating or losing any: what is gone is the dissipation's share
    expect(prev / m0).toBeCloseTo(Math.exp(-0.3 * 90 / 30), 3);
  });

  it('el refuerzo de vorticidad mantiene más remolinos que sin él', () => {
    const run = (vort: number) => { const m = create({ seed: 'vort', params: base({ jets: 6, force: 2.5, vort }), res: 64 }); m.step(150); return enstrophy(m); };
    expect(run(1)).toBeGreaterThan(run(0) * 1.3);
  });

  it('la corriente desde la izquierda entra por un lado y sale por el otro', () => {
    const m = create({ seed: 'canal', params: base({ layout: 'izquierda', force: 2, obst: 0, jets: 3 }), res: 64 });
    m.step(150);
    const { u, sw, sh } = grid(m);
    let left = 0, right = 0;
    for (let j = 0; j < sh; j++) { left += u[j * (sw + 1)]; right += u[j * (sw + 1) + sw]; }
    // what enters through the left wall leaves through the right one (incompressible)
    expect(left).toBeGreaterThan(0);
    expect(Math.abs(right - left) / left).toBeLessThan(0.1);
  });
});
