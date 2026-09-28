/**
 * Small controls for the tools' option bars (and the cutout panel): labelled sliders with mono values,
 * segmented choices, switches and buttons. Every one is at least 44 px tall (touch), keyboard-usable, named.
 */
import { useId, type ReactNode } from 'react';
import './tools.css';

export function Row({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="tl-row" role="group" aria-label={label}>{children}</div>;
}

export function Slider(props: {
  label: string; value: number; min: number; max: number; step: number;
  onChange(v: number): void; onCommit?(v: number): void;
  format?(v: number): string; hint?: string; wide?: boolean;
}) {
  const id = useId();
  const f = props.format ?? ((v: number) => String(v));
  return (
    <label className={'tl-slider' + (props.wide ? ' tl-wide' : '')} htmlFor={id} title={props.hint}>
      <span className="tl-lab">{props.label}</span>
      <input
        id={id} type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        aria-valuetext={f(props.value)}
        onChange={e => props.onChange(Number(e.currentTarget.value))}
        onPointerUp={e => props.onCommit?.(Number(e.currentTarget.value))}
        onKeyUp={e => props.onCommit?.(Number(e.currentTarget.value))}
      />
      <output className="tl-val" htmlFor={id}>{f(props.value)}</output>
    </label>
  );
}

export function Segmented<T extends string>(props: { label: string; value: T; options: Array<{ value: T; label: string; title?: string }>; onChange(v: T): void }) {
  return (
    <div className="tl-seg" role="radiogroup" aria-label={props.label}>
      {props.options.map(o => (
        <button
          key={o.value} type="button" role="radio" aria-checked={props.value === o.value} title={o.title}
          className={props.value === o.value ? 'on' : ''} onClick={() => props.onChange(o.value)}
        >{o.label}</button>
      ))}
    </div>
  );
}

export function Switch(props: { label: string; checked: boolean; onChange(v: boolean): void; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={props.checked} className={'tl-switch' + (props.checked ? ' on' : '')} title={props.hint} onClick={() => props.onChange(!props.checked)}>
      <span className="tl-knob" aria-hidden="true" />{props.label}
    </button>
  );
}

export function Button(props: { children: ReactNode; onClick(): void; primary?: boolean; disabled?: boolean; title?: string; kbd?: string; danger?: boolean; pressed?: boolean; label?: string }) {
  return (
    <button
      type="button" className={'tl-btn' + (props.primary ? ' primary' : '') + (props.danger ? ' danger' : '')} disabled={props.disabled}
      title={props.title} aria-label={props.label} aria-pressed={props.pressed} onClick={props.onClick}
    >
      {props.children}{props.kbd ? <kbd>{props.kbd}</kbd> : null}
    </button>
  );
}

export function Note({ children, tone }: { children: ReactNode; tone?: 'warn' | 'quiet' }) {
  return <p className={'tl-note' + (tone ? ' ' + tone : '')}>{children}</p>;
}

export function Swatch({ color, label }: { color: string; label: string }) {
  return <span className="tl-swatch" role="img" aria-label={label} title={label} style={{ background: color }} />;
}

/** A thin progress bar (value 0..1, or indeterminate) with its label. */
export function Progress({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="tl-progress">
      <div className="tl-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.round(value * 100)}>
        <span style={{ width: value === null ? '30%' : `${Math.round(value * 100)}%` }} className={value === null ? 'indeterminate' : ''} />
      </div>
      <span className="tl-plab">{label}</span>
    </div>
  );
}

export const pct = (v: number) => `${Math.round(v * 100)} %`;
export const px = (v: number) => `${Math.round(v)} px`;
