/**
 * «Añadir animación»: the library grouped (entradas, salidas, transformaciones, énfasis, bucles) with
 * animated previews, a search box, and the choreographies (entry + centre + exit). It fills the timeline's
 * area while open; Escape or «Cerrar» closes it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { choreograph, choreosFor, CHOREOS, type Choreo } from '../../anim/choreo';
import { libraryByGroup, type LibraryItem } from '../../anim/library';
import type { Drawable } from '../../project/sources';
import type { LayerKind } from '../../project/types';
import { PreviewScheduler, type PreviewItem } from './previews';
import { bestKind } from './samples';

const KIND_NAMES: Record<LayerKind, string> = { photo: 'foto', ascii: 'ASCII', glyphs: 'caracteres', text: 'texto', shape: 'forma' };

export function LibraryPicker({ kind, onPick, onChoreo, onClose, picture, basic }: {
  /** The kind of the layer the clip goes on (null: every template, each previewed on its best kind). */
  kind: LayerKind | null;
  onPick: (item: LibraryItem) => void;
  onChoreo: (c: Choreo) => void;
  onClose: () => void;
  picture?: () => Drawable | null;
  basic?: boolean;
}) {
  const [tab, setTab] = useState<'plantillas' | 'coreografias'>('plantillas');
  const [q, setQ] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const sched = useRef<PreviewScheduler | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    sched.current = new PreviewScheduler({ root: scroll.current, ...(picture ? { picture } : {}), ...(basic ? { basic } : {}) });
    setReady(true);
    return () => { sched.current?.dispose(); sched.current = null; };
  }, [picture, basic]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return libraryByGroup(kind ?? undefined)
      .map(g => ({ ...g, items: g.items.filter(i => !needle || `${i.name} ${i.blurb} ${i.id}`.toLowerCase().includes(needle)) }))
      .filter(g => g.items.length);
  }, [kind, q]);
  const choreos = kind ? choreosFor(kind) : CHOREOS;
  // a ref that returns its cleanup (React 19): the scheduler forgets the canvas when the card goes
  const preview = (item: PreviewItem) => (c: HTMLCanvasElement | null) => (c && sched.current ? sched.current.register(c, item) : undefined);
  return (
    <div className="tl-lib" role="dialog" aria-modal="false" aria-label="Añadir animación">
      <header>
        <h3>Añadir animación</h3>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" className="tl-btn" aria-selected={tab === 'plantillas'} aria-pressed={tab === 'plantillas'} onClick={() => setTab('plantillas')}>Plantillas</button>
          <button type="button" role="tab" className="tl-btn" aria-selected={tab === 'coreografias'} aria-pressed={tab === 'coreografias'} onClick={() => setTab('coreografias')}>Coreografías</button>
        </div>
        {tab === 'plantillas' && <input className="tl-select" type="search" placeholder="Buscar…" aria-label="Buscar plantillas" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '1 1 140px', minWidth: 0 }} />}
        <span className="tl-spacer" />
        <button type="button" className="tl-btn" onClick={onClose}>Cerrar</button>
      </header>
      <div className="scroll" ref={scroll}>
        {kind && <p className="note">Para la capa seleccionada ({KIND_NAMES[kind]}): solo lo que funciona en ella. Se añade en el cabezal de reproducción.</p>}
        {!kind && <p className="note">Selecciona una capa para ver solo lo que funciona en ella.</p>}
        {ready && tab === 'plantillas' && groups.map(({ group, items }) => (
          <section key={group.id} aria-label={group.name}>
            <h4>{group.name}<small>{group.blurb}</small></h4>
            <div className="cards">
              {items.map(it => (
                <button key={it.id} type="button" className="tl-card" data-template={it.template} data-item={it.id} onClick={() => onPick(it)}>
                  <canvas width={240} height={150} aria-hidden="true" ref={preview({ template: it.template, kind: kind ?? bestKind(it.template), params: it.params, reverse: it.reverse, dur: it.dur })} />
                  <b>{it.name}</b>
                  <span>{it.blurb}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {ready && tab === 'plantillas' && !groups.length && <p className="note">Nada coincide con «{q}».</p>}
        {ready && tab === 'coreografias' && (
          <section aria-label="Coreografías">
            <h4>Coreografías<small>Una entrada, un estado central y una salida, ya colocados.</small></h4>
            <div className="cards">
              {choreos.map(c => {
                const k = kind ?? c.kinds[0];
                const clips = choreograph(c, 0, 6, 0.2);
                return (
                  <button key={c.id} type="button" className="tl-card" data-choreo={c.id} onClick={() => onChoreo(c)}>
                    <canvas width={240} height={150} aria-hidden="true" ref={preview({ template: clips[0]?.template ?? 'foto-a-ascii', kind: k, dur: 6, clips })} />
                    <b>{c.name}</b>
                    <span>{c.blurb}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
