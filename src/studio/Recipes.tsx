import { useMemo, type CSSProperties } from 'react';
import { spaceById, type SpaceId } from '../random/spaces';
import { presetsFor, type Preset } from './presets';
import { applyRecipe, currentRecipe, setUI, useStudio, type Entry } from './store';
import { IDown, IRecipes } from './icons';
import { useMatch } from './ui/useMatch';
import { setSnap, useSheet } from './ui/sheetSnap';

/**
 * «Recetas»: the space's starting points, in a zone that folds away. Folded, it is one line that says
 * which recipe the piece comes from (and whether it was edited since); unfolded, the recipes as chips.
 * Folded by default where room is short (touch screens, phones, short windows); the person's choice is
 * kept. The same zone heads the settings column and, on phones, the settings sheet (its head row).
 * (A browser of every recipe, with categories and search, can open from here.)
 */

/** Recipes that count as «the one the piece comes from»: chosen from the list or opened with a space. */
const FROM_RECIPE = ['espacio', 'receta', 'inicio'];

/** The recipe the current piece comes from, if any. */
function chosenOf(presets: Preset[], e: Entry | undefined): Preset | undefined {
  return e && FROM_RECIPE.includes(e.kind) ? presets.find(p => p.name === e.label) : undefined;
}

/** Each recipe's colours as a small swatch (its own palette, not the current piece's). */
export function useSwatches(space: SpaceId): Map<string, string> {
  return useMemo(() => new Map(presetsFor(space).map(p => {
    const r = p.make();
    const stops = r.color.stops;
    return [p.id, `linear-gradient(135deg, ${r.color.bg} 0 42%, ${stops[Math.floor(stops.length / 2)] ?? r.color.bg} 42% 70%, ${stops[stops.length - 1] ?? r.color.bg} 70%)`];
  })), [space]);
}

/**
 * Whether the zone is unfolded. The column: the person's choice, else folded where room is short. The
 * sheet (phones, tablets upright): the recipes take the place of the controls while they are open, until
 * a group is chosen (never open by default there).
 */
export function useRecipesOpen(sheet = false): boolean {
  const want = useStudio(s => s.ui.recipes);
  const inSheet = useStudio(s => !!s.ui.recipesSheet);
  const short = useMatch('(pointer: coarse), (max-width: 900px), (max-height: 700px)');
  if (sheet) return inSheet;
  return want ? want === 'open' : !short;
}

export const RECIPES_LIST_ID = 'rz-list';

/** The zone's head: «Recetas», the recipe of the piece, how many there are, and the fold. */
export function RecipesToggle({ sheet }: { sheet?: boolean }) {
  const space = useStudio(s => s.space);
  const entry = useStudio(s => s.entries[s.cursor]);
  const open = useRecipesOpen(sheet);
  const compact = sheet;
  const presets = presetsFor(space);
  const sw = useSwatches(space);
  const chosen = chosenOf(presets, entry);
  const edited = !!chosen && !!entry?.edited;
  const say = chosen ? `${chosen.name}${edited ? ', editada' : ''}` : 'ninguna elegida';
  return (
    <button type="button" className={'rz-head' + (compact ? ' rz-compact' : '')} aria-expanded={open} aria-controls={open ? RECIPES_LIST_ID : undefined}
      aria-label={`Recetas de ${spaceById(space).name}: ${say}`}
      title={open ? 'Plegar las recetas' : `Ver las ${presets.length} recetas de ${spaceById(space).name}`}
      onClick={() => {
        if (!sheet) { setUI({ recipes: open ? 'closed' : 'open' }); return; }
        setUI({ recipesSheet: !open });
        // at the peek the controls' room is closed: the recipes need it
        if (!open && useSheet.getState().snap === 'peek') setSnap('half');
      }}>
      <IRecipes className="rz-ic" aria-hidden="true" />
      <span className="rz-txt">
        <span className="rz-k">Recetas</span>
        <span className="rz-cur">
          {chosen
            ? <><i className="chip-sw" style={{ background: sw.get(chosen.id) }} /><span className="rz-name">{chosen.name}</span>{edited && <em className="rz-ed">editada</em>}</>
            : <span className="rz-name rz-none">ninguna</span>}
        </span>
      </span>
      {!compact && <span className="rz-n" aria-hidden="true">{String(presets.length).padStart(2, '0')}</span>}
      <IDown className="rz-caret" aria-hidden="true" />
    </button>
  );
}

/**
 * The recipes themselves (when the zone is unfolded): one tap applies one (it can be undone). In the sheet
 * they fill the controls' room, with a line that says what a recipe does.
 */
export function RecipesList({ sheet, away }: { sheet?: boolean; away?: boolean }) {
  const space = useStudio(s => s.space);
  const entry = useStudio(s => s.entries[s.cursor]);
  const open = useRecipesOpen(sheet);
  const presets = presetsFor(space);
  const sw = useSwatches(space);
  if (!open) return null;
  const name = spaceById(space).name;
  const list = (
    <div id={sheet ? undefined : RECIPES_LIST_ID} className="recipes rz-list" role="group" aria-label={`Recetas de ${name}`}>
      {presets.map(p => {
        const on = !!entry && entry.label === p.name && !entry.edited && FROM_RECIPE.includes(entry.kind);
        return (
          // the recipe the piece already is: nothing to do (a second copy in the history, and no visible change)
          <button key={p.id} type="button" className="chip" aria-pressed={on}
            onClick={() => { if (!on) applyRecipe(p.make(currentRecipe()), 'receta', p.name); }}>
            <span className="chip-sw" aria-hidden="true" style={{ background: sw.get(p.id) } as CSSProperties} />{p.name}
          </button>
        );
      })}
    </div>
  );
  if (!sheet) return list;
  return (
    // (at the sheet's peek it is out of sight: out of the focus order too)
    <div className="pane rz-pane" id={RECIPES_LIST_ID} inert={away || undefined}>
      <p className="note">Puntos de partida de {name}: cambian la pieza entera (se puede deshacer). Elige una sección para volver a los ajustes.</p>
      {list}
    </div>
  );
}
