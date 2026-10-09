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
import { saveDoc } from './storage';
import { becomeReadOnly, onDocChange, setSaveState, useGlifos } from './state';

const DELAY = 600;
let timer = 0;
let savedRev = -1;
let saving: Promise<void> | null = null;
let installed = false;

async function saveNow(): Promise<void> {
  clearTimeout(timer);
  const { doc, readOnly } = useGlifos.getState();
  if (!doc || readOnly || doc.rev === savedRev) return;
  if (saving) { await saving; return saveNow(); }
  setSaveState('guardando');
  const want = doc;
  saving = (async () => {
    const r = await saveDoc(want, { expectRev: savedRev >= 0 ? savedRev : undefined });
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
    } else {
      setSaveState('sin-almacenamiento', 'Este navegador no deja guardar (¿ventana privada?): tus cambios viven sólo en esta pestaña. Descarga una copia antes de cerrarla.');
    }
  })().finally(() => { saving = null; });
  await saving;
}

/** Changes not yet in storage (for the «leave the page?» question). */
export const unsaved = () => {
  const { doc, readOnly, save } = useGlifos.getState();
  return !!doc && (readOnly ? false : doc.rev !== savedRev || save === 'lleno' || save === 'sin-almacenamiento');
};

export function installAutosave() {
  if (installed) return;
  installed = true;
  onDocChange((doc: GlyphDoc, why) => {
    if (why === 'open') { savedRev = doc.rev; clearTimeout(timer); return; }
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
