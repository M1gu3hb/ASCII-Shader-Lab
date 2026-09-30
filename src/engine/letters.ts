/**
 * Per-letter animation (recipe.text.anim for the big text, recipe.msg.anim for the message). Everything
 * here is a pure function of the held time, computed in JavaScript for both engines: the big text is drawn
 * again with each letter moved (text.ts), the message's letters are placed again in the grid before it is
 * uploaded (WebGL) or read (basic engine). The same time gives the same frame, so exports are exact.
 */
import { loopTime } from './loop';
import type { LetterAnim, Recipe } from './recipe';
import type { MsgLayout } from './text';

/** A well-mixed hash of two integers, in [0, 1). */
export function hashN(a: number, b = 0): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(((b | 0) + 0x632be5ab) | 0, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth = (e0: number, e1: number, x: number) => { let t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const posMod = (x: number, m: number) => x - m * Math.floor(x / m);

/** Explosion envelope over its cycle: together (a while), out, a breath, back. */
function burst(u: number) { return smooth(1.6, 2.4, u) - smooth(3.0, 4.2, u); }
const BURST = 4.6;

/* ------------------------------------------------------------------ */
/* The big text                                                        */
/* ------------------------------------------------------------------ */

/** Characters a letter takes while it is being scrambled (drawn in the text's own font). */
const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$*+=?<>/';

export interface LetterPose {
  /** Offset of the letter, in px of the text canvas. */
  dx: number; dy: number;
  rot: number;
  scale: number;
  /** Brightness it is drawn with (0 hides it). */
  grey: number;
  /** Another character shown in its place, or null. */
  glyph: string | null;
}

export interface LetterSlot {
  /** Index among the visible letters (spaces skipped), their count, word index and number of words. */
  k: number; n: number; word: number; words: number;
  /** Centre of the letter relative to the centre of the text, in px. */
  cx: number; cy: number;
}

/** Whether the big text is drawn letter by letter at each moment. */
export const textAnimated = (t: Recipe['text']) => !!t.anim;

/** Seconds a big-text animation takes to come back to where it was (`words`: the text's words). */
export function textAnimPeriod(a: LetterAnim, words: number): number {
  const P = a.kind === 'ola' ? (2 * Math.PI) / 3 : a.kind === 'rebote' ? Math.PI / 2.2 : a.kind === 'latido' ? (2 * Math.PI) / 2.4
    : a.kind === 'brillo' ? (2 * Math.PI) / 2.6 : a.kind === 'revolver' ? 4.4 : a.kind === 'palabras' ? words * 0.5 + 3
    : a.kind === 'explosion' ? BURST : a.kind === 'orbita' ? (2 * Math.PI) / 1.1
    : a.kind === 'enjambre' ? (2 * Math.PI) / 0.9 : a.kind === 'cascada' ? 5.2 : 0;
  return P / a.speed;
}

/** Seconds a message animation takes to come back to where it was (`count`: its typing positions). */
export function msgAnimPeriod(a: LetterAnim, count: number): number {
  const P = a.kind === 'ola' ? (2 * Math.PI) / 3 : a.kind === 'rebote' ? Math.PI / 2.2 : a.kind === 'revolver' ? (count + 14) / 9
    : a.kind === 'explosion' ? BURST : a.kind === 'color' ? 1 / 0.35
    : a.kind === 'orbita' ? (2 * Math.PI) / 1.1 : a.kind === 'enjambre' ? (2 * Math.PI) / 0.9
    : a.kind === 'cascada' ? 5.2 : 0;
  return P / a.speed;
}

/**
 * Where a letter of the big text is at time T (seconds, held) and how it looks. `fs`: font size in px;
 * `reach`: how far letters may fly (px). `loop`: the piece's «Bucle perfecto» (a whole number of cycles in it).
 */
export function letterPose(a: LetterAnim, T: number, s: LetterSlot, fs: number, reach: number, loop = 0): LetterPose {
  if (loop > 0) T = loopTime(T, loop, textAnimPeriod(a, s.words));
  const A = a.amount, u = T * a.speed, k = s.k;
  const pose: LetterPose = { dx: 0, dy: 0, rot: 0, scale: 1, grey: 1, glyph: null };
  switch (a.kind) {
    case 'ola':
      pose.dy = Math.sin(u * 3 - k * 0.55) * A * 0.24 * fs;
      break;
    case 'rebote':
      pose.dy = -Math.abs(Math.sin(u * 2.2 - k * 0.45)) * A * 0.45 * fs;
      break;
    case 'latido':
      pose.scale = 1 + A * 0.55 * Math.pow(Math.max(0, Math.sin(u * 2.4 - k * 0.5)), 3);
      break;
    case 'brillo':
      pose.grey = 1 - A * 0.8 * (0.5 + 0.5 * Math.cos(u * 2.6 - k * 0.6));
      break;
    case 'revolver': {
      // letters arrive scrambled and settle left to right, stay, scramble out and leave; `A`: how many take part
      if (hashN(k, 7) >= 0.25 + 0.75 * A) break;
      const P = 4.4, v = posMod(u, P), f = s.n > 1 ? k / (s.n - 1) : 0;
      const settle = 0.2 + f, leave = 3 + 0.5 * f;
      const rnd = SCRAMBLE[Math.floor(hashN(k, Math.floor(T * 14)) * SCRAMBLE.length)];
      if (v < settle - 0.7 || v >= leave + 0.35) pose.grey = 0;
      else if (v < settle || v >= leave) pose.glyph = rnd;
      break;
    }
    case 'palabras': {
      // words come in one after another (rising and growing into place), stay, and go together
      const step = 0.5, P = s.words * step + 3;
      const v = posMod(u, P);
      const inP = Math.min(1, Math.max(0, (v - s.word * step) / 0.28));
      const e = 1 - Math.pow(1 - inP, 3);
      const out = Math.min(1, Math.max(0, (v - (s.words * step + 2.2)) / 0.45));
      pose.grey = e * (1 - out);
      pose.dy = (1 - e) * A * 0.4 * fs;
      pose.scale = 1 - (1 - e) * A * 0.45;
      break;
    }
    case 'explosion': {
      const e = burst(posMod(u, BURST));
      if (e <= 0) break;
      const near = Math.hypot(s.cx, s.cy) < fs * 0.2;
      const ang = (near ? hashN(k, 5) * Math.PI * 2 : Math.atan2(s.cy, s.cx)) + (hashN(k, 1) - 0.5) * 1.6;
      const dist = A * (0.4 + 0.6 * hashN(k, 2)) * reach;
      pose.dx = Math.cos(ang) * dist * e;
      pose.dy = Math.sin(ang) * dist * e;
      pose.rot = (hashN(k, 3) - 0.5) * 2 * Math.PI * A * e;
      pose.scale = 1 + (hashN(k, 4) - 0.35) * A * 0.9 * e;
      break;
    }
    case 'orbita': {
      const phase = u * 1.1 + k * 0.72;
      pose.dx = Math.cos(phase) * A * fs * 0.28;
      pose.dy = Math.sin(phase) * A * fs * 0.35;
      pose.rot = Math.sin(phase) * A * 0.12;
      break;
    }
    case 'enjambre': {
      // A common return envelope makes the word legible for half of each cycle.
      const v = u * 0.9, e = (1 - Math.cos(v)) * 0.5;
      const ang = hashN(k, 13) * Math.PI * 2, dist = A * (0.2 + 0.45 * hashN(k, 14)) * reach * e;
      pose.dx = Math.cos(ang + 0.3 * Math.sin(v)) * dist;
      pose.dy = Math.sin(ang + 0.3 * Math.sin(v)) * dist;
      pose.rot = (hashN(k, 15) - 0.5) * A * 0.55 * e;
      break;
    }
    case 'cascada': {
      const v = posMod(u, 5.2), f = s.n > 1 ? k / (s.n - 1) : 0;
      const enter = smooth(0.15 + f * 1.25, 0.55 + f * 1.25, v);
      const leave = smooth(3.65 + f * 0.55, 4.2 + f * 0.55, v);
      pose.grey = enter * (1 - leave);
      pose.dy = (-1 + enter + leave * 2) * A * fs * 0.9;
      pose.scale = 0.7 + 0.3 * enter * (1 - leave);
      break;
    }
    default:
  }
  return pose;
}

/* ------------------------------------------------------------------ */
/* The message                                                          */
/* ------------------------------------------------------------------ */

/** The message's colour animation, when it has one (drawn by the select pass, not moved). */
export const msgColorAnim = (m: Recipe['msg']) => (m.on && m.anim?.kind === 'color' ? m.anim : null);
/** The time «Color por letra» reads at time T (held): with a loop, a whole number of colour cycles in it. */
export const msgColorTime = (m: Recipe['msg'], T: number, loop: number) => {
  const a = msgColorAnim(m);
  return a && loop > 0 ? loopTime(T, loop, msgAnimPeriod(a, 0)) : T;
};

/** Kept for symmetry with the engines' glyph tables: scrambled glyphs come from the ramp's n glyphs. */
export const scramblePool = (n: number) => Math.max(2, n);

interface Box { cx: number; cy: number; span: number; lines: number }
const boxes = new WeakMap<MsgLayout, Box>();
/** Centre and size of a message's letters (cached per layout). */
function boxOf(lay: MsgLayout, rows: number): Box {
  let b = boxes.get(lay);
  if (b) return b;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const w = lay.width;
  for (let r = 0; r < rows; r++) for (let c = 0; c < w; c++) {
    const i = (r * w + c) * 4;
    if (lay.data[i] + lay.data[i + 1] * 256 > 0) { x0 = Math.min(x0, c); x1 = Math.max(x1, c); y0 = Math.min(y0, r); y1 = Math.max(y1, r); }
  }
  b = Number.isFinite(x0) ? { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, span: Math.max(x1 - x0, 8), lines: y1 - y0 + 1 } : { cx: 0, cy: 0, span: 8, lines: 1 };
  boxes.set(lay, b);
  return b;
}

/**
 * Where a message letter at (col, row), typed at position `ord`, is at time T, and which glyph it shows
 * (0: its own). Rows are integers: letters move from cell to cell.
 */
function moveLetter(a: LetterAnim, T: number, col: number, row: number, ord: number, box: Box, n: number, N: number, loop: number): [number, number, number] {
  if (loop > 0) T = loopTime(T, loop, msgAnimPeriod(a, n));
  const A = a.amount, u = T * a.speed;
  switch (a.kind) {
    // (by column: letters of one column move together, so lines never run into each other; with several
    // lines the letters move one row at most, so the lines stay readable)
    case 'ola': return [col, row + Math.round(Math.sin(u * 3 - col * 0.35) * A * (box.lines > 1 ? 1.2 : 2.2)), 0];
    case 'rebote': return [col, row - Math.round(Math.abs(Math.sin(u * 2.2 - col * 0.3)) * A * (box.lines > 1 ? 1.2 : 2.6)), 0];
    case 'revolver': {
      // a band of scrambled letters sweeps along the message
      const pos = posMod(u * 9, n + 14) - 7;
      if (Math.abs(ord - pos) < 1 + 3 * A) return [col, row, 1 + Math.floor(hashN(ord, Math.floor(T * 20)) * Math.max(N - 1, 1))];
      return [col, row, 0];
    }
    case 'explosion': {
      const e = burst(posMod(u, BURST));
      if (e <= 0) return [col, row, 0];
      const ang = Math.atan2((row - box.cy) * 2, col - box.cx + 1e-3) + (hashN(ord, 1) - 0.5) * 1.4;
      const dist = A * (0.3 + 0.7 * hashN(ord, 2)) * box.span * 0.8 * e;
      return [col + Math.round(Math.cos(ang) * dist), row + Math.round(Math.sin(ang) * dist * 0.5), 0];
    }
    case 'orbita': {
      const phase = u * 1.1 + ord * 0.72;
      return [col + Math.round(Math.cos(phase) * A * (box.lines > 1 ? 0.8 : 1.6)),
        row + Math.round(Math.sin(phase) * A * (box.lines > 1 ? 0.8 : 1.6)), 0];
    }
    case 'enjambre': {
      const v = u * 0.9, e = (1 - Math.cos(v)) * 0.5;
      const ang = hashN(ord, 13) * Math.PI * 2;
      const dist = A * (0.25 + 0.6 * hashN(ord, 14)) * box.span * 0.24 * e;
      return [col + Math.round(Math.cos(ang + 0.3 * Math.sin(v)) * dist),
        row + Math.round(Math.sin(ang + 0.3 * Math.sin(v)) * dist * 0.5), 0];
    }
    case 'cascada': {
      const v = posMod(u, 5.2), f = n > 1 ? ord / (n - 1) : 0;
      const enter = smooth(0.15 + f * 1.25, 0.55 + f * 1.25, v);
      const leave = smooth(3.65 + f * 0.55, 4.2 + f * 0.55, v);
      if (enter < 0.45 || leave > 0.55) return [-1, -1, 0];
      return [col, row - Math.round((1 - enter) * A * 2) + Math.round(leave * A * 2), 0];
    }
    default: return [col, row, 0];
  }
}

/**
 * The message's grid (layoutMessage's data) with its letters where the animation puts them at time T.
 * `N`: glyphs in the ramp (scrambled letters take one of them). Letters that leave the grid are not drawn.
 * `loop`: the piece's «Bucle perfecto».
 */
export function animateMessage(lay: MsgLayout, a: LetterAnim, T: number, rows: number, N: number, loop = 0): Uint8Array {
  const w = lay.width, src = lay.data, out = new Uint8Array(src.length);
  const box = boxOf(lay, rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < w; c++) {
    const i = (r * w + c) * 4;
    const gi = src[i] + src[i + 1] * 256;
    if (!gi) continue;
    const ord = src[i + 2] + src[i + 3] * 256;
    const [c2, r2, g2] = moveLetter(a, T, c, r, ord, box, lay.count, N, loop);
    if (c2 < 0 || c2 >= w || r2 < 0 || r2 >= rows) continue;
    const j = (r2 * w + c2) * 4;
    const g = g2 ? g2 + 1 : gi;
    out[j] = g & 255; out[j + 1] = g >> 8; out[j + 2] = src[i + 2]; out[j + 3] = src[i + 3];
  }
  return out;
}

/** Where the typing cursor goes with the letters (it follows letter `ord`); [-1, -1] when off the grid. */
export function movedCell(lay: MsgLayout, a: LetterAnim, T: number, rows: number, cell: [number, number], ord: number, loop = 0): [number, number] {
  if (a.kind === 'color') return cell;
  const [c, r] = moveLetter(a, T, cell[0], cell[1], ord, boxOf(lay, rows), lay.count, 2, loop);
  return c < 0 || c >= lay.width || r < 0 || r >= rows ? [-1, -1] : [c, r];
}
