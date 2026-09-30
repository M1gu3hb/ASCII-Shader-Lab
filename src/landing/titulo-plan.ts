/**
 * The hero headline's score: what each letter of «Haz arte ASCII» shows at a given moment of the loop.
 * Pure and deterministic (no DOM, no clock): src/landing/titulo.ts draws it, tests/unit/titulo.test.ts
 * checks its rhythm.
 *
 * One cycle, after a legible start:
 *   palabras  the whole headline changes style four times, swept in reading order (blocks, braille,
 *             halftone dots, outline, ASCII ramp — four of them per cycle, in a different order each time),
 *             then it recomposes into the real letters;
 *   letras    a wave crosses it letter by letter, each one woven in another style and back;
 *   azar      a few letters, chosen by the cycle's seed, flip on their own;
 *   quieto    the legible headline holds (most of the cycle: never unreadable for long).
 */

import { hash01 } from '../shared/glyphfx';

export type Style = 'solido' | 'bloques' | 'braille' | 'puntos' | 'contorno' | 'rampa';
export const STYLES: Exclude<Style, 'solido'>[] = ['bloques', 'braille', 'puntos', 'contorno', 'rampa'];

/** How the cells of a letter switch from `a` to `b`: in reading order across the line, or scattered. */
export type Sweep = 'linea' | 'tejido';

export interface LetterState {
  a: Style;
  b: Style;
  /** 0 → every cell shows `a`; 1 → every cell shows `b` (eased). */
  p: number;
  sweep: Sweep;
  /** The letter is changing on its own (the letter phases): drawn with the accent. */
  solo: boolean;
}

export type Phase = 'quieto' | 'palabras' | 'letras' | 'azar';

export interface Frame {
  cycle: number;
  phase: Phase;
  /** One state per letter (spaces excluded). */
  letters: LetterState[];
  /** Every letter is the real, solid glyph: the page shows the DOM text and draws nothing. */
  legible: boolean;
}

/** Seconds. The first hold is short so the headline shows what it does soon after the page settles. */
export const TIMING = {
  firstHold: 2.6,
  /** words: solid → s0 → s1 → s2 → s3 → solid */
  sweepIn: 0.42,
  styleHold: 0.42,
  sweepStyle: 0.3,
  sweepOut: 0.46,
  rest: 0.3,
  /** letters in order: each one in, held, out; the next one starts `stagger` later */
  letterIn: 0.18,
  letterHold: 0.22,
  letterOut: 0.2,
  stagger: 0.075,
  /** unpredictable letters */
  flips: 4,
  flipEvery: 0.26,
  flipIn: 0.14,
  flipHold: 0.2,
  flipOut: 0.16,
  /** the legible hold that closes every cycle */
  hold: 10.2,
};

/** The site's small deterministic hash → [0, 1) (the same one the scramble effects use). */
export const h01 = hash01;

const ease = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The four whole-word styles of cycle n: a different order every cycle, never the same style twice in a row. */
export function wordStyles(n: number): Style[] {
  // the first cycle is the first impression: the classic ramp first, then ever more geometric
  if (n === 0) return ['rampa', 'braille', 'bloques', 'puntos'];
  const pool = [...STYLES];
  // Fisher–Yates with the cycle's seed
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(h01(n * 7919 + i * 131) * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 4);
}

interface Span { t0: number; t1: number }
interface Timeline {
  words: Span;
  letters: Span;
  flips: Span;
  active: number;
  period: number;
}

/** Durations of one cycle (all cycles share them; only the styles and the chosen letters change). */
export function timeline(count: number): Timeline {
  const T = TIMING;
  const words = T.sweepIn + 4 * T.styleHold + 3 * T.sweepStyle + T.sweepOut;
  const l0 = words + T.rest;
  const letters = (count - 1) * T.stagger + T.letterIn + T.letterHold + T.letterOut;
  const f0 = l0 + letters + T.rest * 0.5;
  const flips = (T.flips - 1) * T.flipEvery + T.flipIn + T.flipHold + T.flipOut;
  const active = f0 + flips;
  return { words: { t0: 0, t1: words }, letters: { t0: l0, t1: l0 + letters }, flips: { t0: f0, t1: f0 + flips }, active, period: active + T.hold };
}

const SOLID: LetterState = { a: 'solido', b: 'solido', p: 0, sweep: 'linea', solo: false };

