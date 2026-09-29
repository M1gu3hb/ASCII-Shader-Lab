/**
 * Taking a photo with the camera, with the rule the lab follows (to be unified with it later):
 *   - the front camera is mirrored by default (you see yourself as in a mirror), the rear one is not;
 *   - what the preview shows is what the photo will be (the capture is flipped exactly like the preview);
 *   - front/rear can be switched, and the person's own mirror choice wins for that camera for the rest of
 *     the session (remembered per facing mode).
 * The pure decision (mirrorFor) is unit-tested (tests/unit/foto-camera.test.ts).
 */
export type Facing = 'user' | 'environment';

/** Mirror by default: the front camera (or an unknown one: a desktop webcam faces you) yes, the rear no. */
export const defaultMirror = (facing: Facing | 'unknown') => facing !== 'environment';

export type MirrorOverrides = Partial<Record<Facing, boolean>>;

/** The mirror for a camera: the person's choice for it when there is one, else the default. */
export function mirrorFor(facing: Facing | 'unknown', overrides: MirrorOverrides): boolean {
  const f: Facing = facing === 'environment' ? 'environment' : 'user';
  return overrides[f] ?? defaultMirror(facing);
}

const KEY = 'glyphos.foto.espejo';

export function loadOverrides(): MirrorOverrides {
  try {
    const o = JSON.parse(sessionStorage.getItem(KEY) || '{}') as Record<string, unknown>;
    const out: MirrorOverrides = {};
    if (typeof o.user === 'boolean') out.user = o.user;
    if (typeof o.environment === 'boolean') out.environment = o.environment;
    return out;
  } catch { return {}; }
}

export function saveOverride(facing: Facing, mirror: boolean): MirrorOverrides {
  const o = { ...loadOverrides(), [facing]: mirror };
  try { sessionStorage.setItem(KEY, JSON.stringify(o)); } catch { /* storage unavailable: this session only */ }
  return o;
}

export interface OpenCamera { stream: MediaStream; facing: Facing | 'unknown'; label: string }

/** Opens a camera facing `want` (the browser may give another one: `facing` says which, when it tells). */
export async function openCamera(want: Facing): Promise<OpenCamera> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error(typeof isSecureContext !== 'undefined' && !isSecureContext ? 'insecure' : 'unsupported'), { name: 'NotSupportedError' });
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: want }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  const track = stream.getVideoTracks()[0];
  const s = (track?.getSettings?.() ?? {}) as MediaTrackSettings;
  const f = s.facingMode === 'user' || s.facingMode === 'environment' ? s.facingMode : 'unknown';
  return { stream, facing: f, label: track?.label ?? '' };
}

export function stopStream(s: MediaStream | null) { s?.getTracks().forEach(t => t.stop()); }

/** How many cameras the browser lists (0 when it does not say). */
export async function cameraCount(): Promise<number> {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput').length; } catch { return 0; }
}

/** The current frame of a playing video, flipped when mirrored: exactly what the preview shows. */
export function captureFrame(video: HTMLVideoElement, mirror: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = video.videoWidth; c.height = video.videoHeight;
  const x = c.getContext('2d')!;
  if (mirror) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(video, 0, 0, c.width, c.height);
  return c;
}

/** Why the camera did not open, in words, with what to do. */
export function cameraProblem(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  const msg = String((e as { message?: string } | null)?.message ?? '');
  if (msg === 'insecure') return 'La cámara sólo se puede usar en una página segura (HTTPS).';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'El permiso de la cámara está denegado para este sitio. Actívalo en los permisos del sitio (el icono junto a la dirección) y vuelve a intentarlo.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'No hay ninguna cámara disponible. Conecta una (o actívala) y vuelve a intentarlo.';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'La cámara está ocupada o no responde: puede que la esté usando otra aplicación o pestaña. Ciérrala y vuelve a intentarlo.';
  if (name === 'NotSupportedError') return 'Este navegador no da acceso a la cámara en esta página.';
  return 'No se pudo abrir la cámara. Revisa el permiso del navegador y que ninguna otra aplicación la esté usando.';
}

/* ------------------------------------------------------------------ recording a clip */

/**
 * «Grabar un clip»: the camera's picture is drawn into a canvas exactly as the preview shows it (flipped when the
 * mirror is on, following the switch while recording) and that canvas is recorded (MediaRecorder on
 * canvas.captureStream), with the microphone when the person asks for sound. So the file looks like the preview,
 * frame by frame. The file is then remuxed (the same packets, not re-encoded) into a regular WebM/MP4 with its
 * length and seek index, which MediaRecorder leaves out.
 */
