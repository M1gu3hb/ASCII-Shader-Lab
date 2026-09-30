import { hexToOklch } from '../../../engine/color';
import { tune5 } from '../../../random/palettes5';
import { lchToHex } from './color-math';

/**
 * Palette suggestions from the palette of the piece: the same ramp (how light each stop is, from the faint glyphs
 * to the dense ones) with other hues or another amount of colour. Each keeps the background and the stops
 * legible on it (tune5, the dice's own rule). Pure: the colour editor lists them, a test checks them.
 */
export interface Pal { stops: string[]; bg: string }
export interface Suggestion extends Pal { id: string; name: string; hint: string }

const wrap = (h: number) => ((h % 360) + 360) % 360;

/** The hue a palette is about: that of its most colourful stop (or of the background when all are grey). */
export function mainHue(p: Pal): number {
  let best = -1, hue = 0;
  for (const s of [...p.stops, p.bg]) {
    const [, C, h] = hexToOklch(s);
    if (C > best) { best = C; hue = h; }
  }
  return hue;
}

const isLight = (p: Pal) => hexToOklch(p.bg)[0] > 0.6;

/** A new palette with each stop's lightness kept, its hue from `hueOf(i)` and its chroma from `chromaOf`. */
function remap(p: Pal, hueOf: (i: number, h: number) => number, chromaOf: (i: number, C: number, L: number) => number, bgHue?: number): Pal {
  const n = p.stops.length;
  const stops = p.stops.map((s, i) => {
    const [L, C, h] = hexToOklch(s);
    return lchToHex(L, chromaOf(i, C, L), hueOf(n > 1 ? i / (n - 1) : 1, h));
  });
  const [bL, bC, bh] = hexToOklch(p.bg);
  const bg = lchToHex(bL, bC, bgHue ?? bh);
  const t = tune5({ name: '', stops, bg, light: isLight(p) });
  return { stops: t.stops, bg: t.bg };
}

/** Enough colour to read as that hue (a grey palette gets some), without asking for more than the screen has. */
const some = (C: number, L: number) => Math.max(C, L > 0.2 && L < 0.95 ? 0.09 : 0.03);

export function suggestions(p: Pal): Suggestion[] {
  const h0 = mainHue(p);
  const out: Suggestion[] = [
    { id: 'analoga', name: 'Análoga', hint: 'Tonos vecinos del principal: armonía tranquila.', ...remap(p, t => h0 - 30 + t * 60, (_i, C, L) => some(C, L), h0 - 30) },
    { id: 'complementaria', name: 'Complementaria', hint: 'El tono opuesto en las celdas llenas: contraste que vibra.', ...remap(p, t => (t > 0.5 ? h0 + 180 : h0), (_i, C, L) => some(C, L), h0) },
    { id: 'triada', name: 'Tríada', hint: 'Tres tonos a la misma distancia en el círculo.', ...remap(p, t => h0 + Math.round(t * 2) * 120, (_i, C, L) => some(C, L), h0) },
    { id: 'monocroma', name: 'Un solo tono', hint: 'Todo en el tono principal, de oscuro a claro.', ...remap(p, () => h0, (_i, C, L) => some(C, L), h0) },
    { id: 'viva', name: 'Más viva', hint: 'Los mismos tonos con toda la intensidad que admite la pantalla.', ...remap(p, (_t, h) => h, () => 0.37) },
    { id: 'suave', name: 'Más suave', hint: 'Los mismos tonos, con menos intensidad (casi pastel).', ...remap(p, (_t, h) => h, (_i, C) => C * 0.45) },
    { id: 'girar', name: 'Otro tono', hint: 'Toda la paleta girada un tercio del círculo.', ...remap(p, (_t, h) => h + 120, (_i, C) => C, wrap(hexToOklch(p.bg)[2] + 120)) },
  ];
  // paper ↔ night: the ramp mirrored in lightness (the faint glyphs stay near the background)
  const inv = (s: string) => { const [L, C, h] = hexToOklch(s); return lchToHex(1 - L * 0.92, C, h); };
  const t = tune5({ name: '', stops: p.stops.map(inv), bg: inv(p.bg), light: !isLight(p) });
  out.push({ id: 'invertir', name: isLight(p) ? 'De noche' : 'Sobre papel', hint: isLight(p) ? 'Fondo oscuro con los mismos tonos claros.' : 'Fondo claro con los mismos tonos como tinta.', stops: t.stops, bg: t.bg });
  return out;
}
