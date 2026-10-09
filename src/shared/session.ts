/**
 * "Sesión": the whole history and collection of this browser in one .zip, to keep a copy or move
 * to another computer.
 *   sesion.json          entries (with their original recipes and thumbnails), cursor, favourites
 *   medios/<id>-<name>   the local images and videos they use (optional)
 *   LEEME.txt            what it is and how to open it
 * Entries and favourites are passed through as plain data; the studio normalises them on import.
 * A collection backup is the same archive with `scope: 'collection'`, no entries and only the media the
 * collection uses (older studios open it as a session that adds pieces to the collection).
 */
import { SITE_URL } from './site';
import { normMediaRef } from '../engine/recipe';
import { GLYPHS_DIR, GLYPHS_EXT, MEDIA_DIR, STATES_DIR, STATE_EXT, glyphSetsIn, safeFileName, statesIn, type PackedState } from './project';
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
/** What an archive holds: the whole session, or only the collection. */
export type SessionScope = 'all' | 'collection';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const sessionFileName = (d = new Date()) => `glyphos-sesion-${ymd(d)}.zip`;
export const collectionFileName = (d = new Date()) => `glyphos-coleccion-${ymd(d)}.zip`;

/** The studio's history limit (studio/history.ts HISTORY_LIMIT), for the LEEME. */
const LIMIT = 1000;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const readme = (n: number, favs: number, media: number) => [
  'GLYPHOS · sesión guardada',
  '===========================',
  '',
  `${count(n, 'resultado', 'resultados')} del historial y ${count(favs, 'pieza', 'piezas')} de la colección${media ? `, con ${count(media, 'archivo', 'archivos')} de imagen o video` : ''}.`,
  '',
  `Para abrirla: en el estudio (${SITE_URL}/studio/) arrastra este .zip sobre el lienzo,`,
  'o usa «Colección» → «Abrir sesión». Los resultados se añaden a tu historial y las piezas a tu colección.',
  `El historial guarda como mucho ${LIMIT} resultados: si al abrirla los superas, se descartan los más antiguos`,
  '(las ediciones y lo guardado con ★ se conservan, incluso si superan ese límite) y el estudio te dice antes cuántos.',
  '',
  'Todo se procesa en tu navegador: nada se sube a ningún servidor.',
  '',
].join('\r\n');

const readmeCollection = (favs: number, media: number) => [
  'GLYPHOS · colección guardada',
  '==============================',
  '',
  `${count(favs, 'pieza', 'piezas')} de tu colección (lo que guardaste con ★)${media ? `, con ${count(media, 'archivo', 'archivos')} de imagen o video que usan` : ''}.`,
  '',
  `Para abrirla: en el estudio (${SITE_URL}/studio/) arrastra este .zip sobre el lienzo,`,
  'o usa «Colección» → «Importar receta, colección o proyecto». Las piezas se añaden a tu colección;',
  'las que ya tengas no se duplican (se queda la versión cambiada más tarde).',
  '',
  'Todo se procesa en tu navegador: nada se sube a ningún servidor.',
  '',
].join('\r\n');

export async function buildSession(data: SessionData, media: Array<SessionMedia & { data: Blob | Uint8Array }> = [], scope: SessionScope = 'all', states: PackedState[] = [], sets: PackedState[] = []): Promise<Blob> {
  const packed = media.map(m => ({ ...m, path: `${MEDIA_DIR}${m.id}-${safeFileName(m.name, m.kind === 'video' ? 'video' : 'imagen')}` }));
  const doc = {
    glyphos: 'session', version: 1, exported: new Date().toISOString(), ...(scope === 'collection' ? { scope } : {}),
    cursor: data.cursor, entries: data.entries, favorites: data.favorites,
    media: packed.map(({ data: _d, ...meta }) => meta),
  };
  return zip([
    { name: SESSION_FILE, data: JSON.stringify(doc) },
    ...packed.map(m => ({ name: m.path, data: m.data })),
    // saved states of family layers (layer.fam.ck), by content id; older studios ignore the folder
    ...states.map(st => ({ name: STATES_DIR + st.id + STATE_EXT, data: st.data })),
    // glyph sets made in «Crea tus GLYPHOS» that pieces draw with (recipe.glyph.set)
    ...sets.map(g => ({ name: GLYPHS_DIR + g.id + GLYPHS_EXT, data: g.data })),
    { name: README, data: scope === 'collection' ? readmeCollection(data.favorites.length, media.length) : readme(data.entries.length, data.favorites.length, media.length) },
  ]);
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export function isSession(files: ZipEntry[]): boolean {
  return files.some(f => baseName(f.name) === SESSION_FILE && !f.name.startsWith('__MACOSX/'));
}

/** Opens a session archive. Media are read on demand. Returns null when it is not a session. */
export async function readSession(files: ZipEntry[]): Promise<{ data: SessionData; scope: SessionScope; media: Array<{ meta: SessionMedia; read: () => Promise<Uint8Array> }>; states: ReturnType<typeof statesIn>; sets: ReturnType<typeof glyphSetsIn> } | null> {
  const f = files.find(x => baseName(x.name) === SESSION_FILE && !x.name.startsWith('__MACOSX/'));
  if (!f) return null;
  let doc: Record<string, unknown>;
  try { doc = JSON.parse(await f.text()); } catch { return null; }
  if (!doc || (doc.glyphos ?? doc.monotrama) !== 'session' || !Array.isArray(doc.entries)) return null;
  if (typeof doc.version === 'number' && doc.version > 1) throw new Error('Esta sesión usa una versión más nueva de GLYPHOS. Conserva el archivo original y actualiza el estudio.');
  if (doc.entries.length > 10_000 || (Array.isArray(doc.favorites) && doc.favorites.length > 10_000)) throw new Error('La sesión supera el límite de 10 000 entradas o piezas por archivo.');
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
    scope: doc.scope === 'collection' ? 'collection' : 'all',
    data: {
      entries: doc.entries,
      favorites: Array.isArray(doc.favorites) ? doc.favorites : [],
      cursor: typeof doc.cursor === 'number' ? doc.cursor : doc.entries.length - 1,
    },
    media,
    states: statesIn(files, prefix),
    sets: glyphSetsIn(files, prefix),
  };
}
