/**
 * Movie exports: the frame loop of the project (evaluate + Compositor at the export's scale, quality 'final',
 * frame-exact video decoded in order: frames.ts) into MP4/WebM (mediabunny, WebCodecs), GIF (gifenc, lazy) or a
 * .zip of PNGs. One frame at a time, encoded before the next is drawn: nothing holds the whole video.
 *
 * Preview = export: the pictures are what Compositor.render draws for evaluate(project, t) at t = start + i / fps
 * (the same call as the studio's preview, at scale 1 or the chosen size). Deterministic: a fresh compositor per
 * export, frames in order, seeded randomness: the same export twice gives the same frames.
 */
import { withRepairedAvc } from '../exporters/avc';
import { Compositor, type RenderReport } from '../project/compositor';
import { frameTimes } from '../project/evaluate';
import { exportName } from '../project/export';
import { createSourceProvider, storeBlob, type BlobResolver } from '../project/sources';
import type { Project } from '../project/types';
import { zip, type ZipInput } from '../shared/zip';
import { findSound, prepareAudio, type AudioJob } from './audio';
import { planAudio } from './audioplan';
import { CODEC_NAME, describeFormats, probeEncode, videoCodecFor, type EncodeCaps } from './formats';
import { createStreamProvider, frameAt } from './frames';
import { gifDelay, gifPlan, indexPixels, paletteSample, type Palette } from './gifcore';
import type { FormatInfo, MovieOptions, MovieResult } from './index';

/* ------------------------------------------------------------------ bookkeeping */

/** Exports running now and what they hold (for the studio, and for tests that check a cancel frees everything). */
const live = { exports: 0, compositors: 0, providers: 0, outputs: 0, audio: 0 };
export const movieResources = () => ({ ...live });

export function abortError(): Error {
  const e = new Error('Exportación cancelada.');
  e.name = 'AbortError';
  return e;
}
const check = (s?: AbortSignal) => { if (s?.aborted) throw abortError(); };
const tick = () => new Promise<void>(r => setTimeout(r, 0));

/** Seconds, in Spanish, for the ETA. */
export function etaText(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '';
  if (s < 10) return 'unos segundos';
  if (s < 90) return `≈${Math.round(s / 5) * 5} s`;
  const m = Math.round(s / 60);
  return m < 90 ? `≈${m} min` : `≈${Math.round(m / 60)} h`;
}

/* ------------------------------------------------------------------ size */

export interface OutSize { W: number; H: number; scale: number; notes: string[] }

/** Longest side the video encoders are asked for (4K). */
export const VIDEO_MAX_SIDE = 3840;

/**
 * The output size: `width`/`height` (one of them keeps the project's aspect; both: the frame is covered and the
 * rest cropped, centred), even for video encoders (4:2:0 needs it), ≤ 4K for video. The render scale covers it.
 */
export function outputSize(p: Pick<Project, 'canvas'>, o: { width?: number; height?: number }, video: boolean): OutSize {
  const pw = p.canvas.w, ph = p.canvas.h;
  const notes: string[] = [];
  let W = o.width && o.width > 0 ? Math.round(o.width) : 0, H = o.height && o.height > 0 ? Math.round(o.height) : 0;
  if (!W && !H) { W = pw; H = ph; }
  else if (!H) H = Math.max(1, Math.round((W * ph) / pw));
  else if (!W) W = Math.max(1, Math.round((H * pw) / ph));
  if (video && Math.max(W, H) > VIDEO_MAX_SIDE) {
    const k = VIDEO_MAX_SIDE / Math.max(W, H);
    W = Math.round(W * k); H = Math.round(H * k);
    notes.push(`Video reducido a ${W}×${H}: los codificadores del navegador llegan hasta 4K.`);
  }
  if (video) { W = Math.max(2, W - (W % 2)); H = Math.max(2, H - (H % 2)); }
  const scale = Math.max(W / pw, H / ph);
  if (Math.abs(W / H - pw / ph) > 0.01) notes.push(`El cuadro de ${pw}×${ph} se recorta al centro para llenar ${W}×${H}.`);
  return { W, H, scale, notes };
}

