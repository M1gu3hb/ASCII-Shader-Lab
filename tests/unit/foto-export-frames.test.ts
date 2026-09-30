import { describe, expect, it } from 'vitest';
import { gridText, type CellFx, type GlyphGrid } from '../../src/glyphs';
import { applyFrame, blankGrid, cellCoverage, emptyNotes, mergeNotes, notesText, padGrid } from '../../src/foto/export/frameGrid';

/** A grid from lines (every character visible, cells 10×20, one colour). */
function grid(lines: string[], color = 0x112233): { g: GlyphGrid; colors: Uint32Array } {
  const rows = lines.length, cols = Math.max(...lines.map(l => Array.from(l).length));
  const chars: string[] = [];
  for (const l of lines) { const a = Array.from(l); for (let x = 0; x < cols; x++) chars.push(a[x] ?? ' '); }
  const n = cols * rows;
  const rgb = new Uint8ClampedArray(n * 3);
  return {
    g: { cols, rows, cw: 10, ch: 20, chars, rgb, lum: new Float32Array(n).fill(0.5), alpha: Float32Array.from(chars, c => (c === ' ' ? 0 : 1)) },
    colors: new Uint32Array(n).fill(color),
  };
}
const hexAt = (g: GlyphGrid, i: number) => (g.rgb[i * 3] << 16) | (g.rgb[i * 3 + 1] << 8) | g.rgb[i * 3 + 2];

describe('frame grid: what the clips do per cell, as drawGrid draws it', () => {
  it('without effects the frame is the grid, with its drawn colours as rgb', () => {
    const { g, colors } = grid(['ab', 'c ']);
    const f = applyFrame(g, colors);
    expect(gridText(f)).toBe('ab\nc\n');
    expect(hexAt(f, 0)).toBe(0x112233);
    expect(f.alpha[3]).toBe(0);
  });

  it('visibility hides characters (typing): hidden cells are spaces in the text', () => {
    const { g, colors } = grid(['abcd']);
    const cells = (i: number): CellFx | null => (i >= 2 ? { visible: 0 } : null);
    expect(gridText(applyFrame(g, colors, { cells }))).toBe('ab\n');
  });

  it('a glyph swapped into an empty cell shows with the visibility it is given (the cursor), with its colour', () => {
    const { g, colors } = grid(['ab  ']);
    const cells = (i: number): CellFx | null => (i === 2 ? { visible: 1, glyph: '█', color: '#ff5b1f' } : i === 3 ? { glyph: '_' } : null);
    const f = applyFrame(g, colors, { cells });
    expect(gridText(f)).toBe('ab█\n');
    expect(hexAt(f, 2)).toBe(0xff5b1f);
    // a swap into an empty cell without a visibility stays empty (drawGrid does the same)
    expect(f.chars[3]).toBe(' ');
  });

  it('the cell reveal multiplies the visibility', () => {
    const { g, colors } = grid(['abc']);
    const f = applyFrame(g, colors, { reveal: c => (c === 1 ? 0 : 1) });
    expect(gridText(f)).toBe('a c\n');
  });

  it('moves go to the nearest whole cell and fractions are counted', () => {
    const { g, colors } = grid(['a   ', '    ']);
    const notes = emptyNotes();
    // a: 2 cells right exactly; then a fraction
    let f = applyFrame(g, colors, { cells: i => (i === 0 ? { dx: 20 } : null) }, notes);
    expect(gridText(f)).toBe('  a\n\n');
    expect(notes.rounded).toBe(0);
    f = applyFrame(g, colors, { cells: i => (i === 0 ? { dx: 14, dy: 21 } : null) }, notes);
    expect(f.chars[1 * 4 + 1]).toBe('a');
    expect(notes.rounded).toBe(1);
    // moved off the grid: gone
    f = applyFrame(g, colors, { cells: i => (i === 0 ? { dx: -30 } : null) });
    expect(gridText(f)).toBe('\n\n');
  });

  it('turned or scaled characters stay upright (counted), scale 0 hides', () => {
    const { g, colors } = grid(['ab']);
    const notes = emptyNotes();
    const f = applyFrame(g, colors, { cells: i => (i === 0 ? { rot: 45 } : { scale: 0 }) }, notes);
    expect(gridText(f)).toBe('a\n');
    expect(notes.turned).toBe(1);
    const n2 = emptyNotes();
    applyFrame(g, colors, { cells: () => ({ scale: 1.5 }) }, n2);
    expect(n2.scaled).toBe(2);
  });

  it('tiles move the drawn cell (the origin is cleared) and fade it', () => {
    const { g, colors } = grid(['ab', 'cd']);
    const f = applyFrame(g, colors, { tiles: (c, r) => (c === 0 && r === 0 ? { dx: 10, dy: 20 } : c === 1 && r === 0 ? { alpha: 0.5 } : null) });
    // «a» lands on «d»'s cell (drawn over it); «b» half visible
    expect(f.chars[0]).toBe(' ');
    expect(f.chars[3]).toBe('a');
    expect(f.alpha[1]).toBeCloseTo(0.5);
  });

  it('the mask per cell and the layer opacity multiply the strength', () => {
    const { g, colors } = grid(['abc']);
    const notes = emptyNotes();
    const f = applyFrame(g, colors, { coverage: [1, 0.1, 0.6], opacity: 0.5 }, notes);
    expect(Array.from(f.alpha).map(v => +v.toFixed(2))).toEqual([0.5, 0.05, 0.3]);
    // (TXT hides cells at or under 40/255)
    expect(gridText(f)).toBe('a c\n');
    expect(notes.masked).toBe(1);
  });

  it('the layer position moves the whole text by whole cells', () => {
    const { g, colors } = grid(['ab ', '   ']);
    const notes = emptyNotes();
    const f = applyFrame(g, colors, { offset: { x: 10, y: 20 } }, notes);
    expect(gridText(f)).toBe('\n ab\n');
    expect(notes.offset).toBe(0);
    applyFrame(g, colors, { offset: { x: 4, y: 0 } }, notes);
    expect(notes.offset).toBe(1);
  });
});

describe('frame helpers', () => {
  it('padGrid keeps the characters and fills the rest with spaces', () => {
    const { g } = grid(['ab']);
    const p = padGrid(g, 3, 2);
    expect(p.cols).toBe(3);
    expect(gridText(p)).toBe('ab\n\n');
    expect(padGrid(g, 2, 1)).toBe(g);
    expect(gridText(blankGrid(2, 2, 10, 20))).toBe('\n\n');
  });

  it('cellCoverage averages a pixel coverage over each cell', () => {
    // 4×2 px, cells 2×2: left cell half covered, right cell full
    const cov = [1, 0, 1, 1, 1, 0, 1, 1];
    expect(Array.from(cellCoverage(cov, 4, 2, 2, 1, 2, 2))).toEqual([0.5, 1]);
  });

  it('notes are said in Spanish, and merge over frames', () => {
    const a = { ...emptyNotes(), rounded: 2, pixels: ['grano'] };
    const b = { ...emptyNotes(), turned: 1, pixels: ['grano', 'resplandor'], blank: 1 };
    const m = mergeNotes(a, b);
    expect(m.pixels).toEqual(['grano', 'resplandor']);
    const t = notesText(m, 10);
    expect(t.join(' ')).toMatch(/celdas enteras/);
    expect(t.join(' ')).toMatch(/Giran caracteres/);
    expect(t.join(' ')).toMatch(/Sin grano, resplandor/);
    expect(t.join(' ')).toMatch(/En 1 cuadro la capa no se ve/);
    expect(notesText(emptyNotes())).toEqual([]);
  });
});
