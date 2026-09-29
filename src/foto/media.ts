/**
 * Files entering the photo studio: photos and videos (stored in the shared media store, content-addressed,
 * so the lab and this studio share them), project files and what else a dropped file may be.
 */
import { guessType, kindOfType, MEDIA_LIMITS } from '../studio/mediaStore';
import { putMedia } from '../project/persist';
import type { MediaRef } from '../engine/recipe';

export type Imported =
  | { ok: true; kind: 'image'; ref: MediaRef; stored: boolean }
  | { ok: true; kind: 'video'; ref: MediaRef; stored: boolean; duration: number; fps: number; hasAudio?: boolean }
  | { ok: false; message: string };

const MB = 1024 * 1024;

export function kindOfFile(file: File): 'image' | 'video' | null {
  return kindOfType(file.type) ?? kindOfType(guessType(file.name));
}

export const isProjectFile = (file: File) => /\.(zip|json)$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/json';

async function imageSize(file: Blob): Promise<{ w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const s = { w: bmp.width, h: bmp.height };
    bmp.close();
    return s;
  } catch { return null; }
}

/** Size and length of a video, read from its metadata by the browser (null when it cannot play it). */
export function videoInfo(file: Blob): Promise<{ w: number; h: number; duration: number } | null> {
  return new Promise(res => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'metadata'; v.playsInline = true;
    const url = URL.createObjectURL(file);
    const done = (r: { w: number; h: number; duration: number } | null) => { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); res(r); };
    const t = setTimeout(() => done(null), 15_000);
    v.addEventListener('loadedmetadata', () => {
      if (!(v.videoWidth > 0)) { clearTimeout(t); done(null); return; }
      if (Number.isFinite(v.duration)) { clearTimeout(t); done({ w: v.videoWidth, h: v.videoHeight, duration: v.duration }); return; }
      // a recording without its length in the header (MediaRecorder files): seeking far makes the browser find it
      v.addEventListener('durationchange', () => {
        if (!Number.isFinite(v.duration)) return;
        clearTimeout(t);
        done({ w: v.videoWidth, h: v.videoHeight, duration: v.duration });
      });
      v.currentTime = 1e7;
    }, { once: true });
    v.addEventListener('error', () => { clearTimeout(t); done(null); }, { once: true });
    v.src = url;
  });
}

/**
 * A video's frame rate (from its frames' timestamps, snapped to a common rate) and whether it has a sound track,
 * read with mediabunny (lazy). Null when this browser cannot read the file that way: the element's length is used
 * and 30 fps assumed.
 */
export async function videoFacts(file: Blob): Promise<{ fps: number; hasAudio: boolean; duration: number } | null> {
  try {
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    try {
      const v = await input.getPrimaryVideoTrack();
      if (!v) return null;
      const m = await v.computeFrameRateMetrics({ targetPacketCount: 120 });
      const a = await input.getPrimaryAudioTrack().catch(() => null);
      const fps = Number.isFinite(m.bestGuessFrameRate) && m.bestGuessFrameRate > 0 ? Math.round(m.bestGuessFrameRate * 1000) / 1000 : 30;
      // the picture's own length (the element reports the longest track: a sound a few ms longer adds a frame past the end)
      const duration = Math.max(0, (await v.computeDuration()) - (await v.getFirstTimestamp()));
      return { fps: Math.min(60, Math.max(1, fps)), hasAudio: !!a, duration: Number.isFinite(duration) ? duration : 0 };
    } finally { input.dispose(); }
  } catch {
    return null;
  }
}

/** Stores a picked photo or video and returns its reference (with the video's length, frame rate and sound). */
export async function importMedia(file: File): Promise<Imported> {
  const kind = kindOfFile(file);
  if (!kind) {
    if (/\.hei[cf]$/i.test(file.name)) return { ok: false, message: 'Este navegador no abre fotos HEIC. Expórtala como JPG desde tu galería (o cambia la cámara a «Más compatible») y vuelve a intentarlo.' };
    return { ok: false, message: 'Usa una foto (JPG, PNG, WebP, AVIF) o un video (MP4, WebM, MOV).' };
  }
  if (file.size > MEDIA_LIMITS[kind] * 2) return { ok: false, message: `Ese archivo pesa ${Math.round(file.size / MB)} MB: el estudio abre fotos de hasta ${MEDIA_LIMITS.image / MB} MB y videos de hasta ${MEDIA_LIMITS.video / MB} MB.` };
  if (kind === 'image') {
    const s = await imageSize(file);
    if (!s) return { ok: false, message: 'No se pudo abrir esa imagen. Prueba con JPG, PNG, WebP o AVIF.' };
    const ref = await putMedia(file, { kind, name: file.name || 'foto.png', w: s.w, h: s.h, lastModified: file.lastModified });
    const { stored, ...r } = ref;
    return { ok: true, kind, ref: r, stored };
  }
  const v = await videoInfo(file);
  if (!v) return { ok: false, message: 'Este navegador no puede reproducir ese video. Prueba con MP4 (H.264) o WebM.' };
  const facts = await Promise.race([videoFacts(file), new Promise<null>(r => setTimeout(() => r(null), 8000))]);
  const ref = await putMedia(file, { kind, name: file.name || 'video.mp4', w: v.w, h: v.h, lastModified: file.lastModified });
  const { stored, ...r } = ref;
  const duration = facts && facts.duration > 0.05 && facts.duration <= v.duration + 0.05 ? facts.duration : v.duration;
  return { ok: true, kind, ref: r, stored, duration, fps: facts?.fps ?? 30, ...(facts ? { hasAudio: facts.hasAudio } : {}) };
}

/** A file picker (resolves with the chosen files, or none when cancelled). */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise(res => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = (files: File[]) => { if (done) return; done = true; input.remove(); res(files); };
    input.addEventListener('change', () => finish([...(input.files ?? [])]), { once: true });
    input.addEventListener('cancel', () => finish([]), { once: true });
    input.click();
  });
}

export const MEDIA_ACCEPT = 'image/*,video/*,.heic,.heif';
export const PROJECT_ACCEPT = '.zip,.json,application/zip,application/json';
