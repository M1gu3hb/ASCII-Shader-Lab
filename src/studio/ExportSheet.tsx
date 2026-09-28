import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cloneRecipe, type Recipe } from '../engine/recipe';
import { byteSize, gridToAnsi, gridToHtml, gridToHtmlPage, gridToText, toAsciicast, toJsString, toNodePlayer, toPythonPlayer, toShellBanner, type ColorDepth } from '../exporters/text';
import { recipeFile, shareUrl } from '../shared/share';
import { imageFormats, recorderLabel, useCaps, videoEncoderWhy, type ImageFormat, type RecorderCaps, type VideoSupport } from './caps';
import { copyText, downloadBlob, downloadText } from './download';
import {
  SIZE_PRESETS, captureFrames, captureGrid, exportGif, exportImage, exportVideo, liveTime, loopSeconds, resolveSize,
  smallerEncodable, startRecording, stopRecording, useRecording, useStopOnLeave, videoSupport, type Cancel,
} from './exporting';
import { Sheet } from './Sheet';
import { setUI, useStudio } from './store';
import { toast } from './toast';
import { archById } from '../random/archetypes';
import { spaceById } from '../random/spaces';
import { Glossary } from './Glossary';
import { renderThumbs, stageSize } from './offscreen';
import { exportProject, fmtSize, projectMedia, slug } from './packages';
import { ShareKinds, shareLink } from './ShareSheet';
import './css/basic.css';
import './css/export-notes.css';
import { takeExportRequest, type ExportRequest } from './exportTab';
import { SegGroup } from './controls';
import { Picker, type PickOpt } from './ui/Picker';
import { ScrollRow } from './ui/ScrollRow';
import { useExportScrim, ScrimCodeNote } from './views/scrimExport';
import type { Fallback } from '../exporters/code';
import './css/export-code.css';
import { useSwap } from './motion/hooks';

type Tab = 'imagen' | 'video' | 'vector' | 'terminal' | 'codigo' | 'receta';
const TABS: Array<[Tab, string]> = [['imagen', 'Imagen'], ['video', 'Video y GIF'], ['vector', 'Vector'], ['terminal', 'Texto y terminal'], ['codigo', 'Código'], ['receta', 'Receta']];

const useCurrent = () => useStudio(s => s.entries[s.cursor]);
const baseName = (r: Recipe) => 'monotrama-' + slug(r.meta.name ?? r.meta.seed ?? new Date().toISOString().slice(0, 16));

export function ExportSheet() {
  const open = useStudio(s => s.ui.sheet === 'export');
  const space = useStudio(s => s.space);
  const [tab, setTab] = useState<Tab>('imagen');
  // a destination preview may ask for a tab and where it starts (size, GIF width, columns × rows)
  const [req, setReq] = useState<ExportRequest | null>(null);
  // each opening starts the tabs afresh (a tab left open last time must not keep its old size)
  const [opening, setOpening] = useState(0);
  useEffect(() => {
    if (!open) return;
    const r = takeExportRequest();
    setReq(r);
    setOpening(n => n + 1);
    setTab(r?.tab ?? (space === 'terminal' ? 'terminal' : space === 'fondos' ? 'codigo' : 'imagen'));
  }, [open, space]);
  // another format: its options resolve in (lightly; the sheet itself stays put)
  const body = useRef<HTMLDivElement>(null);
  useSwap(body, open ? tab : null, (a, b) => (a && b ? 'tab' : null));
  return (
    <Sheet open={open} onClose={() => setUI({ sheet: 'none' })} wide title="Llevar la pieza fuera" sub="Todo se genera en tu navegador. Elige el formato según dónde la vayas a usar.">
      <ScrollRow role="tablist" aria-label="Formatos" className="sheet-tabs" boxClassName="sheet-tabs-box">
        {TABS.map(([id, name]) => <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{name}</button>)}
      </ScrollRow>
      <div className="sheet-body" ref={body}>
        {tab === 'imagen' && <ImageTab key={opening} req={req} />}
        {tab === 'video' && <VideoTab key={opening} req={req} />}
        {tab === 'vector' && <VectorTab />}
        {tab === 'terminal' && <TerminalTab key={opening} req={req} />}
        {tab === 'codigo' && <CodeTab />}
        {tab === 'receta' && <RecipeTab />}
      </div>
    </Sheet>
  );
}

function Busy({ p, label, onCancel }: { p: number; label?: string; onCancel?: () => void }) {
  // the bar says the percentage; only the stage (preparing, encoding…) is announced, not every percent
  return (
    <div>
      <span className="sr-only" role="status">{label ?? 'Trabajando…'}</span>
      <div className="progress" role="progressbar" aria-label={label ?? 'Progreso'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}><i style={{ '--v': Math.round(p * 100) + '%' } as React.CSSProperties} /></div>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
        <span aria-hidden="true">{label ?? 'Trabajando…'} {Math.round(p * 100)} %</span>
        {onCancel && <button type="button" className="mini" onClick={onCancel}>Cancelar</button>}
      </div>
    </div>
  );
}

/** An option this browser cannot produce: said plainly, with what to use instead. Never a button. */
function Unavailable({ what, children, action }: { what: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="ex-na" role="note">
      <p><b>{what}</b> {children}</p>
      {action}
    </div>
  );
}

/** Copies through the clipboard when the browser allows it, else through the old copy command. */
async function tryCopy(text: string): Promise<boolean> {
  if (useCaps.getState().clipboard) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* permission refused: try the old way */ }
  }
  // inside the open dialog: a modal makes the rest of the page inert, and inert text cannot be selected
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
  (document.querySelector('dialog[open]') ?? document.body).appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* not supported */ }
  ta.remove();
  return ok;
}

/**
 * Copy buttons that tell the truth: when the browser does not let us copy, the text is selected
 * (in `target`, or in a box that appears under the buttons) and we say how to copy it by hand.
 */
function useCopy() {
  const [manual, setManual] = useState<{ text: string } | null>(null);
  const copy = async (text: string, done: string, target?: HTMLTextAreaElement | null) => {
    if (await tryCopy(text)) { setManual(null); toast(done); return; }
    if (target) { target.focus(); target.select(); setManual({ text: '' }); } else setManual({ text });
  };
  return { copy, manual };
}

