/**
 * Typing time tables shared by the typing templates («Escritura de terminal», «Borrado», «Escritura con
 * errores»): which cells or characters form each unit (character, word, line) and when each one appears,
 * with an irregular rhythm and pauses after punctuation and line ends. Cached per grid.
 */
import { hashString, rand01, type CellGrid } from '../project/clips';
import { cached, gridKey } from './kit';

/** One unit typed at once (a character, a word or a line): its cells (grid) or characters (text). */
export interface Typing {
  /** When each unit appears (0..1, increasing). */
  at: Float64Array;
  /** Glyph grids: the unit of each cell (−1: not typed), and the first cell of each unit. */
  unitOf?: Int32Array;
  first?: Int32Array;
  last?: Int32Array;
  /** Text: where each unit ends in the string. */
  ends?: Int32Array;
}

const PUNCT_STRONG = /[.!?…;:]$/;
const PUNCT_SOFT = /[,]$/;

/**
 * Appearance times of units with weights: an irregular rhythm (jitter) and pauses after punctuation and
 * line ends. Unit k appears when its typing slot ends; the pause follows it. Unit 0 appears after its slot
 * (p > 0) and the last one at p ≤ 1, so p = 0 shows nothing typed and p = 1 everything.
 */
export function times(units: Array<{ text: string; len: number; eol: boolean }>, jitter: number, pause: number, seed: number): Float64Array {
  const n = units.length;
  const type = new Float64Array(n), rest = new Float64Array(n);
  let W = 0;
  for (let k = 0; k < n; k++) {
    const u = units[k];
    let w = u.len > 1 ? 0.6 + 0.12 * u.len : 1;
    if (jitter > 0) w *= Math.max(0.2, 1 + jitter * (rand01(seed, k, 17) - 0.5) * 1.6 + (rand01(seed, k, 18) < jitter * 0.08 ? jitter * 2.5 : 0));
    let r = 0;
    if (pause > 0) {
      const t = u.text.trimEnd();
      if (PUNCT_STRONG.test(t)) r += pause * 3;
      else if (PUNCT_SOFT.test(t)) r += pause * 1.5;
      if (u.eol) r += pause * 2;
    }
    type[k] = w; rest[k] = k < n - 1 ? r : 0;
    W += w + rest[k];
  }
  const at = new Float64Array(n);
  let cum = 0;
  for (let k = 0; k < n; k++) { at[k] = W > 0 ? (cum + type[k]) / W : 1; cum += type[k] + rest[k]; }
  if (n) at[n - 1] = Math.min(1, at[n - 1]);
  return at;
}

/** Units typed by progress p (binary search on the appearance times). */
export function typedCount(at: Float64Array, p: number): number {
  let lo = 0, hi = at.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (at[m] <= p + 1e-9) lo = m + 1; else hi = m; }
  return lo;
}

export function gridTyping(g: CellGrid, unit: string, skipEmpty: boolean, jitter: number, pause: number, seed: number): Typing {
  return cached(`type:${gridKey(g)}:${unit}:${skipEmpty}:${jitter}:${pause}:${seed}`, () => {
    const cols = Math.max(1, g.cols), rows = Math.max(1, g.rows), n = cols * rows;
    const full = (i: number) => !g.chars || (g.chars[i] ?? ' ') !== ' ';
    const unitOf = new Int32Array(n).fill(-1);
    const first: number[] = [], last: number[] = [];
    const units: Array<{ text: string; len: number; eol: boolean }> = [];
    const open = (i: number) => { first.push(i); last.push(i); units.push({ text: g.chars?.[i] ?? '', len: 1, eol: false }); };
    for (let r = 0; r < rows; r++) {
      const rowStart = units.length;
      let inWord = false;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const on = full(i);
        if (!on && skipEmpty) { inWord = false; continue; }
        if (unit === 'linea') {
          if (units.length === rowStart) open(i); else { const k = units.length - 1; last[k] = i; units[k].len++; units[k].text += g.chars?.[i] ?? ''; }
        } else if (unit === 'palabra' && on) {
          if (!inWord) open(i); else { const k = units.length - 1; last[k] = i; units[k].len++; units[k].text += g.chars?.[i] ?? ''; }
          inWord = true;
        } else if (unit === 'palabra') {
          inWord = false;
          // an empty cell typed on its own (when empty cells are not skipped)
          open(i);
        } else open(i);
        unitOf[i] = units.length - 1;
      }
      if (units.length > rowStart) units[units.length - 1].eol = true;
    }
    return { at: times(units, jitter, pause, seed), unitOf, first: Int32Array.from(first), last: Int32Array.from(last) };
  });
}

export function textTyping(text: string, unit: string, jitter: number, pause: number, seed: number): Typing & { chars: string[] } {
  return cached(`typet:${hashString(text)}:${text.length}:${unit}:${jitter}:${pause}:${seed}`, () => {
    const chars = Array.from(text);
    const units: Array<{ text: string; len: number; eol: boolean }> = [];
    const ends: number[] = [];
    let cur = '';
    let len = 0;
    const push = (eol: boolean) => { if (!len) return; units.push({ text: cur, len, eol }); ends.push(ends.length ? ends[ends.length - 1] + len : len); cur = ''; len = 0; };
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      cur += ch; len++;
      if (unit === 'caracter') push(ch === '\n');
      else if (unit === 'palabra') { if (ch === ' ' || ch === '\n') push(ch === '\n'); }
      else if (ch === '\n') push(true);
    }
    push(true);
    return { chars, at: times(units, jitter, pause, seed), ends: Int32Array.from(ends) };
  });
}
