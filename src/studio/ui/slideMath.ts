/**
 * Sliders under a finger or a pen (ui/Range.tsx): pure parts, tested in tests/unit/touch-slider.test.ts.
 *
 * A slider in a scrolling panel must not change when the panel is scrolled over it. So a touch on a slider
 * does nothing until the finger has shown what it wants: moving sideways (a clear horizontal intent) takes
 * the slider; moving up or down first leaves the gesture to the page, which scrolls. Once taken, the
 * value follows the finger's movement (it never jumps to where the finger landed), and the farther the
 * finger goes from the track, up or down, the finer the adjustment.
 */

export type Intent = 'pending' | 'drag' | 'scroll';

/** Movement (CSS px) before a touch counts as a drag or a scroll. */
export const INTENT_PX = 10;
/** How much more sideways than up-down a movement must be to take the slider. */
export const INTENT_RATIO = 1.8;

/** What the finger wants, from its movement since it landed (dx, dy in CSS px). */
export function intentOf(dx: number, dy: number, slop = INTENT_PX): Intent {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < slop && ay < slop) return 'pending';
  if (ax >= slop && ax > ay * INTENT_RATIO) return 'drag';
  return 'scroll';
}

/** Distance from the track (px, up or down) within which the adjustment is at full speed. */
export const FINE_FROM = 36;
/** Every this many px farther, the adjustment gets one step finer (½, ⅓, ¼…). */
export const FINE_EVERY = 44;
/** The finest it gets. */
export const FINE_MIN = 0.125;

/** How much of the finger's movement reaches the value, `away` px up or down from where the drag began. */
export function fineGain(away: number): number {
  const d = Math.max(0, Math.abs(away) - FINE_FROM);
  return Math.max(FINE_MIN, 1 / (1 + d / FINE_EVERY));
}

/**
 * One step of a drag: the value (unrounded) after the finger moved `dx` px sideways with the gain `gain`,
 * on a track `width` px wide that spans [min, max]. The whole track is the whole range at full gain.
 */
export function dragValue(from: number, dx: number, width: number, min: number, max: number, gain = 1): number {
  const w = Math.max(40, width);
  return Math.min(max, Math.max(min, from + (dx / w) * (max - min) * gain));
}

/** The value under x on a track (a mouse press: the direct behaviour of a native range). */
export function valueAt(x: number, left: number, width: number, min: number, max: number, thumb = 0): number {
  const w = Math.max(1, width - thumb);
  const p = Math.min(1, Math.max(0, (x - left - thumb / 2) / w));
  return min + p * (max - min);
}

/**
 * A stepper held down repeats: a first step at once, then after `delay` ms one every `every` ms, faster
 * the longer it is held (never under `fastest`). Returns the wait before the n-th repeat (n from 1).
 */
export function repeatWait(n: number, delay = 420, every = 110, fastest = 35): number {
  if (n <= 1) return delay;
  return Math.max(fastest, every * Math.pow(0.88, n - 2));
}
