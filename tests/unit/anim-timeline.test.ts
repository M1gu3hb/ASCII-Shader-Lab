import { describe, expect, it } from 'vitest';
import { createClock } from '../../src/foto/timeline/clock';
import {
  advance, clampView, clipLanes, dragTo, fitView, formatTime, frameStep, MAX_PPS, MIN_PPS, pinchZoom, reveal, rulerTicks, snapClipStart, snapTargets, snapTime,
  timeToX, xToTime, zoomAt,
} from '../../src/foto/timeline/math';

describe('timeline math', () => {
  it('time ↔ px are inverse; fit shows the whole length', () => {
    const v = fitView(8, 800);
    expect(timeToX(v, 0)).toBeGreaterThan(0);
    expect(timeToX(v, 8)).toBeLessThan(800);
    for (const t of [0, 1.234, 7.9]) expect(xToTime(v, timeToX(v, t))).toBeCloseTo(t, 9);
  });

  it('zoom keeps the time under the pointer; limits hold', () => {
    const v = { pps: 100, start: 0, width: 800 };
    const z = zoomAt(v, 2, 300);
    expect(xToTime(z, 300)).toBeCloseTo(xToTime(v, 300), 9);
    expect(z.pps).toBe(200);
    expect(zoomAt(v, 1e6, 0).pps).toBe(MAX_PPS);
    expect(zoomAt(v, 1e-6, 0).pps).toBe(MIN_PPS);
  });

  it('pinch: the time under the first midpoint follows the fingers', () => {
    const v = { pps: 100, start: 1, width: 400 };
    const z = pinchZoom(v, 100, 200, 150, 170);
    expect(z.pps).toBe(200);
    expect(xToTime(z, 170)).toBeCloseTo(xToTime(v, 150), 9);
  });

  it('views stay near the content, and follow a time out of sight', () => {
    expect(clampView({ pps: 100, start: -50, width: 400 }, 8).start).toBe(-0.5);
    expect(clampView({ pps: 100, start: 50, width: 400 }, 8).start).toBeCloseTo(8.5 - 4, 9);
    const v = { pps: 100, start: 0, width: 400 };
    expect(timeToX(reveal(v, 9), 9)).toBeLessThanOrEqual(400 - 40 + 1e-9);
    expect(reveal(v, 1)).toBe(v);
  });

  it('snapping: within a few px to the nearest target, otherwise to the frame grid', () => {
    const v = { pps: 100 };
    expect(snapTime(1.03, [0, 1, 2], v)).toMatchObject({ t: 1, snapped: true });
    expect(snapTime(1.2, [0, 1, 2], v, { fps: 10 })).toMatchObject({ t: 1.2, snapped: false });
    expect(snapTime(1.234, [0, 1, 2], v, { fps: 10 }).t).toBeCloseTo(1.2, 9);
    // zoomed in, the same distance in seconds is too far
    expect(snapTime(1.03, [1], { pps: 1000 }).snapped).toBe(false);
    // a moved clip snaps by whichever edge is closer to a target
    expect(snapClipStart(0.97, 2, [1, 5], v)).toMatchObject({ t: 1, snapped: true, to: 1 });
    expect(snapClipStart(3.04, 2, [1, 5], v)).toMatchObject({ t: 3, snapped: true, to: 5 });
    expect(dragTo(1, -500, v)).toBe(0);
    const targets = snapTargets({ duration: 8, keys: [1.5], clips: [{ id: 'a', start: 2, dur: 1 }, { id: 'b', start: 4, dur: 1 }], spans: [{ in: 0.5, out: 6 }, null], playhead: 3.3, except: 'b' });
    expect(targets).toEqual([0, 0.5, 1.5, 2, 3, 3.3, 6, 8]);
  });

  it('frame steps land on the grid and stay inside the project', () => {
    expect(frameStep(1, 30, 1, 5)).toBeCloseTo(1 + 1 / 30, 9);
    expect(frameStep(1.01, 30, 0, 5)).toBeCloseTo(1, 9);
    expect(frameStep(0, 30, -5, 5)).toBe(0);
    expect(frameStep(4.99, 30, 30, 5)).toBe(5);
    expect(formatTime(61.5)).toBe('01:01.50');
    expect(formatTime(2, 30)).toBe('00:02.00 · 60f');
  });

  it('ruler ticks: majors far enough apart for their labels, minors between', () => {
    for (const pps of [10, 60, 200, 1200]) {
      const v = { pps, start: 0, width: 1000 };
      const t = rulerTicks(v);
      const majors = t.filter(k => k.major);
      expect(majors.length).toBeGreaterThan(0);
      for (let i = 1; i < majors.length; i++) expect(majors[i].x - majors[i - 1].x).toBeGreaterThanOrEqual(72 - 1e-6);
      expect(majors.every(k => k.label)).toBe(true);
      expect(t.some(k => !k.major)).toBe(true);
    }
  });

  it('overlapping clips go to separate lanes', () => {
    const r = clipLanes([{ id: 'a', start: 0, dur: 2 }, { id: 'b', start: 1, dur: 2 }, { id: 'c', start: 2.5, dur: 1 }]);
    expect(r.lanes).toBe(2);
    expect(r.lane.get('a')).toBe(0);
    expect(r.lane.get('b')).toBe(1);
    expect(r.lane.get('c')).toBe(0);
  });

  it('advance: loops, regions, reverse, and the ends', () => {
    expect(advance(1, 0.5, 1, { duration: 4, loop: false })).toEqual({ t: 1.5, ended: false });
    expect(advance(3.9, 0.5, 1, { duration: 4, loop: false })).toEqual({ t: 4, ended: true });
    expect(advance(0.1, 0.5, -1, { duration: 4, loop: false })).toEqual({ t: 0, ended: true });
    expect(advance(3.9, 0.5, 1, { duration: 4, loop: true }).t).toBeCloseTo(0.4, 9);
    expect(advance(0.1, 0.5, -1, { duration: 4, loop: true }).t).toBeCloseTo(3.6, 9);
    expect(advance(2.9, 0.2, 1, { duration: 4, loop: false, region: { in: 1, out: 3 } }).t).toBeCloseTo(1.1, 9);
    expect(advance(0.2, 0.1, 1, { duration: 4, loop: false, region: { in: 1, out: 3 } }).t).toBe(1);
    expect(advance(1.05, 0.1, -2, { duration: 4, loop: false, region: { in: 1, out: 3 } }).t).toBeCloseTo(2.85, 9);
  });
});

