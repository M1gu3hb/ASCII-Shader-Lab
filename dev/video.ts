/**
 * QA page for lane «video» (not part of the production build): a synthetic clip made here with mediabunny (a
 * square moving over a textured background, the frame number as a binary strip at the top left, a 440 Hz tone
 * from 0.5 s), a project over it (the video, an ASCII layer on the tracked square, a stretch in another style),
 * the playback clock, every movie export with progress and cancel, tracking with a correction, and timings.
 * window.vq is what tests/e2e/video.spec.ts drives.
 */
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/martian-mono/latin-700.css';
import '@fontsource/vt323/latin-400.css';
import type { MediaRef, Recipe } from '../src/engine/recipe';
import { PRESETS } from '../src/studio/presets';
import { put } from '../src/studio/mediaStore';
import { Compositor } from '../src/project/compositor';
import { newLayer, projectFromVideo, uid } from '../src/project/normalize';
import { createSourceProvider, keepBlob } from '../src/project/sources';
import type { MaskRasterPart, Project } from '../src/project/types';
import { unzip } from '../src/shared/zip';
import {
  correctTrack, createPlayback, exportMovie, frameAt, lastTrackStats, movieFormatsFor, movieResources, setTrackSegmenter, trackObject,
  type FormatInfo, type MovieOptions, type Playback, type Segmenter,
} from '../src/video/index';
import { geometry } from '../src/video/track';
import { glFlowAvailable } from '../src/video/flow-gl';
import { flow as cpuFlow, lumaOf } from '../src/video/flow';
import { glFlow } from '../src/video/flow-gl';
import { iou } from '../src/video/sdf';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const status = (s: string) => { $('#status').textContent = s; };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r(null)));

/* ------------------------------------------------------------------ the synthetic clip */

export interface ClipSpec {
  w: number; h: number; fps: number; seconds: number;
  /** Tone start (s) and frequency; the sound is silent before. */
  onset: number; freq: number;
  codec: 'vp9' | 'vp8' | 'av1';
  audio: boolean;
  /** Size of the moving square (px). */
  size: number;
}
const DEFAULT_CLIP: ClipSpec = { w: 320, h: 180, fps: 30, seconds: 3, onset: 0.5, freq: 440, codec: 'vp9', audio: true, size: 36 };

/** Where the square is at time t (top-left, px of the clip). */
export function squareAt(s: ClipSpec, t: number): { x: number; y: number } {
  const k = t / Math.max(0.001, s.seconds);
  const scale = s.w / 320;
  return { x: Math.round((30 + k * 220) * scale), y: Math.round(s.h / 2 - s.size / 2 + Math.sin(t * 2.2) * 38 * (s.h / 180)) };
}

