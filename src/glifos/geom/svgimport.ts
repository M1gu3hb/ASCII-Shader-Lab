/**
 * Safe SVG import for a glyph: a small XML tokenizer of its own (no DOM, no parser that could fetch, expand or
 * run anything), a whitelist of shape elements and geometric attributes, hard limits, and placement in font
 * units. Works the same in the browser and in node.
 *
 * What is refused: any DOCTYPE or ENTITY declaration (entity-expansion attacks), more than 1 MB of text, more
 * than 5 000 elements, nesting deeper than 32 and more than 20 000 path nodes. What is ignored: every element
 * outside the whitelist together with its children (script, style, foreignObject, use, image, a, text, defs,
 * symbol, mask, clipPath, filter…) and every attribute outside the whitelist (href, on*, style…). Text,
 * comments, CDATA and processing instructions are skipped.
 */
import type { Contour, Pt } from '../doc';
import { bboxOf, normalizeOrientation, transformContours } from './ops';
import { IDENTITY, miles, multiply, parsePathData, parseTransform, type Matrix } from './svgpath';
import { flattenContour } from '../compile';
import { strokePolyline } from './stroke';

export const SVG_LIMITS = { bytes: 1024 * 1024, elements: 5000, depth: 32, nodes: 20_000 } as const;

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const CONTAINERS = new Set(['svg', 'g']);
const ATTRS = new Set(['d', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'x1', 'y1', 'x2', 'y2', 'transform', 'fill-rule', 'viewBox', 'fill', 'stroke', 'stroke-width', 'display', 'visibility']);
/** Sidebearings given to an imported drawing when no advance is asked for. */
const SIDE = 60;

