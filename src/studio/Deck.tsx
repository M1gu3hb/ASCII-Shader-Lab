import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { archById } from '../random/archetypes';
import { LOCK_GROUPS, LOCK_NAMES, spaceById } from '../random/spaces';
import {
  IDice, IDownload, IExplore, IGrid, ILink, ILock, IMore, INext, IPrev, IRedo, ISeed, ISliders, ISpark, IStar, IUndo, IUnlock, ITune as ISlidersH,
} from './icons';
import { usePhone } from './ui/useMatch';
import {
  back, canRedo, canUndo, forward, go, redo, restoreOrigin, rollDice, saveFavorite, setAmount, setArch, setUI, toggleLock, undo,
  useStudio, vary, whenSaved, type Entry,
} from './store';
import { saveSession } from './packages';
import { announce, toast } from './toast';
import { setAuto, useLive } from './live';
import { historyLabel, thumbBg } from './history';
import { ShareDockButton, shareLink } from './ShareSheet';
import { HoldCompare } from './guide/HoldCompare';
import { Picker } from './ui/Picker';
import { ScrollRow } from './ui/ScrollRow';
import { useScramble } from './motion/hooks';
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

/**
 * The dice and the history. Wide screens: a deck under the piece (history strip, variations, the dice)
 * with the seed line hanging from it. Phones: a dock at the bottom within reach of the thumb (PhoneDeck).
 */
export function Deck() {
  const phone = usePhone();
  useEffect(() => startThumbs(), []);
  useMoveAnnounce();
  return phone ? <PhoneDeck /> : <DeskDeck />;
}

/** Moving through the history (arrows, thumbnails, ← →) or a new roll of the dice: say where you are. */
function useMoveAnnounce() {
  const cursor = useStudio(s => s.cursor);
  const moved = useStudio(s => (s.change.kind === 'nav' || s.change.kind === 'roll' ? s.change.n : 0));
  const was = useRef(cursor);
  useEffect(() => {
    const s = useStudio.getState();
    const e = s.entries[cursor];
    if (!moved || was.current === cursor || !e) { was.current = cursor; return; }
    was.current = cursor;
    const arch = e.kind === 'azar' ? archById(e.arch)?.name : undefined;
    announce(`Resultado ${cursor + 1} de ${s.entries.length}: ${e.label ?? e.seed?.replace(/-/g, ' ') ?? spaceById(e.space).name}${arch ? `, estilo ${arch}` : ''}${e.edited ? ', editado' : ''}`);
  }, [moved]); // only when the history moves (entries and e are read at that moment)
}

function DeskDeck() {
  const entries = useStudio(s => s.entries);
  const cursor = useStudio(s => s.cursor);
  const e = entries[cursor];
  const favs = useStudio(s => s.favorites);
  const favIds = useMemo(() => new Set(favs.map(f => f.id)), [favs]);
  const fav = !!e?.favId && favIds.has(e.favId);
  const [pop, setPop] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const limit = useStudio(s => s.histLimit);
  const counter = historyLabel(entries.length, limit);

  // the current item comes into view by itself (ScrollRow reveals what is current)
  useStripRange(strip, entries.length);

  return (
    <>
      <SeedLine e={e} n={cursor + 1} total={entries.length} />
      <div className="deck" role="region" aria-label="Azar e historial">
        <div className="nav">
          <button type="button" onClick={back} disabled={cursor <= 0} aria-label="Resultado anterior (←)" title={cursor <= 0 ? 'Estás en el primer resultado' : 'Anterior (←)'}><IPrev /></button>
          <button type="button" onClick={forward} aria-label={cursor < entries.length - 1 ? 'Resultado siguiente (→)' : 'Nuevo resultado al azar (→)'} title={cursor < entries.length - 1 ? 'Siguiente (→)' : 'Nuevo al azar (→)'}><INext /></button>
        </div>
        {/* the history: a row that says when more waits on a side (and scrolls to what is current) */}
        <ScrollRow role="list" className="strip" boxClassName="strip-box" listRef={strip} aria-label={counter} title={counter} more="">
          {entries.map((x, i) => <Thumb key={x.id} e={x} i={i} current={i === cursor} fav={!!x.favId && favIds.has(x.favId)} />)}
        </ScrollRow>
        <div className="acts">
          <button type="button" className="act ghost" onClick={() => vary()} title="Variación del resultado actual (V)" aria-label="Variar"><ISpark /><span className="lbl">Variar</span></button>
          <button type="button" className="act ghost hide-md" onClick={() => setUI({ sheet: 'explore' })} title="Explorar ocho variaciones (X)" aria-label="Explorar variaciones"><IExplore /></button>
          <button type="button" className="act ghost fav" aria-pressed={fav} onClick={() => void favorite()} title={fav ? 'En tu colección: guarda los cambios (S)' : 'Guardar en la colección (S)'} aria-label={fav ? 'Actualizar en la colección' : 'Guardar en la colección'}><IStar filled={fav} /></button>
          <button type="button" className="act dice" onClick={dice} title="Nueva combinación al azar (R)"><IDice /><span className="lbl">Azar</span><kbd>R</kbd></button>
          <div className="pop-anchor">
            <button type="button" className="act ghost" aria-expanded={pop} aria-pressed={pop} onClick={() => setPop(!pop)} title="Cómo tira el dado" aria-label="Ajustes del azar"><ISliders /></button>
            {pop && <DicePop onClose={() => setPop(false)} />}
          </div>
        </div>
      </div>
    </>
  );
}

