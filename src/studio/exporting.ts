import { useEffect, type RefObject } from 'react';
import { create } from 'zustand';
import type { GridSnapshot } from '../engine/engine';
import type { Recipe } from '../engine/recipe';
import { gridToAnsi, gridToText, type ColorDepth, type Frames } from '../exporters/text';
import { codecsAt, pickRecorderMime, recorderCaps, videoSupportAt, type VideoSupport } from './caps';
import { downloadBlob } from './download';
import { getEngine } from './engineBridge';
import { mediaElement } from './media';
import { offscreenEngine, stageSize, type OffscreenSize } from './offscreen';
import { toast } from './toast';
import { repairAvcDescription } from '../exporters/avc';

export type SizeSpec = { kind: 'view'; scale: number } | { kind: 'fixed'; w: number; h: number };

export const SIZE_PRESETS: Array<{ id: string; name: string; spec: SizeSpec }> = [
  { id: 'v1', name: 'Como la vista', spec: { kind: 'view', scale: 1 } },
  { id: 'v2', name: 'Vista ×2', spec: { kind: 'view', scale: 2 } },
  { id: 'v4', name: 'Vista ×3', spec: { kind: 'view', scale: 3 } },
  { id: 'hd', name: '1920×1080', spec: { kind: 'fixed', w: 1920, h: 1080 } },
  { id: '4k', name: '3840×2160 (4K)', spec: { kind: 'fixed', w: 3840, h: 2160 } },
  { id: 'sq', name: '1080×1080', spec: { kind: 'fixed', w: 1080, h: 1080 } },
  { id: 'story', name: '1080×1920 vertical', spec: { kind: 'fixed', w: 1080, h: 1920 } },
  { id: 'og', name: '1200×630 (redes)', spec: { kind: 'fixed', w: 1200, h: 630 } },
];

export function resolveSize(spec: SizeSpec, even = false): OffscreenSize & { W: number; H: number } {
  const { cssW, cssH } = stageSize();
  let size: OffscreenSize;
  if (spec.kind === 'view') size = { cssW, cssH, pixelRatio: spec.scale };
  // fixed sizes are exact: rounding the CSS width first gave e.g. 1919×1080 for «1920×1080»
  else size = { cssW: (cssH * spec.w) / spec.h, cssH, pixelRatio: spec.h / cssH };
  let W = Math.round(size.cssW * size.pixelRatio), H = Math.round(size.cssH * size.pixelRatio);
  if (even) {
    if (W % 2) { size.cssW += 1 / size.pixelRatio; W += 1; }
    if (H % 2) { size.cssH += 1 / size.pixelRatio; H += 1; }
  }
  return { ...size, W, H };
}

export const liveTime = () => getEngine()?.time ?? 0;

/**
 * Engine time runs at motion.speed per real second (that's what the stage shows), so rendered clips step it
 * the same way. A perfect loop of `motion.loop` engine seconds lasts loop / speed real seconds.
 */
export const clipTime = (r: Recipe, start: number, seconds: number) => start + seconds * r.motion.speed;
export const loopSeconds = (r: Recipe) => (r.motion.loop > 0 && r.motion.speed > 0 ? r.motion.loop / r.motion.speed : 0);
const canvasBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), type, q));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r(null)));

export async function exportImage(r: Recipe, spec: SizeSpec, o: { transparent: boolean; format: 'png' | 'webp' | 'jpeg' }): Promise<Blob> {
  const size = resolveSize(spec);
  const eng = await offscreenEngine(r, size, { transparent: o.transparent && o.format !== 'jpeg' });
  try {
    eng.renderAt(liveTime());
    const blob = await canvasBlob(eng.canvas, 'image/' + o.format, o.format === 'png' ? undefined : 0.92);
    // a browser without that encoder silently returns a PNG: never save it under the wrong name
    if (blob.type && blob.type !== 'image/' + o.format) throw new Error(`este navegador no codifica ${o.format.toUpperCase()}; usa PNG`);
    return blob;
  } finally { eng.destroy(); }
}

/* ------------------------------------------------------------------ */
/* Video                                                               */
/* ------------------------------------------------------------------ */

export interface Progress { (p: number, label?: string): void }
/** `active`: a run is on its way (set by the component that started it). */
export interface Cancel { cancelled: boolean; active?: boolean }

/**
 * Closing the sheet or leaving the guide step stops the export it started: otherwise it ran on hidden,
 * without its progress or «Cancelar», downloaded later, and a second one could start beside it.
 */
