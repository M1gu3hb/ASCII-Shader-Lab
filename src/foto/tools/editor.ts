/**
 * Editing one part of the target's mask in place: handles per kind (a shape's eight resize handles and its
 * rotation handle, a gradient's two ends, a polygon's vertices; moving anything that has a position), keyboard
 * nudges, and the overlay. Shared by «Rectángulo»/«Elipse» and «Degradado» (the part just drawn) and «Editar
 * partes» (any part). Each drag or key burst is one undo step (the part is replaced once, at the end).
 *
 * Hit tests run on screen (tolerances in viewport px, bigger on touch); the maths runs in the layer's own
 * pixels (shapes rotate in pixels).
 */
import type { Id, MaskGradientPart, MaskPart, MaskShapePart } from '../../project/types';
import {
  boxLocal, boxPoint, dist, dragBox, fromPx, handlePoints, insidePolygon, moveVertex, movePart, nearestEdge, normDeg, removeVertex, roundPts,
  toPx, withBox, type Handle, type HitContext, type Pt, type PxBox,
} from './geom';
import * as draw from './overlay';
import { canvasSize, layerById, mapping, partsOf, removePart, replacePart, samePart, screenPerPx } from './target';
import type { ToolEvent, ToolHost } from './types';

export interface Sel { layer: Id; index: number; part: MaskPart }

export type Grab =
  | { kind: 'box'; handle: Handle }
  | { kind: 'end'; end: 0 | 1 }
  | { kind: 'vertex'; i: number }
  | { kind: 'move' };

const ROT_GAP = 22; // screen px between a shape's top edge and its rotation handle

export class PartEditor {
  sel: Sel | null = null;
  /** The selected vertex of a polygon (keyboard, Backspace) or the active end of a gradient. */
  vertex = -1;
  end: 0 | 1 = 1;
  /** The keyboard has been used on this selection (then its active end/vertex is shown in vermilion). */
  kbd = false;
  touch = false;
  private drag: { grab: Grab; from: Pt; to: Pt; part0: MaskPart; draft: MaskPart; moved: boolean } | null = null;
  /** Optional sampler for parts that need pixels (rasters, colours) — «move» on a raster. */
  sample: HitContext['sample'];
  /** Called when a raster part is moved (the picture must be re-made): the tool does it asynchronously. */
  onRasterMove?: (sel: Sel, dx: number, dy: number) => void;
  onChange?: () => void;

  select(layer: Id, index: number, part: MaskPart): void {
    this.sel = { layer, index, part };
    this.vertex = -1;
    this.end = 1;
    this.kbd = false;
    this.onChange?.();
  }

  clear(): void {
    this.sel = null;
    this.drag = null;
    this.vertex = -1;
    this.onChange?.();
  }

  get dragging(): boolean { return !!this.drag; }

  /** The selection, still valid in the open project (it follows its part through undo/redo); null when gone. */
  current(host: ToolHost): Sel | null {
    const s = this.sel;
    if (!s) return null;
    // (dropped silently: this runs while option bars render, where no state may change)
    const drop = () => { this.sel = null; this.drag = null; this.vertex = -1; return null; };
    if (s.layer !== host.target()) return drop();
    const parts = partsOf(layerById(s.layer));
    if (samePart(parts[s.index], s.part)) return s;
    const i = parts.findIndex(p => samePart(p, s.part));
    if (i >= 0) { s.index = i; return s; }
    return drop();
  }

  /* ---------------------------------------------------------------- geometry on screen */

  private px(host: ToolHost) { const s = canvasSize(host); return { s, toPx: (p: Pt) => ({ x: p.x * s.w, y: p.y * s.h }), fromPx: (p: Pt) => ({ x: p.x / s.w, y: p.y / s.h }) }; }

  /** Viewport px per layer px (the view's zoom times the layer's own scale). */
  private k(host: ToolHost): number { return screenPerPx(host) * mapping(host).scale; }

