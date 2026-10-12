import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/tela';
import { META } from '../../src/families/meta/tela';
import { defaultParams, figureOf, timeContract } from '../../src/families/params';
import type { FieldModel, Params } from '../../src/families/types';

/** Cloth (XPBD): anchors hold, and the constraints are met better with more substeps or less compliance. */

// the low mesh: 24 × 16 particles over 1.6 × 1.0
const NX = 24, NY = 16, DX = 1.6 / (NX - 1), DY = 1.0 / (NY - 1);
const run = (over: Params, steps: number) => {
  const m = create({ seed: 'tela', params: { ...defaultParams(META), mesh: 'baja', anchors: 'borde', wind: 0, ...over }, res: 48 });
  m.step(steps);
  return m.snapshot().arrays.x as Float32Array;
};
/** Mean relative violation of the structural constraints (|d − L| / L). */
const stretch = (x: Float32Array) => {
  let s = 0, c = 0;
  const d = (a: number, b: number) => Math.hypot(x[a * 3] - x[b * 3], x[a * 3 + 1] - x[b * 3 + 1], x[a * 3 + 2] - x[b * 3 + 2]);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i;
    if (i + 1 < NX) { s += Math.abs(d(k, k + 1) - DX) / DX; c++; }
    if (j + 1 < NY) { s += Math.abs(d(k, k + NX) - DY) / DY; c++; }
  }
  return s / c;
};

describe('telas (XPBD)', () => {
  it('los puntos anclados no se mueven, aunque sople el viento', () => {
    const x0 = run({ wind: 0 }, 0), x = run({ wind: 1.5, gravity: 1.5 }, 200);
    for (let i = 0; i < NX; i++) for (let c = 0; c < 3; c++) expect(x[i * 3 + c]).toBe(x0[i * 3 + c]);
    // and the rest of the cloth did move
    expect(Math.abs(x[(NY - 1) * NX * 3 + 2] - x0[(NY - 1) * NX * 3 + 2])).toBeGreaterThan(0.01);
  });

  it('más subpasos cumplen mejor las restricciones', () => {
    const few = stretch(run({ substeps: 2, stiff: 1 }, 90)), many = stretch(run({ substeps: 20, stiff: 1 }, 90));
    expect(many).toBeLessThan(few * 0.5);
  });

  it('menos flexibilidad (más rigidez) estira menos la tela', () => {
    const soft = stretch(run({ stiff: 0.1 }, 90)), stiff = stretch(run({ stiff: 0.9 }, 90));
    expect(stiff).toBeLessThan(soft * 0.3);
  });

  it('«Empujar» mueve la tela bajo el dedo, de forma determinista', () => {
    const make = () => create({ seed: 'tela', params: { ...defaultParams(META), mesh: 'baja', anchors: 'borde', wind: 0 }, res: 48 });
    const a = make(), b = make(), c = make();
    for (const m of [a, b, c]) m.step(30);
    for (const m of [a, b]) { m.stroke!({ brush: 'empujar', x0: 0, y0: 0, x1: 0, y1: 0, r: 0.2, strength: 1 }); m.step(10); }
    c.step(10);
    const xa = a.snapshot().arrays.x as Float32Array, xb = b.snapshot().arrays.x as Float32Array, xc = c.snapshot().arrays.x as Float32Array;
    expect(xa).toEqual(xb);
    let moved = 0;
    for (let i = 0; i < xa.length; i++) moved = Math.max(moved, Math.abs(xa[i] - xc[i]));
    expect(moved).toBeGreaterThan(0.01);
  });

  it('sin anclajes cae y se queda sobre el suelo', () => {
    const x = run({ anchors: 'ninguno', sphere: 'ninguna' }, 150);
    let minY = Infinity, maxY = -Infinity;
    for (let k = 0; k < NX * NY; k++) { minY = Math.min(minY, x[k * 3 + 1]); maxY = Math.max(maxY, x[k * 3 + 1]); }
    expect(minY).toBeGreaterThanOrEqual(-0.62 - 1e-6);
    expect(maxY).toBeLessThan(-0.5);
  });
});

