/**
 * Geometry of the selection tools, pure (no DOM): simplification of freehand paths, the handles of rotated
 * shapes and what dragging them does, hit testing of every kind of mask part, polygon editing.
 *
 * Spaces. Parts are stored in frame units (0..1 of the output frame) of their LAYER (a mask moves with its
 * layer's transform, see compositor.ts). Shapes rotate in pixels (a square stays square on a 3:2 frame), so the
 * handle maths runs in «canvas px»: frame units × the project canvas size. Screen px (the viewport) are a
 * uniform scale of canvas px, so a tolerance in screen px becomes canvas px by one factor.
 */
import type { LayerTransform, MaskGradientPart, MaskPart, MaskShapePart } from '../../project/types';

export interface Pt { x: number; y: number }
export interface Size { w: number; h: number }

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ layer space */

/**
 * Frame units of the output frame ↔ frame units of a layer (inverse of the compositor's transform: translate to
 * the layer's centre + offset, rotate, scale). Identity when the layer is not transformed.
 */
export function layerMapping(xf: LayerTransform | null | undefined, size: Size): { toLayer(p: Pt): Pt; toFrame(p: Pt): Pt; scale: number; rot: number } {
  const id = !xf || (!xf.x && !xf.y && !xf.rot && xf.scale === 1);
  if (id) return { toLayer: p => ({ x: p.x, y: p.y }), toFrame: p => ({ x: p.x, y: p.y }), scale: 1, rot: 0 };
  const { w, h } = size;
  const a = xf.rot * DEG, cos = Math.cos(a), sin = Math.sin(a), s = xf.scale || 1;
  const cx = w / 2 + xf.x * w, cy = h / 2 + xf.y * h;
  return {
    toLayer(p) {
      const dx = p.x * w - cx, dy = p.y * h - cy;
      const lx = (dx * cos + dy * sin) / s, ly = (-dx * sin + dy * cos) / s;
      return { x: (lx + w / 2) / w, y: (ly + h / 2) / h };
    },
    toFrame(p) {
      const lx = (p.x * w - w / 2) * s, ly = (p.y * h - h / 2) * s;
      return { x: (cx + lx * cos - ly * sin) / w, y: (cy + lx * sin + ly * cos) / h };
    },
    scale: s,
    rot: xf.rot,
  };
}

/* ------------------------------------------------------------------ simplification */

/**
 * Ramer–Douglas–Peucker on a flat [x0, y0, x1, y1, …] list: keeps the points that stray more than `tol` from
 * the chord of the points they sit between. Distances are measured after scaling x by `sx` and y by `sy` (frame
 * units × the frame's size on screen = screen px, so the tolerance follows the zoom). Iterative (no recursion
 * limit on long lasso paths). The first and last points are always kept.
 */
export function simplifyRDP(flat: readonly number[], tol: number, sx = 1, sy = 1): number[] {
  const n = flat.length >> 1;
  if (n <= 2) return flat.slice(0, n * 2);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const tol2 = tol * tol;
  const stack: number[] = [0, n - 1];
  while (stack.length) {
    const b = stack.pop()!, a = stack.pop()!;
    if (b - a < 2) continue;
    const ax = flat[a * 2] * sx, ay = flat[a * 2 + 1] * sy, bx = flat[b * 2] * sx, by = flat[b * 2 + 1] * sy;
    const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy;
    let worst = -1, wd = -1;
    for (let i = a + 1; i < b; i++) {
      const px = flat[i * 2] * sx - ax, py = flat[i * 2 + 1] * sy - ay;
      let d2: number;
      if (len2 < 1e-12) d2 = px * px + py * py;
      else {
        const k = clamp((px * vx + py * vy) / len2, 0, 1);
        const qx = px - vx * k, qy = py - vy * k;
        d2 = qx * qx + qy * qy;
      }
      if (d2 > wd) { wd = d2; worst = i; }
    }
    if (wd > tol2) {
      keep[worst] = 1;
      stack.push(a, worst, worst, b);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[i * 2], flat[i * 2 + 1]);
  return out;
}

/** Drops consecutive points closer than `minStep` (after scaling), keeping the last one. */
export function dropClose(flat: readonly number[], minStep: number, sx = 1, sy = 1): number[] {
  const n = flat.length >> 1;
  if (!n) return [];
  const out = [flat[0], flat[1]];
  for (let i = 1; i < n; i++) {
    const x = flat[i * 2], y = flat[i * 2 + 1];
    const lx = out[out.length - 2], ly = out[out.length - 1];
    if (Math.hypot((x - lx) * sx, (y - ly) * sy) >= minStep || i === n - 1) out.push(x, y);
  }
  return out;
}

/** Area of a closed polygon (shoelace), after scaling; positive for clockwise on screen (y down). */
export function polygonArea(flat: readonly number[], sx = 1, sy = 1): number {
  const n = flat.length >> 1;
  let s = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) s += (flat[j * 2] * sx) * (flat[i * 2 + 1] * sy) - (flat[i * 2] * sx) * (flat[j * 2 + 1] * sy);
  return s / 2;
}

