/**
 * Which way the camera looks, and whether its picture is mirrored (pure: no DOM, no store; media.ts
 * applies it, tests/unit/camera-mirror.test.ts checks it).
 *
 * A phone's own camera app shows the front camera as a mirror (raise your right hand, the hand on the
 * right of the screen rises) and the rear camera as it is. The studio does the same by default, and it
 * does it in the recipe (`media.mirror`), so the stage, stills, recordings, GIF, video and code exports
 * all show the same thing: what you see is what the file will be.
 *
 * Once the person flips «Espejo» for a camera, that choice wins over the default for that way of looking
 * (front or rear) until the browser session ends, also when the camera is turned off and on again.
 */

export type Facing = 'user' | 'environment';

/**
 * The way the active camera looks. Browsers report `facingMode` from the track's settings: 'user' (towards
 * the person), 'environment' (away), or, rarely, 'left' / 'right'. A desktop webcam usually reports nothing:
 * it faces the person, so anything that is not 'environment' counts as the front camera.
 */
export function facingOf(reported: string | undefined | null): Facing {
  return reported === 'environment' ? 'environment' : 'user';
}

/** The default: the front camera mirrored (as a phone's camera app shows it), the rear camera as it is. */
export function defaultMirror(facing: Facing): boolean {
  return facing === 'user';
}

/** The person's own choices of «Espejo», per way of looking (unset: the default applies). */
export type MirrorChoices = Partial<Record<Facing, boolean>>;

/** Whether the picture of a camera that looks this way is mirrored: the person's choice, else the default. */
export function mirrorFor(facing: Facing, choices: MirrorChoices): boolean {
  const c = choices[facing];
  return typeof c === 'boolean' ? c : defaultMirror(facing);
}

/** Remembers that the person chose `mirror` for the camera that looks this way (a new object). */
export function rememberMirror(choices: MirrorChoices, facing: Facing, mirror: boolean): MirrorChoices {
  return { ...choices, [facing]: mirror };
}

/** Reads remembered choices from their stored form, ignoring anything malformed. */
export function parseChoices(raw: string | null | undefined): MirrorChoices {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: MirrorChoices = {};
    for (const f of ['user', 'environment'] as const) if (typeof o?.[f] === 'boolean') out[f] = o[f] as boolean;
    return out;
  } catch {
    return {};
  }
}

/** A video input as the camera picker lists it. */
export interface CameraDevice { id: string; label: string }

/**
 * Names for the cameras a browser lists. Before the permission is granted (and in some browsers after it)
 * labels come empty: the list then says «Cámara 1», «Cámara 2»… Devices without an id cannot be chosen.
 */
export function cameraList(devices: Array<{ kind: string; deviceId: string; label: string }>): CameraDevice[] {
  const cams = devices.filter(d => d.kind === 'videoinput' && d.deviceId);
  return cams.map((d, i) => ({ id: d.deviceId, label: d.label.trim() || `Cámara ${i + 1}` }));
}

/**
 * What to ask the browser for. A chosen device is asked for exactly (it is the one the person picked);
 * otherwise a way of looking is only preferred, so a desktop with one webcam still opens it.
 */
export function cameraConstraints(want: { facing: Facing; deviceId?: string | null }): MediaTrackConstraints {
  return want.deviceId
    ? { deviceId: { exact: want.deviceId }, width: { ideal: 1280 } }
    : { facingMode: { ideal: want.facing }, width: { ideal: 1280 } };
}