describe('playback clock', () => {
  function fake() {
    let now = 0, t = 0, id = 0;
    const cbs = new Map<number, () => void>();
    const sets: number[] = [];
    const clock = createClock({
      get: () => t, set: v => { t = v; sets.push(v); }, duration: () => 2, loop: () => false, fps: () => 10,
      now: () => now, raf: cb => { cbs.set(++id, () => cb(now)); return id; }, caf: i => { cbs.delete(i); },
    });
    const tick = (ms: number) => { now += ms; const list = [...cbs.values()]; cbs.clear(); list.forEach(f => f()); };
    return { clock, tick, sets, pending: () => cbs.size, get t() { return t; }, set t(v: number) { t = v; } };
  }

  it('does nothing while idle and sets time only when the frame changes', () => {
    const f = fake();
    expect(f.pending()).toBe(0);
    f.clock.play();
    for (let i = 0; i < 6; i++) f.tick(1000 / 60);
    // 100 ms at 10 fps: one new frame
    expect(f.sets.filter(v => v > 0)).toEqual([0.1]);
    f.clock.pause();
    expect(f.pending()).toBe(0);
    const n = f.sets.length;
    f.tick(500);
    expect(f.sets.length).toBe(n);
  });

  it('plays backwards, stops at the ends, starts over from the end, and loops a region', () => {
    const f = fake();
    f.t = 1;
    f.clock.play(-1);
    for (let i = 0; i < 30; i++) f.tick(50);
    expect(f.t).toBe(0);
    expect(f.clock.state().playing).toBe(false);
    // playing forward from the end starts over
    f.t = 2;
    f.clock.play(1);
    f.tick(300);
    expect(f.t).toBeLessThan(1);
    f.clock.setRegion({ in: 0.5, out: 1 });
    for (let i = 0; i < 40; i++) { f.tick(50); expect(f.t).toBeGreaterThanOrEqual(0.5 - 1e-9); expect(f.t).toBeLessThanOrEqual(1 + 1e-9); }
    expect(f.clock.state().playing).toBe(true);
    f.clock.stop();
    expect(f.t).toBe(0.5);
    expect(f.pending()).toBe(0);
  });

  it('speed changes keep the position; subscribers hear every change', () => {
    const f = fake();
    const seen: string[] = [];
    f.clock.subscribe(s => seen.push(`${s.playing}:${s.rate}`));
    f.clock.play(0.5);
    for (let i = 0; i < 20; i++) f.tick(50);
    expect(f.t).toBeCloseTo(0.5, 9);
    f.clock.setRate(2);
    for (let i = 0; i < 5; i++) f.tick(50);
    expect(f.t).toBeCloseTo(1, 9);
    // a long stall (a hidden tab) never jumps more than a quarter of a second
    f.tick(5000);
    expect(f.t).toBeLessThanOrEqual(1.5 + 1e-9);
    f.clock.setRate(0);
    expect(f.clock.state().rate).toBe(2);
    expect(seen).toEqual(['true:0.5', 'true:2']);
    f.clock.dispose();
    expect(f.pending()).toBe(0);
  });
});
