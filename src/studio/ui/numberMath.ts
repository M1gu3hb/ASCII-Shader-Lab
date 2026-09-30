/**
 * Numbers typed by a person (NumberField, the value of a slider): pure parts, tested in
 * tests/unit/number-field.test.ts. A field may be empty or half written while the person types; only
 * when they are done (Enter, leaving the field) is the text read, kept within its range and on its step.
 */

/** Decimals of a step (0.05 → 2, 1 → 0): values are rounded to them, so 0.1 + 0.2 shows as 0.3. */
export function decimalsOf(step: number): number {
  if (!Number.isFinite(step) || step <= 0 || Number.isInteger(step)) return 0;
  const s = String(step);
  const e = /e-(\d+)$/.exec(s);
  if (e) return Number(e[1]);
  return (s.split('.')[1] ?? '').length;
}

/**
 * The number in what was typed, or null when there is none (empty, «-», «abc»). Accepts a decimal comma
 * («12,5»), spaces, a leading «+», and the unit or sign the value is shown with («11 px», «72 %», «90°»,
 * «1.5×»). Never throws.
 */
export function parseTyped(text: string): number | null {
  if (typeof text !== 'string') return null;
  let t = text.trim().replace(/\s+/g, '').replace(/[−–]/g, '-');
  // the unit after the number (letters, %, °, ×)
  t = t.replace(/[a-zA-Z%°×x]+\.?$/u, '');
  // a decimal comma; with both, the last one is the decimal mark («1.200,5», «1,200.5»)
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else t = t.replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** A value on its step (counted from `min`), within [min, max], rounded to the step's decimals. */
export function snapTo(v: number, min: number, max: number, step = 0): number {
  if (!Number.isFinite(v)) return min;
  let x = Math.min(max, Math.max(min, v));
  if (step > 0) {
    x = min + Math.round((x - min) / step) * step;
    // a step that does not divide the range: the last step may pass the end
    if (x > max + 1e-9) x -= step;
    if (x < min - 1e-9) x += step;
  }
  const d = Math.max(decimalsOf(step), decimalsOf(min));
  return Number(Math.min(max, Math.max(min, x)).toFixed(Math.min(10, d || (step > 0 ? 0 : 6))));
}

export interface Settled {
  /** The value to keep (the previous one when nothing usable was typed). */
  value: number;
  /** What happened: the typed number as it was, moved into the range or onto the step, or nothing usable. */
  kind: 'ok' | 'clamped' | 'snapped' | 'empty';
}

/** What a finished field holds: `text` read, kept within [min, max] on `step`; `prev` when it holds no number. */
export function settle(text: string, prev: number, min: number, max: number, step = 0): Settled {
  const v = parseTyped(text);
  if (v === null) return { value: prev, kind: 'empty' };
  const out = snapTo(v, min, max, step);
  if (v < min || v > max) return { value: out, kind: 'clamped' };
  return { value: out, kind: Math.abs(out - v) > 1e-9 ? 'snapped' : 'ok' };
}

/** The value while it is being typed: a number already inside the range (applied live), else null (wait). */
export function liveValue(text: string, min: number, max: number, step = 0): number | null {
  const v = parseTyped(text);
  if (v === null || v < min || v > max) return null;
  return snapTo(v, min, max, step);
}

/** A number as a field shows it: no trailing zeros, the decimal point of the step. */
export function showNumber(v: number, step = 0): string {
  const d = decimalsOf(step);
  return String(Number(v.toFixed(Math.min(10, d || (Number.isInteger(v) ? 0 : 4)))));
}

/** The line a field says after it moved a value into its range (Spanish, for the person). */
export function rangeHint(kind: Settled['kind'], min: number, max: number, value: number, step = 0): string {
  const a = showNumber(min, step), b = showNumber(max, step), v = showNumber(value, step);
  if (kind === 'clamped') return `Va de ${a} a ${b}: queda en ${v}.`;
  if (kind === 'snapped') return `Va de ${showNumber(step)} en ${showNumber(step)}: queda en ${v}.`;
  if (kind === 'empty') return `Escribe un número de ${a} a ${b}.`;
  return '';
}
