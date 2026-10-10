import { describe, expect, it } from 'vitest';
import { TempGlyphSets, getGlyphSet, glyphSetCount, provideGlyphSet, watchGlyphSets } from '../../src/glyphset/registry';
import type { GlyphSet } from '../../src/glyphset/set';

/** A-12 of the PR #10 review: the glyph studio's piece preview registered a set per edit and never let go. */

const set = (name: string): GlyphSet => ({ kind: 'glyphos-glifos', v: 1, name, mode: 'texto', upm: 1000, asc: 800, desc: -200, xh: 500, cap: 700, glyphs: { a: { a: 500, d: 'M0 0L500 0L500 500Z' } } } as unknown as GlyphSet);

describe('juegos temporales de una vista previa (A-12)', () => {
  it('editar muchas veces no acumula juegos: quedan sólo el actual y el que el motor aún dibuja', () => {
    const base = glyphSetCount();
    const t = new TempGlyphSets();
    let last = '';
    for (let k = 0; k < 200; k++) {
      last = t.use(set('v' + k));
      if (k % 3 === 0) t.settle(last);
    }
    expect(glyphSetCount() - base).toBeLessThanOrEqual(3);
    t.settle(last);
    expect(glyphSetCount() - base).toBe(1);
    expect(getGlyphSet(last)?.name).toBe('v199');
    t.release();
    expect(glyphSetCount()).toBe(base);
  });

  it('retirar los temporales no toca los juegos que usa el laboratorio', () => {
    provideGlyphSet('00000000000000aa', set('del laboratorio'));
    const t = new TempGlyphSets();
    t.use(set('x')); t.use(set('y'));
    let seen = 0;
    const off = watchGlyphSets(() => { seen++; });
    t.release();
    off();
    expect(getGlyphSet('00000000000000aa')?.name).toBe('del laboratorio');
    expect(seen).toBeGreaterThan(0);
  });
});
