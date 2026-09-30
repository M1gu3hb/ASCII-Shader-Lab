import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { Recipe } from '../../engine/recipe';
import { spaceById, type SpaceId } from '../../random/spaces';
import { IClose, IImage, IStar } from '../icons';
import { useStudio, type Favorite } from '../store';
import { recipeFor, useBase } from './base';
import { ScrollRow } from '../ui/ScrollRow';
import { useMatch } from '../ui/useMatch';
import { CATEGORIES, allItems, filtersOf, itemsOf, lookOf, sectionsOf, type RecipeItem } from './catalog';
import { RecipePic } from './Pic';
import { search } from './search';
import { applyItem, applySaved, itemOfEntry, recentItems, savedIn, setBrowserOpen, setFilter, setQuery, useRecipesUI } from './state';
import './recipes.css';

/**
 * The recipe browser: every recipe and composed scene of the space as pictures, found by section, mood,
 * recent use, the person's saved pieces, or a search (in any space: another space's recipe opens there).
 * One tap applies one (the stage forms it out of glyphs; the piece before stays in the history). It takes
 * the settings' place while it is open: the column's on wide screens (the piece keeps all of its room),
 * the sheet's on phones and tablets held upright.
 *
 * Keys: Tab reaches the search, the filters (one stop: ← → choose) and the pictures (one stop: arrows
 * move in the grid, Home and End jump, Enter or Space apply); Escape clears the search, then closes.
 */

export const BROWSER_ID = 'rx-browser';
/** Phones (upright or on their side): too little height for a search field above the filters. */
const NARROW_Q = '(max-width: 599px), (max-width: 900px) and (max-height: 500px)';

const ISearch = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true" {...p}>
    <circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" />
  </svg>
);

/** A heading and its pictures. `hint`: a line under the heading; `other`: another space's recipes. */
interface Group { id: string; title: string; items: RecipeItem[]; hint?: string; other?: boolean }
type View = { kind: 'search' | 'list' | 'saved'; groups: Group[]; count: number };

