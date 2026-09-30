import { describe, expect, it } from 'vitest';
import {
  CHARSETS, defaultGlyphStyle, flowWords, gridDims, gridFromFine, resolveRamp, type FineSample, type GlyphGrid,
} from '../../src/glyphs';
import { SUB_X, SUB_Y } from '../../src/glyphs/grid';
import type { GlyphStyle } from '../../src/project/types';

type RGBA = [number, number, number, number];

/** A fine sample (SUB_X × SUB_Y per cell) painted by f(x, y) over sample coordinates. */
function fine(cols: number, rows: number, f: (x: number, y: number, w: number, h: number) => RGBA): FineSample {
  const w = cols * SUB_X, h = rows * SUB_Y;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y, w, h), (y * w + x) * 4);
  return { data, w, h };
}
const grey = (v: number): RGBA => [v, v, v, 255];

function run(style: Partial<GlyphStyle>, cols: number, rows: number, f: (x: number, y: number, w: number, h: number) => RGBA): GlyphGrid {
  const s: GlyphStyle = { ...defaultGlyphStyle(), cell: 10, aspect: 2, ...style };
  const d = gridDims(s, { w: cols * s.cell, h: rows * s.cell * s.aspect });
  expect(d.cols).toBe(cols);
  expect(d.rows).toBe(rows);
  return gridFromFine(fine(cols, rows, f), s, d, resolveRamp(s, d.cw, d.ch));
}
const rowText = (g: GlyphGrid, r: number) => g.chars.slice(r * g.cols, (r + 1) * g.cols).join('');

