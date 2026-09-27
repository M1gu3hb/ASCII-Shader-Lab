import { create } from 'zustand';
import type { AsciiEngine } from '../engine/engine';

/**
 * Local media. Files are decoded in the browser and never uploaded anywhere.
 * The camera is only requested when the person presses "Activar cámara".
 */
export interface MediaInfo { name: string; w: number; h: number; size: number }

interface MediaState {
  image: MediaInfo | null;
  video: MediaInfo | null;
  camera: 'off' | 'starting' | 'on' | 'error';
  videoPaused: boolean;
  videoMuted: boolean;
  error: string | null;
}

export const useMedia = create<MediaState>(() => ({ image: null, video: null, camera: 'off', videoPaused: false, videoMuted: true, error: null }));

let engine: AsciiEngine | null = null;
let imageEl: ImageBitmap | HTMLCanvasElement | null = null;
let videoEl: HTMLVideoElement | null = null;
let videoUrl = '';
let camStream: MediaStream | null = null;
let camEl: HTMLVideoElement | null = null;

export function attachEngine(e: AsciiEngine | null) {
  engine = e;
  if (!e) return;
  if (imageEl) e.setMedia('image', imageEl);
  if (videoEl) e.setMedia('video', videoEl);
  if (camEl) e.setMedia('camera', camEl);
}

export function mediaElement(kind: 'image' | 'video' | 'camera') {
  return kind === 'image' ? imageEl : kind === 'video' ? videoEl : camEl;
}

function hide(v: HTMLVideoElement) {
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  v.setAttribute('aria-hidden', 'true');
  document.body.appendChild(v);
}

const MAX_SIDE = 2400;

export async function loadImage(file: File): Promise<boolean> {
  try {
    let bmp: ImageBitmap | HTMLCanvasElement = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const w = bmp.width, h = bmp.height;
    if (Math.max(w, h) > MAX_SIDE) {
      const k = MAX_SIDE / Math.max(w, h);
      const c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      (bmp as ImageBitmap).close?.();
      bmp = c;
    }
    if (imageEl && 'close' in imageEl) imageEl.close();
    imageEl = bmp;
    engine?.setMedia('image', bmp);
    useMedia.setState({ image: { name: file.name, w, h, size: file.size }, error: null });
    return true;
  } catch {
    useMedia.setState({ error: 'No se pudo abrir esa imagen. Prueba con JPG, PNG, WebP o AVIF.' });
    return false;
  }
}

export function loadVideo(file: File, rate = 1): Promise<boolean> {
  return new Promise(resolve => {
    if (videoEl) { videoEl.pause(); videoEl.remove(); }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const v = document.createElement('video');
    v.muted = useMedia.getState().videoMuted;
    v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('playsinline', '');
    videoUrl = URL.createObjectURL(file);
    v.src = videoUrl;
    v.addEventListener('loadeddata', () => {
      videoEl = v;
      v.playbackRate = rate;
      engine?.setMedia('video', v);
      v.play().catch(() => { v.muted = true; useMedia.setState({ videoMuted: true }); v.play().catch(() => undefined); });
      useMedia.setState({ video: { name: file.name, w: v.videoWidth, h: v.videoHeight, size: file.size }, videoPaused: false, error: null });
      resolve(true);
    }, { once: true });
    v.addEventListener('error', () => {
      useMedia.setState({ error: 'Este navegador no puede reproducir ese video. Prueba con MP4 (H.264) o WebM.' });
      resolve(false);
    }, { once: true });
    v.addEventListener('play', () => useMedia.setState({ videoPaused: false }));
    v.addEventListener('pause', () => useMedia.setState({ videoPaused: true }));
    hide(v);
  });
}

export async function loadFile(file: File, rate = 1): Promise<'image' | 'video' | null> {
  if (file.type.startsWith('image/')) return (await loadImage(file)) ? 'image' : null;
  if (file.type.startsWith('video/')) return (await loadVideo(file, rate)) ? 'video' : null;
  useMedia.setState({ error: 'Usa una imagen (JPG, PNG, WebP) o un video (MP4, WebM, MOV).' });
  return null;
}

export async function startCamera(): Promise<boolean> {
  if (camStream && camEl) { engine?.setMedia('camera', camEl); return true; }
  if (!navigator.mediaDevices?.getUserMedia) {
    useMedia.setState({ camera: 'error', error: 'Este navegador no da acceso a la cámara (se necesita HTTPS).' });
    return false;
  }
  useMedia.setState({ camera: 'starting', error: null });
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
    camEl = document.createElement('video');
    camEl.muted = true; camEl.playsInline = true;
    camEl.setAttribute('playsinline', '');
    camEl.srcObject = camStream;
    hide(camEl);
    await camEl.play();
    engine?.setMedia('camera', camEl);
    useMedia.setState({ camera: 'on' });
    return true;
  } catch {
    camStream = null;
    useMedia.setState({ camera: 'error', error: 'No se pudo abrir la cámara. Revisa el permiso del navegador.' });
    return false;
  }
}

export function stopCamera() {
  camStream?.getTracks().forEach(t => t.stop());
  camStream = null;
  camEl?.remove();
  camEl = null;
  engine?.setMedia('camera', null);
  useMedia.setState({ camera: 'off' });
}

export function setVideoRate(rate: number) { if (videoEl) videoEl.playbackRate = rate; }
export function toggleVideo() { if (!videoEl) return; if (videoEl.paused) void videoEl.play(); else videoEl.pause(); }
export function toggleMute() {
  const m = !useMedia.getState().videoMuted;
  useMedia.setState({ videoMuted: m });
  if (videoEl) videoEl.muted = m;
}
export function pauseVideo() { videoEl?.pause(); }
export function resumeVideo() { if (videoEl?.paused) void videoEl.play().catch(() => undefined); }
