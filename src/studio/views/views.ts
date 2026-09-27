/**
 * Destination previews, the pure part: which views exist, what each one simulates, the CSS size of
 * the stage canvas in each (the renderer follows its element and keeps the cell size in CSS px, so
 * sizing the real canvas is what exported code and fixed-size exports do), and where «Exportar para
 * este destino» leads. No DOM and no store here.
 */
import type { SpaceId } from '../../random/spaces';
import type { ExportRequest } from '../exportTab';
import { textGrid } from '../guide/paths';

export type ViewId = 'libre' | 'web' | 'tarjeta' | 'vertical' | 'readme' | 'terminal';

export interface ViewInfo {
  id: ViewId;
  name: string;
  /** One line: what the view simulates (shown under the selector). */
  what: string;
}

export const VIEWS: ViewInfo[] = [
  { id: 'libre', name: 'Libre', what: 'La pieza a todo el escenario, sin marco.' },
  { id: 'web', name: 'Fondo web', what: 'Tu pieza como fondo de una página, con contenido encima.' },
  { id: 'tarjeta', name: 'Tarjeta', what: 'Tu pieza en la imagen de una tarjeta, junto a otras dos.' },
  { id: 'vertical', name: 'Vertical 9:16', what: 'Historia o reel de 1080×1920. Las franjas marcan dónde suele ir la interfaz de la app (varía según la app).' },
  { id: 'readme', name: 'README', what: 'Un README de GitHub: tu pieza como imagen y como texto de 80 columnas.' },
  { id: 'terminal', name: 'Terminal', what: 'Una ventana de terminal: lo que exportas como texto, ANSI o script para la consola.' },
];

export const VIEW_IDS = VIEWS.map(v => v.id);
export const viewInfo = (id: ViewId) => VIEWS.find(v => v.id === id) ?? VIEWS[0];

/** Text over a web background: chosen from the background, or always light / dark. */
export type InkMode = 'auto' | 'light' | 'dark';

export interface ViewOpts {
  /** Fondo web: colour of the page text. */
  ink: InkMode;
  /** Tarjeta and README: light or dark page. */
  page: 'light' | 'dark';
  /** Vertical: a caption mock (account name and a line of text) over the bottom band. */
  caption: boolean;
}

export const DEFAULT_VIEW_OPTS: ViewOpts = { ink: 'auto', page: 'light', caption: false };

/** The terminal space opens on its terminal window; every other space, on the free stage. */
export const defaultView = (space: SpaceId): ViewId => (space === 'terminal' ? 'terminal' : 'libre');

/** The view a space shows (null in «Piezas», which has no stage). */
export function viewFor(views: Partial<Record<SpaceId, ViewId>> | undefined, space: SpaceId): ViewId | null {
  if (space === 'componentes') return null;
  const v = views?.[space];
  return v && VIEW_IDS.includes(v) ? v : defaultView(space);
}

/** Views read from saved preferences: unknown entries dropped; the old «content on top» switch of Fondos becomes «Fondo web». */
export function normalizeViews(raw: unknown, legacyPreview?: unknown): Partial<Record<SpaceId, ViewId>> {
  const out: Partial<Record<SpaceId, ViewId>> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (k !== 'componentes' && typeof v === 'string' && (VIEW_IDS as string[]).includes(v)) out[k as SpaceId] = v as ViewId;
    }
  }
  if (legacyPreview === true && !out.fondos) out.fondos = 'web';
  return out;
}

export function normalizeViewOpts(raw: unknown): ViewOpts {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ViewOpts, unknown>>;
  return {
    ink: o.ink === 'light' || o.ink === 'dark' ? o.ink : 'auto',
    page: o.page === 'dark' ? 'dark' : 'light',
    caption: o.caption === true,
  };
}

/* ------------------------------------------------------------------ */
/* Sizes (CSS px of the stage canvas)                                  */
/* ------------------------------------------------------------------ */

/**
 * Vertical 9:16 frame for the space available: as tall as fits, in steps of 16 px so the width
 * (h·9/16) is a whole number and a 1080×1920 export composes exactly this canvas. Never narrower
 * than 207 px (exports read at least 200 px of stage).
 */
