/**
 * How the tools draw on the overlay («Telar de precisión»): 1 px bone hairlines over a soft ink halo, so a line
 * reads on a white sky and on a black coat alike; small square handles (bone, ink edge); vermilion only for the
 * handle being used. Nothing animates (no marching ants), so reduced motion needs nothing special.
 * The context is already scaled to viewport CSS px (see Tool.overlay).
 */
import type { Pt } from './geom';

export const INK = '#0c0b0a';
export const BONE = '#ede6da';
export const SIGNAL = '#ff5b1f';
const HALO = 'rgba(12, 11, 10, 0.55)';

type Ctx = CanvasRenderingContext2D;

/** A crisp 1 px line: half-pixel aligned when the device draws 1 CSS px as 1 device px. */
const snap = (v: number) => Math.round(v - 0.5) + 0.5;

/** Strokes the current path as a hairline with its halo (dash optional). */
export function hairPath(ctx: Ctx, o: { dash?: number[]; alpha?: number; color?: string } = {}): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.setLineDash([]);
  ctx.strokeStyle = HALO;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = o.color ?? BONE;
  ctx.lineWidth = 1;
  if (o.dash) ctx.setLineDash(o.dash);
  ctx.stroke();
  ctx.restore();
}

export function polyline(ctx: Ctx, pts: readonly Pt[], closed: boolean, o: Parameters<typeof hairPath>[1] = {}): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed) ctx.closePath();
  hairPath(ctx, o);
}

export function segment(ctx: Ctx, a: Pt, b: Pt, o: Parameters<typeof hairPath>[1] = {}): void {
  polyline(ctx, [a, b], false, o);
}

/** An axis-aligned or rotated box (corners in screen px, in order). */
export const quad = (ctx: Ctx, corners: readonly Pt[], o: Parameters<typeof hairPath>[1] = {}) => polyline(ctx, corners, true, o);

/** An ellipse through a rotated box: centre, half axes (screen px), angle (radians). */
export function ellipse(ctx: Ctx, c: Pt, rx: number, ry: number, a: number, o: Parameters<typeof hairPath>[1] = {}): void {
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, Math.max(0.5, rx), Math.max(0.5, ry), a, 0, Math.PI * 2);
  hairPath(ctx, o);
}

export function circle(ctx: Ctx, c: Pt, r: number, o: Parameters<typeof hairPath>[1] = {}): void {
  ctx.beginPath();
  ctx.arc(c.x, c.y, Math.max(0.5, r), 0, Math.PI * 2);
  hairPath(ctx, o);
}

/** A square handle; `active` = the one being dragged or focused (vermilion). `size` in CSS px. */
export function handle(ctx: Ctx, p: Pt, o: { active?: boolean; size?: number; round?: boolean } = {}): void {
  const s = o.size ?? 7, h = s / 2;
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  if (o.round) ctx.arc(p.x, p.y, h, 0, Math.PI * 2);
  else ctx.rect(snap(p.x - h) , snap(p.y - h), s - 1, s - 1);
  ctx.fillStyle = o.active ? SIGNAL : BONE;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

/** A small crosshair (the keyboard cursor, the colour probe). */
export function crosshair(ctx: Ctx, p: Pt, r = 7, active = false): void {
  const o = { color: active ? SIGNAL : BONE };
  segment(ctx, { x: p.x - r, y: p.y }, { x: p.x - 2, y: p.y }, o);
  segment(ctx, { x: p.x + 2, y: p.y }, { x: p.x + r, y: p.y }, o);
  segment(ctx, { x: p.x, y: p.y - r }, { x: p.x, y: p.y - 2 }, o);
  segment(ctx, { x: p.x, y: p.y + 2 }, { x: p.x, y: p.y + r }, o);
}

/** A label in mono type on an ink chip (sizes, angles, point numbers). */
export function tag(ctx: Ctx, p: Pt, text: string, o: { align?: 'left' | 'center'; active?: boolean } = {}): void {
  ctx.save();
  ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
  const w = ctx.measureText(text).width + 10, h = 18;
  const x = o.align === 'center' ? p.x - w / 2 : p.x, y = p.y - h / 2;
  ctx.fillStyle = 'rgba(12, 11, 10, 0.82)';
  ctx.beginPath();
  ctx.roundRect(Math.round(x), Math.round(y), Math.round(w), h, 4);
  ctx.fill();
  ctx.fillStyle = o.active ? SIGNAL : BONE;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, Math.round(x + 5), Math.round(y + h / 2) + 0.5);
  ctx.restore();
}

/**
 * A round loupe above a touch point: the picture magnified around it, a crosshair on the pixel, and the colour
 * as a chip (so the finger does not hide what it picks).
 */
export function loupe(ctx: Ctx, at: Pt, src: CanvasImageSource, srcPt: Pt, color: string, o: { radius?: number; zoom?: number; viewH?: number } = {}): void {
  const R = o.radius ?? 46, Z = o.zoom ?? 6;
  // above the finger, or below it near the top edge
  const cy = at.y - R - 36 < R + 4 ? at.y + R + 36 : at.y - R - 36;
  const c = { x: at.x, y: cy };
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  const span = (R * 2) / Z;
  ctx.drawImage(src, srcPt.x - span / 2, srcPt.y - span / 2, span, span, c.x - R, c.y - R, R * 2, R * 2);
  ctx.restore();
  hairPath(ctx);
  ctx.restore();
  crosshair(ctx, c, 8);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(c.x - 14, c.y + R - 12, 28, 14, 3);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}