describe('telas: ángulo de vista', () => {
  it('«Ángulo de vista» gira el punto de vista sin tocar la tela', () => {
    const make = (angle: number) => create({ seed: 'angulo', params: { ...defaultParams(META), anchors: 'mastil', mesh: 'baja', turn: 0, angle }, res: 48 });
    const a = make(0), b = make(40);
    a.step(60); b.step(60);
    expect(b.snapshot().arrays.x).toEqual(a.snapshot().arrays.x);
    const ra = new Uint8Array(a.w * a.h), rb = new Uint8Array(b.w * b.h);
    a.render(ra, 0); b.render(rb, 0);
    let s = 0;
    for (let i = 0; i < ra.length; i++) s += Math.abs(ra[i] - rb[i]);
    expect(s / ra.length).toBeGreaterThan(2);
  });
});

describe('telas: presets continuos', { timeout: 60_000 }, () => {
  const rate = META.budget.rate!, warm = META.budget.warmup!;
  const ras = (m: FieldModel, t: number) => { const o = new Uint8Array(m.w * m.h); m.render(o, t); return o; };
  const mad = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
  const lit = (a: Uint8Array) => { let n = 0; for (const v of a) if (v > 24) n++; return n / a.length; };
  for (const pr of META.presets) {
    const p = { ...defaultParams(META), ...pr.params };
    if (timeContract(META, p) !== 'continuo') continue;
    it(`«${pr.name}» sigue cambiando y no se vacía ni se llena (resolución mínima)`, () => {
      const m = create({ seed: 'continuo', params: p, res: META.budget.res![0] });
      m.step(warm + 8 * rate);
      // the state, with the camera held: the same t for both renders
      const a = ras(m, 8);
      m.step(rate);
      const b = ras(m, 8);
      expect(mad(a, b), pr.id).toBeGreaterThan(0.5);
      for (const r of [a, b]) { expect(lit(r), pr.id).toBeGreaterThan(0.02); expect(lit(r), pr.id).toBeLessThan(0.97); }
    });
  }
});

/* ------------------------------------------------------------------ */
/* PR #10 close-out, I-04: the kinetic grid (drumhead pinned all round) */
/* ------------------------------------------------------------------ */

