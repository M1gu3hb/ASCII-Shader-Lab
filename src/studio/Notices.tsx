import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { holdToast, useToasts } from './toast';

/**
 * One place for everything the studio tells you in passing: the stage's notes (recording, slow preview,
 * basic mode, software drawing, storage, reduced motion) and the toasts. A column at the top left of the
 * stage, just under its bar (the view selector and the view's options), so it never covers a control:
 * not the top bar, not the view bar, not the settings, not the dice and the history. The stage places it
 * (--notice-top, --notice-left, --notice-max, set by useStageInsets); without a stage (Piezas) it sits
 * under the top bar.
 */

/** Where the stage's notes go (the Stage portals them here). */
export const useNoticeHost = create<{ el: HTMLElement | null }>(() => ({ el: null }));

export function Notices() {
  const list = useToasts(s => s.list);
  return (
    <div className="notices">
      <div className="notices-stage" ref={el => { if (useNoticeHost.getState().el !== el) useNoticeHost.setState({ el }); }} />
      <div className="toasts" role="status" aria-live="polite">
        {list.map(t => (
          <div key={t.id} className="toast" onPointerEnter={() => holdToast(t.id, true)} onPointerLeave={() => holdToast(t.id, false)}
            onFocus={() => holdToast(t.id, true)} onBlur={() => holdToast(t.id, false)}>
            <span className="toast-msg">{t.msg}</span>{t.action && <button type="button" onClick={t.action.run}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The screen-reader-only announcements (announce() in toast.ts): a direct child of the app. */
export function LiveLine() {
  const live = useToasts(s => s.live);
  return <div className="sr-only" aria-live="polite">{live}</div>;
}

/** Height of the notes and toasts in view (what a card placed under them must clear). */
export function useNoticesHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.notices');
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    setH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);
  return h;
}
