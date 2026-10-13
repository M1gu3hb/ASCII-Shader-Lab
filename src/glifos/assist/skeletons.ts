/**
 * Centreline skeletons of the assistant: one per character it can propose (Latin letters, ı, figures,
 * punctuation and the marks accents are built from). They are an original, deliberately plain design (a
 * neutral sans structure) written for this studio in the language described in outline.ts; no font data was
 * copied or traced. The style model gives them weight, contrast, slant, width, terminals, corners, roundness
 * and proportions when they are drawn.
 */
import { MARKS, hasDrawing, type ComponentRef, type GlyphDoc } from '../doc';
import { bboxOf } from '../geom/ops';
import { glyphContours } from '../compile';
import { drawSkeleton, drawStyle, frameOf, placeDrawn } from './outline';

export interface Skeleton {
  /** Vertical frame: 'x' (lowercase levels: x-height, ascender, descender) or 'cap' (capitals, figures, most symbols). */
  frame: 'x' | 'cap';
  /** Strokes in the skeleton language (outline.ts): one string per stroke, bowl or dot. */
  strokes: string[];
  /** Nominal width of the drawing at width 1 and the default weight (design units). */
  width: number;
  /** Anchors in design units: 'top' over letters, '_top' under marks. */
  anchors: Record<string, [number, number]>;
}

type Raw = [Skeleton['frame'], string[]];

