/**
 * «Seguir objeto» (T): object tracking in a video, on the target layer's mask (src/video trackObject /
 * correctTrack: the point-selection model on keyframes, optical flow between them).
 *
 *   1. On a layer over a video, the person marks the object on the frame the playhead shows: taps are positive
 *      points (⌥ + click, the «Quitar» switch or a long press on touch: negative ones), a drag draws a box. The
 *      selection model (the same one as «Objeto», with the same consent before any download) shows the object's
 *      mask on that frame a moment after each change, so the person sees what will be followed.
 *   2. The stretch: from that frame to «Hasta» (by default the end of the layer's span, or of the video), with
 *      how often the model decides (precision) and an honest estimate of the time it takes here.
 *   3. «Seguir» runs it with progress and «Cancelar»; the result is ONE raster part {origin: 'track'} with a mask
 *      per frame on the target layer's mask (one undo step). Several tracked parts, on different layers with
 *      different styles, each follow their own object.
 *   4. «Corregir aquí»: on any frame of a track, new points there make that frame a keyframe and only the stretch
 *      between the keyframes around it is computed again (one undo step). The timeline shows each track's
 *      keyframes as ticks on the layer's row (a click goes there).
 *
 * Points are in the layer's own units (the frame before the layer's transform), like the object tool's.
 */
import { create } from 'zustand';
import type { SelectSession, Matte } from '../../cutout';
import { videoSourcesInOrder } from '../../video/audioplan';
import { keysOfFrames, roleOf } from '../../video/keys';
import { useProject } from '../../project/store';
import type { Id, Layer, MaskOp, MaskRasterPart, Project, Source } from '../../project/types';
import { ModelConsent, cutout, selectModelState, type ConsentFacts } from './consent';
import { dist, type Pt } from './geom';
import * as draw from './overlay';
import { type ObjectPoint } from './state';
import { OP_NAME, addPart, canvasSize, editableTarget, layerById, layerPoint, partsOf, rasterPart, replacePart, screenOf, tabCoverage } from './target';
import type { Tool, ToolHost } from './types';
import { Button, Note, Progress, Segmented, Slider, Switch } from './ui';

type Video = typeof import('../../video/index');
let videoP: Promise<Video> | null = null;
const videoMod = () => (videoP ??= import('../../video/index'));
let video: Video | null = null;

const ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3.5" y="9" width="6" height="6" stroke-dasharray="2 1.6"/><rect x="14.5" y="6" width="6" height="6"/><path d="M9.5 12c2 0 3-1.5 5-3" stroke-dasharray="1.6 1.8"/><path d="M4 19.5h16"/><path d="M6.5 18v3M12 18v3M17.5 18v3"/></svg>';

/* ------------------------------------------------------------------ state (the options bar follows it) */

export type Precision = 'alta' | 'normal' | 'rapida';
const KEY_EVERY: Record<Precision, number> = { alta: 0.25, normal: 0.5, rapida: 1 };

export interface TrackToolState {
  phase: 'idle' | 'novideo' | 'consent' | 'downloading' | 'encoding' | 'ready' | 'busy' | 'running' | 'error';
  /** Marking a new track, or a correction of the track part `fix` of the target layer. */
  mode: 'new' | 'fix';
  fix: number | null;
  points: ObjectPoint[];
  box: { x: number; y: number; w: number; h: number } | null;
  positive: boolean;
  /** The time of the frame the points are on (null: nothing marked yet). */
  at: number | null;
  /** End of the stretch (null: the default, the layer's span end or the video's). */
  end: number | null;
  precision: Precision;
  progress: number | null;
  label: string;
  consent: ConsentFacts | null;
  error: string | null;
  /** The model's mask of the marked frame is showing. */
  matte: boolean;
}

const initial = (): TrackToolState => ({
  phase: 'idle', mode: 'new', fix: null, points: [], box: null, positive: true, at: null, end: null, precision: 'normal',
  progress: null, label: '', consent: null, error: null, matte: false,
});

export const useTrackTool = create<TrackToolState>(initial);
const st = () => useTrackTool.getState();
const set = (patch: Partial<TrackToolState>) => useTrackTool.setState(patch);

/* ------------------------------------------------------------------ what it works on */

const P = () => useProject.getState();

