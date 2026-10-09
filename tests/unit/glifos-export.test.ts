import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { glyphSetBytes, normalizeGlyphSet, setChars, type GlyphSet } from '../../src/glyphset/set';
import { hashBytes } from '../../src/studio/mediaStore';
import { crc32, unzip, zip } from '../../src/shared/zip';
import { compileDoc } from '../../src/glifos/compile';
import { newDoc, normalizeDoc, type GlyphDoc } from '../../src/glifos/doc';
import { atlasChars, atlasManifest, renderAtlas } from '../../src/glifos/export/atlas';
import { buildOtf, checkOtf, injectKernTable, otfFileName, otfSkipped } from '../../src/glifos/export/otf';
import { loadOpentype, type OFont } from '../../src/glifos/export/ot';
import { asCopy, PACKAGE_FUTURE, packageFileName, planMerge, readPackage, writePackage } from '../../src/glifos/export/package';
import { parsePath, pathBounds } from '../../src/glifos/export/path';
import { encodeAlphaPng } from '../../src/glifos/export/png';
import { glyphFileName, glyphSvg, sheetSvg, svgZip } from '../../src/glifos/export/svg';

const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');
const GRIN = '\u{1F600}';

/** A small text set by hand: lines, a quadratic, a cubic, a non-ASCII letter, an astral character, a picture. */
function sampleSet(): GlyphSet {
  return normalizeGlyphSet({
    kind: 'glyphos-glifos', v: 1, name: 'Prueba ñ', doc: { id: 'gl-0011223344556677', rev: 3 }, mode: 'texto',
    upm: 1000, asc: 800, desc: -200, xh: 500, cap: 700,
    glyphs: {
      ' ': { a: 250 },
      A: { a: 600, d: 'M0 0L300 700L600 0L500 0L300 500L100 0Z' },
      V: { a: 600, d: 'M0 700L300 0L600 700L500 700L300 200L100 700Z' },
      a: { a: 520, d: 'M50 0L50 300Q50 500 260 500Q470 500 470 300L470 0Z' },
      'ñ': { a: 540, d: 'M60 0L60 500C60 520 480 520 480 500L480 0Z M100 600L440 600L440 680L100 680Z' },
      [GRIN]: { a: 900, d: 'M50 -100L850 -100L850 700L50 700Z M200 100L200 500L700 500L700 100Z' },
      '#': { a: 500, b: { w: 2, h: 2, a: b64([255, 0, 0, 255]), x: 0, y: 500, s: 100 } },
    },
    kern: { AV: -80, VA: -60, Va: -30 },
  });
}

async function parsed(buf: ArrayBuffer): Promise<OFont> {
  return (await loadOpentype()).parse(buf);
}

