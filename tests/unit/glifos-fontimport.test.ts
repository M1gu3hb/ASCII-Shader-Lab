import { describe, expect, it } from 'vitest';
import { compileDoc } from '../../src/glifos/compile';
import { newDoc, type PathNode } from '../../src/glifos/doc';
import { loadOpentype } from '../../src/glifos/export/ot';
import { commandsToContours, FONT_LICENSE_NOTE, importFontGlyphs, readFontFile } from '../../src/glifos/fontimport';

/** A tiny font made here: upm 2048, «A» of straight lines and «o» of curves, with the given embedding flags. */
async function tinyFont(fsType: number): Promise<ArrayBuffer> {
  const ot = await loadOpentype();
  const notdef = new ot.Glyph({ name: '.notdef', advanceWidth: 1024, path: new ot.Path() });
  const a = new ot.Path();
  a.moveTo(100, 0); a.lineTo(1024, 1434); a.lineTo(1948, 0); a.close();
  const o = new ot.Path();
  o.moveTo(1024, 0);
  o.curveTo(1590, 0, 1900, 300, 1900, 600);
  o.curveTo(1900, 900, 1590, 1200, 1024, 1200);
  o.curveTo(458, 1200, 148, 900, 148, 600);
  o.curveTo(148, 300, 458, 0, 1024, 0);
  o.close();
  const font = new ot.Font({
    familyName: 'Prueba Mía', styleName: 'Regular', unitsPerEm: 2048, ascender: 1638, descender: -410,
    copyright: '© 2026 Yo', license: 'SIL Open Font License 1.1', licenseURL: 'https://openfontlicense.org',
    glyphs: [notdef, new ot.Glyph({ name: 'A', unicode: 65, advanceWidth: 2048, path: a }), new ot.Glyph({ name: 'o', unicode: 111, advanceWidth: 2048, path: o })],
    tables: { os2: { fsType, sxHeight: 1100, sCapHeight: 1434 } },
  });
  return font.toArrayBuffer();
}

describe('reading a font file', () => {
  it('reports its names, metrics, characters and license flags', async () => {
    const info = await readFontFile(await tinyFont(0));
    expect(info).toMatchObject({
      family: 'Prueba Mía', style: 'Regular', upm: 2048, asc: 1638, desc: -410, xh: 1100, cap: 1434, glyphs: 3,
      chars: ['A', 'o'], charCount: 2, copyright: '© 2026 Yo', license: 'SIL Open Font License 1.1', licenseUrl: 'https://openfontlicense.org',
      fsType: 0, restricted: false, editable: true,
    });
    expect(info.note).toContain('instalable');
    expect(info.note).toContain(FONT_LICENSE_NOTE);
  });

  it('reads the embedding permissions', async () => {
    const restricted = await readFontFile(await tinyFont(0x0002));
    expect(restricted).toMatchObject({ fsType: 2, restricted: true, editable: false });
    expect(restricted.note).toMatch(/prohíbe/);
    expect(restricted.note).toContain(FONT_LICENSE_NOTE);
    const preview = await readFontFile(await tinyFont(0x0004));
    expect(preview).toMatchObject({ restricted: false, editable: false });
    expect(preview.note).toMatch(/vista previa e impresión/);
    expect(await readFontFile(await tinyFont(0x0008))).toMatchObject({ restricted: false, editable: true });
    const noSubset = await readFontFile(await tinyFont(0x0108));
    expect(noSubset).toMatchObject({ restricted: false, editable: false });
    expect(noSubset.note).toMatch(/subconjuntos/);
  });

  it('refuses what it cannot read, in Spanish', async () => {
    const woff2 = new Uint8Array(64);
    woff2.set([0x77, 0x4f, 0x46, 0x32]); // 'wOF2'
    await expect(readFontFile(woff2.buffer)).rejects.toThrow(/WOFF2/);
    await expect(readFontFile(new TextEncoder().encode('no soy una fuente').buffer)).rejects.toThrow(/no es una fuente/);
  });
});

