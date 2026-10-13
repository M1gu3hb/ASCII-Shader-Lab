import { normMediaRef, type MediaRef, type Recipe } from '../engine/recipe';
import { spaceById } from '../random/spaces';
import { buildProject, isProject, readProject } from '../shared/project';
import { FOTO_STUDIO } from '../shared/site';
import { buildSession, collectionFileName, isSession, readSession, sessionFileName, type SessionMedia } from '../shared/session';
import { unzip } from '../shared/zip';
import { downloadBlob } from './download';
import { allRecipes, mediaIdsOf } from './history';
import { mediaBlob, rememberFile, syncMedia } from './media';
import { guessType, kindOfType, put } from './mediaStore';
import { spaceForOpened } from './presets';
import { applyRecipe, importSession, onHistoryEvent, planSession, setUI, useStudio, type Entry, type Favorite } from './store';
import { toast } from './toast';
import { importState, stateBytes, stateIdsOf } from './stateStore';
import { CHECKPOINT_MAX } from '../families/checkpoints';
import type { PackedState } from '../shared/project';
import { glyphSetFile, glyphSetIdsOf, importGlyphSet, recordLabUses } from './glyphSets';
import { GLYPHSET_LIMITS } from '../glyphset/set';

/** The glyph sets recipes draw with, as files (the ones this browser has), and how many are missing. */
async function packSets(recipes: Iterable<Recipe | undefined>): Promise<{ sets: PackedState[]; missing: number }> {
  const sets: PackedState[] = [];
  let missing = 0;
  for (const id of glyphSetIdsOf(recipes)) {
    const data = await glyphSetFile(id);
    if (data) sets.push({ id, data }); else missing++;
  }
  return { sets, missing };
}

/** Stores the glyph sets an archive carries (each checked against its id). Returns how many could not be read. */
async function unpackSets(list: Array<{ id: string; size: number; read: () => Promise<Uint8Array> }>): Promise<number> {
  let bad = 0;
  const ok = new Set<string>();
  for (const g of list) {
    if (g.size > GLYPHSET_LIMITS.bytes) { bad++; continue; }
    try { const id = await importGlyphSet(await g.read(), g.id); if (id) ok.add(id); else bad++; } catch { bad++; }
  }
  if (ok.size) await recordLabUses(ok, true);
  return bad;
}

/** The saved family states recipes use, as files (the ones this browser has), and how many are missing. */
async function packStates(recipes: Iterable<Recipe | undefined>): Promise<{ states: PackedState[]; missing: number }> {
  const states: PackedState[] = [];
  let missing = 0;
  for (const id of stateIdsOf(recipes)) {
    const data = await stateBytes(id);
    if (data) states.push({ id, data }); else missing++;
  }
  return { states, missing };
}

/** Reads the saved states an archive carries into this browser. Returns how many could not be read. */
async function unpackStates(list: Array<{ id: string; size: number; read: () => Promise<Uint8Array> }>): Promise<number> {
  let bad = 0;
  for (const st of list) {
    if (st.size > CHECKPOINT_MAX) { bad++; continue; }
    try { if (!(await importState(await st.read()))) bad++; } catch { bad++; }
  }
  return bad;
}

/**
 * Project and session files: the studio side of shared/project.ts and shared/session.ts.
 * Everything is built and read in the browser; nothing is uploaded.
 */

const MB = 1024 * 1024, GB = 1024 * MB;
/** "2,4 MB", "1,2 GB" (Spanish decimals). */
export function fmtSize(bytes: number): string {
  const n = (v: number) => v.toLocaleString('es', { maximumFractionDigits: 1 });
  if (bytes >= GB) return n(bytes / GB) + ' GB';
  return (bytes > 0 && bytes < 0.1 * MB ? '0,1' : n(bytes / MB)) + ' MB';
}

export const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'glyphos';
/** File name (without extension) for downloads of a piece. */
export const pieceFileBase = (r: Recipe) => 'glyphos-' + slug(r.meta.name ?? r.meta.seed ?? new Date().toISOString().slice(0, 16));

const usesMedia = (r: Recipe): MediaRef | null =>
  (r.source === 'image' || r.source === 'video') && r.media.ref?.kind === r.source ? r.media.ref : null;

