/**
 * Skeleton → outline: resolves a centreline skeleton (skeletons.ts) against a style model and the document's
 * metrics, draws every stroke with the broad-nib pen of geom/stroke.ts, unites them and fits curves.
 *
 * The skeleton language. Each string is one stroke (or a dot). Coordinates live in a design space with named
 * levels: for the 'x' frame (lowercase) y = 0 is the baseline, 500 the x-height, 800 the ascender line and
 * −200 the descender line; for the 'cap' frame 700 is the cap height (800 and −200 as before). Values between
 * levels are interpolated, so a skeleton follows the style's x-height and cap height and the document's
 * ascender and descender. x is in the same units at width 1.
 *
 *   M x y  L x y  C x1 y1 x2 y2 x y  Z     polyline and cubic parts of a centreline
 *   X x y   quarter turn starting horizontal and ending vertical (a superellipse quadrant: style.round)
 *   Y x y   quarter turn starting vertical and ending horizontal
 *   O x0 y0 x1 y1             closed bowl whose OUTER edges touch that box
 *   A x0 y0 x1 y1 a0 a1       part of that bowl from angle a0 to a1 (degrees, counter-clockwise if a1 > a0)
 *   D x y                     a dot (round or square, following the terminals)
 *
 * A point may carry an edge mark: `y^` the stroke's top edge (not its centre) sits at y, `y_` its bottom edge,
 * `x>` its left edge, `x<` its right edge. The shift is measured on the pen at that point (thick or thin, cap
 * included), so stems stand on the baseline and bowls touch the x-height at any weight. `y=` on a stroke end
 * cuts it flat at that height (diagonals of A, V, k…); with round terminals it becomes an edge mark instead.
 * Pure: no DOM.
 */
import type { Anchor, Contour, Metrics, Pt, StyleModel } from '../doc';
import { bboxOf, clipToBand, geometryToContours, skewX, transformContours, unionPolygons } from '../geom/ops';
import { dotPolygon, penThickness, strokeRings, WEDGE, type Cap, type Join } from '../geom/stroke';
import type { Skeleton } from './skeletons';

/** Design levels of the skeleton space. */
export const LEVELS = { base: 0, xh: 500, cap: 700, asc: 800, desc: -200 } as const;

export interface Pen {
  weight: number;
  contrast: number;
  angle: number;
  cap: Cap;
  join: Join;
  /** Superellipse exponent of bowls and turns (2 = ellipse). */
  n: number;
  /** Diameter of dots. */
  dot: number;
}

/** The style a skeleton is drawn with (the style model plus what the variants change). */
export interface DrawStyle {
  weight: number; contrast: number; angle: number; slant: number; width: number;
  terminal: StyleModel['terminal']; corner: StyleModel['corner']; xh: number; cap: number; round: number;
}

export const drawStyle = (s: StyleModel): DrawStyle => ({
  weight: s.weight, contrast: s.contrast, angle: s.angle, slant: s.slant, width: s.width,
  terminal: s.terminal, corner: s.corner, xh: s.xh, cap: s.cap, round: s.round,
});

/** Superellipse exponent for a roundness 0..1: 1 → ellipse (2), 0 → nearly square (5). */
export const exponentOf = (round: number) => 2 + 3 * (1 - Math.max(0, Math.min(1, round)));

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

interface RP { x: number; y: number; mx?: string; my?: string }
type Op =
  | { k: 'M' | 'L' | 'X' | 'Y' | 'D'; p: RP }
  | { k: 'C'; c1: Pt; c2: Pt; p: RP }
  | { k: 'Z' }
  | { k: 'O'; box: number[] }
  | { k: 'A'; box: number[]; a0: number; a1: number };

const ARITY: Record<string, number> = { M: 2, L: 2, X: 2, Y: 2, D: 2, C: 6, Z: 0, O: 4, A: 6 };
const cache = new Map<string, Op[]>();

/** Parses one stroke of the skeleton language (cached). Throws on a malformed skeleton (a programming error). */
export function parseStroke(src: string): Op[] {
  const hit = cache.get(src);
  if (hit) return hit;
  const toks = src.match(/[A-Z]|-?\d+(?:\.\d+)?[\^_<>=]?/g) ?? [];
  const ops: Op[] = [];
  let i = 0;
  const val = () => {
    const t = toks[i++];
    const m = /^(-?\d+(?:\.\d+)?)([\^_<>=]?)$/.exec(t ?? '');
    if (!m) throw new Error(`Esqueleto no válido: «${src}»`);
    return { v: Number(m[1]), m: m[2] };
  };
  const pt = (): RP => { const x = val(), y = val(); return { x: x.v, y: y.v, mx: x.m || undefined, my: y.m || undefined }; };
  while (i < toks.length) {
    const c = toks[i++];
    if (ARITY[c] === undefined) throw new Error(`Esqueleto no válido: «${src}»`);
    if (c === 'Z') ops.push({ k: 'Z' });
    else if (c === 'C') { const a = pt(), b = pt(); ops.push({ k: 'C', c1: { x: a.x, y: a.y }, c2: { x: b.x, y: b.y }, p: pt() }); }
    else if (c === 'O') ops.push({ k: 'O', box: [val().v, val().v, val().v, val().v] });
    else if (c === 'A') ops.push({ k: 'A', box: [val().v, val().v, val().v, val().v], a0: val().v, a1: val().v });
    else ops.push({ k: c as 'M', p: pt() });
  }
  cache.set(src, ops);
  return ops;
}

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

