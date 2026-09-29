/**
 * Moving pictures out of a project: video, GIF and frame sequences rendered with the same evaluate +
 * Compositor as the preview (preview = export), the original audio kept in sync when possible, and object
 * tracking for masks on video. CONTRACT for the studio UI (export sheet, timeline, tracking tool): the
 * signatures below are fixed; lane «video» implements them. Import lazily (mediabunny is heavy).
 *
 *   movie.ts      exportMovie / movieFormats: the frame loop into MP4, WebM, GIF, PNG .zip
 *   frames.ts     frame-exact video decoded in order for the loop; tracked masks trimmed per frame
 *   audio.ts      the sound (packet copy or re-encode) next to the picture; audioplan.ts which sound, where
 *   formats.ts    what this browser encodes (probed) and what each format can carry, in Spanish
 *   gifcore.ts    GIF limits, palettes and dithering
 *   playback.ts   the studio preview's clock (video elements or rAF), reverse, loops, rate
 *   track.ts      trackObject / correctTrack (keyframed model decodes + optical flow + SDF blends)
 *   flow.ts, flow-gl.ts, sdf.ts, keys.ts   the pieces of tracking
 *   matte.ts      removeBackgroundVideo (per-frame matting, flow-compensated smoothing)
 */
import type { Id, MaskRasterPart, Project } from '../project/types';
import { exportMovieImpl, movieFormatsFor } from './movie';
import { correctTrackImpl, trackObjectImpl } from './track';

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
  /**
   * Whose sound (a video source id). Default: the bottom-most layer's video that has sound. Only one source's
   * sound goes out (no mixing).
   */
  audioSource?: Id;
  /**
   * GIF: colours, dithering, whether it loops forever, and one palette for the whole clip ('global', default:
   * stable colours, smaller file) or one per frame ('frame': better colours, may shimmer).
   */
  gif?: { colors?: number; dither?: 'none' | 'bayer' | 'floyd'; loop?: boolean; palette?: 'global' | 'frame' };
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
export async function movieFormats(p: Project): Promise<FormatInfo[]> {
  return movieFormatsFor(p);
}

/**
 * Renders and encodes the project. Rejects with an Error named 'AbortError' when `signal` aborts (everything it
 * opened is closed first), or with a Spanish message when the format cannot be written here.
 */
export async function exportMovie(p: Project, o: MovieOptions): Promise<MovieResult> {
  return exportMovieImpl(p, o);
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
export async function trackObject(p: Project, o: TrackOptions): Promise<MaskRasterPart> {
  return trackObjectImpl(p, o);
}

/**
 * A correction on one frame (new points there): that frame becomes a keyframe and only the stretch between
 * its neighbouring keyframes is recomputed. Returns the updated part.
 */
export async function correctTrack(
  p: Project,
  part: MaskRasterPart,
  at: { t: number; points: Array<{ x: number; y: number; positive: boolean }> },
  o: Pick<TrackOptions, 'source' | 'layer' | 'onProgress' | 'signal'>,
): Promise<MaskRasterPart> {
  return correctTrackImpl(p, part, at, o);
}

export { movieFormatsFor, movieResources, outputSize } from './movie';
export { createPlayback, type Playback, type PlaybackOptions, type PlaybackStats } from './playback';
export { removeBackgroundVideo, estimateBackgroundVideo, type VideoMatteOptions, type VideoMatteEstimate } from './matte';
export { setTrackSegmenter, trackEstimate, type Segmenter, type TrackStats, lastTrackStats } from './track';
export { frameAt, trimMaskFrames } from './frames';
