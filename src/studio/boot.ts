import { decodeRecipe } from '../shared/share';
import { spaceById, type SpaceId } from '../random/spaces';
import { parseCamino, withoutCamino } from './guide/paths';
import { startPath } from './guide/state';
import { startMediaSync } from './media';
import { startHistoryWarnings } from './packages';
import { spaceAccepts } from './presets';
import { applyRecipe, currentRecipe, edit, rollDice, setSpace, useStudio } from './store';
import { toast } from './toast';

/** What the address opened: a shared piece, a seed, a space, a guided path, or nothing. */
export type BootOpened = 'link' | 'seed' | 'space' | 'camino' | null;

/**
 * Runs once the store is hydrated: starts the local-data watchers (the media follows the current
 * piece; warnings near the history limit), then opens shared links:
 * #r=<recipe>, #seed=<seed>&space=<space>&arch=<arch>, #space=<space>[&source=image|video|camera],
 * and guided paths: ?camino=foto|fondo|palabra (the public guides link there).
 * Both are removed from the address once handled.
 */
export async function bootFromUrl(): Promise<BootOpened> {
  startMediaSync();
  startHistoryWarnings();
  const camino = parseCamino(location.search);
  if (camino) history.replaceState(null, '', location.pathname + withoutCamino(location.search) + location.hash);
  let opened: BootOpened = null;
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.toString()) {
    const space = h.get('space');
    if (h.get('r')) {
      opened = 'link';
      const r = await decodeRecipe(h.get('r')!);
      if (r) {
        useStudio.setState({ space: spaceById(r.meta.space ?? space ?? 'arte').id });
        applyRecipe(r, 'enlace', r.meta.name ?? 'Desde un enlace');
        const own = r.media.ref && (r.source === 'image' || r.source === 'video');
        setTimeout(() => toast(own
          ? `Pieza abierta desde un enlace. ${r.source === 'video' ? 'El video' : 'La imagen'} no viaja en los enlaces: elige ${r.source === 'video' ? 'uno tuyo' : 'una tuya'}.`
          : 'Pieza abierta desde un enlace. Guárdala con ★ para conservarla.'), 400);
      } else setTimeout(() => toast('El enlace no contiene una receta válida.'), 400);
    } else if (h.get('seed')) {
      opened = 'seed';
      if (space) useStudio.setState({ space: spaceById(space).id });
      if (h.get('arch')) useStudio.setState({ arch: h.get('arch') });
      rollDice(h.get('seed')!);
    } else if (space) {
      opened = 'space';
      const id = spaceById(space).id as SpaceId;
      setSpace(id);
      // …&source=video: the video guide lands on «Suelta aquí un video», whose picker takes videos
      const source = h.get('source');
      if ((source === 'image' || source === 'video' || source === 'camera') && spaceAccepts(id, { ...currentRecipe(), source })) {
        edit(r => { r.source = source; });
      }
    }
    history.replaceState(null, '', location.pathname + location.search);
  }
  // a shared piece or seed wins over a path (the person came to see that piece)
  if (camino && opened !== 'link' && opened !== 'seed') {
    startPath(camino);
    opened = 'camino';
  }
  return opened;
}
