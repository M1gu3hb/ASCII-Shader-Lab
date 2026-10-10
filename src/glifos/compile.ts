/**
 * Document → glyph set: what «Usar en el laboratorio», the exports and the preview draw. Components are
 * resolved (an accented letter is its base plus its mark, wherever they are now), contours become path data,
 * a picture used as the glyph becomes its bitmap, and an ASCII set gets its ramp: the person's order when they
 * reordered it, else the measured ink of each symbol (a value they typed wins over the measure).
 *
 * Pure: no DOM. Pictures come from a provider (the studio decodes them; tests pass arrays).
 */
import { GLYPHSET_FORMAT, GLYPHSET_KIND, type GlyphBitmap, type GlyphSet, type GlyphShape } from '../glyphset/set';
import { hasDrawing, type Contour, type Glyph, type GlyphDoc, type GlyphStatus, type PathNode, type Pt } from './doc';

/** Statuses that go into a compiled set: proposals wait until accepted, empty glyphs have nothing to give. */
export const COMPILED_STATUSES: GlyphStatus[] = ['dibujado', 'aceptado', 'bloqueado'];

export const usable = (g: Glyph | undefined): boolean => !!g && COMPILED_STATUSES.includes(g.status);

/* ------------------------------------------------------------------ */
/* Outlines                                                            */
/* ------------------------------------------------------------------ */

const moved = (p: Pt, dx: number, dy: number, s: number): Pt => ({ x: p.x * s + dx, y: p.y * s + dy });
function moveContour(c: Contour, dx: number, dy: number, s: number): Contour {
  return {
    closed: c.closed,
    nodes: c.nodes.map(n => {
      const o: PathNode = { ...moved(n, dx, dy, s) };
      if (n.smooth) o.smooth = true;
      if (n.hi) o.hi = moved(n.hi, dx, dy, s);
      if (n.ho) o.ho = moved(n.ho, dx, dy, s);
      return o;
    }),
  };
}

/**
 * Every contour a glyph draws, its components included (resolved from their current shape, at most four
 * levels deep, a loop drawn once). `only` limits components to glyphs that pass it (compiled ones).
 */
export function glyphContours(doc: GlyphDoc, ch: string, only?: (g: Glyph) => boolean, depth = 0, seen: Set<string> = new Set()): Contour[] {
  const g = doc.glyphs[ch];
  if (!g || depth > 4 || seen.has(ch)) return [];
  seen.add(ch);
  const out = g.contours.filter(c => c.nodes.length > 0).map(c => moveContour(c, 0, 0, 1));
  for (const k of g.components) {
    const base = doc.glyphs[k.of];
    if (!base || (only && !only(base))) continue;
    for (const c of glyphContours(doc, k.of, only, depth + 1, new Set(seen))) out.push(moveContour(c, k.dx, k.dy, k.s ?? 1));
  }
  return out;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const f = (v: number) => String(r1(v));

/** Closed contours as path data (absolute M, L, C, Z; font units, y up). Open contours do not fill: left out. */
export function contoursToPathData(contours: Contour[]): string {
  const parts: string[] = [];
  for (const c of contours) {
    if (!c.closed || c.nodes.length < 2) continue;
    const ns = c.nodes;
    let d = `M${f(ns[0].x)} ${f(ns[0].y)}`;
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i], b = ns[(i + 1) % ns.length];
      if (a.ho || b.hi) {
        const p1 = a.ho ?? a, p2 = b.hi ?? b;
        d += `C${f(p1.x)} ${f(p1.y)} ${f(p2.x)} ${f(p2.y)} ${f(b.x)} ${f(b.y)}`;
      } else if (i < ns.length - 1) d += `L${f(b.x)} ${f(b.y)}`;
    }
    parts.push(d + 'Z');
  }
  return parts.join('');
}

/* ------------------------------------------------------------------ */
/* Flattening and ink                                                  */
/* ------------------------------------------------------------------ */

/** A closed contour as a polygon (curves split into `steps` segments each). */
export function flattenContour(c: Contour, steps = 12): Pt[] {
  const ns = c.nodes, out: Pt[] = [];
  const n = c.closed ? ns.length : ns.length - 1;
  if (!ns.length) return out;
  out.push({ x: ns[0].x, y: ns[0].y });
  for (let i = 0; i < n; i++) {
    const a = ns[i], b = ns[(i + 1) % ns.length];
    if (a.ho || b.hi) {
      const p1 = a.ho ?? a, p2 = b.hi ?? b;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, u = 1 - t;
        out.push({
          x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x,
          y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y,
        });
      }
    } else out.push({ x: b.x, y: b.y });
  }
  if (c.closed && out.length > 1) {
    const a = out[0], z = out[out.length - 1];
    if (Math.abs(a.x - z.x) < 1e-9 && Math.abs(a.y - z.y) < 1e-9) out.pop();
  }
  return out;
}

