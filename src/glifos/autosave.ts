/**
 * Saves the open document in this browser a moment after each change, at once when the page is hidden or
 * left, and protects against losing work: a save that fails says why (no space, no storage), another tab
 * that saved the same project makes this one stop writing it (never two tabs overwriting each other), and
 * leaving with changes not yet saved asks first.
 */
import { get } from 'idb-keyval';
import { glyphStore } from '../glyphset/local';
import { isGlyphSetId } from '../glyphset/set';
import type { GlyphDoc } from './doc';
import { saveDoc, type SaveDocResult } from './storage';
import { becomeReadOnly, closeDoc, onDocChange, setSaveState, useGlifos } from './state';

/** How a save ended: 'ok' (stored, or nothing to store) or why the tab still holds changes storage has not. */
export type SaveOutcome = SaveDocResult | 'error';

const DELAY = 600;
let timer = 0;
let savedRev = -1;
let saving: Promise<SaveOutcome> | null = null;
let installed = false;
let lastFailure: SaveOutcome = 'ok';

/**
 * Saves the open document now and says how it went. A document that cannot be written (another tab saved it,
 * a newer version) answers with that reason while the tab still holds changes storage does not have.
 */
async function saveNow(): Promise<SaveOutcome> {
  clearTimeout(timer);
  const { doc, readOnly } = useGlifos.getState();
  if (!doc) return 'ok';
  if (readOnly) return doc.rev === savedRev ? 'ok' : lastFailure === 'ok' ? 'conflict' : lastFailure;
  if (doc.rev === savedRev) return 'ok';
  if (saving) { await saving; return saveNow(); }
  setSaveState('guardando');
  const want = doc;
  saving = (async (): Promise<SaveOutcome> => {
    let r: SaveOutcome;
    try { r = await saveDoc(want, { expectRev: savedRev >= 0 ? savedRev : undefined }); }
    catch { r = 'error'; }
    lastFailure = r;
    if (r === 'ok') {
      savedRev = want.rev;
      const now = useGlifos.getState().doc;
      setSaveState(now && now.rev !== savedRev ? 'pendiente' : 'guardado');
    } else if (r === 'conflict') {
      becomeReadOnly('Otra pestaña guardó este proyecto después que ésta: aquí deja de guardarse para no pisar sus cambios. Recarga para seguir con la versión guardada, o exporta una copia de lo que ves.');
    } else if (r === 'future') {
      becomeReadOnly('Este proyecto se guardó con una versión más nueva de GLYPHOS: aquí sólo se puede mirar.');
    } else if (r === 'full') {
      setSaveState('lleno', 'No queda espacio en este navegador: tus cambios siguen en esta pestaña. Descarga una copia (Exportar → Proyecto) antes de cerrarla.');
    } else if (r === 'unavailable') {
      setSaveState('sin-almacenamiento', 'Este navegador no deja guardar (¿ventana privada?): tus cambios viven sólo en esta pestaña. Descarga una copia antes de cerrarla.');
    } else {
      setSaveState('error', 'No se pudo guardar: tus cambios siguen en esta pestaña. Descarga una copia antes de cerrarla.');
    }
    return r;
  })().finally(() => { saving = null; });
  return saving;
}

/**
 * Changes storage does not have (for the «leave the page?» question and for «Proyectos»). A document that
 * became read-only because another tab saved it still counts: its edits live only in this tab.
 */
export const unsaved = () => {
  const { doc, save } = useGlifos.getState();
  return !!doc && (doc.rev !== savedRev || save === 'lleno' || save === 'sin-almacenamiento' || save === 'error');
};

/**
 * «Proyectos»: closes the document only once its last changes are confirmed in storage. Otherwise it stays
 * open with them and the answer says why, so the studio can offer a copy or a deliberate discard.
 */
export async function closeIfSaved(): Promise<SaveOutcome> {
  const r = await saveNow();
  if (r === 'ok' && !unsaved()) closeDoc();
  return r === 'ok' && unsaved() ? 'error' : r;
}

/** Closes the document dropping the changes this tab has (the person chose so). */
export function discardAndClose() { closeDoc(); }

export function installAutosave() {
  if (installed) return;
  installed = true;
  onDocChange((doc: GlyphDoc, why) => {
    if (why === 'open') { savedRev = doc.rev; lastFailure = 'ok'; clearTimeout(timer); return; }
    setSaveState('pendiente');
    clearTimeout(timer);
    timer = window.setTimeout(() => void saveNow(), DELAY);
  });
  const flush = () => { if (document.visibilityState === 'hidden') void saveNow(); };
  document.addEventListener('visibilitychange', flush);
  addEventListener('pagehide', () => void saveNow());
  addEventListener('beforeunload', e => {
    if (!unsaved()) return;
    void saveNow();
    e.preventDefault();
    // (older browsers need a returnValue to ask)
    e.returnValue = '';
  });
}

export const flushSave = saveNow;

/** Glyph sets the lab's pieces use (the lab writes this list): deleting a project never deletes them. */
export async function labUses(): Promise<Set<string>> {
  try {
    const r = await get<{ ids?: unknown }>('u:lab', glyphStore());
    return new Set(Array.isArray(r?.ids) ? r!.ids.filter(isGlyphSetId) : []);
  } catch { return new Set(); }
}
