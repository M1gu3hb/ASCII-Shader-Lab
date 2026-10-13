/**
 * «Grabado láser»: the shapes the tip engraves when it does not read the person's words. All of them are lines
 * written here (no font file, no asset):
 *  - a small single-stroke type (capitals, digits, common signs; accents, diaeresis, tilde and cedilla from the
 *    Unicode decomposition, so «Ñ», «É», «Ü», «Ç» are a letter and its mark), for the layer's own word when the
 *    piece has no text (Fondos, Terminal);
 *  - figures: polygons, stars, hypotrochoids (spirograph), roses and Lissajous curves;
 *  - a signature: cursive letters as Catmull–Rom curves through jittered key points, slanted, with pen lifts
 *    between words, a closing flourish, and the dots and crossbars added at the end, as a hand does.
 * Pure functions of their inputs (and of a seeded generator): the same seed and pass give the same lines.
 */
import { SimRng } from '../rng';
import type { Trazo } from './grabado-ruta';

type Pts = number[];

/** Points of an elliptical arc from a0 to a1 (degrees, counter-clockwise when a1 > a0, y up). */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Pts {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 12) + 1), o: Pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / (n - 1)) * Math.PI) / 180;
    o.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  }
  return o;
}
/** A polyline from numbers and arcs. */
const P = (...parts: Array<number | Pts>): Pts => parts.flatMap(x => (typeof x === 'number' ? [x] : x));
const dot = (x: number, y: number, r = 0.32) => arc(x, y, r, r, 0, 360);

/* ------------------------------------------------------------------ */
/* Single-stroke type: x 0..4, cap height 6, baseline 0, y up          */
/* ------------------------------------------------------------------ */

