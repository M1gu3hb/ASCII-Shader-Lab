import { create } from 'zustand';
import { normMediaRef, type MediaRef } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import { getMedia, guessType, kindOfType, put, type MediaKind, type PutResult } from './mediaStore';
import { currentRecipe, useStudio } from './store';

/**
 * Local media. Files are decoded in the browser and never uploaded anywhere.
 * Images and videos are also kept in this browser's media store (mediaStore.ts), and each recipe
 * names the file it was made with (`media.ref`), so the media follows the current piece: going
 * back in the history, opening a favourite or a project brings its own image back.
 * The camera is only requested when the person presses "Activar cámara" and is never stored.
 */
export interface MediaInfo { name: string; w: number; h: number; size: number; id?: string }

/**
 * What the current piece is missing: its file is being brought back from the store ('restoring'),
 * is no longer stored in this browser ('missing'), or never travelled with the link or project
 * that opened it ('foreign').
 */
export interface MediaNeed { state: 'restoring' | 'missing' | 'foreign'; ref: MediaRef }

interface MediaState {
  /** What the stage shows right now (null: the pattern shows instead). */
  image: MediaInfo | null;
  video: MediaInfo | null;
  camera: 'off' | 'starting' | 'on' | 'error';
  videoPaused: boolean;
  videoMuted: boolean;
  error: string | null;
  need: MediaNeed | null;
}

export const useMedia = create<MediaState>(() => ({ image: null, video: null, camera: 'off', videoPaused: false, videoMuted: true, error: null, need: null }));

type Img = ImageBitmap | HTMLCanvasElement;
interface Slot<T> { el: T; info: MediaInfo }

let engine: Renderer | null = null;
/** Loaded media per kind (may be loaded but not shown, when the current piece wants another file). */
let image: Slot<Img> | null = null;
let video: Slot<HTMLVideoElement> | null = null;
let videoUrl = '';
let camStream: MediaStream | null = null;
let camEl: HTMLVideoElement | null = null;
/** What the engine has right now, to only call setMedia on real changes. */
const shown: Record<MediaKind, Img | HTMLVideoElement | null> = { image: null, video: null };
/** Recently decoded images by id: stepping through the history does not decode them again. */
const bitmaps = new Map<string, Slot<Img>>();
const KEEP_BITMAPS = 3;
/** Files picked or opened in this tab, including those too big to store: they come back while the tab lives. */
const sessionFiles = new Map<string, { blob: Blob; name: string }>();
/** Bumped by each load or restore; a slower, older one then gives up. */
const gen: Record<MediaKind, number> = { image: 0, video: 0 };
const restoring: Record<MediaKind, string> = { image: '', video: '' };

export function attachEngine(e: Renderer | null) {
  engine = e;
  if (!e) return;
  if (shown.image) e.setMedia('image', shown.image);
  if (shown.video) e.setMedia('video', shown.video);
  if (camEl) e.setMedia('camera', camEl);
}

/** The media the stage is showing (offscreen renders and exports use the same). */
export function mediaElement(kind: 'image' | 'video' | 'camera') {
  return kind === 'camera' ? camEl : shown[kind];
}

/** Blob of a media file available in this tab or in the store (for projects and sessions). */
export async function mediaBlob(id: string): Promise<{ blob: Blob; name?: string; type: string } | null> {
  const f = sessionFiles.get(id);
  if (f) return { blob: f.blob, name: f.name, type: f.blob.type };
  const m = await getMedia(id);
  return m ? { blob: m.blob, name: m.name, type: m.type } : null;
}

/** Keeps a file at hand for this tab (e.g. one from a project that was too big to store). */
export function rememberFile(id: string, blob: Blob, name: string) {
  sessionFiles.set(id, { blob, name });
}

function hide(v: HTMLVideoElement) {
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  v.setAttribute('aria-hidden', 'true');
  document.body.appendChild(v);
}

const same = (a: MediaInfo | null, b: MediaInfo | null) => a === b || (!!a && !!b && a.id === b.id && a.name === b.name && a.w === b.w && a.h === b.h);

/** Shows (or hides, so the pattern shows) the loaded media of a kind. */
function show(kind: MediaKind, on: boolean) {
  const slot = kind === 'image' ? image : video;
  const el = on && slot ? slot.el : null;
  if (shown[kind] !== el) {
    shown[kind] = el;
    engine?.setMedia(kind, el);
  }
  const info = el ? slot!.info : null;
  if (!same(useMedia.getState()[kind], info)) useMedia.setState({ [kind]: info } as Partial<MediaState>);
}

