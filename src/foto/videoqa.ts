/**
 * Test hooks of the studio's video editing (only with ?qa, loaded on demand by qa.ts): window.__fotoVideo.
 * tests/e2e/foto-video.spec.ts drives the real studio with them: it makes test clips here (the synthetic clip of
 * lane video's QA page — a square moving over a textured background, the frame number as a binary strip at the
 * top left, a 440 Hz tone from 0.5 s — and the CC0 portrait panning sideways), reads the video clock's state
 * while it plays, scores tracked and matted masks against the truth the clips were drawn from, and analyses
 * the sound of exported files. Nothing here is used by the studio itself.
 */
import { fitRect } from '../project/adjust';
import { sourceFit } from '../project/compositor';
import { evaluate } from '../project/evaluate';
import { storeBlob } from '../project/sources';
import { useProject } from '../project/store';
import type { MaskRasterPart, Project } from '../project/types';
import { videoPlayback } from './playback';
import { schedulerState } from './scheduler';

declare global {
  interface Window { __fotoVideo?: Record<string, unknown> }
}

export interface ClipSpec { w: number; h: number; fps: number; seconds: number; onset: number; freq: number; audio: boolean; size: number }
const DEFAULT: ClipSpec = { w: 320, h: 180, fps: 30, seconds: 3, onset: 0.5, freq: 440, audio: true, size: 36 };
const BITS = 10;

/** Where the square is at time t (top-left, px of the clip): lane video's QA clip (dev/video.ts squareAt). */
export function squareAt(s: ClipSpec, t: number): { x: number; y: number } {
  const k = t / Math.max(0.001, s.seconds);
  const scale = s.w / 320;
  return { x: Math.round((30 + k * 220) * scale), y: Math.round(s.h / 2 - s.size / 2 + Math.sin(t * 2.2) * 38 * (s.h / 180)) };
}

