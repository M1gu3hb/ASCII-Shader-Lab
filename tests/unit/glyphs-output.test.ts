import { describe, expect, it } from 'vitest';
import {
  GLYPH_PARAMS, cellColors, defaultGlyphStyle, gridText, gridToSvgText, normalizeGlyphStyle, toGridSnapshot, type GlyphGrid,
} from '../../src/glyphs';
import { gridToAnsi, gridToHtml, gridToText } from '../../src/exporters/text';
import type { GlyphStyle } from '../../src/project/types';

/** A grid from lines of text (every character visible, one colour per cell from `rgb`). */
function grid(lines: string[], rgb: (i: number) => [number, number, number] = () => [200, 100, 50]): GlyphGrid {
  const rows = lines.length, cols = Math.max(...lines.map(l => Array.from(l).length));
  const chars: string[] = [];
  for (const l of lines) { const a = Array.from(l); for (let x = 0; x < cols; x++) chars.push(a[x] ?? ' '); }
  const n = cols * rows;
  const c = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) c.set(rgb(i), i * 3);
  return {
    cols, rows, cw: 8, ch: 16, chars, rgb: c, lum: new Float32Array(n).fill(0.5),
    alpha: Float32Array.from(chars, ch => (ch === ' ' ? 0 : 1)),
  };
}
const style = (s: Partial<GlyphStyle> = {}): GlyphStyle => ({ ...defaultGlyphStyle(), ...s });

describe('colour of the characters', () => {
  it('mono paints every cell with the ink', () => {
    const c = cellColors(grid(['ab']), style({ color: 'mono', ink: '#ff5b1f' }));
    expect([...c]).toEqual([0xff5b1f, 0xff5b1f]);
  });

  it('source keeps the picture colour of each cell', () => {
    const c = cellColors(grid(['ab'], i => (i ? [1, 2, 3] : [250, 0, 0])), style({ color: 'source' }));
    expect([...c]).toEqual([0xfa0000, 0x010203]);
  });

  it('palette picks the nearest colour of the list', () => {
    const g = grid(['abcd'], i => ([[250, 10, 10], [20, 30, 240], [240, 240, 235], [5, 5, 5]] as Array<[number, number, number]>)[i]);
    const c = cellColors(g, style({ color: 'palette', palette: ['#0c0b0a', '#ede6da', '#ff5b1f', '#2040ff'] }));
    expect([...c]).toEqual([0xff5b1f, 0x2040ff, 0xede6da, 0x0c0b0a]);
  });

  it('an empty palette falls back to the ink', () => {
    const c = cellColors(grid(['a']), style({ color: 'palette', palette: [], ink: '#123456' }));
    expect(c[0]).toBe(0x123456);
  });
});

describe('text outputs', () => {
  it('toGridSnapshot → gridToText gives back the lines of the grid', () => {
    const g = grid(['.:-=+', '  @@ ', '#%*  ']);
    const snap = toGridSnapshot(g, '#0c0b0a');
    expect(snap.alpha[0]).toBe(255);
    expect(snap.alpha[5]).toBe(0);
    expect(gridToText(snap)).toBe('.:-=+\n  @@\n#%*\n');
    expect(gridText(g)).toBe('.:-=+\n  @@\n#%*\n');
  });

  it('a cell hidden by its coverage is a space in the text', () => {
    const g = grid(['ab']);
    g.alpha[1] = 0;
    expect(gridText(g)).toBe('a\n');
  });

  it('ANSI and HTML carry the drawn colours (the style resolves them)', () => {
    const g = grid(['ab']);
    const ansi = gridToAnsi(toGridSnapshot(g, '#000000', style({ color: 'mono', ink: '#ff5b1f' })), 'truecolor', false);
    expect(ansi).toContain('38;2;255;91;31m');
    const html = gridToHtml(toGridSnapshot(g, '#000000', style({ color: 'source' })));
    expect(html).toContain('color:#c86432');
  });

  it('SVG is real text: one <text> per row with a position for every character, escaped', () => {
    const g = grid(['<&>', ' a ']);
    const svg = gridToSvgText(g, style({ color: 'mono', ink: '#ede6da', paper: '#0c0b0a', font: 'jetbrains' }));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.match(/<text /g)?.length).toBe(2);
    expect(svg).toContain('&lt;&amp;&gt;');
    expect(svg).toContain('x="4 12 20"');
    expect(svg).toContain('x="12"');
    expect(svg).toContain('<rect width="100%" height="100%" fill="#0c0b0a"/>');
    expect(svg).toContain('font-family="&quot;JetBrains Mono&quot;');
    expect(svg).not.toContain('<path');
    const clear = gridToSvgText(g, style({ paper: null }));
    expect(clear).not.toContain('<rect');
    // a title with control characters (a name from a project file) stays well-formed XML
    const titled = gridToSvgText(g, style(), { title: 'Pieza\u0001\u001b[31m <1>' });
    expect(titled).toContain('<title>Pieza[31m &lt;1&gt;</title>');
    expect(titled).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  });

  it('SVG runs split where the colour changes', () => {
    const g = grid(['aab'], i => (i < 2 ? [255, 0, 0] : [0, 0, 255]));
    const svg = gridToSvgText(g, style({ color: 'source' }));
    expect(svg.match(/<tspan/g)?.length).toBe(2);
    expect(svg).toContain('fill="#ff0000">aa</tspan>');
  });
});

describe('controls schema', () => {
  it('describes GlyphStyle fields with Spanish labels and defaults of the default style', () => {
    const d = defaultGlyphStyle();
    const keys = new Set(Object.keys(d));
    for (const p of GLYPH_PARAMS) {
      expect(keys.has(p.key)).toBe(true);
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.help.length).toBeGreaterThan(10);
      if (p.key !== 'chars') expect(p.def).toEqual(d[p.key]);
      if (p.type === 'range') {
        expect(p.min).toBeLessThan(p.max);
        expect(p.def as number).toBeGreaterThanOrEqual(p.min);
        expect(p.def as number).toBeLessThanOrEqual(p.max);
      }
    }
    for (const k of keys) expect(GLYPH_PARAMS.some(p => p.key === k)).toBe(true);
  });

  it('shows the words box only when words fill, and the ink only in mono', () => {
    const words = GLYPH_PARAMS.find(p => p.label === 'Tus palabras')!;
    expect(words.show!(style({ fill: 'words' }))).toBe(true);
    expect(words.show!(style({ fill: 'ramp', charset: 'estandar' }))).toBe(false);
    expect(words.show!(style({ fill: 'ramp', charset: 'palabras' }))).toBe(true);
    const ink = GLYPH_PARAMS.find(p => p.key === 'ink')!;
    expect(ink.show!(style({ color: 'source' }))).toBe(false);
  });

  it('normalizes broken styles to valid ones', () => {
    const s = normalizeGlyphStyle({ charset: 'nope', cell: -4, aspect: NaN, color: 'rainbow' as 'mono', paper: 'red', ink: '#abc', palette: ['#fff', 'x'] });
    expect(s.charset).toBe('estandar');
    expect(s.cell).toBe(2);
    expect(s.aspect).toBe(2);
    expect(s.color).toBe('mono');
    expect(s.paper).toBe('#0c0b0a');
    expect(s.ink).toBe('#abc');
    expect(s.palette).toEqual(['#fff']);
    expect(normalizeGlyphStyle({ paper: null }).paper).toBeNull();
    expect(normalizeGlyphStyle(null)).toEqual(defaultGlyphStyle());
  });
});
