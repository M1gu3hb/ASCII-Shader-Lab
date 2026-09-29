/**
 * The mask section of the inspector: whether the mask applies, invert, feather, opacity, how the viewport
 * shows it, and its parts (kind, operation, strength, softness, hide, order, delete, and the numbers of a
 * rectangle or ellipse). Drawing and handles belong to the tools; the numbers are edited here, so a mask
 * can also be made and adjusted with the keyboard alone.
 */
import { useEffect, useState } from 'react';
import { defaultMask } from '../../project/normalize';
import { updateLayer } from '../../project/store';
import type { Layer, Mask, MaskOp, MaskPart, Project } from '../../project/types';
import { IDown, IEye, IEyeOff, ITrash, IUp } from '../../studio/icons';
import { ColorInput, Note, Section, SegGroup, Slider, Toggle } from '../controls';
import { PartIcon } from '../icons';
import { say, setUI, useFoto, type MaskView } from '../ui';

export const PART_NAMES: Record<string, string> = {
  rect: 'Rectángulo', ellipse: 'Elipse', polygon: 'Polígono', stroke: 'Pincelada', raster: 'Máscara pintada', color: 'Por color', gradient: 'Degradado',
};
const RASTER_ORIGIN: Record<string, string> = { paint: 'pintada', object: 'objeto seleccionado', subject: 'sujeto recortado', background: 'fondo recortado', track: 'seguimiento' };
export const OPS: Array<[MaskOp, string, string]> = [['add', '+ Sumar', 'Suma esta zona a lo que se ve'], ['subtract', '− Restar', 'Quita esta zona'], ['intersect', '∩ Intersecar', 'Deja sólo donde coincide con lo anterior']];
const VIEWS: Array<[MaskView, string, string]> = [['tint', 'Tinte', 'La zona de la máscara teñida de bermellón mientras la editas'], ['grey', 'Sólo máscara', 'Blanco: se ve la capa; negro: no'], ['off', 'Oculta', 'Sin vista de la máscara']];

const pct = (v: number) => Math.round(v * 100) + ' %';

export function MaskSection({ l, p }: { l: Layer; p: Project }) {
  const view = useFoto(s => s.maskView);
  const m = l.mask;
  const setMask = (fn: (m: Mask) => void, key = '') => updateLayer(l.id, x => { if (x.mask) fn(x.mask); }, key ? 'mask.' + key : '');
  const addShape = (kind: 'rect' | 'ellipse') => {
    const part: MaskPart = { kind, op: 'add', x: 0.3, y: 0.3, w: 0.4, h: 0.4, rot: 0, soft: 0, alpha: 1 };
    updateLayer(l.id, x => { x.mask = x.mask ? { ...x.mask, parts: [...x.mask.parts, part] } : { ...defaultMask(), parts: [part] }; });
    say(`${PART_NAMES[kind]} añadid${kind === 'ellipse' ? 'a' : 'o'} a la máscara, en el centro. Ajusta sus números abajo o con las herramientas.`);
  };
  // the viewport shows the mask while the pointer or the focus is here (like a quick mask)
  const focus = (on: boolean) => () => { if (useFoto.getState().maskFocus !== on) setUI({ maskFocus: on }); };
  useEffect(() => () => setUI({ maskFocus: false }), []);
  return (
    <div className="fmask-wrap" onPointerEnter={focus(true)} onPointerLeave={focus(false)} onFocus={focus(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focus(false)(); }}>
    <Section title="Máscara" className="fmask" count={m ? m.parts.length : undefined}>
      <SegGroup label="Vista de la máscara" value={view} opts={VIEWS} onPick={v => setUI({ maskView: v, maskPin: v === 'grey' })} />
      {!m && <Note>Sin máscara: la capa se ve en todo el cuadro. Dibuja una zona con las herramientas, o añade una aquí.</Note>}
      {m && (
        <>
          <Toggle label="Usar máscara" checked={!m.off} onChange={v => setMask(x => { if (v) delete x.off; else x.off = true; })}
            hint={m.off ? 'Desactivada: la capa se ve en todo el cuadro; la máscara se conserva.' : undefined} />
          <Toggle label="Invertir (se ve fuera de la zona)" checked={m.invert} onChange={v => setMask(x => { x.invert = v; })} />
          <Slider label="Borde suave" value={m.feather} min={0} max={200} step={1} def={0} fmt={v => v + ' px'} onChange={v => setMask(x => { x.feather = v; }, 'feather')} hint="Difumina el borde de toda la máscara (px de la imagen final)." />
          <Slider label="Opacidad de la máscara" value={m.opacity} min={0} max={1} def={1} fmt={pct} onChange={v => setMask(x => { x.opacity = v; }, 'opacity')} />
          <ol className="parts" aria-label="Partes de la máscara, en orden">
            {m.parts.map((part, i) => <PartRow key={i} i={i} n={m.parts.length} part={part} l={l} p={p} />)}
          </ol>
          {!m.parts.length && <Note>La máscara no tiene partes: la capa se ve en todo el cuadro.</Note>}
        </>
      )}
      <div className="row2 btns">
        <button type="button" className="btn" onClick={() => addShape('rect')}>+ Zona rectangular</button>
        <button type="button" className="btn" onClick={() => addShape('ellipse')}>+ Zona elíptica</button>
      </div>
      {m && <button type="button" className="btn ghost" onClick={() => { updateLayer(l.id, { mask: null }); say('Máscara quitada: la capa se ve en todo el cuadro.'); }}>Quitar la máscara</button>}
    </Section>
    </div>
  );
}

