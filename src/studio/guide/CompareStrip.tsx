import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cloneRecipe } from '../../engine/recipe';
import { F } from '../controls';
import { edit, useRecipe } from '../store';
import { nearestChoice, type Choice } from './paths';
import { renderCrops } from './thumbs';
import '../css/guide.css';

/**
 * Three renders of the current piece with a low, middle and high value of one setting, side by
 * side; pressing one applies it (a normal, undoable edit). Rendered offscreen when shown, cancelled
 * when hidden, cached per recipe.
 */
export function CompareStrip({ path, choices, fmt, zoom = 0.5, label }: {
  path: string; choices: Choice<number>[]; fmt?: (v: number) => string; zoom?: number; label: string;
}) {
  const recipe = useRecipe();
  const f = useMemo(() => F<number>(path), [path]);
  const value = recipe ? f.get(recipe) : undefined;
  // the variants depend on everything but the compared value
  const key = useMemo(() => {
    if (!recipe) return '';
    const r = cloneRecipe(recipe);
    f.set(r, 0);
    return JSON.stringify(r);
  }, [recipe, f]);
  const [urls, setUrls] = useState<Array<string | null | undefined>>([]);
  useEffect(() => {
    if (!key) return;
    const base = JSON.parse(key);
    const recipes = choices.map(c => { const r = cloneRecipe(base); f.set(r, c.value); return r; });
    const sig = { cancelled: false };
    // renders wait for the settings to settle (a slider being dragged elsewhere)
    const t = setTimeout(() => renderCrops(recipes, { w: 192, h: 120, zoom }, (i, url) => {
      if (!sig.cancelled) setUrls(u => { const n = u.slice(); n[i] = url; return n; });
    }, sig), 180);
    return () => { sig.cancelled = true; clearTimeout(t); };
  }, [key, choices, zoom, f]);
  const cur = value === undefined ? -1 : nearestChoice(choices, value);
  return (
    <div className="cmp" role="group" aria-label={label}>
      {choices.map((c, i) => (
        <button
          key={c.label} type="button" className={'cmp-tile' + (urls[i] ? '' : ' wait')} aria-pressed={cur === i}
          style={urls[i] ? { backgroundImage: `url(${urls[i]})` } : undefined}
          onClick={() => edit(r => f.set(r, c.value), `${path}:cmp:${Date.now()}`)}
        >
          <span className="cmp-lbl">{c.label}</span>
          <span className="cmp-val">{fmt ? fmt(c.value) : c.value}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * One short line under a control (what it does and what it costs), with an optional «Comparar»
 * that shows a comparison on demand.
 */
export function Hint({ children, compare, what }: { children: ReactNode; compare?: ReactNode; what?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="hint">
        <p className="note">{children}</p>
        {compare && (
          <button type="button" className="cmp-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Ocultar' : 'Comparar'}<span className="sr-only"> {what}</span>
          </button>
        )}
      </div>
      {compare && open && <div className="hint-cmp">{compare}</div>}
    </>
  );
}