const GLYPHS: Record<string, Pts[]> = {
  A: [P(0, 0, 2, 6, 4, 0), P(0.75, 2.2, 3.25, 2.2)],
  B: [P(0, 3, 2.3, 3, arc(2.3, 4.5, 1.5, 1.5, -90, 90), 0, 6, 0, 0, 2.5, 0, arc(2.5, 1.5, 1.5, 1.5, -90, 90), 2.3, 3)],
  C: [arc(2.2, 3, 2.2, 3, 48, 312)],
  D: [P(0, 0, 0, 6, 1.4, 6, arc(1.4, 3, 2.6, 3, 90, -90), 0, 0)],
  E: [P(3.8, 6, 0, 6, 0, 0, 3.8, 0), P(0, 3, 2.9, 3)],
  F: [P(3.8, 6, 0, 6, 0, 0), P(0, 3, 2.9, 3)],
  G: [P(arc(2.2, 3, 2.2, 3, 50, 360), 2.5, 3)],
  H: [P(0, 0, 0, 6), P(4, 0, 4, 6), P(0, 3, 4, 3)],
  I: [P(2, 0, 2, 6), P(1, 6, 3, 6), P(1, 0, 3, 0)],
  J: [P(3.6, 6, 3.6, 1.7, arc(1.9, 1.7, 1.7, 1.7, 0, -180))],
  K: [P(0, 0, 0, 6), P(3.9, 6, 0, 2.1), P(1.3, 3.3, 4, 0)],
  L: [P(0, 6, 0, 0, 3.7, 0)],
  M: [P(0, 0, 0, 6, 2, 2.2, 4, 6, 4, 0)],
  N: [P(0, 0, 0, 6, 4, 0, 4, 6)],
  O: [arc(2, 3, 2, 3, 90, 450)],
  P: [P(0, 0, 0, 6, 2.2, 6, arc(2.2, 4.4, 1.6, 1.6, 90, -90), 0, 2.8)],
  Q: [arc(2, 3, 2, 3, 90, 450), P(2.5, 1.3, 4.2, -0.5)],
  R: [P(0, 0, 0, 6, 2.2, 6, arc(2.2, 4.5, 1.5, 1.5, 90, -90), 0, 3), P(1.7, 3, 4, 0)],
  S: [P(arc(2, 4.5, 1.8, 1.5, 25, 270), arc(2, 1.5, 1.9, 1.5, 90, -155))],
  T: [P(0, 6, 4, 6), P(2, 6, 2, 0)],
  U: [P(0, 6, 0, 2, arc(2, 2, 2, 2, 180, 360), 4, 6)],
  V: [P(0, 6, 2, 0, 4, 6)],
  W: [P(0, 6, 0.9, 0, 2, 4.2, 3.1, 0, 4, 6)],
  X: [P(0, 0, 4, 6), P(0, 6, 4, 0)],
  Y: [P(0, 6, 2, 3, 4, 6), P(2, 3, 2, 0)],
  Z: [P(0, 6, 4, 6, 0, 0, 4, 0)],
  '0': [arc(2, 3, 1.8, 3, 90, 450), P(0.9, 1.2, 3.1, 4.8)],
  '1': [P(0.8, 4.6, 2.2, 6, 2.2, 0), P(0.9, 0, 3.5, 0)],
  '2': [P(arc(2, 4.3, 1.8, 1.7, 165, -30), 0, 0, 4, 0)],
  '3': [P(arc(2, 4.5, 1.7, 1.5, 150, -90), arc(2, 1.5, 1.9, 1.5, 90, -150))],
  '4': [P(3, 0, 3, 6, 0, 1.8, 4, 1.8)],
  '5': [P(3.7, 6, 0.5, 6, 0.3, 3.3, arc(1.9, 1.9, 1.9, 1.9, 135, -150))],
  '6': [P(arc(2.2, 3, 2, 3, 70, 180), arc(2, 1.9, 1.9, 1.9, 180, 540))],
  '7': [P(0, 6, 4, 6, 1.3, 0)],
  '8': [P(arc(2, 4.6, 1.5, 1.4, -90, 270), arc(2, 1.6, 1.8, 1.6, 90, -270))],
  '9': [P(arc(2, 4.1, 1.9, 1.9, 0, 360), 3.8, 2.2, 2.6, 0)],
  '.': [dot(2, 0.3)],
  ',': [P(2.3, 0.5, 1.6, -1)],
  '!': [P(2, 6, 2, 1.8), dot(2, 0.3)],
  '¡': [dot(2, 4.6), P(2, 3.2, 2, -1.4)],
  '?': [P(arc(2, 4.5, 1.8, 1.5, 160, -60), 2, 2.3, 2, 1.6), dot(2, 0.3)],
  '¿': [dot(2, 4.6), P(2, 3.4, 2, 2.6, arc(2, 1.1, 1.8, 1.5, 90, 340))],
  '-': [P(0.8, 3, 3.2, 3)],
  '_': [P(0, -0.6, 4, -0.6)],
  "'": [P(2, 6, 2, 4.5)],
  '"': [P(1.3, 6, 1.3, 4.5), P(2.7, 6, 2.7, 4.5)],
  ':': [dot(2, 0.3), dot(2, 3.8)],
  ';': [P(2.3, 0.5, 1.6, -1), dot(2, 3.8)],
  '/': [P(0.4, 0, 3.6, 6)],
  '+': [P(2, 1.2, 2, 4.8), P(0.2, 3, 3.8, 3)],
  '=': [P(0.4, 2.2, 3.6, 2.2), P(0.4, 3.8, 3.6, 3.8)],
  '*': [P(2, 1.4, 2, 4.6), P(0.6, 2.2, 3.4, 3.8), P(0.6, 3.8, 3.4, 2.2)],
  '#': [P(1.2, 0.4, 1.8, 5.6), P(2.6, 0.4, 3.2, 5.6), P(0.3, 2, 3.9, 2), P(0.5, 4, 4.1, 4)],
  '(': [arc(3.8, 3, 2.6, 3.6, 124, 236)],
  ')': [arc(0.2, 3, 2.6, 3.6, 56, -56)],
  '&': [P(4, 0, 0.9, 4.1, arc(1.8, 4.8, 0.9, 1, 210, -30), 0.3, 1.6, arc(1.6, 1.5, 1.4, 1.5, 180, 300), 3.8, 2.6)],
  '@': [P(2.8, 2.2, arc(2.1, 3, 0.9, 1, 0, 360), 2.9, 1.5, 3.7, 1.8, arc(2, 3, 2, 3, 0, 300))],
};

/** Marks above or below a letter (combining characters after NFD). */
const MARKS: Record<string, Pts[]> = {
  '́': [P(1.6, 6.9, 2.7, 8.1)],
  '̀': [P(1.3, 8.1, 2.4, 6.9)],
  '̈': [dot(1.2, 7.4), dot(2.8, 7.4)],
  '̂': [P(0.9, 6.9, 2, 8, 3.1, 6.9)],
  '̃': [P(0.5, 7, 1, 7.6, 1.6, 7.7, 2.4, 7.2, 3, 7, 3.5, 7.5)],
  '̧': [P(2.1, 0, 2.4, -0.6, 1.7, -1.2)],
  '̊': [arc(2, 7.5, 0.55, 0.55, 0, 360)],
};

