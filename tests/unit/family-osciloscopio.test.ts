import { describe, expect, it } from 'vitest';
import { oscY } from '../../src/families/analytic/osciloscopio.cpu';
import { META } from '../../src/families/meta/osciloscopio';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Osciloscopio que se degrada»: a cycle without jumps, a degradation that bites. */

const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const xs = Array.from({ length: 161 }, (_, i) => -0.8 + i * 0.01);

describe('osciloscopio que se degrada', () => {
  it('la traza no salta entre un ciclo y el siguiente (los pesos cambian mientras está plana)', () => {
    for (const pr of META.presets) {
      const p = params(pr.id, { noise: 0 });
      const k = packParams(META, p), cyc = p.cycle as number;
      for (let c = 1; c <= 4; c++) {
        let worst = 0;
        for (const x of xs) worst = Math.max(worst, Math.abs(oscY(x, c * cyc - 1e-4, k) - oscY(x, c * cyc + 1e-4, k)));
        expect(worst, `${pr.id} ciclo ${c}`).toBeLessThan(0.01);
      }
    }
  });

  it('en calma la señal es limpia; en el grito se reduce a pocos niveles y se recorta', () => {
    const p = params('grito', { noise: 0 });
    const k = packParams(META, p), cyc = p.cycle as number;
    const levels = (t: number) => new Set(xs.map(x => Math.round(oscY(x, t, k) * 1e4))).size;
    for (let c = 0; c < 3; c++) {
      const calm = levels((c + 0.15) * cyc), scream = levels((c + 0.74) * cyc);
      expect(calm, `ciclo ${c}`).toBeGreaterThan(60);
      expect(scream, `ciclo ${c}`).toBeLessThan(calm / 2);
    }
  });

  it('sigue corriendo: la traza cambia en la calma, entre ciclos y diez minutos después', () => {
    const p = params('limpia');
    const k = packParams(META, p);
    for (const t of [0.5, 13, 600]) {
      let d = 0;
      for (const x of xs) d += Math.abs(oscY(x, t, k) - oscY(x, t + 0.5, k));
      expect(d / xs.length, `t=${t}`).toBeGreaterThan(0.01);
    }
  });
});
