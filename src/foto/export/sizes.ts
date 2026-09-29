/**
 * Output sizes of the export sheet (pure: no DOM). A size is the project's own (or a multiple), a fixed
 * social/screen size, or paper at a resolution (A4, A3, Carta, Tabloide). When its proportion differs from
 * the project's, the render either covers it (centred crop) or fits in it (bands of the project's
 * background): `placement` is the geometry both the preview and the file use.
 */

export type SizeId = 'proyecto' | 'doble' | 'ig45' | 'historia' | 'enlace' | 'pantalla' | 'a4' | 'a3' | 'carta' | 'tabloide';
export type Fit = 'cover' | 'contain';
export type Orient = 'auto' | 'vertical' | 'horizontal';

export interface SizePreset {
  id: SizeId;
  label: string;
  group: 'Proyecto' | 'Redes y pantallas' | 'Impresión';
  /** A multiple of the project's size… */
  k?: number;
  /** …or a fixed size in px… */
  w?: number;
  h?: number;
  /** …or paper, in millimetres (portrait). */
  mm?: [number, number];
  /** Where it is used, in a few words (the picker's second line). */
  use: string;
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'proyecto', label: 'Tamaño del proyecto', group: 'Proyecto', k: 1, use: 'Igual que la vista al 100 %.' },
  { id: 'doble', label: 'Doble (2×)', group: 'Proyecto', k: 2, use: 'Nítida en pantallas de alta densidad.' },
  { id: 'ig45', label: 'Publicación vertical 1080 × 1350', group: 'Redes y pantallas', w: 1080, h: 1350, use: 'Instagram y similares (4:5).' },
  { id: 'historia', label: 'Historia / reel 1080 × 1920', group: 'Redes y pantallas', w: 1080, h: 1920, use: 'Historias, reels y shorts (9:16).' },
  { id: 'enlace', label: 'Vista previa de enlace 1200 × 630', group: 'Redes y pantallas', w: 1200, h: 630, use: 'La imagen que muestran las redes al compartir una web.' },
  { id: 'pantalla', label: 'Pantalla / presentación 1920 × 1080', group: 'Redes y pantallas', w: 1920, h: 1080, use: 'Diapositivas, pantallas y video horizontal (16:9).' },
  { id: 'a4', label: 'A4', group: 'Impresión', mm: [210, 297], use: '210 × 297 mm.' },
  { id: 'a3', label: 'A3', group: 'Impresión', mm: [297, 420], use: '297 × 420 mm.' },
  { id: 'carta', label: 'Carta', group: 'Impresión', mm: [215.9, 279.4], use: '8,5 × 11 pulgadas.' },
  { id: 'tabloide', label: 'Tabloide', group: 'Impresión', mm: [279.4, 431.8], use: '11 × 17 pulgadas.' },
];

export const PRINT_DPI = [300, 200, 150] as const;
export type Dpi = (typeof PRINT_DPI)[number];

export const presetById = (id: string): SizePreset => SIZE_PRESETS.find(s => s.id === id) ?? SIZE_PRESETS[0];
export const isPrint = (id: string) => !!presetById(id).mm;

/** Paper in pixels at a resolution (mm → inches → dots), rounded like print software does. */
export function paperPixels(mm: [number, number], dpi: number, landscape: boolean): { w: number; h: number } {
  const a = Math.round((mm[0] / 25.4) * dpi), b = Math.round((mm[1] / 25.4) * dpi);
  return landscape ? { w: b, h: a } : { w: a, h: b };
}

export interface ResolvedSize {
  w: number;
  h: number;
  /** Same proportion as the project (within half a percent): no crop or bands. */
  sameAspect: boolean;
  preset: SizePreset;
  dpi?: number;
}

/**
 * The pixels of a preset for a project of pw × ph. Paper follows the project's orientation unless one is
 * asked for (a landscape piece prints on landscape paper).
 */
export function resolveSize(id: string, project: { w: number; h: number }, o: { dpi?: number; orient?: Orient } = {}): ResolvedSize {
  const preset = presetById(id);
  let w: number, h: number, dpi: number | undefined;
  if (preset.k) { w = Math.max(1, Math.round(project.w * preset.k)); h = Math.max(1, Math.round(project.h * preset.k)); }
  else if (preset.mm) {
    dpi = o.dpi && o.dpi > 0 ? o.dpi : 300;
    const landscape = o.orient === 'horizontal' || ((o.orient ?? 'auto') === 'auto' && project.w > project.h);
    ({ w, h } = paperPixels(preset.mm, dpi, landscape));
  } else { w = preset.w!; h = preset.h!; }
  const sameAspect = !!preset.k || Math.abs(w / h - project.w / project.h) < 0.005 * (project.w / project.h);
  return { w, h, sameAspect, preset, ...(dpi ? { dpi } : {}) };
}

