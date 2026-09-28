import { afterEach, describe, expect, it, vi } from 'vitest';
import { sortByDensity } from '../../src/engine/atlas';

/**
 * The glyph ramp is ordered by the ink each character leaves in the piece's font. Measured while that web
 * font was still loading, the order was the fallback font's, and it was cached for the whole page: a first
 * visit (and its exports, and exported code on another site) picked other glyphs than the same piece later.
 * A minimal fake canvas: the ink of each character depends on whether the web font has loaded.
 */
function fakePage(inkFallback: Record<string, number>, inkLoaded: Record<string, number>) {
  const face = { family: 'Fake Mono', status: 'loading' as FontFaceLoadStatus };
  let drawn = '';
  const ctx = {
    font: '', textAlign: '', textBaseline: '', fillStyle: '',
    clearRect() { drawn = ''; },
    fillText(c: string) { drawn = c; },
    getImageData(_x: number, _y: number, w: number, h: number) {
      const ink = (face.status === 'loaded' ? inkLoaded : inkFallback)[drawn] ?? 0;
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < ink; i++) data[i * 4 + 3] = 255;
      return { data };
    },
  };
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
    fonts: { forEach: (cb: (f: typeof face) => void) => cb(face) },
  });
  return face;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('glyph order and web fonts', () => {
  it('measures again once the web font has loaded (the fallback order is not kept)', () => {
    const chars = ['a', 'b', 'c'];
    // with the fallback, «c» is the lightest; with the real font, «a» is
    const face = fakePage({ a: 30, b: 20, c: 10 }, { a: 10, b: 20, c: 30 });
    const spec = { stack: '"Fake Mono", monospace', weight: 500 };
    expect(sortByDensity(chars, spec, 1.4)).toEqual(['c', 'b', 'a']);
    face.status = 'loaded';
    expect(sortByDensity(chars, spec, 1.4)).toEqual(['a', 'b', 'c']);
    // and the measurement is cached again from then on
    expect(sortByDensity(chars, spec, 1.4)).toEqual(['a', 'b', 'c']);
  });
});
