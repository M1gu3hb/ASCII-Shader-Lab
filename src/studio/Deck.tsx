import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { archById } from '../random/archetypes';
import { LOCK_GROUPS, LOCK_NAMES, spaceById } from '../random/spaces';
import { IDice, IExplore, ILock, INext, IPrev, IRedo, ISliders, ISpark, IStar, IUndo, IUnlock, ITune as ISlidersH } from './icons';
import {
  back, canRedo, canUndo, forward, go, redo, restoreOrigin, rollDice, saveFavorite, setAmount, setArch, setUI, toggleLock, undo,
  useStudio, vary, whenSaved, type Entry,
} from './store';
import { saveSession } from './packages';
import { announce, toast } from './toast';
import { setAuto, useLive } from './live';
import { historyLabel, thumbBg } from './history';
import { shareLink } from './ShareSheet';
import { HoldCompare } from './guide/HoldCompare';
import { Picker } from './ui/Picker';
import { archetypeOptions } from './ui/options';
import { setStripRange, startThumbs, useThumbs } from './thumbs';
import { setTransitionChoice, setTransitionPace, usePreview, type TransitionChoice } from './preview';
import { TRANSITIONS } from '../engine/transitions';
import './css/azar.css';

/** A new roll (the Deck announces it, like every move through the history). */
export function dice() {
  rollDice();
}

export async function favorite() {
  const s = useStudio.getState();
  const e = s.entries[s.cursor];
  const had = !!e?.favId;
  const f = saveFavorite();
  if (!f) return;
  // the star is saved at once: say «guardado» only once the browser has kept it
  await whenSaved();
  const storage = useStudio.getState().storage;
  if (storage !== 'ok') {
    toast(`«${f.name}» está en tu colección sólo hasta que cierres la pestaña: ${storage === 'full' ? 'el navegador no tiene espacio para guardarla' : 'este navegador no deja guardar'}. Guarda la sesión para conservarla.`,
      { label: 'Guardar sesión', run: () => void saveSession(true) }, 9000);
    return;
  }
  toast(had ? `Actualizado en tu colección: «${f.name}»` : `Guardado en tu colección: «${f.name}»`, { label: 'Ver', run: () => setUI({ sheet: 'collection' }) });
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
  useEffect(() => startThumbs(), []);
  useStripRange(strip, entries.length);
  // moving through the history (arrows, thumbnails, ← →) or a new roll of the dice: say where you are
  const moved = useStudio(s => (s.change.kind === 'nav' || s.change.kind === 'roll' ? s.change.n : 0));
  const was = useRef(cursor);
  useEffect(() => {
    if (!moved || was.current === cursor || !e) { was.current = cursor; return; }
    was.current = cursor;
    const arch = e.kind === 'azar' ? archById(e.arch)?.name : undefined;
    announce(`Resultado ${cursor + 1} de ${entries.length}: ${e.label ?? e.seed?.replace(/-/g, ' ') ?? spaceById(e.space).name}${arch ? `, estilo ${arch}` : ''}${e.edited ? ', editado' : ''}`);
  }, [moved]); // only when the history moves (entries and e are read at that moment)

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
          <button type="button" className="act fav" aria-pressed={fav} onClick={() => void favorite()} title="Guardar en la colección (S)" aria-label={fav ? 'Actualizar en la colección' : 'Guardar en la colección'}><IStar filled={fav} /></button>
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

/**
 * Tells the thumbnail pipeline which items the strip shows (they are rendered first). Items have one
 * width, so the range comes from the scroll position; measured again on scroll, resize and new entries.
 */
function useStripRange(strip: React.RefObject<HTMLDivElement | null>, count: number) {
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) { setStripRange(0, -1); return; }
      const next = first.nextElementSibling as HTMLElement | null;
      const pitch = next ? next.offsetLeft - first.offsetLeft : first.offsetWidth + 5;
      if (pitch <= 0) return;
      const from = Math.max(0, Math.floor((el.scrollLeft - first.offsetLeft) / pitch));
      const to = Math.min(count - 1, Math.ceil((el.scrollLeft + el.clientWidth - first.offsetLeft) / pitch));
      setStripRange(from, to);
    };
    const soon = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    el.addEventListener('scroll', soon, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(soon) : null;
    ro?.observe(el);
    // smooth scrolling to the current item ends a moment later
    const t = setTimeout(soon, 450);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); el.removeEventListener('scroll', soon); ro?.disconnect(); };
  }, [strip, count]);
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
  const preparing = useThumbs(s => !!s.preparing[e.id]);
  const standIn = useThumbs(s => s.fallback[e.id]);
  const label = `${i + 1}. ${e.label ?? e.seed?.replace(/-/g, ' ') ?? e.kind}${e.edited ? ', editado' : ''}${fav ? ', en la colección' : ''}${preparing ? ', preparando la miniatura' : ''}`;
  const ref = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => (near || !ref.current ? undefined : watchNear(ref.current, () => setNear(true))), [near]);
  const pic = e.thumb ?? standIn;
  return (
    <button
      ref={ref} type="button" role="listitem" className="thumb" aria-current={current} aria-label={label} title={label}
      data-prep={preparing || undefined} data-standin={!e.thumb && !!standIn ? true : undefined}
      style={near && pic ? thumbBg(pic) : undefined}
      onClick={() => go(i)}
    >
      <span className="n">{i + 1}</span>
      {fav && <span className="star">★</span>}
      {e.edited && <span className="dot" />}
      {preparing && <span className="prep" aria-hidden="true" />}
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
      {/* one pill on wide screens; on phones, what it is (with undo / redo) and then its actions */}
      <span className="seed-info">
        <span>N.º <b>{n}</b>/{total}</span>
        <span className="sep">·</span>
        <b className="ell" title={e.kind === 'variación' ? 'Variación de ' + title : title}>{e.kind === 'variación' ? '≈ ' : ''}{title}</b>
        {arch && <><span className="sep arch">·</span><span className="arch">{arch}</span></>}
        {e.edited && <><span className="sep">·</span><span>editado</span></>}
      </span>
      <span className="seed-hist">
        <button type="button" onClick={undo} disabled={!canUndo()} aria-label="Deshacer (Ctrl+Z)" title="Deshacer (Ctrl+Z)"><IUndo width={13} height={13} /></button>
        <button type="button" onClick={redo} disabled={!canRedo()} aria-label="Rehacer (Ctrl+Mayús+Z)" title="Rehacer"><IRedo width={13} height={13} /></button>
      </span>
      <span className="seed-acts">
        {e.edited && <HoldCompare origin={e.origin} />}
        {e.edited && <button type="button" onClick={restoreOrigin} title="Volver al resultado tal como salió (se puede deshacer)">restaurar</button>}
        <button type="button" onClick={() => void copyLink()} title="Copiar un enlace a esta pieza">enlace</button>
        <button type="button" onClick={() => setUI({ sheet: 'seed' })} title="Escribir una semilla">semilla</button>
      </span>
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
      <h3 id="dice-arch-l">Estilo del azar</h3>
      <div className="ctl cx">
        <Picker value={arch ?? ''} label="Estilo del azar" labelId="dice-arch-l" minWidth={280} options={archetypeOptions(pool)} onChange={v => setArch(v || null)} />
      </div>
      <h3>Variar</h3>
      <div className="ctl">
        <span className="lbl">Intensidad de la variación</span>
        <output>{amount < 0.25 ? 'sutil' : amount < 0.6 ? 'media' : 'salvaje'}</output>
        <input type="range" min={0.05} max={1} step={0.01} value={amount} onChange={e => setAmount(parseFloat(e.target.value))} style={{ '--p': ((amount - 0.05) / 0.95) * 100 + '%' } as React.CSSProperties} aria-label="Intensidad de la variación" />
      </div>
      <button type="button" className="btn" onClick={() => { onClose(); setUI({ sheet: 'explore' }); }}><IExplore width={16} /> Explorar ocho variaciones</button>
      <TransitionPick />
      <h3>Modo exposición</h3>
      <div className="seg" role="group" aria-label="Tirar solo cada" style={{ marginBottom: 8 }}>
        {[0, 5, 10, 20, 40].map(n => <button key={n} type="button" aria-pressed={auto === n} onClick={() => setAuto(n)}>{n ? n + ' s' : 'No'}</button>)}
      </div>
      <p className="note">El dado tira solo. Pulsa <b>H</b> para ocultar la interfaz y dejar la pieza a pantalla completa.</p>
      <p className="note" style={{ margin: 0 }}>Cada resultado tiene una semilla: la misma semilla, en el mismo espacio y estilo, repite exactamente la pieza. El dado evita combinaciones que ya viste.</p>
    </div>
  );
}

