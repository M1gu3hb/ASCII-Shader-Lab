/**
 * Draws the editor's canvas from a plain description of what is on screen (Canvas 2D, CSS pixels scaled
 * by devicePixelRatio). No state: the canvas component builds a Scene and calls drawScene when dirty.
 */
import type { Contour, Glyph, GlyphDoc, Pt } from '../../doc';
import type { Box } from './math';
import { boxHandles } from './hit';
import type { SnapLine } from './snap';
import { rasterBox } from './raster';
import { nodeKey } from './selection';
import { toScreen, type View } from './view';

export const RULER = 18;

export interface Palette {
  bg: string; ruler: string; rulerText: string; rulerLine: string; box: string; metric: string; baseline: string; label: string;
  guide: string; guideHot: string; outline: string; fill: string; comp: string; compLine: string; node: string; nodeLine: string;
  sel: string; handle: string; anchor: string; snap: string; marquee: string; danger: string; grid: string; focus: string;
}

export const DEFAULT_PALETTE: Palette = {
  bg: '#0e0d0c', ruler: '#151412', rulerText: '#7f786d', rulerLine: 'rgba(237,230,218,.14)', box: 'rgba(237,230,218,.035)',
  metric: 'rgba(237,230,218,.15)', baseline: 'rgba(237,230,218,.42)', label: '#8c857a', guide: 'rgba(110,212,200,.7)', guideHot: '#8ff0e2',
  outline: '#ede6da', fill: 'rgba(237,230,218,.2)', comp: 'rgba(159,196,255,.18)', compLine: 'rgba(159,196,255,.65)',
  node: '#0e0d0c', nodeLine: '#ede6da', sel: '#ff5b1f', handle: 'rgba(237,230,218,.5)', anchor: '#ffcf70', snap: '#f27ad8',
  marquee: 'rgba(255,91,31,.08)', danger: '#ff7a6b', grid: 'rgba(237,230,218,.055)', focus: '#ffb08a',
};

/** The palette from the editor's CSS custom properties (--ge-*), so the canvas follows the stylesheet. */
export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const out = { ...DEFAULT_PALETTE };
  for (const k of Object.keys(out) as Array<keyof Palette>) {
    const v = cs.getPropertyValue('--ge-' + k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())).trim();
    if (v) out[k] = v;
  }
  return out;
}

export interface Scene {
  w: number; h: number; dpr: number; v: View; pal: Palette;
  doc: GlyphDoc; g: Glyph; adv: number;
  /** The drawing's box, components included (for the side bearings). */
  fullBox: Box | null;
  compContours: Contour[][];
  selNodes: Set<string>;
  selContours: Set<number>;
  selComponents: Set<number>;
  selAnchors: Set<number>;
  fill: boolean;
  showHandles: boolean;
  image?: (CanvasImageSource & { width: number; height: number }) | undefined;
  transformBox: Box | null;
  hoverNode?: string | null;
  hoverSeg?: { p: Pt } | null;
  hoverGuide?: number | null;
  focusNode?: string | null;
  pen?: { ci: number | null; cursor: Pt | null; closeHot: boolean } | null;
  pencil?: { pts: Pt[]; width: number; closed: boolean } | null;
  shape?: { kind: 'rectangulo' | 'elipse'; box: Box } | null;
  marquee?: Box | null;
  snap?: { lines: SnapLine[]; node?: Pt } | null;
  guideDrag?: { axis: 'x' | 'y'; at: number; outside: boolean; index: number | null } | null;
  grid: number;
  coarse: boolean;
  moveImage: boolean;
}

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('-', '−');

function tracePath(ctx: CanvasRenderingContext2D, c: Contour, v: View) {
  const ns = c.nodes;
  if (!ns.length) return;
  const p0 = toScreen(v, ns[0]);
  ctx.moveTo(p0.x, p0.y);
  const n = c.closed ? ns.length : ns.length - 1;
  for (let i = 0; i < n; i++) {
    const a = ns[i], b = ns[(i + 1) % ns.length];
    const q = toScreen(v, b);
    if (a.ho || b.hi) {
      const h1 = toScreen(v, a.ho ?? a), h2 = toScreen(v, b.hi ?? b);
      ctx.bezierCurveTo(h1.x, h1.y, h2.x, h2.y, q.x, q.y);
    } else ctx.lineTo(q.x, q.y);
  }
  if (c.closed) ctx.closePath();
}