/* ------------------------------------------------------------------ formats */

export async function movieFormatsFor(p: Project, o: Pick<MovieOptions, 'width' | 'height' | 'fps' | 'start' | 'end' | 'transparent' | 'audioSource'> & { blob?: BlobResolver } = {}): Promise<FormatInfo[]> {
  const size = outputSize(p, o, true);
  const fps = o.fps && o.fps > 0 ? o.fps : p.time.fps;
  const times = frameTimes(p, { fps, from: o.start ?? 0, to: o.end ?? p.time.duration });
  const blob = o.blob ?? storeBlob;
  const snd = findSound(p, o.audioSource, blob).catch(() => null);
  const [caps, sound] = await Promise.all([probeEncode(size.W, size.H), snd]);
  const plan = sound ? planAudio(p, { start: o.start ?? 0, end: o.end ?? p.time.duration, fps, source: sound.source }) : null;
  return describeFormats(caps, {
    transparent: o.transparent ?? p.canvas.transparent,
    sound: { has: !!sound && !!plan?.segments.length, codec: sound?.codec ?? null, decodable: sound?.decodable ?? false, name: sound?.source.name },
    straight: !!plan?.straight, w: size.W, h: size.H, frames: times.length,
  });
}

/* ------------------------------------------------------------------ the frame loop */

interface LoopOptions {
  times: number[];
  W: number;
  H: number;
  scale: number;
  transparent: boolean;
  blob: BlobResolver;
  signal?: AbortSignal;
  progress: (done: number, total: number) => void;
  /** Called with the frame drawn at W×H (the canvas is reused: use it before returning). */
  frame: (c: HTMLCanvasElement, i: number, t: number) => Promise<void>;
}

async function frameLoop(p: Project, o: LoopOptions): Promise<{ warnings: string[] }> {
  const provider = createStreamProvider(p, o.times, { blob: o.blob });
  const comp = new Compositor({ provider });
  live.compositors++; live.providers++;
  const render = document.createElement('canvas');
  const out = document.createElement('canvas');
  out.width = o.W; out.height = o.H;
  const ox = out.getContext('2d', { willReadFrequently: true })!;
  const warnings = new Set<string>();
  try {
    for (let i = 0; i < o.times.length; i++) {
      check(o.signal);
      const t = o.times[i];
      const report: RenderReport = await comp.render(frameAt(p, t), render, { scale: o.scale, quality: 'final', sequential: true, transparent: o.transparent });
      for (const w of report.warnings) warnings.add(w);
      check(o.signal);
      ox.setTransform(1, 0, 0, 1, 0, 0);
      ox.clearRect(0, 0, o.W, o.H);
      // centred crop when the render covers a different aspect (1:1 when the sizes match)
      ox.drawImage(render, Math.round((o.W - render.width) / 2), Math.round((o.H - render.height) / 2));
      await o.frame(out, i, t);
      o.progress(i + 1, o.times.length);
      // let the page breathe (a cancel click, the progress bar) every frame
      await tick();
    }
    return { warnings: [...warnings] };
  } finally {
    comp.destroy();
    await provider.close();
    live.compositors--; live.providers--;
    render.width = render.height = 0;
    out.width = out.height = 0;
  }
}

/* ------------------------------------------------------------------ export */

