import { useId, useState } from 'react';
import { familyById } from '../../families/registry';
import { formatParam, normParam, type LayerFam } from '../../families/params';
import type { FamilyMeta, ParamSpec, TextParam } from '../../families/types';
import { F, Note, Select, Seg, Slider, Sub, Toggle, useField } from '../controls';
import { edit, useRecipe, useStudio } from '../store';
import { applyFamilyPreset, engineLayer, newFamilySeed, resetFamily, stepFamily, useFamilyInfo } from '../families';
import { saveFamilyState, dropFamilyState, useCheckpointNote } from '../familyState';
import '../css/families.css';

/**
 * The settings of a layer that draws a visual family (src/families): its presets, its own typed controls,
 * how its run is going (steps, whether the device keeps up, whether the state on stage still comes from the
 * recipe alone), its seed, resolution and brush, and how it works. Everything that changes the piece is a
 * recipe edit with undo; reset and step only act on the stage's run.
 */

const hintOf = (s: ParamSpec) => (s.hint ? { hint: /[.:]$/.test(s.hint) ? s.hint : s.hint + '.' } : null);

function ParamControl({ i, s }: { i: number; s: ParamSpec }) {
  const path = `layers.${i}.fam.p.${s.key}`;
  switch (s.type) {
    case 'number': {
      const span = s.max - s.min;
      return <Slider f={F<number>(path)} label={s.label} min={s.min} max={s.max} step={s.step ?? (span > 20 ? 1 : span / 200)} fmt={v => formatParam(s, v)} help={hintOf(s)} />;
    }
    case 'int':
      return <Slider f={F<number>(path)} label={s.label} min={s.min} max={s.max} step={1} fmt={v => formatParam(s, Math.round(v))} help={hintOf(s)} />;
    case 'choice':
      return s.options.length <= 4
        ? <Seg f={F<string>(path)} label={s.label} opts={s.options.map(o => [o.id, o.label] as [string, string])} help={hintOf(s)} />
        : <Select f={F<string>(path)} label={s.label} opts={s.options.map(o => [o.id, o.label] as [string, string])} help={hintOf(s)} minWidth={240} />;
    case 'bool':
      return <Toggle f={F<boolean>(path)} label={s.label} help={hintOf(s)} />;
    case 'text':
      return <ParamText i={i} s={s} />;
  }
}

/** A text parameter (a grammar): only its allowed characters, with its length limit said. */
function ParamText({ i, s }: { i: number; s: TextParam }) {
  const id = useId();
  const v = (useField(F<string>(`layers.${i}.fam.p.${s.key}`)) ?? s.def) as string;
  return (
    <div className="ctl cx">
      <label className="lbl" htmlFor={id}>{`${s.label} · ${Array.from(v).length}/${s.max}`}</label>
      <input id={id} type="text" className="mono" value={v} maxLength={s.max} spellCheck={false} autoComplete="off" aria-describedby={id + 'h'}
        onChange={e => { const val = normParam(s, e.target.value) as string; edit(r => { const f = r.layers[i]?.fam; if (f) f.p[s.key] = val; }, `layers.${i}.fam.p.${s.key}`); }} />
      {s.hint && <p className="hint-line" id={id + 'h'}>{s.hint}{s.allowed ? ` Caracteres: ${s.allowed.replace(/=;/, '').split('').join(' ')}` : ''}</p>}
    </div>
  );
}

const fmtSteps = (n: number) => n.toLocaleString('es-ES');

function RunPanel({ i, meta, fam }: { i: number; meta: FamilyMeta; fam: LayerFam }) {
  const recipe = useRecipe();
  const playing = useStudio(s => s.playing);
  const info = useFamilyInfo();
  const k = engineLayer(recipe, i);
  const run = info.find(x => x.layer === k);
  const ck = useCheckpointNote(i);
  const status = !run ? 'La capa está oculta: su simulación no corre.'
    : run.failed ? 'Esta familia no pudo calcularse en este navegador. La capa queda vacía.'
    : run.loading ? 'Cargando el modelo…'
    : `Paso ${fmtSteps(run.steps)} · ${run.simT.toFixed(1).replace('.', ',')} s simulados${run.lag ? ' · el equipo no llega: va más despacio que el reloj' : ''}`;
  return (
    <div className="fam-run" role="group" aria-label="Simulación en el escenario">
      <p className="fam-status" aria-live="polite">{status}</p>
      {run?.ckMissing && <Note>El estado guardado de esta capa no está en este navegador: empieza desde su semilla.</Note>}
      {run?.fromCheckpoint && <Note>Continúa desde el estado guardado.</Note>}
      {run?.modified && !run.fromCheckpoint && <Note>Lo que ves ya no sale sólo de la receta (cambios en vivo o trazos). Para conservar este estado exacto, guárdalo; el enlace y la receta lo reconstruyen desde la semilla.</Note>}
      <div className="row">
        <button type="button" className="btn" onClick={() => resetFamily(k)} disabled={k < 0}>Reiniciar</button>
        <button type="button" className="btn" onClick={() => stepFamily(k, Math.max(1, Math.round((meta.budget.rate ?? 30) / 10)))} disabled={k < 0 || playing}
          title={playing ? 'Pausa la pieza para avanzar paso a paso' : 'Avanza una décima de segundo de la simulación'}>Avanzar</button>
        {meta.caps.checkpoint && <button type="button" className="btn" onClick={() => void saveFamilyState(i)} disabled={k < 0 || !run || run.loading}>Guardar estado</button>}
        {fam.ck && <button type="button" className="btn" onClick={() => dropFamilyState(i)}>Quitar estado guardado</button>}
      </div>
      {ck && <p className="fam-status" role="status">{ck}</p>}
    </div>
  );
}

