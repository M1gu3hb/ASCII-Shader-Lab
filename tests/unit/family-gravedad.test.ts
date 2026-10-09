import { describe, expect, it } from 'vitest';
import { create, energy } from '../../src/families/sims/gravedad';
import { META } from '../../src/families/meta/gravedad';
import { defaultParams } from '../../src/families/params';
import type { ModelState, Params } from '../../src/families/types';

/** N bodies: leapfrog keeps the energy (second order in the step) and pairwise forces keep the momentum. */

const f64 = (a: ModelState['arrays'][string]) => new Float64Array(new Int32Array(a as Int32Array).buffer);
const stats = (m: ReturnType<typeof create>, p: Params) => {
  const s = m.snapshot();
  return energy(f64(s.arrays.pos), f64(s.arrays.vel), f64(s.arrays.mass), s.scalars.n, Number(p.G), Number(p.soft));
};
const params = (over: Params): Params => ({ ...defaultParams(META), bodies: 200, init: 'choque', G: 1, soft: 0.05, ...over });
/** Relative energy error, at its largest, over `time` units of model time. */
const drift = (dt: number, time: number) => {
  const p = params({ dt });
  const m = create({ seed: 'energia', params: p, res: 48 });
  const E0 = stats(m, p).E;
  let worst = 0;
  const n = Math.round(time / dt), every = Math.max(1, Math.round(n / 40));
  for (let k = 0; k < n; k += every) { m.step(every); worst = Math.max(worst, Math.abs(stats(m, p).E - E0)); }
  return worst / Math.abs(E0);
};

describe('gravedad N-cuerpos', () => {
  it('la energía total oscila poco y no se desboca (leapfrog)', () => {
    expect(drift(0.01, 3)).toBeLessThan(0.01);
  });

  it('el error de energía baja con el cuadrado del paso', () => {
    const coarse = drift(0.02, 2), fine = drift(0.01, 2);
    expect(coarse / fine).toBeGreaterThan(2.5);
  });

  it('el momento total se conserva (también al añadir masa en reposo)', () => {
    const p = params({ init: 'disco', bodies: 300, dt: 0.012 });
    const m = create({ seed: 'momento', params: p, res: 48 });
    m.step(200);
    m.stroke!({ brush: 'masa', x0: 0.2, y0: 0.1, x1: 0.2, y1: 0.1, r: 0.05, strength: 1 });
    m.step(100);
    const s = stats(m, p);
    expect(m.snapshot().scalars.n).toBe(301);
    for (const c of s.p) expect(Math.abs(c)).toBeLessThan(1e-9);
  });

  it('el disco gira: casi todos los cuerpos van en el mismo sentido alrededor del centro', () => {
    const p = params({ init: 'disco', bodies: 300, dt: 0.012 });
    const m = create({ seed: 'disco', params: p, res: 48 });
    m.step(150);
    const s = m.snapshot(), pos = f64(s.arrays.pos), vel = f64(s.arrays.vel);
    let pro = 0;
    for (let i = 1; i < 300; i++) if (pos[i * 3] * vel[i * 3 + 1] - pos[i * 3 + 1] * vel[i * 3] > 0) pro++;
    expect(pro / 299).toBeGreaterThan(0.9);
  });
});
