/**
 * Limited palettes: presets (shared by «Paleta limitada» and the palette mode of «Tramado»), the colours
 * of a palette param set, nearest-colour lookup and an automatic palette taken from the picture itself
 * (median cut).
 */
import { parseHex, type Img, type RGB, type Values } from './core';

export interface PalettePreset {
  id: string;
  /** Spanish name for the studio. */
  name: string;
  colors: string[];
}

/**
 * Riso pairs are two inks on paper: paper, each ink, and the overprint (multiply) of both. Colours of
 * the Riso inks are approximations of the published ink swatches.
 */
function riso(paper: string, a: string, b: string): string[] {
  const p = parseHex(paper)!, x = parseHex(a)!, y = parseHex(b)!;
  const over = x.map((v, i) => Math.round((v * y[i]) / 255 * (p[i] / 255)));
  const hex = (c: number[]) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  return [paper, a, b, hex(over)];
}

export const PALETTES: PalettePreset[] = [
  { id: 'bn', name: '1 bit (negro y blanco)', colors: ['#000000', '#ffffff'] },
  { id: 'tinta', name: 'Tinta y hueso', colors: ['#0c0b0a', '#ede6da'] },
  { id: 'glyphos', name: 'Tinta, hueso y bermellón', colors: ['#0c0b0a', '#ede6da', '#ff5b1f'] },
  { id: 'gameboy', name: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  { id: 'cga', name: 'CGA (cian y magenta)', colors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'] },
  { id: 'cga2', name: 'CGA (verde, rojo y amarillo)', colors: ['#000000', '#55ff55', '#ff5555', '#ffff55'] },
  {
    id: 'pico8', name: 'PICO-8', colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ],
  },
  {
    id: 'c64', name: 'Commodore 64', colors: [
      '#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77',
      '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb',
    ],
  },
  { id: 'riso-azul-rosa', name: 'Riso: azul y rosa fluorescente', colors: riso('#f4efe4', '#3255a4', '#ff48b0') },
  { id: 'riso-verde-naranja', name: 'Riso: verde y naranja', colors: riso('#f4efe4', '#00a95c', '#ff6c2f') },
  { id: 'riso-teal-amarillo', name: 'Riso: azul verdoso y amarillo', colors: riso('#f4efe4', '#00838a', '#ffe800') },
  { id: 'sepia', name: 'Sepia', colors: ['#20150e', '#4a3423', '#7a5a3d', '#ad8a62', '#dcc49c', '#f5e9d0'] },
  { id: 'ambar', name: 'Terminal ámbar', colors: ['#120a00', '#5a3300', '#b36b00', '#ffb000', '#ffe1a0'] },
  { id: 'fosforo', name: 'Fósforo verde', colors: ['#020d04', '#0b3d12', '#1f8a2c', '#4fe36a', '#c6ffc9'] },
  { id: 'cianotipo', name: 'Cianotipia', colors: ['#0b2447', '#19376d', '#576cbc', '#a5d7e8', '#f1f6f9'] },
  { id: 'auto', name: 'Automática (de la imagen)', colors: [] },
  { id: 'custom', name: 'Tus colores', colors: [] },
];

export const PALETTE_OPTIONS: Array<[string, string]> = PALETTES.map(p => [p.id, p.name]);

export function palettePreset(id: string): PalettePreset | undefined {
  return PALETTES.find(p => p.id === id);
}

/** Keys of the custom colours (c1…c6) and how many of them are used («count»). */
export const CUSTOM_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const;

/**
 * The colours of a palette choice. 'auto' extracts `count` colours from `img`; 'custom' reads c1…c{count}.
 * Never returns fewer than two colours.
 */
export function resolvePalette(id: string, p: Values, img: Img | null): RGB[] {
  const count = Math.max(2, Math.min(16, Math.round(Number(p.count) || 4)));
  let out: RGB[] = [];
  if (id === 'auto') out = img ? medianCut(img, count) : [];
  else if (id === 'custom') {
    for (const k of CUSTOM_KEYS.slice(0, Math.min(count, CUSTOM_KEYS.length))) {
      const c = parseHex(p[k]);
      if (c) out.push(c);
    }
  } else out = (palettePreset(id)?.colors ?? []).map(c => parseHex(c)!);
  if (out.length < 2) out = [[0, 0, 0], [255, 255, 255]];
  return out;
}

/* ------------------------------------------------------------------ nearest colour */

/** Perceptually weighted squared distance in sRGB ("redmean"). */
export function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const rm = (r1 + r2) * 0.5, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

/**
 * Nearest palette entry of a colour. Palettes of up to 4 colours are searched exactly; bigger ones go
 * through a lazily filled 6-bit-per-channel table (the answer for the centre of the bin), which differs
 * from the exact search only for colours within a few units of a boundary between two entries.
 */
export class Nearest {
  readonly colors: RGB[];
  readonly flat: Float32Array;
  /** 6-bit-per-channel answers (255 = not computed yet), null for palettes of up to 4 colours. */
  readonly lut: Uint8Array | null;

  constructor(colors: RGB[]) {
    this.colors = colors;
    this.flat = new Float32Array(colors.length * 3);
    colors.forEach((c, i) => { this.flat[i * 3] = c[0]; this.flat[i * 3 + 1] = c[1]; this.flat[i * 3 + 2] = c[2]; });
    this.lut = colors.length > 4 ? new Uint8Array(1 << 18).fill(255) : null;
  }

  exact(r: number, g: number, b: number): number {
    const f = this.flat, n = this.colors.length;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = colorDist(r, g, b, f[i * 3], f[i * 3 + 1], f[i * 3 + 2]);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  index(r: number, g: number, b: number): number {
    const lut = this.lut;
    if (!lut) return this.exact(r, g, b);
    const ri = r <= 0 ? 0 : r >= 255 ? 63 : (r as number) >> 2;
    const gi = g <= 0 ? 0 : g >= 255 ? 63 : (g as number) >> 2;
    const bi = b <= 0 ? 0 : b >= 255 ? 63 : (b as number) >> 2;
    const k = (ri << 12) | (gi << 6) | bi;
    let v = lut[k];
    if (v === 255) { v = this.exact((ri << 2) + 2, (gi << 2) + 2, (bi << 2) + 2); lut[k] = v; }
    return v;
  }

  /** Mean distance (RGB units) from each colour to its closest other colour: how far apart the entries are. */
  spacing(): number {
    const c = this.colors;
    let s = 0;
    for (let i = 0; i < c.length; i++) {
      let m = Infinity;
      for (let j = 0; j < c.length; j++) if (j !== i) {
        const d = Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1], c[i][2] - c[j][2]);
        if (d < m) m = d;
      }
      s += m;
    }
    return s / c.length;
  }
}

