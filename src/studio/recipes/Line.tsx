import { useMemo } from 'react';
import { spaceById } from '../../random/spaces';
import { IDown } from '../icons';
import { useStudio } from '../store';
import { setSnap, useSheet } from '../ui/sheetSnap';
import { recipeFor, useBase } from './base';
import { itemsOf, lookOf } from './catalog';
import { BROWSER_ID } from './Browser';
import { RecipePic } from './Pic';
import { itemOfEntry, setBrowserOpen, useRecipesUI } from './state';

/**
 * The recipe line: which recipe the piece comes from (its picture and name, «editada» once changed), and
 * the way into every recipe of the space. It heads the settings column and, compact, the phone sheet (its
 * handle row); on a phone held sideways it is a cell beside the groups. Pressed, the browser takes the
 * settings' place; pressed again (or Escape), the settings come back.
 */
export function RecipesLine({ compact }: { compact?: boolean }) {
  const space = useStudio(s => s.space);
  const entry = useStudio(s => s.entries[s.cursor]);
  const open = useRecipesUI(s => s.open);
  const count = itemsOf(space).length;
  const item = itemOfEntry(entry);
  const edited = !!item && !!entry?.edited;
  const base = useBase(space);
  // the same picture as its card in the browser (with the person's photo or words where the space keeps them)
  const pic = useMemo(() => (item ? recipeFor(item, base, space) : null), [item, base, space]);
  const name = spaceById(space).name;
  const say = item ? `${item.name}${edited ? ', editada' : ''}` : 'ninguna';
  return (
    <button type="button" className={'rx-line' + (compact ? ' rx-line-c' : '')} aria-expanded={open} aria-controls={open ? BROWSER_ID : undefined}
      aria-label={`Recetas de ${name}: ${say}`} title={open ? 'Volver a los ajustes (Esc)' : `Ver las ${count} recetas y escenas de ${name}`}
      onClick={() => {
        setBrowserOpen(!open);
        // at the sheet's peek the list would be out of sight: it needs the room of the controls
        if (!open && compact && useSheet.getState().snap === 'peek') setSnap('half');
      }}>
      {/* the piece's own picture when it comes from no recipe (the dice, a link, a file) */}
      <RecipePic className="rx-mini" recipe={pic} thumb={!item || !pic ? entry?.thumb : undefined} look={item?.look ?? (entry ? lookOf(entry.recipe) : NO_LOOK)} />
      <span className="rx-lt">
        <span className="rx-k">Receta</span>
        {/* (a phone on its side shows the cell's name instead: the recipe is named in the line at the bottom) */}
        <span className="rx-k rx-k2">Recetas</span>
        <span className="rx-cur">
          {item ? <span className="rx-cur-name">{item.name}</span> : <span className="rx-cur-name rx-none">Ninguna: elige una</span>}
          {edited && <em className="rx-ed">editada</em>}
        </span>
      </span>
      {!compact && <span className="rx-all" aria-hidden="true">{open ? 'Ajustes' : `Ver ${count}`}</span>}
      <IDown className="rx-caret" aria-hidden="true" />
    </button>
  );
}

const NO_LOOK = { bg: 'transparent', ink: 'currentColor', chars: '' };