/** Phones: whether the history strip shows above the dock (off by default: the arrows step through it). */
export const usePhoneDock = create<{ strip: boolean }>(() => ({ strip: false }));

/**
 * Phones: a dock at the bottom, within reach of the thumb. A line with what is on stage (and undo, redo,
 * «ver original», «Más»), then the actions: previous, next, keep, the dice, export and the settings.
 * The settings open as a sheet above it (Panel.tsx), so the dice and the history stay in reach.
 */
function PhoneDeck() {
  const entries = useStudio(s => s.entries);
  const cursor = useStudio(s => s.cursor);
  const e = entries[cursor];
  const favs = useStudio(s => s.favorites);
  const favIds = useMemo(() => new Set(favs.map(f => f.id)), [favs]);
  const fav = !!e?.favId && favIds.has(e.favId);
  const panel = useStudio(s => s.ui.panel);
  const strip = usePhoneDock(s => s.strip);
  const limit = useStudio(s => s.histLimit);
  const counter = historyLabel(entries.length, limit);
  const [pop, setPop] = useState<'none' | 'more' | 'dice'>('none');
  const stripRef = useRef<HTMLDivElement>(null);
  useStripRange(stripRef, strip ? entries.length : 0);
  const last = cursor >= entries.length - 1;
  return (
    <>
      <PhoneSeed e={e} n={cursor + 1} total={entries.length} more={pop === 'more'} onMore={() => setPop(pop === 'more' ? 'none' : 'more')} />
      {strip && (
        <div className="ph-strip" id="ph-strip">
          <ScrollRow role="list" className="strip" boxClassName="strip-box" listRef={stripRef} aria-label={counter} title={counter} more="">
            {entries.map((x, i) => <Thumb key={x.id} e={x} i={i} current={i === cursor} fav={!!x.favId && favIds.has(x.favId)} />)}
          </ScrollRow>
        </div>
      )}
      <div className="deck ph-dock" role="region" aria-label="Azar e historial">
        <div className="nav">
          <button type="button" onClick={back} disabled={cursor <= 0} aria-label="Resultado anterior (←)" title={cursor <= 0 ? 'Estás en el primer resultado' : 'Anterior (←)'}>
            <IPrev /><span className="ph-lbl">Anterior</span>
          </button>
          <button type="button" onClick={forward} aria-label={last ? 'Nuevo resultado al azar (→)' : 'Resultado siguiente (→)'} title={last ? 'Nuevo al azar (→)' : 'Siguiente (→)'}>
            <INext /><span className="ph-lbl">{last ? 'Nuevo' : 'Siguiente'}</span>
          </button>
        </div>
        <button type="button" className="act ghost fav" aria-pressed={fav} onClick={() => void favorite()}
          title={fav ? 'En tu colección: guarda los cambios (S)' : 'Guardar en la colección (S)'} aria-label={fav ? 'Guardada: actualizar en la colección' : 'Guardar en la colección'}>
          <IStar filled={fav} /><span className="ph-lbl">{fav ? 'Guardada' : 'Guardar'}</span>
        </button>
        <button type="button" className="act dice" onClick={dice} title="Nueva combinación al azar (R)"><IDice /><span className="lbl">Azar</span></button>
        <button type="button" className="act ghost ph-export" onClick={() => setUI({ panel: false, sheet: 'export' })} title="Exportar: imagen, video, texto, código… (E)">
          <IDownload /><span className="ph-lbl">Exportar</span>
        </button>
        {/* «Compartir» on phones (lane compartir's one mount point in the dock) */}
        <ShareDockButton />
        <button type="button" className="act ghost ph-tools" aria-pressed={panel} onClick={() => setUI({ panel: !panel })} aria-label="Ajustes de la pieza" title="Ajustes de la pieza: forma, color, glifos…">
          <ISlidersH /><span className="ph-lbl">Ajustes</span>
        </button>
      </div>
      {pop === 'more' && <MorePop e={e} onClose={() => setPop('none')} onDice={() => setPop('dice')} />}
      {pop === 'dice' && <DicePop onClose={() => setPop('none')} focusIn />}
    </>
  );
}