export function useStopOnLeave(cancel: RefObject<Cancel>) {
  useEffect(() => () => {
    const c = cancel.current;
    if (c?.active && !c.cancelled) { c.cancelled = true; toast('Exportación cancelada: saliste antes de que terminara.'); }
  }, [cancel]);
}

/** What WebCodecs can encode at W×H (cached per size, see caps.ts). */
export const videoSupport = (W: number, H: number): Promise<VideoSupport> => videoSupportAt(W, H);

/**
 * The largest size preset below W×H at which this browser can encode `need` (any video when omitted),
 * for the «use a smaller size» suggestion. Null when no smaller preset works either.
 */
export async function smallerEncodable(W: number, H: number, need?: 'mp4' | 'webm'): Promise<{ id: string; name: string; W: number; H: number } | null> {
  const options = new Map<string, { id: string; name: string; W: number; H: number }>();
  for (const p of SIZE_PRESETS) {
    const s = resolveSize(p.spec, true);
    if (s.W * s.H < W * H && !options.has(`${s.W}x${s.H}`)) options.set(`${s.W}x${s.H}`, { id: p.id, name: p.name, W: s.W, H: s.H });
  }
  for (const p of [...options.values()].sort((a, b) => b.W * b.H - a.W * a.H)) {
    const s = await videoSupportAt(p.W, p.H);
    if (need ? s[need] : s.mp4 || s.webm) return p;
  }
  return null;
}

async function seekVideo(v: HTMLVideoElement, t: number) {
  const d = v.duration || 1;
  const target = ((t % d) + d) % d;
  if (Math.abs(v.currentTime - target) < 1e-3) return;
  await new Promise<void>(res => {
    const done = () => { v.removeEventListener('seeked', done); res(); };
    v.addEventListener('seeked', done);
    v.currentTime = target;
    setTimeout(done, 1500);
  });
}

/**
 * A video piece is rendered from the video's own frames: the video is paused and moved to each
 * frame's time before it is drawn (drawn as it played, a clip followed the wall clock: sped up on a
 * slow machine, or frozen if paused). Play resumes afterwards if it was playing.
 */
function videoFrames(r: Recipe) {
  const video = r.source === 'video' ? (mediaElement('video') as HTMLVideoElement | null) : null;
  const wasPaused = video?.paused ?? true;
  video?.pause();
  return {
    /** Moves the video to clip time `t` (real seconds from the clip's start time). */
    seek: async (t: number) => { if (video) await seekVideo(video, t * r.media.rate); },
    done: () => { if (video && !wasPaused) void video.play().catch(() => undefined); },
  };
}

/**
 * While a render runs, the video encoder's AVC description goes through repairAvcDescription before the
 * muxer sees it (the encoder is created inside mediabunny). Returns the function that puts things back.
 */
function withRepairedAvc(): () => void {
  const g = globalThis as unknown as { VideoEncoder?: typeof VideoEncoder };
  const Orig = g.VideoEncoder;
  if (!Orig) return () => {};
  class Repairing extends Orig {
    constructor(init: VideoEncoderInit) {
      super({
        ...init,
        output: (chunk, meta) => {
          const d = meta?.decoderConfig?.description;
          if (d && meta?.decoderConfig) {
            const bytes = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d);
            const fixed = /^avc1/.test(meta.decoderConfig.codec) ? repairAvcDescription(bytes) : null;
            if (fixed) meta = { ...meta, decoderConfig: { ...meta.decoderConfig, description: fixed } };
          }
          init.output(chunk, meta);
        },
      });
    }
  }
  g.VideoEncoder = Repairing;
  return () => { if (g.VideoEncoder === Repairing) g.VideoEncoder = Orig; };
}

