import { describe, expect, it } from 'vitest';
import { STYLES, TIMING, flipLetters, frameAt, nextActive, timeline, wordStyles } from '../../src/landing/titulo-plan';

/** «Haz arte ASCII» has twelve letters (spaces are not drawn). */
const N = 12;
const tl = timeline(N);
const cycleStart = (n: number) => TIMING.firstHold + n * tl.period;

describe('the hero headline score (src/landing/titulo-plan.ts)', () => {
  it('starts legible: the page shows the real headline first', () => {
    for (const t of [0, 0.5, 1, TIMING.firstHold - 0.01]) expect(frameAt(t, N).legible, `t = ${t}`).toBe(true);
    expect(frameAt(TIMING.firstHold + 0.05, N).legible).toBe(false);
  });

  it('is legible at least 60 % of every cycle, and never unreadable for long', () => {
    for (const n of [0, 1, 2, 7]) {
      let legible = 0, run = 0, longest = 0;
      const dt = 1 / 120;
      for (let t = cycleStart(n); t < cycleStart(n + 1); t += dt) {
        if (frameAt(t, N).legible) { legible += dt; run = 0; } else { run += dt; longest = Math.max(longest, run); }
      }
      expect(legible / tl.period, `cycle ${n}`).toBeGreaterThanOrEqual(0.6);
      // the whole-word styles are the longest stretch without the real letters: under four seconds
      expect(longest, `cycle ${n}`).toBeLessThan(4);
    }
  });

  it('first the whole words change style, then letters one by one, then a few on their own, then it holds', () => {
    const t0 = cycleStart(3);
    const words = frameAt(t0 + 1, N);
    expect(words.phase).toBe('palabras');
    expect(new Set(words.letters.map(l => `${l.a}>${l.b}:${l.p}`)).size, 'the whole line shares one state').toBe(1);
    const letters = frameAt(t0 + tl.letters.t0 + 0.5, N);
    expect(letters.phase).toBe('letras');
    const woven = letters.letters.filter(l => l.a !== 'solido' || l.b !== 'solido').length;
    expect(woven).toBeGreaterThan(0);
    expect(woven, 'most letters stay real while the wave passes').toBeLessThanOrEqual(8);
    const flips = frameAt(t0 + tl.flips.t0 + 0.2, N);
    expect(flips.phase).toBe('azar');
    expect(flips.letters.filter(l => l.a !== 'solido' || l.b !== 'solido').length).toBeLessThanOrEqual(3);
    expect(frameAt(t0 + tl.active + 0.1, N)).toMatchObject({ legible: true, phase: 'quieto' });
  });

  it('is deterministic, and changes the styles and the letters from one cycle to the next', () => {
    expect(frameAt(123.456, N)).toEqual(frameAt(123.456, N));
    const seen = new Set<string>();
    for (let n = 0; n < 6; n++) {
      const s = wordStyles(n);
      expect(new Set(s).size, `cycle ${n}: four different styles`).toBe(4);
      s.forEach(x => expect(STYLES).toContain(x));
      seen.add(s.join());
      const f = flipLetters(n, N);
      expect(new Set(f.map(x => x.letter)).size).toBe(f.length);
      f.forEach(x => expect(x.letter).toBeLessThan(N));
    }
    expect(seen.size).toBeGreaterThan(3);
    // the first impression: the classic character ramp comes first
    expect(wordStyles(0)[0]).toBe('rampa');
  });

  it('knows when to wake up (the page sleeps through the holds)', () => {
    expect(nextActive(0, N)).toBe(TIMING.firstHold);
    const inside = cycleStart(2) + 1;
    expect(nextActive(inside, N)).toBe(inside);
    expect(nextActive(cycleStart(2) + tl.active + 1, N)).toBeCloseTo(cycleStart(3), 6);
  });
});
