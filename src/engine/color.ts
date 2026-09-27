/** Colour helpers: sRGB ↔ OKLab/OKLCH, gradient baking. */

export type RGB = [number, number, number]; // 0..1

export function hexToRgb(hex: string): RGB {
  let h = String(hex || '#000').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(c: RGB): string {
  return '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function rgbToOklab([r, g, b]: RGB): RGB {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** OKLCH (L 0..1, C 0..0.4, h degrees) → sRGB, chroma reduced until it fits the gamut. */
export function oklch(L: number, C: number, h: number): RGB {
  const hr = (h * Math.PI) / 180;
  let c = C;
  for (let i = 0; i < 24; i++) {
    const rgb = oklabToRgb([L, c * Math.cos(hr), c * Math.sin(hr)]);
    if (rgb.every(v => v >= -0.001 && v <= 1.001)) return rgb.map(v => Math.max(0, Math.min(1, v))) as RGB;
    c *= 0.88;
  }
  return oklabToRgb([L, 0, 0]).map(v => Math.max(0, Math.min(1, v))) as RGB;
}

export const oklchHex = (L: number, C: number, h: number) => rgbToHex(oklch(L, C, h));

export function hexToOklch(hex: string): [number, number, number] {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

/** WCAG relative luminance */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Bakes colour stops into a 256×1 RGBA gradient, interpolated in OKLab. */
export function bakeGradient(stops: string[], size = 256): Uint8Array {
  const out = new Uint8Array(size * 4);
  const labs = (stops.length ? stops : ['#ffffff']).map(s => rgbToOklab(hexToRgb(s)));
  for (let i = 0; i < size; i++) {
    const t = size === 1 ? 0 : i / (size - 1);
    let c: RGB;
    if (labs.length === 1) c = labs[0];
    else {
      const f = t * (labs.length - 1);
      const k = Math.min(labs.length - 2, Math.floor(f));
      const u = f - k;
      const A = labs[k], B = labs[k + 1];
      c = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u];
    }
    const rgb = oklabToRgb(c);
    out[i * 4] = Math.round(Math.max(0, Math.min(1, rgb[0])) * 255);
    out[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, rgb[1])) * 255);
    out[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, rgb[2])) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Samples a baked gradient (used by CPU exporters to match the GPU). */
export function sampleGradient(g: Uint8Array, t: number): RGB {
  const n = g.length / 4;
  const x = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.floor(x), f = x - i, j = Math.min(n - 1, i + 1);
  return [0, 1, 2].map(k => ((g[i * 4 + k] * (1 - f) + g[j * 4 + k] * f) / 255)) as RGB;
}