/* ------------------------------------------------------------------ distances */

export function distToSegment(p: Pt, a: Pt, b: Pt): { d: number; t: number } {
  const vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
  const t = len2 < 1e-12 ? 0 : clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / len2, 0, 1);
  return { d: Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y), t };
}

/** Nearest segment of a polyline (closed: the last point joins the first), after scaling. */
export function nearestEdge(flat: readonly number[], p: Pt, closed: boolean, sx = 1, sy = 1): { d: number; i: number; t: number } {
  const n = flat.length >> 1;
  const q = { x: p.x * sx, y: p.y * sy };
  let best = { d: Infinity, i: -1, t: 0 };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const r = distToSegment(q, { x: flat[i * 2] * sx, y: flat[i * 2 + 1] * sy }, { x: flat[j * 2] * sx, y: flat[j * 2 + 1] * sy });
    if (r.d < best.d) best = { d: r.d, i, t: r.t };
  }
  if (n === 1) best = { d: Math.hypot(flat[0] * sx - q.x, flat[1] * sy - q.y), i: 0, t: 0 };
  return best;
}

/** Nearest vertex, after scaling. */
export function nearestVertex(flat: readonly number[], p: Pt, sx = 1, sy = 1): { d: number; i: number } {
  let best = { d: Infinity, i: -1 };
  for (let i = 0; i < flat.length >> 1; i++) {
    const d = Math.hypot((flat[i * 2] - p.x) * sx, (flat[i * 2 + 1] - p.y) * sy);
    if (d < best.d) best = { d, i };
  }
  return best;
}

/** Non-zero winding (like the mask rasteriser: a lasso that crosses itself stays filled). */
export function insidePolygon(flat: readonly number[], p: Pt): boolean {
  const n = flat.length >> 1;
  let wind = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xa = flat[j * 2], ya = flat[j * 2 + 1], xb = flat[i * 2], yb = flat[i * 2 + 1];
    if (ya <= p.y) {
      if (yb > p.y && (xb - xa) * (p.y - ya) - (p.x - xa) * (yb - ya) > 0) wind++;
    } else if (yb <= p.y && (xb - xa) * (p.y - ya) - (p.x - xa) * (yb - ya) < 0) wind--;
  }
  return wind !== 0;
}

/* ------------------------------------------------------------------ boxes (rect / ellipse) */

export interface Box { x: number; y: number; w: number; h: number; rot: number }

/** A box in canvas px: centre, half extents, angle in radians. */
export interface PxBox { cx: number; cy: number; hw: number; hh: number; a: number }

export function toPx(b: Box, s: Size): PxBox {
  return { cx: (b.x + b.w / 2) * s.w, cy: (b.y + b.h / 2) * s.h, hw: (Math.abs(b.w) * s.w) / 2, hh: (Math.abs(b.h) * s.h) / 2, a: b.rot * DEG };
}

export function fromPx(p: PxBox, s: Size): Box {
  const w = (p.hw * 2) / s.w, h = (p.hh * 2) / s.h;
  return { x: p.cx / s.w - w / 2, y: p.cy / s.h - h / 2, w, h, rot: normDeg(p.a / DEG) };
}