export interface Frame { fx: (x: number) => number; fy: (y: number) => number; sx: number }

/** Maps the design space to font units for a frame, a style and the metrics. */
export function frameOf(frame: Skeleton['frame'], st: DrawStyle, m: Metrics): Frame {
  const upm = m.upm;
  const level = frame === 'x' ? st.xh : st.cap, nominal = frame === 'x' ? LEVELS.xh : LEVELS.cap;
  const asc = Math.max(m.asc, level + 0.05 * upm), desc = Math.min(m.desc, -0.05 * upm);
  // heavier pens widen the letters a little, as type designers do, so counters do not close up
  const widen = 1 + 1.2 * (st.weight / upm - 0.09);
  const sx = st.width * (level / nominal) * widen;
  const fy = (y: number) => {
    if (y < 0) return (y / -LEVELS.desc) * -desc;
    if (y <= nominal) return (y / nominal) * level;
    return level + ((y - nominal) / (LEVELS.asc - nominal)) * (asc - level);
  };
  return { fx: x => x * sx, fy, sx };
}

export function penOf(st: DrawStyle, m: Metrics): Pen {
  const n = exponentOf(st.round);
  const room = Math.max(0.1 * m.upm, (m.asc - st.xh) * 0.55);
  return {
    weight: st.weight, contrast: st.contrast, angle: st.angle,
    cap: st.terminal, join: st.corner === 'redondo' ? 'redondo' : 'inglete', n,
    dot: Math.max(st.weight * st.contrast * 1.4, Math.min(st.weight * 1.2, room)),
  };
}

const T = (pen: Pen, t: Pt) => penThickness(pen.weight, pen.contrast, pen.angle, Math.atan2(t.y, t.x));
const unit = (p: Pt): Pt => { const l = Math.hypot(p.x, p.y); return l > 1e-12 ? { x: p.x / l, y: p.y / l } : { x: 0, y: 0 }; };
const sgnpow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;

interface Seg { k: 'L' | 'C' | 'X' | 'Y'; c1?: Pt; c2?: Pt }
interface Node { p: Pt; mx?: string; my?: string }

export interface ResolvedStroke { points: Pt[]; closed: boolean; cut?: { lo: number; hi: number }; dot?: number }

/** Points of a superellipse bowl whose outer edges touch the box, from a0 to a1 degrees. */
function bowl(box: number[], a0: number, a1: number, pen: Pen, F: Frame, count: number): Pt[] {
  const x0 = F.fx(box[0]), x1 = F.fx(box[2]), y0 = F.fy(box[1]), y1 = F.fy(box[3]);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const a = Math.max(1, (x1 - x0) / 2 - T(pen, { x: 0, y: 1 }) / 2), b = Math.max(1, (y1 - y0) / 2 - T(pen, { x: 1, y: 0 }) / 2);
  const e = 2 / pen.n, out: Pt[] = [];
  for (let k = 0; k <= count; k++) {
    const t = ((a0 + ((a1 - a0) * k) / count) * Math.PI) / 180;
    out.push({ x: cx + a * sgnpow(Math.cos(t), e), y: cy + b * sgnpow(Math.sin(t), e) });
  }
  return out;
}

/** A quarter superellipse between two points (X: leaves horizontally; Y: leaves vertically). */
function quarter(p0: Pt, p1: Pt, kind: 'X' | 'Y', n: number, out: Pt[]) {
  const e = 2 / n, N = 16;
  for (let k = 1; k <= N; k++) {
    const t = ((k / N) * Math.PI) / 2;
    if (kind === 'X') out.push({ x: p0.x + (p1.x - p0.x) * Math.sin(t) ** e, y: p1.y + (p0.y - p1.y) * Math.cos(t) ** e });
    else out.push({ x: p1.x + (p0.x - p1.x) * Math.cos(t) ** e, y: p0.y + (p1.y - p0.y) * Math.sin(t) ** e });
  }
}

