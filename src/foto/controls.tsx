/**
 * The photo studio's controls: the lab's look (the same markup and classes as src/studio/controls.tsx:
 * «ctl cx», sliders with a readout, radio groups, switches, swatches) but bound to a value and a
 * callback instead of the lab's recipe store. The Picker and ScrollRow are the lab's own (store-agnostic).
 */
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import type { ParamDef } from '../fx/index';
import { Picker, type PickOpt } from '../studio/ui/Picker';
import { ScrollRow } from '../studio/ui/ScrollRow';
import { IPlus } from '../studio/icons';

const fmtNum = (v: number, step: number) => (step >= 1 ? String(Math.round(v)) : step >= 0.1 ? v.toFixed(1) : v.toFixed(2));

export function Slider({ label, value, min, max, step = 0.01, onChange, fmt, def, hint, unit, disabled }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
  fmt?: (v: number) => string; def?: number; hint?: string; unit?: string; disabled?: boolean;
}) {
  const id = useId();
  const v = Number.isFinite(value) ? value : min;
  const pct = Math.max(0, Math.min(100, ((v - min) / (max - min || 1)) * 100));
  const show = (x: number) => (fmt ? fmt(x) : fmtNum(x, step) + (unit ? ` ${unit}` : ''));
  const style = { '--p': pct + '%', ...(def !== undefined && def >= min && def <= max ? { '--d': (def - min) / (max - min || 1) } : {}) } as CSSProperties;
  return (
    <div className="ctl cx has-val">
      <label className="lbl" htmlFor={id} title={hint} onDoubleClick={() => { if (def !== undefined && !disabled) onChange(def); }} data-reset={def !== undefined ? '' : undefined}>{label}</label>
      <output htmlFor={id}>{show(v)}</output>
      <input id={id} type="range" min={min} max={max} step={step} value={v} disabled={disabled} style={style}
        aria-describedby={hint ? id + 'h' : undefined} onChange={e => onChange(parseFloat(e.target.value))} />
      {hint && <p className="fh" id={id + 'h'}>{hint}</p>}
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <label className="toggle" title={hint}>
        <span>{label}</span>
        <span className="switch"><input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-describedby={hint ? id : undefined} onChange={e => onChange(e.target.checked)} /><span /></span>
      </label>
      {hint && <p className="fh" id={id}>{hint}</p>}
    </div>
  );
}

/** One choice among a few (a radio group: one Tab stop, arrows move and choose). */
export function SegGroup<T extends string | number>({ label, value, opts, onPick, className, hideLabel }: {
  label: string; value: T | undefined; opts: Array<[T, ReactNode, string?]>; onPick: (v: T) => void; className?: string; hideLabel?: boolean;
}) {
  const id = useId();
  const group = (
    <ScrollRow role="radiogroup" className={'seg' + (className ? ' ' + className : '')} aria-labelledby={hideLabel ? undefined : id} aria-label={hideLabel ? label : undefined}>
      {opts.map(([val, name, title]) => (
        <button key={String(val)} type="button" role="radio" aria-checked={value === val} title={title} onClick={() => onPick(val)}>{name}</button>
      ))}
    </ScrollRow>
  );
  if (hideLabel) return group;
  return (
    <div className="ctl cx">
      <span className="lbl" id={id}>{label}</span>
      {group}
    </div>
  );
}

export function Select<T extends string | number>({ label, value, options, onChange, minWidth, renderOption }: {
  label: string; value: T; options: PickOpt<T>[]; onChange: (v: T) => void; minWidth?: number;
  renderOption?: (o: PickOpt<T>, s: { active: boolean; selected: boolean }) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="ctl cx">
      <span className="lbl" id={id + 'l'}>{label}</span>
      <Picker<T> id={id} label={label} labelId={id + 'l'} value={value} options={options} onChange={onChange} minWidth={minWidth} renderOption={renderOption} />
    </div>
  );
}

export function ColorInput({ label, value, onChange, allowNone, noneLabel = 'Transparente' }: {
  label: string; value: string | null; onChange: (v: string | null) => void; allowNone?: boolean; noneLabel?: string;
}) {
  const id = useId();
  const v = value ?? '#000000';
  return (
    <div className="ctl cx ctl-color">
      <label className="lbl" htmlFor={id}>{label}</label>
      <span className="row">
        {allowNone && (
          <button type="button" className="mini" aria-pressed={value === null} onClick={() => onChange(value === null ? '#0c0b0a' : null)}>{noneLabel}</button>
        )}
        <span className="val">{value === null ? '—' : v.toUpperCase()}</span>
        <span className={'swatch' + (value === null ? ' none' : '')} style={{ background: value ?? 'transparent' }}>
          <input id={id} type="color" value={v.length === 7 ? v : '#000000'} onChange={e => onChange(e.target.value)} />
        </span>
      </span>
    </div>
  );
}

