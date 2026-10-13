/**
 * Glyphs from the person's own font file (TTF, OTF or WOFF; opentype.js does not read WOFF2), to start a
 * document from them or to fill characters in. A font's OS/2 fsType says what its license allows: a font
 * with «restricted license embedding» is refused; anything else is explained, and the person is always told
 * that the font must be theirs or licensed for modification. GLYPHOS cannot verify a license beyond those flags.
 *
 * Outlines become the document's contours: TrueType quadratics turn into cubics (exact), CFF cubics stay as
 * they are, scaled from the font's units per em to the document's, y up as in the font.
 */
import { drawableCodePoint, keyCodePoint } from '../glyphset/set';
import { DOC_LIMITS, type Contour, type Glyph, type GlyphDoc, type PathNode, type Pt } from './doc';
import { loadOpentype, nameOf, type OCmd, type OFont } from './export/ot';

export interface FontInfo {
  family: string;
  style: string;
  upm: number;
  asc: number;
  desc: number;
  xh?: number;
  cap?: number;
  /** Glyphs in the file. */
  glyphs: number;
  /** Characters it maps, in code point order (at most 2000 listed). */
  chars: string[];
  /** How many characters it maps in all. */
  charCount: number;
  copyright?: string;
  license?: string;
  licenseUrl?: string;
  /** OS/2 fsType: the embedding permissions its license declares. */
  fsType: number;
  /** Restricted license embedding: its glyphs are not imported. */
  restricted: boolean;
  /** Installable or editable embedding: its license lets documents edit with it. */
  editable: boolean;
  /** What the flags mean, and the person's responsibility, in Spanish. */
  note: string;
}

const MAX_FONT = 64 * 1024 * 1024;
const LISTED = 2000;

export const FONT_LICENSE_NOTE = 'Importa glifos sólo de una fuente que sea tuya o cuya licencia permita modificarla (por ejemplo, la SIL Open Font License). GLYPHOS no verifica licencias más allá de los permisos que declara la propia fuente.';

async function parseFont(buf: ArrayBuffer): Promise<OFont> {
  const sig = buf.byteLength >= 4 ? String.fromCharCode(...new Uint8Array(buf, 0, 4)) : '';
  if (sig === 'wOF2') throw new Error('Las fuentes WOFF2 no se pueden leer aquí: conviértela a TTF, OTF o WOFF y vuelve a intentarlo.');
  if (sig === 'ttcf') throw new Error('Las colecciones de fuentes (.ttc) no se pueden leer aquí: usa la fuente que quieras como archivo TTF u OTF.');
  if (buf.byteLength > MAX_FONT) throw new Error('El archivo de fuente es demasiado grande (más de 64 MB).');
  const ot = await loadOpentype();
  try { return ot.parse(buf); } catch { throw new Error('Ese archivo no es una fuente que se pueda leer (TTF, OTF o WOFF), o está dañado.'); }
}

/** What fsType allows (the usage bits 0–3 and the flags 8 and 9 of the OpenType spec). */
function permissions(fsType: number): { restricted: boolean; editable: boolean; note: string } {
  const restricted = (fsType & 0x0002) !== 0;
  const usage = fsType & 0x000f;
  const editable = !restricted && (usage === 0 || (fsType & 0x0008) !== 0) && (fsType & 0x0300) === 0;
  const parts: string[] = [];
  if (restricted) parts.push('La licencia de esta fuente prohíbe incrustarla y modificarla (su permiso de incrustación es «restringido»): sus glifos no se importan.');
  else if (fsType === 0) parts.push('La fuente se declara instalable, sin restricciones de incrustación.');
  else if (fsType & 0x0008) parts.push('La fuente permite incrustarla en documentos que se editan (permiso «editable»).');
  else if (fsType & 0x0004) parts.push('La fuente sólo permite incrustarla para ver e imprimir (permiso «vista previa e impresión»), no para editar: su licencia probablemente no permite modificarla.');
  else parts.push('La fuente se declara instalable.');
  if (!restricted && fsType & 0x0100) parts.push('Además pide no separar sus glifos en subconjuntos, y eso es lo que hace importarlos.');
  if (!restricted && fsType & 0x0200) parts.push('Además sólo permite incrustar sus mapas de bits, no sus contornos.');
  parts.push(FONT_LICENSE_NOTE);
  return { restricted, editable, note: parts.join(' ') };
}

