import { describe, expect, it } from 'vitest';
import { impl } from '../../src/families/analytic/mar.cpu';
import { META } from '../../src/families/meta/mar';
import { defaultParams, packParams } from '../../src/families/params';
import { setPX } from '../../src/engine/basic/patterns';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Mar nocturno»: the moon's glitter path, the horizon, waves that keep running. */

const W = 128, H = 51;
setPX(1 / H);
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const hzOf = (p: Params) => -0.25 + 0.6 * (p.horizon as number);

/** Mean brightness of the sea cells with |x − x0| inside [a, b), over a few moments. */
function seaBand(p: Params, x0: number, a: number, b: number): number {
  const k = packParams(META, p), hz = hzOf(p);
  let s = 0, n = 0;
  for (const t of [3, 9, 17, 40]) {
    impl.prep!(t, k);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = ((x + 0.5) * 10 - 640) / 720, py = 0.5 - (y + 0.5) / H;
      if (py > hz - 0.03) continue;
      const d = Math.abs(px - x0);
      if (d >= a && d < b) { s += impl.cpu(px, py, t, k); n++; }
    }
  }
  return s / Math.max(n, 1);
}

describe('mar nocturno', () => {
  it('la luna se rompe en una columna de destellos sobre el agua, y sin luna no la hay', () => {
    for (const pr of META.presets.filter(p => (p.params.moon as number) > 0)) {
      const p = params(pr.id);
      const mx = (p.moonX as number) * 0.6;
      expect(seaBand(p, mx, 0, 0.08), pr.id).toBeGreaterThan(2 * seaBand(p, mx, 0.45, 9));
    }
    const dark = params('plata', { moon: 0 });
    const mx = (dark.moonX as number) * 0.6;
    expect(seaBand(dark, mx, 0, 0.08)).toBeLessThan(1.5 * seaBand(dark, mx, 0.45, 9));
  });

  it('el horizonte separa cielo y mar donde dice el control', () => {
    for (const h of [0.2, 0.5, 0.8]) {
      const p = params('lago', { horizon: h, moonX: 0.9 });
      const k = packParams(META, p), hz = hzOf(p);
      impl.prep!(5, k);
      // the haze line is the brightest band of the sky away from the moon
      expect(impl.cpu(-0.6, hz + 0.004, 5, k)).toBeGreaterThan(impl.cpu(-0.6, hz + 0.25, 5, k) + 0.05);
    }
  });

  it('las olas siguen corriendo: el mar cambia y el cielo lejos de la luna casi no', () => {
    const p = params('mar_fondo');
    const k = packParams(META, p), hz = hzOf(p);
    let sea = 0, sky = 0;
    for (const t of [2, 50, 300]) {
      impl.prep!(t, k);
      const a: number[] = [], as: number[] = [];
      for (let x = -0.8; x <= 0.8; x += 0.02) { a.push(impl.cpu(x, -0.35, t, k)); as.push(impl.cpu(x, hz + 0.3, t, k)); }
      impl.prep!(t + 0.5, k);
      let i = 0;
      for (let x = -0.8; x <= 0.8; x += 0.02, i++) { sea += Math.abs(impl.cpu(x, -0.35, t + 0.5, k) - a[i]); sky += Math.abs(impl.cpu(x, hz + 0.3, t + 0.5, k) - as[i]); }
    }
    expect(sea).toBeGreaterThan(5 * sky + 0.1);
  });
});
