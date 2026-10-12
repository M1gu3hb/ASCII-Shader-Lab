import { FOLD_KINDS, normFxKind, syncVersion, tidyTail, type FoldKind, type FxKind, type Recipe } from '../../engine/recipe';
import { Seg, Select, useField, type Field } from '../controls';

/**
 * The shape of two effects (recipe.fxKind; closing of PR #10, rows I-22 and I-27): the halo of «Halo de luz»
 * round or anamorphic, and «Grano» as film grain or a still sheet of paper with its folds. Each choice is
 * written through normFxKind (absent when it is the usual one), so older pieces stay as they were.
 */
function fxKindField<K extends keyof FxKind>(k: K, none: string): Field<string> {
  return {
    key: 'fxKind.' + k,
    get: (r: Recipe) => r.fxKind?.[k] ?? none,
    set: (r: Recipe, v) => {
      const next = normFxKind({ ...r.fxKind, [k]: v === none ? undefined : v });
      if (next) r.fxKind = next; else delete r.fxKind;
      tidyTail(r);
      syncVersion(r);
    },
  };
}
const BLOOM_F = fxKindField('bloom', 'redondo');
const GRAIN_F = fxKindField('grain', 'pelicula');
const FOLD_F = fxKindField('fold', 'ninguno');

const FOLD_NAMES: Record<FoldKind, string> = { cuartos: 'En cuatro', carta: 'Carta en tres', diagonal: 'En diagonal', arrugado: 'Arrugado' };
const FOLDS: Array<[string, string]> = [['ninguno', 'Sin pliegues'], ...FOLD_KINDS.map(f => [f, FOLD_NAMES[f]] as [string, string])];

/** Under «Halo de luz»: round or anamorphic (only while there is a halo). */
export function BloomShapeControl() {
  const bloom = useField<number>({ key: 'fx.bloom', get: r => r.fx.bloom, set: () => {} }) ?? 0;
  if (!(bloom > 0)) return null;
  return (
    <Seg f={BLOOM_F} label="Forma del halo" opts={[['redondo', 'Redondo'], ['anamorfico', 'Anamórfico']]}
      desc={{ redondo: 'Un halo que se abre igual hacia todos lados.', anamorfico: 'Como una lente de cine: estela horizontal larga, anillo de desenfoque y el rojo y el azul separados.' }} />
  );
}

/** Under «Grano»: film or paper, and the paper's folds (only while there is grain). */
export function GrainKindControls() {
  const grain = useField<number>({ key: 'fx.grain', get: r => r.fx.grain, set: () => {} }) ?? 0;
  const kind = useField(GRAIN_F);
  if (!(grain > 0)) return null;
  return (
    <>
      <Seg f={GRAIN_F} label="Tipo de grano" opts={[['pelicula', 'Película'], ['papel', 'Papel']]}
        desc={{ pelicula: 'Grano de película que se mueve en cada fotograma.', papel: 'Una hoja de papel quieta: grano fino, fibras y pliegues.' }} />
      {kind === 'papel' && <Select f={FOLD_F} label="Pliegues" opts={FOLDS} minWidth={200} />}
    </>
  );
}
