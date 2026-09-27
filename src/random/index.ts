import type { Recipe } from '../engine/recipe';
import { lookDistance, lookOf, type Look } from './diversity';
import { fingerprint, generate } from './generator';
import { freshSeed } from './seeds';
import type { LockGroup, SpaceId } from './spaces';

export * from './generator';
export * from './spaces';
export * from './archetypes';
export * from './palettes';
export * from './seeds';
export * from './diversity';
export { Rng, hash53 } from './prng';

export interface RollInput {
  space: SpaceId;
  arch?: string;
  base: Recipe;
  locks?: LockGroup[];
  /** fingerprints already seen by this user */
  seen: Set<string>;
  /** explicit seed: reproduce exactly, no de-duplication */
  seed?: string;
  /** generator version (default: the current one); an explicit seed with its version reproduces its piece */
  gen?: number;
  /**
   * The latest results of this space, oldest first (about ten). A draw that repeats their lead pattern, their
   * style or their look is less likely to be kept (never impossible). Ignored with an explicit seed.
   */
  recent?: readonly Recipe[];
  maxTries?: number;
  /** where fresh seeds come from (default: a random one each time); reports and tests pass seeded ones */
  fresh?: () => string;
  /** uniform random numbers in [0, 1) for keeping or passing on a draw (default Math.random) */
  rand?: () => number;
}

export interface RollResult { recipe: Recipe; seed: string; fp: string; tries: number; repeated: boolean }

/** How strongly a lead pattern seen 1, 2, 3… results ago is held back (the chance a draw with it is kept). */
const LEAD_KEEP = [0.04, 0.2, 0.35, 0.5, 0.6, 0.7, 0.78, 0.85, 0.9, 0.95];
/** The same for the style (archetype): 1, 2, 3, 4 results ago. */
const ARCH_KEEP = [0.3, 0.55, 0.75, 0.9];
/** A draw that looks like one of the last five (lookDistance below .25 or .35) is kept this often. */
const LOOK_KEEP: Array<[number, number]> = [[0.25, 0.2], [0.35, 0.6]];

export interface RecencyOpts { lead: boolean; arch: boolean; look: boolean }

/**
 * The chance (0..1] of keeping `r` given the latest results (`recent`, oldest first, as looks). 1 when it
 * shares nothing with them. `lead`: judge the lead pattern (off while «Forma» is locked); `arch`: judge the
 * style (off when the person chose one); `look`: judge the overall look (off with any lock).
 */
export function keepChance(r: Recipe, recent: readonly Look[], o: RecencyOpts): number {
  if (!recent.length) return 1;
  const L = lookOf(r);
  let w = 1;
  const n = recent.length;
  if (o.lead) {
    for (let k = 0; k < Math.min(n, LEAD_KEEP.length); k++) if (recent[n - 1 - k].lead === L.lead) { w *= LEAD_KEEP[k]; break; }
  }
  if (o.arch) {
    for (let k = 0; k < Math.min(n, ARCH_KEEP.length); k++) if (recent[n - 1 - k].arch === L.arch) { w *= ARCH_KEEP[k]; break; }
  }
  if (o.look) {
    let near = Infinity;
    for (let k = 0; k < Math.min(n, 5); k++) near = Math.min(near, lookDistance(recent[n - 1 - k], L));
    for (const [d, keep] of LOOK_KEEP) if (near < d) { w *= keep; break; }
  }
  return w;
}

/**
 * Draws a new creation. Without an explicit seed it keeps drawing fresh seeds until the result doesn't look
 * like anything in the user's history (bounded number of tries), and passes on draws that repeat what was
 * just on screen with the chances above. Every draw is a pure function of its own seed, so whatever comes
 * out is reproduced by its seed alone; only the choice among draws looks at the history.
 */
export function roll(inp: RollInput): RollResult {
  const gen = inp.gen;
  if (inp.seed) {
    const recipe = generate({ seed: inp.seed, space: inp.space, arch: inp.arch, base: inp.base, locks: inp.locks, gen });
    const fp = fingerprint(recipe);
    return { recipe, seed: inp.seed, fp, tries: 1, repeated: inp.seen.has(fp) };
  }
  const max = inp.maxTries ?? 40;
  const fresh = inp.fresh ?? freshSeed, rand = inp.rand ?? Math.random;
  const locks = inp.locks ?? [];
  const recent = (inp.recent ?? []).slice(-LEAD_KEEP.length).map(lookOf);
  const opts: RecencyOpts = { lead: !locks.includes('forma'), arch: !inp.arch, look: locks.length === 0 };
  let best: RollResult | null = null, bestW = -1;
  for (let i = 0; i < max; i++) {
    const seed = fresh();
    const recipe = generate({ seed, space: inp.space, arch: inp.arch, base: inp.base, locks, gen });
    const fp = fingerprint(recipe);
    const res: RollResult = { recipe, seed, fp, tries: i + 1, repeated: inp.seen.has(fp) };
    if (res.repeated) { if (!best) best = res; continue; }
    const w = keepChance(recipe, recent, opts);
    if (w >= 1 || rand() < w) return res;
    if (w > bestW) { best = res; bestW = w; }
  }
  return { ...best!, tries: max };
}
