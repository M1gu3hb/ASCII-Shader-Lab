import { setUI } from './store';

export type ExportTab = 'imagen' | 'video' | 'vector' | 'terminal' | 'codigo' | 'receta';

/**
 * What whoever opens the export sheet next asks for: a tab (e.g. a guide's «Más formatos…») and,
 * optionally, where it should start (a destination preview's «Exportar para este destino»).
 */
export interface ExportRequest {
  tab: ExportTab;
  /** Size preset id (SIZE_PRESETS) for the image and video tabs. */
  size?: string;
  /** GIF width in px (one of the widths the video tab offers). */
  gifW?: number;
  /** Columns and rows for the text and terminal tab. */
  term?: { cols: number; rows: number };
}

let requested: ExportRequest | null = null;

export function requestExportTab(tab: ExportTab, preset: Omit<ExportRequest, 'tab'> = {}) { requested = { ...preset, tab }; }

/** The request, once: the sheet reads it when it opens. */
export function takeExportRequest(): ExportRequest | null {
  const r = requested;
  requested = null;
  return r;
}

/** Opens the export sheet on a given tab (and, optionally, size). */
export function openExport(tab: ExportTab, preset: Omit<ExportRequest, 'tab'> = {}) {
  requestExportTab(tab, preset);
  setUI({ sheet: 'export' });
}
