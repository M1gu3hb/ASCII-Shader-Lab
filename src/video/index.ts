/**
 * Moving pictures out of a project: video, GIF and frame sequences rendered with the same evaluate +
 * Compositor as the preview (preview = export), the original audio kept in sync when possible, and object
 * tracking for masks on video. CONTRACT for the studio UI (export sheet, timeline, tracking tool): the
 * signatures below are fixed; lane «video» implements them. Import lazily (mediabunny is heavy).
 */
import type { Id, MaskRasterPart, Project } from '../project/types';

export type MovieFormat = 'mp4' | 'webm' | 'gif' | 'png-zip';

export interface FormatInfo {
  format: MovieFormat;
  /** Spanish label and the honest limits of the format («GIF: 256 colores por cuadro, sin sonido…»). */
  label: string;
  limits: string;
  /** False when this browser cannot write it, with the reason and a useful alternative. */
  available: boolean;
  why?: string;
  /** Whether the result can carry the project's transparency / sound in this browser. */
  alpha: boolean;
  audio: boolean;
}

export interface MovieOptions {
  format: MovieFormat;
  /** Output size (defaults to the project canvas); fps and the time range (defaults: project fps, whole duration). */
  width?: number;
  height?: number;
  fps?: number;
  start?: number;
  end?: number;
  /** Keep the sound of the project's video sources ('keep') or leave it out. */
  audio?: 'keep' | 'none';
  /** GIF: colours, dithering and whether it loops forever. */
  gif?: { colors?: number; dither?: 'none' | 'bayer' | 'floyd'; loop?: boolean };
  /** Keep transparency where the format allows it. */
  transparent?: boolean;
  onProgress?: (p: { done: number; total: number; label: string }) => void;
  signal?: AbortSignal;
}

export interface MovieResult {
  blob: Blob;
  name: string;
  mime: string;
  /** What happened to the sound: copied as is, re-encoded, none in the project, or not possible here. */
  audio: 'copied' | 'reencoded' | 'none' | 'unsupported';
  /** Spanish notes shown after the export (limits met, fallbacks taken). */
  notes: string[];
}

/** What this browser can write for this project (codecs are probed, never assumed). */
export async function movieFormats(_p: Project): Promise<FormatInfo[]> {
  return [];
}

export async function exportMovie(_p: Project, _o: MovieOptions): Promise<MovieResult> {
  throw new Error('La exportación de video todavía no está disponible en esta versión.');
}

export interface TrackOptions {
  /** The video source and the layer whose mask receives the tracked part. */
  source: Id;
  layer: Id;
  /** The object on the first frame: points (frame units) and/or a box, as in object selection. */
  points: Array<{ x: number; y: number; positive: boolean }>;
  box?: { x: number; y: number; w: number; h: number };
  start: number;
  end: number;
  /** Seconds between model keyframes (smaller = follows fast motion better, slower to compute). */
  keyEvery?: number;
  onProgress?: (p: { done: number; total: number; label: string }) => void;
  signal?: AbortSignal;
}

/** Follows an object through a video: a raster mask part with one frame per step (origin 'track'). */
export async function trackObject(_p: Project, _o: TrackOptions): Promise<MaskRasterPart> {
  throw new Error('El seguimiento de objetos todavía no está disponible en esta versión.');
}

/**
 * A correction on one frame (new points there): that frame becomes a keyframe and only the stretch between
 * its neighbouring keyframes is recomputed. Returns the updated part.
 */
export async function correctTrack(
  _p: Project,
  _part: MaskRasterPart,
  _at: { t: number; points: Array<{ x: number; y: number; positive: boolean }> },
  _o: Pick<TrackOptions, 'source' | 'layer' | 'onProgress' | 'signal'>,
): Promise<MaskRasterPart> {
  throw new Error('El seguimiento de objetos todavía no está disponible en esta versión.');
}