  /** Layer px → screen. */
  private scr(host: ToolHost) {
    const m = mapping(host), v = host.view(), s = canvasSize(host);
    return (q: Pt) => v.toScreen(m.toFrame({ x: q.x / s.w, y: q.y / s.h }));
  }

  /** A pointer (frame units) in layer px. */
  private layerPx(host: ToolHost, p: Pt): Pt {
    const l = mapping(host).toLayer(p), s = canvasSize(host);
    return { x: l.x * s.w, y: l.y * s.h };
  }

  private tol(): number { return this.touch ? 22 : 8; }

  /** What of the selected part is under a screen point. */
  grabAt(host: ToolHost, e: Pick<ToolEvent, 'p' | 's'>): Grab | null {
    const sel = this.current(host);
    if (!sel) return null;
    const part = sel.part, scr = this.scr(host), tol = this.tol();
    const q = this.layerPx(host, e.p);
    const { s } = this.px(host);
    switch (part.kind) {
      case 'rect': case 'ellipse': {
        const b = toPx(part, s);
        const hp = handlePoints(b, ROT_GAP / this.k(host));
        if (dist(scr(hp.rot), e.s) <= tol) return { kind: 'box', handle: 'rot' };
        let best: Handle | null = null, bd = Infinity;
        for (const h of ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'] as const) {
          const d = dist(scr(hp[h]), e.s) - (h.length === 2 ? 0.5 : 0);
          if (d <= tol && d < bd) { bd = d; best = h; }
        }
        if (best) return { kind: 'box', handle: best };
        const l = boxLocal(b, q);
        const inside = part.kind === 'ellipse' ? (l.x / b.hw) ** 2 + (l.y / b.hh) ** 2 <= 1 : Math.abs(l.x) <= b.hw && Math.abs(l.y) <= b.hh;
        return inside ? { kind: 'box', handle: 'move' } : null;
      }
      case 'gradient': {
        const a = scr({ x: part.x0 * s.w, y: part.y0 * s.h }), b = scr({ x: part.x1 * s.w, y: part.y1 * s.h });
        if (dist(b, e.s) <= tol) return { kind: 'end', end: 1 };
        if (dist(a, e.s) <= tol) return { kind: 'end', end: 0 };
        const vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
        const t = len2 ? Math.max(0, Math.min(1, ((e.s.x - a.x) * vx + (e.s.y - a.y) * vy) / len2)) : 0;
        return Math.hypot(a.x + vx * t - e.s.x, a.y + vy * t - e.s.y) <= tol ? { kind: 'move' } : null;
      }
      case 'polygon': {
        let bi = -1, bd = Infinity;
        for (let i = 0; i < part.pts.length >> 1; i++) {
          const d = dist(scr({ x: part.pts[i * 2] * s.w, y: part.pts[i * 2 + 1] * s.h }), e.s);
          if (d < bd) { bd = d; bi = i; }
        }
        if (bi >= 0 && bd <= tol) return { kind: 'vertex', i: bi };
        return insidePolygon(part.pts, mapping(host).toLayer(e.p)) ? { kind: 'move' } : null;
      }
      case 'stroke': {
        const lp = mapping(host).toLayer(e.p);
        const n = part.pts.length >> 1;
        const R = (part.size * Math.min(s.w, s.h)) / 2 + tol / this.k(host);
        for (let i = 0; i < n; i++) if (Math.hypot((part.pts[i * 2] - lp.x) * s.w, (part.pts[i * 2 + 1] - lp.y) * s.h) <= R) return { kind: 'move' };
        const e2 = nearestEdge(part.pts, lp, false, s.w, s.h);
        return e2.d <= R ? { kind: 'move' } : null;
      }
      case 'raster': {
        const v = this.sample?.(part, mapping(host).toLayer(e.p));
        return v !== null && v !== undefined && v >= 0.5 ? { kind: 'move' } : null;
      }
      default:
        return null;
    }
  }

  /* ---------------------------------------------------------------- dragging */