function paintFrame(x: CanvasRenderingContext2D, s: ClipSpec, i: number) {
  const t = i / s.fps;
  const { w, h } = s;
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#16324a'); g.addColorStop(0.5, '#3a5a3a'); g.addColorStop(1, '#4a2c4c');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const k = w / 320;
  for (let n = 0; n < 160; n++) {
    const px = rnd() * w, py = rnd() * h, r = (2 + rnd() * 6) * k;
    x.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 45%, ${35 + rnd() * 35}%, 0.8)`;
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  const b = Math.max(6, Math.round(8 * k));
  for (let bit = 0; bit < BITS; bit++) {
    x.fillStyle = (i >> bit) & 1 ? '#ffffff' : '#000000';
    x.fillRect(bit * b, 0, b, b);
  }
  const q = squareAt(s, t);
  const S = Math.round(s.size * k);
  x.fillStyle = '#ff5b1f';
  x.fillRect(q.x, q.y, S, S);
  x.fillStyle = '#ffb08a';
  x.fillRect(q.x + S * 0.2, q.y + S * 0.2, S * 0.25, S * 0.25);
  x.fillStyle = '#b8340c';
  x.fillRect(q.x + S * 0.55, q.y + S * 0.55, S * 0.3, S * 0.3);
}

async function b64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (d: string, type: string) => new Blob([Uint8Array.from(atob(d), c => c.charCodeAt(0))], { type });

/** The synthetic clip (VP9 + Opus WebM), as base64 for a file chooser. */
async function clip(o: Partial<ClipSpec> = {}) {
  const s = { ...DEFAULT, ...o };
  const mb = await import('mediabunny');
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  const x = c.getContext('2d')!;
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.WebMOutputFormat(), target });
  const codec = (await mb.canEncodeVideo('vp9', { width: s.w, height: s.h })) ? 'vp9' : 'vp8';
  const src = new mb.CanvasSource(c, { codec, quality: mb.QUALITY_VERY_HIGH, keyFrameInterval: 1 });
  output.addVideoTrack(src, { frameRate: s.fps });
  const audio = s.audio && (await mb.canEncodeAudio('opus'));
  const asrc = audio ? new mb.AudioSampleSource({ codec: 'opus', quality: mb.QUALITY_HIGH }) : null;
  if (asrc) output.addAudioTrack(asrc);
  await output.start();
  const n = Math.round(s.seconds * s.fps), sr = 48000;
  let written = 0;
  for (let i = 0; i < n; i++) {
    paintFrame(x, s, i);
    await src.add(i / s.fps, 1 / s.fps);
    if (asrc) {
      const upto = Math.round(((i + 1) / s.fps) * sr), len = upto - written;
      const data = new Float32Array(len * 2);
      for (let j = 0; j < len; j++) { const tt = (written + j) / sr; const v = tt >= s.onset ? 0.5 * Math.sin(2 * Math.PI * s.freq * (tt - s.onset)) : 0; data[j] = v; data[len + j] = v; }
      const smp = new mb.AudioSample({ data, format: 'f32-planar', numberOfChannels: 2, sampleRate: sr, timestamp: written / sr });
      await asrc.add(smp);
      smp.close();
      written = upto;
    }
  }
  await output.finalize();
  c.width = c.height = 0;
  const blob = new Blob([target.buffer!], { type: 'video/webm' });
  return { b64: await b64(blob), name: `cuadrado-${s.w}x${s.h}.webm`, spec: { ...s, audio: !!asrc }, codec, bytes: blob.size };
}

/* ------------------------------------------------------------------ the panning portrait */

/** Hand-drawn outline of the person in tests/fixtures/photos/retrato-pelo.jpg (1024×858 px), as in dev/video.ts. */
const PORTRAIT = [330, 72, 400, 66, 470, 80, 540, 110, 600, 160, 640, 220, 670, 290, 700, 360, 725, 440, 745, 520, 790, 590, 825, 650, 835, 740, 828, 858, 90, 858, 70, 760, 60, 660, 70, 600, 130, 570, 135, 500, 130, 420, 140, 340, 160, 260, 190, 190, 230, 130, 280, 90];
const PORTRAIT_CLIP = { w: 480, h: 400, fps: 10, seconds: 2, scale: 0.5, travel: 32 };
const portraitShift = (i: number) => Math.round((PORTRAIT_CLIP.travel * i) / Math.max(1, PORTRAIT_CLIP.fps * PORTRAIT_CLIP.seconds - 1));

/** The CC0 portrait panning sideways (480×400, 10 fps, 2 s, no sound), from the photo's bytes. */
async function portraitClip(photo: string) {
  const bmp = await createImageBitmap(fromB64(photo, 'image/jpeg'));
  const mb = await import('mediabunny');
  const P = PORTRAIT_CLIP;
  const c = document.createElement('canvas');
  c.width = P.w; c.height = P.h;
  const x = c.getContext('2d')!;
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.WebMOutputFormat(), target });
  const src = new mb.CanvasSource(c, { codec: 'vp9', quality: mb.QUALITY_VERY_HIGH, keyFrameInterval: 1 });
  output.addVideoTrack(src, { frameRate: P.fps });
  await output.start();
  for (let i = 0; i < P.fps * P.seconds; i++) {
    x.drawImage(bmp, -portraitShift(i), 0, bmp.width * P.scale, bmp.height * P.scale);
    await src.add(i / P.fps, 1 / P.fps);
  }
  await output.finalize();
  bmp.close();
  return { b64: await b64(new Blob([target.buffer!], { type: 'video/webm' })), name: 'retrato-paneo.webm' };
}

/* ------------------------------------------------------------------ masks against the truth */

const project = (): Project => {
  const p = useProject.getState().project;
  if (!p) throw new Error('no project');
  return p;
};

async function loadCoverage(id: string, w: number, h: number): Promise<Float32Array> {
  const got = await storeBlob(id);
  if (!got) throw new Error('falta la máscara ' + id);
  const bmp = await createImageBitmap(got.blob);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const d = x.getImageData(0, 0, w, h).data;
  const m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4] / 255;
  c.width = c.height = 0;
  return m;
}

function iou(a: Float32Array, b: Float32Array): number {
  let i = 0, u = 0;
  for (let k = 0; k < a.length; k++) { const x = a[k] >= 0.5, y = b[k] >= 0.5; if (x && y) i++; if (x || y) u++; }
  return u ? i / u : 1;
}

function partOf(layerId: string, index: number): { part: MaskRasterPart; p: Project } {
  const p = project();
  const l = p.layers.find(x => x.id === layerId);
  const parts = l?.mask?.parts ?? [];
  const part = parts[index < 0 ? parts.length + index : index];
  if (!part || part.kind !== 'raster') throw new Error('esa parte no es una máscara de imagen');
  return { part, p };
}

/**
 * IoU of each frame of a tracked part with the square of the synthetic clip (spec as made by clip()), in the
 * frame space the masks are stored in (the video placed with its layer's fit), and the part's keyframe names.
 */
async function trackScores(layerId: string, index: number, spec: ClipSpec) {
  const { part, p } = partOf(layerId, index);
  const s = p.sources.find(x => x.kind === 'video')!;
  const frames = part.frames ?? [{ t: 0, media: part.media }];
  const w = frames[0].media.w, h = frames[0].media.h;
  const place = fitRect(s.w, s.h, w, h, sourceFit(p, s.id));
  const S = spec.size * (spec.w / 320);
  const out: number[] = [];
  for (const f of frames) {
    const m = await loadCoverage(f.media.id!, w, h);
    const fi = Math.round(f.t * spec.fps);
    const q = squareAt(spec, fi / spec.fps);
    const kx = place.w / spec.w, ky = place.h / spec.h;
    const truth = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const vx = (x + 0.5 - place.x) / kx, vy = (y + 0.5 - place.y) / ky;
      if (vx >= q.x && vx < q.x + S && vy >= q.y && vy < q.y + S) truth[y * w + x] = 1;
    }
    out.push(Math.round(iou(m, truth) * 1000) / 1000);
  }
  return { scores: out, times: frames.map(f => f.t), names: frames.map(f => f.media.name ?? ''), ids: frames.map(f => f.media.id ?? ''), origin: part.origin, op: part.op };
}

/** IoU of each frame of a matted part with the portrait's outline (moved with the pan), and its frame-to-frame change. */
async function portraitScores(layerId: string, index: number) {
  const { part, p } = partOf(layerId, index);
  const frames = part.frames ?? [];
  const w = frames[0].media.w, h = frames[0].media.h;
  const scores: number[] = [];
  const P = PORTRAIT_CLIP;
  const s = p.sources.find(x => x.kind === 'video')!;
  const place = fitRect(s.w, s.h, w, h, sourceFit(p, s.id));
  for (const [i, f] of frames.entries()) {
    const m = await loadCoverage(f.media.id!, w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    const k = place.w / P.w;
    x.beginPath();
    for (let j = 0; j < PORTRAIT.length; j += 2) {
      const px = place.x + (PORTRAIT[j] * P.scale - portraitShift(i)) * k, py = place.y + PORTRAIT[j + 1] * P.scale * k;
      if (j === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
    x.fillStyle = '#fff';
    x.fill();
    const d = x.getImageData(0, 0, w, h).data;
    const truth = new Float32Array(w * h);
    for (let j = 0; j < truth.length; j++) truth[j] = d[j * 4] / 255;
    scores.push(Math.round(iou(m, truth) * 1000) / 1000);
  }
  return { scores, frames: frames.length, origin: part.origin, op: part.op };
}

/* ------------------------------------------------------------------ sound of exported files */

/** The tone in a file's sound: where it starts after ≥ 0.2 s of silence (file clock) and its frequency. */
async function tone(data: string, type: string) {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(fromB64(data, type)), formats: mb.ALL_FORMATS });
  try {
    const a = await input.getPrimaryAudioTrack();
    const v = await input.getPrimaryVideoTrack();
    if (!a) return null;
    const sr = a.sampleRate;
    const chunks: Float32Array[] = [];
    let start = NaN;
    for await (const s of new mb.AudioSampleSink(a).samples()) {
      if (Number.isNaN(start)) start = s.timestamp;
      const buf = new Float32Array(s.numberOfFrames);
      s.copyTo(buf, { planeIndex: 0, format: 'f32-planar' });
      chunks.push(buf);
      s.close();
    }
    const n = chunks.reduce((k, c) => k + c.length, 0);
    const d = new Float32Array(n);
    let at = 0;
    for (const c of chunks) { d.set(c, at); at += c.length; }
    if (Number.isNaN(start)) start = 0;
    const onsets: number[] = [];
    let quiet = sr;
    for (let i = 0; i < d.length; i++) {
      if (Math.abs(d[i]) > 0.12) { if (quiet > sr * 0.2) onsets.push(start + i / sr); quiet = 0; } else quiet++;
    }
    let freq = 0;
    if (onsets.length) {
      const i0 = Math.round((onsets[0] - start + 0.05) * sr), i1 = Math.min(d.length - 1, i0 + Math.round(0.4 * sr));
      let z = 0;
      for (let i = i0 + 1; i <= i1; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) z++;
      freq = z / 2 / ((i1 - i0) / sr);
    }
    return { onsets, freq, start, duration: await a.computeDuration(), videoStart: v ? await v.getFirstTimestamp() : 0, codec: a.codec ?? null };
  } finally { input.dispose(); }
}

/* ------------------------------------------------------------------ the clock while it plays */

/** The video clock and its elements now: what plays, whether it is heard, how far the picture is from the sound. */
function playState() {
  const pb = videoPlayback();
  const p = useProject.getState().project;
  const t = useProject.getState().time;
  const els = [...document.querySelectorAll<HTMLVideoElement>('body > video[aria-hidden="true"]')].filter(v => v.src.startsWith('blob:'));
  const lf = p ? evaluate(p, t).layers.find(l => l.source?.kind === 'video') : null;
  return {
    clock: pb ? 'video' : 'rAF',
    playing: pb?.playing ?? false, reverse: pb?.reverse ?? false, rate: pb?.rate ?? 1, t, srcTime: lf?.srcTime ?? null,
    elements: els.map(v => ({ muted: v.muted, paused: v.paused, time: v.currentTime, rate: v.playbackRate })),
    stats: pb?.stats() ?? null,
    sched: schedulerState(),
  };
}

export function installVideoQA() {
  window.__fotoVideo = { clip, portraitClip, squareAt, trackScores, portraitScores, tone, playState };
}
