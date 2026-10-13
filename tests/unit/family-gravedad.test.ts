import { describe, expect, it } from 'vitest';
import { create, energy } from '../../src/families/sims/gravedad';
import { META } from '../../src/families/meta/gravedad';
import { defaultParams, timeContract } from '../../src/families/params';
import type { FieldModel, ModelState, Params } from '../../src/families/types';

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

describe('galaxia de brazos', () => {
  const spiral = (over: Params = {}) => ({ ...defaultParams(META), init: 'espiral', bodies: 600, arms: 2, tilt: 0, spin: 0, trail: 0, zoom: 1, ...over });
  /** Brightness around a ring of the face-on raster (radius r in domain units), in 72 sectors. */
  const ring = (m: FieldModel, r: number) => {
    const o = new Uint8Array(m.w * m.h);
    m.render(o, 0);
    const k = 0.42 / 0.95, n = 72, out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (let dr = -0.04; dr <= 0.04; dr += 0.01) {
        const x = Math.cos(a) * (r + dr) * k, y = Math.sin(a) * (r + dr) * k;
        const px = Math.floor((x * 0.5 + 0.5) * m.w), py = Math.floor((0.5 - y) * m.h);
        out[i] += o[py * m.w + px];
      }
    }
    return out;
  };
  /** Strength of the m-fold pattern around the ring: |Σ b e^{i m θ}| / Σ b. */
  const fold = (b: Float64Array, mm: number) => {
    let re = 0, im = 0, s = 0;
    b.forEach((v, i) => { const a = (i / b.length) * Math.PI * 2 * mm; re += v * Math.cos(a); im += v * Math.sin(a); s += v; });
    return Math.hypot(re, im) / s;
  };

  it('tiene tantos brazos como pide, y los conserva después de muchas vueltas', () => {
    for (const arms of [2, 3]) {
      const m = create({ seed: 'brazos', params: spiral({ arms }), res: 96 });
      for (const steps of [300, 18000]) {
        m.step(steps - m.steps);
        const b = ring(m, 0.45);
        // the asked number of arms stands out over the others around the ring
        expect(fold(b, arms), `${arms} brazos, paso ${steps}`).toBeGreaterThan(0.15);
        expect(fold(b, arms), `${arms} brazos, paso ${steps}`).toBeGreaterThan(2 * fold(b, arms === 2 ? 3 : 2));
      }
    }
  });

  it('el dibujo gira: los brazos están en otro sitio unos segundos después', () => {
    const m = create({ seed: 'giro', params: spiral(), res: 96 });
    m.step(300);
    const a = ring(m, 0.45);
    m.step(300);
    const b = ring(m, 0.45);
    let d = 0, s = 0;
    for (let i = 0; i < a.length; i++) { d += Math.abs(a[i] - b[i]); s += a[i]; }
    expect(d / s).toBeGreaterThan(0.2);
  });

  it('guardar y restaurar la galaxia continúa exactamente igual, y no acepta el estado de otro sistema', () => {
    const p = spiral({ trail: 0.4, tilt: 30, spin: 0.2 });
    const a = create({ seed: 'estado', params: p, res: 48 });
    a.step(50);
    const snap = a.snapshot();
    a.step(31);
    const b = create({ seed: 'estado', params: p, res: 48 });
    b.restore(snap);
    b.step(31);
    const ra = new Uint8Array(a.w * a.h), rb = new Uint8Array(b.w * b.h);
    a.render(ra, 0); b.render(rb, 0);
    expect(rb).toEqual(ra);
    const disc = create({ seed: 'estado', params: { ...p, init: 'disco' }, res: 48 });
    expect(() => b.restore(disc.snapshot())).toThrow();
  });
});

describe('gravedad: presets continuos', { timeout: 60_000 }, () => {
  const rate = META.budget.rate!, warm = META.budget.warmup!;
  const ras = (m: FieldModel, t: number) => { const o = new Uint8Array(m.w * m.h); m.render(o, t); return o; };
  const mad = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
  const lit = (a: Uint8Array) => { let n = 0; for (const v of a) if (v > 24) n++; return n / a.length; };
  for (const pr of META.presets) {
    const p = { ...defaultParams(META), ...pr.params };
    if (timeContract(META, p) !== 'continuo') continue;
    it(`«${pr.name}» sigue cambiando y no se vacía ni se llena (resolución mínima)`, () => {
      const m = create({ seed: 'continuo', params: p, res: META.budget.res![0] });
      m.step(warm + 20 * rate);
      // the state, with the camera held: the same t for both renders
      const a = ras(m, 20);
      m.step(rate);
      const b = ras(m, 20);
      expect(mad(a, b), pr.id).toBeGreaterThan(0.5);
      for (const r of [a, b]) { expect(lit(r), pr.id).toBeGreaterThan(0.02); expect(lit(r), pr.id).toBeLessThan(0.97); }
    });
  }
});
