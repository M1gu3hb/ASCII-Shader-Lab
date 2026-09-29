/**
 * SVG of the whole composition, only when it can be faithful. A composition made only of real characters
 * (glyph layers), text and shapes is written as vector: <text> with the same characters, lines and
 * positions the studio draws, and the shapes as paths; layer opacity, blend and position as SVG attributes.
 * Anything made of pixels cannot be: photos, shader ASCII (a GPU render), pixel finishes (dither, glow,
 * grain…), masks (they cut pixels; soft edges and brushes have no exact vector equal). Then `svgDecision`
 * says why, and the sheet offers PNG, or an SVG that only wraps a PNG, labelled as such.
 *
 * svgDecision is pure (unit-tested). compositionSvg measures text with a Canvas 2D context in the browser
 * (the same measurements drawText uses, so lines break where the studio breaks them).
 */
import { fontStack, fontWeight, wrapText } from '../../project/draw2d';
import type { Layer, ShapeLayer, TextLayer } from '../../project/types';
import { gridToSvgText, type GlyphGrid } from '../../glyphs/index';
import type { GlyphStyle } from '../../project/types';

/* ------------------------------------------------------------------ decision (pure) */

export interface SvgLayerInfo {
  name: string;
  kind: Layer['kind'];
  /** Spanish names of the finishes switched on. */
  finishes: string[];
  mask: boolean;
  blend: Layer['blend'];
  /** Glyph layers: what the clips do to the characters at this instant that text cannot place exactly. */
  cellMoves?: boolean;
  /** Clips' stretches, tiles on non-glyph layers, extra masks: pixel operations. */
  pixelClips?: boolean;
  /** Glyph layers drawn with blocks or braille (the canvas draws them as exact shapes; SVG text uses the font). */
  blocks?: boolean;
}

export interface SvgDecision {
  /** A faithful vector SVG can be written. */
  vector: boolean;
  /** Why not, in one short sentence (the format list), and cause by cause with the layers' names. */
  summary: string;
  reasons: string[];
  /** What to know even when it is vector. */
  notes: string[];
}

/** «A», «B» y «C» (at most three names, then how many more). */
export function nameList(names: string[]): string {
  const q = names.map(n => `«${n}»`);
  if (q.length <= 1) return q.join('');
  if (q.length <= 3) return `${q.slice(0, -1).join(', ')} y ${q[q.length - 1]}`;
  return `${q.slice(0, 3).join(', ')} y ${q.length - 3} más`;
}