function infoOf(font: OFont): FontInfo {
  const os2 = font.tables.os2 ?? {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const fsType = num(os2.fsType) ?? 0;
  const map = (font.tables.cmap?.glyphIndexMap ?? {}) as Record<string, number>;
  const cps = Object.keys(map).map(Number).filter(cp => map[cp] > 0 && drawableCodePoint(cp)).sort((a, b) => a - b);
  const xh = num(os2.sxHeight), cap = num(os2.sCapHeight);
  const copyright = nameOf(font, 'copyright'), license = nameOf(font, 'license'), licenseUrl = nameOf(font, 'licenseURL');
  return {
    family: nameOf(font, 'preferredFamily') ?? nameOf(font, 'fontFamily') ?? 'Sin nombre',
    style: nameOf(font, 'preferredSubfamily') ?? nameOf(font, 'fontSubfamily') ?? 'Regular',
    upm: font.unitsPerEm, asc: font.ascender, desc: font.descender,
    ...(xh ? { xh } : {}), ...(cap ? { cap } : {}),
    glyphs: font.numGlyphs ?? font.glyphs.length,
    chars: cps.slice(0, LISTED).map(cp => String.fromCodePoint(cp)),
    charCount: cps.length,
    ...(copyright ? { copyright } : {}), ...(license ? { license } : {}), ...(licenseUrl ? { licenseUrl } : {}),
    fsType,
    ...permissions(fsType),
  };
}

/** Reads a font file's names, metrics, characters and license flags. Throws a readable error when it cannot. */
export async function readFontFile(buf: ArrayBuffer): Promise<FontInfo> {
  return infoOf(await parseFont(buf));
}

/* ------------------------------------------------------------------ */
/* Outlines                                                            */
/* ------------------------------------------------------------------ */

const r1 = (v: number) => Math.round(v * 10) / 10;
const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
const roundPt = (p: Pt): Pt => ({ x: r1(p.x), y: r1(p.y) });

/** A node is smooth when its two handles lie on one line through it, on opposite sides (within ~1°). */
function markSmooth(n: PathNode) {
  if (!n.hi || !n.ho) return;
  const ax = n.hi.x - n.x, ay = n.hi.y - n.y, bx = n.ho.x - n.x, by = n.ho.y - n.y;
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < 1e-9 || lb < 1e-9) return;
  if (Math.abs(ax * by - ay * bx) <= 0.02 * la * lb && ax * bx + ay * by < 0) n.smooth = true;
}

/**
 * A glyph's path commands (font units, y up) as closed contours of absolute nodes and handles, scaled by `k`
 * and moved by `dx`. Quadratic segments become the equivalent cubic (handles at 2/3 towards the control
 * point). Null when the glyph exceeds the document's limits.
 */
export function commandsToContours(cmds: OCmd[], k = 1, dx = 0): Contour[] | null {
  const out: Contour[] = [];
  let cur: PathNode[] = [];
  let nodes = 0;
  const P = (x?: number, y?: number): Pt => ({ x: (x ?? 0) * k + dx, y: (y ?? 0) * k });
  const finish = () => {
    if (cur.length > 1) {
      const a = cur[0], z = cur[cur.length - 1];
      // the path comes back to its start: that last node is the first one (its incoming handle included)
      if (same(a, z)) { if (z.hi) a.hi = z.hi; cur.pop(); }
    }
    if (cur.length) {
      const ns = cur.map(n => {
        const o: PathNode = { ...roundPt(n) };
        if (n.hi) o.hi = roundPt(n.hi);
        if (n.ho) o.ho = roundPt(n.ho);
        markSmooth(o);
        return o;
      });
      // font outlines are always closed (CFF closes them implicitly)
      out.push({ closed: true, nodes: ns });
      nodes += ns.length;
    }
    cur = [];
  };
  for (const c of cmds) {
    const last = cur[cur.length - 1];
    if (c.type === 'M') { finish(); cur = [P(c.x, c.y)]; }
    else if (!last) continue;
    else if (c.type === 'L') { const p = P(c.x, c.y); if (!same(p, last)) cur.push(p); } // a zero-length line adds no node
    else if (c.type === 'Q') {
      const q = P(c.x1, c.y1), end: PathNode = P(c.x, c.y);
      last.ho = { x: last.x + (2 / 3) * (q.x - last.x), y: last.y + (2 / 3) * (q.y - last.y) };
      end.hi = { x: end.x + (2 / 3) * (q.x - end.x), y: end.y + (2 / 3) * (q.y - end.y) };
      cur.push(end);
    } else if (c.type === 'C') {
      const end: PathNode = P(c.x, c.y);
      last.ho = P(c.x1, c.y1);
      end.hi = P(c.x2, c.y2);
      cur.push(end);
    } else if (c.type === 'Z') finish();
    if (out.length > DOC_LIMITS.contours || nodes + cur.length > DOC_LIMITS.nodes) return null;
  }
  finish();
  return out.length > DOC_LIMITS.contours || nodes > DOC_LIMITS.nodes ? null : out;
}

/**
 * The glyphs of `chars` from a font file, ready for `doc`: scaled to its units per em, advance included (an
 * ASCII document centres each glyph in its cell). `missing`: characters the font does not have (or whose
 * outline exceeds the document's limits). Refuses a font whose license restricts embedding.
 */
export async function importFontGlyphs(buf: ArrayBuffer, chars: string[], doc: GlyphDoc): Promise<{ glyphs: Record<string, Glyph>; missing: string[] }> {
  const font = await parseFont(buf);
  const info = infoOf(font);
  if (info.restricted) throw new Error(info.note);
  const k = doc.metrics.upm / font.unitsPerEm;
  const ascii = doc.mode === 'ascii';
  const glyphs: Record<string, Glyph> = {};
  const missing: string[] = [];
  const wanted: string[] = [];
  for (const c of chars.flatMap(s => Array.from(s))) if (keyCodePoint(c) >= 0 && !wanted.includes(c)) wanted.push(c);
  for (const ch of wanted) {
    const idx = font.charToGlyphIndex(ch) ?? 0;
    const g = idx > 0 ? font.glyphs.get(idx) : undefined;
    if (!g) { missing.push(ch); continue; }
    const adv = Math.max(0, Math.round((g.advanceWidth ?? 0) * k));
    const contours = commandsToContours(g.path.commands, k, ascii ? (doc.metrics.cell - adv) / 2 : 0);
    if (!contours) { missing.push(ch); continue; }
    glyphs[ch] = { ch, status: 'dibujado', contours, components: [], anchors: [], adv: ascii ? doc.metrics.cell : adv, origin: 'fuente' };
  }
  return { glyphs, missing };
}
