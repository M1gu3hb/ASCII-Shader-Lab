import { setUI } from './store';

export type ExportTab = 'imagen' | 'video' | 'vector' | 'terminal' | 'codigo' | 'receta';

/** A tab asked for by whoever opens the export sheet next (e.g. a guide's «Más formatos…»). */
let requested: ExportTab | null = null;

export function requestExportTab(tab: ExportTab) { requested = tab; }

/** The requested tab, once: the sheet reads it when it opens. */
export function takeExportTab(): ExportTab | null {
  const t = requested;
  requested = null;
  return t;
}

/** Opens the export sheet on a given tab. */
export function openExport(tab: ExportTab) {
  requestExportTab(tab);
  setUI({ sheet: 'export' });
}
