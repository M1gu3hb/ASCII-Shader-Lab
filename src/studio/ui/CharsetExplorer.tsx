import { useMemo, useState } from 'react';
import { CHARSETS, fontById } from '../../engine/catalog';
import { cloneRecipe, type Recipe } from '../../engine/recipe';
import { RecipePic } from '../recipes/Pic';
import { edit, useRecipe } from '../store';
import { readableGlyphColours } from './options';
import { useRamps } from './ramps';
import './charset-explorer.css';

/**
 * «Caracteres» on the piece: the piece drawn with each character set, side by side, so the choice is made
 * by looking at the result. It is the comparison of the Glifos section's set picker (it opens with its «?»,
 * as every setting's comparison does): the same sets, names and order as the picker, each with a few of
 * its characters as real text; choosing one is the same edit as choosing it in the picker (it can be
 * undone), and the set in use is marked in both.
 *
 * The pictures come from the studio's shared hidden renderer (recipes/previews.ts), zoomed into the
 * middle of the piece so the glyphs can be told apart, one at a time and only those in view.
 */
export interface CharsetExplorerProps { asciiOnly?: boolean }

type Kind = 'todos' | 'ascii' | 'unicode' | 'mios';
const KIND_NAME: Record<Kind, string> = { todos: 'Todos', ascii: 'ASCII', unicode: 'Unicode', mios: 'Tus rampas' };
const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);
/** A few characters of a set as real text: from its middle to its densest (the ones that say most about it). */
export const charsetSample = (chars: string, n = 12) => {
  const solid = [...new Set([...chars])].filter(c => c.trim());
  if (solid.length <= n) return solid.join('');
  return Array.from({ length: n }, (_, i) => solid[Math.round((i / (n - 1)) * (solid.length - 1))]).join('');
};
/** How much of the piece a picture shows: its middle, large enough to tell the glyphs apart. */
const ZOOM = 0.42;

interface Option { id: string; name: string; chars: string; ascii: boolean; own: boolean }

export function CharsetExplorer({ asciiOnly = false }: CharsetExplorerProps) {
  const recipe = useRecipe();
  const mine = useRamps(s => s.list);
  const [kind, setKind] = useState<Kind>('todos');
  const options = useMemo<Option[]>(() => [
    ...CHARSETS.filter(c => !asciiOnly || c.ascii).map(c => ({ id: c.id, name: c.name, chars: c.chars, ascii: c.ascii, own: false })),
    ...mine.filter(r => !asciiOnly || isAscii(r.chars)).map(r => ({ id: 'rampa:' + r.id, name: r.name, chars: r.chars, ascii: isAscii(r.chars), own: true })),
  ], [mine, asciiOnly]);
  const kinds = (['todos', 'ascii', 'unicode', 'mios'] as Kind[]).filter(k => k === 'todos' || options.some(o => pass(o, k)) && options.some(o => !pass(o, k)));
  const on = kinds.includes(kind) ? kind : 'todos';
  const shown = options.filter(o => pass(o, on));
  // the piece without its characters: choosing a set changes none of the other pictures
  const base = useMemo(() => {
    if (!recipe) return '';
    const b = cloneRecipe(recipe);
    b.glyph.charset = '';
    return JSON.stringify(b);
  }, [recipe]);
  const recipes = useMemo(() => shown.map(o => {
    const r = JSON.parse(base || 'null') as Recipe | null;
    if (r) r.glyph.charset = o.chars;
    return r;
  }), [base, shown]);
  if (!recipe) return null;
  const cur = recipe.glyph.charset;
  const font = fontById(recipe.glyph.font);
  const { ink } = readableGlyphColours(recipe);
  return (
    <div className="csx">
      <p className="csx-note">Tu pieza con cada juego de caracteres. Toca uno para usarlo; se puede deshacer.</p>
      {kinds.length > 1 && (
        <div className="csx-kinds" role="radiogroup" aria-label="Qué juegos mostrar">
          {kinds.map(k => (
            <button key={k} type="button" role="radio" aria-checked={on === k} className="csx-kind" onClick={() => setKind(k)}>{KIND_NAME[k]}</button>
          ))}
        </div>
      )}
      <div className="csx-grid" role="group" aria-label="Juegos de caracteres">
        {shown.map((o, i) => {
          const sample = charsetSample(o.chars, 8);
          return (
            <button key={o.id} type="button" className="csx-card" aria-pressed={cur === o.chars} aria-label={`${o.name}: ${sample}`}
              onClick={() => edit(r => { r.glyph.charset = o.chars; }, 'glyph.charset:cmp:' + Date.now())}>
              <RecipePic recipe={recipes[i]} zoom={ZOOM} prio={i} look={{ bg: recipe.color.bg, ink, chars: charsetSample(o.chars, 3) }} />
              <span className="csx-name">{o.name}<small>{o.own ? 'tuya' : o.ascii ? 'ASCII' : 'Unicode'}</small></span>
              <span className="csx-chars" aria-hidden="true" style={{ fontFamily: font.stack }}>{sample}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function pass(o: Option, k: Kind) {
  return k === 'todos' || (k === 'ascii' && o.ascii && !o.own) || (k === 'unicode' && !o.ascii && !o.own) || (k === 'mios' && o.own);
}
