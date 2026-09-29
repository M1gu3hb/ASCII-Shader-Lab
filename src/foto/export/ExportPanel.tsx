/**
 * The export sheet's body: where it goes (destination presets), what goes out, the format (each with its
 * honest one-line limit, and why not + what instead when this browser cannot), the options, a preview drawn
 * by the same code at the chosen size and instant, and the export itself with progress, time left, cancel
 * and notes afterwards (what happened to the sound, what text could not keep, fallbacks).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Compositor } from '../../project/compositor';
import { evaluate } from '../../project/evaluate';
import { exportMask, projectFiles } from '../../project/export';
import { createSourceProvider, storeBlob } from '../../project/sources';
import { useProject } from '../../project/store';
import type { Project } from '../../project/types';
import type { FormatInfo } from '../../video/index';
import { copyText, downloadBlob, shareFile, useSaved } from '../../studio/download';
import type { PickOpt } from '../../studio/ui/Picker';
import { ScrollRow } from '../../studio/ui/ScrollRow';
import { SegGroup, Select, Slider, Toggle } from '../controls';
import { say } from '../ui';
import { baseFacts, movieCaps, projectMoves, svgFacts } from './facts';
import { formatsFor, usableFormat, type Facts, type FormatId, type FormatOption, type WhatKind } from './formats';
import { glyphFrameAt, glyphFrames, frameSession, type GlyphFrame } from './frames';
import type { GlyphGrid } from '../../glyphs/index';
import type { GlyphStyle } from '../../project/types';
import { notesText } from './frameGrid';
import { runJob, planSize, type JobOutput, type Progress } from './jobs';
import { applyDestination, defaultPlan, DESTINATIONS, destinationById, fpsOptions, frameCount, readmeTextTime, type DestId, type Plan } from './plan';
import { Preview, type PreviewData } from './Preview';
import { renderSized } from './render';
import { compositionSvg, fontFaces, fontsOf, withFonts } from './svg';
import { stillText } from './text';
import { memoryNote, PRINT_DPI, printText, resolveSize, SIZE_PRESETS, sizeText, type Dpi, type Fit, type Orient, type SizeId } from './sizes';
import './export.css';

type Base = Awaited<ReturnType<typeof baseFacts>>;

type JobState =
  | { state: 'idle' }
  | { state: 'running'; progress: Progress; t0: number; eta: string }
  | { state: 'done'; out: JobOutput; names: string[] }
  | { state: 'cancelled' }
  | { state: 'error'; message: string };

const STILL_FORMATS = new Set<FormatId>(['png', 'jpeg', 'webp', 'svg', 'svg-img']);
const PICTURES = new Set<FormatId>(['png', 'jpeg', 'webp', 'svg-img']);
const MOVIE_FORMATS = new Set<FormatId>(['mp4', 'webm', 'gif', 'png-zip']);
const TEXT_STILL = new Set<FormatId>(['txt', 'ansi', 'html', 'svg-text', 'shell']);
const TEXT_MOVING = new Set<FormatId>(['cast', 'node', 'python', 'html-anim', 'web']);

/** Whether a canvas has pixels that are not fully opaque. */
function hasClear(c: HTMLCanvasElement): boolean {
  try {
    const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  } catch { /* unreadable: say nothing */ }
  return false;
}

/** «0:03,2» */
export function fmtTime(s: number): string {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1).replace('.', ',')}`;
}

/** «unos 12 s», «unos 2 min 5 s» */
export function etaText(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `unos ${s} s`;
  return `unos ${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
}

const whatValue = (what: WhatKind, target: string | null) => (target ? `${what}:${target}` : what);
function parseWhat(v: string): { what: WhatKind; target: string | null } {
  const i = v.indexOf(':');
  return i < 0 ? { what: v as WhatKind, target: null } : { what: v.slice(0, i) as WhatKind, target: v.slice(i + 1) || null };
}

function whatOptions(p: Project): PickOpt<string>[] {
  const out: PickOpt<string>[] = [{ value: 'resultado', label: 'La composición', group: 'Resultado', desc: 'Lo que ves: todas las capas visibles.' }];
  const glyphs = p.layers.filter(l => l.kind === 'glyphs');
  for (const l of glyphs) out.push({ value: `texto:${l.id}`, label: `Caracteres de «${l.name}»`, group: 'Texto real', desc: 'Los caracteres como texto: TXT, ANSI, HTML, SVG, terminal, web.' });
  if (!glyphs.length) out.push({ value: 'texto', label: 'Texto (no hay capas de caracteres reales)', group: 'Texto real', desc: 'Sólo las capas «Caracteres reales» son texto.' });
  for (const l of p.layers) out.push({ value: `capa:${l.id}`, label: `Capa sola: ${l.name}`, group: 'Por separado', desc: 'La capa con su máscara y acabados, sobre transparencia.' });
  for (const l of p.layers) if (l.mask && l.mask.parts.length) out.push({ value: `mascara:${l.id}`, label: `Máscara de ${l.name}`, group: 'Por separado' });
  for (const s of p.sources) if (s.kind !== 'cutout') out.push({ value: `original:${s.id}`, label: `Original: ${s.name}`, group: 'Por separado', desc: s.kind === 'sequence' ? `${s.media.length} fotos, tal cual.` : 'El archivo tal cual.' });
  for (const s of p.sources) if (s.kind === 'cutout') out.push({ value: `recorte:${s.id}`, label: `Recorte y mate: ${s.name}`, group: 'Por separado' });
  out.push({ value: 'proyecto', label: 'El proyecto (.glyphos.zip)', group: 'Proyecto', desc: 'Para reabrirlo: capas, máscaras, animaciones y archivos.' });
  return out;
}

