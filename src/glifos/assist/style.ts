/**
 * Style estimation: measures the person's reference glyphs (their resolved outlines, rasterised) and fills
 * the style model the skeletons are drawn with. Every property says where it came from; a property no
 * reference could show keeps its default and says so. One reference letter is enough to start: it gives what it
 * can (an H: weight, contrast, slant, width, cap height, terminals) and the rest stay defaults.
 * Pure: no DOM.
 */
import { defaultStyle, hasDrawing, type Contour, type GlyphDoc, type StyleKey, type StyleModel } from '../doc';
import { flattenContour, glyphContours, rasterize } from '../compile';
import { bboxOf, signedArea, skewX, transformContours, type Box } from '../geom/ops';
import { drawSkeleton, drawStyle, type DrawStyle } from './outline';
import { SKELETONS } from './skeletons';

/* ------------------------------------------------------------------ */
/* Which letters show what                                             */
/* ------------------------------------------------------------------ */

/** Letters with vertical stems (weight, slant, terminals), the preferred ones first. */
const STEMS = 'HnIlEFLTDBPRKNMUJhmiudbpqrkıt1';
/** Letters whose middle columns cross horizontal strokes only (thin strokes for the contrast). */
const THINS = 'HoOnEeFTLmhuacsQCGDBPRU0';
/** Bowls (roundness). */
const BOWLS = 'OoQ0';
/** Lowercase whose top is the x-height: flat, or round with overshoot. */
const XH_FLAT = 'xzvwuy', XH_ROUND = 'onmrceasgqp';
/** Capitals whose top is the cap height: flat, or round with overshoot. */
const CAP_FLAT = 'HEFTIZLDBPRKNMXUVWYAJ', CAP_ROUND = 'OQCGS';
/** Free stem ends (b: bottom, t: top) where terminals can be seen. */
const ENDS: Record<string, string> = { H: 'bt', I: 'bt', l: 'bt', K: 'bt', i: 'b', n: 'b', m: 'b', h: 'b', r: 'b', T: 'b', F: 'b', P: 'b', p: 'b', q: 'b', k: 'b', '1': 'b', u: 't', L: 't', d: 't', b: 't', N: 'b' };
/** Outer corners at the ink box (bl: bottom left, tl: top left). */
const CORNERS: Record<string, string[]> = { E: ['bl', 'tl'], L: ['bl'], F: ['tl'], D: ['bl', 'tl'], B: ['bl', 'tl'], P: ['tl'], R: ['tl'] };
const ROUND_OVERSHOOT = { x: 510 / 500, cap: 712 / 700 };

const NOT: Record<StyleKey, string> = {
  weight: 'predeterminado (no estimado: hace falta una letra con astas, como H o n)',
  contrast: 'predeterminado (no estimado: hace falta una letra como H, o, n o E)',
  angle: 'predeterminado (no estimado: el ángulo de la pluma no se mide)',
  slant: 'predeterminado (no estimado: hace falta una letra con astas, como H, l o n)',
  width: 'predeterminado (no estimado: hace falta una letra como H, n u o)',
  terminal: 'predeterminado (no se pudo saber: hace falta una letra como H, n o l)',
  corner: 'predeterminado (no estimado: hace falta una letra como E, L o D)',
  xh: 'predeterminado (no estimado: hace falta una minúscula como x, n u o)',
  cap: 'predeterminado (no estimado: hace falta una mayúscula como H u O)',
  round: 'predeterminado (no estimado: hace falta una letra como O u o)',
};

/** «H», «H y n», «H, n y o» (at most four letters, so the text fits the model's 80 characters). */
const list = (cs: string[]) => {
  const u = [...new Set(cs)].slice(0, 4);
  return u.length < 2 ? u.join('') : u.slice(0, -1).join(', ') + ' y ' + u[u.length - 1];
};
const measured = (cs: string[]) => `medido en ${list(cs)}`;
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };

/* ------------------------------------------------------------------ */
/* Raster measurements                                                 */
/* ------------------------------------------------------------------ */

interface Raster { cov: Float32Array; w: number; h: number; x0: number; y1: number; c: number; box: Box }

