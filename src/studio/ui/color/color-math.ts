import { hexToOklch, hexToRgb, oklabToRgb, rgbToHex, type RGB } from '../../../engine/color';

/**
 * Colour helpers of the studio's colour editor: reading what a person types (hex, rgb(), hsl(), oklch()),
 * and the OKLCH space it explores (tono, luz, intensidad), always clamped to what a screen can show (sRGB).
 */

/** Largest OKLCH chroma the editor offers (the most colourful sRGB colours sit below it). */
export const C_MAX = 0.37;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const wrapH = (h: number) => ((h % 360) + 360) % 360;

/** Whether an OKLCH colour exists on screen (sRGB), with a small tolerance. */
export function inGamut(L: number, C: number, h: number): boolean {
  const hr = (h * Math.PI) / 180;
  return oklabToRgb([L, C * Math.cos(hr), C * Math.sin(hr)]).every(v => v >= -0.0005 && v <= 1.0005);
}

/** The largest chroma a hue can have at a lightness on screen. */
export function gamutChroma(L: number, h: number): number {
  if (L <= 0 || L >= 1) return 0;
  let lo = 0, hi = C_MAX;
  for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if (inGamut(L, m, h)) lo = m; else hi = m; }
  return lo;
}

/** OKLCH → #rrggbb, with the chroma brought inside the screen's gamut (the hue and lightness stay). */
export function lchToHex(L: number, C: number, h: number): string {
  const l = clamp01(L), c = Math.max(0, Math.min(C, gamutChroma(l, h))), hr = (wrapH(h) * Math.PI) / 180;
  return rgbToHex(oklabToRgb([l, c * Math.cos(hr), c * Math.sin(hr)]).map(clamp01) as RGB);
}

export interface Lch { L: number; C: number; h: number }
/** #rrggbb → OKLCH; a grey keeps the hue it is given (so moving through grey does not lose the hue). */
export function hexToLch(hex: string, keepHue?: number): Lch {
  const [L, C, h] = hexToOklch(hex);
  return { L, C, h: C < 0.005 && keepHue !== undefined ? keepHue : h };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** RGB 0–1 → HSL (hue in degrees, saturation and lightness 0–1). */
export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [wrapH(h * 60), s, l];
}

const num = (s: string, pct = 1) => {
  const t = s.trim();
  const v = parseFloat(t);
  if (!Number.isFinite(v)) return NaN;
  return t.endsWith('%') ? (v / 100) * pct : v;
};

/**
 * What a person typed or pasted as a colour, as #rrggbb (null when it is not one): #rgb, #rrggbb (with or
 * without #), rgb(…) / rgba(…), hsl(…) / hsla(…), oklch(…). Alpha is ignored (pieces have no transparent stops).
 */
export function parseColor(input: string): string | null {
  const s = input.trim().toLowerCase();
  let m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
    return '#' + h;
  }
  m = /^(rgba?|hsla?|oklch)\(([^)]*)\)$/.exec(s);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  if (m[1].startsWith('rgb')) {
    const v = parts.slice(0, 3).map(p => num(p, 255) / 255);
    if (v.some(x => !Number.isFinite(x))) return null;
    return rgbToHex(v.map(clamp01) as RGB);
  }
  if (m[1].startsWith('hsl')) {
    const h = parseFloat(parts[0]), sat = num(parts[1], 1), l = num(parts[2], 1);
    const sat01 = parts[1].includes('%') ? sat : sat / 100, l01 = parts[2].includes('%') ? l : l / 100;
    if (![h, sat01, l01].every(Number.isFinite)) return null;
    return rgbToHex(hslToRgb(wrapH(h), clamp01(sat01), clamp01(l01)));
  }
  const L = parts[0].includes('%') ? num(parts[0], 1) : parseFloat(parts[0]);
  const C = parts[1].includes('%') ? num(parts[1], 0.4) : parseFloat(parts[1]);
  const h = parseFloat(parts[2]);
  if (![L, C, h].every(Number.isFinite)) return null;
  return lchToHex(L, C, h);
}

/** A colour written the ways the editor offers to copy it. */
export function formats(hex: string): { hex: string; rgb: string; hsl: string; oklch: string } {
  const rgb = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(rgb);
  const [L, C, H] = hexToOklch(hex);
  return {
    hex: hex.toUpperCase(),
    rgb: `rgb(${rgb.map(v => Math.round(v * 255)).join(', ')})`,
    hsl: `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`,
    oklch: `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${Math.round(H)})`,
  };
}

/** The words a person reads for a colour: its hue family, how light and how vivid (for names and screen readers). */
export function describe(hex: string): string {
  const [L, C, h] = hexToOklch(hex);
  const light = L < 0.25 ? 'muy oscuro' : L < 0.45 ? 'oscuro' : L < 0.7 ? 'medio' : L < 0.88 ? 'claro' : 'muy claro';
  if (C < 0.03) return L < 0.08 ? 'negro' : L > 0.97 ? 'blanco' : `gris ${light}`;
  const names: Array<[number, string]> = [[20, 'rosa'], [45, 'rojo'], [70, 'naranja'], [105, 'amarillo'], [135, 'lima'], [165, 'verde'], [200, 'turquesa'], [235, 'cian'], [270, 'azul'], [305, 'violeta'], [340, 'magenta'], [361, 'rosa']];
  const name = names.find(([k]) => h < k)![1];
  const vivid = C < 0.08 ? ', apagado' : C > 0.2 ? ', muy vivo' : '';
  return `${name} ${light}${vivid}`;
}