export async function exportMovieImpl(p: Project, o: MovieOptions & { blob?: BlobResolver }): Promise<MovieResult> {
  if (typeof document === 'undefined') throw new Error('La exportación de video necesita un navegador.');
  check(o.signal);
  const blob = o.blob ?? storeBlob;
  const fps = Math.min(120, o.fps && o.fps > 0 ? o.fps : p.time.fps || 30);
  const start = Math.max(0, o.start ?? 0);
  const end = o.end ?? p.time.duration;
  const transparent = o.transparent ?? p.canvas.transparent;
  const t0 = performance.now();
  const report = (done: number, total: number, what: string) => {
    const el = (performance.now() - t0) / 1000;
    const eta = done > 0 && done < total ? etaText((el / done) * (total - done)) : '';
    o.onProgress?.({ done, total, label: `${what} ${done} de ${total}${eta ? ` · quedan ${eta}` : ''}` });
  };
  live.exports++;
  try {
    switch (o.format) {
      case 'mp4': case 'webm': return await encodeVideo(p, o, { fps, start, end, transparent, blob, report });
      case 'gif': return await encodeGif(p, o, { fps, start, end, transparent, blob, report });
      case 'png-zip': return await encodePngs(p, o, { fps, start, end, transparent, blob, report });
      default: throw new Error(`Formato desconocido: ${String((o as { format: unknown }).format)}`);
    }
  } finally {
    live.exports--;
  }
}

interface Common { fps: number; start: number; end: number; transparent: boolean; blob: BlobResolver; report: (done: number, total: number, what: string) => void }

async function encodeVideo(p: Project, o: MovieOptions, c: Common): Promise<MovieResult> {
  const format = o.format as 'mp4' | 'webm';
  const size = outputSize(p, o, true);
  const caps: EncodeCaps = await probeEncode(size.W, size.H);
  const v = videoCodecFor(format, caps, c.transparent);
  if (!v) {
    const info = describeFormats(caps, { transparent: c.transparent, sound: { has: false, codec: null, decodable: false }, straight: false, w: size.W, h: size.H, frames: 0 }).find(f => f.format === format);
    throw new Error(info?.why ?? `Este navegador no puede crear ${format.toUpperCase()}.`);
  }
  const notes = [...size.notes];
  const alpha = c.transparent && v.alpha;
  if (c.transparent && !v.alpha) notes.push(format === 'mp4' ? 'MP4 no guarda transparencia: el video sale sobre el color de fondo del proyecto. Para transparencia usa la secuencia PNG.' : 'Este navegador no codifica WebM con transparencia: el video sale sobre el color de fondo. Para transparencia usa la secuencia PNG (o GIF, con bordes duros).');
  if (format === 'mp4' && v.codec !== 'avc') notes.push(`Este navegador no codifica H.264: el MP4 va en ${CODEC_NAME[v.codec]}. Para H.264 (lo que piden algunas redes y editores) exporta desde Chrome o Edge en Windows o macOS, o desde Safari.`);
  const times = frameTimes(p, { fps: c.fps, from: c.start, to: c.end });
  const mb = await import('mediabunny');
  check(o.signal);
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: format === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target });
  live.outputs++;
  let audio: AudioJob | null = null;
  const restore = v.codec === 'avc' ? withRepairedAvc() : () => {};
  let done = false;
  // the canvas the encoder reads: frameLoop's output canvas, assigned on its first frame
  let src: import('mediabunny').CanvasSource | null = null;
  const holder = document.createElement('canvas');
  holder.width = size.W; holder.height = size.H;
  const hx = holder.getContext('2d')!;
  try {
    // a bitrate, not a quantizer: character art is fine detail, and this machine's AV1 encoder in quantizer mode
    // came out at ~11 kb/s (PSNR 23 dB) where the bitrate mode keeps it sharp
    src = new mb.CanvasSource(holder, { codec: v.codec, quality: new mb.Quality({ quality: 'very-high', preferBitrate: true }), keyFrameInterval: 2, ...(alpha ? { alpha: 'keep' as const } : {}) });
    output.addVideoTrack(src, { frameRate: c.fps });
    audio = await prepareAudio(mb, output, p, { format, start: c.start, end: c.end, fps: c.fps, mode: o.audio ?? 'keep', prefer: o.audioSource, caps, blob: c.blob });
    live.audio++;
    check(o.signal);
    await output.start();
    const loop = await frameLoop(p, {
      times, W: size.W, H: size.H, scale: size.scale, transparent: alpha, blob: c.blob, signal: o.signal,
      progress: (d, n) => c.report(d, n, 'Cuadro'),
      frame: async (canvas, i) => {
        hx.clearRect(0, 0, size.W, size.H);
        hx.drawImage(canvas, 0, 0);
        await src!.add(i / c.fps, 1 / c.fps);
        await audio!.advance((i + 1) / c.fps);
      },
    });
    check(o.signal);
    o.onProgress?.({ done: times.length, total: times.length, label: 'Cerrando el archivo…' });
    await audio.finish();
    await output.finalize();
    done = true;
    notes.push(...audio.outcome.notes, ...loop.warnings);
    const mime = format === 'mp4' ? 'video/mp4' : 'video/webm';
    return { blob: new Blob([target.buffer!], { type: mime }), name: exportName(p, format), mime, audio: audio.outcome.audio, notes };
  } finally {
    restore();
    if (audio) { await audio.close(); live.audio--; }
    if (!done) await output.cancel().catch(() => undefined);
    live.outputs--;
    holder.width = holder.height = 0;
  }
}