  /** Starts dragging what is under the pointer; false when nothing of the selection is there. */
  down(host: ToolHost, e: ToolEvent, grab: Grab | null = this.grabAt(host, e)): boolean {
    const sel = this.current(host);
    if (!sel || !grab) return false;
    this.touch = e.pointerType === 'touch';
    if (grab.kind === 'vertex') this.vertex = grab.i;
    if (grab.kind === 'end') this.end = grab.end;
    const from = this.layerPx(host, e.p);
    this.drag = { grab, from, to: from, part0: sel.part, draft: sel.part, moved: false };
    host.redrawOverlay();
    return true;
  }

  move(host: ToolHost, e: ToolEvent): boolean {
    const d = this.drag, sel = this.sel;
    if (!d || !sel) return false;
    const to = this.layerPx(host, e.p);
    if (!d.moved && dist(to, d.from) * this.k(host) < 2) return true;
    d.moved = true;
    d.to = to;
    d.draft = this.dragged(host, d.part0, d.grab, d.from, to, e);
    if (d.part0.kind !== 'raster') host.preview({ layer: sel.layer, part: d.draft, replace: sel.index });
    host.redrawOverlay();
    return true;
  }

  up(host: ToolHost): boolean {
    const d = this.drag, sel = this.sel;
    if (!d || !sel) return false;
    this.drag = null;
    host.preview(null);
    if (d.moved) {
      if (d.part0.kind === 'raster') {
        const s = canvasSize(host);
        this.onRasterMove?.(sel, (d.to.x - d.from.x) / s.w, (d.to.y - d.from.y) / s.h);
      } else if (replacePart(sel.layer, sel.index, d.draft)) {
        sel.part = d.draft;
        host.say(describeChange(d.grab));
      }
    }
    host.redrawOverlay();
    this.onChange?.();
    return true;
  }

  cancel(host: ToolHost): void {
    if (!this.drag) return;
    this.drag = null;
    host.preview(null);
    host.redrawOverlay();
  }

