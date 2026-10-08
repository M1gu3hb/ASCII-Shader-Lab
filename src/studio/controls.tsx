import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { DEFAULT_LAYER, defaultRecipe, type Recipe } from '../engine/recipe';
import { edit, useStudio } from './store';
import { HelpMore, HelpToggle, HintText, useHelp, type Help } from './ui/Help';
import type { HelpText } from './ui/copy';
import { Picker, type PickOpt, type PickerProps } from './ui/Picker';
import { ScrollRow } from './ui/ScrollRow';
import { Range } from './ui/Range';
import { NumberField } from './ui/NumberField';
import { snapTo } from './ui/numberMath';
import { repeatWait } from './ui/slideMath';
import { ColorField } from './ui/color/ColorField';
import { useScramble } from './motion/hooks';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Field<T> { key: string; get: (r: Recipe) => T; set: (r: Recipe, v: T) => void }

/** Dotted-path accessor into a recipe: F('fx.glow'), F('layers.1.scale'). */
export function F<T = any>(path: string): Field<T> {
  const parts = path.split('.');
  return {
    key: path,
    get: r => parts.reduce((o: any, k) => (o == null ? o : o[k]), r) as T,
    set: (r, v) => {
      let o: any = r;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = v;
    },
  };
}

const DEF = defaultRecipe();
function defaultOf<T>(f: Field<T>): T | undefined {
  const v = f.get(DEF);
  if (v !== undefined) return v;
  const m = /^layers\.\d+\.(\w+)$/.exec(f.key);
  return m ? (DEFAULT_LAYER as any)[m[1]] : undefined;
}

export function useField<T>(f: Field<T>): T | undefined {
  return useStudio(s => { const r = s.entries[s.cursor]?.recipe; return r ? f.get(r) : undefined; });
}

const fmtNum = (v: number, step: number) => (step >= 1 ? String(Math.round(v)) : step >= 0.1 ? v.toFixed(1) : v.toFixed(2));

/**
 * Every control below has the same frame («ctl cx»): its name (hovering it shows the hint), its value,
 * the «?» that opens the fuller explanation, the control, and the explanation when open. `help`
 * overrides the text from copy.ts (null: none).
 */
interface Framed { label: string; help?: HelpText | null }

function Frame({ id, label, h, value, field, more, className, labelTag = 'label', onDoubleClick, rowRef }: {
  id: string; label: string; h: Help | null; value?: ReactNode; field: ReactNode; more?: ReactNode; className?: string;
  labelTag?: 'label' | 'span'; onDoubleClick?: () => void; rowRef?: RefObject<HTMLDivElement | null>;
}) {
  const Lbl = labelTag;
  return (
    <div ref={rowRef} className={'ctl cx' + (h ? ' has-help' : '') + (value !== undefined ? ' has-val' : '') + (className ? ' ' + className : '')}>
      <Lbl className="lbl" id={id + 'l'} {...(labelTag === 'label' ? { htmlFor: id } : {})} {...h?.hover}
        onDoubleClick={onDoubleClick} data-reset={onDoubleClick ? '' : undefined}>{label}</Lbl>
      {value}
      {field}
      {/* after the control in the Tab order (the grid shows it beside the name, or beside the control on touch) */}
      {h && <HelpToggle h={h} name={label} />}
      <HintText h={h} />
      <HelpMore h={h}>{more}</HelpMore>
    </div>
  );
}

/**
 * A slider with its name, its value and, where a finger or pen may be used, − and + beside the track.
 * The range is touch-safe (ui/Range.tsx: scrolling the panel over it never moves it, a sideways drag
 * does, finer as the finger goes farther from the track). The value is a button: pressed, it becomes a
 * field to type the exact value (Enter on the slider does the same); a double click on the name goes
 * back to the initial value. `scale` is how the value is shown and typed (100 for a percentage of 0..1,
 * 360 for degrees of a turn).
 */
