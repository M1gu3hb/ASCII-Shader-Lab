import { useEffect, useMemo, useRef, useState } from 'react';
import { gridToText } from '../../exporters/text';
import { favorite } from '../Deck';
import { copyText, downloadBlob, downloadText } from '../download';
import { captureGrid, exportImage, resolveSize } from '../exporting';
import { openExport } from '../exportTab';
import { handleFile } from '../files';
import { ICamera, IDownload, IImage, IStar } from '../icons';
import { mediaElement, mediaKindOf, startCamera, useMedia } from '../media';
import { slug } from '../packages';
import { PRESETS } from '../presets';
import { applyRecipe, currentRecipe, edit, useEntry, useRecipe } from '../store';
import { toast } from '../toast';
import { CompareStrip } from './CompareStrip';
import { CONTRAST, DETAIL, isLightBg, photoBackground, textGrid } from './paths';
import { StyleGrid, type StyleItem } from './parts';
import { samplePhotoFile } from './sample';
import { goStep } from './state';

/* 1 · Elige una foto ------------------------------------------------- */

export function FotoPick() {
  const recipe = useRecipe();
  const media = useMedia();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const startId = useRef(media.image?.id);

  const loaded = () => {
    const r = currentRecipe(), m = useMedia.getState();
    return r.source === 'image' && !!m.image && (!r.media.ref?.id || r.media.ref.id === m.image.id);
  };
  const load = async (f: File) => {
    if (mediaKindOf(f) !== 'image') { toast('Este camino es para fotos: usa una imagen JPG, PNG o WebP.'); return; }
    setBusy(true);
    try { await handleFile(f); } finally { setBusy(false); }
    if (loaded()) goStep(1);
  };
  // a photo dropped on the stage also counts
  useEffect(() => {
    if (!busy && media.image?.id && media.image.id !== startId.current && loaded()) goStep(1);
  }, [media.image, busy]);

  const camera = async () => {
    edit(r => { r.source = 'camera'; }, 'guide-camera');
    if (await startCamera()) goStep(1);
  };
  const sample = async () => {
    setBusy(true);
    try { await load(await samplePhotoFile()); } finally { setBusy(false); }
  };
  const current = recipe?.source === 'image' && media.image ? media.image : null;

  return (
    <>
      <p className="guide-lead">Elige la foto que quieres convertir en caracteres.</p>
      <div
        className={'guide-drop' + (drag ? ' over' : '')}
        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void load(f); }}
      >
        <IImage width={26} height={26} />
        <p><b>Suelta aquí tu foto</b><br /><span>JPG, PNG o WebP · también sobre el lienzo</span></p>
        <button type="button" className="btn primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Abriendo…' : 'Elegir una foto'}</button>
        <input ref={input} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void load(f); }} />
      </div>
      <div className="row2">
        <button type="button" className="btn" disabled={busy} onClick={() => void camera()}><ICamera width={16} /> {media.camera === 'starting' ? 'Esperando permiso…' : 'Usar la cámara'}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => void sample()}><IImage width={16} /> Usar una foto de ejemplo</button>
      </div>
      {current && <p className="note">Ahora: <b>{current.name}</b> · {current.w}×{current.h}. Pulsa «Siguiente» para seguir con ella.</p>}
      {media.error && <p className="warn">{media.error}</p>}
      <p className="privacy">La foto se queda en este navegador: nada se sube a ningún servidor.</p>
    </>
  );
}

/* 2 · Elige un estilo ------------------------------------------------ */

/** The guide keeps the six plain looks; the ones that transform the photo live in the Imagen space. */
const GUIDE_LOOKS = ['retrato', 'periodico', 'fosforo', 'bloques', 'contornos', 'revelado'];

export function FotoStyle() {
  const recipe = useRecipe();
  const entry = useEntry();
  const mediaKey = recipe ? JSON.stringify([recipe.source, recipe.media]) : '';
  const looks = useMemo(() => PRESETS.media.filter(p => GUIDE_LOOKS.includes(p.id)).map(p => ({ p, recipe: p.make(currentRecipe()) })), [mediaKey]);
  const items: StyleItem[] = looks.map(({ p, recipe: r }) => ({
    id: p.id, name: p.name, recipe: r,
    pressed: !!entry && entry.label === p.name && (entry.kind === 'receta' || entry.kind === 'espacio'),
    pick: () => applyRecipe(p.make(currentRecipe()), 'receta', p.name),
  }));
  return (
    <>
      <p className="guide-lead">Seis maneras de tejer tu foto. Cada una se añade a tu historial: puedes volver a cualquiera con ← →.</p>
      <StyleGrid items={items} label="Estilos para tu foto" />
    </>
  );
}

/* 3 · Ajusta ---------------------------------------------------------- */

