import { create } from 'zustand';
import type { Recipe } from '../engine/recipe';
import type { SpaceId } from '../random/spaces';
import { shareUrl } from '../shared/share';
import { copyText } from './download';
import { exportProject, pieceFileBase } from './packages';
import { Sheet } from './Sheet';
import './css/data.css';

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
    ? 'Enlace copiado: quien lo abra verá esta pieza con su propia cámara'
    : 'Enlace copiado: quien lo abra verá exactamente esta pieza');
}

export function ShareSheet() {
  const recipe = useShare(s => s.recipe);
  const close = () => useShare.setState({ recipe: null });
  const video = recipe?.source === 'video';
  const word = video ? 'el video' : 'la imagen';
  const name = recipe?.media.ref?.name;
  const run = (fn: (r: Recipe) => Promise<void>) => () => { const r = recipe; close(); if (r) void fn(r); };
  return (
    <Sheet open={!!recipe} onClose={close} title="Compartir el enlace" sub={`Esta pieza usa ${video ? 'un video tuyo' : 'una imagen tuya'}.`}>
      <div className="sheet-body share-body">
        <p>
          El enlace lleva la receta completa, pero no {word}{name ? <> «{name}»</> : null}: tus archivos nunca salen de tu navegador y el nombre tampoco viaja.
          Quien lo abra verá el patrón de fondo hasta que elija {video ? 'un video suyo' : 'una imagen suya'}.
        </p>
        <p>Para enviarla completa, exporta el proyecto: un .zip con la receta y {word} original que se abre igual en otro equipo.</p>
        <div className="share-acts">
          <button type="button" className="btn primary" onClick={run(r => copyLinkOf(r, `Enlace copiado (sin ${word})`))}>Copiar enlace sin {word}</button>
          <button type="button" className="btn" onClick={run(r => exportProject(r, pieceFileBase(r)))}>Exportar proyecto (.zip con {word})</button>
          <button type="button" className="btn ghost" onClick={close}>Cancelar</button>
        </div>
      </div>
    </Sheet>
  );
}
