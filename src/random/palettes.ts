import { contrastRatio, hexToOklch, oklchHex } from '../engine/color';
import type { Rng } from './prng';
import { PALETTE_GALLERY } from './palette-gallery';

export interface Palette {
  name: string;
  stops: string[];  // mapped from empty → dense cells
  bg: string;
  light: boolean;   // light background (ink on paper)
}

/** Hand-picked palettes. Stops go from faint (sparse glyphs) to strong (dense glyphs). */
export const CURATED: Palette[] = [
  { name: 'Fósforo', stops: ['#06220f', '#1fbf5b', '#b8ffcf'], bg: '#020a05', light: false },
  { name: 'Ámbar', stops: ['#2a1300', '#ff9f1c', '#ffe3b0'], bg: '#0d0600', light: false },
  { name: 'Cianotipia', stops: ['#0c2e5c', '#5d8fcf', '#f3f1ea'], bg: '#0a2248', light: false },
  { name: 'Bermellón', stops: ['#2b0d06', '#ff5b1f', '#ffe9c7'], bg: '#0b0708', light: false },
  { name: 'Hueso', stops: ['#1d1b18', '#8c857a', '#ede6da'], bg: '#0b0a09', light: false },
  { name: 'Magma', stops: ['#12030a', '#8a0f2e', '#ff5a1f', '#ffd166', '#fff7e0'], bg: '#050103', light: false },
  { name: 'Hielo', stops: ['#061426', '#1f6f9f', '#7fe7ff', '#f0fdff'], bg: '#020913', light: false },
  { name: 'Neón Tokio', stops: ['#1a0433', '#ff2e97', '#39f3ff'], bg: '#07010f', light: false },
  { name: 'Ocaso', stops: ['#1b1036', '#8c2f6b', '#f2735a', '#ffd29d'], bg: '#0c0718', light: false },
  { name: 'Selva', stops: ['#08170d', '#2f6b3a', '#a7d46f', '#f2f7c8'], bg: '#040b06', light: false },
  { name: 'Óxido', stops: ['#1a0e08', '#7a3b1d', '#d9823b', '#f5d6a8'], bg: '#0c0604', light: false },
  { name: 'Cobalto', stops: ['#050a2a', '#1c3fd8', '#a7b8ff'], bg: '#02041a', light: false },
  { name: 'Menta', stops: ['#062a26', '#18c29c', '#e0fff6'], bg: '#021513', light: false },
  { name: 'Grafito', stops: ['#1a1a1a', '#6b6b6b', '#e6e6e6'], bg: '#0a0a0a', light: false },
  { name: 'Vaporwave', stops: ['#2a1b5c', '#ff71ce', '#01cdfe', '#fffb96'], bg: '#130a2b', light: false },
  { name: 'Aurora', stops: ['#041a24', '#0f7a6b', '#57f0a2', '#d6a3ff'], bg: '#020b10', light: false },
  { name: 'Lima ácida', stops: ['#0d1400', '#6f9c00', '#d9ff3d'], bg: '#050800', light: false },
  { name: 'Coral', stops: ['#2a0f14', '#ff6b6b', '#ffd6c9'], bg: '#12070a', light: false },
  { name: 'Papel', stops: ['#e4dccb', '#8a8173', '#1c1a17'], bg: '#f2ecdf', light: true },
  { name: 'Riso', stops: ['#f1d3dd', '#ff48b0', '#0078bf'], bg: '#f6f0e6', light: true },
  { name: 'Tinta azul', stops: ['#dfe3ea', '#4a6fa5', '#10245a'], bg: '#f4f5f2', light: true },
  { name: 'Sepia', stops: ['#e8d9bf', '#9c6b3c', '#3b2412'], bg: '#f3e8d2', light: true },
  { name: 'Periódico', stops: ['#d8d4cc', '#4d4a45', '#0f0f0f'], bg: '#ebe7df', light: true },
  { name: 'Terracota', stops: ['#f0d9c8', '#c4613a', '#3d1a10'], bg: '#f7ebe1', light: true },
];

export type PaletteStyle =
  | 'curado' | 'galeria' | 'fosforo' | 'neon' | 'duotono' | 'analogo' | 'mono' | 'papel' | 'riso' | 'pastel'
  | 'fuego' | 'hielo' | 'gris' | 'cosmico' | 'tierra';

export const PALETTE_STYLE_NAMES: Record<PaletteStyle, string> = {
  curado: 'Curada', galeria: 'Galería', fosforo: 'Fósforo', neon: 'Neón', duotono: 'Duotono', analogo: 'Análoga', mono: 'Monocroma',
  papel: 'Papel y tinta', riso: 'Risografía', pastel: 'Pastel', fuego: 'Fuego', hielo: 'Hielo', gris: 'Grises',
  cosmico: 'Cósmica', tierra: 'Tierra',
};

const H = (rng: Rng) => rng.range(0, 360);

