import { create } from 'zustand';
import type { RendererKind } from '../engine/renderer';
import { MOTOR_BASIC, MOTOR_KEY, MOTOR_PARAM, probeWebGL, type GLStatus } from '../engine/support';

/**
 * What this browser can actually do, so the studio never offers a button that cannot produce its file.
 * The synchronous checks run once at startup; the image-encoder and video-codec probes run once and are
 * cached (codecs per output size). The stage reports which renderer it ended up with (engineBridge.ts).
 */

export type ImageFormat = 'png' | 'webp' | 'jpeg';

/** Why the live recording cannot run ('' when it can). */
export type RecorderGap = '' | 'no-recorder' | 'no-capture' | 'no-format';
export interface RecorderCaps { ok: boolean; mime: string; ext: 'mp4' | 'webm' | ''; gap: RecorderGap }

export interface Caps {
  /** Renderer on the stage (null until the stage mounts). */
  renderer: RendererKind | null;
  /** Why the renderer is the one it is: the WebGL probe, or the failure createRenderer ran into. */
  gl: GLStatus;
  /** WebGL started, then lost its context and never got it back: the stage switched to the basic engine. */
  lost: boolean;
  /** Not even Canvas 2D works: nothing can be drawn. */
  fatal: string | null;
  /** Encoders canvas.toBlob really has (null while probing). PNG is always there. */
  images: Record<ImageFormat, boolean> | null;
  /** VideoEncoder + VideoFrame: frame-by-frame video rendering. */
  webcodecs: boolean;
  /** MediaRecorder + canvas.captureStream: the live recording, and the file type it would save. */
  recorder: RecorderCaps;
  /** Asynchronous clipboard (secure contexts only). */
  clipboard: boolean;
  camera: boolean;
  share: boolean;
}

// .mp4 only with H.264 inside (what editors and social networks expect); plain 'video/mp4' last,
// for browsers that record MP4 but no WebM (Safari)
const RECORDER_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

/** The container/codec the live recording would use ('' when none). */
export function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  try { return RECORDER_TYPES.find(t => MediaRecorder.isTypeSupported(t)) ?? ''; } catch { return ''; }
}

export function recorderCaps(): RecorderCaps {
  if (typeof MediaRecorder === 'undefined') return { ok: false, mime: '', ext: '', gap: 'no-recorder' };
  if (typeof HTMLCanvasElement === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return { ok: false, mime: '', ext: '', gap: 'no-capture' };
  const mime = pickRecorderMime();
  if (!mime) return { ok: false, mime: '', ext: '', gap: 'no-format' };
  return { ok: true, mime, ext: mime.includes('mp4') ? 'mp4' : 'webm', gap: '' };
}

/** «WebM (VP9)», «MP4 (H.264)»… for a MediaRecorder mime type. */
export function recorderLabel(mime: string): string {
  const mp4 = mime.includes('mp4');
  const codec = /avc1/.test(mime) ? 'H.264' : /vp9/.test(mime) ? 'VP9' : /vp8/.test(mime) ? 'VP8' : '';
  return (mp4 ? 'MP4' : 'WebM') + (codec ? ` (${codec})` : '');
}

export const hasWebCodecs = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

function syncCaps(): Caps {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  return {
    renderer: null,
    gl: probeWebGL(),
    lost: false,
    fatal: null,
    images: null,
    webcodecs: hasWebCodecs(),
    recorder: recorderCaps(),
    clipboard: !!nav?.clipboard?.writeText && (typeof isSecureContext === 'undefined' || isSecureContext),
    camera: !!nav?.mediaDevices?.getUserMedia,
    share: typeof nav?.share === 'function',
  };
}

export const useCaps = create<Caps>(() => syncCaps());
export const caps = () => useCaps.getState();

/* ------------------------------------------------------------------ */
/* Image encoders                                                      */
/* ------------------------------------------------------------------ */

let imageProbe: Promise<Record<ImageFormat, boolean>> | null = null;

/**
 * Which formats canvas.toBlob really encodes. Asking for one it lacks is not an error: the browser
 * silently hands back a PNG (older Safari does that for WebP), so we check the type of what comes out.
 */
export function imageFormats(): Promise<Record<ImageFormat, boolean>> {
  imageProbe ??= (async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    c.getContext('2d')?.fillRect(0, 0, 1, 1);
    const encodes = (type: string) => new Promise<boolean>(res => {
      const t = setTimeout(() => res(false), 3000);
      const done = (ok: boolean) => { clearTimeout(t); res(ok); };
      try {
        if (typeof c.toBlob === 'function') c.toBlob(b => done(!!b && b.type === type), type, 0.9);
        else done(c.toDataURL(type, 0.9).startsWith(`data:${type}`));
      } catch { done(false); }
    });
    const [webp, jpeg] = await Promise.all([encodes('image/webp'), encodes('image/jpeg')]);
    const images = { png: true, webp, jpeg };
    useCaps.setState({ images });
    return images;
  })();
  return imageProbe;
}

