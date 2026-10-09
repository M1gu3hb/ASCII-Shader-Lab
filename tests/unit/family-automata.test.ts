import { describe, expect, it } from 'vitest';
import { create, parseRule } from '../../src/families/sims/automata';
import { META } from '../../src/families/meta/automata';
import { defaultParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

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
});
