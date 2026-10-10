import { useState } from 'react';
import { hashBytes } from '../../studio/mediaStore';
import { glyphSetBytes, type GlyphSet } from '../../glyphset/set';
import { compileDoc } from '../compile';
import { edit, useGlifos } from '../state';
import { putSet } from '../storage';
import { flushSave } from '../autosave';
import { pictureOf } from './pictures';
import { download, downloadProjectCopy, slug } from './projectCopy';

/**
 * Taking the set out: the project file (a backup that opens here again, on any computer), an OpenType font
 * checked by reading it back and by drawing it in this browser, SVGs, an atlas with its manifest, and the
 * lab. Every export works on the accepted glyphs (proposals wait), and says what it left out.
 */

/** Loads a font file into this page and checks that it draws: every character measures, at least one has ink. */
async function tryFontInBrowser(buf: ArrayBuffer, set: GlyphSet): Promise<{ ok: boolean; note: string; sample?: string }> {
  if (typeof FontFace === 'undefined') return { ok: false, note: 'Este navegador no deja probar fuentes.' };
  const family = 'glifos-prueba-' + Math.random().toString(36).slice(2, 8);
  const face = new FontFace(family, buf);
  try { await face.load(); } catch { return { ok: false, note: 'El navegador no pudo cargar la fuente generada.' }; }
  document.fonts.add(face);
  try {
    const chars = Object.keys(set.glyphs).filter(c => c !== ' ').slice(0, 60).join('');
    const c = document.createElement('canvas');
    c.width = 600; c.height = 90;
    const cx = c.getContext('2d', { willReadFrequently: true })!;
    cx.fillStyle = '#0c0b0a'; cx.fillRect(0, 0, c.width, c.height);
    cx.fillStyle = '#ede6da';
    cx.font = `56px "${family}", monospace`;
    cx.textBaseline = 'middle';
    cx.fillText(chars.slice(0, 18), 10, 45);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 100) ink++;
    return ink > 50 ? { ok: true, note: 'Probada en este navegador: dibuja tus glifos.', sample: c.toDataURL('image/png') } : { ok: false, note: 'La fuente cargó pero no dibujó nada en este navegador.' };
  } finally { document.fonts.delete(face); }
}

