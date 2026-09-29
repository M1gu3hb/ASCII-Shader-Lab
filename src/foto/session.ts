/**
 * Opening, starting and leaving projects: from a photo or video, a template, a project file, a saved one
 * or the lab. The open project's id goes in the address (#p=<id>) so a reload reopens it exactly as the
 * autosave left it.
 */
import { buildProjectFile, openProjectFile } from '../project/file';
import { cloneProject, projectFromImage, projectFromRecipe, projectFromVideo, uid } from '../project/normalize';
import { deleteProject, loadProject, loadVersions, saveProject } from '../project/persist';
import {
  closeProject, commitVersion, openProject, openSaved, refreshSaved, saveNow, useProject,
} from '../project/store';
import type { Id, Project } from '../project/types';
import type { VersionList } from '../project/versions';
import { downloadBlob } from '../studio/download';
import { toast } from '../studio/toast';
import { thumbVersion } from './actions';
import { releaseViewport } from './scheduler';
import { templateById, sampleRef } from './templates';
import { importMedia, isProjectFile } from './media';
import { say, setUI, ui } from './ui';
import type { MediaRef } from '../engine/recipe';

const P = () => useProject.getState();

function setHash(id: Id | null) {
  const h = id ? `#p=${id}` : '';
  if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
}

/** Shows a project in the editor (the top layer selected, the view fitted). */
export function startEditing(p: Project, o: { versions?: VersionList; fresh?: boolean } = {}) {
  const top = p.layers[p.layers.length - 1];
  openProject(p, { ...(o.versions ? { versions: o.versions } : {}), select: top ? [top.id] : [] });
  setUI({ screen: 'edit', zoom: 'fit', pan: { x: 0, y: 0 }, tool: null, compare: false, holding: false, snap: 'closed', compareWith: null });
  if (o.fresh) {
    thumbVersion(commitVersion('inicio'));
    // the address names the project once it is saved: a reload before that would find nothing to open
    void saveNow().finally(() => { if (P().project?.id === p.id && ui().screen === 'edit') setHash(p.id); });
  } else setHash(p.id);
}

export async function openSavedProject(id: Id): Promise<boolean> {
  const ok = await openSaved(id);
  if (!ok) { say('Ese proyecto ya no está guardado en este navegador.'); return false; }
  const p = P().project!;
  const top = p.layers[p.layers.length - 1];
  useProject.setState({ selection: top ? [top.id] : [] });
  setUI({ screen: 'edit', zoom: 'fit', pan: { x: 0, y: 0 }, tool: null, compare: false, snap: 'closed' });
  setHash(id);
  return true;
}

/** A new project from a picked photo or video (or a project file dropped by mistake: it opens as one). */
export async function newFromFile(file: File): Promise<boolean> {
  if (isProjectFile(file)) return openFile(file);
  say(`Abriendo «${file.name}»…`, { keep: true });
  const r = await importMedia(file);
  if (!r.ok) { say(r.message); return false; }
  const p = r.kind === 'video'
    ? projectFromVideo(r.ref, { duration: r.duration, fps: r.fps })
    : projectFromImage(r.ref);
  startEditing(p, { fresh: true });
  if (!r.stored) toast('Este archivo es demasiado grande para guardarlo en el navegador: funciona mientras la pestaña siga abierta.');
  say(r.kind === 'video'
    ? 'Video abierto: recórrelo con la línea de tiempo y anima sus capas. Por ahora se exportan imágenes fijas del instante que muestra.'
    : 'Foto abierta. Añade una capa ASCII o empieza por «Azar».');
  return true;
}

/** A new project from a photo already stored (the camera, the lab). */
export function newFromRef(ref: MediaRef, name?: string) {
  const p = projectFromImage(ref, name ? { name } : {});
  startEditing(p, { fresh: true });
}

export async function newFromTemplate(id: string, ref?: MediaRef) {
  const t = templateById(id);
  if (!t) return;
  const photo = ref ?? await sampleRef();
  const p = t.make(photo);
  startEditing(p, { fresh: true });
  say(`«${t.name}»${ref ? '' : ' con el paisaje de muestra: cambia la foto en la capa «Foto»'}.`);
}