function setNeed(need: MediaNeed | null) {
  const cur = useMedia.getState().need;
  if (cur === need || (cur && need && cur.state === need.state && cur.ref === need.ref)) return;
  useMedia.setState({ need });
}

const loadedId = (kind: MediaKind) => (kind === 'image' ? image : video)?.info.id;

/* ------------------------------------------------------------------ */
/* Following the current piece                                         */
/* ------------------------------------------------------------------ */

let lastKey = '';

/** Makes the stage show the file the current piece was made with (or explains what is missing). */
export function syncMedia(force = false) {
  const r = currentRecipe();
  const ref = r.media.ref;
  const key = `${r.source}|${ref?.kind ?? ''}|${ref?.id ?? ''}|${ref ? 1 : 0}`;
  if (!force && key === lastKey) return;
  lastKey = key;
  const kind = r.source;
  if (kind !== 'image' && kind !== 'video') { setNeed(null); return; }
  const want = ref?.kind === kind ? ref : undefined;
  if (!want) { show(kind, true); setNeed(null); return; }                     // older recipes: whatever is loaded
  if (!want.id) { show(kind, false); setNeed({ state: 'foreign', ref: want }); return; }
  if (loadedId(kind) === want.id) { show(kind, true); setNeed(null); return; }
  const cached = kind === 'image' ? bitmaps.get(want.id) : undefined;
  if (cached) { useImage(cached); show('image', true); setNeed(null); return; }
  show(kind, false);
  setNeed({ state: 'restoring', ref: want });
  void restore(kind, want);
}

async function restore(kind: MediaKind, ref: MediaRef) {
  const id = ref.id!;
  if (restoring[kind] === id) return;
  restoring[kind] = id;
  const g = ++gen[kind];
  const found = await mediaBlob(id);
  if (gen[kind] !== g) return;
  if (!found) {
    restoring[kind] = '';
    if (wanted(kind) === id) setNeed({ state: 'missing', ref });
    return;
  }
  const info: MediaInfo = { id, name: ref.name ?? found.name ?? '', w: ref.w, h: ref.h, size: found.blob.size };
  const ok = kind === 'image' ? await decodeImage(found.blob, info, g) : await openVideo(found.blob, info, g);
  if (gen[kind] !== g) return;
  restoring[kind] = '';
  if (!ok) { if (wanted(kind) === id) setNeed({ state: 'missing', ref }); return; }
  syncMedia(true);
}

function wanted(kind: MediaKind): string | undefined {
  const r = currentRecipe();
  return r.source === kind && r.media.ref?.kind === kind ? r.media.ref.id : undefined;
}

/** Starts following the current piece. Call once, after the store is hydrated. */
export function startMediaSync() {
  syncMedia(true);
  useStudio.subscribe((st, prev) => { if (st.entries !== prev.entries || st.cursor !== prev.cursor) syncMedia(); });
}

/* ------------------------------------------------------------------ */
/* Decoding                                                            */
/* ------------------------------------------------------------------ */

const MAX_SIDE = 2400;

function useImage(slot: Slot<Img>) {
  image = slot;
  if (slot.info.id) {
    bitmaps.delete(slot.info.id);
    bitmaps.set(slot.info.id, slot);
    for (const [k, s] of bitmaps) {
      if (bitmaps.size <= KEEP_BITMAPS) break;
      if (s === image || s.el === shown.image) continue;
      bitmaps.delete(k);
      if ('close' in s.el) s.el.close();
    }
  }
}

async function decodeBitmap(blob: Blob): Promise<{ el: Img; w: number; h: number } | null> {
  try {
    let bmp: Img = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
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
    return { el: bmp, w, h };
  } catch {
    return null;
  }
}

async function decodeImage(blob: Blob, info: MediaInfo, g: number): Promise<boolean> {
  const d = await decodeBitmap(blob);
  if (!d) return false;
  if (gen.image !== g) { if ('close' in d.el) d.el.close(); return true; }
  const prev = image;
  useImage({ el: d.el, info });
  if (prev && !prev.info.id && prev.el !== shown.image && 'close' in prev.el) prev.el.close();
  return true;
}

