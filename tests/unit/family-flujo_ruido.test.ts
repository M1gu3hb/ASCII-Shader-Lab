import { describe, expect, it } from 'vitest';
import { create, flowField } from '../../src/families/sims/flujo_ruido';
import { META } from '../../src/families/meta/flujo_ruido';
import { defaultParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/**
 * Mechanism checks of «Líneas de flujo» (I-01, I-31): particles that step along the angle of a noise field,
 * θ = dirección + 2π·enredo·N(p, t), leaving ink on a canvas that only fades (the trail's memory); a field that
 * changes with time and tiles the domain; tangled lines against nearly parallel wind.
 */

const DT = 1 / 30;
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });

describe('líneas de flujo', () => {
  it('cada partícula avanza en la dirección del campo de ruido en su punto', () => {
    const p = params('enredo');
    const m = create({ seed: 'mecanismo', params: p, res: 64 });
    m.step(40);
    const a = m.snapshot();
    const tau = a.steps * DT;
    m.step(1);
    const b = m.snapshot();
    const field = flowField('mecanismo');
    const A = a.arrays.pos as Float32Array, B = b.arrays.pos as Float32Array, ageB = b.arrays.age as Float32Array;
    const fp = { cells: p.cells as number, tangle: p.tangle as number, detail: p.detail as number, evolve: p.evolve as number, wind: p.wind as number };
    let checked = 0, worst = 0;
    for (let i = 0; i < (p.count as number); i++) {
      const dx = B[i * 2] - A[i * 2], dy = B[i * 2 + 1] - A[i * 2 + 1];
      // skip the ones that crossed an edge or were born again in this step
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || ageB[i] < DT * 0.5) continue;
      const th = field.angle(A[i * 2], A[i * 2 + 1], tau, fp);
      const d = Math.atan2(dy, dx) - th;
      worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(d), Math.cos(d))));
      checked++;
    }
    expect(checked).toBeGreaterThan((p.count as number) * 0.9);
    // float32 positions: the step's direction matches the field's angle to a few thousandths of a radian
    expect(worst).toBeLessThan(0.01);
  });

  it('la tinta es memoria: sin partículas que pasen, cada píxel conserva e^(−dt/estela) por paso', () => {
    for (const trail of [1, 8]) {
      const m = create({ seed: 'memoria', params: params('filamentos', { trail }), res: 48 });
      m.step(120);
      const I0 = (m.snapshot().arrays.ink as Float32Array).slice();
      const k = 15;
      m.step(k);
      const I1 = m.snapshot().arrays.ink as Float32Array;
      const keep = Math.exp(-(k * DT) / trail);
      let untouched = 0, below = 0, lit = 0;
      for (let i = 0; i < I0.length; i++) {
        if (I0[i] < 1e-6) continue;
        lit++;
        // ink is only ever added on top of what fades: never less than the faded value
        if (I1[i] < I0[i] * keep * (1 - 1e-4) - 1e-9) below++;
        if (Math.abs(I1[i] - I0[i] * keep) <= 1e-5 * I0[i] + 1e-9) untouched++;
      }
      expect(below, `estela ${trail}`).toBe(0);
      // most of the canvas saw no particle in these steps: there the ink faded exactly by the trail's constant
      expect(untouched / lit, `estela ${trail}`).toBeGreaterThan(0.5);
    }
  });

  it('una estela larga guarda trazos más largos que una corta (más píxeles con tinta)', () => {
    const litOf = (trail: number) => {
      const m = create({ seed: 'largo', params: params('filamentos', { trail }), res: 48 });
      m.step(400);
      const I = m.snapshot().arrays.ink as Float32Array;
      let mx = 0;
      for (const v of I) mx = Math.max(mx, v);
      let n = 0;
      for (const v of I) if (v > mx * 0.02) n++;
      return n / I.length;
    };
    expect(litOf(12)).toBeGreaterThan(1.8 * litOf(0.6));
  });

  it('el campo cambia con el tiempo (salvo con «Cambio» a cero) y se repite sin costura en el dominio', () => {
    const f = flowField('campo');
    const base = { cells: 3, tangle: 1, detail: 0.5, evolve: 0.4, wind: 0 };
    let moved = 0, still = 0, seam = 0;
    for (let y = -0.45; y < 0.5; y += 0.1) for (let x = -0.95; x < 1; x += 0.1) {
      moved += Math.abs(f.angle(x, y, 3, base) - f.angle(x, y, 13, base));
      still += Math.abs(f.angle(x, y, 3, { ...base, evolve: 0 }) - f.angle(x, y, 13, { ...base, evolve: 0 }));
      seam = Math.max(seam, Math.abs(f.angle(x, y, 5, base) - f.angle(x + 2, y, 5, base)), Math.abs(f.angle(x, y, 5, base) - f.angle(x, y + 1, 5, base)));
    }
    expect(moved).toBeGreaterThan(20);
    expect(still).toBeLessThan(1e-9);
    expect(seam).toBeLessThan(1e-9);
  });

  it('«Enredo denso» gira en todas las direcciones; «Viento suave» corre casi paralelo', () => {
    // circular spread of the field's direction over the canvas: 0 parallel, 1 every direction
    const spread = (id: string) => {
      const p = params(id), f = flowField('dir');
      const fp = { cells: p.cells as number, tangle: p.tangle as number, detail: p.detail as number, evolve: p.evolve as number, wind: p.wind as number };
      let c = 0, s = 0, n = 0;
      for (let y = -0.48; y < 0.5; y += 0.04) for (let x = -0.98; x < 1; x += 0.04) { const a = f.angle(x, y, 7, fp); c += Math.cos(a); s += Math.sin(a); n++; }
      return 1 - Math.hypot(c, s) / n;
    };
    expect(spread('enredo')).toBeGreaterThan(0.6);
    expect(spread('viento')).toBeLessThan(0.15);
  });
});
