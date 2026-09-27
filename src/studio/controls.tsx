import { useId, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_LAYER, defaultRecipe, type Recipe } from '../engine/recipe';
import { edit, useStudio } from './store';

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

export function Slider({ f, label, min, max, step = 0.01, fmt, title }: {
  f: Field<number>; label: string; min: number; max: number; step?: number; fmt?: (v: number) => string; title?: string;
}) {
  const id = useId();
  const v = useField(f) ?? min;
  const pct = Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const reset = () => { const d = defaultOf(f); if (typeof d === 'number') edit(r => f.set(r, d), f.key + ':reset'); };
  return (
    <div className="ctl">
      <label className="lbl" htmlFor={id} data-reset onDoubleClick={reset} title={title ?? 'Doble clic para restablecer'}>{label}</label>
      <output htmlFor={id}>{fmt ? fmt(v) : fmtNum(v, step)}</output>
      <input
        id={id} type="range" min={min} max={max} step={step} value={v}
        style={{ '--p': pct + '%' } as CSSProperties}
        onChange={e => edit(r => f.set(r, parseFloat(e.target.value)), f.key)}
      />
    </div>
  );
}

export type Opt<T> = [T, string] | { group: string; opts: Array<[T, string]> };

export function Select<T extends string | number>({ f, label, opts, onPick }: { f: Field<T>; label: string; opts: Opt<T>[]; onPick?: (v: T) => void }) {
  const id = useId();
  const v = useField(f);
  const flat: Array<[T, string]> = opts.flatMap(o => (Array.isArray(o) ? [o] : o.opts));
  const idx = flat.findIndex(o => o[0] === v);
  let k = 0;
  return (
    <div className="ctl">
      <label className="lbl" htmlFor={id}>{label}</label>
      <select id={id} value={String(Math.max(0, idx))} onChange={e => { const nv = flat[+e.target.value][0]; edit(r => f.set(r, nv), f.key); onPick?.(nv); }}>
        {idx < 0 && <option value="-1" disabled>—</option>}
        {opts.map((o, gi) => Array.isArray(o)
          ? <option key={gi} value={k++}>{o[1]}</option>
          : <optgroup key={gi} label={o.group}>{o.opts.map(x => <option key={k} value={k++}>{x[1]}</option>)}</optgroup>)}
      </select>
    </div>
  );
}

export function Seg<T extends string | number>({ f, label, opts, onPick }: { f: Field<T>; label?: string; opts: Array<[T, string]>; onPick?: (v: T) => void }) {
  const v = useField(f);
  const id = useId();
  return (
    <div className="ctl">
      {label && <span className="lbl" id={id}>{label}</span>}
      <div className="seg" role="group" aria-labelledby={label ? id : undefined}>
        {opts.map(([val, name]) => (
          <button key={String(val)} type="button" aria-pressed={v === val} onClick={() => { edit(r => f.set(r, val), f.key); onPick?.(val); }}>{name}</button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ f, label }: { f: Field<boolean>; label: string }) {
  const v = !!useField(f);
  return (
    <label className="toggle">
      <span>{label}</span>
      <span className="switch"><input type="checkbox" role="switch" checked={v} onChange={e => edit(r => f.set(r, e.target.checked), f.key)} /><span /></span>
    </label>
  );
}

export function Text({ f, label, area, mono, rows = 3, placeholder }: { f: Field<string>; label: string; area?: boolean; mono?: boolean; rows?: number; placeholder?: string }) {
  const id = useId();
  const v = useField(f) ?? '';
  const onChange = (val: string) => edit(r => f.set(r, val), f.key);
  return (
    <div className="ctl">
      <label className="lbl" htmlFor={id}>{label}</label>
      {area
        ? <textarea id={id} className={mono ? 'mono' : ''} rows={rows} value={v} spellCheck={false} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
        : <input id={id} type="text" className={mono ? 'mono' : ''} value={v} spellCheck={false} autoComplete="off" placeholder={placeholder} onChange={e => onChange(e.target.value)} />}
    </div>
  );
}

export function Color({ f, label }: { f: Field<string>; label: string }) {
  const id = useId();
  const v = useField(f) ?? '#000000';
  return (
    <div className="ctl">
      <label className="lbl" htmlFor={id}>{label}</label>
      <span className="row">
        <span className="val">{v.toUpperCase()}</span>
        <span className="swatch" style={{ background: v }}><input id={id} type="color" value={v} onChange={e => edit(r => f.set(r, e.target.value), f.key)} /></span>
      </span>
    </div>
  );
}

export const Sub = ({ children }: { children: ReactNode }) => <h3 className="sub">{children}</h3>;
export const Note = ({ children }: { children: ReactNode }) => <p className="note">{children}</p>;
