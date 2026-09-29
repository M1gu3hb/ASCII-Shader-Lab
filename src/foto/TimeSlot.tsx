/**
 * The slot of the «Línea de tiempo» under the viewport. The timeline itself (keys, clips, segments) is
 * another lane's component (src/foto/timeline, mounted here when it arrives). Until then, a project with
 * time (a video, an animation) gets a plain scrubber: play/pause and the playhead, drawn by the viewport's
 * preview provider. Stills have no slot at all.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { setTime, useProject } from '../project/store';
import { IPause, IPlay } from '../studio/icons';
import { setUI, useFoto } from './ui';

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export function TimeSlot() {
  const duration = useProject(s => s.project?.time.duration ?? 0);
  const loop = useProject(s => s.project?.time.loop ?? true);
  const time = useProject(s => s.time);
  const playing = useFoto(s => s.playing);
  const [open, setOpen] = useState(true);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing || duration <= 0) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let t = useProject.getState().time + dt;
      if (t >= duration) { if (loop) t %= duration; else { t = duration; setUI({ playing: false }); } }
      setTime(t);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, duration, loop]);
  useEffect(() => () => setUI({ playing: false }), []);
  if (duration <= 0) return null;
  return (
    <section className={'ftl' + (open ? ' open' : '')} aria-label="Línea de tiempo">
      <button type="button" className="ftl-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>Línea de tiempo</button>
      {open && (
        <div className="ftl-body">
          <button type="button" className="ib" onClick={() => setUI({ playing: !playing })} aria-label={playing ? 'Pausar' : 'Reproducir'}>{playing ? <IPause /> : <IPlay />}</button>
          <input type="range" min={0} max={duration} step={0.01} value={time} aria-label="Posición en el tiempo" aria-valuetext={`${fmt(time)} de ${fmt(duration)}`}
            onChange={e => { setUI({ playing: false }); setTime(parseFloat(e.target.value)); }} style={{ '--p': `${(time / duration) * 100}%` } as CSSProperties} />
          <output className="ftl-t">{fmt(time)} / {fmt(duration)}</output>
          <span className="ftl-note">Vista previa del video; la exportación de video llega en la próxima versión.</span>
        </div>
      )}
    </section>
  );
}