/** Colour stops (a palette from dark to light): add, change and remove swatches. */
export function ColorStops({ label, stops, onChange, min = 1, max = 6 }: { label: string; stops: string[]; onChange: (v: string[]) => void; min?: number; max?: number }) {
  const id = useId();
  return (
    <div className="ctl cx">
      <span className="lbl" id={id}>{label}</span>
      <div className="colors" role="group" aria-labelledby={id}>
        {stops.map((c, i) => (
          <span key={i} className="swatch" style={{ background: c }}>
            <input type="color" value={c.length === 7 ? c : '#000000'} aria-label={`Color ${i + 1} de ${stops.length}`} onChange={e => { const n = [...stops]; n[i] = e.target.value; onChange(n); }} />
            {stops.length > min && <button type="button" className="x" aria-label={`Quitar el color ${i + 1}`} onClick={() => onChange(stops.filter((_, j) => j !== i))}>×</button>}
          </span>
        ))}
        {stops.length < max && (
          <button type="button" className="mini" aria-label="Añadir un color" title="Añadir un color" onClick={() => onChange([...stops, stops[stops.length - 1] ?? '#ede6da'])}><IPlus width={15} height={15} /></button>
        )}
      </div>
    </div>
  );
}

export function TextField({ label, value, onChange, area, mono, rows = 3, max = 2000, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; area?: boolean; mono?: boolean; rows?: number; max?: number; placeholder?: string; hint?: string;
}) {
  const id = useId();
  const common = { id, value, spellCheck: false, placeholder, maxLength: max, 'aria-describedby': hint ? id + 'h' : undefined };
  return (
    <div className="ctl cx">
      <label className="lbl" htmlFor={id}>{label}</label>
      {area
        ? <textarea {...common} className={mono ? 'mono' : ''} rows={rows} onChange={e => onChange(e.target.value)} />
        : <input {...common} type="text" className={mono ? 'mono' : ''} autoComplete="off" onChange={e => onChange(e.target.value)} />}
      {hint && <p className="fh" id={id + 'h'}>{hint}</p>}
    </div>
  );
}

/** A collapsible group of controls with its heading (the inspector's modules). */
export function Section({ title, children, open: open0 = true, extra, count, className }: { title: string; children: ReactNode; open?: boolean; extra?: ReactNode; count?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(open0);
  const id = useId();
  return (
    <section className={'fsec' + (open ? ' open' : '') + (className ? ' ' + className : '')} aria-labelledby={id + 'h'}>
      <div className="fsec-h">
        <button type="button" id={id + 'h'} className="fsec-t" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          <span className="fsec-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>{title}{count !== undefined && <span className="fsec-n">{count}</span>}
        </button>
        {extra}
      </div>
      <div id={id} className="fsec-b" hidden={!open}>{children}</div>
    </section>
  );
}

/** A control for one param described by the finishes' catalog (ParamDef). */
export function ParamControl({ def, value, onChange }: { def: ParamDef; value: number | string | boolean | undefined; onChange: (v: number | string | boolean) => void }) {
  switch (def.type) {
    case 'range':
      return <Slider label={def.label} value={typeof value === 'number' ? value : def.def} min={def.min} max={def.max} step={def.step} def={def.def} unit={def.unit} hint={def.help} onChange={onChange} />;
    case 'select':
      return <Select label={def.label} value={typeof value === 'string' ? value : def.def} options={def.options.map(([v, l]) => ({ value: v, label: l }))} onChange={onChange} />;
    case 'toggle':
      return <Toggle label={def.label} checked={typeof value === 'boolean' ? value : def.def} hint={def.help} onChange={onChange} />;
    case 'color':
      return <ColorInput label={def.label} value={typeof value === 'string' ? value : def.def} onChange={v => onChange(v ?? def.def)} />;
    default:
      return null;
  }
}

export const Note = ({ children }: { children: ReactNode }) => <p className="note">{children}</p>;