const NARROW = new Set(['.', ',', '!', '¡', "'", ':', ';', '(', ')']);
const ADV = 5.6, NARROW_ADV = 3.2, SPACE_ADV = 4, LINE = 10;

/** Characters the own type draws (after upper-casing and decomposition); others leave a gap. */
export const typeCovers = (ch: string) => !!GLYPHS[ch] || !!MARKS[ch];

/**
 * A word (or several lines: «|» or a line break splits them) in the own single-stroke type, laid out centred in
 * a box of the domain (w × h): one group per character (its strokes and its marks), level 0.
 */
export function wordStrokes(text: string, boxW = 1.6, boxH = 0.78): Trazo[] {
  const lines = text.toUpperCase().normalize('NFD').split(/\n|\|/).map(l => l.replace(/\s+$/u, ''));
  type Ch = { strokes: Pts[]; x: number };
  const laid: Array<{ chars: Ch[]; w: number }> = [];
  for (const line of lines) {
    const chars: Ch[] = [];
    let x = 0;
    for (const ch of Array.from(line)) {
      if (MARKS[ch]) {
        // a mark goes on the previous letter
        const prev = chars[chars.length - 1];
        if (prev) prev.strokes.push(...MARKS[ch].map(m => m.slice()));
        continue;
      }
      if (/\s/u.test(ch)) { x += SPACE_ADV; continue; }
      const g = GLYPHS[ch];
      if (!g) { x += SPACE_ADV; continue; }
      const narrow = NARROW.has(ch);
      chars.push({ strokes: g.map(s => s.slice()), x: x - (narrow ? 0.4 : 0) });
      x += narrow ? NARROW_ADV : ADV;
    }
    laid.push({ chars, w: Math.max(0, x - (x > 0 ? 1.6 : 0)) });
  }
  const used = laid.filter(l => l.chars.length);
  if (!used.length) return [];
  const maxW = Math.max(4, ...laid.map(l => l.w));
  // lines from the top: cap height 6, room for marks above (2) and below (1.2)
  const totalH = laid.length * LINE - 4 + 2 + 1.2;
  const s = Math.min(boxW / maxW, boxH / totalH);
  const out: Trazo[] = [];
  let group = 0;
  laid.forEach((l, li) => {
    const ox = -(l.w * s) / 2, base = (totalH / 2 - 2 - 6 - li * LINE) * s;
    for (const c of l.chars) {
      for (const st of c.strokes) {
        const n = st.length / 2, pts = new Float64Array(st.length);
        for (let i = 0; i < n; i++) { pts[i * 2] = ox + (c.x + st[i * 2]) * s; pts[i * 2 + 1] = base + st[i * 2 + 1] * s; }
        out.push(closeIfLoop(pts, group, 0));
      }
      group++;
    }
  });
  return out;
}

/** A stroke whose ends meet is a closed one (without its repeated last point). */
function closeIfLoop(pts: Float64Array, group: number, level: number): Trazo {
  const n = pts.length / 2;
  if (n > 3 && Math.hypot(pts[0] - pts[n * 2 - 2], pts[1] - pts[n * 2 - 1]) < 1e-6) return { pts: pts.slice(0, n * 2 - 2), closed: true, group, level };
  return { pts, closed: false, group, level };
}

/* ------------------------------------------------------------------ */
/* Figures                                                             */
/* ------------------------------------------------------------------ */

export const FIGURES = ['poligono', 'estrella', 'espirografo', 'rosa', 'lissajous'] as const;
export type Figure = (typeof FIGURES)[number];

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Figure number k of a run: a closed curve of radius about 0.36 (domain heights) around the centre, turned and
 * shaped by the seed and k; `passes` concentric copies inside it (each a tenth smaller), all one group.
 */