export function Slider({ f, label, min, max, step = 0.01, fmt, help, compare, scale = 1 }: Framed & {
  f: Field<number>; min: number; max: number; step?: number; fmt?: (v: number) => string;
  /** Visual examples shown with the explanation (e.g. a CompareStrip). */
  compare?: ReactNode;
  scale?: number;
}) {
  const id = useId();
  const h = useHelp(f.key, help);
  const v = useField(f) ?? min;
  const d = defaultOf(f);
  const row = useRef<HTMLDivElement>(null);
  const valBtn = useRef<HTMLButtonElement>(null);
  // the exact value being typed: opened from the keyboard (Enter on the slider: the focus comes back to it) or by a press
  const [typing, setTyping] = useState<false | 'key' | 'press'>(false);
  // what typing a value out of the range did («Va de 3 a 48: queda en 48.»), for a moment
  const [said, setSaid] = useState('');
  const saidT = useRef(0);
  useEffect(() => () => clearTimeout(saidT.current), []);
  const set = (x: number) => edit(r => f.set(r, x), f.key);
  const reset = () => { if (typeof d === 'number') edit(r => f.set(r, d), f.key + ':reset'); };
  const show = (x: number) => (fmt ? fmt(x) : fmtNum(x, step));
  const back = () => row.current?.querySelector<HTMLInputElement>('input[type=range]')?.focus();
  const typeStep = scale === 1 ? step : Math.min(1, step * scale);
  return (
    <Frame
      id={id} label={label} h={h} onDoubleClick={reset} rowRef={row} className={'sl' + (typing ? ' sl-typing' : '')}
      value={typing
        ? (
          <NumberField
            className="sl-num" autoFocus aria-labelledby={id + 'l'}
            value={Number((v * scale).toFixed(8))} min={min * scale} max={max * scale} step={typeStep}
            onValue={x => set(scale === 1 ? x : x / scale)}
            onDone={(how, line) => {
              setTyping(false);
              setSaid(line);
              clearTimeout(saidT.current);
              if (line) saidT.current = window.setTimeout(() => setSaid(''), 4500);
              // Enter or Escape: the focus goes back where the typing was opened from
              if (how !== 'blur') requestAnimationFrame(typing === 'key' ? back : () => valBtn.current?.focus({ preventScroll: true }));
            }}
          />
        )
        : (
          <button ref={valBtn} type="button" className="sl-val" tabIndex={-1} title="Escribir un valor exacto"
            aria-label={`Escribir el valor exacto: ${show(v)}`} aria-describedby={id + 'l'} onClick={() => setTyping('press')}>{show(v)}</button>
        )}
      field={(
        <>
          <Stepper dir={-1} labelId={id + 'l'} value={v} min={min} max={max} step={step} onValue={set} />
          <Range
            id={id} min={min} max={max} step={step} value={v} area={row} aria-describedby={h?.hintId} aria-valuetext={show(v)} {...h?.focus}
            // --d: where the initial value sits (a small mark over the track; double click on the name goes back to it)
            style={(typeof d === 'number' && d >= min && d <= max ? { '--d': (d - min) / (max - min) } : {}) as CSSProperties}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setTyping('key'); } }}
            onValue={set}
          />
          <Stepper dir={1} labelId={id + 'l'} value={v} min={min} max={max} step={step} onValue={set} />
          <span className="nf-hint" role="status">{typing ? '' : said}</span>
        </>
      )}
      more={(
        <>
          {compare}
          {typeof d === 'number' && d >= min && d <= max && (
            <p className="help-reset">
              <button type="button" className="mini" disabled={Math.abs(v - d) < 1e-9} onClick={reset}>Volver al valor inicial ({show(d)})</button>
              <span>o doble clic en el nombre.</span>
            </p>
          )}
        </>
      )}
    />
  );
}

/**
 * − or + beside a slider (shown where a finger or pen may be used): one step per press, repeating
 * faster while held. Out of the Tab order: the slider's arrow keys do the same.
 */