const joinY = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`);

export function svgDecision(layers: SvgLayerInfo[]): SvgDecision {
  const of = (f: (l: SvgLayerInfo) => boolean) => layers.filter(f).map(l => l.name);
  const photos = of(l => l.kind === 'photo'), ascii = of(l => l.kind === 'ascii');
  const fin = layers.filter(l => l.finishes.length);
  const masks = of(l => l.mask), add = of(l => l.blend === 'add'), moves = of(l => !!l.cellMoves), clips = of(l => !!l.pixelClips);
  const reasons: string[] = [];
  const causes: string[] = [];
  if (photos.length) { reasons.push(`${nameList(photos)} ${photos.length > 1 ? 'son fotos' : 'es una foto'}: píxeles.`); causes.push(photos.length > 1 ? 'fotos' : 'una foto'); }
  if (ascii.length) { reasons.push(`${nameList(ascii)} ${ascii.length > 1 ? 'son' : 'es'} ASCII de shader: una imagen que dibuja la GPU, no caracteres de texto.`); causes.push('ASCII de shader'); }
  if (fin.length) { reasons.push(`Acabados de píxel en ${joinY(fin.map(l => `«${l.name}» (${l.finishes.join(', ')})`))}.`); causes.push('acabados de píxel'); }
  if (masks.length) { reasons.push(`Máscaras en ${nameList(masks)}: recortan píxeles y en vector el borde no sería el mismo.`); causes.push('máscaras'); }
  if (add.length) { reasons.push(`${nameList(add)} se ${add.length > 1 ? 'funden' : 'funde'} con «Sumar», que no tiene un equivalente fiable en SVG.`); causes.push('fusión «Sumar»'); }
  if (moves.length) { reasons.push(`${nameList(moves)} ${moves.length > 1 ? 'mueven, giran o escalan' : 'mueve, gira o escala'} caracteres en este instante: como texto quedarían en otra posición.`); causes.push('caracteres en movimiento en este instante'); }
  if (clips.length) { reasons.push(`${nameList(clips)} ${clips.length > 1 ? 'tienen' : 'tiene'} en este instante una animación de píxeles (teselas, estiramiento o una máscara del clip).`); causes.push('animaciones de píxeles'); }
  const notes: string[] = [];
  if (!reasons.length) {
    if (layers.some(l => l.kind === 'glyphs')) notes.push('Los caracteres son texto real: se ven con las fuentes de quien abre el SVG (las de este estudio son libres; sin ellas el aspecto cambia un poco).');
    if (layers.some(l => l.blocks)) notes.push('Bloques y braille van como caracteres: en el estudio se dibujan como formas exactas, en SVG dependen de la fuente.');
    if (layers.some(l => l.kind === 'text')) notes.push('Los textos van como texto editable, con los saltos de línea del estudio.');
    if (layers.some(l => l.blend !== 'normal' && l.blend !== 'add')) notes.push('Los modos de fusión van como mix-blend-mode: los navegadores los respetan; algunos editores de vectores no.');
  }
  const summary = reasons.length ? `Aquí no sería fiel: la composición tiene ${joinY(causes)}.` : '';
  return { vector: reasons.length === 0, summary, reasons, notes };
}

/* ------------------------------------------------------------------ writer (browser) */

const num = (v: number) => String(+v.toFixed(2));
// XML 1.0 forbids C0 controls (names and texts come from people): drop them
const esc = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BLEND_CSS: Partial<Record<Layer['blend'], string>> = {
  multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color-dodge': 'color-dodge',
  'color-burn': 'color-burn', 'hard-light': 'hard-light', 'soft-light': 'soft-light', difference: 'difference', exclusion: 'exclusion',
  hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
};

type Ctx = CanvasRenderingContext2D;
let mctx: Ctx | null = null;
const measurer = (): Ctx => (mctx ??= document.createElement('canvas').getContext('2d')!);
const hasLetterSpacing = () => typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;
const cssFont = (font: string, weight: number, italic: boolean, px: number) =>
  `${italic ? 'italic ' : ''}${fontWeight(font, weight)} ${Math.max(0.5, px).toFixed(3)}px ${fontStack(font)}`;
const fontAttrs = (font: string, weight: number, italic: boolean, px: number) =>
  `font-family="${esc(fontStack(font))}" font-size="${num(px)}" font-weight="${fontWeight(font, weight)}"${italic ? ' font-style="italic"' : ''}`;

function runWidth(ctx: Ctx, s: string, track: number, native: boolean): number {
  if (!s) return 0;
  if (native || !track) return ctx.measureText(s).width;
  let w = 0;
  for (const ch of s) w += ctx.measureText(ch).width + track;
  return w - track;
}

/** A text layer as SVG text, with the lines and positions drawText gives it (see draw2d.ts). */
export function textSvg(l: TextLayer, W: number, H: number): string {
  const px = l.size * H;
  if (px < 0.5 || !l.text) return '';
  const text = l.upper ? l.text.toLocaleUpperCase('es') : l.text;
  const ctx = measurer();
  ctx.save();
  ctx.font = cssFont(l.font, l.weight, l.italic, px);
  const track = l.tracking * px;
  const native = hasLetterSpacing();
  const sc = ctx as Ctx & { letterSpacing: string };
  if (native) sc.letterSpacing = `${track}px`;
  const out: string[] = [];
  const attrs = `${fontAttrs(l.font, l.weight, l.italic, px)} fill="${esc(l.color)}"`;
  if (l.path) {
    const p = l.path;
    const cx = p.cx * W, cy = p.cy * H, R = p.r * H;
    if (native) sc.letterSpacing = '0px';
    if (R >= 1) {
      const chars = Array.from(text.replace(/\n/g, ' '));
      const adv = chars.map(c => ctx.measureText(c).width + track);
      const total = adv.reduce((a, b) => a + b, 0) - track;
      const start = (p.start * Math.PI) / 180;
      const turns = p.turns ?? 3;
      const radius = (dθ: number) => p.kind === 'spiral' ? Math.max(R * 0.15, R - (R * 0.85 * dθ) / (Math.PI * 2 * turns)) : R;
      let θ = p.kind === 'arc' ? start - Math.min(Math.PI, total / R / 2) : start;
      const θ0 = θ;
      const glyphs: string[] = [];
      for (let i = 0; i < chars.length; i++) {
        const r = radius(θ - start);
        const half = adv[i] / 2 / r;
        if (p.kind !== 'spiral' && θ + adv[i] / r - θ0 > Math.PI * 2 + 1e-6) break;
        const a = θ + half;
        if (chars[i] !== ' ') glyphs.push(`<text transform="translate(${num(cx + r * Math.sin(a))} ${num(cy - r * Math.cos(a))}) rotate(${num((a * 180) / Math.PI)})">${esc(chars[i])}</text>`);
        θ += adv[i] / r;
        if (p.kind === 'spiral' && θ - start > Math.PI * 2 * turns) break;
      }
      out.push(`<g ${attrs} text-anchor="middle" dominant-baseline="central">${glyphs.join('')}</g>`);
    }
  } else {
    const boxW = l.box.w * W, x0 = l.box.x * W;
    const lines = wrapText(s => runWidth(ctx, s, track, native), text, boxW);
    const m = ctx.measureText('Hg');
    const ascent = m.actualBoundingBoxAscent || px * 0.8;
    const lh = px * l.leading;
    let y = l.box.y * H + ascent;
    const rows: string[] = [];
    for (const line of lines) {
      const lw = runWidth(ctx, line, track, native);
      const x = l.align === 'center' ? x0 + (boxW - lw) / 2 : l.align === 'right' ? x0 + boxW - lw : x0;
      if (line) rows.push(`<text x="${num(x)}" y="${num(y)}">${esc(line)}</text>`);
      y += lh;
    }
    out.push(`<g ${attrs}${track ? ` letter-spacing="${num(track)}"` : ''} xml:space="preserve">${rows.join('')}</g>`);
  }
  ctx.restore();
  return out.join('');
}

/** A shape layer (and its label) as SVG, as drawShape draws it at scale 1. */
export function shapeSvg(l: ShapeLayer, W: number, H: number): string {
  const P = l.pts;
  const lw = l.width;
  const stroke = l.stroke && lw > 0 ? ` stroke="${esc(l.stroke)}" stroke-width="${num(Math.max(0.01, lw))}" stroke-linejoin="miter" stroke-linecap="butt"${l.dash ? ` stroke-dasharray="${l.dash.map(num).join(' ')}"` : ''}` : '';
  const fill = l.fill ? ` fill="${esc(l.fill)}"` : ' fill="none"';
  const out: string[] = [];
  const box = () => ({ x: P[0] * W, y: P[1] * H, bw: P[2] * W, bh: P[3] * H });
  let labelAt: { x: number; y: number; boxed: boolean } | null = null;
  switch (l.shape) {
    case 'rect': {
      const b = box();
      out.push(`<path d="M${num(b.x)} ${num(b.y)}h${num(b.bw)}v${num(b.bh)}h${num(-b.bw)}Z"${fill}${stroke}/>`);
      labelAt = { x: b.x, y: b.y, boxed: false };
      break;
    }
    case 'ellipse': {
      const b = box();
      out.push(`<ellipse cx="${num(b.x + b.bw / 2)}" cy="${num(b.y + b.bh / 2)}" rx="${num(Math.abs(b.bw / 2))}" ry="${num(Math.abs(b.bh / 2))}"${fill}${stroke}/>`);
      labelAt = { x: b.x, y: b.y, boxed: false };
      break;
    }
    case 'bracket': {
      const b = box(), arm = Math.min(Math.abs(b.bw), Math.abs(b.bh)) * 0.2;
      const x1 = b.x + b.bw, y1 = b.y + b.bh, sx = Math.sign(b.bw) || 1, sy = Math.sign(b.bh) || 1;
      const d = [
        `M${num(b.x)} ${num(b.y + arm * sy)}L${num(b.x)} ${num(b.y)}L${num(b.x + arm * sx)} ${num(b.y)}`,
        `M${num(x1 - arm * sx)} ${num(b.y)}L${num(x1)} ${num(b.y)}L${num(x1)} ${num(b.y + arm * sy)}`,
        `M${num(x1)} ${num(y1 - arm * sy)}L${num(x1)} ${num(y1)}L${num(x1 - arm * sx)} ${num(y1)}`,
        `M${num(b.x + arm * sx)} ${num(y1)}L${num(b.x)} ${num(y1)}L${num(b.x)} ${num(y1 - arm * sy)}`,
      ].join('');
      if (stroke) out.push(`<path d="${d}" fill="none"${stroke}/>`);
      labelAt = { x: b.x, y: b.y, boxed: false };
      break;
    }
    case 'crosshair': {
      const b = box(), cx = b.x + b.bw / 2, cy = b.y + b.bh / 2, r = Math.min(Math.abs(b.bw), Math.abs(b.bh)) * 0.18;
      const d = `M${num(b.x)} ${num(cy)}L${num(cx - r * 0.5)} ${num(cy)}M${num(cx + r * 0.5)} ${num(cy)}L${num(b.x + b.bw)} ${num(cy)}`
        + `M${num(cx)} ${num(b.y)}L${num(cx)} ${num(cy - r * 0.5)}M${num(cx)} ${num(cy + r * 0.5)}L${num(cx)} ${num(b.y + b.bh)}`;
      if (stroke) out.push(`<path d="${d}" fill="none"${stroke}/>`);
      out.push(`<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}"${fill}${stroke}/>`);
      labelAt = { x: cx + r * 1.2, y: cy - r * 1.2, boxed: false };
      break;
    }
    case 'line': case 'polyline': case 'callout': {
      const n = l.shape === 'line' ? 2 : P.length >> 1;
      const pts: string[] = [];
      for (let i = 0; i < n; i++) pts.push(`${num(P[i * 2] * W)} ${num(P[i * 2 + 1] * H)}`);
      const polyFill = l.shape === 'polyline' && l.fill ? ` fill="${esc(l.fill)}"` : ' fill="none"';
      out.push(`<path d="M${pts.join('L')}"${polyFill}${stroke}/>`);
      const lx = P[(n - 1) * 2] * W, ly = P[(n - 1) * 2 + 1] * H;
      if (l.shape === 'callout') {
        out.push(`<circle cx="${num(P[0] * W)}" cy="${num(P[1] * H)}" r="${num(Math.max(1.5, lw * 1.8))}" fill="${esc(l.stroke ?? l.fill ?? '#ffffff')}"/>`);
        labelAt = { x: lx, y: ly, boxed: true };
      } else labelAt = { x: lx, y: ly, boxed: false };
      break;
    }
  }
  const lb = l.label;
  if (lb?.text && labelAt) {
    const px = lb.size * H;
    if (px >= 0.5) {
      const ctx = measurer();
      ctx.save();
      ctx.font = cssFont(lb.font, 500, false, px);
      if (hasLetterSpacing()) (ctx as Ctx & { letterSpacing: string }).letterSpacing = '0px';
      const tw = ctx.measureText(lb.text).width;
      ctx.restore();
      const attrs = `${fontAttrs(lb.font, 500, false, px)} fill="${esc(lb.color)}"`;
      if (labelAt.boxed) {
        const pad = px * 0.4, bw = tw + pad * 2, bh = px * 1.5;
        const left = labelAt.x > W * 0.5;
        const bx = left ? labelAt.x - bw : labelAt.x, by = labelAt.y - bh / 2;
        out.push(`<rect x="${num(bx)}" y="${num(by)}" width="${num(bw)}" height="${num(bh)}" fill="none" stroke="${esc(l.stroke ?? lb.color)}" stroke-width="${num(Math.max(0.5, lw))}"/>`);
        out.push(`<text x="${num(bx + pad)}" y="${num(labelAt.y)}" ${attrs} dominant-baseline="central" xml:space="preserve">${esc(lb.text)}</text>`);
      } else {
        const gap = px * 0.35;
        out.push(`<text x="${num(labelAt.x)}" y="${num(labelAt.y - gap - lw / 2)}" ${attrs} dominant-baseline="text-after-edge" xml:space="preserve">${esc(lb.text)}</text>`);
      }
    }
  }
  return out.join('');
}

