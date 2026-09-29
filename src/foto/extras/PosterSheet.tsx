/**
 * «Carteles»: the poster and composition templates (src/project/posters.ts). On the start screen it makes a
 * new project from the person's photo (or the sample landscape); in the editor, «Aplicar plantilla de
 * cartel» replaces the open project's composition by the poster, built over the same photo and its cut-out
 * (one undo step, kept as a version). The format (print sizes at 300 ppp with optional bleed, or social),
 * the texts and the preview are in the sheet; after applying, the texts stay editable here and in the
 * inspector.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaRef } from '../../engine/recipe';
import {
  applyPoster, fieldName, fieldsFor, POSTER_SIZES, POSTERS, posterById, posterFields, posterFieldText, posterFrame, posterGuides,
  setPosterField, type PosterFields, type PosterFormat, type Rect,
} from '../../project/posters';
import { projectFromImage, projectFromVideo } from '../../project/normalize';
import { commitVersion, edit, select, useProject } from '../../project/store';
import type { Project } from '../../project/types';
import { Sheet } from '../../studio/Sheet';
import { thumbVersion } from '../actions';
import { SegGroup, TextField, Toggle } from '../controls';
import { importMedia, pickFiles } from '../media';
import { startEditing } from '../session';
import { sampleRef } from '../templates';
import { say } from '../ui';
import { canvasMeasure, posterFonts, renderPreview } from './render';
import { closeExtras, useExtras } from './state';
import { subjectBoxFor } from './subject';

type Typed = Partial<Omit<PosterFields, 'labels'>> & { labels?: Array<string | undefined> };

interface Photo { ref: MediaRef; video?: { duration: number; fps: number } }

const fmtKey = (f: PosterFormat) => `${f.size}|${f.orient ?? 'vertical'}|${f.bleed ? 1 : 0}`;

export function PosterSheet() {
  const open = useExtras(s => s.sheet === 'carteles');
  const mode = useExtras(s => s.mode);
  const start = useExtras(s => s.poster);
  const project = useProject(s => s.project);
  const [id, setId] = useState(start ?? POSTERS[0].id);
  const def = posterById(id) ?? POSTERS[0];
  const [format, setFormat] = useState<PosterFormat>(def.format);
  const [typed, setTyped] = useState<Typed>({});
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [sbox, setSbox] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  // each time the sheet opens: the poster asked for, its own format, fonts loaded
  useEffect(() => {
    if (!open) return;
    const d = posterById(start ?? '') ?? posterById(id) ?? POSTERS[0];
    setId(d.id);
    setFormat(d.format);
    setReady(false);
    void posterFonts().then(() => setReady(true));
    if (mode === 'new' && !photo) void sampleRef().then(ref => setPhoto(p => p ?? { ref }));
  }, [open]);

  const fr = posterFrame(format);
  const base: Project | null = useMemo(() => {
    if (mode === 'open') return project;
    if (!photo) return null;
    return photo.video ? projectFromVideo(photo.ref, photo.video) : projectFromImage(photo.ref);
  }, [mode, project, photo]);

  // where the cut-out's subject sits in this format (annotations point at it)
  useEffect(() => {
    let gone = false;
    setSbox(null);
    if (base) void subjectBoxFor(base, fr.w, fr.h).then(b => { if (!gone) setSbox(b); });
    return () => { gone = true; };
  }, [base, fr.w, fr.h]);

  const fields = fieldsFor(def, { ...typed, labels: def.fields.labels.map((l, i) => typed.labels?.[i] ?? l) } as Partial<PosterFields>);
  const result = useMemo(() => {
    if (!base || !ready) return null;
    return applyPoster(base, def.id, { format, fields, measure: canvasMeasure, subjectBox: sbox });
  }, [base, ready, def.id, fmtKey(format), JSON.stringify(fields), sbox]);

  const pick = async () => {
    const [f] = await pickFiles('image/*,video/*');
    if (!f) return;
    const r = await importMedia(f);
    if (!r.ok) { say(r.message); return; }
    setPhoto(r.kind === 'video' ? { ref: r.ref, video: { duration: r.duration, fps: r.fps } } : { ref: r.ref });
  };

  const apply = async () => {
    if (!result) return;
    setBusy(true);
    try {
      if (mode === 'new') {
        const p = result.project;
        p.name = `${def.name}${fields.title ? ` · ${fields.title.split('\n')[0].slice(0, 60)}` : ''}`;
        closeExtras();
        startEditing(p, { fresh: true });
        say(`Cartel «${def.name}» creado: cada parte es una capa (foto, caracteres, textos, líneas) y se puede cambiar.`);
      } else {
        const vl = useProject.getState().versions;
        if (!vl.list.length) thumbVersion(commitVersion('inicio'));
        const parent = vl.list[vl.cursor]?.id ?? useProject.getState().versions.list[0]?.id;
        edit(() => result.project);
        thumbVersion(commitVersion('edición', { label: `Cartel: ${def.name}`, ...(parent ? { parent } : {}) }));
        const top = result.project.layers[result.project.layers.length - 1];
        if (top) select([top.id]);
        closeExtras();
        say(`Cartel «${def.name}» aplicado en ${result.project.canvas.w} × ${result.project.canvas.h} px. Deshacer (Ctrl+Z) o la versión anterior recuperan tu composición.`);
      }
      if (result.notes.length) say(result.notes.join(' '), { keep: true });
    } finally { setBusy(false); }
  };

  const applied = mode === 'open' && project ? posterFields(project) : [];
  const sizes = POSTER_SIZES.filter(s => s.group === fr.size.group);
  const setLabel = (i: number, v: string) => setTyped(t => { const labels = [...(t.labels ?? [])]; labels[i] = v; return { ...t, labels }; });

  return (
    <Sheet open={open} wide title={mode === 'new' ? 'Carteles' : 'Aplicar plantilla de cartel'} onClose={closeExtras}
      sub={mode === 'new' ? 'Composiciones para imprimir o publicar, construidas sobre tu foto en capas que puedes seguir editando.' : 'El cartel se construye sobre la foto de este proyecto (y su recorte, si lo tiene) y reemplaza las capas actuales: deshacer las recupera.'}>
      {open && (
        <div className="sheet-body xp">
          <div className="xp-gal" role="radiogroup" aria-label="Plantillas de cartel">
            {POSTERS.map(p => <GalleryCard key={p.id} id={p.id} on={p.id === def.id} base={base} ready={ready} onPick={() => { setId(p.id); setFormat(p.format); }} />)}
          </div>
          <div className="xp-main">
            <Preview project={result?.project ?? null} guides={true} />
            <div className="xp-ctl">
              <h3 className="xp-name">{def.name}</h3>
              <p className="note">{def.blurb}</p>
              <SegGroup label="Destino" value={fr.size.group} opts={[['impresion', 'Impresión'], ['social', 'Redes']]}
                onPick={g => setFormat(g === 'impresion' ? { size: 'a4', orient: 'vertical', bleed: false } : { size: 'vertical' })} />
              <SegGroup label="Tamaño" value={fr.size.id} opts={sizes.map(s => [s.id, s.name, s.blurb] as [string, string, string])} onPick={s => setFormat(f => ({ ...f, size: s }))} />
              {fr.size.group === 'impresion' && (
                <>
                  <SegGroup label="Orientación" value={fr.orient} opts={[['vertical', 'Vertical'], ['horizontal', 'Horizontal']]} onPick={o => setFormat(f => ({ ...f, orient: o }))} />
                  <Toggle label="Sangrado de 3 mm" checked={!!format.bleed} onChange={v => setFormat(f => ({ ...f, bleed: v }))}
                    hint="Para imprenta: el fondo y la foto siguen 3 mm más allá del corte. Las guías del estudio marcan el corte y la zona segura (no se exportan)." />
                </>
              )}
              <p className="xp-size"><b>{fr.w} × {fr.h} px</b>{fr.size.group === 'impresion' ? ` · ${fr.size.name} a 300 ppp` : ''}{fr.bleed ? ` · incluye ${fr.bleed} px de sangrado por lado` : ''}</p>
              {mode === 'new' && (
                <div className="xp-photo">
                  <span className="lbl">Foto</span>
                  <span className="xp-photo-name">{photo ? photo.ref.name ?? 'foto' : '…'}</span>
                  <button type="button" className="mini" onClick={() => void pick()}>Elegir mi foto o video</button>
                </div>
              )}
              <h4 className="xp-h">Textos</h4>
              {def.uses.filter(k => !k.startsWith('label')).map(k => (
                <TextField key={k} label={fieldName(k)} value={(fields as unknown as Record<string, string>)[k] ?? ''} area={k === 'caption' || k === 'subtitle' || (k === 'title' && def.id === 'fanzine')} rows={k === 'caption' ? 4 : 2} max={k === 'caption' ? 1200 : 300}
                  onChange={v => setTyped(t => ({ ...t, [k]: v }))} />
              ))}
              {def.uses.some(k => k.startsWith('label')) && (
                <div className="xp-labels">
                  {def.fields.labels.map((_, i) => def.uses.includes(`label${i}`) && (
                    <TextField key={i} label={fieldName(`label${i}`)} value={fields.labels[i] ?? ''} max={120} onChange={v => setLabel(i, v)} />
                  ))}
                </div>
              )}
              {result?.notes.map(n => <p key={n} className="warn">{n}</p>)}
              {fr.size.group === 'impresion' && <p className="note">Para imprimir, exporta en «Exportar» al tamaño del proyecto: {fr.w} × {fr.h} px son {(fr.w * fr.h / 1e6).toFixed(1)} megapíxeles; en equipos con poca memoria puede fallar (entonces prueba un tamaño de redes).</p>}
              <button type="button" className="btn primary" disabled={!result || busy} onClick={() => void apply()}>
                {mode === 'new' ? 'Crear el cartel' : 'Aplicar al proyecto'}
              </button>
              {mode === 'open' && <p className="note">Tu foto y sus recortes se quedan en el proyecto; las capas actuales se reemplazan (Deshacer o la versión anterior las recuperan).</p>}
            </div>
          </div>
          {applied.length > 0 && <AppliedFields refs={applied} />}
        </div>
      )}
    </Sheet>
  );
}

/** The texts of the poster already applied to the open project, edited in place (each text refits its box). */
function AppliedFields({ refs }: { refs: ReturnType<typeof posterFields> }) {
  const project = useProject(s => s.project);
  if (!project) return null;
  const seen = new Set<string>();
  const list = refs.filter(r => (seen.has(r.field) ? false : (seen.add(r.field), true)));
  return (
    <section className="xp-applied" aria-labelledby="xp-applied-h">
      <h4 id="xp-applied-h" className="xp-h">Textos del cartel de este proyecto</h4>
      <p className="note">Cambian en su lugar y se ajustan a su espacio (el título se achica si no cabe).</p>
      <div className="xp-applied-grid">
        {list.map(r => (
          <TextField key={r.field} label={fieldName(r.field)} value={posterFieldText(project, r.field)} area={r.field === 'caption' || r.field === 'subtitle'} rows={2} max={1200}
            onChange={v => edit(d => { setPosterField(d, r.field, v, canvasMeasure); }, 'cartel.' + r.field)} />
        ))}
      </div>
    </section>
  );
}