export function ExportPanel() {
  const doc = useGlifos(s => s.doc);
  const [line, setLine] = useState<{ text: string; warn?: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [sample, setSample] = useState<string | null>(null);
  const [cell, setCell] = useState({ w: 32, h: 48 });
  const [published, setPublished] = useState<{ id: string; name: string } | null>(null);
  if (!doc) return null;
  const compile = () => compileDoc(doc, id => pictureOf(id));
  const name = slug(doc.name);
  const skippedNote = (sk: Array<{ ch: string; why: string }>) => {
    if (!sk.length) return '';
    const by = new Map<string, string[]>();
    for (const s of sk) by.set(s.why, [...(by.get(s.why) ?? []), s.ch]);
    return ' Fuera: ' + [...by].map(([w, cs]) => `${cs.length} ${w} (${cs.slice(0, 10).join(' ')}${cs.length > 10 ? '…' : ''})`).join('; ') + '.';
  };
  const job = (label: string, fn: () => Promise<void>) => async () => {
    setBusy(label); setLine(null);
    try { await fn(); } catch (e) { setLine({ text: (e as Error).message, warn: true }); }
    setBusy('');
  };

  const project = job('proyecto', async () => {
    await flushSave();
    const r = await downloadProjectCopy(doc);
    setLine({ text: `Proyecto descargado (${Math.max(1, Math.round(r.size / 1024))} KB): ábrelo en «Crea tus GLYPHOS» con «Abrir proyecto».${r.missingImages.length ? ` ${r.missingImages.length} imágenes ya no estaban en este navegador y no van dentro.` : ''}`, warn: r.missingImages.length > 0 });
  });

  const otf = job('otf', async () => {
    const { set, skipped } = compile();
    const { buildOtf, checkOtf, otfFileName, otfSkipped } = await import('../export/otf');
    const buf = await buildOtf(set, { family: doc.name, license: doc.license, version: `1.${doc.rev}` });
    // a glyph made of pixels has no outline: an OpenType font cannot carry it
    for (const s of otfSkipped(set)) skipped.push({ ch: s.ch, why: s.why });
    const check = checkOtf(buf, set);
    if (!check.ok) { setLine({ text: 'La fuente generada no pasó la comprobación y no se descarga: ' + check.problems.join(' '), warn: true }); return; }
    const tried = await tryFontInBrowser(buf, set);
    setSample(tried.sample ?? null);
    download(otfFileName(doc.name), new Blob([buf], { type: 'font/otf' }));
    setLine({ text: `Fuente OpenType (.otf) con ${check.glyphs} glifos, leída de nuevo sin problemas. ${tried.note}${skippedNote(skipped)}`, warn: !tried.ok || skipped.length > 0 });
  });

  const svgs = job('svg', async () => {
    const { set, skipped } = compile();
    const { svgZip } = await import('../export/svg');
    download(`${name}-svg.zip`, await svgZip(set));
    setLine({ text: `Un SVG por carácter y la hoja completa (hoja.svg).${skippedNote(skipped)}`, warn: skipped.length > 0 });
  });

  const atlas = job('atlas', async () => {
    const { set, skipped } = compile();
    const id = await hashBytes(glyphSetBytes(set));
    const { renderAtlas } = await import('../export/atlas');
    const { zip } = await import('../../shared/zip');
    const r = await renderAtlas(set, id, { cellW: cell.w, cellH: cell.h, order: doc.mode === 'ascii' ? 'rampa' : 'codigo' });
    download(`${name}-atlas.zip`, await zip([{ name: 'atlas.png', data: r.png }, { name: 'atlas.json', data: JSON.stringify(r.manifest, null, 2) }]));
    setLine({ text: `Atlas de ${r.manifest.cols}×${r.manifest.rows} celdas de ${cell.w}×${cell.h} px con su manifiesto (atlas.json: orden, métricas y colocación).${skippedNote(skipped)}`, warn: skipped.length > 0 });
  });

  const useInLab = job('lab', async () => {
    const { set, skipped } = compile();
    if (!Object.keys(set.glyphs).some(c => c !== ' ')) { setLine({ text: 'Todavía no hay glifos aceptados o dibujados que usar.', warn: true }); return; }
    const r = await putSet(set);
    if (!r.stored) { setLine({ text: 'No se pudo guardar el juego en este navegador (sin espacio o sin almacenamiento): el laboratorio no lo encontraría.', warn: true }); return; }
    edit(d => { if (!d.published.some(p => p.set === r.id)) d.published = [...d.published, { rev: d.rev, set: r.id, at: Date.now() }].slice(-50); }, 'Usar en el laboratorio');
    await flushSave();
    setPublished({ id: r.id, name: set.name });
    setLine({ text: `«${set.name}» está en el laboratorio de este navegador: Glifos → Tus glifos.${skippedNote(skipped)}`, warn: skipped.length > 0 });
  });

  const nAcc = doc.chars.filter(c => ['dibujado', 'aceptado', 'bloqueado'].includes(doc.glyphs[c].status)).length;
  const nProp = doc.chars.filter(c => doc.glyphs[c].status === 'propuesto').length;
  return (
    <div className="gl-export">
      <p className="note">Se exportan los {nAcc} caracteres dibujados, aceptados o bloqueados.{nProp ? ` ${nProp} propuestas sin aceptar se quedan fuera hasta que las aceptes.` : ''}</p>
      <h3 className="sub">Laboratorio</h3>
      <button type="button" className="btn primary wide" disabled={!!busy} onClick={() => void useInLab()}>{busy === 'lab' ? 'Preparando…' : 'Usar en el laboratorio'}</button>
      {published && <a className="btn wide" href={`/studio/#glifos=${published.id}`} target="_blank" rel="noopener">Abrir el laboratorio con «{published.name}»</a>}
      <p className="note">Cada vez que lo usas se guarda una revisión: las piezas que ya lo usan conservan la suya.</p>

      <h3 className="sub">Copia de seguridad</h3>
      <button type="button" className="btn wide" disabled={!!busy} onClick={() => void project()}>{busy === 'proyecto' ? 'Empaquetando…' : 'Proyecto (.glyphos-glifos)'}</button>
      <p className="note">Todo: dibujos, imágenes, métricas, rampa, estilo y referencias. Se abre aquí en cualquier navegador.</p>

      <h3 className="sub">Fuente y vectores</h3>
      <button type="button" className="btn wide" disabled={!!busy || nAcc === 0} onClick={() => void otf()}>{busy === 'otf' ? 'Generando y comprobando…' : 'Fuente OpenType (.otf)'}</button>
      {sample && <img className="gl-otf-sample" src={sample} alt="Muestra dibujada por la fuente generada en este navegador" />}
      <button type="button" className="btn wide" disabled={!!busy} onClick={() => void svgs()}>{busy === 'svg' ? 'Generando…' : 'SVG por carácter y hoja'}</button>

      <h3 className="sub">Atlas</h3>
      <div className="row2">
        <div className="ctl"><label className="lbl" htmlFor="at-w">Ancho de celda (px)</label><input id="at-w" type="number" min={8} max={256} value={cell.w} onChange={e => setCell({ ...cell, w: Math.max(8, Math.min(256, Number(e.target.value) || 32)) })} /></div>
        <div className="ctl"><label className="lbl" htmlFor="at-h">Alto de celda (px)</label><input id="at-h" type="number" min={8} max={256} value={cell.h} onChange={e => setCell({ ...cell, h: Math.max(8, Math.min(256, Number(e.target.value) || 48)) })} /></div>
      </div>
      <button type="button" className="btn wide" disabled={!!busy} onClick={() => void atlas()}>{busy === 'atlas' ? 'Dibujando…' : 'Atlas PNG + manifiesto'}</button>
      {line && <p className={'note gl-line' + (line.warn ? ' warn' : '')} role="status">{line.text}</p>}
    </div>
  );
}