describe('importing glyphs from a font', () => {
  it('refuses a font whose license restricts embedding', async () => {
    const doc = newDoc({ mode: 'texto', groups: ['mayusculas'] });
    await expect(importFontGlyphs(await tinyFont(0x0002), ['A'], doc)).rejects.toThrow(/prohíbe/);
  });

  it('scales the outlines to the document (2048 → 1000 units), y up', async () => {
    const doc = newDoc({ mode: 'texto', groups: ['mayusculas', 'minusculas'] });
    const { glyphs, missing } = await importFontGlyphs(await tinyFont(0), ['A', 'o', 'z', 'Ao'], doc);
    expect(missing).toEqual(['z']);
    expect(Object.keys(glyphs)).toEqual(['A', 'o']);
    const A = glyphs.A;
    expect(A).toMatchObject({ ch: 'A', status: 'dibujado', origin: 'fuente', adv: 1000, components: [], anchors: [] });
    expect(A.contours).toEqual([{ closed: true, nodes: [{ x: 48.8, y: 0 }, { x: 500, y: 700.2 }, { x: 951.2, y: 0 }] }]);
    const o = glyphs.o;
    expect(o.contours).toHaveLength(1);
    const ns = o.contours[0].nodes;
    // four on-curve nodes (the last curve comes back to the first), each with both handles, all smooth
    expect(ns.map(n => [n.x, n.y])).toEqual([[500, 0], [927.7, 293], [500, 585.9], [72.3, 293]]);
    expect(ns.every(n => n.hi && n.ho && n.smooth)).toBe(true);
    expect(ns[0].ho).toEqual({ x: 776.4, y: 0 });
    expect(ns[0].hi).toEqual({ x: 223.6, y: 0 });
    // the document compiles them as drawn glyphs
    doc.glyphs.A = A;
    doc.glyphs.o = o;
    const { set } = compileDoc(doc);
    expect(set.glyphs.A.d).toBe('M48.8 0L500 700.2L951.2 0Z');
    expect(set.glyphs.o.d).toMatch(/^M500 0C776\.4 0 /);
  });

  it('centres each glyph in an ASCII cell', async () => {
    const doc = newDoc({ mode: 'ascii' });
    const { glyphs } = await importFontGlyphs(await tinyFont(0), ['A'], doc);
    // advance 1000 in a 600 cell: moved 200 to the left, advance = the cell
    expect(glyphs.A.adv).toBe(600);
    expect(glyphs.A.contours[0].nodes.map(n => n.x)).toEqual([-151.2, 300, 751.2]);
  });

  it('turns TrueType quadratics into the same curves as cubics', () => {
    const cmds = [
      { type: 'M', x: 0, y: 0 }, { type: 'L', x: 90, y: 0 },
      { type: 'Q', x1: 90, y1: 90, x: 0, y: 90 },
      { type: 'Q', x1: -30, y1: 45, x: 0, y: 0 },
      { type: 'Z' },
    ];
    const [c] = commandsToContours(cmds)!;
    expect(c.closed).toBe(true);
    // the path came back to its start: three nodes, the first one with the last curve's handle
    expect(c.nodes).toEqual<PathNode[]>([
      { x: 0, y: 0, hi: { x: -20, y: 30 } },
      { x: 90, y: 0, ho: { x: 90, y: 60 } },
      { x: 0, y: 90, hi: { x: 60, y: 90 }, ho: { x: -20, y: 60 } },
    ]);
    // the cubic and the quadratic agree along the whole curve
    const quad = (t: number) => { const u = 1 - t; return [u * u * 90 + 2 * u * t * 90 + t * t * 0, u * u * 0 + 2 * u * t * 90 + t * t * 90]; };
    const cubic = (t: number) => { const u = 1 - t; return [u * u * u * 90 + 3 * u * u * t * 90 + 3 * u * t * t * 60 + t * t * t * 0, u * u * u * 0 + 3 * u * u * t * 60 + 3 * u * t * t * 90 + t * t * t * 90]; };
    for (const t of [0.1, 0.25, 0.5, 0.8]) { expect(cubic(t)[0]).toBeCloseTo(quad(t)[0], 9); expect(cubic(t)[1]).toBeCloseTo(quad(t)[1], 9); }
    // scaled and moved
    expect(commandsToContours(cmds, 0.5, 10)![0].nodes[1]).toEqual({ x: 55, y: 0, ho: { x: 55, y: 30 } });
    // a path that does not come back closes with a straight segment; a zero-length line adds nothing
    expect(commandsToContours([{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 10, y: 0 }, { type: 'L', x: 10, y: 0 }, { type: 'L', x: 10, y: 10 }])![0].nodes).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    // beyond the document's limits: refused
    expect(commandsToContours(Array.from({ length: 7000 }, (_, i) => ({ type: i ? 'L' : 'M', x: i, y: i % 2 })))).toBeNull();
  });
});
