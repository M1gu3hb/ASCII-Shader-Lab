/**
 * "Proyecto exportado": one piece in a .zip that opens the same anywhere.
 *   receta.glyphos.json   the recipe (same format as the recipe file); projects made as GLYPHOS
 *                         carry receta.glyphos.json, which opens the same
 *   medios/<file name>     the original image or video, when the piece uses one
 *   LEEME.txt              how to reopen it, in Spanish
 */
import type { MediaRef, Recipe } from '../engine/recipe';
import { parseRecipe, publicRecipe, recipeFile } from './share';
import { SITE_URL as SITE } from './site';
import { zip, type ZipEntry } from './zip';

export const PROJECT_RECIPE = 'receta.glyphos.json';
/** Recipe names a project may carry: the current one and the one from before the rename. */
const RECIPE_NAMES = [PROJECT_RECIPE, 'receta.monotrama.json'];
const isRecipeFile = (f: ZipEntry) => RECIPE_NAMES.includes(baseName(f.name)) && !f.name.startsWith('__MACOSX/');
export const PROJECT_README = 'LEEME.txt';
export const MEDIA_DIR = 'medios/';
/** Saved states of the piece's visual families (layer.fam.ck): `estados/<id>.glyphos-estado`. */
export const STATES_DIR = 'estados/';
export const STATE_EXT = '.glyphos-estado';
/** A saved state travelling in a file. */
export interface PackedState { id: string; data: Uint8Array | Blob }
const STATE_ID = /^[0-9a-f]{16}$/;
/** States read from an archive (bytes on demand, at most this many). */
export const STATES_MAX = 400;
export function statesIn(files: ZipEntry[], prefix: string): Array<{ id: string; size: number; read: () => Promise<Uint8Array> }> {
  const out: Array<{ id: string; size: number; read: () => Promise<Uint8Array> }> = [];
  for (const f of files) {
    if (!f.name.startsWith(prefix + STATES_DIR) || f.name.startsWith('__MACOSX/')) continue;
    const id = baseName(f.name).replace(STATE_EXT, '');
    if (!STATE_ID.test(id) || !f.name.endsWith(STATE_EXT)) continue;
    out.push({ id, size: f.size, read: () => f.read() });
    if (out.length >= STATES_MAX) break;
  }
  return out;
}

/**
 * Glyph sets made in «Crea tus GLYPHOS» that the piece draws with (recipe.glyph.set): `glifos/<id>.json`,
 * the set's canonical bytes (the id is their hash: a reader checks it).
 */
export const GLYPHS_DIR = 'glifos/';
export const GLYPHS_EXT = '.json';
export const GLYPHS_MAX = 64;
export function glyphSetsIn(files: ZipEntry[], prefix: string): Array<{ id: string; size: number; read: () => Promise<Uint8Array> }> {
  const out: Array<{ id: string; size: number; read: () => Promise<Uint8Array> }> = [];
  for (const f of files) {
    if (!f.name.startsWith(prefix + GLYPHS_DIR) || f.name.startsWith('__MACOSX/') || !f.name.endsWith(GLYPHS_EXT)) continue;
    const id = baseName(f.name).slice(0, -GLYPHS_EXT.length);
    if (!STATE_ID.test(id)) continue;
    out.push({ id, size: f.size, read: () => f.read() });
    if (out.length >= GLYPHS_MAX) break;
  }
  return out;
}

export interface PackedMedia { name: string; type: string; data: Blob | Uint8Array }
export interface UnpackedMedia { name: string; type: string; data: Uint8Array }

/** A single file name that is safe inside a zip: no folders, no control characters. */
export function safeFileName(name: string | undefined, fallback: string): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/^\.+/, '').trim().slice(0, 120);
  return clean || fallback;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};
export const extFor = (type: string, kind: 'image' | 'video') => EXT[type] ?? (kind === 'image' ? 'img' : 'video');

function mediaWord(ref: MediaRef | undefined) {
  return ref?.kind === 'video'
    ? { la: 'el video', La: 'El video', una: 'un video', la_: 'lo', con: 'con él', guardada: 'guardado', incluida: 'incluido' }
    : { la: 'la imagen', La: 'La imagen', una: 'una imagen', la_: 'la', con: 'con ella', guardada: 'guardada', incluida: 'incluida' };
}

