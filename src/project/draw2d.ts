/**
 * Editorial layers drawn with Canvas 2D: text (wrapped in a box, with tracking and leading, or along an
 * arc, a circle or a spiral) and shapes (frames, lines, brackets, crosshairs, callouts with boxed labels).
 * Positions are frame units; sizes of type are fractions of the frame height; stroke widths and dashes are
 * output px. Everything is multiplied by the render scale, so a preview is the final render made smaller.
 */
import { FONTS, fontById, nearestWeight } from '../engine/catalog';
import type { FontLoader } from '../engine/fonts';
import type { ShapeLayer, TextLayer } from './types';

/** CSS font-family stack of a font id of the catalog, or of a family name typed by the person. */
export function fontStack(font: string): string {
  const f = FONTS.find(x => x.id === font);
  if (f) return f.stack;
  const name = font.replace(/["\\;{}]/g, '').trim();
  return name ? `"${name}", system-ui, sans-serif` : fontById('system').stack;
}

/** The weight a catalog font really has closest to the one asked for. */
export function fontWeight(font: string, weight: number): number {
  const f = FONTS.find(x => x.id === font);
  return f ? nearestWeight(f, weight) : weight;
}

/** Loads a font before drawing with it (catalog ids through the loader; other names through document.fonts). */
export async function ensureFont(fonts: FontLoader, font: string, weight: number, italic: boolean, sample: string): Promise<void> {
  if (FONTS.some(x => x.id === font)) { await fonts.ensure(font, weight, italic, sample.slice(0, 200) || 'Aa'); return; }
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.race([
      document.fonts.load(`${italic ? 'italic ' : ''}${weight} 32px ${fontStack(font)}`, sample.slice(0, 200) || 'Aa'),
      new Promise(res => setTimeout(res, 3000)),
    ]);
  } catch { /* drawn with the fallback */ }
}

const cssFont = (font: string, weight: number, italic: boolean, px: number) =>
  `${italic ? 'italic ' : ''}${fontWeight(font, weight)} ${Math.max(0.5, px).toFixed(3)}px ${fontStack(font)}`;

/* ------------------------------------------------------------------ text */

const hasLetterSpacing = () => typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;

/** Width of a run of text with `track` px between letters. */
function runWidth(ctx: CanvasRenderingContext2D, s: string, track: number, native: boolean): number {
  if (!s) return 0;
  if (native || !track) return ctx.measureText(s).width;
  let w = 0;
  for (const ch of s) w += ctx.measureText(ch).width + track;
  return w - track;
}

function drawRun(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, track: number, native: boolean) {
  if (native || !track) { ctx.fillText(s, x, y); return; }
  for (const ch of s) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + track;
  }
}

