/**
 * The «Recorte» panel: background removal inside the photo studio, on src/cutout (models run in this browser).
 *
 *   1. model: the cut-out models this device can run (cutoutCaps), each with its size, backend and licences;
 *      the unavailable ones stay listed with the reason; a discreet recommendation (suggestCutout, no model);
 *   2. consent before any download (consentInfo: size, where from, «tus fotos no se suben»), progress, cancel;
 *   3. the cut-out, with progress and cancel;
 *   4. refinement with a live preview: edge softness, shift, decontamination, detail; «Conservar» / «Quitar»
 *      brushes on the matte; add or remove a colour (matteFromColor + combineMattes); previews on a checkerboard,
 *      light, dark and high-contrast backgrounds; before/after;
 *   5. what to do with it: a new cut-out layer, a mask on the target layer (the subject, or the background =
 *      inverted), or both — one undo step; export the transparent PNG and the matte.
 * For a video source, «Quitar fondo del video» (VideoCutout.tsx) comes first: every frame of a stretch, as a
 * mask per frame or a cut-out video layer; the flow above then cuts out only the frame at the playhead.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { CutoutCaps, CutoutModelId, Matte, ModelState, RefineOptions } from '../../cutout';
import type { Id, Source } from '../../project/types';
import { useProject } from '../../project/store';
import { LazyBrush } from '../tools/brush';
import { pickColor, toHex } from '../tools/color';
import type { ToolHost } from '../tools/types';
import { Button, Note, Progress, Row, Segmented, Slider, pct, px } from '../tools/ui';
import { applyCutout, decodeSource, sourceFor } from './apply';
import { VideoCutout } from './VideoCutout';
import './panel.css';

type Cut = typeof import('../../cutout');
let cutP: Promise<Cut> | null = null;
const cutout = () => (cutP ??= import('../../cutout'));

type Phase = 'loading' | 'choose' | 'consent' | 'downloading' | 'running' | 'refine' | 'applying' | 'error';
type Bg = 'checker' | 'light' | 'dark' | 'contrast';
type EditTool = 'none' | 'keep' | 'remove' | 'color-remove' | 'color-add';
type What = 'layer' | 'mask' | 'both';

export interface CutoutPanelProps {
  host: ToolHost;
  /** The source to cut out (defaults to the target layer's source). */
  source?: Id;
  onClose(): void;
}

/** QA hooks (the studio's e2e and the tools QA page read them). */
export const cutoutPanelQA: { last: null | { model: string; ms: number; w: number; h: number; backend: string }; state: () => string } = { last: null, state: () => '' };

