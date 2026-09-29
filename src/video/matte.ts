/**
 * Video background removal: every frame through a matting model of src/cutout ('portrait' by default: small and
 * fast, people only; 'subject' where this device allows it), then smoothed in time so the edge does not boil:
 * a flow-compensated exponential average — the smoothed matte of the previous frame is carried to this frame
 * along the optical flow (per pixel: people bend) and mixed with this frame's own matte.
 *
 * The result is a raster mask part {origin: 'subject', frames: [{t, media}]} (soft greyscale PNGs at ≤ 480 px in
 * the media store), in the frame space of the layer that shows the video, like tracking (track.ts).
 * estimateBackgroundVideo says what it will cost before anything starts.
 */
import type { MaskRasterPart, Project } from '../project/types';
import { sourceTime } from '../project/evaluate';
import { storeBlob, type BlobResolver } from '../project/sources';
import type { Id } from '../project/types';
import { lumaOf, upsampleFlow, warp, type Luma } from './flow';
import { trackTimes } from './keys';
import { abortError, etaText } from './movie';
import { computeFlow, geometry, loadStretchReader, storeMaskFrame } from './track';

export interface VideoMatteOptions {
  source: Id;
  start?: number;
  end?: number;
  /** 'portrait' (people; fast) or 'subject' (anything; much slower without WebGPU). */
  model?: 'portrait' | 'subject';
  /**
   * Shortest side the portrait model works at: 512 (default) follows the body; 256 is ≈1.7× faster but loses dark
   * clothes and shoulders (IoU 0.85 → 0.53 on the test portrait): for quick previews only.
   */
  size?: number;
  /** Smoothing in time 0..1 (0 = every frame on its own; default 0.5). */
  smooth?: number;
  onProgress?: (p: { done: number; total: number; label: string }) => void;
  signal?: AbortSignal;
  blob?: BlobResolver;
}

export interface VideoMatteEstimate {
  frames: number;
  model: 'portrait' | 'subject';
  available: boolean;
  why?: string;
  /** Needs a download first (bytes), with the model's own note. */
  download: number;
  note?: string;
  /** Seconds, low and high, on a machine like this project's test machine (WASM). */
  seconds: [number, number];
  text: string;
}

/**
 * Per-frame seconds on this project's 4-vCPU test machine (WASM, shared CPU): portrait at 512 px measured here
 * with the smoothing (1.2–1.9 s, 480×400 frames); subject from report-cutout.md (9–19 s).
 */
const PER_FRAME: Record<'portrait' | 'subject', [number, number]> = { portrait: [1.2, 2.0], subject: [9, 19] };

export async function estimateBackgroundVideo(p: Project, o: Pick<VideoMatteOptions, 'start' | 'end' | 'model' | 'size'>): Promise<VideoMatteEstimate> {
  const model = o.model ?? 'portrait';
  const n = trackTimes(o.start ?? 0, o.end ?? p.time.duration, p.time.fps || 30).length;
  const cut = await import('../cutout');
  const caps = await cut.cutoutCaps();
  const info = caps.models.find(m => m.id === model);
  const state = await cut.modelState(model).catch(() => 'absent' as const);
  const k = model === 'portrait' ? Math.max(0.4, ((o.size ?? 512) / 512) ** 2) : 1;
  const gpu = caps.backend === 'webgpu' ? 0.15 : 1;
  const [a, b] = PER_FRAME[model];
  const seconds: [number, number] = [n * a * k * gpu, n * b * k * gpu];
  const download = state === 'cached' || state === 'ready' ? 0 : info?.bytes ?? 0;
  const text = `${n} cuadros con «${info?.name ?? model}»: entre ${etaText(seconds[0])} y ${etaText(seconds[1])}${caps.backend === 'webgpu' ? ' (con WebGPU; sin medir en este equipo)' : ' en un equipo como el de prueba'}.${download ? ` Antes se descarga el modelo (${Math.round(download / 1e6)} MB).` : ''}`;
  return { frames: n, model, available: !!info?.available, ...(info?.why ? { why: info.why } : {}), download, ...(info?.note ? { note: info.note } : {}), seconds, text };
}

