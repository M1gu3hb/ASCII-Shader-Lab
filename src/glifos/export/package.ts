/**
 * The portable project file of «Crea tus GLYPHOS»: «<nombre>.glyphos-glifos», a ZIP (store method, see
 * src/shared/zip.ts) that carries a glyph document to another browser or computer:
 *
 *   glifos.json             manifest { kind: 'glyphos-glifos-paquete', v: 1, doc, rev, name, created (ISO), sets, images }
 *   documento.json          the editable document (GlyphDoc)
 *   imagenes/<id>.<ext>     each picture the document uses (PNG, JPEG or WebP), named by its content id
 *   juegos/<setId>.json     each compiled set published to the lab (its canonical bytes, glyphSetBytes)
 *   LEEME.txt               what this is, in Spanish
 *
 * Everything read back is validated: the manifest, the document (normalizeDoc), every set (parseGlyphSet and
 * its id against the hash of its bytes) and every picture (its kind by magic bytes, its id against the hash
 * of its bytes, size limits). What does not match is dropped with a warning, never trusted. A bare
 * documento.json (no ZIP) opens too.
 */
import { GLYPHSET_LIMITS, glyphSetBytes, isGlyphSetId, parseGlyphSet, type GlyphSet } from '../../glyphset/set';
import { hashBytes } from '../../studio/mediaStore';
import { looksLikeZip, unzip, zip, type ZipInput } from '../../shared/zip';
import { DOC_LIMITS, normalizeDoc, type GlyphDoc } from '../doc';

export const PACKAGE_KIND = 'glyphos-glifos-paquete';
export const PACKAGE_FORMAT = 1;
export const PACKAGE_EXT = '.glyphos-glifos';
export const PACKAGE_LIMITS = { image: 20 * 1024 * 1024, images: 200 * 1024 * 1024, manifest: 1024 * 1024 } as const;
export const PACKAGE_FUTURE = 'Ese archivo de glifos viene de una versión más nueva de GLYPHOS y no se puede abrir aquí. Actualiza el estudio y vuelve a intentarlo.';

export interface PackageManifest {
  kind: typeof PACKAGE_KIND;
  v: number;
  doc: string;
  rev: number;
  name: string;
  created: string;
  sets: string[];
  images: string[];
}

export type PackageImageType = 'image/png' | 'image/jpeg' | 'image/webp';
const EXT: Record<PackageImageType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** The kind of a picture by its first bytes (never by its name or declared type). */
export function sniffImage(b: Uint8Array): PackageImageType | null {
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

/** A file name for the package: the project's name without characters file systems refuse. */
export function packageFileName(name: string): string {
  const base = name.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 60);
  return (base || 'glifos') + PACKAGE_EXT;
}

function readme(doc: GlyphDoc): string {
  return [
    `GLYPHOS · Crea tus GLYPHOS · «${doc.name}»`,
    '',
    'Este archivo es un proyecto de glifos de GLYPHOS: el documento editable con tus dibujos, las imágenes que usa y los juegos de glifos que publicaste para el laboratorio.',
    '',
    'Para abrirlo, entra en /studio/glifos/ en GLYPHOS y elige «Abrir proyecto». Todo se lee en tu navegador: nada se sube a ningún servidor.',
    '',
    'Qué hay dentro (es un .zip):',
    '- glifos.json: la descripción del paquete.',
    '- documento.json: el documento editable. Las coordenadas están en unidades de fuente, con el eje y hacia arriba y la línea base en 0.',
    '- imagenes/: las imágenes que usa el documento, cada una con el nombre de su contenido.',
    '- juegos/: los juegos de glifos compilados, tal como los dibujan los motores del laboratorio.',
    '- LEEME.txt: este texto.',
    '',
    'Las piezas del laboratorio hechas con estos glifos los necesitan para verse en otro navegador o en otro equipo: lleva este archivo, o el proyecto o la sesión del laboratorio, que también los incluyen.',
    '',
  ].join('\n');
}

/** Builds the package. Pictures the provider cannot give (or that are not PNG, JPEG or WebP) are listed in `missingImages`. */
export async function writePackage(doc: GlyphDoc, o: { images: (id: string) => Promise<Blob | undefined>; sets: Array<{ id: string; bytes: Uint8Array }> }): Promise<{ blob: Blob; missingImages: string[] }> {
  const missingImages: string[] = [];
  const imageFiles: ZipInput[] = [];
  const imageIds: string[] = [];
  for (const id of Object.keys(doc.images)) {
    let blob: Blob | undefined;
    try { blob = await o.images(id); } catch { blob = undefined; }
    const type = blob ? sniffImage(new Uint8Array(await blob.slice(0, 16).arrayBuffer())) : null;
    if (!blob || !type) { missingImages.push(id); continue; }
    imageFiles.push({ name: `imagenes/${id}.${EXT[type]}`, data: blob });
    imageIds.push(id);
  }
  const setFiles: ZipInput[] = [];
  const setIds: string[] = [];
  for (const s of o.sets) {
    if (!isGlyphSetId(s.id) || setIds.includes(s.id)) continue;
    setFiles.push({ name: `juegos/${s.id}.json`, data: s.bytes });
    setIds.push(s.id);
  }
  const manifest: PackageManifest = { kind: PACKAGE_KIND, v: PACKAGE_FORMAT, doc: doc.id, rev: doc.rev, name: doc.name, created: new Date().toISOString(), sets: setIds, images: imageIds };
  const blob = await zip([
    { name: 'glifos.json', data: JSON.stringify(manifest, null, 2) + '\n' },
    { name: 'documento.json', data: JSON.stringify(doc) },
    { name: 'LEEME.txt', data: readme(doc) },
    ...imageFiles,
    ...setFiles,
  ]);
  return { blob, missingImages };
}

