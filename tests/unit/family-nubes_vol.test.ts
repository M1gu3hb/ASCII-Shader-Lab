import { afterEach, describe, expect, it } from 'vitest';
import { BUDGET, impl } from '../../src/families/analytic/nubes_vol.cpu';
import { META } from '../../src/families/meta/nubes_vol';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Nubes volumétricas» and of its reduced CPU twin. */

const REDUCED = { ...BUDGET };
const img = (p: Params, t: number) => {
  const k = packParams(META, { ...defaultParams(META), ...p });
  impl.prep!(t, k);
  const o: number[] = [];
  for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) o.push(impl.cpu(((x + 0.5) / 48 - 0.5) * 1.78, 0.5 - (y + 0.5) / 24, t, k));
  return o;
};
const pearson = (a: number[], b: number[]) => {
  const n = a.length; let sa = 0, sb = 0; for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n; let c = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; c += x * y; va += x * x; vb += y * y; }
  return c / Math.sqrt(va * vb);
};
const mad = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

afterEach(() => { Object.assign(BUDGET, REDUCED); });

describe('nubes volumétricas', () => {
  it('sin cobertura no hay densidad: sólo cielo, y el viento no mueve nada', () => {
    for (const camera of ['dentro', 'horizonte']) {
      const p = { cover: 0, wind: 2, camera };
      expect(mad(img(p, 0), img(p, 9)), camera).toBe(0);
      // with clouds the wind carries them
      expect(mad(img({ cover: 0.7, wind: 2, camera }, 0), img({ cover: 0.7, wind: 2, camera }, 9)), camera).toBeGreaterThan(0.01);
    }
  });

  it('Beer–Lambert: cuanto más absorben, más tapan las nubes finas el suelo y menos luz cruza la capa', () => {
    // over the sea of clouds the gaps show dark ground: thin clouds (low coverage) hide more of it, and
    // scatter more light, the more they absorb (opacity 1 − e^(−σ ∫ρ))
    const mean = (o: number[]) => o.reduce((s, v) => s + v, 0) / o.length;
    const thin = (absorb: number) => mean(img({ cover: 0.3, erosion: 0, absorb, camera: 'horizonte', sun: 0.3 }, 3).slice(48 * 14));
    const sky = mean(img({ cover: 0, camera: 'horizonte' }, 3).slice(48 * 14));
    expect(thin(0.2) - sky).toBeLessThan(0.5 * (thin(3) - sky));
    // looking up from under a closed layer (camera «haces»), the light that crosses it falls with σ
    const top = (absorb: number) => { const o = img({ cover: 0.9, absorb, camera: 'haces', sun: 0.5 }, 3); return o.slice(0, 48 * 6).reduce((s, v) => s + v, 0); };
    expect(top(0.4)).toBeGreaterThan(top(2.8));
  });

  it('el gemelo reducido del motor básico sigue al del shader (r > 0,98 en cada preset)', () => {
    for (const pr of META.presets) {
      Object.assign(BUDGET, { steps: 64, light: 5, haze: 32 });
      const full = img(pr.params, 6);
      Object.assign(BUDGET, REDUCED);
      expect(pearson(full, img(pr.params, 6)), pr.id).toBeGreaterThan(0.98);
    }
  });
});
