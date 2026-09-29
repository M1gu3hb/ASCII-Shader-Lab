/**
 * Source pictures of a project at a time t: photos, photo sequences, cut-outs and video frames, decoded in
 * this browser from the media store (nothing is uploaded).
 *
 * The compositor asks in two steps: `prepare(source, t)` (async: decode, seek) for everything a frame needs,
 * then `frame(source, t)` (sync) while it draws, so a frame is always drawn from pictures that are all
 * there. What cannot be found or decoded is listed by `missing()`: the frame is drawn without it and the
 * studio says which file is missing.
 *
 * Video frames come from a VideoFrameProvider:
 *   - 'preview': an HTMLVideoElement seeked to t (light, what the browser plays; frames may be approximate);
 *   - 'exact': mediabunny's CanvasSink (WebCodecs), the frame whose timestamp is the last at or before t:
 *     frame-exact, for exports. When WebCodecs cannot decode the file, 'exact' falls back to 'preview'.
 * Everything is released by release(): bitmaps closed, object URLs revoked, decoders disposed.
 */
import type { MediaRef } from '../engine/recipe';
import { getMedia } from '../studio/mediaStore';
import { sequenceIndex } from './evaluate';
import type { Source } from './types';

export type Drawable = HTMLCanvasElement | ImageBitmap;
export type BlobResolver = (id: string) => Promise<{ blob: Blob; name?: string; type: string } | null>;

/* ------------------------------------------------------------------ blobs */

/** Files that live only in this tab (too big for the store, or opened from a project file): id → blob. */
const tabBlobs = new Map<string, { blob: Blob; name: string }>();

/** Keeps a file at hand for this tab, under its media id. */
export function keepBlob(id: string, blob: Blob, name = ''): void {
  tabBlobs.set(id, { blob, name });
}

/** The bytes of a media file: kept in this tab, or in the media store. */
export const storeBlob: BlobResolver = async id => {
  const f = tabBlobs.get(id);
  if (f) return { blob: f.blob, name: f.name, type: f.blob.type };
  const m = await getMedia(id);
  return m ? { blob: m.blob, name: m.name, type: m.type } : null;
};

/* ------------------------------------------------------------------ video frames */

export interface VideoFrameProvider {
  readonly kind: 'preview' | 'exact';
  readonly width: number;
  readonly height: number;
  /** Seconds. */
  readonly duration: number;
  /** Decodes the frame shown at t (seconds into the file) into `canvas`. False when there is none. */
  seek(t: number): Promise<boolean>;
  /** The frame of the last successful seek (kept until the next one). */
  readonly canvas: HTMLCanvasElement;
  close(): void;
}

