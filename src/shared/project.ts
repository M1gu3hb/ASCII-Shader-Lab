/**
 * "Proyecto exportado": one piece in a .zip that opens the same anywhere.
 *   receta.monotrama.json  the recipe (same format as the recipe file)
 *   medios/<file name>     the original image or video, when the piece uses one
 *   LEEME.txt              how to reopen it, in Spanish
 */
import type { MediaRef, Recipe } from '../engine/recipe';
import { parseRecipe, publicRecipe, recipeFile } from './share';
import { zip, type ZipEntry } from './zip';

export const PROJECT_RECIPE = 'receta.monotrama.json';
export const PROJECT_README = 'LEEME.txt';
export const MEDIA_DIR = 'medios/';
const SITE = 'https://monotrama.vercel.app';

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
    ? { la: 'el video', La: 'El video', una: 'un video', la_: 'lo', con: 'con él' }
    : { la: 'la imagen', La: 'La imagen', una: 'una imagen', la_: 'la', con: 'con ella' };
}

function readme(r: Recipe, mediaPath: string | null): string {
  const ref = r.media.ref;
  const uses = (r.source === 'image' || r.source === 'video') && ref;
  const w = mediaWord(ref);
  const lines = [
    'Monotrama · proyecto exportado',
    '==============================',
    '',
    `Este .zip guarda una pieza hecha con Monotrama (${SITE}).`,
    '',
    'Contenido',
    `- ${PROJECT_RECIPE}: todos los ajustes de la pieza. Es exacta: la pieza se reabre tal cual.`,
  ];
  if (mediaPath) lines.push(`- ${mediaPath}: ${w.la} original que usa la pieza, tal como ${w.la_} elegiste (sin recomprimir).`);
  lines.push(`- ${PROJECT_README}: este archivo.`, '');
  if (uses && !mediaPath) {
    lines.push(`La pieza usa ${w.una} que no estaba guardada en el navegador al exportar, así que no va incluida:`,
      `al abrirla, el estudio pedirá que elijas ${w.una}. Mientras tanto se ve el patrón de fondo.`, '');
  }
  lines.push(
    'Cómo reabrirla',
    `1. Abre el estudio: ${SITE}/studio/`,
    '2. Arrastra este .zip sobre el lienzo, o usa «Colección» → «Importar receta, colección o proyecto».',
    mediaPath ? `   ${w.La} se guarda en tu navegador y la pieza se abre ${w.con}.` : '   La pieza se abre en tu historial.',
    '',
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
export async function buildProject(recipe: Recipe, media?: PackedMedia | null): Promise<Blob> {
  const ref = recipe.media.ref;
  const r = media && ref ? recipe : publicRecipe(recipe);
  const files: Array<{ name: string; data: string | Blob | Uint8Array }> = [{ name: PROJECT_RECIPE, data: recipeFile(r) }];
  let path: string | null = null;
  if (media && ref) {
    path = MEDIA_DIR + safeFileName(media.name, `${ref.kind === 'video' ? 'video' : 'imagen'}.${extFor(media.type, ref.kind)}`);
    files.push({ name: path, data: media.data });
  }
  files.push({ name: PROJECT_README, data: readme(r, path) });
  return zip(files);
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);

/** True when the archive holds a project (its recipe file, possibly inside one folder). */
export function isProject(files: ZipEntry[]): boolean {
  return files.some(f => baseName(f.name) === PROJECT_RECIPE && !f.name.startsWith('__MACOSX/'));
}

/** Opens a project archive. Returns null when there is no valid recipe in it. */
export async function readProject(files: ZipEntry[]): Promise<{ recipe: Recipe; media: UnpackedMedia | null } | null> {
  const rec = files.find(f => baseName(f.name) === PROJECT_RECIPE && !f.name.startsWith('__MACOSX/'));
  if (!rec) return null;
  const recipe = parseRecipe(await rec.text());
  if (!recipe) return null;
  // re-zipped folders keep everything under one prefix ("pieza/receta.monotrama.json")
  const prefix = rec.name.slice(0, rec.name.length - PROJECT_RECIPE.length);
  const m = files.find(f => f.name.startsWith(prefix + MEDIA_DIR) && !f.name.startsWith('__MACOSX/') && !baseName(f.name).startsWith('.'));
  if (!m) return { recipe, media: null };
  const name = baseName(m.name);
  return { recipe, media: { name, type: recipe.media.ref?.type ?? '', data: await m.read() } };
}