/* ------------------------------------------------------------------ */
/* Project                                                             */
/* ------------------------------------------------------------------ */

/** Whether the media a piece uses can go into its project file. */
export async function projectMedia(r: Recipe): Promise<{ ref: MediaRef | null; available: boolean; size: number }> {
  const ref = usesMedia(r);
  if (!ref?.id) return { ref, available: false, size: 0 };
  const m = await mediaBlob(ref.id);
  return { ref, available: !!m, size: m?.blob.size ?? 0 };
}

/** Downloads "<name>.glyphos.zip": recipe, original media when available, LEEME.txt. */
export async function exportProject(r: Recipe, fileBase: string) {
  const ref = usesMedia(r);
  const m = ref?.id ? await mediaBlob(ref.id) : null;
  try {
    const { states, missing } = await packStates([r]);
    const { sets, missing: noSet } = await packSets([r]);
    const blob = await buildProject(r, m && ref ? { name: ref.name ?? m.name ?? '', type: ref.type ?? m.type, data: m.blob } : null, states, sets);
    downloadBlob(`${fileBase}.glyphos.zip`, blob);
    if (ref && !m) toast(`El proyecto sale sin ${ref.kind === 'video' ? 'el video: no está guardado' : 'la imagen: no está guardada'} en este navegador.`, undefined, 6000);
    if (missing) toast('El estado guardado de una simulación ya no está en este navegador: el proyecto la reconstruye desde su semilla.', undefined, 7000);
    if (noSet) toast('El juego de glifos de la pieza ya no está en este navegador: el proyecto sale sin él y se verá con su tipografía.', undefined, 7000);
  } catch (err) {
    toast('No se pudo crear el proyecto: ' + (err as Error).message);
  }
}

async function openProject(files: Awaited<ReturnType<typeof unzip>>, label: string) {
  const p = await readProject(files);
  if (!p) { toast('Ese proyecto no trae una receta válida.'); return; }
  let recipe = p.recipe;
  let note = '';
  // saved family states first: the piece continues from them as soon as it shows
  if (await unpackStates(p.states)) note += ' · un estado guardado no se pudo leer: esa simulación empieza desde su semilla';
  if (await unpackSets(p.sets)) note += ' · su juego de glifos no se pudo leer: se ve con su tipografía';
  if (p.media) {
    const ref = recipe.media.ref;
    const type = p.media.type || ref?.type || guessType(p.media.name);
    const kind = ref?.kind ?? kindOfType(type);
    if (kind) {
      const blob = new Blob([p.media.data as BlobPart], { type });
      const name = ref?.name ?? p.media.name;
      const res = await put(blob, { kind, name, w: ref?.w ?? 0, h: ref?.h ?? 0 });
      if (!res.stored) rememberFile(res.id, blob, name);
      recipe = { ...recipe, media: { ...recipe.media, ref: normMediaRef({ ...ref, kind, id: res.id, name, type, size: blob.size }) } };
      if (!res.stored) note = res.reason === 'too-big'
        ? ' · el archivo es demasiado grande para guardarlo en el navegador: se verá mientras no cierres la pestaña'
        : res.reason === 'no-space'
          ? ' · no queda espacio para guardar el archivo: se verá mientras no cierres la pestaña'
          // e.g. a private window of Safari/WebKit, whose storage refuses files
          : ' · el navegador no dejó guardar el archivo (¿ventana privada?): se verá mientras no cierres la pestaña';
    }
  }
  const space = spaceById(spaceForOpened(recipe, useStudio.getState().space)).id;
  useStudio.setState({ space });
  applyRecipe(recipe, 'importado', label || recipe.meta.name || 'Proyecto');
  toast('Proyecto abierto' + note, undefined, note ? 7000 : 3200);
}

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

function sessionRefs(entries: Entry[], favorites: Favorite[]): Map<string, MediaRef> {
  const refs = new Map<string, MediaRef>();
  for (const r of allRecipes(entries, favorites)) { const ref = r.media.ref; if (ref?.id && !refs.has(ref.id)) refs.set(ref.id, ref); }
  return refs;
}