function cubic(p0: Pt, c1: Pt, c2: Pt, p1: Pt, out: Pt[]) {
  const N = 18;
  for (let k = 1; k <= N; k++) {
    const t = k / N, u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
      y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
    });
  }
}

/** Resolves one stroke string: font-unit centreline points, edge marks applied, flat cuts recorded. */
export function resolveStroke(src: string, F: Frame, pen: Pen): ResolvedStroke[] {
  const ops = parseStroke(src);
  const nodes: Node[] = [], segs: Seg[] = [];
  let closed = false;
  const map = (p: RP): Node => ({ p: { x: F.fx(p.x), y: F.fy(p.y) }, mx: p.mx, my: p.my });
  for (const op of ops) {
    if (op.k === 'D') {
      const c = map(op.p), r = pen.dot / 2;
      const x = c.p.x + (c.mx === '>' ? r : c.mx === '<' ? -r : 0), y = c.p.y + (c.my === '_' ? r : c.my === '^' ? -r : 0);
      return [{ points: [{ x, y }], closed: false, dot: pen.dot }];
    }
    if (op.k === 'O') return [{ points: bowl(op.box, 90, 450, pen, F, 72).slice(0, -1), closed: true }];
    if (op.k === 'A') {
      const pts = bowl(op.box, op.a0, op.a1, pen, F, Math.max(8, Math.ceil(Math.abs(op.a1 - op.a0) / 5)));
      for (const p of pts) { if (nodes.length) segs.push({ k: 'L' }); nodes.push({ p }); }
      continue;
    }
    if (op.k === 'Z') { closed = true; continue; }
    if (op.k === 'M') { nodes.push(map(op.p)); continue; }
    if (op.k === 'C') segs.push({ k: 'C', c1: { x: F.fx(op.c1.x), y: F.fy(op.c1.y) }, c2: { x: F.fx(op.c2.x), y: F.fy(op.c2.y) } });
    else segs.push({ k: op.k as 'L' | 'X' | 'Y' });
    nodes.push(map(op.p));
  }
  if (!nodes.length) return [];
  if (closed && nodes.length > 2) {
    const a = nodes[0].p, z = nodes[nodes.length - 1].p;
    if (Math.hypot(a.x - z.x, a.y - z.y) > 1e-6) segs.push({ k: 'L' });
    else { nodes[0].mx ??= nodes[nodes.length - 1].mx; nodes[0].my ??= nodes[nodes.length - 1].my; nodes.pop(); }
  } else closed = false;
  const N = nodes.length;
  const segEnds = (i: number) => [nodes[i].p, nodes[(i + 1) % N].p] as const;
  // tangents at both ends of every segment, before any shift
  const tan = segs.map((s, i) => {
    const [a, b] = segEnds(i);
    const sx = Math.sign(b.x - a.x) || 1, sy = Math.sign(b.y - a.y) || 1;
    if (s.k === 'X') return [{ x: sx, y: 0 }, { x: 0, y: sy }];
    if (s.k === 'Y') return [{ x: 0, y: sy }, { x: sx, y: 0 }];
    if (s.k === 'C') {
      const t0 = unit({ x: s.c1!.x - a.x, y: s.c1!.y - a.y }), t1 = unit({ x: b.x - s.c2!.x, y: b.y - s.c2!.y });
      const ch = unit({ x: b.x - a.x, y: b.y - a.y });
      return [t0.x || t0.y ? t0 : ch, t1.x || t1.y ? t1 : ch];
    }
    const d = unit({ x: b.x - a.x, y: b.y - a.y });
    return [d, d];
  });
  const inT = (i: number): Pt | null => (i > 0 ? tan[i - 1][1] : closed ? tan[segs.length - 1][1] : null);
  const outT = (i: number): Pt | null => (i < segs.length ? tan[i][0] : null);
  const isEnd = (i: number) => !closed && (i === 0 || i === N - 1);
  const forward = (i: number): Pt => (i === 0 ? { x: -outT(0)!.x, y: -outT(0)!.y } : inT(i)!);
  /** How far the pen's ink reaches from node i in direction u. */
  const support = (i: number, u: Pt) => {
    let s = 0;
    for (const t of [inT(i), outT(i)]) if (t) s = Math.max(s, (T(pen, t) / 2) * Math.abs(t.x * u.y - t.y * u.x));
    if (isEnd(i) && N > 1) {
      const f = forward(i), hh = T(pen, f) / 2, along = u.x * f.x + u.y * f.y;
      if (pen.cap === 'redondo' && along > -1e-9) s = Math.max(s, hh);
      if (pen.cap === 'cuna') s = Math.max(s, hh * (1 + WEDGE.flare) * Math.abs(f.x * u.y - f.y * u.x) + Math.max(0, along) * hh * WEDGE.cut);
    }
    return s;
  };
  const shift: Pt[] = nodes.map(() => ({ x: 0, y: 0 }));
  let lo = -Infinity, hi = Infinity;
  nodes.forEach((nd, i) => {
    if (nd.mx === '>') shift[i].x += support(i, { x: -1, y: 0 });
    if (nd.mx === '<') shift[i].x -= support(i, { x: 1, y: 0 });
    let my = nd.my;
    if (my === '=') {
      if (!isEnd(i) || N < 2) my = undefined;
      else {
        const f = forward(i);
        if (pen.cap === 'redondo') my = f.y < 0 ? '_' : '^';
        else {
          // extend past the level so the whole end is beyond it, then clip there
          const hh = (T(pen, f) / 2) * (pen.cap === 'cuna' ? 1 + WEDGE.flare + WEDGE.cut : 1);
          const e = (hh * Math.abs(f.x) + 2) / Math.max(Math.abs(f.y), 0.25);
          shift[i].x += f.x * e;
          shift[i].y += f.y * e;
          if (f.y < 0) lo = Math.max(lo, nd.p.y);
          else hi = Math.min(hi, nd.p.y);
          my = undefined;
        }
      }
    }
    if (my === '^') shift[i].y -= support(i, { x: 0, y: 1 });
    if (my === '_') shift[i].y += support(i, { x: 0, y: -1 });
  });
  const P = nodes.map((nd, i) => ({ x: nd.p.x + shift[i].x, y: nd.p.y + shift[i].y }));
  const pts: Pt[] = [P[0]];
  segs.forEach((s, i) => {
    const a = P[i], b = P[(i + 1) % N], sa = shift[i], sb = shift[(i + 1) % N];
    if (s.k === 'C') cubic(a, { x: s.c1!.x + sa.x, y: s.c1!.y + sa.y }, { x: s.c2!.x + sb.x, y: s.c2!.y + sb.y }, b, pts);
    else if (s.k === 'X' || s.k === 'Y') quarter(a, b, s.k, pen.n, pts);
    else pts.push(b);
  });
  if (closed) pts.pop();
  const out: ResolvedStroke = { points: pts, closed };
  if (lo > -Infinity || hi < Infinity) out.cut = { lo, hi };
  return [out];
}