export function RecipeBrowser({ away, where }: { away?: boolean; where: 'column' | 'sheet' }) {
  const space = useStudio(s => s.space);
  const entries = useStudio(s => s.entries);
  const entry = useStudio(s => s.entries[s.cursor]);
  const favorites = useStudio(s => s.favorites);
  const query = useRecipesUI(s => s.query);
  const chosen = useRecipesUI(s => s.cat[space]) ?? 'todas';
  const base = useBase(space);
  // phones: the search is a button beside the filters until it is used (the pictures keep the room)
  const narrow = useMatch(NARROW_Q) && where === 'sheet';
  const [finding, setFinding] = useState(false);
  const searching = !narrow || finding || !!query;
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const uid = useId();
  const spaceName = spaceById(space).name;
  const items = useMemo(() => itemsOf(space), [space]);
  const filters = useMemo(() => filtersOf(space), [space]);
  const recents = useMemo(() => recentItems(entries, space), [entries, space]);
  const saved = useMemo(() => savedIn(favorites, space), [favorites, space]);
  const shownItem = itemOfEntry(entry);
  // a filter that has nothing any more (the last saved piece removed) falls back to «Todas»
  const filter: string = (chosen === 'recientes' && !recents.length) || (chosen === 'coleccion' && !saved.length)
    || (chosen !== 'todas' && chosen !== 'recientes' && chosen !== 'coleccion' && !filters.some(f => f.cat.id === chosen)) ? 'todas' : chosen;

  // what the list shows: sections (Todas), one filter, or search results (this space first, then the others)
  const view = useMemo<View>(() => {
    if (query.trim()) {
      const found = search(allItems(), query);
      const here = found.filter(i => i.space === (space === 'componentes' ? 'fondos' : space));
      const there = found.filter(i => !here.includes(i));
      const groups: Group[] = [];
      if (here.length) groups.push({ id: 'aqui', title: `En ${spaceName}`, items: here });
      if (there.length) groups.push({ id: 'otros', title: 'En otros espacios', items: there, other: true });
      return { kind: 'search', groups, count: found.length };
    }
    if (filter === 'todas') return { kind: 'list', groups: sectionsOf(space).map(s => ({ id: s.cat.id, title: s.cat.label, items: s.items })), count: items.length };
    if (filter === 'recientes') return { kind: 'list', groups: [{ id: 'recientes', title: 'Usadas hace poco', items: recents }], count: recents.length };
    if (filter === 'coleccion') return { kind: 'saved', groups: [], count: saved.length };
    const list = items.filter(i => i.cats.includes(filter));
    return { kind: 'list', groups: [{ id: filter, title: CATEGORIES[filter].label, items: list, hint: CATEGORIES[filter].hint }], count: list.length };
  }, [query, filter, space, spaceName, items, recents, saved.length]);

  // the list starts from the top when what it shows changes
  useEffect(() => { scroller.current?.scrollTo(0, 0); }, [space, filter, query]);
  // the search asked for on a phone: its field, ready to type in
  useEffect(() => { if (finding) input.current?.focus(); }, [finding]);

  // the one picture in the Tab order: the piece's own recipe, else the first
  const [active, setActive] = useState<string | null>(null);
  const keys = useMemo(() => view.kind === 'saved' ? saved.map(f => 'fav:' + f.id) : view.groups.flatMap(g => g.items.map(i => i.key)), [view, saved]);
  const activeKey = active && keys.includes(active) ? active : (shownItem && keys.includes(shownItem.key) ? shownItem.key : keys[0]);

  const close = useCallback(() => {
    setBrowserOpen(false);
    // back to what opened it
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.panel .rx-line')?.focus());
  }, []);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query && e.target === input.current) { setQuery(''); return; }
      if (finding && e.target === input.current) { setFinding(false); return; }
      close();
      return;
    }
    const card = (e.target as HTMLElement).closest<HTMLElement>('.rx-card');
    if (!card || !scroller.current) return;
    const to = moveIn(scroller.current, card, e.key);
    if (to === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    if (to) { to.focus(); setActive(to.dataset.key ?? null); }
  };

  const filterRow = (
    <ScrollRow role="radiogroup" aria-label="Qué recetas mostrar" className="rx-cats" boxClassName="rx-cats-box">
      <FilterChip id="todas" label="Todas" n={items.length} on={filter === 'todas'} space={space} />
      {recents.length > 0 && <FilterChip id="recientes" label="Recientes" n={recents.length} on={filter === 'recientes'} space={space} />}
      {saved.length > 0 && <FilterChip id="coleccion" label="Tu colección" n={saved.length} on={filter === 'coleccion'} space={space} star />}
      {filters.map(f => <FilterChip key={f.cat.id} id={f.cat.id} label={f.cat.label} hint={f.cat.hint} n={f.count} on={filter === f.cat.id} space={space} />)}
    </ScrollRow>
  );

  return (
    <section id={BROWSER_ID} className={'rx rx-' + where} aria-label={`Recetas de ${spaceName}`} inert={away || undefined} onKeyDown={onKey}>
      <div className={'rx-tools' + (searching ? '' : ' rx-tools-c')}>
        {searching ? (
          <>
            <label className="rx-search">
              <ISearch className="rx-search-ic" />
              <input ref={input} type="search" value={query} enterKeyHint="search" autoComplete="off" spellCheck={false}
                placeholder="Buscar: 3D, olas, neón, calma…" aria-label="Buscar recetas y escenas (en todos los espacios)"
                aria-describedby={uid + 'n'} onChange={e => setQuery(e.target.value)} />
              {query && (
                <button type="button" className="rx-clear" aria-label="Borrar la búsqueda" onClick={() => { setQuery(''); input.current?.focus(); }}>
                  <IClose width={16} height={16} />
                </button>
              )}
            </label>
            {narrow && <button type="button" className="rx-btn" onClick={() => { setQuery(''); setFinding(false); }}>Listo</button>}
          </>
        ) : (
          <>
            <button type="button" className="rx-find" aria-label="Buscar recetas y escenas" title="Buscar" onClick={() => setFinding(true)}>
              <ISearch className="rx-find-ic" />
            </button>
            {filterRow}
          </>
        )}
      </div>
      {searching && !query.trim() && filterRow}
      <p className="sr-only" id={uid + 'n'} aria-live="polite">
        {query.trim() ? (view.count ? `${view.count} ${view.count === 1 ? 'resultado' : 'resultados'}` : 'Ningún resultado') : ''}
      </p>
      <div className="rx-scroll" ref={scroller}>
        {view.kind === 'saved' ? (
          <SavedGrid list={saved} activeKey={activeKey} root={scroller} onFocusKey={setActive} entryFav={entry?.edited ? undefined : entry?.favId} />
        ) : view.groups.length ? view.groups.map(g => (
          <div key={g.id} className="rx-group" role="group" aria-labelledby={uid + g.id}>
            <h3 className="rx-sec" id={uid + g.id}>
              <span>{g.title}</span><span className="rx-sec-n" aria-hidden="true">{g.items.length}</span>
            </h3>
            {g.hint && <p className="rx-sec-hint">{g.hint}</p>}
            {g.other && <p className="rx-sec-hint">Se abren en su espacio.</p>}
            <ul className="rx-grid" role="list">
              {g.items.map((it, i) => (
                <li key={it.key}>
                  <Card item={it} prio={i} space={space} base={base} root={scroller} other={it.space !== (space === 'componentes' ? 'fondos' : space)} meta={g.id !== it.section}
                    shown={!entry?.edited && shownItem?.key === it.key} from={!!entry?.edited && shownItem?.key === it.key} tab={it.key === activeKey} onFocusKey={setActive} />
                </li>
              ))}
            </ul>
          </div>
        )) : (
          <div className="rx-empty">
            <p>Nada con «{query.trim()}». Prueba con otra palabra: un color, una forma, «3D», «fractal», «tranquila»…</p>
            <button type="button" className="rx-btn" onClick={() => { setQuery(''); input.current?.focus(); }}>Ver todas las recetas de {spaceName}</button>
          </div>
        )}
        <p className="rx-foot">Una receta cambia la pieza entera. La anterior se queda en el historial: vuelve a ella con ← o con su miniatura.</p>
      </div>
    </section>
  );
}

