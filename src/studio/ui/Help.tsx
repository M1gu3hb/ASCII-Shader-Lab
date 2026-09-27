import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { helpFor, type HelpText } from './copy';
import '../css/controls.css';

/**
 * Controls that explain themselves, progressively:
 * - a short hint in a bubble near the control when its name is hovered or the control gets keyboard
 *   focus (screen readers get the same line as the control's description);
 * - a small «?» that opens a fuller explanation inline, in the panel (never over the piece), with
 *   visual examples where they help. It works with a tap, a click or the keyboard, so nothing
 *   depends on hovering.
 */
export interface Help {
  text: HelpText;
  /** The control's description (the hint), for aria-describedby. */
  hintId: string;
  moreId: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  /** On the control's name row: shows the bubble after a short hover. */
  hover: { onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void; onMouseLeave: () => void };
  /** On the control itself: shows the bubble while it has keyboard focus. */
  focus: { onFocus: (e: FocusEvent<HTMLElement>) => void; onBlur: () => void };
}

/** Help for a recipe path (from copy.ts) or given directly; null when there is none. */
export function useHelp(key?: string, given?: HelpText | null): Help | null {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const text = given === null ? undefined : given ?? (key ? helpFor(key) : undefined);
  const anchorOf = (el: HTMLElement) => (el.closest('.ctl, .toggle, .help-row')?.querySelector<HTMLElement>('.ctl-head') ?? el.closest<HTMLElement>('.ctl, .toggle, .help-row') ?? el);
  if (!text) return null;
  return {
    text, hintId: uid + 'h', moreId: uid + 'm', open, setOpen,
    hover: {
      onMouseEnter: e => showBubble(uid, text.hint, anchorOf(e.currentTarget), 450),
      onMouseLeave: () => hideBubble(uid),
    },
    focus: {
      onFocus: e => { if (safeMatches(e.currentTarget, ':focus-visible')) showBubble(uid, text.hint, anchorOf(e.currentTarget), 0); },
      onBlur: () => hideBubble(uid, 0),
    },
  };
}

const safeMatches = (el: Element, sel: string) => { try { return el.matches(sel); } catch { return false; } };

/** The «?» button next to a control's name. */
export function HelpToggle({ h, name }: { h: Help; name: string }) {
  return (
    <button type="button" className="help-q" aria-expanded={h.open} aria-controls={h.moreId}
      onClick={() => { hideBubble(null, 0); h.setOpen(!h.open); }}>
      <span aria-hidden="true">?</span><span className="sr-only">Qué es «{name}»</span>
    </button>
  );
}

/** The hint as the control's description (screen readers), always in the page. */
export function HintText({ h }: { h: Help | null }) {
  return h ? <span id={h.hintId} className="sr-only">{h.text.hint}</span> : null;
}

/** The fuller explanation, inline under the control, while «?» is pressed. */
export function HelpMore({ h, children }: { h: Help | null; children?: ReactNode }) {
  if (!h?.open) return null;
  return (
    <div className="help-more" id={h.moreId}>
      <p className="help-hint">{h.text.hint}</p>
      {h.text.more && <p>{h.text.more}</p>}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The bubble: one at a time, inside the column of its control          */
/* ------------------------------------------------------------------ */

interface Bubble { owner: string; text: string; anchor: HTMLElement }
const useBubble = create<{ b: Bubble | null }>(() => ({ b: null }));
let showT = 0, hideT = 0;

export function showBubble(owner: string, text: string, anchor: HTMLElement, delay: number) {
  clearTimeout(hideT);
  clearTimeout(showT);
  const go = () => useBubble.setState({ b: { owner, text, anchor } });
  if (delay) showT = window.setTimeout(go, delay); else go();
}

/** Hides the bubble (only its owner's, unless `owner` is null) after a short grace: the pointer may be moving onto it. */
export function hideBubble(owner: string | null, delay = 140) {
  clearTimeout(showT);
  clearTimeout(hideT);
  const go = () => { const b = useBubble.getState().b; if (b && (owner === null || b.owner === owner)) useBubble.setState({ b: null }); };
  if (delay) hideT = window.setTimeout(go, delay); else go();
}

/** Mounted once: draws the current hint bubble above its control (below it near the top of the column). */
export function HintBubble() {
  const b = useBubble(s => s.b);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const place = useCallback(() => {
    const el = ref.current;
    if (!b || !el || !b.anchor.isConnected) { if (b) useBubble.setState({ b: null }); return; }
    const a = b.anchor.getBoundingClientRect();
    const col = (b.anchor.closest('.panel, dialog, .comp-controls') ?? document.documentElement).getBoundingClientRect();
    // the column of «?» buttons on the right stays free: the bubble never sits on another control's «?»
    const L = Math.max(8, col.left + 8), R = Math.min(innerWidth - 8, col.right - 40);
    const w = Math.min(el.offsetWidth, R - L);
    const left = Math.max(L, Math.min(a.left, R - w));
    const h = el.offsetHeight;
    const above = a.top - h - 6 >= Math.max(8, col.top + 4);
    setStyle({ left, maxWidth: R - L, top: above ? a.top - h - 6 : a.bottom + 6 });
  }, [b]);
  useLayoutEffect(() => { setStyle({ visibility: 'hidden' }); }, [b]);
  useLayoutEffect(() => { if (b) place(); }, [b, place]);
  useEffect(() => {
    if (!b) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { useBubble.setState({ b: null }); } };
    const off = () => useBubble.setState({ b: null });
    addEventListener('keydown', esc, true);
    addEventListener('scroll', off, true);
    addEventListener('resize', off);
    return () => { removeEventListener('keydown', esc, true); removeEventListener('scroll', off, true); removeEventListener('resize', off); };
  }, [b]);
  if (!b) return null;
  const host = b.anchor.closest('dialog') ?? document.body;
  return createPortal(
    <div ref={ref} className="hint-bubble" style={style} aria-hidden="true"
      onMouseEnter={() => clearTimeout(hideT)} onMouseLeave={() => hideBubble(b.owner)}>
      {b.text}
    </div>,
    host,
  );
}
