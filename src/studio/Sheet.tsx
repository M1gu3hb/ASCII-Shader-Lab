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
    <dialog ref={ref} className="sheet" style={wide ? { width: 'min(1040px, calc(100vw - 24px))' } : undefined} onClose={onClose}
      onClick={e => { if (e.target === ref.current) onClose(); }} aria-label={title}>
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
