import { patternById } from '../engine/catalog';
import type { Recipe } from '../engine/recipe';
import { familyById } from '../families/registry';
import { familyLayer } from '../families/recipes';
import type { Archetype } from './archetypes';
import type { Rng } from './prng';
import type { SpaceId } from './spaces';

/*
 * Generator version 6: version 5's pieces, plus, now and then, a visual family as the lead layer
 * (src/families: simulations, structures and 3D science) with one of its presets. Its own stream ('familia'),
 * so every other decision of a roll is the same kind of decision as in version 5. Frozen once published: a
 * later change is version 7 (the list below is not the registry, so a new family never changes these rolls).
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
  const meta = familyById(rng.pick(FAMILIES_V6));
  if (!meta) return false;
  const pr = rng.pick(meta.presets);
  const lead = familyLayer(meta, `azar-${Math.floor(rng.next() * 1e6)}`, pr.id);
  const second = r.layers[1];
  const keep = second && second.on && !familyById(second.pattern) && patternById(second.pattern).cost <= 2 && rng.chance(0.4);
  r.layers = keep ? [lead, { ...second, mix: Math.round(second.mix * 0.6 * 100) / 100 }] : [lead];
  if (!meta.caps.loop) r.motion.loop = 0;
  r.motion.warp = 0;
  return true;
}