/** The video a layer's track follows: its own source when it is a video, else the bottom-most video at or under it. */
export function videoFor(p: Project, layer: Layer | null): Source | null {
  if (layer && 'source' in layer) {
    const s = p.sources.find(x => x.id === layer.source);
    if (s?.kind === 'video') return s;
  }
  const at = layer ? p.layers.findIndex(l => l.id === layer.id) : p.layers.length - 1;
  const under = videoSourcesInOrder({ ...p, layers: p.layers.slice(0, at + 1) });
  return under[0] ?? videoSourcesInOrder(p)[0] ?? null;
}

/** Default end of a stretch: the layer's span end, else the project's length (the video, as the project shows it). */
export function defaultEnd(p: Project, layer: Layer | null): number {
  return Math.max(0, Math.min(p.time.duration, layer?.span?.out ?? p.time.duration));
}

/** The track parts of a layer's mask, with their index. */
export function trackParts(layer: Layer | null): Array<{ part: MaskRasterPart; index: number }> {
  return partsOf(layer).flatMap((part, index) => (part.kind === 'raster' && part.origin === 'track' && part.frames?.length ? [{ part, index }] : []));
}

/** Times of a track's keyframes (model decisions, corrections, hidden object) with their role, for the timeline. */
export function trackKeys(part: MaskRasterPart): Array<{ t: number; role: 'clave' | 'correccion' | 'oculto' | 'inicio' }> {
  const f = part.frames ?? [];
  return keysOfFrames(f).map(i => ({ t: f[i].t, role: roleOf(f[i].media.name) || 'inicio' }));
}