/** The sheet's compositor (previews and stills): its own engines, frame-exact video, released on close. */
function useSheetCompositor(): Compositor {
  const [c] = useState(() => new Compositor({ provider: createSourceProvider({ video: 'exact' }), maxEngines: 4 }));
  useEffect(() => () => { c.destroy(); c.provider.release(); }, [c]);
  return c;
}

/** Measures an element's inner box (the preview's room). */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = () => setBox(b => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

export function ExportPanel({ p }: { p: Project }) {
  const comp = useSheetCompositor();
  const session = useMemo(() => frameSession({ compositor: comp }), [comp]);
  useEffect(() => () => session.release(), [session]);
  // a video project opens on a video format (once lane video says which one this browser writes)
  const videoProject = p.sources.some(s => s.kind === 'video') && p.time.duration > 0;
  const [plan, setPlan] = useState<Plan>(() => ({ ...defaultPlan(p, useProject.getState().time), ...(videoProject ? { format: 'mp4' as const } : {}) }));
  const up = (patch: Partial<Plan>) => setPlan(x => ({ ...x, ...patch }));
  const moving = projectMoves(p);
  const size = planSize(p, plan);
  const hasAudio = p.sources.some(s => s.kind === 'video' && s.hasAudio !== false);

  // facts: still encoders, SVG faithfulness at the instant, glyph layers
  const [base, setBase] = useState<Base | null>(null);
  useEffect(() => {
    let gone = false;
    const h = setTimeout(() => { void baseFacts(p, plan.t, session, plan.transparent).then(f => { if (!gone) setBase(f); }).catch(() => undefined); }, 60);
    return () => { gone = true; clearTimeout(h); };
  }, [p, plan.t, plan.transparent, session]);
  // what lane video can write, for this size, stretch and rate
  const [movies, setMovies] = useState<FormatInfo[] | null>(moving ? null : []);
  useEffect(() => {
    if (!moving) { setMovies([]); return; }
    let gone = false;
    const h = setTimeout(() => {
      void movieCaps(p, { width: size.w, height: size.h, fps: plan.fps, start: plan.start, end: plan.end, transparent: plan.transparent })
        .then(m => { if (!gone) setMovies(m); });
    }, 250);
    return () => { gone = true; clearTimeout(h); };
  }, [p, moving, size.w, size.h, plan.fps, plan.start, plan.end, plan.transparent]);
  const facts: Facts | null = base ? { ...base, movies } : null;
  const target = plan.target;
  const hasMask = !!p.layers.find(l => l.id === target)?.mask?.parts.length;
  const formats = facts ? formatsFor(plan.what, facts, { ...(target ? { layer: target } : {}), hasMask }) : [];
  const fmt = formats.find(f => f.id === plan.format) ?? null;

  // the first facts: start on a format that works here
  const settled = useRef(false);
  useEffect(() => {
    if (!facts || settled.current || (videoProject && movies === null)) return;
    settled.current = true;
    const ok = usableFormat(formats, plan.format);
    if (ok && ok !== plan.format) up({ format: ok });
  }, [facts]); // eslint-disable-line react-hooks/exhaustive-deps

  const setWhat = (v: string) => {
    const w = parseWhat(v);
    const list = facts ? formatsFor(w.what, facts, { ...(w.target ? { layer: w.target } : {}), hasMask: !!p.layers.find(l => l.id === w.target)?.mask?.parts.length }) : [];
    const keep = list.find(f => f.id === plan.format && f.available);
    setPlan(x => ({ ...x, what: w.what, target: w.target, format: keep ? keep.id : usableFormat(list, list[0]?.id) ?? x.format }));
  };
  const setDest = (d: DestId) => { if (facts) setPlan(x => applyDestination(x, d, facts)); else up({ dest: d }); };

  /* ---------------------------------------------------------------- preview */
  const [viewRef, box] = useBox<HTMLDivElement>();
  const [scrub, setScrub] = useState<number | null>(null);
  // a README moves only where lane video writes GIF here (a still PNG of the instant otherwise)
  const gifOk = !!movies?.find(f => f.format === 'gif' && f.available);
  const isMovie = MOVIE_FORMATS.has(plan.format) || (plan.format === 'readme' && gifOk);
  const isTextMoving = TEXT_MOVING.has(plan.format);
  // a stretch is previewed at the studio's playhead, or at its last frame (where an entry has arrived)
  const lastFrame = Math.max(plan.start, plan.end - 1 / Math.max(1, plan.fps));
  const previewT = (isMovie || isTextMoving) && moving ? Math.min(lastFrame, Math.max(plan.start, scrub ?? (plan.t > 0 ? plan.t : lastFrame))) : plan.t;
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [pvBusy, setPvBusy] = useState(false);
  const [readmeText, setReadmeText] = useState<string | null>(null);
  const token = useRef(0);
  const [textFrame, setTextFrame] = useState<GlyphFrame | null>(null);
  const [alphaInside, setAlphaInside] = useState<boolean | null>(null);
  // moving text: the frames themselves, played in the preview (the same frames the file will hold)
  const [play, setPlay] = useState<{ frames: GlyphGrid[]; fps: number; bg: string; style: GlyphStyle } | 'loading' | null>(null);
  const [pi, setPi] = useState(0);
  useEffect(() => { setPlay(null); }, [p, plan.what, plan.target, plan.start, plan.end, plan.fps, plan.format]);
  useEffect(() => {
    if (!play || play === 'loading') return;
    const n = play.frames.length;
    const h = setInterval(() => setPi(i => (i + 1) % n), 1000 / play.fps);
    return () => clearInterval(h);
  }, [play]);
  const startPlay = async () => {
    if (!target) return;
    setPlay('loading');
    const fr = await glyphFrames(p, target, { fps: plan.fps, from: plan.start, to: plan.end, compositor: comp }).catch(() => null);
    if (!fr) { setPlay(null); return; }
    setPi(0);
    setPlay({ frames: fr.frames, fps: fr.fps, bg: fr.bg, style: fr.style });
  };
  useEffect(() => {
    if (!box.w) return;
    const my = ++token.current;
    setPvBusy(true);
    const h = setTimeout(() => {
      void makePreview().then(d => { if (my === token.current) { setPreview(d); setPvBusy(false); } }).catch(e => {
        if (my === token.current) { setPreview({ kind: 'none', message: (e as Error).message || 'No se pudo dibujar la vista previa.' }); setPvBusy(false); }
      });
    }, 180);
    return () => clearTimeout(h);
    async function makePreview(): Promise<PreviewData> {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // (on narrow screens the stage grows with the picture: its room is a share of the screen's height)
      const narrow = matchMedia('(max-width: 900px)').matches;
      const room = { w: Math.max(120, box.w - 24), h: Math.max(120, (narrow ? window.innerHeight * 0.45 : box.h) - 24) };
      const extraFor = (w: number, h: number) => Math.min(1, (room.w * dpr) / w, (room.h * dpr) / h);
      switch (plan.what) {
        case 'resultado': {
          if (plan.format === 'svg' && base?.svg.vector) {
            const sv = await svgFacts(p, previewT, session);
            if (sv.decision.vector) {
              let text = compositionSvg({ w: p.canvas.w, h: p.canvas.h, bg: p.canvas.bg, transparent: plan.transparent, title: p.name, parts: sv.parts });
              // (an SVG shown as an image sees no fonts but its own: the preview carries them as the file will)
              if (plan.embedFonts) text = withFonts(text, (await fontFaces(fontsOf(sv.parts))).css);
              return { kind: 'image', url: URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })), w: p.canvas.w, h: p.canvas.h, alpha: plan.transparent, label: 'Vista previa del SVG' };
            }
          }
          const w = plan.format === 'readme' ? Math.min(plan.readmeW, 1600) : size.w;
          const hh = plan.format === 'readme' ? Math.round((w * p.canvas.h) / p.canvas.w) : size.h;
          const canvas = await renderSized(p, { w, h: hh, fit: plan.format === 'readme' || MOVIE_FORMATS.has(plan.format) ? 'cover' : plan.fit, t: previewT, transparent: plan.transparent && (fmt?.alpha ?? true), extra: extraFor(w, hh), compositor: comp, format: plan.format === 'jpeg' ? 'jpeg' : 'png' });
          if (plan.format === 'readme') {
            if (plan.readmeText) {
              const f = await glyphFrameAt(p, plan.readmeText, readmeTextTime(plan, moving && gifOk), session);
              setReadmeText(f ? stillText(f, 'txt').text : null);
            } else setReadmeText(null);
          }
          setAlphaInside(plan.transparent && (fmt?.alpha ?? true) ? hasClear(canvas) : null);
          return { kind: 'picture', canvas, alpha: plan.transparent && (fmt?.alpha ?? true) };
        }
        case 'capa': {
          if (!target) return { kind: 'none', message: 'Elige una capa.' };
          const k = extraFor(size.w, size.h) * (size.w / p.canvas.w);
          const canvas = document.createElement('canvas');
          await comp.render(evaluate(p, plan.t), canvas, { scale: k, quality: 'final', transparent: true, only: [target] });
          return { kind: 'picture', canvas, alpha: true };
        }
        case 'mascara': {
          if (!target) return { kind: 'none', message: 'Elige una capa con máscara.' };
          const w = Math.max(16, Math.round(size.w * extraFor(size.w, size.h)));
          const blob = await exportMask(p, target, { t: plan.t, width: w, mode: plan.format === 'mask-alpha' ? 'alpha' : 'grey', compositor: comp });
          if (!blob) return { kind: 'none', message: 'Esta capa no tiene máscara.' };
          return { kind: 'image', url: URL.createObjectURL(blob), w, h: Math.round((w * p.canvas.h) / p.canvas.w), alpha: plan.format === 'mask-alpha', label: 'Vista previa de la máscara' };
        }
        case 'texto': {
          if (!target) return { kind: 'none', message: 'Este proyecto no tiene capas de caracteres reales: no hay texto que exportar.' };
          const f = await glyphFrameAt(p, target, previewT, session);
          setTextFrame(f);
          if (!f) return { kind: 'none', message: 'Falta la imagen de esta capa.' };
          if (plan.format === 'svg-text') {
            const out = stillText(f, 'svg-text');
            if (plan.embedFonts) out.text = withFonts(out.text, (await fontFaces([{ font: f.style.font, weight: f.style.weight }])).css);
            return { kind: 'image', url: URL.createObjectURL(new Blob([out.text], { type: 'image/svg+xml' })), w: p.canvas.w, h: p.canvas.h, alpha: !f.paper, label: 'Vista previa del SVG con texto' };
          }
          return { kind: 'text', grid: f.grid, style: f.style, bg: f.bg };
        }
        case 'original': case 'recorte': {
          const s = p.sources.find(x => x.id === target);
          if (!s) return { kind: 'none', message: 'Elige un archivo.' };
          const media = plan.what === 'recorte' && plan.format === 'matte' && s.cutout ? [s.cutout.matte] : s.media;
          const first = media[0]?.id ? await storeBlob(media[0].id) : null;
          const thumb = first && first.type.startsWith('image/') ? URL.createObjectURL(first.blob) : undefined;
          return {
            kind: 'files', ...(thumb ? { thumb } : {}),
            items: media.map(m => ({ name: m.name ?? s.name, detail: `${m.w} × ${m.h} px${m.size ? ` · ${(m.size / 1e6).toFixed(1).replace('.', ',')} MB` : ''}` })),
          };
        }
        case 'proyecto': {
          const files = projectFiles(p);
          const role: Record<string, string> = { original: 'original', secuencia: 'foto de secuencia', recorte: 'recorte', mate: 'mate', mascara: 'máscara pintada' };
          return {
            kind: 'files',
            items: [
              { name: 'proyecto.glyphos.json', detail: `${p.layers.length} capas · ${p.tracks.length} pistas de claves · ${p.layers.reduce((n, l) => n + l.clips.length, 0)} animaciones` },
              ...files.map(f => ({ name: f.ref.name ?? f.ref.id ?? 'archivo', detail: role[f.role] ?? f.role })),
              { name: 'LEEME.txt', detail: 'cómo abrirlo' },
            ],
          };
        }
      }
    }
    // (the preview follows everything it shows)
  }, [p, plan, previewT, box.w, matchMedia('(max-width: 900px)').matches ? 0 : box.h, base?.svg.vector, gifOk]); // eslint-disable-line react-hooks/exhaustive-deps
  // object URLs of image previews go when replaced
  useEffect(() => () => {
    if (preview?.kind === 'image') URL.revokeObjectURL(preview.url);
    if (preview?.kind === 'files' && preview.thumb) URL.revokeObjectURL(preview.thumb);
    // (a replaced preview canvas is out of the page by now: its memory goes at once)
    if (preview?.kind === 'picture') preview.canvas.width = preview.canvas.height = 0;
  }, [preview]);

  /* ---------------------------------------------------------------- export */
  const [job, setJob] = useState<JobState>({ state: 'idle' });
  const ac = useRef<AbortController | null>(null);
  useEffect(() => () => ac.current?.abort(), []);
  const running = job.state === 'running';
  const run = async () => {
    if (!fmt?.available || running) return;
    const ctl = new AbortController();
    ac.current = ctl;
    const t0 = performance.now();
    let last = 0;
    setJob({ state: 'running', progress: { done: 0, total: 1, label: 'Preparando…' }, t0, eta: '' });
    say(`Exportando ${fmt.label}…`, { keep: true });
    try {
      // a movie renders with lane video's own compositor: free this one's engines (WebGL contexts are few)
      if (MOVIE_FORMATS.has(plan.format) || plan.format === 'readme') comp.release();
      const svg = plan.format === 'svg' ? await svgFacts(p, plan.t, session) : undefined;
      const out = await runJob(p, plan, {
        compositor: comp, signal: ctl.signal, movies,
        ...(svg ? { svg } : {}),
        onProgress: pr => {
          const now = performance.now();
          if (now - last < 90 && pr.done < pr.total) return;
          last = now;
          const el = now - t0;
          const eta = pr.done >= 2 && pr.total > pr.done && el > 800 ? etaText((el / pr.done) * (pr.total - pr.done)) : '';
          setJob({ state: 'running', progress: pr, t0, eta });
        },
      });
      if (ctl.signal.aborted) throw Object.assign(new Error('cancelado'), { name: 'AbortError' });
      for (const f of out.files) downloadBlob(f.name, f.blob);
      const names = out.files.map(f => f.name);
      setJob({ state: 'done', out, names });
      say(`Exportado: ${names.join(', ')}.`);
    } catch (e) {
      const err = e as Error;
      if (err?.name === 'AbortError' || ctl.signal.aborted) { setJob({ state: 'cancelled' }); say('Exportación cancelada: no se guardó nada.'); }
      else { setJob({ state: 'error', message: err?.message || 'No se pudo exportar.' }); say(err?.message || 'No se pudo exportar.'); }
    } finally {
      if (ac.current === ctl) ac.current = null;
    }
  };
  const cancel = () => ac.current?.abort();
  // a new choice clears the last result
  useEffect(() => { if (!running) setJob(j => (j.state === 'idle' ? j : { state: 'idle' })); }, [plan.what, plan.target, plan.format]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyTxt = async () => {
    if (!textFrame) return;
    await copyText(stillText(textFrame, 'txt').text, 'Caracteres copiados: pégalos donde quieras.');
  };

  /* ---------------------------------------------------------------- view */
  const dest = destinationById(plan.dest);
  const mem = memoryNote(size.w, size.h, p.layers.filter(l => l.visible).length, p.layers.some(l => l.kind === 'ascii'), !!size.dpi);
  const frames = frameCount(plan.start, plan.end, plan.fps);
  const summary = summaryOf(plan, fmt, size, frames, moving, gifOk);
  const caption = captionOf(plan, size, previewT, moving, isMovie || isTextMoving, textFrame);
  const sized = plan.what === 'resultado' && plan.format !== 'svg' && plan.format !== 'readme';
  const partSized = plan.what === 'capa' || plan.what === 'mascara';
  const showT = moving && (STILL_FORMATS.has(plan.format) || TEXT_STILL.has(plan.format) || plan.what === 'capa' || plan.what === 'mascara' || (plan.format === 'readme' && !gifOk));
  const showRange = moving && (MOVIE_FORMATS.has(plan.format) || TEXT_MOVING.has(plan.format) || (plan.format === 'readme' && gifOk));

  return (
    <div className="xp">
      <div className="xp-dest">
        <span className="xp-lbl" id="xp-dest-l">Destino</span>
        <ScrollRow role="radiogroup" aria-labelledby="xp-dest-l" className="seg xp-dest-row">
          {DESTINATIONS.map(d => (
            <button key={d.id} type="button" role="radio" aria-checked={plan.dest === d.id} title={d.what} onClick={() => setDest(d.id)}>{d.name}</button>
          ))}
        </ScrollRow>
        <p className="xp-dest-what">{dest.what}</p>
      </div>

      <div className="xp-stage" ref={viewRef}>
        <Preview data={play && play !== 'loading' && plan.what === 'texto' ? { kind: 'text', grid: play.frames[pi % play.frames.length], style: play.style, bg: play.bg } : preview}
          dest={plan.dest} busy={pvBusy && !(play && play !== 'loading')} caption={caption} zones={plan.dest === 'vertical'}
          readme={plan.format === 'readme' ? { title: p.name, text: readmeText } : undefined} />
        {plan.what === 'texto' && isTextMoving && fmt?.available && (
          <button type="button" className="btn xp-play" aria-pressed={!!play && play !== 'loading'} disabled={play === 'loading'}
            onClick={() => { if (play) setPlay(null); else void startPlay(); }}>
            {play === 'loading' ? 'Preparando los cuadros…' : play ? 'Parar la vista previa' : `Reproducir los ${frames} cuadros`}
          </button>
        )}
        {(showRange || (showT && moving)) && !(play && play !== 'loading') && (
          <div className="xp-scrub">
            {showRange ? (
              <Slider label="Ver el instante" value={previewT} min={plan.start} max={Math.max(plan.start + 0.01, plan.end)} step={1 / Math.max(1, plan.fps)} fmt={fmtTime} onChange={setScrub}
                hint="Sólo mueve la vista previa: se exporta todo el tramo." />
            ) : (
              <Slider label="Instante" value={plan.t} min={0} max={Math.max(0.01, p.time.duration)} step={1 / Math.max(1, p.time.fps)} fmt={fmtTime} onChange={v => up({ t: v })}
                hint="El cuadro que se exporta como imagen o texto." />
            )}
          </div>
        )}
      </div>

      <div className="xp-ctl">
        <Select label="Qué exportar" value={whatValue(plan.what, plan.target)} options={whatOptions(p)} onChange={setWhat} minWidth={300} />

        <FormatList formats={formats} value={plan.format} loading={!facts} onPick={id => up({ format: id })} />

        <div className="xp-opts" aria-label="Opciones">
          {fmt?.more && fmt.available && <p className="xp-more">{fmt.more}</p>}
          {(sized || partSized) && (
            <>
              <Select<SizeId> label="Tamaño" value={plan.size}
                options={SIZE_PRESETS.filter(s => sized || s.k).map(s => {
                  const z = resolveSize(s.id, p.canvas, { dpi: plan.dpi, orient: plan.orient });
                  return { value: s.id, label: s.mm ? `${s.label} a ${plan.dpi} ppp` : s.label, group: s.group, desc: `${z.w} × ${z.h} px · ${s.use}` };
                })}
                onChange={v => up({ size: v })} minWidth={300} />
              {size.dpi && (
                <div className="xp-two">
                  <SegGroup<Dpi> label="Resolución" value={plan.dpi} opts={PRINT_DPI.map(d => [d, `${d} ppp`] as [Dpi, string])} onPick={v => up({ dpi: v })} />
                  <SegGroup<Orient> label="Orientación" value={plan.orient} opts={[['auto', 'Como la pieza'], ['vertical', 'Vertical'], ['horizontal', 'Horizontal']]} onPick={v => up({ orient: v })} />
                </div>
              )}
              {!size.sameAspect && sized && (
                MOVIE_FORMATS.has(plan.format)
                  ? <p className="xp-note">La proporción es otra: el video se recorta al centro.</p>
                  : <SegGroup<Fit> label="Si la proporción no coincide" value={plan.fit} opts={[['cover', 'Recortar al centro'], ['contain', 'Encajar con bandas']]} onPick={v => up({ fit: v })} />
              )}
            </>
          )}
          {showRange && (
            <div className="xp-range">
              <Slider label="Desde" value={plan.start} min={0} max={Math.max(0.01, p.time.duration)} step={0.05} fmt={fmtTime} onChange={v => up({ start: Math.min(v, plan.end - 0.05) })} />
              <Slider label="Hasta" value={plan.end} min={0} max={Math.max(0.01, p.time.duration)} step={0.05} fmt={fmtTime} onChange={v => up({ end: Math.max(v, plan.start + 0.05) })} />
              <Select<number> label="Cuadros por segundo" value={plan.fps} options={fpsOptions(p.time.fps).map(v => ({ value: v, label: `${v} fps`, ...(v === Math.round(p.time.fps) ? { desc: 'La del proyecto.' } : {}) }))} onChange={v => up({ fps: v })} />
            </div>
          )}
          {(fmt?.id === 'png' || fmt?.id === 'webp' || fmt?.id === 'svg' || fmt?.id === 'svg-img' || fmt?.id === 'jpeg' || (fmt && MOVIE_FORMATS.has(fmt.id))) && plan.what === 'resultado' && (
            <Toggle label="Fondo transparente" checked={plan.transparent && !!fmt.alpha} disabled={!fmt.alpha} onChange={v => up({ transparent: v })}
              hint={!fmt.alpha
                ? `${fmt.label} no guarda transparencia aquí: lo transparente va sobre el color de fondo del proyecto.${MOVIE_FORMATS.has(fmt.id) ? ' Para video transparente, la secuencia PNG.' : ''}`
                : fmt.id === 'gif' ? 'GIF sólo tiene transparencia de 1 bit: bordes duros, sin semitransparencias.'
                  : !plan.transparent ? 'Lo que no cubre ninguna capa queda transparente (en lugar del fondo del proyecto).'
                    : alphaInside === false ? 'Las capas lo cubren todo: aunque esté activado, en este cuadro no queda nada transparente.'
                      : 'La composición tiene zonas transparentes: el archivo las conserva.'} />
          )}
          {(fmt?.id === 'svg' || fmt?.id === 'svg-text') && fmt.available && (
            <Toggle label="Incrustar las fuentes" checked={plan.embedFonts} onChange={v => up({ embedFonts: v })}
              hint={plan.embedFonts ? 'El SVG lleva los archivos de las fuentes del estudio (letras latinas): se ve igual en cualquier navegador; pesa más.' : 'Más ligero; quien lo abra lo verá con sus fuentes (o parecidas).'} />
          )}
          {(fmt?.id === 'jpeg' || fmt?.id === 'webp') && (
            <Slider label="Calidad" value={plan.quality} min={0.5} max={1} step={0.01} fmt={v => Math.round(v * 100) + ' %'} onChange={v => up({ quality: v })} hint="Menos calidad, archivo más ligero." />
          )}
          {fmt?.id === 'gif' && (
            <>
              <Select<number> label="Colores" value={plan.gif.colors} options={[256, 128, 64, 32, 16].map(v => ({ value: v, label: `${v} colores` }))} onChange={v => up({ gif: { ...plan.gif, colors: v } })} />
              <SegGroup label="Tramado" value={plan.gif.dither} opts={[['none', 'Ninguno'], ['bayer', 'Bayer'], ['floyd', 'Floyd–Steinberg']]} onPick={v => up({ gif: { ...plan.gif, dither: v } })} />
              <SegGroup label="Paleta" value={plan.gif.palette} opts={[['global', 'Una para todo'], ['frame', 'Una por cuadro']]} onPick={v => up({ gif: { ...plan.gif, palette: v } })} />
            </>
          )}
          {(fmt?.id === 'gif' || fmt?.id === 'html-anim' || fmt?.id === 'web') && (
            <Toggle label="En bucle" checked={plan.loop} onChange={v => up({ loop: v })} hint={plan.loop ? 'Vuelve a empezar al terminar.' : 'Se reproduce una vez y se queda en el último cuadro.'} />
          )}
          {hasAudio && (fmt?.id === 'mp4' || fmt?.id === 'webm') && (
            <SegGroup label="Sonido" value={plan.audio} opts={[['keep', 'Conservar el del video'], ['none', 'Sin sonido']]} onPick={v => up({ audio: v })} />
          )}
          {(fmt?.id === 'ansi' || fmt?.id === 'shell' || fmt?.id === 'cast' || fmt?.id === 'node' || fmt?.id === 'python') && (
            <SegGroup label="Color de terminal" value={plan.depth} opts={[['truecolor', 'Color real'], ['256', '256 colores'], ['16', '16 colores'], ['none', 'Sin color']]} onPick={v => up({ depth: v })} />
          )}
          {fmt?.id === 'readme' && (
            <>
              <Select<string> label="Texto del README" value={plan.readmeText ?? ''} onChange={v => up({ readmeText: v || null })}
                options={[{ value: '', label: 'Sin texto' }, ...p.layers.filter(l => l.kind === 'glyphs').map(l => ({ value: l.id, label: `Caracteres de «${l.name}»` }))]} />
              <SegGroup<number> label="Ancho de la imagen" value={plan.readmeW} opts={[[480, '480 px'], [640, '640 px'], [800, '800 px']]} onPick={v => up({ readmeW: v })} />
            </>
          )}
          {sized && mem.note && <p className={mem.risky ? 'warn' : 'xp-note'}>{mem.note}</p>}
          {plan.what === 'texto' && textFrame && job.state !== 'done' && notesText(textFrame.notes).length > 0 && (
            <ul className="xp-notes xp-pre">{notesText(textFrame.notes).map((n, i) => <li key={i}>{n}</li>)}</ul>
          )}
        </div>

        <div className="xp-go">
          <p className="xp-sum">{summary}</p>
          {running ? (
            <Busy job={job} onCancel={cancel} />
          ) : (
            <div className="xp-btns">
              <button type="button" className="btn primary" disabled={!fmt?.available} onClick={() => void run()}>
                {fmt ? `Exportar ${fmt.label.replace(/ \(.*\)$/, '')}` : 'Exportar'}
              </button>
              {plan.what === 'texto' && plan.format === 'txt' && textFrame && (
                <button type="button" className="btn" onClick={() => void copyTxt()}>Copiar el texto</button>
              )}
            </div>
          )}
          <Result job={job} />
        </div>
      </div>
    </div>
  );
}

