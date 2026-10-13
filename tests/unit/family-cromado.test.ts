import { describe, expect, it } from 'vitest';
import { cromadoProfile, cromadoSD, impl } from '../../src/families/analytic/cromado.cpu';
import { META } from '../../src/families/meta/cromado';
import { defaultParams, packParams } from '../../src/families/params';
import { setPX } from '../../src/engine/basic/patterns';
import type { Params, Palette } from '../../src/families/types';

/** Mechanism checks of «Cromado en tramas»: the masks, the bands that crowd along the contour, dispersion. */

setPX(1 / 51);
const params = (extra: Params = {}): Params => ({ ...defaultParams(META), ...extra });
const GREY: Palette = { n: 2, rgb: new Float32Array([0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) };

describe('cromado en tramas', () => {
  it('cada forma tiene su distancia con signo: negativa dentro, positiva fuera', () => {
    const R = 0.36;
    for (const m of [1, 3, 4]) {
      expect(cromadoSD(0, 0, m, R, 0), `forma ${m} centro`).toBeLessThan(0);
      expect(cromadoSD(0.8, 0.45, m, R, 0), `forma ${m} lejos`).toBeGreaterThan(0);
    }
    // the ring is empty in the middle and full on its band
    expect(cromadoSD(0, 0, 2, R, 0)).toBeGreaterThan(0);
    expect(cromadoSD(0.7 * R, 0, 2, R, 0)).toBeLessThan(0);
    // metaballs: somewhere near the centre is inside, the corners are outside
    let inside = false;
    for (let x = -0.5; x <= 0.5; x += 0.02) if (cromadoSD(x, 0, 5, R, 3) < 0) inside = true;
    expect(inside).toBe(true);
    expect(cromadoSD(0.85, 0.48, 5, R, 3)).toBeGreaterThan(0);
  });

  it('las bandas se aprietan junto al contorno: más cambios de banda cerca del borde con «Contorno» alto', () => {
    const changes = (contour: number) => {
      const p = params({ mask: 'circulo', contour, distortion: 0, size: 0.4, rep: 4, angle: 90 });
      const k = packParams(META, p);
      impl.prep!(0, k, GREY);
      // along a radius, the outer fifth of the disc
      let n = 0, prev = impl.cpu(0.4 * 0.8, 0, 0, k);
      for (let r = 0.4 * 0.8; r < 0.4 * 0.99; r += 0.001) { const v = impl.cpu(r, 0, 0, k); if (Math.abs(v - prev) > 0.02) n++; prev = v; }
      return n;
    };
    expect(changes(1)).toBeGreaterThan(2 * changes(0) + 2);
  });

  it('fuera de la forma no hay metal, salvo un halo junto al borde', () => {
    const p = params({ mask: 'circulo', size: 0.3 });
    const k = packParams(META, p);
    impl.prep!(2, k, GREY);
    expect(impl.cpu(0.75, 0.4, 2, k)).toBeLessThan(0.01);
    expect(impl.cpu(0, 0, 2, k)).toBeGreaterThan(0);
  });

  it('la dispersión separa rojo y azul; sin ella, con una paleta gris, la celda es gris', () => {
    const out = new Float64Array(3);
    const spread = (dispersion: number) => {
      const p = params({ mask: 'gota', dispersion });
      const k = packParams(META, p);
      impl.prep!(4, k, GREY);
      let s = 0;
      for (let y = -0.3; y <= 0.3; y += 0.02) for (let x = -0.3; x <= 0.3; x += 0.02) { impl.cpu(x, y, 4, k); impl.cpuColor!(x, y, 4, k, out); s += Math.abs(out[0] - out[2]); }
      return s;
    };
    expect(spread(0)).toBeLessThan(1e-9);
    expect(spread(1)).toBeGreaterThan(1);
  });

  it('el perfil de banda se promedia cuando una celda no puede sostenerlo (sin aliasing)', () => {
    let lo = 1, hi = 0;
    for (let x = 0; x < 1; x += 0.01) { const v = cromadoProfile(x, 2); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    expect(hi - lo).toBeLessThan(1e-9);
  });
});
