/**
 * Finishes of a layer (src/fx): the catalogue grouped as the fx lane made it (tramado, tono, luz,
 * movimiento, textura, color), each with a small picture of it on this piece; the layer's list with
 * on/off, amount, order and its params (ParamDef, hidden when they do not apply: paramVisible).
 */
import { useEffect, useRef, useState } from 'react';
import { applyFinishes, defaultFinish, FINISHES, finishWeight, paramVisible, resolveParams, type FinishDef } from '../../fx/index';
import { updateLayer } from '../../project/store';
import type { Finish, FinishKind, Layer } from '../../project/types';
import { syntheticPhoto } from '../../shared/sample';
import { IDown, ITrash, IUp, IPlus } from '../../studio/icons';
import { ParamControl, Section, Slider } from '../controls';
import { say } from '../ui';

const GROUPS: Array<[FinishDef['group'], string]> = [['tramado', 'Tramado'], ['tono', 'Tono'], ['luz', 'Luz'], ['movimiento', 'Movimiento'], ['textura', 'Textura'], ['color', 'Color']];
const WEIGHT: Record<string, string> = { light: 'ligero', medium: 'medio', heavy: 'pesado' };
const pct = (v: number) => Math.round(v * 100) + ' %';

export function Finishes({ l }: { l: Layer }) {
  const [adding, setAdding] = useState(false);
  const setF = (i: number, fn: (f: Finish) => void, key = '') => updateLayer(l.id, x => { const f = x.finishes[i]; if (f) fn(f); }, key ? `fin${i}.${key}` : '');
  const add = (kind: FinishKind) => {
    updateLayer(l.id, x => { x.finishes = [...x.finishes, defaultFinish(kind)]; });
    setAdding(false);
    say(`Acabado «${FINISHES.find(f => f.kind === kind)?.name}» añadido a «${l.name}».`);
  };
  return (
    <Section title="Acabados" count={l.finishes.length || undefined}
      extra={<button type="button" className="mini fsec-add" aria-expanded={adding} onClick={() => setAdding(!adding)}><IPlus width={14} height={14} /> Añadir</button>}>
      {adding && <Catalog onPick={add} onClose={() => setAdding(false)} />}
      {!l.finishes.length && !adding && <p className="note">Tramado, semitono, grano, brillo, sombra, desenfoque de movimiento, paletas… sobre los píxeles de esta capa, antes de su máscara.</p>}
      <ol className="fins">
        {l.finishes.map((f, i) => <FinishRow key={i} f={f} i={i} n={l.finishes.length} setF={setF} l={l} />)}
      </ol>
    </Section>
  );
}

function FinishRow({ f, i, n, setF, l }: { f: Finish; i: number; n: number; setF: (i: number, fn: (f: Finish) => void, key?: string) => void; l: Layer }) {
  const [open, setOpen] = useState(false);
  const def = FINISHES.find(d => d.kind === f.kind);
  const values = resolveParams(def, f.params);
  const move = (d: number) => updateLayer(l.id, x => { const j = i + d; if (j < 0 || j >= x.finishes.length) return; [x.finishes[i], x.finishes[j]] = [x.finishes[j], x.finishes[i]]; });
  const w = finishWeight(f);
  return (
    <li className={'fin' + (f.on ? '' : ' off')}>
      <div className="fin-h">
        <label className="switch sm" title={f.on ? 'Apagar' : 'Encender'}>
          <input type="checkbox" role="switch" checked={f.on} aria-label={`${def?.name ?? f.kind} encendido`} onChange={e => setF(i, x => { x.on = e.target.checked; })} /><span />
        </label>
        <button type="button" className="fin-name" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span>{def?.name ?? f.kind}</span><small>{pct(f.amount)} · {WEIGHT[w] ?? w}</small>
        </button>
        <button type="button" className="icon-btn" disabled={i === 0} aria-label={`Subir ${def?.name}`} title="Antes (se aplica primero)" onClick={() => move(-1)}><IUp /></button>
        <button type="button" className="icon-btn" disabled={i === n - 1} aria-label={`Bajar ${def?.name}`} title="Después" onClick={() => move(1)}><IDown /></button>
        <button type="button" className="icon-btn" aria-label={`Quitar ${def?.name}`} title="Quitar" onClick={() => updateLayer(l.id, x => { x.finishes = x.finishes.filter((_, j) => j !== i); })}><ITrash /></button>
      </div>
      {open && (
        <div className="fin-b">
          {def && <p className="note">{def.blurb}</p>}
          <Slider label="Cantidad" value={f.amount} min={0} max={1} def={1} fmt={pct} onChange={v => setF(i, x => { x.amount = v; }, 'amount')} />
          {def?.params.filter(p => paramVisible(p, values)).map(p => (
            <ParamControl key={p.key} def={p} value={f.params[p.key] ?? values[p.key]} onChange={v => setF(i, x => { x.params = { ...x.params, [p.key]: v }; }, 'p.' + p.key)} />
          ))}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ the catalogue with pictures */

const TW = 96, TH = 64;
const thumbCache = new Map<string, string>();

/** The piece as it is now (the viewport's art), cropped to a small card; a sample landscape without one. */
function baseCard(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TW; c.height = TH;
  const x = c.getContext('2d')!;
  const art = document.querySelector<HTMLCanvasElement>('.fv-art');
  const src: HTMLCanvasElement = art && art.width > 8 ? art : syntheticPhoto();
  const k = Math.max(TW / src.width, TH / src.height);
  const w = src.width * k, h = src.height * k;
  x.drawImage(src, (TW - w) / 2, (TH - h) / 2, w, h);
  return c;
}

function Catalog({ onPick, onClose }: { onPick: (k: FinishKind) => void; onClose: () => void }) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('button')?.focus();
    let gone = false;
    const base = baseCard();
    const key = base.toDataURL('image/png').slice(-64);
    let i = 0;
    // one at a time, between frames: the catalogue shows at once and fills in
    const step = () => {
      if (gone || i >= FINISHES.length) return;
      const d = FINISHES[i++];
      const k = `${key}|${d.kind}`;
      let url = thumbCache.get(k);
      if (!url) {
        try {
          const out = applyFinishes(base, [defaultFinish(d.kind)], { t: 0, seed: 'catalogo', scale: 0.4, quality: 'preview' }, 'foto-catalogo');
          url = out.toDataURL('image/png');
          thumbCache.set(k, url);
        } catch { url = ''; }
      }
      const u = url;
      setThumbs(s => ({ ...s, [d.kind]: u }));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return () => { gone = true; };
  }, []);
  return (
    <div className="fcat" ref={box} role="group" aria-label="Catálogo de acabados" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      {GROUPS.map(([g, name]) => (
        <div key={g} className="fcat-g">
          <h4>{name}</h4>
          <div className="fcat-row">
            {FINISHES.filter(f => f.group === g).map(f => (
              <button key={f.kind} type="button" className="fcat-item" title={f.blurb} onClick={() => onPick(f.kind)}>
                <span className="fcat-img" style={thumbs[f.kind] ? { backgroundImage: `url(${JSON.stringify(thumbs[f.kind])})` } : undefined} aria-hidden="true" />
                <span className="fcat-name">{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="btn ghost" onClick={onClose}>Cerrar el catálogo</button>
    </div>
  );
}