/** Coverage grid of contours: cells of `c` font units, row 0 at the top, a margin of two cells. */
function rasterOf(cs: Contour[], box: Box): Raster {
  const c = Math.max(1, Math.min(6, (box.y1 - box.y0) / 220));
  const x0 = box.x0 - 2 * c, y0 = box.y0 - 2 * c;
  const w = Math.ceil((box.x1 - box.x0) / c) + 4, h = Math.ceil((box.y1 - box.y0) / c) + 4;
  const cov = rasterize(cs.map(k => flattenContour(k, 16)), w, h, { x0, y0, bw: w * c, bh: h * c });
  return { cov, w, h, x0, y1: y0 + h * c, c, box };
}

const rowOf = (r: Raster, y: number) => Math.max(0, Math.min(r.h - 1, Math.floor((r.y1 - y) / r.c)));
const colOf = (r: Raster, x: number) => Math.max(0, Math.min(r.w - 1, Math.floor((x - r.x0) / r.c)));

/** Ink runs along a row (horizontal) or a column (vertical): [start cell, end cell, length in font units]. */
function runs(r: Raster, index: number, horizontal: boolean): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  const n = horizontal ? r.w : r.h;
  let start = -1, sum = 0;
  for (let k = 0; k <= n; k++) {
    const v = k < n ? (horizontal ? r.cov[index * r.w + k] : r.cov[k * r.w + index]) : 0;
    if (v > 0.02) { if (start < 0) { start = k; sum = 0; } sum += v; }
    else if (start >= 0) { out.push([start, k - 1, sum * r.c]); start = -1; }
  }
  return out;
}

/** Typical stem thickness: horizontal runs in the middle band (bars and bowls' tops are too long to count). */
function stemWeight(r: Raster, round: boolean): number {
  const { box } = r, H = box.y1 - box.y0, W = box.x1 - box.x0;
  const [a, b] = round ? [0.42, 0.58] : [0.25, 0.75];
  const v: number[] = [];
  for (let row = rowOf(r, box.y0 + H * b); row <= rowOf(r, box.y0 + H * a); row++) {
    for (const [, , l] of runs(r, row, true)) if (l < 0.45 * W && l > 0.02 * H) v.push(l);
  }
  return median(v);
}

/** Thin strokes: vertical runs through the middle columns that are short (horizontal bars, tops of bowls). */
function thinWeight(r: Raster): number {
  const { box } = r, H = box.y1 - box.y0, W = box.x1 - box.x0;
  const v: number[] = [];
  for (let col = colOf(r, box.x0 + W * 0.42); col <= colOf(r, box.x0 + W * 0.58); col++) {
    for (const [, , l] of runs(r, col, false)) if (l < 0.3 * H && l > 0.02 * H) v.push(l);
  }
  return median(v);
}

/**
 * Lean of the stems: the shear that makes the vertical projection of the ink sharpest (stems stack into
 * narrow columns when they are upright).
 */
function slantOf(r: Raster): number {
  const cells: Array<[number, number, number]> = [];
  for (let row = 0; row < r.h; row++) for (let col = 0; col < r.w; col++) {
    const v = r.cov[row * r.w + col];
    if (v > 0.02) cells.push([r.x0 + (col + 0.5) * r.c, r.y1 - (row + 0.5) * r.c, v]);
  }
  const yb = r.box.y0;
  const score = (deg: number) => {
    const t = Math.tan((deg * Math.PI) / 180), bins = new Map<number, number>();
    for (const [x, y, v] of cells) { const k = Math.round((x - (y - yb) * t) / r.c); bins.set(k, (bins.get(k) ?? 0) + v); }
    let s = 0;
    for (const b of bins.values()) s += b * b;
    return s;
  };
  let best = 0, bs = -1;
  for (let d = -30; d <= 30; d += 1) { const s = score(d); if (s > bs) { bs = s; best = d; } }
  let fine = best;
  for (let d = best - 1; d <= best + 1 + 1e-9; d += 0.1) { const s = score(d); if (s > bs) { bs = s; fine = d; } }
  return Math.round(fine * 10) / 10;
}

