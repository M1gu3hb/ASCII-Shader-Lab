import { useEffect, useRef, type CSSProperties, type InputHTMLAttributes, type RefObject } from 'react';
import { snapTo } from './numberMath';
import { INTENT_PX, dragValue, fineGain, intentOf, valueAt } from './slideMath';

/**
 * Every slider of the lab: a native range (keyboard, screen readers and a mouse keep their direct
 * behaviour) that a finger or a pen cannot move by accident.
 *
 * Where a coarse pointer exists (phones, tablets, touch laptops: CSS `any-pointer: coarse`), the range
 * itself lets pointers through to its row, and this component reads them:
 *  - a finger or pen does nothing until it shows what it wants: moving sideways first takes the slider,
 *    moving up or down first scrolls the panel (the row allows vertical panning only). (A press held still
 *    does not take it: a finger resting before it scrolls slowly would move the value by accident);
 *  - taken, the value follows the finger's movement from where it was (it never jumps to the finger), the
 *    whole track being the whole range; moving the finger up or down away from the track makes it finer
 *    (½, ⅓, ¼… shown by the row);
 *  - a short tap changes nothing: the row says how it works;
 *  - a mouse on such a device presses and drags as on a native range.
 * The drag area is the whole row of the control (its name, value and track), not the thin track alone.
 */
export interface RangeProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step' | 'defaultValue'> {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValue: (v: number) => void;
  /** Where a finger may start a drag: the control's row (default: the range's parent). */
  area?: RefObject<HTMLElement | null>;
}

export function Range({ value, min, max, step = 0.01, onValue, area, className, style, ...rest }: RangeProps) {
  const input = useRef<HTMLInputElement>(null);
  const live = useRef({ value, min, max, step, onValue });
  live.current = { value, min, max, step, onValue };
  useTouchSlide(input, area, live);
  const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <input
      {...rest}
      ref={input}
      type="range"
      className={'rng' + (className ? ' ' + className : '')}
      min={min} max={max} step={step} value={value}
      style={{ '--p': pct + '%', ...style } as CSSProperties}
      onChange={e => onValue(parseFloat(e.target.value))}
    />
  );
}

type Live = RefObject<{ value: number; min: number; max: number; step: number; onValue: (v: number) => void }>;

interface Gesture {
  id: number;
  kind: 'touch' | 'mouse';
  mode: 'pending' | 'drag';
  x0: number; y0: number;
  /** Where the drag was taken (the fine adjustment counts from there). */
  ey: number;
  lastX: number;
  acc: number;
}

const coarseQ = '(any-pointer: coarse)';
const coarse = () => typeof matchMedia === 'function' && matchMedia(coarseQ).matches;
/** What a press on the row must not start: its buttons and fields, and the explanation under it. */
const OWN = 'button, a[href], select, textarea, input:not([type=range]), [role=combobox], .help-more, .nf-hint';

