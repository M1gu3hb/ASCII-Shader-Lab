/**
 * Test hooks of the export sheet (only with ?qa in the address, once the sheet's code has loaded):
 * window.__fotoExport. The e2e specs read text frames and draw them again with the studio's own glyph
 * drawing, to check that the text a frame exports is what the compositor draws for it. Not used by the studio.
 */
import { drawGlyphs, gridText } from '../../glyphs/index';
import { exportLayer } from '../../project/export';
import { useProject } from '../../project/store';
import { glyphFrameAt, glyphFrames, frameSession } from './frames';
import { svgFacts } from './facts';

declare global {
  interface Window { __fotoExport?: Record<string, unknown> }
}

const project = () => {
  const p = useProject.getState().project;
  if (!p) throw new Error('no project');
  return p;
};

async function toDataUrl(b: Blob): Promise<string> {
  return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b); });
}

export function installExportQA() {
  window.__fotoExport = {
    /** The text of a glyph layer's frame at t (what TXT exports), its size and what it could not keep. */
    async frameText(layerId: string, t: number) {
      const s = frameSession();
      try {
        const f = await glyphFrameAt(project(), layerId, t, s);
        return f ? { text: gridText(f.grid), cols: f.grid.cols, rows: f.grid.rows, notes: f.notes } : null;
      } finally { s.release(); }
    },
    /** The texts of a stretch of frames (what the players and .cast hold, without colours). */
    async framesText(layerId: string, o: { fps: number; from: number; to: number }) {
      const fr = await glyphFrames(project(), layerId, o);
      return fr ? { texts: fr.frames.map(g => gridText(g)), times: fr.times, cols: fr.cols, rows: fr.rows, notes: fr.notes } : null;
    },
    /**
     * A frame's characters drawn again with the studio's glyph drawing (transparent, the project's size) and
     * the compositor's own render of the layer alone at t, both as PNG data URLs.
     */
    async drawnVsText(layerId: string, t: number) {
      const p = project();
      const s = frameSession();
      try {
        const f = await glyphFrameAt(p, layerId, t, s);
        if (!f) return null;
        const c = document.createElement('canvas');
        c.width = p.canvas.w; c.height = p.canvas.h;
        const x = c.getContext('2d')!;
        drawGlyphs(x, f.grid, f.style);
        const text = await toDataUrl(await new Promise<Blob>(res => c.toBlob(b => res(b!), 'image/png')));
        const drawn = await toDataUrl(await exportLayer(p, layerId, { t }));
        return { text, drawn, w: c.width, h: c.height };
      } finally { s.release(); }
    },
    async svg(t: number) {
      const s = frameSession();
      try { return (await svgFacts(project(), t, s)).decision; } finally { s.release(); }
    },
    /** What lane video says this browser can write for the open project (the sheet's facts). */
    async movieFormats() {
      const m = await import('../../video/index');
      return m.movieFormats(project());
    },
    makeVideoProject,
    inspectMovie: (b64: string, type: string) => inspectMovie(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type })),
    compareMovie: (b64: string, type: string, o: { fps: number; start: number; end: number; width: number; transparent: boolean; times?: number[] }) =>
      compareMovie(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type }), o),
  };
}

/**
 * A small video made here (a square moving over a textured background, a 440 Hz tone from 0.3 s: the kind of
 * clip lane video's QA page makes), stored like a dropped file, opened as a video project with a characters
 * layer over it. VP9 + Opus in WebM where this browser encodes them (VP8, and no sound, otherwise).
 */
