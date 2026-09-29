/**
 * A small player for the extras' sheets (sequences, parallax): the project drawn by the same compositor as
 * the viewport, with play, play backwards (a real reverse: the frames in the other order), pause, stop and a
 * scrubber. It uses the timeline's playback clock (src/foto/timeline/clock.ts) on its own playhead, so the
 * studio's playhead does not move; nothing runs while it is paused.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Project } from '../../project/types';
import { createClock, type PlaybackState } from '../timeline/clock';
import { IBack, IPause, IPlay, IStop } from './icons';
import { renderPreview } from './render';

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

export function Player({ project, width = 420, label, onTime }: { project: Project | null; width?: number; label: string; onTime?: (t: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const pRef = useRef(project);
  pRef.current = project;
  const [st, setSt] = useState<PlaybackState>({ playing: false, rate: 1, region: null });
  const duration = project?.time.duration ?? 0;
  const clock = useMemo(() => createClock({
    get: () => tRef.current,
    set: v => { tRef.current = v; setT(v); },
    duration: () => pRef.current?.time.duration ?? 0,
    loop: () => pRef.current?.time.loop ?? true,
    // the preview draws at most 12 frames a second (it is a guide; the export uses the project's rate)
    fps: () => Math.min(12, pRef.current?.time.fps ?? 12),
  }), []);
  useEffect(() => clock.subscribe(setSt), [clock]);
  useEffect(() => () => clock.dispose(), [clock]);
  useEffect(() => { if (t > duration) { tRef.current = 0; setT(0); } }, [duration]);
  useEffect(() => {
    onTime?.(t);
    const c = canvas.current;
    if (c && project) void renderPreview(project, c, width, t, { light: st.playing });
  }, [project, t, width, st.playing]);
  const play = (rate: number) => { if (st.playing && Math.sign(st.rate) === Math.sign(rate)) clock.pause(); else clock.play(rate); };
  const aspect = project ? `${project.canvas.w} / ${project.canvas.h}` : '4 / 3';
  return (
    <figure className="xpl" aria-label={label}>
      <div className="xpl-frame" style={{ aspectRatio: aspect, maxWidth: width } as CSSProperties}>
        <canvas ref={canvas} role="img" aria-label={`${label}: ${fmt(t)}`} data-time={t.toFixed(3)} />
      </div>
      <div className="xpl-bar" role="group" aria-label="Reproducción">
        <button type="button" className="ib" onClick={() => play(-1)} aria-pressed={st.playing && st.rate < 0} aria-label={st.playing && st.rate < 0 ? 'Pausar' : 'Reproducir al revés'} title="Al revés">
          {st.playing && st.rate < 0 ? <IPause /> : <IBack />}
        </button>
        <button type="button" className="ib" onClick={() => play(1)} aria-pressed={st.playing && st.rate > 0} aria-label={st.playing && st.rate > 0 ? 'Pausar' : 'Reproducir'} title="Reproducir">
          {st.playing && st.rate > 0 ? <IPause /> : <IPlay />}
        </button>
        <button type="button" className="ib" onClick={() => clock.stop()} aria-label="Detener y volver al principio" title="Detener"><IStop /></button>
        <input type="range" min={0} max={Math.max(0.01, duration)} step={0.01} value={Math.min(t, duration)} aria-label="Posición" aria-valuetext={`${fmt(t)} de ${fmt(duration)}`}
          onChange={e => { clock.pause(); const v = parseFloat(e.target.value); tRef.current = v; setT(v); }} />
        <output className="xpl-t">{fmt(t)} / {fmt(duration)}</output>
      </div>
    </figure>
  );
}
