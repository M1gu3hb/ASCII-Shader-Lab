/**
 * The start screen: drop or pick a photo or video, take one with the camera, open a project file, begin
 * from a template, or reopen a recent project (open, duplicate, rename, delete with undo).
 */
import { useEffect, useState } from 'react';
import { refreshSaved, useProject } from '../project/store';
import type { ProjectSummary } from '../project/persist';
import { ICamera, IImage, IPlus, ITrash } from '../studio/icons';
import { IDup, IFolder, ITemplate } from './icons';
import { MEDIA_ACCEPT, PROJECT_ACCEPT, importMedia, pickFiles } from './media';
import { deleteSavedWithUndo, duplicateSaved, newFromFile, newFromTemplate, openFile, openSavedProject, renameSaved } from './session';
import { TEMPLATES, sampleRef } from './templates';
import { projectThumb } from './thumbs';
import { openSheet, say } from './ui';
import { ExtrasStart } from './extras/ExtrasStart';

export function Start() {
  const saved = useProject(s => s.saved);
  const [over, setOver] = useState(false);
  useEffect(() => { void refreshSaved(); }, []);
  const pick = async () => { const [f] = await pickFiles(MEDIA_ACCEPT); if (f) await newFromFile(f); };
  const open = async () => { const [f] = await pickFiles(PROJECT_ACCEPT); if (f) await openFile(f); };
  return (
    <main className="fstart" id="contenido">
      <section className="fs-hero" aria-labelledby="fs-t">
        <p className="eyebrow">Estudio de foto y video</p>
        <h1 id="fs-t">Tu foto, en capas de caracteres.</h1>
        <p className="fs-lead">Elige qué partes se vuelven ASCII, mezcla varios estilos, recorta el sujeto y termina con tramado, semitono o brillo. Todo queda en capas: nada destruye tu foto.</p>
        <button type="button" className={'fs-drop' + (over ? ' over' : '')} onClick={() => void pick()}
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void newFromFile(f); }}>
          <IImage width={28} height={28} />
          <span className="fs-drop-t">Suelta aquí una foto o un video</span>
          <span className="fs-drop-s">o pulsa para elegir · JPG, PNG, WebP, AVIF, MP4, WebM</span>
        </button>
        <div className="fs-acts">
          <button type="button" className="btn" onClick={() => openSheet('camera')}><ICamera width={17} height={17} /> Tomar una foto</button>
          <button type="button" className="btn" onClick={() => void open()}><IFolder width={17} height={17} /> Abrir un proyecto</button>
        </div>
        <p className="privacy">Tus fotos no se suben: todo se procesa en tu navegador y tus proyectos se guardan en este equipo.</p>
        <ol className="fs-steps" aria-label="Así funciona">
          <li><b>Una foto</b><span>Súbela, tómala o empieza por una plantilla.</span></li>
          <li><b>Zonas en caracteres</b><span>Dibújalas con las herramientas o usa «Quitar fondo»; el dado propone estilos.</span></li>
          <li><b>Anima y exporta</b><span>Clips de la biblioteca en la línea de tiempo; PNG, capas, máscaras o texto.</span></li>
        </ol>
      </section>
      <section className="fs-sec" aria-labelledby="fs-tpl">
        <h2 id="fs-tpl" className="fs-h"><ITemplate width={16} height={16} /> Empieza por una plantilla</h2>
        <ul className="fs-tpls">
          {TEMPLATES.map(t => <TemplateCard key={t.id} id={t.id} name={t.name} blurb={t.blurb} />)}
        </ul>
      </section>
      <ExtrasStart />
      <section className="fs-sec" aria-labelledby="fs-rec">
        <h2 id="fs-rec" className="fs-h">Proyectos recientes <span className="fsec-n">{saved.length}</span></h2>
        {saved.length ? (
          <ul className="fs-grid">{saved.map(s => <SavedCard key={s.id} s={s} />)}</ul>
        ) : (
          <p className="note">Aún no hay proyectos en este navegador. Los que empieces se guardan solos mientras trabajas.</p>
        )}
      </section>
    </main>
  );
}

const tplThumbs = new Map<string, string>();

function TemplateCard({ id, name, blurb }: { id: string; name: string; blurb: string }) {
  const [thumb, setThumb] = useState(tplThumbs.get(id) ?? '');
  useEffect(() => {
    if (thumb) return;
    let gone = false;
    const t = setTimeout(() => {
      void sampleRef().then(ref => {
        const tpl = TEMPLATES.find(x => x.id === id);
        return tpl ? projectThumb(tpl.make(ref), 280) : null;
      }).then(url => { if (url) { tplThumbs.set(id, url); if (!gone) setThumb(url); } }).catch(() => undefined);
    }, 300);
    return () => { gone = true; clearTimeout(t); };
  }, [id, thumb]);
  const withMine = async () => {
    const [f] = await pickFiles('image/*');
    if (!f) return;
    const r = await importMedia(f);
    if (!r.ok || r.kind !== 'image') { say(r.ok ? 'Las plantillas usan una foto: elige una imagen.' : r.message); return; }
    await newFromTemplate(id, r.ref);
  };
  return (
    <li className="fs-tpl">
      <button type="button" className="fs-tpl-main" onClick={() => void newFromTemplate(id)} aria-label={`${name}: ${blurb} (con el paisaje de muestra)`}>
        <span className={'fs-tpl-img' + (thumb ? '' : ' wait')} style={thumb ? { backgroundImage: `url(${JSON.stringify(thumb)})` } : undefined} aria-hidden="true" />
        <span className="fs-tpl-name">{name}</span>
        <span className="fs-tpl-blurb">{blurb}</span>
      </button>
      <button type="button" className="fs-tpl-mine" onClick={() => void withMine()}><IPlus width={14} height={14} /> Con mi foto</button>
    </li>
  );
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function SavedCard({ s }: { s: ProjectSummary }) {
  const [renaming, setRenaming] = useState(false);
  return (
    <li className="fs-card">
      <button type="button" className="fs-card-img" onClick={() => void openSavedProject(s.id)} aria-label={`Abrir «${s.name}»`}
        style={s.thumb ? { backgroundImage: `url(${JSON.stringify(s.thumb)})` } : undefined} />
      <div className="fs-card-meta">
        {renaming ? (
          <input defaultValue={s.name} aria-label="Nombre del proyecto" autoFocus maxLength={120}
            onBlur={e => { void renameSaved(s.id, e.target.value); setRenaming(false); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }} />
        ) : <b>{s.name}</b>}
        <small>{s.w}×{s.h} · {s.layers} {s.layers === 1 ? 'capa' : 'capas'}{s.duration > 0 ? ` · ${s.duration.toFixed(1)} s` : ''} · {fmtDate(s.updated)}</small>
      </div>
      <div className="fs-card-ops">
        <button type="button" onClick={() => void openSavedProject(s.id)}>Abrir</button>
        <button type="button" onClick={() => void duplicateSaved(s.id)} aria-label={`Duplicar «${s.name}»`}><IDup width={15} height={15} /> Duplicar</button>
        <button type="button" onClick={() => setRenaming(true)} aria-label={`Renombrar «${s.name}»`}>Renombrar</button>
        <button type="button" onClick={() => void deleteSavedWithUndo(s.id)} aria-label={`Eliminar «${s.name}»`}><ITrash width={15} height={15} /></button>
      </div>
    </li>
  );
}