export interface Placement {
  /** Render scale of the project (render px per project px). */
  k: number;
  /** Size of that render, and where it sits in the output (may be negative: a crop). */
  rw: number;
  rh: number;
  x: number;
  y: number;
}

/**
 * Where the project's render goes in an output of w × h: scaled to cover it (centred crop) or to fit in it
 * (bands). With the same proportion both are the plain scale. `extra` shrinks everything (the sheet's small
 * preview is this same geometry times a factor).
 */
export function placement(project: { w: number; h: number }, w: number, h: number, fit: Fit, extra = 1): Placement {
  const kx = w / project.w, ky = h / project.h;
  const k = (fit === 'cover' ? Math.max(kx, ky) : Math.min(kx, ky)) * extra;
  const rw = Math.max(1, Math.round(project.w * k)), rh = Math.max(1, Math.round(project.h * k));
  const ow = Math.max(1, Math.round(w * extra)), oh = Math.max(1, Math.round(h * extra));
  return { k, rw, rh, x: Math.round((ow - rw) / 2), y: Math.round((oh - rh) / 2) };
}

/** Browsers refuse canvases past about this many pixels on iPhone and iPad (16.7 MP); others allow more. */
export const IOS_CANVAS_PIXELS = 16_777_216;
/** ASCII engines clamp their drawing buffer at 8192 px a side (and at the GPU's own limit). */
export const ENGINE_MAX_SIDE = 8192;

export interface MemoryNote {
  mp: number;
  /** Megabytes of one full-size canvas (4 bytes a pixel) and a rough total for the whole render. */
  canvasMB: number;
  totalMB: number;
  /** Too big for some devices: say so before exporting. */
  risky: boolean;
  /** Spanish, one or two sentences; '' when there is nothing worth saying. */
  note: string;
}

/**
 * An honest estimate of the memory a render of w × h takes: the compositor holds the output, one canvas per
 * layer being drawn, the picture it reads and the finishes' scratch canvases, so a render needs several
 * full-size canvases at once (`layers` + 3 is the rough count used here).
 */
export function memoryNote(w: number, h: number, layers: number, hasAscii = false, always = false): MemoryNote {
  const px = w * h;
  const mp = px / 1e6;
  const canvasMB = (px * 4) / (1024 * 1024);
  const totalMB = canvasMB * (Math.max(1, layers) + 3);
  const parts: string[] = [];
  let risky = false;
  if (px > IOS_CANVAS_PIXELS) {
    risky = true;
    parts.push(`Son ${mp.toFixed(1)} megapíxeles: en iPhone y iPad un lienzo no puede pasar de 16,7, así que ahí fallará; baja la resolución (200 o 150 ppp).`);
  }
  if (hasAscii && Math.max(w, h) > ENGINE_MAX_SIDE) {
    risky = true;
    parts.push(`Las capas ASCII se dibujan como mucho a ${ENGINE_MAX_SIDE} px de lado: a este tamaño se ampliarían.`);
  }
  if (totalMB > 600) {
    risky = true;
    parts.push(`Cada lienzo ocupa unos ${Math.round(canvasMB)} MB y la composición usa varios a la vez (en total, unos ${Math.round(totalMB / 50) * 50} MB): en teléfonos o equipos con poca memoria puede fallar.`);
  } else if (totalMB > 250) {
    parts.push(`Cada lienzo ocupa unos ${Math.round(canvasMB)} MB y la composición usa varios a la vez (unos ${Math.round(totalMB / 10) * 10} MB): tarda más y en teléfonos puede fallar.`);
  } else if (always) {
    parts.push(`Memoria: cada lienzo ocupa unos ${Math.round(canvasMB)} MB y la composición usa varios a la vez (unos ${Math.max(10, Math.round(totalMB / 10) * 10)} MB en total).`);
  }
  return { mp, canvasMB, totalMB, risky, note: parts.join(' ') };
}

/** «2480 × 3508 px · 8,7 MP» */
export function sizeText(w: number, h: number): string {
  const mp = (w * h) / 1e6;
  return `${w} × ${h} px · ${mp < 10 ? mp.toFixed(1).replace('.', ',') : Math.round(mp)} MP`;
}

/** Physical size of a print at a resolution: «21,0 × 29,7 cm». */
export function printText(w: number, h: number, dpi: number): string {
  const cm = (px: number) => ((px / dpi) * 2.54).toFixed(1).replace('.', ',');
  return `${cm(w)} × ${cm(h)} cm a ${dpi} ppp`;
}