describe('glyph grid', () => {
  it('has the contract dimensions: partial cells round up, arrays sized cols × rows', () => {
    const s = { ...defaultGlyphStyle(), cell: 8, aspect: 1.5 };
    const d = gridDims(s, { w: 1080, h: 1350 });
    expect(d).toMatchObject({ cw: 8, ch: 12, cols: 135, rows: 113 });
    const d2 = gridDims({ cell: 7, aspect: 2 }, { w: 100, h: 50 });
    expect(d2.cols).toBe(Math.ceil(100 / 7));
    expect(d2.rows).toBe(Math.ceil(50 / 14));
    const g = run({}, 12, 5, () => grey(128));
    expect(g.chars).toHaveLength(60);
    expect(g.rgb).toHaveLength(180);
    expect(g.lum).toHaveLength(60);
    expect(g.alpha).toHaveLength(60);
  });

  it('turns a left-to-right gradient into a ramp that only gets fuller', () => {
    const g = run({ charset: 'estandar' }, 40, 3, (x, _y, w) => grey(Math.round((x / (w - 1)) * 255)));
    const ramp = resolveRamp({ ...defaultGlyphStyle(), charset: 'estandar' }, 10, 20).chars;
    for (let r = 0; r < g.rows; r++) {
      let prev = -1;
      for (let c = 0; c < g.cols; c++) {
        const i = r * g.cols + c;
        const k = ramp.indexOf(g.chars[i]);
        expect(k).toBeGreaterThanOrEqual(prev);
        prev = k;
        if (c) expect(g.lum[i]).toBeGreaterThan(g.lum[i - 1]);
      }
    }
    expect(g.chars[0]).toBe(' ');
    expect(g.chars[g.cols - 1]).toBe(ramp[ramp.length - 1]);
  });

  it('averages each cell over its area (a fine checker reads as mid grey, not as black or white)', () => {
    const g = run({}, 6, 2, (x, y) => grey((x + y) % 2 ? 255 : 0));
    for (let i = 0; i < g.lum.length; i++) expect(g.lum[i]).toBeGreaterThan(0.4), expect(g.lum[i]).toBeLessThan(0.6);
  });

  it('invert makes the dark end full and the bright end empty', () => {
    const g = run({ invert: true }, 20, 1, (x, _y, w) => grey(Math.round((x / (w - 1)) * 255)));
    expect(g.chars[0]).not.toBe(' ');
    expect(g.chars[g.cols - 1]).toBe(' ');
    expect(g.alpha[g.cols - 1]).toBe(0);
  });

  it('cutoff empties the cells under it (they show what is below: alpha 0)', () => {
    const g = run({ cutoff: 0.5 }, 20, 1, (x, _y, w) => grey(Math.round((x / (w - 1)) * 255)));
    for (let c = 0; c < g.cols; c++) {
      if (g.lum[c] < 0.5) { expect(g.chars[c]).toBe(' '); expect(g.alpha[c]).toBe(0); }
      else expect(g.chars[c]).not.toBe(' ');
    }
  });

  it('keeps a cut-out empty where the picture is transparent', () => {
    const g = run({}, 10, 2, x => (x < 10 ? [255, 255, 255, 0] : grey(255)));
    expect(rowText(g, 0).slice(0, 5)).toBe('     ');
    expect(g.alpha[0]).toBe(0);
    expect(g.alpha[9]).toBeGreaterThan(0);
  });

  it('tone: brightness, contrast and saturation change what the ramp reads', () => {
    const base = run({}, 4, 1, () => grey(100));
    const brighter = run({ bright: 0.3 }, 4, 1, () => grey(100));
    expect(brighter.lum[0]).toBeGreaterThan(base.lum[0]);
    const flat = run({ contrast: 0 }, 4, 1, () => grey(20));
    expect(flat.lum[0]).toBeCloseTo(0.5, 2);
    const red: RGBA = [220, 30, 30, 255];
    const vivid = run({ color: 'source', sat: 2 }, 2, 1, () => red), dull = run({ color: 'source', sat: 0 }, 2, 1, () => red);
    expect(dull.rgb[0]).toBe(dull.rgb[1]);
    expect(vivid.rgb[0] - vivid.rgb[1]).toBeGreaterThan(190);
  });

  it('edges: contour glyphs follow the direction of the edge', () => {
    // bright right half: a vertical edge
    const v = run({ edge: 1 }, 12, 6, (x, _y, w) => grey(x >= w / 2 ? 255 : 0));
    expect(v.chars[2 * 12 + 6]).toBe('|');
    // bright bottom half: a horizontal edge (low in the cell above → «_», else «-»)
    const h = run({ edge: 1 }, 6, 8, (_x, y, _w, hh) => grey(y >= hh / 2 ? 255 : 0));
    expect(['-', '_']).toContain(h.chars[4 * 6 + 3]);
    // bright below the diagonal from top-left to bottom-right: «\»
    const d = run({ edge: 1, aspect: 1 }, 16, 16, (x, y) => grey(y * 1 > x * 2 ? 255 : 0));
    const found = d.chars.filter(c => c === '\\').length;
    expect(found).toBeGreaterThan(4);
    expect(d.chars.filter(c => c === '/').length).toBeLessThan(found / 2);
  });

  it('braille: each lit sub-sample is its dot (U+2800 + bits)', () => {
    const one = run({ charset: 'braille' }, 1, 1, (x, y) => grey(x === 0 && y === 0 ? 255 : 0));
    expect(one.chars[0]).toBe('⠁');
    const left = run({ charset: 'braille' }, 1, 1, x => grey(x === 0 ? 255 : 0));
    expect(left.chars[0]).toBe(String.fromCharCode(0x2800 + 0b01000111)); // dots 1,2,3,7 ⡇
    const bottom = run({ charset: 'braille' }, 1, 1, (_x, y) => grey(y === 3 ? 255 : 0));
    expect(bottom.chars[0]).toBe(String.fromCharCode(0x2800 + 0b11000000)); // dots 7,8 ⣀
    const full = run({ charset: 'braille' }, 2, 2, () => grey(255));
    expect(full.chars.every(c => c === '⣿')).toBe(true);
    const dark = run({ charset: 'braille', cutoff: 0.1 }, 2, 2, () => grey(0));
    expect(dark.chars.every(c => c === ' ')).toBe(true);
  });

  it('braille with an ordered dither lights half the dots of a 50 % grey', () => {
    const g = run({ charset: 'braille-trama' }, 4, 4, () => grey(188)); // luma ≈ 0.5 after sRGB bytes → 0.737; use tone to centre
    const mid = run({ charset: 'braille-trama', gamma: Math.log(0.5) / Math.log(188 / 255) }, 4, 4, () => grey(188));
    const bits = (c: string) => (c === ' ' ? 0 : (c.charCodeAt(0) - 0x2800).toString(2).split('').filter(b => b === '1').length);
    const total = mid.chars.reduce((n, c) => n + bits(c), 0);
    expect(total).toBe(16 * 4);
    expect(g.chars.reduce((n, c) => n + bits(c), 0)).toBeGreaterThan(total);
  });

  it('blocks: the quadrants of a cell pick the block that draws them', () => {
    const top = run({ charset: 'bloques' }, 1, 1, (_x, y) => grey(y < 2 ? 255 : 0));
    expect(top.chars[0]).toBe('▀');
    const left = run({ charset: 'bloques' }, 1, 1, x => grey(x === 0 ? 255 : 0));
    expect(left.chars[0]).toBe('▌');
    const corner = run({ charset: 'bloques' }, 1, 1, (x, y) => grey(x === 1 && y >= 2 ? 255 : 0));
    expect(corner.chars[0]).toBe('▗');
  });

  it('arrows point toward the light', () => {
    const g = run({ charset: 'flechas' }, 12, 4, (x, _y, w) => grey(Math.round(90 + (x / (w - 1)) * 165)));
    const mid = rowText(g, 1);
    expect(mid).toMatch(/[→⇒]/);
    expect(mid).not.toMatch(/[←⇐]/);
  });
});