export function verticalFrame(availW: number, availH: number): { w: number; h: number } {
  const h = Math.max(368, Math.floor(Math.min(availH, (availW * 16) / 9) / 16) * 16);
  return { w: (h * 9) / 16, h };
}

/** Share of the 9:16 frame that app interfaces usually cover (Instagram, TikTok, Shorts: about 250–380 px of 1920). */
export const SAFE_TOP = 0.14;
export const SAFE_BOTTOM = 0.2;

/** Media slot of the first card: 360×225 (16:10) where it fits, 288×180 on narrow screens. */
export function cardMedia(availW: number): { w: number; h: number } {
  return availW >= 400 ? { w: 360, h: 225 } : { w: 288, h: 180 };
}

/** GIF widths the export sheet offers. */
export const GIF_WIDTHS = [320, 480, 640, 800];

/**
 * README image: the README's content width (at most 800 px, the widest GIF on offer), 2:1 like a
 * repository banner. The GIF is exported at the first width on offer that is not smaller, so GitHub
 * never has to enlarge it.
 */
export function readmeImage(contentW: number): { w: number; h: number; gifW: number } {
  const w = Math.max(200, Math.min(800, Math.floor(contentW)));
  const h = Math.round(w / 2);
  return { w, h, gifW: GIF_WIDTHS.find(g => g >= w) ?? 800 };
}

/** Columns of the README text version. */
export const README_COLS = 80;

/** Rows of the README text version: 80 columns and the image's proportions with this cell shape (like a text export). */
export function readmeGrid(imgW: number, imgH: number, cell: number, aspect: number): { cols: number; rows: number } {
  return textGrid(imgW, imgH, cell, aspect, README_COLS);
}

/** Proportion (height / width) of one character in GitHub's code blocks: 12 px text, 1.45 line height, ~0.6 em advance. */
export const GITHUB_CELL = 1.45 / 0.6;

/** Terminal sizes on offer (columns × rows). */
export const TERM_SIZES: Array<[number, number]> = [[80, 24], [100, 30], [120, 36], [132, 43], [60, 20], [40, 16]];

/** Terminal window: exactly cols×rows cells of the size the text exports use (captureGrid). */
export function terminalWindow(cols: number, rows: number, cell: number, aspect: number): { w: number; h: number } {
  const cw = Math.max(2, Math.round(cell)), ch = Math.max(2, Math.round(cell * aspect));
  return { w: cols * cw, h: rows * ch };
}

/* ------------------------------------------------------------------ */
/* Text for a README                                                   */
/* ------------------------------------------------------------------ */

/** Characters outside printable ASCII (each once, in order), which GitHub may draw with other widths or glyphs. */
export function nonAscii(s: string): string[] {
  const seen = new Set<string>();
  for (const c of s) if (c !== '\n' && !/^[\x20-\x7e]$/.test(c)) seen.add(c);
  return [...seen];
}

/** A fenced Markdown block with the text; the fence is longer than any run of backticks inside. */
export function markdownBlock(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map(m => m.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text.replace(/\n+$/, '')}\n${fence}\n`;
}

/* ------------------------------------------------------------------ */
/* Where «Exportar para este destino» leads                             */
/* ------------------------------------------------------------------ */

export function exportFor(view: ViewId, o: { gifW?: number; term?: { cols: number; rows: number } } = {}): ExportRequest | null {
  switch (view) {
    case 'web': return { tab: 'codigo' };
    case 'tarjeta': return { tab: 'imagen', size: 'v2' };
    case 'vertical': return { tab: 'video', size: 'story' };
    case 'readme': return { tab: 'video', gifW: o.gifW ?? 640 };
    case 'terminal': return { tab: 'terminal', term: o.term };
    default: return null;
  }
}

/** What the export button says it will do, per view. */
export const EXPORT_HINT: Record<ViewId, string> = {
  libre: '',
  web: 'Código para tu web, como fondo de página.',
  tarjeta: 'Imagen al doble de la tarjeta (nítida en pantallas retina).',
  vertical: 'Video 1080×1920 con este encuadre.',
  readme: 'GIF al ancho de la imagen del README.',
  terminal: 'Texto, ANSI o animación con estas columnas y filas.',
};
