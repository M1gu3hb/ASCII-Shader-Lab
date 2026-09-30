import type { Recipe } from '../engine/recipe';
import { round } from './prng';

/**
 * How bright each pattern's field runs (generator version 5): the median, 95th and 99th percentile of its value
 * over the frame, a few moments and knob settings, measured once with the CPU twin of every pattern
 * (src/engine/basic). Frozen with version 5 (its seeds must keep weaving the same piece): a later change to a
 * pattern does not change this table.
 */
const EXPOSURE5: Record<string, [number, number, number]> = {
  nube: [.5, .99, 1], marmol: [.53, .86, .98], crestas: [.43, .96, 1], fuego: [.4, .99, 1], aurora: [.22, 1, 1],
  causticas: [.37, .81, 1], lava: [.01, 1, 1], celulas: [.16, .68, .87], grietas: [.02, 1, 1],
  dunas: [.34, .63, .79], bruma_lejana: [.27, .62, .68], luciernagas: [.02, .26, .58], bambu: [0, .7, .83],
  estrella_mar: [0, .92, 1], anillos: [.52, 1, 1], cuadros: [.5, 1, 1], rayos: [.41, .91, .99], tablero: [1, 1, 1],
  truchet: [1, 1, 1], hex: [.33, .97, 1], trama: [.88, 1, 1], moire: [.16, .9, .98], rombos: [.51, .99, 1],
  franjas: [.5, 1, 1], caleido: [.46, .9, .98], circuitos: [0, .74, 1], entrelazado: [.17, .76, .87],
  quasicristal: [.5, .91, .94], ondas: [.5, .99, 1], interferencia: [.5, .92, .98], plasma: [.52, .85, 1],
  lissajous: [.23, 1, 1], ecualizador: [0, .83, 1], horizonte: [0, 1, 1], topografia: [.18, 1, 1],
  mareas_lentas: [.5, .93, .98], jardin_zen: [.27, .89, .91], lluvia_mansa: [.02, .44, .69],
  respiracion: [.01, .51, .81], estuario: [.43, .9, .92], campo_flujo: [.21, .88, .89], radar: [0, .47, .79],
  tunel: [.43, .9, .98], espiral: [.5, .99, 1], estrellas: [0, .31, .72], hiper: [0, 1, 1], galaxia: [.06, .69, 1],
  rejilla: [0, 1, 1], dona: [0, .75, .89], esfera: [.01, .71, .87], cubo: [0, .53, .76], nudo: [0, .56, .79],
  poliedro: [0, .51, .66], giroide: [0, .73, .89], moebius: [0, .6, .83], adn: [0, .71, .9], planeta: [0, .67, .82],
  voxeles: [.34, .77, .84], metabolas: [0, .49, .99], engranajes: [0, .64, .69], cristales: [0, .49, .67],
  obelisco: [0, .77, .87], prisma: [0, .67, .89], reloj_arena: [0, .69, .99], simbiosis: [0, .69, .88],
  pendulos: [0, .28, .69], cinta_ola: [0, .26, .81], jade_vivo: [0, .75, .93], caliz: [0, .53, .85],
  medusa: [0, .73, .9], esferas_orbita: [0, .48, .85], julia: [.12, 1, 1], rosa: [0, 1, 1],
  degradado: [.5, .82, .91], mandelbrot: [.29, .72, .98], sierpinski: [.81, 1, 1], filotaxis: [0, .64, .82],
  espirografo: [.03, 1, 1], lemniscata: [.01, .88, .91], superformula: [0, .98, 1], armonografo: [0, .95, 1],
  catenaria: [0, .84, .9], apolonio: [0, 1, 1], flor_armonica: [.01, 1, 1], forma: [.05, .7, .89],
  estrella: [0, .77, .96], latido: [.1, .7, .91], lluvia: [.02, .75, .95], glitch: [.56, 1, 1],
  ruido: [.27, .86, .96], enjambre_vivo: [0, .41, .88], estela_cometas: [0, .42, .78],
  lluvia_ascendente: [.02, .5, .85], orbitas_gemelas: [0, .48, .86], corazon_particulas: [0, .42, .79],
  cardumen_luz: [0, .4, .87], vortice_polvo: [.02, .61, .85], ondas_estelares: [0, .49, .83],
  mariposa_puntos: [.02, .64, .91], nieve_orbital: [.03, .4, .79], floracion_luz: [0, .54, .88],
  constelacion_dinamica: [.01, .38, .75]
};

/**
 * Exposes a version 5 piece for its lead pattern, as a photographer would: sparse fields (particles, curves,
 * 3D objects, stars) are lifted so their brightest glyphs reach the dense end of the palette, instead of a few
 * dim marks in the dark. The style's own contrast (already in `tone.contrast`) is kept, around the lifted
 * median. Fondos is exposed a little lower (it sits under a web page).
 */
export function expose5(r: Recipe, quiet: boolean) {
  const e = EXPOSURE5[r.layers.find(l => l.on)?.pattern ?? ''];
  if (!e) return;
  const [p50, p95, p99] = e;
  // sparse fields (half the frame empty): their usual marks (95th percentile) to .85; the others: their peaks to .97
  const sparse = p50 < 0.1;
  const want = sparse ? (quiet ? 0.72 : 0.85) / Math.max(p95, 0.05) : (quiet ? 0.85 : 0.97) / Math.max(p99, 0.05);
  const k = Math.max(1, Math.min(1.8, want));
  const cs = r.tone.contrast;
  const m = Math.max(0.1, Math.min(0.6, k * p50));
  // l' = cs · (k·l − m) + m, written as the studio's tone: (l − .5)·c + .5 + b
  const c = cs * k;
  r.tone.contrast = round(Math.min(3, c));
  r.tone.bright = round(Math.max(-1, Math.min(1, r.tone.bright + m * (1 - cs) - 0.5 + 0.5 * c)));
  if (sparse) r.tone.gamma = round(Math.min(r.tone.gamma, 0.85));
}

/** Whether a pattern leaves most of the frame empty (particles, curves, 3D objects, stars). */
export const sparse5 = (pattern: string) => (EXPOSURE5[pattern]?.[0] ?? 1) < 0.1;

/** The patterns the table knows (tests). */
export const EXPOSED5 = Object.keys(EXPOSURE5);