function useTouchSlide(input: RefObject<HTMLInputElement | null>, area: RefObject<HTMLElement | null> | undefined, live: Live) {
  useEffect(() => {
    const el = input.current;
    const row = area?.current ?? el?.parentElement;
    if (!el || !row) return;
    row.classList.add('rng-area');
    let g: Gesture | null = null;
    let tipT = 0;

    const set = (v: number) => {
      const L = live.current!;
      const n = snapTo(v, L.min, L.max, L.step);
      if (!el.matches(':disabled') && n !== L.value) L.onValue(n);
    };
    const track = () => el.getBoundingClientRect();
    const take = (e: PointerEvent) => {
      if (!g) return;
      g.mode = 'drag';
      g.ey = e.clientY;
      g.lastX = e.clientX;
      g.acc = live.current!.value;
      row.classList.add('sl-drag');
      row.classList.remove('sl-tip');
      try { row.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
    };
    const end = (keep: boolean) => {
      if (!g) return;
      const wasDrag = g.mode === 'drag';
      const tap = !wasDrag && g.kind === 'touch' && keep;
      g = null;
      row.classList.remove('sl-drag');
      delete row.dataset.fine;
      if (tap) {
        // a tap changes nothing: say how the slider works, for a moment
        row.classList.add('sl-tip');
        clearTimeout(tipT);
        tipT = window.setTimeout(() => row.classList.remove('sl-tip'), 2200);
      }
    };

    const down = (e: PointerEvent) => {
      if (g || el.matches(':disabled')) return;
      const t = e.target as Element | null;
      // a device with only fine pointers: the native range does everything
      if (t === el || !coarse()) return;
      if (t?.closest(OWN)) return;
      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        // a mouse: the track only, as a native range (the name keeps its double click)
        const r = track();
        if (e.clientY < r.top - 6 || e.clientY > r.bottom + 6 || e.clientX < r.left - 6 || e.clientX > r.right + 6) return;
        e.preventDefault();
        el.focus({ preventScroll: true });
        g = { id: e.pointerId, kind: 'mouse', mode: 'drag', x0: e.clientX, y0: e.clientY, ey: e.clientY, lastX: e.clientX, acc: 0 };
        row.classList.add('sl-drag');
        try { row.setPointerCapture(e.pointerId); } catch { /* */ }
        const L = live.current!;
        set(valueAt(e.clientX, r.left, r.width, L.min, L.max, 14));
        return;
      }
      // a finger or a pen: nothing yet
      g = { id: e.pointerId, kind: 'touch', mode: 'pending', x0: e.clientX, y0: e.clientY, ey: e.clientY, lastX: e.clientX, acc: live.current!.value };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      if (g.kind === 'mouse') {
        const r = track(), L = live.current!;
        set(valueAt(e.clientX, r.left, r.width, L.min, L.max, 14));
        return;
      }
      if (g.mode === 'pending') {
        const it = intentOf(e.clientX - g.x0, e.clientY - g.y0, INTENT_PX);
        if (it === 'scroll') { end(false); return; }
        if (it === 'pending') return;
        // (the movement up to the threshold does not count: the value starts where it was)
        take(e);
        return;
      }
      const L = live.current!;
      const gain = fineGain(e.clientY - g.ey);
      g.acc = dragValue(g.acc, e.clientX - g.lastX, track().width, L.min, L.max, gain);
      g.lastX = e.clientX;
      set(g.acc);
      const f = gain > 0.96 ? '' : gain > 0.45 ? '½' : gain > 0.3 ? '⅓' : gain > 0.22 ? '¼' : gain > 0.15 ? '⅙' : '⅛';
      if (f) row.dataset.fine = f; else delete row.dataset.fine;
    };
    const up = (e: PointerEvent) => { if (g && e.pointerId === g.id) end(true); };
    const cancel = (e: PointerEvent) => { if (g && e.pointerId === g.id) end(false); };
    // once a finger has taken the slider, the page must not scroll under it (the row allows vertical panning)
    const touchmove = (e: TouchEvent) => { if (g && g.mode === 'drag' && e.cancelable) e.preventDefault(); };
    // the row taking the pointer over from the element the finger landed on is not the end of it
    const lost = (e: PointerEvent) => { if (e.target === row) cancel(e); };

    row.addEventListener('pointerdown', down);
    row.addEventListener('pointermove', move);
    row.addEventListener('pointerup', up);
    row.addEventListener('pointercancel', cancel);
    row.addEventListener('lostpointercapture', lost);
    row.addEventListener('touchmove', touchmove, { passive: false });
    return () => {
      clearTimeout(tipT);
      row.classList.remove('rng-area', 'sl-drag', 'sl-tip');
      row.removeEventListener('pointerdown', down);
      row.removeEventListener('pointermove', move);
      row.removeEventListener('pointerup', up);
      row.removeEventListener('pointercancel', cancel);
      row.removeEventListener('lostpointercapture', lost);
      row.removeEventListener('touchmove', touchmove);
    };
  }, [input, area, live]);
}