async function makeVideoProject(o: { w?: number; h?: number; fps?: number; seconds?: number } = {}) {
  const w = o.w ?? 320, h = o.h ?? 180, fps = o.fps ?? 12, seconds = o.seconds ?? 1.5;
  const mb = await import('mediabunny');
  const { put } = await import('../../studio/mediaStore');
  const { keepBlob } = await import('../../project/sources');
  const { projectFromVideo, newLayer } = await import('../../project/normalize');
  const { startEditing } = await import('../session');
  const codec = (await mb.canEncodeVideo('vp9', { width: w, height: h })) ? 'vp9' : 'vp8';
  const sound = await mb.canEncodeAudio('opus');
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.WebMOutputFormat(), target });
  const src = new mb.CanvasSource(c, { codec, quality: mb.QUALITY_VERY_HIGH, keyFrameInterval: 1 });
  output.addVideoTrack(src, { frameRate: fps });
  const asrc = sound ? new mb.AudioSampleSource({ codec: 'opus', quality: mb.QUALITY_HIGH }) : null;
  if (asrc) output.addAudioTrack(asrc);
  await output.start();
  const n = Math.round(seconds * fps), sr = 48000;
  let written = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#16324a'); g.addColorStop(1, '#4a2c4c');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 90; k++) { x.fillStyle = `hsl(${Math.floor(rnd() * 360)} 45% ${35 + rnd() * 35}%)`; x.beginPath(); x.arc(rnd() * w, rnd() * h, 2 + rnd() * 5, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#ff5b1f';
    x.fillRect(20 + (t / seconds) * (w - 80), h / 2 - 20, 40, 40);
    await src.add(t, 1 / fps);
    if (asrc) {
      const upto = Math.round(((i + 1) / fps) * sr), len = upto - written;
      const data = new Float32Array(len * 2);
      for (let j = 0; j < len; j++) { const tt = (written + j) / sr; const v = tt >= 0.3 ? 0.5 * Math.sin(2 * Math.PI * 440 * (tt - 0.3)) : 0; data[j] = v; data[len + j] = v; }
      const smp = new mb.AudioSample({ data, format: 'f32-planar', numberOfChannels: 2, sampleRate: sr, timestamp: written / sr });
      await asrc.add(smp);
      smp.close();
      written = upto;
    }
  }
  await output.finalize();
  const blob = new Blob([target.buffer!], { type: 'video/webm' });
  const name = `cuadrado-${w}x${h}.webm`;
  const r = await put(blob, { kind: 'video', name, w, h });
  keepBlob(r.id, blob, name);
  c.width = c.height = 0;
  const p = projectFromVideo({ id: r.id, kind: 'video', name, type: 'video/webm', size: blob.size, w, h }, { duration: n / fps, fps, hasAudio: !!asrc });
  p.layers.push(newLayer('glyphs', { name: 'Caracteres', source: p.sources[0].id, opacity: 0.85 }));
  startEditing(p, { fresh: true });
  return { codec, sound: !!asrc, frames: n, seconds: n / fps };
}

/*
 * Reading exported movies back (the method of lane video's QA page, dev/video.ts: decode with mediabunny or
 * ImageDecoder, compare decoded frames with a fresh render at the same time and at the neighbouring frames).
 */

interface MovieInfo {
  kind: string;
  video?: { codec: string | null; w: number; h: number; frames: number; duration: number; alpha: boolean };
  audio?: { codec: string | null; duration: number; peak: number };
  gif?: { frames: number; w: number; h: number; loop: boolean };
  zip?: { pngs: number; w: number; h: number };
}