export interface ClipFormat { mime: string; ext: 'webm' | 'mp4' }

/** What this browser records a clip as, or null when it cannot record one here. */
export function clipFormat(): ClipFormat | null {
  if (typeof MediaRecorder === 'undefined' || typeof document === 'undefined') return null;
  if (typeof (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream !== 'function') return null;
  const list = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
  for (const m of list) {
    try { if (MediaRecorder.isTypeSupported(m)) return { mime: m, ext: m.startsWith('video/mp4') ? 'mp4' : 'webm' }; } catch { /* next */ }
  }
  return null;
}

export const CLIP_UNSUPPORTED = 'Este navegador no puede grabar video desde la cámara en esta página (no tiene MediaRecorder para lienzos). Toma una foto, o graba el clip con la app de la cámara y ábrelo aquí.';

/** Longest clip (seconds): a recording is kept in memory until it stops. */
export const CLIP_MAX_S = 60;

export interface ClipRecorder {
  /** Seconds recorded so far. */
  seconds(): number;
  /** Stops and hands out the file (already remuxed). */
  stop(): Promise<{ blob: Blob; ext: 'webm' | 'mp4'; w: number; h: number; seconds: number; audio: boolean }>;
  /** Stops and throws everything away. */
  cancel(): void;
}

export function recordClip(video: HTMLVideoElement, mirror: () => boolean, o: { mic?: MediaStream | null; fps?: number; maxSide?: number; onLimit?(): void } = {}): ClipRecorder {
  const fmt = clipFormat();
  if (!fmt) throw Object.assign(new Error(CLIP_UNSUPPORTED), { name: 'NotSupportedError' });
  const k = Math.min(1, (o.maxSide ?? 1920) / Math.max(1, video.videoWidth, video.videoHeight));
  // (even sizes: some encoders refuse odd ones)
  const w = Math.max(2, Math.round((video.videoWidth * k) / 2) * 2), h = Math.max(2, Math.round((video.videoHeight * k) / 2) * 2);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const draw = () => {
    x.setTransform(mirror() ? -1 : 1, 0, 0, 1, mirror() ? w : 0, 0);
    x.drawImage(video, 0, 0, w, h);
  };
  draw();
  const fps = o.fps ?? 30;
  const stream = (c as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(fps);
  const audio = !!o.mic?.getAudioTracks().length;
  for (const t of o.mic?.getAudioTracks() ?? []) stream.addTrack(t);
  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  let live = true, handle = 0;
  const rvfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback?.bind(video);
  const loop = () => { if (!live) return; draw(); handle = rvfc ? rvfc(loop) : requestAnimationFrame(loop); };
  handle = rvfc ? rvfc(loop) : requestAnimationFrame(loop);
  const t0 = performance.now();
  const limit = setTimeout(() => o.onLimit?.(), (CLIP_MAX_S) * 1000);
  rec.start(250);
  const end = () => {
    live = false;
    clearTimeout(limit);
    if (!rvfc) cancelAnimationFrame(handle);
    for (const t of stream.getVideoTracks()) t.stop();
  };
  return {
    seconds: () => (performance.now() - t0) / 1000,
    async stop() {
      const seconds = (performance.now() - t0) / 1000;
      const done = new Promise<void>(res => { rec.onstop = () => res(); });
      if (rec.state !== 'inactive') rec.stop();
      await done;
      end();
      c.width = c.height = 0;
      const raw = new Blob(chunks, { type: fmt.mime.split(';')[0] });
      return { blob: await tidyClip(raw, fmt.ext), ext: fmt.ext, w, h, seconds, audio };
    },
    cancel() { end(); try { if (rec.state !== 'inactive') rec.stop(); } catch { /* gone */ } chunks.length = 0; c.width = c.height = 0; },
  };
}

/** A recording as players and decoders expect it: the same packets in a regular WebM / fast-start MP4 (or as it came). */
export async function tidyClip(blob: Blob, ext: 'webm' | 'mp4'): Promise<Blob> {
  try {
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: ext === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target });
    const conv = await mb.Conversion.init({ input, output, video: { alpha: 'discard' }, showWarnings: false });
    if (!conv.isValid) { input.dispose(); return blob; }
    await conv.execute();
    input.dispose();
    return target.buffer && target.buffer.byteLength > 1024 ? new Blob([target.buffer], { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' }) : blob;
  } catch {
    return blob;
  }
}