const RAW: Record<string, Raw> = {
  /* ---------------- lowercase ---------------- */
  a: ['x', ['M 420< 0_ L 420< 330 Y 220 510^ C 145 510 80 488 45 435', 'M 420< 290 L 185 290 X 0> 145 Y 195 -10_ X 420< 135']],
  b: ['x', ['M 0> 0_ L 0> 750^', 'M 0> 330 Y 245 510^ X 460< 250 Y 245 -10_ X 0> 170']],
  c: ['x', ['A 0 -10 425 510 44 316']],
  d: ['x', ['M 460< 0_ L 460< 750^', 'M 460< 330 Y 215 510^ X 0> 250 Y 215 -10_ X 460< 170']],
  e: ['x', ['M 0> 255 L 450< 255', 'A 0 -10 450 510 0 318']],
  f: ['x', ['M 110 0_ L 110 585 Y 225 760^ L 300 755', 'M 0 500^ L 275 500^']],
  g: ['x', ['M 455< 500^ L 455< -45 Y 235 -200_ C 150 -200 80 -180 42 -128', 'M 455< 330 Y 215 510^ X 0> 255 Y 215 0_ X 455< 180']],
  h: ['x', ['M 0> 0_ L 0> 750^', 'M 0> 330 Y 230 510^ X 430< 340 L 430< 0_']],
  i: ['x', ['M 45 0_ L 45 500^', 'D 45 750^']],
  j: ['x', ['M 125 500^ L 125 -55 Y 20 -200_ L -45 -195', 'D 125 750^']],
  k: ['x', ['M 0> 0_ L 0> 750^', 'M 415 500= L 45 170', 'M 175 285 L 435 0=']],
  l: ['x', ['M 45 0_ L 45 750^']],
  m: ['x', ['M 0> 0_ L 0> 500^', 'M 0> 330 Y 185 510^ X 360< 340 L 360< 0_', 'M 360< 330 Y 545 510^ X 720< 340 L 720< 0_']],
  n: ['x', ['M 0> 0_ L 0> 500^', 'M 0> 330 Y 230 510^ X 430< 340 L 430< 0_']],
  o: ['x', ['O 0 -10 470 510']],
  p: ['x', ['M 0> -190_ L 0> 500^', 'M 0> 330 Y 245 510^ X 460< 250 Y 245 -10_ X 0> 170']],
  q: ['x', ['M 460< -190_ L 460< 500^', 'M 460< 330 Y 215 510^ X 0> 250 Y 215 -10_ X 460< 170']],
  r: ['x', ['M 0> 0_ L 0> 500^', 'M 0> 315 Y 190 510^ L 290 500']],
  s: ['x', ['M 385 430 C 350 485 295 510^ 205 510^ C 110 510 45 465 45 385 C 45 300 125 280 210 262 C 305 240 405 215 405 125 C 405 35 325 -10_ 205 -10_ C 110 -10 42 28 12 88']],
  t: ['x', ['M 110 650 L 110 120 Y 210 -10_ L 285 0', 'M 0 500^ L 275 500^']],
  u: ['x', ['M 430< 500^ L 430< 0_', 'M 430< 170 Y 200 -10_ X 0> 160 L 0> 500^']],
  v: ['x', ['M 0 500= L 222 0=', 'M 444 500= L 222 0=']],
  w: ['x', ['M 0 500= L 168 0=', 'M 168 0= L 340 500=', 'M 340 500= L 512 0=', 'M 512 0= L 680 500=']],
  x: ['x', ['M 15 500= L 425 0=', 'M 425 500= L 15 0=']],
  y: ['x', ['M 0 500= L 230 20', 'M 450 500= L 140 -190=']],
  z: ['x', ['M 30 500^ L 400 500^ L 30 0_ L 415 0_']],
  'ı': ['x', ['M 45 0_ L 45 500^']],

  /* ---------------- capitals ---------------- */
  A: ['cap', ['M 0 0= L 315 700=', 'M 630 0= L 315 700=', 'M 99 215 L 531 215']],
  B: ['cap', ['M 0> 0_ L 0> 700^ L 270 700^ X 510< 538 Y 270 375 L 0> 375', 'M 0> 375 L 290 375 X 550< 188 Y 290 0_ L 0> 0_']],
  C: ['cap', ['A 0 -12 610 712 42 318']],
  D: ['cap', ['M 0> 0_ L 0> 700^ L 270 700^ X 600< 350 Y 270 0_ Z']],
  E: ['cap', ['M 450< 700^ L 0> 700^ L 0> 0_ L 460< 0_', 'M 0> 360 L 410< 360']],
  F: ['cap', ['M 450< 700^ L 0> 700^ L 0> 0_', 'M 0> 350 L 410< 350']],
  G: ['cap', ['A 0 -12 625 712 40 356', 'M 345 300 L 625< 300', 'M 625< 300 L 625< 180']],
  H: ['cap', ['M 0> 0_ L 0> 700^', 'M 540< 0_ L 540< 700^', 'M 0> 360 L 540< 360']],
  I: ['cap', ['M 45 0_ L 45 700^']],
  J: ['cap', ['M 360< 700^ L 360< 230 Y 180 -12_ X 0 175']],
  K: ['cap', ['M 0> 0_ L 0> 700^', 'M 545 700= L 45 215', 'M 215 400 L 565 0=']],
  L: ['cap', ['M 0> 700^ L 0> 0_ L 425< 0_']],
  M: ['cap', ['M 0> 0_ L 0> 700^', 'M 720< 0_ L 720< 700^', 'M 0> 700= L 360 0=', 'M 720< 700= L 360 0=']],
  N: ['cap', ['M 0> 0_ L 0> 700^', 'M 585< 0_ L 585< 700^', 'M 0> 700= L 585< 0=']],
  O: ['cap', ['O 0 -12 665 712']],
  P: ['cap', ['M 0> 0_ L 0> 700^ L 285 700^ X 530< 515 Y 285 330 L 0> 330']],
  Q: ['cap', ['O 0 -12 665 712', 'M 395 165 L 625 -85']],
  R: ['cap', ['M 0> 0_ L 0> 700^ L 285 700^ X 530< 520 Y 285 340 L 0> 340', 'M 255 340 L 555 0=']],
  S: ['cap', ['M 525 590 C 485 665 410 712^ 300 712^ C 165 712 72 645 72 540 C 72 430 165 400 300 372 C 440 342 548 300 548 185 C 548 60 440 -12_ 295 -12_ C 165 -12 70 45 28 128']],
  T: ['cap', ['M 0> 700^ L 580< 700^', 'M 290 0_ L 290 700^']],
  U: ['cap', ['M 0> 700^ L 0> 250 Y 300 -12_ X 600< 250 L 600< 700^']],
  V: ['cap', ['M 0 700= L 315 0=', 'M 630 700= L 315 0=']],
  W: ['cap', ['M 0 700= L 225 0=', 'M 225 0= L 455 700=', 'M 455 700= L 685 0=', 'M 685 0= L 910 700=']],
  X: ['cap', ['M 20 700= L 595 0=', 'M 595 700= L 20 0=']],
  Y: ['cap', ['M 0 700= L 305 335', 'M 610 700= L 305 335', 'M 305 360 L 305 0_']],
  Z: ['cap', ['M 45 700^ L 555 700^ L 40 0_ L 570 0_']],

  /* ---------------- figures ---------------- */
  '0': ['cap', ['O 0 -12 520 712']],
  '1': ['cap', ['M 70 550 L 300 700^ L 300 0_']],
  '2': ['cap', ['M 50 515 C 50 640 145 712^ 270 712^ C 395 712 480 635 480 525 C 480 400 380 320 50 0_ L 500 0_']],
  '3': ['cap', ['M 60 600 C 100 680 180 712^ 275 712^ C 395 712 465 645 465 555 C 465 450 380 395 245 395', 'M 245 395 C 400 395 490 330 490 205 C 490 75 395 -12_ 270 -12_ C 160 -12 75 40 40 125']],
  '4': ['cap', ['M 400< 0_ L 400< 700^ L 20 220 L 530 220']],
  '5': ['cap', ['M 450 700^ L 100 700^ L 75 390 C 135 430 200 450 270 450 C 405 450 490 365 490 235 C 490 95 395 -12_ 265 -12_ C 165 -12 85 35 48 115']],
  '6': ['cap', ['M 435 640 C 395 690 340 712^ 275 712^ C 130 712 20 585 20> 360 L 20> 230', 'O 20 -12 500 460']],
  '7': ['cap', ['M 40 700^ L 505 700^ L 195 0=']],
  '8': ['cap', ['O 45 355 460 712', 'O 20 -12 485 380']],
  '9': ['cap', ['O 20 240 500 712', 'M 500< 480 L 500< 330 C 500 105 420 -12_ 260 -12_ C 190 -12 135 10 95 60']],

  /* ---------------- punctuation and symbols ---------------- */
  '.': ['cap', ['D 50 0_']],
  ',': ['cap', ['D 50 0_', 'M 72 45 C 72 -30 55 -95 10 -150']],
  ':': ['x', ['D 50 0_', 'D 50 500^']],
  ';': ['x', ['D 50 500^', 'D 50 0_', 'M 72 45 C 72 -30 55 -95 10 -150']],
  '!': ['cap', ['M 50 700^ L 50 210', 'D 50 0_']],
  '?': ['cap', ['M 30 545 C 30 655 120 712^ 235 712^ C 355 712 430 640 430 545 C 430 445 345 410 280 365 C 245 340 235 300 235 230', 'D 235 0_']],
  '¿': ['cap', ['M 435 -35 C 435 -145 345 -202_ 230 -202_ C 110 -202 35 -130 35 -35 C 35 65 120 100 185 145 C 220 170 230 210 230 280', 'D 230 510^']],
  '¡': ['cap', ['M 50 -190_ L 50 300', 'D 50 510^']],
  "'": ['cap', ['M 50 700^ L 50 470']],
  '"': ['cap', ['M 40 700^ L 40 470', 'M 200 700^ L 200 470']],
  '-': ['x', ['M 0 255 L 280 255']],
  '–': ['x', ['M 0 255 L 500 255']],
  '—': ['x', ['M 0 255 L 920 255']],
  '(': ['cap', ['M 270 790 C 120 650 55 490 55 325 C 55 160 120 0 270 -140']],
  ')': ['cap', ['M 30 790 C 180 650 245 490 245 325 C 245 160 180 0 30 -140']],
  '[': ['cap', ['M 240 790^ L 0> 790^ L 0> -140_ L 240 -140_']],
  ']': ['cap', ['M 0 790^ L 240< 790^ L 240< -140_ L 0 -140_']],
  '{': ['cap', ['M 290 790^ C 180 790 150 750 150 660 L 150 430 C 150 370 120 335 40 325 C 120 315 150 280 150 220 L 150 -10 C 150 -100 180 -140 290 -140_']],
  '}': ['cap', ['M 40 790^ C 150 790 180 750 180 660 L 180 430 C 180 370 210 335 290 325 C 210 315 180 280 180 220 L 180 -10 C 180 -100 150 -140 40 -140_']],
  '/': ['cap', ['M 0 -130 L 360 780']],
  '\\': ['cap', ['M 0 780 L 360 -130']],
  '«': ['x', ['M 230 440 L 60 260 L 230 80', 'M 440 440 L 270 260 L 440 80']],
  '»': ['x', ['M 0 440 L 170 260 L 0 80', 'M 210 440 L 380 260 L 210 80']],
  '@': ['cap', ['O 230 120 520 480', 'M 520< 430 L 520< 190 C 520 120 560 95 610 95 C 720 95 790 230 790 360 C 790 560 620 712 410 712 C 190 712 30 550 30 330 C 30 110 190 -50 420 -50 C 520 -50 600 -25 660 10']],
  '#': ['cap', ['M 185 680 L 140 20', 'M 405 680 L 360 20', 'M 40 470 L 535 470', 'M 20 240 L 515 240']],
  '&': ['cap', ['M 600 0= L 210 450 C 160 510 140 545 140 590 C 140 665 200 712^ 275 712^ C 350 712 405 665 405 595 C 405 515 330 470 230 405 C 110 330 45 270 45 185 C 45 75 140 -12_ 265 -12_ C 410 -12 500 80 555 250']],
  '*': ['cap', ['M 220 712^ L 220 420', 'M 95 640 L 345 490', 'M 95 490 L 345 640']],
  '+': ['cap', ['M 260 590 L 260 110', 'M 20 350 L 500 350']],
  '=': ['cap', ['M 30 445 L 490 445', 'M 30 255 L 490 255']],
  '<': ['cap', ['M 480 590 L 40 350 L 480 110']],
  '>': ['cap', ['M 40 590 L 480 350 L 40 110']],
  _: ['cap', ['M 0 -120 L 520 -120']],
  '%': ['cap', ['O 20 380 280 712', 'O 380 -12 640 320', 'M 560 700 L 100 0']],
  $: ['cap', ['M 470 560 C 435 625 370 660 280 660 C 160 660 85 600 85 510 C 85 415 170 385 280 360 C 400 335 490 300 490 200 C 490 90 400 40 275 40 C 165 40 85 90 50 160', 'M 280 790 L 280 -90']],
  '€': ['cap', ['A 90 -12 640 712 45 315', 'M 0 440 L 420 440', 'M 0 270 L 400 270']],
  '|': ['cap', ['M 50 790 L 50 -190']],
  '~': ['x', ['M 20 250 C 70 340 140 350 230 300 C 320 250 390 260 440 350']],
  '^': ['cap', ['M 40 420 L 250 712^ L 460 420']],
  '`': ['x', ['M 50 720 L 170 590']],

  /* ---------------- marks (drawn above the x-height; placed by anchors) ---------------- */
  '´': ['x', ['M 40 585 L 160 730']],
  '¨': ['x', ['D 40 650', 'D 220 650']],
  '˜': ['x', ['M 0 595 C 40 668 92 680 150 638 C 208 596 262 606 300 680']],
};

