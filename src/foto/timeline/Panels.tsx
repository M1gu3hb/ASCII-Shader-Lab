/**
 * The timeline's popovers: a clip (its template's params, start, length, reverse, repeats, ping-pong,
 * speed curve) and a keyframe (value, time, the curve to the next key). Params are drawn from the
 * template's TemplateParamDefs, including the clip-only kinds 'text' and 'list'.
 */
import { useId, type ReactNode } from 'react';
import { listItems, type ParamValue, type TemplateDef, type TemplateParamDef } from '../../project/clips';
import type { AnimClip, Ease, Key } from '../../project/types';
import type { PathInfo } from '../../anim/keys';
import { EasePicker } from './EasePicker';
import { formatTime } from './math';

const visible = (d: TemplateParamDef, values: Record<string, ParamValue>) => {
  if (!d.when) return true;
  return Object.entries(d.when).every(([k, allowed]) => (allowed.length ? allowed.includes(values[k] as string | boolean) : Number(values[k]) > 0));
};
const num = (v: number, step: number) => (step >= 1 ? String(Math.round(v)) : v.toFixed(step >= 0.1 ? 1 : 2));

export function ParamField({ def, value, onChange }: { def: TemplateParamDef; value: ParamValue; onChange: (v: ParamValue, commit: boolean) => void }) {
  const id = useId();
  const help = 'help' in def && def.help ? <span className="help">{def.help}</span> : null;
  switch (def.type) {
    case 'range': {
      const v = typeof value === 'number' ? value : def.def;
      return (
        <div className="row">
          <label htmlFor={id}>{def.label}</label>
          <output htmlFor={id}>{num(v, def.step)}{def.unit ? ` ${def.unit}` : ''}</output>
          <input id={id} type="range" min={def.min} max={def.max} step={def.step} value={v}
            onChange={e => onChange(Number(e.target.value), false)} onPointerUp={e => onChange(Number((e.target as HTMLInputElement).value), true)} onKeyUp={e => onChange(Number((e.target as HTMLInputElement).value), true)} />
          {help}
        </div>
      );
    }
    case 'select':
      return (
        <div className="row">
          <label htmlFor={id}>{def.label}</label>
          <select id={id} value={String(value)} onChange={e => onChange(e.target.value, true)}>
            {def.options.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
          </select>
          {help}
        </div>
      );
    case 'toggle':
      return (
        <div className="row">
          <span className="lbl" id={id}>{def.label}</span>
          <button type="button" className="toggle" role="switch" aria-checked={!!value} aria-labelledby={id} onClick={() => onChange(!value, true)} />
          {help}
        </div>
      );
    case 'color':
      return (
        <div className="row">
          <label htmlFor={id}>{def.label}</label>
          <input id={id} type="color" value={/^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : def.def} onChange={e => onChange(e.target.value, false)} onBlur={e => onChange(e.target.value, true)} />
          {help}
        </div>
      );
    case 'text':
      return (
        <div className="row">
          <label htmlFor={id}>{def.label}</label>
          <input id={id} type="text" maxLength={def.max} value={String(value ?? '')} style={{ width: def.max <= 4 ? '5em' : '11em' }}
            onChange={e => onChange(e.target.value, false)} onBlur={e => onChange(e.target.value, true)} />
          {help}
        </div>
      );
    case 'list': {
      const items = listItems(value);
      const name = (k: string) => def.options.find(o => o[0] === k)?.[1] ?? k;
      const set = (list: string[]) => onChange(list.join(','), true);
      return (
        <div className="row">
          <span className="lbl" id={id}>{def.label}</span>
          <span className="lbl">{items.length} de {def.max}</span>
          <div className="tl-chips" role="list" aria-labelledby={id}>
            {items.map((k, i) => (
              <span className="tl-chip" role="listitem" key={`${k}-${i}`}>
                {i + 1}. {name(k)}
                <button type="button" aria-label={`Mover «${name(k)}» antes`} disabled={i === 0} onClick={() => { const l = [...items]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; set(l); }}>‹</button>
                <button type="button" aria-label={`Quitar «${name(k)}»`} disabled={items.length <= def.min} onClick={() => set(items.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
          </div>
          <select aria-label={`Añadir a ${def.label.toLowerCase()}`} value="" disabled={items.length >= def.max} onChange={e => { if (e.target.value) set([...items, e.target.value]); }} style={{ gridColumn: '1 / -1', maxWidth: 'none' }}>
            <option value="">Añadir…</option>
            {def.options.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          {help}
        </div>
      );
    }
  }
}

export interface ClipActions {
  param(key: string, v: ParamValue, commit: boolean): void;
  timing(start: number, dur: number): void;
  reverse(v: boolean): void;
  loop(repeat: number, pingpong: boolean): void;
  ease(e: Ease, commit?: boolean): void;
  duplicate(): void;
  remove(): void;
  close(): void;
}

export function ClipPanel({ clip, def, params, a }: { clip: AnimClip; def: TemplateDef | undefined; params: Record<string, ParamValue>; a: ClipActions }) {
  return (
    <Panel title={def?.name ?? clip.template} sub={def ? def.blurb : 'Esta plantilla no está en esta versión: el clip se conserva pero no hace nada.'} onClose={a.close}>
      <div className="nums">
        <label>Empieza (s)<input type="number" min={0} step={0.05} value={round(clip.start)} onChange={e => a.timing(Math.max(0, Number(e.target.value) || 0), clip.dur)} /></label>
        <label>Dura (s)<input type="number" min={0.05} step={0.05} value={round(clip.dur)} onChange={e => a.timing(clip.start, Math.max(0.05, Number(e.target.value) || 0.05))} /></label>
      </div>
      <div className="row">
        <span className="lbl" id="tl-rev">Al revés <span className="help" style={{ display: 'block' }}>Los mismos cuadros, del último al primero.</span></span>
        <button type="button" className="toggle" role="switch" aria-checked={clip.reverse} aria-labelledby="tl-rev" onClick={() => a.reverse(!clip.reverse)} />
      </div>
      <div className="row">
        <label htmlFor="tl-rep">Repeticiones</label>
        <input id="tl-rep" type="number" min={1} max={100} step={1} value={clip.repeat} style={{ width: '5em' }} onChange={e => a.loop(Number(e.target.value) || 1, clip.pingpong)} />
      </div>
      <div className="row">
        <span className="lbl" id="tl-pp">Ida y vuelta <span className="help" style={{ display: 'block' }}>Cada repetición par corre hacia atrás.</span></span>
        <button type="button" className="toggle" role="switch" aria-checked={clip.pingpong} aria-labelledby="tl-pp" onClick={() => a.loop(Math.max(clip.pingpong ? clip.repeat : 2, clip.repeat), !clip.pingpong)} />
      </div>
      {def && def.params.length > 0 && <hr />}
      {def?.params.filter(p => visible(p, params)).map(p => (
        <ParamField key={p.key} def={p} value={params[p.key]} onChange={(v, commit) => a.param(p.key, v, commit)} />
      ))}
      <hr />
      <div className="lbl" style={{ marginBottom: 6 }}>Velocidad del clip</div>
      <EasePicker value={clip.ease} onChange={a.ease} label="Curva de velocidad del clip" />
      <div className="actions">
        <button type="button" className="tl-btn" onClick={a.duplicate}>Duplicar</button>
        <button type="button" className="tl-btn" onClick={a.remove} style={{ color: '#ff9b85' }}>Eliminar</button>
      </div>
    </Panel>
  );
}

export interface KeyActions {
  value(v: ParamValue, commit: boolean): void;
  time(t: number): void;
  ease(e: Ease, commit?: boolean): void;
  remove(): void;
  close(): void;
}

export function KeyPanel({ info, k, isLast, fps, a }: { info: PathInfo; k: Key; isLast: boolean; fps: number; a: KeyActions }) {
  const id = useId();
  let editor: ReactNode;
  if (info.type === 'number') {
    const v = typeof k.v === 'number' ? k.v : 0;
    const min = info.min ?? 0, max = info.max ?? 1, step = info.step ?? 0.01;
    editor = (
      <div className="row">
        <label htmlFor={id}>Valor</label>
        <input type="number" aria-label="Valor exacto" step={step} value={Number(v.toFixed(4))} style={{ width: '6.5em' }} onChange={e => a.value(Number(e.target.value), true)} />
        <input id={id} type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, v))} onChange={e => a.value(Number(e.target.value), false)}
          onPointerUp={e => a.value(Number((e.target as HTMLInputElement).value), true)} />
      </div>
    );
  } else if (info.type === 'color') {
    editor = <div className="row"><label htmlFor={id}>Color</label><input id={id} type="color" value={/^#[0-9a-f]{6}$/i.test(String(k.v)) ? String(k.v) : '#ede6da'} onChange={e => a.value(e.target.value, false)} onBlur={e => a.value(e.target.value, true)} /></div>;
  } else if (info.options) {
    editor = <div className="row"><label htmlFor={id}>Valor</label><select id={id} value={String(k.v)} onChange={e => a.value(e.target.value, true)}>{info.options.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>;
  } else {
    editor = <div className="row"><label htmlFor={id}>Valor</label><input id={id} type="text" value={String(k.v)} onChange={e => a.value(e.target.value, false)} onBlur={e => a.value(e.target.value, true)} /></div>;
  }
  return (
    <Panel title={`Llave · ${info.label}`} sub={`En ${formatTime(k.t, fps)}. ${info.type === 'number' ? 'Los números se interpolan hasta la llave siguiente.' : 'Cambia de golpe en la llave (o enseguida con «Escalón»).'}`} onClose={a.close}>
      {editor}
      <div className="nums"><label>Tiempo (s)<input type="number" min={0} step={1 / Math.max(1, fps)} value={round(k.t)} onChange={e => a.time(Math.max(0, Number(e.target.value) || 0))} /></label></div>
      <hr />
      <div className="lbl" style={{ marginBottom: 6 }}>{isLast ? 'Curva hacia la llave siguiente (esta es la última: no se usa todavía)' : 'Curva hasta la llave siguiente'}</div>
      <EasePicker value={k.ease} onChange={a.ease} label="Curva hasta la llave siguiente" />
      <div className="actions"><button type="button" className="tl-btn" onClick={a.remove} style={{ color: '#ff9b85' }}>Eliminar llave</button></div>
    </Panel>
  );
}

function Panel({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <button type="button" className="tl-btn close" aria-label="Cerrar" onClick={onClose}>✕</button>
      <h3>{title}</h3>
      <p className="sub">{sub}</p>
      {children}
    </>
  );
}

const round = (v: number) => Math.round(v * 1000) / 1000;
