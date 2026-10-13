import { describe, expect, it } from 'vitest';
import { impl } from '../../src/families/analytic/seda.cpu';
import { META } from '../../src/families/meta/seda';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/**
 * Mechanism checks of «Seda especular» (I-10, I-11, I-33): a height field lit by its normal with a Blinn highlight
 * (silk), Kajiya–Kay anisotropic streaks with translucent layers (cascade), flat triangles (facets), and a sea in
 * perspective shaded facet by facet.
 */

const W = 96, H = 48, PX = 1 / 48;
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const lumAt = (p: Params, t: number) => {
  const k = packParams(META, p);
  impl.prep!(t, k, undefined, PX);
  return (x: number, y: number) => impl.cpu(x, y, t, k);
};
function frame(p: Params, t: number) {
  const f = lumAt(p, t), o = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = f(((x + 0.5) / W - 0.5) * 2, 0.5 - (y + 0.5) / H);
  return o;
}

describe('seda especular', () => {
  it('seda: el brillo especular (Blinn) sale de la normal del relieve; sin brillo, sólo luz difusa', () => {
    const shiny = frame(params('seda'), 5), matte = frame(params('seda', { shine: 0 }), 5);
    // diffuse alone never passes 0.06 + 0.84 (and is read at 0.8): the highlights do
    expect(Math.max(...matte)).toBeLessThanOrEqual(0.06 * 0.8 + 0.84 * 0.8 + 1e-9);
    expect(Math.max(...shiny)).toBeGreaterThan(0.9);
    // and with no relief the surface is flat: one shade everywhere
    const flat = frame(params('seda', { relief: 0 }), 5);
    expect(Math.max(...flat) - Math.min(...flat)).toBeLessThan(1e-9);
  });

  it('cascada: el brillo es anisótropo (Kajiya–Kay): depende de cómo llega la luz respecto a los hilos; el de la seda no', () => {
    // a flat sheet, seen from the front: Blinn's highlight does not care where the light turns, Kajiya–Kay's does
    const flat = { relief: 0, detail: 0, tilt: 0, layers: 1 };
    const mean = (p: Params) => { const f = frame(p, 5); return f.reduce((a, b) => a + b, 0) / f.length; };
    const kk = params('cascada', flat), bl = params('seda', flat);
    const along = (p: Params) => mean({ ...p, light: p.angle as number }), across = (p: Params) => mean({ ...p, light: (p.angle as number) + 90 });
    expect(Math.abs(along(kk) - across(kk))).toBeGreaterThan(0.15);
    expect(Math.abs(along(bl) - across(bl))).toBeLessThan(1e-9);
  });

  it('cascada: las capas de delante son cintas translúcidas, no cubren todo', () => {
    const one = frame(params('cascada', { layers: 1 }), 5), three = frame(params('cascada', { layers: 3 }), 5);
    let changed = 0;
    for (let i = 0; i < one.length; i++) if (Math.abs(one[i] - three[i]) > 1e-6) changed++;
    const share = changed / one.length;
    expect(share).toBeGreaterThan(0.12);
    expect(share).toBeLessThan(0.85);
  });

  it('facetas: dentro de cada triángulo la luz es una sola (caras planas)', () => {
    const p = params('saten');
    const f = lumAt(p, 5), g = 0.04 + 0.3 * (p.facets as number);
    // the sheet drifts slowly along its folds: the grid is in the sheet's coordinates
    const a = ((p.angle as number) * Math.PI) / 180, ox = Math.cos(a) * 5 * 0.04 * (p.speed as number), oy = Math.sin(a) * 5 * 0.04 * (p.speed as number);
    let same = 0, n = 0;
    for (let y = -0.45; y < 0.45; y += 0.037) for (let x = -0.85; x < 0.85; x += 0.041) {
      // a second point a little inside the same triangle of the grid
      const fx = (x + ox) / g - Math.floor((x + ox) / g), fy = (y + oy) / g - Math.floor((y + oy) / g);
      if (Math.abs(fx - fy) < 0.2 || fx < 0.15 || fy < 0.15 || fx > 0.85 || fy > 0.85) continue;
      const x2 = x + (fx > fy ? 0.05 : -0.05) * g, y2 = y;
      n++;
      if (Math.abs(f(x, y) - f(x2, y2)) < 1e-9) same++;
    }
    expect(n).toBeGreaterThan(50);
    expect(same / n).toBeGreaterThan(0.95);
  });

  it('olas facetadas: un mar en perspectiva, con el cielo arriba y las olas que se mueven', () => {
    const p = params('olas', { tilt: 0 });
    const a = frame(p, 5), b = frame(p, 7);
    // the top rows are above the horizon (sky: the same in both moments), the bottom ones are sea (they move)
    let top = 0, bottom = 0;
    for (let x = 0; x < W; x++) { top += Math.abs(a[x] - b[x]); bottom += Math.abs(a[(H - 3) * W + x] - b[(H - 3) * W + x]); }
    expect(top).toBeLessThan(1e-9);
    expect(bottom).toBeGreaterThan(1);
  });
});
