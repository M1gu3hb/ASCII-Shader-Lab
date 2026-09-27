import { useEffect, useState } from 'react';
import { explainWebGL, probeWebGL, type GLExplanation, type GLStatus } from '../engine/support';
import { basicRequestedBy, clearBasicRequest, markSeen, preferBasic, seen, useCaps } from './caps';
import { Note } from './controls';
import { getEngine } from './engineBridge';
import { IClose } from './icons';
import { Sheet } from './Sheet';
import { persistNow, useStudio } from './store';
import './css/basic.css';

/**
 * How the stage tells the truth about its engine:
 *  - basic engine: a compact chip («Modo básico» + why, in one sentence) with the full explanation a tap away;
 *  - WebGL on a software rasteriser that is visibly slow: one gentle suggestion to try the basic engine;
 *  - nothing at all can draw: the only dead end left, with the reason.
 */

const CHIP_KEY = 'mt.basic.chip';
const SOFT_KEY = 'mt.basic.softhint';

/** The lost-context case has its own words: WebGL worked, then the GPU went away. */
const LOST: GLExplanation = {
  title: 'WebGL dejó de responder',
  body: 'La tarjeta gráfica o su controlador se reinició y el navegador no devolvió el contexto WebGL. Para no dejarte sin imagen, el estudio pasó al motor básico.',
  steps: [
    'Recarga la página: casi siempre basta para recuperar el motor completo.',
    'Si vuelve a pasar, reinicia el navegador: tras varios errores gráficos algunos navegadores bloquean WebGL hasta reiniciar.',
    'Si ocurre a menudo, actualiza el controlador de la tarjeta gráfica.',
  ],
};

/** One precise sentence for the chip (the sheet has the rest). */
export function chipSentence(gl: GLStatus, lost: boolean): string {
  if (lost) return LOST.title + '.';
  if (gl.reason === 'forced') {
    const by = basicRequestedBy();
    return by === 'url' ? 'Lo pediste con «?motor=basico» en la dirección.' : 'Lo elegiste como preferencia en este navegador.';
  }
  return explainWebGL(gl).title + '.';
}

async function reload(url = location.href) {
  try { await persistNow(); } catch { /* the page still reloads */ }
  if (url === location.href) location.reload(); else location.replace(url);
}

export function EngineNotes() {
  const kind = useCaps(s => s.renderer);
  const gl = useCaps(s => s.gl);
  const lost = useCaps(s => s.lost);
  const [why, setWhy] = useState(false);
  const [hidden, setHidden] = useState(() => seen(CHIP_KEY));
  const hide = () => { markSeen(CHIP_KEY); setHidden(true); };
  return (
    <>
      {kind === 'basic' && !hidden && (
        <div className="bm-chip bm-basic" role="status">
          <span className="bm-tag"><i aria-hidden="true" />Modo básico</span>
          <span className="bm-line">{chipSentence(gl, lost)}</span>
          <span className="bm-acts">
            <button type="button" className="bm-why" onClick={() => setWhy(true)}>¿Por qué?</button>
            <button type="button" className="bm-x" onClick={hide} aria-label="Ocultar el aviso de modo básico" title="Ocultar el aviso hasta que cierres la pestaña"><IClose /></button>
          </span>
        </div>
      )}
      {kind === 'webgl2' && gl.software && gl.reason === 'ok' && <SoftwareHint onWhy={() => setWhy(true)} />}
      <EngineSheet open={why} onClose={() => setWhy(false)} />
    </>
  );
}

/**
 * WebGL works but without the GPU (SwiftShader, llvmpipe…). Only when frames really are slow for a
 * while, and only once in this browser, suggest the basic engine, which may run smoother there.
 */
function SoftwareHint({ onWhy }: { onWhy: () => void }) {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (seen(SOFT_KEY, 'local')) return;
    let slow = 0;
    const id = setInterval(() => {
      const e = getEngine();
      if (!e || e.kind !== 'webgl2' || !useStudio.getState().playing || document.hidden) { slow = 0; return; }
      const f = e.stats.fps;
      slow = f > 0 && f < 20 ? slow + 1 : 0;
      if (slow >= 3) { clearInterval(id); markSeen(SOFT_KEY, 'local'); setFps(f); }
    }, 2000);
    return () => clearInterval(id);
  }, []);
  if (!fps) return null;
  return (
    <div className="bm-chip bm-soft" role="status">
      <span className="bm-line">La pieza va a {fps} fps: tu navegador dibuja WebGL sin la tarjeta gráfica. El modo básico puede ir más fluido.</span>
      <span className="bm-acts">
        <button type="button" className="bm-why" onClick={() => { preferBasic(); void reload(); }}>Usar el modo básico</button>
        <button type="button" className="bm-why" onClick={onWhy}>¿Por qué?</button>
        <button type="button" className="bm-x" onClick={() => setFps(0)} aria-label="Ocultar la sugerencia"><IClose /></button>
      </span>
    </div>
  );
}

