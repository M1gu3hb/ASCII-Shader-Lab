import { describe, expect, it } from 'vitest';
import { easeOut, hash01, motionLevel, scrambleFrame } from '../../src/shared/glyphfx';

describe('glyphfx', () => {
  it('scrambleFrame ends exactly on the final text and keeps its shape on the way', () => {
    const final = 'Capas y color';
    expect(scrambleFrame(final, 1)).toBe(final);
    for (const p of [0, 0.2, 0.5, 0.8]) {
      const f = scrambleFrame(final, p, { seed: 3 });
      expect([...f]).toHaveLength([...final].length);
      [...final].forEach((c, i) => { if (c === ' ') expect([...f][i]).toBe(' '); });
    }
  });

  it('reveals more letters as progress grows, never fewer', () => {
    const final = 'Movimiento';
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const f = [...scrambleFrame(final, p, { seed: 9, glyphs: '#' })];
      const shown = f.filter((c, i) => c === [...final][i]).length;
      expect(shown).toBeGreaterThanOrEqual(prev);
      prev = shown;
    }
    expect(prev).toBe(final.length);
  });

  it('is deterministic for a seed and tick (no flicker between identical frames)', () => {
    expect(scrambleFrame('Glifos', 0.4, { seed: 5, tick: 2 })).toBe(scrambleFrame('Glifos', 0.4, { seed: 5, tick: 2 }));
  });

  it('hash01 and easeOut stay in range', () => {
    for (let i = 0; i < 500; i++) { const h = hash01(i * 7919); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1); }
    expect(easeOut(-1)).toBe(0); expect(easeOut(2)).toBe(1); expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });

  it('without a window there is no motion', () => {
    expect(motionLevel()).toBe('none');
  });
});
