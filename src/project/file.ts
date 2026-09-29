/**
 * The project file: a whole studio project in one .zip that reopens exactly, in this browser or another.
 *   proyecto.glyphos.json    the project (layers, masks, keyframes, clips) and the list of its files
 *   medios/<id>-<name>       its files, untouched: originals, photo sequences, cut-outs, mattes, painted masks
 *   LEEME.txt                what it is and how to open it, in Spanish
 * Opening stores the files again (the media store names them by content, so usually with the same ids;
 * when an id changes, the project is rewritten to match) and gives the project a new id, so opening a file
 * never overwrites a saved project. Anything else is refused with a reason: a lab project, a lab session,
 * a lab recipe (the lab opens those), a damaged or foreign archive, a file too big.
 */
import type { MediaRef, Recipe } from '../engine/recipe';
import { isProject as isLabProject, readProjectRecipe, safeFileName } from '../shared/project';
import { isSession } from '../shared/session';
import { parseRecipe } from '../shared/share';
import { SITE_URL } from '../shared/site';
import { looksLikeZip, unzip, zip, type ZipEntry } from '../shared/zip';
import { MEDIA_LIMITS, guessType, kindOfType, put } from '../studio/mediaStore';
import { isProjectLike, normalizeProject, uid } from './normalize';
import { projectMedia, rewriteMediaIds, type MediaRole } from './refs';
import { keepBlob, storeBlob, type BlobResolver } from './sources';
import type { Project } from './types';

export const PROJECT_JSON = 'proyecto.glyphos.json';
export const PROJECT_MEDIA_DIR = 'medios/';
const README = 'LEEME.txt';
/** Largest project JSON read (layers, masks and keyframes are small; this is far past any real one). */
const MAX_JSON = 32 * 1024 * 1024;
/** Largest single file read from an archive. */
const MAX_FILE = Math.max(MEDIA_LIMITS.image, MEDIA_LIMITS.video) + 16 * 1024 * 1024;

export interface ProjectFileMedia { id: string; path: string; name: string; type: string; kind: 'image' | 'video'; size: number; w: number; h: number; role: MediaRole }

export const projectFileName = (p: Project) => `glyphos-${slug(p.name) || 'proyecto'}.zip`;

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

const ROLE_NAME: Record<MediaRole, string> = { original: 'original', secuencia: 'foto de la secuencia', recorte: 'recorte (con transparencia)', mate: 'mate del recorte', mascara: 'máscara pintada' };

function readme(p: Project, files: ProjectFileMedia[], missing: MediaRef[]): string {
  const lines = [
    'GLYPHOS · proyecto del estudio de foto y video',
    '================================================',
    '',
    `«${p.name}»: ${p.layers.length} ${p.layers.length === 1 ? 'capa' : 'capas'}, ${p.canvas.w}×${p.canvas.h} px${p.time.duration > 0 ? `, ${p.time.duration} s` : ''}.`,
    '',
    'Contenido',
    `- ${PROJECT_JSON}: el proyecto completo (capas, máscaras, fotogramas clave, animaciones). Se reabre tal cual.`,
  ];
  for (const f of files) lines.push(`- ${f.path}: ${ROLE_NAME[f.role]}, tal como estaba (sin recomprimir).`);
  lines.push(`- ${README}: este archivo.`, '');
  if (missing.length) {
    lines.push(`${missing.length === 1 ? 'Un archivo que usa el proyecto no estaba' : `${missing.length} archivos que usa el proyecto no estaban`} guardados en el navegador al exportar,`,
      'así que no van incluidos: al abrirlo, el estudio te dirá cuáles faltan.', '');
  }
  lines.push(
    'Cómo reabrirlo',
    `1. Abre el estudio de foto y video: ${SITE_URL}/studio/foto/`,
    '2. Arrastra este .zip sobre el lienzo, o usa «Abrir proyecto».',
    '   Los archivos se guardan en tu navegador y el proyecto se abre como uno nuevo (no reemplaza ninguno).',
    '',
    'Los proyectos del laboratorio (receta.glyphos.json) y las sesiones (sesion.json) se abren en el',
    `laboratorio: ${SITE_URL}/studio/`,
    '',
    'Todo se procesa en tu navegador: nada se sube a ningún servidor.',
    'Lo que creas es tuyo. Si compartes el proyecto, asegúrate de tener derecho a usar sus fotos y videos.',
    '',
  );
  return lines.join('\r\n');
}

