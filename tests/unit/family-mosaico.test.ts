import { describe, expect, it } from 'vitest';
import { PASS, cov, impl, pass, tileCols } from '../../src/families/analytic/mosaico.cpu';
import { META } from '../../src/families/meta/mosaico';
import { defaultParams, packParams } from '../../src/families/params';
import { setPX } from '../../src/engine/basic/patterns';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Mosaico cinético»: tiles of whole cells, the flip at one-cell resolution, the passes. */

const fr = Math.fround;
// a 1280 × 720 canvas with cells of 10 × 14 px (the default 1.4 aspect): PX is a cell's height
const PX = 14 / 720, CW = 10 / 720;
const cellX = (col: number) => fr(((col + 0.5) * 10 - 640) / 720);
const cellY = (row: number) => fr((360 - (row + 0.5) * 14) / 720);
const k = (p: Params) => packParams(META, { ...defaultParams(META), ...p });

describe('mosaico cinético', () => {
  it('teselas de celdas enteras: un número impar de columnas, casi cuadradas en píxeles', () => {
    for (let n = 2; n <= 6; n++) {
      const m = tileCols(n);
      expect(m % 2).toBe(1);
      expect((m * 10) / (n * 14)).toBeGreaterThan(0.8);
      expect((m * 10) / (n * 14)).toBeLessThan(1.3);
    }
    expect(cov(0, 0.2, 0.24)).toBeCloseTo(1, 9);
    expect(cov(0.4, 0.2, 0.24)).toBeCloseTo(0.1, 9);
    expect(cov(0.8, 0.2, 0.24)).toBe(0);
  });

  it('de canto, la tesela es una sola columna de celdas (su borde) y vuelve a abrirse con la otra cara', () => {
    setPX(PX);
    const n = 3, m = tileCols(n), flip = 0.4, speed = 0.3, spacing = 0.5;
    const kk = k({ size: n, dir: 'derecha', speed, spacing, flip, scatter: 0, glints: 0 });
    const lam = 0.3 + 1.3 * spacing;
    // the tile whose left column is column 64 (x just right of the centre): its centre column is 64 + (m - 1) / 2
    const tw = fr(fr(m * fr(PX)) / 1.4);
    const col0 = 64, row = 20;
    const x0 = cellX(col0 + (m - 1) / 2);
    const idx = Math.floor((x0 + fr(0.001 * fr(fr(PX) / 1.4))) / tw), cx = (idx + 0.5) * tw;
    // the moment its phase is a whole number of passes plus half the flip: edge on
    const t = (lam * (7 + flip / 2) + cx) / speed;
    pass(cx, 0, idx, 0, t, kk);
    expect(PASS.f).toBeCloseTo(0.5, 4);
    const centre = Math.round((cx / CW) + 63.5);
    const v = (c: number) => impl.cpu(cellX(c), cellY(row), t, kk);
    expect(v(centre)).toBeGreaterThan(0.9);
    expect(v(centre - 1)).toBeLessThan(0.2);
    expect(v(centre + 1)).toBeLessThan(0.2);
    expect(v(centre - 2)).toBe(0);
    // a moment later the new face is three columns wide, then the whole tile again
    const later = (s: number) => (lam * (7 + s) + cx) / speed;
    const wide = (tt: number) => [-2, -1, 0, 1, 2].filter(d => impl.cpu(cellX(centre + d), cellY(row), tt, kk) > 0.08).length;
    expect(wide(later(flip * 0.62))).toBeGreaterThanOrEqual(3);
    expect(wide(later(flip * 1.5))).toBe(m);
  });

  it('sin saltos al pasar de una pasada a la siguiente', () => {
    setPX(PX);
    const kk = k({ dir: 'anillos', scatter: 0.5 });
    impl.prep?.(0, kk);
    let worst = 0;
    for (let i = 0; i < 300; i++) {
      const x = cellX(i % 128), y = cellY(Math.floor(i / 128) * 9 + 3), t = 12.3 + i * 0.37;
      worst = Math.max(worst, Math.abs(impl.cpu(x, y, t, kk) - impl.cpu(x, y, t + 1e-3, kk)));
    }
    expect(worst).toBeLessThan(0.08);
  });

  it('cada pasada descubre otra imagen: no vuelve a la misma', () => {
    setPX(PX);
    const kk = k({ dir: 'derecha', speed: 0.3, spacing: 0.5, picture: 1 });
    const lam = 0.3 + 1.3 * 0.5, passT = lam / 0.3;
    const img = (t: number) => { const o: number[] = []; for (let r = 2; r < 50; r += 6) for (let c = 2; c < 126; c += 5) o.push(impl.cpu(cellX(c), cellY(r), t, kk)); return o; };
    const base = img(40);
    for (let j = 1; j <= 6; j++) {
      const other = img(40 + j * passT);
      const d = base.reduce((s, v, i) => s + Math.abs(v - other[i]), 0) / base.length;
      expect(d, `pasada +${j}`).toBeGreaterThan(0.05);
    }
  });
});
