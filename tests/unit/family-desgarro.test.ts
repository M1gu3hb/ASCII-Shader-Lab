import { describe, expect, it } from 'vitest';
import { impl, tearAt } from '../../src/families/analytic/desgarro.cpu';
import { META } from '../../src/families/meta/desgarro';
import { defaultParams, packParams } from '../../src/families/params';
import { setPX } from '../../src/engine/basic/patterns';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Superficie que se abre»: cycles hand over without a jump, backgrounds never rest. */

const W = 64, H = 32;
setPX(1 / H);
function frame(p: Params, t: number): Float64Array {
  const k = packParams(META, p);
  impl.prep!(t, k);
  const o = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = impl.cpu((x + 0.5) / H - W / H / 2, 0.5 - (y + 0.5) / H, t, k);
  return o;
}
const maxDiff = (a: Float64Array, b: Float64Array) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
const meanDiff = (a: Float64Array, b: Float64Array) => { let m = 0; for (let i = 0; i < a.length; i++) m += Math.abs(a[i] - b[i]); return m / a.length; };
const params = (id: string): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params });

describe('superficie que se abre', () => {
  it('una abertura vale cero al principio y al final de su ciclo: el ciclo siguiente empieza sin salto', () => {
    for (const pr of META.presets) {
      const p = params(pr.id);
      const n = p.tears as number, cyc = p.cycle as number;
      for (let i = 0; i < n; i++) {
        // the boundaries of tear i: t / cyc + i / n is a whole number
        for (let k = 1; k <= 3; k++) {
          const tb = (k - i / n) * cyc;
          const a = frame(p, tb - 1e-3), b = frame(p, tb + 1e-3);
          expect(maxDiff(a, b), `${pr.id} abertura ${i} ciclo ${k}`).toBeLessThan(0.03);
        }
      }
    }
  });

  it('los presets de fondo siempre tienen alguna abertura en marcha (no hay calma total)', () => {
    for (const pr of META.presets.filter(p => p.uses?.some(u => u.startsWith('fondos/')))) {
      const p = params(pr.id);
      const n = p.tears as number, cyc = p.cycle as number, calm = p.calm as number;
      let least = 1;
      for (let t = 0; t < 240; t += 0.1) {
        let most = 0;
        for (let i = 0; i < n; i++) most = Math.max(most, tearAt(t, i, n, cyc, calm).open);
        least = Math.min(least, most);
      }
      expect(least, pr.id).toBeGreaterThan(0.15);
    }
  });

  it('nunca se queda quieta: también en la calma la luz se mueve sobre la superficie', () => {
    for (const pr of META.presets) {
      const p = params(pr.id);
      for (const t of [0, 0.4, 7.3, 31, 122, 600]) expect(meanDiff(frame(p, t), frame(p, t + 0.5)), `${pr.id} t=${t}`).toBeGreaterThan(0.001);
    }
  });

  it('la abertura deja ver lo de detrás junto al impacto, y cada ciclo golpea en otro sitio', () => {
    const p = { ...params('rasgado') };
    const cyc = p.cycle as number, q = (p.calm as number) * 0.45;
    // the middle of the opening: past the calm, about a third into the active part
    const t = (q + 0.4 * (1 - q)) * cyc;
    const s = tearAt(t, 0, 1, cyc, p.calm as number);
    expect(s.open).toBeGreaterThan(0.9);
    const k = packParams(META, p);
    impl.prep!(t, k);
    // the hot rim of the opening is right by the impact
    let most = 0;
    for (let dy = -0.12; dy <= 0.12; dy += 0.01) for (let dx = -0.12; dx <= 0.12; dx += 0.01) most = Math.max(most, impl.cpu(s.cx + dx, s.cy + dy, t, k));
    expect(most).toBeGreaterThan(0.8);
    const s2 = tearAt(t + cyc, 0, 1, cyc, p.calm as number);
    expect(Math.hypot(s2.cx - s.cx, s2.cy - s.cy)).toBeGreaterThan(0.01);
  });
});