describe('telas: malla cinética (I-04)', () => {
  const preset = () => ({ ...defaultParams(META), ...META.presets.find(p => p.id === 'malla_cinetica')!.params });
  // «Todo el borde», low mesh: 33 × 17 particles over 2 × 1
  const GX = 33, GY = 17;
  const border = (i: number, j: number) => i === 0 || j === 0 || i === GX - 1 || j === GY - 1;
  const make = (over: Params = {}, seed = 'malla') => create({ seed, params: { ...preset(), ...over }, res: 48 });

  it('anclada por todo el borde, sin gravedad: sin golpes se queda quieta en su rejilla (y es una construcción)', () => {
    const m = make({ kick: 0 });
    const x0 = (m.snapshot().arrays.x as Float32Array).slice();
    m.step(150);
    const x = m.snapshot().arrays.x as Float32Array;
    let moved = 0;
    for (let k = 0; k < GX * GY; k++) for (let c = 0; c < 2; c++) moved = Math.max(moved, Math.abs(x[k * 3 + c] - x0[k * 3 + c]));
    expect(moved).toBeLessThan(0.002);
    expect(timeContract(META, { ...preset(), kick: 0 })).toBe('construccion');
    expect(timeContract(META, preset())).toBe('continuo');
  });

  it('los golpes llegan cada «Un golpe cada» segundos desde bordes que elige la semilla, y el borde no se mueve', () => {
    const m = make();
    const x0 = (m.snapshot().arrays.x as Float32Array).slice();
    const every = Math.round(Number(preset().every) * 30);
    const sides = new Set<string>();
    let prev = x0.slice();
    for (let hit = 0; hit < 10; hit++) {
      // one hit per period: just after it, the nodes that moved most this step lie near one border
      m.step(hit === 0 ? 13 : every);
      const x = m.snapshot().arrays.x as Float32Array;
      let best = -1, bi = 0, bj = 0;
      for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
        const k = j * GX + i, d = Math.hypot(x[k * 3] - prev[k * 3], x[k * 3 + 1] - prev[k * 3 + 1], x[k * 3 + 2] - prev[k * 3 + 2]);
        if (border(i, j)) { expect(x[k * 3]).toBe(x0[k * 3]); expect(x[k * 3 + 1]).toBe(x0[k * 3 + 1]); continue; }
        if (d > best) { best = d; bi = i; bj = j; }
      }
      const near = Math.min(bi, GX - 1 - bi, bj * 2, (GY - 1 - bj) * 2);
      expect(near, `golpe ${hit}`).toBeLessThanOrEqual(5);
      sides.add(bi <= 5 ? 'izquierda' : bi >= GX - 6 ? 'derecha' : bj <= 3 ? 'arriba' : 'abajo');
      prev = x.slice();
    }
    // from more than one border, at random
    expect(sides.size).toBeGreaterThan(1);
  });

  it('la onda cruza la malla: tras el golpe, el estiramiento llega lejos del borde y luego se amortigua', () => {
    const m = make();
    const strainFar = () => {
      const x = m.snapshot().arrays.x as Float32Array, sx = 2 / (GX - 1);
      let e = 0;
      // the middle third of the grid
      for (let j = 6; j < 11; j++) for (let i = 11; i < 22; i++) {
        const k = j * GX + i;
        e = Math.max(e, Math.abs(Math.hypot(x[(k + 1) * 3] - x[k * 3], x[(k + 1) * 3 + 1] - x[k * 3 + 1], x[(k + 1) * 3 + 2] - x[k * 3 + 2]) / sx - 1));
      }
      return e;
    };
    m.step(12); const before = strainFar();
    let peak = 0;
    for (let s = 0; s < 30; s++) { m.step(1); peak = Math.max(peak, strainFar()); }
    m.step(25); const after = strainFar();
    expect(peak).toBeGreaterThan(10 * before + 0.01);
    expect(after).toBeLessThan(peak);
  });

  it('vista «Tensión»: la tinta de cada muelle sigue su estiramiento', () => {
    const m = make();
    m.step(11);
    const r = new Uint8Array(m.w * m.h);
    m.render(r, 0);
    const calm = Math.max(...r);
    m.step(4);
    m.render(r, 0);
    // at rest every spring has the same faint ink; a hit lights the stretched ones
    expect(calm).toBeLessThan(140);
    expect(Math.max(...r)).toBeGreaterThan(200);
    // another view of the same run draws something else
    const s = make({ view: 'malla' }); s.step(15);
    const r2 = new Uint8Array(s.w * s.h); s.render(r2, 0);
    let d = 0; for (let i = 0; i < r.length; i++) d += Math.abs(r[i] - r2[i]);
    expect(d / r.length).toBeGreaterThan(5);
  });

  it('determinista desde la semilla y restaurable a mitad de camino (con su corriente de golpes)', () => {
    const a = make(), b = make();
    a.step(70); b.step(70);
    expect(a.snapshot().arrays.x).toEqual(b.snapshot().arrays.x);
    const snap = a.snapshot();
    a.step(80);
    const c = make();
    c.restore(snap);
    c.step(80);
    expect(c.snapshot().arrays.x).toEqual(a.snapshot().arrays.x);
    // another seed: other borders
    const o = make({}, 'otra'); o.step(150);
    expect(o.snapshot().arrays.x).not.toEqual(a.snapshot().arrays.x);
  });

  it('llena el lienzo (no es una figura en el centro), a diferencia de las telas', () => {
    expect(figureOf(META, preset())).toBe(false);
    for (const p of META.presets.filter(x => x.id !== 'malla_cinetica')) expect(figureOf(META, { ...defaultParams(META), ...p.params }), p.id).toBe(true);
  });
});
