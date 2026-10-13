import { describe, expect, it } from 'vitest';
import { create, parseRule } from '../../src/families/sims/automata';
import { META } from '../../src/families/meta/automata';
import { defaultParams, timeContract } from '../../src/families/params';
import type { FieldModel, Params } from '../../src/families/types';

/** Life-like and Generations automata: the notation and the rules themselves. */

const digits = (b: boolean[]) => b.map((v, i) => (v ? i : '')).join('');

/** A model on an empty field with the given live cells; one generation per step. */
function field(cells: Array<[number, number]>, p: Params = {}) {
  const m = create({ seed: 's', params: { ...defaultParams(META), density: 0.02, speed: 30, ...p }, res: 16 });
  const st = m.snapshot();
  const S = new Uint8Array(m.w * m.h), age = new Uint8Array(m.w * m.h).fill(255);
  for (const [x, y] of cells) { S[y * m.w + x] = 1; age[y * m.w + x] = 0; }
  m.restore({ ...st, arrays: { S, age } });
  const live = () => {
    const a = m.snapshot().arrays.S as Uint8Array, out: string[] = [];
    for (let i = 0; i < a.length; i++) if (a[i] === 1) out.push(`${i % m.w},${Math.floor(i / m.w)}`);
    return out.sort();
  };
  return { m, live, state: () => m.snapshot().arrays.S as Uint8Array };
}

describe('autómatas celulares', () => {
  it('lee la notación B/S, Generations y la antigua S/B', () => {
    const c = parseRule('B3/S23')!;
    expect([digits(c.birth), digits(c.survive), c.states]).toEqual(['3', '23', 2]);
    const bb = parseRule('B2/S/3')!;
    expect([digits(bb.birth), digits(bb.survive), bb.states]).toEqual(['2', '', 3]);
    const sw = parseRule('b2s345/4')!;
    expect([digits(sw.birth), digits(sw.survive), sw.states]).toEqual(['2', '345', 4]);
    const old = parseRule('23/36')!;
    expect([digits(old.birth), digits(old.survive), old.states]).toEqual(['36', '23', 2]);
    expect(parseRule('B3/S23/C99')!.states).toBe(16);
    expect(parseRule('hola')).toBeNull();
    expect(parseRule('')).toBeNull();
  });

  it('Vida: el parpadeador oscila con periodo 2', () => {
    const { m, live } = field([[7, 8], [8, 8], [9, 8]]);
    const a = live();
    m.step(1);
    expect(live()).toEqual(['8,7', '8,8', '8,9']);
    m.step(1);
    expect(live()).toEqual(a);
  });

  it('Vida: el planeador avanza una celda en diagonal cada 4 generaciones (también por el borde del toro)', () => {
    const g: Array<[number, number]> = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
    const { m, live } = field(g);
    m.step(4);
    expect(live()).toEqual(g.map(([x, y]) => `${x + 1},${y + 1}`).sort());
    // 32 columns and 16 rows: after 16 × 4 generations it has crossed the bottom edge back to its row
    m.step(60);
    expect(live()).toEqual(g.map(([x, y]) => `${x + 16},${y}`).sort());
  });

  it('Cerebro de Brian: una celda viva pasa a «muriendo» y después a muerta', () => {
    const { m, state } = field([[5, 5], [10, 10], [11, 10]], { rule: 'cerebro' });
    const i = 5 * m.w + 5;
    expect(state()[i]).toBe(1);
    m.step(1);
    expect(state()[i]).toBe(2);
    m.step(1);
    expect(state()[i]).toBe(0);
  });

  it('bordes cerrados: el planeador se detiene contra el borde en vez de cruzarlo', () => {
    const g: Array<[number, number]> = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
    const { m, live } = field(g, { edges: 'cerrado' });
    m.step(80);
    expect(live().some(c => c === '0,0' || c === '1,1')).toBe(false);
  });

  it('renovación: la lluvia y la banda siguen cambiando un campo que sin ellas se queda quieto', () => {
    const maze = { ...defaultParams(META), rule: 'laberinto', density: 0.4, seedShape: 'aleatoria', edges: 'toro', speed: 30, trail: 'ninguna' };
    const S = (m: FieldModel) => m.snapshot().arrays.S as Uint8Array;
    const changed = (a: Uint8Array, b: Uint8Array) => { let k = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) k++; return k / a.length; };
    for (const renew of ['ninguna', 'lluvia', 'banda']) {
      const m = create({ seed: 'r', params: { ...maze, renew }, res: 32 });
      m.step(600);
      const a = S(m).slice();
      m.step(300);
      const d = changed(a, S(m));
      if (renew === 'ninguna') expect(d, renew).toBe(0);
      else expect(d, renew).toBeGreaterThan(0.01);
    }
  });

  it('guardar y restaurar con renovación continúa exactamente igual', () => {
    for (const renew of ['lluvia', 'banda']) {
      const p = { ...defaultParams(META), renew, renewRate: 1, speed: 30 };
      const a = create({ seed: 'g', params: p, res: 32 });
      a.step(457);
      const snap = a.snapshot();
      a.step(311);
      const b = create({ seed: 'g', params: p, res: 32 });
      b.restore(snap);
      b.step(311);
      expect(b.snapshot().arrays.S, renew).toEqual(a.snapshot().arrays.S);
    }
  });

  it('el contrato temporal: sin renovación es una construcción; los fondos son continuos', () => {
    expect(timeContract(META, defaultParams(META))).toBe('construccion');
    for (const pr of META.presets) {
      const c = timeContract(META, { ...defaultParams(META), ...pr.params });
      if (pr.uses?.some(u => u.startsWith('fondos/'))) expect(c, pr.id).toBe('continuo');
    }
  });

  // every continuous preset, at the smallest field: past its first minute it is neither empty nor full and keeps changing
  for (const pr of META.presets) {
    const p = { ...defaultParams(META), ...pr.params };
    if (timeContract(META, p) !== 'continuo') continue;
    it(`«${pr.name}» sigue cambiando y no se apaga`, () => {
      const m = create({ seed: 'c', params: p, res: META.budget.res![0] });
      m.step(META.budget.warmup! + 60 * META.budget.rate!);
      const a = new Uint8Array(m.w * m.h), b = new Uint8Array(m.w * m.h);
      m.render(a, 0);
      m.step(2 * META.budget.rate!);
      m.render(b, 0);
      let lit = 0, d = 0;
      for (let i = 0; i < b.length; i++) { if (b[i] > 24) lit++; d += Math.abs(a[i] - b[i]); }
      expect(lit / b.length).toBeGreaterThan(0.02);
      expect(lit / b.length).toBeLessThan(0.97);
      expect(d / b.length).toBeGreaterThan(0.5);
    });
  }
});

