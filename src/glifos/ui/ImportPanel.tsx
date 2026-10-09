import { useRef, useState } from 'react';
import { importSvg } from '../geom/svgimport';
import { traceBitmap } from '../geom/trace';
import { pictureInk } from '../compile';
import { hasDrawing, type Glyph, type RasterLayer } from '../doc';
import { editGlyph, edit, useGlifos } from '../state';
import { putImage } from '../storage';
import { decodeBlob, hasAlpha, inkBox, pictureOf, rememberPicture } from './pictures';

/**
 * Bringing drawings in: a picture (PNG with transparency, or a dark drawing on white), a safe SVG, or the
 * person's own font. A picture is never replaced by its vectorisation: it stays as a guide under the glyph.
 * Nothing here writes over a locked glyph, and replacing a drawing is always the person's explicit choice.
 */

const isUppish = (ch: string) => /[\p{Lu}\p{N}]/u.test(ch) || /[bdfhklt]/.test(ch);

export function ImportPanel() {
  const doc = useGlifos(s => s.doc);
  const current = useGlifos(s => s.current);
  const readOnly = useGlifos(s => !!s.readOnly);
  const [msg, setMsg] = useState<{ text: string; warn?: boolean } | null>(null);
  const [replace, setReplace] = useState(false);
  const png = useRef<HTMLInputElement>(null);
  const svg = useRef<HTMLInputElement>(null);
  const font = useRef<HTMLInputElement>(null);
  const [fontState, setFontState] = useState<null | { buf: ArrayBuffer; info: Awaited<ReturnType<typeof import('../fontimport').readFontFile>> }>(null);
  if (!doc) return null;
  const g = current ? doc.glyphs[current] : undefined;
  const locked = g?.status === 'bloqueado';
  const say = (text: string, warn = false) => setMsg({ text, warn });

  /** The contours of an import go in: replacing only when the person chose to, or the glyph was empty. */
  const putContours = (ch: string, contours: Glyph['contours'], origin: Glyph['origin'], adv?: number) => {
    editGlyph(ch, (gl, d) => {
      const fresh = !hasDrawing(gl) || replace;
      gl.contours = fresh ? contours : [...gl.contours, ...contours];
      if (fresh && adv !== undefined && d.mode === 'texto') gl.adv = Math.round(adv);
      gl.origin = origin;
      if (gl.status === 'vacio' || gl.status === 'propuesto') gl.status = 'dibujado';
      if (gl.origin === 'asistente') gl.corrected = true;
    }, origin === 'svg' ? `Importar SVG en ${ch}` : `Vectorizar ${ch}`);
  };

  const onPng = async (file: File) => {
    if (!current || !g) return;
    try {
      const dec = await decodeBlob(file);
      const { id, stored } = await putImage(file, file.name, dec.pic.w, dec.pic.h);
      rememberPicture(id, dec);
      const read: RasterLayer['read'] = hasAlpha(dec.pic) ? 'transparencia' : 'oscuro';
      const crop = inkBox(dec.pic, read);
      const m = doc.metrics;
      const height = isUppish(current) ? m.cap : m.xh;
      const s = height / Math.max(1, crop.h);
      const layer: RasterLayer = { img: id, crop, x: m.lsb, y: height, s, threshold: 0.5, read, use: 'guia', visible: true };
      edit(d => {
        d.images[id] = { name: file.name.slice(0, 120), w: dec.pic.w, h: dec.pic.h };
        d.glyphs[current].raster = layer;
        if (d.mode === 'texto' && !hasDrawing(d.glyphs[current])) d.glyphs[current].adv = Math.round(m.lsb + crop.w * s + m.rsb);
      }, `Imagen en ${current}`, { glyphs: [current] });
      say(`Imagen colocada bajo «${current}» como guía (${read === 'transparencia' ? 'su transparencia es la tinta' : 'lo oscuro es la tinta'}). Vectorízala, úsala tal cual como glifo, o dibuja encima.${stored ? '' : ' No se pudo guardar en este navegador: se usa mientras la pestaña siga abierta.'}`, !stored);
    } catch (e) { say((e as Error).message, true); }
  };

  const vectorize = () => {
    if (!current || !g?.raster) return;
    const r = g.raster;
    const p = pictureOf(r.img);
    if (!p) { say('La imagen todavía se está cargando (o no está en este navegador): inténtalo en un momento.', true); return; }
    {
      const { w, h, ink } = pictureInk(p, r.read, r.crop);
      const out = traceBitmap(ink, w, h, { threshold: r.threshold, place: { x: r.x, y: r.y, s: r.s } });
      if (!out.contours.length) { say('No salió ningún contorno: baja o sube el umbral, o recorta a la tinta.', true); return; }
      putContours(current, out.contours, 'vectorizado');
      editGlyph(current, gl => { if (gl.raster) gl.raster = { ...gl.raster, use: 'guia' }; }, `Vectorizar ${current}`, 'vector-' + current);
      say(`Vectorizado: ${out.contours.length} contornos. La imagen sigue debajo como guía.${out.warnings.length ? ' ' + out.warnings.join(' ') : ''}`, out.warnings.length > 0);
    }
  };

  const onSvg = async (file: File) => {
    if (!current) return;
    if (file.size > 1024 * 1024) { say('El SVG pesa más de 1 MB.', true); return; }
    try {
      const m = doc.metrics;
      const out = importSvg(await file.text(), { upm: m.upm, asc: m.asc, desc: m.desc, height: isUppish(current) ? m.cap : m.xh });
      if (!out.contours.length) { say('El SVG no tiene formas que se puedan importar (sólo se leen trazos, rectángulos, círculos, elipses, líneas y polígonos).', true); return; }
      putContours(current, out.contours, 'svg', out.adv);
      say(`SVG importado en «${current}»: ${out.contours.length} contornos.${out.warnings.length ? ' ' + out.warnings.join(' ') : ''}`, out.warnings.length > 0);
    } catch (e) { say((e as Error).message, true); }
  };

  const onFont = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) { say('La fuente pesa más de 15 MB.', true); return; }
    try {
      const { readFontFile } = await import('../fontimport');
      const buf = await file.arrayBuffer();
      const info = await readFontFile(buf);
      setFontState({ buf, info });
      setMsg(null);
    } catch (e) { say((e as Error).message, true); }
  };
  const importFont = async (which: 'faltan' | 'todos') => {
    if (!fontState) return;
    const { importFontGlyphs } = await import('../fontimport');
    const chars = doc.chars.filter(c => c !== ' ' && fontState.info.chars.includes(c)).filter(c => {
      const gl = doc.glyphs[c];
      if (gl.status === 'bloqueado') return false;
      return which === 'todos' ? true : !hasDrawing(gl) || (gl.status === 'propuesto' && !gl.corrected);
    });
    if (which === 'todos' && chars.some(c => hasDrawing(doc.glyphs[c]) && doc.glyphs[c].status !== 'propuesto')
      && !confirm('Esto reemplaza también caracteres que ya dibujaste o aceptaste (no los bloqueados). Puedes deshacerlo. ¿Seguir?')) return;
    try {
      const r = await importFontGlyphs(fontState.buf, chars, doc);
      edit(d => { for (const [c, gl] of Object.entries(r.glyphs)) d.glyphs[c] = gl; }, `Importar ${Object.keys(r.glyphs).length} glifos de ${fontState.info.family}`);
      say(`Importados ${Object.keys(r.glyphs).length} caracteres de «${fontState.info.family}».${r.missing.length ? ` No los tiene: ${r.missing.slice(0, 20).join(' ')}${r.missing.length > 20 ? '…' : ''}` : ''}`);
      setFontState(null);
    } catch (e) { say((e as Error).message, true); }
  };

  const file = (ref: React.RefObject<HTMLInputElement | null>, accept: string, on: (f: File) => void) => (
    <input ref={ref} type="file" accept={accept} hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) on(f); }} />
  );
  const target = current ? `«${current === ' ' ? 'espacio' : current}»` : 'el carácter elegido';
  return (
    <div className="gl-import">
      {file(png, 'image/png,image/jpeg,image/webp', f => void onPng(f))}
      {file(svg, '.svg,image/svg+xml', f => void onSvg(f))}
      {file(font, '.otf,.ttf,.woff,font/otf,font/ttf,font/woff', f => void onFont(f))}
      {locked && <p className="note warn">{target} está bloqueado: desbloquéalo para importar en él.</p>}
      <label className="toggle"><span>Reemplazar lo que ya tiene (si no, se añade)</span><span className="switch"><input type="checkbox" role="switch" checked={replace} onChange={e => setReplace(e.target.checked)} /><span /></span></label>

      <h3 className="sub">Imagen (PNG)</h3>
      <p className="note">Un PNG con fondo transparente, o un dibujo oscuro sobre blanco. Se coloca bajo {target} como guía y se queda como está: puedes vectorizarlo, usarlo como glifo de píxeles o dibujar encima.</p>
      <button type="button" className="btn wide" disabled={readOnly || !current || locked} onClick={() => png.current?.click()}>Elegir imagen para {target}</button>
      {g?.raster && (
        <>
          <button type="button" className="btn wide" disabled={readOnly || locked} onClick={vectorize}>Vectorizar la imagen de {target}</button>
          <div className="row">
            <button type="button" className="btn small" disabled={readOnly || locked} onClick={() => editGlyph(current!, gl => { if (gl.raster) { gl.raster = { ...gl.raster, use: gl.raster.use === 'glifo' ? 'guia' : 'glifo' }; if (gl.status === 'vacio') gl.status = 'dibujado'; } }, 'Uso de la imagen')}>
              {g.raster.use === 'glifo' ? 'Usarla sólo como guía' : 'Usarla tal cual como glifo (píxeles)'}
            </button>
          </div>
          <p className="note">El umbral, el recorte y la posición se ajustan en el editor, en «Imagen».</p>
        </>
      )}

      <h3 className="sub">SVG</h3>
      <p className="note">Se leen sólo formas (trazos, rectángulos, círculos, elipses, líneas, polígonos) y sus transformaciones; scripts, enlaces, imágenes y estilos se ignoran. Hasta 1 MB.</p>
      <button type="button" className="btn wide" disabled={readOnly || !current || locked} onClick={() => svg.current?.click()}>Elegir SVG para {target}</button>

      <h3 className="sub">Tu fuente</h3>
      <p className="note">OTF, TTF o WOFF tuya, o con una licencia que permita modificarla (por ejemplo SIL OFL). GLYPHOS respeta las marcas de la propia fuente y no importa las que lo prohíben, pero no comprueba licencias por ti.</p>
      <button type="button" className="btn wide" disabled={readOnly} onClick={() => font.current?.click()}>Elegir fuente</button>
      {fontState && (
        <div className="gl-font-info">
          <p className="note"><b>{fontState.info.family}</b> {fontState.info.style} · {fontState.info.chars.length} caracteres · {fontState.info.upm} unidades por eme</p>
          {fontState.info.copyright && <p className="note">{fontState.info.copyright}</p>}
          {fontState.info.license && <p className="note">Licencia: {fontState.info.license}{fontState.info.licenseUrl ? ` (${fontState.info.licenseUrl})` : ''}</p>}
          <p className={'note' + (fontState.info.editable ? '' : ' warn')}>{fontState.info.note}</p>
          {fontState.info.editable && (
            <div className="row">
              <button type="button" className="btn small" onClick={() => void importFont('faltan')}>Importar los que faltan</button>
              <button type="button" className="btn small" onClick={() => void importFont('todos')}>Importar todos (no los bloqueados)</button>
              <button type="button" className="btn small ghost" onClick={() => setFontState(null)}>Cancelar</button>
            </div>
          )}
        </div>
      )}
      {msg && <p className={'note gl-line' + (msg.warn ? ' warn' : '')} role="status">{msg.text}</p>}
    </div>
  );
}
