import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SOURCE_NAMES } from '../engine/catalog';
import { EngineNotes, StageFatal } from './BasicMode';
import { mountStudioEngine, destroyStudioEngine } from './engineBridge';
import { handleFile, pickFile } from './files';
import { startCamera, useMedia } from './media';
import { edit, setPlaying, useRecipe, useStudio } from './store';
import { previewInk } from './guide/paths';

export function Stage() {
  // the bridge creates the canvas inside this container (it may replace it if WebGL fails late)
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const space = useStudio(s => s.space);
  const term = useStudio(s => s.ui.terminal);
  const recipe = useRecipe();
  const terminal = space === 'terminal';
  const [fit, setFit] = useState({ w: 800, h: 480, k: 1 });

  useEffect(() => {
    if (!host.current) return;
    mountStudioEngine(host.current);
    return () => destroyStudioEngine();
  }, []);

  // terminal window: exact cols×rows in CSS pixels, scaled to fit the stage
  useLayoutEffect(() => {
    if (!terminal || !recipe || !wrap.current) return;
    const measure = () => {
      const el = wrap.current!;
      const w = term.cols * recipe.glyph.cell, h = Math.round(term.rows * recipe.glyph.cell * recipe.glyph.aspect);
      const aw = el.clientWidth - 36, ah = el.clientHeight - (window.innerWidth < 900 ? 190 : 150);
      setFit({ w, h, k: Math.min(1, aw / w, (ah - 30) / h) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [terminal, term.cols, term.rows, recipe?.glyph.cell, recipe?.glyph.aspect]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  return (
    <div
      ref={wrap}
      className={'stage' + (drag ? ' dragging' : '')}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={onDrop}
    >
      <div className={terminal ? 'term-frame' : 'stage'}>
        <div className={terminal ? 'term-win' : 'stage'} style={terminal ? { transform: `scale(${fit.k})` } : undefined}>
          {terminal && <div className="term-bar" aria-hidden="true"><i /><i /><i /><span>monotrama — {term.cols}×{term.rows}</span></div>}
          <div key="cv" className={terminal ? 'term-canvas' : 'stage'} style={terminal ? { width: fit.w, height: fit.h } : undefined}>
            <div ref={host} className="cv-host" role="img" aria-label={describe(recipe)} />
          </div>
        </div>
      </div>
      <StageFatal />
      <MediaPrompt />
      <ContentPreview />
      <div className="stage-notes">
        <EngineNotes />
        <MotionNote />
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

/**
 * Test content over a background: a headline, a paragraph and a button. The text colour follows
 * previewInk, the same rule the fondo guide uses to estimate the headline's contrast.
 */
function ContentPreview() {
  const on = useStudio(s => s.ui.preview && s.space === 'fondos');
  const bg = useStudio(s => s.entries[s.cursor]?.recipe.color.bg ?? '#000');
  if (!on) return null;
  const ink = previewInk(bg);
  const style = { '--pc': ink, '--pcb': ink === '#ffffff' ? '#111111' : '#ffffff' } as React.CSSProperties;
  return (
    <div className="preview-content" style={style} aria-hidden="true">
      <div className="pc-nav"><span>Tu marca</span><span>Proyectos · Estudio · Contacto</span></div>
      <h1>Un titular que se lee sin esfuerzo</h1>
      <p>Así se verá tu fondo detrás de contenido real. Si cuesta leer, baja el contraste o sube el tamaño de celda.</p>
      <span className="pc-btn">Botón principal</span>
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