/**
 * Fills polygons (non-zero winding, like the canvas and a font rasteriser) into a coverage grid of w×h
 * cells covering the box [x0, x0 + bw] × [y0, y0 + bh] (y up), 4×4 samples per cell. Returns 0..1 per cell,
 * row 0 at the top.
 */
export function rasterize(polys: Pt[][], w: number, h: number, box: { x0: number; y0: number; bw: number; bh: number }): Float32Array {
  const SS = 4, W = w * SS, H = h * SS;
  const out = new Float32Array(w * h);
  const edges: Array<[number, number, number, number, number]> = [];
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      if (a.y === b.y) continue;
      edges.push([a.x, a.y, b.x, b.y, a.y < b.y ? 1 : -1]);
    }
  }
  const xs: Array<[number, number]> = [];
  for (let sy = 0; sy < H; sy++) {
    const y = box.y0 + box.bh * (1 - (sy + 0.5) / H);
    xs.length = 0;
    for (const [ax, ay, bx, by, dir] of edges) {
      const lo = Math.min(ay, by), hi = Math.max(ay, by);
      if (y < lo || y >= hi) continue;
      xs.push([ax + ((y - ay) / (by - ay)) * (bx - ax), dir]);
    }
    if (!xs.length) continue;
    xs.sort((a, b) => a[0] - b[0]);
    let wind = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      wind += xs[i][1];
      if (wind === 0) continue;
      const s0 = Math.max(0, Math.ceil(((xs[i][0] - box.x0) / box.bw) * W - 0.5));
      const s1 = Math.min(W - 1, Math.floor(((xs[i + 1][0] - box.x0) / box.bw) * W - 0.5));
      const row = Math.floor(sy / SS) * w;
      for (let sx = s0; sx <= s1; sx++) out[row + Math.floor(sx / SS)] += 1 / (SS * SS);
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, out[i]);
  return out;
}

/**
 * Ink of a glyph in an ASCII cell: the share of the cell (advance × the em box) its outline covers. The
 * same box the atlas fills, so the ramp follows what the engines will draw.
 */
export function glyphInk(doc: GlyphDoc, ch: string, only?: (g: Glyph) => boolean): number {
  const g = doc.glyphs[ch];
  if (!g) return 0;
  const m = doc.metrics;
  const polys = glyphContours(doc, ch, only).filter(c => c.closed).map(c => flattenContour(c, 8));
  if (!polys.length) return 0;
  const adv = Math.max(1, doc.mode === 'ascii' ? m.cell : g.adv);
  const cov = rasterize(polys, 24, 40, { x0: 0, y0: m.desc, bw: adv, bh: Math.max(1, m.asc - m.desc) });
  let s = 0;
  for (const v of cov) s += v;
  return s / cov.length;
}

/** The ramp the studio proposes for an ASCII set: symbols from empty to full by ink (typed values win). */
export function proposeRamp(doc: GlyphDoc, chars: string[], only?: (g: Glyph) => boolean): Array<{ ch: string; ink: number; measured: number }> {
  return chars
    .map((ch, i) => { const measured = ch === ' ' ? 0 : glyphInk(doc, ch, only); return { ch, measured, ink: doc.glyphs[ch]?.ink ?? measured, i }; })
    .sort((a, b) => a.ink - b.ink || a.i - b.i)
    .map(({ ch, ink, measured }) => ({ ch, ink, measured }));
}

/* ------------------------------------------------------------------ */
/* Pictures used as glyphs                                             */
/* ------------------------------------------------------------------ */

/** A decoded picture: RGBA bytes. */
export interface Picture { w: number; h: number; rgba: Uint8ClampedArray | Uint8Array }

/** Ink of each pixel of a picture as the glyph reads it (alpha, or darkness on a light background), 0..255. */
export function pictureInk(p: Picture, read: 'transparencia' | 'oscuro', crop: { x: number; y: number; w: number; h: number }): { w: number; h: number; ink: Uint8Array } {
  const x0 = Math.max(0, Math.min(p.w - 1, Math.floor(crop.x))), y0 = Math.max(0, Math.min(p.h - 1, Math.floor(crop.y)));
  const w = Math.max(1, Math.min(p.w - x0, Math.round(crop.w))), h = Math.max(1, Math.min(p.h - y0, Math.round(crop.h)));
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * p.w + x0 + x) * 4;
    const a = p.rgba[i + 3];
    if (read === 'transparencia') ink[y * w + x] = a;
    else {
      const lum = 0.2126 * p.rgba[i] + 0.7152 * p.rgba[i + 1] + 0.0722 * p.rgba[i + 2];
      ink[y * w + x] = Math.round(((255 - lum) * a) / 255);
    }
  }
  return { w, h, ink };
}

