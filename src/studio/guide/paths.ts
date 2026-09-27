/**
 * Guided paths, the pure part: what each path is and the recipe transformations its steps apply
 * (Presencia, light or dark photo background, word, rhythm), plus the legibility estimate and the
 * values the comparison strips offer. No DOM and no store here, so every rule can be tested alone.
 */
import { cloneRecipe, type Recipe } from '../../engine/recipe';
import { contrastRatio, hexToRgb, luminance, oklabToRgb, rgbToHex, rgbToOklab } from '../../engine/color';
import type { SpaceId } from '../../random/spaces';

export type PathId = 'foto' | 'fondo' | 'palabra';
export const PATH_IDS: PathId[] = ['foto', 'fondo', 'palabra'];

export interface PathInfo {
  id: PathId;
  /** Space the path works in (its presets, tabs and dice). */
  space: SpaceId;
  title: string;
  /** One line: what the person gets at the end. */
  gets: string;
  steps: [string, string, string, string];
}

export const PATHS: Record<PathId, PathInfo> = {
  foto: {
    id: 'foto', space: 'media', title: 'Convertir una foto en ASCII',
    gets: 'Tu foto hecha de caracteres, como PNG en alta resolución o como texto para pegar.',
    steps: ['Elige una foto', 'Elige un estilo', 'Ajusta', 'Llévatela'],
  },
  fondo: {
    id: 'fondo', space: 'fondos', title: 'Crear un fondo para tu web',
    gets: 'Un fondo animado que deja leer tu contenido, con el código para pegarlo en tu web.',
    steps: ['Elige un estilo', 'Que se lea el contenido', 'Movimiento', 'Llévalo a tu web'],
  },
  palabra: {
    id: 'palabra', space: 'tipo', title: 'Animar una palabra',
    gets: 'Una palabra tejida con caracteres en movimiento, como GIF en bucle o código para tu web.',
    steps: ['Escribe tu palabra', 'Estilo', 'Ritmo y tamaño', 'Llévatela'],
  },
};

export const STEP_COUNT = 4;

/** The path a URL asks for (`?camino=foto|fondo|palabra`), or null. */
export function parseCamino(search: string): PathId | null {
  const v = new URLSearchParams(search).get('camino')?.trim().toLowerCase() ?? '';
  return (PATH_IDS as string[]).includes(v) ? (v as PathId) : null;
}

/** The same query string without `camino` (other parameters, such as ?motor=basico, stay). */
export function withoutCamino(search: string): string {
  const q = new URLSearchParams(search);
  q.delete('camino');
  const s = q.toString();
  return s ? '?' + s : '';
}

/** The settings tab that best continues a path's step when the person asks for every control. */
export function relevantTab(path: PathId, step: number): string {
  const tabs: Record<PathId, string[]> = {
    foto: ['fuente', 'glifos', 'glifos', 'color'],
    fondo: ['forma', 'color', 'mov', 'forma'],
    palabra: ['fuente', 'fuente', 'mov', 'mov'],
  };
  const list = tabs[path];
  return list[Math.max(0, Math.min(list.length - 1, step))];
}

/* ------------------------------------------------------------------ */
/* Small colour helpers                                                 */
/* ------------------------------------------------------------------ */

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Mixes two colours in OKLab (perceptually even), t = 0 → a, 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const A = rgbToOklab(hexToRgb(a)), B = rgbToOklab(hexToRgb(b));
  const k = clamp(t, 0, 1);
  return rgbToHex(oklabToRgb([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]));
}

/** Moves a colour's OKLab lightness toward `L` (0..1), keeping its hue. */
function towardL(hex: string, L: number, t: number): string {
  const c = rgbToOklab(hexToRgb(hex));
  const k = clamp(t, 0, 1);
  return rgbToHex(oklabToRgb([c[0] + (L - c[0]) * k, c[1] * (1 - k * 0.3), c[2] * (1 - k * 0.3)]));
}

/** The colour of text laid over a background: near black on light backgrounds, white on dark ones. */
export const previewInk = (bg: string) => (luminance(bg) > 0.4 ? '#111111' : '#ffffff');

/** Strongest contrast between the background and any of the glyph colours. */
export const glyphContrast = (r: Recipe) => Math.max(...r.color.stops.map(s => contrastRatio(s, r.color.bg)));

/* ------------------------------------------------------------------ */
/* Presencia (fondo, step 2)                                           */
/* ------------------------------------------------------------------ */

