import type { Recipe } from '../engine/recipe';
import { STUDIO_WORDS } from '../random';
import { PRESETS } from './presets';
import { SCENES } from './scenes';

/**
 * Whose words a Texto piece shows, for the dice (GenInput.ownText): a roll keeps the person's own words and
 * changes a word nobody typed. Pure (tested in tests/unit/own-words.test.ts).
 */

let words: ReadonlySet<string> | null = null;
/**
 * The words the studio writes by itself: the dice's of every version and the brand's names (random/words.ts),
 * and the words of its recipes and composed scenes (a recipe keeps the person's words, so its own word is the
 * one it brings to a piece without any).
 */
export function studioWords(): ReadonlySet<string> {
  if (words) return words;
  const all = new Set(STUDIO_WORDS);
  for (const list of Object.values(PRESETS)) for (const p of list) all.add(p.make().text.content.trim());
  for (const s of SCENES) if (s.text) all.add(s.text.trim());
  return (words = all);
}

/** What the text of an entry was when it came, and what it is now. */
interface Seen { recipe: Recipe; origin: Recipe }

/**
 * Whether the text of `base` (the piece on screen) is the person's own words:
 *  - they typed it: some result of this history shows it as a change to the text it came with (so a word they
 *    wrote stays even if the dice or a recipe also use it, and through every roll after it);
 *  - otherwise, any text but the studio's own words (one that came in a link, a file, the collection).
 */
export function ownText(entries: readonly Seen[], base: Recipe): boolean {
  const t = base.text.content.trim();
  if (!t) return false;
  if (entries.some(e => e.recipe.text.content.trim() === t && e.origin.text.content.trim() !== t)) return true;
  return !studioWords().has(t);
}