function b64(bytes: Uint8Array): string {
  const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    out += B[a >> 2] + B[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? B[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < bytes.length ? B[c & 63] : '=');
  }
  return out;
}

/** The bitmap of a glyph that is a picture: thresholded softly, at most 256 px a side. */
function glyphBitmap(g: Glyph, pic: Picture): GlyphBitmap | undefined {
  const r = g.raster!;
  const src = pictureInk(pic, r.read, r.crop);
  const k = Math.max(1, Math.max(src.w, src.h) / 256);
  const w = Math.max(1, Math.round(src.w / k)), h = Math.max(1, Math.round(src.h / k));
  const a = new Uint8Array(w * h);
  const t = r.threshold * 255, soft = 24;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // box filter over the source pixels this one covers
    const sx0 = Math.floor(x * k), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * k)), sy0 = Math.floor(y * k), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * k));
    let s = 0, n = 0;
    for (let yy = sy0; yy < Math.min(src.h, sy1); yy++) for (let xx = sx0; xx < Math.min(src.w, sx1); xx++) { s += src.ink[yy * src.w + xx]; n++; }
    const v = n ? s / n : 0;
    a[y * w + x] = Math.round(255 * Math.min(1, Math.max(0, (v - t + soft) / (2 * soft))));
  }
  return { w, h, a: b64(a), x: r.x, y: r.y, s: r.s * k };
}

/* ------------------------------------------------------------------ */
/* Compile                                                             */
/* ------------------------------------------------------------------ */

export interface CompileResult {
  set: GlyphSet;
  /** Characters left out, and why (in Spanish), for the «Usar» dialog. */
  skipped: Array<{ ch: string; why: string }>;
}

/**
 * `all`: proposals too (the preview shows the whole set as it would be if everything were accepted; what
 * goes to the lab and the exports never has unaccepted proposals).
 */
export function compileDoc(doc: GlyphDoc, pictures: (id: string) => Picture | undefined = () => undefined, o: { all?: boolean } = {}): CompileResult {
  const m = doc.metrics;
  const ok = o.all ? (g: Glyph | undefined) => !!g && g.status !== 'vacio' : usable;
  const skipped: CompileResult['skipped'] = [];
  const glyphs: Record<string, GlyphShape> = {};
  for (const ch of doc.chars) {
    const g = doc.glyphs[ch];
    if (!g) continue;
    if (ch === ' ') { glyphs[ch] = { a: doc.mode === 'ascii' ? m.cell : g.adv }; continue; }
    if (!ok(g)) { if (g.status === 'propuesto') skipped.push({ ch, why: 'propuesta sin aceptar' }); continue; }
    if (!hasDrawing(g)) { skipped.push({ ch, why: 'sin dibujo' }); continue; }
    const shape: GlyphShape = { a: doc.mode === 'ascii' && !g.ownAdv ? m.cell : g.adv };
    const d = contoursToPathData(glyphContours(doc, ch, ok));
    if (d) shape.d = d;
    if (g.raster?.use === 'glifo') {
      const pic = pictures(g.raster.img);
      if (pic) shape.b = glyphBitmap(g, pic);
      else if (!d) { skipped.push({ ch, why: 'su imagen no está en este navegador' }); continue; }
    }
    if (!shape.d && !shape.b) { skipped.push({ ch, why: 'sin dibujo' }); continue; }
    glyphs[ch] = shape;
  }
  const set: GlyphSet = {
    kind: GLYPHSET_KIND, v: GLYPHSET_FORMAT, name: doc.name, doc: { id: doc.id, rev: doc.rev }, mode: doc.mode,
    upm: m.upm, asc: m.asc, desc: m.desc, xh: m.xh, cap: m.cap, glyphs,
  };
  if (doc.mode === 'ascii') {
    const have = (c: string) => !!glyphs[c];
    const order = doc.ramp.manual ? doc.ramp.order.filter(have) : proposeRamp(doc, doc.chars.filter(have), ok).map(r => r.ch);
    for (const c of Object.keys(glyphs)) if (!order.includes(c)) order.push(c);
    set.ramp = order.join('');
  } else {
    const kern: Record<string, number> = {};
    for (const [pair, v] of Object.entries(doc.kern)) { const [a, b] = Array.from(pair); if (glyphs[a] && glyphs[b] && v) kern[pair] = v; }
    if (Object.keys(kern).length) set.kern = kern;
  }
  return { set, skipped };
}
