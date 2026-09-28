import { describe, expect, it } from 'vitest';
import { defaultGlyphStyle, drawGlyphs, type CellFx, type GlyphGrid } from '../../src/glyphs';
import type { GlyphStyle } from '../../src/project/types';

/** A Canvas 2D stand-in that records what is drawn (no letterSpacing: the one-glyph-per-call path). */
class Rec {
  ops: Array<{ op: 'rect' | 'text'; fill: string; alpha: number; a: unknown[]; align: string }> = [];
  font = '';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  fillStyle = '#000000';
  globalAlpha = 1;
  private stack: Array<[string, string, string, string, number]> = [];
  save() { this.stack.push([this.font, this.textAlign, this.textBaseline, this.fillStyle, this.globalAlpha]); }
  restore() { [this.font, this.textAlign, this.textBaseline, this.fillStyle, this.globalAlpha] = this.stack.pop()!; }
  getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
  setTransform() {}
  scale() {}
  translate() {}
  rotate() {}
  measureText(t: string) { return { width: Array.from(t).length * 6 }; }
  fillRect(...a: number[]) { this.ops.push({ op: 'rect', fill: this.fillStyle, alpha: this.globalAlpha, a, align: this.textAlign }); }
  fillText(...a: unknown[]) { this.ops.push({ op: 'text', fill: this.fillStyle, alpha: this.globalAlpha, a, align: this.textAlign }); }
}

function grid(line: string, rgb: (i: number) => [number, number, number] = () => [10, 20, 30], cw = 10, ch = 20): GlyphGrid {
  const chars = Array.from(line), n = chars.length;
  const c = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) c.set(rgb(i), i * 3);
  return { cols: n, rows: 1, cw, ch, chars, rgb: c, lum: new Float32Array(n).fill(0.5), alpha: Float32Array.from(chars, x => (x === ' ' ? 0 : 1)), w: n * cw, h: ch };
}
const style = (s: Partial<GlyphStyle> = {}): GlyphStyle => ({ ...defaultGlyphStyle(), ...s });
function draw(g: GlyphGrid, s: GlyphStyle, fx?: (i: number, col: number, row: number) => CellFx | null) {
  const r = new Rec();
  drawGlyphs(r as unknown as CanvasRenderingContext2D, g, s, fx);
  return r;
}
const texts = (r: Rec) => r.ops.filter(o => o.op === 'text');

describe('drawGlyphs', () => {
  it('fills the paper first, then one centred character per visible cell', () => {
    const r = draw(grid('a b'), style({ color: 'mono', ink: '#ff5b1f', paper: '#0c0b0a' }));
    expect(r.ops[0]).toMatchObject({ op: 'rect', fill: '#0c0b0a', a: [0, 0, 30, 20] });
    const t = texts(r);
    expect(t.map(o => o.a[0])).toEqual(['a', 'b']);
    expect(t.every(o => o.fill === '#ff5b1f')).toBe(true);
    // left-aligned at the cell's left edge plus half the free space: (10 − 6) / 2
    expect(t[0].a[1]).toBe(2);
    expect(t[1].a[1]).toBe(22);
  });

  it('draws nothing under a transparent paper', () => {
    const r = draw(grid('a'), style({ paper: null }));
    expect(r.ops.filter(o => o.op === 'rect')).toHaveLength(0);
  });

  it('groups cells by colour: one fillStyle per colour, not per cell', () => {
    const cols: Array<[number, number, number]> = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
    const r = draw(grid('abcabcabcabcabc', i => cols[i % 3]), style({ color: 'source', paper: null }));
    const t = texts(r);
    expect(t).toHaveLength(15);
    let switches = 0;
    for (let k = 1; k < t.length; k++) if (t[k].fill !== t[k - 1].fill) switches++;
    expect(switches).toBe(2);
    expect(new Set(t.map(o => o.fill))).toEqual(new Set(['#ff0000', '#00ff00', '#0000ff']));
  });

  it('uses the cell coverage as opacity and skips empty cells', () => {
    const g = grid('ab');
    g.alpha[0] = 0.5; g.alpha[1] = 0;
    const t = texts(draw(g, style({ paper: null })));
    expect(t).toHaveLength(1);
    expect(t[0].alpha).toBe(0.5);
  });

  it('applies cell effects: hide, swap, recolour, move, scale', () => {
    const fx = (i: number): CellFx | null => [
      { visible: 0 },
      { glyph: 'Z' },
      { color: '#00ff00' },
      { dx: 5, dy: -3 },
      { scale: 2 },
    ][i] ?? null;
    const r = draw(grid('abcde'), style({ color: 'mono', ink: '#ffffff', paper: null }), fx);
    const t = texts(r);
    const by = (ch: string) => t.find(o => o.a[0] === ch);
    expect(by('a')).toBeUndefined();
    expect(by('b')).toBeUndefined();
    expect(by('Z')).toBeDefined();
    expect(by('c')!.fill).toBe('#00ff00');
    expect(by('d')!.a[1]).toBe(30 + 2 + 5);
    // a scaled cell is drawn on its own, centred on its cell (the transform does the rest)
    expect(by('e')).toMatchObject({ align: 'center', a: ['e', 0, expect.any(Number)] });
    expect(t[t.length - 1].a[0]).toBe('e');
  });

  it('draws block elements as rectangles that fill the cell exactly', () => {
    const r = draw(grid('█▀▐'), style({ paper: null }));
    const rects = r.ops.filter(o => o.op === 'rect').map(o => o.a);
    expect(rects).toContainEqual([0, 0, 10, 20]);
    expect(rects).toContainEqual([10, 0, 10, 10]);
    expect(rects).toContainEqual([25, 0, 5, 20]);
    expect(texts(r)).toHaveLength(0);
  });

  it('squeezes a character wider than its cell into it', () => {
    const r = draw(grid('ab', undefined, 4, 20), style({ paper: null }));
    // measureText gives 6 px for any character: wider than 4 × 1.06
    expect(texts(r)[0].a).toEqual(['a', 0, expect.any(Number), 4]);
  });
});
