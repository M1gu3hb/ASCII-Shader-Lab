import { glyphSetBytes } from '../../glyphset/set';
import type { GlyphDoc } from '../doc';
import { getImage, getSet } from '../storage';

/** Saves a file through the browser's download. */
export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'glifos';

/**
 * Downloads the project as this tab has it (a .glyphos-glifos file that opens here again): the way out when
 * storage did not take the last changes. Carries the set the lab last took, so a piece made with it reopens.
 */
export async function downloadProjectCopy(doc: GlyphDoc): Promise<{ size: number; missingImages: string[] }> {
  const { writePackage } = await import('../export/package');
  const sets: Array<{ id: string; bytes: Uint8Array }> = [];
  const last = doc.published[doc.published.length - 1];
  const lastSet = last ? await getSet(last.set).catch(() => undefined) : undefined;
  if (last && lastSet) sets.push({ id: last.set, bytes: glyphSetBytes(lastSet) });
  const r = await writePackage(doc, { images: async id => (await getImage(id).catch(() => undefined))?.blob, sets });
  download(`${slug(doc.name)}.glyphos-glifos`, r.blob);
  return { size: r.blob.size, missingImages: r.missingImages };
}
