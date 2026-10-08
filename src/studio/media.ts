import { create } from 'zustand';
import { normMediaRef, type MediaRef } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import { getMedia, guessType, kindOfType, put, type MediaKind, type PutResult } from './mediaStore';
import { currentRecipe, edit, linkMedia, setCameraMirror, useStudio } from './store';
import { cameraConstraints, cameraList, facingOf, mirrorFor, parseChoices, rememberMirror, type CameraDevice, type Facing, type MirrorChoices } from './cameraMirror';

/**
 * Local media. Files are decoded in the browser and never uploaded anywhere.
 * Images and videos are also kept in this browser's media store (mediaStore.ts), and each recipe
 * names the file it was made with (`media.ref`), so the media follows the current piece: going
 * back in the history, opening a favourite or a project brings its own image back.
 * The camera is only requested when the person presses "Activar cámara" and is never stored; the front
 * camera shows as a mirror by default, in the recipe (cameraMirror.ts), so exports show what the stage shows.
 */
export interface MediaInfo { name: string; w: number; h: number; size: number; id?: string; type?: string }

/**
 * What the current piece is missing: its file is being brought back from the store ('restoring'),
 * is no longer stored in this browser ('missing'), is stored but this browser cannot decode it
 * ('unreadable', e.g. a session made in another browser), or never travelled with the link or
 * project that opened it ('foreign').
 */
export interface MediaNeed { state: 'restoring' | 'missing' | 'unreadable' | 'foreign'; ref: MediaRef }

/** The camera asked for last in this browser session, and the person's «Espejo» choices (sessionStorage). */
const K_CAM = 'mt.camera', K_MIRROR = 'mt.camMirror';

/** The camera asked for last in this browser session (the front one by default). */
function loadCamWant(): { facing: Facing; deviceId: string | null } {
  try {
    const o = JSON.parse(sessionStorage.getItem(K_CAM) || '{}') as { facing?: string; deviceId?: unknown };
    return { facing: o.facing === 'environment' ? 'environment' : 'user', deviceId: typeof o.deviceId === 'string' && o.deviceId ? o.deviceId : null };
  } catch { return { facing: 'user', deviceId: null }; }
}

interface MediaState {
  /** What the stage shows right now (null: the pattern shows instead). */
  image: MediaInfo | null;
  video: MediaInfo | null;
  camera: 'off' | 'starting' | 'on' | 'error';
  videoPaused: boolean;
  videoMuted: boolean;
  error: string | null;
  need: MediaNeed | null;
  /** The camera asked for: which way it should look, or one device the person picked (cameraMirror.ts). */
  camWant: { facing: Facing; deviceId: string | null };
  /** Which way the camera that is on really looks (null while it is off). */
  camFacing: Facing | null;
  /** The device of the camera that is on. */
  camDevice: string | null;
  /** The cameras this browser lists (their names only once the permission was granted: see cameraList). */
  cameras: CameraDevice[];
}

export const useMedia = create<MediaState>(() => ({
  image: null, video: null, camera: 'off', videoPaused: false, videoMuted: true, error: null, need: null,
  camWant: loadCamWant(), camFacing: null, camDevice: null, cameras: [],
}));

type Img = ImageBitmap | HTMLCanvasElement;
interface Slot<T> { el: T; info: MediaInfo }

let engine: Renderer | null = null;
/** Loaded media per kind (may be loaded but not shown, when the current piece wants another file). */
let image: Slot<Img> | null = null;
let video: Slot<HTMLVideoElement> | null = null;
let videoUrl = '';
let camStream: MediaStream | null = null;
let camEl: HTMLVideoElement | null = null;
let cameraGen = 0;
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
  const space = useStudio.getState().space;
  const key = `${space}|${r.source}|${ref?.kind ?? ''}|${ref?.id ?? ''}|${ref ? 1 : 0}`;
  if (!force && key === lastKey) return;
  lastKey = key;
  const kind = r.source;
  if (space === 'componentes' || kind !== 'camera') stopCamera();
  if (space === 'componentes' || kind !== 'video' || (ref?.id && loadedId('video') !== ref.id)) pauseVideo();
  else resumeVideo();
  if (kind !== 'image' && kind !== 'video') { setNeed(null); return; }
  const want = ref?.kind === kind ? ref : undefined;
  const settle = (on: boolean, need: MediaNeed | null) => { cancelRestore(kind); show(kind, on); setNeed(need); };
  if (!want) return settle(true, null);                                       // older recipes: whatever is loaded
  if (!want.id) return settle(false, { state: 'foreign', ref: want });
  if (loadedId(kind) === want.id) return settle(true, null);
  const cached = kind === 'image' ? bitmaps.get(want.id) : undefined;
  if (cached) { useImage(cached); return settle(true, null); }
  show(kind, false);
  setNeed({ state: 'restoring', ref: want });
  void restore(kind, want);
}