  /** The part after a drag from → to (layer px). */
  private dragged(host: ToolHost, part: MaskPart, grab: Grab, from: Pt, to: Pt, e: Pick<ToolEvent, 'shift' | 'alt'>): MaskPart {
    const { s } = this.px(host);
    const dx = (to.x - from.x) / s.w, dy = (to.y - from.y) / s.h;
    switch (part.kind) {
      case 'rect': case 'ellipse': {
        if (grab.kind !== 'box') return part;
        const b = dragBox(toPx(part, s), grab.handle, from, to, { keep: e.shift, centre: e.alt });
        return withBox(part, fromPx(b, s));
      }
      case 'gradient': {
        const r = (v: number) => Math.round(v * 1e6) / 1e6;
        if (grab.kind === 'end') {
          let x = to.x, y = to.y;
          if (e.shift) {
            // snap the direction to 45° steps around the other end
            const ox = (grab.end ? part.x0 : part.x1) * s.w, oy = (grab.end ? part.y0 : part.y1) * s.h;
            const a = Math.round(Math.atan2(y - oy, x - ox) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(x - ox, y - oy);
            x = ox + Math.cos(a) * l; y = oy + Math.sin(a) * l;
          }
          return grab.end ? { ...part, x1: r(x / s.w), y1: r(y / s.h) } : { ...part, x0: r(x / s.w), y0: r(y / s.h) };
        }
        return movePart(part, dx, dy);
      }
      case 'polygon':
        if (grab.kind === 'vertex') return { ...part, pts: roundPts(moveVertex(part.pts, grab.i, { x: to.x / s.w, y: to.y / s.h })) };
        return { ...movePart(part, dx, dy), pts: roundPts(movePart(part, dx, dy).pts) };
      case 'stroke':
        return { ...movePart(part, dx, dy), pts: roundPts(movePart(part, dx, dy).pts) };
      default:
        // rasters: the picture is re-made when the drag ends (the drag keeps the offset); colours do not move
        return part;
    }
  }

  /* ---------------------------------------------------------------- keyboard */

  /**
   * Arrows move the selection by one pixel (⇧ ten); ⌥ + arrows resize a shape (or move a gradient's active
   * end); [ ] rotate a shape by 1° (⇧ 15°); Tab switches a gradient's end; Backspace/Delete removes the
   * selected vertex (polygons) or the part (`allowDelete`); Escape drops the selection.
   */
  key(host: ToolHost, e: KeyboardEvent, o: { allowDelete?: boolean } = {}): boolean {
    const sel = this.current(host);
    if (!sel) return false;
    this.kbd = true;
    const { s } = this.px(host);
    const step = (e.shiftKey ? 10 : 1);
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const part = sel.part;
    let next: MaskPart | null = null;
    let msg = '';
    if (e.key in arrows) {
      const [ax, ay] = arrows[e.key];
      if (e.altKey && (part.kind === 'rect' || part.kind === 'ellipse')) {
        const b = toPx(part, s);
        const nb: PxBox = { ...b, hw: Math.max(1, b.hw + (ax * step) / 2), hh: Math.max(1, b.hh - (ay * step) / 2) };
        // grow from the top-left corner in the box's own axes, like dragging the se handle
        const c = boxPoint(b, (nb.hw - b.hw), (nb.hh - b.hh));
        next = withBox(part, fromPx({ ...nb, cx: c.x, cy: c.y }, s));
        msg = `Tamaño ${Math.round(nb.hw * 2)} × ${Math.round(nb.hh * 2)} px`;
      } else if (e.altKey && part.kind === 'gradient') {
        const r = (v: number) => Math.round(v * 1e6) / 1e6;
        next = this.end ? { ...part, x1: r(part.x1 + (ax * step) / s.w), y1: r(part.y1 + (ay * step) / s.h) } : { ...part, x0: r(part.x0 + (ax * step) / s.w), y0: r(part.y0 + (ay * step) / s.h) };
        msg = this.end ? 'Final del degradado movido' : 'Inicio del degradado movido';
      } else if (part.kind === 'polygon' && this.vertex >= 0) {
        const i = this.vertex;
        next = { ...part, pts: roundPts(moveVertex(part.pts, i, { x: part.pts[i * 2] + (ax * step) / s.w, y: part.pts[i * 2 + 1] + (ay * step) / s.h })) };
        msg = `Vértice ${i + 1} movido`;
      } else if (part.kind === 'raster') {
        this.onRasterMove?.(sel, (ax * step) / s.w, (ay * step) / s.h);
        return true;
      } else if (part.kind !== 'color') {
        const m = movePart(part, (ax * step) / s.w, (ay * step) / s.h);
        next = 'pts' in m ? { ...m, pts: roundPts((m as { pts: number[] }).pts) } as MaskPart : m;
        msg = 'Parte movida';
      }
    } else if ((e.key === '[' || e.key === ']') && (part.kind === 'rect' || part.kind === 'ellipse') && !e.metaKey && !e.ctrlKey) {
      const d = (e.key === ']' ? 1 : -1) * (e.shiftKey ? 15 : 1);
      next = { ...part, rot: normDeg(part.rot + d) } as MaskShapePart;
      msg = `Giro ${Math.round(normDeg(part.rot + d))}°`;
    } else if (e.key === 'Tab' && part.kind === 'gradient') {
      this.end = this.end ? 0 : 1;
      host.say(this.end ? 'Final del degradado: usa ⌥ y las flechas para moverlo' : 'Inicio del degradado: usa ⌥ y las flechas para moverlo');
      host.redrawOverlay();
      return true;
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && part.kind === 'polygon' && this.vertex >= 0) {
      if (part.pts.length <= 6) { host.say('Un polígono necesita al menos tres vértices.'); return true; }
      next = { ...part, pts: removeVertex(part.pts, this.vertex) };
      msg = `Vértice ${this.vertex + 1} borrado`;
      this.vertex = Math.min(this.vertex, (next.pts.length >> 1) - 1);
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && o.allowDelete) {
      if (removePart(sel.layer, sel.index)) {
        host.say('Parte borrada de la máscara');
        this.clear();
        host.redrawOverlay();
      }
      return true;
    } else if (e.key === 'Escape') {
      this.clear();
      host.say('Selección de parte quitada');
      host.redrawOverlay();
      return true;
    }
    if (!next) return false;
    // a burst of keys is one undo step (same key within the store's coalescing window)
    if (replacePart(sel.layer, sel.index, next, 'teclado')) {
      sel.part = next;
      if (msg) host.say(msg);
      host.redrawOverlay();
      this.onChange?.();
    }
    return true;
  }

  /* ---------------------------------------------------------------- overlay */

  draw(ctx: CanvasRenderingContext2D, host: ToolHost): void {
    const sel = this.current(host);
    if (!sel) return;
    const part = this.drag?.draft ?? sel.part;
    drawPart(ctx, host, part, { handles: true, grab: this.drag?.grab ?? null, vertex: this.vertex, end: this.kbd ? this.end : undefined, touch: this.touch, dragging: !!this.drag });
    if (this.drag?.moved && part.kind === 'raster') {
      const scr = this.scr(host), d = this.drag;
      const a = scr(d.from), b = scr(d.to);
      draw.segment(ctx, a, b, { dash: [4, 3] });
      draw.handle(ctx, b, { active: true });
      draw.tag(ctx, { x: b.x + 10, y: b.y - 14 }, `${Math.round(d.to.x - d.from.x)}, ${Math.round(d.to.y - d.from.y)} px`);
    }
  }
}

function describeChange(g: Grab): string {
  if (g.kind === 'box') return g.handle === 'rot' ? 'Forma girada' : g.handle === 'move' ? 'Forma movida' : 'Forma redimensionada';
  if (g.kind === 'end') return g.end ? 'Final del degradado movido' : 'Inicio del degradado movido';
  if (g.kind === 'vertex') return `Vértice ${g.i + 1} movido`;
  return 'Parte movida';
}

/**
 * Draws a part's outline (and its handles) on the overlay, in the target layer's space. Used for the selection
 * and for parts being drawn.
 */
export function drawPart(
  ctx: CanvasRenderingContext2D, host: ToolHost, part: MaskPart,
  o: { handles?: boolean; grab?: Grab | null; vertex?: number; end?: 0 | 1; touch?: boolean; dragging?: boolean; dash?: number[] } = {},
): void {
  const s = canvasSize(host), m = mapping(host), v = host.view();
  const scr = (q: Pt) => v.toScreen(m.toFrame({ x: q.x / s.w, y: q.y / s.h }));
  const k = (v.frame.w / Math.max(1, s.w)) * m.scale;
  const hs = o.touch ? 11 : 7;
  switch (part.kind) {
    case 'rect': case 'ellipse': {
      const b = toPx(part, s);
      const corners = (['nw', 'ne', 'se', 'sw'] as const).map(h => scr(handlePoints(b, 0)[h]));
      const a = b.a + (m.rot * Math.PI) / 180;
      if (part.kind === 'ellipse') {
        draw.ellipse(ctx, scr({ x: b.cx, y: b.cy }), b.hw * k, b.hh * k, a, { dash: o.dash });
        if (o.handles) draw.quad(ctx, corners, { dash: [2, 3], alpha: 0.55 });
      } else draw.quad(ctx, corners, { dash: o.dash });
      if (o.handles) {
        const hp = handlePoints(b, ROT_GAP / k);
        const top = scr(boxPoint(b, 0, -b.hh)), rot = scr(hp.rot);
        draw.segment(ctx, top, rot);
        const g = o.grab?.kind === 'box' ? o.grab.handle : null;
        draw.handle(ctx, rot, { round: true, active: g === 'rot', size: hs });
        for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) draw.handle(ctx, scr(hp[h]), { active: g === h, size: hs });
        if (o.dragging && g) {
          const lab = g === 'rot' ? `${Math.round(normDeg((b.a * 180) / Math.PI))}°` : `${Math.round(b.hw * 2)} × ${Math.round(b.hh * 2)} px`;
          const at = scr(boxPoint(b, 0, b.hh));
          draw.tag(ctx, { x: at.x, y: at.y + 18 }, lab, { align: 'center' });
        }
      }
      break;
    }
    case 'gradient':
      drawGradient(ctx, part, scr, s, k, o);
      break;
    case 'polygon': {
      const pts: Pt[] = [];
      for (let i = 0; i < part.pts.length >> 1; i++) pts.push(scr({ x: part.pts[i * 2] * s.w, y: part.pts[i * 2 + 1] * s.h }));
      draw.polyline(ctx, pts, true, { dash: o.dash });
      if (o.handles) pts.forEach((q, i) => draw.handle(ctx, q, { size: o.touch ? 9 : 5, active: i === o.vertex || (o.grab?.kind === 'vertex' && o.grab.i === i) }));
      break;
    }
    case 'stroke': {
      const pts: Pt[] = [];
      for (let i = 0; i < part.pts.length >> 1; i++) pts.push(scr({ x: part.pts[i * 2] * s.w, y: part.pts[i * 2 + 1] * s.h }));
      const r = ((part.size * Math.min(s.w, s.h)) / 2) * k;
      if (pts.length === 1) draw.circle(ctx, pts[0], r, { dash: [3, 3] });
      else {
        draw.polyline(ctx, pts, false, { dash: [3, 3], alpha: 0.8 });
        draw.circle(ctx, pts[0], r, { alpha: 0.6 });
        draw.circle(ctx, pts[pts.length - 1], r, { alpha: 0.6 });
      }
      break;
    }
    default:
      break;
  }
}