export interface ReadPackage {
  doc: GlyphDoc;
  /** The document comes from a newer format: open it read-only, never store it. */
  future: boolean;
  images: Array<{ id: string; blob: Blob; type: string }>;
  sets: Array<{ id: string; set: GlyphSet; bytes: Uint8Array }>;
  /** What was left out and why, in Spanish. */
  warnings: string[];
}

const NOT_GLYPHS = 'Ese archivo no es un proyecto de glifos de GLYPHOS.';

function parseJson(text: string, damaged: string): unknown {
  try { return JSON.parse(text.replace(/^﻿/, '')); } catch { throw new Error(damaged); }
}

function docFrom(raw: unknown): { doc: GlyphDoc; future: boolean } {
  if (raw && typeof raw === 'object' && (raw as { kind?: unknown }).kind === PACKAGE_KIND) throw new Error('Ese archivo es sólo la descripción de un paquete (glifos.json): abre el archivo .glyphos-glifos completo o su documento.json.');
  return normalizeDoc(raw);
}

/** Reads a package (or a bare document JSON), validating everything in it. Throws a readable error when it cannot be opened at all. */
export async function readPackage(input: Blob | Uint8Array): Promise<ReadPackage> {
  const blob = input instanceof Uint8Array ? new Blob([input as BlobPart]) : input;
  const warnings: string[] = [];
  if (!(await looksLikeZip(blob))) {
    if (blob.size > DOC_LIMITS.bytes) throw new Error('El proyecto de glifos es demasiado grande (más de 24 MB).');
    const { doc, future } = docFrom(parseJson(await blob.text(), NOT_GLYPHS));
    const n = Object.keys(doc.images).length;
    if (n) warnings.push(n === 1
      ? 'La imagen del proyecto no viene en este archivo: lo que la usa se verá vacío hasta que la vuelvas a cargar.'
      : `Las ${n} imágenes del proyecto no vienen en este archivo: lo que las usa se verá vacío hasta que las vuelvas a cargar.`);
    return { doc, future, images: [], sets: [], warnings };
  }

  const entries = await unzip(blob);
  // a folder zipped by hand keeps its top folder: read the package from there
  const top = entries.filter(e => /(^|\/)glifos\.json$/.test(e.name)).sort((a, b) => a.name.length - b.name.length)[0];
  if (!top) throw new Error('Ese .zip no es un paquete de glifos de GLYPHOS (le falta glifos.json).');
  const root = top.name.slice(0, -'glifos.json'.length);
  const at = (p: string) => entries.find(e => e.name === root + p);
  const under = (dir: string) => entries.filter(e => e.name.startsWith(root + dir) && e.name.length > (root + dir).length).map(e => ({ e, rest: e.name.slice((root + dir).length) }));

  if (top.size > PACKAGE_LIMITS.manifest) throw new Error('El paquete de glifos está dañado (glifos.json).');
  const m = parseJson(await top.text(), 'El paquete de glifos está dañado (glifos.json).') as Record<string, unknown> | null;
  if (!m || typeof m !== 'object' || m.kind !== PACKAGE_KIND) throw new Error('Ese .zip no es un paquete de glifos de GLYPHOS.');
  if (typeof m.v !== 'number' || !Number.isInteger(m.v) || m.v < 1) throw new Error('El paquete de glifos está dañado (glifos.json).');
  if (m.v > PACKAGE_FORMAT) throw new Error(PACKAGE_FUTURE);

  const d = at('documento.json');
  if (!d) throw new Error('El paquete de glifos no tiene documento.json.');
  if (d.size > DOC_LIMITS.bytes) throw new Error('El proyecto de glifos es demasiado grande (más de 24 MB).');
  const { doc, future } = docFrom(parseJson(await d.text(), 'El documento del paquete de glifos está dañado.'));
  if (typeof m.doc === 'string' && m.doc !== doc.id) warnings.push('La descripción del paquete nombra otro proyecto que su documento: se usa el documento.');

  const sets: ReadPackage['sets'] = [];
  for (const { e, rest } of under('juegos/')) {
    const id = /^([0-9a-f]{16})\.json$/.exec(rest)?.[1];
    if (!id) { warnings.push(`Se ignoró «${e.name}»: no es un juego de glifos del paquete.`); continue; }
    if (e.size > GLYPHSET_LIMITS.bytes) { warnings.push(`El juego ${id} pasa de 6 MB: no se importa.`); continue; }
    try {
      const set = parseGlyphSet(await e.read());
      const bytes = glyphSetBytes(set);
      // its name is the hash of its content: a set that does not hash to it was altered or damaged
      if ((await hashBytes(bytes)) !== id) { warnings.push(`El juego ${id} no coincide con su contenido (está alterado o dañado): no se importa.`); continue; }
      if (!sets.some(s => s.id === id)) sets.push({ id, set, bytes });
    } catch (err) {
      warnings.push(`El juego ${id} no se pudo leer (${(err as Error).message.replace(/\.$/, '')}): no se importa.`);
    }
  }

  const images: ReadPackage['images'] = [];
  let total = 0, overTotal = false;
  for (const { e, rest } of under('imagenes/')) {
    const id = /^([0-9a-f]{16})\.[A-Za-z0-9]{1,5}$/.exec(rest)?.[1];
    if (!id) { warnings.push(`Se ignoró «${e.name}»: no es una imagen del paquete.`); continue; }
    if (e.size > PACKAGE_LIMITS.image) { warnings.push(`La imagen ${id} pasa de 20 MB: no se importa.`); continue; }
    if (total + e.size > PACKAGE_LIMITS.images) {
      if (!overTotal) warnings.push('Las imágenes del paquete pasan de 200 MB en total: las que no caben no se importan.');
      overTotal = true;
      continue;
    }
    total += e.size;
    let bytes: Uint8Array;
    try { bytes = await e.read(); } catch (err) { warnings.push(`La imagen ${id} no se pudo leer (${(err as Error).message.replace(/\.$/, '')}): no se importa.`); continue; }
    const type = sniffImage(bytes);
    if (!type) { warnings.push(`«${e.name}» no es una imagen PNG, JPEG ni WebP: no se importa.`); continue; }
    if ((await hashBytes(bytes)) !== id) { warnings.push(`La imagen ${id} no coincide con su contenido (está alterada o dañada): no se importa.`); continue; }
    if (!images.some(i => i.id === id)) images.push({ id, blob: new Blob([bytes as BlobPart], { type }), type });
  }
  const lacking = Object.keys(doc.images).filter(id => !images.some(i => i.id === id)).length;
  if (lacking) warnings.push(lacking === 1
    ? 'Falta una imagen del proyecto: lo que la usa se verá vacío hasta que la vuelvas a cargar.'
    : `Faltan ${lacking} imágenes del proyecto: lo que las usa se verá vacío hasta que las vuelvas a cargar.`);
  return { doc, future, images, sets, warnings };
}