const TRANSITION_CHOICES: Array<{ id: TransitionChoice; name: string; blurb: string }> = [
  { id: 'auto', name: 'Auto', blurb: 'cambia según lo que pase: el dado, el historial, un espacio nuevo' },
  ...TRANSITIONS.map(t => ({ id: t.id as TransitionChoice, name: t.name, blurb: t.blurb })),
  { id: 'ninguna', name: 'Ninguna', blurb: 'la pieza nueva aparece sin transición' },
];

/** How one piece gives way to the next on stage (a preview matter: nothing of it goes into the recipe). */
function TransitionPick() {
  const choice = usePreview(s => s.transition);
  const pace = usePreview(s => s.pace);
  const reduced = useStudio(s => s.reducedMotion);
  const cur = TRANSITION_CHOICES.find(c => c.id === choice) ?? TRANSITION_CHOICES[0];
  return (
    <>
      <h3 id="tr-h">Transición</h3>
      <div className="seg tr-seg" role="group" aria-labelledby="tr-h">
        {TRANSITION_CHOICES.map(c => (
          <button key={c.id} type="button" aria-pressed={choice === c.id} title={c.blurb} onClick={() => setTransitionChoice(c.id)}>{c.name}</button>
        ))}
      </div>
      <div className="seg tr-pace" role="group" aria-label="Duración de la transición">
        {(['corta', 'normal'] as const).map(p => (
          <button key={p} type="button" aria-pressed={pace === p} disabled={choice === 'ninguna'} onClick={() => setTransitionPace(p)}>{p === 'corta' ? 'Corta' : 'Normal'}</button>
        ))}
      </div>
      <p className="note tr-note" aria-live="polite">
        {reduced ? 'Tu sistema pide menos movimiento: las piezas cambian sin transición.' : `${cur.name}: ${cur.blurb}.`}
      </p>
    </>
  );
}