/** «0:01,2» */
export const fmtT = (s: number) => {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1).replace('.', ',')}`;
};

/* ------------------------------------------------------------------ the tool */

let session: SelectSession | null = null;
let sessionKey = '';
let encoding: Promise<void> | null = null;
let abort: AbortController | null = null;
let matte: Matte | null = null;
let edgeCanvas: HTMLCanvasElement | null = null;
let layerId: Id | null = null;
let op: MaskOp = 'add';
let debounce: ReturnType<typeof setTimeout> | null = null;
let decodeGen = 0;
let press: { s: Pt; p: Pt; touch: boolean; negative: boolean; timer: ReturnType<typeof setTimeout> | null; moved: boolean } | null = null;
let offTime: (() => void) | null = null;
let hostRef: ToolHost | null = null;
const round = (v: number) => Math.round(v * 1e5) / 1e5;

/** The key of the frame an analysis is for (source, time, size). */
const frameKey = (src: Source, host: ToolHost) => `${src.id}@${P().time}|${canvasSize(host).w}x${canvasSize(host).h}`;

function target(host: ToolHost): { layer: Layer; src: Source } | null {
  const p = P().project;
  const l = editableTarget(host, true);
  if (!p || !l) return null;
  const src = videoFor(p, l);
  return src ? { layer: l, src } : null;
}

async function ensureModel(host: ToolHost): Promise<boolean> {
  const m = await selectModelState();
  if (m.state === 'error') { set({ phase: 'error', error: m.error }); return false; }
  if (m.state === 'consent') {
    set({ phase: 'consent', consent: m.consent, error: m.error });
    host.say(`Para seguir objetos hace falta descargar el modelo «${m.consent.name}» (${m.consent.size}). Nada se descarga sin tu permiso.`);
    return false;
  }
  return true;
}

/** Analyses the frame at the playhead once (the model encodes it); taps before it ends wait for it. */
function analyse(host: ToolHost): Promise<void> {
  const tg = target(host);
  if (!tg) return Promise.resolve();
  const key = frameKey(tg.src, host);
  if (session && sessionKey === key) return Promise.resolve();
  if (encoding) return encoding;
  const job = (async () => {
    if (!(await ensureModel(host))) return;
    const cut = await cutout();
    session?.dispose();
    session = null;
    const ac = new AbortController();
    abort = ac;
    set({ phase: 'encoding', progress: null, label: 'Analizando este cuadro…', error: null });
    try {
      const px = host.videoPixels ? await host.videoPixels(tg.src.id, 1024) : await host.sourcePixels();
      if (!px) throw new Error('No se pudo leer este cuadro del video.');
      const s = await cut.selectObject(px, { signal: ac.signal, onProgress: p => set({ progress: p.p, label: p.label }) });
      if (ac.signal.aborted) { s.dispose(); return; }
      session = s;
      sessionKey = key;
      set({ phase: 'ready', progress: null, label: '' });
    } catch (e) {
      if (ac.signal.aborted || (e as { code?: string })?.code === 'aborted') { set({ phase: 'ready', progress: null, label: '' }); return; }
      set({ phase: 'error', error: (e as Error)?.message || 'No se pudo analizar este cuadro.', progress: null });
    } finally {
      if (abort === ac) abort = null;
    }
  })();
  encoding = job.finally(() => { encoding = null; });
  return encoding;
}

async function download(host: ToolHost) {
  const cut = await cutout();
  const ac = new AbortController();
  abort = ac;
  set({ phase: 'downloading', progress: 0, label: 'Empezando la descarga…', error: null });
  try {
    await cut.downloadModel('select', { signal: ac.signal, onProgress: p => set({ progress: p.p, label: p.label }) });
    set({ consent: null, phase: 'ready' });
    await analyse(host);
    if (st().points.length || st().box) schedule(host, 0);
  } catch (e) {
    if (ac.signal.aborted || (e as { code?: string })?.code === 'aborted') {
      set({ phase: 'consent', progress: null, label: '' });
      host.say('Descarga cancelada: no se guardó nada.');
    } else set({ phase: 'consent', error: (e as Error)?.message || 'La descarga falló.', progress: null });
  } finally {
    if (abort === ac) abort = null;
  }
}

function schedule(host: ToolHost, wait = 140) {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => { debounce = null; void decode(host); }, wait);
}

/** The object's mask on the marked frame, shown live in the composition (not in history). */
async function decode(host: ToolHost) {
  const o = st();
  const gen = ++decodeGen;
  if (!layerId || (!o.points.length && !o.box)) { matte = null; edgeCanvas = null; set({ matte: false }); host.preview(null); host.redrawOverlay(); return; }
  await analyse(host);
  const s = session;
  if (!s || gen !== decodeGen) return;
  set({ phase: 'busy' });
  try {
    const m = await s.mask(o.points.map(q => ({ x: q.x * s.w, y: q.y * s.h, positive: q.positive })), o.box ? { x: o.box.x * s.w, y: o.box.y * s.h, w: o.box.w * s.w, h: o.box.h * s.h } : undefined);
    if (gen !== decodeGen) return;
    matte = m;
    edgeCanvas = edges(m);
    const ref = await tabCoverage(m.alpha, m.w, m.h, 'seguimiento-cuadro.png');
    if (gen !== decodeGen) return;
    const fix = o.mode === 'fix' ? o.fix : null;
    const old = fix !== null ? partsOf(layerById(layerId))[fix] : null;
    host.preview({ layer: layerId, part: rasterPart(ref, old?.op ?? op, { origin: 'object' }), ...(fix !== null ? { replace: fix } : {}) });
    set({ matte: true });
    host.redrawOverlay();
  } catch (e) {
    if (gen === decodeGen) set({ error: (e as Error)?.message || 'No se pudo calcular el objeto.' });
  } finally {
    if (gen === decodeGen && st().phase === 'busy') set({ phase: 'ready' });
  }
}

function clearMarks(host: ToolHost, say = '') {
  if (debounce) { clearTimeout(debounce); debounce = null; }
  decodeGen++;
  matte = null;
  edgeCanvas = null;
  set({ points: [], box: null, at: null, matte: false, error: null });
  host.preview(null);
  if (say) host.say(say);
  host.redrawOverlay();
}

function setPoints(host: ToolHost, points: ObjectPoint[], box = st().box) {
  set({ points, box, at: points.length || box ? st().at ?? P().time : null });
  schedule(host);
  host.redrawOverlay();
}

/** Seconds of the stretch that would be followed now. */
export function stretchOf(p: Project, layer: Layer | null): { start: number; end: number } {
  const o = st();
  const start = Math.max(0, o.at ?? P().time, layer?.span?.in ?? 0);
  const end = Math.max(start + 1 / Math.max(1, p.time.fps), Math.min(p.time.duration, o.end ?? defaultEnd(p, layer)));
  return { start, end };
}

async function follow(host: ToolHost) {
  const tg = target(host);
  const p = P().project;
  const o = st();
  if (!tg || !p) { host.say('Elige una capa sobre un video.'); return; }
  if (!o.points.length && !o.box) { host.say('Marca el objeto primero: toca sobre él en este cuadro.'); return; }
  const v = (video ??= await videoMod());
  const { start, end } = stretchOf(p, tg.layer);
  const ac = new AbortController();
  abort = ac;
  // the analysis of this frame is not needed any more: the tracker opens the model on its own keyframes
  if (debounce) { clearTimeout(debounce); debounce = null; }
  decodeGen++;
  session?.dispose();
  session = null;
  sessionKey = '';
  host.preview(null);
  const partOp = op;
  set({ phase: 'running', progress: 0, label: 'Preparando el modelo…', error: null });
  host.say(`Siguiendo el objeto de ${fmtT(start)} a ${fmtT(end)}… el video no sale de tu equipo.`);
  try {
    const part = await v.trackObject(p, {
      source: tg.src.id, layer: tg.layer.id, points: o.points, ...(o.box ? { box: o.box } : {}), start, end, keyEvery: KEY_EVERY[o.precision],
      signal: ac.signal, onProgress: pr => set({ progress: pr.total ? pr.done / pr.total : null, label: pr.label }),
    });
    const stats = v.lastTrackStats();
    const done: MaskRasterPart = { ...part, op: partOp };
    const n = part.frames?.length ?? 0;
    const hidden = stats?.occluded ? ` En ${stats.occluded} ${stats.occluded === 1 ? 'clave' : 'claves'} el objeto parecía oculto: se mantuvo la máscara anterior (revísalo con «Corregir aquí»).` : '';
    const ok = addPart(host, tg.layer.id, done, `Seguimiento listo en «${tg.layer.name}»: ${n} cuadros, ${stats?.keyframes ?? 0} claves del modelo (${OP_NAME[partOp]}).${hidden}`);
    clearMarks(host);
    set({ phase: 'ready', progress: null, label: '' });
    if (!ok) set({ error: 'No se pudo añadir el seguimiento a la máscara.' });
  } catch (e) {
    const aborted = ac.signal.aborted || (e as Error)?.name === 'AbortError';
    set({ phase: 'ready', progress: null, label: '', error: aborted ? null : (e as Error)?.message || 'No se pudo seguir el objeto.' });
    host.say(aborted ? 'Seguimiento cancelado: no se añadió nada.' : (e as Error)?.message || 'No se pudo seguir el objeto.');
    if (!aborted) schedule(host, 0);
  } finally {
    if (abort === ac) abort = null;
  }
}

/** Where a correction at the playhead would land: the part, the frame and the stretch computed again. */
export function correctionAt(layer: Layer | null, fix: number | null, t: number): { part: MaskRasterPart; index: number; frame: number; from: number; to: number } | null {
  const list = trackParts(layer);
  const it = list.find(x => x.index === fix) ?? list[list.length - 1];
  if (!it) return null;
  const f = it.part.frames!;
  if (t < f[0].t - 1e-6 || t > f[f.length - 1].t + 0.5 / 30) return null;
  let frame = 0, d = Infinity;
  f.forEach((x, i) => { const e = Math.abs(x.t - t); if (e < d) { d = e; frame = i; } });
  const keys = keysOfFrames(f);
  if (!keys.includes(f.length - 1)) keys.push(f.length - 1);
  let prev = frame, next = frame;
  for (const k of keys) { if (k < frame) prev = k; else if (k > frame && next === frame) next = k; }
  return { part: it.part, index: it.index, frame, from: f[prev].t, to: f[next].t };
}

async function applyCorrection(host: ToolHost) {
  const tg = target(host);
  const p = P().project;
  const o = st();
  if (!tg || !p) return;
  const c = correctionAt(tg.layer, o.fix, o.at ?? P().time);
  if (!c) { host.say('Este cuadro está fuera del seguimiento: ve a un cuadro que siga el objeto.'); return; }
  if (!o.points.length) { host.say('Marca el objeto en este cuadro: al menos un punto.'); return; }
  const v = (video ??= await videoMod());
  const ac = new AbortController();
  abort = ac;
  if (debounce) { clearTimeout(debounce); debounce = null; }
  decodeGen++;
  host.preview(null);
  set({ phase: 'running', progress: 0, label: 'Corrigiendo el cuadro…', error: null });
  try {
    const np = await v.correctTrack(p, c.part, { t: o.at ?? P().time, points: o.points }, {
      source: tg.src.id, layer: tg.layer.id, signal: ac.signal, onProgress: pr => set({ progress: pr.total ? pr.done / pr.total : null, label: pr.label }),
    });
    const ok = replacePart(tg.layer.id, c.index, { ...np, op: c.part.op, soft: c.part.soft, alpha: c.part.alpha, ...(c.part.off ? { off: true } : {}) });
    clearMarks(host);
    set({ phase: 'ready', mode: 'new', fix: null, progress: null, label: '' });
    host.say(ok ? `Corregido en ${fmtT(c.part.frames![c.frame].t)}: se recalculó sólo de ${fmtT(c.from)} a ${fmtT(c.to)}.` : 'No se pudo guardar la corrección.');
  } catch (e) {
    const aborted = ac.signal.aborted || (e as Error)?.name === 'AbortError';
    set({ phase: 'ready', progress: null, label: '', error: aborted ? null : (e as Error)?.message || 'No se pudo corregir.' });
    host.say(aborted ? 'Corrección cancelada.' : (e as Error)?.message || 'No se pudo corregir.');
  } finally {
    if (abort === ac) abort = null;
  }
}

function startFix(host: ToolHost, index: number | null) {
  const l = layerById(host.target());
  const c = correctionAt(l, index, P().time);
  if (!c) { host.say('Ve a un cuadro del seguimiento (las marcas de la línea de tiempo) para corregirlo.'); return; }
  clearMarks(host);
  set({ mode: 'fix', fix: c.index, at: P().time });
  host.say(`Corrigiendo en ${fmtT(P().time)}: toca el objeto en este cuadro (⌥ + clic: lo que no es) y pulsa «Aplicar la corrección».`);
  void analyse(host);
}

function stopFix(host: ToolHost) {
  clearMarks(host);
  set({ mode: 'new', fix: null });
}

/** Follows the playhead: marks belong to one frame, so moving it starts over there. */
function watchTime(host: ToolHost) {
  offTime?.();
  offTime = useProject.subscribe((s, prev) => {
    if (s.time === prev.time) return;
    const o = st();
    if (o.phase === 'running') return;
    if (o.points.length || o.box) clearMarks(host, o.mode === 'fix' ? 'Otro cuadro: marca el objeto de nuevo aquí para corregirlo.' : 'Otro cuadro: marca el objeto de nuevo en este.');
    if (o.mode === 'fix') set({ at: s.time });
  });
}

export const trackTool: Tool & { state: () => TrackToolState } = {
  id: 'seguir',
  name: 'Seguir objeto',
  hint: 'En un video: toca el objeto en este cuadro (⌥ + clic marca lo que no es; arrastra para un recuadro), elige hasta dónde y pulsa «Seguir». En cualquier cuadro, «Corregir aquí» arregla el seguimiento. En teléfono: toca; mantén pulsado (o el interruptor «Quitar») para marcar lo que no es.',
  shortcut: 'T',
  group: 'objeto',
  icon: ICON,
  cursor: 'crosshair',
  draws: true,
  state: st,

  activate(host) {
    hostRef = host;
    const p = P().project;
    const l = editableTarget(host, true);
    layerId = l?.id ?? null;
    set({ mode: 'new', fix: null, error: null });
    if (!p || !videoFor(p, l)) { set({ phase: 'novideo' }); return; }
    set({ phase: 'idle' });
    void videoMod().then(m => { video = m; useTrackTool.setState({}); });
    watchTime(host);
    void ensureModel(host).then(ok => { if (ok && hostRef === host) void analyse(host); });
  },

  deactivate(host) {
    abort?.abort();
    offTime?.();
    offTime = null;
    if (debounce) clearTimeout(debounce);
    debounce = null;
    decodeGen++;
    host.preview(null);
    matte = null;
    edgeCanvas = null;
    session?.dispose();
    session = null;
    sessionKey = '';
    hostRef = null;
    useTrackTool.setState({ ...initial(), precision: st().precision, positive: st().positive });
  },

  down(e, host) {
    const l = editableTarget(host);
    if (!l) return;
    const p = P().project;
    if (!p || !videoFor(p, l)) { set({ phase: 'novideo' }); host.say('Esta capa no está sobre un video: el seguimiento necesita uno.'); return; }
    if (layerId !== l.id) { clearMarks(host); set({ mode: 'new', fix: null }); layerId = l.id; }
    const o = st();
    if (o.phase === 'running') { host.say('Espera a que termine (o cancela) antes de marcar otra cosa.'); return; }
    if (o.phase === 'consent' || o.phase === 'downloading' || o.phase === 'error') { host.say('Primero descarga el modelo de selección (en las opciones).'); return; }
    if (!o.points.length && !o.box && o.mode === 'new') op = host.op();
    const touch = e.pointerType === 'touch';
    press = { s: e.s, p: layerPoint(host, e.p), touch, negative: e.alt || !o.positive, timer: null, moved: false };
    if (touch) {
      press.timer = setTimeout(() => {
        if (press && !press.moved) { press.negative = true; host.say('Punto negativo: lo que no es parte del objeto'); host.redrawOverlay(); }
      }, 520);
    }
    void analyse(host);
    host.redrawOverlay();
  },

  move(e, host) {
    if (!press) return;
    if (!press.moved && dist(e.s, press.s) > (press.touch ? 12 : 6)) { press.moved = true; if (press.timer) clearTimeout(press.timer); }
    if (press.moved && st().mode === 'new') {
      const b = layerPoint(host, e.p), a = press.p;
      set({ box: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }, at: st().at ?? P().time });
      host.redrawOverlay();
    }
  },

  up(_e, host) {
    const pr = press;
    press = null;
    if (!pr) return;
    if (pr.timer) clearTimeout(pr.timer);
    if (pr.moved) {
      const b = st().box;
      if (b && b.w * canvasSize(host).w > 6 && b.h * canvasSize(host).h > 6) { host.say('Recuadro marcado'); schedule(host); }
      else set({ box: null });
      host.redrawOverlay();
      return;
    }
    const pts = [...st().points, { x: round(pr.p.x), y: round(pr.p.y), positive: !pr.negative }];
    host.say(pr.negative ? `Punto ${pts.length}: no es parte del objeto` : `Punto ${pts.length}: parte del objeto`);
    setPoints(host, pts);
  },

  cancel(host) {
    if (press?.timer) clearTimeout(press.timer);
    press = null;
    host.redrawOverlay();
  },

  onKey(e, host) {
    const o = st();
    if (e.key === 'Enter' && (o.points.length || o.box) && o.phase !== 'running') {
      void (o.mode === 'fix' ? applyCorrection(host) : follow(host));
      return true;
    }
    if (e.key === 'Escape') {
      if (abort) { abort.abort(); return true; }
      if (o.points.length || o.box) { clearMarks(host, 'Puntos borrados'); return true; }
      if (o.mode === 'fix') { stopFix(host); return true; }
      return false;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && o.points.length) { setPoints(host, o.points.slice(0, -1)); host.say('Último punto quitado'); return true; }
    return false;
  },

  overlay(ctx, host) {
    if (layerId !== host.target()) return;
    const f = host.view().frame;
    const o = st();
    if (edgeCanvas && matte && o.matte) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(edgeCanvas, f.x, f.y, f.w, f.h);
      ctx.restore();
    }
    const scr = screenOf(host);
    if (o.box) {
      const a = scr({ x: o.box.x, y: o.box.y }), b = scr({ x: o.box.x + o.box.w, y: o.box.y + o.box.h });
      draw.quad(ctx, [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], { dash: [5, 4] });
    }
    o.points.forEach((q, i) => pointMark(ctx, scr(q), q.positive, i + 1));
    if (press && !press.moved) pointMark(ctx, scr(press.p), !press.negative, o.points.length + 1, true);
    if (o.phase === 'encoding' || o.phase === 'downloading') draw.tag(ctx, { x: f.x + f.w / 2, y: f.y + 24 }, o.label || 'Preparando…', { align: 'center' });
    if (o.phase === 'running') draw.tag(ctx, { x: f.x + f.w / 2, y: f.y + 24 }, o.label || 'Siguiendo…', { align: 'center' });
  },

  Options: ({ host }) => <TrackOptions host={host} />,
};

/** A positive point: bone disc with an ink ring and «+»; a negative one: ink disc with a bone ring and «−» (as «Objeto»). */
function pointMark(ctx: CanvasRenderingContext2D, p: Pt, positive: boolean, n: number, active = false) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = positive ? draw.BONE : draw.INK;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = active ? draw.SIGNAL : positive ? draw.INK : draw.BONE;
  ctx.stroke();
  ctx.strokeStyle = positive ? draw.INK : draw.BONE;
  ctx.beginPath();
  ctx.moveTo(p.x - 3.5, p.y); ctx.lineTo(p.x + 3.5, p.y);
  if (positive) { ctx.moveTo(p.x, p.y - 3.5); ctx.lineTo(p.x, p.y + 3.5); }
  ctx.stroke();
  ctx.restore();
  draw.tag(ctx, { x: p.x + 10, y: p.y - 12 }, String(n));
}

/** The mask's outline (and a faint veil inside), at ≤ 640 px, for the overlay. */
function edges(m: Matte): HTMLCanvasElement {
  const k = Math.min(1, 640 / Math.max(m.w, m.h));
  const w = Math.max(1, Math.round(m.w * k)), h = Math.max(1, Math.round(m.h * k));
  const at = (x: number, y: number) => m.alpha[Math.min(m.h - 1, Math.floor(y / k)) * m.w + Math.min(m.w - 1, Math.floor(x / k))] >= 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const img = x.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let xx = 0; xx < w; xx++) {
      const o = (y * w + xx) * 4;
      const on = at(xx, y);
      const edge = on && (!at(xx - 1, y) || !at(xx + 1, y) || !at(xx, y - 1) || !at(xx, y + 1) || xx === 0 || y === 0 || xx === w - 1 || y === h - 1);
      if (edge) { d[o] = 237; d[o + 1] = 230; d[o + 2] = 218; d[o + 3] = 255; }
      else if (on) { d[o] = 237; d[o + 1] = 230; d[o + 2] = 218; d[o + 3] = 34; }
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

/* ------------------------------------------------------------------ the options bar */

function TrackOptions({ host }: { host: ToolHost }) {
  const o = useTrackTool();
  const project = useProject(s => s.project);
  const time = useProject(s => s.time);
  const sel = useProject(s => s.selection[0] ?? null);
  const layer = project?.layers.find(l => l.id === sel) ?? null;
  const src = project ? videoFor(project, layer) : null;
  const tracks = trackParts(layer);
  if (!project) return null;
  if (o.phase === 'novideo' || !src) {
    return (
      <div className="tool-opts" data-tool="seguir">
        <span className="tool-title">Seguir objeto</span>
        <Note tone="quiet">{layer ? `«${layer.name}» no está sobre un video: el seguimiento funciona en proyectos con video (ábrelo, o añádelo como capa).` : 'Elige una capa sobre el video: el seguimiento dibuja su máscara.'}</Note>
      </div>
    );
  }
  if (o.phase === 'consent' && o.consent) {
    return <ModelConsent c={o.consent} error={o.error} purpose="seguir un objeto en el video" title="Seguir objeto" tool="seguir" host={host} onDownload={() => void download(host)} />;
  }
  if (o.phase === 'error') {
    return (
      <div className="tool-opts" data-tool="seguir">
        <span className="tool-title">Seguir objeto</span>
        <Note tone="warn">{o.error}</Note>
        <Button onClick={() => { set({ phase: 'idle', error: null }); void analyse(host); }}>Reintentar</Button>
      </div>
    );
  }
  if (o.phase === 'running' || o.phase === 'downloading' || (o.phase === 'encoding' && !o.points.length && !o.box)) {
    return (
      <div className="tool-opts" data-tool="seguir">
        <span className="tool-title">{o.mode === 'fix' ? 'Corregir el seguimiento' : 'Seguir objeto'}</span>
        <Progress value={o.progress} label={o.label || (o.phase === 'downloading' ? 'Descargando…' : o.phase === 'encoding' ? 'Analizando este cuadro…' : 'Siguiendo…')} />
        <Button onClick={() => abort?.abort()} kbd="Esc">Cancelar</Button>
      </div>
    );
  }
  const marked = o.points.length > 0 || !!o.box;
  const pointsList = o.points.length ? (
    <ul className="tool-points" aria-label="Puntos">
      {o.points.map((p, i) => (
        <li key={i}>
          <span className={p.positive ? 'pos' : 'neg'}>{i + 1} {p.positive ? '+' : '−'}</span>
          <Button label={`Quitar el punto ${i + 1}`} title={`Quitar el punto ${i + 1}`} onClick={() => setPoints(host, o.points.filter((_, k) => k !== i))}>×</Button>
        </li>
      ))}
    </ul>
  ) : null;
  const busy = o.phase === 'busy' || o.phase === 'encoding' ? <span className="tool-mono" aria-live="polite">{o.phase === 'encoding' ? 'analizando el cuadro…' : 'calculando…'}</span> : null;

  if (o.mode === 'fix') {
    const c = correctionAt(layer, o.fix, o.at ?? time);
    return (
      <div className="tool-opts" data-tool="seguir">
        <span className="tool-title">Corregir en {fmtT(o.at ?? time)}</span>
        <Switch label={o.positive ? 'Añadir' : 'Quitar'} checked={!o.positive} onChange={v => set({ positive: !v })} hint="Qué marca el próximo toque: parte del objeto (añadir) o lo que no es (quitar)" />
        {pointsList ?? <Note tone="quiet">Toca el objeto en este cuadro.</Note>}
        {busy}
        {c ? <Note tone="quiet">Se recalcula sólo de {fmtT(c.from)} a {fmtT(c.to)} (entre las claves de alrededor).</Note> : <Note tone="warn">Este cuadro está fuera del seguimiento.</Note>}
        {o.error ? <Note tone="warn">{o.error}</Note> : null}
        <Button primary disabled={!o.points.length || !c} onClick={() => void applyCorrection(host)} kbd="Intro">Aplicar la corrección</Button>
        <Button onClick={() => stopFix(host)}>Volver</Button>
      </div>
    );
  }

  const { start, end } = stretchOf(project, layer);
  const est = video ? video.trackEstimate(project, { start, end, keyEvery: KEY_EVERY[o.precision] }) : null;
  const fixable = tracks.length ? correctionAt(layer, null, time) : null;
  return (
    <div className="tool-opts" data-tool="seguir">
      <span className="tool-title">Seguir objeto</span>
      <Switch label={o.positive ? 'Añadir' : 'Quitar'} checked={!o.positive} onChange={v => set({ positive: !v })} hint="Qué marca el próximo toque: parte del objeto (añadir) o lo que no es (quitar)" />
      {pointsList ?? <Note tone="quiet">{o.box ? 'Recuadro marcado.' : `Toca el objeto en este cuadro (${fmtT(time)}).`}</Note>}
      {busy}
      <span className="tool-mono" title="El seguimiento empieza en el cuadro donde marcas el objeto">Desde {fmtT(start)}</span>
      <Slider label="Hasta" value={end} min={Math.min(project.time.duration, start + 1 / Math.max(1, project.time.fps))} max={Math.max(start + 0.05, project.time.duration)} step={1 / Math.max(1, project.time.fps)}
        format={fmtT} onChange={v => set({ end: v })} hint="Hasta dónde se sigue el objeto (por defecto, el final de la capa o del video)" />
      <Segmented<Precision> label="Precisión" value={o.precision} options={[
        { value: 'alta', label: 'Alta', title: 'El modelo decide cada 0,25 s: sigue mejor lo rápido, tarda más' },
        { value: 'normal', label: 'Normal', title: 'El modelo decide cada 0,5 s' },
        { value: 'rapida', label: 'Rápida', title: 'El modelo decide cada segundo: para movimientos lentos' },
      ]} onChange={v => set({ precision: v })} />
      {est ? <Note tone="quiet">{est.text}</Note> : null}
      {o.error ? <Note tone="warn">{o.error}</Note> : null}
      <Button primary disabled={!marked} onClick={() => void follow(host)} kbd="Intro">Seguir</Button>
      <Button disabled={!marked} onClick={() => clearMarks(host, 'Puntos borrados')} kbd="Esc">Borrar puntos</Button>
      {tracks.length ? (
        <Button disabled={!fixable} onClick={() => startFix(host, null)} title={fixable ? 'Marca el objeto en este cuadro para arreglar el seguimiento aquí' : 'Ve a un cuadro del seguimiento (las marcas en la fila de la capa)'}>Corregir aquí</Button>
      ) : null}
      {o.at !== null && o.at > (layer?.span?.in ?? 0) + 1e-3 ? <Note tone="quiet">Lo que pasa antes de {fmtT(o.at)} no se sigue: para seguir desde el principio, marca el objeto en el primer cuadro.</Note> : null}
    </div>
  );
}