function summaryOf(plan: Plan, fmt: FormatOption | null, size: { w: number; h: number; dpi?: number }, frames: number, moving: boolean, gifOk: boolean): ReactNode {
  if (!fmt) return 'Revisando qué puede escribir este navegador…';
  if (!fmt.available) return fmt.why ?? 'No disponible aquí.';
  const parts: string[] = [fmt.label];
  if (plan.what === 'resultado' && plan.format !== 'svg' && plan.format !== 'readme') parts.push(sizeText(size.w, size.h));
  if (size.dpi && plan.what === 'resultado' && PICTURES.has(plan.format)) parts.push(printText(size.w, size.h, size.dpi));
  if (plan.format === 'readme') {
    parts.push(moving && gifOk ? `GIF de ${fmtTime(plan.start)}–${fmtTime(plan.end)} · ${Math.min(plan.fps, 24)} fps` : `PNG${moving ? ` del instante ${fmtTime(plan.t)}` : ''}`);
  } else if (fmt.moving) {
    if (moving) parts.push(`${fmtTime(plan.start)}–${fmtTime(plan.end)} · ${plan.fps} fps · ${frames} cuadros`);
  } else if (moving && plan.what !== 'proyecto' && plan.what !== 'original' && plan.what !== 'recorte') parts.push(`instante ${fmtTime(plan.t)}`);
  return parts.join(' · ');
}

