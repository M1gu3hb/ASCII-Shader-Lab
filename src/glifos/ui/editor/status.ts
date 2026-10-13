/**
 * What an edit by the person does to a glyph's status (pure): a proposal of the assistant they change is
 * «corrected» (the assistant never replaces it again without asking), and an empty glyph that starts to
 * draw something is «dibujado».
 */
import { hasDrawing, type Glyph } from '../../doc';

export function markEdited(g: Glyph): void {
  if ((g.status === 'propuesto' || g.status === 'aceptado') && g.origin === 'asistente') g.corrected = true;
  if (g.status === 'vacio' && hasDrawing(g)) g.status = 'dibujado';
}

/** Locked glyphs (references, or locked by the person) are only looked at in the editor. */
export const isLocked = (g: Glyph | undefined) => g?.status === 'bloqueado';
