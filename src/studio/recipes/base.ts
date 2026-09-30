import { useMemo } from 'react';
import type { Recipe } from '../../engine/recipe';
import type { SpaceId } from '../../random/spaces';
import { currentRecipe, useStudio } from '../store';
import type { RecipeItem } from './catalog';

/** What of the piece on screen a space's pictures take: the photo, video or camera (Imagen), the words (Texto). */
function baseSig(r: Recipe | undefined, space: SpaceId): string {
  if (!r) return '';
  if (space === 'media') {
    if (!['image', 'video', 'camera'].includes(r.source)) return '';
    const m = r.media;
    return JSON.stringify([r.source, m.ref?.id ?? '', m.fit, m.zoom, m.panX, m.panY, m.mirror]);
  }
  if (space === 'tipo') return r.source === 'text' && r.text.content.trim() ? 'text:' + r.text.content : '';
  return '';
}

/** The piece on screen as the base of the space's pictures (only what they take from it changes them). */
export function useBase(space: SpaceId): Recipe | undefined {
  const sig = useStudio(s => baseSig(s.entries[s.cursor]?.recipe, space));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (sig ? currentRecipe() : undefined), [sig]);
}

/**
 * The recipe a card shows. An Imagen recipe needs a photo: without the person's (another space, or
 * none loaded yet) it shows its colours and a photo sign instead of a render.
 */
export function recipeFor(item: RecipeItem, base: Recipe | undefined, space: SpaceId): Recipe | null {
  const own = item.space === space ? base : undefined;
  if (item.space === 'media' && !own) return null;
  return item.make(own);
}

