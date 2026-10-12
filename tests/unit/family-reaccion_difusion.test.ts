import { describe, expect, it } from 'vitest';
import { RD_ROWS, create } from '../../src/families/sims/reaccion';
import { META } from '../../src/families/meta/reaccion_difusion';
import { defaultParams, timeContract } from '../../src/families/params';
import type { FieldModel, Params } from '../../src/families/types';

/** Gray–Scott reaction–diffusion: the fixed grid of version 2, the living maps and their continuity. */

const base = (p: Params = {}) => ({ ...defaultParams(META), ...p });
const preset = (id: string) => base(META.presets.find(p => p.id === id)!.params);
const raster = (m: FieldModel) => { const o = new Uint8Array(m.w * m.h); m.render(o, 0); return o; };
const mad = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const lit = (a: Uint8Array) => { let k = 0; for (const v of a) if (v > 24) k++; return k / a.length; };
const B = (m: FieldModel) => m.snapshot().arrays.B as Float32Array;

describe('reacción–difusión', () => {
  it('versión 2: la misma química con cualquier número de filas (A-05); la versión 1 sigue con su rejilla', () => {
    const p = preset('mitosis');
    const a = create({ seed: 's', params: p, res: 64 }), b = create({ seed: 's', params: p, res: 256 }), c = create({ seed: 's', params: p, res: RD_ROWS });
    for (const m of [a, b, c]) m.step(300);
    expect(B(a)).toEqual(B(c));
    expect(B(b)).toEqual(B(c));
    expect([a.w, a.h, b.w, b.h]).toEqual([128, 64, 512, 256]);
    // the raster is the same picture at another size: sampled back at the grid's cells, it matches
    const rc = raster(c), rb = raster(b);
    let d = 0;
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
      const X = Math.floor(((x + 0.5) * b.w) / c.w), Y = Math.floor(((y + 0.5) * b.h) / c.h);
      d += Math.abs(rc[y * c.w + x] - rb[Y * b.w + X]);
    }
    expect(d / rc.length).toBeLessThan(12);
    // version 1: the grid is the raster
    const v1 = create({ seed: 's', params: p, res: 64, v: 1 });
    expect(B(v1).length).toBe(128 * 64);
  });

  it('a las filas por defecto, la versión 2 sin mapa dibuja lo mismo que la versión 1', () => {
    const p = preset('coral');
    const a = create({ seed: 's', params: p, res: RD_ROWS, v: 1 }), b = create({ seed: 's', params: p, res: RD_ROWS });
    a.step(400); b.step(400);
    expect(mad(raster(a), raster(b))).toBe(0);
  });

  it('el contrato temporal: uniforme es una construcción, un mapa vivo es continuo', () => {
    expect(timeContract(META, preset('coral'))).toBe('construccion');
    expect(timeContract(META, base({ map: 'mareas' }))).toBe('continuo');
    for (const pr of META.presets) {
      const c = timeContract(META, base(pr.params));
      // only continuous presets go to the backgrounds
      if (pr.uses?.some(u => u.startsWith('fondos/'))) expect(c, pr.id).toBe('continuo');
    }
  });

  it('guardar y restaurar a mitad de un mapa y de una herida continúa exactamente igual', () => {
    for (const map of ['mareas', 'heridas', 'franjas', 'isla']) {
      const p = base({ map, amp: 0.8, drift: 3 });
      const a = create({ seed: 'r', params: p, res: 64 });
      a.step(413);
      const snap = a.snapshot();
      a.step(377);
      const b = create({ seed: 'r', params: p, res: 64 });
      b.restore(snap);
      b.step(377);
      expect(B(b), map).toEqual(B(a));
    }
  });

  it('una herida vacía un claro y siembra su centro', () => {
    const m = create({ seed: 'h', params: base({ map: 'heridas', amp: 1, drift: 1 }), res: 64 });
    const st = m.snapshot(), n = (st.arrays.B as Float32Array).length;
    // a field full of B, and the next wound due on the next step
    m.restore({ ...st, scalars: { ...st.scalars, racc: 0.99999 }, arrays: { A: new Float32Array(n).fill(0.5), B: new Float32Array(n).fill(0.3) } });
    m.step(1);
    const b = B(m);
    let empty = 0, seeded = 0;
    for (const v of b) { if (v < 0.05) empty++; if (v > 0.9) seeded++; }
    // a disc of a sixth of the height (± 30 %) is cleared, and a small square in it is seeded
    expect(empty).toBeGreaterThan(250);
    expect(empty).toBeLessThan(1500);
    expect(seeded).toBeGreaterThanOrEqual(16);
  });

  // every continuous preset: past its first quarter minute it is neither empty nor full and it keeps changing
  // (the ten-minute evidence is scripts/families-time.ts; this is the cheap guard)
  for (const pr of META.presets) {
    const p = base(pr.params);
    if (timeContract(META, p) !== 'continuo') continue;
    it(`«${pr.name}» sigue cambiando y no se vacía`, () => {
      const m = create({ seed: 'c', params: p, res: 64 });
      m.step(META.budget.warmup! + 15 * META.budget.rate!);
      const a = raster(m);
      m.step(2 * META.budget.rate!);
      const b = raster(m);
      expect(lit(b)).toBeGreaterThan(0.02);
      expect(lit(b)).toBeLessThan(0.97);
      expect(mad(a, b)).toBeGreaterThan(0.5);
    }, 30_000);
  }
});