/** Packs a project with every file it uses that is available here (the rest is listed in LEEME.txt). */
export async function buildProjectFile(p: Project, o: { blob?: BlobResolver } = {}): Promise<Blob> {
  const blobOf = o.blob ?? storeBlob;
  const files: ProjectFileMedia[] = [];
  const parts: Array<{ name: string; data: Blob | Uint8Array | string }> = [];
  const missing: MediaRef[] = [];
  for (const m of projectMedia(p)) {
    const id = m.ref.id;
    const got = id ? await blobOf(id).catch(() => null) : null;
    if (!id || !got) { missing.push(m.ref); continue; }
    const type = got.type || m.ref.type || guessType(m.ref.name ?? '') || (m.ref.kind === 'video' ? 'video/mp4' : 'image/png');
    const name = safeFileName(m.ref.name ?? got.name, m.ref.kind === 'video' ? 'video' : 'imagen');
    const path = `${PROJECT_MEDIA_DIR}${id}-${name}`;
    files.push({ id, path, name, type, kind: m.ref.kind, size: got.blob.size, w: m.ref.w, h: m.ref.h, role: m.role });
    parts.push({ name: path, data: got.blob });
  }
  const doc = { glyphos: 'project', version: 1, exported: new Date().toISOString(), project: p, media: files };
  return zip([{ name: PROJECT_JSON, data: JSON.stringify(doc) }, ...parts, { name: README, data: readme(p, files, missing) }]);
}

export type OpenFailure = 'no-es-proyecto' | 'proyecto-laboratorio' | 'sesion-laboratorio' | 'receta-laboratorio' | 'dañado' | 'demasiado-grande';

export type OpenResult =
  /** `missing`: files the project uses that the file did not bring (they may still be stored in this browser). */
  | { ok: true; project: Project; restored: number; missing: MediaRef[] }
  | { ok: false; reason: OpenFailure; message: string; recipe?: Recipe };

const MESSAGES: Record<OpenFailure, string> = {
  'no-es-proyecto': 'Ese archivo no es un proyecto del estudio de foto (no tiene proyecto.glyphos.json).',
  'proyecto-laboratorio': 'Ese .zip es un proyecto del laboratorio (una pieza con su receta). Ábrelo en el laboratorio, o llévalo al estudio de foto como una capa ASCII.',
  'sesion-laboratorio': 'Ese .zip es una sesión del laboratorio (historial y colección). Ábrela en el laboratorio: «Colección» → «Abrir sesión».',
  'receta-laboratorio': 'Ese archivo es una receta del laboratorio. Ábrela en el laboratorio, o llévala al estudio de foto como una capa ASCII.',
  'dañado': 'No se pudo leer ese archivo: está dañado o no es un proyecto de GLYPHOS.',
  'demasiado-grande': 'Ese archivo es demasiado grande para abrirlo aquí.',
};

const fail = (reason: OpenFailure, recipe?: Recipe): OpenResult => ({ ok: false, reason, message: MESSAGES[reason], ...(recipe ? { recipe } : {}) });

/** Stores one file of an archive and returns its id (the media store's by default). */
export type MediaSink = (data: Uint8Array, meta: { kind: 'image' | 'video'; name: string; type: string; w: number; h: number }) => Promise<string>;

const storeSink: MediaSink = async (data, meta) => {
  const blob = new Blob([data as BlobPart], { type: meta.type });
  const r = await put(blob, { kind: meta.kind, name: meta.name, w: meta.w, h: meta.h });
  if (!r.stored) keepBlob(r.id, blob, meta.name);
  return r.id;
};

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const hidden = (f: ZipEntry) => f.name.startsWith('__MACOSX/') || baseName(f.name).startsWith('._');

