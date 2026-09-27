import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { typeAhead } from './rowMath';
import '../css/controls.css';

/**
 * The studio's select: a button that opens a listbox (the WAI-ARIA «select-only combobox»). Focus stays
 * on the button while the list is open (aria-activedescendant marks the highlighted option); on phones
 * and touch screens the list is a sheet at the bottom of the screen and takes focus itself.
 *
 * Keys: Enter, Space, ↓ or ↑ open it; ↑ ↓ move, Home and End jump, Page ↑/↓ skip ten, typing jumps to
 * the option that starts with it; Enter or Space choose; Escape or Tab close without changing it.
 * A click outside closes it. The list opens below the button (above when there is more room there),
 * inside the column the button lives in (the settings panel, a sheet), so it does not cover the piece.
 */
export interface PickOpt<T extends string | number> {
  value: T;
  label: string;
  /** Options with the same group are listed together under its name (in the order they come). */
  group?: string;
  /** One line under the label: what the option does. */
  desc?: string;
  /** A small picture before the label (decoration: hidden from assistive tech). */
  icon?: ReactNode;
  disabled?: boolean;
}

export interface PickerProps<T extends string | number> {
  value: T | undefined;
  options: PickOpt<T>[];
  onChange: (v: T) => void;
  /** Name of the control (used when no visible label is given, and as the title of the phone sheet). */
  label: string;
  /** Id of a visible label that names the control. */
  labelId?: string;
  /** Id of the button (a <label htmlFor> may point at it). */
  id?: string;
  /** Extra ids that describe the control (hints). */
  describedBy?: string;
  className?: string;
  /** What the button says when the value is not among the options. */
  placeholder?: string;
  /** Custom content of an option in the list. */
  renderOption?: (o: PickOpt<T>, s: { active: boolean; selected: boolean }) => ReactNode;
  /** Custom content of the button. */
  renderValue?: (o: PickOpt<T> | undefined) => ReactNode;
  /** A preview of the highlighted option, shown above the list (render it lazily). */
  preview?: (o: PickOpt<T>) => ReactNode;
  /** Narrowest width of the list, in px (it is at least as wide as the button). */
  minWidth?: number;
  /** Where the list keeps inside: the closest ancestor matching this (default: panel, sheet, bar). */
  within?: string;
  disabled?: boolean;
  /** Visual size of the button. */
  size?: 'md' | 'sm';
  /** Called when the list opens or closes (e.g. to start or stop lazy renders). */
  onOpenChange?: (open: boolean) => void;
}

const SHEET = '(max-width: 900px), (pointer: coarse)';
const WITHIN = '.panel, dialog, .pop, .vbar, .comp-controls, .topbar';
const HIDDEN: CSSProperties = { visibility: 'hidden' };