/** A restore still on its way would replace what the piece now shows: let it go. */
function cancelRestore(kind: MediaKind) {
  if (!restoring[kind]) return;
  restoring[kind] = '';
  gen[kind]++;
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
  const info: MediaInfo = { id, name: ref.name ?? found.name ?? '', w: ref.w, h: ref.h, size: found.blob.size, type: ref.type ?? found.type };
  const ok = kind === 'image' ? await decodeImage(found.blob, info, g) : await openVideo(found.blob, info, g);
  if (gen[kind] !== g) return;
  restoring[kind] = '';
  if (!ok) { if (wanted(kind) === id) setNeed({ state: 'unreadable', ref }); return; }
  syncMedia(true);
}

function wanted(kind: MediaKind): string | undefined {
  const r = currentRecipe();
  return r.source === kind && r.media.ref?.kind === kind ? r.media.ref.id : undefined;
}

/** Starts following the current piece. Call once, after the store is hydrated. */
let mediaSyncStarted = false;
export function startMediaSync() {
  if (mediaSyncStarted) return;
  mediaSyncStarted = true;
  linkMedia({
    refFor: kind => {
      const i = (kind === 'image' ? image : video)?.info;
      return i?.id ? normMediaRef({ id: i.id, kind, name: i.name, type: i.type, size: i.size, w: i.w, h: i.h }) : undefined;
    },
    holdThumb: e => {
      const src = e.recipe.source;
      return (src === 'image' && !shown.image) || (src === 'video' && !shown.video) || (src === 'camera' && !camEl);
    },
  });
  syncMedia(true);
  useStudio.subscribe((st, prev) => {
    if (st.away) { stopCamera(); pauseVideo(); return; }
    if (st.entries !== prev.entries || st.cursor !== prev.cursor || st.space !== prev.space) syncMedia();
  });
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
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      v.pause(); v.removeAttribute('src'); v.load(); v.remove(); URL.revokeObjectURL(url); resolve(null);
    };
    const timer = setTimeout(fail, 10_000);
    v.src = url;
    v.addEventListener('loadeddata', () => {
      if (settled) return;
      if (gen.video !== g) { fail(); return; }
      settled = true; clearTimeout(timer);
      if (video) { video.el.pause(); video.el.remove(); }
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      videoUrl = url;
      video = { el: v, info: { ...info, w: info.w || v.videoWidth, h: info.h || v.videoHeight } };
      v.playbackRate = currentRecipe().media.rate;
      if (currentRecipe().source === 'video' && useStudio.getState().space !== 'componentes' && !useStudio.getState().away) {
        v.play().catch(error => {
          // A pause or space change can reject play after the caller already left the video.
          if (error?.name === 'AbortError' || video?.el !== v || currentRecipe().source !== 'video' || useStudio.getState().space === 'componentes' || useStudio.getState().away) return;
          v.muted = true; useMedia.setState({ videoMuted: true }); v.play().catch(() => undefined);
        });
      }
      useMedia.setState({ videoPaused: v.paused, error: null });
      resolve(v);
    }, { once: true });
    v.addEventListener('error', fail, { once: true });
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
      if (gen.video === g) useMedia.setState({ error: 'No se pudo decodificar el video en 10 segundos. Comprueba que se reproduce en este navegador; si falla, vuelve a exportarlo con otro perfil o códec.' });
      return null;
    }
    w = vid.videoWidth; h = vid.videoHeight;
  }
  const stored = await put(file, { kind, name: file.name, w, h, lastModified: file.lastModified });
  const ref = normMediaRef({ id: stored.id, kind, name: file.name, type: file.type || guessType(file.name), size: file.size, w, h })!;
  const info: MediaInfo = { id: stored.id, name: file.name, w, h, size: file.size, type: ref.type };
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

