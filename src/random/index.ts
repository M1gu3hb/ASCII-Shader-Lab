import type { Recipe } from '../engine/recipe';
import { fingerprint, generate } from './generator';
import { freshSeed } from './seeds';
import type { LockGroup, SpaceId } from './spaces';

export * from './generator';
export * from './spaces';
export * from './archetypes';
export * from './palettes';
export * from './seeds';
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
  maxTries?: number;
}

export interface RollResult { recipe: Recipe; seed: string; fp: string; tries: number; repeated: boolean }

/**
 * Draws a new creation. Without an explicit seed it keeps drawing fresh seeds until the
 * result doesn't look like anything in the user's history (bounded number of tries).
 */
export function roll(inp: RollInput): RollResult {
  if (inp.seed) {
    const recipe = generate({ seed: inp.seed, space: inp.space, arch: inp.arch, base: inp.base, locks: inp.locks });
    const fp = fingerprint(recipe);
    return { recipe, seed: inp.seed, fp, tries: 1, repeated: inp.seen.has(fp) };
  }
  const max = inp.maxTries ?? 40;
  let last: RollResult | null = null;
  for (let i = 0; i < max; i++) {
    const seed = freshSeed();
    const recipe = generate({ seed, space: inp.space, arch: inp.arch, base: inp.base, locks: inp.locks });
    const fp = fingerprint(recipe);
    last = { recipe, seed, fp, tries: i + 1, repeated: inp.seen.has(fp) };
    if (!last.repeated) return last;
  }
  return last!;
}