/** Phones: what is on stage, in one line, with undo, redo, «ver original» (while edited) and «Más». */
function PhoneSeed({ e, n, total, more, onMore }: { e?: Entry; n: number; total: number; more: boolean; onMore: () => void }) {
  useStudio(s => s.undoTick);
  const title = !e ? '' : e.seed ? e.seed : e.label ?? spaceById(e.space).name;
  const name = useScramble<HTMLElement>(e ? e.id + '\u0000' + title : null, { duration: 320 });
  if (!e) return null;
  return (
    <div className="seedline ph-seed" role="status" aria-live="off">
      {/* two short lines: the name, then where it is in the history (and whether it was edited) */}
      <span className="seed-info">
        <b className="ell" ref={name} title={e.kind === 'variación' ? 'Variación de ' + title : title}>{e.kind === 'variación' ? '≈ ' : ''}{title}</b>
        <span className="ph-sub"><span className="ph-n">N.º <b>{n}</b>/{total}</span>{e.edited && <span className="ph-ed"> · editado</span>}</span>
      </span>
      {e.edited && <HoldCompare origin={e.origin} compact />}
      <span className="seed-hist">
        <button type="button" onClick={undo} disabled={!canUndo()} aria-label="Deshacer (Ctrl+Z)" title={canUndo() ? 'Deshacer (Ctrl+Z)' : 'Nada que deshacer en este resultado'}><IUndo width={18} height={18} /></button>
        <button type="button" onClick={redo} disabled={!canRedo()} aria-label="Rehacer (Ctrl+Mayús+Z)" title={canRedo() ? 'Rehacer (Ctrl+Mayús+Z)' : 'Nada que rehacer'}><IRedo width={18} height={18} /></button>
      </span>
      <button type="button" className="ph-more-btn" aria-expanded={more} aria-haspopup="dialog" aria-label="Más acciones" title="Más: variar, el dado, el historial, el enlace, la semilla" onClick={onMore}>
        <IMore width={20} height={20} />
      </button>
    </div>
  );
}

