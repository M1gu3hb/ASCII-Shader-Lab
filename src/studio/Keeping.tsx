import { useEffect, useId, useRef } from 'react';
import { stopCamera, pauseVideo } from './media';
import { saveSession } from './packages';
import { useStudio } from './store';
import './css/fixes.css';

/**
 * What the studio says when it cannot keep the work: the browser does not let it save (site data
 * blocked, out of space), or another tab took the studio over (tabs.ts).
 */

/** One sentence on why nothing is being kept, for the stage, the collection and the star's toast. */
export function storageProblem(storage: 'ok' | 'unavailable' | 'full'): string {
  if (storage === 'full') return 'El navegador no tiene espacio para Monotrama: lo último que hiciste no se guardó y se pierde al cerrar la pestaña.';
  if (storage === 'unavailable') return 'Este navegador no deja guardar (datos de sitios bloqueados o almacenamiento no disponible): tu historial y tu colección se pierden al cerrar la pestaña.';
  return '';
}

/** Stage note while the browser keeps nothing: the way out is a session file. */
export function StorageNote() {
  const storage = useStudio(s => s.storage);
  if (storage === 'ok') return null;
  return (
    <div className="bm-chip keep-chip" role="status">
      <span className="bm-tag"><i aria-hidden="true" />{storage === 'full' ? 'Sin espacio' : 'Sin guardar'}</span>
      <span className="bm-line">{storageProblem(storage)}</span>
      <span className="bm-acts">
        <button type="button" className="bm-why" onClick={() => void saveSession(true)}>Guardar sesión</button>
      </span>
    </div>
  );
}

/**
 * Another tab has the studio: this one stopped saving and says so, over everything (a modal dialog, so
 * nothing here can be changed and then lost). «Usar aquí» reloads it, which takes the studio back.
 */
export function TabAway() {
  const away = useStudio(s => s.away);
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (!away) return;
    // the other tab may want the camera; a video playing here would only compete for the processor
    stopCamera();
    pauseVideo();
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, [away]);
  if (!away) return null;
  return (
    <dialog ref={ref} className="sheet tab-away" aria-labelledby={id}
      // it must stay: Escape does not close it (and if the browser closes it anyway, it opens again)
      onCancel={e => e.preventDefault()} onClose={() => ref.current?.showModal()}>
      <div className="sheet-body">
        <h2 id={id}>Monotrama sigue en otra pestaña</h2>
        <p>Abriste el estudio en otra pestaña. Para que una no borre lo que guarda la otra, sólo una pestaña a la vez guarda tu historial y tu colección.</p>
        <p>{away.saved
          ? 'Lo que hiciste aquí ya está guardado, y la otra pestaña lo tiene.'
          : 'Esta pestaña no llegó a guardar: lo último que hiciste aquí puede no estar en la otra.'}</p>
        <button type="button" className="btn primary" onClick={() => location.reload()}>Usar aquí</button>
        <p className="note">Esta pestaña se recarga con todo lo guardado, y la otra se detiene.</p>
      </div>
    </dialog>
  );
}