async function encodeGif(p: Project, o: MovieOptions, c: Common): Promise<MovieResult> {
  const base = outputSize(p, o, false);
  const n0 = frameTimes(p, { fps: c.fps, from: c.start, to: c.end }).length;
  const plan = gifPlan(base.W, base.H, n0, c.fps);
  const k = plan.w / base.W;
  const W = plan.w, H = Math.max(16, Math.round(base.H * k));
  const scale = base.scale * k;
  const fps = plan.fps;
  const times = frameTimes(p, { fps, from: c.start, to: c.end });
  const notes = [...base.notes, ...plan.notes];
  const g = o.gif ?? {};
  const colors = Math.max(2, Math.min(256, Math.round(g.colors ?? 256)));
  const dither = g.dither ?? 'none';
  const mode = g.palette ?? 'global';
  const loop = g.loop ?? true;
  const reserve = c.transparent ? 1 : 0;
  const { GIFEncoder, quantize } = await import('gifenc');
  check(o.signal);
  if (p.sources.some(s => s.kind === 'video' && s.hasAudio) && (o.audio ?? 'keep') === 'keep') notes.push('GIF no lleva sonido.');
  if (c.transparent) notes.push('GIF guarda la transparencia con bordes duros (un píxel se ve o no se ve). Para bordes suaves usa la secuencia PNG.');

  let palette: Palette | null = null;
  if (mode === 'global') {
    // a palette for the whole clip from up to 8 frames spread over it (drawn apart: the export's own
    // compositor starts clean at frame 0)
    const picks = [...new Set(Array.from({ length: Math.min(8, times.length) }, (_, j) => Math.floor((j * times.length) / Math.min(8, times.length))))];
    const comp = new Compositor({ provider: createSourceProvider({ video: 'exact', blob: c.blob }) });
    live.compositors++;
    const cv = document.createElement('canvas');
    const samples: Uint8ClampedArray[] = [];
    try {
      for (const j of picks) {
        check(o.signal);
        await comp.render(frameAt(p, times[j]), cv, { scale, quality: 'final', transparent: c.transparent });
        const sc = document.createElement('canvas');
        sc.width = W; sc.height = H;
        const sx = sc.getContext('2d', { willReadFrequently: true })!;
        sx.drawImage(cv, Math.round((W - cv.width) / 2), Math.round((H - cv.height) / 2));
        samples.push(sx.getImageData(0, 0, W, H).data);
        sc.width = sc.height = 0;
        o.onProgress?.({ done: 0, total: times.length, label: 'Preparando la paleta…' });
      }
    } finally {
      comp.destroy(); comp.provider.release(); live.compositors--;
      cv.width = cv.height = 0;
    }
    palette = quantize(paletteSample(samples), colors - reserve);
  }
  const gif = GIFEncoder();
  await frameLoop(p, {
    times, W, H, scale, transparent: c.transparent, blob: c.blob, signal: o.signal,
    progress: (d, n) => c.report(d, n, 'Cuadro'),
    frame: async (canvas, i) => {
      const data = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
      const pal = mode === 'global' ? palette! : quantize(paletteSample([data]), colors - reserve);
      const full: Palette = reserve ? [...pal, [0, 0, 0]] : pal;
      const ti = reserve ? full.length - 1 : -1;
      const index = indexPixels(data, W, H, full, dither, ti);
      gif.writeFrame(index, W, H, {
        ...(i === 0 || mode === 'frame' ? { palette: full } : {}),
        delay: gifDelay(i, fps),
        ...(i === 0 ? { repeat: loop ? 0 : -1 } : {}),
        ...(reserve ? { transparent: true, transparentIndex: ti } : {}),
      });
    },
  }).then(r => notes.push(...r.warnings));
  gif.finish();
  const bytes = gif.bytesView();
  return { blob: new Blob([bytes.slice() as BlobPart], { type: 'image/gif' }), name: exportName(p, 'gif'), mime: 'image/gif', audio: 'none', notes };
}

