import { useEffect, useMemo, useRef, useState } from 'react';
import { SOURCE_NAMES } from '../engine/catalog';
import { EngineNotes, StageFatal } from './BasicMode';
import { mountStudioEngine, destroyStudioEngine } from './engineBridge';
import { handleFile, pickFile } from './files';
import { startCamera, useMedia } from './media';
import { edit, setPlaying, useRecipe, useStudio } from './store';
import { useView } from './views/state';
import { ViewBar, ViewStage, useStageInsets } from './views/Views';

export function Stage() {
  // the container of the live canvas: created once, mounted by the bridge (which may swap the canvas
  // inside it if WebGL fails late) and moved into the slot of the destination preview shown
  const host = useMemo(() => {
    const el = document.createElement('div');
    el.className = 'cv-host';
    el.setAttribute('role', 'img');
    return el;
  }, []);
  const wrap = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const recipe = useRecipe();
  const view = useView() ?? 'libre';
  const ins = useStageInsets(wrap, top);

  useEffect(() => {
    void mountStudioEngine(host);
    return () => destroyStudioEngine();
  }, [host]);
  useEffect(() => { host.setAttribute('aria-label', describe(recipe)); }, [host, recipe]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  return (
    <div
      ref={wrap}
      className={'stage view-' + view + (drag ? ' dragging' : '')}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={onDrop}
    >
      <ViewStage view={view} host={host} ins={ins} />
      <StageFatal />
      <MediaPrompt />
      <div className="stage-top" ref={top}>
        <ViewBar view={view} />
        <div className="stage-notes">
          <EngineNotes />
          <MotionNote />
        </div>
      </div>
    </div>
  );
}

function describe(r: ReturnType<typeof useRecipe>): string {
  if (!r) return 'Lienzo ASCII';
  const pats = r.layers.filter(l => l.on).map(l => l.pattern).join(' + ');
  return `Pieza ASCII animada. Fuente: ${SOURCE_NAMES[r.source]}. Patrones: ${pats}. Colores: ${r.color.stops.join(', ')} sobre ${r.color.bg}.`;
}

function MediaPrompt() {
  const source = useStudio(s => s.entries[s.cursor]?.recipe.source);
  const media = useMedia();
  const need = (source === 'image' && !media.image) || (source === 'video' && !media.video) || (source === 'camera' && media.camera !== 'on');
  if (!need) return null;
  const cam = source === 'camera';
  const video = source === 'video';
  // what is missing: the piece's own file (no longer stored here, or it never travelled), or nothing chosen yet
  const miss = !cam && media.need?.ref.kind === source ? media.need : null;
  const name = miss?.ref.name;
  const dims = miss && miss.ref.w > 0 && miss.ref.h > 0 ? `${miss.ref.w}×${miss.ref.h}` : '';
  if (miss?.state === 'restoring') {
    return (
      <div className="prompt">
        <div className="card restoring" role="status">
          <p>Recuperando {name ? <>«{name}»</> : video ? 'el video' : 'la imagen'} de este navegador…</p>
        </div>
      </div>
    );
  }
  let title: string, text: React.ReactNode;
  if (cam) {
    title = 'Tu cámara, en caracteres';
    text = 'La cámara sólo se activa cuando pulsas el botón. Puedes apagarla cuando quieras.';
  } else if (miss?.state === 'missing') {
    title = video ? 'Falta el video de esta pieza' : 'Falta la imagen de esta pieza';
    text = video
      ? <>Esta pieza usaba {name ? <>«{name}»</> : 'un video tuyo'}{dims && ` (${dims})`} y ya no está guardado en este navegador. Vuelve a elegirlo o usa otro.</>
      : <>Esta pieza usaba {name ? <>«{name}»</> : 'una imagen tuya'}{dims && ` (${dims})`} y ya no está guardada en este navegador. Vuelve a elegirla o usa otra.</>;
  } else if (miss?.state === 'unreadable') {
    title = video ? 'Este navegador no abre ese video' : 'Este navegador no abre esa imagen';
    text = video
      ? <>Esta pieza usa {name ? <>«{name}»</> : 'un video tuyo'}{dims && ` (${dims})`}, pero este navegador no puede reproducirlo. Elígelo en MP4 (H.264) o WebM, o usa otro.</>
      : <>Esta pieza usa {name ? <>«{name}»</> : 'una imagen tuya'}{dims && ` (${dims})`}, pero este navegador no puede abrirla. Elígela en JPG, PNG o WebP, o usa otra.</>;
  } else if (miss?.state === 'foreign') {
    title = video ? 'Pon aquí un video tuyo' : 'Pon aquí una imagen tuya';
    text = (
      <>
        {video
          ? 'Esta pieza se hizo con un video propio que no viaja en los enlaces. Elige uno tuyo para verla; mientras tanto ves el patrón de fondo.'
          : 'Esta pieza se hizo con una imagen propia que no viaja en los enlaces. Elige una tuya para verla; mientras tanto ves el patrón de fondo.'}
        {dims && <span className="dims">{video ? 'El video' : 'La imagen'} original medía {dims} px.</span>}
      </>
    );
  } else {
    title = video ? 'Suelta aquí un video' : 'Suelta aquí una imagen';
    text = 'O elige un archivo de tu equipo. Mientras tanto ves el patrón de fondo.';
  }
  return (
    <div className="prompt">
      <div className="card" role="region" aria-label="Cargar fuente">
        <h2>{title}</h2>
        <p>{text}</p>
        {cam
          ? <button type="button" className="btn primary" onClick={() => void startCamera()}>{media.camera === 'starting' ? 'Esperando permiso…' : 'Activar cámara'}</button>
          : (
            <div className="row2">
              <button type="button" className="btn primary" onClick={() => pickFile(video ? 'video' : 'image')}>{video ? 'Elegir video' : 'Elegir imagen'}</button>
              <button type="button" className="btn" onClick={() => { const p = startCamera(); edit(r => { r.source = 'camera'; }, 'cam'); void p; }}>Usar cámara</button>
            </div>
          )}
        {media.error && <p className="warn" style={{ marginTop: 12 }}>{media.error}</p>}
        <p className="privacy">Se procesa en tu navegador. Nada se sube a ningún servidor.</p>
      </div>
    </div>
  );
}

function MotionNote() {
  const reduced = useStudio(s => s.reducedMotion);
  const playing = useStudio(s => s.playing);
  const [dismissed, setDismissed] = useState(false);
  if (!reduced || playing || dismissed) return null;
  return (
    <div className="motion-note" role="status">
      <span>Movimiento reducido activo: la animación empieza en pausa.</span>
      <button type="button" onClick={() => { setPlaying(true); setDismissed(true); }}>Reproducir</button>
    </div>
  );
}
