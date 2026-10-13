/**
 * OpenType font (.otf, CFF outlines: never a TrueType .ttf) from a compiled glyph set, written with opentype.js
 * (loaded on demand). The studio builds it with buildOtf, re-reads it with checkOtf and only offers a file that
 * passes.
 *
 * WHAT THE FILE CONTAINS
 *  - Glyph 0 «.notdef» (a hollow box), glyph 1 «space» (U+0020: the set's space advance, else upm·0.28), then
 *    one glyph per character of the set in code point order, named uniXXXX (uXXXXX outside the BMP), with its
 *    advance and its outline as CFF cubic curves. Quadratic segments become cubics; coordinates are rounded
 *    to whole font units and kept within ±16 000 (a CFF charstring number is 16 bits).
 *  - cmap format 4 and, when a character lies outside the BMP, format 12 (opentype.js writes it; checked).
 *  - head, hhea, maxp, hmtx, post; OS/2 v3 with the set's ascender/descender as typo metrics, win metrics that
 *    cover the tallest and deepest glyph, x-height, cap height and fsType 0 (installable: it is the person's).
 *  - name: family, style, full name, an ASCII PostScript name, designer, copyright, license, version and a
 *    description. CFF's own name strings get the ASCII form of the same names.
 *  - Kerning: opentype.js 1.3.4 writes neither 'kern' nor 'GPOS' (its src/tables/sfnt.js only emits head,
 *    hhea, maxp, OS/2, name, cmap, post, CFF, hmtx and optionally ltag, GSUB, meta), so the set's pairs go
 *    into a legacy 'kern' table (version 0, one format 0 subtable, horizontal) inserted afterwards by
 *    injectKernTable. A format 0 subtable holds at most 10 920 pairs (its length is 16 bits): beyond that the
 *    strongest pairs are kept. Browsers, macOS, Windows (DirectWrite) and most apps read a 'kern' table in a
 *    CFF font; some layout engines only apply GPOS kerning and will ignore it.
 *
 * WHAT IT DOES NOT CONTAIN
 *  - Glyphs that are only a picture (bitmap): a font keeps outlines. They are left out and reported by
 *    otfSkipped; a glyph with an outline and a picture keeps its outline only.
 *  - GPOS (class kerning, mark positioning) and GSUB (ligatures, composed accents: accented letters go in as
 *    their own resolved outline), hinting, variable axes, vertical metrics, color glyphs.
 */
import { setChars, type GlyphSet } from '../../glyphset/set';
import { cpLabel } from '../doc';
import { loadOpentype, loadedOpentype, nameOf, type OFont, type OGlyph, type OpenTypeLib } from './ot';
import { parsePath, pathBounds, type Box, type PathCmd } from './path';

/** Largest number of pairs a format 0 'kern' subtable can hold: its length field is 16 bits (14 + 6·n). */
export const KERN_MAX_PAIRS = Math.floor((0xffff - 14) / 6);
/** Coordinates beyond this do not fit a CFF charstring's 16-bit deltas. */
const COORD_MAX = 16_000;

export interface OtfSkip {
  ch: string;
  why: string;
  /** The glyph goes in, without part of it (its picture). */
  partial?: true;
}