function openVideo(blob: Blob, info: MediaInfo, g: number): Promise<HTMLVideoElement | null> {
  return new Promise(resolve => {
    const v = document.createElement('video');
    v.muted = useMedia.getState().videoMuted;
    v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('playsinline', '');
    const url = URL.createObjectURL(blob);
    v.src = url;
    v.addEventListener('loadeddata', () => {
      if (gen.video !== g) { v.remove(); URL.revokeObjectURL(url); resolve(null); return; }
      if (video) { video.el.pause(); video.el.remove(); }
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      videoUrl = url;
      video = { el: v, info: { ...info, w: info.w || v.videoWidth, h: info.h || v.videoHeight } };
      v.playbackRate = currentRecipe().media.rate;
      if (currentRecipe().source === 'video') {
        v.play().catch(() => { v.muted = true; useMedia.setState({ videoMuted: true }); v.play().catch(() => undefined); });
      }
      useMedia.setState({ videoPaused: v.paused, error: null });
      resolve(v);
    }, { once: true });
    v.addEventListener('error', () => { v.remove(); URL.revokeObjectURL(url); resolve(null); }, { once: true });
    v.addEventListener('play', () => { if (v === video?.el) useMedia.setState({ videoPaused: false }); });
    v.addEventListener('pause', () => { if (v === video?.el) useMedia.setState({ videoPaused: true }); });
    hide(v);
  });
}

/* ------------------------------------------------------------------ */
/* Loading a file the person picked                                    */
/* ------------------------------------------------------------------ */

export interface Loaded { kind: MediaKind; ref: MediaRef; store: PutResult }

export function mediaKindOf(file: File): MediaKind | null {
  return kindOfType(file.type) ?? kindOfType(guessType(file.name));
}

/**
 * Decodes a picked file, keeps it in the media store and returns the reference the recipe should
 * carry. The stage shows it once the current piece points to it: the caller makes that edit and
 * then calls syncMedia(true).
 */
export async function loadFile(file: File): Promise<Loaded | null> {
  const kind = mediaKindOf(file);
  if (!kind) { useMedia.setState({ error: 'Usa una imagen (JPG, PNG, WebP) o un video (MP4, WebM, MOV).' }); return null; }
  const g = ++gen[kind];
  restoring[kind] = '';
  let w = 0, h = 0;
  let img: { el: Img; w: number; h: number } | null = null;
  let vid: HTMLVideoElement | null = null;
  if (kind === 'image') {
    img = await decodeBitmap(file);
    if (!img) { useMedia.setState({ error: 'No se pudo abrir esa imagen. Prueba con JPG, PNG, WebP o AVIF.' }); return null; }
    w = img.w; h = img.h;
  } else {
    vid = await openVideo(file, { name: file.name, w: 0, h: 0, size: file.size }, g);
    if (!vid) {
      if (gen.video === g) useMedia.setState({ error: 'Este navegador no puede reproducir ese video. Prueba con MP4 (H.264) o WebM.' });
      return null;
    }
    w = vid.videoWidth; h = vid.videoHeight;
  }
  const stored = await put(file, { kind, name: file.name, w, h, lastModified: file.lastModified });
  const ref = normMediaRef({ id: stored.id, kind, name: file.name, type: file.type || guessType(file.name), size: file.size, w, h })!;
  const info: MediaInfo = { id: stored.id, name: file.name, w, h, size: file.size };
  rememberFile(stored.id, file, file.name);
  if (gen[kind] !== g) { if (img && 'close' in img.el) img.el.close(); return null; }
  if (img) useImage({ el: img.el, info: { ...info } });
  else if (video) video.info = info;
  useMedia.setState({ error: null });
  return { kind, ref, store: stored };
}

/* ------------------------------------------------------------------ */
/* Camera and video controls                                           */
/* ------------------------------------------------------------------ */

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

const videoEl = () => video?.el ?? null;
export function setVideoRate(rate: number) { const v = videoEl(); if (v) v.playbackRate = rate; }
export function toggleVideo() { const v = videoEl(); if (!v) return; if (v.paused) void v.play(); else v.pause(); }
export function toggleMute() {
  const m = !useMedia.getState().videoMuted;
  useMedia.setState({ videoMuted: m });
  const v = videoEl();
  if (v) v.muted = m;
}
export function pauseVideo() { videoEl()?.pause(); }
export function resumeVideo() { const v = videoEl(); if (v?.paused) void v.play().catch(() => undefined); }
