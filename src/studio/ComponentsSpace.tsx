import { useEffect, useRef, useState } from 'react';
import { COMPONENTS, compById, type CompDef, type Values } from '../components/catalog';
import { copyText, downloadText } from './download';
import { setSpace, setUI, useStudio } from './store';

/** Live mount of a component demo. Re-mounts when its values change. */
function Demo({ def, values, big }: { def: CompDef; values: Values; big?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(values);
  useEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    stage.innerHTML = '';
    let ctl: { destroy(): void } | null = null;
    try { ctl = def.mount(stage, values, !!big); } catch (e) { stage.textContent = String(e); }
    return () => { ctl?.destroy(); stage.innerHTML = ''; };
  }, [def, key, big]);
  return <div ref={ref} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }} />;
}

export function ComponentsSpace() {
  const sel = useStudio(s => s.ui.component);
  const def = compById(sel);
  return (
    <div className="comp-wrap">
      {def ? <Detail def={def} /> : <Gallery />}
    </div>
  );
}

function Gallery() {
  const thumb = useStudio(s => s.entries[s.cursor]?.thumb);
  return (
    <div className="comp-grid" style={{ marginTop: 4 }}>
      <div style={{ gridColumn: '1 / -1', margin: '6px 0 6px' }}>
        <p className="eyebrow">Biblioteca</p>
        <h1 style={{ font: '700 clamp(22px,3vw,34px)/1.1 var(--font-display)', letterSpacing: '-.03em', margin: '0 0 8px' }}>Piezas listas para tu proyecto</h1>
        <p className="note" style={{ maxWidth: '62ch', margin: 0 }}>Cada pieza se personaliza aquí y se lleva como código que funciona: HTML para pegar, módulo ES, componente de React o, si es para la consola, Node, Python y Bash. Sin dependencias.</p>
      </div>
      <button type="button" className="comp-card" onClick={() => { setSpace('fondos'); setUI({ sheet: 'export' }); }}>
        <div className="comp-demo" style={thumb ? { backgroundImage: `url(${thumb})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} />
        <div className="txt"><h3>Fondo animado</h3><p>El motor completo como fondo, portada o bloque. Diséñalo en «Fondos» y exporta HTML, Web Component o React.</p></div>
      </button>
      <button type="button" className="comp-card" onClick={() => setSpace('media')}>
        <div className="comp-demo"><span style={{ font: '500 11px/1.1 var(--font-mono)', color: 'var(--smoke)', whiteSpace: 'pre', textAlign: 'center' }}>{'  .:-=+*#%@@%#*+=-:.  \n .:=*#%@@@@@@%#*=:. \n.:=*#%@@@@@@@@%#*=:.\n .:=*#%@@@@@@%#*=:. \n  .:-=+*#%@@%#*+=-:.  '}</span></div>
        <div className="txt"><h3>Imagen ASCII</h3><p>Tu foto o video en caracteres, con lupa o borrador que revela el original. Exporta como elemento web.</p></div>
      </button>
      {COMPONENTS.map(c => (
        <button key={c.id} type="button" className="comp-card" onClick={() => setUI({ component: c.id })}>
          <div className="comp-demo"><Demo def={c} values={c.defaults} /></div>
          <div className="txt"><h3>{c.name}</h3><p>{c.blurb}</p></div>
        </button>
      ))}
    </div>
  );
}

function Detail({ def }: { def: CompDef }) {
  const [values, setValues] = useState<Values>(def.defaults);
  const [tab, setTab] = useState('html');
  useEffect(() => { setValues(def.defaults); }, [def]);
  const tabs = def.code(values);
  const cur = tabs.find(t => t.id === tab) ?? tabs[0];
  const set = (k: string, v: string | number | boolean) => setValues(o => ({ ...o, [k]: v }));
  return (
    <div className="comp-detail">
      <button type="button" className="back-link" onClick={() => setUI({ component: null })}>← Todas las piezas</button>
      <div className="row" style={{ alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h1 style={{ font: '700 26px/1.1 var(--font-display)', letterSpacing: '-.03em', margin: 0 }}>{def.name}</h1>
        <span className="note" style={{ margin: 0 }}>{def.tags.join(' · ')}</span>
      </div>
      <p className="note" style={{ maxWidth: '70ch' }}>{def.blurb}</p>
      <div className="comp-layout">
        <div>
          <div className="comp-stage"><Demo def={def} values={values} big /></div>
          <div className="sheet-tabs" role="tablist" style={{ padding: 0, marginBottom: 10 }}>
            {tabs.map(t => <button key={t.id} type="button" role="tab" className="tab" aria-selected={cur.id === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </div>
          <textarea className="code" readOnly value={cur.code} aria-label={'Código: ' + cur.label} onFocus={e => e.currentTarget.select()} />
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn primary" style={{ width: 'auto', margin: 0 }} onClick={() => void copyText(cur.code, 'Código copiado')}>Copiar</button>
            {cur.file && <button type="button" className="btn" style={{ width: 'auto', margin: 0 }} onClick={() => downloadText(cur.file!, cur.code)}>Descargar {cur.file}</button>}
          </div>
        </div>
        <aside className="comp-controls" aria-label="Personalizar">
          <p className="eyebrow">Personalizar</p>
          {def.params.map(p => <ParamCtl key={p.key} p={p} v={values[p.key]} onChange={v => set(p.key, v)} />)}
          <button type="button" className="btn ghost" onClick={() => setValues(def.defaults)}>Restablecer</button>
        </aside>
      </div>
    </div>
  );
}

function ParamCtl({ p, v, onChange }: { p: CompDef['params'][number]; v: string | number | boolean; onChange: (v: string | number | boolean) => void }) {
  const id = 'cp-' + p.key;
  if (p.type === 'range') {
    const n = Number(v);
    const pct = ((n - (p.min ?? 0)) / ((p.max ?? 1) - (p.min ?? 0))) * 100;
    return (
      <div className="ctl">
        <label className="lbl" htmlFor={id}>{p.label}</label><output>{Number.isInteger(p.step) ? n : n.toFixed(2)}</output>
        <input id={id} type="range" min={p.min} max={p.max} step={p.step} value={n} style={{ '--p': pct + '%' } as React.CSSProperties} onChange={e => onChange(parseFloat(e.target.value))} />
      </div>
    );
  }
  if (p.type === 'select') return (
    <div className="ctl"><label className="lbl" htmlFor={id}>{p.label}</label>
      <select id={id} value={String(v)} onChange={e => onChange(e.target.value)}>{p.opts!.map(([val, name]) => <option key={val} value={val}>{name}</option>)}</select></div>
  );
  if (p.type === 'color') return (
    <div className="ctl"><label className="lbl" htmlFor={id}>{p.label}</label>
      <span className="row"><span className="val">{String(v).toUpperCase()}</span><span className="swatch" style={{ background: String(v) }}><input id={id} type="color" value={String(v) || '#ffffff'} onChange={e => onChange(e.target.value)} /></span></span></div>
  );
  if (p.type === 'area') return (
    <div className="ctl"><label className="lbl" htmlFor={id}>{p.label}</label><textarea id={id} rows={3} value={String(v)} onChange={e => onChange(e.target.value)} /></div>
  );
  if (p.type === 'toggle') return (
    <label className="toggle"><span>{p.label}</span><span className="switch"><input type="checkbox" role="switch" checked={!!v} onChange={e => onChange(e.target.checked)} /><span /></span></label>
  );
  return <div className="ctl"><label className="lbl" htmlFor={id}>{p.label}</label><input id={id} type="text" className="mono" value={String(v)} onChange={e => onChange(e.target.value)} /></div>;
}
