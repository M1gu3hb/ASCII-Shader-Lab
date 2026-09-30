import { create } from 'zustand';
import type { SpaceId } from '../../random/spaces';
import { applyRecipe, currentRecipe, go, openFavorite, useStudio, type Entry, type Favorite } from '../store';
import { announce, toast } from '../toast';
import { itemNamed, type RecipeItem } from './catalog';

/**
 * The recipe browser's own state: whether it is open, what is typed in its search and the filter chosen
 * in each space. Kept for the session only (a reload starts with the settings in view); the filter and the
 * search stay while it is closed and opened again, so coming back finds the list where it was left.
 */
interface RecipesUI {
  open: boolean;
  query: string;
  /** The filter chosen per space ('todas', 'recientes', 'coleccion' or a category id). */
  cat: Partial<Record<SpaceId, string>>;
}

export const useRecipesUI = create<RecipesUI>(() => ({ open: false, query: '', cat: {} }));

export function setBrowserOpen(open: boolean) {
  if (useRecipesUI.getState().open !== open) useRecipesUI.setState({ open });
}
export const setQuery = (query: string) => useRecipesUI.setState({ query });
export function setFilter(space: SpaceId, cat: string) {
  useRecipesUI.setState(s => ({ cat: { ...s.cat, [space]: cat } }));
}

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
    // the first piece of a first visit was not chosen by anyone
    if (e.kind === 'inicio') continue;
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

/**
 * Applies a recipe of the catalogue: a new result in the history (the piece that was on screen stays
 * one step back), in the recipe's own space, with the person's photo, video, camera or words where that
 * space keeps them. The stage forms it out of glyphs (the same transition as any new piece). When what was
 * on screen was the person's own (edited, rolled, opened), a note offers the way back to it.
 */
export function applyItem(item: RecipeItem): boolean {
  const s = useStudio.getState();
  const prev = s.entries[s.cursor];
  if (isShown(item, prev)) return false;
  const r = item.make(currentRecipe());
  // another space's recipe opens in its space (as a saved piece does)
  if (item.space !== s.space) useStudio.setState({ space: item.space });
  applyRecipe(r, 'receta', item.name);
  const n = useStudio.getState().entries.length;
  const own = !!prev && (prev.edited || !FROM_RECIPE.includes(prev.kind));
  if (own && prev) {
    const id = prev.id;
    toast(`${item.kind === 'escena' ? 'Escena' : 'Receta'} «${item.name}» aplicada. Tu pieza anterior sigue en el historial.`, {
      label: 'Volver a ella',
      run: () => { const i = useStudio.getState().entries.findIndex(x => x.id === id); if (i >= 0) go(i); },
    }, 5000);
  } else {
    announce(`${item.kind === 'escena' ? 'Escena' : 'Receta'} ${item.name} aplicada. Resultado ${n} de ${n}.`);
  }
  return true;
}

/** Opens a saved piece from the browser (as the collection does). */
export function applySaved(f: Favorite) {
  const s = useStudio.getState();
  const e = s.entries[s.cursor];
  if (e?.favId === f.id && !e.edited) return false;
  openFavorite(f.id);
  announce(`${f.name}, de tu colección.`);
  return true;
}
