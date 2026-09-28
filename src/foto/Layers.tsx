/**
 * The layers panel: the stack from top to bottom, with visibility, lock, mask thumbnail and name; the
 * selected layer's blend and opacity above the list; add, duplicate, delete and reorder (drag the grip, or
 * Alt+↑/↓ on a layer; F2 renames it; Supr deletes it — every change is one undo step).
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { COMPOSITE_BLENDS } from '../project/normalize';
import { coverageOfImage, maskCanvas } from '../project/masks';
import { select, updateLayer, useProject, moveLayer } from '../project/store';
import type { CompositeBlend, Id, Layer, LayerKind, Mask, Project } from '../project/types';
import { IEye, IEyeOff, ILock, IUnlock, IPlus, ITrash } from '../studio/icons';
import { Picker } from '../studio/ui/Picker';
import { Slider } from './controls';
import { CanvasSection } from './inspect/CanvasSection';
import { IDup, IGrip, KindIcon } from './icons';
import { addLayerOf, deleteLayer, duplicateLayer, KIND_BLURB, KIND_LABEL, nudgeLayer, renameLayer } from './layerOps';
import { viewCompositor } from './scheduler';
import { say } from './ui';

export const BLEND_NAMES: Record<CompositeBlend, string> = {
  normal: 'Normal', multiply: 'Multiplicar', screen: 'Trama (aclarar)', overlay: 'Superponer', darken: 'Oscurecer', lighten: 'Aclarar',
  'color-dodge': 'Sobreexponer color', 'color-burn': 'Subexponer color', 'hard-light': 'Luz fuerte', 'soft-light': 'Luz suave',
  difference: 'Diferencia', exclusion: 'Exclusión', hue: 'Tono', saturation: 'Saturación', color: 'Color', luminosity: 'Luminosidad', add: 'Sumar (brillo)',
};
const BLEND_OPTS = COMPOSITE_BLENDS.map(b => ({ value: b, label: BLEND_NAMES[b] }));
const KINDS: LayerKind[] = ['ascii', 'glyphs', 'photo', 'text', 'shape'];

export function Layers({ onOpenMask }: { onOpenMask?: () => void }) {
  const project = useProject(s => s.project);
  const selection = useProject(s => s.selection);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<{ id: Id; to: number } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  if (!project) return null;
  const sel = project.layers.find(l => l.id === selection[0]) ?? null;
  const rows = [...project.layers].reverse();

  const startDrag = (e: RPointerEvent<HTMLButtonElement>, id: Id) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const from = project.layers.findIndex(l => l.id === id);
    let to = from;
    setDrag({ id, to });
    const move = (ev: PointerEvent) => {
      const items = [...(list.current?.querySelectorAll<HTMLElement>('.lr') ?? [])];
      // rows are shown top-first: find the display slot under the pointer, then the stack position
      let slot = items.length;
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { slot = i; break; }
      }
      const n = project.layers.length;
      const di = rows.findIndex(r => r.id === id);
      const pos = Math.max(0, Math.min(n - 1, slot > di ? slot - 1 : slot));
      to = n - 1 - pos;
      setDrag({ id, to });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      setDrag(null);
      if (to !== from) { moveLayer(id, to); say(`Capa movida a la posición ${to + 1} de ${project.layers.length} (desde abajo).`); }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  return (
    <div className="flayers">
      <div className="fl-head">
        <h2 className="fl-title">Capas <span className="fsec-n">{project.layers.length}</span></h2>
        <div className="fl-add">
          <button type="button" className="mini" aria-expanded={adding} aria-haspopup="menu" onClick={() => setAdding(!adding)}><IPlus width={15} height={15} /> Añadir capa</button>
          {adding && <AddMenu onClose={() => setAdding(false)} />}
        </div>
      </div>
      {sel && (
        <div className="fl-sel">
          <div className="ctl cx fl-blend">
            <span className="lbl" id="fl-blend-l">Fusión</span>
            <Picker<CompositeBlend> label="Fusión" labelId="fl-blend-l" size="sm" value={sel.blend} options={BLEND_OPTS} minWidth={220}
              onChange={v => updateLayer(sel.id, { blend: v })} />
          </div>
          <Slider label="Opacidad" value={sel.opacity} min={0} max={1} step={0.01} def={1} fmt={v => `${Math.round(v * 100)} %`}
            onChange={v => updateLayer(sel.id, { opacity: v }, 'opacity')} />
        </div>
      )}
      <ol className="fl-list" ref={list} aria-label="Capas, de arriba abajo">
        {rows.map(l => (
          <LayerRow key={l.id} l={l} p={project} selected={l.id === selection[0]} dragging={drag?.id === l.id}
            dropHere={drag !== null && drag.id !== l.id && project.layers.findIndex(x => x.id === l.id) === drag.to}
            onGrip={e => startDrag(e, l.id)} onOpenMask={onOpenMask} />
        ))}
      </ol>
      {!project.layers.length && <p className="note">Sin capas: añade una foto, una capa ASCII o un texto.</p>}
      {sel && (
        <div className="fl-foot" role="toolbar" aria-label="Capa seleccionada">
          <button type="button" className="icon-btn" title="Subir la capa (Alt+↑)" aria-label="Subir la capa" onClick={() => nudgeLayer(sel.id, 1)}>↑</button>
          <button type="button" className="icon-btn" title="Bajar la capa (Alt+↓)" aria-label="Bajar la capa" onClick={() => nudgeLayer(sel.id, -1)}>↓</button>
          <button type="button" className="icon-btn" title="Duplicar la capa" aria-label="Duplicar la capa" onClick={() => duplicateLayer(sel.id)}><IDup /></button>
          <button type="button" className="icon-btn" title="Eliminar la capa (Supr)" aria-label="Eliminar la capa" onClick={() => deleteLayer(sel.id)}><ITrash /></button>
        </div>
      )}
      <div className="fl-canvas"><CanvasSection /></div>
    </div>
  );
}

function AddMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const out = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('.fl-add')) onClose(); };
    document.addEventListener('pointerdown', out, true);
    return () => document.removeEventListener('pointerdown', out, true);
  }, [onClose]);
  const key = (e: KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); (ref.current?.parentElement?.querySelector('button') as HTMLButtonElement | null)?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  };
  return (
    <div className="fl-menu" role="menu" aria-label="Añadir capa" ref={ref} onKeyDown={key}>
      {KINDS.map(k => (
        <button key={k} type="button" role="menuitem" onClick={() => { onClose(); addLayerOf(k); }}>
          <KindIcon kind={k} /><span><b>{KIND_LABEL[k]}</b><small>{KIND_BLURB[k]}</small></span>
        </button>
      ))}
    </div>
  );
}

function LayerRow({ l, p, selected, dragging, dropHere, onGrip, onOpenMask }: {
  l: Layer; p: Project; selected: boolean; dragging: boolean; dropHere: boolean;
  onGrip: (e: RPointerEvent<HTMLButtonElement>) => void; onOpenMask?: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const idx = p.layers.findIndex(x => x.id === l.id);
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); nudgeLayer(l.id, e.key === 'ArrowUp' ? 1 : -1); return; }
    if (e.key === 'F2') { e.preventDefault(); setRenaming(true); return; }
    if (e.key === 'Delete') { e.preventDefault(); deleteLayer(l.id); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      const rows = [...p.layers].reverse();
      const i = rows.findIndex(x => x.id === l.id) + (e.key === 'ArrowDown' ? 1 : -1);
      const t = rows[Math.max(0, Math.min(rows.length - 1, i))];
      select([t.id]);
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`.lr[data-id="${t.id}"] .lr-main`)?.focus());
    }
  };
  return (
    <li className={'lr' + (selected ? ' on' : '') + (l.visible ? '' : ' hidden-l') + (dragging ? ' drag' : '') + (dropHere ? ' drop' : '')} data-id={l.id}>
      <button type="button" className="lr-grip" aria-label={`Arrastrar «${l.name}» para reordenar`} title="Arrastra para reordenar (o Alt+↑/↓)" onPointerDown={onGrip} tabIndex={-1}><IGrip /></button>
      <button type="button" className="lr-vis" aria-pressed={!l.visible} aria-label={l.visible ? `Ocultar «${l.name}»` : `Mostrar «${l.name}»`} title={l.visible ? 'Ocultar' : 'Oculta: pulsa para mostrarla'}
        onClick={() => updateLayer(l.id, { visible: !l.visible })}>{l.visible ? <IEye /> : <IEyeOff />}</button>
      <span className="lr-kind" title={KIND_LABEL[l.kind]}><KindIcon kind={l.kind} /></span>
      {renaming ? (
        <input className="lr-name-in" defaultValue={l.name} aria-label="Nombre de la capa" autoFocus maxLength={80}
          onBlur={e => { renameLayer(l.id, e.target.value); setRenaming(false); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(false); } }} />
      ) : (
        <button type="button" className="lr-main" aria-pressed={selected} aria-label={`${l.name}, ${KIND_LABEL[l.kind]}, capa ${idx + 1} de ${p.layers.length}${l.visible ? '' : ', oculta'}${l.locked ? ', bloqueada' : ''}${l.mask ? ', con máscara' : ''}`}
          onClick={() => select([l.id])} onDoubleClick={() => setRenaming(true)} onKeyDown={key}>
          <span className="lr-name">{l.name}</span>
          {l.kind === 'glyphs' && <span className="lr-tag" title="Caracteres reales: se copian como texto">texto</span>}
        </button>
      )}
      {l.mask && <MaskThumb p={p} l={l} mask={l.mask} onClick={() => { select([l.id]); onOpenMask?.(); }} />}
      <button type="button" className="lr-lock" aria-pressed={l.locked} aria-label={l.locked ? `Desbloquear «${l.name}»` : `Bloquear «${l.name}»`}
        title={l.locked ? 'Bloqueada: el dado y las herramientas no la cambian' : 'Bloquear (el dado no la cambia)'}
        onClick={() => updateLayer(l.id, { locked: !l.locked })}>{l.locked ? <ILock /> : <IUnlock />}</button>
    </li>
  );
}

/** A small picture of a layer's mask (white shows). */
function MaskThumb({ p, l, mask, onClick }: { p: Project; l: Layer; mask: Mask; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(mask);
  useEffect(() => {
    let gone = false;
    void (async () => {
      const W = 40, H = Math.max(8, Math.round((40 * p.canvas.h) / p.canvas.w));
      const prov = viewCompositor().provider;
      for (const part of mask.parts) {
        if (part.kind === 'raster') await prov.prepareMedia(part.media);
        if (part.kind === 'color') { const s = p.sources.find(x => x.id === part.source); if (s) await prov.prepare(s, 0); }
      }
      if (gone) return;
      const c = ref.current;
      if (!c) return;
      let cov: { canvas: HTMLCanvasElement } | null = null;
      try {
        cov = maskCanvas({ ...mask, off: false }, {
          w: W, h: H, scale: W / p.canvas.w, t: 0,
          raster: r => { const img = prov.image(r); return img ? coverageOfImage(img, W, H) : null; },
          pixels: () => null,
        });
      } catch { cov = null; }
      c.width = W; c.height = H;
      const x = c.getContext('2d')!;
      x.fillStyle = '#0c0b0a';
      x.fillRect(0, 0, W, H);
      if (cov) x.drawImage(cov.canvas, 0, 0);
    })();
    return () => { gone = true; };
  }, [key, p.canvas.w, p.canvas.h, p.sources, mask]);
  return (
    <button type="button" className={'lr-mask' + (mask.off ? ' off' : '') + (mask.invert ? ' inv' : '')} onClick={onClick}
      aria-label={`Máscara de «${l.name}»${mask.off ? ' (desactivada)' : ''}: ${mask.parts.length} ${mask.parts.length === 1 ? 'parte' : 'partes'}`} title="Máscara: dónde se ve la capa (blanco)">
      <canvas ref={ref} aria-hidden="true" />
    </button>
  );
}