const thumbCache = new Map<string, string>();

function GalleryCard({ id, on, base, ready, onPick }: { id: string; on: boolean; base: Project | null; ready: boolean; onPick: () => void }) {
  const def = posterById(id)!;
  const key = base ? `${id}|${base.sources.map(s => s.media[0]?.id).join(',')}` : '';
  const [url, setUrl] = useState(thumbCache.get(key) ?? '');
  useEffect(() => {
    if (!base || !ready || thumbCache.has(key)) { setUrl(thumbCache.get(key) ?? ''); return; }
    let gone = false;
    const r = applyPoster(base, id, { measure: canvasMeasure });
    if (!r) return;
    const c = document.createElement('canvas');
    void renderPreview(r.project, c, 150, 0, { dpr: 1.5, light: true }).then(ok => {
      if (!ok) return;
      const u = c.toDataURL('image/webp', 0.8);
      c.width = c.height = 0;
      thumbCache.set(key, u);
      if (!gone) setUrl(u);
    });
    return () => { gone = true; };
  }, [key, ready]);
  const fr = posterFrame(def.format);
  return (
    <button type="button" role="radio" aria-checked={on} className={'xp-card' + (on ? ' on' : '')} onClick={onPick} title={def.blurb} data-poster={id}>
      <span className="xp-thumb" style={{ aspectRatio: `${fr.w} / ${fr.h}`, ...(url ? { backgroundImage: `url(${JSON.stringify(url)})` } : {}) }} aria-hidden="true" />
      <span className="xp-card-name">{def.name}</span>
    </button>
  );
}