describe('words fill', () => {
  it('flows the text through the figure in reading order, keeping its spaces', () => {
    const cols = 6, rows = 2;
    const on = Uint8Array.from([1, 1, 1, 0, 1, 1, /**/ 1, 1, 1, 1, 1, 1]);
    const out = new Array(cols * rows).fill(' ');
    flowWords('AB CD', on, cols, rows, out);
    expect(out.join('')).toBe('AB  CD' + 'AB CD ');
  });

  it('never starts a run with a space, and repeats the text', () => {
    const on = Uint8Array.from([1, 1, 0, 1, 1, 1]);
    const out = new Array(6).fill(' ');
    flowWords('XY', on, 6, 1, out);
    // X Y · (space skipped at the start of the second run) X Y ␠
    expect(out.join('')).toBe('XY XY ');
  });

  it('can break only between words', () => {
    const on = Uint8Array.from([1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1]);
    const out = new Array(12).fill(' ');
    flowWords('ONE TWO', on, 12, 1, out, 'word');
    // «ONE» fits the first run of 5; «TWO» does not fit in the one cell left, so it opens the next run;
    // then «ONE» does not fit in the two cells left there: they stay empty
    expect(out.join('')).toBe('ONE   TWO   ');
  });

  it('a style with words fills the bright cells only', () => {
    const g = run({ fill: 'words', chars: 'hola mundo', cutoff: 0.5 }, 10, 2, (x, _y, w) => grey(x >= w / 2 ? 255 : 0));
    expect(rowText(g, 0)).toBe('     hola ');
    expect(rowText(g, 1)).toBe('     mundo');
  });
});

describe('charsets', () => {
  it('offers the alphabets of the brief, each with a Spanish name and a line of description', () => {
    const ids = CHARSETS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['estandar', 'estandar2', 'extendido', 'alfabetico', 'alfanumerico', 'numerico', 'flechas', 'cp437', 'bloques', 'braille',
      'matematicos', 'minimalista', 'maximo', 'byn', 'katakana', 'puntos', 'lineas', 'custom', 'palabras']) expect(ids).toContain(id);
    for (const c of CHARSETS) { expect(c.name.length).toBeGreaterThan(2); expect(c.blurb.length).toBeGreaterThan(20); }
  });

  it('builds a brightness table that never goes back down the ramp', () => {
    for (const c of CHARSETS) {
      const r = resolveRamp({ ...defaultGlyphStyle(), charset: c.id, chars: c.id === 'custom' ? ' .oO@' : 'palabras' }, 10, 20);
      for (let s = 1; s < 256; s++) expect(r.lut[s]).toBeGreaterThanOrEqual(r.lut[s - 1]);
      expect(r.lut[255]).toBe(r.chars.length - 1);
    }
  });

  it('keeps the order of the user characters', () => {
    const r = resolveRamp({ ...defaultGlyphStyle(), charset: 'custom', chars: ' @.o' }, 10, 20);
    expect(r.chars.join('')).toBe(' @.o');
    const empty = resolveRamp({ ...defaultGlyphStyle(), charset: 'custom', chars: '' }, 10, 20);
    expect(empty.chars.join('')).toBe(' .:-=+*#%@');
  });

  it('Máximo holds every printable ASCII character and Katakana is half-width only', () => {
    const max = CHARSETS.find(c => c.id === 'maximo')!;
    expect(max.chars.length).toBe(95);
    const kata = CHARSETS.find(c => c.id === 'katakana')!;
    for (const ch of Array.from(kata.chars.trim())) expect(ch.codePointAt(0)!).toBeGreaterThanOrEqual(0xff65);
  });
});