function fitSize(w: number, h: number, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(1, w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** A video element seeked to each time asked (hidden, muted). */
export async function openPreviewVideo(blob: Blob, maxSide = 1920): Promise<VideoFrameProvider | null> {
  if (typeof document === 'undefined') return null;
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('playsinline', '');
  v.setAttribute('aria-hidden', 'true');
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  const url = URL.createObjectURL(blob);
  v.src = url;
  document.body.appendChild(v);
  const ok = await new Promise<boolean>(res => {
    const t = setTimeout(() => res(false), 15_000);
    v.addEventListener('loadeddata', () => { clearTimeout(t); res(true); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(t); res(false); }, { once: true });
  });
  const close = () => { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); URL.revokeObjectURL(url); };
  if (!ok || !v.videoWidth) { close(); return null; }
  const size = fitSize(v.videoWidth, v.videoHeight, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = size.w; canvas.height = size.h;
  const ctx = canvas.getContext('2d')!;
  let last = NaN, closed = false;
  const draw = () => { ctx.clearRect(0, 0, size.w, size.h); ctx.drawImage(v, 0, 0, size.w, size.h); };
  return {
    kind: 'preview', width: v.videoWidth, height: v.videoHeight, duration: Number.isFinite(v.duration) ? v.duration : 0, canvas,
    async seek(t) {
      if (closed) return false;
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      const target = Math.max(0, d > 0 ? Math.min(t, d - 1e-3) : t);
      if (target === last) return true;
      if (Math.abs(v.currentTime - target) > 1e-4 || v.readyState < 2) {
        const seeked = new Promise<boolean>(res => {
          const tm = setTimeout(() => res(false), 4000);
          v.addEventListener('seeked', () => { clearTimeout(tm); res(true); }, { once: true });
        });
        v.currentTime = target;
        if (!(await seeked) && v.readyState < 2) return false;
      }
      draw();
      last = target;
      return true;
    },
    close() { if (!closed) { closed = true; close(); } },
  };
}

/**
 * How far past t a frame may start and still count as the frame at t (seconds). Containers store timestamps in
 * ticks (WebM: 1 ms), so the frame shown from 86/30 s is stored at 2.867 s, after 2.8667: asked for exactly t, the
 * last frame starting at or before t is the one before it, and a 30 fps export of a 30 fps video repeated every
 * third frame and skipped the next one. One millisecond covers the rounding (at most half a tick of 1 ms) and is
 * far below a frame at any real frame rate.
 */
export const FRAME_EPS = 1e-3;

/** Frame-exact video frames with mediabunny (WebCodecs). Null when this browser cannot decode the file. */
export async function openExactVideo(blob: Blob, maxSide = 3840): Promise<VideoFrameProvider | null> {
  if (typeof VideoDecoder === 'undefined' || typeof document === 'undefined') return null;
  let input: import('mediabunny').Input | null = null;
  try {
    const mb = await import('mediabunny');
    input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) { input.dispose(); return null; }
    const [dw, dh, first, duration] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight(), track.getFirstTimestamp(), track.computeDuration()]);
    const size = fitSize(dw, dh, maxSide);
    const sink = new mb.CanvasSink(track, { width: size.w, height: size.h, fit: 'fill', poolSize: 2, alpha: true });
    const canvas = document.createElement('canvas');
    canvas.width = size.w; canvas.height = size.h;
    const ctx = canvas.getContext('2d')!;
    const inp = input;
    let last = NaN, closed = false;
    return {
      kind: 'exact', width: dw, height: dh, duration: Math.max(0, duration - first), canvas,
      async seek(t) {
        if (closed) return false;
        const target = Math.max(0, t);
        if (target === last) return true;
        // the file's clock may not start at 0: frames are asked for at its first timestamp + t
        const wc = await sink.getCanvas(first + target + FRAME_EPS) ?? await sink.getCanvas(first);
        if (!wc || closed) return false;
        ctx.clearRect(0, 0, size.w, size.h);
        ctx.drawImage(wc.canvas as CanvasImageSource, 0, 0, size.w, size.h);
        last = target;
        return true;
      },
      close() { if (!closed) { closed = true; inp.dispose(); } },
    };
  } catch {
    input?.dispose();
    return null;
  }
}

/* ------------------------------------------------------------------ provider */

export interface SourceProvider {
  /** Gets ready to answer frame(source, t) (decode, seek). Resolves false when the picture is missing. */
  prepare(source: Source, t: number): Promise<boolean>;
  /** The picture of a source at t, after prepare(); null when missing. */
  frame(source: Source, t: number): Drawable | null;
  /** Decodes one stored picture (a raster mask). */
  prepareMedia(ref: MediaRef): Promise<boolean>;
  /** A stored picture after prepareMedia(); null when missing. */
  image(ref: MediaRef): Drawable | null;
  /** Media asked for and not available (no id, not stored, or not decodable here). */
  missing(): MediaRef[];
  /** Frees every bitmap, video and decoder. The provider can be used again afterwards. */
  release(): void;
}

export interface ProviderOptions {
  /** 'preview' (video element) or 'exact' (frame-exact decoding for exports). */
  video?: 'preview' | 'exact';
  blob?: BlobResolver;
  /** Longest side of decoded pictures (bigger ones are scaled down once, with high quality). */
  maxSide?: number;
  /** Decoded pictures kept at most (least recently used ones are closed first). */
  keep?: number;
}

interface Img { el: Drawable; used: number }
interface Vid { vp: VideoFrameProvider | null; ok: boolean; opening: Promise<VideoFrameProvider | null> | null }

