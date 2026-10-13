import { create } from 'zustand';
import { decodeCheckpoint, encodeCheckpoint, onMissingCheckpoint, provideCheckpoint, type Checkpoint } from '../families/checkpoints';
import { familyById } from '../families/registry';
import { putState, stateBytes } from './stateStore';
import { getEngine } from './engineBridge';
import { currentRecipe, edit } from './store';
import { engineLayer } from './families';

/**
 * Saved states (checkpoints) of the families with memory: «Guardar estado» copies the stage's run of a layer
 * into this browser (its own IndexedDB store, apart from photos and videos), and the recipe names it by
 * content id (layer.fam.ck). A piece reopened here continues from it; a project or a session carries it as a
 * file; a link does not (it rebuilds the run from its seed, and the studio says so).
 */

/** The engines ask for checkpoints they do not hold: they come from this browser's store. */
export function installCheckpointLoader() {
  onMissingCheckpoint(id => {
    void stateBytes(id).then(bytes => {
      if (!bytes) return;
      try { provideCheckpoint(id, decodeCheckpoint(bytes)); } catch { /* damaged or newer: the run stays on its seed, and says so */ }
    });
  });
}

/* ------------------------------------------------------------------ */
/* «Guardar estado»                                                    */
/* ------------------------------------------------------------------ */

const useNote = create<{ notes: Record<number, string> }>(() => ({ notes: {} }));
const say = (i: number, text: string) => useNote.setState(s => ({ notes: { ...s.notes, [i]: text } }));
export const useCheckpointNote = (i: number) => useNote(s => s.notes[i] ?? '');

export async function saveFamilyState(i: number) {
  const r = currentRecipe(), l = r.layers[i], eng = getEngine();
  const meta = l ? familyById(l.pattern) : undefined;
  const k = engineLayer(r, i);
  if (!l?.fam || !meta || !eng || k < 0) return;
  const slot = eng.familyState().slots[k];
  if (!slot) { say(i, 'La simulación todavía no tiene estado que guardar.'); return; }
  const c: Checkpoint = { family: meta.id, fv: l.fam.v, seed: l.fam.seed, res: slot.state.res, state: slot.state };
  const bytes = encodeCheckpoint(c);
  const { id, stored } = await putState(bytes, meta.id);
  provideCheckpoint(id, c);
  edit(x => { const f = x.layers[i]?.fam; if (f && x.layers[i].pattern === meta.id) f.ck = id; }, `fam-ck-${i}-${Date.now()}`);
  const kb = Math.max(1, Math.round(bytes.length / 1024));
  say(i, stored
    ? `Estado guardado en este navegador (${kb} KB, paso ${slot.state.steps.toLocaleString('es-ES')}). Viaja en el proyecto y en la sesión; no en el enlace.`
    : 'No se pudo guardar en este navegador (sin espacio o sin almacenamiento): sigue disponible mientras la pestaña esté abierta.');
}

export function dropFamilyState(i: number) {
  edit(r => { const f = r.layers[i]?.fam; if (f) delete f.ck; }, `fam-ck-${i}-${Date.now()}`);
  say(i, 'La capa vuelve a empezar desde su semilla.');
}
