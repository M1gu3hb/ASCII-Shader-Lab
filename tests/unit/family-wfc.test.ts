import { describe, expect, it } from 'vitest';
import { create, tilesetOf } from '../../src/families/sims/wfc';
import { META } from '../../src/families/meta/wfc';
import { defaultParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Wave Function Collapse: finished boards satisfy every adjacency, the frame's sockets and the symmetries. */

const params = (p: Params = {}): Params => ({ ...defaultParams(META), ...p });
const SETS = ['circuitos', 'muros', 'acueducto'];

/** Runs a board to the end (fast pace) and returns its decided tiles (−1: undecided). */
function finish(set: string, seed: string, extra: Record<string, unknown> = {}) {
  const rows = 12, m = create({ seed, res: 48, params: params({ set, rows, pace: 600, hold: 30, ...extra }) });
  let guard = 0;
  while (m.snapshot().scalars.phase === 0 && guard++ < 500) m.step(1);
  const s = m.snapshot(), T = tilesetOf(set).tiles.length, wave = s.arrays.wave as Uint8Array, cnt = s.arrays.cnt as Uint16Array;
  const tiles = Array.from(cnt, (k, c) => (k === 1 ? wave.subarray(c * T, (c + 1) * T).indexOf(1) : -1));
  return { m, s, tiles, GW: 2 * rows, GH: rows };
}

describe('colapso de función de onda (modelo de piezas)', () => {
  it('cada tablero terminado cumple todas las adyacencias, también tras reparar una contradicción', () => {
    const boards: Array<[string, string, string]> = [];
    for (const set of SETS) for (const edges of ['vacios', 'libres']) for (let k = 0; k < 4; k++) boards.push([set, `adyacencia${k}`, edges]);
    // (a seed whose aqueduct runs into a contradiction: a pillar that cannot reach the ground)
    boards.push(['acueducto', 'reparar160', 'vacios']);
    for (const [set, seed, edges] of boards) {
      const { s, tiles, GW, GH } = finish(set, seed, { edges });
      const ts = tilesetOf(set);
      if (seed === 'reparar160') expect(s.scalars.repairs).toBeGreaterThan(0);
      expect(s.scalars.phase, `${set} ${edges}`).toBe(1);
      expect(tiles.every(t => t >= 0)).toBe(true);
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const a = tiles[y * GW + x];
        if (x + 1 < GW) expect(ts.fits(a, tiles[y * GW + x + 1], 1)).toBe(true);
        if (y + 1 < GH) expect(ts.fits(a, tiles[(y + 1) * GW + x], 2)).toBe(true);
      }
    }
  });

  it('con bordes vacíos, cada lado del marco lleva el borde que exige', () => {
    for (const set of SETS) {
      const { tiles, GW, GH } = finish(set, 'marco');
      const ts = tilesetOf(set), S = ts.S;
      const edge = (t: number, d: number) => {
        const b = ts.tiles[t];
        let o = '';
        for (let i = 0; i < S; i++) o += d === 0 ? b[i] : d === 2 ? b[(S - 1) * S + i] : d === 3 ? b[i * S] : b[i * S + S - 1];
        return o;
      };
      for (let x = 0; x < GW; x++) {
        if (ts.border[0] !== null) expect(edge(tiles[x], 0)).toBe(ts.border[0]);
        if (ts.border[2] !== null) expect(edge(tiles[(GH - 1) * GW + x], 2)).toBe(ts.border[2]);
      }
      for (let y = 0; y < GH; y++) {
        if (ts.border[3] !== null) expect(edge(tiles[y * GW], 3)).toBe(ts.border[3]);
        if (ts.border[1] !== null) expect(edge(tiles[y * GW + GW - 1], 1)).toBe(ts.border[1]);
      }
    }
  });

  it('las piezas giradas y reflejadas están todas, sin repetir (el acueducto sólo se refleja)', () => {
    for (const set of SETS) {
      const { tiles, S } = tilesetOf(set);
      const has = new Set(tiles);
      expect(has.size).toBe(tiles.length);
      const rot = (b: string) => { let o = ''; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) o += b[(S - 1 - x) * S + y]; return o; };
      const mir = (b: string) => { let o = ''; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) o += b[y * S + S - 1 - x]; return o; };
      for (const b of tiles) {
        expect(has.has(mir(b))).toBe(true);
        if (set !== 'acueducto') expect(has.has(rot(b))).toBe(true);
      }
      // gravity: some aqueduct tile is not closed under rotation (a pillar stands, it does not lie)
      if (set === 'acueducto') expect(tiles.some(b => !has.has(rot(b)))).toBe(true);
    }
  });

  it('sin fin (avanza, por zonas): las piezas decididas siempre encajan, sigue cambiando y se restaura exacto', () => {
    const raster = (m: ReturnType<typeof create>) => { const o = new Uint8Array(m.w * m.h); m.render(o, 0); return o; };
    const mad = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
    for (const id of ['placa_sin_fin', 'viaducto', 'ciudad_viva']) {
      const pr = META.presets.find(q => q.id === id)!, p = params(pr.params), set = p.set as string, rows = p.rows as number;
      const m = create({ seed: 'sin fin', res: 48, params: p });
      const ts = tilesetOf(set), T = ts.tiles.length, GH = rows, BC = p.flow === 'avanza' ? 2 * rows + 1 : 2 * rows;
      m.step(30);
      for (let k = 0; k < 4; k++) {
        const a = raster(m);
        m.step(30 * 5);
        expect(mad(a, raster(m)), `${id} ventana ${k}`).toBeGreaterThan(0.2);
        expect(m.snapshot().scalars.phase, id).toBe(0);
        // every pair of decided neighbours fits
        const s = m.snapshot(), wave = s.arrays.wave as Uint8Array, cnt = s.arrays.cnt as Uint16Array;
        const tile = (c: number) => (cnt[c] === 1 ? wave.subarray(c * T, (c + 1) * T).indexOf(1) : -1);
        for (let y = 0; y < GH; y++) for (let x = 0; x < BC; x++) {
          const t = tile(y * BC + x);
          if (t < 0) continue;
          const r = x + 1 < BC ? tile(y * BC + x + 1) : -1, d = y + 1 < GH ? tile((y + 1) * BC + x) : -1;
          if (r >= 0) expect(ts.fits(t, r, 1), `${id} (${x}, ${y}) →`).toBe(true);
          if (d >= 0) expect(ts.fits(t, d, 2), `${id} (${x}, ${y}) ↓`).toBe(true);
        }
      }
      const snap = m.snapshot();
      m.step(53);
      const r = create({ seed: 'sin fin', res: 48, params: p });
      r.restore(snap);
      r.step(53);
      expect(mad(raster(m), raster(r)), id).toBe(0);
    }
  });

  it('terminado, espera y se reconstruye con otra variante', () => {
    const m = create({ seed: 'variante', res: 48, params: params({ pace: 600, hold: 1 }) });
    let guard = 0;
    while (m.snapshot().scalars.phase === 0 && guard++ < 500) m.step(1);
    const first = (m.snapshot().arrays.wave as Uint8Array).slice();
    expect(m.snapshot().scalars.board).toBe(0);
    m.step(30);
    expect(m.snapshot().scalars.board).toBe(1);
    guard = 0;
    while (m.snapshot().scalars.phase === 0 && guard++ < 500) m.step(1);
    expect(m.snapshot().arrays.wave).not.toEqual(first);
  });
});