function drawGradient(
  ctx: CanvasRenderingContext2D, g: MaskGradientPart, scr: (q: Pt) => Pt, s: { w: number; h: number }, k: number,
  o: { handles?: boolean; grab?: Grab | null; end?: 0 | 1; touch?: boolean; dragging?: boolean },
): void {
  const a = scr({ x: g.x0 * s.w, y: g.y0 * s.h }), b = scr({ x: g.x1 * s.w, y: g.y1 * s.h });
  if (g.shape === 'radial') {
    draw.circle(ctx, a, dist(a, b), { dash: [4, 4] });
  } else {
    // two short ticks across the ends show where the ramp starts and stops
    const vx = b.x - a.x, vy = b.y - a.y, l = Math.hypot(vx, vy) || 1, nx = -vy / l * 10, ny = vx / l * 10;
    draw.segment(ctx, { x: a.x - nx, y: a.y - ny }, { x: a.x + nx, y: a.y + ny });
    draw.segment(ctx, { x: b.x - nx, y: b.y - ny }, { x: b.x + nx, y: b.y + ny });
  }
  draw.segment(ctx, a, b);
  void k;
  if (o.handles) {
    const hs = o.touch ? 11 : 8;
    const ge = o.grab?.kind === 'end' ? o.grab.end : null;
    draw.handle(ctx, a, { size: hs, active: ge === 0 || (ge === null && o.end === 0 && !o.dragging) });
    draw.handle(ctx, b, { size: hs, round: true, active: ge === 1 || (ge === null && o.end === 1 && !o.dragging) });
    draw.tag(ctx, { x: a.x + 12, y: a.y - 14 }, `${Math.round(g.alpha0 * 100)} %`);
    draw.tag(ctx, { x: b.x + 12, y: b.y - 14 }, `${Math.round(g.alpha1 * 100)} %`);
  }
}

/** Draws a part that is being made (dashed while it is not in the mask yet). */
export const drawDraft = (ctx: CanvasRenderingContext2D, host: ToolHost, part: MaskPart, touch = false) =>
  drawPart(ctx, host, part, { handles: false, touch });

export { boxLocal };
