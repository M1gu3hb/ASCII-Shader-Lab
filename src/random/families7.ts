import { patternById } from '../engine/catalog';
import { DEFAULT_LAYER, normOptics, type Layer, type Recipe } from '../engine/recipe';
import type { Archetype } from './archetypes';
import { FAMILIES7_DATA } from './families7-data';
import { round, type Rng } from './prng';
import type { SpaceId } from './spaces';

/*
 * Generator version 7 (PR #10 review): version 5's pieces, plus a visual family as the lead layer chosen by use
 * and look, never by mechanism. A roll of a space draws one of the library's sections of that space that has
 * family presets (Fondos: colour, living, matter…; Arte: figures and space, organic, geometric, optical; Texto:
 * a texture inside the words; Imagen: over the photo; Terminal), then one preset of that section, with its own
 * seed. Colour families keep their colour. Now and then, glass in front (rain on the window, fluted glass).
 * Their own streams ('familia', 'vidrio'), so every other decision of a roll is the same kind as in version 5.
 * Frozen once published (families7-data.ts): a later change is version 8.
 */

/** How often a roll of each space starts from a family. */
export const FAMILY_CHANCE7: Record<SpaceId, number> = { arte: 0.24, fondos: 0.2, terminal: 0.12, tipo: 0.1, media: 0.1, componentes: 0 };
/** How often a roll puts glass in front of the piece. */
export const GLASS_CHANCE7: Partial<Record<SpaceId, number>> = { fondos: 0.06, arte: 0.05, media: 0.08 };

type Preset7 = (typeof FAMILIES7_DATA)[number][3][number];
interface Fam7 { id: string; loop: boolean; keys: string[]; presets: Preset7[] }
const FAMILIES7: ReadonlyMap<string, Fam7> = new Map(FAMILIES7_DATA.map(([id, loop, keys, presets]) => [id, { id, loop: loop === 1, keys, presets }]));

/** Per space, its sections (in a fixed order) and the [family, preset] pairs each offers. */
const SECTIONS7: ReadonlyMap<string, ReadonlyArray<[string, ReadonlyArray<[Fam7, Preset7]>]>> = (() => {
  const by = new Map<string, Map<string, Array<[Fam7, Preset7]>>>();
  for (const f of FAMILIES7.values()) for (const pr of f.presets) {
    for (const use of pr[5].split(',').filter(Boolean)) {
      const [space, section] = use.split('/');
      const secs = by.get(space) ?? new Map<string, Array<[Fam7, Preset7]>>();
      by.set(space, secs);
      const list = secs.get(section) ?? [];
      secs.set(section, list);
      list.push([f, pr]);
    }
  }
  return new Map([...by].map(([space, secs]) => [space, [...secs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))]));
})();

/** Whether a family of version 7 keeps «Bucle perfecto» (its frozen word, not the live registry's; undefined if unknown). */
export const familyLoops7 = (id: string): boolean | undefined => FAMILIES7.get(id)?.loop;

/**
 * Makes a family the lead layer of a version-7 roll: a section of the space, then one of its presets. A light
 * second layer of the roll may stay underneath, fainter (not over a photo or inside words). Never with a composed
 * scene. Returns the family's colour strength (0: by brightness) when it did, else null.
 */
export function families7(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, scene: boolean): number | null {
  const chance = FAMILY_CHANCE7[space] ?? 0;
  const sections = SECTIONS7.get(space);
  if (!chance || !sections?.length || scene || A.id === 'escena' || !rng.chance(chance)) return null;
  const [, offered] = rng.pick(sections);
  const [fam, pr] = rng.pick(offered);
  const lead = layer7(fam, pr, `azar-${Math.floor(rng.next() * 1e6)}`);
  const second = r.layers[1];
  const under = space !== 'tipo' && space !== 'media';
  const keep = under && second && second.on && !FAMILIES7.has(second.pattern) && patternById(second.pattern).cost <= 2 && rng.chance(0.4);
  r.layers = keep ? [lead, { ...second, mix: Math.round(second.mix * 0.6 * 100) / 100 }] : [lead];
  if (!fam.loop) r.motion.loop = 0;
  r.motion.warp = 0;
  return pr[6];
}

/**
 * After the source is chosen: a family that leads keeps its colour (colour families), fills the words (Texto)
 * or lies over the picture (Imagen) in a way that keeps them legible.
 */
export function settleFamily7(r: Recipe, space: SpaceId, colour: number) {
  if (colour > 0 && space !== 'media') { r.color.mode = 'source'; r.color.vivid = colour; }
  if (space === 'tipo' && r.source === 'text') { r.media.mix = Math.max(r.media.mix, 0.55); r.media.blend = 'multiply'; }
  if (space === 'media') { r.media.mix = 0.5; r.media.blend = 'screen'; }
}

/** Glass in front of the piece now and then (Fondos, Arte, Imagen): rain on the window or fluted glass. */
export function glass7(r: Recipe, rng: Rng, space: SpaceId) {
  const chance = GLASS_CHANCE7[space] ?? 0;
  if (!chance || !rng.chance(chance)) return;
  const rain = rng.chance(0.55);
  r.optics = normOptics(rain
    ? { kind: 'lluvia', amount: round(rng.range(0.55, 0.85)), scale: round(rng.range(0.8, 1.4)), speed: round(rng.range(0.4, 0.8)), profile: round(rng.range(0.3, 0.7)), shine: round(rng.range(0.4, 0.7)), fog: round(rng.range(0.3, 0.6)) }
    : { kind: 'acanalado', amount: round(rng.range(0.6, 0.95)), scale: round(rng.range(0.7, 1.5)), speed: round(rng.range(0.15, 0.45)), profile: Math.floor(rng.range(0, 5)), shine: round(rng.range(0.3, 0.6)), angle: rng.chance(0.25) ? 90 : 0 });
}

/** A family layer exactly as version 7 makes it. */
function layer7(f: Fam7, pr: Preset7, seed: string): Layer {
  const [, scale, speed, v, res, , , ...values] = pr;
  return {
    ...DEFAULT_LAYER,
    pattern: f.id,
    scale, speed,
    fam: { v, seed, ...(res !== null ? { res } : {}), p: Object.fromEntries(f.keys.map((k, i) => [k, values[i]])) },
  };
}
