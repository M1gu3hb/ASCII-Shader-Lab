import type { SpaceId } from '../../random/spaces';
import type { Entry, Favorite } from '../history';
import { itemNamed, type RecipeItem } from './catalog';

/**
 * What the history says about the catalogue (pure, so it can be tested on its own): the recipe a piece
 * comes from, the recipes chosen lately, the pieces saved in a space.
 */

/** History entries that come from a recipe of the catalogue (chosen from a list, or opened with a space). */
export const FROM_RECIPE: Entry['kind'][] = ['espacio', 'receta', 'inicio'];

/** The catalogue item the entry comes from, if any. */
export function itemOfEntry(e: Entry | undefined): RecipeItem | undefined {
  return e && FROM_RECIPE.includes(e.kind) ? itemNamed(e.space, e.label) : undefined;
}

/** Whether this item is the piece on screen, unedited (choosing it again would change nothing). */
export function isShown(item: RecipeItem, e: Entry | undefined): boolean {
  return !!e && !e.edited && itemOfEntry(e)?.key === item.key;
}

/** The catalogue items chosen most recently in a space (newest first, each once), from the history. */
export function recentItems(entries: Entry[], space: SpaceId, max = 8): RecipeItem[] {
  const out: RecipeItem[] = [];
  const seen = new Set<string>();
  for (let i = entries.length - 1; i >= 0 && out.length < max; i--) {
    const e = entries[i];
    // chosen by the person (not the first piece of a first visit, nor the one a space opens with)
    if (e.kind !== 'receta') continue;
    const it = itemOfEntry(e);
    if (!it || seen.has(it.key) || it.space !== (space === 'componentes' ? 'fondos' : space)) continue;
    seen.add(it.key);
    out.push(it);
  }
  return out;
}

/** The pieces the person saved (★) in a space, newest first. */
export const savedIn = (favorites: Favorite[], space: SpaceId) =>
  favorites.filter(f => f.space === space).sort((a, b) => b.updated - a.updated);