/** Local media the history and the collection use, and how much of it this browser still has. */
export async function sessionMediaSize(): Promise<{ count: number; bytes: number; missing: number }> {
  const s = useStudio.getState();
  let count = 0, bytes = 0, missing = 0;
  for (const id of mediaIdsOf(allRecipes(s.entries, s.favorites))) {
    const m = await mediaBlob(id);
    if (m) { count++; bytes += m.blob.size; } else missing++;
  }
  return { count, bytes, missing };
}

let saving = false;
/** Downloads glyphos-sesion-YYYY-MM-DD.zip with the history, the collection and (optionally) their media. */
export async function saveSession(withMedia = true) {
  if (saving) return;
  saving = true;
  try {
    const s = useStudio.getState();
    const media: Array<SessionMedia & { data: Blob }> = [];
    if (withMedia) {
      for (const [id, ref] of sessionRefs(s.entries, s.favorites)) {
        const m = await mediaBlob(id);
        if (m) media.push({ id, kind: ref.kind, name: ref.name ?? m.name ?? '', type: ref.type ?? m.type, size: m.blob.size, w: ref.w, h: ref.h, data: m.blob });
      }
    }
    const { states } = await packStates(allRecipes(s.entries, s.favorites));
    const { sets } = await packSets(allRecipes(s.entries, s.favorites));
    const blob = await buildSession({ entries: s.entries, favorites: s.favorites, cursor: s.cursor }, media, 'all', states, sets);
    downloadBlob(sessionFileName(), blob);
  } catch (err) {
    toast('No se pudo guardar la sesión: ' + (err as Error).message);
  } finally {
    saving = false;
  }
}

/** Local media the collection uses, and how much of it this browser still has. */
export async function collectionMediaSize(): Promise<{ count: number; bytes: number; missing: number }> {
  let count = 0, bytes = 0, missing = 0;
  for (const id of mediaIdsOf(useStudio.getState().favorites.map(f => f.recipe))) {
    const m = await mediaBlob(id);
    if (m) { count++; bytes += m.blob.size; } else missing++;
  }
  return { count, bytes, missing };
}

/**
 * Downloads glyphos-coleccion-YYYY-MM-DD.zip: every piece saved with ★ and the images and videos they
 * use, to keep a copy or take the collection to another computer (the history stays out: that is a session).
 */
export async function saveCollection() {
  if (saving) return;
  saving = true;
  try {
    const favs = useStudio.getState().favorites;
    const media: Array<SessionMedia & { data: Blob }> = [];
    const refs = sessionRefs([], favs);
    let missing = 0;
    for (const [id, ref] of refs) {
      const m = await mediaBlob(id);
      if (m) media.push({ id, kind: ref.kind, name: ref.name ?? m.name ?? '', type: ref.type ?? m.type, size: m.blob.size, w: ref.w, h: ref.h, data: m.blob });
      else missing++;
    }
    const { states } = await packStates(favs.map(f => f.recipe));
    const { sets } = await packSets(favs.map(f => f.recipe));
    const blob = await buildSession({ entries: [], favorites: favs, cursor: -1 }, media, 'collection', states, sets);
    downloadBlob(collectionFileName(), blob);
    if (missing) toast(`${missing === 1 ? 'Una imagen o video de tu colección ya no estaba' : `${missing} imágenes o videos de tu colección ya no estaban`} en este navegador: esas piezas van sin su archivo.`, undefined, 7000);
  } catch (err) {
    toast('No se pudo guardar la colección: ' + (err as Error).message);
  } finally {
    saving = false;
  }
}

/** Replaces media ids inside raw (not yet normalised) entries and favourites. */
function remapIds(list: unknown[], map: Map<string, string>) {
  if (!map.size) return list;
  const fix = (r: unknown) => {
    const ref = (r as { media?: { ref?: { id?: unknown } } } | null)?.media?.ref;
    if (ref && typeof ref.id === 'string' && map.has(ref.id)) ref.id = map.get(ref.id);
  };
  for (const x of list) { const o = x as { recipe?: unknown; origin?: unknown } | null; fix(o?.recipe); fix(o?.origin); }
  return list;
}

