import { useEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';
import '../css/immersive.css';

/**
 * «Inmersivo»: only the piece, and a small bar with what you use most (in the lab: the previous result,
 * the dice, the next one and the settings). A small shared piece: a studio renders the toggle where its
 * view controls are, the bar once, and hides its own interface under `.imm-on` (css/immersive.css has
 * the bar; each studio's stylesheet says what else hides). Escape, or the bar's first button, leaves it.
 *
 * Accessibility: the bar is a labelled group of real buttons; entering moves the focus to the bar's main
 * action (the toggle that was pressed hides), leaving returns it to the toggle; a status line says it.
 */

interface ImmersiveState { on: boolean }
export const useImmersive = create<ImmersiveState>(() => ({ on: false }));
export const setImmersive = (on: boolean) => { if (useImmersive.getState().on !== on) useImmersive.setState({ on }); };
export const toggleImmersive = () => setImmersive(!useImmersive.getState().on);

/** Enter / leave (drawn on the 24 px grid of the studio's icons). */
export const IImmersive = ({ off }: { off?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off
      ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9.5 12h5" />}
  </svg>
);

export function ImmersiveToggle({ className, label = 'Modo inmersivo', title = 'Modo inmersivo: sólo la pieza y lo esencial (I; Esc para salir)' }: { className?: string; label?: string; title?: string }) {
  const on = useImmersive(s => s.on);
  return (
    <button type="button" className={'imm-toggle' + (className ? ' ' + className : '')} aria-pressed={on} aria-label={label} title={title} onClick={toggleImmersive}>
      <IImmersive />
    </button>
  );
}

export interface ImmersiveAction {
  id: string;
  /** The button's name (and its visible label when `showLabel`). */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** The bar's main action: it takes the focus on entering, and the bar draws it as the key control. */
  main?: boolean;
  /** For a toggle (the settings open or not). */
  pressed?: boolean;
  showLabel?: boolean;
  title?: string;
}

/**
 * The bar. Render it always (it draws nothing while the mode is off); `active` false keeps it off where
 * the studio has no piece to show (a gallery, a guide).
 */
export function ImmersiveBar({ actions, active = true, label = 'Modo inmersivo', exitLabel = 'Salir del modo inmersivo' }: {
  actions: ImmersiveAction[]; active?: boolean; label?: string; exitLabel?: string;
}) {
  const on = useImmersive(s => s.on) && active;
  const bar = useRef<HTMLDivElement>(null);
  const was = useRef(false);
  useEffect(() => {
    if (on && !was.current) (bar.current?.querySelector<HTMLElement>('.imm-main:not(:disabled)') ?? bar.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
    if (!on && was.current) {
      // back to a visible toggle (the one pressed, in most cases)
      const t = [...document.querySelectorAll<HTMLElement>('.imm-toggle')].find(el => el.getClientRects().length > 0);
      const active = document.activeElement;
      if (t && (!active || active === document.body || !active.isConnected)) t.focus();
    }
    was.current = on;
  }, [on]);
  if (!on) return null;
  return (
    <div className="imm-bar" role="group" aria-label={label} ref={bar}>
      <span className="imm-say" role="status">Modo inmersivo: sólo la pieza. Escape para salir.</span>
      <button type="button" className="imm-exit" aria-label={exitLabel} title={exitLabel + ' (Esc)'} onClick={() => setImmersive(false)}>
        <IImmersive off />
      </button>
      <span className="imm-sep" aria-hidden="true" />
      {actions.map(a => (
        <button
          key={a.id} type="button" className={'imm-act' + (a.main ? ' imm-main' : '') + (a.showLabel ? ' imm-wide' : '')}
          aria-label={a.showLabel ? undefined : a.label} aria-pressed={a.pressed} title={a.title ?? a.label} disabled={a.disabled} onClick={a.onClick}
        >
          {a.icon}{a.showLabel && <span className="imm-lbl">{a.label}</span>}
        </button>
      ))}
    </div>
  );
}
