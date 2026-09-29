import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newLayer, newProject } from '../../src/project/normalize';
import type { PlaybackClock } from '../../src/foto/timeline/clock';
import { createPlayback, type Playback } from '../../src/video/playback';

/** The rAF clock of a photo project (no video elements), in node: animation frames every 16 ms. */
const g = globalThis as unknown as { requestAnimationFrame?: (cb: (t: number) => void) => number; cancelAnimationFrame?: (id: number) => void };
let saved: typeof g.requestAnimationFrame;
beforeEach(() => {
  saved = g.requestAnimationFrame;
  g.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16) as unknown as number;
  g.cancelAnimationFrame = id => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
});
afterEach(() => { g.requestAnimationFrame = saved; });

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function photoProject(loop = false) {
  const p = newProject({ w: 64, h: 36, duration: 2, fps: 10 });
  p.time.loop = loop;
  p.layers.push(newLayer('text', { text: 'x' }));
  return p;
}

describe('playback clock without video (rAF time)', () => {
  let pb: Playback | null = null;
  afterEach(() => { pb?.dispose(); pb = null; });

  it('is a PlaybackClock the timeline can drive', () => {
    pb = createPlayback({ project: photoProject(), onFrame: () => {} });
    const clock: PlaybackClock = pb;
    expect(clock.state()).toEqual({ playing: false, rate: 1, region: null });
    const seen: unknown[] = [];
    const off = clock.subscribe(s => seen.push(s));
    clock.setRate(-2);
    expect(clock.state().rate).toBe(-2);
    expect(pb.reverse).toBe(true);
    expect(pb.rate).toBe(2);
    clock.setRegion({ in: 0.5, out: 1.5 });
    expect(clock.state().region).toEqual({ in: 0.5, out: 1.5 });
    off();
    clock.setRate(1);
    expect(seen.length).toBe(2);
  });

  it('hands out times on the frame grid, once per frame, forward', async () => {
    const got: number[] = [];
    pb = createPlayback({ project: photoProject(), onFrame: t => { got.push(t); } });
    await pb.play();
    await wait(450);
    pb.pause();
    expect(got.length).toBeGreaterThanOrEqual(3);
    for (const t of got) expect(Math.abs(t * 10 - Math.round(t * 10))).toBeLessThan(1e-6);
    for (let k = 1; k < got.length; k++) expect(got[k]).toBeGreaterThan(got[k - 1]);
    // nothing is emitted while paused
    const n = got.length;
    await wait(200);
    expect(got.length).toBe(n);
  });

  it('plays backwards with a negative rate and stops at the start', async () => {
    const got: number[] = [];
    pb = createPlayback({ project: photoProject(), onFrame: t => { got.push(t); } });
    await pb.seek(0.3);
    got.length = 0;
    await pb.play(-1);
    await wait(600);
    expect(pb.playing).toBe(false);
    expect(got[got.length - 1]).toBe(0);
    for (let k = 1; k < got.length; k++) expect(got[k]).toBeLessThan(got[k - 1]);
  });

  it('stays inside a loop region and wraps', async () => {
    const got: number[] = [];
    pb = createPlayback({ project: photoProject(), onFrame: t => { got.push(t); } });
    pb.setRegion({ in: 0.2, out: 0.5 });
    await pb.seek(0.2);
    got.length = 0;
    await pb.play(2);
    await wait(700);
    pb.pause();
    for (const t of got) { expect(t).toBeGreaterThanOrEqual(0.2 - 1e-9); expect(t).toBeLessThan(0.5); }
    expect(got.some((t, k) => k > 0 && t < got[k - 1])).toBe(true);
    // stop goes back to the region's start
    pb.stop();
    await wait(50);
    expect(pb.t).toBeCloseTo(0.2, 6);
  });

  it('starts from the studio playhead when it moved while paused', async () => {
    let head = 1.2;
    const got: number[] = [];
    pb = createPlayback({ project: photoProject(), get: () => head, onFrame: t => { got.push(t); head = t; } });
    await pb.play();
    await wait(120);
    pb.pause();
    expect(got[0]).toBeGreaterThanOrEqual(1.2);
  });

  it('never queues renders: a slow render drops frames instead', async () => {
    let calls = 0;
    pb = createPlayback({ project: photoProject(true), onFrame: () => { calls++; return wait(120); } });
    await pb.play();
    await wait(500);
    pb.pause();
    const s = pb.stats();
    expect(calls).toBeLessThanOrEqual(5);
    expect(s.dropped).toBeGreaterThan(0);
    expect(s.rendered).toBeLessThanOrEqual(s.emitted);
  });
});