function captionOf(plan: Plan, size: { w: number; h: number; dpi?: number }, t: number, moving: boolean, ranged: boolean, frame: GlyphFrame | null): ReactNode {
  const bits: string[] = [];
  if (plan.what === 'texto' && frame) bits.push(`${frame.grid.cols} × ${frame.grid.rows} caracteres`);
  else if (plan.what === 'resultado' || plan.what === 'capa' || plan.what === 'mascara') bits.push(plan.format === 'readme' ? `${Math.min(plan.readmeW, 1600)} px de ancho` : `${size.w} × ${size.h} px`);
  if (size.dpi && plan.what === 'resultado' && PICTURES.has(plan.format)) bits.push(printText(size.w, size.h, size.dpi));
  if (moving && plan.what !== 'proyecto' && plan.what !== 'original' && plan.what !== 'recorte') bits.push((ranged ? 'vista en ' : 'instante ') + fmtTime(t));
  return (
    <>
      {plan.what === 'texto' ? 'Vista previa: los caracteres que se exportan, como texto.' : 'Vista previa: la exportación dibujada con el mismo código, más pequeña.'}
      {' '}<span className="xp-cap-m">{bits.join(' · ')}</span>
      {plan.dest === 'vertical' && <> · Las bandas marcan dónde suelen ir los textos y botones de las apps (aproximado: cada app cambia).</>}
    </>
  );
}

