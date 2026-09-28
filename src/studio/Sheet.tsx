import { useEffect, useRef, type ReactNode } from 'react';
import { IClose } from './icons';

/**
 * The studio's modal sheet (a <dialog>). Its own module so the sheets that use it can load on demand
 * without pulling the others into the startup bundle.
 */
export function Sheet({ open, title, sub, onClose, children, wide }: { open: boolean; title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={'sheet' + (wide ? ' wide' : '')}
      // Escape: 'cancel' comes at once; 'close' may come late on a busy page, when another sheet (or this
      // one again, reopened at once) may already be open: only a sheet whose dialog really is closed now
      // closes itself
      onCancel={() => { if (open) onClose(); }}
      onClose={() => { if (open && !ref.current?.open) onClose(); }}
      onClick={e => { if (e.target === ref.current) onClose(); }} onKeyDown={e => trapTab(e, ref.current)} aria-label={title}>
      {open && (
        <>
          <div className="sheet-head">
            <div className="grow"><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
            <button type="button" className="close" onClick={onClose} aria-label="Cerrar"><IClose /></button>
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}

/**
 * Tab and Shift+Tab wrap around inside an open sheet: a modal dialog already makes the page behind
 * inert, but past its last control the browser would send focus to its own toolbar.
 */
export function trapTab(e: React.KeyboardEvent, d: HTMLElement | null) {
  if (e.key !== 'Tab' || !d) return;
  const all = [...d.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    // tabIndex -1: roving items of a tab row and scroll chevrons are not Tab stops
    .filter(el => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[inert]'));
  if (!all.length) return;
  const first = all[0], last = all[all.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