export function makePalette(style: PaletteStyle, rng: Rng): Palette {
  switch (style) {
    case 'curado': return { ...rng.pick(CURATED) };
    case 'galeria': return { ...rng.pick(PALETTE_GALLERY) };
    case 'fosforo': {
      const h = rng.pick([145, 150, 75, 60, 190, 200, 0]);
      const c = h === 0 ? 0 : 0.17;
      return { name: 'Fósforo', stops: [oklchHex(0.22, c * 0.5, h), oklchHex(0.68, c, h), oklchHex(0.95, c * 0.4, h)], bg: oklchHex(0.1, c * 0.25, h), light: false };
    }
    case 'neon': {
      const h = H(rng), h2 = (h + rng.pick([40, 150, 180, 210])) % 360;
      return { name: 'Neón', stops: [oklchHex(0.2, 0.08, h), oklchHex(0.66, 0.27, h), oklchHex(0.88, 0.16, h2)], bg: oklchHex(0.1, 0.03, h), light: false };
    }
    case 'duotono': {
      const h = H(rng), h2 = (h + rng.range(120, 220)) % 360;
      return { name: 'Duotono', stops: [oklchHex(0.26, 0.11, h), oklchHex(0.9, 0.12, h2)], bg: oklchHex(0.12, 0.04, h), light: false };
    }
    case 'analogo': {
      const h = H(rng), d = rng.range(22, 45) * (rng.chance(0.5) ? 1 : -1);
      return {
        name: 'Análoga',
        stops: [oklchHex(0.24, 0.07, h), oklchHex(0.52, 0.15, h + d), oklchHex(0.74, 0.16, h + 2 * d), oklchHex(0.94, 0.06, h + 3 * d)],
        bg: oklchHex(0.11, 0.03, h), light: false,
      };
    }
    case 'mono': {
      const h = H(rng), c = rng.range(0.02, 0.14);
      return { name: 'Monocroma', stops: [oklchHex(0.25, c * 0.6, h), oklchHex(0.93, c * 0.5, h)], bg: oklchHex(0.1, c * 0.3, h), light: false };
    }
    case 'papel': {
      const h = rng.range(60, 95), ink = rng.pick([[0.2, 0.01, 60], [0.27, 0.12, 265], [0.4, 0.17, 30], [0.3, 0.08, 150]]);
      return {
        name: 'Papel y tinta',
        stops: [oklchHex(0.9, 0.02, h), oklchHex((0.9 + ink[0]) / 2, ink[1] * 0.6, ink[2]), oklchHex(ink[0], ink[1], ink[2])],
        bg: oklchHex(0.95, 0.018, h), light: true,
      };
    }
    case 'riso': {
      const inks: Array<[number, number, number]> = [[0.64, 0.25, 350], [0.53, 0.17, 245], [0.7, 0.18, 55], [0.62, 0.17, 150], [0.45, 0.2, 290], [0.83, 0.17, 95]];
      const [a, b] = rng.shuffle(inks);
      return { name: 'Risografía', stops: [oklchHex(0.9, 0.04, a[2]), oklchHex(...a), oklchHex(...b)], bg: oklchHex(0.96, 0.012, 85), light: true };
    }
    case 'pastel': {
      const h = H(rng);
      return { name: 'Pastel', stops: [oklchHex(0.3, 0.05, h), oklchHex(0.82, 0.09, h + 60), oklchHex(0.92, 0.07, h + 140)], bg: oklchHex(0.18, 0.04, h), light: false };
    }
    case 'fuego':
      return { name: 'Fuego', stops: ['#0a0000', '#6d0a02', '#e2400a', '#ffae2b', '#fff3c4'], bg: '#050000', light: false };
    case 'hielo':
      return { name: 'Hielo', stops: ['#04101f', '#1b4f8a', '#5fd3ff', '#eaffff'], bg: '#020810', light: false };
    case 'gris': {
      const warm = rng.range(-0.01, 0.015);
      return { name: 'Grises', stops: [oklchHex(0.28, Math.abs(warm), 70), oklchHex(0.96, Math.abs(warm), 70)], bg: oklchHex(0.12, Math.abs(warm), 70), light: false };
    }
    case 'cosmico': {
      const h = rng.range(250, 320);
      return { name: 'Cósmica', stops: [oklchHex(0.18, 0.08, h), oklchHex(0.45, 0.2, h + 30), oklchHex(0.72, 0.17, h - 90), oklchHex(0.97, 0.03, 90)], bg: oklchHex(0.08, 0.04, h), light: false };
    }
    case 'tierra': {
      const h = rng.range(35, 80);
      return { name: 'Tierra', stops: [oklchHex(0.25, 0.04, h), oklchHex(0.5, 0.09, h - 15), oklchHex(0.72, 0.1, h + 20), oklchHex(0.92, 0.04, h + 30)], bg: oklchHex(0.13, 0.02, h), light: false };
    }
  }
}

/** Keeps the strongest stop legible against the background. */
export function ensureContrast(p: Palette, min = 3): Palette {
  const top = p.stops[p.stops.length - 1];
  if (contrastRatio(top, p.bg) >= min) return p;
  const [L, C, h] = hexToOklch(top);
  let l = L;
  for (let i = 0; i < 20 && contrastRatio(oklchHex(l, C, h), p.bg) < min; i++) l += p.light ? -0.04 : 0.04;
  const stops = p.stops.slice();
  stops[stops.length - 1] = oklchHex(Math.max(0, Math.min(1, l)), C, h);
  return { ...p, stops };
}

/** Dims a palette so it sits quietly behind web content. */
export function soften(p: Palette, amount: number): Palette {
  const stops = p.stops.map(s => {
    const [L, C, h] = hexToOklch(s);
    const [bl] = hexToOklch(p.bg);
    return oklchHex(L + (bl - L) * amount, C * (1 - amount * 0.5), h);
  });
  return { ...p, stops };
}

/** Rotates every colour of a palette (used by mutation). */
export function rotateHue(stops: string[], bg: string, deg: number): { stops: string[]; bg: string } {
  const rot = (s: string) => { const [L, C, h] = hexToOklch(s); return oklchHex(L, C, h + deg); };
  return { stops: stops.map(rot), bg: rot(bg) };
}
