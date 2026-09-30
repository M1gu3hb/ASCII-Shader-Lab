import type { Recipe } from '../engine/recipe';
import { lookDistance, lookOf, type Look } from './diversity';
import { fingerprint, generate, genOf, GEN_VERSION } from './generator';
import { freshSeed } from './seeds';
import type { LockGroup, SpaceId } from './spaces';

export * from './generator';
export * from './spaces';
export * from './archetypes';
export * from './palettes';
export * from './seeds';
export * from './diversity';
export { PALETTE5_NAMES, makePalette5, tune5, type Palette5Style } from './palettes5';
export { SCENE_SEEDS } from './scenes5';
export { STUDIO_WORDS, isStudioWord } from './words';
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
  /** Texto: whether the base's text is the person's own words (GenInput.ownText) */
  ownText?: boolean;
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

/**
 * Version 5 also holds back, over the last results: the same colour family (hue in 30° steps, or grey) and
 * paper (light or dark), the same characters, and the same family of shapes right after one another.
 */
const HUE_KEEP = [0.3, 0.65];
const CS_KEEP = [0.4, 0.75];
const FAMILY_KEEP = 0.55;
/** Three results in a row on paper (or three on black): the fourth is less likely to be the same. */
const PAPER_RUN_KEEP = 0.5;

export interface RecencyOpts {
  lead: boolean; arch: boolean; look: boolean;
  /** version 5: judge the colours (off while «Color» is locked), the characters («Glifos») and the shape family («Forma») */
  palette?: boolean; charset?: boolean; family?: boolean;
}

/** A look's colour family: hue in 30° steps (or 'n', grey) and whether it is on paper. */
export const colourFamily = (l: Look) => (l.chroma < 0.04 ? 'n' : String(Math.floor(((l.hue + 15) % 360) / 30))) + (l.light ? 'L' : 'D');

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
  if (o.palette) {
    const f = colourFamily(L);
    for (let k = 0; k < Math.min(n, HUE_KEEP.length); k++) if (colourFamily(recent[n - 1 - k]) === f) { w *= HUE_KEEP[k]; break; }
    if (n >= 3 && recent.slice(-3).every(x => x.light === L.light)) w *= PAPER_RUN_KEEP;
  }
  if (o.charset) {
    for (let k = 0; k < Math.min(n, CS_KEEP.length); k++) if (recent[n - 1 - k].charset === L.charset) { w *= CS_KEEP[k]; break; }
  }
  if (o.family && recent[n - 1].family === L.family && recent[n - 1].lead !== L.lead) w *= FAMILY_KEEP;
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
    const recipe = generate({ seed: inp.seed, space: inp.space, arch: inp.arch, base: inp.base, locks: inp.locks, gen, ownText: inp.ownText });
    const fp = fingerprint(recipe);
    return { recipe, seed: inp.seed, fp, tries: 1, repeated: inp.seen.has(fp) };
  }
  const max = inp.maxTries ?? 48;
  const fresh = inp.fresh ?? freshSeed, rand = inp.rand ?? Math.random;
  const locks = inp.locks ?? [];
  const recent = (inp.recent ?? []).slice(-LEAD_KEEP.length).map(lookOf);
  const v5 = genOf(gen ?? GEN_VERSION) >= 5;
  const opts: RecencyOpts = {
    lead: !locks.includes('forma'), arch: !inp.arch, look: locks.length === 0,
    ...(v5 ? { palette: !locks.includes('color'), charset: !locks.includes('glifos'), family: !locks.includes('forma') } : {}),
  };
  let best: RollResult | null = null, bestW = -1;
  for (let i = 0; i < max; i++) {
    const seed = fresh();
    const recipe = generate({ seed, space: inp.space, arch: inp.arch, base: inp.base, locks, gen, ownText: inp.ownText });
    const fp = fingerprint(recipe);
    const res: RollResult = { recipe, seed, fp, tries: i + 1, repeated: inp.seen.has(fp) };
    if (res.repeated) { if (!best) best = res; continue; }
    const w = keepChance(recipe, recent, opts);
    if (w >= 1 || rand() < w) return res;
    if (w > bestW) { best = res; bestW = w; }
  }
  return { ...best!, tries: max };
}
