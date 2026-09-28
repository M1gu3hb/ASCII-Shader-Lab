import { useEffect, useRef, useState } from 'react';
import { useCaps } from './caps';
import { getEngine } from './engineBridge';
import { offscreenActive } from './offscreen';
import { IClose } from './icons';
import { QUALITIES, setQuality, usePreview, type Quality } from './preview';
import { useStudio } from './store';
import { announce } from './toast';
import './css/azar.css';
import { useScramble } from './motion/hooks';

/**
 * Preview quality, next to the frame-rate readout in the top bar: how the stage draws (resolution, frame
 * rate, costly screen effects), never what the recipe says or what exports render. And, when frames stay
 * slow for a few seconds, a notice that offers to lower it before the stage looks stuck.
 */

const IGauge = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
    <path d="M4.5 17a8 8 0 1 1 15 0" /><path d="M12 13.5 16 9" /><circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

const nameOf = (q: Quality) => QUALITIES.find(x => x.id === q)?.name ?? 'Auto';

export function QualityReadout() {
  const stats = useStudio(s => s.stats);
  const playing = useStudio(s => s.playing);
  const quality = usePreview(s => s.quality);
  const [open, setOpen] = useState(false);
  const lbl = useScramble<HTMLSpanElement>(nameOf(quality));
  const btn = useRef<HTMLButtonElement>(null);
  const close = (focus = true) => { setOpen(false); if (focus) btn.current?.focus(); };
  return (
    <div className="q-wrap">
      <button
        ref={btn} type="button" className="ib ghost q-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}
        // the name stays still: the frame rate changes twice a second, and a focused control whose name
        // changes is read out again each time (the readout is for the eye)
        aria-label={`Calidad de la vista previa: ${nameOf(quality)}`}
        title="Calidad de la vista previa (no cambia lo que exportas)"
      >
        <IGauge />
        <i className={'q-live' + (playing ? ' on' : '')} aria-hidden="true" />
        <span className="stats">{stats.cols}×{stats.rows} · {stats.fps} fps</span>
        <span className="q-lbl" ref={lbl}>{nameOf(quality)}</span>
      </button>
      {open && <QualityPop onClose={close} />}
    </div>
  );
}

function QualityPop({ onClose }: { onClose: (focus?: boolean) => void }) {
  const quality = usePreview(s => s.quality);
  const kind = useCaps(s => s.renderer);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
    const down = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement;
      if (ref.current && !ref.current.contains(t) && !t.closest('.q-btn')) onClose(false);
    };
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key, true); };
  }, [onClose]);
  return (
    <div className="pop q-pop" ref={ref} role="dialog" aria-label="Calidad de la vista previa">
      <h3 id="q-h">Calidad de la vista previa</h3>
      <div className="q-list" role="group" aria-labelledby="q-h">
        {QUALITIES.map(q => (
          <button key={q.id} type="button" aria-pressed={quality === q.id} onClick={() => { setQuality(q.id); announce(`Calidad de la vista previa: ${q.name}`); }}>
            <b>{q.name}</b><span>{q.blurb}</span>
          </button>
        ))}
      </div>
      <p className="note">
        Sólo cambia cómo se ve aquí. La receta no cambia y lo que exportas sale con la calidad completa.
        {kind === 'basic' ? ' Ahora dibuja el motor básico (sin WebGL), más lento.' : ''}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Slow frames                                                         */
/* ------------------------------------------------------------------ */

/** The notice was answered in this tab (lowered, or «Ahora no»): the next suggestion may come. */
let answered = false;
/** Other hints about slowness (e.g. trying the basic engine) wait until this one had its turn. */
export const slowNoticeAnswered = () => answered || usePreview.getState().quality === 'ligera';

/** Seconds of slow frames before the notice shows. */
const SLOW_SECONDS = 4;

/**
 * Shows once per tab when the stage stays under ~24 fps (12 for the basic engine, which caps itself at
 * 30) for a few seconds while playing, visible and not in a transition, unless the quality is already
 * «Ligera».
 */
export function SlowNotice() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (answered) return;
    const since = performance.now();
    let low = 0;
    return useStudio.subscribe((st, prev) => {
      if (st.stats === prev.stats || answered) return;
      const e = getEngine();
      const q = usePreview.getState().quality;
      // not while a new piece gets ready, a transition runs or thumbnails are being made: those pass
      if (!e || !st.playing || document.hidden || st.ui.sheet !== 'none' || e.busy || offscreenActive() || q === 'ligera' || performance.now() - since < 5000) { low = 0; return; }
      const limit = e.kind === 'basic' ? 12 : 24;
      low = st.stats.fps > 0 && st.stats.fps < limit ? low + 1 : 0;
      // stats come twice a second
      if (low >= SLOW_SECONDS * 2) setFps(st.stats.fps);
    });
  }, []);
  if (!fps || answered) return null;
  const done = () => { answered = true; setFps(0); };
  return (
    <div className="bm-chip q-slow" role="status">
      <span className="bm-tag"><i aria-hidden="true" />{fps} fps</span>
      <span className="bm-line">La vista previa va lenta en este equipo. Bajar su calidad la hace más fluida; tu pieza y lo que exportes no cambian.</span>
      <span className="bm-acts">
        <button type="button" className="bm-why q-lower" onClick={() => { setQuality('ligera'); announce('Calidad de la vista previa: Ligera. Puedes cambiarla junto a los fps.'); done(); }}>Bajar calidad</button>
        <button type="button" className="bm-x" onClick={done} aria-label="Ahora no" title="Ahora no"><IClose /></button>
      </span>
    </div>
  );
}