async function openSession(files: Awaited<ReturnType<typeof unzip>>) {
  const sess = await readSession(files);
  if (!sess) { toast('Esa sesión está dañada o no es de GLYPHOS.'); return; }
  const st = useStudio.getState();
  const onlyCollection = sess.scope === 'collection' || !sess.data.entries.length;
  // past the limit, say exactly what goes: the oldest by date, from here and from the session
  const plan = planSession(sess.data);
  if (!onlyCollection && plan.dropOwn + plan.dropIncoming > 0) {
    const n = (k: number, one: string, many: string) => (k === 1 ? `1 ${one}` : `${k} ${many}`);
    const from = [plan.dropOwn ? `${plan.dropOwn} de tu historial` : '', plan.dropIncoming ? `${plan.dropIncoming} de la sesión` : ''].filter(Boolean).join(' y ');
    const total = plan.dropOwn + plan.dropIncoming;
    if (!confirm(`Tu historial tiene ${n(plan.count, 'resultado', 'resultados')} y la sesión trae ${n(plan.added, 'nuevo', 'nuevos')}, pero guarda como mucho ${st.histLimit}. `
      + `Al abrirla se ${total === 1 ? 'descarta el resultado más antiguo' : `descartan los ${total} resultados más antiguos`} por fecha (${from}); lo guardado con ★ se conserva.`
      + `${plan.dropOwn ? ' Si quieres una copia de tu historial, cancela y usa antes «Guardar sesión».' : ''} ¿Abrirla igualmente?`)) return;
  }
  // media and saved states first, so the pieces find them as soon as they appear
  const remap = new Map<string, string>();
  const badStates = await unpackStates(sess.states);
  const badSets = await unpackSets(sess.sets);
  let lost = 0;
  for (const m of sess.media) {
    try {
      const type = m.meta.type || guessType(m.meta.name);
      const blob = new Blob([(await m.read()) as BlobPart], { type });
      const res = await put(blob, { kind: m.meta.kind, name: m.meta.name, w: m.meta.w, h: m.meta.h });
      if (res.id !== m.meta.id) remap.set(m.meta.id, res.id);
      if (!res.stored) { rememberFile(res.id, blob, m.meta.name); lost++; }
    } catch { lost++; }
  }
  const res = importSession({
    entries: remapIds(sess.data.entries, remap),
    favorites: remapIds(sess.data.favorites, remap),
    cursor: sess.data.cursor,
  });
  syncMedia(true);
  if (onlyCollection) {
    const bits = [`Colección abierta: ${res.favAdded} ${res.favAdded === 1 ? 'pieza nueva' : 'piezas nuevas'}`];
    if (res.invalid) bits.push(`${res.invalid} no válidas omitidas`);
    if (res.favUpdated) bits.push(`${res.favUpdated} ${res.favUpdated === 1 ? 'actualizada' : 'actualizadas'} con la versión más reciente`);
    if (lost) bits.push(lost === 1 ? '1 archivo no cabe en el navegador: se verá hasta que cierres la pestaña' : `${lost} archivos no caben en el navegador: se verán hasta que cierres la pestaña`);
    if (badStates) bits.push(`${badStates} ${badStates === 1 ? 'estado guardado no se pudo leer: esa simulación empieza' : 'estados guardados no se pudieron leer: esas simulaciones empiezan'} desde su semilla`);
    if (badSets) bits.push(`${badSets} ${badSets === 1 ? 'juego de glifos no se pudo leer: sus piezas se ven' : 'juegos de glifos no se pudieron leer: sus piezas se ven'} con su tipografía`);
    toast(bits.join(' · '), { label: 'Ver', run: () => setUI({ sheet: 'collection' }) }, 8000);
    return;
  }
  const parts = [`Sesión abierta: ${res.added} ${res.added === 1 ? 'resultado añadido' : 'resultados añadidos'}`];
  if (res.updated) parts.push(`${res.updated} ${res.updated === 1 ? 'actualizado' : 'actualizados'} con la versión más reciente de la sesión (Deshacer vuelve a la tuya durante esta visita)`);
  if (res.preserved) parts.push(`${res.preserved} ediciones locales conservadas como copias en el historial`);
  if (res.invalid) parts.push(`${res.invalid} entradas no válidas omitidas`);
  if (res.skipped) parts.push(`${res.skipped} ya ${res.skipped === 1 ? 'estaba' : 'estaban'}`);
  if (res.favAdded) parts.push(`${res.favAdded} ${res.favAdded === 1 ? 'pieza nueva' : 'piezas nuevas'} en la colección`);
  if (res.favUpdated) parts.push(`${res.favUpdated} ${res.favUpdated === 1 ? 'pieza de tu colección actualizada' : 'piezas de tu colección actualizadas'} con la versión más reciente`);
  if (res.dropped) parts.push(res.dropped === 1 ? 'se descartó el resultado más antiguo' : `se descartaron los ${res.dropped} resultados más antiguos`);
  if (lost) parts.push(lost === 1 ? '1 archivo no cabe en el navegador: se verá hasta que cierres la pestaña' : `${lost} archivos no caben en el navegador: se verán hasta que cierres la pestaña`);
  if (badStates) parts.push(`${badStates} ${badStates === 1 ? 'estado guardado no se pudo leer: esa simulación empieza' : 'estados guardados no se pudieron leer: esas simulaciones empiezan'} desde su semilla`);
  if (badSets) parts.push(`${badSets} ${badSets === 1 ? 'juego de glifos no se pudo leer: sus piezas se ven' : 'juegos de glifos no se pudieron leer: sus piezas se ven'} con su tipografía`);
  toast(parts.join(' · '), undefined, 8000);
}

