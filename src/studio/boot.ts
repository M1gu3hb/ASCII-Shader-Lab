import { decodeRecipe } from '../shared/share';
import { spaceById, type SpaceId } from '../random/spaces';
import { applyRecipe, rollDice, setSpace, useStudio } from './store';
import { toast } from './toast';

/** Opens shared links: #r=<recipe>, #seed=<seed>&space=<space>&arch=<arch>, #space=<space>. */
export async function bootFromUrl() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.toString()) return;
  const space = h.get('space');
  if (h.get('r')) {
    const r = await decodeRecipe(h.get('r')!);
    if (r) {
      useStudio.setState({ space: spaceById(r.meta.space ?? space ?? 'arte').id });
      applyRecipe(r, 'enlace', r.meta.name ?? 'Desde un enlace');
      setTimeout(() => toast('Pieza abierta desde un enlace. Guárdala con ★ para conservarla.'), 400);
    } else setTimeout(() => toast('El enlace no contiene una receta válida.'), 400);
  } else if (h.get('seed')) {
    if (space) useStudio.setState({ space: spaceById(space).id });
    if (h.get('arch')) useStudio.setState({ arch: h.get('arch') });
    rollDice(h.get('seed')!);
  } else if (space) {
    setSpace(spaceById(space).id as SpaceId);
  }
  history.replaceState(null, '', location.pathname + location.search);
}