/** In, hold, out: the state of a letter that goes solid → s → solid over [t0, t0 + i + h + o]. */
function inHoldOut(t: number, t0: number, i: number, h: number, o: number, s: Style): LetterState | null {
  const x = t - t0;
  if (x < 0 || x >= i + h + o) return null;
  if (x < i) return { a: 'solido', b: s, p: ease(x / i), sweep: 'tejido', solo: true };
  if (x < i + h) return { a: 'solido', b: s, p: 1, sweep: 'tejido', solo: true };
  return { a: s, b: 'solido', p: ease((x - i - h) / o), sweep: 'tejido', solo: true };
}

/** The letters that flip on their own in cycle n (distinct, from the seed). */
export function flipLetters(n: number, count: number): Array<{ letter: number; style: Style }> {
  const out: Array<{ letter: number; style: Style }> = [];
  const used = new Set<number>();
  for (let k = 0; out.length < Math.min(TIMING.flips, count); k++) {
    const letter = Math.floor(h01(n * 104729 + k * 7 + 3) * count);
    if (used.has(letter)) continue;
    used.add(letter);
    out.push({ letter, style: STYLES[Math.floor(h01(n * 3571 + k * 13 + 1) * STYLES.length)] });
  }
  return out;
}

/**
 * What the headline shows at time t (seconds since the animation started), for `count` letters.
 * t < firstHold: legible. Then cycles of `period` seconds, each one opening with its active part.
 */
export function frameAt(t: number, count: number): Frame {
  const tl = timeline(count);
  const solid = (cycle: number, phase: Phase = 'quieto'): Frame => ({ cycle, phase, letters: Array.from({ length: count }, () => SOLID), legible: true });
  if (t < TIMING.firstHold || count <= 0) return solid(0);
  const u = t - TIMING.firstHold;
  const cycle = Math.floor(u / tl.period);
  const x = u - cycle * tl.period;
  if (x >= tl.active) return solid(cycle);
  const T = TIMING;

  // palabras: the whole line, swept in reading order
  if (x < tl.words.t1) {
    const s = wordStyles(cycle);
    const seq: Array<{ a: Style; b: Style; d: number; hold: number }> = [
      { a: 'solido', b: s[0], d: T.sweepIn, hold: T.styleHold },
      { a: s[0], b: s[1], d: T.sweepStyle, hold: T.styleHold },
      { a: s[1], b: s[2], d: T.sweepStyle, hold: T.styleHold },
      { a: s[2], b: s[3], d: T.sweepStyle, hold: T.styleHold },
      { a: s[3], b: 'solido', d: T.sweepOut, hold: 0 },
    ];
    let at = 0;
    for (const step of seq) {
      if (x < at + step.d + step.hold) {
        const p = ease(clamp01((x - at) / step.d));
        const st: LetterState = { a: step.a, b: step.b, p, sweep: 'linea', solo: false };
        const legible = step.b === 'solido' && p >= 1;
        return { cycle, phase: 'palabras', letters: Array.from({ length: count }, () => st), legible };
      }
      at += step.d + step.hold;
    }
    return solid(cycle, 'palabras');
  }

  // letras: one after another, each in its own style
  if (x >= tl.letters.t0 && x < tl.letters.t1) {
    const letters = Array.from({ length: count }, (_v, k) =>
      inHoldOut(x, tl.letters.t0 + k * T.stagger, T.letterIn, T.letterHold, T.letterOut, STYLES[(k + cycle) % STYLES.length]) ?? SOLID);
    return { cycle, phase: 'letras', letters, legible: letters.every(l => l === SOLID) };
  }

  // azar: a few letters flip on their own
  if (x >= tl.flips.t0 && x < tl.flips.t1) {
    const letters: LetterState[] = Array.from({ length: count }, () => SOLID);
    flipLetters(cycle, count).forEach((f, j) => {
      const st = inHoldOut(x, tl.flips.t0 + j * T.flipEvery, T.flipIn, T.flipHold, T.flipOut, f.style);
      if (st) letters[f.letter] = st;
    });
    return { cycle, phase: 'azar', letters, legible: letters.every(l => l === SOLID) };
  }
  return solid(cycle, x < tl.letters.t0 ? 'palabras' : 'letras');
}

/** When the next non-legible moment starts, from time t (for sleeping through the holds). */
export function nextActive(t: number, count: number): number {
  const tl = timeline(count);
  if (t < TIMING.firstHold) return TIMING.firstHold;
  const u = t - TIMING.firstHold;
  const cycle = Math.floor(u / tl.period);
  const x = u - cycle * tl.period;
  return x < tl.active ? t : TIMING.firstHold + (cycle + 1) * tl.period;
}
