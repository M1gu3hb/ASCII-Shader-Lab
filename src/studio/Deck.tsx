import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ARCHETYPES, archById } from '../random/archetypes';
import { LOCK_GROUPS, LOCK_NAMES, spaceById } from '../random/spaces';
import { IDice, IExplore, ILock, INext, IPrev, IRedo, ISliders, ISpark, IStar, IUndo, IUnlock, ITune as ISlidersH } from './icons';
import {
  back, canRedo, canUndo, forward, go, redo, restoreOrigin, rollDice, saveFavorite, setAmount, setArch, setUI, toggleLock, undo,
  useStudio, vary, type Entry,
} from './store';
import { announce, toast } from './toast';
import { setAuto, useLive } from './live';
import { historyLabel } from './history';
import { shareLink } from './ShareSheet';
import { HoldCompare } from './guide/HoldCompare';

export function dice() {
  const e = rollDice();
  const s = useStudio.getState();
  announce(`Resultado ${s.cursor + 1}: ${e.seed?.replace(/-/g, ' ') ?? ''}, estilo ${archById(e.arch)?.name ?? ''}`);
}

export function favorite() {
  const s = useStudio.getState();
  const e = s.entries[s.cursor];
  const had = !!e?.favId;
  const f = saveFavorite();
  if (f) toast(had ? `Actualizado en tu colección: «${f.name}»` : `Guardado en tu colección: «${f.name}»`, { label: 'Ver', run: () => setUI({ sheet: 'collection' }) });
}

/** Copies a link to the current piece (pieces with a local image or video ask first: the file does not travel). */
export async function copyLink() {
  const s = useStudio.getState();
  const e = s.entries[s.cursor];
  if (!e) return;
  await shareLink(e.recipe, e.space);
}

