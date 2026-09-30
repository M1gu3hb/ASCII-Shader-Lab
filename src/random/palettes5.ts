import { contrastRatio, hexToOklch, oklabToRgb, oklchHex } from '../engine/color';
import { PALETTE_GALLERY, type PaletteMood } from './palette-gallery';
import { CURATED, ensureContrast, type Palette } from './palettes';
import type { Rng } from './prng';

/**
 * The palettes of generator version 5. Versions 1–4 keep theirs (palettes.ts, never edited): their seeds keep
 * their colours. What changed, measured over thousands of rolls (scripts/azar-report.mjs, dev/azar.html):
 *  - families that are not «the same palette with another hue»: vivid analogous ramps, a deep coloured night
 *    instead of black, duotones, poster colours (ink on bright paper, or bright ink on black), greys with one
 *    accent, triads, pastels (light and dark), ink on tinted paper, the gallery's forty palettes by mood;
 *  - every chromatic stop sits near the most colourful lightness its hue can take in sRGB (the «cusp»), so a
 *    yellow is never asked to be dark (that is olive, khaki or brown) and a blue is never asked to be pale;
 *  - dark stops of warm hues lean toward red and violet instead of browning (shadows are cool);
 *  - the faintest stop stays visibly apart from the background, and a middle stop always reads on it, so sparse
 *    pieces are not a few dim glyphs lost in the dark.
 */
export type Palette5Style =
  | 'vivo' | 'noche' | 'duo' | 'cartel' | 'acento' | 'triada' | 'pastel5' | 'papel5' | 'mono5' | 'curado5'
  | 'g-calma' | 'g-cosmos' | 'g-tinta' | 'g-energia' | 'g-naturaleza';

export const PALETTE5_NAMES: Record<Palette5Style, string> = {
  vivo: 'Viva', noche: 'Noche de color', duo: 'Duotono', cartel: 'Cartel', acento: 'Gris con acento', triada: 'Tríada',
  pastel5: 'Pastel', papel5: 'Tinta sobre papel de color', mono5: 'Un solo tono', curado5: 'Curada',
  'g-calma': 'Galería · Calma', 'g-cosmos': 'Galería · Cosmos', 'g-tinta': 'Galería · Tinta', 'g-energia': 'Galería · Energía', 'g-naturaleza': 'Galería · Naturaleza',
};

const wrap = (h: number) => ((h % 360) + 360) % 360;
const inGamut = (L: number, C: number, h: number) => {
  const hr = (h * Math.PI) / 180;
  return oklabToRgb([L, C * Math.cos(hr), C * Math.sin(hr)]).every(v => v >= -0.0005 && v <= 1.0005);
};
/** Largest chroma a hue can take at a lightness (in sRGB). */
export function maxChroma(L: number, h: number): number {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (inGamut(L, m, h)) lo = m; else hi = m; }
  return lo;
}
const cusps = new Map<number, { L: number; C: number }>();
/** The lightness where a hue is most colourful, and how colourful (sRGB cusp; cached per degree). */
export function cusp(h: number): { L: number; C: number } {
  const k = Math.round(wrap(h));
  let c = cusps.get(k);
  if (!c) {
    c = { L: 0.5, C: 0 };
    for (let L = 0.3; L <= 0.97; L += 0.01) { const C = maxChroma(L, k); if (C > c.C) c = { L, C }; }
    cusps.set(k, c);
  }
  return c;
}
/** A colour of hue h at lightness L with a share k (0..1) of the chroma sRGB allows there. */
const at = (L: number, k: number, h: number) => oklchHex(L, maxChroma(L, wrap(h)) * k, wrap(h));
/** The hue's most colourful colour, a share k of it, nudged in lightness by dl. */
const vivid = (h: number, k = 0.95, dl = 0) => { const c = cusp(h); const L = Math.max(0.35, Math.min(0.94, c.L + dl)); return at(L, k, h); };
/** Shadows lean cool: a dark stop of a warm hue (dark orange and dark yellow are brown) turns crimson, violet or forest green. */
const shadowHue = (h: number) => {
  const w = wrap(h);
  if (w >= 12 && w < 50) return wrap(350 - (w - 12) * 0.2);    // red-orange and orange: crimson
  if (w >= 50 && w < 95) return 300 - (w - 50) * 0.4;          // amber and yellow: violet (their complement)
  if (w >= 95 && w <= 130) return 150 + (w - 95) * 0.3;        // olive and lime: forest green
  return w;
};
/** A dark colour that keeps its hue family without turning brown. */
const deep = (L: number, k: number, h: number) => at(L, k, shadowHue(h));
const warmMid = (h: number) => wrap(h) >= 45 && wrap(h) <= 115;
/** Hues from the one that is naturally darkest (blue, violet, red) to the lightest (yellow): the order of a ramp. */
const byDepth = (hs: number[]) => hs.map(wrap).sort((a, b) => cusp(a).L - cusp(b).L);

