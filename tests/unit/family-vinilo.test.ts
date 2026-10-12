import { describe, expect, it } from 'vitest';
import { impl, viniloState } from '../../src/families/analytic/vinilo.cpu';
import { META } from '../../src/families/meta/vinilo';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/**
 * Mechanism of «Disco de vinilo» (I-18): a disc that turns (label and music in the grooves turn with it), a
 * cross of reflection that stays with the light (and turns only with it), iridescent colour in it, a tone arm
 * whose stylus tracks inwards, an exact loop.
 */
const PX = 1 / 72;
const P = (extra: Params = {}): Params => ({ ...defaultParams(META), ...extra });
const at = (p: Params) => {
  const k = packParams(META, p);
  const o = new Float64Array(3);
  return {
    k,
    lum: (x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); },
    col: (x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); impl.cpu(x, y, t, k); impl.cpuColor!(x, y, t, k, o); return [o[0], o[1], o[2]]; },
  };
};
/** Values on a circle of radius r around the disc's centre (seen from above: no tilt). */
const ring = (f: (x: number, y: number, t: number) => number, cx: number, r: number, t: number, n = 720) =>
  Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return f(cx + r * Math.cos(a), r * Math.sin(a), t); });
const bestShift = (a: number[], b: number[]) => {
  let best = 0, bc = -Infinity;
  for (let s = 0; s < a.length; s++) { let c = 0; for (let i = 0; i < a.length; i++) c += a[i] * b[(i + s) % a.length]; if (c > bc) { bc = c; best = s; } }
  return best;
};

// (dense samplings of the CPU twin: generous time when the suite shares the machine)
describe('disco de vinilo', { timeout: 60_000 }, () => {
  it('la etiqueta y la música de los surcos giran con el disco', () => {
    const f = at(P({ tilt: 0, arm: 0, shine: 0, speed: 'lento', signal: 1 }));
    const s0 = viniloState(f.k, 1), s1 = viniloState(f.k, 1.6);
    const turn = (s1.rot - s0.rot) / (2 * Math.PI);
    // a ring of marks on the label, and the grooves
    for (const r of [0.55 * 0.3 * s0.Rd, 0.53 * s0.Rd]) {
      const a = ring(f.lum, s0.cx, r, 1), b = ring(f.lum, s0.cx, r, 1.6);
      const sh = bestShift(a, b) / a.length;
      expect(Math.abs(sh - (turn % 1)), `r=${r}`).toBeLessThan(0.01);
    }
  });

  it('sin música los surcos son anillos; con música ondulan', () => {
    const quiet = at(P({ tilt: 0, arm: 0, shine: 0, signal: 0 })), loud = at(P({ tilt: 0, arm: 0, shine: 0, signal: 1 }));
    const s = viniloState(quiet.k, 2);
    const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
    expect(spread(ring(quiet.lum, s.cx, 0.53 * s.Rd, 2))).toBeLessThan(1e-9);
    expect(spread(ring(loud.lum, s.cx, 0.53 * s.Rd, 2))).toBeGreaterThan(0.05);
  });

  it('el reflejo en cruz se queda con la luz mientras el disco gira, y gira sólo si gira la luz', () => {
    const still = at(P({ tilt: 0, arm: 0, signal: 0, turn: 0, light: 0.1 }));
    const s = viniloState(still.k, 0);
    const peak = (f: (x: number, y: number, t: number) => number, t: number) => {
      const v = ring(f, s.cx, 0.62 * s.Rd, t, 360);
      return v.indexOf(Math.max(...v)) / 360 * 2 * Math.PI;
    };
    const L = 0.1 * 2 * Math.PI;
    const near = (a: number, b: number) => Math.min(Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))), Math.abs(Math.atan2(Math.sin(a - b - Math.PI), Math.cos(a - b - Math.PI))));
    for (const t of [1, 7.7, 20]) expect(near(peak(still.lum, t), L), `t=${t}`).toBeLessThan(0.08);
    const turning = at(P({ tilt: 0, arm: 0, signal: 0, turn: 1, light: 0.1 }));
    const st = viniloState(turning.k, 9);
    expect(near(peak(turning.lum, 9), st.light)).toBeLessThan(0.08);
    expect(near(st.light, L)).toBeGreaterThan(0.5);
  });

  it('el reflejo tiene los colores del espectro con irisación, y es casi blanco sin ella', () => {
    const hues = (iris: number) => {
      const f = at(P({ tilt: 0, arm: 0, signal: 0, turn: 0, light: 0.1, iris }));
      const s = viniloState(f.k, 0);
      const L = 0.1 * 2 * Math.PI;
      const cs: number[][] = [];
      for (let r = 0.4 * s.Rd; r < 0.95 * s.Rd; r += 0.01) cs.push(f.col(s.cx + r * Math.cos(L), r * Math.sin(L), 0));
      const sat = cs.map(c => Math.max(...c) - Math.min(...c));
      return { maxSat: Math.max(...sat), red: cs.some(c => c[0] > c[1] + 0.2 && c[0] > c[2] + 0.2), blue: cs.some(c => c[2] > c[0] + 0.2) };
    };
    const a = hues(1), b = hues(0);
    expect(a.maxSat).toBeGreaterThan(0.5);
    expect(a.red && a.blue).toBe(true);
    expect(b.maxSat).toBeLessThan(0.15);
  });

  it('la aguja avanza hacia dentro a lo largo del ciclo y vuelve al borde', () => {
    const f = at(P({ tilt: 0 }));
    const P0 = f.k[12];
    let prev = Infinity;
    for (const u of [0.02, 0.2, 0.45, 0.7, 0.88]) {
      const s = viniloState(f.k, u * P0);
      expect(Math.hypot(s.ex, s.ey)).toBeCloseTo(s.rho, 6);
      expect(s.rho).toBeLessThan(prev);
      prev = s.rho;
      // the arm is drawn where the stylus is
      expect(f.lum(s.ex + s.cx, s.ey, u * P0)).toBeGreaterThan(0.5);
    }
    expect(viniloState(f.k, 0.99 * P0).rho).toBeGreaterThan(viniloState(f.k, 0.88 * P0).rho);
  });

  it('cada preset vuelve exactamente a su inicio al cabo del ciclo', () => {
    for (const pr of META.presets) {
      const f = at({ ...defaultParams(META), ...pr.params });
      expect(pr.period).toBe(pr.params.cycle);
      let worst = 0;
      for (const t0 of [0.4, 3.3]) for (let y = -0.48; y <= 0.48; y += 0.03) for (let x = -0.7; x <= 0.7; x += 0.03) worst = Math.max(worst, Math.abs(f.lum(x, y, t0) - f.lum(x, y, t0 + pr.period!)));
      expect(worst, pr.id).toBeLessThan(2e-3);
    }
  });
});