function FilterChip({ id, label, n, on, space, hint, star }: { id: string; label: string; n: number; on: boolean; space: SpaceId; hint?: string; star?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={on} className="rx-chip" title={hint} onClick={() => setFilter(space, id)}>
      {star && <IStar width={13} height={13} filled className="rx-chip-star" />}
      <span>{label}</span><span className="rx-chip-n" aria-hidden="true">{n}</span>
    </button>
  );
}

function Card({ item, prio, space, base, root, shown, from, tab, other, meta, onFocusKey }: {
  item: RecipeItem; prio: number; space: SpaceId; base: Recipe | undefined; root: RefObject<HTMLElement | null>;
  shown: boolean; from: boolean; tab: boolean; other: boolean; onFocusKey: (k: string) => void;
  /** Say its section under its name (where the list is not grouped by section). */
  meta: boolean;
}) {
  const recipe = useMemo(() => recipeFor(item, base, space), [item, base, space]);
  // the catalogue's own picture (not one with the person's photo or words) is kept between visits
  const own = item.space === (space === 'componentes' ? 'fondos' : space) && !!base;
  const where = other ? `, de ${spaceById(item.space).name}` : '';
  const state = shown ? ', la pieza actual' : from ? ', tu pieza viene de aquí (editada)' : '';
  return (
    <button type="button" className={'rx-card' + (from ? ' rx-from' : '')} data-key={item.key} aria-pressed={shown} tabIndex={tab ? 0 : -1}
      aria-label={`${item.name}. ${item.line}${where}${state}`}
      onFocus={() => onFocusKey(item.key)} onClick={() => applyItem(item)}>
      <RecipePic recipe={recipe} look={item.look} prio={prio} root={root} keep={!own} />
      {!recipe && <span className="rx-photo" aria-hidden="true"><IImage width={18} height={18} /><span>con tu foto</span></span>}
      {shown && <span className="rx-now" aria-hidden="true">Actual</span>}
      <span className="rx-name">{item.name}</span>
      {(meta || other) && <span className="rx-meta" aria-hidden="true">{other ? `${spaceById(item.space).name} · ` : ''}{item.line}</span>}
    </button>
  );
}