function gallery(rng: Rng, mood: PaletteMood): Palette {
  const { name, stops, bg, light } = rng.pick(PALETTE_GALLERY.filter(p => p.mood === mood));
  return { name, stops: stops.slice(), bg, light };
}

/** The curated palettes that keep their colour (the beige, brown and grey ones stay in versions 1–4). */
const CURATED5 = CURATED.filter(p => !['Hueso', 'Óxido', 'Grafito', 'Papel', 'Sepia', 'Periódico', 'Terracota', 'Ámbar'].includes(p.name));

/** Paper colours bright enough to be the subject (poster printing). Hue and how light. */
const PAPERS: Array<[number, number]> = [[100, 0.9], [85, 0.86], [60, 0.8], [30, 0.72], [350, 0.78], [320, 0.8], [200, 0.84], [150, 0.86], [130, 0.9], [280, 0.8], [240, 0.78]];

/**
 * Keeps a palette out of the mud. Warm hues without much colour are what reads as beige, khaki or brown: a dark
 * one (orange to olive) turns crimson or forest green (deep), a tan one (orange) gets the colour its lightness
 * allows (terracotta, apricot), a khaki one (yellow to olive) leans toward sage and jade. Near-white stays.
 */
export function demud(p: Palette): Palette {
  const fix = (s: string) => {
    const [L, C, h] = hexToOklch(s);
    const w = wrap(h);
    if (C < 0.02 || L >= 0.86) return s;
    if (L < 0.5 && w >= 15 && w <= 130 && C < 0.12) return deep(L, 0.8, h);
    if (w >= 40 && w < 80 && C < 0.1) return oklchHex(L, Math.min(0.13, maxChroma(L, w)), w);
    if (w >= 80 && w <= 115 && C < 0.12) { const g = w + 40; return oklchHex(L, Math.min(Math.max(C, 0.09), maxChroma(L, g)), g); }
    return s;
  };
  return { ...p, stops: p.stops.map(fix), bg: fix(p.bg) };
}

export function makePalette5(style: Palette5Style, rng: Rng): Palette {
  return demud(make5(style, rng));
}