/** The inside of gridToSvgText's document (its groups and paper), to place in a composition. */
export function glyphSvgInner(grid: GlyphGrid, style: GlyphStyle): string {
  const doc = gridToSvgText(grid, style, { paper: true });
  const lines = doc.trimEnd().split('\n');
  const body = lines.slice(1).filter(s => !s.startsWith('<title>'));
  const last = body.length - 1;
  body[last] = body[last].replace(/<\/svg>$/, '');
  return body.join('\n');
}

export interface SvgLayerPart {
  layer: Layer;
  /** Glyph layers: the frame's grid (without the layer's opacity or position: SVG carries those) and its style. */
  glyph?: { grid: GlyphGrid; style: GlyphStyle };
  /** Opacity at t (clips included). */
  opacity: number;
}

/** The vector document (only call it when svgDecision said yes). */
export function compositionSvg(o: { w: number; h: number; bg: string; transparent: boolean; title: string; parts: SvgLayerPart[] }): string {
  const { w: W, h: H } = o;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  out.push(`<title>${esc(o.title)}</title>`);
  out.push('<desc>Hecho con GLYPHOS. Vector: caracteres y textos reales, formas como trazos.</desc>');
  if (!o.transparent) out.push(`<rect width="${W}" height="${H}" fill="${esc(o.bg)}"/>`);
  for (const part of o.parts) {
    const l = part.layer;
    const body = l.kind === 'glyphs' && part.glyph ? glyphSvgInner(part.glyph.grid, part.glyph.style)
      : l.kind === 'text' ? textSvg(l, W, H)
        : l.kind === 'shape' ? shapeSvg(l, W, H) : '';
    if (!body) continue;
    const attrs: string[] = [];
    const op = Math.min(1, Math.max(0, part.opacity));
    if (op < 1) attrs.push(`opacity="${num(op)}"`);
    const blend = BLEND_CSS[l.blend];
    if (blend) attrs.push(`style="mix-blend-mode:${blend}"`);
    const xf = l.xf;
    if (xf.x || xf.y || xf.rot || xf.scale !== 1) {
      attrs.push(`transform="translate(${num(W / 2 + xf.x * W)} ${num(H / 2 + xf.y * H)})${xf.rot ? ` rotate(${num(xf.rot)})` : ''}${xf.scale !== 1 ? ` scale(${+xf.scale.toFixed(4)})` : ''} translate(${num(-W / 2)} ${num(-H / 2)})"`);
    }
    out.push(`<g data-capa="${esc(l.name)}"${attrs.length ? ' ' + attrs.join(' ') : ''}>${body}</g>`);
  }
  out.push('</svg>');
  return out.join('\n') + '\n';
}

/** An SVG that only wraps a PNG: said in its description and its name (never passed off as vector). */
export function rasterSvg(o: { w: number; h: number; title: string; png: string; why: string[] }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${o.w}" height="${o.h}" viewBox="0 0 ${o.w} ${o.h}">
<title>${esc(o.title)}</title>
<desc>${esc(`Hecho con GLYPHOS. NO es vector: es una imagen PNG dentro de un SVG, porque ${o.why.join(' ').replace(/\.$/, '')}.`)}</desc>
<image width="${o.w}" height="${o.h}" xlink:href="${o.png}" href="${o.png}"/>
</svg>
`;
}