export function figureStrokes(kind: Figure, k: number, seed: string, passes: number): Trazo[] {
  const rng = new SimRng(`grabado|figura|${seed}|${k}`);
  const rot = rng.range(0, Math.PI * 2), R = 0.36;
  const pts: number[] = [];
  if (kind === 'poligono') {
    const n = 3 + rng.int(6);
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; pts.push(Math.cos(a), Math.sin(a)); }
  } else if (kind === 'estrella') {
    const n = 5 + rng.int(5), inner = rng.range(0.38, 0.55);
    for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * Math.PI * 2, r = i % 2 ? inner : 1; pts.push(r * Math.cos(a), r * Math.sin(a)); }
  } else if (kind === 'espirografo') {
    const pairs: Array<[number, number]> = [[5, 2], [7, 2], [7, 3], [8, 3], [9, 4], [5, 3], [9, 2]];
    const [Ri, ri] = pairs[rng.int(pairs.length)], d = rng.range(0.55, 1.1) * ri;
    const turns = ri / gcd(Ri, ri), m = Math.round(140 * turns);
    for (let i = 0; i < m; i++) {
      const t = (i / m) * Math.PI * 2 * turns;
      const x = (Ri - ri) * Math.cos(t) + d * Math.cos(((Ri - ri) / ri) * t), y = (Ri - ri) * Math.sin(t) - d * Math.sin(((Ri - ri) / ri) * t);
      pts.push(x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot));
    }
  } else if (kind === 'rosa') {
    const pairs: Array<[number, number]> = [[3, 1], [5, 1], [4, 1], [5, 2], [7, 3], [3, 2], [7, 2]];
    const [a, b] = pairs[rng.int(pairs.length)], kk = a / b, span = (a * b) % 2 ? Math.PI * b : Math.PI * 2 * b, m = Math.round(90 * b * (span / Math.PI));
    for (let i = 0; i < m; i++) {
      const t = (i / m) * span, r = Math.cos(kk * t);
      pts.push(r * Math.cos(t + rot), r * Math.sin(t + rot));
    }
  } else {
    const pairs: Array<[number, number]> = [[3, 2], [5, 4], [3, 4], [5, 6], [1, 2], [5, 2]];
    const [a, b] = pairs[rng.int(pairs.length)], ph = rng.range(0.2, 1.4), m = 360;
    for (let i = 0; i < m; i++) { const t = (i / m) * Math.PI * 2; pts.push(1.3 * Math.sin(a * t + ph), Math.sin(b * t)); }
  }
  // normalised to radius R (the widest point)
  let mr = 1e-9;
  for (let i = 0; i < pts.length; i += 2) mr = Math.max(mr, Math.hypot(pts[i] / 1.3, pts[i + 1]));
  const base = Float64Array.from(pts.map(v => (v / mr) * R));
  const out: Trazo[] = [];
  for (let j = 0; j < Math.max(1, passes); j++) {
    const s = 1 - j * 0.1;
    out.push({ pts: base.map(v => v * s), closed: true, group: 0, level: j });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* A signature                                                         */
/* ------------------------------------------------------------------ */

/** Cursive letters as key points from (0, 0) on the baseline (x-height 1), each ending on the baseline; and its advance. */
const CURSIVE: Array<{ k: Pts; adv: number; dot?: [number, number]; bar?: Pts }> = [
  { k: [0.3, 0.5, 0.8, 0.95, 0.55, 1.1, 0.25, 0.7, 0.5, 0.05, 1.1, 0.28], adv: 1.1 }, // e
  { k: [0.3, 1.0, 0.85, 2.3, 0.6, 2.55, 0.35, 2.0, 0.45, 0.05, 1.0, 0.3], adv: 1.0 }, // l
  { k: [0.15, 0.9, 0.25, 0.0, 0.45, 0.8, 0.75, 0.85, 0.9, 0.0, 1.2, 0.3], adv: 1.2 }, // n
  { k: [0.4, 0.85, 0.15, 0.5, 0.35, 0.0, 0.75, 0.4, 0.55, 0.9, 0.9, 0.8, 1.2, 0.6], adv: 1.2 }, // o
  { k: [0.3, 0.8, 0.1, 0.4, 0.4, 0.1, 0.75, 0.8, 0.6, -1.0, 0.25, -1.3, 0.3, -0.6, 1.1, 0.3], adv: 1.1 }, // g
  { k: [0.7, 0.8, 0.25, 0.85, 0.1, 0.3, 0.4, 0.0, 0.75, 0.7, 0.8, 0.05, 1.15, 0.3], adv: 1.15 }, // a
  { k: [0.4, 1.8, 0.45, 0.0, 0.9, 0.35], adv: 0.9, bar: [0.05, 1.15, 0.8, 1.25] }, // t
  { k: [0.35, 0.85, 0.4, 0.0, 0.8, 0.3], adv: 0.8, dot: [0.42, 1.35] }, // i
  { k: [0.2, 0.9, 0.3, 0.0, 0.5, 0.75, 0.8, 0.9, 0.85, 0.3, 1.1, 0.35], adv: 1.1 }, // r/u
];
const CAPITAL: Array<{ k: Pts; adv: number }> = [
  { k: [-0.1, 0.4, 0.2, 2.8, 0.9, 2.9, 0.7, 2.2, 0.1, 0.0, -0.3, -0.3, 0.2, 0.3, 1.0, 0.4], adv: 1.2 }, // a looped stem
  { k: [0.0, 0.0, 0.3, 2.6, 0.6, 2.8, 1.4, 2.3, 1.2, 1.5, 0.4, 1.3, 1.4, 1.0, 1.5, 0.3, 0.9, 0.0, 1.6, 0.3], adv: 1.7 }, // B-like
  { k: [1.5, 2.2, 1.2, 2.8, 0.4, 2.6, 0.0, 1.6, 0.2, 0.4, 0.9, 0.0, 1.6, 0.4], adv: 1.6 }, // C-like
  { k: [0.0, 0.0, 0.4, 2.7, 0.8, 0.6, 1.3, 2.7, 1.6, 0.2, 2.0, 0.4], adv: 2.0 }, // M-like
];

/** Catmull–Rom through key points (uniform), `per` samples per span. */
function catmull(k: Pts, per = 8): Pts {
  const n = k.length / 2, o: Pts = [];
  const at = (i: number) => { const j = Math.max(0, Math.min(n - 1, i)); return [k[j * 2], k[j * 2 + 1]]; };
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = at(i - 1), [x1, y1] = at(i), [x2, y2] = at(i + 1), [x3, y3] = at(i + 2);
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      o.push(
        0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3),
        0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3),
      );
    }
  }
  o.push(k[n * 2 - 2], k[n * 2 - 1]);
  return o;
}

