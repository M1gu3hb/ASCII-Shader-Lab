import { parseRecipe } from '../shared/share';
import { loadFile } from './media';
import { applyRecipe, currentRecipe, edit, importFavorites, setSpace, useStudio } from './store';
import { toast } from './toast';

let input: HTMLInputElement | null = null;

/** Opens the system file picker. Files stay on this device. */
export function pickFile(kind: 'image' | 'video' | 'recipe' | 'any' = 'any') {
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
  input.accept = kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : kind === 'recipe' ? '.json,application/json' : 'image/*,video/*,.json,application/json';
  input.click();
}

export async function handleFile(f: File) {
  if (f.type === 'application/json' || f.name.toLowerCase().endsWith('.json')) {
    const text = await f.text();
    try {
      const o = JSON.parse(text);
      if (o && o.monotrama === 'collection' && Array.isArray(o.items)) {
        const n = importFavorites(o.items);
        toast(`${n} piezas añadidas a tu colección`);
        return;
      }
    } catch { /* handled below */ }
    const r = parseRecipe(text);
    if (!r) { toast('Ese archivo no parece una receta de Monotrama.'); return; }
    if (r.meta.space) useStudio.setState({ space: r.meta.space as never });
    applyRecipe(r, 'importado', f.name.replace(/\.json$/i, ''));
    toast('Receta abierta');
    return;
  }
  const s = useStudio.getState();
  if (s.space !== 'media' && s.space !== 'arte') setSpace('media');
  const kind = await loadFile(f, currentRecipe().media.rate);
  if (!kind) return;
  edit(r => {
    r.source = kind;
    if (r.color.mode !== 'source' && useStudio.getState().space === 'media') r.color.mode = 'source';
  }, 'source-file' + Date.now());
  toast(kind === 'image' ? 'Imagen cargada · se procesa sólo en tu navegador' : 'Video cargado · se procesa sólo en tu navegador');
}
