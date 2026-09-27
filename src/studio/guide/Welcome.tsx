import { useLayoutEffect, useRef } from 'react';
import { handleFile } from '../files';
import { IClose, IDice } from '../icons';
import { mediaKindOf } from '../media';
import { choiceArt } from './art';
import { PATHS, PATH_IDS } from './paths';
import { closeWelcome, startPath, useGuide } from './state';
import '../css/guide.css';

/** Signpost: the «Guías» button. */
export const IGuide = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M12 3v18M9 21h6M12 5h6.5l2 2.5-2 2.5H12M12 12H5.5l-2 2.5 2 2.5H12" />
  </svg>
);

/**
 * «¿Qué quieres hacer?»: three guided paths and free exploration. A native modal dialog: the page
 * behind is inert, Tab stays inside, Escape closes it and focus goes back where it was.
 */
export function Welcome() {
  const open = useGuide(s => s.welcome);
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // layout effect: the dialog is open in the same frame as the first paint (no flash of the studio)
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      const a = document.activeElement;
      opener.current = a instanceof HTMLElement && a !== document.body ? a : null;
      d.showModal();
      d.querySelector<HTMLElement>('.wl-choice')?.focus();
    } else if (!open && d.open) {
      d.close();
    }
    if (!open) {
      // a path moves focus to the guide itself; otherwise focus returns to where it was
      const back = opener.current;
      opener.current = null;
      if (!useGuide.getState().path && back?.isConnected) back.focus();
    }
  }, [open]);

  // Tab and Shift+Tab wrap around inside the dialog (it never hands focus to the browser's toolbar)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const all = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    if (!all.length) return;
    const first = all[0], last = all[all.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const onDrop = (e: React.DragEvent) => {
    const f = e.dataTransfer.files?.[0];
    e.preventDefault();
    if (!f) return;
    // a photo starts the photo path with it; a recipe, project or session opens as usual
    if (mediaKindOf(f) === 'image') { startPath('foto'); void handleFile(f); } else { closeWelcome('silent'); void handleFile(f); }
  };

  return (
    <dialog
      ref={ref} className="welcome" aria-labelledby="wl-title" aria-describedby="wl-sub"
      // Escape: 'cancel' comes at once, 'close' may come late on a busy page (after a reopen)
      onCancel={() => closeWelcome('close')}
      onClose={() => { if (!ref.current?.open) closeWelcome('close'); }}
      onClick={e => { if (e.target === ref.current) closeWelcome('close'); }}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
    >
      {open && (
        <>
          <div className="wl-head">
            <div className="grow">
              <p className="eyebrow">Monotrama · estudio</p>
              <h2 id="wl-title">¿Qué quieres hacer?</h2>
              <p id="wl-sub">Elige un camino: en cuatro pasos tendrás algo listo para descargar o pegar en tu web. Después, todo sigue abierto para explorar.</p>
            </div>
            <button type="button" className="close" onClick={() => closeWelcome('close')} aria-label="Cerrar"><IClose /></button>
          </div>
          <ul className="wl-choices">
            {PATH_IDS.map(id => (
              <li key={id}>
                <button type="button" className={'wl-choice wl-' + id} onClick={() => startPath(id)} aria-labelledby={`wl-t-${id}`} aria-describedby={`wl-g-${id}`}>
                  <span className="wl-art" aria-hidden="true">{choiceArt(id)}</span>
                  <span className="wl-text">
                    <span className="wl-title" id={`wl-t-${id}`}>{PATHS[id].title}</span>
                    <span className="wl-gets" id={`wl-g-${id}`}>{PATHS[id].gets}</span>
                  </span>
                  <span className="wl-go" aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="wl-foot">
            <button type="button" className="btn wl-free" onClick={() => closeWelcome('explore')}><IDice width={16} /> Explorar libremente</button>
            <p>Todo se hace en tu navegador: nada se sube a ningún servidor. Las guías siguen a mano en «Guías», arriba.</p>
          </div>
        </>
      )}
    </dialog>
  );
}