/** Rough ceiling of a PNG sequence kept for one .zip (the frames stay in the browser until it is saved). */
export const PNG_ZIP_MAX_BYTES = 1.5e9;

async function encodePngs(p: Project, o: MovieOptions, c: Common): Promise<MovieResult> {
  const size = outputSize(p, o, false);
  const times = frameTimes(p, { fps: c.fps, from: c.start, to: c.end });
  if (times.length > 0xfffe) throw new Error(`Son ${times.length} cuadros: un .zip admite 65 535 archivos. Acorta el tramo o baja los cuadros por segundo.`);
  // a PNG of a busy frame weighs about 1.5 bytes per pixel
  const guess = size.W * size.H * 1.5 * times.length;
  if (guess > PNG_ZIP_MAX_BYTES) throw new Error(`La secuencia pesaría unos ${Math.round(guess / 1e9 * 10) / 10} GB: demasiado para crearla en el navegador. Baja el tamaño, los cuadros por segundo o acorta el tramo (o usa MP4/WebM).`);
  const notes = [...size.notes];
  if (p.sources.some(s => s.kind === 'video' && s.hasAudio) && (o.audio ?? 'keep') === 'keep') notes.push('La secuencia PNG no lleva sonido: exporta el video original si lo necesitas.');
  const files: ZipInput[] = [];
  // the project's own date on every entry: the same project gives the same .zip, byte for byte
  const stamp = new Date(p.updated || 0);
  const base = exportName(p, 'png').replace(/\.png$/, '');
  const loop = await frameLoop(p, {
    times, W: size.W, H: size.H, scale: size.scale, transparent: c.transparent, blob: c.blob, signal: o.signal,
    progress: (d, n) => c.report(d, n, 'Cuadro'),
    frame: async (canvas, i) => {
      const b = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
      if (!b) throw new Error('No se pudo crear el PNG de un cuadro.');
      files.push({ name: `${base}/${base}-${String(i + 1).padStart(6, '0')}.png`, data: b, date: stamp });
    },
  });
  notes.push(...loop.warnings);
  check(o.signal);
  o.onProgress?.({ done: times.length, total: times.length, label: 'Empaquetando el .zip…' });
  const readme = [
    'GLYPHOS — secuencia de cuadros',
    '',
    `Proyecto: ${p.name}`,
    `Cuadros: ${times.length}, ${size.W}×${size.H} px, ${c.fps} cuadros por segundo (${Math.round(times.length / c.fps * 100) / 100} s).`,
    `Tramo: desde ${Math.round(c.start * 1000) / 1000} s del proyecto.`,
    c.transparent ? 'Con transparencia real (canal alfa).' : 'Opaco, sobre el color de fondo del proyecto.',
    'Sin sonido.',
    '',
    'Para armar un video: impórtalos como secuencia de imágenes en tu editor con esa velocidad.',
  ].join('\n');
  const blob = await zip([{ name: `${base}/LEEME.txt`, data: readme, date: stamp }, ...files]);
  return { blob, name: exportName(p, 'zip', 'cuadros'), mime: 'application/zip', audio: 'none', notes };
}