/** Deterministic, frame-by-frame render: no dropped frames even on slow machines. */
export async function exportVideo(r: Recipe, spec: SizeSpec, o: { fps: number; seconds: number; format: 'mp4' | 'webm'; start: number }, progress: Progress, cancel: Cancel): Promise<Blob> {
  const mb = await import('mediabunny');
  const size = resolveSize(spec, true);
  const can = await codecsAt(size.W, size.H);
  if (o.format === 'mp4' ? !can.avc : !can.vp9 && !can.vp8) throw new Error(`este navegador no codifica ${o.format === 'mp4' ? 'H.264' : 'VP9 ni VP8'} a ${size.W}×${size.H}`);
  const codec = o.format === 'mp4' ? 'avc' : can.vp9 ? 'vp9' : 'vp8';
  const eng = await offscreenEngine(r, size);
  const clip = videoFrames(r);
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: o.format === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target });
  const src = new mb.CanvasSource(eng.canvas, { codec, quality: mb.QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(src, { frameRate: o.fps });
  const restore = codec === 'avc' ? withRepairedAvc() : () => {};
  try {
    await output.start();
    const n = Math.max(1, Math.round(o.seconds * o.fps));
    for (let i = 0; i < n; i++) {
      if (cancel.cancelled) { await output.cancel(); throw new Error('cancelado'); }
      const t = clipTime(r, o.start, i / o.fps);
      await clip.seek(o.start + i / o.fps);
      eng.renderAt(t, o.start + i / o.fps);
      await src.add(i / o.fps, 1 / o.fps);
      progress((i + 1) / n, `Fotograma ${i + 1} de ${n}`);
      if (i % 4 === 0) await nextFrame();
    }
    await output.finalize();
    return new Blob([target.buffer!], { type: o.format === 'mp4' ? 'video/mp4' : 'video/webm' });
  } finally {
    restore();
    eng.destroy();
    clip.done();
  }
}

/** Real-time capture of the live canvas (for the camera, or browsers without WebCodecs). */
export class LiveRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  mime = '';
  static supported() { return recorderCaps().ok; }
  start(fps = 30): boolean {
    const c = getEngine()?.canvas;
    if (!c || !LiveRecorder.supported()) return false;
    // the same choice the export sheet announces before recording (caps.ts: MP4 only with H.264 inside)
    this.mime = pickRecorderMime();
    if (!this.mime) return false;
    this.chunks = [];
    this.rec = new MediaRecorder(c.captureStream(fps), { mimeType: this.mime, videoBitsPerSecond: 16e6 });
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start(250);
    return true;
  }
  stop(): Promise<{ blob: Blob; ext: string }> {
    return new Promise(res => {
      const rec = this.rec;
      const done = () => res({ blob: new Blob(this.chunks, { type: this.mime }), ext: this.mime.includes('mp4') ? 'mp4' : 'webm' });
      this.rec = null;
      if (!rec) { res({ blob: new Blob(), ext: 'webm' }); return; }
      // a recorder that already stopped on its own (an error, the canvas went away) never fires «stop» again
      if (rec.state === 'inactive') { done(); return; }
      rec.onstop = done;
      rec.onerror = done;
      rec.stop();
    });
  }
  get active() { return !!this.rec; }
}

/**
 * The live recording in progress. It lives here, not in the export sheet: the sheet is modal, so to
 * record with the cursor the person closes it, and the recording must go on (stage chip, Recording.tsx)
 * until they stop it there or in the sheet.
 */
export const useRecording = create<{ rec: LiveRecorder | null; since: number; base: string }>(() => ({ rec: null, since: 0, base: '' }));

export function startRecording(base: string): boolean {
  if (useRecording.getState().rec) return true;
  const rec = new LiveRecorder();
  if (!rec.start(30)) return false;
  useRecording.setState({ rec, since: Date.now(), base });
  return true;
}

/** Stops the live recording and downloads it. `why` tells the person when it stops on its own. */
export async function stopRecording(why?: string) {
  const { rec, base } = useRecording.getState();
  if (!rec) return;
  useRecording.setState({ rec: null, since: 0 });
  const { blob, ext } = await rec.stop();
  // a recording stopped before the browser handed over any video (a very short one, or a machine too busy
  // to draw while recording) would download as an empty file that no player opens
  if (blob.size < 1024) {
    toast('La grabación salió vacía: el navegador no llegó a entregar video. Graba unos segundos más, o usa el video renderizado (no depende de la fluidez del equipo).', undefined, 9000);
    return;
  }
  downloadBlob(`${base}-directo.${ext}`, await tidyRecording(blob, ext === 'mp4' ? 'mp4' : 'webm'));
  if (why) toast(why, undefined, 6000);
}

/**
 * A live recording as players expect it. MediaRecorder writes WebM without its duration or seek index
 * (and, from a canvas, declaring an alpha channel that some players refuse to open) or MP4 in fragments.
 * The same video packets, not re-encoded, go into a regular WebM or a fast-start MP4; if that fails, the
 * recording goes out as the browser made it.
 */