/**
 * Why the camera did not open, in words, with what to do: the browser tells denied permission, no camera
 * and a camera another program holds apart (DOMException names; the older Chrome names too).
 */
export function cameraProblem(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  const msg = String((e as { message?: string } | null)?.message ?? '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    if (/dismiss/i.test(msg)) return 'Cerraste la pregunta del permiso sin responder. Pulsa «Activar cámara» otra vez y elige «Permitir».';
    if (/system/i.test(msg)) return 'El sistema no deja a este navegador usar la cámara. Permítelo en los ajustes de privacidad del sistema (Cámara) y vuelve a intentarlo.';
    return 'El permiso de la cámara está denegado para este sitio. Actívalo en los permisos del sitio (el icono junto a la dirección) y vuelve a intentarlo.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'No hay ninguna cámara disponible. Conecta una (o actívala) y vuelve a intentarlo.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'La cámara está ocupada o no responde: puede que la esté usando otra aplicación o pestaña (una videollamada, por ejemplo). Ciérrala y vuelve a intentarlo.';
  }
  if (name === 'SecurityError') return 'Esta página no puede pedir la cámara aquí (hace falta HTTPS, o el sitio que la incrusta no lo permite).';
  if (name === 'NotSupportedError') return 'Este navegador no deja pedir la cámara en esta página. Prueba en otra ventana normal del navegador o en otro navegador.';
  return 'No se pudo abrir la cámara. Revisa el permiso del navegador y que ninguna otra aplicación la esté usando.';
}

/* The camera: which one, and its mirror ----------------------------- */

function saveCamWant(want: { facing: Facing; deviceId: string | null }) {
  useMedia.setState({ camWant: want });
  try { sessionStorage.setItem(K_CAM, JSON.stringify(want)); } catch { /* storage unavailable: kept for this page */ }
}

/** The person's «Espejo» choices for the camera, per way of looking, for this browser session. */
let mirrorChoices: MirrorChoices = (() => { try { return parseChoices(sessionStorage.getItem(K_MIRROR)); } catch { return {}; } })();

/** Which way the camera looks for the mirror: the one that is on, else the one asked for. */
const facingNow = (): Facing => useMedia.getState().camFacing ?? useMedia.getState().camWant.facing;

/**
 * The person flipped «Espejo» while the piece uses the camera: the choice is kept for this way of looking
 * (front or rear) and wins over the default when the camera starts again in this browser session.
 */
export function chooseCameraMirror(mirror: boolean) {
  mirrorChoices = rememberMirror(mirrorChoices, facingNow(), mirror);
  try { sessionStorage.setItem(K_MIRROR, JSON.stringify(mirrorChoices)); } catch { /* kept for this page */ }
  edit(r => { r.media.mirror = mirror; }, 'media.mirror');
}

/**
 * The current camera piece takes the mirror of the camera that is on: the front camera as a mirror, the
 * rear one as it is, unless the person chose otherwise for it. It is the camera's orientation rather than
 * an edit of the piece (store.setCameraMirror), and it lives in the recipe, so every export shows the same.
 */
function adoptMirror() {
  const st = useMedia.getState();
  if (st.camera !== 'on' || !st.camFacing || currentRecipe().source !== 'camera') return;
  setCameraMirror(mirrorFor(st.camFacing, mirrorChoices));
}

let camFollow = false;
/** Moving through the history onto another camera piece while the camera is on: it takes the camera's mirror too. */
function followCameraPieces() {
  if (camFollow) return;
  camFollow = true;
  useStudio.subscribe((st, prev) => {
    if (st.change.n !== prev.change.n && st.change.kind !== 'edit') adoptMirror();
  });
}

/** The cameras this browser lists (after the permission, with their names). */
async function listCameras() {
  try {
    const cams = cameraList(await navigator.mediaDevices.enumerateDevices());
    const cur = useMedia.getState().cameras;
    if (cams.length !== cur.length || cams.some((c, i) => c.id !== cur[i].id || c.label !== cur[i].label)) useMedia.setState({ cameras: cams });
  } catch { /* not listed: the front / rear choice still works */ }
}

let watchingDevices = false;
function watchDevices() {
  if (watchingDevices || !navigator.mediaDevices?.addEventListener) return;
  watchingDevices = true;
  navigator.mediaDevices.addEventListener('devicechange', () => void listCameras());
}

