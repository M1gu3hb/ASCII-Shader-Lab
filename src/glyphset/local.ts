import { createStore, get, type UseStore } from 'idb-keyval';
import { declareGlyphSetMissing, onMissingGlyphSet, provideGlyphSet } from './registry';
import { isGlyphSetId, parseGlyphSet, type GlyphSet } from './set';

/**
 * Glyph sets of this browser: «Crea tus GLYPHOS» keeps them in its store ('glyphos-glifos' / 'datos', key
 * `g:<content id>`, value { bytes, … }). The lab and the viewer read them from there for their engines.
 */

let db: UseStore | null = null;
export const glyphStore = () => (db ??= createStore('glyphos-glifos', 'datos'));

export async function readLocalGlyphSet(id: string): Promise<GlyphSet | null> {
  if (!isGlyphSetId(id)) return null;
  try {
    const r = await get<{ bytes?: unknown }>('g:' + id, glyphStore());
    const b = r?.bytes;
    if (!b) return null;
    return parseGlyphSet(b instanceof Uint8Array ? b : new Uint8Array(b as ArrayBuffer));
  } catch { return null; }
}

/** Engines ask for sets they do not hold: from this browser's storage, or declared missing (drawn with the font). */
export function installLocalGlyphSets() {
  onMissingGlyphSet(id => { void readLocalGlyphSet(id).then(s => (s ? provideGlyphSet(id, s) : declareGlyphSetMissing(id))); });
}

/** The notice for a piece whose set this browser does not have (the lab and the viewer show it). */
export function missingSetNotice(r: { glyph: { setName?: string } }, fontName: string): string {
  const name = r.glyph.setName ? `«${r.glyph.setName}»` : 'propio';
  return `Esta pieza usa el juego de glifos ${name}, que no está en este navegador: se ve con la tipografía ${fontName}. Los enlaces no llevan juegos de glifos; ábrela desde el proyecto, la sesión o el paquete .glyphos-glifos que lo trae.`;
}
