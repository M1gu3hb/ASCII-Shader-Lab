/**
 * The studio preview's clock: plays a project in real time and says which time to draw, once per animation frame.
 *
 *   - With video sources, the video elements are the clock: the bottom-most video (the one whose sound is heard)
 *     plays at the chosen rate and the project time follows its currentTime, so what is drawn stays with what is
 *     heard (a stalled video holds the picture instead of running ahead of its sound). Other videos play along,
 *     muted, and are put back in step when they drift more than 0.12 s.
 *   - Without video (photos, sequences, patterns): requestAnimationFrame's clock.
 *   - Reverse: the elements are paused (no sound) and seeked to each time, coalesced: while one seek runs, only the
 *     latest wanted time is kept. Pause, seek and scrub are coalesced the same way.
 *   - Loop regions (or the project's own loop), playback rate 0.1–4, forward and reverse.
 *   - Nothing runs while paused: no animation frame is requested and nothing is drawn until a seek.
 *
 * The compositor that draws the preview gets `provider` (new Compositor({ provider: playback.provider })): its
 * video frames are the playing elements' current pictures (no seek while playing), images and masks come from the
 * core provider. dispose() pauses and removes the elements, revokes their URLs and frees every picture.
 *
 * onFrame(t) may return a promise (the render): until it settles no other frame is emitted; the ticks in between
 * are counted as dropped (never queued), so a slow render lowers the frame rate instead of lagging behind. While
 * playing, times are handed out on the project's frame grid, once per frame (a 24 fps project on a 60 Hz screen
 * renders 24 times a second), like the timeline's own clock.
 *
 * It is a PlaybackClock (src/foto/timeline/clock.ts): the timeline can drive it directly (play/pause/stop,
 * rate < 0 = reverse, loop region, subscribe). Plugging it in the studio:
 *
 *   const pb = createPlayback({ project, get: () => store.time, onFrame: t => { store.setTime(t); return render(t); } });
 *   const comp = new Compositor({ provider: pb.provider });   // video frames = the playing elements
 *   <Timeline clock={pb} … />                                  // instead of createClock(...)
 *   // a playhead moved by hand while paused: pb.seek(t) (or scrub(t) while dragging)
 */
import { inSpan } from '../project/evaluate';
import { createSourceProvider, FRAME_EPS, storeBlob, type BlobResolver, type Drawable, type SourceProvider } from '../project/sources';
import type { Id, Project, Source } from '../project/types';
import type { PlaybackClock, PlaybackState } from '../foto/timeline/clock';
import { videoSourcesInOrder } from './audioplan';

export interface PlaybackOptions {
  project: Project;
  /** The time to draw (see the top of this file). */
  onFrame: (t: number) => void | Promise<unknown>;
  /** Called when playing stops by itself (end of the project without a loop) or starts/stops. */
  onState?: (s: { playing: boolean; t: number; reverse: boolean }) => void;
  blob?: BlobResolver;
  /** 0.1..4 (default 1). */
  rate?: number;
  /** Loop between these times; null = the project's own setting (loop the whole timeline when time.loop). */
  loop?: { start: number; end: number } | null;
  /** Hear the clock video's sound (default true). */
  audio?: boolean;
  /** Whose sound (default: the bottom-most video source). */
  audioSource?: Id;
  /** Longest side of the video pictures handed to the compositor (default 1920). */
  maxSide?: number;
  /** The playhead as the studio keeps it: play() starts from there when it moved (a click on the timeline). */
  get?: () => number;
  /** Hand out times on the project's frame grid, once per frame (default true). */
  grid?: boolean;
}

export interface PlaybackStats {
  /** Animation frames while playing. */
  ticks: number;
  /** Times handed to onFrame, and renders that finished. */
  emitted: number;
  rendered: number;
  /** Frames of the project's grid the preview passed over while playing (renders slower than a frame). */
  dropped: number;
  /** Mean and worst render time (ms) of the finished renders. */
  renderMs: number;
  worstMs: number;
  /** Seeks started on the elements and seeks coalesced away (a newer time replaced them before they ran). */
  seeks: number;
  coalesced: number;
  /** The clock video's own count of dropped frames (getVideoPlaybackQuality), when the browser tells. */
  videoDropped: number;
  /** The browser refused to play with sound (no user gesture yet): playing muted. */
  audioBlocked: boolean;
  /** Wall-clock seconds spent playing. */
  seconds: number;
}