/* ------------------------------------------------------------------ */
/* Video codecs                                                        */
/* ------------------------------------------------------------------ */

export interface CodecSupport { avc: boolean; vp9: boolean; vp8: boolean }
export interface VideoSupport { mp4: boolean; webm: boolean }

const codecCache = new Map<string, Promise<CodecSupport>>();

/** Which codecs WebCodecs can encode at W×H (cached per size). Uses the same check as the exporter. */
export function codecsAt(W: number, H: number): Promise<CodecSupport> {
  const key = `${W}x${H}`;
  let p = codecCache.get(key);
  if (!p) {
    p = (async () => {
      if (!hasWebCodecs()) return { avc: false, vp9: false, vp8: false };
      const mb = await import('mediabunny');
      const can = (c: 'avc' | 'vp9' | 'vp8') => mb.canEncodeVideo(c, { width: W, height: H }).catch(() => false);
      const [avc, vp9, vp8] = await Promise.all([can('avc'), can('vp9'), can('vp8')]);
      return { avc, vp9, vp8 };
    })();
    // the encoder could not be fetched (offline, or a new version replaced it): ask again next time
    p.catch(() => { if (codecCache.get(key) === p) codecCache.delete(key); });
    codecCache.set(key, p);
  }
  return p;
}

export async function videoSupportAt(W: number, H: number): Promise<VideoSupport> {
  const c = await codecsAt(W, H);
  return { mp4: c.avc, webm: c.vp9 || c.vp8 };
}

/* ------------------------------------------------------------------ */
/* Basic engine: asked for, or not                                     */
/* ------------------------------------------------------------------ */

/** Where the request for the basic engine comes from: the address, a preference in this browser, or nowhere. */
export function basicRequestedBy(): 'url' | 'storage' | null {
  try { if (new URLSearchParams(location.search).get(MOTOR_PARAM) === MOTOR_BASIC) return 'url'; } catch { /* ignore */ }
  try { if (localStorage.getItem(MOTOR_KEY) === MOTOR_BASIC) return 'storage'; } catch { /* storage blocked */ }
  return null;
}

/** Remembers the basic engine as this browser's preference (it takes effect on the next load). */
export function preferBasic() {
  try { localStorage.setItem(MOTOR_KEY, MOTOR_BASIC); } catch { /* storage blocked: the address still works */ }
}

/** Forgets any request for the basic engine; returns the address to reload without ?motor=basico. */
export function clearBasicRequest(): string {
  try { localStorage.removeItem(MOTOR_KEY); } catch { /* ignore */ }
  const u = new URL(location.href);
  u.searchParams.delete(MOTOR_PARAM);
  return u.toString();
}

export function withBasicParam(): string {
  const u = new URL(location.href);
  u.searchParams.set(MOTOR_PARAM, MOTOR_BASIC);
  return u.toString();
}

/* per-session memory of dismissed notes */
export function seen(key: string, store: 'session' | 'local' = 'session'): boolean {
  try { return (store === 'session' ? sessionStorage : localStorage).getItem(key) === '1'; } catch { return false; }
}
export function markSeen(key: string, store: 'session' | 'local' = 'session') {
  try { (store === 'session' ? sessionStorage : localStorage).setItem(key, '1'); } catch { /* ignore */ }
}

// the image probe is cheap: start it once the page has settled, so the export sheet opens with the answer
if (typeof window !== 'undefined') {
  const start = () => { void imageFormats(); };
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 3000 });
  else setTimeout(start, 500);
}
