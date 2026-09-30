import { describe, expect, it } from 'vitest';
import { cycle, settle, snapHeights, step } from '../../src/studio/ui/sheetSnap';

describe('the settings sheet on phones', () => {
  const h = snapHeights(560, 140);

  it('rests at a peek (the sections), a half and the whole room', () => {
    expect(h.peek).toBe(140);
    expect(h.full).toBe(560);
    // half leaves the upper part of the room to the piece, and is always taller than the peek
    expect(h.half).toBeGreaterThan(h.peek);
    expect(h.half).toBeLessThan(h.full);
    expect(h.half).toBeGreaterThanOrEqual(Math.round(560 * 0.54));
    // a short room: the rests never pass it
    const s = snapHeights(200, 140);
    expect(s.full).toBe(200);
    expect(s.half).toBeLessThanOrEqual(200);
    expect(s.peek).toBeLessThanOrEqual(s.half);
    // a tablet upright (controls in two columns) asks for less of the room at half
    const t = snapHeights(1000, 150, 0.46);
    expect(t.half).toBe(460);
    expect(t.half).toBeLessThan(snapHeights(1000, 150).half);
    expect(snapHeights(300, 150, 0.46).half).toBe(246);
  });

  it('a slow drag lands on the nearest rest (a short one springs back)', () => {
    expect(settle(h.half - 20, 20, 0.1, h)).toBe('half');
    expect(settle(h.half + 25, -25, 0.1, h)).toBe('half');
    expect(settle(h.full - 40, -200, 0.1, h)).toBe('full');
    expect(settle(h.peek + 10, 150, 0.1, h)).toBe('peek');
    // dragged most of the way down: it closes
    expect(settle(30, 280, 0.1, h)).toBe('closed');
  });

  it('a flick goes to the next rest its way from where it was let go', () => {
    expect(settle(h.half - 60, 60, 1.2, h)).toBe('peek');
    expect(settle(h.half + 60, -60, -1.2, h)).toBe('full');
    expect(settle(h.peek - 50, 50, 1.2, h)).toBe('closed');
    // past the peek already: closed
    expect(settle(h.peek - 60, h.half - h.peek + 60, 1.5, h)).toBe('closed');
    expect(settle(h.full, -50, -1.5, h)).toBe('full');
  });

  it('a wobble is never a flick', () => {
    expect(settle(h.half - 12, 12, 2, h)).toBe('half');
  });

  it('the handle cycles the rests with a press, and ↑ ↓ step through them', () => {
    expect(cycle('half')).toBe('full');
    expect(cycle('full')).toBe('peek');
    expect(cycle('peek')).toBe('half');
    expect(step('half', 1)).toBe('full');
    expect(step('full', 1)).toBe('full');
    expect(step('half', -1)).toBe('peek');
    expect(step('peek', -1)).toBe('closed');
  });
});