/** Phones: what does not fit in the dock, one tap away. */
function MorePop({ e, onClose, onDice }: { e?: Entry; onClose: () => void; onDice: () => void }) {
  const strip = usePhoneDock(s => s.strip);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('button')?.focus(); }, []);
  useEffect(() => {
    const out = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement;
      if (ref.current && !ref.current.contains(t) && !t.closest('.ph-more-btn')) onClose();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      onClose();
      document.querySelector<HTMLElement>('.ph-more-btn')?.focus();
    };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', key, true); };
  }, [onClose]);
  const run = (fn: () => void) => () => { onClose(); fn(); };
  return (
    <div className="pop ph-more" role="dialog" aria-label="Más acciones" ref={ref}>
      <button type="button" onClick={run(() => vary())}><ISpark /><span>Variar<small>otra versión de esta pieza</small></span></button>
      <button type="button" onClick={run(() => setUI({ sheet: 'explore' }))}><IExplore /><span>Explorar ocho variaciones</span></button>
      <button type="button" onClick={onDice}><ISliders /><span>Ajustes del azar<small>bloqueos, estilo, transición</small></span></button>
      <button type="button" aria-pressed={strip} onClick={() => usePhoneDock.setState({ strip: !strip })}><IGrid /><span>Historial en miniaturas<small>{strip ? 'visible sobre el dado' : 'oculto: las flechas lo recorren'}</small></span></button>
      <button type="button" onClick={run(() => void copyLink())}><ILink /><span>Copiar enlace</span></button>
      <button type="button" onClick={run(() => setUI({ sheet: 'seed' }))}><ISeed /><span>Escribir una semilla</span></button>
      {e?.edited && <button type="button" onClick={run(restoreOrigin)}><IUndo /><span>Restaurar el original<small>se puede deshacer</small></span></button>}
    </div>
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
  // the list item wraps the button, so a screen reader hears both «3 de 17» and «botón»
  return (
    <div role="listitem" className="thumb-li">
      <button
        ref={ref} type="button" className="thumb" aria-current={current} aria-label={label} title={label}
        data-prep={preparing || undefined} data-standin={!e.thumb && !!standIn ? true : undefined}
        style={near && pic ? thumbBg(pic) : undefined}
        onClick={() => go(i)}
      >
        <span className="n">{i + 1}</span>
        {fav && <span className="star">★</span>}
        {e.edited && <span className="dot" />}
        {preparing && <span className="prep" aria-hidden="true" />}
      </button>
    </div>
  );
});

function SeedLine({ e, n, total }: { e?: Entry; n: number; total: number }) {
  useStudio(s => s.undoTick);
  const arch = e ? archById(e.arch)?.name : undefined;
  const title = !e ? '' : e.seed ? e.seed : e.label ?? spaceById(e.space).name;
  // a new result's name resolves out of glyphs (its real text is in place all along)
  const name = useScramble<HTMLElement>(e ? e.id + '\u0000' + title : null, { duration: 320 });
  if (!e) return null;
  return (
    <div className="seedline" role="status" aria-live="off">
      {/* one pill on wide screens; on phones, what it is (with undo / redo) and then its actions */}
      <span className="seed-info">
        <span>N.º <b>{n}</b>/{total}</span>
        <span className="sep">·</span>
        <b className="ell" ref={name} title={e.kind === 'variación' ? 'Variación de ' + title : title}>{e.kind === 'variación' ? '≈ ' : ''}{title}</b>
        {arch && <><span className="sep arch">·</span><span className="arch">{arch}</span></>}
        {e.edited && <><span className="sep">·</span><span>editado</span></>}
      </span>
      <span className="seed-hist">
        <button type="button" onClick={undo} disabled={!canUndo()} aria-label="Deshacer (Ctrl+Z)" title={canUndo() ? 'Deshacer (Ctrl+Z)' : 'Nada que deshacer en este resultado'}><IUndo width={13} height={13} /></button>
        <button type="button" onClick={redo} disabled={!canRedo()} aria-label="Rehacer (Ctrl+Mayús+Z)" title={canRedo() ? 'Rehacer (Ctrl+Mayús+Z)' : 'Nada que rehacer'}><IRedo width={13} height={13} /></button>
      </span>
      <span className="seed-acts">
        {e.edited && <HoldCompare origin={e.origin} />}
        {e.edited && <button type="button" onClick={restoreOrigin} title="Volver al resultado tal como salió (se puede deshacer)">restaurar</button>}
        <button type="button" onClick={() => setUI({ sheet: 'seed' })} title="Escribir una semilla">semilla</button>
      </span>
    </div>
  );
}

function DicePop({ onClose, focusIn }: { onClose: () => void; focusIn?: boolean }) {
  const locks = useStudio(s => s.locks);
  const arch = useStudio(s => s.arch);
  const amount = useStudio(s => s.amount);
  const space = useStudio(s => s.space);
  const auto = useLive(s => s.auto);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (ev: MouseEvent) => { if (ref.current && !ref.current.contains(ev.target as Node) && !(ev.target as HTMLElement).closest('[aria-label="Ajustes del azar"]')) onClose(); };
    // Escape closes this, and only this (not the settings sheet under it on a phone)
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('pointerdown', h); document.removeEventListener('keydown', k); };
  }, [onClose]);
  // opened from «Más» (phones), the button that opened it is gone: the focus comes in
  useEffect(() => { if (focusIn) ref.current?.querySelector<HTMLElement>('button')?.focus(); }, [focusIn]);
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
