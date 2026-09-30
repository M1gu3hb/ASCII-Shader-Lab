import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { liveValue, rangeHint, settle, showNumber, snapTo } from './numberMath';

/**
 * The studio's number field (export sizes and durations, the terminal's columns and rows, a slider's
 * exact value). While the person types, the field holds exactly what they typed: it can be emptied, and
 * «3» on the way to «300» is not forced to the minimum. A number already within the range applies as it
 * is typed; when they are done (Enter, leaving the field) the text is read, kept within its range and on
 * its step, and a short line says so when it had to move («Va de 10 a 300: queda en 300.»). Escape puts
 * back the value it had. ↑ ↓ step it, like a native number field (it is a text field with the spinbutton
 * role, so a decimal comma is welcome and phones show their number keypad).
 */
export interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'defaultValue'> {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** A new value: while typing (only numbers within the range) and when the field is done. */
  onValue: (v: number) => void;
  /** The person is done: Enter, Escape (the value it had is back) or the field left; `said` is the line about the range, if any. */
  onDone?: (how: 'enter' | 'escape' | 'blur', said: string) => void;
  /** Select the whole text when the field takes focus (typing replaces it). Default: true. */
  selectOnFocus?: boolean;
}

export function NumberField({ value, min, max, step = 1, onValue, onDone, selectOnFocus = true, className, onFocus, onBlur, onKeyDown, ...rest }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const start = useRef(value);
  const ref = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const hintT = useRef(0);
  useEffect(() => () => clearTimeout(hintT.current), []);
  const say = (text: string) => {
    setHint(text);
    clearTimeout(hintT.current);
    if (text) hintT.current = window.setTimeout(() => setHint(''), 4500);
  };
  const finish = (how: 'enter' | 'blur') => {
    let said = '';
    let now = value;
    if (draft !== null) {
      const s = settle(draft, value, min, max, step);
      if (s.value !== value) onValue(s.value);
      now = s.value;
      said = rangeHint(s.kind, min, max, s.value, step);
      say(said);
      setDraft(null);
    }
    // what Enter settled is what a later Escape goes back to
    start.current = now;
    onDone?.(how, said);
  };
  const stepBy = (dir: 1 | -1, big: boolean) => {
    const base = draft !== null ? liveValue(draft, min, max, step) ?? value : value;
    const n = snapTo(base + dir * step * (big ? 10 : 1), min, max, step);
    setDraft(null);
    say('');
    if (n !== value) onValue(n);
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter') { e.preventDefault(); finish('enter'); }
    else if (e.key === 'Escape') {
      // back to the value it had when the field was entered (and only that: the sheet around it stays)
      if (draft !== null || value !== start.current) {
        e.preventDefault();
        e.stopPropagation();
        setDraft(null);
        say('');
        if (value !== start.current) onValue(start.current);
      }
      onDone?.('escape', '');
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); stepBy(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); stepBy(e.key === 'PageUp' ? 1 : -1, true); }
  };
  const describedBy = [rest['aria-describedby'], hint ? hintId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <>
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode={Number.isInteger(step) && Number.isInteger(min) ? 'numeric' : 'decimal'}
        role="spinbutton"
        autoComplete="off"
        spellCheck={false}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-invalid={hint && hint.startsWith('Escribe') ? true : undefined}
        aria-describedby={describedBy}
        className={'nf' + (className ? ' ' + className : '')}
        value={draft ?? showNumber(value, step)}
        onChange={e => {
          const t = e.target.value;
          setDraft(t);
          if (hint) say('');
          const v = liveValue(t, min, max, step);
          if (v !== null && v !== value) onValue(v);
        }}
        onFocus={e => {
          start.current = value;
          onFocus?.(e);
          if (selectOnFocus) { const el = e.currentTarget; requestAnimationFrame(() => { if (document.activeElement === el) el.select(); }); }
        }}
        onBlur={e => { onBlur?.(e); finish('blur'); }}
        onKeyDown={keys}
      />
      <span id={hintId} className="nf-hint" role="status">{hint}</span>
    </>
  );
}