const nearestCache = new Map<string, Nearest>();

/** A cached Nearest for a list of colours (the last 12 palettes are kept). */
export function nearestFor(colors: RGB[]): Nearest {
  const key = colors.map(c => c.join(',')).join(';');
  let n = nearestCache.get(key);
  if (n) { nearestCache.delete(key); nearestCache.set(key, n); return n; }
  n = new Nearest(colors);
  nearestCache.set(key, n);
  if (nearestCache.size > 12) nearestCache.delete(nearestCache.keys().next().value!);
  return n;
}

/* ------------------------------------------------------------------ median cut */

/**
 * `n` representative colours of the visible pixels of an image (median cut on up to ~40k samples taken on
 * a regular stride, so it is deterministic and fast). Sorted from dark to light.
 */
export function medianCut(img: Img, n: number): RGB[] {
  const { data, width, height } = img;
  const total = width * height;
  const stride = Math.max(1, Math.floor(Math.sqrt(total / 40000)));
  const px: number[] = [];
  for (let y = 0; y < height; y += stride) for (let x = 0; x < width; x += stride) {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) continue;
    px.push(data[i], data[i + 1], data[i + 2]);
  }
  if (px.length < 3) return [];
  let boxes: number[][] = [Array.from({ length: px.length / 3 }, (_, i) => i)];
  const range = (b: number[], c: number) => {
    let lo = 255, hi = 0;
    for (const i of b) { const v = px[i * 3 + c]; if (v < lo) lo = v; if (v > hi) hi = v; }
    return hi - lo;
  };
  while (boxes.length < n) {
    // split the box with the widest channel range (ties: the most populated)
    let bi = -1, bc = 0, br = -1;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        const r = range(b, c) * (c === 1 ? 1.2 : 1);
        if (r > br || (r === br && bi >= 0 && b.length > boxes[bi].length)) { br = r; bi = i; bc = c; }
      }
    });
    if (bi < 0 || br <= 0) break;
    const b = boxes[bi].slice().sort((a, z) => px[a * 3 + bc] - px[z * 3 + bc] || a - z);
    const mid = b.length >> 1;
    boxes = [...boxes.slice(0, bi), b.slice(0, mid), b.slice(mid), ...boxes.slice(bi + 1)];
  }
  const out: RGB[] = boxes.map(b => {
    let r = 0, g = 0, bl = 0;
    for (const i of b) { r += px[i * 3]; g += px[i * 3 + 1]; bl += px[i * 3 + 2]; }
    return [Math.round(r / b.length), Math.round(g / b.length), Math.round(bl / b.length)] as RGB;
  });
  out.sort((a, b) => (a[0] * 0.299 + a[1] * 0.587 + a[2] * 0.114) - (b[0] * 0.299 + b[1] * 0.587 + b[2] * 0.114));
  return out;
}