/** The poster as it will be, with its guides (trim, bleed, safe area) drawn over the picture. */
function Preview({ project, guides }: { project: Project | null; guides: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = ref.current;
    if (!c || !project) return;
    setBusy(true);
    const t = setTimeout(() => { void renderPreview(project, c, 460).then(ok => { if (ok) setBusy(false); }); }, 120);
    return () => clearTimeout(t);
  }, [project]);
  const g = project ? posterGuides(project.canvas) : null;
  const box = (r: Rect) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
  return (
    <figure className="xp-prev" aria-label="Vista previa del cartel">
      <div className="xp-prev-frame" style={project ? { aspectRatio: `${project.canvas.w} / ${project.canvas.h}` } : undefined}>
        <canvas ref={ref} role="img" aria-label={project ? `Cartel de ${project.canvas.w} × ${project.canvas.h} px` : 'Preparando la vista previa'} />
        {guides && g && (
          <div className="xg in-sheet" aria-hidden="true">
            {g.bleed > 0 && <div className="xg-trim" style={box(g.trim)} />}
            <div className="xg-safe" style={box(g.safe)} />
            {g.zones.map((z, i) => <div key={i} className="xg-zone" style={box(z)} />)}
          </div>
        )}
        {(busy || !project) && <span className="xp-wait mt-spin" aria-hidden="true" />}
      </div>
      <figcaption className="note">Líneas punteadas: zona segura{g?.bleed ? '; línea continua: corte (lo de fuera es sangrado)' : ''}. Las guías no se exportan.</figcaption>
    </figure>
  );
}
