/**
 * "Sesión": the whole history and collection of this browser in one .zip, to keep a copy or move
 * to another computer.
 *   sesion.json          entries (with their original recipes and thumbnails), cursor, favourites
 *   medios/<id>-<name>   the local images and videos they use (optional)
 *   LEEME.txt            what it is and how to open it
 * Entries and favourites are passed through as plain data; the studio normalises them on import.
 */
import { SITE_URL } from './site';
import { normMediaRef } from '../engine/recipe';
import { MEDIA_DIR, safeFileName } from './project';
import { zip, type ZipEntry } from './zip';

export const SESSION_FILE = 'sesion.json';
const README = 'LEEME.txt';

export interface SessionMedia {
  id: string;
  kind: 'image' | 'video';
  name: string;
  type: string;
  size: number;
  w: number;
  h: number;
}

export interface SessionData { entries: unknown[]; favorites: unknown[]; cursor: number }

const pad = (n: number) => String(n).padStart(2, '0');
export const sessionFileName = (d = new Date()) => `monotrama-sesion-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`;

const readme = (n: number, favs: number, media: number) => [
  'Monotrama · sesión guardada',
  '===========================',
  '',
  `${n} resultados del historial y ${favs} piezas de la colección${media ? `, con ${media} ${media === 1 ? 'archivo' : 'archivos'} de imagen o video` : ''}.`,
  '',
  `Para abrirla: en el estudio (${SITE_URL}/studio/) arrastra este .zip sobre el lienzo,`,
  'o usa «Colección» → «Abrir sesión». Los resultados se añaden después de tu historial; no se borra nada.',
  '',
  'Todo se procesa en tu navegador: nada se sube a ningún servidor.',
  '',
].join('\r\n');

export async function buildSession(data: SessionData, media: Array<SessionMedia & { data: Blob | Uint8Array }> = []): Promise<Blob> {
  const packed = media.map(m => ({ ...m, path: `${MEDIA_DIR}${m.id}-${safeFileName(m.name, m.kind === 'video' ? 'video' : 'imagen')}` }));
  const doc = {
    monotrama: 'session', version: 1, exported: new Date().toISOString(),
    cursor: data.cursor, entries: data.entries, favorites: data.favorites,
    media: packed.map(({ data: _d, ...meta }) => meta),
  };
  return zip([
    { name: SESSION_FILE, data: JSON.stringify(doc) },
    ...packed.map(m => ({ name: m.path, data: m.data })),
    { name: README, data: readme(data.entries.length, data.favorites.length, media.length) },
  ]);
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export function isSession(files: ZipEntry[]): boolean {
  return files.some(f => baseName(f.name) === SESSION_FILE && !f.name.startsWith('__MACOSX/'));
}

/** Opens a session archive. Media are read on demand. Returns null when it is not a session. */
export async function readSession(files: ZipEntry[]): Promise<{ data: SessionData; media: Array<{ meta: SessionMedia; read: () => Promise<Uint8Array> }> } | null> {
  const f = files.find(x => baseName(x.name) === SESSION_FILE && !x.name.startsWith('__MACOSX/'));
  if (!f) return null;
  let doc: Record<string, unknown>;
  try { doc = JSON.parse(await f.text()); } catch { return null; }
  if (!doc || doc.monotrama !== 'session' || !Array.isArray(doc.entries)) return null;
  const prefix = f.name.slice(0, f.name.length - SESSION_FILE.length);
  const byName = new Map(files.map(x => [x.name, x]));
  const media: Array<{ meta: SessionMedia; read: () => Promise<Uint8Array> }> = [];
  for (const m of Array.isArray(doc.media) ? doc.media : []) {
    const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    const ref = normMediaRef(o);
    const file = typeof o.path === 'string' ? byName.get(prefix + o.path) : undefined;
    if (!ref?.id || !file) continue;
    media.push({
      meta: { id: ref.id, kind: ref.kind, name: ref.name ?? baseName(file.name), type: ref.type ?? '', size: file.size, w: ref.w, h: ref.h },
      read: () => file.read(),
    });
  }
  return {
    data: {
      entries: doc.entries,
      favorites: Array.isArray(doc.favorites) ? doc.favorites : [],
      cursor: typeof doc.cursor === 'number' ? doc.cursor : doc.entries.length - 1,
    },
    media,
  };
}
