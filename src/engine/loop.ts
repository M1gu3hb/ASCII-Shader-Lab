/**
 * «Bucle perfecto» (recipe.motion.loop): with a loop of L seconds, everything that moves repeats every L
 * seconds, so the frame at t = L is the frame at t = 0 and a looping clip has no seam. The pattern layers
 * (and what drifts without a period: the domain warp, the colour cycle, the noise colour map) fade from
 * their state at the end of the loop into their start. What has a period of its own (letters that move, the
 * message's typing, Ondular, the text ⇄ pattern dissolve, stop motion, the beat) makes a whole number of its
 * cycles in the loop, the number nearest to its own speed and at least one, so it runs a little faster or
 * slower than without the loop. Without a loop nothing here changes a thing. Used by both engines. Pure.
 */

/**
 * `t` folded into [0, L), to the nanosecond: t and t + L give the very same number (without the rounding,
 * 1.7 + 12 folds to 1.6999…, and what steps on floor(t · rate) would change its step).
 */
export const fold = (t: number, L: number) => {
  const x = Math.round((t - L * Math.floor(t / L)) * 1e9) / 1e9;
  return x >= L ? 0 : x;
};

/**
 * The time an effect that repeats every `period` seconds reads inside a loop of `loop` seconds: without a
 * loop, `t` as it is; with one, the loop's time stretched so that a whole number of periods (the nearest to
 * the effect's own speed, at least one) fits the loop exactly.
 */
export function loopTime(t: number, loop: number, period: number): number {
  if (!(loop > 0) || !(period > 0) || !Number.isFinite(period)) return t;
  const n = Math.max(1, Math.round(loop / period));
  return fold(t, loop) * ((n * period) / loop);
}

/**
 * The piece's clock as the passes read it: stop motion (`hold` frames per second) and, with a loop, folded
 * into it, with the stop-motion rate rounded so that a whole number of held frames fills the loop.
 */
export function pieceTime(t: number, m: { hold: number; loop: number }): number {
  const L = m.loop, h = m.hold;
  if (!(L > 0)) return h > 0 ? Math.floor(t * h) / h : t;
  const tl = fold(t, L);
  if (!(h > 0)) return tl;
  const n = Math.max(1, Math.round(L * h)), hq = n / L;
  const k = Math.floor(tl * hq + 1e-7);
  return (k >= n ? 0 : k) / hq;
}

/** «Palabras» glyph mode: cells the words move per second (jitter × 8), a whole number of passes over the list in a loop. */
export function wordsRate(jitter: number, n: number, loop: number): number {
  const r = jitter * 8;
  if (!(loop > 0) || !(r > 0) || !(n > 0)) return r;
  return (Math.max(1, Math.round((r * loop) / n)) * n) / loop;
}

/** The text ⇄ pattern dissolve's period (seconds) inside a loop. */
export function morphPeriod(morph: number, loop: number): number {
  if (!(loop > 0) || !(morph > 0)) return morph;
  return loop / Math.max(1, Math.round(loop / morph));
}

/** The two waves of Ondular (sin(t·2), cos(t·1.6)): the times they read. */
export function ondularTimes(t: number, loop: number): [number, number] {
  return [loopTime(t, loop, Math.PI), loopTime(t, loop, (2 * Math.PI) / 1.6)];
}