export function createSourceProvider(o: ProviderOptions = {}): SourceProvider {
  const blobOf = o.blob ?? storeBlob;
  const maxSide = o.maxSide ?? 4096;
  const keep = Math.max(2, o.keep ?? 16);
  const images = new Map<string, Img>();
  const decoding = new Map<string, Promise<Drawable | null>>();
  const videos = new Map<string, Vid>();
  const lost = new Map<string, MediaRef>();
  let clock = 0;

  const keyOf = (ref: MediaRef) => ref.id ?? `?${ref.kind}:${ref.name ?? ''}:${ref.w}x${ref.h}`;

  const evict = () => {
    if (images.size <= keep) return;
    const list = [...images.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, v] of list) {
      if (images.size <= keep) break;
      images.delete(k);
      closeDrawable(v.el);
    }
  };

  async function decode(ref: MediaRef): Promise<Drawable | null> {
    if (!ref.id) return null;
    const got = await blobOf(ref.id);
    if (!got) return null;
    try {
      const bmp = await createImageBitmap(got.blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      if (Math.max(bmp.width, bmp.height) <= maxSide) return bmp;
      const s = fitSize(bmp.width, bmp.height, maxSide);
      const c = document.createElement('canvas');
      c.width = s.w; c.height = s.h;
      const x = c.getContext('2d')!;
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.drawImage(bmp, 0, 0, s.w, s.h);
      bmp.close();
      return c;
    } catch {
      return null;
    }
  }

  async function prepareMedia(ref: MediaRef): Promise<boolean> {
    const k = keyOf(ref);
    const have = images.get(k);
    if (have) { have.used = ++clock; return true; }
    let job = decoding.get(k);
    if (!job) {
      job = decode(ref);
      decoding.set(k, job);
    }
    const el = await job;
    decoding.delete(k);
    if (!el) { lost.set(k, ref); return false; }
    lost.delete(k);
    if (!images.has(k)) images.set(k, { el, used: ++clock });
    else if (images.get(k)!.el !== el) closeDrawable(el);
    evict();
    return true;
  }

  function image(ref: MediaRef): Drawable | null {
    const i = images.get(keyOf(ref));
    if (!i) return null;
    i.used = ++clock;
    return i.el;
  }

  async function openVideo(source: Source): Promise<Vid> {
    let v = videos.get(source.id);
    if (!v) { v = { vp: null, ok: false, opening: null }; videos.set(source.id, v); }
    if (v.vp || (!v.opening && v.ok === false && lost.has(keyOf(source.media[0])))) return v;
    if (!v.opening) {
      const ref = source.media[0];
      const vid = v;
      v.opening = (async () => {
        const got = ref.id ? await blobOf(ref.id) : null;
        if (!got) return null;
        let vp = o.video === 'exact' ? await openExactVideo(got.blob) : null;
        vp ??= await openPreviewVideo(got.blob);
        return vp;
      })().then(vp => {
        vid.vp = vp; vid.ok = !!vp; vid.opening = null;
        if (!vp) lost.set(keyOf(ref), ref); else lost.delete(keyOf(ref));
        return vp;
      });
    }
    await v.opening;
    return v;
  }

  return {
    async prepare(source, t) {
      if (!source.media.length) return false;
      if (source.kind === 'video') {
        const v = await openVideo(source);
        if (!v.vp) return false;
        v.ok = await v.vp.seek(t);
        return v.ok;
      }
      const ref = source.kind === 'sequence' ? source.media[sequenceIndex(source, t)] : source.media[0];
      return prepareMedia(ref);
    },
    frame(source, t) {
      if (!source.media.length) return null;
      if (source.kind === 'video') {
        const v = videos.get(source.id);
        return v?.vp && v.ok ? v.vp.canvas : null;
      }
      const ref = source.kind === 'sequence' ? source.media[sequenceIndex(source, t)] : source.media[0];
      return image(ref);
    },
    prepareMedia,
    image,
    missing: () => [...lost.values()],
    release() {
      for (const i of images.values()) closeDrawable(i.el);
      images.clear();
      for (const v of videos.values()) v.vp?.close();
      videos.clear();
      lost.clear();
    },
  };
}

function closeDrawable(el: Drawable) {
  if (typeof ImageBitmap !== 'undefined' && el instanceof ImageBitmap) el.close();
  else if (el instanceof HTMLCanvasElement) { el.width = 0; el.height = 0; }
}