/** Opens a project file (or tells what else it is). Never throws. */
export async function openProjectFile(input: Blob, o: { store?: MediaSink } = {}): Promise<OpenResult> {
  try {
    return await open(input, o.store ?? storeSink);
  } catch {
    return fail('dañado');
  }
}

async function open(input: Blob, sink: MediaSink): Promise<OpenResult> {
  if (!(await looksLikeZip(input))) {
    // a bare JSON: a project without its files, or a lab recipe
    if (input.size > MAX_JSON) return fail('demasiado-grande');
    const text = await input.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { return fail('no-es-proyecto'); }
    const doc = json as { glyphos?: unknown; project?: unknown };
    if (doc && doc.glyphos === 'project' && isProjectLike(doc.project)) return fromDoc(doc as { project: unknown }, new Map(), [], sink);
    if (isProjectLike(json)) return fromDoc({ project: json }, new Map(), [], sink);
    const recipe = parseRecipe(text);
    return recipe ? fail('receta-laboratorio', recipe) : fail('no-es-proyecto');
  }
  const files = await unzip(input);
  const main = files.find(f => baseName(f.name) === PROJECT_JSON && !hidden(f));
  if (!main) {
    if (isLabProject(files)) {
      // only its recipe: its picture or video (up to hundreds of MB, or a crafted entry that inflates to GB)
      // is not needed to say what the file is
      const recipe = await readProjectRecipe(files, MAX_JSON).catch(() => null);
      return fail('proyecto-laboratorio', recipe ?? undefined);
    }
    if (isSession(files)) return fail('sesion-laboratorio');
    return fail('no-es-proyecto');
  }
  if (main.size > MAX_JSON) return fail('demasiado-grande');
  let doc: { glyphos?: unknown; project?: unknown; media?: unknown };
  try { doc = JSON.parse(await main.text()); } catch { return fail('dañado'); }
  if (!doc || typeof doc !== 'object' || !isProjectLike(doc.project)) return fail('dañado');
  const prefix = main.name.slice(0, main.name.length - PROJECT_JSON.length);
  const byName = new Map(files.filter(f => !hidden(f)).map(f => [f.name, f]));
  return fromDoc(doc, byName, Array.isArray(doc.media) ? doc.media : [], sink, prefix);
}

async function fromDoc(doc: { project?: unknown }, byName: Map<string, ZipEntry>, manifest: unknown[], sink: MediaSink, prefix = ''): Promise<OpenResult> {
  const project = normalizeProject(doc.project);
  const ids = new Map<string, string>();
  let restored = 0;
  for (const m of manifest) {
    const e = (m && typeof m === 'object' ? m : {}) as Partial<ProjectFileMedia>;
    if (typeof e.id !== 'string' || typeof e.path !== 'string' || ids.has(e.id)) continue;
    const f = byName.get(prefix + e.path);
    if (!f || f.size > MAX_FILE) continue;
    const type = typeof e.type === 'string' && e.type ? e.type : guessType(e.name ?? f.name);
    const kind = e.kind === 'video' || e.kind === 'image' ? e.kind : kindOfType(type) ?? 'image';
    const data = await f.read();
    const id = await sink(data, { kind, name: typeof e.name === 'string' ? e.name : baseName(f.name), type, w: Number(e.w) || 0, h: Number(e.h) || 0 });
    ids.set(e.id, id);
    restored++;
  }
  rewriteMediaIds(project, ids);
  const old = project.id;
  project.id = uid();
  project.meta = { ...project.meta, openedFrom: old };
  project.updated = Date.now();
  // what the project uses and the file did not bring (or brought damaged)
  const brought = new Set(ids.values());
  const missing = projectMedia(project).map(m => m.ref).filter(r => !r.id || !brought.has(r.id));
  return { ok: true, project, restored, missing };
}