function niceStep(s: number, minPx: number): number {
  const raw = minPx / s;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

function hline(ctx: CanvasRenderingContext2D, y: number, x0: number, x1: number) {
  const yy = Math.round(y) + 0.5;
  ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
}
function vline(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number) {
  const xx = Math.round(x) + 0.5;
  ctx.beginPath(); ctx.moveTo(xx, y0); ctx.lineTo(xx, y1); ctx.stroke();
}

export function drawScene(ctx: CanvasRenderingContext2D, s: Scene) {
  const { w, h, v, pal, doc, g } = s;
  const m = doc.metrics;
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  const X = (x: number) => v.ox + x * v.s;
  const Y = (y: number) => v.oy - y * v.s;
  const L = RULER, T = RULER;

  // the advance box, from the descender to the ascender
  ctx.fillStyle = pal.box;
  ctx.fillRect(X(0), Y(m.asc), s.adv * v.s, (m.asc - m.desc) * v.s);

  // grid (only when snapping to it, and only when its lines are far enough apart to read)
  if (s.grid > 0 && s.grid * v.s >= 7) {
    ctx.strokeStyle = pal.grid;
    const x0 = Math.floor((L - v.ox) / v.s / s.grid) * s.grid, x1 = (w - v.ox) / v.s;
    for (let x = x0; x <= x1; x += s.grid) vline(ctx, X(x), T, h);
    const y0 = Math.floor((v.oy - h) / v.s / s.grid) * s.grid, y1 = (v.oy - T) / v.s;
    for (let y = y0; y <= y1; y += s.grid) hline(ctx, Y(y), L, w);
  }

  // metric lines with their names
  ctx.font = `500 10.5px ${MONO}`;
  ctx.textBaseline = 'bottom';
  const metrics: Array<[string, number, boolean]> = [
    ['Ascendente', m.asc, false], ['Mayúsculas', m.cap, false], ['Altura x', m.xh, false], ['Línea base', 0, true], ['Descendente', m.desc, false],
  ];
  const usedY: number[] = [];
  for (const [name, y, strong] of metrics) {
    ctx.strokeStyle = strong ? pal.baseline : pal.metric;
    hline(ctx, Y(y), L, w);
    const ly = Math.round(Y(y)) - 3;
    if (ly < T + 12 || ly > h - 2 || usedY.some(u => Math.abs(u - ly) < 12)) continue;
    usedY.push(ly);
    ctx.fillStyle = pal.label;
    ctx.textAlign = 'left';
    ctx.fillText(`${name} ${fmt(y)}`, L + 6, ly);
  }

  // advance: 0 and adv, with the side bearings measured at the baseline
  ctx.strokeStyle = pal.baseline;
  vline(ctx, X(0), T, h);
  vline(ctx, X(s.adv), T, h);
  ctx.fillStyle = pal.label;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const by = Math.round(Y(0)) + 8;
  if (s.fullBox) {
    const sb: Array<[number, number, number]> = [[0, s.fullBox.x0, s.fullBox.x0], [s.fullBox.x1, s.adv, s.adv - s.fullBox.x1]];
    ctx.strokeStyle = pal.label;
    for (const [a, b, val] of sb) {
      const xa = X(a), xb = X(b);
      if (Math.abs(xb - xa) < 2) continue;
      hline(ctx, by, Math.min(xa, xb), Math.max(xa, xb));
      vline(ctx, xa, by - 3, by + 4);
      vline(ctx, xb, by - 3, by + 4);
      if (Math.abs(xb - xa) > 26) ctx.fillText(fmt(val), (xa + xb) / 2, by + 4);
    }
  }
  ctx.textBaseline = 'top';
  ctx.fillText(fmt(s.adv), X(s.adv), Math.min(h - 14, Math.round(Y(m.desc)) + 6));

  // the person's guides
  doc.guides.forEach((gd, i) => {
    const dragging = s.guideDrag?.index === i;
    if (dragging) return;
    ctx.strokeStyle = s.hoverGuide === i ? pal.guideHot : pal.guide;
    ctx.lineWidth = s.hoverGuide === i ? 2 : 1;
    if (gd.axis === 'x') vline(ctx, X(gd.at), T, h); else hline(ctx, Y(gd.at), L, w);
  });
  ctx.lineWidth = 1;

  // the picture under the drawing (45% opacity)
  const r = g.raster;
  if (r && r.visible && s.image) {
    const rb = rasterBox(r);
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.imageSmoothingEnabled = v.s * r.s < 2;
    try { ctx.drawImage(s.image, r.crop.x, r.crop.y, r.crop.w, r.crop.h, X(rb.x0), Y(rb.y1), (rb.x1 - rb.x0) * v.s, (rb.y1 - rb.y0) * v.s); } catch { /* not decoded yet */ }
    ctx.restore();
    if (s.moveImage) {
      ctx.strokeStyle = pal.anchor;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(Math.round(X(rb.x0)) + 0.5, Math.round(Y(rb.y1)) + 0.5, Math.round((rb.x1 - rb.x0) * v.s), Math.round((rb.y1 - rb.y0) * v.s));
      ctx.setLineDash([]);
    }
  }

  // components, in their own tint
  s.compContours.forEach((cs, i) => {
    if (!cs.length) return;
    ctx.beginPath();
    for (const c of cs) if (c.closed) tracePath(ctx, c, v);
    ctx.fillStyle = pal.comp;
    ctx.fill('nonzero');
    ctx.strokeStyle = s.selComponents.has(i) ? pal.sel : pal.compLine;
    ctx.lineWidth = s.selComponents.has(i) ? 2 : 1;
    ctx.beginPath();
    for (const c of cs) tracePath(ctx, c, v);
    ctx.stroke();
    ctx.lineWidth = 1;
  });

  // the glyph: fill (non-zero), then outlines
  if (s.fill) {
    ctx.beginPath();
    for (const c of g.contours) if (c.closed && c.nodes.length > 1) tracePath(ctx, c, v);
    ctx.fillStyle = pal.fill;
    ctx.fill('nonzero');
  }
  g.contours.forEach((c, ci) => {
    ctx.beginPath();
    tracePath(ctx, c, v);
    const whole = s.selContours.has(ci);
    ctx.strokeStyle = whole ? pal.sel : pal.outline;
    ctx.lineWidth = whole ? 2 : 1.25;
    if (!c.closed) ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  ctx.lineWidth = 1;

  // a segment under the pen: where the new node would go
  if (s.hoverSeg) {
    const p = toScreen(v, s.hoverSeg.p);
    ctx.strokeStyle = pal.sel;
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 3, p.y); ctx.lineTo(p.x + 3, p.y); ctx.moveTo(p.x, p.y - 3); ctx.lineTo(p.x, p.y + 3); ctx.stroke();
  }

  const NS = s.coarse ? 10 : 7, HS = s.coarse ? 8 : 5;
  // handles
  if (s.showHandles) {
    g.contours.forEach((c, ci) => c.nodes.forEach((n, ni) => {
      const p = toScreen(v, n);
      for (const hk of ['hi', 'ho'] as const) {
        const hp = n[hk];
        if (!hp || (hp.x === n.x && hp.y === n.y)) continue;
        const q = toScreen(v, hp);
        const hot = s.selNodes.has(nodeKey(ci, ni));
        ctx.strokeStyle = hot ? pal.sel : pal.handle;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        ctx.fillStyle = hot ? pal.sel : pal.bg;
        ctx.beginPath(); ctx.arc(q.x, q.y, HS / 2 + 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = hot ? pal.sel : pal.outline;
        ctx.stroke();
      }
    }));
  }

  // nodes: corner = square, smooth = circle; the first of each contour carries its direction
  g.contours.forEach((c, ci) => c.nodes.forEach((n, ni) => {
    const p = toScreen(v, n);
    const k = nodeKey(ci, ni);
    const on = s.selNodes.has(k);
    const hot = s.hoverNode === k || (s.pen?.closeHot && s.pen.ci === ci && ni === 0);
    ctx.fillStyle = on ? pal.sel : pal.node;
    ctx.strokeStyle = on ? pal.sel : hot ? pal.sel : pal.nodeLine;
    ctx.lineWidth = hot && !on ? 2 : 1.25;
    const r2 = (hot ? NS + 3 : NS) / 2;
    ctx.beginPath();
    if (n.smooth) ctx.arc(p.x, p.y, r2, 0, Math.PI * 2);
    else ctx.rect(Math.round(p.x - r2) + 0.5, Math.round(p.y - r2) + 0.5, Math.round(r2 * 2) - 1, Math.round(r2 * 2) - 1);
    ctx.fill();
    ctx.stroke();
    if (ni === 0 && c.nodes.length > 1) {
      // direction: a small arrow pointing along the first segment
      const nx = c.nodes[1], tgt = toScreen(v, n.ho ?? nx);
      let dx = tgt.x - p.x, dy = tgt.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        dx /= d; dy /= d;
        const ax = p.x + dx * (NS + 7), ay = p.y + dy * (NS + 7);
        ctx.fillStyle = on ? pal.sel : pal.nodeLine;
        ctx.beginPath();
        ctx.moveTo(ax + dx * 5, ay + dy * 5);
        ctx.lineTo(ax - dy * 3.5, ay + dx * 3.5);
        ctx.lineTo(ax + dy * 3.5, ay - dx * 3.5);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (s.focusNode === k) {
      ctx.strokeStyle = pal.focus;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, NS + 4, 0, Math.PI * 2); ctx.stroke();
    }
  }));
  ctx.lineWidth = 1;

  // anchors: crosses with names
  ctx.font = `500 10.5px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  g.anchors.forEach((a, i) => {
    const p = toScreen(v, a);
    const on = s.selAnchors.has(i);
    ctx.strokeStyle = on ? pal.sel : pal.anchor;
    ctx.lineWidth = on ? 2 : 1.5;
    ctx.beginPath(); ctx.moveTo(p.x - 5, p.y - 5); ctx.lineTo(p.x + 5, p.y + 5); ctx.moveTo(p.x + 5, p.y - 5); ctx.lineTo(p.x - 5, p.y + 5); ctx.stroke();
    ctx.fillStyle = on ? pal.sel : pal.anchor;
    ctx.fillText(a.name, p.x + 7, p.y - 4);
  });
  ctx.lineWidth = 1;

  // transform box: 8 scale handles and the rotate handle
  if (s.transformBox) {
    const b = s.transformBox;
    const a = toScreen(v, { x: b.x0, y: b.y1 }), c = toScreen(v, { x: b.x1, y: b.y0 });
    ctx.strokeStyle = pal.sel;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(c.x - a.x), Math.round(c.y - a.y));
    ctx.setLineDash([]);
    const hs = boxHandles(b, v);
    const rot = hs.find(x => x.id === 'rot')!;
    ctx.beginPath(); ctx.moveTo((a.x + c.x) / 2, a.y); ctx.lineTo(rot.p.x, rot.p.y); ctx.stroke();
    const BS = s.coarse ? 10 : 7;
    for (const hd of hs) {
      ctx.fillStyle = pal.outline;
      ctx.strokeStyle = pal.sel;
      ctx.beginPath();
      if (hd.id === 'rot') ctx.arc(hd.p.x, hd.p.y, BS / 2 + 1, 0, Math.PI * 2);
      else ctx.rect(Math.round(hd.p.x - BS / 2) + 0.5, Math.round(hd.p.y - BS / 2) + 0.5, BS - 1, BS - 1);
      ctx.fill(); ctx.stroke();
    }
  }

  // pen: the next segment follows the pointer
  if (s.pen && s.pen.ci !== null && s.pen.cursor) {
    const c = g.contours[s.pen.ci];
    const last = c?.nodes[c.nodes.length - 1];
    if (last) {
      const a = toScreen(v, last), b = toScreen(v, s.pen.cursor);
      ctx.strokeStyle = pal.sel;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      if (last.ho) { const h1 = toScreen(v, last.ho); ctx.bezierCurveTo(h1.x, h1.y, b.x, b.y, b.x, b.y); } else ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // pencil: the line as drawn, and its width
  if (s.pencil && s.pencil.pts.length > 1) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    s.pencil.pts.forEach((p, i) => { const q = toScreen(v, p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
    if (s.pencil.closed) { ctx.closePath(); ctx.fillStyle = pal.marquee; ctx.fill(); ctx.strokeStyle = pal.sel; ctx.lineWidth = 1.5; }
    else { ctx.strokeStyle = 'rgba(255,91,31,.35)'; ctx.lineWidth = Math.max(1, s.pencil.width * v.s); }
    ctx.stroke();
    ctx.restore();
  }

  if (s.shape) {
    const b = s.shape.box;
    const a = toScreen(v, { x: b.x0, y: b.y1 }), c = toScreen(v, { x: b.x1, y: b.y0 });
    ctx.strokeStyle = pal.sel;
    ctx.fillStyle = pal.marquee;
    ctx.beginPath();
    if (s.shape.kind === 'rectangulo') ctx.rect(a.x, a.y, c.x - a.x, c.y - a.y);
    else ctx.ellipse((a.x + c.x) / 2, (a.y + c.y) / 2, Math.abs(c.x - a.x) / 2, Math.abs(c.y - a.y) / 2, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = pal.sel;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${fmt(b.x1 - b.x0)} × ${fmt(b.y1 - b.y0)}`, c.x + 6, c.y + 4);
  }

  if (s.marquee) {
    const b = s.marquee;
    const a = toScreen(v, { x: Math.min(b.x0, b.x1), y: Math.max(b.y0, b.y1) }), c = toScreen(v, { x: Math.max(b.x0, b.x1), y: Math.min(b.y0, b.y1) });
    ctx.fillStyle = pal.marquee;
    ctx.fillRect(a.x, a.y, c.x - a.x, c.y - a.y);
    ctx.strokeStyle = pal.sel;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(c.x - a.x), Math.round(c.y - a.y));
    ctx.setLineDash([]);
  }

  // what the point snapped to
  if (s.snap) {
    ctx.strokeStyle = pal.snap;
    for (const l of s.snap.lines) { if (l.axis === 'x') vline(ctx, X(l.at), T, h); else hline(ctx, Y(l.at), L, w); }
    if (s.snap.node) {
      const p = toScreen(v, s.snap.node);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  if (s.guideDrag) {
    const gd = s.guideDrag;
    ctx.strokeStyle = gd.outside ? pal.danger : pal.guideHot;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(gd.outside ? [5, 4] : []);
    if (gd.axis === 'x') vline(ctx, X(gd.at), T, h); else hline(ctx, Y(gd.at), L, w);
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.fillStyle = gd.outside ? pal.danger : pal.guideHot;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const label = gd.outside ? 'Suelta para quitarla' : fmt(gd.at);
    if (gd.axis === 'x') ctx.fillText(label, X(gd.at) + 5, T + 4); else ctx.fillText(label, L + 6, Y(gd.at) + 4);
  }

  drawRulers(ctx, s);
}

function drawRulers(ctx: CanvasRenderingContext2D, s: Scene) {
  const { w, h, v, pal } = s;
  ctx.fillStyle = pal.ruler;
  ctx.fillRect(0, 0, w, RULER);
  ctx.fillRect(0, 0, RULER, h);
  ctx.strokeStyle = pal.rulerLine;
  hline(ctx, RULER - 0.5, RULER, w);
  vline(ctx, RULER - 0.5, RULER, h);
  const step = niceStep(v.s, 64);
  ctx.font = `500 9.5px ${MONO}`;
  ctx.fillStyle = pal.rulerText;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (let x = Math.floor((RULER - v.ox) / v.s / step) * step; x <= (w - v.ox) / v.s; x += step) {
    const sx = v.ox + x * v.s;
    if (sx < RULER) continue;
    vline(ctx, sx, RULER - 6, RULER);
    ctx.fillText(fmt(x), Math.round(sx) + 3, 3);
    for (let k = 1; k < 5; k++) { const tx = sx + (k * step * v.s) / 5; if (tx > RULER && tx < w) vline(ctx, tx, RULER - 3, RULER); }
  }
  ctx.save();
  for (let y = Math.floor((v.oy - h) / v.s / step) * step; y <= (v.oy - RULER) / v.s; y += step) {
    const sy = v.oy - y * v.s;
    if (sy < RULER) continue;
    hline(ctx, sy, RULER - 6, RULER);
    ctx.save();
    ctx.translate(3, Math.round(sy) - 3);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(fmt(y), 0, 0);
    ctx.restore();
    for (let k = 1; k < 5; k++) { const ty = sy - (k * step * v.s) / 5; if (ty > RULER && ty < h) hline(ctx, ty, RULER - 3, RULER); }
  }
  ctx.restore();
  // guide marks on the rulers
  ctx.fillStyle = pal.guide;
  for (const gd of s.doc.guides) {
    if (gd.axis === 'x') { const x = v.ox + gd.at * v.s; if (x > RULER) { ctx.beginPath(); ctx.moveTo(x - 4, RULER - 6); ctx.lineTo(x + 4, RULER - 6); ctx.lineTo(x, RULER); ctx.fill(); } }
    else { const y = v.oy - gd.at * v.s; if (y > RULER) { ctx.beginPath(); ctx.moveTo(RULER - 6, y - 4); ctx.lineTo(RULER - 6, y + 4); ctx.lineTo(RULER, y); ctx.fill(); } }
  }
  ctx.fillStyle = pal.ruler;
  ctx.fillRect(0, 0, RULER, RULER);
}
