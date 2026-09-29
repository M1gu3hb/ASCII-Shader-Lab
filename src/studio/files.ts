import { parseRecipe } from '../shared/share';
import { looksLikeZip } from '../shared/zip';
import { loadFile, syncMedia } from './media';
import { MEDIA_LIMITS } from './mediaStore';
import { fotoFileNote, openPackage } from './packages';
import { applyRecipe, edit, importFavorites, setSpace, useStudio } from './store';
import { spaceForOpened } from './presets';
import { toast } from './toast';

let input: HTMLInputElement | null = null;

export type PickKind = 'image' | 'video' | 'recipe' | 'session' | 'any';

const ACCEPT: Record<PickKind, string> = {
  image: 'image/*',
  video: 'video/*',
  recipe: '.json,.zip,application/json,application/zip',
  session: '.zip,application/zip',
  any: 'image/*,video/*,.json,.zip,application/json,application/zip',
};

/** Opens the system file picker. Files stay on this device. */
export function pickFile(kind: PickKind = 'any') {
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const f = input!.files?.[0];
      if (f) void handleFile(f);
      input!.value = '';
    });
  }
  input.accept = ACCEPT[kind];
  input.click();
}

const isZip = (f: File) => /\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed';

export async function handleFile(f: File) {
  if (isZip(f) || (!f.type && await looksLikeZip(f))) {
    await openPackage(f, f.name.replace(/\.zip$/i, ''));
    return;
  }
  if (f.type === 'application/json' || f.name.toLowerCase().endsWith('.json')) {
    const text = await f.text();
    try {
      const o = JSON.parse(text);
      if (o && (o.glyphos ?? o.monotrama) === 'collection' && Array.isArray(o.items)) {
        const n = importFavorites(o.items);
        toast(n === 1 ? '1 pieza añadida a tu colección' : `${n} piezas añadidas a tu colección`);
        return;
      }
      // the photo and video studio's own files (a project without its media, a saved setting)
      if (o && (o.glyphos === 'project' || o.glyphos === 'ajuste')) { fotoFileNote(o.glyphos === 'project' ? 'proyecto' : 'ajuste'); return; }
    } catch { /* handled below */ }
    const r = parseRecipe(text);
    if (!r) { toast('Ese archivo no parece una receta de GLYPHOS.'); return; }
    useStudio.setState({ space: spaceForOpened(r, useStudio.getState().space) });
    applyRecipe(r, 'importado', f.name.replace(/\.json$/i, '').replace(/\.(glyphos|monotrama)$/i, ''));
    toast('Receta abierta');
    return;
  }
  const s = useStudio.getState();
  if (s.space !== 'media' && s.space !== 'arte') setSpace('media');
  const loaded = await loadFile(f);
  if (!loaded) return;
  const { kind, ref } = loaded;
  // the same edit sets the source and names the file, so undo, history and favourites keep them together
  edit(r => {
    r.source = kind;
    r.media.ref = ref;
    if (r.color.mode !== 'source' && useStudio.getState().space === 'media') r.color.mode = 'source';
  }, 'source-file' + Date.now());
  syncMedia(true);
  const what = kind === 'image' ? 'Imagen' : 'Video';
  const st = loaded.store;
  if (st.stored) toast(`${what} cargad${kind === 'image' ? 'a' : 'o'} · se queda en este navegador, nada se sube a ningún servidor`);
  else if (st.reason === 'too-big') {
    toast(`${what} cargad${kind === 'image' ? 'a' : 'o'}, pero pesa más de ${MEDIA_LIMITS[kind] / 1024 / 1024} MB: es demasiado grande para guardarl${kind === 'image' ? 'a' : 'o'} en el navegador. Se verá mientras no cierres la pestaña; después tendrás que elegirl${kind === 'image' ? 'a' : 'o'} otra vez.`, undefined, 9000);
  } else {
    const why = st.reason === 'no-space' ? 'no queda espacio en el navegador' : 'el navegador no dejó guardarl' + (kind === 'image' ? 'a' : 'o');
    toast(`${what} cargad${kind === 'image' ? 'a' : 'o'}, pero ${why}. Se verá mientras no cierres la pestaña.`, undefined, 9000);
  }
}