const MARK_CHARS = new Set(['´', '¨', '˜']);
const isLetter = (ch: string) => /\p{L}/u.test(ch);

/** Nominal width: x extent of the design (edge marks are edges; plain points are centrelines of a 90 pen). */
function nominalWidth(strokes: string[]): { x0: number; x1: number } {
  let x0 = Infinity, x1 = -Infinity;
  const take = (a: number, b: number) => { x0 = Math.min(x0, a); x1 = Math.max(x1, b); };
  for (const s of strokes) {
    const box = /^[OA] (-?\d+) -?\d+ (-?\d+)/.exec(s);
    if (box) { take(+box[1], +box[2]); continue; }
    // x coordinates follow a command letter or come in pairs: read every (x, y) pair after M L X Y C D
    const toks = s.match(/[A-Z]|-?\d+(?:\.\d+)?[\^_<>=]?/g) ?? [];
    let k = 0;
    for (const t of toks) {
      if (/^[A-Z]$/.test(t)) { k = 0; continue; }
      if (k++ % 2) continue;
      const v = parseFloat(t);
      if (t.endsWith('>')) take(v, v); else if (t.endsWith('<')) take(v, v); else take(v - 45, v + 45);
    }
  }
  return { x0, x1 };
}

function build(): Record<string, Skeleton> {
  const out: Record<string, Skeleton> = {};
  for (const [ch, [frame, strokes]] of Object.entries(RAW)) {
    const { x0, x1 } = nominalWidth(strokes);
    const anchors: Record<string, [number, number]> = {};
    const mid = Math.round((x0 + x1) / 2);
    // capitals take their accents a little lower than the cap height: the marks are drawn for lowercase
    if (MARK_CHARS.has(ch)) anchors._top = [mid, 500];
    else if (isLetter(ch)) anchors.top = frame === 'x' ? [mid, 500] : [mid, 670];
    out[ch] = { frame, strokes, width: x1 - x0, anchors };
  }
  return out;
}