const BITS = 10;
/** Paints frame i: textured background, strip with i in binary (top left), the orange square. */
function paintFrame(x: CanvasRenderingContext2D, s: ClipSpec, i: number) {
  const t = i / s.fps;
  const { w, h } = s;
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#16324a'); g.addColorStop(0.5, '#3a5a3a'); g.addColorStop(1, '#4a2c4c');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // texture: soft dots on a fixed pseudo-random layout (so the flow has something to hold on to)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const k = w / 320;
  for (let n = 0; n < 160; n++) {
    const px = rnd() * w, py = rnd() * h, r = (2 + rnd() * 6) * k;
    x.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 45%, ${35 + rnd() * 35}%, 0.8)`;
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  // frame number strip
  const b = Math.max(6, Math.round(8 * k));
  for (let bit = 0; bit < BITS; bit++) {
    x.fillStyle = (i >> bit) & 1 ? '#ffffff' : '#000000';
    x.fillRect(bit * b, 0, b, b);
  }
  // the square, with a little texture inside
  const q = squareAt(s, t);
  const S = Math.round(s.size * k);
  x.fillStyle = '#ff5b1f';
  x.fillRect(q.x, q.y, S, S);
  x.fillStyle = '#ffb08a';
  x.fillRect(q.x + S * 0.2, q.y + S * 0.2, S * 0.25, S * 0.25);
  x.fillStyle = '#b8340c';
  x.fillRect(q.x + S * 0.55, q.y + S * 0.55, S * 0.3, S * 0.3);
}

/** Reads the frame number strip of a picture (the clip drawn 1:1 or scaled by `k`). */
export function readStrip(c: HTMLCanvasElement, k = 1, clipW = 320): number {
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const b = Math.max(6, Math.round(8 * (clipW / 320))) * k;
  let v = 0;
  for (let bit = 0; bit < BITS; bit++) {
    const d = x.getImageData(Math.floor(bit * b + b / 2), Math.floor(b / 2), 1, 1).data;
    if (d[0] + d[1] + d[2] > 384) v |= 1 << bit;
  }
  return v;
}

async function makeClip(o: Partial<ClipSpec> = {}): Promise<{ ref: MediaRef; spec: ClipSpec; bytes: number; ms: number }> {
  const s = { ...DEFAULT_CLIP, ...o };
  const t0 = performance.now();
  const mb = await import('mediabunny');
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  const x = c.getContext('2d')!;
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.WebMOutputFormat(), target });
  const src = new mb.CanvasSource(c, { codec: s.codec, quality: mb.QUALITY_VERY_HIGH, keyFrameInterval: 1 });
  output.addVideoTrack(src, { frameRate: s.fps });
  let asrc: import('mediabunny').AudioSampleSource | null = null;
  if (s.audio) {
    asrc = new mb.AudioSampleSource({ codec: 'opus', quality: mb.QUALITY_HIGH });
    output.addAudioTrack(asrc);
  }
  await output.start();
  const n = Math.round(s.seconds * s.fps);
  const sr = 48000;
  let written = 0;
  for (let i = 0; i < n; i++) {
    paintFrame(x, s, i);
    await src.add(i / s.fps, 1 / s.fps);
    if (asrc) {
      const upto = Math.round(((i + 1) / s.fps) * sr);
      const len = upto - written;
      const data = new Float32Array(len * 2);
      for (let j = 0; j < len; j++) {
        const tt = (written + j) / sr;
        const v = tt >= s.onset ? 0.5 * Math.sin(2 * Math.PI * s.freq * (tt - s.onset)) : 0;
        data[j] = v; data[len + j] = v;
      }
      const smp = new mb.AudioSample({ data, format: 'f32-planar', numberOfChannels: 2, sampleRate: sr, timestamp: written / sr });
      await asrc.add(smp);
      smp.close();
      written = upto;
    }
    if (i % 10 === 0) await nextFrame();
  }
  await output.finalize();
  const blob = new Blob([target.buffer!], { type: 'video/webm' });
  const name = `cuadrado-${s.w}x${s.h}-${s.fps}fps-${s.seconds}s.webm`;
  const r = await put(blob, { kind: 'video', name, w: s.w, h: s.h });
  keepBlob(r.id, blob, name);
  c.width = c.height = 0;
  return { ref: { id: r.id, kind: 'video', name, type: 'video/webm', size: blob.size, w: s.w, h: s.h }, spec: s, bytes: blob.size, ms: Math.round(performance.now() - t0) };
}

/* ------------------------------------------------------------------ projects */

const preset = (space: 'media' | 'arte' | 'tipo', id: string): Recipe => {
  const p = PRESETS[space].find(x => x.id === id)!;
  const r = p.make();
  r.interact = { ...r.interact, mode: 'none', auto: false };
  return r;
};

let clip: { ref: MediaRef; spec: ClipSpec } | null = null;

/**
 * 'basic'   the video alone (preview = export checks at codec loss only);
 * 'layers'  the video + an ASCII layer over a rectangle around the square's path + a stretch (1–2 s) in another style;
 * 'loop'    'basic' but twice as long as the clip (the video and its sound loop);
 * 'span'    'basic' with the video only from 1 s (sound only from 1 s);
 * 'alpha'   a transparent project: the ASCII layer alone (for WebM alpha / PNG / GIF transparency).
 */
function buildProject(kind: string, c = clip!): Project {
  const s = c.spec;
  const p = projectFromVideo(c.ref, { duration: s.seconds, fps: s.fps, hasAudio: s.audio }, { name: `Prueba ${kind}` });
  p.seed = 'video-qa';
  const src = p.sources[0].id;
  if (kind === 'loop') p.time.duration = s.seconds * 2;
  if (kind === 'span') p.layers[0].span = { in: 1, out: s.seconds };
  if (kind === 'layers' || kind === 'alpha' || kind === 'tracked') {
    const style = preset('media', 'bloques');
    style.glyph.cell = 8;
    p.layers.push(newLayer('ascii', {
      name: 'Cuadrado en ASCII', source: src, style, opaque: true,
      mask: { invert: false, feather: 2, opacity: 1, parts: [{ kind: 'rect', op: 'add', x: 0.05, y: 0.12, w: 0.9, h: 0.76, rot: 0, soft: 0, alpha: 1 }] },
    }));
    const other = preset('media', 'fosforo');
    other.glyph.cell = 8;
    p.layers.push(newLayer('ascii', {
      name: 'Tramo en fósforo', source: src, style: other, opaque: false, opacity: 0.85, span: { in: 1, out: 2 },
      mask: { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'rect', op: 'add', x: 0.5, y: 0, w: 0.5, h: 1, rot: 0, soft: 0, alpha: 1 }] },
    }));
  }
  if (kind === 'alpha') {
    p.canvas.transparent = true;
    p.layers[0].visible = false;
    p.layers.splice(2, 1);
  }
  return p;
}

let project: Project | null = null;

/* ------------------------------------------------------------------ preview */

let playback: Playback | null = null;
let comp: Compositor | null = null;
const view = () => $<HTMLCanvasElement>('#view');
let lastStrip = -1;
let shown = 0;
const stripLog: Array<{ t: number; frame: number }> = [];

function mountPlayback() {
  playback?.dispose();
  comp?.destroy();
  const pb = createPlayback({
    project: project!,
    onFrame: async t => {
      const q = Number($<HTMLSelectElement>('#quality').value);
      await comp!.render(frameAt(project!, t), view(), { scale: q, quality: q >= 1 ? 'final' : 'preview' });
      lastStrip = readStrip(view(), q * (project!.canvas.w / clip!.spec.w), clip!.spec.w);
      stripLog.push({ t, frame: lastStrip });
      if (stripLog.length > 4000) stripLog.splice(0, 1000);
      $<HTMLInputElement>('#scrub').value = String(t);
      $('#time').textContent = `${t.toFixed(2).replace('.', ',')} s`;
      if (++shown % 8 === 0 || !playback?.playing) {
        const st = playback?.stats();
        if (st) $('#pstats').textContent = `cuadro del video ${lastStrip} · ${st.rendered} dibujados, ${st.dropped} saltados · render ${Math.round(st.renderMs)} ms (peor ${Math.round(st.worstMs)}) · búsquedas ${st.seeks} (${st.coalesced} agrupadas)${st.audioBlocked ? ' · sonido bloqueado por el navegador' : ''}`;
      }
    },
    onState: s => { $('#play').textContent = s.playing ? 'Pausa' : 'Reproducir'; $('#play').setAttribute('aria-pressed', String(s.playing)); },
  });
  comp = new Compositor({ provider: pb.provider });
  playback = pb;
  $<HTMLInputElement>('#scrub').max = String(project!.time.duration);
  void pb.seek(0);
}

/* ------------------------------------------------------------------ inspecting exported files */

interface Inspect {
  kind: string;
  video?: { codec: string | null; w: number; h: number; frames: number; duration: number; fps: number; alpha?: boolean };
  audio?: { codec: string | null; sampleRate: number; channels: number; duration: number; onsets: number[]; freq: number; start: number };
  gif?: { frames: number; w: number; h: number; durations: number[]; loop: boolean };
  zip?: { files: number; pngs: number; w: number; h: number; readme: boolean };
}

let lastBlob: Blob | null = null;
let lastOpts: MovieOptions | null = null;

/** Mono samples of a file's audio track (and its first timestamp). */
async function decodeAudio(blob: Blob): Promise<{ data: Float32Array; sr: number; start: number; codec: string | null; channels: number; duration: number } | null> {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const a = await input.getPrimaryAudioTrack();
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
    const data = new Float32Array(n);
    let at = 0;
    for (const c of chunks) { data.set(c, at); at += c.length; }
    return { data, sr, start: Number.isNaN(start) ? 0 : start, codec: a.codec ?? null, channels: a.numberOfChannels, duration: await a.computeDuration() };
  } finally { input.dispose(); }
}

/** Times (s, on the file's clock) where the tone starts after ≥ 0.2 s of silence, and its frequency. */
function analyseTone(d: Float32Array, sr: number, start: number): { onsets: number[]; freq: number } {
  const onsets: number[] = [];
  let quiet = sr; // samples of silence so far (start counts as silent)
  for (let i = 0; i < d.length; i++) {
    if (Math.abs(d[i]) > 0.12) {
      if (quiet > sr * 0.2) onsets.push(start + i / sr);
      quiet = 0;
    } else quiet++;
  }
  // frequency from zero crossings over 0.4 s after the first onset
  let freq = 0;
  if (onsets.length) {
    const i0 = Math.round((onsets[0] - start + 0.05) * sr), i1 = Math.min(d.length - 1, i0 + Math.round(0.4 * sr));
    let z = 0;
    for (let i = i0 + 1; i <= i1; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) z++;
    freq = z / 2 / ((i1 - i0) / sr);
  }
  return { onsets, freq };
}

async function inspect(blob = lastBlob!): Promise<Inspect> {
  const mb = await import('mediabunny');
  if (blob.type === 'image/gif') {
    const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
    await dec.tracks.ready;
    const tr = dec.tracks.selectedTrack!;
    await dec.completed;
    const durations: number[] = [];
    let w = 0, h = 0;
    for (let i = 0; i < tr.frameCount; i++) {
      const r = await dec.decode({ frameIndex: i });
      durations.push(Math.round((r.image.duration ?? 0) / 1000));
      w = r.image.displayWidth; h = r.image.displayHeight;
      r.image.close();
    }
    const loop = tr.repetitionCount === Infinity;
    dec.close();
    return { kind: 'gif', gif: { frames: tr.frameCount, w, h, durations, loop } };
  }
  if (blob.type === 'application/zip') {
    const entries = await unzip(blob);
    const pngs = entries.filter(e => e.name.endsWith('.png'));
    let w = 0, h = 0;
    if (pngs.length) {
      const bmp = await createImageBitmap(new Blob([(await pngs[0].read()) as BlobPart], { type: 'image/png' }));
      w = bmp.width; h = bmp.height; bmp.close();
    }
    return { kind: 'zip', zip: { files: entries.length, pngs: pngs.length, w, h, readme: entries.some(e => e.name.endsWith('LEEME.txt')) } };
  }
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  const out: Inspect = { kind: (await input.getFormat()).name };
  try {
    const v = await input.getPrimaryVideoTrack();
    if (v) {
      const stats = await v.computePacketStats();
      out.video = { codec: v.codec ?? null, w: await v.getDisplayWidth(), h: await v.getDisplayHeight(), frames: stats.packetCount, duration: await v.computeDuration(), fps: stats.averagePacketRate, alpha: await v.canBeTransparent().catch(() => false) };
    }
  } finally { input.dispose(); }
  const a = await decodeAudio(blob);
  if (a) {
    const tone = analyseTone(a.data, a.sr, a.start);
    out.audio = { codec: a.codec, sampleRate: a.sr, channels: a.channels, duration: a.duration, onsets: tone.onsets, freq: tone.freq, start: a.start };
  }
  return out;
}

/** Pixel difference between two canvases of the same size: mean absolute (0..255) and PSNR. */
function diff(a: HTMLCanvasElement, b: HTMLCanvasElement): { mae: number; psnr: number; alphaMae: number } {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  const da = a.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const db = b.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let s = 0, s2 = 0, sa = 0;
  for (let i = 0; i < da.length; i += 4) {
    for (let c = 0; c < 3; c++) { const e = da[i + c] - db[i + c]; s += Math.abs(e); s2 += e * e; }
    sa += Math.abs(da[i + 3] - db[i + 3]);
  }
  const n = w * h * 3;
  const mse = s2 / n;
  return { mae: s / n, psnr: mse > 0 ? 10 * Math.log10((255 * 255) / mse) : 99, alphaMae: sa / (w * h) };
}

/**
 * Exported frames (decoded) against render() at the same times (a fresh compositor, frame-exact video, not the
 * export's own), and against the frames before and after (the right frame must be the closest one).
 */
async function compare(times?: number[]): Promise<Array<{ t: number; mae: number; psnr: number; maePrev: number; maeNext: number; alphaMae: number }>> {
  const blob = lastBlob!, o = lastOpts!, p = project!;
  const fps = o.fps ?? p.time.fps;
  const start = o.start ?? 0;
  const W = o.width ?? p.canvas.w;
  const scale = W / p.canvas.w;
  const res: Array<{ t: number; mae: number; psnr: number; maePrev: number; maeNext: number; alphaMae: number }> = [];
  const frameOf = async (i: number): Promise<HTMLCanvasElement> => {
    const c = document.createElement('canvas');
    if (blob.type === 'image/gif') {
      const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
      const r = await dec.decode({ frameIndex: i });
      c.width = r.image.displayWidth; c.height = r.image.displayHeight;
      c.getContext('2d')!.drawImage(r.image, 0, 0);
      r.image.close(); dec.close();
      return c;
    }
    if (blob.type === 'application/zip') {
      const pngs = (await unzip(blob)).filter(e => e.name.endsWith('.png'));
      const bmp = await createImageBitmap(new Blob([(await pngs[i].read()) as BlobPart], { type: 'image/png' }));
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d')!.drawImage(bmp, 0, 0);
      bmp.close();
      return c;
    }
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
    try {
      const v = (await input.getPrimaryVideoTrack())!;
      const sink = new mb.CanvasSink(v, { alpha: true });
      const wc = await sink.getCanvas((await v.getFirstTimestamp()) + (i + 0.5) / fps);
      c.width = wc!.canvas.width; c.height = wc!.canvas.height;
      c.getContext('2d')!.drawImage(wc!.canvas as CanvasImageSource, 0, 0);
      return c;
    } finally { input.dispose(); }
  };
  const n = Math.round(((o.end ?? p.time.duration) - start) * fps);
  const idx = times ? times.map(t => Math.round((t - start) * fps)) : [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  const ref = new Compositor({ provider: createSourceProvider({ video: 'exact' }) });
  try {
    const renderAt = async (i: number) => {
      const c = document.createElement('canvas');
      await ref.render(frameAt(p, start + i / fps), c, { scale, quality: 'final', transparent: o.transparent ?? p.canvas.transparent });
      return c;
    };
    for (const i of idx) {
      const got = await frameOf(i);
      const want = await renderAt(i);
      const d = diff(got, want);
      const prev = i > 0 ? diff(got, await renderAt(i - 1)).mae : Infinity;
      const next = i < n - 1 ? diff(got, await renderAt(i + 1)).mae : Infinity;
      res.push({ t: start + i / fps, mae: d.mae, psnr: d.psnr, maePrev: prev, maeNext: next, alphaMae: d.alphaMae });
    }
  } finally { ref.destroy(); ref.provider.release(); }
  return res;
}

/* ------------------------------------------------------------------ export UI */

let exportAbort: AbortController | null = null;
const timings: Record<string, string> = {};
function timing(k: string, v: string) {
  timings[k] = v;
  $('#timings').innerHTML = Object.entries(timings).map(([a, b]) => `<tr><td>${a}</td><td class="mono">${b}</td></tr>`).join('');
}

async function runExport(o: MovieOptions, cancelAfter?: number): Promise<{ ok: boolean; error?: string; name?: string; ms: number; size?: number; mime?: string; audio?: string; notes?: string[]; progress: number; labels: string[]; cancelMs?: number }> {
  exportAbort?.abort();
  const ac = new AbortController();
  exportAbort = ac;
  const labels: string[] = [];
  let progress = 0;
  let abortAt = 0;
  $<HTMLButtonElement>('#go').disabled = true;
  $<HTMLButtonElement>('#cancel').disabled = false;
  const t0 = performance.now();
  try {
    const r = await exportMovie(project!, {
      ...o, signal: ac.signal,
      onProgress: pr => {
        progress = pr.done;
        if (labels.length < 400) labels.push(pr.label);
        $<HTMLProgressElement>('#prog').value = pr.total ? pr.done / pr.total : 0;
        $('#plabel').textContent = pr.label;
        if (cancelAfter !== undefined && pr.done >= cancelAfter && !ac.signal.aborted) { abortAt = performance.now(); ac.abort(); }
      },
    });
    const ms = Math.round(performance.now() - t0);
    lastBlob = r.blob; lastOpts = o;
    const li = document.createElement('li');
    const url = URL.createObjectURL(r.blob);
    li.innerHTML = `<a href="${url}" download="${r.name}">${r.name}</a> <span class="mono">${(r.blob.size / 1024).toFixed(0)} KB · ${ms} ms · sonido: ${r.audio}</span><ul class="notes">${r.notes.map(n => `<li>${n}</li>`).join('')}</ul>`;
    $('#results').prepend(li);
    timing(`Exportar ${o.format}${o.width ? ` ${o.width}px` : ''}`, `${ms} ms, ${(r.blob.size / 1024).toFixed(0)} KB, sonido ${r.audio}`);
    return { ok: true, name: r.name, ms, size: r.blob.size, mime: r.mime, audio: r.audio, notes: r.notes, progress, labels };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    $('#plabel').textContent = (e as Error).message;
    return { ok: false, error: `${(e as Error).name}: ${(e as Error).message}`, ms, progress, labels, cancelMs: abortAt ? Math.round(performance.now() - abortAt) : undefined };
  } finally {
    $<HTMLButtonElement>('#go').disabled = false;
    $<HTMLButtonElement>('#cancel').disabled = true;
    if (exportAbort === ac) exportAbort = null;
  }
}

let formats: FormatInfo[] = [];
async function refreshFormats() {
  formats = await movieFormatsFor(project!);
  const sel = $<HTMLSelectElement>('#fmt');
  const cur = sel.value;
  sel.innerHTML = formats.map(f => `<option value="${f.format}" ${f.available ? '' : 'disabled'}>${f.label}${f.available ? '' : ' (no disponible)'}</option>`).join('');
  if (cur) sel.value = cur;
  showFormat();
}
function showFormat() {
  const f = formats.find(x => x.format === $<HTMLSelectElement>('#fmt').value);
  $('#fmtInfo').textContent = f ? (f.available ? f.limits : f.why ?? '') : '';
  $('#gifopts').style.display = f?.format === 'gif' ? '' : 'none';
}

/* ------------------------------------------------------------------ tracking */

/**
 * A stand-in for the model that sees only the frame (for tests and this page): the orange square's pixels,
 * the connected part under a positive point or inside the box. `bad`: frames (read from the strip) where it
 * gets confused like a real model can — automatic prompts (with a box or negative points) get a mask 1.6 times
 * too big around the square; a person's plain click still gets the right one.
 */
function oracle(opts: { bad?: [number, number] } = {}): Segmenter & { calls: number } {
  const seg = {
    calls: 0,
    async open(frame: HTMLCanvasElement) {
      const w = frame.width, h = frame.height;
      const d = frame.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
      const k = w / project!.canvas.w;
      const idx = readStrip(frame, k * (project!.canvas.w / clip!.spec.w), clip!.spec.w);
      const orange = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
        // the square's three tones (orange, light, dark), not the background's
        if ((r > 200 && g > 50 && g < 200 && b < 170 && r - b > 70) || (r > 150 && r < 215 && g < 80 && b < 40)) orange[i] = 1;
      }
      return {
        w, h,
        async mask(p: { points: Array<{ x: number; y: number; positive: boolean }>; box?: { x: number; y: number; w: number; h: number } }) {
          seg.calls++;
          const out = new Float32Array(w * h);
          const inBox = (x: number, y: number) => !p.box || (x >= p.box.x && y >= p.box.y && x < p.box.x + p.box.w && y < p.box.y + p.box.h);
          let x0 = w, y0 = h, x1 = -1, y1 = -1;
          const pos = p.points.filter(q => q.positive);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (!orange[y * w + x] || !inBox(x, y)) continue;
            // with points and no box: only near a positive point (the connected square)
            if (!p.box && pos.length && !pos.some(q => Math.abs(q.x - x) < 60 * k && Math.abs(q.y - y) < 60 * k)) continue;
            out[y * w + x] = 1;
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          }
          if (x1 < 0) return null;
          const confused = opts.bad && idx >= opts.bad[0] && idx <= opts.bad[1] && (!!p.box || p.points.some(q => !q.positive));
          if (confused) {
            const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = ((x1 - x0) / 2) * 1.6, hh = ((y1 - y0) / 2) * 1.6;
            out.fill(0);
            for (let y = Math.max(0, Math.floor(cy - hh)); y < Math.min(h, cy + hh); y++) for (let x = Math.max(0, Math.floor(cx - hw)); x < Math.min(w, cx + hw); x++) out[y * w + x] = 1;
          }
          return out;
        },
        dispose() {},
      };
    },
  };
  return seg;
}

/** Ground truth: the square's mask in the mask geometry of the tracker, at project time t. */
function truthMask(t: number, g: { w: number; h: number; place: { x: number; y: number; w: number; h: number } }): Float32Array {
  const s = clip!.spec;
  const fi = Math.round(t * s.fps);
  const q = squareAt(s, fi / s.fps);
  const kx = g.place.w / s.w, ky = g.place.h / s.h;
  const m = new Float32Array(g.w * g.h);
  const S = s.size * (s.w / 320);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const vx = (x + 0.5 - g.place.x) / kx, vy = (y + 0.5 - g.place.y) / ky;
    if (vx >= q.x && vx < q.x + S && vy >= q.y && vy < q.y + S) m[y * g.w + x] = 1;
  }
  return m;
}

/** IoU of each tracked frame with the ground truth. */
async function scoreTrack(part: MaskRasterPart): Promise<number[]> {
  const g = geometry(project!, project!.sources[0]);
  const out: number[] = [];
  const cv = document.createElement('canvas');
  cv.width = g.w; cv.height = g.h;
  const x = cv.getContext('2d', { willReadFrequently: true })!;
  const { storeBlob } = await import('../src/project/sources');
  for (const f of part.frames ?? []) {
    const got = await storeBlob(f.media.id!);
    const bmp = await createImageBitmap(got!.blob);
    x.clearRect(0, 0, g.w, g.h);
    x.drawImage(bmp, 0, 0, g.w, g.h);
    bmp.close();
    const d = x.getImageData(0, 0, g.w, g.h).data;
    const m = new Float32Array(g.w * g.h);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4] / 255;
    out.push(Math.round(iou(m, truthMask(f.t, g)) * 1000) / 1000);
  }
  return out;
}

let tracked: MaskRasterPart | null = null;
let trackAbort: AbortController | null = null;

async function runTrack(o: { segmenter?: 'oracle' | 'model'; keyEvery?: number; bad?: [number, number]; start?: number; end?: number } = {}) {
  const s = clip!.spec;
  const useOracle = (o.segmenter ?? 'oracle') === 'oracle';
  const orc = useOracle ? oracle({ bad: o.bad }) : null;
  setTrackSegmenter(orc);
  const start = o.start ?? 0, end = o.end ?? s.seconds;
  const q = squareAt(s, start);
  const S = s.size * (s.w / 320);
  const pt = { x: (q.x + S / 2) / s.w, y: (q.y + S / 2) / s.h, positive: true };
  trackAbort = new AbortController();
  $<HTMLButtonElement>('#tcancel').disabled = false;
  const t0 = performance.now();
  try {
    const part = await trackObject(project!, {
      source: project!.sources[0].id, layer: project!.layers[1]?.id ?? project!.layers[0].id, points: [pt], start, end,
      keyEvery: o.keyEvery ?? 0.5, signal: trackAbort.signal,
      onProgress: pr => { $<HTMLProgressElement>('#tprog').value = pr.done / pr.total; $('#tlabel').textContent = pr.label; },
    });
    const ms = Math.round(performance.now() - t0);
    tracked = part;
    const scores = await scoreTrack(part);
    const stats = lastTrackStats();
    timing(`Seguir (${useOracle ? 'oráculo' : 'modelo'}) ${part.frames!.length} cuadros`, `${ms} ms · flujo ${stats?.flowBackend} ${Math.round(stats?.flowMs ?? 0)} ms · modelo ${Math.round(stats?.modelMs ?? 0)} ms · IoU media ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3)}`);
    await showTrack(part);
    $<HTMLButtonElement>('#correct').disabled = false;
    applyTracked(part);
    return { ok: true, ms, frames: part.frames!.length, scores, stats, names: part.frames!.map(f => f.media.name), calls: orc?.calls ?? 0 };
  } catch (e) {
    return { ok: false, error: `${(e as Error).name}: ${(e as Error).message}`, ms: Math.round(performance.now() - t0) };
  } finally {
    $<HTMLButtonElement>('#tcancel').disabled = true;
    trackAbort = null;
  }
}

async function runCorrect(o: { t: number; segmenter?: 'oracle' | 'model'; bad?: [number, number] }) {
  if (!tracked) throw new Error('primero sigue el objeto');
  const s = clip!.spec;
  if ((o.segmenter ?? 'oracle') === 'oracle') setTrackSegmenter(oracle({ bad: o.bad }));
  const fi = Math.round(o.t * s.fps);
  const q = squareAt(s, fi / s.fps);
  const S = s.size * (s.w / 320);
  const before = await scoreTrack(tracked);
  const t0 = performance.now();
  const part = await correctTrack(project!, tracked, { t: o.t, points: [{ x: (q.x + S / 2) / s.w, y: (q.y + S / 2) / s.h, positive: true }] }, { source: project!.sources[0].id, layer: project!.layers[1]?.id ?? '' });
  const ms = Math.round(performance.now() - t0);
  const after = await scoreTrack(part);
  const stats = lastTrackStats();
  const changed = part.frames!.map((f, i) => f.media.id !== tracked!.frames![i].media.id);
  tracked = part;
  timing('Corregir un cuadro', `${ms} ms · recalculados ${stats?.frames} cuadros`);
  await showTrack(part);
  applyTracked(part);
  return { ms, before, after, changed, names: part.frames!.map(f => f.media.name), stats };
}

/** The tracked mask on the ASCII layer (the «layers» project's first ASCII layer). */
function applyTracked(part: MaskRasterPart) {
  const l = project!.layers.find(x => x.kind === 'ascii');
  if (!l) return;
  l.mask = { invert: false, feather: 1, opacity: 1, parts: [part] };
  playback?.setProject(project!);
}

async function showTrack(part: MaskRasterPart) {
  const box = $('#trackView');
  box.innerHTML = '';
  const { storeBlob } = await import('../src/project/sources');
  const frames = part.frames ?? [];
  for (let i = 0; i < frames.length; i += Math.max(1, Math.floor(frames.length / 12))) {
    const got = await storeBlob(frames[i].media.id!);
    if (!got) continue;
    const bmp = await createImageBitmap(got.blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    bmp.close();
    c.title = `${frames[i].t.toFixed(2)} s ${frames[i].media.name ?? ''}`;
    box.appendChild(c);
  }
}

/* ------------------------------------------------------------------ measurements */

/** Plays for `ms` and returns the clock's numbers and the frames the preview showed. */
async function playFor(ms: number, o: { reverse?: boolean; rate?: number; from?: number; loop?: { start: number; end: number } | null; scale?: number } = {}) {
  const pb = playback!;
  if (o.scale) $<HTMLSelectElement>('#quality').value = String(o.scale);
  pb.pause();
  // the timeline's convention: a negative rate is reverse
  pb.setRate((o.rate ?? 1) * (o.reverse ? -1 : 1));
  pb.setLoop(o.loop ?? null);
  await pb.seek(o.from ?? (o.reverse ? project!.time.duration - 0.05 : 0));
  stripLog.length = 0;
  pb.resetStats();
  await pb.play();
  await new Promise(r => setTimeout(r, ms));
  pb.pause();
  await new Promise(r => setTimeout(r, 100));
  return { stats: pb.stats(), log: stripLog.slice(), t: pb.t };
}

/** 1080p 30 fps clip, video + ASCII layer (2 layers), played for `seconds`: frames shown vs frames the video had. */
async function measurePlayback(seconds = 6, scale = 0.5) {
  const c = await makeClip({ w: 1920, h: 1080, fps: 30, seconds: Math.max(4, seconds + 1), size: 216, audio: true });
  clip = c;
  project = buildProject('layers');
  project.layers.splice(2, 1);
  mountPlayback();
  await refreshFormats();
  await nextFrame();
  const r = await playFor(seconds * 1000, { scale });
  const distinct = new Set(r.log.map(x => x.frame)).size;
  const expected = Math.round(r.stats.seconds * 30);
  const out = { seconds: r.stats.seconds, rendered: r.stats.rendered, distinctFrames: distinct, sourceFrames: expected, dropped: Math.max(0, expected - distinct), renderMs: Math.round(r.stats.renderMs), worstMs: Math.round(r.stats.worstMs), ticksDropped: r.stats.dropped, videoDropped: r.stats.videoDropped, scale, clipMs: c.ms };
  timing(`Reproducir 1080p 30 fps, 2 capas (escala ${scale})`, `${out.distinctFrames} de ${out.sourceFrames} cuadros mostrados en ${out.seconds.toFixed(1)} s · render ${out.renderMs} ms (peor ${out.worstMs}) · el video perdió ${out.videoDropped}`);
  return out;
}

/** Export of a long 1080p source (decode + render + encode), with memory where the browser tells it. */
async function measureLong(seconds = 60, format: 'webm' | 'mp4' = 'webm', width?: number) {
  const mem = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
  const tc = performance.now();
  const c = await makeClip({ w: 1920, h: 1080, fps: 30, seconds, size: 216, audio: true, codec: 'vp9' });
  const clipMs = Math.round(performance.now() - tc);
  clip = c;
  project = buildProject('layers');
  project.layers.splice(2, 1);
  mountPlayback();
  let peak = mem();
  const iv = setInterval(() => { peak = Math.max(peak, mem()); }, 250);
  const m0 = mem();
  const r = await runExport({ format, audio: 'keep', ...(width ? { width } : {}) });
  clearInterval(iv);
  const out = { seconds, clipMs, clipBytes: c.bytes, exportMs: r.ms, fps: r.ok ? Math.round(((seconds * 30) / (r.ms / 1000)) * 10) / 10 : 0, bytes: r.size, audio: r.audio, heapStartMB: Math.round(m0 / 1e6), heapPeakMB: Math.round(peak / 1e6), ok: r.ok, error: r.error };
  timing(`Exportar ${seconds} s de 1080p a ${format}${width ? ` ${width}px` : ''}`, `${out.exportMs} ms (${out.fps} cuadros/s) · ${(out.bytes ?? 0) / 1e6} MB · montón JS ${out.heapStartMB}→${out.heapPeakMB} MB`);
  return out;
}

/** Flow speed here: CPU and WebGL2 on two frames of the clip at the tracker's size. */
async function measureFlow() {
  const g = geometry(project!, project!.sources[0]);
  const c = document.createElement('canvas');
  c.width = g.w; c.height = g.h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const s = clip!.spec;
  const tmp = document.createElement('canvas');
  tmp.width = s.w; tmp.height = s.h;
  paintFrame(tmp.getContext('2d')!, s, 10);
  x.drawImage(tmp, g.place.x, g.place.y, g.place.w, g.place.h);
  const a = lumaOf(x.getImageData(0, 0, g.w, g.h).data, g.w, g.h);
  paintFrame(tmp.getContext('2d')!, s, 11);
  x.drawImage(tmp, g.place.x, g.place.y, g.place.w, g.place.h);
  const b = lumaOf(x.getImageData(0, 0, g.w, g.h).data, g.w, g.h);
  const time = (fn: () => unknown, n = 3) => { fn(); const t0 = performance.now(); for (let i = 0; i < n; i++) fn(); return Math.round((performance.now() - t0) / n); };
  const cpu = time(() => cpuFlow(a, b));
  const gl = glFlowAvailable() ? time(() => glFlow(a, b)) : -1;
  // agreement of the two versions (median vector difference)
  let agree = -1;
  if (gl >= 0) {
    const fa = cpuFlow(a, b), fb = glFlow(a, b)!;
    const d: number[] = [];
    for (let i = 0; i < fa.data.length; i += 2) d.push(Math.hypot(fa.data[i] - fb.data[i], fa.data[i + 1] - fb.data[i + 1]));
    d.sort((p, q) => p - q);
    agree = Math.round(d[d.length >> 1] * 1000) / 1000;
  }
  timing(`Flujo óptico ${g.w}×${g.h}`, `CPU ${cpu} ms · WebGL2 ${gl < 0 ? 'no disponible' : gl + ' ms'} · diferencia mediana ${agree} px`);
  return { w: g.w, h: g.h, cpu, gl, agree };
}

/* ------------------------------------------------------------------ a person moving: background removal */

/** Hand-drawn outline of the person in tests/fixtures/photos/retrato-pelo.jpg (1024×858 px; from tests/e2e/cutout.spec.ts). */
const PORTRAIT = [330, 72, 400, 66, 470, 80, 540, 110, 600, 160, 640, 220, 670, 290, 700, 360, 725, 440, 745, 520, 790, 590, 825, 650, 835, 740, 828, 858, 90, 858, 70, 760, 60, 660, 70, 600, 130, 570, 135, 500, 130, 420, 140, 340, 160, 260, 190, 190, 230, 130, 280, 90];
const PORTRAIT_CLIP = { w: 480, h: 400, fps: 10, seconds: 2, scale: 0.5, travel: 32 };
const portraitShift = (i: number) => Math.round((PORTRAIT_CLIP.travel * i) / Math.max(1, PORTRAIT_CLIP.fps * PORTRAIT_CLIP.seconds - 1));

/** The CC0 portrait panning sideways (the person moves across the frame), 480×400, 10 fps, 2 s, no sound. */
async function makePortraitClip(): Promise<{ ref: MediaRef; ms: number }> {
  const t0 = performance.now();
  const bmp = await createImageBitmap(await (await fetch('/tests/fixtures/photos/retrato-pelo.jpg')).blob());
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
  const n = P.fps * P.seconds;
  for (let i = 0; i < n; i++) {
    x.drawImage(bmp, -portraitShift(i), 0, bmp.width * P.scale, bmp.height * P.scale);
    await src.add(i / P.fps, 1 / P.fps);
  }
  await output.finalize();
  bmp.close();
  const blob = new Blob([target.buffer!], { type: 'video/webm' });
  const name = 'retrato-paneo.webm';
  const r = await put(blob, { kind: 'video', name, w: P.w, h: P.h });
  keepBlob(r.id, blob, name);
  return { ref: { id: r.id, kind: 'video', name, type: 'video/webm', size: blob.size, w: P.w, h: P.h }, ms: Math.round(performance.now() - t0) };
}

/** The person's mask in frame i, at w×h of the (portrait) project frame. */
function portraitTruth(i: number, w: number, h: number): Float32Array {
  const P = PORTRAIT_CLIP;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const k = w / P.w;
  x.beginPath();
  for (let j = 0; j < PORTRAIT.length; j += 2) {
    const px = (PORTRAIT[j] * P.scale - portraitShift(i)) * k, py = PORTRAIT[j + 1] * P.scale * k;
    if (j === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.closePath();
  x.fillStyle = '#fff';
  x.fill();
  const d = x.getImageData(0, 0, w, h).data;
  const m = new Float32Array(w * h);
  for (let j = 0; j < m.length; j++) m[j] = d[j * 4] / 255;
  return m;
}

async function runMatte(o: { smooth?: number; size?: number; end?: number } = {}) {
  const { removeBackgroundVideo, estimateBackgroundVideo } = await import('../src/video/index');
  const est = await estimateBackgroundVideo(project!, { model: 'portrait', size: o.size ?? 512, ...(o.end ? { end: o.end } : {}) });
  const t0 = performance.now();
  const part = await removeBackgroundVideo(project!, { source: project!.sources[0].id, model: 'portrait', size: o.size ?? 512, smooth: o.smooth ?? 0.5, ...(o.end ? { end: o.end } : {}) });
  const ms = Math.round(performance.now() - t0);
  const { storeBlob } = await import('../src/project/sources');
  const scores: number[] = [];
  let flicker = 0;
  let prev: Float32Array | null = null;
  for (const [i, f] of (part.frames ?? []).entries()) {
    const got = await storeBlob(f.media.id!);
    const bmp = await createImageBitmap(got!.blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0);
    bmp.close();
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const m = new Float32Array(c.width * c.height);
    for (let j = 0; j < m.length; j++) m[j] = d[j * 4] / 255;
    scores.push(Math.round(iou(m, portraitTruth(i, c.width, c.height)) * 1000) / 1000);
    // temporal stability: mean absolute change of the matte from one frame to the next (the person moves 1.7 px/frame)
    if (prev) { let s = 0; for (let j = 0; j < m.length; j++) s += Math.abs(m[j] - prev[j]); flicker += s / m.length; }
    prev = m;
  }
  const n = part.frames?.length ?? 0;
  timing(`Quitar el fondo del video (retrato ${o.size ?? 512} px, suavizado ${o.smooth ?? 0.5})`, `${n} cuadros en ${ms} ms (${Math.round(ms / Math.max(1, n))} ms/cuadro) · IoU media ${(scores.reduce((a, b) => a + b, 0) / Math.max(1, n)).toFixed(3)} · estimado: ${est.text}`);
  applyTracked(part);
  return { ms, frames: n, scores, estimate: est, flicker: Math.round((flicker / Math.max(1, n - 1)) * 10000) / 10000, origin: part.origin };
}

/* ------------------------------------------------------------------ open codecs (a cancel must close them all) */

const codecs = new Set<{ state: string }>();
for (const name of ['VideoEncoder', 'VideoDecoder', 'AudioEncoder', 'AudioDecoder'] as const) {
  const g = globalThis as unknown as Record<string, (new (init: unknown) => { state: string }) | undefined>;
  const Orig = g[name];
  if (!Orig) continue;
  const Wrapped = class extends Orig { constructor(init: unknown) { super(init); codecs.add(this); } };
  Object.defineProperty(Wrapped, 'name', { value: name });
  g[name] = Wrapped;
}
/** Codec instances not closed yet (WebCodecs), by kind. */
const openCodecs = () => {
  const out: Record<string, number> = {};
  for (const c of codecs) {
    if (c.state === 'closed') { codecs.delete(c); continue; }
    const k = c.constructor.name;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

/* ------------------------------------------------------------------ boot */

interface Vq {
  ready: boolean;
  error: string;
  [k: string]: unknown;
}
const vq: Vq = {
  ready: false, error: '',
  makeClip: async (o?: Partial<ClipSpec>) => { const c = await makeClip(o); clip = c; return { bytes: c.bytes, ms: c.ms, spec: c.spec, ref: c.ref }; },
  build: async (kind: string) => { project = buildProject(kind); mountPlayback(); await refreshFormats(); return { layers: project.layers.map(l => l.name), duration: project.time.duration, w: project.canvas.w, h: project.canvas.h }; },
  formats: async (o?: Partial<MovieOptions>) => movieFormatsFor(project!, o ?? {}),
  export: (o: MovieOptions, cancelAfter?: number) => runExport(o, cancelAfter),
  inspect: () => inspect(),
  /** The test clip itself, inspected the same way (its sound's duration and onset are the reference). */
  inspectSource: async () => {
    const { storeBlob } = await import('../src/project/sources');
    const got = await storeBlob(clip!.ref.id!);
    return inspect(got!.blob);
  },
  compare: (times?: number[]) => compare(times),
  lastBytes: async () => Array.from(new Uint8Array(await lastBlob!.arrayBuffer()).slice(0, 16)),
  lastHash: async () => { const d = await crypto.subtle.digest('SHA-256', await lastBlob!.arrayBuffer()); return Array.from(new Uint8Array(d).slice(0, 8), b => b.toString(16).padStart(2, '0')).join(''); },
  /** Frame hashes of the last export (decoded), to compare two exports. */
  frameHashes: async (n = 6) => {
    const mb = await import('mediabunny');
    const out: string[] = [];
    if (lastBlob!.type.startsWith('video/')) {
      const input = new mb.Input({ source: new mb.BlobSource(lastBlob!), formats: mb.ALL_FORMATS });
      try {
        const v = (await input.getPrimaryVideoTrack())!;
        const sink = new mb.CanvasSink(v);
        let k = 0;
        for await (const wc of sink.canvases()) {
          if (k++ >= n) break;
          const d = (wc.canvas as HTMLCanvasElement).getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, wc.canvas.width, wc.canvas.height).data;
          const h = await crypto.subtle.digest('SHA-256', d);
          out.push(Array.from(new Uint8Array(h).slice(0, 6), b => b.toString(16).padStart(2, '0')).join(''));
        }
      } finally { input.dispose(); }
    }
    return out;
  },
  resources: () => ({ ...movieResources(), videos: document.querySelectorAll('video').length, codecs: openCodecs() }),
  track: (o?: Parameters<typeof runTrack>[0]) => runTrack(o),
  correct: (o: Parameters<typeof runCorrect>[0]) => runCorrect(o),
  cancelTrack: () => trackAbort?.abort(),
  playFor: (ms: number, o?: Parameters<typeof playFor>[1]) => playFor(ms, o),
  seekShow: async (t: number) => { await playback!.seek(t); return lastStrip; },
  pbStats: () => playback!.stats(),
  measurePlayback: (s?: number, scale?: number) => measurePlayback(s, scale),
  measureLong: (s?: number, f?: 'webm' | 'mp4', w?: number) => measureLong(s, f, w),
  measureFlow: () => measureFlow(),
  squareAt: (t: number) => squareAt(clip!.spec, t),
  project: () => project,
  /** A model of src/cutout downloaded and verified (the test routes Hugging Face to local files). */
  downloadModel: async (id: 'select' | 'portrait') => { const cut = await import('../src/cutout'); await cut.downloadModel(id); return cut.modelState(id); },
  cutoutCaps: async () => { const cut = await import('../src/cutout'); const c = await cut.cutoutCaps(); return { backend: c.backend, threads: c.threads, models: c.models.map(m => ({ id: m.id, available: m.available, bytes: m.bytes })) }; },
  portrait: async () => {
    const c = await makePortraitClip();
    const P = PORTRAIT_CLIP;
    clip = { ref: c.ref, spec: { ...DEFAULT_CLIP, w: P.w, h: P.h, fps: P.fps, seconds: P.seconds, audio: false } };
    project = projectFromVideo(c.ref, { duration: P.seconds, fps: P.fps, hasAudio: false }, { name: 'Retrato' });
    const style = preset('media', 'fosforo');
    style.glyph.cell = 7;
    project.layers.push(newLayer('ascii', { name: 'Persona en ASCII', source: project.sources[0].id, style, opaque: false }));
    mountPlayback();
    await refreshFormats();
    return { ms: c.ms, w: P.w, h: P.h, frames: P.fps * P.seconds };
  },
  matte: (o?: { smooth?: number; size?: number; end?: number }) => runMatte(o),
};
(window as unknown as { vq: Vq }).vq = vq;

async function boot() {
  try {
    status('creando el clip de prueba…');
    const c = await makeClip();
    clip = c;
    project = buildProject('layers');
    mountPlayback();
    await refreshFormats();
    timing('Clip sintético 320×180, 3 s (VP9 + Opus)', `${c.ms} ms, ${(c.bytes / 1024).toFixed(0)} KB`);
    $('#fmt').addEventListener('change', showFormat);
    $('#play').addEventListener('click', () => void playback?.toggle());
    $('#rev').addEventListener('click', e => { const b = e.currentTarget as HTMLButtonElement; const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); playback?.setReverse(on); });
    $('#rate').addEventListener('change', e => playback?.setRate(Number((e.target as HTMLSelectElement).value) * (playback.reverse ? -1 : 1)));
    $('#loop').addEventListener('click', e => { const b = e.currentTarget as HTMLButtonElement; const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); playback?.setLoop(on ? { start: 0.5, end: 2.5 } : null); });
    $('#quality').addEventListener('change', () => { if (!playback?.playing) void playback?.seek(playback.t); });
    $('#scrub').addEventListener('input', e => playback?.scrub(Number((e.target as HTMLInputElement).value)));
    $('#rebuild').addEventListener('click', async () => { project = buildProject('layers'); if (tracked) applyTracked(tracked); mountPlayback(); await refreshFormats(); });
    $('#go').addEventListener('click', () => {
      const format = $<HTMLSelectElement>('#fmt').value as MovieOptions['format'];
      void runExport({ format, audio: $<HTMLSelectElement>('#aud').value as 'keep' | 'none', gif: { palette: $<HTMLSelectElement>('#gpal').value as 'global' | 'frame', dither: $<HTMLSelectElement>('#gdit').value as 'none' } });
    });
    $('#cancel').addEventListener('click', () => exportAbort?.abort());
    $('#track').addEventListener('click', () => void runTrack({ segmenter: $<HTMLSelectElement>('#seg').value as 'oracle', keyEvery: Number($<HTMLInputElement>('#keyEvery').value) }));
    $('#correct').addEventListener('click', () => void runCorrect({ t: 1.5, segmenter: $<HTMLSelectElement>('#seg').value as 'oracle' }));
    $('#tcancel').addEventListener('click', () => trackAbort?.abort());
    status(`listo · ${project.canvas.w}×${project.canvas.h}, ${project.time.duration} s · WebGL2 para el flujo: ${glFlowAvailable() ? 'sí' : 'no'}`);
    vq.ready = true;
  } catch (e) {
    vq.error = String((e as Error)?.stack ?? e);
    status('error: ' + vq.error);
  }
}
void uid;
void boot();
