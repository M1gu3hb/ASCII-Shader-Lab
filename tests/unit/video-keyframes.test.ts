import { describe, expect, it } from 'vitest';
import {
  chooseCandidate, frameName, keyframeIndices, keysOfFrames, keyStep, nearestIndex, promptsFrom, promptVariants, roleOf, stretchAround, trackTimes,
} from '../../src/video/keys';

const rect = (w: number, h: number, x0: number, y0: number, rw: number, rh: number) => {
  const m = new Float32Array(w * h);
  for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) m[y * w + x] = 1;
  return m;
};

describe('keyframe scheduling', () => {
  it('frame times of a stretch', () => {
    expect(trackTimes(1, 2, 4)).toEqual([1, 1.25, 1.5, 1.75]);
    expect(trackTimes(3, 3, 30)).toEqual([3]);
  });

  it('every step frames, the last one, and corrections', () => {
    expect(keyframeIndices(11, 5)).toEqual([0, 5, 10]);
    expect(keyframeIndices(12, 5)).toEqual([0, 5, 10, 11]);
    expect(keyframeIndices(12, 5, [7, 99, -1])).toEqual([0, 5, 7, 10, 11]);
    expect(keyframeIndices(0, 5)).toEqual([]);
    expect(keyStep(0.5, 30)).toBe(15);
    expect(keyStep(0.001, 30)).toBe(1);
  });

  it('a correction recomputes only the stretch between its neighbouring keyframes', () => {
    const keys = [0, 5, 10, 15];
    expect(stretchAround(keys, 7)).toEqual({ prev: 5, next: 10 });
    expect(stretchAround(keys, 5)).toEqual({ prev: 0, next: 10 });
    expect(stretchAround(keys, 16)).toEqual({ prev: 15, next: null });
    expect(nearestIndex([0, 0.1, 0.2, 0.3], 0.19)).toBe(2);
  });

  it('keyframes travel in the names of the stored masks', () => {
    expect(frameName(12, 'clave')).toBe('pista-000012-clave.png');
    expect(roleOf('pista-000012-correccion.png')).toBe('correccion');
    expect(roleOf('pista-000013.png')).toBe('');
    const frames = ['pista-000000-clave.png', 'pista-000001.png', 'pista-000002-oculto.png', 'pista-000003-correccion.png'].map(name => ({ media: { name } }));
    expect(keysOfFrames(frames)).toEqual([0, 2, 3]);
  });
});

describe('prompts from the previous mask', () => {
  const w = 80, h = 60;
  it('box expanded, positives deep inside, negatives outside', () => {
    const m = rect(w, h, 20, 15, 30, 20);
    const p = promptsFrom(m, w, h)!;
    expect(p.box.x).toBeLessThan(20);
    expect(p.box.y).toBeLessThan(15);
    expect(p.box.x + p.box.w).toBeGreaterThan(50);
    const pos = p.points.filter(q => q.positive), neg = p.points.filter(q => !q.positive);
    expect(pos.length).toBeGreaterThanOrEqual(1);
    for (const q of pos) expect(m[Math.floor(q.y) * w + Math.floor(q.x)]).toBe(1);
    expect(neg.length).toBeGreaterThanOrEqual(2);
    for (const q of neg) expect(m[Math.floor(q.y) * w + Math.floor(q.x)]).toBe(0);
    // the first positive is the deepest point: the centre row of the rectangle
    expect(Math.abs(pos[0].y - 25)).toBeLessThanOrEqual(1);
    expect(promptVariants(p).length).toBe(3);
  });

  it('nothing to prompt with when the object is gone', () => {
    expect(promptsFrom(new Float32Array(w * h), w, h)).toBeNull();
  });
});

describe('choice among candidates', () => {
  const w = 60, h = 40;
  const expected = rect(w, h, 20, 10, 16, 16);
  it('prefers the candidate that agrees with the flow-warped mask, not the biggest one', () => {
    const whole = rect(w, h, 0, 0, 60, 40);
    const part = rect(w, h, 22, 12, 6, 6);
    const right = rect(w, h, 21, 10, 16, 15);
    const c = chooseCandidate([whole, part, right], expected);
    expect(c.index).toBe(2);
    expect(c.occluded).toBe(false);
    expect(c.iou).toBeGreaterThan(0.8);
  });

  it('calls it occluded when nothing overlaps enough', () => {
    const elsewhere = rect(w, h, 45, 25, 10, 10);
    // a small piece straddling the edge of the expected mask (mostly outside it)
    const straddling = rect(w, h, 33, 22, 6, 6);
    expect(chooseCandidate([elsewhere], expected).occluded).toBe(true);
    expect(chooseCandidate([straddling], expected).occluded).toBe(true);
    expect(chooseCandidate([new Float32Array(w * h)], expected).index).toBe(-1);
  });

  it('recovers from a loose expectation: a tight candidate inside it is taken', () => {
    // the expected mask grew (a keyframe took in background); the model finds the object tightly, inside it
    const loose = rect(w, h, 10, 2, 40, 36);
    const tight = rect(w, h, 22, 12, 14, 14);
    const c = chooseCandidate([tight], loose);
    expect(c.index).toBe(0);
    expect(c.occluded).toBe(false);
    expect(c.iou).toBeCloseTo(0.6, 5);
  });
});
