import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/dla';
import { META } from '../../src/families/meta/dla';
import { defaultParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Diffusion-limited aggregation: one connected aggregate that only grows, sticks by probability and stops. */

const params = (p: Params = {}): Params => ({ ...defaultParams(META), ...p });
const ageOf = (m: ReturnType<typeof create>) => m.snapshot().arrays.age as Int32Array;

/** Cells of the aggregate reachable from the first seed cell through 8-neighbours. */
function reach(age: Int32Array, w: number, h: number) {
  const start = age.indexOf(1), seen = new Uint8Array(age.length), q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop()!, x = i % w, y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[j] || !age[j]) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return seen.reduce((s, v) => s + v, 0);
}

describe('agregación limitada por difusión', () => {
  it('un solo agregado conexo que sólo crece: lo pegado no se mueve', () => {
    const m = create({ seed: 'conexo', res: 64, params: params() });
    let prev = ageOf(m).slice();
    for (let k = 0; k < 8; k++) {
      m.step(60);
      const age = ageOf(m);
      for (let i = 0; i < age.length; i++) if (prev[i]) expect(age[i]).toBe(prev[i]);
      const n = age.reduce((s, v) => s + (v ? 1 : 0), 0);
      expect(n).toBeGreaterThanOrEqual(prev.reduce((s, v) => s + (v ? 1 : 0), 0));
      expect(reach(age, m.w, m.h)).toBe(n);
      prev = age.slice();
    }
    expect(Math.max(...prev)).toBeGreaterThan(200);
  });

  it('cada partícula llega junto a otra ya pegada (orden de llegada)', () => {
    const m = create({ seed: 'orden', res: 64, params: params({ seed: 'suelo' }) });
    m.step(300);
    const age = ageOf(m), w = m.w, h = m.h, seedCells = w;
    for (let i = 0; i < age.length; i++) {
      if (age[i] <= seedCells) continue;
      const x = i % w, y = (i - x) / w;
      let older = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h && age[ny * w + nx] && age[ny * w + nx] < age[i]) older = true;
      }
      expect(older).toBe(true);
    }
  });

  it('poca adherencia da ramas más compactas que mucha (mismo número de partículas)', () => {
    const gyration = (stick: number) => {
      const m = create({ seed: 'compacto', res: 96, params: params({ stick, bias: 0 }) });
      let age = ageOf(m);
      while (Math.max(...age) < 600) { m.step(20); age = ageOf(m); }
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < age.length; i++) if (age[i] && age[i] <= 600) { sx += i % m.w; sy += Math.floor(i / m.w); n++; }
      sx /= n; sy /= n;
      let r2 = 0;
      for (let i = 0; i < age.length; i++) if (age[i] && age[i] <= 600) r2 += (i % m.w - sx) ** 2 + (Math.floor(i / m.w) - sy) ** 2;
      return Math.sqrt(r2 / n);
    };
    expect(gyration(0.05)).toBeLessThan(gyration(1) * 0.85);
  });

  it('se detiene al llegar al borde y entonces queda quieta; el pincel añade agregado', () => {
    const m = create({ seed: 'borde', res: 48, params: params({ walkers: 400 }) });
    m.step(3000);
    const a = ageOf(m).slice();
    const n = a.reduce((s, v) => s + (v ? 1 : 0), 0);
    expect(n).toBeLessThanOrEqual(Math.floor(a.length * 0.35));
    m.step(200);
    expect(ageOf(m)).toEqual(a);
    m.stroke!({ brush: 'semilla', x0: 0.5, y0: 0.3, x1: 0.6, y1: 0.3, r: 0.03, strength: 1 });
    expect(ageOf(m).reduce((s, v) => s + (v ? 1 : 0), 0)).toBeGreaterThan(n);
  });
});