describe('OTF export', () => {
  it('builds a CFF OpenType font that reads back as the set', async () => {
    const set = sampleSet();
    const buf = await buildOtf(set, { family: 'Mi Alfabeto ñ', style: 'Regular', license: { author: 'Ana', copyright: '© 2026 Ana', license: 'SIL OFL 1.1' }, version: '1.2' });
    expect(String.fromCharCode(...new Uint8Array(buf, 0, 4))).toBe('OTTO');
    const check = checkOtf(buf, set);
    expect(check.problems).toEqual([]);
    expect(check.ok).toBe(true);

    const f = await parsed(buf);
    expect(f.glyphs.get(0)!.name).toBe('.notdef');
    expect(f.glyphs.get(0)!.path.commands.length).toBeGreaterThan(0);
    const sp = f.charToGlyphIndex(' ')!;
    expect(sp).toBeGreaterThan(0);
    expect(f.glyphs.get(sp)!.advanceWidth).toBe(250);
    expect(f.unitsPerEm).toBe(1000);
    expect(f.ascender).toBe(800);
    expect(f.descender).toBe(-200);
    expect(check.glyphs).toBe(f.glyphs.length);
    // .notdef, space, A V a ñ and the astral one; the picture is not in it
    expect(f.glyphs.length).toBe(7);
    expect(f.charToGlyphIndex('#')).toBeFalsy();

    // the character outside the BMP is mapped (cmap format 12)
    const cmap = f.tables.cmap as { format?: number; glyphIndexMap: Record<number, number> };
    expect(cmap.format).toBe(12);
    const gi = f.charToGlyphIndex(GRIN)!;
    expect(gi).toBeGreaterThan(0);
    expect(cmap.glyphIndexMap[0x1f600]).toBe(gi);
    expect(f.glyphs.get(gi)!.advanceWidth).toBe(900);
    expect(f.glyphs.get(gi)!.unicode).toBe(0x1f600);

    // advances and outline bounds
    const box = (ch: string) => { const b = f.glyphs.get(f.charToGlyphIndex(ch)!)!.path.getBoundingBox(); return [b.x1, b.y1, b.x2, b.y2]; };
    const close = (got: number[], want: number[]) => got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThanOrEqual(1));
    close(box('A'), [0, 0, 600, 700]);
    close(box('V'), [0, 0, 600, 700]);
    close(box('a'), [50, 0, 470, 500]);
    close(box('ñ'), [60, 0, 480, 680]);
    close(box(GRIN), [50, -100, 850, 700]);
    expect(f.glyphs.get(f.charToGlyphIndex('ñ')!)!.advanceWidth).toBe(540);
    expect(f.glyphs.get(f.charToGlyphIndex('a')!)!.advanceWidth).toBe(520);

    // kerning reads back
    const k = (a: string, b: string) => f.getKerningValue(f.charToGlyphIndex(a)!, f.charToGlyphIndex(b)!);
    expect(k('A', 'V')).toBe(-80);
    expect(k('V', 'A')).toBe(-60);
    expect(k('V', 'a')).toBe(-30);
    expect(k('A', 'a')).toBe(0);

    // names
    expect(f.names.fontFamily?.en).toBe('Mi Alfabeto ñ');
    expect(f.names.fontSubfamily?.en).toBe('Regular');
    expect(f.names.fullName?.en).toBe('Mi Alfabeto ñ Regular');
    expect(f.names.postScriptName?.en).toBe('MiAlfabeton-Regular');
    expect(f.names.designer?.en).toBe('Ana');
    expect(f.names.copyright?.en).toBe('© 2026 Ana');
    expect(f.names.license?.en).toBe('SIL OFL 1.1');
    expect(f.names.version?.en).toBe('Version 1.2');
    const os2 = f.tables.os2 as Record<string, number>;
    expect(os2.sxHeight).toBe(500);
    expect(os2.sCapHeight).toBe(700);
    expect(os2.sTypoAscender).toBe(800);
    expect(os2.sTypoDescender).toBe(-200);
    expect(os2.usWinDescent).toBe(200);
    expect(os2.fsType).toBe(0);
  });

  it('reports the glyphs that cannot go in', () => {
    const set = sampleSet();
    expect(otfSkipped(set)).toEqual([{ ch: '#', why: expect.stringContaining('mapa de bits') }]);
    const both = normalizeGlyphSet({ ...set, glyphs: { ...set.glyphs, B: { a: 500, d: 'M0 0L100 0L100 100Z', b: { w: 1, h: 1, a: b64([255]), x: 0, y: 0, s: 1 } } } });
    expect(otfSkipped(both).find(s => s.ch === 'B')).toMatchObject({ partial: true });
  });

  it('refuses a font that does not match the set', async () => {
    const set = sampleSet();
    const buf = await buildOtf(set, { family: 'X' });
    const other = normalizeGlyphSet({ ...set, glyphs: { ...set.glyphs, A: { a: 610, d: set.glyphs.A.d }, B: { a: 500, d: 'M0 0L100 0L100 100Z' } }, kern: { AV: -90 } });
    const r = checkOtf(buf, other);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/«A».*610/);
    expect(r.problems.join('\n')).toMatch(/«B».*cmap/);
    expect(r.problems.join('\n')).toMatch(/AV/);
    // a flipped byte breaks the checksums
    const bad = buf.slice(0);
    new Uint8Array(bad)[bad.byteLength - 8] ^= 0xff;
    expect(checkOtf(bad, set).ok).toBe(false);
    expect(checkOtf(new ArrayBuffer(8), set).ok).toBe(false);
  });

  it('writes a valid kern table into any sfnt', async () => {
    const set = normalizeGlyphSet({ ...sampleSet(), kern: undefined });
    const plain = await buildOtf(set, { family: 'Sin pares' });
    expect(checkOtf(plain, set).ok).toBe(true);
    const f0 = await parsed(plain);
    expect(Object.keys(f0.kerningPairs ?? {})).toHaveLength(0);
    // unsorted input, a duplicate (the last wins) and a zero (dropped)
    const withKern = injectKernTable(plain, [[3, 2, -40], [2, 3, -10], [2, 3, -20], [4, 2, 0]]);
    const f = await parsed(withKern);
    expect(f.kerningPairs).toEqual({ '2,3': -20, '3,2': -40 });
    // directory sorted, tables aligned, checksums right (checkOtf verifies them)
    const dv = new DataView(withKern);
    const n = dv.getUint16(4);
    const tags = Array.from({ length: n }, (_, i) => String.fromCharCode(...new Uint8Array(withKern, 12 + 16 * i, 4)));
    expect(tags).toEqual([...tags].sort());
    expect(tags).toContain('kern');
    for (let i = 0; i < n; i++) expect(dv.getUint32(12 + 16 * i + 8) % 4).toBe(0);
    expect(dv.getUint16(6)).toBe(16 * 2 ** Math.floor(Math.log2(n)));
    expect(dv.getUint16(8)).toBe(Math.floor(Math.log2(n)));
    expect(dv.getUint16(10)).toBe(n * 16 - dv.getUint16(6));
    // the table itself: version 0, one format 0 subtable, pairs sorted by (left << 16 | right)
    const at = dv.getUint32(12 + 16 * tags.indexOf('kern') + 8);
    expect([dv.getUint16(at), dv.getUint16(at + 2), dv.getUint16(at + 4), dv.getUint16(at + 6), dv.getUint16(at + 8), dv.getUint16(at + 10)]).toEqual([0, 1, 0, 14 + 12, 1, 2]);
    expect([dv.getUint16(at + 12), dv.getUint16(at + 14), dv.getUint16(at + 16)]).toEqual([12, 1, 0]);
    expect([dv.getUint16(at + 18), dv.getUint16(at + 20), dv.getInt16(at + 22), dv.getUint16(at + 24), dv.getUint16(at + 26), dv.getInt16(at + 28)]).toEqual([2, 3, -20, 3, 2, -40]);
    expect(checkOtf(withKern, set).problems.filter(p => /suma/.test(p))).toEqual([]);
    // replacing it, then removing it
    expect((await parsed(injectKernTable(withKern, [[2, 2, 5]]))).kerningPairs).toEqual({ '2,2': 5 });
    const none = injectKernTable(withKern, []);
    expect(Array.from({ length: new DataView(none).getUint16(4) }, (_, i) => String.fromCharCode(...new Uint8Array(none, 12 + 16 * i, 4)))).not.toContain('kern');
  });

  it('names the file in ASCII', () => {
    expect(otfFileName('Mi alfabeto ñandú')).toBe('Mi-alfabeto-nandu.otf');
    expect(otfFileName('🙂')).toBe('glifos.otf');
    expect(otfFileName('a/b\\c:d')).toBe('a-b-c-d.otf');
  });
});