function FormatList({ formats, value, loading, onPick }: { formats: FormatOption[]; value: FormatId; loading: boolean; onPick: (id: FormatId) => void }) {
  if (loading) return <p className="xp-note mt-spin">Revisando qué formatos escribe este navegador…</p>;
  // formats of a group that are all unavailable for the same reason go in one line
  const groups: Array<{ name: string; items: FormatOption[] }> = [];
  for (const f of formats) {
    const g = groups.find(x => x.name === f.group);
    if (g) g.items.push(f); else groups.push({ name: f.group, items: [f] });
  }
  const labelOf = (id: FormatId) => formats.find(f => f.id === id)?.label ?? id;
  return (
    <fieldset className="xp-fmts">
      <legend className="xp-lbl">Formato</legend>
      {groups.map(g => {
        const off = g.items.every(f => !f.available) && g.items.length > 1 && new Set(g.items.map(f => f.why)).size === 1;
        if (off) {
          const f0 = g.items[0];
          return (
            <div key={g.name} className="xp-fg">
              <p className="xp-gname" aria-hidden="true">{g.name}</p>
              <div className="xp-fmt off" role="group" aria-label={g.name}>
                <span className="xp-fn">{g.items.map(f => f.label).join(' · ')}</span>
                <span className="xp-why">{f0.why}{f0.alt && formats.find(f => f.id === f0.alt)?.available && <> <button type="button" className="xp-alt" onClick={() => onPick(f0.alt!)}>Usar {labelOf(f0.alt)}</button></>}</span>
              </div>
            </div>
          );
        }
        return (
          <div key={g.name} className="xp-fg" role="radiogroup" aria-label={g.name}>
            <p className="xp-gname" aria-hidden="true">{g.name}</p>
            {g.items.map(f => (
              <label key={f.id} className={'xp-fmt' + (f.available ? '' : ' off') + (value === f.id ? ' on' : '')}>
                <input type="radio" name="xp-format" value={f.id} checked={value === f.id} disabled={!f.available} onChange={() => onPick(f.id)}
                  aria-labelledby={`xpf-${f.id}`} aria-describedby={`xpl-${f.id}`} />
                <span className="xp-fn" id={`xpf-${f.id}`}>{f.label}</span>
                <span className="xp-fl" id={`xpl-${f.id}`}>{f.available ? f.limit : f.why}</span>
                {!f.available && f.alt && formats.find(x => x.id === f.alt)?.available && (
                  <button type="button" className="xp-alt" onClick={e => { e.preventDefault(); onPick(f.alt!); }}>Usar {labelOf(f.alt)}</button>
                )}
              </label>
            ))}
          </div>
        );
      })}
    </fieldset>
  );
}

