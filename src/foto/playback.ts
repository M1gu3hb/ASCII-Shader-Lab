/**
 * The studio's playback clock: one for the whole editor (the timeline on the desktop, the one in the phone's
 * sheet and the phone's play button share it). By default the timeline's own clock (timeline/clock.ts:
 * requestAnimationFrame only while playing, time on the project's frame grid, reverse, speed, loop region)
 * on the project store's time. It is injectable (setStudioClock), and a project with videos gets the video
 * clock of src/video/playback.ts:
 *
 *   - playing forward, the bottom-most video element is the clock and its sound is heard, in step with the
 *     picture (the project time follows the element's currentTime); other videos play along, muted;
 *   - backwards: the elements are paused and seeked to each frame (coalesced), without sound;
 *   - paused: a playhead moved by the timeline (a click, a drag, the arrows) is drawn from the element seeked
 *     there; nothing runs;
 *   - the timeline's loop region and speed go straight to it (it is a PlaybackClock);
 *   - the viewport's compositor gets its video frames from it (viewProvider.ts), and each time it hands out is
 *     drawn by the viewport's one render loop (scheduler.ts renderNow) before the next one: a slow render
 *     lowers the frame rate, never the sync with the sound.
 * Photo-only projects (photos, sequences, patterns) keep the built-in clock.
 *
 * While it plays, ui.playing is true (the viewport then keeps to its light view when frames are slow).
 */
import { useSyncExternalStore } from 'react';
import { setTime, useProject } from '../project/store';
import type { Project } from '../project/types';
import { videoSourcesInOrder } from '../video/audioplan';
import { createPlayback, type Playback } from '../video/playback';
import { renderNow } from './scheduler';
import { createClock, type PlaybackClock, type PlaybackState } from './timeline/clock';
import { setUI } from './ui';
import { setVideoProvider } from './viewProvider';

/** The length the timeline shows: the duration, or further when clips or keys go past it (at least 1 s). */
export function timelineLength(p: Project | null | undefined): number {
  if (!p) return 1;
  let end = p.time.duration;
  for (const l of p.layers) {
    if (l.span) end = Math.max(end, l.span.out);
    for (const c of l.clips) end = Math.max(end, c.start + c.dur);
  }
  for (const t of p.tracks) for (const k of t.keys) end = Math.max(end, k.t);
  return Math.max(1, end);
}

/** Whether the project moves: clips, keys, spans, a video or a sequence of photos (its timeline opens by itself). */
export function projectMoves(p: Project | null | undefined): boolean {
  if (!p) return false;
  return p.tracks.length > 0 || p.layers.some(l => l.clips.length > 0 || !!l.span)
    || p.sources.some(s => s.kind === 'video' || (s.kind === 'sequence' && s.media.length > 1));
}

const P = () => useProject.getState();
let own: PlaybackClock | null = null;
let custom: PlaybackClock | null = null;
const listeners = new Set<() => void>();
let unbind: (() => void) | null = null;

function builtIn(): PlaybackClock {
  return (own ??= createClock({
    get: () => P().time,
    set: t => setTime(t),
    duration: () => timelineLength(P().project),
    loop: () => !!P().project?.time.loop,
    fps: () => P().project?.time.fps ?? 30,
  }));
}

/** The clock in use (the built-in one unless another was given). */
export function studioClock(): PlaybackClock {
  return custom ?? builtIn();
}

function bind() {
  unbind?.();
  const c = studioClock();
  setUI({ playing: c.state().playing });
  unbind = c.subscribe(s => setUI({ playing: s.playing }));
}

/**
 * Gives the studio another clock (lane «video»), or null to go back to the built-in one. The clock that
 * was playing is paused first; the timeline and the play buttons follow the new one at once.
 */
export function setStudioClock(c: PlaybackClock | null) {
  const prev = studioClock();
  if (prev === (c ?? builtIn())) return;
  prev.pause();
  custom = c;
  bind();
  for (const f of listeners) f();
}

/** React: the clock in use (re-renders when it is replaced). */
export function useStudioClock(): PlaybackClock {
  return useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, studioClock);
}

/** React: the clock's state (playing, speed and direction, loop region). */
export function usePlayback(): PlaybackState {
  const c = useStudioClock();
  return useSyncExternalStore(f => c.subscribe(() => f()), () => c.state());
}

/* ------------------------------------------------------------------ the video clock */

let video: { pb: Playback; project: string; sig: string } | null = null;

/** Whether a project needs the video clock: a layer shows a video. */
export const hasVideo = (p: Project | null | undefined) => !!p && videoSourcesInOrder(p).length > 0;

/** What the video clock reads of a project (its videos, which layers show them and when, the time settings). */
function clockSig(p: Project): string {
  return JSON.stringify([
    p.sources.filter(s => s.kind === 'video').map(s => [s.id, s.media[0]?.id, s.duration]),
    p.layers.map(l => ('source' in l ? [l.source, l.span, l.visible] : 0)),
    p.time,
  ]);
}

/** The video clock in use, when the open project has videos (tests and the QA hooks read its state). */
export const videoPlayback = (): Playback | null => video?.pb ?? null;

function dropVideo() {
  if (!video) return;
  const pb = video.pb;
  video = null;
  setStudioClock(null);
  setVideoProvider(null);
  pb.dispose();
}

/** Gives the open project the clock it needs: the video clock when it shows videos, the built-in one otherwise. */
function followProject(p: Project | null) {
  if (!hasVideo(p)) { dropVideo(); return; }
  const q = p!;
  if (video && video.project !== q.id) dropVideo();
  if (video) {
    const sig = clockSig(q);
    if (sig !== video.sig) { video.sig = sig; video.pb.setProject(q); }
    return;
  }
  const pb = createPlayback({
    project: q,
    get: () => P().time,
    onFrame: t => {
      if (Math.abs(P().time - t) > 1e-9) setTime(t);
      return renderNow();
    },
  });
  video = { pb, project: q.id, sig: clockSig(q) };
  setVideoProvider(pb.provider, () => pb.playing && !pb.reverse);
  setStudioClock(pb);
}

/** Follows the clock (call once): ui.playing, the video clock for projects with videos, a stop when another project opens. */
export function startPlayback(): () => void {
  bind();
  followProject(P().project);
  const off = useProject.subscribe((s, prev) => {
    // another project: the clock stops and its timeline opens (or not) by what it holds
    if (s.project?.id !== prev.project?.id) { studioClock().pause(); setUI({ tlOpen: null }); }
    if (s.project !== prev.project) followProject(s.project);
  });
  return () => { off(); dropVideo(); unbind?.(); unbind = null; };
}