export interface Playback extends PlaybackClock {
  readonly provider: SourceProvider;
  readonly t: number;
  readonly playing: boolean;
  readonly reverse: boolean;
  /** Speed (always positive; the direction is `reverse`). */
  readonly rate: number;
  /** Plays; `rate` as in setRate (negative = reverse). Resolves once the elements are playing. */
  play(rate?: number): Promise<void>;
  pause(): void;
  toggle(): Promise<void>;
  /** Goes to t and draws it (coalesced). Resolves once that frame (or a newer one) is drawn. */
  seek(t: number): Promise<void>;
  /** seek() without waiting: for a slider being dragged. */
  scrub(t: number): void;
  /** Speed 0.1..4; a negative rate plays in reverse (the timeline's convention). */
  setRate(r: number): void;
  setReverse(on: boolean): void;
  setLoop(r: { start: number; end: number } | null): void;
  /** The timeline's name for setLoop ({in, out}). */
  setRegion(r: { in: number; out: number } | null): void;
  state(): PlaybackState;
  subscribe(fn: (s: PlaybackState) => void): () => void;
  /** Pause and go back to the start (of the loop region, when there is one). */
  stop(): void;
  setMuted(m: boolean): void;
  /** The project changed (a new source, a moved span…). */
  setProject(p: Project): void;
  stats(): PlaybackStats;
  resetStats(): void;
  dispose(): void;
}

interface Vid {
  source: Source;
  el: HTMLVideoElement;
  url: string;
  ready: Promise<boolean>;
  canvas: HTMLCanvasElement;
  /** The element's time drawn last into `canvas`. */
  drawn: number;
  /** Coalesced seeking. */
  seeking: Promise<void> | null;
  want: number;
}

const clampRate = (r: number) => Math.min(4, Math.max(0.1, Number.isFinite(r) ? r : 1));

