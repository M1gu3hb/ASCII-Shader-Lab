import { defaultRecipe, type Recipe } from '../engine/recipe';
import { generate } from '../random/generator';

export { CONTACTS, CONTACT_CSS, CONTACT_PX, contactSrc, type Contact } from './contacts';

/**
 * The landing's «Azar» block. The contact sheet (./contacts.ts) is pre-rendered by scripts/posters.mjs into
 * public/ex/azar/<seed>.webp; clicking one weaves the same piece live. The generator version is pinned, so
 * a future version of the dice never makes a pre-rendered image and its live piece disagree (the studio
 * keeps every version reachable, see GEN_VERSIONS).
 */
export const AZAR_GEN = 2;
export const AZAR_SPACE = 'arte' as const;

/** The piece a draw weaves (same function for the pre-rendered image and the live stage). */
export function woven(d: { seed: string; arch?: string }, gen = AZAR_GEN): Recipe {
  return generate({ seed: d.seed, space: AZAR_SPACE, arch: d.arch, base: defaultRecipe(), gen });
}