function readme(r: Recipe, mediaPath: string | null, states = 0, sets = 0): string {
  const ref = r.media.ref;
  const uses = (r.source === 'image' || r.source === 'video') && ref;
  const w = mediaWord(ref);
  const lines = [
    'GLYPHOS · proyecto exportado',
    '==============================',
    '',
    `Este .zip guarda una pieza hecha con GLYPHOS (${SITE}).`,
    '',
    'Contenido',
    `- ${PROJECT_RECIPE}: todos los ajustes de la pieza. Es exacta: la pieza se reabre tal cual.`,
  ];
  if (mediaPath) lines.push(`- ${mediaPath}: ${w.la} original que usa la pieza, tal como ${w.la_} elegiste (sin recomprimir).`);
  lines.push(`- ${PROJECT_README}: este archivo.`, '');
  if (uses && !mediaPath) {
    lines.push(`La pieza usa ${w.una} que no estaba ${w.guardada} en el navegador al exportar, así que no va ${w.incluida}:`,
      `al abrirla, el estudio pedirá que elijas ${w.una}. Mientras tanto se ve el patrón de fondo.`, '');
  }
  lines.push(
    'Cómo reabrirla',
    `1. Abre el estudio: ${SITE}/studio/`,
    '2. Arrastra este .zip sobre el lienzo, o usa «Colección» → «Importar receta, colección o proyecto».',
    mediaPath ? `   ${w.La} se guarda en tu navegador y la pieza se abre ${w.con}.` : '   La pieza se abre en tu historial.',
    '',
    ...(states ? [`   Lleva ${states === 1 ? 'el estado guardado de su simulación' : `${states} estados guardados de sus simulaciones`} (carpeta estados/): continúa exactamente desde ahí.`] : []),
    ...(sets ? [`   Lleva el juego de glifos${r.glyph.setName ? ` «${r.glyph.setName}»` : ''} con el que se dibuja (carpeta glifos/): se guarda en tu navegador al abrirla.`] : []),
    ...(r.glyph.set && !sets ? ['   Usa un juego de glifos propio que no estaba en el navegador al exportar: se verá con su tipografía.'] : []),
    'Todo se procesa en tu navegador: nada se sube a ningún servidor.',
    'Lo que creas es tuyo. Si compartes la pieza, asegúrate de tener derecho a usar la imagen o el video.',
    '',
  );
  return lines.join('\r\n');
}

/**
 * Packs a piece. Without its media, the recipe's media reference is stripped like in a link
 * (no file name, no local id), so the person who opens it is asked for a file of their own.
 */
export async function buildProject(recipe: Recipe, media?: PackedMedia | null, states: PackedState[] = [], sets: PackedState[] = []): Promise<Blob> {
  const ref = recipe.media.ref;
  const r = media && ref ? recipe : publicRecipe(recipe);
  const files: Array<{ name: string; data: string | Blob | Uint8Array }> = [{ name: PROJECT_RECIPE, data: recipeFile(r) }];
  let path: string | null = null;
  if (media && ref) {
    path = MEDIA_DIR + safeFileName(media.name, `${ref.kind === 'video' ? 'video' : 'imagen'}.${extFor(media.type, ref.kind)}`);
    files.push({ name: path, data: media.data });
  }
  for (const st of states) files.push({ name: STATES_DIR + st.id + STATE_EXT, data: st.data });
  for (const g of sets) files.push({ name: GLYPHS_DIR + g.id + GLYPHS_EXT, data: g.data });
  files.push({ name: PROJECT_README, data: readme(r, path, states.length, sets.length) });
  return zip(files);
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);

/** True when the archive holds a project (its recipe file, possibly inside one folder). */
export function isProject(files: ZipEntry[]): boolean {
  return files.some(isRecipeFile);
}

/**
 * Only the recipe of a project archive, without reading its media (for telling what a file is), or null.
 * Recipe files larger than `max` bytes (as the archive declares them) are not read.
 */
export async function readProjectRecipe(files: ZipEntry[], max = 32 * 1024 * 1024): Promise<Recipe | null> {
  const rec = files.find(isRecipeFile);
  if (!rec || rec.size > max) return null;
  return parseRecipe(await rec.text());
}

/** Opens a project archive. Returns null when there is no valid recipe in it. */
export async function readProject(files: ZipEntry[]): Promise<{ recipe: Recipe; media: UnpackedMedia | null; states: ReturnType<typeof statesIn>; sets: ReturnType<typeof glyphSetsIn> } | null> {
  const rec = files.find(isRecipeFile);
  if (!rec) return null;
  const recipe = parseRecipe(await rec.text());
  if (!recipe) return null;
  // re-zipped folders keep everything under one prefix ("pieza/receta.glyphos.json")
  const prefix = rec.name.slice(0, rec.name.length - baseName(rec.name).length);
  const states = statesIn(files, prefix);
  const sets = glyphSetsIn(files, prefix);
  const m = files.find(f => f.name.startsWith(prefix + MEDIA_DIR) && !f.name.startsWith('__MACOSX/') && !baseName(f.name).startsWith('.'));
  if (!m) return { recipe, media: null, states, sets };
  const name = baseName(m.name);
  return { recipe, media: { name, type: recipe.media.ref?.type ?? '', data: await m.read() }, states, sets };
}
