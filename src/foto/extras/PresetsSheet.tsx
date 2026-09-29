/**
 * «Ajustes guardados»: the saved settings of this browser. In the editor: save the selected layer or the
 * whole project, apply one to the open project (to the selected layer, as a new layer, or the whole
 * composition), with times scaled to this project's length when asked. On the start screen («Usar un
 * ajuste guardado»): pick one, then a photo or video, and a new project starts with it. Also: rename,
 * duplicate, delete (with undo), download and import .glyphos-ajuste.json files, and turn lab favourites
 * into settings.
 */
import { useEffect, useState } from 'react';
import { applyPreset, PRESET_EXT, type Preset } from '../../project/presets';
import { projectFromImage, projectFromVideo } from '../../project/normalize';
import { useProject } from '../../project/store';
import { Sheet } from '../../studio/Sheet';
import { IStar, ITrash } from '../../studio/icons';
import { readLabStyles, type LabStyle } from '../bridge';
import { SegGroup, Toggle } from '../controls';
import { IDup } from '../icons';
import { KIND_LABEL } from '../layerOps';
import { importMedia, pickFiles } from '../media';
import { startEditing } from '../session';
import { say } from '../ui';
import {
  applyToOpen, duplicateP, exportPreset, importPresetFile, presetFromLabStyle, refreshPresets, removePreset, renameP, saveLayerPreset, saveProjectPreset, usePresets,
} from './presetOps';
import { closeExtras, useExtras } from './state';

const fmtDate = (t: number) => new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

export function PresetsSheet() {
  const open = useExtras(s => s.sheet === 'ajustes');
  const mode = useExtras(s => s.mode);
  const list = usePresets(s => s.list);
  const project = useProject(s => s.project);
  const selId = useProject(s => s.selection[0]);
  const sel = project?.layers.find(l => l.id === selId) ?? null;
  const [scale, setScale] = useState(true);
  const [where, setWhere] = useState<'capa' | 'nueva'>('capa');
  const [canvas, setCanvas] = useState<'auto' | 'keep'>('auto');
  const [lab, setLab] = useState<LabStyle[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { void refreshPresets(); setLab(null); } }, [open]);

  const apply = async (pr: Preset) => {
    if (mode === 'new' || !project) {
      const [f] = await pickFiles('image/*,video/*');
      if (!f) return;
      setBusy(true);
      try {
        const r = await importMedia(f);
        if (!r.ok) { say(r.message); return; }
        const base = r.kind === 'video' ? projectFromVideo(r.ref, { duration: r.duration, fps: r.fps }) : projectFromImage(r.ref);
        const out = applyPreset(base, pr, { scaleTime: scale, canvas: 'auto' });
        out.project.name = `${base.name} · ${pr.name}`.slice(0, 120);
        closeExtras();
        startEditing(out.project, { fresh: true });
        say(`Proyecto nuevo con el ajuste «${pr.name}».${out.notes.length ? ' ' + out.notes.join(' ') : ''}`, { keep: out.notes.length > 0 });
      } finally { setBusy(false); }
      return;
    }
    const target = pr.scope === 'layer' && where === 'capa' && sel ? sel.id : null;
    applyToOpen(pr, { scaleTime: scale, target, canvas });
    closeExtras();
  };

  const importFile = async () => {
    const [f] = await pickFiles(`${PRESET_EXT},.json,application/json`);
    if (f) await importPresetFile(f);
  };
  const durNote = project && project.time.duration > 0 ? `${project.time.duration.toFixed(1)} s` : null;
  return (
    <Sheet open={open} wide title={mode === 'new' ? 'Usar un ajuste guardado' : 'Ajustes guardados'} onClose={closeExtras}
      sub={mode === 'new' ? 'Elige un ajuste y después la foto o el video al que se aplica: sus capas leerán tu foto.' : 'Estilos, acabados, animaciones y zonas que guardaste, para usarlos en otra foto o video. Tus fotos no se guardan en ellos.'}>
      {open && (
        <div className="sheet-body xr">
          {mode === 'open' && project && (
            <section className="xr-save" aria-labelledby="xr-save-h">
              <h3 id="xr-save-h" className="xp-h">Guardar</h3>
              <div className="xr-btns">
                <button type="button" className="btn" disabled={!sel} onClick={() => { if (sel) void saveLayerPreset(sel.id); }}>
                  {sel ? `Guardar «${sel.name}» como ajuste` : 'Elige una capa para guardarla'}
                </button>
                <button type="button" className="btn" onClick={() => void saveProjectPreset()}>Guardar todo el proyecto como ajuste</button>
              </div>
              <p className="note">Una capa guarda su estilo, acabados, animaciones y las zonas geométricas de su máscara; las zonas pintadas o recortadas dependen de su foto y no se guardan.</p>
            </section>
          )}
          <section aria-labelledby="xr-list-h">
            <div className="xr-head">
              <h3 id="xr-list-h" className="xp-h">Tus ajustes <span className="fsec-n">{list?.length ?? '…'}</span></h3>
              <button type="button" className="mini" onClick={() => void importFile()}>Importar un ajuste…</button>
            </div>
            {mode === 'open' && project && (
              <div className="xr-opts">
                <SegGroup label="Un ajuste de capa se aplica" value={where} opts={[['capa', sel ? `En «${sel.name.slice(0, 24)}»` : 'En la capa elegida'], ['nueva', 'Como capa nueva']]} onPick={setWhere} />
                <SegGroup label="Un ajuste de proyecto" value={canvas} opts={[['auto', 'Tamaño automático'], ['keep', 'Mantener este lienzo']]} onPick={setCanvas} />
                <Toggle label={`Escalar sus tiempos a este proyecto${durNote ? ` (${durNote})` : ''}`} checked={scale} onChange={setScale}
                  hint="Las animaciones y llaves se estiran o encogen a la duración de este proyecto. Sin escalar, conservan sus segundos." />
              </div>
            )}
            {mode === 'new' && <Toggle label="Escalar sus tiempos a la duración del video" checked={scale} onChange={setScale} hint="Sólo cuenta con videos: con una foto, el proyecto dura lo que dure el ajuste." />}
            {list === null && <p className="note mt-spin">Leyendo tus ajustes…</p>}
            {list && !list.length && (
              <p className="note">Todavía no hay ajustes guardados en este navegador. En el editor, «Guardar como ajuste» (en los ajustes de una capa o aquí) guarda un estilo para usarlo en otra foto.</p>
            )}
            {list && list.length > 0 && (
              <ul className="xr-grid">
                {list.map(pr => <PresetCard key={pr.id} pr={pr} busy={busy} onApply={() => void apply(pr)} applyLabel={mode === 'new' || !project ? 'Elegir foto…' : 'Aplicar'} />)}
              </ul>
            )}
          </section>
          <section aria-labelledby="xr-lab-h">
            <h3 id="xr-lab-h" className="xp-h">Desde el laboratorio</h3>
            {lab === null ? (
              <button type="button" className="mini" onClick={() => void readLabStyles(24).then(setLab)}>Ver tu colección y tu historial del laboratorio…</button>
            ) : lab.length ? (
              <ul className="xr-lab">
                {lab.map(st => (
                  <li key={st.id}>
                    <span className="xr-lab-img" style={st.thumb ? { backgroundImage: `url(${JSON.stringify(st.thumb)})` } : undefined} aria-hidden="true" />
                    <span className="xr-lab-name">{st.fav && <IStar filled width={11} height={11} />} {st.name}</span>
                    <button type="button" className="mini" onClick={() => void presetFromLabStyle(st)} aria-label={`Guardar «${st.name}» como ajuste`}>Guardar como ajuste</button>
                  </li>
                ))}
              </ul>
            ) : <p className="note">No hay piezas del laboratorio en este navegador todavía.</p>}
            <p className="note">Un estilo del laboratorio se guarda como un ajuste de una capa ASCII que lee tu foto (para aplicarlo sin guardarlo, usa «Usar estilo del laboratorio»).</p>
          </section>
        </div>
      )}
    </Sheet>
  );
}