export const SKELETONS: Record<string, Skeleton> = build();

/** Every character with a skeleton, in a stable order. */
export function skeletonChars(): string[] {
  return Object.keys(SKELETONS);
}

/* ------------------------------------------------------------------ */
/* Accented letters                                                    */
/* ------------------------------------------------------------------ */

/**
 * Where an anchor of a glyph is: its own anchor when it has one; for a drawing without anchors, the centre of
 * its ink at the frame's height (leaning with the slant); with nothing drawn, where the skeleton would put it.
 */
export function anchorOf(doc: GlyphDoc, ch: string, name: 'top' | '_top'): { x: number; y: number } | null {
  const g = doc.glyphs[ch];
  const own = g?.anchors.find(a => a.name === name);
  if (own) return { x: own.x, y: own.y };
  const sk = SKELETONS[ch];
  const st = drawStyle(doc.style);
  const y = name === '_top' || sk?.frame === 'x' ? st.xh : st.cap - (st.cap - st.xh) * 0.15;
  if (g && hasDrawing(g)) {
    const box = bboxOf(glyphContours(doc, ch).filter(c => c.closed));
    if (!box) return null;
    const lean = Math.tan((st.slant * Math.PI) / 180);
    const midY = (box.y0 + box.y1) / 2;
    return { x: (box.x0 + box.x1) / 2 + (y - midY) * lean, y };
  }
  if (!sk || !sk.anchors[name]) return null;
  const drawn = drawSkeleton(sk, st, doc.metrics);
  const box = bboxOf(drawn.contours);
  if (!box) return null;
  const placed = placeDrawn(drawn, doc.mode === 'ascii' ? (doc.metrics.cell - (box.x1 - box.x0)) / 2 - box.x0 : doc.metrics.lsb - box.x0);
  const a = placed.anchors.find(p => p.name === name);
  return a ? { x: a.x, y: a.y } : { x: 0, y: frameOf(sk.frame, st, doc.metrics).fy(500) };
}

/**
 * The accented letters of MARKS built from components: the base as drawn, the mark moved so its '_top' anchor
 * meets the base's 'top' anchor (í is built on ı).
 */
export function composeAccents(doc: GlyphDoc): Record<string, ComponentRef[]> {
  const out: Record<string, ComponentRef[]> = {};
  for (const [ch, { base, mark }] of Object.entries(MARKS)) {
    const top = anchorOf(doc, base, 'top'), under = anchorOf(doc, mark, '_top');
    if (!top || !under) continue;
    out[ch] = [
      { of: base, dx: 0, dy: 0 },
      { of: mark, dx: Math.round((top.x - under.x) * 10) / 10, dy: Math.round((top.y - under.y) * 10) / 10 },
    ];
  }
  return out;
}