/**
 * Signature number k of a run: two or three words of cursive letters (a capital first), slanted, the pen lifting
 * between words; a flourish under them from the last letter, then the i-dots and t-bars. Fitted in a box of
 * 1.56 × 0.62 domain units around the centre. One group per word (its dots and bars with it); level 0.
 */
export function signatureStrokes(k: number, seed: string): Trazo[] {
  const rng = new SimRng(`grabado|firma|${seed}|${k}`);
  const words = 2 + (rng.next() < 0.35 ? 1 : 0), slant = rng.range(0.22, 0.42);
  const lines: Array<{ pts: Pts; group: number }> = [];
  let x = 0;
  for (let w = 0; w < words; w++) {
    const keys: Pts = [];
    const marks: Pts[] = [];
    const add = (k0: Pts, ox: number) => {
      for (let i = 0; i < k0.length; i += 2) keys.push(ox + k0[i] + rng.range(-0.06, 0.06), k0[i + 1] * (1 + rng.range(-0.08, 0.08)));
    };
    const cap = CAPITAL[rng.int(CAPITAL.length)];
    keys.push(x - 0.2, -0.1);
    add(cap.k, x);
    x += cap.adv;
    const letters = 3 + rng.int(4);
    for (let l = 0; l < letters; l++) {
      const c = CURSIVE[rng.int(CURSIVE.length)];
      add(c.k, x);
      if (c.dot) marks.push(dot(x + c.dot[0], c.dot[1], 0.07));
      if (c.bar) marks.push([x + c.bar[0], c.bar[1], x + c.bar[2], c.bar[3]]);
      x += c.adv;
    }
    if (w === words - 1) {
      // the flourish: down past the last letter, back left under the words
      keys.push(x + 0.5, -0.2, x + 0.7, -0.75, x * 0.55, -1.15, -0.4, -0.85, 0.3, -0.55);
    }
    lines.push({ pts: catmull(keys), group: w });
    for (const m of marks) lines.push({ pts: m, group: w });
    x += 0.7 + rng.range(0, 0.4);
  }
  // slant, then fit the box
  for (const l of lines) for (let i = 0; i < l.pts.length; i += 2) l.pts[i] += l.pts[i + 1] * slant;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lines) for (let i = 0; i < l.pts.length; i += 2) {
    x0 = Math.min(x0, l.pts[i]); x1 = Math.max(x1, l.pts[i]); y0 = Math.min(y0, l.pts[i + 1]); y1 = Math.max(y1, l.pts[i + 1]);
  }
  const s = Math.min(1.56 / (x1 - x0), 0.62 / (y1 - y0)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return lines.map(l => {
    const p = new Float64Array(l.pts.length);
    for (let i = 0; i < p.length; i += 2) { p[i] = (l.pts[i] - cx) * s; p[i + 1] = (l.pts[i + 1] - cy) * s; }
    return closeIfLoop(p, l.group, 0);
  });
}