/** Degrees in (−180, 180]. */
export function normDeg(d: number): number {
  let r = d % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return Math.abs(r) < 1e-9 ? 0 : r;
}

/** Local (box axes) → canvas px. */
export function boxPoint(p: PxBox, lx: number, ly: number): Pt {
  const c = Math.cos(p.a), s = Math.sin(p.a);
  return { x: p.cx + lx * c - ly * s, y: p.cy + lx * s + ly * c };
}

/** Canvas px → local (box axes). */
export function boxLocal(p: PxBox, q: Pt): Pt {
  const c = Math.cos(p.a), s = Math.sin(p.a);
  const dx = q.x - p.cx, dy = q.y - p.cy;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot' | 'move';

/** Unit position of each resize handle in the box's own axes. */
export const HANDLE_SIGN: Record<Exclude<Handle, 'rot' | 'move'>, [number, number]> = {
  nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0],
};

/**
 * Where the handles are, in canvas px: eight resize handles on the box and a rotation handle `rotGap` px above
 * the top edge (in the box's own «up», so it turns with it).
 */
export function handlePoints(p: PxBox, rotGap: number): Record<Exclude<Handle, 'move'>, Pt> {
  const out = {} as Record<Exclude<Handle, 'move'>, Pt>;
  for (const [k, [sx, sy]] of Object.entries(HANDLE_SIGN)) out[k as keyof typeof HANDLE_SIGN] = boxPoint(p, sx * p.hw, sy * p.hh);
  out.rot = boxPoint(p, 0, -p.hh - rotGap);
  return out;
}

/**
 * Which handle is under q (canvas px), within `tol` px; 'move' inside the box; null outside. The rotation
 * handle wins over the corners (it sits outside the box), corners over edges.
 */
export function hitHandle(p: PxBox, q: Pt, tol: number, rotGap: number, ellipse = false): Handle | null {
  const hp = handlePoints(p, rotGap);
  if (dist(hp.rot, q) <= tol) return 'rot';
  let best: Handle | null = null, bd = Infinity;
  for (const k of ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'] as const) {
    const d = dist(hp[k], q) - (k.length === 2 ? 0.5 : 0); // corners first on ties
    if (d <= tol && d < bd) { bd = d; best = k; }
  }
  if (best) return best;
  const l = boxLocal(p, q);
  if (ellipse) {
    const qx = l.x / Math.max(1e-6, p.hw), qy = l.y / Math.max(1e-6, p.hh);
    return qx * qx + qy * qy <= 1 ? 'move' : null;
  }
  return Math.abs(l.x) <= p.hw && Math.abs(l.y) <= p.hh ? 'move' : null;
}

export interface DragMods {
  /** Keep the proportions (resize) or snap the angle to 15° (rotate). */
  keep?: boolean;
  /** Resize from the centre. */
  centre?: boolean;
}

/**
 * The box after dragging `handle` from `from` to `to` (canvas px), starting from `p0`. Resizing keeps the
 * opposite side (or the centre) in place along the box's own axes, so a rotated box resizes where it points.
 * Dragging past the opposite side flips the box (sizes stay positive).
 */