// (runs of several simulated minutes: generous time when the whole suite shares the machine)
describe('agregación con renovación (presets continuos)', { timeout: 60_000 }, () => {
  const preset = (id: string) => params(META.presets.find(p => p.id === id)!.params);
  const raster = (m: ReturnType<typeof create>) => { const o = new Uint8Array(m.w * m.h); m.render(o, 0); return o; };
  const mad = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
  const lit = (a: Uint8Array) => a.reduce((s, v) => s + (v > 24 ? 1 : 0), 0) / a.length;

  for (const id of ['escarcha', 'arrecife', 'corona_viva']) {
    it(`${id}: sigue cambiando y no se vacía ni se llena (resolución mínima)`, () => {
      const m = create({ seed: 'continuo', res: 48, params: preset(id) });
      m.step(90 + 30 * 25);
      for (let k = 0; k < 4; k++) {
        const a = raster(m);
        m.step(30 * 8);
        const b = raster(m);
        expect(mad(a, b), `${id} ventana ${k}`).toBeGreaterThan(0.5);
        expect(lit(b)).toBeGreaterThan(0.02);
        expect(lit(b)).toBeLessThan(0.97);
      }
    });
  }

  it('el estado de la renovación se guarda y se restaura exacto', () => {
    for (const id of ['escarcha', 'arrecife', 'corona_viva']) {
      const p = preset(id), a = create({ seed: 'guardar', res: 48, params: p });
      a.step(90 + 30 * 20);
      const snap = a.snapshot();
      a.step(97);
      const b = create({ seed: 'guardar', res: 48, params: p });
      b.restore(snap);
      b.step(97);
      expect(mad(raster(a), raster(b)), id).toBe(0);
    }
  });

  it('escarcha: los cristales se funden y nacen otros; la cobertura queda acotada', () => {
    const m = create({ seed: 'relevo', res: 48, params: preset('escarcha') });
    m.step(90 + 30 * 30);
    const cells = (age: Int32Array) => new Set(Array.from(age).map((v, i) => (v ? i : -1)).filter(i => i >= 0));
    const first = cells(ageOf(m));
    m.step(30 * 60);
    const later = cells(ageOf(m));
    let kept = 0;
    for (const i of first) if (later.has(i)) kept++;
    // most of what stood a minute ago is gone, and something else stands
    expect(kept / first.size).toBeLessThan(0.5);
    expect(later.size).toBeGreaterThan(0);
    expect(later.size / (m.w * m.h)).toBeLessThan(0.35);
  });

  it('arrecife: el campo avanza con el frente (la línea de partida sale por abajo)', () => {
    const m = create({ seed: 'avance', res: 48, params: preset('arrecife') });
    expect(ageOf(m).slice((m.h - 1) * m.w).every(v => v > 0)).toBe(true);
    m.step(90 + 30 * 90);
    const s = m.snapshot(), age = s.arrays.age as Int32Array;
    // the seed row (the first w arrivals) has left the lattice, and the front keeps clear of the top
    expect(Array.from(age).some(v => v > 0 && v <= m.w)).toBe(false);
    expect(s.scalars.front).toBeGreaterThan(4);
  });
});

/* PR #10 close-out: a construction grows in about the same time at every size (version 2) */
describe('dla v2: la construcción crece igual de deprisa a 64 y a 160 filas', () => {
  const ink = (m: { w: number; h: number; render(o: Uint8Array, t: number): void }) => {
    const o = new Uint8Array(m.w * m.h); m.render(o, 0);
    let k = 0; for (const v of o) if (v > 24) k++;
    return k / o.length;
  };
  const grown = (preset: string, res: number, v: number, seconds: number) => {
    const p = { ...defaultParams(META), ...META.presets.find(x => x.id === preset)!.params };
    const m = create({ seed: `crece-${preset}`, params: p, res, v });
    m.step(90 + seconds * 30);
    return ink(m);
  };
  it('a los 30 s, a 160 filas la versión 2 llega casi a lo que llega a 64 (la 1 se quedaba en una fracción)', { timeout: 60_000 }, () => {
    for (const preset of ['cristal', 'raices', 'corona']) {
      const at64 = grown(preset, 64, 2, 30), v2 = grown(preset, 160, 2, 30), v1 = grown(preset, 160, 1, 30);
      expect(v2, preset).toBeGreaterThan(0.6 * at64);
      expect(v1, preset).toBeLessThan(0.4 * at64);
    }
  });
  it('a 64 filas las dos versiones dibujan lo mismo', () => {
    const p = { ...defaultParams(META), ...META.presets.find(x => x.id === 'colonias')!.params };
    const a = create({ seed: 'igual', params: p, res: 64, v: 1 }), b = create({ seed: 'igual', params: p, res: 64, v: 2 });
    a.step(300); b.step(300);
    const ra = new Uint8Array(a.w * a.h), rb = new Uint8Array(b.w * b.h);
    a.render(ra, 0); b.render(rb, 0);
    expect(rb).toEqual(ra);
  });
  it('sigue siendo una construcción que termina y se queda (no se falsea el avance)', { timeout: 60_000 }, () => {
    const p = { ...defaultParams(META), ...META.presets.find(x => x.id === 'cristal')!.params };
    const m = create({ seed: 'termina', params: p, res: 160, v: 2 });
    m.step(90 + 120 * 30);
    const a = new Uint8Array(m.w * m.h), b = new Uint8Array(m.w * m.h);
    m.render(a, 0); m.step(60); m.render(b, 0);
    expect(b).toEqual(a);
    // and what it built is a cluster (an aggregate under the 35 % cap), not a filled field
    const k = ink(m);
    expect(k).toBeGreaterThan(0.2);
    expect(k).toBeLessThan(0.6);
  });
});
