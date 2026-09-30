/**
 * Where the viewport's pictures come from (the compositor of scheduler.ts): photos, sequences, cut-outs and
 * masks from the core provider (media store, decoded here); video frames from the studio's video clock
 * (src/video/playback.ts, through playback.ts) when the project has videos, so that while it plays the preview
 * shows what the playing video element shows — in step with its sound — and, paused, the frame at the playhead
 * (the element seeked there, with the same 1 ms tolerance as the export's frame-exact decoder).
 *
 * A picture drawn while the video plays forward is what the element showed at that moment (a frame or so
 * around t, never waited for): frameKey() tells the compositor's caches so, and a paused render at the same
 * time is drawn again from the exact frame instead of reusing it.
 */
import { createSourceProvider, type SourceProvider } from '../project/sources';

const base = createSourceProvider({ video: 'preview' });
let video: SourceProvider | null = null;
let flowing: () => boolean = () => false;

/** The video clock's provider (null: videos come from the core provider's seeked element). */
export function setVideoProvider(p: SourceProvider | null, isFlowing: () => boolean = () => false): void {
  video = p;
  flowing = p ? isFlowing : () => false;
}

export const viewProvider: SourceProvider = {
  prepare: (s, t) => (s.kind === 'video' && video ? video.prepare(s, t) : base.prepare(s, t)),
  frame: (s, t) => (s.kind === 'video' && video ? video.frame(s, t) : base.frame(s, t)),
  prepareMedia: ref => base.prepareMedia(ref),
  image: ref => base.image(ref),
  missing: () => base.missing(),
  frameKey: s => (s.kind === 'video' && video && flowing() ? '~vivo' : ''),
  /** Frees the core provider's pictures (the video clock frees its own when it is disposed). */
  release: () => base.release(),
};