function PresetCard({ pr, onApply, applyLabel, busy }: { pr: Preset; onApply: () => void; applyLabel: string; busy: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const animated = pr.tracks.length > 0 || pr.layers.some(l => l.clips.length);
  const what = pr.scope === 'layer' ? `Capa · ${KIND_LABEL[pr.layers[0].kind]}` : `Proyecto · ${pr.layers.length} ${pr.layers.length === 1 ? 'capa' : 'capas'}`;
  return (
    <li className="xr-card" data-preset={pr.id}>
      <span className="xr-img" style={pr.thumb ? { backgroundImage: `url(${JSON.stringify(pr.thumb)})` } : undefined} aria-hidden="true" />
      <div className="xr-meta">
        {renaming ? (
          <input defaultValue={pr.name} aria-label="Nombre del ajuste" autoFocus maxLength={80}
            onBlur={e => { void renameP(pr.id, e.target.value); setRenaming(false); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(false); } }} />
        ) : <b>{pr.name}</b>}
        <small>{what}{animated ? ' · animado' : ''} · {fmtDate(pr.updated)}</small>
      </div>
      <div className="xr-ops">
        <button type="button" className="primary" disabled={busy} onClick={onApply} aria-label={`${applyLabel} «${pr.name}»`}>{applyLabel}</button>
        <button type="button" onClick={() => setRenaming(true)} aria-label={`Renombrar «${pr.name}»`}>Renombrar</button>
        <button type="button" onClick={() => void duplicateP(pr.id)} aria-label={`Duplicar «${pr.name}»`} title="Duplicar"><IDup width={15} height={15} /></button>
        <button type="button" onClick={() => exportPreset(pr)} aria-label={`Descargar «${pr.name}»`} title="Descargar como archivo">↓</button>
        <button type="button" onClick={() => void removePreset(pr)} aria-label={`Eliminar «${pr.name}»`} title="Eliminar"><ITrash width={15} height={15} /></button>
      </div>
    </li>
  );
}