export function Deck() {
  const entries = useStudio(s => s.entries);
  const cursor = useStudio(s => s.cursor);
  const e = entries[cursor];
  const favs = useStudio(s => s.favorites);
  const favIds = useMemo(() => new Set(favs.map(f => f.id)), [favs]);
  const fav = !!e?.favId && favIds.has(e.favId);
  const [pop, setPop] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const panel = useStudio(s => s.ui.panel);
  const limit = useStudio(s => s.histLimit);
  const counter = historyLabel(entries.length, limit);

  useEffect(() => {
    const el = strip.current?.querySelector('[aria-current="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [cursor, entries.length]);

  return (
    <>
      <SeedLine e={e} n={cursor + 1} total={entries.length} />
      <div className="deck" role="region" aria-label="Azar e historial">
        <div className="nav">
          <button type="button" onClick={back} disabled={cursor <= 0} aria-label="Resultado anterior (←)" title="Anterior (←)"><IPrev /></button>
          <button type="button" onClick={forward} aria-label={cursor < entries.length - 1 ? 'Resultado siguiente (→)' : 'Nuevo resultado al azar (→)'} title={cursor < entries.length - 1 ? 'Siguiente (→)' : 'Nuevo al azar (→)'}><INext /></button>
        </div>
        <div className="strip" ref={strip} role="list" aria-label={counter} title={counter}>
          {entries.map((x, i) => <Thumb key={x.id} e={x} i={i} current={i === cursor} fav={!!x.favId && favIds.has(x.favId)} />)}
        </div>
        <div className="acts">
          <button type="button" className="act" onClick={() => vary()} title="Variación del resultado actual (V)" aria-label="Variar"><ISpark /><span className="lbl">Variar</span></button>
          <button type="button" className="act hide-md" onClick={() => setUI({ sheet: 'explore' })} title="Explorar variaciones (X)" aria-label="Explorar variaciones"><IExplore /></button>
          <button type="button" className="act fav" aria-pressed={fav} onClick={favorite} title="Guardar en la colección (S)" aria-label={fav ? 'Actualizar en la colección' : 'Guardar en la colección'}><IStar filled={fav} /></button>
          <button type="button" className="act dice" onClick={dice} title="Nueva combinación al azar (R)"><IDice /><span className="lbl">Azar</span><kbd>R</kbd></button>
          <div style={{ position: 'relative' }}>
            <button type="button" className="act" aria-expanded={pop} aria-pressed={pop} onClick={() => setPop(!pop)} title="Cómo tira el dado" aria-label="Ajustes del azar"><ISliders /></button>
            {pop && <DicePop onClose={() => setPop(false)} />}
          </div>
          <button type="button" className="act mobile-only" aria-pressed={panel} onClick={() => setUI({ panel: !panel })} aria-label="Ajustes de la pieza"><ISlidersH /></button>
        </div>
      </div>
    </>
  );
}

/** One observer per strip: which thumbnails are within a few widths of its visible part. */
const nearWatchers = new WeakMap<Element, { io: IntersectionObserver; cbs: Map<Element, () => void> }>();

function watchNear(el: Element, onNear: () => void): () => void {
  const root = el.parentElement;
  if (!root || typeof IntersectionObserver === 'undefined') { onNear(); return () => undefined; }
  let w = nearWatchers.get(root);
  if (!w) {
    const cbs = new Map<Element, () => void>();
    const io = new IntersectionObserver(es => {
      for (const x of es) if (x.isIntersecting) { cbs.get(x.target)?.(); cbs.delete(x.target); io.unobserve(x.target); }
    }, { root, rootMargin: '0px 400px' });
    w = { io, cbs };
    nearWatchers.set(root, w);
  }
  const { io, cbs } = w;
  cbs.set(el, onNear);
  io.observe(el);
  return () => { cbs.delete(el); io.unobserve(el); };
}

/**
 * Memoised: with up to a thousand results, an edit re-renders only the thumbnail that changed. Each
 * picture (an inline data URL) is set once the thumbnail comes near the visible part of the strip:
 * setting a thousand of them at load took most of a second on a phone-speed CPU.
 */
const Thumb = memo(function Thumb({ e, i, current, fav }: { e: Entry; i: number; current: boolean; fav: boolean }) {
  const label = `${i + 1}. ${e.label ?? e.seed?.replace(/-/g, ' ') ?? e.kind}${e.edited ? ', editado' : ''}${fav ? ', en la colección' : ''}`;
  const ref = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => (near || !ref.current ? undefined : watchNear(ref.current, () => setNear(true))), [near]);
  return (
    <button
      ref={ref} type="button" role="listitem" className="thumb" aria-current={current} aria-label={label} title={label}
      style={near && e.thumb ? { backgroundImage: `url(${e.thumb})` } : undefined}
      onClick={() => go(i)}
    >
      <span className="n">{i + 1}</span>
      {fav && <span className="star">★</span>}
      {e.edited && <span className="dot" />}
    </button>
  );
});

function SeedLine({ e, n, total }: { e?: Entry; n: number; total: number }) {
  useStudio(s => s.undoTick);
  if (!e) return null;
  const arch = archById(e.arch)?.name;
  const title = e.seed ? e.seed : e.label ?? spaceById(e.space).name;
  return (
    <div className="seedline" role="status" aria-live="off">
      <span>N.º <b>{n}</b>/{total}</span>
      <span className="sep">·</span>
      <b className="ell" title={e.kind === 'variación' ? 'Variación de ' + title : title}>{e.kind === 'variación' ? '≈ ' : ''}{title}</b>
      {arch && <><span className="sep arch">·</span><span className="arch">{arch}</span></>}
      {e.edited && <><span className="sep">·</span><span>editado</span></>}
      <button type="button" onClick={undo} disabled={!canUndo()} aria-label="Deshacer (Ctrl+Z)" title="Deshacer (Ctrl+Z)"><IUndo width={13} height={13} /></button>
      <button type="button" onClick={redo} disabled={!canRedo()} aria-label="Rehacer (Ctrl+Mayús+Z)" title="Rehacer"><IRedo width={13} height={13} /></button>
      {e.edited && <HoldCompare origin={e.origin} />}
      {e.edited && <button type="button" onClick={restoreOrigin} title="Volver al resultado tal como salió (se puede deshacer)">restaurar</button>}
      <button type="button" onClick={() => void copyLink()} title="Copiar un enlace a esta pieza">enlace</button>
      <button type="button" onClick={() => setUI({ sheet: 'seed' })} title="Escribir una semilla">semilla</button>
    </div>
  );
}

function DicePop({ onClose }: { onClose: () => void }) {
  const locks = useStudio(s => s.locks);
  const arch = useStudio(s => s.arch);
  const amount = useStudio(s => s.amount);
  const space = useStudio(s => s.space);
  const auto = useLive(s => s.auto);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (ev: MouseEvent) => { if (ref.current && !ref.current.contains(ev.target as Node) && !(ev.target as HTMLElement).closest('[aria-label="Ajustes del azar"]')) onClose(); };
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('pointerdown', h); document.removeEventListener('keydown', k); };
  }, [onClose]);
  const pool = Object.keys(spaceById(space).archs);
  return (
    <div className="pop" ref={ref} role="dialog" aria-label="Ajustes del azar">
      <h3>Bloquear al tirar</h3>
      <div className="locks">
        {LOCK_GROUPS.map(g => (
          <button key={g} type="button" aria-pressed={locks.includes(g)} onClick={() => toggleLock(g)}>
            {locks.includes(g) ? <ILock /> : <IUnlock />}{LOCK_NAMES[g]}
          </button>
        ))}
      </div>
      <h3>Estilo del azar</h3>
      <div className="ctl">
        <select aria-label="Estilo del azar" value={arch ?? ''} onChange={e => setArch(e.target.value || null)} style={{ gridColumn: '1 / -1' }}>
          <option value="">Cualquiera (según el espacio)</option>
          {ARCHETYPES.filter(a => pool.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name} — {a.blurb}</option>)}
          <optgroup label="Otros estilos">
            {ARCHETYPES.filter(a => !pool.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </optgroup>
        </select>
      </div>
      <h3>Variar</h3>
      <div className="ctl">
        <span className="lbl">Intensidad de la variación</span>
        <output>{amount < 0.25 ? 'sutil' : amount < 0.6 ? 'media' : 'salvaje'}</output>
        <input type="range" min={0.05} max={1} step={0.01} value={amount} onChange={e => setAmount(parseFloat(e.target.value))} style={{ '--p': ((amount - 0.05) / 0.95) * 100 + '%' } as React.CSSProperties} aria-label="Intensidad de la variación" />
      </div>
      <button type="button" className="btn" onClick={() => { onClose(); setUI({ sheet: 'explore' }); }}><IExplore width={16} /> Explorar ocho variaciones</button>
      <h3>Modo exposición</h3>
      <div className="seg" role="group" aria-label="Tirar solo cada" style={{ marginBottom: 8 }}>
        {[0, 5, 10, 20, 40].map(n => <button key={n} type="button" aria-pressed={auto === n} onClick={() => setAuto(n)}>{n ? n + ' s' : 'No'}</button>)}
      </div>
      <p className="note">El dado tira solo. Pulsa <b>H</b> para ocultar la interfaz y dejar la pieza a pantalla completa.</p>
      <p className="note" style={{ margin: 0 }}>Cada resultado tiene una semilla: la misma semilla, en el mismo espacio y estilo, repite exactamente la pieza. El dado evita combinaciones que ya viste.</p>
    </div>
  );
}
