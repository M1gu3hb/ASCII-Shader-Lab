import { describe, expect, it } from 'vitest';
import { costMapFromLuma, PathCooling, wireSearch } from '../../src/foto/tools/livewire';

/** A light picture with a dark disc (radius r at cx, cy), softly anti-aliased, plus a little noise. */
function disc(w: number, h: number, cx: number, cy: number, r: number, noise = 0.03): Float32Array {
  const out = new Float32Array(w * h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r;
    const v = Math.min(1, Math.max(0, 0.5 + d)); // 0 inside, 1 outside
    out[y * w + x] = 0.15 + 0.7 * v + (rnd() - 0.5) * noise;
  }
  return out;
}

describe('live-wire', () => {
  it('finds the edge of a disc between two points on it (not the straight chord)', () => {
    const W = 200, H = 160, cx = 100, cy = 80, R = 50;
    const m = costMapFromLuma(disc(W, H, cx, cy, R), W, H);
    const at = (deg: number) => { const a = (deg * Math.PI) / 180; return Math.round(cy + R * Math.sin(a)) * W + Math.round(cx + R * Math.cos(a)); };
    const seed = at(180), target = at(270);
    const s = wireSearch(m, seed, 120);
    expect(s.reach(target, 1e7)).toBe(true);
    const path = s.path(target);
    expect(path[0]).toBe(seed);
    expect(path[path.length - 1]).toBe(target);
    // every point of the path lies on the disc's edge (within 2 px), including the middle of the arc,
    // where the straight chord would be 15 px inside the disc
    let worst = 0;
    for (const i of path) worst = Math.max(worst, Math.abs(Math.hypot((i % W) + 0.5 - cx, Math.floor(i / W) + 0.5 - cy) - R));
    expect(worst).toBeLessThan(2.5);
    // the arc is a quarter of the circumference, roughly (8-connected steps)
    expect(path.length).toBeGreaterThan((Math.PI * R) / 2 * 0.7);
  });

  it('follows a straight step edge and is snappy: one move settles little around the anchor', () => {
    const W = 1024, H = 768;
    const luma = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) luma[y * W + x] = x < 400 ? 0.2 : 0.8;
    const m = costMapFromLuma(luma, W, H);
    const seed = 300 * W + 400;
    const s = wireSearch(m, seed, 320);
    // a short move along the edge
    const target = 360 * W + 400;
    expect(s.reach(target)).toBe(true);
    const path = s.path(target);
    for (const i of path) expect(Math.abs((i % W) - 400)).toBeLessThanOrEqual(1);
    // snappy is how much a move settles, not the wall clock of a busy machine: along an edge the search
    // stops at the target, a few hundred pixels of its 641×641 window (≈900; the same move on a flat picture
    // settles ≈10 600, the whole window 410 881). Lab numbers (this machine, idle): the map ≈100–200 ms once
    // per activation, this move 5–15 ms.
    expect(s.count).toBeLessThan(3000);
  });

  it('stays inside its window and reports what it cannot reach', () => {
    const W = 300, H = 300;
    const m = costMapFromLuma(new Float32Array(W * H).fill(0.5), W, H);
    const s = wireSearch(m, 150 * W + 150, 40);
    expect(s.reach(150 * W + 280)).toBe(false);
    expect(s.path(150 * W + 280)).toEqual([]);
    expect(s.reach(150 * W + 185)).toBe(true);
  });

  it('path cooling: a prefix that stays the same for several moves becomes an anchor', () => {
    const c = new PathCooling(3, 4);
    const base = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(c.update(base)).toBe(-1);
    expect(c.update([...base, 9])).toBe(-1);
    expect(c.update([...base, 9, 10])).toBe(-1);
    const k = c.update([...base, 11]);
    expect(k).toBeGreaterThanOrEqual(4);
    expect(k).toBeLessThanOrEqual(8);
    // a path that keeps changing near the anchor never cools
    const d = new PathCooling(3, 2);
    for (let i = 0; i < 10; i++) expect(d.update([0, 100 + i, 200 + i, 300 + i])).toBe(-1);
  });
});