/** Lines of a paragraph wrapped at `max` px (words longer than a line are cut by letters). */
export function wrapText(measure: (s: string) => number, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const next = line + w;
      if (!line || measure(next.trimEnd()) <= max) { line = next; continue; }
      out.push(line.trimEnd());
      if (/^\s+$/.test(w)) { line = ''; continue; }
      line = w;
      // a word wider than the box: cut it
      while (measure(line) > max && line.length > 1) {
        let k = line.length - 1;
        while (k > 1 && measure(line.slice(0, k)) > max) k--;
        out.push(line.slice(0, k));
        line = line.slice(k);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Draws a text layer into a canvas of the render size (w×h px). */
export function drawText(ctx: CanvasRenderingContext2D, l: TextLayer, w: number, h: number): void {
  const px = l.size * h;
  if (px < 0.5 || !l.text) return;
  const text = l.upper ? l.text.toLocaleUpperCase('es') : l.text;
  ctx.save();
  ctx.font = cssFont(l.font, l.weight, l.italic, px);
  ctx.fillStyle = l.color;
  ctx.textBaseline = 'alphabetic';
  const track = l.tracking * px;
  const native = hasLetterSpacing();
  if (native) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${track}px`;
  if (l.path) drawOnPath(ctx, l, text, w, h, track, native);
  else {
    const boxW = l.box.w * w, x0 = l.box.x * w;
    const lines = wrapText(s => runWidth(ctx, s, track, native), text, boxW);
    const m = ctx.measureText('Hg');
    const ascent = m.actualBoundingBoxAscent || px * 0.8;
    const lh = px * l.leading;
    let y = l.box.y * h + ascent;
    ctx.textAlign = 'left';
    for (const line of lines) {
      const lw = runWidth(ctx, line, track, native);
      const x = l.align === 'center' ? x0 + (boxW - lw) / 2 : l.align === 'right' ? x0 + boxW - lw : x0;
      drawRun(ctx, line, x, y, track, native);
      y += lh;
    }
  }
  ctx.restore();
}

/** Letters placed one by one along a circle (arc, circle) or an inward spiral, rotated to the path. */
function drawOnPath(ctx: CanvasRenderingContext2D, l: TextLayer, text: string, w: number, h: number, track: number, native: boolean) {
  const p = l.path!;
  const cx = p.cx * w, cy = p.cy * h, R = p.r * h;
  if (R < 1) return;
  if (native) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  const chars = Array.from(text.replace(/\n/g, ' '));
  const adv = chars.map(c => ctx.measureText(c).width + track);
  const total = adv.reduce((a, b) => a + b, 0) - track;
  const start = (p.start * Math.PI) / 180;
  const turns = p.turns ?? 3;
  // radius at an angle θ past the start: constant, or closing to 15 % of R over `turns` turns
  const radius = (dθ: number) => p.kind === 'spiral' ? Math.max(R * 0.15, R - (R * 0.85 * dθ) / (Math.PI * 2 * turns)) : R;
  let θ = p.kind === 'arc' ? start - Math.min(Math.PI, total / R / 2) : start;
  const θ0 = θ;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < chars.length; i++) {
    const r = radius(θ - start);
    const half = adv[i] / 2 / r;
    // a circle or an arc holds one turn of text: what does not fit is left out (never drawn over itself)
    if (p.kind !== 'spiral' && θ + adv[i] / r - θ0 > Math.PI * 2 + 1e-6) break;
    const a = θ + half;
    ctx.save();
    ctx.translate(cx + r * Math.sin(a), cy - r * Math.cos(a));
    ctx.rotate(a);
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    θ += adv[i] / r;
    if (p.kind === 'spiral' && θ - start > Math.PI * 2 * turns) break;
  }
}

/* ------------------------------------------------------------------ shapes */

/** Draws a shape layer (and its label) into a canvas of the render size; `scale` turns output px into render px. */
export function drawShape(ctx: CanvasRenderingContext2D, l: ShapeLayer, w: number, h: number, scale: number): void {
  const P = l.pts;
  const lw = l.width * scale;
  ctx.save();
  ctx.lineWidth = Math.max(0.01, lw);
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  if (l.dash) ctx.setLineDash(l.dash.map(d => d * scale));
  if (l.stroke) ctx.strokeStyle = l.stroke;
  if (l.fill) ctx.fillStyle = l.fill;
  const paint = () => { if (l.fill) ctx.fill(); if (l.stroke && lw > 0) ctx.stroke(); };
  const box = () => ({ x: P[0] * w, y: P[1] * h, bw: P[2] * w, bh: P[3] * h });
  let labelAt: { x: number; y: number; boxed: boolean } | null = null;
  switch (l.shape) {
    case 'rect': {
      const b = box();
      ctx.beginPath(); ctx.rect(b.x, b.y, b.bw, b.bh); paint();
      labelAt = { x: b.x, y: b.y, boxed: false };
      break;
    }
    case 'ellipse': {
      const b = box();
      ctx.beginPath(); ctx.ellipse(b.x + b.bw / 2, b.y + b.bh / 2, Math.abs(b.bw / 2), Math.abs(b.bh / 2), 0, 0, Math.PI * 2); paint();
      labelAt = { x: b.x, y: b.y, boxed: false };
      break;
    }
    case 'bracket': {
      // four corner marks, each arm a fifth of the shorter side
      const b = box(), arm = Math.min(Math.abs(b.bw), Math.abs(b.bh)) * 0.2;
      const x1 = b.x + b.bw, y1 = b.y + b.bh, sx = Math.sign(b.bw) || 1, sy = Math.sign(b.bh) || 1;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + arm * sy); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x + arm * sx, b.y);
      ctx.moveTo(x1 - arm * sx, b.y); ctx.lineTo(x1, b.y); ctx.lineTo(x1, b.y + arm * sy);
      ctx.moveTo(x1, y1 - arm * sy); ctx.lineTo(x1, y1); ctx.lineTo(x1 - arm * sx, y1);
      ctx.moveTo(b.x + arm * sx, y1); ctx.lineTo(b.x, y1); ctx.lineTo(b.x, y1 - arm * sy);
      if (l.stroke && lw > 0) ctx.stroke();
      labelAt = { x: b.x, y: b.y, boxed: false };
      break;
    }
    case 'crosshair': {
      const b = box(), cx = b.x + b.bw / 2, cy = b.y + b.bh / 2, r = Math.min(Math.abs(b.bw), Math.abs(b.bh)) * 0.18;
      ctx.beginPath();
      ctx.moveTo(b.x, cy); ctx.lineTo(cx - r * 0.5, cy); ctx.moveTo(cx + r * 0.5, cy); ctx.lineTo(b.x + b.bw, cy);
      ctx.moveTo(cx, b.y); ctx.lineTo(cx, cy - r * 0.5); ctx.moveTo(cx, cy + r * 0.5); ctx.lineTo(cx, b.y + b.bh);
      if (l.stroke && lw > 0) ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); paint();
      labelAt = { x: cx + r * 1.2, y: cy - r * 1.2, boxed: false };
      break;
    }
    case 'line': case 'polyline': case 'callout': {
      const n = l.shape === 'line' ? 2 : P.length >> 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = P[i * 2] * w, y = P[i * 2 + 1] * h; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      if (l.shape === 'polyline' && l.fill) { ctx.fill(); }
      if (l.stroke && lw > 0) ctx.stroke();
      const lx = P[(n - 1) * 2] * w, ly = P[(n - 1) * 2 + 1] * h;
      if (l.shape === 'callout') {
        // a dot where it points
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(P[0] * w, P[1] * h, Math.max(1.5 * scale, lw * 1.8), 0, Math.PI * 2);
        ctx.fillStyle = l.stroke ?? l.fill ?? '#ffffff'; ctx.fill();
        labelAt = { x: lx, y: ly, boxed: true };
      } else labelAt = { x: lx, y: ly, boxed: false };
      break;
    }
  }
  ctx.restore();
  if (l.label?.text && labelAt) drawLabel(ctx, l, labelAt, lw, w, h);
}

/** A small label: next to the shape, or in a box at the end of a callout (editorial «FL33» notes). */
function drawLabel(ctx: CanvasRenderingContext2D, l: ShapeLayer, at: { x: number; y: number; boxed: boolean }, lw: number, w: number, h: number) {
  const lb = l.label!;
  const px = lb.size * h;
  if (px < 0.5) return;
  ctx.save();
  ctx.font = cssFont(lb.font, 500, false, px);
  ctx.fillStyle = lb.color;
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(lb.text).width;
  if (at.boxed) {
    const pad = px * 0.4, bw = tw + pad * 2, bh = px * 1.5;
    // the box opens away from the frame's centre, so labels on the right stay inside the frame
    const left = at.x > w * 0.5;
    const bx = left ? at.x - bw : at.x, by = at.y - bh / 2;
    ctx.strokeStyle = l.stroke ?? lb.color;
    ctx.lineWidth = Math.max(0.5, lw);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillText(lb.text, bx + pad, at.y);
  } else {
    const gap = px * 0.35;
    ctx.textBaseline = 'bottom';
    ctx.fillText(lb.text, at.x, at.y - gap - lw / 2);
  }
  ctx.restore();
}
