/**
 * The timeline's playback clock: play, pause, stop, reverse play, speed, a loop region, the project's loop.
 * It runs a requestAnimationFrame loop only while playing (nothing at all when idle) and hands out time on
 * the project's frame grid, at most once per animation frame and only when the frame changes — so the
 * studio renders at most once per frame, and a 24 fps project on a 60 Hz screen renders 24 times a second.
 *
 * The studio can give its own clock (lane «video»'s playback, which follows the video element for sound)
 * through the same interface; the timeline only calls these methods and listens.
 */
import { advance } from './math';

export interface PlaybackState {
  playing: boolean;
  /** Speed and direction: 1 = forward, −1 = backwards, 0.5 = half speed… */
  rate: number;
  /** A loop region (seconds), or null. */
  region: { in: number; out: number } | null;
}

export interface PlaybackClock {
  state(): PlaybackState;
  play(rate?: number): void;
  pause(): void;
  /** Pause and go back to the start (of the region, when there is one). */
  stop(): void;
  toggle(): void;
  setRate(rate: number): void;
  setRegion(region: { in: number; out: number } | null): void;
  subscribe(fn: (s: PlaybackState) => void): () => void;
  dispose(): void;
}

export interface ClockOptions {
  /** The playhead: read and written (the store's time and setTime). */
  get(): number;
  set(t: number): void;
  duration(): number;
  /** Whether the project loops (plays again from the start). */
  loop(): boolean;
  fps(): number;
  now?: () => number;
  raf?: (cb: (t: number) => void) => number;
  caf?: (id: number) => void;
}

export function createClock(o: ClockOptions): PlaybackClock {
  const now = o.now ?? (() => performance.now());
  const raf = o.raf ?? ((cb: (t: number) => void) => requestAnimationFrame(cb));
  const caf = o.caf ?? ((id: number) => cancelAnimationFrame(id));
  let st: PlaybackState = { playing: false, rate: 1, region: null };
  let id = 0, last = 0, exact = 0;
  const subs = new Set<(s: PlaybackState) => void>();
  const emit = () => { for (const f of subs) f(st); };
  const setState = (p: Partial<PlaybackState>) => { st = { ...st, ...p }; emit(); };

  const onFrame = () => {
    id = 0;
    if (!st.playing) return;
    const t = now();
    const dt = Math.min(0.25, Math.max(0, (t - last) / 1000));
    last = t;
    const r = advance(exact, dt, st.rate, { duration: o.duration(), region: st.region, loop: o.loop() });
    exact = r.t;
    const fps = o.fps() > 0 ? o.fps() : 30;
    const q = Math.min(o.duration(), Math.max(0, (st.rate >= 0 ? Math.floor(exact * fps + 1e-6) : Math.ceil(exact * fps - 1e-6)) / fps));
    if (Math.abs(q - o.get()) > 1e-9) o.set(q);
    if (r.ended) { setState({ playing: false }); return; }
    id = raf(onFrame);
  };

  const start = () => {
    if (id) caf(id);
    last = now();
    exact = o.get();
    const d = o.duration();
    // playing from the very end forwards (or the start backwards) starts over
    if (!st.region && !o.loop()) {
      if (st.rate > 0 && exact >= d - 1e-6) exact = 0;
      if (st.rate < 0 && exact <= 1e-6) exact = d;
      o.set(exact);
    }
    id = raf(onFrame);
  };

  return {
    state: () => st,
    play(rate) {
      if (rate !== undefined && Number.isFinite(rate) && rate !== 0) st = { ...st, rate };
      setState({ playing: true });
      start();
    },
    pause() { if (id) caf(id); id = 0; setState({ playing: false }); },
    stop() {
      if (id) caf(id);
      id = 0;
      o.set(st.region ? st.region.in : 0);
      setState({ playing: false });
    },
    toggle() { if (st.playing) this.pause(); else this.play(); },
    setRate(rate) {
      if (!Number.isFinite(rate) || rate === 0) return;
      setState({ rate });
      if (st.playing) { last = now(); exact = o.get(); }
    },
    setRegion(region) {
      const r = region && region.out - region.in > 1e-3 ? { in: Math.max(0, region.in), out: Math.min(o.duration(), region.out) } : null;
      setState({ region: r });
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    dispose() { if (id) caf(id); id = 0; subs.clear(); },
  };
}
