import { useEffect, useMemo, useState } from 'react';
import { CHARSETS, charsetIdOf } from '../../engine/catalog';
import { cloneRecipe } from '../../engine/recipe';
import { renderCrops } from '../guide/thumbs';
import { edit, useRecipe } from '../store';
import { useRamps } from './ramps';
import './charset-explorer.css';

/**
 * «Comparar alfabetos» (from the pattern-library branch): the piece on screen drawn with other character sets, side by
 * side, in pages of eight; choosing one is an ordinary edit (it can be undone). Not mounted yet: the lab's
 * panel decides where it goes (e.g. in Glifos, under the character set picker).
 *   <CharsetExplorer asciiOnly={space === 'terminal'} />
 * `asciiOnly` shows only the sets of plain ASCII (Terminal); `defaultOpen` starts it open.
 */
export interface CharsetExplorerProps { asciiOnly?: boolean; defaultOpen?: boolean }

const PAGE = 8;
type Filter = 'todos' | 'ascii' | 'unicode' | 'mios';
const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);
/** A few characters of a set as real text: the densest ones say most about it. */
export const charsetSample = (chars: string, n = 12) => [...chars].filter(c => c !== ' ').slice(-n).join('');

interface Option { id: string; name: string; chars: string; ascii: boolean; own: boolean }

export function CharsetExplorer({ asciiOnly = false, defaultOpen = false }: CharsetExplorerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [filter, setFilter] = useState<Filter>('todos');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [images, setImages] = useState<Record<string, string | null>>({});
  const recipe = useRecipe();
  const mine = useRamps(s => s.list);
  const options = useMemo<Option[]>(() => [
    ...CHARSETS.map(c => ({ id: c.id, name: c.name, chars: c.chars, ascii: c.ascii, own: false })),
    ...mine.map(c => ({ id: 'rampa:' + c.id, name: c.name, chars: c.chars, ascii: isAscii(c.chars), own: true })),
  ], [mine]);
  const shown = useMemo(() => {
    const q = query.toLowerCase().trim();
    return options.filter(c => (!asciiOnly || c.ascii)
      && (filter !== 'ascii' || c.ascii) && (filter !== 'unicode' || !c.ascii) && (filter !== 'mios' || c.own)
      && (c.name + ' ' + c.chars).toLowerCase().includes(q));
  }, [options, asciiOnly, filter, query]);
  const last = Math.max(0, Math.ceil(shown.length / PAGE) - 1);
  const at = Math.min(page, last);
  const visible = shown.slice(at * PAGE, (at + 1) * PAGE);
  const visibleKey = visible.map(c => c.id).join('|');
  // the piece without its character set: choosing another set does not invalidate the others' images
  const baseKey = useMemo(() => {
    if (!recipe) return '';
    const b = cloneRecipe(recipe);
    b.glyph.charset = '';
    return JSON.stringify(b);
  }, [recipe]);

  useEffect(() => {
    if (!open || !baseKey || !visible.length) return;
    const sig = { cancelled: false };
    const list = visible;
    setImages({});
    const timer = window.setTimeout(() => renderCrops(list.map(c => {
      const r = JSON.parse(baseKey);
      r.glyph.charset = c.chars;
      return r;
    }), { w: 160, h: 112, zoom: 0.75 }, (i, url) => {
      if (!sig.cancelled) setImages(cur => ({ ...cur, [list[i].id]: url }));
    }, sig), 100);
    return () => { sig.cancelled = true; clearTimeout(timer); };
    // the visible sets and the piece decide every image; `refresh` takes a new frame of a video or camera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, baseKey, visibleKey, refresh]);

  const cur = recipe?.glyph.charset;
  const curName = options.find(c => c.chars === cur)?.name ?? (cur && charsetIdOf(cur) === 'custom' ? 'Personalizado' : '—');
  return (
    <section className="cx-explorer" aria-label="Comparar alfabetos sobre la pieza">
      <button type="button" className="cx-explorer-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Cerrar el comparador' : 'Comparar alfabetos sobre mi pieza'}
      </button>
      {open && <>
        <p className="cx-explorer-note">Tu pieza con otros caracteres. Toca una variante para usarla; puedes deshacer el cambio.</p>
        <div className="cx-explorer-tools">
          <input type="search" aria-label="Buscar un alfabeto por nombre o carácter" value={query} placeholder="Buscar…" onChange={e => { setQuery(e.target.value); setPage(0); }} />
          <select aria-label="Qué alfabetos mostrar" value={filter} onChange={e => { setFilter(e.target.value as Filter); setPage(0); }}>
            <option value="todos">Todos</option>
            <option value="ascii">ASCII puro</option>
            {!asciiOnly && <option value="unicode">Símbolos Unicode</option>}
            <option value="mios">Mis rampas</option>
          </select>
          <button type="button" aria-label="Volver a dibujar las variantes (útil con video o cámara)" title="Volver a dibujar" onClick={() => setRefresh(n => n + 1)}>↻</button>
        </div>
        <div className="cx-explorer-grid" role="group" aria-label="Variantes de la pieza">
          {visible.map(c => (
            <button type="button" key={c.id} aria-pressed={cur === c.chars} aria-label={`${c.name}: ${charsetSample(c.chars, 8)}`}
              onClick={() => edit(r => { r.glyph.charset = c.chars; }, 'glyph.charset:explorar:' + Date.now())}>
              <span className="cx-explorer-image" style={{ background: recipe?.color.bg }}>
                {images[c.id]
                  ? <img alt="" src={images[c.id]!} />
                  : <span aria-hidden="true" className="cx-explorer-fallback" style={{ color: recipe?.color.stops.at(-1) }}>{charsetSample(c.chars, 14)}</span>}
              </span>
              <strong>{c.name}</strong>
              <small><span className="cx-explorer-kind">{c.ascii ? 'ASCII' : 'Unicode'}</span> <span className="cx-explorer-chars">{charsetSample(c.chars)}</span></small>
            </button>
          ))}
        </div>
        {!shown.length && <p className="cx-explorer-note">No hay alfabetos con esa búsqueda.</p>}
        {shown.length > PAGE && (
          <div className="cx-explorer-pages">
            <button type="button" disabled={at === 0} onClick={() => setPage(at - 1)}>Anterior</button>
            <span aria-live="polite">{at + 1} de {last + 1}</span>
            <button type="button" disabled={at >= last} onClick={() => setPage(at + 1)}>Siguiente</button>
          </div>
        )}
        <small className="cx-explorer-current">Ahora: {curName}</small>
      </>}
    </section>
  );
}