/** Terminal of free stem ends: ink width just inside the end, relative to the stem. */
function terminalOf(r: Raster, ends: string, weight: number): Array<'recto' | 'redondo' | 'cuna'> {
  const out: Array<'recto' | 'redondo' | 'cuna'> = [];
  const { box } = r, H = box.y1 - box.y0;
  for (const e of ends) {
    // start on the stem a third of the way from that end (away from bars in the middle), then walk to the end
    const start = rowOf(r, e === 'b' ? box.y0 + 0.3 * H : box.y1 - 0.3 * H);
    const stem = runs(r, start, true).find(([, , l]) => l > 0.6 * weight && l < 1.6 * weight);
    if (!stem) continue;
    const [a, b] = stem;
    const inStem = (row: number) => { let s = 0; for (let k = a; k <= b; k++) s += r.cov[row * r.w + k]; return s / (b - a + 1); };
    const dir = e === 'b' ? 1 : -1;
    let row = start;
    // to the last row with any ink over the stem: the true end, also for a round one
    while (row + dir >= 0 && row + dir < r.h && inStem(row + dir) > 0.05) row += dir;
    // widest ink run touching the stem's columns, just inside the end and a little further in: a round end is
    // narrow at the tip only, a wedge (flared, cut at an angle) is wider than the stem further in
    const widthAt = (k: number) => {
      const probe = row - dir * Math.max(1, Math.round((k * weight) / r.c));
      let wd = 0;
      for (const [s, t, l] of runs(r, probe, true)) if (t >= a && s <= b) wd = Math.max(wd, l);
      return wd / weight;
    };
    const tip = widthAt(0.12), inner = widthAt(0.45);
    out.push(inner > 1.12 ? 'cuna' : tip < 0.82 ? 'redondo' : 'recto');
  }
  return out;
}

/** Corner shape: ink in the corner cells of the ink box (a round join leaves them empty). */
function cornerOf(r: Raster, which: string[]): Array<'vivo' | 'redondo'> {
  return which.flatMap(k => {
    const col = colOf(r, r.box.x0 + r.c * 0.5), row = k === 'bl' ? rowOf(r, r.box.y0 + r.c * 0.5) : rowOf(r, r.box.y1 - r.c * 0.5);
    const v = r.cov[row * r.w + col];
    return v > 0.6 ? ['vivo' as const] : v < 0.25 ? ['redondo' as const] : [];
  });
}

/* ------------------------------------------------------------------ */
/* Estimation                                                          */
/* ------------------------------------------------------------------ */

interface Ref { ch: string; cs: Contour[]; box: Box; r: Raster }

/** Width of a skeleton drawn with a style (ink box). */
function drawnWidth(ch: string, st: DrawStyle, doc: GlyphDoc): number {
  const box = bboxOf(drawSkeleton(SKELETONS[ch], st, doc.metrics).contours);
  return box ? box.x1 - box.x0 : NaN;
}

/** Area of the outer contour of a bowl relative to its box (0.785 for an ellipse, 1 for a rectangle). */
function fullness(cs: Contour[]): number {
  const outer = cs.reduce<Contour | null>((best, c) => (!best || Math.abs(signedArea(c)) > Math.abs(signedArea(best)) ? c : best), null);
  const box = outer && bboxOf([outer]);
  return outer && box ? Math.abs(signedArea(outer)) / ((box.x1 - box.x0) * (box.y1 - box.y0)) : NaN;
}

/**
 * Estimates a style model from reference glyphs (characters of the document with a drawing). Works with a
 * single reference; H, O, n and o are preferred for what they show best when present.
 */
