import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/orden_caos';
import { META } from '../../src/families/meta/orden_caos';
import { defaultParams } from '../../src/families/params';
import type { FieldModel, Params } from '../../src/families/types';

/** Mechanism checks of the lattice that melts and crystallises again. */

const base = (p: Params = {}): Params => ({ ...defaultParams(META), ...p });

/** Mean distance from the lattice site, in spacings, for the particles whose site is at x > 0.3 (right) or x ∈ [−0.7, −0.3] (left). */
function offsets(m: FieldModel, a: number, home: { x: Float32Array; y: Float32Array }) {
  const A = m.snapshot().arrays, x = A.x as Float32Array, y = A.y as Float32Array;
  let r = 0, nr = 0, l = 0, nl = 0;
  for (let i = 0; i < x.length; i++) {
    const d = Math.hypot(x[i] - home.x[i], y[i] - home.y[i]) / a;
    if (home.x[i] > 0.3) { r += d; nr++; } else if (home.x[i] < -0.3 && home.x[i] > -0.7) { l += d; nl++; }
  }
  return { right: r / nr, left: l / nl };
}

describe('orden y caos: mecanismo', () => {
  it('el frente funde lo que deja atrás y, a la vuelta, la red vuelve a su sitio', () => {
    const a = 0.05;
    // a 20 s cycle: at 4 s the front stands a little left of the middle, at 20 s it is back at the left edge
    const m = create({ seed: 'ciclo', params: base({ front: 'barrido', period: 20, width: 0.15, spacing: a, turb: 0.8, jitter: 0.1 }), res: 48 });
    const s0 = m.snapshot();
    const home = { x: (s0.arrays.x as Float32Array).slice(), y: (s0.arrays.y as Float32Array).slice() };
    m.step(30 * 4);
    const mid = offsets(m, a, home);
    // behind the front (left) the particles have left their sites; ahead (right) the crystal holds
    expect(mid.left).toBeGreaterThan(1.5);
    expect(mid.right).toBeLessThan(0.25);
    m.step(30 * 16);
    const back = offsets(m, a, home);
    expect(back.left).toBeLessThan(0.3);
    expect(back.right).toBeLessThan(0.3);
  });

  it('en el cristal, la rigidez decide cuánto se apartan del sitio con el temblor', () => {
    const run = (stiff: number) => {
      const m = create({ seed: 'rig', params: base({ front: 'onda', period: 60, width: 0.05, stiff, jitter: 1 }), res: 48 });
      const s0 = m.snapshot();
      const home = { x: (s0.arrays.x as Float32Array).slice(), y: (s0.arrays.y as Float32Array).slice() };
      // at the start the hot band is outside the frame (left): everything is crystal
      m.step(60);
      return offsets(m, 0.05, home).right;
    };
    expect(run(0)).toBeGreaterThan(run(1) * 1.5);
  });

  it('el flujo fundido corre paralelo a las paredes: nadie sale del dominio', () => {
    const m = create({ seed: 'pared', params: base({ front: 'radial', period: 8, width: 0.6, turb: 1 }), res: 48 });
    for (let k = 0; k < 10; k++) {
      m.step(30);
      const A = m.snapshot().arrays, x = A.x as Float32Array, y = A.y as Float32Array;
      for (let i = 0; i < x.length; i++) { expect(Math.abs(x[i])).toBeLessThanOrEqual(1); expect(Math.abs(y[i])).toBeLessThanOrEqual(0.5); }
    }
  });
});
