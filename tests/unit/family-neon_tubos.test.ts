import { describe, expect, it } from 'vitest';
import { SIGN, impl, neonBase, neonOn, neonSign } from '../../src/families/analytic/neon.cpu';
import { META } from '../../src/families/meta/neon_tubos';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/**
 * Mechanism of «Letrero de neón» (I-13): tubes drawn from distance fields that ignite one after another with a
 * stutter, hum, go dark at the end of an exact cycle, drip light that falls, and show on the wall and the floor.
 */
const PX = 1 / 72;
const P = (extra: Params = {}): Params => ({ ...defaultParams(META), ...extra });
const lumOf = (p: Params) => {
  const k = packParams(META, p);
  return (x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); };
};
const S = (p: Params) => 0.75 + 0.6 * (p.size as number);

describe('letrero de neón', () => {
  it('los tubos se encienden uno tras otro, tartamudean al encenderse y se apagan al final del ciclo', () => {
    const Pc = 12, seq = 0.6;
    const first: number[] = [];
    for (let g = 0; g < 7; g++) {
      let t0 = -1, flips = 0, prev = 0;
      for (let tau = 0; tau < Pc; tau += 0.005) {
        const on = neonOn(g, tau, Pc, seq, 0, 0) > 0 ? 1 : 0;
        if (on && t0 < 0) t0 = tau;
        if (t0 >= 0 && tau < t0 + 0.6 && on !== prev) flips++;
        prev = on;
      }
      first.push(t0);
      expect(flips, `tubo ${g}`).toBeGreaterThan(1);
      // dark at the end of the cycle
      expect(neonOn(g, Pc * 0.95, Pc, seq, 0, 0)).toBe(0);
    }
    for (let g = 1; g < 7; g++) expect(first[g]).toBeGreaterThan(first[g - 1]);
  });

  it('lo más brillante está sobre los tubos; apagado, sólo queda el vidrio', () => {
    for (const shape of ['corazon', 'estrella', 'arcos', 'palabra', 'letrero']) {
      const p = P({ shape, drip: 0, reflect: 0, wall: 0, flicker: 0, fault: 0 });
      const f = lumOf(p);
      const s = S(p);
      const w = PX * (0.3 + 1.1 * (p.thick as number)) / s;
      let lit = 0;
      for (let y = -0.48; y <= 0.48; y += 0.008) for (let x = -0.85; x <= 0.85; x += 0.008) {
        // lit: 10 s into a 12 s cycle (shape presets differ, the default cycle is 12 s)
        const v = f(x, y, 10);
        if (v > 0.9) { lit++; expect(neonSign(x / s, y / s, ['corazon', 'estrella', 'arcos', 'palabra', 'letrero'].indexOf(shape)), shape).toBeLessThan(1.6 * w); }
        // dark phase: at most the faint glass on the tubes
        expect(f(x, y, 11.5), shape).toBeLessThan(0.15);
      }
      expect(lit, shape).toBeGreaterThan(20);
    }
  });

  it('el ciclo es exacto', () => {
    for (const pr of META.presets) {
      const f = lumOf({ ...defaultParams(META), ...pr.params });
      expect(pr.period).toBe(pr.params.cycle);
      let worst = 0;
      for (const t0 of [0.3, 2.7, 5.1]) for (let y = -0.48; y <= 0.48; y += 0.04) for (let x = -0.85; x <= 0.85; x += 0.04) worst = Math.max(worst, Math.abs(f(x, y, t0) - f(x, y, t0 + pr.period!)));
      expect(worst, pr.id).toBeLessThan(1e-3);
    }
  });

  it('la luz gotea hacia abajo desde un punto bajo del tubo', () => {
    const base = P({ shape: 'corazon', reflect: 0, wall: 0, flicker: 0, fault: 0, glow: 0 });
    const f0 = lumOf({ ...base, drip: 0 }), f1 = lumOf({ ...base, drip: 1 });
    // the column under the heart's lowest point: where the extra light is, over half a second
    const s = S(base);
    const yOf = (t: number) => {
      let best = 0, at = 0;
      for (let y = -0.5; y < -0.27 * s; y += 0.002) { const d = f1(0, y, t) - f0(0, y, t); if (d > best) { best = d; at = y; } }
      return { best, at };
    };
    const a = yOf(5.15), b = yOf(5.35);
    expect(a.best).toBeGreaterThan(0.2);
    expect(b.best).toBeGreaterThan(0.1);
    expect(b.at).toBeLessThan(a.at);
  });

  it('el reflejo sólo está bajo la base del letrero y la pared sólo donde llega la luz', () => {
    const base = P({ shape: 'estrella', drip: 0, flicker: 0, fault: 0 });
    const s = S(base);
    const r0 = lumOf({ ...base, reflect: 0 }), r1 = lumOf({ ...base, reflect: 1 });
    const w0 = lumOf({ ...base, wall: 0 }), w1 = lumOf({ ...base, wall: 1 });
    let below = 0, near = 0;
    for (let y = -0.5; y <= 0.5; y += 0.006) for (let x = -0.85; x <= 0.85; x += 0.008) {
      const dr = r1(x, y, 6) - r0(x, y, 6);
      if (y >= neonBase(1) * s) expect(dr).toBe(0); else if (dr > 0.05) below++;
      const dw = w1(x, y, 6) - w0(x, y, 6);
      const d = neonSign(x / s, y / s, 1);
      if (d > 0.5) expect(dw, `(${x}, ${y})`).toBeLessThan(0.01);
      if (d < 0.08 && dw > 0.03) near++;
      void SIGN;
    }
    expect(below).toBeGreaterThan(10);
    expect(near).toBeGreaterThan(50);
  });
});
