import { describe, expect, it } from 'vitest';
import { heightAt, impl } from '../../src/families/analytic/tejido_bandas.cpu';
import { META } from '../../src/families/meta/tejido_bandas';
import { defaultParams, packParams } from '../../src/families/params';
import type { Palette, Params } from '../../src/families/types';

/** Mechanism checks of «Tejido de bandas» (I-17): crossings over and under that flip, colours by bands. */

const PAL: Palette = { n: 5, rgb: new Float32Array([0.04, 0.03, 0.02, 0.85, 0.63, 0.1, 0.12, 0.48, 0.23, 0.71, 0.15, 0.12, 0.94, 0.82, 0.48, 0, 0, 0]) };
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const C = new Float64Array(3);
const colour = (k: Float32Array, x: number, y: number, t: number) => { impl.prep!(t, k, PAL); impl.cpuColor!(x, y, t, k, C); return [C[0], C[1], C[2]]; };
const hue = (c: number[]) => { const m = Math.max(...c, 1e-6); return c.map(v => v / m); };
const same = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.02);

describe('tejido de bandas', () => {
  it('en cada cruce un hilo va arriba y, al pasar la ola, el de abajo sube: el color del cruce cambia de la urdimbre a la trama', () => {
    const p = params('oro_verde', { drift: 0, sheen: 0 });
    const k = packParams(META, p);
    const n = p.threads as number;
    let flips = 0;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) {
      // the moments when this crossing shows the warp on top, and the weft
      let tw = -1, tf = -1;
      for (let t = 0; t < 30 && (tw < 0 || tf < 0); t += 0.05) {
        const h = heightAt(i, j, t, k);
        if (h > 0.99 && tw < 0) tw = t;
        if (h < -0.99 && tf < 0) tf = t;
      }
      expect(tw, `cruce ${i},${j}`).toBeGreaterThanOrEqual(0);
      expect(tf, `cruce ${i},${j}`).toBeGreaterThanOrEqual(0);
      const x = (i + 0.5) / n, y = (j + 0.5) / n;
      const warp = colour(k, x, (j + 0.5 + 0.45) / n, tw), weft = colour(k, (i + 0.5 + 0.45) / n, y, tf);
      if (same(hue(warp), hue(weft))) continue;
      expect(same(hue(colour(k, x, y, tw)), hue(warp))).toBe(true);
      expect(same(hue(colour(k, x, y, tf)), hue(weft))).toBe(true);
      flips++;
    }
    expect(flips).toBeGreaterThan(10);
    // with «Cruce» at zero the crossings stay as the weave lays them
    const still = packParams(META, { ...p, flip: 0 });
    for (const t of [0, 7, 30]) expect(heightAt(3, 2, t, still)).toBe(heightAt(3, 2, 0, still));
  });

  it('ligamentos: el llano alterna como un tablero y la sarga corre en diagonal', () => {
    const plain = packParams(META, params('cuadros', { flip: 0 })), twill = packParams(META, params('sarga', { flip: 0 }));
    for (let i = -4; i < 4; i++) for (let j = -4; j < 4; j++) {
      expect(heightAt(i, j, 0, plain)).toBeCloseTo(-heightAt(i + 1, j, 0, plain), 9);
      expect(heightAt(i, j, 0, plain)).toBeCloseTo(-heightAt(i, j + 1, 0, plain), 9);
      expect(heightAt(i, j, 0, twill)).toBeCloseTo(heightAt(i + 1, j - 1, 0, twill), 9);
    }
  });

  it('los hilos llevan su color por bandas: los de una misma banda comparten color y las bandas cambian', () => {
    const p = params('oro_verde', { drift: 0, flip: 0, sheen: 0 });
    const k = packParams(META, p);
    const n = p.threads as number, bw = p.band as number;
    // a warp thread alone (between two weft threads)
    const warpHue = (i: number) => hue(colour(k, (i + 0.5) / n, (0.5 + 0.47) / n, 0));
    let inBand = 0, across = 0;
    for (let i = 0; i < 6 * bw; i++) {
      if (Math.floor(i / bw) === Math.floor((i + 1) / bw)) { expect(same(warpHue(i), warpHue(i + 1)), `hilo ${i}`).toBe(true); inBand++; }
      else if (!same(warpHue(i), warpHue(i + 1))) across++;
    }
    expect(inBand).toBeGreaterThan(5);
    expect(across).toBeGreaterThan(1);
  });
});
