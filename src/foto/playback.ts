/**
 * The studio's playback clock: one for the whole editor (the timeline on the desktop, the one in the phone's
 * sheet and the phone's play button share it). By default the timeline's own clock (timeline/clock.ts:
 * requestAnimationFrame only while playing, time on the project's frame grid, reverse, speed, loop region)
 * on the project store's time. It is injectable: lane «video» can give its own clock (one that follows the
 * video element, for sound) through the same PlaybackClock interface with setStudioClock().
 *
 * While it plays, ui.playing is true (the viewport then keeps to its light view when frames are slow).
 */
import { useSyncExternalStore } from 'react';
import { setTime, useProject } from '../project/store';
import type { Project } from '../project/types';
import { createClock, type PlaybackClock, type PlaybackState } from './timeline/clock';
import { setUI } from './ui';

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

/** Follows the clock (call once): ui.playing, and a stop when another project opens. */
export function startPlayback(): () => void {
  bind();
  const off = useProject.subscribe((s, prev) => {
    // another project: the clock stops and its timeline opens (or not) by what it holds
    if (s.project?.id !== prev.project?.id) { studioClock().pause(); setUI({ tlOpen: null }); }
  });
  return () => { off(); unbind?.(); unbind = null; };
}