/* ------------------------------------------------------------------ */
/* SVG                                                                 */
/* ------------------------------------------------------------------ */

const attr = (svg: string, tag: string, name: string) => new RegExp(`<${tag}\\b[^>]*\\s${name}="([^"]*)"`).exec(svg)?.[1];

/** The PNG's chunks, checked (CRC), and its pixels inflated. */
function readPng(bytes: Uint8Array): { w: number; h: number; type: number; raw: Uint8Array } {
  expect(Array.from(bytes.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 8, w = 0, h = 0, type = 0;
  const idat: Uint8Array[] = [];
  while (o < bytes.length) {
    const len = dv.getUint32(o), kind = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    expect(dv.getUint32(o + 8 + len)).toBe(crc32(bytes.subarray(o + 4, o + 8 + len)));
    if (kind === 'IHDR') { w = dv.getUint32(o + 8); h = dv.getUint32(o + 12); type = bytes[o + 17]; }
    if (kind === 'IDAT') idat.push(bytes.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  return { w, h, type, raw: new Uint8Array(inflateSync(Buffer.concat(idat))) };
}

describe('SVG export', () => {
  it('writes one glyph with y flipped, its metrics and an escaped title', () => {
    const set = sampleSet();
    const svg = glyphSvg(set, 'A');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(attr(svg, 'path', 'fill-rule')).toBe('nonzero');
    // the outline: x as in the font, y negated (A goes from the baseline up to 700)
    const b = pathBounds(parsePath(attr(svg, 'path', 'd')!))!;
    expect([b.x0, b.y0, b.x1, b.y1]).toEqual([0, -700, 600, 0]);
    // viewBox in font units: the advance and the em box (descender to ascender), 50 units of margin
    expect(attr(svg, 'svg', 'viewBox')).toBe('-50 -850 700 1100');
    expect(svg).toMatch(/<title>«A» U\+0041 · Prueba ñ<\/title>/);
    expect(svg).not.toContain('data-linea');
    const lines = glyphSvg(set, 'A', { metricsLines: true, pad: 0 });
    expect(attr(lines, 'svg', 'viewBox')).toBe('0 -800 600 1000');
    for (const l of ['base', 'ascendente', 'descendente', 'altura-x', 'mayusculas', 'origen', 'avance']) expect(lines).toContain(`data-linea="${l}"`);
    expect(lines).toMatch(/<line x1="0" y1="-500" x2="600" y2="-500" data-linea="altura-x"\/>/);
    // a curve keeps its shape: the quadratic «a» reaches y = 500
    const qa = pathBounds(parsePath(attr(glyphSvg(set, 'a'), 'path', 'd')!))!;
    expect([qa.x0, qa.y0, qa.x1, qa.y1]).toEqual([50, -500, 470, 0]);
    // outside the BMP, and below the baseline
    const g = glyphSvg(set, GRIN);
    expect(g).toContain('U+1F600');
    expect(pathBounds(parsePath(attr(g, 'path', 'd')!))!.y1).toBe(100);
    expect(() => glyphSvg(set, 'Z')).toThrow(/no está/);
  });

  it('escapes what XML needs escaped', () => {
    const set = normalizeGlyphSet({ ...sampleSet(), name: 'Tom & "Jerry" <3', glyphs: { '<': { a: 500, d: 'M0 0L100 0L100 100Z' }, '&': { a: 500, d: 'M0 0L100 0L100 100Z' } } });
    const lt = glyphSvg(set, '<');
    expect(/<title>(.*)<\/title>/.exec(lt)![1]).toBe('«&lt;» U+003C · Tom &amp; &quot;Jerry&quot; &lt;3');
    expect(glyphSvg(set, '&')).toContain('«&amp;» U+0026');
    const sheet = sheetSvg(set);
    expect(sheet).toContain('«&lt;» U+003C</text>');
    expect(sheet).not.toMatch(/«[<&]»/);
  });

  it('embeds a picture glyph as a real PNG', () => {
    const svg = glyphSvg(sampleSet(), '#');
    const href = attr(svg, 'image', 'xlink:href')!;
    expect(href.startsWith('data:image/png;base64,')).toBe(true);
    // its top-left corner at (0, 500) in font units: y = -500 in the SVG; 2 × 2 px of 100 units
    expect([attr(svg, 'image', 'x'), attr(svg, 'image', 'y'), attr(svg, 'image', 'width'), attr(svg, 'image', 'height')]).toEqual(['0', '-500', '200', '200']);
    const png = readPng(new Uint8Array(Buffer.from(href.slice(22), 'base64')));
    expect([png.w, png.h, png.type]).toEqual([2, 2, 4]);
    // rows: filter byte, then grey + alpha per pixel (the bitmap's alpha was 255, 0 / 0, 255)
    expect(Array.from(png.raw)).toEqual([0, 0, 255, 0, 0, 0, 0, 0, 0, 255]);
    // a bitmap bigger than one stored deflate block still inflates
    const big = readPng(encodeAlphaPng(256, 256, new Uint8Array(65536).fill(7)));
    expect(big.raw.length).toBe(256 * 513);
    expect(big.raw[2]).toBe(7);
  });

  it('draws a sheet with every glyph and its label', () => {
    const set = sampleSet();
    const sheet = sheetSvg(set, { cols: 3, cell: 100 });
    const chars = setChars(set);
    expect((sheet.match(/<text /g) ?? []).length).toBe(chars.length);
    expect(sheet).toContain('«A» U+0041</text>');
    expect(sheet).toContain('espacio U+0020</text>');
    expect(sheet).toContain('«\u{1F600}» U+1F600</text>');
    expect((sheet.match(/<path /g) ?? []).length).toBe(chars.filter(c => set.glyphs[c].d).length);
    expect((sheet.match(/<image /g) ?? []).length).toBe(1);
    // 3 columns of 100 px, 3 rows of 100 + 24 px of label, 15 px of margin
    expect(attr(sheet, 'svg', 'viewBox')).toBe('0 0 330 402');
    expect(sheetSvg(set, { labels: false })).not.toContain('<text');
  });

  it('zips one SVG per character, the sheet and a LEEME', async () => {
    const set = sampleSet();
    const entries = await unzip(await svgZip(set));
    const names = entries.map(e => e.name);
    expect(names).toEqual([...setChars(set).map(glyphFileName), 'hoja.svg', 'LEEME.txt']);
    for (const n of ['U+0041-A.svg', 'U+0061-a.svg', 'U+00F1.svg', 'U+1F600.svg', 'U+0020.svg', 'U+0023.svg']) expect(names).toContain(n);
    const leeme = await entries.find(e => e.name === 'LEEME.txt')!.text();
    expect(leeme).toMatch(/unidades de fuente/);
    expect(leeme).toMatch(/hoja\.svg/);
    expect(await entries.find(e => e.name === 'U+0041-A.svg')!.text()).toBe(glyphSvg(set, 'A'));
  });
});

/* ------------------------------------------------------------------ */
/* Atlas                                                               */
/* ------------------------------------------------------------------ */

describe('atlas', () => {
  it('describes cells by code point', () => {
    const set = sampleSet();
    const m = atlasManifest(set, '0123456789abcdef', { cellW: 20, cellH: 40, cols: 2, chars: ['A', GRIN, 'a'] });
    expect(m.chars).toEqual(['A', GRIN, 'a']);
    expect(m.codes).toEqual([0x41, 0x1f600, 0x61]);
    expect([m.cols, m.rows]).toEqual([2, 2]);
    expect(m.em).toBeCloseTo(31, 6);
    expect(m).toMatchObject({ kind: 'glyphos-atlas', v: 1, set: '0123456789abcdef', name: 'Prueba ñ', mode: 'texto', cell: { w: 20, h: 40 }, order: 'rampa', metrics: { upm: 1000, asc: 800, desc: -200, xh: 500, cap: 700 } });
    expect(m.placement).toMatch(/0,82/);
    expect(m.placement).toMatch(/centrad/);
    // a string with an astral character is still one cell per code point
    expect(atlasManifest(set, 'x', { cellW: 10, cellH: 10, cols: 8, chars: ['A' + GRIN] }).chars).toEqual(['A', GRIN]);
    expect(atlasManifest(set, 'x', { cellW: 10, cellH: 10, cols: 8, chars: setChars(set) }).order).toBe('codigo');
  });

  it('follows an ASCII set ramp', () => {
    const set = normalizeGlyphSet({ ...sampleSet(), mode: 'ascii', ramp: ' aA', kern: undefined });
    expect(atlasChars(set, 'rampa')).toEqual([' ', 'a', 'A', '#', 'V', 'ñ', GRIN]);
    expect(atlasChars(set, 'codigo')).toEqual(setChars(set));
  });

  it('is painted only in a browser', async () => {
    await expect(renderAtlas(sampleSet(), 'x', { cellW: 10, cellH: 20 })).rejects.toThrow(/navegador/);
  });
});

/* ------------------------------------------------------------------ */
/* Portable package                                                    */
/* ------------------------------------------------------------------ */

const T0 = Date.UTC(2026, 9, 1);

/** A document with a drawn A, a picture, and the set it published. */
async function sampleProject() {
  const doc = newDoc({ mode: 'texto', groups: ['mayusculas'], id: 'gl-0123456789abcdef', now: T0, name: 'Mi proyecto' });
  doc.glyphs.A = { ...doc.glyphs.A, status: 'dibujado', contours: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 300, y: 700 }, { x: 600, y: 0 }] }] };
  const png = encodeAlphaPng(2, 2, new Uint8Array([255, 0, 0, 255]));
  const img = await hashBytes(png);
  doc.images[img] = { name: 'boceto.png', w: 2, h: 2 };
  doc.glyphs.B = { ...doc.glyphs.B, raster: { img, crop: { x: 0, y: 0, w: 2, h: 2 }, x: 0, y: 700, s: 10, threshold: 0.5, read: 'transparencia', use: 'guia', visible: true } };
  doc.kern = { AB: -20 };
  doc.rev = 4;
  const set = normalizeGlyphSet(compileDoc(doc).set);
  const bytes = glyphSetBytes(set);
  const setId = await hashBytes(bytes);
  doc.published = [{ rev: 4, set: setId, at: T0 + 1000 }];
  return { doc, png, img, set, bytes, setId };
}

