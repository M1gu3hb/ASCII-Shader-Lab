import { create } from 'zustand';
import type { Recipe } from '../engine/recipe';
import type { SpaceId } from '../random/spaces';
import { shareUrl } from '../shared/share';
import { copyText } from './download';
import { exportProject, pieceFileBase } from './packages';
import { Sheet } from './Sheet';
import './css/data.css';
import './css/export-notes.css';

/**
 * Sharing a link. A link carries the whole recipe but never the local image or video (nor its
 * name), so pieces made with one ask first: copy the link without the file, or export a project.
 */
const useShare = create<{ recipe: Recipe | null }>(() => ({ recipe: null }));

async function copyLinkOf(r: Recipe, msg: string) {
  await copyText(await shareUrl(r), msg);
}

/** Copies a link to a piece, asking first when the piece uses a local image or video. */
export async function shareLink(recipe: Recipe, space: SpaceId) {
  const r = { ...recipe, meta: { ...recipe.meta, space } };
  if (r.source === 'image' || r.source === 'video') { useShare.setState({ recipe: r }); return; }
  await copyLinkOf(r, r.source === 'camera'
    ? 'Enlace copiado (sólo la receta): quien lo abra verá esta pieza con su propia cámara'
    : 'Enlace copiado: lleva la receta completa, así que quien lo abra verá esta pieza');
}

/**
 * What travels with a link and with a project, side by side (the share sheet, the «Receta» tab).
 * `word`: «la imagen» or «el video» when the piece uses one.
 */
export function ShareKinds({ word }: { word?: string }) {
  const file = word ?? 'tu imagen o tu video';
  return (
    <div className="share-kinds">
      <div className="share-kind">
        <b>Enlace</b>
        <span className="k-yes">Lleva la receta completa (todos los ajustes).</span>
        <span className="k-no">No lleva {file}, ni su nombre.</span>
        <span className="k-note">Se abre en el estudio desde otro navegador: la receta va dentro del propio enlace y no pasa por ningún servidor.</span>
      </div>
      <div className="share-kind">
        <b>Proyecto (.zip)</b>
        <span className="k-yes">Lleva la receta completa.</span>
        <span className="k-yes">Lleva {file} original.</span>
        <span className="k-note">Un archivo que se envía como cualquier otro y se abre arrastrándolo al estudio.</span>
      </div>
    </div>
  );
}

export function ShareSheet() {
  const recipe = useShare(s => s.recipe);
  const close = () => useShare.setState({ recipe: null });
  const video = recipe?.source === 'video';
  const word = video ? 'el video' : 'la imagen';
  const name = recipe?.media.ref?.name;
  const run = (fn: (r: Recipe) => Promise<void>) => () => { const r = recipe; close(); if (r) void fn(r); };
  return (
    <Sheet open={!!recipe} onClose={close} title="Compartir: enlace o proyecto" sub={`Esta pieza usa ${video ? 'un video tuyo' : 'una imagen tuya'}${name ? ` («${name}»)` : ''}.`}>
      <div className="sheet-body share-body">
        <ShareKinds word={word} />
        <p>
          Con el enlace, quien lo abra verá el patrón de fondo hasta que elija {video ? 'un video suyo' : 'una imagen suya'}: tus archivos nunca salen de tu navegador.
          Para enviarla completa, exporta el proyecto.
        </p>
        <div className="share-acts">
          <button type="button" className="btn primary" onClick={run(r => exportProject(r, pieceFileBase(r)))}>Exportar proyecto (.zip con {word})</button>
          <button type="button" className="btn" onClick={run(r => copyLinkOf(r, `Enlace copiado: sólo la receta, sin ${word}`))}>Copiar enlace (sin {word})</button>
          <button type="button" className="btn ghost" onClick={close}>Cancelar</button>
        </div>
      </div>
    </Sheet>
  );
}
