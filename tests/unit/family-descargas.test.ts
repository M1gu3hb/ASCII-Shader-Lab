import { describe, expect, it } from 'vitest';
import { descCond, impl } from '../../src/families/analytic/descargas.cpu';
import { META } from '../../src/families/meta/descargas';
import { defaultParams, packParams } from '../../src/families/params';
import { setPX } from '../../src/engine/basic/patterns';
import type { Params } from '../../src/families/types';

/**
 * Mechanism checks of «Descargas eléctricas»: arcs renew without switching on or off at once, and the piece
 * never flashes over a large area (accessibility: WCAG 2.3.1 asks for no more than three flashes a second).
 */

const W = 40, H = 20;
setPX(1 / H);
function frame(p: Params, t: number, o = new Float64Array(W * H)): Float64Array {
  const k = packParams(META, p);
  impl.prep!(t, k);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = impl.cpu((x + 0.5) / H - W / H / 2, 0.5 - (y + 0.5) / H, t, k);
  return o;
}
const mean = (a: Float64Array) => a.reduce((s, v) => s + v, 0) / a.length;
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });

describe('descargas eléctricas', () => {
  it('sin destellos de área grande: entre dos cuadros (30 por segundo) cambia mucho menos de un cuarto del lienzo', () => {
    for (const pr of META.presets) {
      for (const extra of [{}, { flicker: 1 }, { flicker: 1, motion: 1 }] as Params[]) {
        const p = params(pr.id, extra);
        let a = frame(p, 0), worst = 0, worstMean = 0;
        for (let i = 1; i <= 300; i++) {
          const b = frame(p, i / 30);
          let big = 0;
          for (let j = 0; j < a.length; j++) if (Math.abs(b[j] - a[j]) > 0.2) big++;
          worst = Math.max(worst, big / a.length);
          worstMean = Math.max(worstMean, Math.abs(mean(b) - mean(a)));
          a = b;
        }
        expect(worst, `${pr.id} ${JSON.stringify(extra)}`).toBeLessThan(0.25);
        expect(worstMean, `${pr.id} ${JSON.stringify(extra)}`).toBeLessThan(0.05);
      }
    }
  }, 120_000);

  it('los arcos se renuevan sin encenderse ni apagarse de golpe', () => {
    // without crackle the arcs only change by their lives and the conductors' drift: a sweep at 120 per second
    // shows no step in the canvas's ink
    for (const pr of META.presets) {
      const p = params(pr.id, { crackle: 0 });
      let prev = mean(frame(p, 0)), worst = 0;
      for (let i = 1; i <= 120 * 10; i++) {
        const m = mean(frame(p, i / 120));
        worst = Math.max(worst, Math.abs(m - prev));
        prev = m;
      }
      expect(worst, pr.id).toBeLessThan(0.006);
    }
  }, 120_000);

  it('los conductores se mueven y los arcos nacen en ellos', () => {
    const p = params('anillo');
    const k = packParams(META, p);
    const c = new Float64Array(2), d = new Float64Array(2);
    const M = (t: number) => t * (0.15 + 1.2 * (p.motion as number));
    descCond(1, 4, 0, M(0), c);
    descCond(1, 4, 0, M(20), d);
    expect(Math.hypot(c[0] - d[0], c[1] - d[1])).toBeGreaterThan(0.05);
    impl.prep!(20, k);
    // a conductor is a bright point
    expect(impl.cpu(d[0], d[1], 20, k)).toBeGreaterThan(0.5);
  });
});