export function dragBox(p0: PxBox, handle: Handle, from: Pt, to: Pt, mods: DragMods = {}): PxBox {
  if (handle === 'move') return { ...p0, cx: p0.cx + to.x - from.x, cy: p0.cy + to.y - from.y };
  if (handle === 'rot') {
    const a0 = Math.atan2(from.y - p0.cy, from.x - p0.cx), a1 = Math.atan2(to.y - p0.cy, to.x - p0.cx);
    let a = p0.a + (a1 - a0);
    if (mods.keep) a = Math.round(a / (15 * DEG)) * 15 * DEG;
    return { ...p0, a };
  }
  const [sx, sy] = HANDLE_SIGN[handle];
  const l = boxLocal(p0, to);
  // where the handle was grabbed relative to its own position (so the box does not jump to the pointer)
  const g = boxLocal(p0, from);
  const offX = sx ? g.x - sx * p0.hw : 0, offY = sy ? g.y - sy * p0.hh : 0;
  const px = l.x - offX, py = l.y - offY;
  let hw = p0.hw, hh = p0.hh, lcx = 0, lcy = 0;
  if (mods.centre) {
    if (sx) hw = Math.abs(px);
    if (sy) hh = Math.abs(py);
  } else {
    if (sx) { const ax = -sx * p0.hw; hw = Math.abs(px - ax) / 2; lcx = (px + ax) / 2; }
    if (sy) { const ay = -sy * p0.hh; hh = Math.abs(py - ay) / 2; lcy = (py + ay) / 2; }
  }
  if (mods.keep && p0.hw > 1e-9 && p0.hh > 1e-9) {
    // one scale for both axes: the larger of the two (an edge handle scales both from its own axis)
    const kx = hw / p0.hw, ky = hh / p0.hh;
    const k = sx && sy ? Math.max(kx, ky) : sx ? kx : ky;
    const nhw = p0.hw * k, nhh = p0.hh * k;
    if (!mods.centre) {
      // keep the anchor (opposite corner or edge) where it was
      if (sx) lcx = -sx * p0.hw + Math.sign(px - -sx * p0.hw || sx) * nhw;
      if (sy) lcy = -sy * p0.hh + Math.sign(py - -sy * p0.hh || sy) * nhh;
    }
    hw = nhw; hh = nhh;
  }
  const c = boxPoint(p0, lcx, lcy);
  return { cx: c.x, cy: c.y, hw, hh, a: p0.a };
}

/**
 * A new box dragged from `a` to `b` (canvas px), unrotated: `square` makes it a square (circle), `centre` draws
 * it from its centre (like most image editors: shift and alt).
 */
export function boxFromDrag(a: Pt, b: Pt, o: { square?: boolean; centre?: boolean } = {}): PxBox {
  let dx = b.x - a.x, dy = b.y - a.y;
  if (o.square) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (Math.sign(dx) || 1) * m; dy = (Math.sign(dy) || 1) * m;
  }
  if (o.centre) return { cx: a.x, cy: a.y, hw: Math.abs(dx), hh: Math.abs(dy), a: 0 };
  return { cx: a.x + dx / 2, cy: a.y + dy / 2, hw: Math.abs(dx) / 2, hh: Math.abs(dy) / 2, a: 0 };
}

/* ------------------------------------------------------------------ hit testing */

export interface HitContext {
  /** Canvas px (frame units × this = px). */
  size: Size;
  /** Tolerance in canvas px (a thin stroke or a polygon's edge can be picked a little outside). */
  tol: number;
  /**
   * Coverage 0..1 of a part that needs pixels (raster pictures, colour parts) at a point in frame units; null
   * when not known yet (still loading).
   */
  sample?(part: MaskPart, p: Pt): number | null;
}

/** Coverage-like strength of a gradient part at p (0..1), for hit tests on its area. */
export function gradientAt(g: MaskGradientPart, p: Pt, s: Size): number {
  const ax = g.x0 * s.w, ay = g.y0 * s.h, bx = g.x1 * s.w, by = g.y1 * s.h;
  const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy;
  if (len2 < 1e-9) return g.alpha1 * g.alpha;
  const dx = p.x * s.w - ax, dy = p.y * s.h - ay;
  const k = clamp(g.shape === 'radial' ? Math.hypot(dx, dy) / Math.sqrt(len2) : (dx * vx + dy * vy) / len2, 0, 1);
  return (g.alpha0 + (g.alpha1 - g.alpha0) * k) * g.alpha;
}

/** The part's control line (a gradient's segment) is under p. */
export function nearGradientLine(g: MaskGradientPart, p: Pt, c: HitContext): boolean {
  const q = { x: p.x * c.size.w, y: p.y * c.size.h };
  return distToSegment(q, { x: g.x0 * c.size.w, y: g.y0 * c.size.h }, { x: g.x1 * c.size.w, y: g.y1 * c.size.h }).d <= c.tol;
}

/**
 * Whether a part covers p (frame units of the layer): inside a shape or polygon (or within the tolerance of its
 * edge), within a stroke's radius, where a raster or colour part is at least half on, near a gradient's line.
 */
