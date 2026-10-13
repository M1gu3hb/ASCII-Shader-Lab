import { patternById } from '../engine/catalog';
import { DEFAULT_LAYER, type Layer, type Recipe } from '../engine/recipe';
import { isFamily } from '../families/registry';
import type { Archetype } from './archetypes';
import { FAMILIES6_DATA } from './families6-data';
import type { Rng } from './prng';
import type { SpaceId } from './spaces';

/*
 * Generator version 6: version 5's pieces, plus, now and then, a visual family as the lead layer
 * (src/families: simulations, structures and 3D science) with one of its presets. Its own stream ('familia'),
 * so every other decision of a roll is the same kind of decision as in version 5. Frozen once published: a
 * later change is version 7 (the list below is not the registry, so a new family never changes these rolls).
 * Its presets are the published ones too (families6-data.ts): families later gain presets and parameters, and
 * this version keeps drawing exactly what it drew.
 */

/** The families version 6 draws from, in this order (never the live registry). */
export const FAMILIES_V6: readonly string[] = Object.freeze([
  'reaccion_difusion', 'physarum', 'lenia', 'automata', 'kuramoto', 'dla', 'crecimiento',
  'fluido', 'agua', 'erosion', 'boids', 'gravedad', 'tela', 'chladni',
  'sistema_l', 'atractor', 'wfc', 'hiperbolico',
  'fractal_3d', 'nubes_vol', 'orbitales', 'lente_gravitacional', 'campos_em',
]);

/** How often a roll of each space starts from a family (the photo and the words keep their own pieces). */
export const FAMILY_CHANCE6: Partial<Record<SpaceId, number>> = { arte: 0.22, fondos: 0.16, terminal: 0.12 };

/**
 * Makes a family the lead layer of a version-6 roll, with a preset and its own seed; a light second layer of
 * the roll may stay underneath, fainter. Never with a composed scene (its layers are designed together).
 * Returns whether it did.
 */
export function families6(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, scene: boolean): boolean {
  const chance = FAMILY_CHANCE6[space] ?? 0;
  if (!chance || scene || A.id === 'escena' || !rng.chance(chance)) return false;
  const fam = FAMILIES6.get(rng.pick(FAMILIES_V6));
  if (!fam) return false;
  const pr = rng.pick(fam.presets);
  const lead = layer6(fam.id, fam.keys, pr, `azar-${Math.floor(rng.next() * 1e6)}`);
  const second = r.layers[1];
  const keep = second && second.on && !isFamily(second.pattern) && patternById(second.pattern).cost <= 2 && rng.chance(0.4);
  r.layers = keep ? [lead, { ...second, mix: Math.round(second.mix * 0.6 * 100) / 100 }] : [lead];
  if (!fam.loop) r.motion.loop = 0;
  r.motion.warp = 0;
  return true;
}

type Preset6 = (typeof FAMILIES6_DATA)[number][3][number];
const FAMILIES6 = new Map(FAMILIES6_DATA.map(([id, loop, keys, presets]) => [id, { id, loop: loop === 1, keys, presets }]));

/** A family layer exactly as version 6 made it (families/recipes.ts familyLayer of that moment). */
function layer6(id: string, keys: string[], pr: Preset6, seed: string): Layer {
  const [, scale, speed, v, res, ...values] = pr;
  return {
    ...DEFAULT_LAYER,
    pattern: id,
    scale, speed,
    fam: { v, seed, ...(res !== null ? { res } : {}), p: Object.fromEntries(keys.map((k, i) => [k, values[i]])) },
  };
}
