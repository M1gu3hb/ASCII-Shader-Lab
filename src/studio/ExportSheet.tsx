import { useEffect, useMemo, useRef, useState } from 'react';
import type { Recipe } from '../engine/recipe';
import { byteSize, gridToAnsi, gridToHtml, gridToHtmlPage, gridToText, toAsciicast, toJsString, toNodePlayer, toPythonPlayer, toShellBanner, type ColorDepth } from '../exporters/text';
import { recipeFile, shareUrl } from '../shared/share';
import { copyText, downloadBlob, downloadText } from './download';
import {
  LiveRecorder, SIZE_PRESETS, captureFrames, captureGrid, exportGif, exportImage, exportVideo, hasWebCodecs, liveTime, loopSeconds, resolveSize,
  videoSupport, type Cancel,
} from './exporting';
import { Sheet, slug } from './Sheets';
import { setUI, useStudio } from './store';
import { toast } from './toast';
import { archById } from '../random/archetypes';
import { spaceById } from '../random/spaces';
import { Glossary } from './Glossary';
import { exportProject, fmtSize, projectMedia } from './packages';
import { shareLink } from './ShareSheet';
import { takeExportTab } from './exportTab';

type Tab = 'imagen' | 'video' | 'vector' | 'terminal' | 'codigo' | 'receta';
const TABS: Array<[Tab, string]> = [['imagen', 'Imagen'], ['video', 'Video y GIF'], ['vector', 'Vector'], ['terminal', 'Texto y terminal'], ['codigo', 'Código'], ['receta', 'Receta']];

const useCurrent = () => useStudio(s => s.entries[s.cursor]);
const baseName = (r: Recipe) => 'monotrama-' + slug(r.meta.name ?? r.meta.seed ?? new Date().toISOString().slice(0, 16));

export function ExportSheet() {
  const open = useStudio(s => s.ui.sheet === 'export');
  const space = useStudio(s => s.space);
  const [tab, setTab] = useState<Tab>('imagen');
  useEffect(() => { if (open) setTab(takeExportTab() ?? (space === 'terminal' ? 'terminal' : space === 'fondos' ? 'codigo' : 'imagen')); }, [open, space]);
  return (
    <Sheet open={open} onClose={() => setUI({ sheet: 'none' })} wide title="Llevar la pieza fuera" sub="Todo se genera en tu navegador. Elige el formato según dónde la vayas a usar.">
      <div className="sheet-tabs" role="tablist">
        {TABS.map(([id, name]) => <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{name}</button>)}
      </div>
      <div className="sheet-body">
        {tab === 'imagen' && <ImageTab />}
        {tab === 'video' && <VideoTab />}
        {tab === 'vector' && <VectorTab />}
        {tab === 'terminal' && <TerminalTab />}
        {tab === 'codigo' && <CodeTab />}
        {tab === 'receta' && <RecipeTab />}
      </div>
    </Sheet>
  );
}

