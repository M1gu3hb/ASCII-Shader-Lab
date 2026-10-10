/**
 * A number to type: Enter or leaving the field applies it, Esc goes back, ↑/↓ step by 1 (Mayús: 10).
 * Accepts a decimal comma and the typographic minus; says in Spanish what was wrong or clamped.
 */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

export const fmtNum = (v: number, digits = 1) => {
  const k = Math.pow(10, digits);
  return String(Math.round(v * k) / k);
};

export function parseNum(s: string): number | null {
  const t = s.trim().replace(/\s+/g, '').replace(',', '.').replace(/^[−–]/, '-');
  if (!t || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function NumField({ label, value, onCommit, step = 1, min, max, disabled, digits = 1, suffix, inline, hint, className, title }: {
  label: string;
  /** null: nothing to show (mixed or not applicable). */
  value: number | null;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  digits?: number;
  suffix?: string;
  /** Short label inside the field's frame (X, Y…); otherwise above it. */
  inline?: boolean;
  /** A line under the field (why it is disabled, what it does). */
  hint?: string;
  className?: string;
  title?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);
  const shown = draft ?? (value === null ? '' : fmtNum(value, digits));
  const flash = (text: string, bad: boolean) => {
    setMsg({ text, bad });
    clearTimeout(t.current);
    if (!bad) t.current = window.setTimeout(() => setMsg(null), 4000);
  };
  const clampV = (v: number): [number, string] => {
    if (min !== undefined && v < min) return [min, max !== undefined ? `Va de ${fmtNum(min)} a ${fmtNum(max)}: queda en ${fmtNum(min)}.` : `Mínimo ${fmtNum(min)}.`];
    if (max !== undefined && v > max) return [max, min !== undefined ? `Va de ${fmtNum(min)} a ${fmtNum(max)}: queda en ${fmtNum(max)}.` : `Máximo ${fmtNum(max)}.`];
    return [v, ''];
  };
  const commit = (s: string): boolean => {
    const n = parseNum(s);
    if (n === null) { flash('Escribe un número', true); return false; }
    const [v, note] = clampV(n);
    setDraft(null);
    if (note) flash(note, false); else setMsg(null);
    if (value === null || Math.abs(v - value) > 1e-9) onCommit(v);
    return true;
  };
  const describedBy = [msg ? id + 'm' : '', hint ? id + 'h' : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={'ge-nf' + (inline ? ' ge-nf-inline' : '') + (suffix ? ' ge-nf-hassuf' : '') + (msg?.bad ? ' ge-nf-bad' : '') + (className ? ' ' + className : '')} title={title}
      style={inline ? ({ '--lw': `${Array.from(label).length}ch` } as CSSProperties) : undefined}>
      <label htmlFor={id} className="ge-nf-lbl">{label}</label>
      <span className="ge-nf-box">
        <input
          id={id} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} disabled={disabled}
          value={shown} placeholder={value === null ? '—' : undefined}
          aria-invalid={msg?.bad || undefined} aria-describedby={describedBy}
          onChange={e => { setDraft(e.target.value); if (msg?.bad) setMsg(null); }}
          onFocus={e => e.currentTarget.select()}
          onBlur={() => { if (draft !== null) commit(draft); }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (draft !== null) commit(draft); }
            else if (e.key === 'Escape') { if (draft !== null || msg) { e.preventDefault(); e.stopPropagation(); setDraft(null); setMsg(null); } }
            else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              const base = draft !== null ? parseNum(draft) ?? value : value;
              if (base === null) return;
              const [v, note] = clampV(base + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
              setDraft(null);
              if (note) flash(note, false); else setMsg(null);
              if (value === null || Math.abs(v - value) > 1e-9) onCommit(v);
            }
          }}
        />
        {suffix && <span className="ge-nf-suf" aria-hidden="true">{suffix}</span>}
      </span>
      {hint && <span className="ge-nf-hint" id={id + 'h'}>{hint}</span>}
      <span className={'ge-nf-msg' + (msg ? '' : ' sr-only')} id={id + 'm'} role="status">{msg?.text ?? ''}</span>
    </div>
  );
}
