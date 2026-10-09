import { hydrate, protectStudio } from './store';
import { bootFromUrl } from './boot';
import { claimStudio, tabsReady } from './tabs';
import { within } from './deadline';
import { startMediaSync } from './media';

/** One deadline for the entire boot, with cancellation at every asynchronous data/URL boundary. */
export async function startStudio(waiting: () => void) {
  const controller = new AbortController();
  try {
    return { ...await within((async () => {
      await claimStudio(waiting);
      if (controller.signal.aborted) return { first: false, opened: null };
      const first = await hydrate(controller.signal);
      tabsReady();
      if (controller.signal.aborted) return { first: false, opened: null };
      const opened = await bootFromUrl(controller.signal);
      return { first, opened };
    })(), 10_000), error: null };
  } catch (error) {
    controller.abort(error);
    protectStudio();
    startMediaSync();
    tabsReady();
    console.warn('GLYPHOS: arranque incompleto', error);
    return { first: false, opened: null, error: 'El estudio no pudo terminar de arrancar. Puedes guardar el trabajo de esta visita y recargar para reintentar.' };
  }
}
