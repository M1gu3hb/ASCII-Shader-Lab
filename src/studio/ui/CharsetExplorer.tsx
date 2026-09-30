import { useEffect, useMemo, useState } from 'react';
import { CHARSETS, charsetIdOf } from '../../engine/catalog';
import { cloneRecipe } from '../../engine/recipe';
import { edit, useRecipe } from '../store';
import { useRamps } from './ramps';
import { renderCrops } from '../guide/thumbs';
import './charset-explorer.css';

const PAGE_SIZE = 8;
type Filter = 'todos' | 'ascii' | 'unicode' | 'mios';

/** Renders the *same piece* through competing glyph ramps, with one undoable choice. */
export function CharsetExplorer({ asciiOnly }: { asciiOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('todos');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const recipe = useRecipe();
  const mine = useRamps(s => s.list);
  const options = useMemo(() => [
    ...CHARSETS.map(c => ({ id: c.id, name: c.name, chars: c.chars, ascii: c.ascii, own: false })),
    ...mine.map(c => ({ id: 'ramp:' + c.id, name: c.name, chars: c.chars, ascii: /^[\x20-\x7e]*$/.test(c.chars), own: true })),
  ], [mine]);
  const shown = useMemo(() => options.filter(c => {
    if (asciiOnly && !c.ascii) return false;
    if (filter === 'ascii' && !c.ascii) return false;
    if (filter === 'unicode' && c.ascii) return false;
    if (filter === 'mios' && !c.own) return false;
    return (c.name + ' ' + c.chars).toLowerCase().includes(query.toLowerCase().trim());
  }), [options, asciiOnly, filter, query]);
  const end = Math.max(0, Math.ceil(shown.length / PAGE_SIZE) - 1);
  const visible = shown.slice(Math.min(page, end) * PAGE_SIZE, (Math.min(page, end) + 1) * PAGE_SIZE);
  // A change of the selected ramp does not invalidate the alternatives' previews.
  const baseKey = useMemo(() => {
    if (!recipe) return '';
    const base = cloneRecipe(recipe);
    base.glyph.charset = '';
    return JSON.stringify(base);
  }, [recipe]);
  const [images, setImages] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (!open || !baseKey || !visible.length) return;
    const sig = { cancelled: false };
    const recipes = visible.map(c => {
      const r = JSON.parse(baseKey);
      r.glyph.charset = c.chars;
      return r;
    });
    setImages({});
    const timer = setTimeout(() => renderCrops(recipes, { w: 160, h: 112, zoom: 0.75 }, (i, url) => {
      if (!sig.cancelled) setImages(current => ({ ...current, [visible[i].id]: url }));
    }, sig), 100);
    return () => { sig.cancelled = true; clearTimeout(timer); };
  // The visible IDs and base recipe determine all renders; refresh captures the latest video frame.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, baseKey, visible.map(c => c.id).join('|'), refresh]);
  const cur = recipe?.glyph.charset;
  return <section className="charset-explorer" aria-label="Explorador visual de alfabetos">
    <button type="button" className="charset-explorer-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? 'Cerrar comparador' : 'Comparar alfabetos sobre mi pieza'}
    </button>
    {open && <>
      <p className="note">La misma escena con caracteres diferentes. Toca una variante para aplicarla; puedes deshacer el cambio.</p>
      <div className="charset-explorer-tools">
        <input type="search" aria-label="Buscar un juego de caracteres" value={query} placeholder="Buscar caracteres…" onChange={e => { setQuery(e.target.value); setPage(0); }} />
        <select aria-label="Filtrar caracteres" value={filter} onChange={e => { setFilter(e.target.value as Filter); setPage(0); }}>
          <option value="todos">Todos</option><option value="ascii">ASCII puro</option>
          {!asciiOnly && <option value="unicode">Símbolos Unicode</option>}
          <option value="mios">Mis rampas</option>
        </select>
        <button type="button" title="Actualizar la vista, útil para video o cámara" onClick={() => setRefresh(n => n + 1)}>↻</button>
      </div>
      <div className="charset-explorer-grid" role="group" aria-label="Comparación de juegos">
        {visible.map(c => <button type="button" key={c.id} aria-pressed={cur === c.chars}
          onClick={() => edit(r => { r.glyph.charset = c.chars; }, 'glyph.charset:explore:' + Date.now())}>
          <span className="charset-explorer-image" style={{ background: recipe?.color.bg }}>
            {images[c.id] ? <img alt="" src={images[c.id]!} /> : <span aria-hidden="true" className="charset-explorer-fallback" style={{ color: recipe?.color.stops.at(-1) }}>{[...c.chars].filter(Boolean).slice(-14).join('')}</span>}
          </span>
          <strong>{c.name}</strong><small>{c.ascii ? 'ASCII' : 'Unicode'} · {[...c.chars].slice(0, 12).join('')}</small>
        </button>)}
      </div>
      {!shown.length && <p className="note">No hay alfabetos con esos filtros.</p>}
      {shown.length > PAGE_SIZE && <div className="charset-explorer-pages">
        <button type="button" disabled={page === 0} onClick={() => setPage(n => n - 1)}>Anterior</button>
        <span>{Math.min(page, end) + 1} / {end + 1}</span>
        <button type="button" disabled={page >= end} onClick={() => setPage(n => n + 1)}>Siguiente</button>
      </div>}
      <small className="charset-explorer-current">Actual: {options.find(c => c.chars === cur)?.name ?? (cur && charsetIdOf(cur) === 'custom' ? 'Personalizado' : '—')}</small>
    </>}
  </section>;
}