/* ------------------------------------------------------------------ */

/**
 * Files of the photo and video studio: its projects end in .glyphos.zip too (with proyecto.glyphos.json,
 * src/project/file.ts) and its saved settings are .glyphos-ajuste.json. They open there: say so, with the
 * way to it, rather than «not a GLYPHOS project». While that studio is paused (FOTO_STUDIO) there is no way
 * to it: say that, and that the file is intact (nothing here reads more of it or changes it).
 */
const FOTO_PROJECT_JSON = 'proyecto.glyphos.json';
export const isFotoProject = (files: Array<{ name: string }>) =>
  files.some(f => f.name.slice(f.name.lastIndexOf('/') + 1) === FOTO_PROJECT_JSON && !f.name.startsWith('__MACOSX/'));
export function fotoFileNote(what: 'proyecto' | 'ajuste') {
  if (!FOTO_STUDIO) {
    toast(`Ese archivo es ${what === 'proyecto' ? 'un proyecto' : 'un ajuste'} del estudio de foto y video, que está en revisión y todavía no está disponible. `
      + 'El laboratorio no lo abre, y el archivo está intacto: consérvalo para usarlo allí cuando el estudio vuelva a estar disponible.', undefined, 12000);
    return;
  }
  toast(what === 'proyecto'
    ? 'Ese archivo es un proyecto del estudio de foto y video (capas, máscaras y medios): se abre allí, con «Abrir un proyecto».'
    : 'Ese archivo es un ajuste del estudio de foto y video: se aplica allí, sobre otra foto.',
  { label: 'Ir al estudio de foto', run: () => { location.href = '/studio/foto/'; } }, 9000);
}

/** Opens a dropped or picked .zip: a session or a project. */
export async function openPackage(file: Blob, label = '') {
  let files;
  try { files = await unzip(file); } catch (err) { toast((err as Error).message); return; }
  try {
    if (isSession(files)) await openSession(files);
    else if (isProject(files)) await openProject(files, label.replace(/\.(glyphos|monotrama)$/i, ''));
    else if (isFotoProject(files)) fotoFileNote('proyecto');
    else toast('Ese .zip no es un proyecto ni una sesión de GLYPHOS.');
  } catch (err) {
    toast('No se pudo abrir: ' + (err as Error).message);
  }
}

/** Warnings as the history approaches its limit (once per session each). */
export function startHistoryWarnings() {
  onHistoryEvent(e => {
    const act = { label: 'Guardar sesión', run: () => void saveSession(true) };
    if (e.type === 'near') {
      toast(`Tu historial va por ${e.count} de ${e.limit} resultados. Al pasar de ${e.limit} se descartan los más antiguos; lo guardado con ★ se conserva.`, act, 9000);
    } else {
      toast(`Tu historial llegó a ${e.limit}: ${e.dropped === 1 ? 'se descartó el resultado más antiguo' : `se descartaron los ${e.dropped} resultados más antiguos`}. Lo guardado con ★ se conserva.`, act, 9000);
    }
  });
}