export function estimateStyle(doc: GlyphDoc, refs: string[]): { style: StyleModel; notes: string[] } {
  const m = doc.metrics;
  const style = defaultStyle(m);
  const notes: string[] = [];
  const source = { ...NOT };
  const all: Ref[] = [];
  for (const ch of [...new Set(refs)]) {
    const g = doc.glyphs[ch];
    if (!g || !hasDrawing(g)) { notes.push(`«${ch}» no tiene dibujo: no se usó.`); continue; }
    const cs = glyphContours(doc, ch).filter(c => c.closed && c.nodes.length > 1);
    const box = bboxOf(cs);
    if (!box || box.y1 - box.y0 < m.upm * 0.02) { notes.push(`«${ch}» es demasiado pequeño para medirlo.`); continue; }
    all.push({ ch, cs, box, r: rasterOf(cs, box) });
  }
  if (!all.length) {
    notes.push('No hay letras de referencia con dibujo: el estilo queda con sus valores predeterminados.');
    style.source = { ...source };
    return { style, notes };
  }
  // roles: H, O, n and o first; then the order the person gave
  const order = (set: string) => all.filter(r => set.includes(r.ch)).sort((a, b) => set.indexOf(a.ch) - set.indexOf(b.ch));

  // slant first: everything else is measured on upright (de-slanted) shapes
  const slanted = order(STEMS);
  if (slanted.length) {
    style.slant = Math.max(-30, Math.min(30, median(slanted.slice(0, 3).map(r => slantOf(r.r)))));
    source.slant = measured(slanted.slice(0, 3).map(r => r.ch));
  }
  const up: Ref[] = all.map(r => {
    if (!style.slant) return r;
    const cs = transformContours(r.cs, skewX(-style.slant, 0)), box = bboxOf(cs)!;
    return { ch: r.ch, cs, box, r: rasterOf(cs, box) };
  });
  const pick = (set: string) => up.filter(r => set.includes(r.ch)).sort((a, b) => set.indexOf(a.ch) - set.indexOf(b.ch));

  // weight: stems first, bowls next, any other letter last (approximate)
  const stemRefs = pick(STEMS), bowlRefs = pick(BOWLS);
  const wRefs = stemRefs.length ? stemRefs.slice(0, 3) : bowlRefs.length ? bowlRefs.slice(0, 2) : up.filter(r => SKELETONS[r.ch]).slice(0, 1);
  const wv = wRefs.map(r => stemWeight(r.r, BOWLS.includes(r.ch))).filter(Number.isFinite);
  if (wv.length) {
    style.weight = Math.round(Math.max(4, Math.min(m.upm, median(wv))) * 10) / 10;
    source.weight = measured(wRefs.map(r => r.ch));
    if (!stemRefs.length && !bowlRefs.length) notes.push(`El grosor se midió en «${wRefs[0].ch}», sin astas verticales: es aproximado.`);
  }
  // contrast: thin strokes against the measured weight
  const tRefs = pick(THINS).slice(0, 3);
  const tv = tRefs.map(r => thinWeight(r.r)).filter(Number.isFinite);
  if (tv.length && wv.length) {
    style.contrast = Math.round(Math.max(0.15, Math.min(1, median(tv) / style.weight)) * 100) / 100;
    source.contrast = measured(tRefs.map(r => r.ch));
  }
  // heights
  const lower = up.filter(r => XH_FLAT.includes(r.ch) || XH_ROUND.includes(r.ch));
  if (lower.length) {
    style.xh = Math.round(median(lower.map(r => (XH_ROUND.includes(r.ch) ? r.box.y1 / ROUND_OVERSHOOT.x : r.box.y1))));
    source.xh = measured(lower.map(r => r.ch));
  }
  const upper = up.filter(r => CAP_FLAT.includes(r.ch) || CAP_ROUND.includes(r.ch));
  if (upper.length) {
    style.cap = Math.round(median(upper.map(r => (CAP_ROUND.includes(r.ch) ? r.box.y1 / ROUND_OVERSHOOT.cap : r.box.y1))));
    source.cap = measured(upper.map(r => r.ch));
  }
  if (upper.length && !lower.length) {
    style.xh = Math.round((style.cap * m.xh) / m.cap);
    source.xh = 'proporcional a la mayúscula (no estimado: falta una minúscula como x, n u o)';
  } else if (lower.length && !upper.length) {
    style.cap = Math.round((style.xh * m.cap) / m.xh);
    source.cap = 'proporcional a la minúscula (no estimado: falta una mayúscula como H u O)';
  }
  // terminals and corners
  const termVotes: string[] = [], termRefs: string[] = [];
  for (const r of up) {
    if (!ENDS[r.ch] || !wv.length) continue;
    const t = terminalOf(r.r, ENDS[r.ch], style.weight);
    if (t.length) { termVotes.push(...t); termRefs.push(r.ch); }
  }
  if (termVotes.length) {
    const count = (k: string) => termVotes.filter(v => v === k).length;
    style.terminal = (['recto', 'redondo', 'cuna'] as const).reduce((a, b) => (count(b) > count(a) ? b : a), 'recto');
    source.terminal = measured(termRefs);
  }
  const cornerVotes: string[] = [], cornerRefs: string[] = [];
  for (const r of up) if (CORNERS[r.ch]) { const v = cornerOf(r.r, CORNERS[r.ch]); if (v.length) { cornerVotes.push(...v); cornerRefs.push(r.ch); } }
  if (cornerVotes.length) {
    style.corner = cornerVotes.filter(v => v === 'redondo').length > cornerVotes.length / 2 ? 'redondo' : 'vivo';
    source.corner = measured(cornerRefs);
  }
  // roundness and width: compared with the skeleton drawn with what was measured so far
  const base: DrawStyle = { ...drawStyle(style), slant: 0, width: 1 };
  const bowls = pick(BOWLS).filter(r => SKELETONS[r.ch]).slice(0, 2);
  if (bowls.length) {
    const target = median(bowls.map(r => fullness(r.cs)));
    const curve = [0, 0.25, 0.5, 0.75, 1].map(round => ({ round, f: fullness(drawSkeleton(SKELETONS[bowls[0].ch], { ...base, round }, m).contours) }));
    // fullness falls as roundness grows: interpolate between the samples around the target
    let est = target >= curve[0].f ? 0 : target <= curve[4].f ? 1 : NaN;
    for (let k = 0; k < 4 && Number.isNaN(est); k++) {
      const a = curve[k], b = curve[k + 1];
      if (target <= a.f && target >= b.f) est = a.round + ((a.f - target) / (a.f - b.f || 1)) * (b.round - a.round);
    }
    if (Number.isFinite(est)) { style.round = Math.round(est * 100) / 100; source.round = measured(bowls.map(r => r.ch)); base.round = style.round; }
  }
  const widthRefs = [...pick('HnoO'), ...up.filter(r => !'HnoO'.includes(r.ch))].filter(r => SKELETONS[r.ch]).slice(0, 3);
  const ws = widthRefs.map(r => {
    const w1 = drawnWidth(r.ch, base, doc), w2 = drawnWidth(r.ch, { ...base, width: 1.25 }, doc);
    return 1 + (0.25 * (r.box.x1 - r.box.x0 - w1)) / (w2 - w1);
  }).filter(Number.isFinite);
  if (ws.length) {
    style.width = Math.round(Math.max(0.5, Math.min(1.8, median(ws))) * 100) / 100;
    source.width = measured(widthRefs.map(r => r.ch)) + ' (frente al esqueleto)';
  }
  style.source = source;
  const used = all.map(r => r.ch);
  notes.unshift(`Se midieron: ${list(used)}${used.length > 4 ? ' y otras' : ''}.`);
  const left = (Object.keys(source) as StyleKey[]).filter(k => source[k].startsWith('predeterminado'));
  if (left.length) notes.push(`Sin medir (quedan predeterminados): ${left.map(k => NAMES[k]).join(', ')}.`);
  return { style, notes };
}

const NAMES: Record<StyleKey, string> = {
  weight: 'grosor', contrast: 'contraste', angle: 'ángulo de la pluma', slant: 'inclinación', width: 'ancho',
  terminal: 'remates', corner: 'esquinas', xh: 'altura de x', cap: 'altura de mayúsculas', round: 'redondez',
};

/** A short stable name of a style (what the assistant drew with), for `gen.style`. */
export function styleHash(style: StyleModel): string {
  const key = [style.weight.toFixed(1), style.contrast.toFixed(3), style.angle.toFixed(1), style.slant.toFixed(1), style.width.toFixed(3), style.terminal, style.corner, style.xh.toFixed(1), style.cap.toFixed(1), style.round.toFixed(3)].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'e' + h.toString(36).padStart(7, '0');
}