export interface XmlTag { kind: 'open' | 'close' | 'self'; name: string; attrs: Record<string, string> }

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Attribute values: only the five XML entities and numeric references; anything else stays as written. */
function decode(v: string): string {
  return v.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

/**
 * Tokenizes XML into tags, keeping only whitelisted attributes. Throws a Spanish error on DOCTYPE/ENTITY,
 * malformed markup or limits.
 */
export function tokenizeXml(text: string): XmlTag[] {
  const out: XmlTag[] = [];
  const n = text.length;
  let i = 0, elements = 0;
  const bad = (what: string): never => { throw new Error(`El SVG está mal formado: ${what}.`); };
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) break;
    i = lt;
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end < 0) bad('un comentario sin cerrar');
      i = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      if (end < 0) bad('una sección CDATA sin cerrar');
      i = end + 3;
      continue;
    }
    if (text.startsWith('<!', i)) {
      if (/^<!\s*(doctype|entity)/i.test(text.slice(i, i + 20))) {
        throw new Error('Este SVG declara un DOCTYPE o entidades (<!DOCTYPE / <!ENTITY>). Por seguridad no se importa: guárdalo de nuevo sin esa declaración.');
      }
      bad('una declaración «<!» no admitida');
    }
    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end < 0) bad('una instrucción de proceso sin cerrar');
      i = end + 2;
      continue;
    }
    const close = text[i + 1] === '/';
    let j = i + (close ? 2 : 1);
    const nameM = /^[A-Za-z_][\w.:-]*/.exec(text.slice(j, j + 200));
    if (!nameM) bad(`un «<» suelto en la posición ${i}`);
    const rawName = nameM![0];
    const name = rawName.includes(':') ? rawName.slice(rawName.indexOf(':') + 1) : rawName;
    j += rawName.length;
    if (close) {
      const gt = text.indexOf('>', j);
      if (gt < 0 || text.slice(j, gt).trim()) bad(`la etiqueta de cierre de «${rawName}»`);
      out.push({ kind: 'close', name, attrs: {} });
      i = gt + 1;
      continue;
    }
    if (++elements > SVG_LIMITS.elements) throw new Error(`El SVG tiene más de ${miles(SVG_LIMITS.elements)} elementos.`);
    const attrs: Record<string, string> = {};
    let self = false;
    while (true) {
      while (j < n && /\s/.test(text[j])) j++;
      if (j >= n) bad(`la etiqueta «${rawName}» no se cierra`);
      if (text[j] === '>') { j++; break; }
      if (text[j] === '/' && text[j + 1] === '>') { self = true; j += 2; break; }
      const an = /^[^\s=/>"']+/.exec(text.slice(j, j + 200));
      if (!an) bad(`un atributo de «${rawName}»`);
      j += an![0].length;
      while (j < n && /\s/.test(text[j])) j++;
      if (text[j] !== '=') bad(`el atributo «${an![0]}» no tiene valor`);
      j++;
      while (j < n && /\s/.test(text[j])) j++;
      const q = text[j];
      if (q !== '"' && q !== "'") bad(`el valor de «${an![0]}» no está entre comillas`);
      const end = text.indexOf(q, j + 1);
      if (end < 0) bad(`el valor de «${an![0]}» no se cierra`);
      const key = an![0];
      if (ATTRS.has(key)) attrs[key] = decode(text.slice(j + 1, end));
      j = end + 1;
    }
    out.push({ kind: self ? 'self' : 'open', name, attrs });
    i = j;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

const num = (v: string | undefined, fb = 0): number => {
  if (v === undefined) return fb;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(px)?\s*$/.exec(v);
  return m ? Number(m[1]) : NaN;
};

const f = (v: number) => String(+v.toFixed(6));

/** Path data for a basic shape (in its own coordinates), or null when its numbers make no shape. */
function shapePath(name: string, a: Record<string, string>): { d: string; closed: boolean } | null {
  switch (name) {
    case 'path': return a.d ? { d: a.d, closed: false } : null;
    case 'rect': {
      const x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height);
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
      let rx = num(a.rx, NaN), ry = num(a.ry, NaN);
      if (!Number.isFinite(rx)) rx = Number.isFinite(ry) ? ry : 0;
      if (!Number.isFinite(ry)) ry = rx;
      rx = Math.max(0, Math.min(rx, w / 2));
      ry = Math.max(0, Math.min(ry, h / 2));
      if (!rx || !ry) return { d: `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`, closed: true };
      return {
        d: `M${f(x + rx)} ${f(y)}H${f(x + w - rx)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + w)} ${f(y + ry)}V${f(y + h - ry)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + w - rx)} ${f(y + h)}H${f(x + rx)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x)} ${f(y + h - ry)}V${f(y + ry)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + rx)} ${f(y)}Z`,
        closed: true,
      };
    }
    case 'circle': case 'ellipse': {
      const cx = num(a.cx), cy = num(a.cy);
      const rx = name === 'circle' ? num(a.r) : num(a.rx), ry = name === 'circle' ? num(a.r) : num(a.ry);
      if (![cx, cy, rx, ry].every(Number.isFinite) || rx <= 0 || ry <= 0) return null;
      return { d: `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`, closed: true };
    }
    case 'line': {
      const v = [num(a.x1), num(a.y1), num(a.x2), num(a.y2)];
      return v.every(Number.isFinite) ? { d: `M${v.map(f).join(' ')}`, closed: false } : null;
    }
    case 'polyline': case 'polygon': {
      const v = (a.points ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (v.length < 4 || v.some(x => !Number.isFinite(x))) return null;
      const pairs = v.length - (v.length % 2);
      return { d: 'M' + v.slice(0, pairs).map(f).join(' ') + (name === 'polygon' ? 'Z' : ''), closed: name === 'polygon' };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

interface Ctx { m: Matrix; skip: boolean; fill?: string; stroke?: string; sw?: string; rule?: string; vis?: string; name: string }

export interface SvgTarget { upm: number; asc: number; desc: number; height: number; baseline?: number; adv?: number }

/**
 * Imports an SVG drawing as glyph contours (font units, y up).
 *
 * Placement rule: when the root viewBox is exactly one em tall (its height equals `upm`) the drawing is read as
 * an em box: its top edge is the ascender (y' = asc − (y − viewBox.y)), x' = x − viewBox.x, the size is kept
 * and the advance is the viewBox width. Otherwise the drawing's bounding box is scaled (uniformly) to
 * `target.height` with its bottom on the baseline and `SIDE` (60) units on each side; the advance is its width
 * plus both sides. A given `adv` is kept and the drawing is centred in it.
 *
 * Orientation: every shape's contours are made counter-clockwise outside, clockwise in holes, read with that
 * shape's fill-rule (evenodd: by nesting; nonzero: by winding).
 */
export function importSvg(text: string, target: SvgTarget): { contours: Contour[]; adv: number; warnings: string[] } {
  if (text.length > SVG_LIMITS.bytes || (text.length * 3 > SVG_LIMITS.bytes && new TextEncoder().encode(text).length > SVG_LIMITS.bytes)) {
    throw new Error('El SVG pesa más de 1 MB: simplifícalo antes de importarlo.');
  }
  const tags = tokenizeXml(text);
  const warnings: string[] = [];
  const ignored = new Map<string, number>();
  const stack: Ctx[] = [];
  const shapes: Contour[][] = [];
  let nodes = 0, rootViewBox: number[] | null = null, sawRoot = false, defaultStroke = false;
  const budget = () => SVG_LIMITS.nodes - nodes;

  for (const t of tags) {
    if (t.kind === 'close') {
      const top = stack.pop();
      if (!top || top.name !== t.name) throw new Error(`El SVG está mal formado: la etiqueta «${t.name}» se cierra sin abrirse.`);
      continue;
    }
    const parent = stack[stack.length - 1];
    if (!sawRoot) {
      if (t.name !== 'svg') throw new Error('El archivo no es un SVG: su primera etiqueta no es <svg>.');
      sawRoot = true;
    }
    if (stack.length + 1 > SVG_LIMITS.depth) throw new Error(`El SVG anida más de ${SVG_LIMITS.depth} niveles de elementos.`);
    const a = t.attrs;
    const known = CONTAINERS.has(t.name) || SHAPES.has(t.name);
    const ctx: Ctx = {
      name: t.name,
      m: parent?.m ?? IDENTITY,
      skip: !!parent?.skip || !known || a.display === 'none',
      fill: a.fill ?? parent?.fill, stroke: a.stroke ?? parent?.stroke, sw: a['stroke-width'] ?? parent?.sw,
      rule: a['fill-rule'] ?? parent?.rule, vis: a.visibility ?? parent?.vis,
    };
    if (!known && !parent?.skip) ignored.set(t.name, (ignored.get(t.name) ?? 0) + 1);
    if (!ctx.skip) {
      if (a.transform) {
        try { ctx.m = multiply(ctx.m, parseTransform(a.transform)); }
        catch (e) { warnings.push((e as Error).message + ' Se ignoró ese elemento.'); ctx.skip = true; }
      }
      if (t.name === 'svg') {
        const vb = a.viewBox?.trim().split(/[\s,]+/).map(Number);
        const okVb = vb && vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0 ? vb : null;
        if (!parent) rootViewBox = okVb;
        else {
          // a nested viewport: placed at x, y and, with a viewBox and a size, scaled into it
          let m: Matrix = [1, 0, 0, 1, num(a.x) || 0, num(a.y) || 0];
          const w = num(a.width, NaN), h = num(a.height, NaN);
          if (okVb && Number.isFinite(w) && Number.isFinite(h)) m = multiply(m, [w / okVb[2], 0, 0, h / okVb[3], -okVb[0] * (w / okVb[2]), -okVb[1] * (h / okVb[3])]);
          ctx.m = multiply(ctx.m, m);
        }
      }
    }
    if (t.kind === 'open') stack.push(ctx);
    if (ctx.skip || !SHAPES.has(t.name) || ctx.vis === 'hidden' || ctx.vis === 'collapse') continue;

    const sp = shapePath(t.name, a);
    if (!sp) { warnings.push(`Se ignoró un <${t.name}> con medidas no válidas.`); continue; }
    let local: Contour[];
    try { local = parsePathData(sp.d, { commands: Math.max(1, budget()) }); }
    catch (e) { throw new Error((e as Error).message.replace('El trazo SVG', `El trazo de un <${t.name}>`)); }
    const filled = ctx.fill === undefined || !/^\s*(none|transparent)\s*$/i.test(ctx.fill);
    const stroked = ctx.stroke !== undefined && !/^\s*(none|transparent)\s*$/i.test(ctx.stroke);
    const out: Contour[] = [], outline: Contour[] = [];
    if (filled && t.name !== 'line' && t.name !== 'polyline') {
      // SVG fills open subpaths as if they were closed
      for (const c of local) if (c.nodes.length >= 2) out.push({ closed: true, nodes: c.nodes });
    } else if (filled && t.name === 'polyline') {
      for (const c of local) if (c.nodes.length >= 3) out.push({ closed: true, nodes: c.nodes });
    }
    if (stroked) {
      let w = num(ctx.sw, NaN);
      if (!Number.isFinite(w)) { w = 1; defaultStroke = true; }
      if (w > 0) for (const c of local) {
        const pts: Pt[] = flattenContour(c, 12);
        if (!c.closed && c.nodes.length >= 2 && pts.length >= 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-9) pts.pop();
        outline.push(...strokePolyline(pts, { width: w, closed: c.closed || sp.closed, cap: 'recto', join: 'inglete', tolerance: Math.max(0.01, w / 100) }));
      }
    }
    if (!out.length && !outline.length) continue;
    nodes += [...out, ...outline].reduce((s, c) => s + c.nodes.length, 0);
    if (nodes > SVG_LIMITS.nodes) throw new Error(`El SVG tiene más de ${miles(SVG_LIMITS.nodes)} nodos de trazo.`);
    // the fill is read with its own rule; stroke outlines come from a union, already oriented
    const rule = /evenodd/i.test(ctx.rule ?? '') ? 'evenodd' : 'nonzero';
    shapes.push(transformContours([...normalizeOrientation(out, rule), ...outline], ctx.m));
  }
  if (stack.length) throw new Error(`El SVG está mal formado: la etiqueta «${stack[stack.length - 1].name}» no se cierra.`);
  if (ignored.size) warnings.push('Se ignoraron elementos que no son formas: ' + [...ignored].map(([k, v]) => (v > 1 ? `${k} (${v})` : k)).join(', ') + '.');
  if (defaultStroke) warnings.push('Un contorno sin grosor (stroke-width) se convirtió con el grosor de 1 que usa SVG.');

  const all = shapes.flat();
  const box = bboxOf(all);
  if (!box || box.y1 - box.y0 <= 0 && box.x1 - box.x0 <= 0) {
    warnings.push('El SVG no tiene formas con relleno o contorno que se puedan importar.');
    return { contours: [], adv: target.adv ?? 0, warnings };
  }
  const base = target.baseline ?? 0;
  let m: Matrix, adv: number;
  if (rootViewBox && Math.abs(rootViewBox[3] - target.upm) < 0.5) {
    // an em box: keep the drawing's scale and position
    m = [1, 0, 0, -1, -rootViewBox[0], target.asc + rootViewBox[1]];
    adv = target.adv ?? Math.round(rootViewBox[2]);
    if (target.adv !== undefined) {
      const b = bboxOf(transformContours(all, m))!;
      m = multiply(translate((target.adv - (b.x1 - b.x0)) / 2 - b.x0, 0), m);
    }
  } else {
    const h = box.y1 - box.y0, w = box.x1 - box.x0;
    const s = h > 0 ? target.height / h : w > 0 ? target.height / w : 1;
    // y down → y up, bottom of the drawing on the baseline
    const width = w * s;
    adv = target.adv ?? Math.round(width + 2 * SIDE);
    const x0 = target.adv !== undefined ? (target.adv - width) / 2 : SIDE;
    m = [s, 0, 0, -s, x0 - box.x0 * s, base + box.y1 * s];
  }
  const contours = transformContours(all, m);
  return { contours, adv, warnings };
}

const translate = (dx: number, dy: number): Matrix => [1, 0, 0, 1, dx, dy];