export function FotoAdjust() {
  const recipe = useRecipe();
  if (!recipe) return null;
  const light = isLightBg(recipe);
  const setBg = (l: boolean) => edit(r => { const x = photoBackground(r, l); r.color = x.color; r.tone.invert = x.tone.invert; }, 'guide-bg:' + Date.now());
  return (
    <>
      <h3 className="guide-sub" id="g-detail">Detalle</h3>
      <CompareStrip path="glyph.cell" choices={DETAIL} fmt={v => v + ' px'} zoom={0.4} label="Detalle: tamaño de celda" />
      <p className="note">Fino muestra más de la foto (y pide más al equipo); grueso da un dibujo más gráfico.</p>
      <h3 className="guide-sub">Contraste</h3>
      <CompareStrip path="tone.contrast" choices={CONTRAST} fmt={v => '×' + v} zoom={0.75} label="Contraste" />
      <p className="note">Fuerte marca las formas pero pierde matices; suave conserva los grises.</p>
      <h3 className="guide-sub" id="g-bg">Fondo</h3>
      <div className="seg guide-seg" role="group" aria-labelledby="g-bg">
        <button type="button" aria-pressed={!light} onClick={() => setBg(false)}>Oscuro</button>
        <button type="button" aria-pressed={light} onClick={() => setBg(true)}>Claro</button>
      </div>
      <p className="note">Claro es tinta sobre papel; oscuro, luz en una pantalla. Los caracteres más densos siempre caen en las zonas oscuras de la foto.</p>
    </>
  );
}

/* 4 · Llévatela ------------------------------------------------------- */

/** File names from the photo's own name: «glyphos-atardecer». */
const photoBase = (name?: string) => 'glyphos-' + slug((name ?? '').replace(/\.[a-z0-9]+$/i, '') || 'foto');

export function FotoTake() {
  const recipe = useRecipe();
  const media = useMedia();
  const entry = useEntry();
  const [busy, setBusy] = useState<'png' | 'txt' | null>(null);
  if (!recipe) return null;
  const sz = resolveSize({ kind: 'view', scale: 2 });
  const base = photoBase(recipe.source === 'camera' ? 'camara' : recipe.media.ref?.name ?? media.image?.name);
  const grid = () => {
    const ref = recipe.media.ref ?? media.image;
    const cam = recipe.source === 'camera' ? (mediaElement('camera') as HTMLVideoElement | null) : null;
    return textGrid(cam?.videoWidth ?? ref?.w ?? 0, cam?.videoHeight ?? ref?.h ?? 0, recipe.glyph.cell, recipe.glyph.aspect);
  };
  const png = async () => {
    setBusy('png');
    try { downloadBlob(`${base}-${sz.W}x${sz.H}.png`, await exportImage(recipe, { kind: 'view', scale: 2 }, { transparent: false, format: 'png' })); }
    catch (err) { toast('No se pudo generar la imagen: ' + (err as Error).message); }
    setBusy(null);
  };
  const text = async (how: 'copy' | 'file') => {
    setBusy('txt');
    try {
      const { cols, rows } = grid();
      const t = gridToText(await captureGrid(recipe, cols, rows));
      if (how === 'copy') await copyText(t, `Texto copiado: ${cols}×${rows} caracteres`);
      else downloadText(base + '.txt', t);
    } catch (err) { toast('No se pudo generar el texto: ' + (err as Error).message); }
    setBusy(null);
  };
  const { cols, rows } = grid();
  const fav = !!entry?.favId;
  return (
    <>
      <button type="button" className="btn primary guide-big" disabled={!!busy} onClick={() => void png()}>
        <IDownload width={18} /> {busy === 'png' ? 'Generando…' : 'Descargar PNG (alta resolución)'}
      </button>
      <p className="note">{sz.W}×{sz.H} px: el doble de la vista, con los caracteres redibujados nítidos.</p>
      <div className="guide-pair">
        <button type="button" className="btn" disabled={!!busy} onClick={() => void text('copy')}>{busy === 'txt' ? 'Tejiendo el texto…' : 'Copiar como texto'}</button>
        <button type="button" className="mini" disabled={!!busy} onClick={() => void text('file')}>.txt</button>
      </div>
      <p className="note">{cols}×{rows} caracteres, sin color: para un chat, un README o un correo con letra monoespaciada.</p>
      <button type="button" className="btn ghost" onClick={() => openExport('imagen')}>Más formatos…</button>
      <p className="guide-tip">
        <button type="button" className="mini" aria-pressed={fav} onClick={favorite}><IStar width={14} filled={fav} /> {fav ? 'En tu colección' : 'Guardar'}</button>
        <span>Guárdala con ★ para encontrarla en tu colección. La foto se queda en este navegador.</span>
      </p>
    </>
  );
}