function Busy({ job, onCancel }: { job: JobState; onCancel: () => void }) {
  if (job.state !== 'running') return null;
  const { done, total, label } = job.progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="xp-busy">
      <span className="sr-only" role="status">{label}</span>
      <div className="progress" role="progressbar" aria-label="Progreso de la exportación" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ '--v': pct + '%' } as React.CSSProperties} /></div>
      <div className="xp-busy-row">
        <span aria-hidden="true">{label}{total > 1 ? ` · ${pct} %` : ''}{job.eta && !/queda/i.test(label) ? ` · quedan ${job.eta}` : ''}</span>
        <button type="button" className="btn xp-cancel" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function Result({ job }: { job: JobState }) {
  const saved = useSaved();
  if (job.state === 'cancelled') return <p className="xp-res" role="status">Cancelado: no se guardó nada.</p>;
  if (job.state === 'error') return <p className="xp-res warn" role="alert">{job.message}</p>;
  if (job.state !== 'done') return null;
  const { out, names } = job;
  return (
    <div className="xp-res" role="status">
      <p>Descargado: <b>{names.join(', ')}</b></p>
      {out.notes.length > 0 && <ul className="xp-notes">{out.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {out.snippet && <Snippet label={out.snippet.label} code={out.snippet.code} />}
      {saved.file && names.includes(saved.name) && <button type="button" className="btn" onClick={() => { if (saved.file) void shareFile(saved.file); }}>Compartir</button>}
    </div>
  );
}

function Snippet({ label, code }: { label: string; code: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const long = code.length > 4000;
  return (
    <div className="xp-snip">
      <p className="xp-lbl">{label}</p>
      <textarea ref={ref} className="code" readOnly value={long ? code.slice(0, 4000) + '\n…' : code} rows={long ? 6 : Math.min(8, code.split('\n').length + 1)} aria-label={label}
        onFocus={e => e.currentTarget.select()} />
      <button type="button" className="btn" onClick={() => void copyText(code, 'Copiado al portapapeles')}>Copiar{long ? ' todo' : ''}</button>
    </div>
  );
}
