import { memo, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { contoursToPathData, glyphContours } from '../compile';
import { CHAR_GROUPS, STATUS_NAMES, cpLabel, emptyGlyph, hasDrawing, parseCodePoint, type Glyph, type GlyphDoc, type GlyphStatus } from '../doc';
import { edit, setCurrent, setPicked, useGlifos } from '../state';

/**
 * The character board: every character of the document by group, with its drawing and its state (vacío,
 * dibujado, propuesto, aceptado, bloqueado). A click opens it in the editor; Shift/Ctrl/⌘-click or Space
 * picks several for actions on a group. Arrow keys move between tiles (one tab stop for the whole grid).
 */

const STATUS_ORDER: GlyphStatus[] = ['vacio', 'dibujado', 'propuesto', 'aceptado', 'bloqueado'];

/** The tile's drawing: an SVG of the glyph's outline (components resolved), y flipped. */
const sameMetrics = (a: GlyphDoc['metrics'], b: GlyphDoc['metrics']) => a === b || (a.asc === b.asc && a.desc === b.desc && a.upm === b.upm && a.cell === b.cell);
// an edit copies the document but shares untouched glyphs: a tile redraws only when its glyph, a glyph it
// uses as a component, or the metrics change
const sameThumb = (a: { doc: GlyphDoc; g: Glyph }, b: { doc: GlyphDoc; g: Glyph }) =>
  a.g === b.g && a.doc.mode === b.doc.mode && sameMetrics(a.doc.metrics, b.doc.metrics) && b.g.components.every(k => a.doc.glyphs[k.of] === b.doc.glyphs[k.of]);

export const GlyphThumb = memo(function GlyphThumb({ doc, g }: { doc: GlyphDoc; g: Glyph }) {
  const m = doc.metrics;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sameThumb decides when this is stale
  const d = useMemo(() => contoursToPathData(glyphContours(doc, g.ch)), [g, doc.glyphs]);
  const w = Math.max(doc.mode === 'ascii' ? m.cell : g.adv, m.upm * 0.3);
  const h = m.asc - m.desc;
  if (!d) return <span className="gl-tile-empty" aria-hidden="true">{g.ch === ' ' ? '␠' : g.ch}</span>;
  return (
    <svg className="gl-tile-svg" viewBox={`0 ${-m.asc} ${w} ${h}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <path d={d} transform="scale(1,-1)" fillRule="nonzero" />
    </svg>
  );
}, sameThumb);

export function Board() {
  const doc = useGlifos(s => s.doc);
  const current = useGlifos(s => s.current);
  const picked = useGlifos(s => s.picked);
  const readOnly = useGlifos(s => s.readOnly);
  const [filter, setFilter] = useState<GlyphStatus | 'todos'>('todos');
  const [adding, setAdding] = useState('');
  const [addErr, setAddErr] = useState('');
  const grid = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    if (!doc) return [];
    const placed = new Set<string>();
    const out: Array<{ id: string; name: string; chars: string[] }> = [];
    for (const g of CHAR_GROUPS) {
      const chars = g.chars.filter(c => doc.glyphs[c] && doc.chars.includes(c));
      chars.forEach(c => placed.add(c));
      if (chars.length) out.push({ id: g.id, name: g.name, chars });
    }
    const own = doc.chars.filter(c => !placed.has(c));
    if (own.length) out.push({ id: 'propios', name: doc.mode === 'ascii' ? 'Símbolos' : 'Otros caracteres', chars: own });
    return out;
  }, [doc]);
  if (!doc) return null;
  const counts = STATUS_ORDER.map(st => [st, doc.chars.filter(c => doc.glyphs[c]?.status === st).length] as const);
  const shown = (c: string) => filter === 'todos' || doc.glyphs[c]?.status === filter;
  const flat = groups.flatMap(g => g.chars.filter(shown));
  const pickSet = new Set(picked);

  const open = (c: string) => setCurrent(c);
  const toggle = (c: string) => setPicked(pickSet.has(c) ? picked.filter(x => x !== c) : [...picked, c]);
  const focusTile = (c: string) => grid.current?.querySelector<HTMLButtonElement>(`[data-ch="${CSS.escape(c)}"]`)?.focus();
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, c: string) => {
    const i = flat.indexOf(c);
    const cols = Math.max(1, Math.round((grid.current?.clientWidth ?? 300) / 62));
    const go = (j: number) => { const t = flat[Math.max(0, Math.min(flat.length - 1, j))]; if (t) { e.preventDefault(); open(t); focusTile(t); } };
    if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === 'ArrowDown') go(i + cols);
    else if (e.key === 'ArrowUp') go(i - cols);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(flat.length - 1);
    else if (e.key === ' ') { e.preventDefault(); toggle(c); }
  };
  const add = () => {
    const r = parseCodePoint(adding);
    if ('error' in r) { setAddErr(r.error); return; }
    if (doc.chars.includes(r.ch)) { setAddErr(`${r.ch} (${cpLabel(r.ch)}) ya está en el tablero.`); open(r.ch); return; }
    edit(d => { d.chars.push(r.ch); d.glyphs[r.ch] = emptyGlyph(r.ch, d); }, `Añadir ${cpLabel(r.ch)}`);
    setAdding(''); setAddErr(''); open(r.ch);
  };
  const pickGroup = (chars: string[]) => {
    const all = chars.every(c => pickSet.has(c));
    setPicked(all ? picked.filter(c => !chars.includes(c)) : [...new Set([...picked, ...chars])]);
  };

  return (
    <section className="gl-board" aria-label="Tablero de caracteres">
      <div className="gl-board-filters" role="group" aria-label="Filtrar por estado">
        <button type="button" className="chip" aria-pressed={filter === 'todos'} onClick={() => setFilter('todos')}>Todos {doc.chars.length}</button>
        {counts.map(([st, n]) => (
          <button key={st} type="button" className="chip" aria-pressed={filter === st} onClick={() => setFilter(filter === st ? 'todos' : st)} disabled={!n && filter !== st}>
            <i className={'dot st-' + st} aria-hidden="true" />{STATUS_NAMES[st]} {n}
          </button>
        ))}
      </div>
      {picked.length > 0 && (
        <p className="gl-picked" role="status">{picked.length} {picked.length === 1 ? 'carácter elegido' : 'caracteres elegidos'} · <button type="button" className="linkish" onClick={() => setPicked([])}>Quitar selección</button></p>
      )}
      <div ref={grid} className="gl-board-groups">
        {groups.map(g => {
          const chars = g.chars.filter(shown);
          if (!chars.length) return null;
          return (
            <div key={g.id} className="gl-group">
              <div className="gl-group-head">
                <h3>{g.name}</h3>
                <button type="button" className="linkish" onClick={() => pickGroup(chars)}>{chars.every(c => pickSet.has(c)) ? 'Soltar grupo' : 'Elegir grupo'}</button>
              </div>
              <div className="gl-tiles" role="grid" aria-label={g.name}>
                {chars.map(c => {
                  const gl = doc.glyphs[c];
                  const st = gl.status;
                  const isCur = c === current;
                  return (
                    <button key={c} type="button" data-ch={c} role="gridcell" tabIndex={isCur || (!current && c === flat[0]) ? 0 : -1}
                      className={'gl-tile st-' + st + (isCur ? ' cur' : '') + (pickSet.has(c) ? ' picked' : '') + (doc.refs.includes(c) ? ' ref' : '')}
                      aria-selected={isCur} aria-label={`${c === ' ' ? 'Espacio' : c}, ${cpLabel(c)}, ${STATUS_NAMES[st]}${hasDrawing(gl) ? '' : ', sin dibujo'}${doc.refs.includes(c) ? ', referencia' : ''}${pickSet.has(c) ? ', elegido' : ''}`}
                      onClick={e => (e.shiftKey || e.ctrlKey || e.metaKey ? toggle(c) : open(c))} onKeyDown={e => onKey(e, c)}>
                      <GlyphThumb doc={doc} g={gl} />
                      <span className="gl-tile-lbl" aria-hidden="true">{c === ' ' ? '␠' : c}</span>
                      <i className={'dot st-' + st} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!flat.length && <p className="note">Ningún carácter en este estado.</p>}
      </div>
      {!readOnly && (
        <form className="gl-add" onSubmit={e => { e.preventDefault(); add(); }}>
          <label className="lbl" htmlFor="gl-add-cp">Añadir un carácter (o su código, p. ej. U+00F1)</label>
          <div className="row">
            <input id="gl-add-cp" className="field" value={adding} onChange={e => { setAdding(e.target.value); setAddErr(''); }} placeholder="ß, ⚡, U+2665…" aria-describedby={addErr ? 'gl-add-err' : undefined} />
            <button type="submit" className="btn small">Añadir</button>
          </div>
          {addErr && <p id="gl-add-err" className="note warn" role="alert">{addErr}</p>}
        </form>
      )}
    </section>
  );
}
