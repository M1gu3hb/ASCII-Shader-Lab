/**
 * SVG path data → contours of the glyph document, and SVG transform lists → affine matrices.
 *
 * The whole path grammar is read (M L H V C S Q T A Z, absolute and relative, implicit repeats, compact numbers
 * such as `.5.5`, `-1-2` or `1e-3`, compact arc flags). Quadratics become exact cubics and arcs become cubics
 * of at most 90° each, so every contour uses the document's single curve kind. Coordinates are returned as they
 * came (no y flip): placing them is the caller's job (svgimport.ts). Pure: no DOM.
 */
import type { Contour, PathNode, Pt } from '../doc';

/** Affine matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f (SVG order). */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m ∘ n: the matrix that applies n first, then m (as SVG composes `transform="m n"`). */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const applyMatrix = (m: Matrix, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

/** Thousands with a space, as the studio writes them («20 000»). */
export const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* ------------------------------------------------------------------ */
/* Path data                                                           */
/* ------------------------------------------------------------------ */

export const PATH_LIMITS = { commands: 20_000 } as const;

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const SEPARATOR = /[\s,]/;
const EPS = 1e-9;

const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7;

/** One elliptical arc (SVG endpoint form) as cubics of at most 90°: [c1, c2, end] each. */
export function arcToCubics(p0: Pt, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p1: Pt): Array<[Pt, Pt, Pt]> {
  if (same(p0, p1)) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < EPS || ry < EPS) return [[p0, p1, p1]];
  const phi = (phiDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx2 = (p0.x - p1.x) / 2, dy2 = (p0.y - p1.y) / 2;
  const x1p = cos * dx2 + sin * dy2, y1p = -sin * dx2 + cos * dy2;
  // radii too small to reach the end point grow just enough (SVG implementation notes F.6.6)
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { const k = Math.sqrt(lambda); rx *= k; ry *= k; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry, cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (p0.x + p1.x) / 2, cy = sin * cxp + cos * cyp + (p0.y + p1.y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (x1p - cxp) / rx, uy = (y1p - cyp) / ry, vx = (-x1p - cxp) / rx, vy = (-y1p - cyp) / ry;
  const t1 = ang(1, 0, ux, uy);
  let dt = ang(ux, uy, vx, vy);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const d = dt / n, k = (4 / 3) * Math.tan(d / 4);
  const map = (u: number, v: number): Pt => ({ x: cx + rx * u * cos - ry * v * sin, y: cy + rx * u * sin + ry * v * cos });
  const out: Array<[Pt, Pt, Pt]> = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * d, b = a + d;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    out.push([map(ca - k * sa, sa + k * ca), map(cb + k * sb, sb - k * cb), i === n - 1 ? { x: p1.x, y: p1.y } : map(cb, sb)]);
  }
  return out;
}

/**
 * Reads SVG path data. Throws a Spanish error on malformed data or when it has more commands than
 * `limits.commands` (20 000 by default). Contours with a single point are dropped; open subpaths stay open.
 */
export function parsePathData(d: string, limits: { commands?: number } = {}): Contour[] {
  const max = limits.commands ?? PATH_LIMITS.commands;
  const out: Contour[] = [];
  let cur: Contour | null = null;
  let pos = 0, count = 0;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  // reflection points for S and T: only valid right after a cubic / quadratic
  let lastC: Pt | null = null, lastQ: Pt | null = null;

  const fail = (msg: string): never => { throw new Error(msg); };
  const skip = () => { while (pos < d.length && SEPARATOR.test(d[pos])) pos++; };
  const number = (cmd: string): number => {
    skip();
    NUMBER.lastIndex = pos;
    const m = NUMBER.exec(d);
    if (!m) return fail(pos >= d.length || ARGS[d[pos].toUpperCase()] !== undefined
      ? `Al comando ${cmd} del trazo SVG le faltan números (posición ${pos}).`
      : `El trazo SVG tiene un carácter no válido «${d[pos]}» en la posición ${pos}.`);
    pos += m[0].length;
    const v = Number(m[0]);
    if (!Number.isFinite(v)) fail(`El trazo SVG tiene un número fuera de rango en la posición ${pos - m[0].length}.`);
    return v;
  };
  const flag = (): boolean => {
    skip();
    const c = d[pos];
    if (c !== '0' && c !== '1') fail(`El trazo SVG tiene una bandera de arco no válida en la posición ${pos}.`);
    pos++;
    return c === '1';
  };
  const flush = () => {
    if (cur && cur.nodes.length >= 2) out.push(cur);
    cur = null;
  };
  const ensure = (): Contour => {
    // a drawing command right after Z starts a new subpath at the last start point
    if (!cur) cur = { closed: false, nodes: [{ x: sx, y: sy }] };
    return cur;
  };
  const lineTo = (x: number, y: number) => {
    const c = ensure(), last = c.nodes[c.nodes.length - 1];
    if (!same(last, { x, y })) c.nodes.push({ x, y });
  };
  const cubicTo = (c1: Pt, c2: Pt, p: Pt) => {
    const c = ensure(), last = c.nodes[c.nodes.length - 1];
    if (same(last, p) && same(last, c1) && same(last, c2)) return;
    last.ho = { x: c1.x, y: c1.y };
    c.nodes.push({ x: p.x, y: p.y, hi: { x: c2.x, y: c2.y } });
  };
  const close = () => {
    if (cur && cur.nodes.length) {
      const ns: PathNode[] = cur.nodes;
      const first = ns[0], last = ns[ns.length - 1];
      if (ns.length > 1 && same(first, last)) {
        if (last.hi) first.hi = last.hi;
        ns.pop();
      }
      cur.closed = true;
    }
    flush();
    cx = sx;
    cy = sy;
  };

  skip();
  if (pos >= d.length) return out;
  let cmd = '';
  while (true) {
    skip();
    if (pos >= d.length) break;
    const ch = d[pos];
    if (/[a-zA-Z]/.test(ch)) {
      if (ARGS[ch.toUpperCase()] === undefined) fail(`El trazo SVG tiene un comando desconocido «${ch}» en la posición ${pos}.`);
      cmd = ch;
      pos++;
    } else if (!cmd) {
      fail(`El trazo SVG debe empezar con M (posición ${pos}).`);
    } else if (ARGS[cmd.toUpperCase()] === 0) {
      fail(`El trazo SVG tiene un carácter no válido «${ch}» en la posición ${pos}.`);
    }
    // implicit repeats: numbers after M/m continue as L/l
    if (count === 0 && cmd.toUpperCase() !== 'M') fail(`El trazo SVG debe empezar con M (posición ${pos - 1}).`);
    if (++count > max) fail(`El trazo SVG tiene más de ${miles(max)} comandos.`);
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    switch (C) {
      case 'M': {
        const x = number(cmd) + ox, y = number(cmd) + oy;
        flush();
        cur = { closed: false, nodes: [{ x, y }] };
        cx = sx = x;
        cy = sy = y;
        lastC = lastQ = null;
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': { const x = number(cmd) + ox, y = number(cmd) + oy; lineTo(x, y); cx = x; cy = y; lastC = lastQ = null; break; }
      case 'H': { const x = number(cmd) + ox; lineTo(x, cy); cx = x; lastC = lastQ = null; break; }
      case 'V': { const y = number(cmd) + oy; lineTo(cx, y); cy = y; lastC = lastQ = null; break; }
      case 'C': {
        const c1 = { x: number(cmd) + ox, y: number(cmd) + oy }, c2 = { x: number(cmd) + ox, y: number(cmd) + oy };
        const p = { x: number(cmd) + ox, y: number(cmd) + oy };
        cubicTo(c1, c2, p);
        cx = p.x; cy = p.y; lastC = c2; lastQ = null;
        break;
      }
      case 'S': {
        const c1 = lastC ? { x: 2 * cx - lastC.x, y: 2 * cy - lastC.y } : { x: cx, y: cy };
        const c2 = { x: number(cmd) + ox, y: number(cmd) + oy }, p = { x: number(cmd) + ox, y: number(cmd) + oy };
        cubicTo(c1, c2, p);
        cx = p.x; cy = p.y; lastC = c2; lastQ = null;
        break;
      }
      case 'Q': case 'T': {
        const q: Pt = C === 'Q' ? { x: number(cmd) + ox, y: number(cmd) + oy } : lastQ ? { x: 2 * cx - lastQ.x, y: 2 * cy - lastQ.y } : { x: cx, y: cy };
        const p = { x: number(cmd) + ox, y: number(cmd) + oy };
        // exact degree elevation of the quadratic
        cubicTo({ x: cx + (2 / 3) * (q.x - cx), y: cy + (2 / 3) * (q.y - cy) }, { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) }, p);
        cx = p.x; cy = p.y; lastQ = q; lastC = null;
        break;
      }
      case 'A': {
        const rx = number(cmd), ry = number(cmd), phi = number(cmd), large = flag(), sweep = flag();
        const p = { x: number(cmd) + ox, y: number(cmd) + oy };
        for (const [c1, c2, e] of arcToCubics({ x: cx, y: cy }, rx, ry, phi, large, sweep, p)) {
          if (same(c1, { x: cx, y: cy }) && same(c2, e)) lineTo(e.x, e.y);
          else cubicTo(c1, c2, e);
        }
        cx = p.x; cy = p.y; lastC = lastQ = null;
        break;
      }
      case 'Z': close(); lastC = lastQ = null; break;
    }
  }
  flush();
  return out;
}

/* ------------------------------------------------------------------ */
/* Transforms                                                          */
/* ------------------------------------------------------------------ */

const TRANSFORM = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)\s*,?/y;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Reads an SVG transform list (matrix, translate, scale, rotate(a [cx cy]), skewX, skewY). Throws a Spanish error. */
export function parseTransform(s: string): Matrix {
  let m: Matrix = [...IDENTITY];
  const text = s.trim();
  if (!text) return m;
  const bad = (): never => { throw new Error(`La transformación SVG «${text.slice(0, 60)}» no es válida.`); };
  let pos = 0;
  while (pos < text.length) {
    TRANSFORM.lastIndex = pos;
    const r = TRANSFORM.exec(text);
    if (!r) bad();
    pos = TRANSFORM.lastIndex;
    const args = r![2].trim() ? r![2].trim().split(/[\s,]+/).map(Number) : [];
    if (args.some(v => !Number.isFinite(v))) bad();
    const n = args.length;
    let t: Matrix;
    switch (r![1]) {
      case 'matrix': if (n !== 6) bad(); t = args as Matrix; break;
      case 'translate': if (n < 1 || n > 2) bad(); t = [1, 0, 0, 1, args[0], args[1] ?? 0]; break;
      case 'scale': if (n < 1 || n > 2) bad(); t = [args[0], 0, 0, args[1] ?? args[0], 0, 0]; break;
      case 'rotate': {
        if (n !== 1 && n !== 3) bad();
        const a = rad(args[0]), c = Math.cos(a), sn = Math.sin(a);
        t = [c, sn, -sn, c, 0, 0];
        if (n === 3) t = multiply(multiply([1, 0, 0, 1, args[1], args[2]], t), [1, 0, 0, 1, -args[1], -args[2]]);
        break;
      }
      case 'skewX': if (n !== 1) bad(); t = [1, 0, Math.tan(rad(args[0])), 1, 0, 0]; break;
      default: if (n !== 1) bad(); t = [1, Math.tan(rad(args[0])), 0, 1, 0, 0]; break;
    }
    m = multiply(m, t!);
  }
  if (m.some(v => !Number.isFinite(v))) bad();
  return m;
}
