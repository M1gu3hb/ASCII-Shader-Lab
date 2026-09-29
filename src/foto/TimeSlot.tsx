/**
 * The «Línea de tiempo» under the viewport (desktop): the timeline of lane «anim» (src/foto/timeline),
 * loaded on demand, on the studio's playback clock (playback.ts, injectable). Collapsible: open by itself
 * when the project moves (clips, keys, a video), a slim bar otherwise, with play/pause and a line on what
 * the project holds. Its height can be dragged (kept in this browser). On phones the same timeline lives in
 * the tools sheet («Tiempo», compact) and a play button rides with the view tools (PhoneTransport).
 */
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useProject } from '../project/store';
import type { Project } from '../project/types';
import { IPause, IPlay } from '../studio/icons';
import { loadAnim } from './anim';
import { projectMoves, timelineLength, usePlayback, useStudioClock } from './playback';
import { viewCompositor } from './scheduler';
import { say, setUI, useFoto } from './ui';

const Timeline = lazy(() => import('./timeline/index').then(m => ({ default: m.Timeline })));

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const H_KEY = 'glyphos.foto.tiempo.alto';
const H_MIN = 190, H_DEF = 260;

function loadHeight(): number {
  try { const v = Number(localStorage.getItem(H_KEY)); return Number.isFinite(v) && v >= H_MIN ? v : H_DEF; } catch { return H_DEF; }
}

/** The project's photo, small, for the library's animated previews. */
export function previewPicture() {
  const p = useProject.getState().project;
  const src = p?.sources.find(s => s.kind === 'image' || s.kind === 'cutout');
  return src ? viewCompositor().provider.frame(src, 0) : null;
}

/** How many clips and animated properties a project has, in words. */
export function timeSummary(p: Project): string {
  const clips = p.layers.reduce((n, l) => n + l.clips.length, 0);
  const keys = new Set(p.tracks.map(t => `${t.layer}|${t.path}`)).size;
  const video = p.sources.some(s => s.kind === 'video');
  const parts = [
    clips ? `${clips} ${clips === 1 ? 'animación' : 'animaciones'}` : '',
    keys ? `${keys} ${keys === 1 ? 'propiedad con llaves' : 'propiedades con llaves'}` : '',
    video ? 'video' : '',
  ].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} · ${fmt(timelineLength(p))}` : 'Sin animación: elige una capa y pulsa «Animar», o abre la línea de tiempo.';
}

export function TimeSlot() {
  const project = useProject(s => s.project);
  const want = useFoto(s => s.tlOpen);
  const basic = useFoto(s => s.render.basic);
  const clock = useStudioClock();
  const [h, setH] = useState(loadHeight);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const moves = projectMoves(project);
  const open = want ?? moves;
  useEffect(() => { if (open) void loadAnim().catch(() => undefined); }, [open]);
  // the notices float above it
  const box = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--ftl-h', el.offsetHeight + 'px');
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--ftl-h'); };
  }, [!!project]);
  if (!project) return null;
  const resize = {
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, h }; },
    onPointerMove: (e: RPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      const max = Math.round(window.innerHeight * 0.6);
      setH(Math.min(max, Math.max(H_MIN, d.h + (d.y - e.clientY))));
    },
    onPointerUp: () => { drag.current = null; try { localStorage.setItem(H_KEY, String(h)); } catch { /* storage unavailable */ } },
  };
  return (
    <section ref={box} className={'ftl' + (open ? ' open' : '')} aria-label="Línea de tiempo">
      {open && <div className="ftl-grip" aria-hidden="true" {...resize} onPointerCancel={resize.onPointerUp} />}
      <div className="ftl-head">
        <button type="button" className="ftl-toggle" aria-expanded={open} aria-controls="ftl-body" onClick={() => setUI({ tlOpen: !open })}
          title={open ? 'Plegar la línea de tiempo' : 'Abrir la línea de tiempo: clips, llaves y reproducción'}>
          <span className="ftl-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>Línea de tiempo
        </button>
        {!open && <MiniTransport />}
        {!open && <span className="ftl-sum">{timeSummary(project)}</span>}
      </div>
      {open && (
        <div className="ftl-body" id="ftl-body" style={{ height: h }}>
          <Suspense fallback={<p className="note mt-spin ftl-wait">Cargando la línea de tiempo…</p>}>
            <Timeline clock={clock} onSay={s => say(s)} previewPicture={previewPicture} basicPreviews={basic} />
          </Suspense>
        </div>
      )}
    </section>
  );
}

/** Play/pause and the time, for a closed timeline (only when the project moves). */
export function MiniTransport({ phone }: { phone?: boolean }) {
  const project = useProject(s => s.project);
  const clock = useStudioClock();
  const play = usePlayback();
  const time = useProject(s => (phone ? 0 : s.time));
  if (!project || !projectMoves(project)) return null;
  const toggle = () => { void loadAnim().catch(() => undefined); if (play.playing) clock.pause(); else clock.play(Math.abs(play.rate) || 1); };
  return (
    <span className={'ftl-mini' + (phone ? ' phone' : '')}>
      <button type="button" className="ib ghost" onClick={toggle} aria-label={play.playing ? 'Pausar' : 'Reproducir'} aria-pressed={play.playing}
        title={play.playing ? 'Pausar' : 'Reproducir la animación'}>{play.playing ? <IPause /> : <IPlay />}</button>
      {!phone && <output className="ftl-t" aria-label="Tiempo">{fmt(time)} / {fmt(timelineLength(project))}</output>}
    </span>
  );
}

/** The timeline in the phone's sheet («Tiempo»): compact, filling the sheet. */
export function PhoneTimeline() {
  const clock = useStudioClock();
  const basic = useFoto(s => s.render.basic);
  useEffect(() => { void loadAnim().catch(() => undefined); }, []);
  return (
    <div className="ftl-phone">
      <Suspense fallback={<p className="note mt-spin ftl-wait">Cargando la línea de tiempo…</p>}>
        <Timeline compact clock={clock} onSay={s => say(s)} previewPicture={previewPicture} basicPreviews={basic} />
      </Suspense>
    </div>
  );
}
