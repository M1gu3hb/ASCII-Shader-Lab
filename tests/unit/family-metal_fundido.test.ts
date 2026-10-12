import { describe, expect, it } from 'vitest';
import { impl, metalHeight } from '../../src/families/analytic/metal_fundido.cpu';
import { META } from '../../src/families/meta/metal_fundido';
import { defaultParams, packParams } from '../../src/families/params';
import { paletteOf } from '../../src/families/palette';
import type { Palette, Params } from '../../src/families/types';

/**
 * Mechanism checks of «Metal fundido» (I-16): a triply warped height field with metaball drops, lit as a metal
 * through its normal (a studio reflected, Schlick's Fresnel), tinted by each metal's own reflectance.
 */

const W = 64, H = 32, PX = 1 / 32;
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
function frame(p: Params, t: number, pal?: Palette) {
  const k = packParams(META, p);
  impl.prep!(t, k, pal, PX);
  const l = new Float64Array(W * H), c = new Float64Array(W * H * 3), o = new Float64Array(3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = ((x + 0.5) / W - 0.5) * 2, py = 0.5 - (y + 0.5) / H;
    l[y * W + x] = impl.cpu(px, py, t, k);
    impl.cpuColor!(px, py, t, k, o);
    c.set(o, (y * W + x) * 3);
  }
  return { l, c };
}
const std = (a: Float64Array) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length); };

describe('metal fundido', () => {
  it('las gotas son metabolas: donde están sube un domo, lejos de ellas nada', () => {
    const T = 2.3 * 0.3, sc = 0.75, wa = 0.7;
    // drop 0's centre at that moment (the same path as in the shader)
    const cx = 0.78 * Math.sin(T * 0.29), cy = 0.34 * Math.sin(T * 0.21 + 0.5);
    expect(metalHeight(cx, cy, T, sc, wa, 1) - metalHeight(cx, cy, T, sc, wa, 0)).toBeGreaterThan(0.3);
    // far from every drop the sheet is the warped marble alone
    let far = 0;
    for (const [x, y] of [[-3, 2], [4, -3], [5, 5]]) far = Math.max(far, Math.abs(metalHeight(x, y, T, sc, wa, 1) - metalHeight(x, y, T, sc, wa, 0)));
    expect(far).toBeLessThan(0.01);
  });

  it('el relieve ilumina: con más relieve la luz cambia más de un sitio a otro', () => {
    const lo = frame(params('oro', { relief: 0, drops: 0 }), 4).l, hi = frame(params('oro', { relief: 1, drops: 0 }), 4).l;
    expect(std(hi)).toBeGreaterThan(1.3 * std(lo));
  });

  it('cada metal se tiñe con su propia reflectancia, no con la paleta; «El de la paleta», con la paleta', () => {
    const warm = paletteOf(['#100800', '#804000', '#ffc080']), cold = paletteOf(['#000810', '#004080', '#80c0ff']);
    const tint = (c: Float64Array) => { let r = 0, g = 0, b = 0; for (let i = 0; i < c.length; i += 3) { r += c[i]; g += c[i + 1]; b += c[i + 2]; } return [r, g, b]; };
    const gold = tint(frame(params('oro'), 4, cold).c), silver = tint(frame(params('oro', { metal: 'plata' }), 4, cold).c), copper = tint(frame(params('oro', { metal: 'cobre' }), 4, cold).c);
    // gold: red > green > blue; silver: almost grey; copper: redder than gold
    expect(gold[0]).toBeGreaterThan(gold[1]); expect(gold[1]).toBeGreaterThan(1.4 * gold[2]);
    expect(Math.abs(silver[0] - silver[2]) / silver[0]).toBeLessThan(0.1);
    expect(copper[0] / copper[1]).toBeGreaterThan(gold[0] / gold[1]);
    // the piece's palette does not change gold…
    const gw = frame(params('oro'), 4, warm).c, gc = frame(params('oro'), 4, cold).c;
    let d = 0;
    for (let i = 0; i < gw.length; i++) d = Math.max(d, Math.abs(gw[i] - gc[i]));
    expect(d).toBeLessThan(1e-12);
    // …but it is the reflectance of «El de la paleta»
    const pw = tint(frame(params('iris'), 4, warm).c), pc = tint(frame(params('iris'), 4, cold).c);
    expect(pw[0] / pw[2]).toBeGreaterThan(2 * (pc[0] / pc[2]));
  });

  it('el metal fluye: la superficie cambia con el tiempo', () => {
    const a = frame(params('marea'), 3).l, b = frame(params('marea'), 9).l;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    expect(s / a.length).toBeGreaterThan(0.03);
  });
});
