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