/* ------------------------------------------------------------------ */
/* Importing next to what this browser already has                     */
/* ------------------------------------------------------------------ */

export type MergeAction = 'nuevo' | 'igual' | 'mas-nuevo' | 'mas-viejo' | 'divergente';

interface DocStamp { id: string; rev: number; updated: number; name: string }

/**
 * Pure: what importing a document means next to this browser's documents. The same revision is nothing to
 * import; a newer one may replace the local one (or both are kept); an older one, or one that changed apart
 * from the local one at the same revision, comes in as a copy and never overwrites what is here.
 */
export function planMerge(local: DocStamp[], incoming: DocStamp): { action: MergeAction; message: string } {
  const l = local.find(d => d.id === incoming.id);
  if (!l) return { action: 'nuevo', message: `«${incoming.name}» se importará como un proyecto nuevo.` };
  if (incoming.rev === l.rev && incoming.updated === l.updated) return { action: 'igual', message: `«${l.name}» ya está en este navegador tal como viene en el archivo: no hay nada que importar.` };
  if (incoming.rev > l.rev) return { action: 'mas-nuevo', message: `El archivo trae una versión más nueva de «${l.name}» (revisión ${incoming.rev}; aquí tienes la ${l.rev}). Puedes reemplazar la de este navegador o conservar las dos.` };
  if (incoming.rev < l.rev) return { action: 'mas-viejo', message: `El archivo trae una versión anterior de «${l.name}» (revisión ${incoming.rev}; aquí tienes la ${l.rev}, que es más nueva). Se importará como copia: la de este navegador no se toca.` };
  return { action: 'divergente', message: `«${l.name}» cambió por separado aquí y en el archivo (los dos en la revisión ${l.rev}). Se importará como copia para no perder ninguno de los dos.` };
}

/** The document as a copy: a new id, « (copia)» after its name, revision 0 and nothing published yet. */
export function asCopy(doc: GlyphDoc, newId: string): GlyphDoc {
  const suffix = ' (copia)';
  const copy = structuredClone(doc);
  copy.id = newId;
  copy.name = doc.name.slice(0, DOC_LIMITS.name - suffix.length).trimEnd() + suffix;
  copy.rev = 0;
  copy.published = [];
  return copy;
}
