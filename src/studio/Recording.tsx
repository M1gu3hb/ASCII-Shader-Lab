import { useEffect, useState } from 'react';
import { stopRecording, useRecording } from './exporting';
import './css/fixes.css';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * While the live recording runs, the stage says so and has its stop button: the export sheet that
 * started it closes, so the person can use the cursor on the piece (Exportar → Video y GIF also stops it).
 */
export function RecordingChip() {
  const rec = useRecording(s => s.rec);
  const since = useRecording(s => s.since);
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!rec) return;
    const tick = () => setT(Math.floor((Date.now() - since) / 1000));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [rec, since]);
  // the stage goes away (e.g. to Componentes): nothing left to record, so it is saved as it is
  useEffect(() => () => { void stopRecording('Grabación guardada: al salir del lienzo no queda nada que grabar.'); }, []);
  if (!rec) return null;
  return (
    <div className="bm-chip rec-chip" role="status">
      <span className="bm-tag"><i aria-hidden="true" />Grabando</span>
      <span className="bm-line rec-t">{clock(t)}</span>
      <span className="bm-acts">
        <button type="button" className="bm-why" onClick={() => void stopRecording()}>Detener y guardar</button>
      </span>
    </div>
  );
}
