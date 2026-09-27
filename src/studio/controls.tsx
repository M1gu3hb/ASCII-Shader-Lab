import { useId, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_LAYER, defaultRecipe, type Recipe } from '../engine/recipe';
import { edit, useStudio } from './store';
import { HelpMore, HelpToggle, HintText, useHelp, type Help } from './ui/Help';
import type { HelpText } from './ui/copy';
import { Picker, type PickOpt, type PickerProps } from './ui/Picker';
import { ScrollRow } from './ui/ScrollRow';

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

function Frame({ id, label, h, value, field, more, className, labelTag = 'label', onDoubleClick }: {
  id: string; label: string; h: Help | null; value?: ReactNode; field: ReactNode; more?: ReactNode; className?: string;
  labelTag?: 'label' | 'span'; onDoubleClick?: () => void;
}) {
  const Lbl = labelTag;
  return (
    <div className={'ctl cx' + (h ? ' has-help' : '') + (value !== undefined ? ' has-val' : '') + (className ? ' ' + className : '')}>
      <Lbl className="lbl" {...(labelTag === 'label' ? { htmlFor: id } : { id: id + 'l' })} {...h?.hover}
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

export function Slider({ f, label, min, max, step = 0.01, fmt, help, compare }: Framed & {
  f: Field<number>; min: number; max: number; step?: number; fmt?: (v: number) => string;
  /** Visual examples shown with the explanation (e.g. a CompareStrip). */
  compare?: ReactNode;
}) {
  const id = useId();
  const h = useHelp(f.key, help);
  const v = useField(f) ?? min;
  const pct = Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const d = defaultOf(f);
  const reset = () => { if (typeof d === 'number') edit(r => f.set(r, d), f.key + ':reset'); };
  const show = (x: number) => (fmt ? fmt(x) : fmtNum(x, step));
  return (
    <Frame
      id={id} label={label} h={h} onDoubleClick={reset}
      value={<output htmlFor={id}>{show(v)}</output>}
      field={(
        <input
          id={id} type="range" min={min} max={max} step={step} value={v} aria-describedby={h?.hintId} {...h?.focus}
          style={{ '--p': pct + '%' } as CSSProperties}
          onChange={e => edit(r => f.set(r, parseFloat(e.target.value)), f.key)}
        />
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
  const group = (
    <SegGroup label={label} labelId={label ? id + 'l' : undefined} value={v} opts={opts} icons={icons} activate={activate} describedBy={[h?.hintId, said ? id + 'd' : ''].filter(Boolean).join(' ') || undefined}
      onPick={val => { edit(r => f.set(r, val), f.key); onPick?.(val); }} />
  );
  if (!label) return <div className="ctl cx seg-only">{group}{said && <p className="seg-desc" id={id + 'd'}>{said}</p>}</div>;
  return (
    <Frame id={id} label={label} h={h} labelTag="span"
      field={<>{group}{said && <p className="seg-desc" id={id + 'd'}>{said}</p>}</>} />
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
  const common = { id, value: v, spellCheck: false, placeholder, 'aria-describedby': h?.hintId, ...h?.focus };
  return (
    <Frame id={id} label={label} h={h}
      field={area
        ? <textarea {...common} className={mono ? 'mono' : ''} rows={rows} onChange={e => onChange(e.target.value)} />
        : <input {...common} type="text" className={mono ? 'mono' : ''} autoComplete="off" onChange={e => onChange(e.target.value)} />} />
  );
}

export function Color({ f, label, help }: Framed & { f: Field<string> }) {
  const id = useId();
  const h = useHelp(f.key, help);
  const v = useField(f) ?? '#000000';
  return (
    <Frame id={id} label={label} h={h} className="ctl-color"
      value={(
        <span className="row">
          <span className="val">{v.toUpperCase()}</span>
          <span className="swatch" style={{ background: v }}><input id={id} type="color" value={v} aria-describedby={h?.hintId} {...h?.focus} onChange={e => edit(r => f.set(r, e.target.value), f.key)} /></span>
        </span>
      )}
      field={null} />
  );
}

export const Sub = ({ children }: { children: ReactNode }) => <h3 className="sub">{children}</h3>;
export const Note = ({ children }: { children: ReactNode }) => <p className="note">{children}</p>;
