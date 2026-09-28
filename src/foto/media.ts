/**
 * Files entering the photo studio: photos and videos (stored in the shared media store, content-addressed,
 * so the lab and this studio share them), project files and what else a dropped file may be.
 */
import { guessType, kindOfType, MEDIA_LIMITS } from '../studio/mediaStore';
import { putMedia } from '../project/persist';
import type { MediaRef } from '../engine/recipe';

export type Imported =
  | { ok: true; kind: 'image'; ref: MediaRef; stored: boolean }
  | { ok: true; kind: 'video'; ref: MediaRef; stored: boolean; duration: number; fps: number }
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
      clearTimeout(t);
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      done(v.videoWidth > 0 ? { w: v.videoWidth, h: v.videoHeight, duration: d } : null);
    }, { once: true });
    v.addEventListener('error', () => { clearTimeout(t); done(null); }, { once: true });
    v.src = url;
  });
}

/** Stores a picked photo or video and returns its reference (with the video's length). */
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
  const ref = await putMedia(file, { kind, name: file.name || 'video.mp4', w: v.w, h: v.h, lastModified: file.lastModified });
  const { stored, ...r } = ref;
  return { ok: true, kind, ref: r, stored, duration: v.duration, fps: 30 };
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