/** The full story: why, what changes, how to get the full engine back, and the actions that do it. */
function EngineSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const kind = useCaps(s => s.renderer);
  const gl = useCaps(s => s.gl);
  const lost = useCaps(s => s.lost);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) setMsg(''); }, [open]);
  const basic = kind === 'basic';
  const forced = basic && gl.reason === 'forced';
  const exp = lost ? LOST : explainWebGL(gl);
  const retry = () => {
    setBusy(true);
    const again = probeWebGL({ fresh: true });
    if (again.reason === 'ok') { setMsg('WebGL 2 responde: recargo el estudio con el motor completo…'); void reload(); return; }
    setBusy(false);
    setMsg(`Lo probé de nuevo y sigue igual («${explainWebGL(again).title}»). Sigue los pasos de arriba y vuelve a intentarlo.`);
  };
  const full = () => { setBusy(true); void reload(clearBasicRequest()); };
  return (
    <Sheet open={open} onClose={onClose} title={basic ? 'Modo básico' : 'WebGL por software'} sub={exp.title}>
      <div className="sheet-body bm-sheet">
        <p>{exp.body}</p>
        {gl.renderer && !exp.body.includes(gl.renderer) && <p className="note">Gráficos que ve el navegador: <code>{gl.renderer}</code></p>}
        <h3>{basic ? 'Qué cambia en modo básico' : 'Qué cambia si usas el modo básico'}</h3>
        <ul>
          <li><b>Se ve igual.</b> El motor básico dibuja los mismos patrones, colores y efectos, con el procesador en lugar de la tarjeta gráfica.</li>
          {basic
            ? <li><b>Puede ir más lento.</b> En piezas pesadas baja a 15 fotogramas por segundo. Lo que más cuesta: curvatura CRT, resplandor y celdas muy pequeñas.</li>
            : <li><b>La fluidez depende de la pieza.</b> Frente a WebGL por software puede ir más fluido o no; en las piezas pesadas baja a 15 fotogramas por segundo. Pruébalo: puedes volver al motor completo cuando quieras.</li>}
          <li><b>Las exportaciones salen igual</b> (imagen, vector, texto, GIF), sólo tardan algo más. El video depende además de lo que este navegador sepa codificar: la pestaña «Video y GIF» te lo dice.</li>
          <li><b>El código para tu web</b> usa el motor completo y necesita WebGL 2 en el navegador de quien la visite. Sin WebGL 2, esa persona ve el color de fondo (o tu póster, si lo subes con tu página y pones su URL en «poster»).</li>
        </ul>
        {exp.steps.length > 0 && !forced && (
          <>
            <h3>{basic ? 'Cómo recuperar el motor completo' : 'Cómo usar la tarjeta gráfica'}</h3>
            <ol>{exp.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </>
        )}
        <div className="bm-sheet-acts">
          {forced
            ? <button type="button" className="btn primary" disabled={busy} onClick={full}>{gl.webgl2 ? 'Usar el motor completo' : 'Quitar la preferencia del motor básico'}</button>
            : basic
              ? <button type="button" className="btn primary" disabled={busy} onClick={retry}>Volver a intentar</button>
              : <button type="button" className="btn primary" disabled={busy} onClick={() => { preferBasic(); setBusy(true); void reload(); }}>Usar el modo básico</button>}
          <button type="button" className="btn ghost" onClick={onClose}>Cerrar</button>
        </div>
        {forced && !gl.webgl2 && <p className="note">Este navegador tampoco tiene WebGL 2: sin la preferencia, el estudio seguirá en modo básico hasta que WebGL 2 funcione.</p>}
        <p className="note bm-msg" role="status" aria-live="polite">{msg}</p>
      </div>
    </Sheet>
  );
}

/** The only dead end left: the browser cannot draw on a canvas at all. */
export function StageFatal() {
  const fatal = useCaps(s => s.fatal);
  const again = useCaps(s => s.fatalReload);
  if (!fatal) return null;
  return (
    <div className="fatal" role="alert">
      <div>
        <p>{fatal}</p>
        {again && <button type="button" className="btn primary" style={{ width: 'auto', marginTop: 12 }} onClick={() => void reload()}>Recargar</button>}
      </div>
    </div>
  );
}

/** Effects panel: what costs more when the CPU draws. */
export function BasicFxHint() {
  const basic = useCaps(s => s.renderer === 'basic');
  return basic ? <Note>En modo básico, curvatura CRT y resplandor cuestan más: si va a saltos, bájalos.</Note> : null;
}
