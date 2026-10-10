import { decodeRecipe, readPieceHash } from '../shared/share';
import { archesForGen, genOf } from '../random/generator';
import { spaceById, type SpaceId } from '../random/spaces';
import { parseCamino, withoutCamino } from './guide/paths';
import { startPath } from './guide/state';
import { startMediaSync } from './media';
import { startHistoryWarnings } from './packages';
import { spaceAccepts } from './presets';
import { rememberLinkFrame } from './ShareSheet';
import { applyRecipe, currentRecipe, edit, rollDice, setSpace, useStudio } from './store';
import { toast } from './toast';
import { retry } from './lazy';
import { within } from './deadline';
import { cloneRecipe, syncVersion } from '../engine/recipe';
import { getGlyphSet } from '../glyphset/registry';
import { isGlyphSetId } from '../glyphset/set';
import { applySet, glyphSetFile, importGlyphSet, recordLabUses } from './glyphSets';

let watchingHash = false;
let hashLoad: AbortController | undefined;
function watchHash() {
  if (watchingHash) return;
  watchingHash = true;
  addEventListener('hashchange', () => {
    hashLoad?.abort();
    const controller = hashLoad = new AbortController();
    void within(bootFromUrl(controller.signal), 10_000, controller.signal).catch(() => {
      controller.abort();
      if (hashLoad === controller) toast('No se pudo abrir ese enlace. Tu pieza sigue en el historial; vuelve a intentarlo.');
    });
  });
}

const loadHandoff = retry(() => import('../foto/handoff'));

/** What the address opened: a shared piece, a seed, a space, a guided path, or nothing. */
export type BootOpened = 'link' | 'seed' | 'space' | 'camino' | null;

/**
 * Runs once the store is hydrated: starts the local-data watchers (the media follows the current
 * piece; warnings near the history limit), then opens shared links:
 * #r=<recipe> (with f=<frame>, t and p when it comes from the public viewer's «Abrir en el estudio», see
 * src/shared/share.ts: the frame is kept, so the piece shared again unedited keeps the frame it came in),
 * #seed=<seed>&space=<space>&arch=<arch>[&gen=<generator version>] (without gen: the current
 * generator), #space=<space>[&source=image|video|camera],
 * #glifos=<set id> («Usar en el laboratorio» of «Crea tus GLYPHOS»: the current piece, as a new entry, with that set),
 * and guided paths: ?camino=foto|fondo|palabra (the public guides link there).
 * Both are removed from the address once handled.
 */
export async function bootFromUrl(signal?: AbortSignal): Promise<BootOpened> {
  watchHash();
  const hash = location.hash;
  startMediaSync();
  startHistoryWarnings();
  const camino = parseCamino(location.search);
  if (camino) history.replaceState(null, '', location.pathname + withoutCamino(location.search) + location.hash);
  let opened: BootOpened = null;
  const h = new URLSearchParams(hash.slice(1));
  if (h.toString()) {
    const space = h.get('space');
    if (h.get('r')) {
      opened = 'link';
      const r = await decodeRecipe(h.get('r')!);
      if (signal?.aborted || location.hash !== hash) return null;
      if (r) {
        useStudio.setState({ space: spaceById(r.meta.space ?? space ?? 'arte').id });
        applyRecipe(r, 'enlace', r.meta.name ?? 'Desde un enlace');
        const { frame } = readPieceHash(hash).view;
        if (frame) rememberLinkFrame(r, frame);
        const own = r.media.ref && (r.source === 'image' || r.source === 'video');
        setTimeout(() => toast(own
          ? `Pieza abierta desde un enlace. ${r.source === 'video' ? 'El video' : 'La imagen'} no viaja en los enlaces: elige ${r.source === 'video' ? 'uno tuyo' : 'una tuya'}.`
          : 'Pieza abierta desde un enlace. Guárdala con ★ para conservarla.'), 400);
      } else setTimeout(() => toast('El enlace no contiene una receta válida de esta versión. Puede estar dañado o requerir una versión más nueva de GLYPHOS.'), 400);
    } else if (h.get('foto')) {
      // «Abrir estilo en el laboratorio» from the photo studio (src/foto/bridge.ts): the recipe waits in IndexedDB
      opened = 'link';
      const { takeHandoff } = await loadHandoff();
      if (signal?.aborted || location.hash !== hash) return null;
      const got = await takeHandoff(h.get('foto')!);
      if (signal?.aborted || location.hash !== hash) return null;
      if (got?.kind === 'foto-to-lab') {
        const own = got.recipe.source === 'image' || got.recipe.source === 'video';
        useStudio.setState({ space: own ? 'media' : spaceById(got.recipe.meta.space ?? 'arte').id });
        applyRecipe(got.recipe, 'importado', got.name);
        setTimeout(() => toast('Estilo abierto desde el estudio de foto: es una entrada nueva de tu historial.'), 400);
      } else setTimeout(() => toast('Ese estilo ya no está esperando (se abre una sola vez y caduca en una hora).'), 400);
    } else if (h.get('glifos')) {
      // a glyph set just made in «Crea tus GLYPHOS» (same browser): the current piece takes it, as a new entry
      opened = 'link';
      const id = h.get('glifos')!;
      const bytes = isGlyphSetId(id) ? await glyphSetFile(id) : null;
      if (signal?.aborted || location.hash !== hash) return null;
      const got = bytes ? await importGlyphSet(bytes, id) : null;
      const set = got ? getGlyphSet(got) : undefined;
      if (set && got) {
        const r = cloneRecipe(currentRecipe());
        applySet(r, got, set);
        syncVersion(r);
        applyRecipe(r, 'importado', `Con tus glifos «${set.name}»`);
        void recordLabUses(new Set([got]), true);
        setTimeout(() => toast(`La pieza usa tus glifos «${set.name}». Cámbialos o quítalos en Glifos → Tus glifos.`), 400);
      } else setTimeout(() => toast('Ese juego de glifos no está en este navegador. Ábrelo desde «Crea tus GLYPHOS» con «Usar en el laboratorio».'), 400);
    } else if (h.get('seed')) {
      opened = 'seed';
      if (space) useStudio.setState({ space: spaceById(space).id });
      if (h.get('arch')) useStudio.setState({ arch: h.get('arch') });
      const gen = genOf(h.get('gen') ?? undefined);
      if (h.get('arch') && !archesForGen(gen).some(a => a.id === h.get('arch'))) toast(`Ese estilo no existe en la versión ${gen}; se eligió uno compatible.`, undefined, 6000);
      rollDice(h.get('seed')!, gen);
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
    if (location.hash === hash) history.replaceState(null, '', location.pathname + location.search);
  }
  // a shared piece or seed wins over a path (the person came to see that piece)
  if (camino && opened !== 'link' && opened !== 'seed') {
    startPath(camino);
    opened = 'camino';
  }
  return opened;
}