export function CutoutPanel({ host, source: asked, onClose }: CutoutPanelProps) {
  const project = useProject(s => s.project);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [caps, setCaps] = useState<CutoutCaps | null>(null);
  const [states, setStates] = useState<Partial<Record<CutoutModelId, ModelState>>>({});
  const [model, setModel] = useState<CutoutModelId>('subject');
  const [hint, setHint] = useState('');
  const [consent, setConsent] = useState<null | { name: string; size: string; text: string; licence: string; note?: string; from: string }>(null);
  const [progress, setProgress] = useState<{ p: number | null; label: string }>({ p: null, label: '' });
  const [refine, setRefine] = useState<RefineOptions>({ feather: 0, shift: 0, decontaminate: 0.8, detail: 0 });
  const [bg, setBg] = useState<Bg>('checker');
  const [before, setBefore] = useState(false);
  const [tool, setTool] = useState<EditTool>('none');
  const [brush, setBrush] = useState({ size: 40, hardness: 0.6 });
  const [colorOpts, setColorOpts] = useState({ tol: 0.1, soft: 0.06 });
  const [what, setWhat] = useState<What>('layer');
  const [maskKind, setMaskKind] = useState<'subject' | 'background'>('subject');
  const [timing, setTiming] = useState('');
  const [tick, setTick] = useState(0);
  const [edits, setEdits] = useState(0);
  const [videoBusy, setVideoBusy] = useState(false);

  const targetId = host.target();
  const src = useMemo<Source | null>(() => (project ? sourceFor(project, targetId, asked) : null), [project?.id, targetId, asked]); // eslint-disable-line react-hooks/exhaustive-deps
  const targetLayer = project?.layers.find(l => l.id === targetId) ?? null;

  const pixels = useRef<HTMLCanvasElement | null>(null);
  const base = useRef<Matte | null>(null);
  const edited = useRef<Matte | null>(null);
  const refined = useRef<Matte | null>(null);
  const cutImg = useRef<ImageData | null>(null);
  const cutCanvas = useRef<HTMLCanvasElement | null>(null);
  const history = useRef<Uint8ClampedArray[]>([]);
  const abort = useRef<AbortController | null>(null);
  const view = useRef<HTMLCanvasElement | null>(null);
  const stroke = useRef<{ lazy: LazyBrush; last: { x: number; y: number } } | null>(null);

  /* ---------------------------------------------------------------- loading */

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const cut = await cutout();
        const c = await cut.cutoutCaps();
        if (!live) return;
        setCaps(c);
        const st: Partial<Record<CutoutModelId, ModelState>> = {};
        for (const m of c.models) st[m.id] = await cut.modelState(m.id);
        if (!live) return;
        setStates(st);
        if (!src) { setError('Esta composición no tiene una foto que recortar.'); setPhase('error'); return; }
        let px = await decodeSource(src);
        if (!px) {
          // video or sequence: the frame at the playhead, at the project's size
          px = await host.sourcePixels();
          if (px) setHint('Es un video: se recorta el cuadro actual.');
        }
        if (!live) return;
        if (!px) { setError('No se pudo leer la foto de esta capa.'); setPhase('error'); return; }
        pixels.current = px;
        const sug = cut.suggestCutout(px);
        const usable = (id: CutoutModelId) => c.models.find(m => m.id === id)?.available;
        const pick: CutoutModelId = sug.model === 'portrait' && usable('portrait') ? 'portrait' : usable('subject') ? 'subject' : usable('portrait') ? 'portrait' : 'subject';
        setModel(pick);
        setHint(h => h || (sug.model === 'select' ? sug.text.replace('«Seleccionar objeto»', 'la herramienta «Objeto»') : sug.text));
        setPhase('choose');
      } catch (e) {
        if (!live) return;
        setError((e as Error)?.message || 'No se pudo preparar el recorte.');
        setPhase('error');
      }
    })();
    return () => { live = false; abort.current?.abort(); };
  }, [src?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  cutoutPanelQA.state = () => phase;

  /* ---------------------------------------------------------------- running */

  async function start() {
    const cut = await cutout();
    const st = await cut.modelState(model);
    if (st === 'absent' || st === 'error') {
      const c = await cut.consentInfo(model);
      setConsent({ name: c.name, size: c.size, text: c.text, licence: c.licence, note: c.note, from: c.from });
      setPhase('consent');
      host.say(`Hace falta descargar «${c.name}» (${c.size}). Nada se descarga sin tu permiso.`);
      return;
    }
    await run();
  }

  async function download() {
    const cut = await cutout();
    const ac = new AbortController();
    abort.current = ac;
    setPhase('downloading');
    setProgress({ p: 0, label: 'Empezando la descarga…' });
    try {
      await cut.downloadModel(model, { signal: ac.signal, onProgress: setProgress });
      setStates(s => ({ ...s, [model]: 'cached' }));
      await run();
    } catch (e) {
      const aborted = ac.signal.aborted || (e as { code?: string })?.code === 'aborted';
      setPhase('consent');
      setError(aborted ? '' : (e as Error)?.message || 'La descarga falló.');
      host.say(aborted ? 'Descarga cancelada: no se guardó nada.' : 'La descarga falló.');
    }
  }

  async function run() {
    const cut = await cutout();
    const px = pixels.current;
    if (!px) return;
    const ac = new AbortController();
    abort.current = ac;
    setPhase('running');
    setProgress({ p: null, label: 'Recortando en este equipo…' });
    host.say('Recortando… la foto no sale de tu equipo.');
    try {
      const t0 = performance.now();
      const m = await cut.removeBackground(px, { model: model as 'subject' | 'subject-hq' | 'portrait', signal: ac.signal, onProgress: setProgress });
      const ms = performance.now() - t0;
      const t = cut.cutoutTimings(m);
      const backend = t ? `${t.backend === 'webgpu' ? 'WebGPU' : 'WASM'}${t.backend !== 'webgpu' ? `, ${t.threads} ${t.threads === 1 ? 'hilo' : 'hilos'}` : ''}` : '';
      cutoutPanelQA.last = { model, ms: Math.round(ms), w: m.w, h: m.h, backend };
      setTiming(`Recortado en ${(ms / 1000).toFixed(1).replace('.', ',')} s en este equipo${backend ? ` (${backend})` : ''}.`);
      base.current = m;
      edited.current = { w: m.w, h: m.h, alpha: new Uint8ClampedArray(m.alpha) };
      history.current = [];
      setEdits(0);
      recompute(true);
      setStates(s => ({ ...s, [model]: 'ready' }));
      setPhase('refine');
      host.say('Recorte listo: revisa los bordes y elige qué hacer con él.');
    } catch (e) {
      const aborted = ac.signal.aborted || (e as { code?: string })?.code === 'aborted';
      setPhase('choose');
      setError(aborted ? '' : (e as Error)?.message || 'No se pudo recortar.');
      host.say(aborted ? 'Recorte cancelado.' : 'No se pudo recortar.');
    }
  }

  /* ---------------------------------------------------------------- refinement and preview */

  const recomputeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function recompute(now = false, o: RefineOptions = refine) {
    if (recomputeTimer.current) clearTimeout(recomputeTimer.current);
    const go = async () => {
      const cut = await cutout();
      const px = pixels.current, e = edited.current;
      if (!px || !e) return;
      refined.current = cut.refineMatte(px, e, o);
      cutImg.current = cut.cutoutImageData(px, refined.current, { decontaminate: o.decontaminate });
      const c = (cutCanvas.current ??= document.createElement('canvas'));
      c.width = e.w; c.height = e.h;
      c.getContext('2d')!.putImageData(cutImg.current, 0, 0);
      setTick(t => t + 1);
    };
    if (now) void go();
    else recomputeTimer.current = setTimeout(() => void go(), 140);
  }

  const setR = (patch: Partial<RefineOptions>) => { const next = { ...refine, ...patch }; setRefine(next); recompute(false, next); };

  // draw the preview
  useEffect(() => {
    const v = view.current, px = pixels.current;
    if (!v || !px) return;
    const w = Math.min(px.width, 960), h = Math.round((px.height * w) / px.width);
    if (v.width !== w || v.height !== h) { v.width = w; v.height = h; }
    const x = v.getContext('2d')!;
    x.clearRect(0, 0, w, h);
    if (bg === 'checker') {
      const s = 12;
      for (let yy = 0; yy < h; yy += s) for (let xx = 0; xx < w; xx += s) { x.fillStyle = ((xx / s + yy / s) & 1) ? '#cfc9bf' : '#f2ecdf'; x.fillRect(xx, yy, s, s); }
    } else {
      x.fillStyle = bg === 'light' ? '#f2ecdf' : bg === 'dark' ? '#0c0b0a' : '#00d15f';
      x.fillRect(0, 0, w, h);
    }
    x.imageSmoothingQuality = 'high';
    if (before || phase !== 'refine' || !cutCanvas.current) x.drawImage(px, 0, 0, w, h);
    else x.drawImage(cutCanvas.current, 0, 0, w, h);
  }, [tick, bg, before, phase]);

  /* ---------------------------------------------------------------- brushes and colours on the matte */

  const toSrc = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), px = pixels.current!;
    return { x: ((e.clientX - r.left) / r.width) * px.width, y: ((e.clientY - r.top) / r.height) * px.height };
  };

  const pushHistory = () => {
    if (!edited.current) return;
    history.current.push(new Uint8ClampedArray(edited.current.alpha));
    if (history.current.length > 10) history.current.shift();
    setEdits(history.current.length);
  };

  /** Paints a segment on the edited matte and patches the preview in the touched rectangle (fast while painting). */
  async function paint(a: { x: number; y: number }, b: { x: number; y: number }) {
    const cut = await cutout();
    const e = edited.current, r = refined.current, img = cutImg.current, px = pixels.current;
    if (!e || !r || !img || !px) return;
    const mode = tool === 'keep' ? 'keep' : 'remove';
    let dirty: { x: number; y: number; w: number; h: number } | null = null;
    cut.applyBrush(e, [a, b], mode, brush.size, brush.hardness, { inPlace: true });
    cut.applyBrush(r, [a, b], mode, brush.size, brush.hardness, { inPlace: true, dirty: d => { dirty = d; } });
    const d = dirty as { x: number; y: number; w: number; h: number } | null;
    if (!d) return;
    const sx = px.getContext('2d', { willReadFrequently: true })!.getImageData(d.x, d.y, d.w, d.h).data;
    for (let yy = 0; yy < d.h; yy++) for (let xx = 0; xx < d.w; xx++) {
      const i = (d.y + yy) * img.width + d.x + xx, o = i * 4, so = (yy * d.w + xx) * 4;
      if (img.data[o + 3] === 0 && r.alpha[i] > 0) { img.data[o] = sx[so]; img.data[o + 1] = sx[so + 1]; img.data[o + 2] = sx[so + 2]; }
      img.data[o + 3] = r.alpha[i];
    }
    cutCanvas.current?.getContext('2d')!.putImageData(img, 0, 0, d.x, d.y, d.w, d.h);
    setTick(t => t + 1);
  }

  async function pickColor2(p: { x: number; y: number }) {
    const cut = await cutout();
    const px = pixels.current, e = edited.current;
    if (!px || !e) return;
    const data = px.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, px.width, px.height).data;
    const c = pickColor(data, px.width, px.height, p.x, p.y, 1);
    if (!c) return;
    pushHistory();
    const cm = cut.matteFromColor(px, c, colorOpts.tol, colorOpts.soft);
    edited.current = cut.combineMattes(e, cm, tool === 'color-remove' ? 'subtract' : 'add');
    recompute(true);
    host.say(`${tool === 'color-remove' ? 'Quitado' : 'Añadido'} el color ${toHex(c)} del recorte`);
  }

  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'refine' || tool === 'none' || before) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toSrc(e);
    if (tool === 'color-add' || tool === 'color-remove') { void pickColor2(p); return; }
    pushHistory();
    stroke.current = { lazy: new LazyBrush(p, brush.size * 0.15), last: p };
    void paint(p, p);
  };
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const s = stroke.current;
    if (!s) return;
    if (s.lazy.update(toSrc(e))) { const b = { ...s.lazy.brush }; void paint(s.last, b); s.last = b; }
  };
  const onUp = () => { if (stroke.current) { stroke.current = null; recompute(); } };

  const undoEdit = () => {
    const prev = history.current.pop();
    if (!prev || !edited.current) return;
    edited.current = { ...edited.current, alpha: prev };
    setEdits(history.current.length);
    recompute(true);
  };

  /* ---------------------------------------------------------------- applying and exporting */

  async function apply() {
    const cut = await cutout();
    const px = pixels.current, r = refined.current;
    if (!px || !r || !src) return;
    setPhase('applying');
    try {
      const matteCanvas = cut.matteToCanvas(r, 'gray');
      const [matteBlob, cutoutBlob] = await Promise.all([cut.matteBlob(r), cut.cutoutBlob(px, r, { decontaminate: refine.decontaminate })]);
      const choice = { layer: what !== 'mask', mask: what === 'layer' ? null : maskKind };
      const res = await applyCutout({ source: src, targetId, matte: r, matteBlob, cutoutBlob, matteCanvas, refine }, choice);
      const parts: string[] = [];
      if (res.layer) parts.push('una capa nueva con el recorte');
      if (res.masked) parts.push(`una máscara ${maskKind === 'background' ? 'del fondo' : 'del sujeto'} en «${targetLayer?.name ?? 'la capa'}»`);
      host.say(`Hecho: ${parts.join(' y ')}. Un paso de deshacer lo quita.`);
      onClose();
    } catch (e) {
      setError((e as Error)?.message || 'No se pudo aplicar el recorte.');
      setPhase('refine');
    }
  }

  async function save(kind: 'png' | 'matte') {
    const cut = await cutout();
    const px = pixels.current, r = refined.current;
    if (!px || !r) return;
    const blob = kind === 'png' ? await cut.cutoutBlob(px, r, { decontaminate: refine.decontaminate }) : await cut.matteBlob(r);
    const name = (src?.name || 'foto').replace(/\.[A-Za-z0-9]{1,5}$/, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = kind === 'png' ? `glyphos-${name}-recorte.png` : `glyphos-${name}-mascara.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    host.say(kind === 'png' ? 'PNG transparente descargado' : 'Máscara descargada (blanco = sujeto)');
  }

  /* ---------------------------------------------------------------- UI */

  const models = (caps?.models ?? []).filter(m => m.id !== 'select');
  const chosen = models.find(m => m.id === model);
  const busy = phase === 'downloading' || phase === 'running' || phase === 'applying';

  const isVideo = src?.kind === 'video';
  return (
    <div className="cp" data-phase={phase}>
      <p className="cp-lead">El recorte ocurre en este equipo: tu {isVideo ? 'video' : 'foto'} no se sube.{src ? <> {isVideo ? 'Video' : 'Foto'}: <span className="tool-mono">{src.name || 'sin nombre'}</span>.</> : null}</p>
      {isVideo && src ? <VideoCutout host={host} source={src} onBusy={setVideoBusy} onClose={onClose} /> : null}
      {isVideo && !videoBusy && phase !== 'loading' && phase !== 'error' ? <h3 className="cp-frame-h">Sólo el cuadro actual</h3> : null}
      {videoBusy ? null : <>
      {error ? <Note tone="warn">{error}</Note> : null}

      {phase === 'loading' ? <Progress value={null} label="Mirando qué puede hacer este equipo…" /> : null}

      {(phase === 'choose' || phase === 'consent' || phase === 'downloading' || phase === 'running') && caps ? (
        <section className="cp-sec" aria-labelledby="cp-models">
          <h3 id="cp-models">Modelo</h3>
          <div className="cp-models" role="radiogroup" aria-labelledby="cp-models">
            {models.map(m => (
              <label key={m.id} className={'cp-model' + (m.available ? '' : ' off') + (m.id === model ? ' on' : '')} data-model={m.id}>
                <input type="radio" name="cp-model" value={m.id} checked={m.id === model} disabled={!m.available || busy} onChange={() => { setModel(m.id); setPhase('choose'); setConsent(null); }} />
                <span className="cp-mname">{m.name} <span className="tool-mono">{m.bytes ? `${Math.round(m.bytes / 1e6)} MB` : ''}{m.available ? ` · ${m.backend === 'webgpu' ? 'WebGPU' : 'WASM'}` : ''}</span></span>
                <span className="cp-mblurb">{m.blurb}</span>
                {!m.available ? <span className="cp-why">{m.why}</span> : m.note ? <span className="cp-why">{m.note}</span> : null}
                <span className="cp-state">{states[m.id] === 'cached' || states[m.id] === 'ready' ? 'Descargado en este navegador' : m.available ? 'Sin descargar' : 'No disponible aquí'}</span>
              </label>
            ))}
          </div>
          {hint ? <Note tone="quiet">{hint}</Note> : null}
          {phase === 'choose' ? (
            <Row><Button primary disabled={!chosen?.available} onClick={() => void start()}>Recortar</Button></Row>
          ) : null}
        </section>
      ) : null}

      {phase === 'consent' && consent ? (
        <section className="tool-consent cp-consent" aria-labelledby="cp-consent-h" role="dialog" aria-modal="false">
          <h3 id="cp-consent-h">¿Descargar «{consent.name}» ({consent.size})?</h3>
          <p>Se descarga una sola vez desde {consent.from} y queda guardado en este navegador.</p>
          <p>{consent.text}</p>
          <Note tone="quiet">Licencia: {consent.licence}.</Note>
          {consent.note ? <Note tone="warn">{consent.note}</Note> : null}
          <Row>
            <Button onClick={() => { setPhase('choose'); host.say('Sin descarga.'); }}>Ahora no</Button>
            <Button primary onClick={() => void download()}>Descargar {consent.size} y recortar</Button>
          </Row>
        </section>
      ) : null}

      {busy ? (
        <section className="cp-sec" aria-live="polite">
          <Progress value={progress.p} label={progress.label || (phase === 'applying' ? 'Guardando…' : 'Trabajando…')} />
          {phase !== 'applying' ? <Row><Button onClick={() => abort.current?.abort()}>Cancelar</Button></Row> : null}
        </section>
      ) : null}

      {phase === 'loading' || phase === 'error' ? null : (
        <section className="cp-sec cp-previewsec" aria-label="Vista previa del recorte">
          <div className="cp-view">
            <canvas
              ref={view} className={'cp-canvas' + (tool !== 'none' && phase === 'refine' ? ' paint' : '')}
              role="img" aria-label={before ? 'La foto original' : 'El recorte sobre el fondo elegido'}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            />
          </div>
          {phase === 'refine' ? (
            <Row label="Fondo de la vista previa">
              <Segmented<Bg> label="Fondo" value={bg} options={[{ value: 'checker', label: 'Cuadros' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }, { value: 'contrast', label: 'Contraste' }]} onChange={setBg} />
              <Segmented label="Comparar" value={before ? 'antes' : 'despues'} options={[{ value: 'antes', label: 'Antes' }, { value: 'despues', label: 'Después' }]} onChange={v => setBefore(v === 'antes')} />
            </Row>
          ) : null}
          {timing && phase === 'refine' ? <Note tone="quiet">{timing}</Note> : null}
        </section>
      )}

      {phase === 'refine' || phase === 'applying' ? (
        <>
          <section className="cp-sec" aria-labelledby="cp-edge">
            <h3 id="cp-edge">Bordes</h3>
            <div className="tool-opts cp-stack">
              <Slider wide label="Suavizar" value={refine.feather} min={0} max={20} step={0.5} format={px} onChange={v => setR({ feather: v })} hint="Difumina el borde del recorte" />
              <Slider wide label="Desplazar" value={refine.shift} min={-12} max={12} step={0.5} format={v => `${v > 0 ? '+' : ''}${v} px`} onChange={v => setR({ shift: v })} hint="Negativo encoge el recorte (quita halos); positivo lo agranda" />
              <Slider wide label="Descontaminar" value={refine.decontaminate} min={0} max={1} step={0.05} format={pct} onChange={v => setR({ decontaminate: v })} hint="Quita el color del fondo viejo de los bordes semitransparentes (pelo)" />
              <Slider wide label="Detalle" value={refine.detail} min={0} max={1} step={0.05} format={pct} onChange={v => setR({ detail: v })} hint="Una pasada extra que sigue los bordes finos de la foto" />
            </div>
          </section>

          <section className="cp-sec" aria-labelledby="cp-touch">
            <h3 id="cp-touch">Retoques</h3>
            <div className="tool-opts">
              <Segmented<EditTool> label="Retoque" value={tool} options={[
                { value: 'none', label: 'Ver' }, { value: 'keep', label: 'Conservar', title: 'Pinta lo que debe quedarse' }, { value: 'remove', label: 'Quitar', title: 'Pinta lo que debe irse' },
                { value: 'color-remove', label: 'Quitar color', title: 'Toca un color del fondo que sobra' }, { value: 'color-add', label: 'Añadir color', title: 'Toca un color del sujeto que falta' },
              ]} onChange={setTool} />
              {tool === 'keep' || tool === 'remove' ? (
                <>
                  <Slider label="Tamaño" value={brush.size} min={4} max={200} step={1} format={px} onChange={v => setBrush(b => ({ ...b, size: v }))} />
                  <Slider label="Dureza" value={brush.hardness} min={0} max={1} step={0.05} format={pct} onChange={v => setBrush(b => ({ ...b, hardness: v }))} />
                </>
              ) : tool === 'color-add' || tool === 'color-remove' ? (
                <>
                  <Slider label="Tolerancia" value={colorOpts.tol} min={0} max={0.5} step={0.01} format={pct} onChange={v => setColorOpts(c => ({ ...c, tol: v }))} />
                  <Slider label="Suavidad" value={colorOpts.soft} min={0} max={0.3} step={0.01} format={pct} onChange={v => setColorOpts(c => ({ ...c, soft: v }))} />
                </>
              ) : null}
              <Button disabled={!edits} onClick={undoEdit}>Deshacer retoque</Button>
            </div>
            <Note tone="quiet">El pelo suelto y los bordes muy finos pueden necesitar retoques con «Conservar» y un pincel suave.</Note>
          </section>

          <section className="cp-sec" aria-labelledby="cp-use">
            <h3 id="cp-use">Usar el recorte</h3>
            <div className="tool-opts">
              <Segmented<What> label="Qué hacer" value={what} options={[{ value: 'layer', label: 'Capa nueva' }, { value: 'mask', label: 'Máscara' }, { value: 'both', label: 'Las dos' }]} onChange={setWhat} />
              {what !== 'layer' ? <Segmented<'subject' | 'background'> label="Máscara de" value={maskKind} options={[{ value: 'subject', label: 'Sujeto' }, { value: 'background', label: 'Fondo' }]} onChange={setMaskKind} /> : null}
            </div>
            <Note tone="quiet">
              {what === 'layer' ? 'Una capa con el sujeto recortado (transparencia real) encima de la capa elegida.' : ''}
              {what !== 'layer' ? `La capa «${targetLayer?.name ?? '—'}» se verá solo ${maskKind === 'subject' ? 'en el sujeto' : 'en el fondo'}.` : ''}
              {what === 'both' ? ' Y además una capa con el recorte.' : ''}
            </Note>
            <Row>
              <Button primary disabled={phase === 'applying' || (what !== 'layer' && !targetLayer)} onClick={() => void apply()}>
                {what === 'layer' ? 'Usar como capa' : what === 'mask' ? 'Aplicar como máscara' : 'Usar como capa y máscara'}
              </Button>
              <Button onClick={() => void save('png')}>PNG transparente</Button>
              <Button onClick={() => void save('matte')}>Máscara PNG</Button>
              <Button onClick={() => { setPhase('choose'); setTool('none'); }}>Otro modelo</Button>
            </Row>
          </section>
        </>
      ) : null}

      {phase === 'error' ? <Row><Button onClick={onClose}>Cerrar</Button></Row> : null}
      </>}
    </div>
  );
}