function PartRow({ i, n, part, l, p }: { i: number; n: number; part: MaskPart; l: Layer; p: Project }) {
  const [open, setOpen] = useState(false);
  const setPart = (fn: (x: MaskPart) => void, key = '') => updateLayer(l.id, x => { const q = x.mask?.parts[i]; if (q) fn(q); }, key ? `part${i}.${key}` : '');
  const move = (d: number) => updateLayer(l.id, x => {
    if (!x.mask) return;
    const ps = x.mask.parts;
    const j = i + d;
    if (j < 0 || j >= ps.length) return;
    [ps[i], ps[j]] = [ps[j], ps[i]];
  });
  const name = PART_NAMES[part.kind] ?? part.kind;
  const detail = part.kind === 'raster' && part.origin ? ` · ${RASTER_ORIGIN[part.origin] ?? part.origin}` : '';
  const soft = 'soft' in part ? part.soft : undefined;
  return (
    <li className={'part' + (part.off ? ' off' : '')}>
      <div className="part-h">
        <span className="part-ic" aria-hidden="true"><PartIcon kind={part.kind} /></span>
        <button type="button" className="part-name" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span>{i + 1}. {name}{detail}</span><small>{OPS.find(o => o[0] === part.op)?.[1]} · {pct(part.alpha)}</small>
        </button>
        <button type="button" className="icon-btn" aria-pressed={!!part.off} aria-label={part.off ? `Mostrar la parte ${i + 1}` : `Ocultar la parte ${i + 1}`} title={part.off ? 'Oculta: no se aplica' : 'Ocultar (se conserva)'}
          onClick={() => setPart(x => { if (x.off) delete x.off; else x.off = true; })}>{part.off ? <IEyeOff /> : <IEye />}</button>
        <button type="button" className="icon-btn" disabled={i === 0} aria-label={`Subir la parte ${i + 1}`} title="Antes en el orden" onClick={() => move(-1)}><IUp /></button>
        <button type="button" className="icon-btn" disabled={i === n - 1} aria-label={`Bajar la parte ${i + 1}`} title="Después en el orden" onClick={() => move(1)}><IDown /></button>
        <button type="button" className="icon-btn" aria-label={`Eliminar la parte ${i + 1}`} title="Eliminar" onClick={() => { updateLayer(l.id, x => { if (x.mask) x.mask.parts = x.mask.parts.filter((_, j) => j !== i); }); say(`Parte ${i + 1} eliminada de la máscara.`); }}><ITrash /></button>
      </div>
      {open && (
        <div className="part-b">
          <SegGroup label={`Operación de la parte ${i + 1}`} value={part.op} opts={OPS} onPick={v => setPart(x => { x.op = v; })} />
          <Slider label="Fuerza" value={part.alpha} min={0} max={1} def={1} fmt={pct} onChange={v => setPart(x => { x.alpha = v; }, 'alpha')} hint="Menos de 100 %: mezcla gradual de foto y caracteres en esta zona." />
          {soft !== undefined && part.kind !== 'color' && <Slider label="Borde de esta parte" value={soft} min={0} max={120} step={1} def={0} fmt={v => v + ' px'} onChange={v => setPart(x => { (x as { soft: number }).soft = v; }, 'soft')} />}
          {part.kind === 'stroke' && (
            <>
              <Slider label="Tamaño del pincel" value={part.size} min={0.002} max={0.5} step={0.001} fmt={pct} onChange={v => setPart(x => { (x as { size: number }).size = v; }, 'size')} />
              <Slider label="Dureza" value={part.hardness} min={0} max={1} def={0.8} fmt={pct} onChange={v => setPart(x => { (x as { hardness: number }).hardness = v; }, 'hard')} />
            </>
          )}
          {(part.kind === 'rect' || part.kind === 'ellipse') && (
            <>
              <Slider label="Izquierda" value={part.x} min={-0.5} max={1.5} fmt={pct} onChange={v => setPart(x => { (x as { x: number }).x = v; }, 'x')} />
              <Slider label="Arriba" value={part.y} min={-0.5} max={1.5} fmt={pct} onChange={v => setPart(x => { (x as { y: number }).y = v; }, 'y')} />
              <Slider label="Ancho" value={part.w} min={0} max={2} fmt={pct} onChange={v => setPart(x => { (x as { w: number }).w = v; }, 'w')} />
              <Slider label="Alto" value={part.h} min={0} max={2} fmt={pct} onChange={v => setPart(x => { (x as { h: number }).h = v; }, 'h')} />
              <Slider label="Giro" value={part.rot} min={-180} max={180} step={1} def={0} fmt={v => Math.round(v) + '°'} onChange={v => setPart(x => { (x as { rot: number }).rot = v; }, 'rot')} />
            </>
          )}
          {part.kind === 'color' && (
            <>
              <ColorInput label="Color" value={part.color} onChange={v => setPart(x => { (x as { color: string }).color = v ?? '#ffffff'; }, 'color')} />
              <Slider label="Tolerancia" value={part.tol} min={0} max={1} def={0.15} fmt={pct} onChange={v => setPart(x => { (x as { tol: number }).tol = v; }, 'tol')} />
              <Slider label="Suavidad" value={part.soft} min={0} max={1} def={0.1} fmt={pct} onChange={v => setPart(x => { (x as { soft: number }).soft = v; }, 'csoft')} />
              <p className="note">Lee los colores de «{p.sources.find(s => s.id === part.source)?.name ?? 'la foto'}».</p>
            </>
          )}
        </div>
      )}
    </li>
  );
}
