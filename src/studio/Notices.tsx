import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { holdToast, useToasts } from './toast';

/**
 * One place for everything the studio tells you in passing: the stage's notes (recording, slow preview,
 * basic mode, software drawing, storage, reduced motion) and the toasts. A column at the top left of the
 * stage, hanging just under the stage's bar (the view selector and the view's options) wherever that bar
 * ends, so it never covers a control: not the top bar, not the view bar, not the settings, not the dice
 * and the history. The Stage provides the place (useNoticeHost); without a stage (Piezas) the toasts sit
 * under the top bar.
 */

/** The stage's notification area, where the toasts go (null without a stage). */
export const useNoticeHost = create<{ el: HTMLElement | null }>(() => ({ el: null }));

export function Toasts() {
  const list = useToasts(s => s.list);
  const host = useNoticeHost(s => s.el);
  const toasts = (
    <div className="toasts" role="status" aria-live="polite">
      {list.map(t => (
        <div key={t.id} className="toast" onPointerEnter={() => holdToast(t.id, true)} onPointerLeave={() => holdToast(t.id, false)}
          onFocus={() => holdToast(t.id, true)} onBlur={() => holdToast(t.id, false)}>
          <span className="toast-msg">{t.msg}</span>{t.action && <button type="button" onClick={t.action.run}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
  return host ? createPortal(toasts, host) : <div className="notices notices-free">{toasts}</div>;
}

/** The screen-reader-only announcements (announce() in toast.ts): a direct child of the app. */
export function LiveLine() {
  const live = useToasts(s => s.live);
  return <div className="sr-only" aria-live="polite">{live}</div>;
}

/** Height of the notes and toasts in view on the stage (what a card placed under them must clear). */
export function useNoticesHeight(): number {
  const host = useNoticeHost(s => s.el);
  const [h, setH] = useState(0);
  useEffect(() => {
    const area = host?.parentElement;
    if (!area || typeof ResizeObserver === 'undefined') { setH(0); return; }
    const ro = new ResizeObserver(() => setH(area.offsetHeight));
    ro.observe(area);
    setH(area.offsetHeight);
    return () => ro.disconnect();
  }, [host]);
  return h;
}
