/**
 * Parts of the studio that are not needed to show the first piece load on demand: the export sheet,
 * the collection/explore/seed/shortcut sheets and the Componentes space. Once the studio has settled they
 * are fetched in idle time (unless the browser asks to save data), so opening them later is instant;
 * opening one before that shows a short «Cargando…» line (see App.tsx).
 */
export const loadExportSheet = () => import('./ExportSheet');
export const loadSheets = () => import('./Sheets');
export const loadComponents = () => import('./ComponentsSpace');

/**
 * The code exporter (HTML, Web Component, React, with the engine runtime inside) is the largest part of the
 * export sheet and only its «Código» tab needs it: fetched when the sheet first opens, so that tab is ready
 * (and does not reflow when the code arrives) by the time someone switches to it.
 */
export const warmCodeExporter = () => { void import('../exporters/code').catch(() => undefined); };

const saveData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
const idle = (fn: () => void, timeout: number) =>
  ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 1200));

let prefetched = false;

/** Fetches the on-demand parts once the page has loaded and the main thread is idle. */
export function prefetchLater() {
  if (prefetched || saveData()) return;
  prefetched = true;
  const go = () => setTimeout(() => idle(() => {
    // one after the other: never several chunks competing with the stage for the network at once
    void loadExportSheet().then(loadSheets).then(loadComponents).catch(() => undefined);
  }, 4000), 1500);
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}
