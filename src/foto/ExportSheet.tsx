/**
 * «Exportar» (loaded on demand): the final picture (PNG with real transparency, JPEG, WebP when this
 * browser encodes it) at the project's size, 2×, social or print sizes; each part separately (originals,
 * layers alone, masks, cut-outs and mattes); real text from characters layers only; the project file; and
 * the video/GIF section, which asks src/video what this browser can write. Every picture comes from the
 * same compositor call as the viewport (preview = export).
 */
import { useEffect, useState } from 'react';
import { canEncode, exportCutout, exportLayer, exportMask, exportMatte, exportName, exportOriginal, exportStill, renderStill, type StillFormat } from '../project/export';
import { useProject } from '../project/store';
import type { Project } from '../project/types';
import { downloadBlob, downloadText, copyText } from '../studio/download';
import { Sheet } from '../studio/Sheet';
import { SegGroup, Select, Toggle } from './controls';
import { downloadProjectFile } from './session';
import { TEXT_FORMATS, layerText, type TextFormat } from './textOut';
import { closeSheet, say, useFoto } from './ui';

interface SizePreset { id: string; label: string; w?: number; h?: number; k?: number; print?: boolean }
const PRESETS: SizePreset[] = [
  { id: 'proyecto', label: 'Tamaño del proyecto', k: 1 },
  { id: 'doble', label: 'Doble (2×)', k: 2 },
  { id: 'ig45', label: 'Publicación vertical 1080 × 1350', w: 1080, h: 1350 },
  { id: 'historia', label: 'Historia / reel 1080 × 1920', w: 1080, h: 1920 },
  { id: 'enlace', label: 'Vista previa de enlace 1200 × 630', w: 1200, h: 630 },
  { id: 'a4', label: 'Impresión A4 a 300 ppp (2480 × 3508)', w: 2480, h: 3508, print: true },
  { id: 'a3', label: 'Impresión A3 a 300 ppp (3508 × 4961)', w: 3508, h: 4961, print: true },
];

const MIME: Record<StillFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

/** A still at an exact size of another aspect: the render covers it (centred crop) or fits in it (bands). */
async function exportSized(p: Project, o: { format: StillFormat; w: number; h: number; fit: 'cover' | 'contain'; transparent: boolean; t: number }): Promise<Blob> {
  const k = o.fit === 'cover' ? Math.max(o.w / p.canvas.w, o.h / p.canvas.h) : Math.min(o.w / p.canvas.w, o.h / p.canvas.h);
  const alpha = o.transparent && o.format !== 'jpeg';
  const { canvas } = await renderStill(p, { scale: k, format: o.format, transparent: alpha, t: o.t });
  const out = document.createElement('canvas');
  out.width = o.w; out.height = o.h;
  const x = out.getContext('2d')!;
  if (!alpha) { x.fillStyle = p.canvas.bg; x.fillRect(0, 0, o.w, o.h); }
  x.drawImage(canvas, Math.round((o.w - canvas.width) / 2), Math.round((o.h - canvas.height) / 2));
  canvas.width = canvas.height = 0;
  const blob = await new Promise<Blob | null>(res => out.toBlob(res, MIME[o.format], o.format === 'png' ? undefined : 0.92));
  out.width = out.height = 0;
  if (!blob || blob.type !== MIME[o.format]) throw new Error(`Este navegador no codifica ${o.format.toUpperCase()}: usa PNG.`);
  return blob;
}