function make5(style: Palette5Style, rng: Rng): Palette {
  const h = rng.range(0, 360);
  switch (style) {
    case 'g-calma': return gallery(rng, 'calma');
    case 'g-cosmos': return gallery(rng, 'cosmos');
    case 'g-tinta': return gallery(rng, 'tinta');
    case 'g-energia': return gallery(rng, 'energia');
    case 'g-naturaleza': return gallery(rng, 'naturaleza');
    case 'curado5': { const p = rng.pick(CURATED5); return { ...p, stops: p.stops.slice() }; }
    case 'vivo': {
      // an analogous run of hues, each at its most colourful, over a dark background tinted with the first
      const d = rng.range(18, 40) * (rng.chance(0.5) ? 1 : -1);
      const [h0, h1, h2, h3] = byDepth([h, h + d, h + 2 * d, h + 3 * d]);
      return {
        name: 'Viva',
        stops: [deep(0.36, 0.75, h0), vivid(h1, 0.95, -0.02), vivid(h2, 0.85, 0.08), at(0.96, 0.35, h3)],
        bg: deep(rng.range(0.1, 0.14), 0.4, h0), light: false,
      };
    }
    case 'noche': {
      // a deep coloured night (navy, violet, teal, wine) with light glyphs in a contrasting hue
      const hb = rng.pick([250, 265, 280, 295, 190, 205, 345, 5, 160]) + rng.range(-8, 8);
      const h2 = wrap(hb + rng.pick([150, 180, 200, -120, 60]) + rng.range(-15, 15));
      const bgL = rng.range(0.19, 0.25);
      return {
        name: 'Noche de color',
        stops: [at(bgL + 0.16, 0.7, hb), vivid(h2, 0.9, 0.04), at(0.95, 0.3, h2 + 15)],
        bg: at(bgL, 0.85, hb), light: false,
      };
    }
    case 'duo': {
      const [dk, lt] = byDepth([h, h + rng.range(140, 220)]);
      if (rng.chance(0.7)) {
        return { name: 'Duotono', stops: [deep(0.5, 0.85, dk), vivid(lt, 0.9, 0.1)], bg: deep(0.11, 0.45, dk), light: false };
      }
      return { name: 'Duotono claro', stops: [at(0.84, 0.35, lt), deep(0.42, 0.9, dk)], bg: at(0.95, 0.25, lt), light: true };
    }
    case 'cartel': {
      const [hp, pl] = rng.pick(PAPERS);
      const hc = wrap(hp + rng.pick([180, 160, 200, 120, -120]));
      if (rng.chance(0.68)) {
        // ink on a bright paper: tone on tone, a colourful middle, near-black ink
        const paper = at(pl, 0.9, hp);
        return {
          name: 'Cartel',
          stops: [at(pl - 0.13, 0.95, hp), deep(0.5, 0.9, hc), deep(0.2, 0.35, hc)],
          bg: paper, light: true,
        };
      }
      // bright paper colour as ink on near-black
      return { name: 'Cartel nocturno', stops: [at(0.36, 0.6, hp), at(pl, 0.95, hp), at(0.97, 0.25, hp)], bg: at(0.13, 0.15, hc), light: false };
    }
    case 'acento': {
      // greys with a single colour for the densest glyphs
      const tint = rng.pick([250, 70, 200, 20]), tc = rng.range(0.004, 0.014);
      const ha = rng.range(0, 360);
      if (rng.chance(0.65)) {
        return { name: 'Gris con acento', stops: [oklchHex(0.34, tc, tint), oklchHex(0.74, tc, tint), vivid(ha, 1, 0.02)], bg: oklchHex(rng.range(0.1, 0.14), tc, tint), light: false };
      }
      return { name: 'Gris con acento claro', stops: [oklchHex(0.8, tc, tint), oklchHex(0.36, tc, tint), deep(Math.min(0.58, cusp(ha).L), 1, ha)], bg: oklchHex(0.96, tc, tint), light: true };
    }
    case 'triada': {
      const [a, b, c] = byDepth([h, h + 120, h + 240]);
      return { name: 'Tríada', stops: [deep(0.46, 0.8, a), vivid(b, 0.9, 0), vivid(c, 0.55, 0.12)], bg: deep(0.11, 0.35, a), light: false };
    }
    case 'pastel5': {
      const d = rng.range(35, 70);
      if (rng.chance(0.55)) {
        return { name: 'Pastel claro', stops: [at(0.86, 0.3, h), at(0.74, 0.55, h + d), deep(0.52, 0.6, h + 2 * d)], bg: at(0.965, 0.18, h + 3 * d), light: true };
      }
      return { name: 'Pastel', stops: [deep(0.5, 0.45, h), at(0.8, 0.6, h + d), at(0.92, 0.45, h + 2 * d)], bg: deep(0.2, 0.35, h), light: false };
    }
    case 'papel5': {
      // ink on a tinted paper (mint, rose, sky, butter, lilac…), not only on beige
      const hp = rng.range(0, 360), hi = wrap(hp + rng.pick([0, 180, 150, -150, 90]));
      const ink = warmMid(hi) ? wrap(hi - 60) : hi;
      return {
        name: 'Tinta sobre papel de color',
        stops: [at(0.84, 0.35, hp), deep(0.52, 0.8, ink), deep(0.24, 0.55, ink)],
        bg: at(rng.range(0.93, 0.965), 0.3, hp), light: true,
      };
    }
    case 'mono5': {
      return { name: 'Un solo tono', stops: [deep(0.34, 0.7, h), vivid(h, 0.95, 0), at(0.95, 0.25, h)], bg: deep(rng.range(0.1, 0.13), 0.5, h), light: false };
    }
  }
}

/**
 * Makes a version 5 palette read on its background: the faintest stop stays visibly apart from it, a middle stop
 * reads on it, and the strongest one is legible (contrast 3.5 on dark, 3 on light).
 */
export function tune5(p: Palette): Palette {
  const [bgL] = hexToOklch(p.bg);
  const dir = p.light ? -1 : 1;
  const stops = p.stops.map((s, i) => {
    const [L, C, h] = hexToOklch(s);
    // the faintest glyphs: at least .1 away from the paper; the others at least .22 (so the middle reads)
    const gap = i === 0 ? 0.1 : 0.22;
    if ((L - bgL) * dir >= gap) return s;
    const nl = Math.max(0.02, Math.min(0.98, bgL + dir * gap));
    return oklchHex(nl, Math.min(C, maxChroma(nl, h)), h);
  });
  return ensureContrast({ ...p, stops }, p.light ? 3 : 3.5);
}

/** Dims a version 5 palette for a web background: toward the background's lightness, keeping its colour. */
export function soften5(p: Palette, amount: number): Palette {
  const [bl] = hexToOklch(p.bg);
  const stops = p.stops.map(s => {
    const [L, C, h] = hexToOklch(s);
    const nl = L + (bl - L) * amount;
    return oklchHex(nl, Math.min(C * (1 - amount * 0.15), maxChroma(nl, h)), h);
  });
  return { ...p, stops };
}

/** Whether the strongest stop stays legible on the background (tests). */
export const readable5 = (p: Palette) => contrastRatio(p.stops[p.stops.length - 1], p.bg) >= (p.light ? 2.9 : 3.4);
