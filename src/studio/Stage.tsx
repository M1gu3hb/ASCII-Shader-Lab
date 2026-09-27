import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { luminance } from '../engine/color';
import { SOURCE_NAMES } from '../engine/catalog';
import { mountStudioEngine, destroyStudioEngine } from './engineBridge';
import { handleFile, pickFile } from './files';
import { startCamera, useMedia } from './media';
import { edit, setPlaying, useRecipe, useStudio } from './store';

export function Stage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const space = useStudio(s => s.space);
  const term = useStudio(s => s.ui.terminal);
  const recipe = useRecipe();
  const terminal = space === 'terminal';
  const [fit, setFit] = useState({ w: 800, h: 480, k: 1 });

  useEffect(() => {
    if (!canvas.current) return;
    const err = mountStudioEngine(canvas.current);
    if (err) setFatal(err);
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
            <canvas ref={canvas} role="img" aria-label={describe(recipe)} />
          </div>
        </div>
      </div>
      {fatal && <div className="fatal"><div><p>{fatal}</p></div></div>}
      <MediaPrompt />
      <ContentPreview />
      <MotionNote />
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
  return (
    <div className="prompt">
      <div className="card" role="region" aria-label="Cargar fuente">
        <h2>{cam ? 'Tu cámara, en caracteres' : source === 'video' ? 'Suelta aquí un video' : 'Suelta aquí una imagen'}</h2>
        <p>{cam ? 'La cámara sólo se activa cuando pulsas el botón. Puedes apagarla cuando quieras.' : 'O elige un archivo de tu equipo. Mientras tanto ves el patrón de fondo.'}</p>
        {cam
          ? <button type="button" className="btn primary" onClick={() => void startCamera()}>{media.camera === 'starting' ? 'Esperando permiso…' : 'Activar cámara'}</button>
          : (
            <div className="row2">
              <button type="button" className="btn primary" onClick={() => pickFile(source === 'video' ? 'video' : 'image')}>{source === 'video' ? 'Elegir video' : 'Elegir imagen'}</button>
              <button type="button" className="btn" onClick={() => { const p = startCamera(); edit(r => { r.source = 'camera'; }, 'cam'); void p; }}>Usar cámara</button>
            </div>
          )}
        {media.error && <p className="warn" style={{ marginTop: 12 }}>{media.error}</p>}
        <p className="privacy">Se procesa en tu navegador. Nada se sube a ningún servidor.</p>
      </div>
    </div>
  );
}

function ContentPreview() {
  const on = useStudio(s => s.ui.preview && s.space === 'fondos');
  const bg = useStudio(s => s.entries[s.cursor]?.recipe.color.bg ?? '#000');
  if (!on) return null;
  const light = luminance(bg) > 0.4;
  const style = { '--pc': light ? '#111' : '#fff', '--pcb': light ? '#fff' : '#111' } as React.CSSProperties;
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