export async function removeBackgroundVideo(p: Project, o: VideoMatteOptions): Promise<MaskRasterPart> {
  const blob = o.blob ?? storeBlob;
  const s = p.sources.find(x => x.id === o.source);
  if (!s || s.kind !== 'video') throw new Error('Elige un video para quitarle el fondo.');
  const model = o.model ?? 'portrait';
  const fps = p.time.fps || 30;
  const times = trackTimes(o.start ?? 0, o.end ?? p.time.duration, fps);
  const g = geometry(p, s);
  const cut = await import('../cutout');
  const smooth = Math.min(0.95, Math.max(0, o.smooth ?? 0.5));
  const alpha = 1 - smooth * 0.6;
  const reader = await loadStretchReader(s, blob);
  const refs: MaskRasterPart['frames'] = [];
  const t0 = performance.now();
  // the model's frame: frame space at a moderate size (the portrait model resizes to `size` anyway)
  const mc = document.createElement('canvas');
  mc.width = g.w; mc.height = g.h;
  const mx = mc.getContext('2d', { willReadFrequently: true })!;
  const fc = document.createElement('canvas');
  fc.width = g.fw; fc.height = g.fh;
  const fx = fc.getContext('2d', { willReadFrequently: true })!;
  let prevLuma: Luma | null = null, prevMatte: Float32Array | null = null;
  try {
    let i = 0;
    for await (const img of reader.frames(times.map(t => sourceTime(s, t)))) {
      if (o.signal?.aborted) throw abortError();
      if (!img) throw new Error('No se pudo leer un cuadro del video.');
      mx.fillStyle = '#000';
      mx.fillRect(0, 0, g.w, g.h);
      mx.drawImage(img, g.place.x, g.place.y, g.place.w, g.place.h);
      // the flow at its own size (≤ 320 px), brought up to the matte's for the warp
      fx.drawImage(mc, 0, 0, g.fw, g.fh);
      const luma = lumaOf(fx.getImageData(0, 0, g.fw, g.fh).data, g.fw, g.fh);
      const bmp = await createImageBitmap(mc);
      const r = await cut.matteFrame(bmp, { model, upsample: false, size: o.size ?? 512, signal: o.signal });
      const m = resample(r.matte.alpha, r.matte.w, r.matte.h, g.w, g.h);
      let cur = m;
      if (prevLuma && prevMatte && smooth > 0) {
        // previous smoothed matte carried here along the flow (this frame → previous frame), then mixed
        const f = computeFlow(luma, prevLuma).f;
        const carried = warp(prevMatte, f.w === g.w && f.h === g.h ? f : upsampleFlow(f, g.w, g.h));
        cur = new Float32Array(m.length);
        for (let k = 0; k < m.length; k++) cur[k] = alpha * m[k] + (1 - alpha) * carried[k];
      }
      prevLuma = luma; prevMatte = cur;
      refs.push({ t: times[i], media: await storeMaskFrame(cur, g.w, g.h, `fondo-${String(i).padStart(6, '0')}.png`) });
      i++;
      const el = (performance.now() - t0) / 1000;
      const eta = i < times.length ? etaText((el / i) * (times.length - i)) : '';
      o.onProgress?.({ done: i, total: times.length, label: `Quitando el fondo: cuadro ${i} de ${times.length}${eta ? ` · quedan ${eta}` : ''}` });
      if (i >= times.length) break;
    }
  } finally {
    reader.close();
    mc.width = mc.height = 0;
    fc.width = fc.height = 0;
  }
  if (!refs.length) throw new Error('No se pudo leer el video.');
  return { kind: 'raster', op: 'add', media: refs[0].media, frames: refs, interp: true, soft: 0, alpha: 1, origin: 'subject' };
}

/** Bilinear resample of an 8-bit matte to 0..1 at W×H. */
function resample(a: Uint8ClampedArray, w: number, h: number, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  const sx = w / W, sy = h / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ky = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), kx = fx - x0;
      const v = (a[y0 * w + x0] * (1 - kx) + a[y0 * w + x1] * kx) * (1 - ky) + (a[y1 * w + x0] * (1 - kx) + a[y1 * w + x1] * kx) * ky;
      out[y * W + x] = v / 255;
    }
  }
  return out;
}