function fitSize(w: number, h: number, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(1, w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Seconds into a video source for project time t (as evaluate's sourceTime: the file loops). */
function srcTimeOf(s: Source, t: number): number {
  const d = s.duration ?? 0;
  if (!(d > 0)) return Math.max(0, t);
  const x = t % d;
  return x < 0 ? x + d : x;
}

export function createPlayback(o: PlaybackOptions): Playback {
  let project = o.project;
  const blobOf = o.blob ?? storeBlob;
  const maxSide = o.maxSide ?? 1920;
  const base = createSourceProvider({ video: 'preview', blob: blobOf });
  const vids = new Map<Id, Vid>();
  let t = 0, playing = false, reverse = false, rate = clampRate(o.rate ?? 1);
  let loopRegion = o.loop ?? null;
  const wantAudio = o.audio ?? true;
  let muted = false;
  let raf = 0, lastNow = 0, lastCur = NaN;
  let busy: Promise<unknown> | null = null;
  let pendingT: number | null = null;
  let disposed = false;
  let playStart = 0;
  const waiters: Array<() => void> = [];
  const subs = new Set<(s: PlaybackState) => void>();
  const grid = o.grid ?? true;
  /** The last time handed out while playing (frame grid). */
  let lastOut = NaN;
  const clockState = (): PlaybackState => {
    const r = loopRegion ? { in: loopRegion.start, out: loopRegion.end } : null;
    return { playing, rate: reverse ? -rate : rate, region: r };
  };
  const notify = () => { const s = clockState(); for (const f of subs) f(s); };
  const st: PlaybackStats = { ticks: 0, emitted: 0, rendered: 0, dropped: 0, renderMs: 0, worstMs: 0, seeks: 0, coalesced: 0, videoDropped: 0, audioBlocked: false, seconds: 0 };
  let msSum = 0;

  const duration = () => Math.max(0, project.time.duration);
  const region = () => {
    if (loopRegion && loopRegion.end > loopRegion.start) return { start: Math.max(0, loopRegion.start), end: Math.min(duration() || loopRegion.end, loopRegion.end) };
    return project.time.loop && duration() > 0 ? { start: 0, end: duration() } : null;
  };
  const clockSource = (): Source | null => {
    const list = videoSourcesInOrder(project);
    return list.find(s => s.id === o.audioSource) ?? list[0] ?? null;
  };

  /* ---------------------------------------------------------------- elements */

  function vidOf(s: Source): Vid | null {
    let v = vids.get(s.id);
    if (v) return v;
    const ref = s.media[0];
    if (!ref?.id || typeof document === 'undefined') return null;
    const el = document.createElement('video');
    el.muted = true; el.playsInline = true; el.preload = 'auto'; el.loop = true;
    el.setAttribute('playsinline', '');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    const canvas = document.createElement('canvas');
    v = { source: s, el, url: '', ready: Promise.resolve(false), canvas, drawn: NaN, seeking: null, want: NaN };
    const vv = v;
    vv.ready = (async () => {
      const got = await blobOf(ref.id!);
      if (!got || disposed) return false;
      vv.url = URL.createObjectURL(got.blob);
      el.src = vv.url;
      document.body.appendChild(el);
      const ok = await new Promise<boolean>(res => {
        const tm = setTimeout(() => res(false), 15_000);
        el.addEventListener('loadeddata', () => { clearTimeout(tm); res(true); }, { once: true });
        el.addEventListener('error', () => { clearTimeout(tm); res(false); }, { once: true });
      });
      if (!ok || !el.videoWidth) return false;
      const size = fitSize(el.videoWidth, el.videoHeight, maxSide);
      canvas.width = size.w; canvas.height = size.h;
      return true;
    })();
    vids.set(s.id, v);
    return v;
  }

  function draw(v: Vid) {
    const x = v.canvas.getContext('2d')!;
    x.clearRect(0, 0, v.canvas.width, v.canvas.height);
    x.drawImage(v.el, 0, 0, v.canvas.width, v.canvas.height);
    v.drawn = v.el.currentTime;
  }

  /** Seeks the element to `target`, coalesced: resolves when it is at the latest target asked. */
  function seekEl(v: Vid, target: number): Promise<void> {
    const d = Number.isFinite(v.el.duration) ? v.el.duration : 0;
    // FRAME_EPS: the frame stored a tick after t is the frame at t (as in the export's frame-exact provider)
    v.want = Math.max(0, d > 0 ? Math.min(target + FRAME_EPS, d - 1e-3) : target + FRAME_EPS);
    if (v.seeking) { st.coalesced++; return v.seeking; }
    const job = (async () => {
      while (!disposed && Math.abs(v.el.currentTime - v.want) > 1e-4) {
        const goal = v.want;
        st.seeks++;
        await new Promise<void>(res => {
          const tm = setTimeout(res, 3000);
          v.el.addEventListener('seeked', () => { clearTimeout(tm); res(); }, { once: true });
          v.el.currentTime = goal;
        });
        if (Math.abs(v.want - goal) < 1e-4) break;
      }
    })();
    // (a seek to where the element already is finishes at once: clear it only if it is still this one)
    v.seeking = job;
    void job.finally(() => { if (v.seeking === job) v.seeking = null; });
    return job;
  }

  /** Whether a layer that shows source `s` is on at project time t (the sound follows the picture). */
  const shows = (s: Source, at: number) => project.layers.some(l => 'source' in l && l.source === s.id && inSpan(l, at));

  const provider: SourceProvider = {
    async prepare(source, stime) {
      if (source.kind !== 'video') return base.prepare(source, stime);
      const v = vidOf(source);
      if (!v || !(await v.ready)) return false;
      const flowing = playing && !reverse && !v.el.paused;
      if (flowing && Math.abs(v.el.currentTime - stime) < 0.25) { draw(v); return true; }
      if (flowing) {
        // a video playing along drifted: put it back in step, draw what it shows meanwhile
        v.el.currentTime = stime;
        st.seeks++;
        draw(v);
        return true;
      }
      await seekEl(v, stime);
      if (v.el.readyState < 2) return false;
      draw(v);
      return true;
    },
    frame(source, stime) {
      if (source.kind !== 'video') return base.frame(source, stime);
      const v = vids.get(source.id);
      return v && Number.isFinite(v.drawn) ? (v.canvas as Drawable) : null;
    },
    prepareMedia: ref => base.prepareMedia(ref),
    image: ref => base.image(ref),
    missing: () => base.missing(),
    release() {
      for (const v of vids.values()) closeVid(v);
      vids.clear();
      base.release();
    },
  };

  function closeVid(v: Vid) {
    v.el.pause();
    v.el.removeAttribute('src');
    v.el.load();
    v.el.remove();
    if (v.url) URL.revokeObjectURL(v.url);
    v.canvas.width = v.canvas.height = 0;
  }

  /* ---------------------------------------------------------------- emitting */

  function emit(at: number) {
    if (busy) { pendingT = at; return; }
    st.emitted++;
    const t0 = performance.now();
    let r: void | Promise<unknown>;
    try { r = o.onFrame(at); } catch { r = undefined; }
    const done = () => {
      const ms = performance.now() - t0;
      st.rendered++;
      msSum += ms;
      st.renderMs = msSum / st.rendered;
      st.worstMs = Math.max(st.worstMs, ms);
      busy = null;
      if (pendingT !== null && !playing) { const p = pendingT; pendingT = null; emit(p); return; }
      pendingT = null;
      if (!playing) while (waiters.length) waiters.shift()!();
    };
    if (r && typeof (r as Promise<unknown>).then === 'function') busy = (r as Promise<unknown>).then(done, done);
    else done();
  }

  /* ---------------------------------------------------------------- clock */

  function syncAudio() {
    const clk = clockSource();
    for (const v of vids.values()) {
      const audible = wantAudio && !muted && !reverse && playing && v.source === clk && shows(v.source, t) && !st.audioBlocked;
      v.el.muted = !audible;
      v.el.playbackRate = rate;
    }
  }

  function wrapForward(x: number): { t: number; wrapped: boolean; ended: boolean } {
    const r = region();
    if (r && x >= r.end) return { t: r.start + ((x - r.start) % Math.max(1e-6, r.end - r.start)), wrapped: true, ended: false };
    if (!r && duration() > 0 && x >= duration()) return { t: duration(), wrapped: false, ended: true };
    return { t: x, wrapped: false, ended: false };
  }
  function wrapBack(x: number): { t: number; wrapped: boolean; ended: boolean } {
    const r = region();
    if (r && x < r.start) return { t: r.end - ((r.start - x) % Math.max(1e-6, r.end - r.start)) - 1e-3, wrapped: true, ended: false };
    if (!r && x <= 0) return { t: 0, wrapped: false, ended: true };
    return { t: x, wrapped: false, ended: false };
  }

  async function startElements() {
    const clk = clockSource();
    const list: Vid[] = [];
    for (const s of videoSourcesInOrder(project)) { const v = vidOf(s); if (v && (await v.ready)) list.push(v); }
    for (const v of list) {
      v.el.playbackRate = rate;
      if (Math.abs(v.el.currentTime - srcTimeOf(v.source, t)) > 0.05) await seekEl(v, srcTimeOf(v.source, t));
    }
    syncAudio();
    for (const v of list) {
      try { await v.el.play(); } catch (e) {
        if ((e as DOMException)?.name === 'NotAllowedError' && v.source === clk && !v.el.muted) {
          st.audioBlocked = true;
          v.el.muted = true;
          try { await v.el.play(); } catch { /* keeps the rAF clock */ }
        }
      }
    }
    const c = clk ? vids.get(clk.id) : null;
    lastCur = c ? c.el.currentTime : NaN;
  }

  function pauseElements() { for (const v of vids.values()) v.el.pause(); }

  function frame(now: number) {
    raf = 0;
    if (!playing || disposed) return;
    st.ticks++;
    const dt = Math.min(0.25, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    const clk = clockSource();
    const cv = !reverse && clk ? vids.get(clk.id) : null;
    let next: number;
    if (cv && !cv.el.paused && Number.isFinite(lastCur)) {
      // the clock video: project time moves as its currentTime does (it loops by itself)
      const d = Number.isFinite(cv.el.duration) ? cv.el.duration : 0;
      let delta = cv.el.currentTime - lastCur;
      if (d > 0 && delta < -d / 2) delta += d;
      if (delta < 0) delta = 0;
      lastCur = cv.el.currentTime;
      next = t + delta;
    } else next = t + dt * rate * (reverse ? -1 : 1);
    const w = reverse ? wrapBack(next) : wrapForward(next);
    t = w.t;
    if (w.ended) {
      playing = false;
      pauseElements();
      st.seconds += (performance.now() - playStart) / 1000;
      o.onState?.({ playing: false, t, reverse });
      notify();
      emit(t);
      return;
    }
    if (w.wrapped && !reverse) {
      // jump the elements to the loop's start
      for (const v of vids.values()) { v.el.currentTime = srcTimeOf(v.source, t); }
      const c = clk ? vids.get(clk.id) : null;
      lastCur = c ? srcTimeOf(c.source, t) : NaN;
    }
    // other videos playing along: back in step when they drift
    if (!reverse) {
      for (const v of vids.values()) {
        if (v.source === clk || v.el.paused || v.el.seeking) continue;
        if (Math.abs(v.el.currentTime - srcTimeOf(v.source, t)) > 0.12) { v.el.currentTime = srcTimeOf(v.source, t); st.seeks++; }
      }
      syncAudio();
    }
    const fps = project.time.fps > 0 ? project.time.fps : 30;
    const out = grid ? Math.max(0, (reverse ? Math.ceil(t * fps - 1e-6) : Math.floor(t * fps + 1e-6)) / fps) : t;
    if (out !== lastOut && !busy) {
      // frames of the grid passed over since the last one drawn (a render that took longer than a frame, or a
      // main thread too busy to tick): what the preview did not show
      if (Number.isFinite(lastOut)) {
        const gap = Math.round(Math.abs(out - lastOut) * fps) - 1;
        if (gap > 0 && !w.wrapped) st.dropped += gap;
      }
      lastOut = out;
      emit(out);
    }
    raf = requestAnimationFrame(frame);
  }

  /** Changes direction (elements paused for reverse, playing again forward). Returns whether it changed. */
  function applyReverse(on: boolean): boolean {
    if (on === reverse) return false;
    reverse = on;
    lastOut = NaN;
    if (playing) {
      if (reverse) { pauseElements(); syncAudio(); }
      else void startElements();
    }
    return true;
  }

  const pb: Playback = {
    provider,
    get t() { return t; },
    get playing() { return playing; },
    get reverse() { return reverse; },
    get rate() { return rate; },
    async play(speed?: number) {
      if (speed !== undefined && Number.isFinite(speed) && speed !== 0) pb.setRate(speed);
      if (playing || disposed) return;
      // the playhead moved while paused (the timeline set it): start there
      const at = o.get?.();
      if (at !== undefined && Number.isFinite(at) && Math.abs(at - t) > 1e-6) t = Math.max(0, at);
      lastOut = NaN;
      const r = region();
      if (!r && duration() > 0 && !reverse && t >= duration() - 1e-3) t = 0;
      if (!r && reverse && t <= 1e-3) t = duration();
      playing = true;
      playStart = performance.now();
      if (!reverse) await startElements();
      else pauseElements();
      if (!playing) return;
      lastNow = performance.now();
      o.onState?.({ playing: true, t, reverse });
      notify();
      if (!raf) raf = requestAnimationFrame(frame);
    },
    pause() {
      if (!playing) return;
      playing = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pauseElements();
      syncAudio();
      st.seconds += (performance.now() - playStart) / 1000;
      o.onState?.({ playing: false, t, reverse });
      notify();
    },
    stop() {
      pb.pause();
      void pb.seek(loopRegion ? loopRegion.start : 0);
    },
    state: clockState,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    setRegion(r) { pb.setLoop(r ? { start: r.in, end: r.out } : null); },
    async toggle() { if (playing) pb.pause(); else await pb.play(); },
    seek(at) {
      const target = Math.max(0, Math.min(duration() || at, Number.isFinite(at) ? at : 0));
      t = target;
      if (playing && !reverse) {
        for (const v of vids.values()) v.el.currentTime = srcTimeOf(v.source, t);
        const clk = clockSource();
        lastCur = clk && vids.get(clk.id) ? srcTimeOf(clk, t) : NaN;
        return Promise.resolve();
      }
      if (playing) return Promise.resolve();
      return new Promise<void>(res => { waiters.push(res); emit(target); });
    },
    scrub(at) { void pb.seek(at); },
    setRate(r) {
      if (!Number.isFinite(r) || r === 0) return;
      rate = clampRate(Math.abs(r));
      applyReverse(r < 0);
      syncAudio();
      notify();
    },
    setReverse(on) {
      if (applyReverse(on)) notify();
    },
    setLoop(r) { loopRegion = r && r.end > r.start ? { ...r } : null; notify(); },
    setMuted(m) { muted = m; syncAudio(); },
    setProject(p) {
      project = p;
      // elements of sources that are gone
      for (const [id, v] of vids) if (!p.sources.some(s => s.id === id)) { closeVid(v); vids.delete(id); }
      // (paused, the playhead may have been moved by the studio since the last frame this clock handed out)
      const at = o.get?.();
      if (!playing) void pb.seek(at !== undefined && Number.isFinite(at) ? at : t);
    },
    stats() {
      const clk = clockSource();
      const c = clk ? vids.get(clk.id) : null;
      const q = c?.el.getVideoPlaybackQuality?.();
      return { ...st, videoDropped: q ? q.droppedVideoFrames : 0, seconds: st.seconds + (playing ? (performance.now() - playStart) / 1000 : 0) };
    },
    resetStats() {
      Object.assign(st, { ticks: 0, emitted: 0, rendered: 0, dropped: 0, renderMs: 0, worstMs: 0, seeks: 0, coalesced: 0, seconds: 0 });
      msSum = 0;
      if (playing) playStart = performance.now();
    },
    dispose() {
      if (disposed) return;
      pb.pause();
      disposed = true;
      subs.clear();
      provider.release();
      while (waiters.length) waiters.shift()!();
    },
  };
  return pb;
}