export function hitPart(part: MaskPart, p: Pt, c: HitContext): boolean {
  const { size, tol } = c;
  const q = { x: p.x * size.w, y: p.y * size.h };
  switch (part.kind) {
    case 'rect': case 'ellipse': {
      const b = toPx(part, size);
      const l = boxLocal(b, q);
      if (part.kind === 'rect') return Math.abs(l.x) <= b.hw + tol && Math.abs(l.y) <= b.hh + tol;
      const hw = b.hw + tol, hh = b.hh + tol;
      return (l.x * l.x) / (hw * hw) + (l.y * l.y) / (hh * hh) <= 1;
    }
    case 'polygon':
      return insidePolygon(part.pts, p) || nearestEdge(part.pts, p, true, size.w, size.h).d <= tol;
    case 'stroke': {
      const R = (part.size * Math.min(size.w, size.h)) / 2;
      const n = part.pts.length >> 1;
      for (let i = 0; i < Math.max(1, n - 1); i++) {
        const j = Math.min(n - 1, i + 1);
        const a = { x: part.pts[i * 2] * size.w, y: part.pts[i * 2 + 1] * size.h };
        const b = { x: part.pts[j * 2] * size.w, y: part.pts[j * 2 + 1] * size.h };
        const r = distToSegment(q, a, b);
        const pr = part.pressure ? (part.pressure[i] + (part.pressure[j] - part.pressure[i]) * r.t) : 1;
        if (r.d <= R * pr + tol) return true;
      }
      return false;
    }
    case 'gradient':
      return nearGradientLine(part, p, c);
    case 'raster': case 'color': {
      const v = c.sample?.(part, p);
      return v !== null && v !== undefined && v >= 0.5;
    }
  }
}

/**
 * The topmost part under p (index in `parts`, the last drawn is on top), or −1. Gradients cover the whole
 * frame, so they are picked by their control line first, and by their area only when nothing else is there.
 */
export function hitTop(parts: readonly MaskPart[], p: Pt, c: HitContext): number {
  for (let i = parts.length - 1; i >= 0; i--) if (hitPart(parts[i], p, c)) return i;
  for (let i = parts.length - 1; i >= 0; i--) {
    const g = parts[i];
    if (g.kind === 'gradient' && gradientAt(g, p, c.size) >= 0.5) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ moving parts */

/** The part moved by (dx, dy) frame units (rasters and colours do not move here: see the part editor). */
export function movePart<T extends MaskPart>(part: T, dx: number, dy: number): T {
  switch (part.kind) {
    case 'rect': case 'ellipse': return { ...part, x: part.x + dx, y: part.y + dy };
    case 'polygon': case 'stroke': return { ...part, pts: part.pts.map((v, i) => v + (i % 2 ? dy : dx)) };
    case 'gradient': return { ...part, x0: part.x0 + dx, y0: part.y0 + dy, x1: part.x1 + dx, y1: part.y1 + dy };
    default: return part;
  }
}

/** A shape part with its box replaced (values rounded to 1e-6 so JSON stays short). */
export function withBox<T extends MaskShapePart>(part: T, b: Box): T {
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return { ...part, x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h), rot: Math.round(normDeg(b.rot) * 1000) / 1000 };
}

/** Rounds a flat point list (frame units) to 1e-5 (a tenth of a pixel on a 10 000 px frame). */
export const roundPts = (flat: readonly number[]) => flat.map(v => Math.round(v * 1e5) / 1e5);

/* ------------------------------------------------------------------ polygon editing */

/** Inserts a vertex on edge i (between vertex i and i + 1) at p. */
export function insertVertex(flat: readonly number[], i: number, p: Pt): number[] {
  const out = flat.slice();
  out.splice((i + 1) * 2, 0, p.x, p.y);
  return out;
}

/** Removes vertex i (a polygon keeps at least three). */
export function removeVertex(flat: readonly number[], i: number): number[] {
  if (flat.length <= 6) return flat.slice();
  const out = flat.slice();
  out.splice(i * 2, 2);
  return out;
}

export function moveVertex(flat: readonly number[], i: number, p: Pt): number[] {
  const out = flat.slice();
  out[i * 2] = p.x; out[i * 2 + 1] = p.y;
  return out;
}