function Busy({ p, label, onCancel }: { p: number; label?: string; onCancel?: () => void }) {
  return (
    <div aria-live="polite">
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}><i style={{ '--v': Math.round(p * 100) + '%' } as React.CSSProperties} /></div>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
        <span>{label ?? 'Trabajando…'} {Math.round(p * 100)} %</span>
        {onCancel && <button type="button" className="mini" onClick={onCancel}>Cancelar</button>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ImageTab() {
  const e = useCurrent();
  const [preset, setPreset] = useState('v2');
  const [transparent, setTransparent] = useState(false);
  const [format, setFormat] = useState<'png' | 'webp' | 'jpeg'>('png');
  const [busy, setBusy] = useState(false);
  const spec = SIZE_PRESETS.find(p => p.id === preset)!.spec;
  const sz = resolveSize(spec);
  if (!e) return null;
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
        <div className="ctl"><label className="lbl" htmlFor="ex-size">Tamaño</label>
          <select id="ex-size" value={preset} onChange={ev => setPreset(ev.target.value)}>{SIZE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <p className="note">Resultado: <b>{sz.W}×{sz.H}</b> px.</p>
        <div className="ctl"><span className="lbl">Formato</span>
          <div className="seg">{(['png', 'webp', 'jpeg'] as const).map(f => <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>{f.toUpperCase()}</button>)}</div></div>
        <label className="toggle"><span>Fondo transparente {format === 'jpeg' && '(no en JPEG)'}</span><span className="switch"><input type="checkbox" role="switch" checked={transparent} disabled={format === 'jpeg'} onChange={ev => setTransparent(ev.target.checked)} /><span /></span></label>
        {transparent && <p className="note">Sólo quedan los caracteres (y el relleno de celda). Ideal para componer en Figma, Photoshop o After Effects.</p>}
        <button type="button" className="btn primary" disabled={busy} onClick={() => void go()}>{busy ? 'Generando…' : 'Descargar imagen'}</button>
      </div>
      <div className="ex-card">
        <h3>Consejos</h3>
        <p>«Vista ×2» y «×3» mantienen exactamente la composición que ves. Los tamaños fijos (cuadrado, vertical) reencuadran la escena conservando la densidad de caracteres.</p>
        <p>Para imprimir o escalar sin límite, usa la pestaña <b>Vector</b>.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function VideoTab() {
  const e = useCurrent();
  const [preset, setPreset] = useState('hd');
  const [fps, setFps] = useState(30);
  const loop = e ? +loopSeconds(e.recipe).toFixed(2) : 0;
  const [secs, setSecs] = useState(loop > 0 ? loop : 6);
  const [support, setSupport] = useState<{ mp4: boolean; webm: boolean } | null>(null);
  const [busy, setBusy] = useState<{ p: number; label?: string } | null>(null);
  const cancel = useRef<Cancel>({ cancelled: false });
  const [gifW, setGifW] = useState(640);
  const [rec, setRec] = useState<LiveRecorder | null>(null);
  const [recT, setRecT] = useState(0);
  const spec = SIZE_PRESETS.find(p => p.id === preset)!.spec;
  const sz = resolveSize(spec, true);
  const camera = e?.recipe.source === 'camera';
  useEffect(() => { setSecs(loop > 0 ? loop : 6); }, [loop]);
  useEffect(() => { void videoSupport(sz.W, sz.H).then(setSupport); }, [sz.W, sz.H]);
  useEffect(() => { if (!rec) return; const t0 = Date.now(); const id = setInterval(() => setRecT(Math.floor((Date.now() - t0) / 1000)), 250); return () => clearInterval(id); }, [rec]);
  if (!e) return null;
  const start = loop > 0 ? 0 : liveTime();
  const run = async (kind: 'mp4' | 'webm' | 'gif') => {
    cancel.current = { cancelled: false };
    setBusy({ p: 0 });
    try {
      const blob = kind === 'gif'
        ? await exportGif(e.recipe, gifW, { fps: Math.min(fps, 25), seconds: secs, start, colors: 128 }, (p, label) => setBusy({ p, label }), cancel.current)
        : await exportVideo(e.recipe, spec, { fps, seconds: secs, format: kind, start }, (p, label) => setBusy({ p, label }), cancel.current);
      downloadBlob(`${baseName(e.recipe)}.${kind}`, blob);
    } catch (err) {
      if ((err as Error).message !== 'cancelado') toast('La exportación falló: ' + (err as Error).message);
    }
    setBusy(null);
  };
  const toggleRec = async () => {
    if (rec) { const { blob, ext } = await rec.stop(); setRec(null); downloadBlob(`${baseName(e.recipe)}-directo.${ext}`, blob); return; }
    const r = new LiveRecorder();
    if (r.start(30)) setRec(r); else toast('Este navegador no permite grabar el lienzo.');
  };
  return (
    <div className="ex-grid">
      <div className="ex-card">
        <h3>Video renderizado</h3>
        <p>Fotograma a fotograma, sin saltos aunque tu equipo sea modesto. {loop > 0 ? <b>Tu pieza tiene bucle de {loop} s: el video enlaza perfecto.</b> : 'Activa «Bucle perfecto» en Movimiento para clips que se repiten sin corte.'}</p>
        {camera && <p className="warn">La cámara no se puede renderizar fotograma a fotograma: usa la grabación en directo.</p>}
        <div className="ctl"><label className="lbl" htmlFor="v-size">Tamaño</label>
          <select id="v-size" value={preset} onChange={ev => setPreset(ev.target.value)}>{SIZE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="row2">
          <label className="ctl"><span className="lbl">Duración (s)</span><input type="number" min={1} max={60} step={0.5} value={secs} onChange={ev => setSecs(Math.max(1, Math.min(60, +ev.target.value || 1)))} /></label>
          <label className="ctl"><span className="lbl">Fotogramas/s</span><select value={fps} onChange={ev => setFps(+ev.target.value)}>{[24, 25, 30, 60].map(f => <option key={f} value={f}>{f}</option>)}</select></label>
        </div>
        {busy ? <Busy p={busy.p} label={busy.label} onCancel={() => { cancel.current.cancelled = true; }} /> : (
          <>
            {!hasWebCodecs() && <p className="warn">Tu navegador no tiene WebCodecs: el render fotograma a fotograma no está disponible. Usa la grabación en directo.</p>}
            {support && !support.mp4 && !support.webm && hasWebCodecs() && <p className="warn">Tu navegador no puede codificar video a {sz.W}×{sz.H}. Prueba un tamaño menor o la grabación en directo.</p>}
            {support && !support.mp4 && support.webm && <p className="warn">Este navegador no puede codificar H.264, así que aquí no hay MP4. Usa WebM o prueba en otro navegador.</p>}
            <div className="row2">
              <button type="button" className="btn primary" disabled={camera || !support?.mp4} onClick={() => void run('mp4')}>MP4 (H.264)</button>
              <button type="button" className="btn" disabled={camera || !support?.webm} onClick={() => void run('webm')}>WebM</button>
            </div>
            <p className="note">{sz.W}×{sz.H} · {Math.round(secs * fps)} fotogramas. MP4 funciona en redes sociales, Keynote y editores de video.</p>
          </>
        )}
      </div>
      <div className="ex-card">
        <h3>GIF animado</h3>
        <p>Para README, Slack o correos. Hasta 25 fps y 128 colores por fotograma; mejor corto y pequeño.</p>
        <div className="ctl"><label className="lbl" htmlFor="gif-w">Ancho</label>
          <select id="gif-w" value={gifW} onChange={ev => setGifW(+ev.target.value)}>{[320, 480, 640, 800].map(w => <option key={w} value={w}>{w} px</option>)}</select></div>
        <button type="button" className="btn" disabled={!!busy || camera} onClick={() => void run('gif')}>Descargar GIF</button>
        <h3 style={{ marginTop: 18 }}>Grabación en directo</h3>
        <p>Graba el lienzo tal como lo ves, con tu cursor y tu cámara. La calidad depende de la fluidez de tu equipo.</p>
        <button type="button" className={'btn' + (rec ? ' primary' : '')} onClick={() => void toggleRec()}>{rec ? `Detener y guardar (${recT} s)` : 'Empezar a grabar'}</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function VectorTab() {
  const e = useCurrent();
  const [mode, setMode] = useState<'outline' | 'text'>('outline');
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  if (!e) return null;
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
        <p>Cada carácter se convierte en su contorno real; escala sin límite y se abre igual en Figma, Illustrator o el navegador.</p>
        <div className="ctl"><span className="lbl">Caracteres como</span>
          <div className="seg">
            <button type="button" aria-pressed={mode === 'outline'} onClick={() => setMode('outline')}>Contornos (fiel)</button>
            <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Texto editable</button>
          </div></div>
        <label className="toggle"><span>Sin fondo</span><span className="switch"><input type="checkbox" role="switch" checked={transparent} onChange={ev => setTransparent(ev.target.checked)} /><span /></span></label>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void go()}>{busy ? 'Trazando…' : 'Descargar SVG'}</button>
        {notes.map((n, i) => <p key={i} className="warn">{n}</p>)}
      </div>
      <div className="ex-card">
        <h3>Qué es fiel y qué no</h3>
        <p>Sí: caracteres, colores, fondo, relleno de celda y placas de mensaje.</p>
        <p>No: resplandor, bloom, barrido, curvatura, grano, viñeta y aberración — son efectos de píxel. Si tu pieza los usa, el SVG se verá más limpio que la vista; para conservarlos exporta PNG.</p>
        <p>«Texto editable» usa texto real (necesita la tipografía instalada donde lo abras).</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TerminalTab() {
  const e = useCurrent();
  const term = useStudio(s => s.ui.terminal);
  const space = useStudio(s => s.space);
  const [cols, setCols] = useState(term.cols);
  const [rows, setRows] = useState(term.rows);
  const [depth, setDepth] = useState<ColorDepth>('256');
  const [withBg, setWithBg] = useState(true);
  const [preview, setPreview] = useState<{ text: string; html: string; page: string; ansi: string } | null>(null);
  const loop = e ? +loopSeconds(e.recipe).toFixed(2) : 0;
  const [secs, setSecs] = useState(loop > 0 ? loop : 4);
  const [fps, setFps] = useState(12);
  const [busy, setBusy] = useState<number | null>(null);
  const [est, setEst] = useState('');
  const cancel = useRef<Cancel>({ cancelled: false });
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
    cancel.current = { cancelled: false };
    setBusy(0);
    try {
      const f = await captureFrames(e.recipe, cols, rows, { fps, seconds: secs, start: loop > 0 ? 0 : liveTime(), depth, withBg }, p => setBusy(p), cancel.current);
      if (kind === 'cast') downloadText(name + '.cast', toAsciicast(f, title), 'application/x-asciicast');
      if (kind === 'node') downloadText(name + '.mjs', await toNodePlayer(f, title), 'text/javascript');
      if (kind === 'python') downloadText(name + '.py', await toPythonPlayer(f, title), 'text/x-python');
    } catch (err) { if ((err as Error).message !== 'cancelado') toast('Falló: ' + (err as Error).message); }
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
      {preview && <div className="ansi-pre" style={{ marginBottom: 14 }} dangerouslySetInnerHTML={{ __html: preview.html }} />}
      <div className="ex-grid">
        <div className="ex-card">
          <h3>Fotograma</h3>
          <p>{cols}×{rows} caracteres · ANSI {est}. «256» es el más compatible; «Color real» se ve perfecto en terminales modernas.</p>
          <div className="row2">
            <button type="button" className="btn primary" onClick={() => preview && void copyText(preview.text, 'Texto copiado')}>Copiar texto</button>
            <button type="button" className="btn" onClick={() => preview && downloadText(name + '.txt', preview.text)}>.txt</button>
          </div>
          <div className="row2">
            <button type="button" className="btn" onClick={() => preview && downloadText(name + '.ans', preview.ansi)}>.ans (ANSI)</button>
            <button type="button" className="btn" onClick={() => preview && downloadText(name + '.html', preview.page, 'text/html')}>HTML</button>
          </div>
          <div className="row2">
            <button type="button" className="btn" onClick={() => preview && void copyText(toShellBanner(preview.text), 'Saludo para tu shell copiado')}>Saludo de shell</button>
            <button type="button" className="btn" onClick={() => preview && void copyText(toJsString(preview.ansi), 'Código para tu CLI copiado')}>Para tu CLI (JS)</button>
          </div>
        </div>
        <div className="ex-card">
          <h3>Animación para la consola</h3>
          <p>Scripts autónomos: no necesitan instalar nada. Se detienen con Ctrl+C y restauran la terminal.</p>
          <div className="row2">
            <label className="ctl"><span className="lbl">Duración (s)</span><input type="number" min={1} max={30} step={0.5} value={secs} onChange={ev => setSecs(Math.max(1, Math.min(30, +ev.target.value || 1)))} /></label>
            <label className="ctl"><span className="lbl">Fotogramas/s</span><select value={fps} onChange={ev => setFps(+ev.target.value)}>{[8, 10, 12, 15, 20, 24].map(f => <option key={f} value={f}>{f}</option>)}</select></label>
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

function CodeTab() {
  const e = useCurrent();
  const [kind, setKind] = useState<'html' | 'wc' | 'react'>('html');
  const [placement, setPlacement] = useState<'fixed' | 'block' | 'hero'>('fixed');
  const [interactive, setInteractive] = useState(true);
  const [systemFont, setSystemFont] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mod, setMod] = useState<typeof import('../exporters/code') | null>(null);
  useEffect(() => { void import('../exporters/code').then(setMod); }, []);
  const opts = { placement, interactive, systemFont, height: 420, mediaUrl };
  const out = useMemo(() => {
    if (!mod || !e) return null;
    if (kind === 'html') { const r = mod.htmlSnippet(e.recipe, opts); return { code: r.code, notes: r.notes, file: 'monotrama.html', extra: null as string | null }; }
    if (kind === 'wc') { const r = mod.webComponent(e.recipe, opts); return { code: r.usage, notes: r.notes, file: 'monotrama-field.js', extra: r.file }; }
    const r = mod.reactComponent(e.recipe, opts); return { code: r.code, notes: r.notes, file: 'MonotramaBackground.jsx', extra: null };
  }, [mod, e?.recipe, kind, placement, interactive, systemFont, mediaUrl]);
  if (!e) return null;
  const isMedia = e.recipe.source === 'image' || e.recipe.source === 'video';
  const poster = async () => {
    try { downloadBlob(baseName(e.recipe) + '-poster.png', await exportImage(e.recipe, { kind: 'view', scale: 1 }, { transparent: false, format: 'png' })); }
    catch (err) { toast('No se pudo generar el póster: ' + (err as Error).message); }
  };
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
        {isMedia && <input type="text" className="mono" placeholder={e.recipe.source === 'image' ? 'URL de tu imagen' : 'URL de tu video'} value={mediaUrl} onChange={ev => setMediaUrl(ev.target.value)} style={{ flex: 1, minWidth: 200, background: 'var(--field)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px' }} />}
      </div>
      {out?.notes.map((n, i) => <p key={i} className="warn">{n}</p>)}
      <textarea className="code" readOnly value={out?.code ?? 'Preparando…'} aria-label="Código" onFocus={ev => ev.currentTarget.select()} />
      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn primary" style={{ width: 'auto', margin: 0 }} disabled={!out} onClick={() => out && void copyText(out.code, 'Código copiado')}>Copiar</button>
        {kind === 'html' && mod && <button type="button" className="btn" style={{ width: 'auto', margin: 0 }} onClick={() => downloadText(baseName(e.recipe) + '.html', mod.htmlPage(e.recipe, opts), 'text/html')}>Descargar página .html</button>}
        {kind === 'wc' && out?.extra && <button type="button" className="btn" style={{ width: 'auto', margin: 0 }} onClick={() => downloadText('monotrama-field.js', out.extra!, 'text/javascript')}>Descargar monotrama-field.js</button>}
        {kind === 'react' && out && <button type="button" className="btn" style={{ width: 'auto', margin: 0 }} onClick={() => downloadText(out.file, out.code, 'text/javascript')}>Descargar {out.file}</button>}
        <button type="button" className="btn" style={{ width: 'auto', margin: 0 }} onClick={() => void poster()}>Descargar póster (PNG)</button>
        <span className="note" style={{ margin: 0 }}>Motor incluido ({mod ? Math.round(mod.runtimeSize() / 1024) : '…'} KB), sólo con los patrones que usa esta pieza. Se pausa fuera de pantalla y respeta «reducir movimiento».</span>
      </div>
      <p className="note">Sin WebGL 2 se ve el color de fondo; el póster se muestra en su lugar si lo subes con tu página y pones su URL en «poster».</p>
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
  const r = e.recipe;
  const media = (r.source === 'image' || r.source === 'video') && r.media.ref?.kind === r.source ? r.media.ref : null;
  const video = r.source === 'video';
  const word = video ? 'el video' : 'la imagen';
  const arch = archById(e.arch)?.name;
  return (
    <>
      <div className="ex-grid">
        <div className="ex-card">
          <h3>Semilla</h3>
          {e.seed ? (
            <>
              <p>La palabra con la que el dado tejió esta pieza. Escrita en «semilla», en el mismo espacio y estilo, la repite.</p>
              <p className="seed-big"><b>{e.seed}</b> · {spaceById(e.space).name}{arch ? ` · ${arch}` : ''}</p>
              <button type="button" className="btn" onClick={() => void copyText(e.seed!, 'Semilla copiada')}>Copiar semilla</button>
              <p className="note" style={{ margin: '8px 0 0' }}>No lleva tus ediciones{e.edited ? ' (esta pieza está editada)' : ''} ni tus archivos, y depende de la versión del generador. Para algo exacto, usa el enlace, la receta o el proyecto.</p>
            </>
          ) : (
            <p>Esta pieza no salió del dado (viene de una receta, un enlace o un archivo), así que no tiene semilla. Usa el enlace, la receta o el proyecto.</p>
          )}
        </div>
        <div className="ex-card">
          <h3>Enlace</h3>
          <p>La receta completa viaja dentro del enlace (después del «#», nunca llega a un servidor). Quien lo abra ve exactamente esta pieza y puede seguir editándola.</p>
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
                ? <>La receta y {word} original{media.name ? <> «{media.name}»</> : null} ({fmtSize(pm.size)}), con un LEEME. Arrástralo sobre el estudio en cualquier equipo y la pieza se abre igual.</>
                : `${video ? 'El video' : 'La imagen'} de esta pieza ya no está en este navegador: el proyecto saldría sólo con la receta.`}
          </p>
          <button type="button" className="btn primary" onClick={() => void exportProject(r, baseName(r))}>Exportar proyecto (.zip)</button>
        </div>
      </div>
      <Glossary />
    </>
  );
}