/**
 * How much a background asks for attention. 0.5 leaves the style as chosen. Toward 0 («sutil») the
 * ink shrinks (fewer and lighter glyphs: the tone curve is squeezed toward empty), the glyph colours
 * are pulled toward the background and the glow goes, so text laid over it reads easily. Toward 1
 * («protagonista») there is more ink, more contrast and glyphs further from the background.
 * Always computed from the same `base`, so dragging back and forth never accumulates.
 *
 * The engine's tone is l' = (l − .5)·contrast + .5 + bright, inverted when `tone.invert`; the ink
 * (l', or 1 − l' when inverted) becomes a·ink + d through the contrast and brightness that produce it.
 * (Lowering only the contrast would not do: it pulls empty areas up to half-full glyphs.)
 */
export function presence(base: Recipe, p: number): Recipe {
  const r = cloneRecipe(base);
  const t = clamp(p, 0, 1) - 0.5;
  if (Math.abs(t) < 1e-4) return r;
  const k = Math.abs(t) * 2;
  const a = t < 0 ? 1 - 0.6 * k : 1 + 0.25 * k;
  const d = t < 0 ? 0 : 0.12 * k;
  const c0 = base.tone.contrast, b0 = base.tone.bright;
  r.tone.contrast = r3(clamp(a * c0, 0, 4));
  r.tone.bright = r3(clamp(base.tone.invert ? a * (0.5 + b0) + 0.5 - a - d : a * (0.5 + b0) + d - 0.5, -1, 1));
  const bg = base.color.bg;
  if (t < 0) {
    r.color.stops = base.color.stops.map(s => mixHex(s, bg, 0.7 * k));
    r.color.sat = r3(clamp(base.color.sat * (1 - 0.35 * k), 0, 2));
    r.fx.glow = r3(base.fx.glow * (1 - k));
    r.fx.bloom = r3(base.fx.bloom * (1 - k));
    r.fx.cellBg = r3(base.fx.cellBg * (1 - k));
  } else {
    const far = luminance(bg) > 0.4 ? 0.12 : 0.97;
    r.color.stops = base.color.stops.map(s => towardL(s, far, 0.35 * k));
    r.color.sat = r3(clamp(base.color.sat * (1 + 0.25 * k), 0, 2));
  }
  return r;
}

/** Share of full ink the tone curve gives a field value `l` (what `presence` scales). */
export function inkOf(r: Recipe, l: number): number {
  const v = clamp((l - 0.5) * r.tone.contrast + 0.5 + r.tone.bright, 0, 1);
  return r.tone.invert ? 1 - v : v;
}

/** Copies what `presence` changes from one recipe into another (the rest of `into` stays as it is). */
export function applyPresence(into: Recipe, from: Recipe) {
  into.color.stops = from.color.stops.slice();
  into.color.sat = from.color.sat;
  into.tone.contrast = from.tone.contrast;
  into.tone.bright = from.tone.bright;
  into.fx.glow = from.fx.glow;
  into.fx.bloom = from.fx.bloom;
  into.fx.cellBg = from.fx.cellBg;
}

export const presenceWord = (p: number) => (p < 0.35 ? 'sutil' : p <= 0.65 ? 'equilibrada' : 'protagonista');

/* ------------------------------------------------------------------ */
/* Legibility estimate                                                  */
/* ------------------------------------------------------------------ */

export type Legibility = 'buena' | 'justa' | 'baja';

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/**
 * Estimated WCAG contrast between a text colour and the rendered background behind it (RGBA
 * pixels, `w`×`h`). The background is averaged in blocks of `block` px (the eye blends the glyph
 * texture at reading size) and the estimate is the contrast against the worst tenth of those
 * blocks, so a few bright patches under the headline count. An estimate, not a WCAG audit.
 */
export function legibility(data: ArrayLike<number>, w: number, h: number, textHex: string, block = 8): { ratio: number; level: Legibility } {
  const lt = luminance(textHex);
  const bw = Math.max(1, Math.ceil(w / block)), bh = Math.max(1, Math.ceil(h / block));
  const sum = new Float64Array(bw * bh), cnt = new Uint32Array(bw * bh);
  for (let y = 0; y < h; y++) {
    const by = Math.floor(y / block) * bw;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = (data[i + 3] ?? 255) / 255;
      const Y = 0.2126 * lin(data[i] / 255) + 0.7152 * lin(data[i + 1] / 255) + 0.0722 * lin(data[i + 2] / 255);
      const b = by + Math.floor(x / block);
      sum[b] += Y * a; cnt[b]++;
    }
  }
  const ratios: number[] = [];
  for (let i = 0; i < sum.length; i++) {
    if (!cnt[i]) continue;
    const lb = sum[i] / cnt[i];
    ratios.push((Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05));
  }
  if (!ratios.length) return { ratio: 1, level: 'baja' };
  ratios.sort((a, b) => a - b);
  const raw = ratios[Math.floor((ratios.length - 1) * 0.1)];
  // shown with one decimal, rounded down: 4.48 must not read as a passing 4.5
  return { ratio: Math.floor(raw * 10 + 1e-9) / 10, level: raw >= 4.5 ? 'buena' : raw >= 3 ? 'justa' : 'baja' };
}

