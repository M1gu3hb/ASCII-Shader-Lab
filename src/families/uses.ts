import type { FamilyGroup, FamilyMeta, FamilyPreset, PresetUse } from './types';

/**
 * Where a family preset is offered in the library (and where the dice of version 7 draw it): its `uses`; a
 * preset that names none goes where its family's group suggests. The recipe browser (studio/recipes/catalog.ts)
 * and scripts/azar7-data.ts read this one rule.
 */
const GROUP_USE: Record<FamilyGroup, PresetUse> = {
  vida: 'arte/organicas', fisica: 'arte/organicas', forma: 'arte/geometricas', ciencia: 'arte/figuras', materia: 'fondos/color',
};
export const usesOf = (f: FamilyMeta, pr: FamilyPreset): readonly PresetUse[] => (pr.uses?.length ? pr.uses : [GROUP_USE[f.group]]);