async function tidyRecording(blob: Blob, ext: 'mp4' | 'webm'): Promise<Blob> {
  try {
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: ext === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target });
    const conv = await mb.Conversion.init({ input, output, video: { alpha: 'discard' }, audio: { discard: true } });
    if (!conv.isValid) return blob;
    await conv.execute();
    return target.buffer && target.buffer.byteLength > 1024 ? new Blob([target.buffer], { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' }) : blob;
  } catch {
    return blob;
  }
}

/* ------------------------------------------------------------------ */
/* GIF                                                                 */
/* ------------------------------------------------------------------ */

export async function exportGif(r: Recipe, width: number, o: { fps: number; seconds: number; start: number; colors: number }, progress: Progress, cancel: Cancel): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const { cssW, cssH } = stageSize();
  const pr = width / cssW;
  const eng = await offscreenEngine(r, { cssW, cssH, pixelRatio: pr });
  const clip = videoFrames(r);
  const W = eng.canvas.width, H = eng.canvas.height;
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const ctx = c2.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();
  const n = Math.max(1, Math.round(o.seconds * o.fps));
  // GIF delays are whole centiseconds: accumulate them so the clip keeps its exact length (e.g. 24 fps)
  const cs = (i: number) => Math.round((i * 100) / o.fps);
  try {
    for (let i = 0; i < n; i++) {
      if (cancel.cancelled) throw new Error('cancelado');
      const delay = (cs(i + 1) - cs(i)) * 10;
      await clip.seek(o.start + i / o.fps);
      eng.renderAt(clipTime(r, o.start, i / o.fps), o.start + i / o.fps);
      ctx.drawImage(eng.canvas, 0, 0);
      const { data } = ctx.getImageData(0, 0, W, H);
      const palette = quantize(data, o.colors);
      const index = applyPalette(data, palette);
      gif.writeFrame(index, W, H, { palette, delay, repeat: i === 0 ? 0 : undefined });
      progress((i + 1) / n, `Fotograma ${i + 1} de ${n}`);
      if (i % 2 === 0) await nextFrame();
    }
    gif.finish();
    return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
  } finally { eng.destroy(); clip.done(); }
}

/* ------------------------------------------------------------------ */
/* Character grid (text, ANSI, SVG, terminal)                          */
/* ------------------------------------------------------------------ */

function gridSize(r: Recipe, cols?: number, rows?: number): OffscreenSize {
  if (cols && rows) {
    const cw = Math.max(2, Math.round(r.glyph.cell)), ch = Math.max(2, Math.round(r.glyph.cell * r.glyph.aspect));
    return { cssW: cols * cw, cssH: rows * ch, pixelRatio: 1 };
  }
  const { cssW, cssH } = stageSize();
  return { cssW, cssH, pixelRatio: 1 };
}

/** Grid of the frame at `time`, plus the size of the canvas it was read from (the SVG uses it). */
export async function captureGrid(r: Recipe, cols?: number, rows?: number, time = liveTime()): Promise<GridSnapshot & { width: number; height: number }> {
  const eng = await offscreenEngine(r, gridSize(r, cols, rows));
  try { eng.renderAt(time); return { ...eng.readGrid(), width: eng.canvas.width, height: eng.canvas.height }; } finally { eng.destroy(); }
}

export async function captureFrames(
  r: Recipe, cols: number, rows: number, o: { fps: number; seconds: number; start: number; depth: ColorDepth; withBg: boolean },
  progress: Progress, cancel: Cancel,
): Promise<Frames> {
  const eng = await offscreenEngine(r, gridSize(r, cols, rows));
  const clip = videoFrames(r);
  const frames: string[] = [];
  const n = Math.max(1, Math.round(o.seconds * o.fps));
  try {
    for (let i = 0; i < n; i++) {
      if (cancel.cancelled) throw new Error('cancelado');
      await clip.seek(o.start + i / o.fps);
      eng.renderAt(clipTime(r, o.start, i / o.fps), o.start + i / o.fps);
      const g = eng.readGrid();
      const s = o.depth === 'none' ? gridToText(g) : gridToAnsi(g, o.depth, o.withBg);
      frames.push(s.replace(/\n$/, ''));
      progress((i + 1) / n);
      if (i % 6 === 0) await nextFrame();
    }
    return { cols, rows, fps: o.fps, frames };
  } finally { eng.destroy(); clip.done(); }
}
