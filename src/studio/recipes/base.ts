import { useMemo } from 'react';
import type { Recipe } from '../../engine/recipe';
import type { SpaceId } from '../../random/spaces';
import { useMedia } from '../media';
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

/**
 * The piece on screen as the base of the space's pictures (only what they take from it changes them). In
 * Imagen, only while the stage shows a photo, a video or the camera: without one there is nothing to draw
 * a picture of (the cards say «con tu foto» instead).
 */
export function useBase(space: SpaceId): Recipe | undefined {
  const sig = useStudio(s => baseSig(s.entries[s.cursor]?.recipe, space));
  const shown = useMedia(s => (space !== 'media' ? '-' : s.image || s.video || s.camera === 'on' ? `${s.image?.id ?? ''}|${s.video?.id ?? ''}|${s.camera}` : ''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (sig && shown ? currentRecipe() : undefined), [sig, shown]);
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

