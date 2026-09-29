/**
 * The extras on the start screen (mounted by Start.tsx with one line): «Carteles» (the poster templates,
 * shown over the sample landscape) and more ways to begin: a sequence of photos (several picked or dropped
 * at once), «Tus palabras forman la figura», and «Usar un ajuste guardado».
 */
import { useEffect, useState } from 'react';
import type { MediaRef } from '../../engine/recipe';
import { projectFromImage } from '../../project/normalize';
import { applyPoster, POSTERS, posterFrame } from '../../project/posters';
import { importMedia, kindOfFile, pickFiles } from '../media';
import { sampleRef } from '../templates';
import { say, useFoto } from '../ui';
import { IPoster, IPreset, ISequence, IWords } from './icons';
import { refreshPresets, usePresets } from './presetOps';
import { canvasMeasure, posterFonts, renderPreview } from './render';
import { openExtras } from './state';

/** Stores several picked photos (in the order given) for a sequence. */
export async function importPhotos(files: File[]): Promise<MediaRef[]> {
  const imgs = files.filter(f => kindOfFile(f) === 'image').slice(0, 400);
  const out: MediaRef[] = [];
  for (let i = 0; i < imgs.length; i++) {
    say(`Guardando las fotos: ${i + 1} de ${imgs.length}…`, { keep: true });
    const r = await importMedia(imgs[i]);
    if (r.ok && r.kind === 'image') out.push(r.ref);
  }
  if (imgs.length < files.length) say('Las secuencias usan fotos: los videos y otros archivos se dejaron fuera.');
  else say(`${out.length} fotos listas para la secuencia.`);
  return out;
}

export async function startSequence(files?: File[]) {
  const picked = files ?? await pickFiles('image/*', true);
  if (!picked.length) return;
  const photos = await importPhotos(picked);
  if (photos.length) openExtras('secuencia', { mode: 'new', photos });
}

export function ExtrasStart() {
  const presets = usePresets(s => s.list);
  const [over, setOver] = useState(false);
  useEffect(() => { void refreshPresets(); }, []);
  useMultiDrop();
  return (
    <>
      <section className="fs-sec" aria-labelledby="xs-cart">
        <h2 id="xs-cart" className="fs-h"><IPoster width={16} height={16} /> Carteles para imprimir o publicar</h2>
        <ul className="xs-row">
          {POSTERS.map(p => <PosterCard key={p.id} id={p.id} />)}
        </ul>
      </section>
      <section className="fs-sec" aria-labelledby="xs-ways">
        <h2 id="xs-ways" className="fs-h">Más maneras de empezar</h2>
        <ul className="xs-ways">
          <li>
            <button type="button" className={'xs-way' + (over ? ' over' : '')} onClick={() => void startSequence()}
              onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); void startSequence([...e.dataTransfer.files]); }}>
              <b><ISequence /> Secuencia de fotos</b>
              <span>Elige o suelta varias fotos: se vuelven una animación, con su tiempo cada una y transiciones entre ellas.</span>
            </button>
          </li>
          <li>
            <button type="button" className="xs-way" onClick={() => openExtras('palabras', { mode: 'new' })}>
              <b><IWords /> Tus palabras forman la figura</b>
              <span>Escribe unas palabras y elige una foto: el texto llena la figura, y si quieres, llega volando.</span>
            </button>
          </li>
          <li>
            <button type="button" className="xs-way" onClick={() => openExtras('ajustes', { mode: 'new' })}>
              <b><IPreset /> Usar un ajuste guardado</b>
              <span>{presets?.length ? `${presets.length} ${presets.length === 1 ? 'ajuste guardado' : 'ajustes guardados'}: aplícalo a una foto o un video nuevo.` : 'Los estilos que guardes en el editor aparecen aquí, para usarlos con otra foto.'}</span>
            </button>
          </li>
        </ul>
      </section>
    </>
  );
}

const thumbs = new Map<string, string>();
let sample: Promise<MediaRef> | null = null;

function PosterCard({ id }: { id: string }) {
  const def = POSTERS.find(p => p.id === id)!;
  const [url, setUrl] = useState(thumbs.get(id) ?? '');
  useEffect(() => {
    if (url) return;
    let gone = false;
    const t = setTimeout(() => {
      void (sample ??= sampleRef()).then(async ref => {
        await posterFonts();
        const r = applyPoster(projectFromImage(ref), id, { measure: canvasMeasure });
        if (!r || gone) return;
        const c = document.createElement('canvas');
        if (!(await renderPreview(r.project, c, 170, 0, { dpr: 1.5, light: true }))) return;
        const u = c.toDataURL('image/webp', 0.8);
        c.width = c.height = 0;
        thumbs.set(id, u);
        if (!gone) setUrl(u);
      }).catch(() => undefined);
    }, 400);
    return () => { gone = true; clearTimeout(t); };
  }, [id, url]);
  const fr = posterFrame(def.format);
  return (
    <li>
      <button type="button" className="xs-poster" onClick={() => openExtras('carteles', { mode: 'new', poster: id })} aria-label={`${def.name}: ${def.blurb}`} data-poster={id}>
        <span className="xp-thumb" style={url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined} aria-hidden="true" />
        <span className="xs-poster-name">{def.name}</span>
        <span className="xs-poster-size">{fr.size.name}{fr.size.group === 'impresion' ? ' · 300 ppp' : ''}</span>
      </button>
    </li>
  );
}

/** Several photos dropped anywhere on the start screen start a sequence (one photo keeps its usual path). */
function useMultiDrop() {
  useEffect(() => {
    const drop = (e: DragEvent) => {
      if (useFoto.getState().screen !== 'start') return;
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.filter(f => kindOfFile(f) === 'image').length < 2) return;
      // before the studio's own handler (which takes the first file only)
      e.preventDefault();
      e.stopImmediatePropagation();
      delete document.documentElement.dataset.drop;
      void startSequence(files);
    };
    addEventListener('drop', drop, true);
    return () => removeEventListener('drop', drop, true);
  }, []);
}
