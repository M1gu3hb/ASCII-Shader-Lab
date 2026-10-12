/*
 * The generator's versions, apart from the generator itself: the studio's first view needs to know them (a
 * link's «gen»), while the dice load on first use (studio/store.ts).
 */
/**
 * Bump when the generator changes: stored recipes stay exact, only seeds re-roll differently. The previous
 * versions stay reachable (a seed plus its version always gives the same piece): see GEN_VERSIONS.
 *   1 — the first dice (12 styles, 3 solids).
 *   2 — 13 solids spread over the styles, «Grabado 3D», flatter weights; 3D objects only as the lead
 *       layer, framed, and not under a photo or inside letters (unless the chosen style has nothing else).
 *   3 — the same pieces as 2 (same seed, same streams), plus: transformations of the photo or the letters
 *       (Imagen, sometimes Tipo), letters that move (Tipo) and animated messages (Tipo, Terminal).
 *   4 — the same pieces as 3; only the brand word a «words» fill may pick is the new name (GLYPHOS),
 *       so a seed noted with version 3 still gives «MONOTRAMA ·» there.
 *   5 — new pieces (gen5.ts): the pattern library (fields, solids, particle motions, character sets, letter
 *       animations), nineteen styles (v5.ts: Partículas, Curvas, Calma, Cartel and Escenas are new), palettes
 *       that keep their colour (palettes5.ts: the gallery's forty by mood, vivid, duotone, poster, pastel, greys
 *       with an accent…), pieces that start from a composed scene, and words without the old name.
 *   6 — version 5's pieces from their own streams, plus visual families (src/families) as the lead layer now
 *       and then in Arte, Fondos and Terminal, with one of their presets (families6.ts).
 *   7 — version 5's pieces from their own streams, plus visual families chosen by use and look (families7.ts):
 *       in every space that has them (Fondos, Arte, Terminal, Texto inside the words, Imagen over the photo),
 *       with the families and presets of PR #10's review, colour families in their own colour, and now and then
 *       glass in front of the piece (rain on the window, fluted glass).
 */
export const GEN_VERSION = 7;
/** Every version generate() can still reproduce, oldest first. */
export const GEN_VERSIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
/** A version asked for by a link or a person: a known one, else the current one. */
export const genOf = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && GEN_VERSIONS.includes(n) ? n : GEN_VERSION;
};