function CopyFallback({ manual }: { manual: { text: string } | null }) {
  const clipboard = useCaps(s => s.clipboard);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (manual?.text) { ref.current?.focus(); ref.current?.select(); } }, [manual]);
  if (!manual) return null;
  const why = clipboard ? 'El navegador no dejó copiar' : 'Este navegador no da acceso al portapapeles desde aquí';
  return (
    <div className="ex-copy">
      <p role="status">{why}. {manual.text ? 'El texto está seleccionado aquí abajo' : 'El código ya está seleccionado'}: cópialo con Ctrl+C (⌘C en Mac), o mantén pulsado y elige «Copiar» en el móvil.</p>
      {manual.text && <textarea ref={ref} className="code" readOnly value={manual.text} aria-label="Texto para copiar a mano" onFocus={ev => ev.currentTarget.select()} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const FORMAT_NAME: Record<ImageFormat, string> = { png: 'PNG', webp: 'WebP', jpeg: 'JPEG' };

/** Why a format is missing, and what to use instead (only formats that do work are named). */
function formatGap(f: ImageFormat, ok: Record<ImageFormat, boolean>): string {
  const others = (['png', 'jpeg', 'webp'] as const).filter(o => o !== f && ok[o]).map(o => FORMAT_NAME[o]);
  return `Este navegador no sabe guardar ${FORMAT_NAME[f]}: si se lo pidiéramos, entregaría un PNG con otro nombre. Usa ${others.join(' o ')}.`;
}

/** A size preset asked for by the request, when the sheet offers it. */
const presetOf = (req: ExportRequest | null, fallback: string) => (req?.size && SIZE_PRESETS.some(p => p.id === req.size) ? req.size : fallback);

/** The size presets, each with the pixels it gives now (the «view» ones follow the stage). */
function sizeOptions(even = false): PickOpt<string>[] {
  return SIZE_PRESETS.map(p => {
    const z = resolveSize(p.spec, even);
    return { value: p.id, label: p.name, group: p.spec.kind === 'view' ? 'Como la ves' : 'Tamaños fijos', desc: `${z.W}×${z.H} px` };
  });
}

/** A size picker with its visible label. */
function SizePicker({ id, value, onChange, even }: { id: string; value: string; onChange: (v: string) => void; even?: boolean }) {
  return (
    <div className="ctl cx">
      <span className="lbl" id={id + '-l'}>Tamaño</span>
      <Picker id={id} value={value} label="Tamaño" labelId={id + '-l'} options={sizeOptions(even)} onChange={onChange} minWidth={240} />
    </div>
  );
}

/** A few numbers to choose from, all in view (frames per second, GIF widths). */
function Numbers({ id, label, value, list, unit = '', onPick }: { id: string; label: string; value: number; list: number[]; unit?: string; onPick: (v: number) => void }) {
  return (
    <div className="ctl cx">
      <span className="lbl" id={id}>{label}</span>
      <SegGroup labelId={id} value={value} opts={list.map(n => [n, n + unit] as [number, string])} onPick={onPick} />
    </div>
  );
}

function ImageTab({ req }: { req: ExportRequest | null }) {
  const e = useCurrent();
  const images = useCaps(s => s.images);
  const [preset, setPreset] = useState(() => presetOf(req, 'v2'));
  const [transparent, setTransparent] = useState(false);
  const [format, setFormat] = useState<ImageFormat>('png');
  const [busy, setBusy] = useState(false);
  const spec = SIZE_PRESETS.find(p => p.id === preset)!.spec;
  const sz = resolveSize(spec);
  useEffect(() => { void imageFormats(); }, []);
  useEffect(() => { if (images && !images[format]) setFormat('png'); }, [images, format]);
  if (!e) return null;
  // PNG always works; the others only once the probe has confirmed them
  const formats = (['png', 'webp', 'jpeg'] as const).filter(f => f === 'png' || images?.[f]);
  const missing = images ? (['webp', 'jpeg'] as const).filter(f => !images[f]) : [];
  const go = async () => {
    setBusy(true);
    try {
      const blob = await exportImage(e.recipe, spec, { transparent, format });
      downloadBlob(`${baseName(e.recipe)}-${sz.W}x${sz.H}.${format === 'jpeg' ? 'jpg' : format}`, blob);
    } catch (err) { toast('No se pudo generar la imagen: ' + (err as Error).message); }
    setBusy(false);
  };
  return (
    <div className="ex-grid">
      <div className="ex-card">
        <h3>Imagen fija</h3>
        <p>El fotograma actual, re-renderizado a la resolución que elijas (los glifos se dibujan de nuevo al tamaño final: nítidos, sin escalar).</p>
        <SizePicker id="ex-size" value={preset} onChange={setPreset} />
        <p className="note">Resultado: <b>{sz.W}×{sz.H}</b> px.</p>
        <div className="ctl"><span className="lbl">Formato</span>
          <div className="seg">{formats.map(f => <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>{f.toUpperCase()}</button>)}</div></div>
        {!images && <p className="note" aria-live="polite">Comprobando qué formatos guarda este navegador…</p>}
        {images && missing.map(f => <Unavailable key={f} what={`${FORMAT_NAME[f]}: no disponible.`}>{formatGap(f, images)}</Unavailable>)}
        <label className="toggle"><span>Fondo transparente {format === 'jpeg' && '(no en JPEG)'}</span><span className="switch"><input type="checkbox" role="switch" checked={transparent} disabled={format === 'jpeg'} onChange={ev => setTransparent(ev.target.checked)} /><span /></span></label>
        {transparent && <p className="note">Sólo quedan los caracteres (y el relleno de celda), sobre transparencia real: para componerlos encima de otra imagen o video.</p>}
        <button type="button" className="btn primary" disabled={busy} onClick={() => void go()}>{busy ? 'Generando…' : 'Descargar imagen'}</button>
      </div>
      <div className="ex-card">
        <h3>Consejos</h3>
        <p>«Vista ×2» y «×3» mantienen la composición que ves (con la pantalla a una escala intermedia, como 125 %, puede variar en una o dos columnas). Los tamaños fijos (cuadrado, vertical) reencuadran la escena conservando la densidad de caracteres.</p>
        <p>Para imprimir o escalar sin perder nitidez, usa la pestaña <b>Vector</b> (sin efectos de píxel).</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type Smaller = Awaited<ReturnType<typeof smallerEncodable>>;

/** Why the live recording cannot run here. */
function recorderGap(r: RecorderCaps): string {
  if (r.gap === 'no-recorder') return 'Este navegador no puede grabar video (no tiene MediaRecorder).';
  if (r.gap === 'no-capture') return 'Este navegador no puede convertir el lienzo en video (no tiene captureStream).';
  return 'Este navegador no graba en ningún formato de video que podamos guardar (MP4 o WebM).';
}

function VideoTab({ req }: { req: ExportRequest | null }) {
  const e = useCurrent();
  const webcodecs = useCaps(s => s.webcodecs);
  const recorder = useCaps(s => s.recorder);
  const basic = useCaps(s => s.renderer === 'basic');
  const [preset, setPreset] = useState(() => presetOf(req, 'hd'));
  const [fps, setFps] = useState(30);
  const loop = e ? +loopSeconds(e.recipe).toFixed(2) : 0;
  const [secs, setSecs] = useState(loop > 0 ? loop : 6);
  /** Codec support at the chosen size, and the smaller sizes that would work (keyed by W×H). */
  const [support, setSupport] = useState<{ key: string; s: VideoSupport; failed?: boolean } | null>(null);
  const [alt, setAlt] = useState<{ key: string; any: Smaller; mp4: Smaller } | null>(null);
  const [busy, setBusy] = useState<{ kind: 'video' | 'gif'; p: number; label?: string } | null>(null);
  const cancel = useRef<Cancel>({ cancelled: false });
  const [gifW, setGifW] = useState(() => (req?.gifW && [320, 480, 640, 800].includes(req.gifW) ? req.gifW : 640));
  const rec = useRecording(s => s.rec);
  const since = useRecording(s => s.since);
  const [recT, setRecT] = useState(0);
  useStopOnLeave(cancel);
  const spec = SIZE_PRESETS.find(p => p.id === preset)!.spec;
  const sz = resolveSize(spec, true);
  const key = `${sz.W}x${sz.H}`;
  const camera = e?.recipe.source === 'camera';
  useEffect(() => { setSecs(loop > 0 ? loop : 6); }, [loop]);
  useEffect(() => {
    if (!webcodecs || camera) return;
    let alive = true;
    void videoSupport(sz.W, sz.H).then(async s => {
      if (!alive) return;
      setSupport({ key, s });
      const any = !s.mp4 && !s.webm ? await smallerEncodable(sz.W, sz.H) : null;
      const mp4 = !s.mp4 && s.webm ? await smallerEncodable(sz.W, sz.H, 'mp4') : null;
      if (alive) setAlt({ key, any, mp4 });
    }).catch(() => { if (alive) setSupport({ key, s: { mp4: false, webm: false }, failed: true }); });
    return () => { alive = false; };
  }, [key, webcodecs, camera]);
  useEffect(() => {
    if (!rec) return;
    const tick = () => setRecT(Math.floor((Date.now() - since) / 1000));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [rec, since]);
  if (!e) return null;
  const cur = support?.key === key ? support.s : null;
  const alts = alt?.key === key ? alt : null;
  const start = loop > 0 ? 0 : liveTime();
  const run = async (kind: 'mp4' | 'webm' | 'gif') => {
    const job: Cancel = cancel.current = { cancelled: false, active: true };
    const where = kind === 'gif' ? 'gif' : 'video';
    setBusy({ kind: where, p: 0 });
    try {
      const blob = kind === 'gif'
        ? await exportGif(e.recipe, gifW, { fps: Math.min(fps, 25), seconds: secs, start, colors: 128 }, (p, label) => setBusy({ kind: where, p, label }), cancel.current)
        : await exportVideo(e.recipe, spec, { fps, seconds: secs, format: kind, start }, (p, label) => setBusy({ kind: where, p, label }), cancel.current);
      downloadBlob(`${baseName(e.recipe)}.${kind}`, blob);
    } catch (err) {
      if ((err as Error).message !== 'cancelado') toast('La exportación falló: ' + (err as Error).message);
    }
    job.active = false;
    setBusy(null);
  };
  const toggleRec = async () => {
    if (rec) { await stopRecording(); return; }
    if (!startRecording(baseName(e.recipe))) { toast('Este navegador no permitió grabar el lienzo.'); return; }
    // the sheet covers the stage: close it so the recording shows (and takes) the cursor; the stage keeps the stop button
    setUI({ sheet: 'none' });
    toast('Grabando el lienzo. Detén la grabación con el botón de arriba del lienzo.', undefined, 5000);
  };
  const progress = busy && <Busy p={busy.p} label={busy.label} onCancel={() => { cancel.current.cancelled = true; }} />;
  const switchTo = (p: NonNullable<Smaller>) => <button type="button" className="btn" onClick={() => setPreset(p.id)}>Usar {p.name}</button>;
  const liveAlt = recorder.ok ? 'la grabación en directo o el GIF' : 'el GIF';
  const renderRows = () => {
    if (!cur) return <p className="note" aria-live="polite">Comprobando qué puede codificar este navegador a {sz.W}×{sz.H}…</p>;
    if (support?.failed) {
      return <Unavailable what="Video renderizado: no se pudo preparar.">No se pudo descargar el codificador de video (quizá se cortó la conexión o hay una versión nueva del estudio). Cierra y vuelve a abrir esta ventana para intentarlo de nuevo, o recarga la página.</Unavailable>;
    }
    if (!cur.mp4 && !cur.webm) {
      if (!alts) return <p className="note" aria-live="polite">Buscando un tamaño que este navegador sí pueda codificar…</p>;
      return alts.any
        ? <Unavailable what={`Video a ${sz.W}×${sz.H}: no disponible.`} action={switchTo(alts.any)}>Este navegador no puede codificar video a este tamaño; a {alts.any.W}×{alts.any.H} sí.</Unavailable>
        : <Unavailable what="Video renderizado: no disponible.">Este navegador no puede codificar video en ningún tamaño (ni H.264, ni VP9, ni VP8). Usa {liveAlt}.</Unavailable>;
    }
    return (
      <>
        <div className={cur.mp4 && cur.webm ? 'row2' : undefined}>
          {cur.mp4 && <button type="button" className="btn primary" disabled={!!busy} onClick={() => void run('mp4')}>MP4 (H.264)</button>}
          {cur.webm && <button type="button" className={'btn' + (cur.mp4 ? '' : ' primary')} disabled={!!busy} onClick={() => void run('webm')}>WebM</button>}
        </div>
        {!cur.mp4 && (alts?.mp4
          ? <Unavailable what={`MP4 (H.264) a ${sz.W}×${sz.H}: no disponible.`} action={switchTo(alts.mp4)}>Este navegador no puede codificar H.264 a este tamaño; a {alts.mp4.W}×{alts.mp4.H} sí. A este tamaño, usa WebM.</Unavailable>
          : alts && <Unavailable what="MP4 (H.264): no disponible.">Este navegador no puede codificar H.264, así que aquí no hay MP4. Usa WebM o prueba en otro navegador.</Unavailable>)}
        {!cur.webm && <Unavailable what="WebM: no disponible.">Este navegador no puede codificar VP9 ni VP8 a {sz.W}×{sz.H}. Usa MP4.</Unavailable>}
        <p className="note">{sz.W}×{sz.H} · {Math.round(secs * fps)} fotogramas. MP4 (H.264) es el formato que suelen pedir redes sociales, presentaciones y editores de video; WebM, el de la web.</p>
      </>
    );
  };
  return (
    <>
      {!camera && (
        <div className="ex-clip">
          <label className="ctl"><span className="lbl">Duración (s)</span><input type="number" min={1} max={60} step={0.5} value={secs} onChange={ev => setSecs(Math.max(1, Math.min(60, +ev.target.value || 1)))} /></label>
          <Numbers id="v-fps" label="Fotogramas por segundo" value={fps} list={[24, 25, 30, 60]} onPick={setFps} />
          <p className="note">Valen para el video y el GIF. {loop > 0 ? <b>Tu pieza tiene bucle de {loop} s: el clip enlaza perfecto.</b> : 'Activa «Bucle perfecto» en Movimiento para clips que se repiten sin corte.'}</p>
        </div>
      )}
      <div className="ex-grid">
        <div className="ex-card">
          <h3>Video renderizado</h3>
          <p>Fotograma a fotograma, sin saltos aunque tu equipo sea modesto{basic ? ' (en modo básico tarda más, pero no pierde fotogramas)' : ''}.</p>
          {camera
            ? <Unavailable what="Render fotograma a fotograma: no con la cámara.">La cámara sólo existe en directo, así que no hay fotogramas que calcular por adelantado. {recorder.ok ? 'Usa la grabación en directo.' : 'La grabación en directo tampoco funciona en este navegador: exporta una imagen.'}</Unavailable>
            : !webcodecs
              ? <Unavailable what="MP4 y WebM: no disponibles.">{videoEncoderWhy()} Usa {liveAlt}.</Unavailable>
              : (
                <>
                  <SizePicker id="v-size" value={preset} onChange={setPreset} even />
                  {busy?.kind === 'video' ? progress : renderRows()}
                </>
              )}
        </div>
        <div className="ex-card">
          <h3>GIF animado</h3>
          <p>Para README, Slack o correos. Hasta 25 fps y 128 colores por fotograma; mejor corto y pequeño.</p>
          {camera
            ? <Unavailable what="GIF: no con la cámara.">El GIF también se calcula fotograma a fotograma. Con la cámara, graba en directo.</Unavailable>
            : (
              <>
                <Numbers id="gif-w" label="Ancho del GIF" value={gifW} list={[320, 480, 640, 800]} unit=" px" onPick={setGifW} />
                {busy?.kind === 'gif' ? progress : <button type="button" className="btn" disabled={!!busy} onClick={() => void run('gif')}>Descargar GIF</button>}
              </>
            )}
          <h3 style={{ marginTop: 18 }}>Grabación en directo</h3>
          {recorder.ok ? (
            <>
              <p>Graba el lienzo tal como lo ves, con tu cursor y tu cámara: al empezar, esta ventana se cierra y el botón para detener queda sobre el lienzo. La calidad depende de la fluidez de tu equipo{basic ? ' (en modo básico, como mucho 30 fotogramas por segundo)' : ''}.</p>
              <p className="note">Se guarda como <b>{recorderLabel(recorder.mime)}</b> (archivo .{recorder.ext}).</p>
              <button type="button" className={'btn' + (rec ? ' primary' : '')} onClick={() => void toggleRec()}>{rec ? `Detener y guardar (${recT} s)` : 'Empezar a grabar'}</button>
            </>
          ) : (
            <Unavailable what="Grabación en directo: no disponible.">{recorderGap(recorder)}{camera ? '' : webcodecs ? ' Usa el video renderizado o el GIF.' : ' Usa el GIF.'}</Unavailable>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

/** Screen effects the SVG cannot carry (it has no pixels to blur, glow or bend). */
const PIXEL_FX = ['glow', 'bloom', 'scan', 'curve', 'chroma', 'grain', 'flicker', 'vig'] as const;
const FX_NAME: Record<(typeof PIXEL_FX)[number], string> = { glow: 'resplandor', bloom: 'bloom', scan: 'barrido', curve: 'curvatura', chroma: 'aberración', grain: 'grano', flicker: 'parpadeo', vig: 'viñeta' };
const listEs = (xs: string[]) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);

/**
 * The current frame and the same frame without pixel effects, side by side, so the difference is seen
 * before downloading (the SVG is made of the characters and their colours only).
 */
function SvgCompare({ r, used }: { r: Recipe; used: string[] }) {
  const [urls, setUrls] = useState<[string | null, string | null]>([null, null]);
  const { cssW, cssH } = stageSize();
  useEffect(() => {
    const sig = { cancelled: false };
    const clean = cloneRecipe(r);
    for (const k of PIXEL_FX) clean.fx[k] = 0;
    setUrls([null, null]);
    void renderThumbs([r, clean], 300, (i, url) => setUrls(u => (i ? [u[0], url] : [url, u[1]])), sig);
    return () => { sig.cancelled = true; };
  }, [r]);
  const box = { aspectRatio: `${cssW} / ${cssH}` };
  return (
    <div className="svg-fx" role="note">
      <p><b>Antes de exportar:</b> tu pieza usa {listEs(used)}, efectos de píxel que no existen en un SVG. El SVG se verá como la imagen de la derecha.</p>
      <div className="svg-cmp">
        <figure>
          {urls[0] ? <img src={urls[0]} alt="El fotograma actual, con sus efectos" style={box} /> : <span className="svg-wait" style={box}>Preparando…</span>}
          <figcaption>La vista, con efectos</figcaption>
        </figure>
        <figure>
          {urls[1] ? <img src={urls[1]} alt="El mismo fotograma sin efectos de píxel, como saldrá el SVG" style={box} /> : <span className="svg-wait" style={box}>Preparando…</span>}
          <figcaption>El SVG, sin efectos de píxel</figcaption>
        </figure>
      </div>
      <p className="note">Si los necesitas, exporta PNG (pestaña Imagen): los conserva.</p>
    </div>
  );
}

function VectorTab() {
  const e = useCurrent();
  const [mode, setMode] = useState<'outline' | 'text'>('outline');
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  if (!e) return null;
  const used = PIXEL_FX.filter(k => e.recipe.fx[k] > 0.02).map(k => FX_NAME[k]);
  const go = async () => {
    setBusy(true);
    try {
      const g = await captureGrid(e.recipe);
      const { gridToSvg } = await import('../exporters/svg');
      const res = await gridToSvg(g, e.recipe, { mode, transparent });
      setNotes(res.notes);
      downloadText(`${baseName(e.recipe)}.svg`, res.svg, 'image/svg+xml');
    } catch (err) { toast('No se pudo generar el SVG: ' + (err as Error).message); }
    setBusy(false);
  };
  return (
    <div className="ex-grid">
      <div className="ex-card">
        <h3>SVG vectorial</h3>
        <p>Cada carácter se convierte en su contorno real: escala sin perder nitidez. Comprobado en navegadores, Inkscape y rsvg; en Figma o Illustrator no se ha probado.</p>
        {used.length > 0 ? <SvgCompare r={e.recipe} used={used} /> : <p className="note">Esta pieza no usa efectos de píxel: el SVG se verá como la vista.</p>}
        <div className="ctl"><span className="lbl">Caracteres como</span>
          <div className="seg">
            <button type="button" aria-pressed={mode === 'outline'} onClick={() => setMode('outline')}>Contornos (fiel)</button>
            <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Texto editable</button>
          </div></div>
        <label className="toggle"><span>Sin fondo</span><span className="switch"><input type="checkbox" role="switch" checked={transparent} onChange={ev => setTransparent(ev.target.checked)} /><span /></span></label>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void go()}>{busy ? 'Trazando…' : used.length ? 'Descargar SVG (sin efectos de píxel)' : 'Descargar SVG'}</button>
        {notes.map((n, i) => <p key={i} className="warn">{n}</p>)}
      </div>
      <div className="ex-card">
        <h3>Qué es fiel y qué no</h3>
        <p>Sí: caracteres, colores, fondo, relleno de celda y placas de mensaje.</p>
        <p>No: resplandor, bloom, barrido, curvatura, grano, viñeta, parpadeo y aberración: son efectos de píxel. Si tu pieza los usa, el SVG se verá más limpio que la vista; para conservarlos exporta PNG.</p>
        <p>«Texto editable» usa texto real: necesita la tipografía instalada donde lo abras, o se verá con otra.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TerminalTab({ req }: { req: ExportRequest | null }) {
  const e = useCurrent();
  const term = useStudio(s => s.ui.terminal);
  const space = useStudio(s => s.space);
  const [cols, setCols] = useState(req?.term?.cols ?? term.cols);
  const [rows, setRows] = useState(req?.term?.rows ?? term.rows);
  const [depth, setDepth] = useState<ColorDepth>('256');
  const [withBg, setWithBg] = useState(true);
  const [preview, setPreview] = useState<{ text: string; html: string; page: string; ansi: string } | null>(null);
  const loop = e ? +loopSeconds(e.recipe).toFixed(2) : 0;
  const [secs, setSecs] = useState(loop > 0 ? loop : 4);
  const [fps, setFps] = useState(12);
  const [busy, setBusy] = useState<number | null>(null);
  const [est, setEst] = useState('');
  const cancel = useRef<Cancel>({ cancelled: false });
  useStopOnLeave(cancel);
  const { copy, manual } = useCopy();
  useEffect(() => { if (space === 'terminal') { setCols(term.cols); setRows(term.rows); } }, [space, term.cols, term.rows]);
  useEffect(() => {
    if (!e) return;
    let alive = true;
    void captureGrid(e.recipe, cols, rows).then(g => {
      if (!alive) return;
      const ansi = gridToAnsi(g, depth, withBg);
      setPreview({ text: gridToText(g), html: gridToHtml(g), page: gridToHtmlPage(g, e.recipe.meta.name ?? e.recipe.meta.seed ?? 'Monotrama'), ansi });
      setEst(byteSize(ansi));
    });
    return () => { alive = false; };
  }, [e?.recipe, cols, rows, depth, withBg]);
  if (!e) return null;
  const name = baseName(e.recipe);
  const title = e.recipe.meta.name ?? e.recipe.meta.seed ?? 'Monotrama';
  const anim = async (kind: 'cast' | 'node' | 'python') => {
    const job: Cancel = cancel.current = { cancelled: false, active: true };
    setBusy(0);
    try {
      const f = await captureFrames(e.recipe, cols, rows, { fps, seconds: secs, start: loop > 0 ? 0 : liveTime(), depth, withBg }, p => setBusy(p), cancel.current);
      if (kind === 'cast') downloadText(name + '.cast', toAsciicast(f, title), 'application/x-asciicast');
      if (kind === 'node') downloadText(name + '.mjs', await toNodePlayer(f, title), 'text/javascript');
      if (kind === 'python') downloadText(name + '.py', await toPythonPlayer(f, title), 'text/x-python');
    } catch (err) { if ((err as Error).message !== 'cancelado') toast('Falló: ' + (err as Error).message); }
    job.active = false;
    setBusy(null);
  };
  return (
    <>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <label className="ctl" style={{ margin: 0 }}><span className="lbl">Columnas</span><input type="number" min={10} max={300} value={cols} onChange={ev => setCols(Math.max(10, Math.min(300, +ev.target.value || 80)))} style={{ width: 90 }} /></label>
        <label className="ctl" style={{ margin: 0 }}><span className="lbl">Filas</span><input type="number" min={4} max={150} value={rows} onChange={ev => setRows(Math.max(4, Math.min(150, +ev.target.value || 24)))} style={{ width: 90 }} /></label>
        <div className="ctl" style={{ margin: 0, flex: 1, minWidth: 260 }}><span className="lbl">Color</span>
          <div className="seg">{([['none', 'Sin color'], ['16', '16'], ['256', '256'], ['truecolor', 'Color real']] as Array<[ColorDepth, string]>).map(([d, n]) => <button key={d} type="button" aria-pressed={depth === d} onClick={() => setDepth(d)}>{n}</button>)}</div></div>
        <label className="toggle" style={{ margin: 0 }}><span>Pintar fondo</span><span className="switch"><input type="checkbox" role="switch" checked={withBg} onChange={ev => setWithBg(ev.target.checked)} /><span /></span></label>
      </div>
      {preview && <div className="ansi-pre" style={{ marginBottom: 14 }} tabIndex={0} role="region" aria-label={`Vista previa en texto, ${cols}×${rows}`} dangerouslySetInnerHTML={{ __html: preview.html }} />}
      <div className="ex-grid">
        <div className="ex-card">
          <h3>Fotograma</h3>
          <p>{cols}×{rows} caracteres · ANSI {est}. «256» es el más compatible; «Color real» es el más fiel, en terminales que lo admiten (truecolor).</p>
          <div className="row2">
            <button type="button" className="btn primary" onClick={() => preview && void copy(preview.text, 'Texto copiado')}>Copiar texto</button>
            <button type="button" className="btn" onClick={() => preview && downloadText(name + '.txt', preview.text)}>.txt</button>
          </div>
          <div className="row2">
            <button type="button" className="btn" onClick={() => preview && downloadText(name + '.ans', preview.ansi)}>.ans (ANSI)</button>
            <button type="button" className="btn" onClick={() => preview && downloadText(name + '.html', preview.page, 'text/html')}>HTML</button>
          </div>
          <div className="row2">
            <button type="button" className="btn" onClick={() => preview && void copy(toShellBanner(preview.text), 'Saludo para tu shell copiado')}>Saludo de shell</button>
            <button type="button" className="btn" onClick={() => preview && void copy(toJsString(preview.ansi), 'Código para tu CLI copiado')}>Para tu CLI (JS)</button>
          </div>
          <CopyFallback manual={manual} />
        </div>
        <div className="ex-card">
          <h3>Animación para la consola</h3>
          <p>Scripts autónomos: no necesitan instalar nada. Se detienen con Ctrl+C y restauran la terminal.</p>
          <div className="ex-anim">
            <label className="ctl"><span className="lbl">Duración (s)</span><input type="number" min={1} max={30} step={0.5} value={secs} onChange={ev => setSecs(Math.max(1, Math.min(30, +ev.target.value || 1)))} /></label>
            <Numbers id="t-fps" label="Fotogramas por segundo" value={fps} list={[8, 10, 12, 15, 20, 24]} onPick={setFps} />
          </div>
          {busy !== null ? <Busy p={busy} onCancel={() => { cancel.current.cancelled = true; }} /> : (
            <>
              <button type="button" className="btn primary" onClick={() => void anim('node')}>Script de Node (.mjs)</button>
              <div className="row2">
                <button type="button" className="btn" onClick={() => void anim('python')}>Script de Python</button>
                <button type="button" className="btn" onClick={() => void anim('cast')}>asciinema (.cast)</button>
              </div>
            </>
          )}
          <p className="note">Ejecuta con <code>node pieza.mjs</code> o <code>python3 pieza.py</code>. El .cast se reproduce con <code>asciinema play</code> o se incrusta en la web.</p>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

const kb = (n: number) => (n < 10 * 1024 ? (n / 1024).toLocaleString('es', { maximumFractionDigits: 1 }) : Math.round(n / 1024).toLocaleString('es')) + ' KB';

/** Bytes of `text` once gzip-compressed, as most servers send it (null while counting, or without CompressionStream). */
function useGzipSize(text: string | null): number | null {
  const [n, setN] = useState<{ text: string; bytes: number } | null>(null);
  useEffect(() => {
    if (!text || typeof CompressionStream === 'undefined') return;
    let alive = true;
    const t = setTimeout(() => {
      const gz = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
      void new Response(gz).arrayBuffer().then(b => { if (alive) setN({ text, bytes: b.byteLength }); }).catch(() => undefined);
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [text]);
  return n && n.text === text ? n.bytes : null;
}

type CodeMod = typeof import('../exporters/code');

/**
 * What the code does in a browser without WebGL 2, chosen before copying: the basic engine (Canvas 2D,
 * the same piece drawn by the processor) at the size it adds, or the poster / background colour.
 */
function FallbackChoice({ mod, r, value, onChange }: { mod: CodeMod | null; r: Recipe; value: Fallback; onChange: (v: Fallback) => void }) {
  const delta = mod ? mod.runtimeSize(r, 'basic') - mod.runtimeSize(r, 'poster') : 0;
  const n = mod ? mod.basicPatternIds(r).length : 0;
  return (
    <div className="code-fallback">
      <span className="lbl" id="code-fb-l">Si el navegador no tiene WebGL 2</span>
      <div className="seg" role="group" aria-labelledby="code-fb-l">
        <button type="button" aria-pressed={value === 'basic'} onClick={() => onChange('basic')}>Motor básico{mod ? ` (+${kb(delta)})` : ''}</button>
        <button type="button" aria-pressed={value === 'poster'} onClick={() => onChange('poster')}>Póster o color</button>
      </div>
      <p className="note" aria-live="polite">
        {value === 'basic'
          ? <>Incluido: sin WebGL 2 (aceleración gráfica desactivada, equipos o navegadores antiguos) el procesador dibuja la misma pieza con Canvas 2D, más despacio (hasta 30 fotogramas por segundo). Añade {mod ? kb(delta) : '…'}: el motor básico y {n === 1 ? 'el patrón' : `los ${n} patrones`} que usa esta pieza. Si tampoco puede dibujar, se ve tu póster o el color de fondo.</>
          : <>Sin WebGL 2 la pieza no se mueve: se ve el color de fondo, o tu póster si lo subes con tu página y pones su URL en «poster». El código pesa {mod ? kb(delta) : '…'} menos.</>}
      </p>
    </div>
  );
}

function CodeTab() {
  const e = useCurrent();
  const [kind, setKind] = useState<'html' | 'wc' | 'react'>('html');
  const [placement, setPlacement] = useState<'fixed' | 'block' | 'hero'>('fixed');
  const [interactive, setInteractive] = useState(true);
  const [systemFont, setSystemFont] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [fallback, setFallback] = useState<Fallback>('basic');
  const [mod, setMod] = useState<CodeMod | null>(null);
  const basic = useCaps(s => s.renderer === 'basic');
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const { copy, manual } = useCopy();
  const zone = useExportScrim();
  const [withZone, setWithZone] = useState(true);
  useEffect(() => { void import('../exporters/code').then(setMod); }, []);
  const scrim = withZone ? zone : null;
  const opts = { placement, interactive, systemFont, height: 420, mediaUrl, scrim, fallback };
  const out = useMemo(() => {
    if (!mod || !e) return null;
    if (kind === 'html') { const r = mod.htmlSnippet(e.recipe, opts); return { code: r.code, notes: r.notes, file: 'monotrama.html', extra: null as string | null }; }
    if (kind === 'wc') { const r = mod.webComponent(e.recipe, opts); return { code: r.usage, notes: r.notes, file: 'monotrama-field.js', extra: r.file }; }
    const r = mod.reactComponent(e.recipe, opts); return { code: r.code, notes: r.notes, file: 'MonotramaBackground.jsx', extra: null };
  }, [mod, e?.recipe, kind, placement, interactive, systemFont, mediaUrl, scrim, fallback]);
  // what a visitor downloads: the snippet, monotrama-field.js, or the component
  const weight = out ? (out.extra ?? out.code) : null;
  const gz = useGzipSize(weight);
  if (!e) return null;
  const isMedia = e.recipe.source === 'image' || e.recipe.source === 'video';
  const poster = async () => {
    try { downloadBlob(baseName(e.recipe) + '-poster.png', await exportImage(e.recipe, { kind: 'view', scale: 1 }, { transparent: false, format: 'png' })); }
    catch (err) { toast('No se pudo generar el póster: ' + (err as Error).message); }
  };
  const bytes = weight ? new Blob([weight]).size : 0;
  return (
    <>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="seg" style={{ flex: '1 1 300px' }} role="group" aria-label="Tipo de código">
          <button type="button" aria-pressed={kind === 'html'} onClick={() => setKind('html')}>HTML para pegar</button>
          <button type="button" aria-pressed={kind === 'wc'} onClick={() => setKind('wc')}>Web Component</button>
          <button type="button" aria-pressed={kind === 'react'} onClick={() => setKind('react')}>React</button>
        </div>
        <div className="seg" style={{ flex: '1 1 260px' }} role="group" aria-label="Colocación">
          <button type="button" aria-pressed={placement === 'fixed'} onClick={() => setPlacement('fixed')}>Fondo de página</button>
          <button type="button" aria-pressed={placement === 'hero'} onClick={() => setPlacement('hero')}>Portada</button>
          <button type="button" aria-pressed={placement === 'block'} onClick={() => setPlacement('block')}>Bloque</button>
        </div>
      </div>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <label className="toggle" style={{ margin: 0 }}><span>Reacciona al cursor</span><span className="switch"><input type="checkbox" role="switch" checked={interactive} onChange={ev => setInteractive(ev.target.checked)} /><span /></span></label>
        <label className="toggle" style={{ margin: 0 }}><span>Sin dependencias externas</span><span className="switch"><input type="checkbox" role="switch" checked={systemFont} onChange={ev => setSystemFont(ev.target.checked)} /><span /></span></label>
        {zone && <label className="toggle" style={{ margin: 0 }}><span>Zona protegida</span><span className="switch"><input type="checkbox" role="switch" checked={withZone} onChange={ev => setWithZone(ev.target.checked)} /><span /></span></label>}
        {isMedia && <input type="text" className="mono" aria-label={e.recipe.source === 'image' ? 'URL de tu imagen en tu web' : 'URL de tu video en tu web'} placeholder={e.recipe.source === 'image' ? 'URL de tu imagen' : 'URL de tu video'} value={mediaUrl} onChange={ev => setMediaUrl(ev.target.value)} style={{ flex: 1, minWidth: 200, background: 'var(--field)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px' }} />}
      </div>
      <FallbackChoice mod={mod} r={e.recipe} value={fallback} onChange={setFallback} />
      {basic && (
        <div className="ex-na info" role="note">
          <p><b>Tu vista previa usa el motor básico.</b> Quien visite tu web con WebGL 2 verá el motor completo; sin WebGL 2, {fallback === 'basic' ? 'la verá como aquí, con el motor básico que va en el código' : 'verá el color de fondo (o tu póster, si lo subes con tu página y pones su URL en «poster»)'}.</p>
          <button type="button" className="btn" onClick={() => void poster()}>Descargar póster (PNG)</button>
        </div>
      )}
      <ScrimCodeNote zone={zone} on={withZone} />
      {out?.notes.map((n, i) => <p key={i} className="warn">{n}</p>)}
      <textarea ref={codeRef} className="code" readOnly value={out?.code ?? 'Preparando…'} aria-label="Código" onFocus={ev => ev.currentTarget.select()} />
      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn primary" style={{ width: 'auto', margin: 0 }} disabled={!out} onClick={() => out && void copy(out.code, 'Código copiado', codeRef.current)}>Copiar</button>
        {kind === 'html' && mod && <button type="button" className="btn" style={{ width: 'auto', margin: 0 }} onClick={() => downloadText(baseName(e.recipe) + '.html', mod.htmlPage(e.recipe, opts), 'text/html')}>Descargar página .html</button>}
        {kind === 'wc' && out?.extra && <button type="button" className="btn" style={{ width: 'auto', margin: 0 }} onClick={() => downloadText('monotrama-field.js', out.extra!, 'text/javascript')}>Descargar monotrama-field.js</button>}
        {kind === 'react' && out && <button type="button" className="btn" style={{ width: 'auto', margin: 0 }} onClick={() => downloadText(out.file, out.code, 'text/javascript')}>Descargar {out.file}</button>}
        {!basic && <button type="button" className="btn" style={{ width: 'auto', margin: 0 }} onClick={() => void poster()}>Descargar póster (PNG)</button>}
      </div>
      <p className="note code-size">
        {out ? <>{kind === 'wc' ? 'monotrama-field.js' : kind === 'react' ? out.file : 'Este código'}: <b>{kb(bytes)}</b>{gz ? ` (${kb(gz)} comprimido con gzip, como lo sirven la mayoría de servidores)` : ''}. </> : null}
        Lleva el motor {fallback === 'basic' ? 'WebGL 2 y el básico' : 'WebGL 2'}, sólo con los patrones que usa esta pieza. Se pausa fuera de pantalla y respeta «reducir movimiento».
      </p>
      <CopyFallback manual={manual} />
    </>
  );
}

/* ------------------------------------------------------------------ */

/** Ways to keep or send the piece, from the loosest (seed) to the most complete (project). */
function RecipeTab() {
  const e = useCurrent();
  const [url, setUrl] = useState('');
  const [pm, setPm] = useState<{ available: boolean; size: number } | null>(null);
  useEffect(() => { if (e) void shareUrl({ ...e.recipe, meta: { ...e.recipe.meta, space: e.space } }).then(setUrl); }, [e?.recipe, e?.space]);
  useEffect(() => { let alive = true; if (e) void projectMedia(e.recipe).then(m => { if (alive) setPm(m); }); return () => { alive = false; }; }, [e?.recipe]);
  if (!e) return null;
  // what leaves the studio records the space, so it reopens where it was made (as the share sheet does)
  const r = { ...e.recipe, meta: { ...e.recipe.meta, space: e.space } };
  const media = (r.source === 'image' || r.source === 'video') && r.media.ref?.kind === r.source ? r.media.ref : null;
  const video = r.source === 'video';
  const word = video ? 'el video' : 'la imagen';
  const arch = archById(e.arch)?.name;
  return (
    <>
      <h3 className="data-h">Enlace o proyecto: qué lleva cada uno</h3>
      <ShareKinds word={media ? word : undefined} />
      <div className="ex-grid">
        <div className="ex-card">
          <h3>Semilla</h3>
          {e.seed ? (
            <>
              <p>La palabra con la que el dado tejió esta pieza. Escrita en «semilla», en el mismo espacio y estilo, la repite.</p>
              <p className="seed-big"><b>{e.seed}</b> · {spaceById(e.space).name}{arch ? ` · ${arch}` : ''} · generador v{e.recipe.meta.gen ?? 1}</p>
              <button type="button" className="btn" onClick={() => void copyText(e.seed!, 'Semilla copiada')}>Copiar semilla</button>
              <p className="note" style={{ margin: '8px 0 0' }}>No lleva tus ediciones{e.edited ? ' (esta pieza está editada)' : ''} ni tus archivos, y depende de la versión del generador. Para algo exacto, usa el enlace, la receta o el proyecto.</p>
            </>
          ) : (
            <p>Esta pieza no salió del dado (es un estilo de partida, o viene de un enlace o de un archivo), así que no tiene semilla. Usa el enlace, la receta o el proyecto.</p>
          )}
        </div>
        <div className="ex-card">
          <h3>Enlace</h3>
          <p>La receta completa viaja dentro del enlace (después del «#», nunca llega a un servidor). Quien lo abra ve esta pieza y puede seguir editándola{media ? `, pero con ${video ? 'un video suyo' : 'una imagen suya'}` : ''}.</p>
          {media && <p className="warn">El enlace no lleva {word} ni su nombre: quien lo abra verá el patrón de fondo hasta que elija {video ? 'un video suyo' : 'una imagen suya'}. Para enviarla completa, exporta el proyecto.</p>}
          <textarea className="code" style={{ height: 90 }} readOnly value={url} onFocus={ev => ev.currentTarget.select()} aria-label="Enlace" />
          <button type="button" className="btn primary" style={{ marginTop: 10 }} onClick={() => void shareLink(r, e.space)}>Copiar enlace</button>
        </div>
        <div className="ex-card">
          <h3>Receta (.json)</h3>
          <p>Un archivo con todos los ajustes. Arrástralo sobre el estudio (o usa Colección → Importar) para reabrirlo. También acepta los ajustes JSON del laboratorio original.</p>
          {media && <p className="note">Guarda el nombre y las medidas de {word}, no el archivo.</p>}
          <button type="button" className="btn primary" onClick={() => downloadText(baseName(r) + '.monotrama.json', recipeFile(r), 'application/json')}>Descargar receta (.json)</button>
          <button type="button" className="btn" onClick={() => void copyText(JSON.stringify(r, null, 2), 'Receta copiada')}>Copiar JSON</button>
        </div>
        <div className="ex-card">
          <h3>Proyecto (.zip)</h3>
          <p>
            {!media
              ? 'La receta y un LEEME con instrucciones, en un solo archivo. Esta pieza no usa imagen ni video.'
              : pm?.available
                ? <>La receta y {word} original{media.name ? <> «{media.name}»</> : null} ({fmtSize(pm.size)}), con un LEEME. Arrástralo sobre el estudio en otro equipo y la pieza se abre con su archivo.</>
                : `${video ? 'El video' : 'La imagen'} de esta pieza ya no está en este navegador: el proyecto saldría sólo con la receta.`}
          </p>
          <button type="button" className="btn primary" onClick={() => void exportProject(r, baseName(r))}>Exportar proyecto (.zip)</button>
        </div>
      </div>
      <Glossary />
    </>
  );
}
