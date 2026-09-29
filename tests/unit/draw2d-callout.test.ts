import { describe, expect, it } from 'vitest';
import { calloutBox } from '../../src/project/draw2d';

/** A callout's label box goes beyond the leader's end, away from where the line comes in. */
describe('calloutBox', () => {
  const W = 1000, H = 800, bw = 80, bh = 24;
  it('a leader coming from the left: the box opens to the right of its end, centred on it', () => {
    expect(calloutBox(700, 200, 50, 0, bw, bh, W, H)).toEqual({ x: 700, y: 188 });
  });
  it('a leader coming from the right (even on the right half): the box opens to the left', () => {
    expect(calloutBox(900, 200, -40, -10, bw, bh, W, H)).toEqual({ x: 820, y: 188 });
  });
  it('a leader coming from above or below: the box under or over its end', () => {
    expect(calloutBox(500, 300, 5, 60, bw, bh, W, H)).toEqual({ x: 460, y: 300 });
    expect(calloutBox(500, 300, 5, -60, bw, bh, W, H)).toEqual({ x: 460, y: 276 });
  });
  it('no room ahead in the frame: the label rests on the line, its far edge at the end, inside the frame', () => {
    // coming from the left at the right edge: above the line, ending at the leader's end
    expect(calloutBox(980, 200, 60, 0, bw, bh, W, H)).toEqual({ x: 900, y: 176 });
    // at the top edge: under the line
    expect(calloutBox(980, 10, 60, 0, bw, bh, W, H)).toEqual({ x: 900, y: 10 });
    // coming from above at the bottom edge: beside the line, inside the frame
    const b = calloutBox(500, 795, 0, 60, bw, bh, W, H);
    expect(b.x).toBe(500);
    expect(b.y + bh).toBeLessThanOrEqual(H);
  });
});
