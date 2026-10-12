import { describe, expect, it } from 'vitest';
import { impl, jadeDisp, jadeHit } from '../../src/families/analytic/jade_ruido.cpu';
import { META } from '../../src/families/meta/jade_ruido';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/**
 * Mechanism checks of «Jade de ruido» (I-34, I-35): a sphere pushed along its normal by a 3D noise that is
 * periodic in time, twisted about Y by a·sin(y·f + phase), breathing, coloured by its displacement, and an exact loop.
 */

const W = 64, H = 32;
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
function frame(p: Params, t: number) {
  const k = packParams(META, p);
  impl.prep!(t, k);
  const l = new Float64Array(W * H), c = new Float64Array(W * H * 3), o = new Float64Array(3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = ((x + 0.5) / W - 0.5) * 2, py = 0.5 - (y + 0.5) / H;
    l[y * W + x] = impl.cpu(px, py, t, k);
    impl.cpuColor!(px, py, t, k, o);
    c.set(o, (y * W + x) * 3);
  }
  return { l, c };
}
const mad = (a: Float64Array, b: Float64Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
/** The silhouette's radius along 48 directions (where the rays stop hitting). */
function silhouette(p: Params, t: number) {
  const k = packParams(META, p), out: number[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    let r = 0;
    for (let s = 0.05; s < 0.5; s += 0.0025) if (jadeHit(Math.cos(a) * s, Math.sin(a) * s, t, k) >= 0) r = s;
    out.push(r);
  }
  return out;
}
const spread = (v: number[]) => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length) / m; };

describe('jade de ruido', () => {
  it('el ruido empuja la piel a lo largo de la normal: sin relieve la silueta es un círculo, con relieve no', () => {
    expect(spread(silhouette(params('jade', { amp: 0 }), 3))).toBeLessThan(0.01);
    expect(spread(silhouette(params('iris'), 3))).toBeGreaterThan(0.04);
  });

  it('la torsión gira el espacio del ruido alrededor de Y un ángulo a·sin(y·f + fase)', () => {
    const tw = 1.4, twf = 4, th = 0.9, fq = 3;
    for (const [x, y, z] of [[0.2, 0.1, -0.15], [-0.25, -0.2, 0.05], [0.05, 0.3, 0.2]]) {
      const a = tw * Math.sin(y * twf + th), c = Math.cos(a), s = Math.sin(a);
      expect(jadeDisp(x, y, z, th, fq, tw, twf)).toBeCloseTo(jadeDisp(c * x - s * z, y, s * x + c * z, th, fq, 0, twf), 12);
    }
    // and it changes the figure
    expect(mad(frame(params('oceano'), 2).l, frame(params('oceano', { twist: 0 }), 2).l)).toBeGreaterThan(0.005);
  });

  it('el color sale del desplazamiento: con «Color por relieve» a cero, un solo tono', () => {
    // hue spread over the lit cells: the blue-to-green ratio of each hit cell
    const hueSpread = (p: Params) => {
      const { l, c } = frame(p, 4), r: number[] = [];
      for (let i = 0; i < l.length; i++) if (l[i] > 0.2) r.push(c[i * 3 + 2] / Math.max(c[i * 3 + 1], 1e-3));
      return spread(r);
    };
    expect(hueSpread(params('jade'))).toBeGreaterThan(3 * hueSpread(params('jade', { spread: 0, shine: 0 })));
  });

  it('respira: el tamaño cambia a lo largo del ciclo', () => {
    const p = params('magma', { amp: 0 }), P = p.period as number;
    const r = (t: number) => silhouette(p, t).reduce((a, b) => a + b, 0) / 48;
    // the breath is sin(2θ): largest at a quarter of the half cycle, smallest at three quarters
    expect(r(P / 8)).toBeGreaterThan(r((3 * P) / 8) * 1.12);
  });

  it('el bucle es exacto: el ruido periódico, la torsión y el giro vuelven a su inicio cada «Ciclo»', () => {
    for (const pr of META.presets) {
      const p = params(pr.id), P = p.period as number;
      expect(pr.period, pr.id).toBe(P);
      for (const t of [0.7, 5.2]) {
        const a = frame(p, t), b = frame(p, t + P);
        expect(mad(a.l, b.l), `${pr.id} t=${t}`).toBeLessThan(1e-6);
        expect(mad(a.c, b.c), `${pr.id} t=${t}`).toBeLessThan(1e-6);
        expect(mad(a.l, frame(p, t + P * 0.31).l), `${pr.id} t=${t}`).toBeGreaterThan(1e-3);
      }
    }
  });
});