/** Opens a project file (.zip or .json), or says what else it is (a lab recipe can come in as an ASCII layer). */
export async function openFile(file: File): Promise<boolean> {
  say(`Abriendo «${file.name}»…`, { keep: true });
  const r = await openProjectFile(file);
  if (r.ok) {
    startEditing(r.project, { fresh: true });
    say(r.missing.length ? `Proyecto abierto. Faltan ${r.missing.length} archivo(s): sus capas no se dibujan hasta que los vuelvas a elegir.` : `Proyecto «${r.project.name}» abierto (${r.restored} archivo(s) guardados en este navegador).`);
    return true;
  }
  if (r.recipe) {
    const recipe = r.recipe;
    say(r.message);
    toast(r.message, { label: 'Llevar como capa ASCII', run: () => startEditing(projectFromRecipe(recipe), { fresh: true }) }, 9000);
    return false;
  }
  say(r.message);
  toast(r.message);
  return false;
}

export async function backToStart() {
  await saveNow();
  closeProject();
  releaseViewport();
  setUI({ screen: 'start', tool: null, compare: false, snap: 'closed', sheet: 'none', cutout: false });
  setHash(null);
  await refreshSaved();
}

/** «Guardar como»: a copy with a new name (and its own versions), which becomes the open project. */
export async function saveAs(name: string) {
  const p = P().project;
  if (!p) return;
  await saveNow();
  const q = cloneProject(p);
  q.id = uid();
  q.name = name.trim().slice(0, 120) || `${p.name} (copia)`;
  q.created = q.updated = Date.now();
  // the copy's versions are its own: restoring one must never write over the original project
  const vl = P().versions;
  const versions: VersionList = { ...vl, list: vl.list.map(v => ({ ...v, project: { ...v.project, id: q.id, name: q.name } })) };
  await saveProject(q, { versions });
  startEditing(q, { versions });
  await saveNow();
  await refreshSaved();
  say(`Guardado como «${q.name}». El original sigue en tus proyectos.`);
}

export async function downloadProjectFile() {
  const p = P().project;
  if (!p) return;
  say('Empaquetando el proyecto con sus archivos…', { keep: true });
  const blob = await buildProjectFile(p);
  const slug = p.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'proyecto';
  downloadBlob(`${slug}.glyphos.zip`, blob);
  say('Proyecto descargado (.glyphos.zip): ábrelo aquí o en otro navegador con «Abrir proyecto».');
}

/* ------------------------------------------------------------------ the saved list */

export async function duplicateSaved(id: Id) {
  const p = await loadProject(id);
  if (!p) return;
  const q = cloneProject(p);
  q.id = uid();
  q.name = `${p.name} (copia)`;
  q.created = q.updated = Date.now();
  const vl = await loadVersions(id);
  await saveProject(q, { versions: { ...vl, list: vl.list.map(v => ({ ...v, project: { ...v.project, id: q.id } })) } });
  await refreshSaved();
  say(`Duplicado: «${q.name}».`);
}

export async function renameSaved(id: Id, name: string) {
  const n = name.trim().slice(0, 120);
  if (!n) return;
  const p = await loadProject(id);
  if (!p) return;
  p.name = n;
  p.updated = Date.now();
  await saveProject(p);
  await refreshSaved();
}

/** Deletes a saved project; the toast brings it back (with its versions and thumbnail) for a while. */
export async function deleteSavedWithUndo(id: Id) {
  const p = await loadProject(id);
  const versions = await loadVersions(id);
  const thumb = P().saved.find(s => s.id === id)?.thumb;
  await deleteProject(id);
  await refreshSaved();
  if (!p) return;
  say(`«${p.name}» eliminado.`);
  toast(`«${p.name}» eliminado.`, {
    label: 'Deshacer',
    run: () => { void saveProject(p, { versions, ...(thumb ? { thumb } : {}) }).then(refreshSaved).then(() => say(`«${p.name}» recuperado.`)); },
  }, 8000);
}