/* ------------------------------------------------------------------ */
/* PR #10 close-out: «Continentes» no longer hangs on the seed          */
/* ------------------------------------------------------------------ */

describe('autómatas: Continentes con el «Mapa de continentes»', () => {
  const preset = () => ({ ...defaultParams(META), ...META.presets.find(p => p.id === 'diaynoche')!.params });
  const cells = (m: FieldModel) => m.snapshot().arrays.S as Uint8Array;
  const land = (S: Uint8Array) => { let k = 0; for (const s of S) if (s === 1) k++; return k / S.length; };

  it('el mapa es su propio negativo al otro lado del toro, y Día y noche lo conserva generación tras generación', () => {
    for (const res of [32, 33, 64]) {
      const m = create({ seed: `mapa-${res}`, params: preset(), res });
      const h = m.h, w = m.w, dy = h % 2 ? 0 : h / 2;
      for (let gen = 0; gen < 4; gen++) {
        const S = cells(m);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          expect(S[y * w + x] + S[((y + dy) % h) * w + ((x + h) % w)], `${res} filas, ${x},${y}`).toBe(1);
        }
        m.step(3 * 30);
      }
    }
  });

  // (twelve runs of a minute each: generous time when the suite shares the machine)
  it('con cualquier semilla y número de filas la tierra es la mitad: ni se apaga ni lo llena todo (antes, sí)', { timeout: 60_000 }, () => {
    for (const res of [32, 64, 128]) for (const seed of ['a', 'b', 'automata-diaynoche']) {
      const m = create({ seed, params: preset(), res });
      m.step(90 + 60 * 30);
      expect(land(cells(m)), `${seed} a ${res} filas`).toBe(0.5);
    }
    // the earlier seeding: at 32 rows one side takes the whole field
    const old = create({ seed: 'automata-diaynoche', params: { ...preset(), seedShape: 'aleatoria' }, res: 32 });
    old.step(90 + 60 * 30);
    expect(Math.abs(land(cells(old)) - 0.5)).toBeGreaterThan(0.4);
  });

  it('sigue siendo una construcción: se va quedando quieta, sin vaciarse', { timeout: 60_000 }, () => {
    expect(timeContract(META, preset())).toBe('construccion');
    const m = create({ seed: 'quieta', params: preset(), res: 64 });
    const r = (mm: FieldModel) => { const o = new Uint8Array(mm.w * mm.h); mm.render(o, 0); return o; };
    m.step(90 + 5 * 30); const a0 = r(m); m.step(15); const a1 = r(m);
    m.step(600 * 30); const b0 = r(m); m.step(15); const b1 = r(m);
    const mad = (x: Uint8Array, y: Uint8Array) => { let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]); return s / x.length; };
    expect(mad(b0, b1)).toBeLessThan(mad(a0, a1));
  });
});