/**
 * Turns the camera on: the one asked for (`facing`, or a `deviceId` the person picked), or else the one
 * asked for last. With the camera already on, asking for another one switches to it; asking for none keeps it.
 */
export async function startCamera(ask: { facing?: Facing; deviceId?: string | null } = {}): Promise<boolean> {
  const prevWant = useMedia.getState().camWant;
  const want = {
    facing: ask.facing ?? prevWant.facing,
    // a way of looking asked for replaces a device picked before
    deviceId: ask.deviceId !== undefined ? ask.deviceId : ask.facing ? null : prevWant.deviceId,
  };
  const switching = ask.facing !== undefined || ask.deviceId !== undefined;
  if (useMedia.getState().camera === 'starting' && !switching) return false;
  if (camStream && camEl && !switching) {
    engine?.setMedia('camera', camEl);
    // the caller may make the piece a camera piece right after this call
    queueMicrotask(adoptMirror);
    return true;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    useMedia.setState({ camera: 'error', error: typeof isSecureContext !== 'undefined' && !isSecureContext ? 'La cámara sólo se puede usar en una página segura (HTTPS).' : 'Este navegador no da acceso a la cámara.' });
    return false;
  }
  saveCamWant(want);
  const g = ++cameraGen;
  // phones open one camera at a time: the one that is on stops before the other opens
  if (camStream) releaseCamera();
  // until the new camera says which way it looks, the one asked for counts (an «Espejo» flipped meanwhile is its)
  useMedia.setState({ camera: 'starting', camFacing: null, camDevice: null, error: null });
  followCameraPieces();
  let stream: MediaStream | null = null;
  let el: HTMLVideoElement | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: cameraConstraints(want), audio: false });
    if (g !== cameraGen) { stream.getTracks().forEach(t => t.stop()); return false; }
    el = document.createElement('video');
    el.muted = true; el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.srcObject = stream;
    hide(el);
    try { await el.play(); } catch (err) { el.remove(); throw err; }
    if (g !== cameraGen) { el.pause(); el.srcObject = null; el.remove(); stream.getTracks().forEach(t => t.stop()); return false; }
    camStream = stream;
    camEl = el;
    // unplugged, or taken by the system: say so instead of freezing on the last frame
    for (const t of stream.getVideoTracks()) {
      t.addEventListener('ended', () => {
        if (camStream !== stream) return;
        stopCamera();
        useMedia.setState({ camera: 'error', error: 'La cámara se desconectó o dejó de enviar imagen. Vuelve a activarla cuando esté lista.' });
      });
    }
    // which way it really looks: a desktop webcam usually says nothing, and faces the person
    const settings = (stream.getVideoTracks()[0]?.getSettings?.() ?? {}) as MediaTrackSettings;
    engine?.setMedia('camera', camEl);
    useMedia.setState({ camera: 'on', camFacing: facingOf(settings.facingMode), camDevice: settings.deviceId || null });
    adoptMirror();
    watchDevices();
    void listCameras();
    return true;
  } catch (err) {
    // a stream that opened but could not play must not keep the camera (and its light) on
    stream?.getTracks().forEach(t => t.stop());
    el?.remove();
    if (g !== cameraGen) return false;
    camStream = null;
    camEl = null;
    useMedia.setState({ camera: 'error', camFacing: null, camDevice: null, error: cameraProblem(err) });
    return false;
  }
}

/** Front or rear: with the camera on it switches at once; off, it is the one that opens next time. */
export function chooseFacing(facing: Facing) {
  if (useMedia.getState().camera === 'on') { void startCamera({ facing }); return; }
  saveCamWant({ facing, deviceId: null });
}

/** One of the listed cameras: with the camera on it switches at once; off, it is the one that opens next time. */
export function chooseCamera(deviceId: string) {
  if (useMedia.getState().camera === 'on') { void startCamera({ deviceId }); return; }
  saveCamWant({ facing: useMedia.getState().camWant.facing, deviceId });
}

/** Stops the camera's tracks and takes its picture off the stage. */
function releaseCamera() {
  camStream?.getTracks().forEach(t => t.stop());
  camStream = null;
  if (camEl) { camEl.pause(); camEl.srcObject = null; }
  camEl?.remove();
  camEl = null;
  engine?.setMedia('camera', null);
}

export function stopCamera() {
  cameraGen++;
  releaseCamera();
  useMedia.setState({ camera: 'off', camFacing: null, camDevice: null });
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