const imagesFrom = (map: Record<string, Uint8Array>) => async (id: string) => (map[id] ? new Blob([map[id] as BlobPart], { type: 'image/png' }) : undefined);

/** A package built by hand, to tamper with. */
async function handPackage(files: Record<string, string | Uint8Array>, manifest: Record<string, unknown> = {}) {
  return zip([{ name: 'glifos.json', data: JSON.stringify({ kind: 'glyphos-glifos-paquete', v: 1, ...manifest }) }, ...Object.entries(files).map(([name, data]) => ({ name, data }))]);
}

describe('portable package', () => {
  it('round-trips the document, its pictures and its sets', async () => {
    const p = await sampleProject();
    const { blob, missingImages } = await writePackage(p.doc, { images: imagesFrom({ [p.img]: p.png }), sets: [{ id: p.setId, bytes: p.bytes }] });
    expect(missingImages).toEqual([]);
    const entries = await unzip(blob);
    expect(entries.map(e => e.name)).toEqual(['glifos.json', 'documento.json', 'LEEME.txt', `imagenes/${p.img}.png`, `juegos/${p.setId}.json`]);
    const manifest = JSON.parse(await entries[0].text());
    expect(manifest).toMatchObject({ kind: 'glyphos-glifos-paquete', v: 1, doc: p.doc.id, rev: 4, name: 'Mi proyecto', sets: [p.setId], images: [p.img] });
    expect(manifest.created).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    const leeme = await entries[2].text();
    expect(leeme).toContain('/studio/glifos/');
    expect(leeme).toMatch(/laboratorio/);

    const r = await readPackage(blob);
    expect(r.warnings).toEqual([]);
    expect(r.future).toBe(false);
    expect(r.doc).toEqual(normalizeDoc(JSON.parse(JSON.stringify(p.doc))).doc);
    expect(r.doc).toEqual(p.doc);
    expect(r.sets).toHaveLength(1);
    expect(r.sets[0].id).toBe(p.setId);
    expect(r.sets[0].set).toEqual(p.set);
    expect(Array.from(r.sets[0].bytes)).toEqual(Array.from(p.bytes));
    expect(r.images).toHaveLength(1);
    expect(r.images[0]).toMatchObject({ id: p.img, type: 'image/png' });
    expect(Array.from(new Uint8Array(await r.images[0].blob.arrayBuffer()))).toEqual(Array.from(p.png));
    // the same from bytes
    expect((await readPackage(new Uint8Array(await blob.arrayBuffer()))).doc).toEqual(r.doc);
  });

  it('lists the pictures it could not include, and warns when reading', async () => {
    const p = await sampleProject();
    p.doc.images['fedcba9876543210'] = { name: 'perdida.png', w: 1, h: 1 };
    p.doc.images['00112233445566aa'] = { name: 'no-es-imagen.png', w: 1, h: 1 };
    const { blob, missingImages } = await writePackage(p.doc, { images: imagesFrom({ [p.img]: p.png, '00112233445566aa': new TextEncoder().encode('hola') }), sets: [] });
    expect(missingImages.sort()).toEqual(['00112233445566aa', 'fedcba9876543210']);
    const r = await readPackage(blob);
    expect(r.images.map(i => i.id)).toEqual([p.img]);
    expect(r.warnings).toEqual(['Faltan 2 imágenes del proyecto: lo que las usa se verá vacío hasta que las vuelvas a cargar.']);
  });

  it('drops a set or a picture that does not match its name, and anything that is not a picture', async () => {
    const p = await sampleProject();
    // the set, altered but still valid: it no longer hashes to its name
    const altered = new TextEncoder().encode(new TextDecoder().decode(p.bytes).replace('"name":"Mi proyecto"', '"name":"Mi proyecto 2"'));
    expect(new TextDecoder().decode(altered)).not.toBe(new TextDecoder().decode(p.bytes));
    const otherPng = encodeAlphaPng(1, 1, new Uint8Array([9]));
    const text = new TextEncoder().encode('esto no es una imagen');
    const textId = await hashBytes(text);
    const r = await readPackage(await handPackage({
      'documento.json': JSON.stringify(p.doc),
      [`juegos/${p.setId}.json`]: altered,
      'juegos/0000000000000000.json': '{ roto',
      'juegos/nombre-raro.json': p.bytes,
      [`imagenes/${p.img}.png`]: otherPng,
      [`imagenes/${textId}.png`]: text,
    }));
    expect(r.sets).toEqual([]);
    expect(r.images).toEqual([]);
    const w = r.warnings.join('\n');
    expect(w).toContain(`El juego ${p.setId} no coincide con su contenido`);
    expect(w).toContain('El juego 0000000000000000 no se pudo leer');
    expect(w).toContain('Se ignoró «juegos/nombre-raro.json»');
    expect(w).toContain(`La imagen ${p.img} no coincide con su contenido`);
    expect(w).toContain(`«imagenes/${textId}.png» no es una imagen PNG, JPEG ni WebP`);
    expect(w).toContain('Falta una imagen del proyecto');
    // the document itself is still read
    expect(r.doc.id).toBe(p.doc.id);
  });

  it('refuses pictures over the size limit without reading them', async () => {
    const p = await sampleProject();
    const big = new Uint8Array(20 * 1024 * 1024 + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const r = await readPackage(await handPackage({ 'documento.json': JSON.stringify(p.doc), 'imagenes/aaaaaaaaaaaaaaaa.png': big }));
    expect(r.images).toEqual([]);
    expect(r.warnings.join('\n')).toContain('La imagen aaaaaaaaaaaaaaaa pasa de 20 MB');
  });

  it('opens a newer document read-only and refuses a newer package format', async () => {
    const p = await sampleProject();
    const future = { ...JSON.parse(JSON.stringify(p.doc)), v: 2, algoNuevo: true };
    const r = await readPackage(await handPackage({ 'documento.json': JSON.stringify(future) }));
    expect(r.future).toBe(true);
    expect(r.doc.v).toBe(2);
    await expect(readPackage(await handPackage({ 'documento.json': JSON.stringify(p.doc) }, { v: 2 }))).rejects.toThrow(PACKAGE_FUTURE);
    await expect(readPackage(await handPackage({ 'documento.json': JSON.stringify(p.doc) }, { kind: 'otra-cosa' }))).rejects.toThrow(/no es un paquete de glifos/);
    await expect(readPackage(await zip([{ name: 'documento.json', data: JSON.stringify(p.doc) }]))).rejects.toThrow(/glifos\.json/);
    await expect(readPackage(await handPackage({}))).rejects.toThrow(/documento\.json/);
  });

  it('reads a package zipped inside a folder', async () => {
    const p = await sampleProject();
    const r = await readPackage(await zip([
      { name: 'Mi proyecto/glifos.json', data: JSON.stringify({ kind: 'glyphos-glifos-paquete', v: 1 }) },
      { name: 'Mi proyecto/documento.json', data: JSON.stringify(p.doc) },
      { name: `Mi proyecto/juegos/${p.setId}.json`, data: p.bytes },
    ]));
    expect(r.doc.id).toBe(p.doc.id);
    expect(r.sets.map(s => s.id)).toEqual([p.setId]);
  });

  it('accepts a bare document JSON', async () => {
    const p = await sampleProject();
    const r = await readPackage(new Blob(['\uFEFF' + JSON.stringify(p.doc)], { type: 'application/json' }));
    expect(r.doc).toEqual(p.doc);
    expect(r.sets).toEqual([]);
    expect(r.warnings).toEqual(['La imagen del proyecto no viene en este archivo: lo que la usa se verá vacío hasta que la vuelvas a cargar.']);
    expect((await readPackage(new TextEncoder().encode(JSON.stringify(p.doc)))).doc).toEqual(p.doc);
    await expect(readPackage(new Blob(['no es json']))).rejects.toThrow('Ese archivo no es un proyecto de glifos de GLYPHOS.');
    await expect(readPackage(new Blob([JSON.stringify({ kind: 'glyphos-glifos-paquete', v: 1 })]))).rejects.toThrow(/sólo la descripción/);
    await expect(readPackage(new Blob([JSON.stringify({ kind: 'otra' })]))).rejects.toThrow(/no es un proyecto de glifos/);
  });

  it('plans a merge without ever duplicating or overwriting a newer copy', () => {
    const here = [{ id: 'gl-a', rev: 5, updated: 100, name: 'Alfa' }, { id: 'gl-b', rev: 1, updated: 50, name: 'Beta' }];
    expect(planMerge(here, { id: 'gl-c', rev: 0, updated: 1, name: 'Gama' }).action).toBe('nuevo');
    expect(planMerge(here, { id: 'gl-a', rev: 5, updated: 100, name: 'Alfa' }).action).toBe('igual');
    expect(planMerge(here, { id: 'gl-a', rev: 6, updated: 200, name: 'Alfa' }).action).toBe('mas-nuevo');
    expect(planMerge(here, { id: 'gl-a', rev: 4, updated: 90, name: 'Alfa' }).action).toBe('mas-viejo');
    expect(planMerge(here, { id: 'gl-a', rev: 5, updated: 101, name: 'Alfa' }).action).toBe('divergente');
    expect(planMerge(here, { id: 'gl-c', rev: 0, updated: 1, name: 'Gama' }).message).toContain('«Gama»');
    expect(planMerge(here, { id: 'gl-a', rev: 4, updated: 90, name: 'Alfa' }).message).toMatch(/copia/);
    expect(planMerge(here, { id: 'gl-a', rev: 6, updated: 200, name: 'Alfa' }).message).toMatch(/reemplazar/);
    expect(planMerge(here, { id: 'gl-a', rev: 5, updated: 101, name: 'Alfa' }).message).toMatch(/copia/);
  });

  it('makes a copy with a new id, revision 0 and nothing published', async () => {
    const p = await sampleProject();
    const c = asCopy(p.doc, 'gl-nueva');
    expect(c).toMatchObject({ id: 'gl-nueva', name: 'Mi proyecto (copia)', rev: 0, published: [] });
    expect(c.glyphs).toEqual(p.doc.glyphs);
    expect(p.doc.published).toHaveLength(1);
    c.glyphs.A.contours[0].nodes[0].x = 99;
    expect(p.doc.glyphs.A.contours[0].nodes[0].x).toBe(0);
    const long = asCopy({ ...p.doc, name: 'x'.repeat(60) } as GlyphDoc, 'gl-x');
    expect(long.name.length).toBeLessThanOrEqual(60);
    expect(long.name.endsWith(' (copia)')).toBe(true);
    expect(normalizeDoc(long).doc.name).toBe(long.name);
  });

  it('names the file', () => {
    expect(packageFileName('Mi alfabeto: «ñ»/2')).toBe('Mi alfabeto «ñ» 2.glyphos-glifos');
    expect(packageFileName('  ')).toBe('glifos.glyphos-glifos');
  });
});