function SavedGrid({ list, activeKey, root, onFocusKey, entryFav }: {
  list: Favorite[]; activeKey: string | undefined; root: RefObject<HTMLElement | null>; onFocusKey: (k: string) => void; entryFav: string | undefined;
}) {
  return (
    <div className="rx-group" role="group" aria-label="Tu colección">
      <h3 className="rx-sec"><span>Tu colección</span><span className="rx-sec-n" aria-hidden="true">{list.length}</span></h3>
      <p className="rx-sec-hint">Lo que guardaste con ★ en este espacio. Se abre tal como lo guardaste.</p>
      <ul className="rx-grid" role="list">
        {list.map((f, i) => {
          const key = 'fav:' + f.id;
          const shown = entryFav === f.id;
          return (
            <li key={f.id}>
              <button type="button" className="rx-card" data-key={key} aria-pressed={shown} tabIndex={key === activeKey ? 0 : -1}
                aria-label={`${f.name}, de tu colección${shown ? ', la pieza actual' : ''}`} onFocus={() => onFocusKey(key)} onClick={() => applySaved(f)}>
                <RecipePic recipe={f.thumb ? null : f.recipe} thumb={f.thumb} look={lookOf(f.recipe)} prio={i} root={root} />
                {shown && <span className="rx-now" aria-hidden="true">Actual</span>}
                <span className="rx-name">{f.name}</span>
                <span className="rx-meta" aria-hidden="true">Guardada</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}


/**
 * Where an arrow key goes in a grid of pictures laid out by CSS (any number of columns, sections in
 * between): ← → the previous or next card, ↑ ↓ the nearest card of the row above or below, Page ↑ ↓ about
 * a screenful, Home and End the first and the last. Undefined for keys that are not moves, null at an edge.
 */
export function moveIn(box: HTMLElement, from: HTMLElement, key: string): HTMLElement | null | undefined {
  const cards = [...box.querySelectorAll<HTMLElement>('.rx-card')];
  const i = cards.indexOf(from);
  if (i < 0) return undefined;
  switch (key) {
    case 'ArrowRight': return cards[i + 1] ?? null;
    case 'ArrowLeft': return cards[i - 1] ?? null;
    case 'Home': return cards[0];
    case 'End': return cards[cards.length - 1];
    case 'ArrowDown': case 'ArrowUp': case 'PageDown': case 'PageUp': break;
    default: return undefined;
  }
  const down = key === 'ArrowDown' || key === 'PageDown';
  const a = from.getBoundingClientRect();
  const cx = a.left + a.width / 2;
  const rows = cards.map(c => ({ c, r: c.getBoundingClientRect() }))
    .filter(x => (down ? x.r.top > a.top + a.height / 2 : x.r.top < a.top - a.height / 2));
  if (!rows.length) return null;
  // the row to land on: the next one, or (a page) the last one within about a screenful
  let rowTop: number;
  if (key.startsWith('Page')) {
    const reach = Math.max(a.height, box.clientHeight - a.height);
    const within = rows.filter(x => Math.abs(x.r.top - a.top) <= reach);
    const pool = within.length ? within : rows;
    rowTop = down ? Math.max(...pool.map(x => x.r.top)) : Math.min(...pool.map(x => x.r.top));
    if (!within.length) rowTop = down ? Math.min(...rows.map(x => x.r.top)) : Math.max(...rows.map(x => x.r.top));
  } else {
    rowTop = down ? Math.min(...rows.map(x => x.r.top)) : Math.max(...rows.map(x => x.r.top));
  }
  const row = rows.filter(x => Math.abs(x.r.top - rowTop) < a.height / 2);
  row.sort((p, q) => Math.abs(p.r.left + p.r.width / 2 - cx) - Math.abs(q.r.left + q.r.width / 2 - cx));
  return row[0]?.c ?? null;
}