/* ------------------------------------------------------------------ */
/* Photo background (foto, step 3)                                     */
/* ------------------------------------------------------------------ */

export const isLightBg = (r: Recipe) => luminance(r.color.bg) > 0.4;

const PAPER = '#f2ecdf', INK = '#0b0a09';

/**
 * Light (ink on paper) or dark (light on screen) background for a photo. Dense glyphs always sit on
 * the photo's dark areas: on paper the tone is inverted and the colours run light → dark; on a dark
 * background they run dark → light. The densest colour keeps at least 4.5:1 against the background.
 */
export function photoBackground(base: Recipe, light: boolean): Recipe {
  const r = cloneRecipe(base);
  r.color.bg = light ? PAPER : INK;
  r.tone.invert = light;
  const byL = base.color.stops.slice().sort((a, b) => luminance(a) - luminance(b));
  const stops = light ? byL.reverse() : byL;
  const last = stops.length - 1;
  for (let i = 0; i < 12 && contrastRatio(stops[last], r.color.bg) < 4.5; i++) stops[last] = towardL(stops[last], light ? 0.08 : 0.98, 0.35);
  r.color.stops = stops;
  return r;
}

/* ------------------------------------------------------------------ */
/* Text export size, word, rhythm                                      */
/* ------------------------------------------------------------------ */

/**
 * Columns × rows for a text copy of a photo: `cols` columns and as many rows as keep the photo's
 * proportions with this cell shape (so «cubrir» shows the whole picture).
 */
export function textGrid(imgW: number, imgH: number, cell: number, aspect: number, cols = 100): { cols: number; rows: number } {
  const cw = Math.max(2, Math.round(cell)), ch = Math.max(2, Math.round(cell * aspect));
  const ratio = imgW > 0 && imgH > 0 ? imgH / imgW : 0.6;
  return { cols, rows: clamp(Math.round((cols * cw * ratio) / ch), 8, 160) };
}

export const WORD_MAX = 24;

/** What goes into the recipe from the word field: single spaces, at most 24 characters. */
export const normWord = (raw: string) => raw.replace(/\s+/g, ' ').slice(0, WORD_MAX).trim();
export const validWord = (raw: string) => normWord(raw).length >= 1;

/** The piece shows `word`: as its source text and, when the glyphs are words, as the text that fills it. */
export function withWord(base: Recipe, word: string): Recipe {
  const r = cloneRecipe(base);
  const w = normWord(word) || base.text.content;
  r.source = 'text';
  r.text.content = w;
  if (r.glyph.mode === 'words') r.glyph.words = w + ' · ';
  return r;
}

export interface Choice<T> { label: string; value: T }

export const FONDO_SPEEDS: Choice<number>[] = [{ label: 'Lento', value: 0.3 }, { label: 'Medio', value: 0.5 }, { label: 'Vivo', value: 1 }];
export const WORD_SPEEDS: Choice<number>[] = [{ label: 'Lento', value: 0.5 }, { label: 'Medio', value: 1 }, { label: 'Vivo', value: 1.8 }];
export const DETAIL: Choice<number>[] = [{ label: 'Grueso', value: 16 }, { label: 'Medio', value: 10 }, { label: 'Fino', value: 6 }];
export const CONTRAST: Choice<number>[] = [{ label: 'Suave', value: 0.75 }, { label: 'Medio', value: 1.25 }, { label: 'Fuerte', value: 2 }];

/** Index of the choice closest to `v`, or -1 when none is within `tol` (relative). */
export function nearestChoice(list: Choice<number>[], v: number, tol = 0.12): number {
  let best = -1, d = Infinity;
  list.forEach((c, i) => { const e = Math.abs(c.value - v); if (e < d) { d = e; best = i; } });
  return best >= 0 && d <= Math.abs(list[best].value) * tol + 1e-9 ? best : -1;
}

/** Seconds a GIF or video of the word lasts when it loops. */
export const LOOP_SECONDS = 4;

/** Engine-time loop length that lasts about `seconds` real seconds at `speed` (loops are in half seconds). */
export function loopFor(speed: number, seconds = LOOP_SECONDS): number {
  return clamp(Math.round(seconds * Math.max(0.05, speed) * 2) / 2, 0.5, 20);
}

/** Changes the speed and, when the piece loops, the loop with it, so a clip keeps its length. */
export function withSpeed(base: Recipe, speed: number): Recipe {
  const r = cloneRecipe(base);
  r.motion.speed = speed;
  if (r.motion.loop > 0) r.motion.loop = loopFor(speed);
  return r;
}