export function FamilyControls({ i }: { i: number }) {
  const pat = useField(F<string>(`layers.${i}.pattern`));
  const fam = useField(F<LayerFam>(`layers.${i}.fam`));
  const loop = useField(F<number>('motion.loop')) ?? 0;
  const [more, setMore] = useState(false);
  const [withLook, setWithLook] = useState(false);
  const meta = pat ? familyById(pat) : undefined;
  if (!meta || !fam) return null;
  const raster = meta.kind !== 'analytic';
  const basic = meta.params.filter(s => !s.advanced), adv = meta.params.filter(s => s.advanced);
  const res = meta.budget.res;
  const resOpts: Array<[number, string]> = res ? [...new Set([res[0], Math.round((res[0] + res[2]) / 2), res[2], Math.round((res[2] + res[1]) / 2), res[1]])].map(v => [v, `${v} filas${v === res[2] ? ' (por defecto)' : ''}`]) : [];
  return (
    <div className="fam">
      <p className="layer-desc">{meta.blurb}</p>
      {!meta.caps.loop && loop > 0 && <Note>«Bucle perfecto» no se aplica a esta capa: evoluciona con memoria y no vuelve a su inicio. El resto de la pieza sí lo usa.</Note>}
      <Sub>Presets</Sub>
      <div className="chips" role="group" aria-label={`Presets de ${meta.name}`}>
        {meta.presets.map(p => (
          <button key={p.id} type="button" className="chip" title={p.desc} onClick={() => applyFamilyPreset(i, p.id, withLook)}>{p.name}</button>
        ))}
      </div>
      <label className="check"><input type="checkbox" checked={withLook} onChange={e => setWithLook(e.target.checked)} /> Con su paleta y sus caracteres</label>
      <p className="hint-line">Un preset cambia los ajustes de esta capa; se deshace como cualquier cambio.</p>
      <Sub>{meta.name}</Sub>
      {basic.map(s => <ParamControl key={s.key} i={i} s={s} />)}
      {adv.length > 0 && (
        <>
          <button type="button" className="linkish" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Menos ajustes' : 'Más ajustes'}</button>
          {more && adv.map(s => <ParamControl key={s.key} i={i} s={s} />)}
        </>
      )}
      {raster && (
        <>
          <Sub>Simulación</Sub>
          <RunPanel i={i} meta={meta} fam={fam} />
          {res && <Select f={F<number>(`layers.${i}.fam.res`)} label="Resolución de la simulación" opts={resOpts} help={{ hint: 'Más filas: más detalle y más trabajo. Cambiarla reinicia la simulación.' }} minWidth={220} />}
          {meta.caps.brushes?.length ? (
            <Seg f={F<string>(`layers.${i}.fam.brush`)} label="Al tocar el escenario"
              opts={[['', 'Nada'] as [string, string], ...meta.caps.brushes.map(b => [b.id, b.label] as [string, string])]}
              desc={Object.fromEntries([['', 'Tocar no cambia la simulación.'], ...meta.caps.brushes.map(b => [b.id, b.hint])])}
              help={{ hint: 'Qué hace tu dedo o el ratón, pulsado, en esta simulación.' }} />
          ) : null}
        </>
      )}
      <div className="row fam-seed">
        <span className="lbl">Semilla <code>{fam.seed}</code></span>
        <button type="button" className="btn" onClick={() => newFamilySeed(i)}>Otra semilla</button>
      </div>
      <details className="fam-how">
        <summary>Cómo funciona</summary>
        <p>{meta.mechanism}</p>
        <p>{meta.time}</p>
        <p>Límites: {meta.budget.limits}</p>
        {meta.caps.basic === 'reduced' && meta.caps.basicNote && <p>{meta.caps.basicNote}</p>}
        <p>Referencias (inspiración; GLYPHOS usa código propio):</p>
        <ul>{meta.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></li>)}</ul>
      </details>
    </div>
  );
}