/* ------------------------------------------------------------------ */
/* Outline                                                             */
/* ------------------------------------------------------------------ */

export interface Drawn {
  /** Outline contours, sheared by the slant, not yet placed horizontally. */
  contours: Contour[];
  /** Anchors in the same space. */
  anchors: Anchor[];
}

/** Draws a skeleton with a style: strokes, dots, union, fitted curves, slant. */
export function drawSkeleton(sk: Skeleton, st: DrawStyle, m: Metrics): Drawn {
  const F = frameOf(sk.frame, st, m), pen = penOf(st, m);
  const polys: Array<Pt[] | Pt[][]> = [];
  for (const src of sk.strokes) {
    for (const r of resolveStroke(src, F, pen)) {
      if (r.dot) { polys.push(dotPolygon(r.points[0], r.dot, pen.cap === 'recto' ? 'recto' : 'redondo')); continue; }
      const rings = strokeRings(r.points, { width: pen.weight, contrast: pen.contrast, angle: pen.angle, cap: pen.cap, join: pen.join, closed: r.closed });
      if (!r.cut) { polys.push(...rings); continue; }
      for (const poly of clipToBand(unionPolygons(rings), r.cut.lo, r.cut.hi)) polys.push(poly.map(ring => ring.map(([x, y]) => ({ x, y }))));
    }
  }
  const tol = 0.6 * (m.upm / 1000);
  let contours = geometryToContours(unionPolygons(polys), tol);
  let anchors: Anchor[] = Object.entries(sk.anchors).map(([name, [x, y]]) => ({ name, x: F.fx(x), y: F.fy(y) }));
  if (st.slant) {
    const k = skewX(st.slant, 0);
    contours = transformContours(contours, k);
    anchors = anchors.map(a => ({ name: a.name, x: a.x + a.y * k[2], y: a.y }));
  }
  return { contours, anchors };
}

/** Horizontal placement: left side bearing `lsb` before the ink. Returns the shifted drawing and its ink box. */
export function placeDrawn(d: Drawn, dx: number): Drawn {
  return {
    contours: transformContours(d.contours, [1, 0, 0, 1, dx, 0]),
    anchors: d.anchors.map(a => ({ name: a.name, x: Math.round((a.x + dx) * 10) / 10, y: Math.round(a.y * 10) / 10 })),
  };
}

export const inkBox = (d: Drawn) => bboxOf(d.contours);