/** Whether the composition has transparent pixels somewhere (asked of a small render). */
async function hasTransparency(p: Project): Promise<boolean> {
  if (!p.canvas.transparent) return false;
  const { canvas } = await renderStill(p, { width: 160, transparent: true, format: 'png' });
  const d = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
  canvas.width = canvas.height = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

export function ExportSheet() {
  const open = useFoto(s => s.sheet === 'export');
  const p = useProject(s => s.project);
  return (
    <Sheet open={open} wide title="Exportar" sub="Todo se hace en tu navegador. La imagen final sale de la misma composición que ves, a calidad final." onClose={closeSheet}>
      {open && p && <ExportBody p={p} />}
    </Sheet>
  );
}

function ExportBody({ p }: { p: Project }) {
  const [format, setFormat] = useState<StillFormat>('png');
  const [webp, setWebp] = useState<boolean | null>(null);
  const [jpeg, setJpeg] = useState(true);
  const [preset, setPreset] = useState('proyecto');
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  const [transparent, setTransparent] = useState(p.canvas.transparent);
  const [alphaInside, setAlphaInside] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { void canEncode('webp').then(setWebp); void canEncode('jpeg').then(setJpeg); void hasTransparency(p).then(setAlphaInside); }, [p]);
  const ps = PRESETS.find(x => x.id === preset)!;
  const w = ps.k ? Math.round(p.canvas.w * ps.k) : ps.w!, h = ps.k ? Math.round(p.canvas.h * ps.k) : ps.h!;
  const sameAspect = !!ps.k || Math.abs(w / h - p.canvas.w / p.canvas.h) < 0.005;
  const alphaOk = format !== 'jpeg';
  const mp = (w * h) / 1e6;
  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label);
    say(`${label}…`, { keep: true });
    try { await job(); say(`${label}: listo.`); } catch (e) { say((e as Error).message || 'No se pudo exportar.'); } finally { setBusy(null); }
  };
  // the instant the viewport shows (a video or an animation: the playhead)
  const t = useProject.getState().time;
  const still = () => run('Exportando la imagen', async () => {
    const tr = transparent && alphaOk;
    const blob = sameAspect
      ? await exportStill(p, { format, scale: w / p.canvas.w, transparent: tr, t })
      : await exportSized(p, { format, w, h, fit, transparent: tr, t });
    downloadBlob(exportName(p, format === 'jpeg' ? 'jpg' : format, ps.id === 'proyecto' ? '' : ps.id), blob);
  });
  const photos = p.sources;
  const cutouts = p.sources.filter(s => s.kind === 'cutout');
  const masked = p.layers.filter(l => l.mask && l.mask.parts.length);
  const glyphLayers = p.layers.filter(l => l.kind === 'glyphs');
  const asciiLayers = p.layers.filter(l => l.kind === 'ascii');
  return (
    <div className="sheet-body fexp">
      <section className="ex-card">
        <h3>Imagen final</h3>
        <SegGroup label="Formato" value={format} onPick={setFormat}
          opts={[['png', 'PNG'], ...(jpeg ? [['jpeg', 'JPEG'] as ['jpeg', string]] : []), ...(webp ? [['webp', 'WebP'] as ['webp', string]] : [])]} />
        {webp === false && <p className="note">Este navegador no codifica WebP: usa PNG (sin pérdida) o JPEG (más ligero).</p>}
        <Select label="Tamaño" value={preset} options={PRESETS.map(x => ({ value: x.id, label: x.label }))} onChange={setPreset} minWidth={300} />
        {!sameAspect && <SegGroup label="Si la proporción no coincide" value={fit} opts={[['cover', 'Recortar al centro'], ['contain', 'Encajar con bandas']]} onPick={setFit} />}
        <Toggle label="Fondo transparente" checked={transparent && alphaOk} disabled={!alphaOk} onChange={setTransparent}
          hint={!alphaOk ? 'JPEG no guarda transparencia: lo transparente va sobre el color de fondo del proyecto.' : alphaInside ? 'La composición tiene zonas transparentes: el PNG las conserva.' : 'Sin transparencia en la composición: se exporta el fondo del proyecto.'} />
        <p className="fexp-size"><b>{w} × {h} px</b> · {mp.toFixed(1)} MP</p>
        {ps.print && <p className="warn">Tamaño de impresión: {mp.toFixed(0)} megapíxeles son unos {Math.round(mp * 4)} MB por lienzo, y la composición usa varios a la vez (en total puede pasar de {Math.round(mp * 4 * 6)} MB). En teléfonos o equipos con poca memoria puede fallar; entonces exporta al tamaño del proyecto o al doble.</p>}
        <button type="button" className="btn primary" disabled={!!busy} onClick={() => void still()}>{busy === 'Exportando la imagen' ? 'Exportando…' : `Exportar ${format === 'jpeg' ? 'JPEG' : format.toUpperCase()}`}</button>
      </section>

      <section className="ex-card">
        <h3>Por separado</h3>
        <p>Cada parte en su propio archivo, para seguir en otro programa.</p>
        <ul className="fexp-list">
          {photos.map(s => (
            <li key={s.id}><span>Original: {s.name}</span>
              <button type="button" className="mini" disabled={!!busy} onClick={() => void run('Exportando el original', async () => { for (const f of await exportOriginal(p, s.id)) downloadBlob(f.name, f.blob); })}>Descargar</button></li>
          ))}
          {cutouts.map(s => (
            <li key={'c' + s.id}><span>Recorte con transparencia: {s.name}</span>
              <button type="button" className="mini" disabled={!!busy} onClick={() => void run('Exportando el recorte', async () => { const f = await exportCutout(p, s.id); if (f) downloadBlob(f.name, f.blob); })}>PNG</button>
              <button type="button" className="mini" disabled={!!busy} onClick={() => void run('Exportando el mate', async () => { const f = await exportMatte(p, s.id); if (f) downloadBlob(f.name, f.blob); })}>Mate</button></li>
          ))}
          {p.layers.map(l => (
            <li key={'l' + l.id}><span>Capa sola: {l.name}</span>
              <button type="button" className="mini" disabled={!!busy} onClick={() => void run(`Exportando «${l.name}»`, async () => downloadBlob(exportName(p, 'png', 'capa-' + l.name), await exportLayer(p, l.id, { t })))}>PNG</button></li>
          ))}
          {masked.map(l => (
            <li key={'m' + l.id}><span>Máscara de {l.name}</span>
              <button type="button" className="mini" disabled={!!busy} onClick={() => void run('Exportando la máscara', async () => { const b = await exportMask(p, l.id, { mode: 'grey', t }); if (b) downloadBlob(exportName(p, 'png', 'mascara-' + l.name), b); })}>PNG</button></li>
          ))}
        </ul>
      </section>

      <section className="ex-card">
        <h3>Texto</h3>
        {glyphLayers.length ? (
          <>
            <p>Sólo las capas de <b>caracteres reales</b> son texto: se copian y se guardan como TXT, ANSI, HTML o SVG con texto.</p>
            {glyphLayers.map(l => (
              <div key={l.id} className="fexp-text">
                <b>{l.name}</b>
                <div className="row">
                  {TEXT_FORMATS.map(f => (
                    <button key={f.id} type="button" className="mini" title={f.note} disabled={!!busy}
                      onClick={() => void run(`Exportando ${f.label}`, async () => { const t = await layerText(l.id, f.id as TextFormat); if (t) downloadText(exportName(p, f.ext, l.name), t.text, f.mime); })}>{f.label}</button>
                  ))}
                  <button type="button" className="mini" disabled={!!busy} onClick={() => void run('Copiando', async () => { const t = await layerText(l.id, 'txt'); if (t) await copyText(t.text, 'Caracteres copiados'); })}>Copiar</button>
                </div>
              </div>
            ))}
          </>
        ) : (
          <p>Este proyecto no tiene capas de caracteres reales. {asciiLayers.length ? 'Sus capas ASCII son un render gráfico (una imagen, no texto): para texto que se copia, añade una capa «Caracteres reales».' : 'Añade una capa «Caracteres reales» para exportar texto.'}</p>
        )}
      </section>

      <MovieSection p={p} />

      <section className="ex-card">
        <h3>Proyecto</h3>
        <p>Todo para reabrirlo tal cual: capas, máscaras, recortes y tus fotos originales, en un solo .glyphos.zip.</p>
        <button type="button" className="btn" disabled={!!busy} onClick={() => void downloadProjectFile()}>Descargar el proyecto</button>
      </section>
    </div>
  );
}

function MovieSection({ p }: { p: Project }) {
  const [formats, setFormats] = useState<Array<{ format: string; label: string; limits: string; available: boolean; why?: string }> | null>(null);
  useEffect(() => {
    let gone = false;
    void import('../video/index').then(m => m.movieFormats(p)).then(f => { if (!gone) setFormats(f); }).catch(() => { if (!gone) setFormats([]); });
    return () => { gone = true; };
  }, [p]);
  return (
    <section className="ex-card">
      <h3>Video y GIF</h3>
      {formats === null && <p className="mt-spin">Revisando qué puede escribir este navegador…</p>}
      {formats && !formats.length && <p>La exportación de video y GIF llega en la próxima versión del estudio. Hoy exporta imágenes fijas{p.time.duration > 0 ? ' del instante que muestra la línea de tiempo' : ''}.</p>}
      {formats && formats.length > 0 && (
        <ul className="fexp-list">
          {formats.map(f => <li key={f.format}><span><b>{f.label}</b> · {f.limits}{!f.available && f.why ? ` · ${f.why}` : ''}</span></li>)}
        </ul>
      )}
    </section>
  );
}