interface OtfPlan {
  /** Characters that get a glyph after .notdef and space, in glyph order (index = position + 2). */
  chars: string[];
  cmds: Map<string, PathCmd[]>;
  adv: Map<string, number>;
  space: number;
  kern: Array<[string, string, number]>;
  skipped: OtfSkip[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const advOf = (a: number) => clamp(Math.round(a), 0, 0xffff);

function planOtf(set: GlyphSet): OtfPlan {
  const chars: string[] = [];
  const cmds = new Map<string, PathCmd[]>();
  const adv = new Map<string, number>();
  const skipped: OtfSkip[] = [];
  for (const ch of setChars(set)) {
    if (ch === ' ') continue;
    const s = set.glyphs[ch];
    let c: PathCmd[] = [];
    if (s.d) {
      try { c = parsePath(s.d); } catch { skipped.push({ ch, why: 'su trazo no se pudo leer' }); continue; }
    } else if (s.b) {
      skipped.push({ ch, why: 'es una imagen (mapa de bits): una fuente .otf sólo guarda contornos. Vectorízala para incluirla' });
      continue;
    }
    if (s.d && s.b) skipped.push({ ch, why: 'su parte de imagen no entra en la fuente: sólo va su contorno', partial: true });
    chars.push(ch);
    cmds.set(ch, c);
    adv.set(ch, advOf(s.a));
  }
  const inFont = new Set([' ', ...chars]);
  let kern: Array<[string, string, number]> = [];
  for (const [pair, v] of Object.entries(set.kern ?? {})) {
    const [a, b] = Array.from(pair);
    const val = clamp(Math.round(v), -32768, 32767);
    if (inFont.has(a) && inFont.has(b) && val) kern.push([a, b, val]);
  }
  // the 'kern' table's limit: keep the pairs that matter most
  if (kern.length > KERN_MAX_PAIRS) kern = kern.sort((p, q) => Math.abs(q[2]) - Math.abs(p[2])).slice(0, KERN_MAX_PAIRS);
  return { chars, cmds, adv, space: advOf(set.glyphs[' ']?.a ?? set.upm * 0.28), kern, skipped };
}

/** The set's characters that do not go into the font (or go in without their picture), and why, in Spanish. */
export function otfSkipped(set: GlyphSet): OtfSkip[] {
  return planOtf(set).skipped;
}

/** AGL names: uniXXXX inside the BMP, uXXXXX outside it. */
function glyphName(ch: string): string {
  const cp = ch.codePointAt(0)!;
  return cp > 0xffff ? 'u' + cp.toString(16).toUpperCase() : 'uni' + cp.toString(16).toUpperCase().padStart(4, '0');
}

const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').trim();

/** PostScript name: ASCII letters and digits, «Family-Style», at most 63 characters. */
function postScriptName(family: string, style: string): string {
  const part = (s: string, fb: string) => ascii(s).replace(/[^A-Za-z0-9]/g, '') || fb;
  return `${part(family, 'Glifos')}-${part(style, 'Regular')}`.slice(0, 63);
}

/** A file name for the font: ASCII, no spaces, ending in .otf. */
export function otfFileName(name: string): string {
  const base = ascii(name).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return (base || 'glifos') + '.otf';
}

/** opentype.js logs «Adding CMAP format 12» for every font with a character outside the BMP. */
function quiet<T>(fn: () => T): T {
  const log = console.log;
  console.log = () => undefined;
  try { return fn(); } finally { console.log = log; }
}

function pathFor(ot: OpenTypeLib, cmds: PathCmd[]) {
  const p = new ot.Path();
  const r = (v: number) => clamp(Math.round(v), -COORD_MAX, COORD_MAX);
  for (const c of cmds) {
    if (c.t === 'M') p.moveTo(r(c.x), r(c.y));
    else if (c.t === 'L') p.lineTo(r(c.x), r(c.y));
    else if (c.t === 'Q') p.quadTo(r(c.x1), r(c.y1), r(c.x), r(c.y));
    else if (c.t === 'C') p.curveTo(r(c.x1), r(c.y1), r(c.x2), r(c.y2), r(c.x), r(c.y));
    else p.close();
  }
  return p;
}

/** A hollow box: what a renderer shows for a character the font does not have. */
function notdefPath(ot: OpenTypeLib, w: number, h: number, t: number) {
  const p = new ot.Path();
  const x0 = Math.round(w * 0.1), x1 = Math.round(w * 0.9);
  // outer counter-clockwise, inner clockwise: the inner one cuts the hole under the non-zero rule
  p.moveTo(x0, 0); p.lineTo(x1, 0); p.lineTo(x1, h); p.lineTo(x0, h); p.close();
  p.moveTo(x0 + t, t); p.lineTo(x0 + t, h - t); p.lineTo(x1 - t, h - t); p.lineTo(x1 - t, t); p.close();
  return p;
}

export async function buildOtf(set: GlyphSet, o: { family: string; style?: string; license?: { author?: string; copyright?: string; license?: string }; version?: string }): Promise<ArrayBuffer> {
  const ot = await loadOpentype();
  const plan = planOtf(set);
  const upm = set.upm;
  const asc = Math.round(set.asc), desc = Math.round(set.desc);
  if (asc <= 0 || desc > 0) throw new Error('Las métricas del juego no caben en una fuente: el ascendente debe ser positivo y el descendente cero o negativo.');

  const glyphs: OGlyph[] = [];
  const nw = Math.round(upm * 0.5);
  glyphs.push(new ot.Glyph({ name: '.notdef', advanceWidth: nw, path: notdefPath(ot, nw, Math.round(Math.max(set.cap, upm * 0.5)), Math.max(1, Math.round(upm * 0.05))) }));
  const space = new ot.Glyph({ name: 'space', unicode: 32, advanceWidth: plan.space, path: new ot.Path() });
  space.leftSideBearing = 0;
  glyphs.push(space);
  let yMax = asc, yMin = desc, lo = 0xffff, hi = 0x20;
  for (const ch of plan.chars) {
    const cmds = plan.cmds.get(ch)!;
    const g = new ot.Glyph({ name: glyphName(ch), unicode: ch.codePointAt(0)!, advanceWidth: plan.adv.get(ch)!, path: pathFor(ot, cmds) });
    const b = pathBounds(cmds);
    // hmtx's left side bearing of a CFF glyph is its xMin (opentype.js leaves it undefined)
    g.leftSideBearing = b ? Math.round(b.x0) : 0;
    if (b) { yMax = Math.max(yMax, Math.ceil(b.y1)); yMin = Math.min(yMin, Math.floor(b.y0)); }
    const cp = ch.codePointAt(0)!;
    lo = Math.min(lo, cp); hi = Math.max(hi, cp);
    glyphs.push(g);
  }
  lo = Math.min(lo, 0x20);

  const family = o.family.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) || 'Sin nombre';
  const style = (o.style ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) || 'Regular';
  const bold = /bold|negrita/i.test(style), italic = /italic|cursiva|it[aá]lica|oblique|oblicua/i.test(style);
  const ver = (o.version ?? '').trim() || '1.000';
  const lic = o.license ?? {};
  const ps = postScriptName(family, style);
  const font = new ot.Font({
    familyName: family,
    styleName: style,
    fullName: `${family} ${style}`,
    postScriptName: ps,
    designer: lic.author?.trim() || undefined,
    copyright: lic.copyright?.trim() || undefined,
    license: lic.license?.trim() || undefined,
    version: /^version /i.test(ver) ? ver : `Version ${ver}`,
    description: 'Fuente hecha en «Crea tus GLYPHOS».',
    unitsPerEm: upm,
    ascender: asc,
    descender: desc,
    glyphs,
    tables: {
      os2: {
        usWeightClass: bold ? 700 : 400,
        fsSelection: (bold ? 32 : 0) | (italic ? 1 : 0) || 64,
        fsType: 0,
        sTypoAscender: asc,
        sTypoDescender: desc,
        sTypoLineGap: 0,
        usWinAscent: clamp(yMax, 0, 0xffff),
        usWinDescent: clamp(-yMin, 0, 0xffff),
        sxHeight: Math.round(set.xh),
        sCapHeight: Math.round(set.cap),
        // 16-bit fields: a character outside the BMP is written as 0xFFFF, as the spec asks
        usFirstCharIndex: Math.min(lo, 0xffff),
        usLastCharIndex: Math.min(hi, 0xffff),
      },
    },
  });
  font.names.uniqueID = { en: `${ps};${/^version /i.test(ver) ? ver.slice(8) : ver}` };
  // CFF's own name strings are ASCII: only they read getEnglishName now (every name record is already set)
  const english = font.getEnglishName.bind(font);
  font.getEnglishName = (n: string) => { const v = english(n); return v === undefined ? v : ascii(v) || ps; };
  const raw = quiet(() => font.toArrayBuffer());

  if (!plan.kern.length) return raw;
  const index = new Map<string, number>([[' ', 1]]);
  plan.chars.forEach((c, i) => index.set(c, i + 2));
  return injectKernTable(raw, plan.kern.map(([a, b, v]) => [index.get(a)!, index.get(b)!, v]));
}

/* ------------------------------------------------------------------ */
/* sfnt                                                                */
/* ------------------------------------------------------------------ */

interface SfntTable { tag: string; data: Uint8Array }

function floorLog2(n: number): number {
  let e = 0;
  while (2 ** (e + 1) <= n) e++;
  return e;
}

/** Sum of big-endian uint32 words, the last one zero-padded, modulo 2³². */
function checksum(b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < b.length; i += 4) s = (s + (((b[i] << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0)) >>> 0;
  return s;
}

function readSfnt(buf: ArrayBuffer): { version: number; tables: SfntTable[]; records: Array<{ tag: string; sum: number; off: number; len: number }> } {
  const dv = new DataView(buf);
  if (buf.byteLength < 12) throw new Error('La fuente está incompleta.');
  const version = dv.getUint32(0);
  if (version !== 0x4f54544f && version !== 0x00010000 && version !== 0x74727565) throw new Error('No es una fuente OpenType.');
  const n = dv.getUint16(4);
  if (n === 0 || n > 64 || 12 + 16 * n > buf.byteLength) throw new Error('La tabla de tablas de la fuente está dañada.');
  const tables: SfntTable[] = [];
  const records: Array<{ tag: string; sum: number; off: number; len: number }> = [];
  for (let i = 0; i < n; i++) {
    const r = 12 + 16 * i;
    const tag = String.fromCharCode(dv.getUint8(r), dv.getUint8(r + 1), dv.getUint8(r + 2), dv.getUint8(r + 3));
    const sum = dv.getUint32(r + 4), off = dv.getUint32(r + 8), len = dv.getUint32(r + 12);
    if (off + len > buf.byteLength) throw new Error(`La tabla «${tag}» de la fuente está fuera del archivo.`);
    tables.push({ tag, data: new Uint8Array(buf.slice(off, off + len)) });
    records.push({ tag, sum, off, len });
  }
  return { version, tables, records };
}

/** Writes an sfnt: sorted directory, 4-byte aligned tables, per-table checksums and head.checkSumAdjustment. */
function writeSfnt(version: number, list: SfntTable[]): ArrayBuffer {
  const tables = [...list].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const n = tables.length;
  const e = floorLog2(n), range = 16 * 2 ** e;
  let off = 12 + 16 * n;
  const offsets: number[] = [];
  for (const t of tables) { offsets.push(off); off += (t.data.length + 3) & ~3; }
  const out = new Uint8Array(off);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, version);
  dv.setUint16(4, n);
  dv.setUint16(6, range);
  dv.setUint16(8, e);
  dv.setUint16(10, n * 16 - range);
  let head = -1;
  tables.forEach((t, i) => {
    const data = t.data.slice();
    if (t.tag === 'head') {
      if (data.length < 12) throw new Error('La tabla «head» de la fuente está dañada.');
      data.fill(0, 8, 12); // checkSumAdjustment counts as 0 in its own table's checksum and in the file's
      head = offsets[i];
    }
    out.set(data, offsets[i]);
    const r = 12 + 16 * i;
    for (let k = 0; k < 4; k++) out[r + k] = t.tag.charCodeAt(k);
    dv.setUint32(r + 4, checksum(data));
    dv.setUint32(r + 8, offsets[i]);
    dv.setUint32(r + 12, data.length);
  });
  if (head < 0) throw new Error('La fuente no tiene tabla «head».');
  dv.setUint32(head + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out.buffer;
}

/** A legacy 'kern' table: version 0, one horizontal format 0 subtable, pairs sorted by (left << 16 | right). */
function kernTableBytes(pairs: Array<[number, number, number]>): Uint8Array {
  const byKey = new Map<number, number>();
  for (const [l, r, v] of pairs) {
    if (!Number.isInteger(l) || !Number.isInteger(r) || l < 0 || r < 0 || l > 0xffff || r > 0xffff) throw new Error('Un par de interletraje apunta a un glifo que no existe.');
    const val = clamp(Math.round(v), -32768, 32767);
    if (val) byKey.set(l * 0x10000 + r, val);
    else byKey.delete(l * 0x10000 + r);
  }
  const keys = [...byKey.keys()].sort((a, b) => a - b);
  const n = keys.length;
  if (n > KERN_MAX_PAIRS) throw new Error(`Una tabla de interletraje admite como máximo ${KERN_MAX_PAIRS} pares.`);
  const sub = 14 + 6 * n;
  const out = new Uint8Array(4 + sub);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0); // table version
  dv.setUint16(2, 1); // one subtable
  dv.setUint16(4, 0); // subtable version
  dv.setUint16(6, sub);
  dv.setUint16(8, 0x0001); // coverage: horizontal, kerning values, format 0
  dv.setUint16(10, n);
  const e = n ? floorLog2(n) : 0, range = n ? 6 * 2 ** e : 0;
  dv.setUint16(12, range);
  dv.setUint16(14, e);
  dv.setUint16(16, n * 6 - range);
  keys.forEach((k, i) => {
    const o = 18 + 6 * i;
    dv.setUint16(o, Math.floor(k / 0x10000));
    dv.setUint16(o + 2, k % 0x10000);
    dv.setInt16(o + 4, byKey.get(k)!);
  });
  return out;
}

/**
 * Inserts (or replaces) a legacy 'kern' table in an sfnt font. `pairs`: [left glyph index, right glyph index,
 * value in font units]. The table directory, padding, checksums and head.checkSumAdjustment are rebuilt.
 */
export function injectKernTable(otf: ArrayBuffer, pairs: Array<[number, number, number]>): ArrayBuffer {
  const { version, tables } = readSfnt(otf);
  const kern = kernTableBytes(pairs);
  const others = tables.filter(t => t.tag !== 'kern');
  // no pairs: no table (an empty one would only cost bytes)
  if (kern.length === 18) return others.length === tables.length ? otf : writeSfnt(version, others);
  return writeSfnt(version, [...others, { tag: 'kern', data: kern }]);
}

/* ------------------------------------------------------------------ */
/* Check                                                               */
/* ------------------------------------------------------------------ */

const near = (a: Box, b: { x1: number; y1: number; x2: number; y2: number }, tol: number) =>
  Math.abs(a.x0 - b.x1) <= tol && Math.abs(a.y0 - b.y1) <= tol && Math.abs(a.x1 - b.x2) <= tol && Math.abs(a.y1 - b.y2) <= tol;

/**
 * Re-reads a built font with opentype.js and compares it with the set: .notdef first, the space, every
 * character's cmap entry, advance and outline bounds (within one unit), the metrics and every kerning pair;
 * also the file's checksums. Synchronous: opentype.js is loaded by buildOtf (or loadOtfTools) first.
 */
export function checkOtf(buf: ArrayBuffer, set: GlyphSet): { ok: boolean; problems: string[]; glyphs: number } {
  const problems: string[] = [];
  const ot = loadedOpentype();
  if (!ot) return { ok: false, problems: ['El verificador de fuentes no está cargado: genera la fuente antes de revisarla.'], glyphs: 0 };
  const sig = String.fromCharCode(...new Uint8Array(buf, 0, Math.min(4, buf.byteLength)));
  if (sig !== 'OTTO') problems.push('El archivo no empieza como una fuente OpenType con contornos CFF («OTTO»).');
  try {
    const { records } = readSfnt(buf);
    const bytes = new Uint8Array(buf);
    for (const r of records) {
      const data = bytes.slice(r.off, r.off + r.len);
      if (r.tag === 'head') data.fill(0, 8, 12);
      if (checksum(data) !== r.sum) problems.push(`La suma de verificación de la tabla «${r.tag}» no coincide.`);
    }
    if (checksum(bytes) !== 0xb1b0afba) problems.push('La suma de verificación del archivo (head.checkSumAdjustment) no coincide.');
  } catch (e) {
    problems.push((e as Error).message);
  }
  let font: OFont;
  try { font = ot.parse(buf); } catch (e) {
    problems.push('La fuente no se pudo volver a leer: ' + ((e as Error).message || 'error desconocido') + '.');
    return { ok: false, problems, glyphs: 0 };
  }
  const plan = planOtf(set);
  const n = font.glyphs.length;
  if (n !== plan.chars.length + 2) problems.push(`La fuente tiene ${n} glifos; se esperaban ${plan.chars.length + 2}.`);
  const g0 = font.glyphs.get(0);
  if (!g0 || g0.name !== '.notdef') problems.push('El glifo 0 no es «.notdef».');
  else if (!g0.path.commands.length) problems.push('«.notdef» está vacío: debe ser una caja visible.');
  if (font.unitsPerEm !== set.upm) problems.push(`Unidades por eme: ${font.unitsPerEm} en la fuente, ${set.upm} en el juego.`);
  if (font.ascender !== Math.round(set.asc)) problems.push(`Ascendente: ${font.ascender} en la fuente, ${Math.round(set.asc)} en el juego.`);
  if (font.descender !== Math.round(set.desc)) problems.push(`Descendente: ${font.descender} en la fuente, ${Math.round(set.desc)} en el juego.`);
  if (!nameOf(font, 'fontFamily') || !nameOf(font, 'postScriptName')) problems.push('Faltan el nombre de la familia o el nombre PostScript.');
  const si = font.charToGlyphIndex(' ') ?? 0;
  if (!si) problems.push('Falta el espacio (U+0020).');
  else if (font.glyphs.get(si)?.advanceWidth !== plan.space) problems.push(`El espacio avanza ${font.glyphs.get(si)?.advanceWidth}; se esperaba ${plan.space}.`);
  for (const ch of plan.chars) {
    const label = `«${ch}» (${cpLabel(ch)})`;
    const idx = font.charToGlyphIndex(ch) ?? 0;
    const g = idx ? font.glyphs.get(idx) : undefined;
    if (!g) { problems.push(`${label} no está en el mapa de caracteres (cmap).`); continue; }
    if (g.advanceWidth !== plan.adv.get(ch)) problems.push(`${label} avanza ${g.advanceWidth}; se esperaba ${plan.adv.get(ch)}.`);
    const want = pathBounds(plan.cmds.get(ch)!);
    if (!want) continue;
    if (!g.path.commands.length) { problems.push(`${label} quedó sin contorno.`); continue; }
    const got = g.path.getBoundingBox();
    if (got.isEmpty() || !near(want, got, 1)) problems.push(`El contorno de ${label} no coincide con el del juego.`);
  }
  for (const [a, b, v] of plan.kern) {
    const got = font.getKerningValue(font.charToGlyphIndex(a) ?? 0, font.charToGlyphIndex(b) ?? 0);
    if (got !== v) problems.push(`El interletraje de «${a}${b}» es ${got} en la fuente; se esperaba ${v}.`);
  }
  const shown = problems.length > 40 ? [...problems.slice(0, 40), `… y ${problems.length - 40} problemas más.`] : problems;
  return { ok: !problems.length, problems: shown, glyphs: n };
}

/** Loads opentype.js, for a checkOtf of a font that was not built in this page. */
export async function loadOtfTools(): Promise<void> {
  await loadOpentype();
}