async function inspectMovie(blob: Blob): Promise<MovieInfo> {
  if (blob.type === 'image/gif') {
    const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
    await dec.tracks.ready;
    await dec.completed;
    const tr = dec.tracks.selectedTrack!;
    const r = await dec.decode({ frameIndex: 0 });
    const out = { kind: 'gif', gif: { frames: tr.frameCount, w: r.image.displayWidth, h: r.image.displayHeight, loop: tr.repetitionCount === Infinity } };
    r.image.close(); dec.close();
    return out;
  }
  if (blob.type === 'application/zip') {
    const { unzip } = await import('../../shared/zip');
    const pngs = (await unzip(blob)).filter(e => e.name.endsWith('.png'));
    const bmp = pngs.length ? await createImageBitmap(new Blob([(await pngs[0].read()) as BlobPart], { type: 'image/png' })) : null;
    const out = { kind: 'zip', zip: { pngs: pngs.length, w: bmp?.width ?? 0, h: bmp?.height ?? 0 } };
    bmp?.close();
    return out;
  }
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const out: MovieInfo = { kind: (await input.getFormat()).name };
    const v = await input.getPrimaryVideoTrack();
    if (v) {
      const stats = await v.computePacketStats();
      out.video = { codec: v.codec ?? null, w: await v.getDisplayWidth(), h: await v.getDisplayHeight(), frames: stats.packetCount, duration: await v.computeDuration(), alpha: await v.canBeTransparent().catch(() => false) };
    }
    const a = await input.getPrimaryAudioTrack();
    if (a) {
      let peak = 0;
      for await (const s of new mb.AudioSampleSink(a).samples()) {
        const buf = new Float32Array(s.numberOfFrames);
        s.copyTo(buf, { planeIndex: 0, format: 'f32-planar' });
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
        s.close();
      }
      out.audio = { codec: a.codec ?? null, duration: await a.computeDuration(), peak };
    }
    return out;
  } finally { input.dispose(); }
}

function diff(a: HTMLCanvasElement, b: HTMLCanvasElement): { mae: number; psnr: number } {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  const da = a.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const db = b.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let s = 0, s2 = 0;
  for (let i = 0; i < da.length; i += 4) for (let c = 0; c < 3; c++) { const e = da[i + c] - db[i + c]; s += Math.abs(e); s2 += e * e; }
  const n = w * h * 3, mse = s2 / n;
  return { mae: s / n, psnr: mse > 0 ? 10 * Math.log10((255 * 255) / mse) : 99 };
}

/** Decoded frames of an exported movie against a fresh render at the same time and at the frames next to it. */
async function compareMovie(blob: Blob, o: { fps: number; start: number; end: number; width: number; transparent: boolean; times?: number[] }) {
  const p = project();
  const { Compositor } = await import('../../project/compositor');
  const { createSourceProvider } = await import('../../project/sources');
  const { evaluate } = await import('../../project/evaluate');
  const n = Math.max(1, Math.round((o.end - o.start) * o.fps));
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
      const { unzip } = await import('../../shared/zip');
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
      const wc = await sink.getCanvas((await v.getFirstTimestamp()) + (i + 0.5) / o.fps);
      c.width = wc!.canvas.width; c.height = wc!.canvas.height;
      c.getContext('2d')!.drawImage(wc!.canvas as CanvasImageSource, 0, 0);
      return c;
    } finally { input.dispose(); }
  };
  const idx = o.times ? o.times.map(t => Math.round((t - o.start) * o.fps)) : [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  const ref = new Compositor({ provider: createSourceProvider({ video: 'exact' }) });
  const out: Array<{ t: number; mae: number; psnr: number; maePrev: number; maeNext: number; w: number; h: number }> = [];
  try {
    const renderAt = async (i: number) => {
      const c = document.createElement('canvas');
      await ref.render(evaluate(p, o.start + i / o.fps), c, { scale: o.width / p.canvas.w, quality: 'final', transparent: o.transparent });
      return c;
    };
    for (const i of idx) {
      const got = await frameOf(i);
      const d = diff(got, await renderAt(i));
      const prev = i > 0 ? diff(got, await renderAt(i - 1)).mae : Infinity;
      const next = i < n - 1 ? diff(got, await renderAt(i + 1)).mae : Infinity;
      out.push({ t: o.start + i / o.fps, mae: d.mae, psnr: d.psnr, maePrev: prev, maeNext: next, w: got.width, h: got.height });
    }
  } finally { ref.destroy(); ref.provider.release(); }
  return out;
}