function Stepper({ dir, labelId, value, min, max, step, onValue }: {
  dir: 1 | -1; labelId: string; value: number; min: number; max: number; step: number; onValue: (v: number) => void;
}) {
  const cur = useRef(value);
  cur.current = value;
  const held = useRef<{ t: number; n: number; pressed: boolean } | null>(null);
  const once = () => {
    const n = snapTo(cur.current + dir * step, min, max, step);
    if (n !== cur.current) { cur.current = n; onValue(n); }
  };
  const stop = () => { if (held.current) clearTimeout(held.current.t); };
  const at = dir < 0 ? value <= min : value >= max;
  return (
    <button
      type="button" tabIndex={-1} className={'sl-step ' + (dir < 0 ? 'sl-minus' : 'sl-plus')} disabled={at}
      aria-label={dir < 0 ? 'Menos' : 'Más'} aria-describedby={labelId}
      onPointerDown={e => {
        if (e.button !== 0) return;
        // the focus stays where it was: a press here is not a trip through the Tab order
        e.preventDefault();
        stop();
        once();
        const h = { t: 0, n: 0, pressed: true };
        held.current = h;
        const again = () => { h.n++; once(); h.t = window.setTimeout(again, repeatWait(h.n + 1)); };
        h.t = window.setTimeout(again, repeatWait(1));
      }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onClick={() => {
        // the press already stepped; a click from the keyboard or a screen reader steps once
        if (held.current?.pressed) { held.current.pressed = false; return; }
        once();
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d={dir < 0 ? 'M3.5 8h9' : 'M3.5 8h9M8 3.5v9'} /></svg>
    </button>
  );
}

/** Options of a recipe picker: [value, name] pairs, groups of them, or full picker options. */
export type Opt<T> = [T, string] | { group: string; opts: Array<[T, string]> } | PickOpt<T & (string | number)>;

export function toPickOpts<T extends string | number>(opts: Opt<T>[]): PickOpt<T>[] {
  return opts.flatMap(o => (Array.isArray(o)
    ? [{ value: o[0], label: o[1] }]
    : 'group' in o && 'opts' in o ? o.opts.map(([value, label]) => ({ value, label, group: o.group })) : [o as PickOpt<T>]));
}

/** A recipe setting chosen from a list (the studio's Picker). */
export function Select<T extends string | number>({ f, label, opts, onPick, help, more, ...pick }: Framed & {
  f: Field<T>; opts: Opt<T>[]; onPick?: (v: T) => void; more?: ReactNode;
} & Pick<PickerProps<T>, 'renderOption' | 'renderValue' | 'preview' | 'minWidth' | 'placeholder' | 'onOpenChange'>) {
  const id = useId();
  const h = useHelp(f.key, help);
  const v = useField(f);
  return (
    <Frame
      id={id} label={label} h={h} more={more}
      field={<Picker<T> {...pick} id={id} label={label} labelId={id + 'l'} describedBy={h?.hintId} value={v} options={toPickOpts(opts)}
        onChange={nv => { edit(r => f.set(r, nv), f.key); onPick?.(nv); }} />}
      labelTag="span"
    />
  );
}

/**
 * One choice among a few, all in view (a radio group: one Tab stop, arrow keys move and choose).
 * The group wraps rather than clipping; `desc` explains the chosen option under it.
 */
export function Seg<T extends string | number>({ f, label, opts, onPick, help, desc, icons, activate }: Partial<Framed> & {
  f: Field<T>; opts: Array<[T, string]>; onPick?: (v: T) => void;
  /** One line per option: the chosen one is said under the group. */
  desc?: Partial<Record<T, string>>;
  icons?: Partial<Record<T, ReactNode>>;
  /** 'manual' when choosing does more than set a value (opens a file picker): arrows only move, Enter or Space choose. */
  activate?: 'auto' | 'manual';
}) {
  const v = useField(f);
  const id = useId();
  const h = useHelp(label ? f.key : undefined, help);
  const said = v !== undefined ? desc?.[v] : undefined;
  // what the chosen option does: a new line resolves out of glyphs
  const saidRef = useScramble<HTMLParagraphElement>(said);
  const group = (
    <SegGroup label={label} labelId={label ? id + 'l' : undefined} value={v} opts={opts} icons={icons} activate={activate} describedBy={[h?.hintId, said ? id + 'd' : ''].filter(Boolean).join(' ') || undefined}
      onPick={val => { edit(r => f.set(r, val), f.key); onPick?.(val); }} />
  );
  if (!label) return <div className="ctl cx seg-only">{group}{said && <p className="seg-desc" id={id + 'd'} ref={saidRef}>{said}</p>}</div>;
  return (
    <Frame id={id} label={label} h={h} labelTag="span"
      field={<>{group}{said && <p className="seg-desc" id={id + 'd'} ref={saidRef}>{said}</p>}</>} />
  );
}

/** The radio group itself (also used outside recipe settings). */
export function SegGroup<T extends string | number>({ label, labelId, value, opts, icons, onPick, describedBy, className, activate }: {
  label?: string; labelId?: string; value: T | undefined; opts: Array<[T, string]>; icons?: Partial<Record<T, ReactNode>>;
  onPick: (v: T) => void; describedBy?: string; className?: string; activate?: 'auto' | 'manual';
}) {
  return (
    <ScrollRow role="radiogroup" activate={activate} className={'seg' + (className ? ' ' + className : '')} aria-labelledby={labelId} aria-label={labelId ? undefined : label} aria-describedby={describedBy}>
      {opts.map(([val, name]) => (
        <button key={String(val)} type="button" role="radio" aria-checked={value === val} onClick={() => onPick(val)}>
          {icons?.[val] && <span className="seg-ic" aria-hidden="true">{icons[val]}</span>}{name}
        </button>
      ))}
    </ScrollRow>
  );
}

export function Toggle({ f, label, help }: Framed & { f: Field<boolean> }) {
  const v = !!useField(f);
  const h = useHelp(f.key, help);
  return (
    <div className={'toggle-row' + (h ? ' has-help' : '')}>
      <label className="toggle" {...h?.hover}>
        <span>{label}</span>
        <span className="switch"><input type="checkbox" role="switch" checked={v} aria-describedby={h?.hintId} {...h?.focus} onChange={e => edit(r => f.set(r, e.target.checked), f.key)} /><span /></span>
      </label>
      {h && <HelpToggle h={h} name={label} />}
      <HintText h={h} />
      <HelpMore h={h} />
    </div>
  );
}

export function Text({ f, label, area, mono, rows = 3, placeholder, help, helpKey }: Framed & { f: Field<string>; area?: boolean; mono?: boolean; rows?: number; placeholder?: string; helpKey?: string }) {
  const id = useId();
  const h = useHelp(helpKey ?? f.key, help);
  const v = useField(f) ?? '';
  const onChange = (val: string) => edit(r => f.set(r, val), f.key);
  const maxLength = ({ 'text.content': 600, 'msg.text': 1200, 'glyph.words': 2000, 'glyph.charset': 400 } as Record<string, number>)[f.key];
  const common = { id, maxLength, value: v, spellCheck: false, placeholder, 'aria-describedby': h?.hintId, ...h?.focus };
  return (
    <Frame id={id} label={maxLength ? `${label} · ${v.length}/${maxLength}` : label} h={h}
      field={area
        ? <textarea {...common} className={mono ? 'mono' : ''} rows={rows} onChange={e => onChange(e.target.value)} />
        : <input {...common} type="text" className={mono ? 'mono' : ''} autoComplete="off" onChange={e => onChange(e.target.value)} />} />
  );
}

/** A colour of the recipe, edited with the studio's own colour editor (ui/color): the same on every device. */
export function Color({ f, label, help }: Framed & { f: Field<string> }) {
  const id = useId();
  const h = useHelp(f.key, help);
  const v = useField(f) ?? '#000000';
  const stops = useStudio(s => s.entries[s.cursor]?.recipe.color.stops);
  return (
    <Frame id={id} label={label} h={h} className="ctl-color" labelTag="span"
      field={<ColorField value={v} label={label} labelId={id + 'l'} describedBy={h?.hintId} swatches={stops} onChange={hex => edit(r => f.set(r, hex), f.key)} />} />
  );
}

export const Sub = ({ children }: { children: ReactNode }) => <h3 className="sub">{children}</h3>;
export const Note = ({ children }: { children: ReactNode }) => <p className="note">{children}</p>;
