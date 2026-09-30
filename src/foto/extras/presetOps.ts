/**
 * Saved settings in the studio: the list (a small zustand store over the IndexedDB store of
 * src/project/presets.ts), saving from the open project with a picture, applying as one undo step, files in
 * and out, and lab styles turned into settings (the lab's own list, read by bridge.ts).
 */
import { create } from 'zustand';
import {
  applyPreset, deletePreset, duplicatePreset, listPresets, presetFileName, presetFileText, presetFromLayer, presetFromProject, presetFromRecipe,
  readPresetText, renamePreset, savePreset, type ApplyOptions, type Preset,
} from '../../project/presets';
import { commitVersion, edit, select, useProject } from '../../project/store';
import type { Id, Project } from '../../project/types';
import { downloadText } from '../../studio/download';
import { toast } from '../../studio/toast';
import { thumbVersion } from '../actions';
import { styleFromLab, type LabStyle } from '../bridge';
import { say } from '../ui';
import { renderPreview } from './render';

export const usePresets = create<{ list: Preset[] | null }>(() => ({ list: null }));

export async function refreshPresets(): Promise<Preset[]> {
  const list = await listPresets();
  usePresets.setState({ list });
  return list;
}

/** A small picture of the look: the project up to that layer (layer settings) or all of it. */
async function thumbOf(p: Project, upTo?: Id): Promise<string | undefined> {
  const i = upTo ? p.layers.findIndex(l => l.id === upTo) : p.layers.length - 1;
  const q: Project = { ...p, layers: p.layers.slice(0, i + 1) };
  const c = document.createElement('canvas');
  const ok = await renderPreview(q, c, 160, useProject.getState().time, { dpr: 1, light: true });
  if (!ok) return undefined;
  const url = c.toDataURL('image/webp', 0.78);
  c.width = c.height = 0;
  return url.startsWith('data:image/webp') ? url : undefined;
}

async function keep(p: Preset, what: string) {
  const ok = await savePreset(p);
  await refreshPresets();
  if (!ok) { say('El navegador no dejó guardar el ajuste: descárgalo como archivo.'); return null; }
  say(`${what} «${p.name}» guardado en tus ajustes.${p.notes.length ? ' ' + p.notes[0] : ''}`);
  return p;
}

export async function saveLayerPreset(layerId: Id, name?: string): Promise<Preset | null> {
  const p = useProject.getState().project;
  const pr = p && presetFromLayer(p, layerId, name);
  if (!p || !pr) return null;
  const thumb = await thumbOf(p, layerId);
  if (thumb) pr.thumb = thumb;
  return keep(pr, 'Ajuste de capa');
}

export async function saveProjectPreset(name?: string): Promise<Preset | null> {
  const p = useProject.getState().project;
  if (!p) return null;
  const pr = presetFromProject(p, name);
  const thumb = await thumbOf(p);
  if (thumb) pr.thumb = thumb;
  return keep(pr, 'Ajuste del proyecto');
}

/** Applies a setting to the open project: one undo step, kept as a version («Ajuste: …»). */
export function applyToOpen(pr: Preset, o: ApplyOptions): boolean {
  const p = useProject.getState().project;
  if (!p) return false;
  const r = applyPreset(p, pr, o);
  const vl = useProject.getState().versions;
  if (!vl.list.length) thumbVersion(commitVersion('inicio'));
  const parent = useProject.getState().versions.list[useProject.getState().versions.cursor]?.id;
  edit(() => r.project);
  thumbVersion(commitVersion('edición', { label: `Ajuste: ${pr.name}`, ...(parent ? { parent } : {}) }));
  if (r.layers.length) select([r.layers[r.layers.length - 1]]);
  say(`Ajuste «${pr.name}» aplicado${pr.scope === 'layer' ? (o.target ? ' a la capa elegida' : ' como capa nueva') : ' a todo el proyecto'}.${r.notes.length ? ' ' + r.notes.join(' ') : ''}`, { keep: r.notes.length > 0 });
  return true;
}

export async function removePreset(pr: Preset) {
  await deletePreset(pr.id);
  await refreshPresets();
  toast(`Ajuste «${pr.name}» eliminado.`, { label: 'Deshacer', run: () => { void savePreset(pr).then(refreshPresets); } }, 8000);
}

export async function renameP(id: Id, name: string) { await renamePreset(id, name); await refreshPresets(); }
export async function duplicateP(id: Id) { const q = await duplicatePreset(id); await refreshPresets(); if (q) say(`Duplicado: «${q.name}».`); }

export function exportPreset(pr: Preset) {
  downloadText(presetFileName(pr), presetFileText(pr), 'application/json');
  say(`«${pr.name}» descargado como ${presetFileName(pr)}: ábrelo en otro navegador con «Importar un ajuste».`);
}

/** Reads a picked file as a setting and keeps it (with a new id when one with its id is already here). */
export async function importPresetFile(file: File): Promise<Preset | null> {
  if (file.size > 2_000_000) { say('Ese archivo es demasiado grande para ser un ajuste guardado.'); return null; }
  const r = readPresetText(await file.text());
  if (!r.ok) { say(r.message); return null; }
  const list = usePresets.getState().list ?? await refreshPresets();
  const pr = list.some(x => x.id === r.preset.id) ? { ...r.preset, id: crypto.randomUUID().replace(/-/g, '').slice(0, 12) } : r.preset;
  return keep(pr, 'Ajuste importado');
}

export async function presetFromLabStyle(st: LabStyle): Promise<Preset | null> {
  const pr = presetFromRecipe(styleFromLab(st.recipe), st.name);
  if (st.thumb && /^data:image\/(png|jpeg|webp);base64,/.test(st.thumb) && st.thumb.length < 400_000) pr.thumb = st.thumb;
  return keep(pr, 'Estilo del laboratorio');
}
