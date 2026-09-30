/**
 * «Secuencia de fotos»: several photos → one animation. The photos in order (drag to reorder, or Alt+←/→ on
 * one; remove; add more), the seconds each one shows, the transition between them (a cut, a fade, or
 * «Transición entre fotos» with real characters or the lab's ASCII), a preview that plays both ways, and the
 * way out: «Crear la animación» (a new project) or «Aplicar» (the open project's sequence), then the export
 * sheet (video and GIF where this browser encodes them) or numbered PNG frames right here.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import type { MediaRef } from '../../engine/recipe';
import { commitVersion, edit, useProject } from '../../project/store';
import { Sheet } from '../../studio/Sheet';
import { downloadBlob } from '../../studio/download';
import { IPlus } from '../../studio/icons';
import { thumbVersion } from '../actions';
import { SegGroup, Slider, Toggle } from '../controls';
import { startEditing } from '../session';
import { openSheet, say } from '../ui';
import { importPhotos } from './ExtrasStart';
import { exportFramesZip, framesPlan } from './frames';
import { pickFiles } from '../media';
import { Player } from './Player';
import {
  applySequence, clampChange, clampHold, HOLD_MAX, HOLD_MIN, photoAt, reorder, SEQ_TRANSITIONS, sequenceDuration, sequenceProject, sequenceSpecOf, type SequenceSpec,
} from './sequence';
import { closeExtras, useExtras } from './state';
import { storeBlob } from '../../project/sources';

const DEFAULT: Omit<SequenceSpec, 'photos'> = { hold: 1.2, transition: 'caracteres', change: 0.5, loop: true };

export function SequenceSheet() {
  const open = useExtras(s => s.sheet === 'secuencia');
  const mode = useExtras(s => s.mode);
  const given = useExtras(s => s.photos);
  const project = useProject(s => s.project);
  const [spec, setSpec] = useState<SequenceSpec>({ ...DEFAULT, photos: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const cancel = useRef<{ cancelled: boolean } | null>(null);
  // each time it opens: the photos given (start screen), or the open project's sequence
  useEffect(() => {
    if (!open) return;
    const own = mode === 'open' && project ? sequenceSpecOf(project) : null;
    setSpec(own ?? { ...DEFAULT, photos: given });
    // the thumbnails' object URLs go when the sheet closes
    return () => { for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); };
  }, [open]);
  const editing = mode === 'open' && !!project && !!sequenceSpecOf(project);
  const preview = useMemo(() => {
    if (spec.photos.length < 1) return null;
    return editing && project ? applySequence(project, spec) : sequenceProject(spec);
  }, [spec, editing, project?.id]);
  const set = (p: Partial<SequenceSpec>) => setSpec(s => {
    const n = { ...s, ...p };
    n.hold = clampHold(n.hold);
    n.change = clampChange(n.change, n.hold);
    return n;
  });
  const add = async () => {
    const files = await pickFiles('image/*', true);
    if (!files.length) return;
    const more = await importPhotos(files);
    set({ photos: [...spec.photos, ...more].slice(0, 400) });
  };
  const create = () => {
    if (!preview) return;
    if (editing) {
      const parent = useProject.getState().versions.list[useProject.getState().versions.cursor]?.id;
      edit(() => preview);
      thumbVersion(commitVersion('edición', { label: 'Secuencia', ...(parent ? { parent } : {}) }));
      say(`Secuencia de ${spec.photos.length} fotos actualizada: ${sequenceDuration(spec).toFixed(1)} s.`);
    } else {
      preview.name = `Secuencia de ${spec.photos.length} fotos`;
      startEditing(preview, { fresh: true });
      say(`Animación de ${spec.photos.length} fotos creada (${sequenceDuration(spec).toFixed(1)} s). Exporta desde «Exportar» o como cuadros PNG en «Más → Secuencia de fotos».`);
    }
    closeExtras();
  };
  const frames = async () => {
    if (!preview) return;
    const c = { cancelled: false };
    cancel.current = c;
    setBusy('0');
    try {
      const r = await exportFramesZip(preview, { signal: c, onProgress: (d, n) => setBusy(`${d} de ${n}`) });
      if (r) { downloadBlob(r.name, r.blob); say(`${r.n} cuadros PNG descargados (${r.name}).`); }
      else say('Exportación cancelada.');
    } catch (e) { say((e as Error).message || 'No se pudo exportar.'); } finally { setBusy(null); cancel.current = null; }
  };
  const plan = preview ? framesPlan(preview) : null;
  const current = photoAt(spec, now);
  return (
    <Sheet open={open} wide title="Secuencia de fotos" onClose={() => { cancel.current && (cancel.current.cancelled = true); closeExtras(); }}
      sub="Varias fotos, una tras otra: cada una se ve el tiempo que elijas y cambian con la transición que prefieras.">
      {open && (
        <div className="sheet-body xq">
          <div className="xq-main">
            <Player project={preview} label="Vista previa de la secuencia" width={440} onTime={setNow} />
            <div className="xq-ctl">
              <Slider label="Cada foto" value={spec.hold} min={HOLD_MIN} max={HOLD_MAX} step={0.1} def={1.2} fmt={v => `${v.toFixed(1)} s`} onChange={v => set({ hold: v })} />
              <SegGroup label="Transición" value={spec.transition} opts={SEQ_TRANSITIONS.map(x => [x.id, x.name, x.blurb] as [typeof x.id, string, string])} onPick={v => set({ transition: v })} />
              <p className="note">{SEQ_TRANSITIONS.find(x => x.id === spec.transition)?.blurb}</p>
              {spec.transition !== 'corte' && (
                <Slider label="Duración del cambio" value={spec.change} min={0.05} max={Math.max(0.1, spec.hold * 0.95)} step={0.05} def={0.5} fmt={v => `${v.toFixed(2)} s`} onChange={v => set({ change: v })} />
              )}
              <Toggle label="En bucle (la última vuelve a la primera)" checked={spec.loop} onChange={v => set({ loop: v })} />
              <p className="xp-size"><b>{spec.photos.length} fotos · {sequenceDuration(spec).toFixed(1)} s</b>{preview ? ` · ${preview.canvas.w} × ${preview.canvas.h} px` : ''}</p>
              <button type="button" className="btn primary" disabled={!preview || spec.photos.length < 2} onClick={create}>{editing ? 'Aplicar a este proyecto' : 'Crear la animación'}</button>
              {spec.photos.length < 2 && <p className="note">Hacen falta al menos dos fotos.</p>}
              <div className="xq-out">
                <button type="button" className="btn" disabled={!preview || !!busy} onClick={() => void frames()}>{busy ? `Exportando cuadros… ${busy}` : 'Cuadros PNG (.zip)'}</button>
                {busy && <button type="button" className="mini" onClick={() => { if (cancel.current) cancel.current.cancelled = true; }}>Cancelar</button>}
                {editing && <button type="button" className="btn" onClick={() => { create(); openSheet('export'); }}>Aplicar y exportar video o GIF…</button>}
              </div>
              {plan && <p className="note">{plan.n} cuadros de {plan.width} × {plan.height} px a {plan.fps} por segundo: la misma imagen que la vista previa. El video y el GIF salen de «Exportar», según lo que este navegador pueda codificar.</p>}
            </div>
          </div>
          <PhotoStrip photos={spec.photos} current={current} onChange={photos => set({ photos })} onAdd={() => void add()} />
        </div>
      )}
    </Sheet>
  );
}

/** The photos in order: drag a photo to move it (or Alt+←/→ on it), × removes it, + adds more. */
function PhotoStrip({ photos, current, onChange, onAdd }: { photos: MediaRef[]; current: number; onChange: (p: MediaRef[]) => void; onAdd: () => void }) {
  const list = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const start = (e: RPointerEvent<HTMLElement>, from: number) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX, y0 = e.clientY;
    let to = from, moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      moved = true;
      const items = [...(list.current?.querySelectorAll<HTMLElement>('.xq-ph') ?? [])];
      to = items.length - 1;
      for (let i = 0; i < items.length; i++) { const r = items[i].getBoundingClientRect(); if (ev.clientX < r.left + r.width / 2 && ev.clientY < r.bottom) { to = i; break; } }
      if (to > from) to = Math.max(from, to - 1);
      setDrag({ from, to });
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      setDrag(null);
      if (moved && to !== from) { onChange(reorder(photos, from, to)); say(`Foto ${from + 1} movida al lugar ${to + 1}.`); }
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const key = (e: KeyboardEvent, i: number) => {
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const to = Math.max(0, Math.min(photos.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
      if (to === i) return;
      onChange(reorder(photos, i, to));
      say(`Foto ${i + 1} ahora es la ${to + 1} de ${photos.length}.`);
      requestAnimationFrame(() => list.current?.querySelectorAll<HTMLElement>('.xq-ph')[to]?.focus());
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onChange(photos.filter((_, j) => j !== i));
    }
  };
  return (
    <section className="xq-strip" aria-labelledby="xq-strip-h">
      <h3 id="xq-strip-h" className="xp-h">Orden <span className="fsec-n">{photos.length}</span> <small className="xq-hint">Arrastra una foto (o Alt + ← →) para cambiar su lugar; Supr la quita.</small></h3>
      <ol ref={list} className="xq-list">
        {photos.map((m, i) => (
          <li key={`${m.id}-${i}`} className={'xq-ph' + (i === current ? ' now' : '') + (drag?.from === i ? ' drag' : '') + (drag && drag.to === i && drag.from !== i ? ' drop' : '')}
            tabIndex={0} aria-label={`Foto ${i + 1} de ${photos.length}: ${m.name ?? ''}`} onKeyDown={e => key(e, i)} onPointerDown={e => start(e, i)} data-i={i}>
            <Thumb m={m} />
            <span className="xq-n">{i + 1}</span>
            <button type="button" className="xq-x" aria-label={`Quitar la foto ${i + 1}`} onPointerDown={e => e.stopPropagation()} onClick={() => onChange(photos.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
        <li className="xq-add"><button type="button" onClick={onAdd} aria-label="Añadir fotos"><IPlus width={18} height={18} /> Añadir</button></li>
      </ol>
    </section>
  );
}

const urls = new Map<string, string>();

function Thumb({ m }: { m: MediaRef }) {
  const [url, setUrl] = useState(urls.get(m.id ?? '') ?? '');
  useEffect(() => {
    if (url || !m.id) return;
    let gone = false;
    void storeBlob(m.id).then(got => {
      if (!got || gone) return;
      const u = URL.createObjectURL(got.blob);
      urls.set(m.id!, u);
      setUrl(u);
    });
    return () => { gone = true; };
  }, [m.id]);
  return <span className="xq-img" style={url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined} aria-hidden="true" />;
}