export function Picker<T extends string | number>(p: PickerProps<T>) {
  const { value, options, onChange, label, labelId, describedBy, placeholder = '—', renderOption, renderValue, preview, minWidth = 220, onOpenChange } = p;
  const uid = useId();
  const id = p.id ?? uid + 'b';
  const listId = uid + 'l';
  const optId = (i: number) => `${uid}o${i}`;
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<CSSProperties>(HIDDEN);
  const typed = useRef({ s: '', t: 0 });
  const selected = options.findIndex(o => o.value === value);
  const cur = selected >= 0 ? options[selected] : undefined;

  // options in list order: grouped ones gathered under their group, in the order the groups appear
  const order = useMemo(() => {
    const groups: Array<{ name?: string; idx: number[] }> = [];
    options.forEach((o, i) => {
      const last = groups[groups.length - 1];
      const g = o.group === undefined ? (last && last.name === undefined ? last : undefined) : groups.find(x => x.name === o.group);
      if (g) g.idx.push(i); else groups.push({ name: o.group, idx: [i] });
    });
    return { groups, flat: groups.flatMap(g => g.idx) };
  }, [options]);

  const enabled = (i: number) => i >= 0 && i < options.length && !options[i].disabled;
  const edgeOpt = (last: boolean) => { const f = last ? [...order.flat].reverse() : order.flat; return f.find(enabled) ?? -1; };
  /** The enabled option `step` places away in list order (clamped at the ends, no wrapping). */
  const move = (from: number, dir: 1 | -1, step = 1) => {
    const f = order.flat;
    const at = f.indexOf(from);
    if (at < 0) return edgeOpt(dir < 0);
    const j = Math.max(0, Math.min(f.length - 1, at + dir * step));
    for (let k = j; k >= 0 && k < f.length; k += dir) if (enabled(f[k])) return f[k];
    for (let k = j; k >= 0 && k < f.length; k -= dir) if (enabled(f[k])) return f[k];
    return from;
  };

  const place = useCallback(() => {
    const b = btn.current, el = pop.current;
    if (!b || !el) return;
    const isSheet = matchMedia(SHEET).matches;
    setSheet(isSheet);
    let next: CSSProperties = {};
    if (!isSheet) {
      const r = b.getBoundingClientRect();
      const box = b.closest(p.within ?? WITHIN)?.getBoundingClientRect();
      const L = Math.max(8, box ? box.left + 6 : 8), R = Math.min(innerWidth - 8, box ? box.right - 6 : innerWidth - 8);
      const width = Math.min(Math.max(r.width, minWidth), R - L);
      const left = Math.max(L, Math.min(r.left, R - width));
      // a tall column (the panel, a sheet) also bounds it vertically; a bar only sideways
      const tall = box && box.height > 320;
      const T = Math.max(8, tall ? box.top + 4 : 8), Bt = Math.min(innerHeight - 8, tall ? box.bottom - 4 : innerHeight - 8);
      const below = Bt - r.bottom - 4, above = r.top - T - 4;
      const want = Math.min(el.scrollHeight, 460);
      const down = below >= want || below >= above;
      const room = Math.max(140, Math.min(460, down ? below : above));
      next = down ? { left, width, top: r.bottom + 4, maxHeight: room } : { left, width, bottom: innerHeight - r.top + 4, maxHeight: room };
    }
    setPos(p0 => (JSON.stringify(p0) === JSON.stringify(next) ? p0 : next));
  }, [minWidth, p.within]);

  const show = (at: number) => {
    if (p.disabled) return;
    setActive(enabled(at) ? at : edgeOpt(false));
    setOpen(true);
  };
  const close = useCallback((refocus = true) => {
    setOpen(false);
    setPos(HIDDEN);
    if (refocus) btn.current?.focus({ preventScroll: true });
  }, []);
  const choose = (i: number) => {
    if (!enabled(i)) return;
    close();
    if (options[i].value !== value) onChange(options[i].value);
  };

  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  // measure where the list goes before it paints, and again when anything around it moves
  useLayoutEffect(() => { if (open) place(); }, [open, place, options.length]);
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const again = (e?: Event) => {
      // the list's own scrolling moves nothing
      if (e?.type === 'scroll' && e.target instanceof Node && pop.current?.contains(e.target)) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    addEventListener('resize', again);
    addEventListener('scroll', again, true);
    document.addEventListener('pointerdown', outside, true);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', again);
      removeEventListener('scroll', again, true);
      document.removeEventListener('pointerdown', outside, true);
    };
  }, [open, place, close]);
  // phones: the sheet takes focus (a screen reader lands in the list)
  useEffect(() => { if (open && sheet) list.current?.focus({ preventScroll: true }); }, [open, sheet]);
  // the highlighted option stays in view (the chosen one is in view as the list opens)
  const placed = open && pos.visibility !== 'hidden';
  useEffect(() => {
    if (!placed || active < 0) return;
    const el = document.getElementById(optId(active));
    const box = list.current;
    if (!el || !box) return;
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop -= b.top - r.top + 4;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 4;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, active]);

  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    const printable = k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    // when the key was pressed (not when it is handled: a busy page may handle a quick «bra» in bursts)
    const now = e.timeStamp || performance.now();
    const typing = now - typed.current.t < 1000 && typed.current.s.length > 0;
    // type-ahead follows the list as shown (grouped)
    const find = (ch: string, from: number) => {
      typed.current = { s: (typing ? typed.current.s : '') + ch, t: now };
      const f = order.flat;
      const j = typeAhead(f.map(i => options[i].label), typed.current.s, f.indexOf(from), x => !enabled(f[x]));
      return j < 0 ? -1 : f[j];
    };
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') show(selected);
      else if (k === 'Home') show(edgeOpt(false));
      else if (k === 'End') show(edgeOpt(true));
      else if (printable) { const i = find(k, selected); show(i >= 0 ? i : selected); }
      else if (k === 'ArrowLeft' || k === 'ArrowRight') { /* nothing here, and not the studio's history either */ }
      else return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (k === 'Tab') { close(sheet); return; }
    if (k === 'Escape') close();
    else if (k === 'ArrowUp' && e.altKey) choose(active);
    else if (k === 'ArrowDown') setActive(a => move(a, 1));
    else if (k === 'ArrowUp') setActive(a => move(a, -1));
    else if (k === 'Home') setActive(edgeOpt(false));
    else if (k === 'End') setActive(edgeOpt(true));
    else if (k === 'PageDown') setActive(a => move(a, 1, 10));
    else if (k === 'PageUp') setActive(a => move(a, -1, 10));
    else if (k === 'Enter' || (k === ' ' && !typing)) choose(active);
    else if (printable) { const i = find(k, active); if (i >= 0) setActive(i); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') { /* nothing */ }
    else return;
    // inside a sheet (a modal dialog) Escape closes only the list; letters are not the studio's shortcuts
    e.preventDefault();
    e.stopPropagation();
  };

  // the list lives where its control's layer is: inside an open dialog or popover (whose own «click outside»
  // must not see it as outside), else at the end of the page
  const host = open && typeof document !== 'undefined' ? (btn.current?.closest('dialog, .pop, [data-picker-host]') ?? document.body) : null;
  const activeOpt = open && active >= 0 ? options[active] : undefined;
  const renderOne = (i: number) => {
    const o = options[i];
    const on = i === active, sel = i === selected;
    return (
      <div key={i} id={optId(i)} role="option" aria-selected={sel} aria-disabled={o.disabled || undefined}
        className={'pk-opt' + (on ? ' on' : '') + (sel ? ' sel' : '') + (o.disabled ? ' off' : '')}
        onPointerMove={() => { if (!on && enabled(i)) setActive(i); }}
        onClick={() => choose(i)}>
        {renderOption ? renderOption(o, { active: on, selected: sel }) : <OptBody o={o} />}
        <svg className="pk-tick" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg>
      </div>
    );
  };

  return (
    <>
      <button
        ref={btn} id={id} type="button" role="combobox" disabled={p.disabled}
        className={'pk' + (p.size === 'sm' ? ' pk-sm' : '') + (open ? ' open' : '') + (p.className ? ' ' + p.className : '')}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !sheet && active >= 0 ? optId(active) : undefined}
        aria-labelledby={labelId} aria-label={labelId ? undefined : label}
        aria-describedby={describedBy} data-value={value === undefined ? "" : String(value)}
        onClick={() => (open ? close() : show(selected))}
        onKeyDown={onKey}
      >
        <span className="pk-val">
          {renderValue ? renderValue(cur) : cur
            ? <>{cur.icon && <span className="pk-ic" aria-hidden="true">{cur.icon}</span>}<span className="pk-txt">{cur.label}</span></>
            : <span className="pk-txt pk-ph">{placeholder}</span>}
        </span>
        <svg className="pk-caret" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {host && createPortal(
        <>
          {sheet && <div className="pk-scrim" aria-hidden="true" />}
          <div ref={pop} className={'pk-pop' + (sheet ? ' pk-sheet' : '') + (preview ? ' has-preview' : '')} style={pos}
            // desktop: clicks inside keep the focus on the button
            onMouseDown={e => { if (!sheet) e.preventDefault(); }}>
            {sheet && (
              <div className="pk-sheet-head">
                <span className="pk-sheet-t" id={uid + 't'}>{label}</span>
                <button type="button" className="pk-sheet-x" onClick={() => close()}>Cerrar</button>
              </div>
            )}
            {preview && activeOpt && <div className="pk-preview" aria-hidden="true">{preview(activeOpt)}</div>}
            <div ref={list} id={listId} role="listbox" className="pk-list" tabIndex={-1}
              aria-labelledby={sheet ? uid + 't' : labelId} aria-label={sheet || labelId ? undefined : label}
              aria-activedescendant={sheet && active >= 0 ? optId(active) : undefined}
              onKeyDown={onKey}>
              {order.groups.map((g, gi) => g.name === undefined
                ? g.idx.map(renderOne)
                : (
                  <div key={'g' + gi} role="group" aria-label={g.name} className="pk-group">
                    <div className="pk-gh" aria-hidden="true">{g.name}</div>
                    {g.idx.map(renderOne)}
                  </div>
                ))}
            </div>
          </div>
        </>,
        host,
      )}
    </>
  );
}

/** Default content of an option: its picture, name and one line of description. */
export function OptBody<T extends string | number>({ o }: { o: PickOpt<T> }) {
  return (
    <>
      {o.icon && <span className="pk-ic" aria-hidden="true">{o.icon}</span>}
      <span className="pk-main">
        <span className="pk-name">{o.label}</span>
        {o.desc && <span className="pk-desc">{o.desc}</span>}
      </span>
    </>
  );
}
