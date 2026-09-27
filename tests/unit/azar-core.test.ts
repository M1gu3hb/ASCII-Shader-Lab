import { describe, expect, it } from 'vitest';
import { cloneRecipe, defaultRecipe } from '../../src/engine';
import { T_GLYPH, T_NEW, T_OLD, transitionCells } from '../../src/engine/basic/transition';
import { TRANSITIONS, mosaicBlock, transitionOf, type TransitionKind } from '../../src/engine/transitions';
import { entryBody, mergeSession, normalizeEntry, recipeVersion, sameBody, thumbState, type Entry } from '../../src/studio/history';
import { lowLoad, pickTransition, qualityFor, setQuality, setTransitionChoice, setTransitionPace } from '../../src/studio/preview';

const PNG = 'data:image/webp;base64,AAAA';
const entry = (id: string, extra: Partial<Entry> = {}): Entry => ({
  id, recipe: defaultRecipe(), origin: defaultRecipe(), kind: 'azar', space: 'arte', created: 1, edited: false, ...extra,
});

describe('thumbnail versions', () => {
  it('fingerprints a recipe by content, once per recipe object', () => {
    const a = defaultRecipe(), b = cloneRecipe(a);
    expect(recipeVersion(a)).toBe(recipeVersion(b));
    expect(recipeVersion(a)).toMatch(/^[0-9a-z]{2,16}$/);
    const c = cloneRecipe(a);
    c.glyph.cell += 1;
    expect(recipeVersion(c)).not.toBe(recipeVersion(a));
  });

  it('tells a current thumbnail from a stale, a legacy and a missing one', () => {
    const e = entry('a');
    expect(thumbState(e)).toBe('missing');
    expect(thumbState({ ...e, thumb: PNG })).toBe('legacy');
    expect(thumbState({ ...e, thumb: PNG, thumbV: recipeVersion(e.recipe) })).toBe('ok');
    const edited = cloneRecipe(e.recipe);
    edited.color.bg = '#123456';
    expect(thumbState({ ...e, recipe: edited, thumb: PNG, thumbV: recipeVersion(e.recipe) })).toBe('stale');
  });

  it('loads entries saved before versions were kept (no thumbV) and keeps the version when there is one', () => {
    const old = normalizeEntry({ id: 'x', recipe: defaultRecipe(), kind: 'azar', created: 5, thumb: PNG });
    expect(old?.thumb).toBe(PNG);
    expect(old?.thumbV).toBeUndefined();
    expect(thumbState(old!)).toBe('legacy');
    const v = recipeVersion(old!.recipe);
    const now = normalizeEntry({ ...entryBody({ ...old!, thumbV: v }), thumb: PNG });
    expect(now?.thumbV).toBe(v);
    // a version without a picture, or a malformed one, is dropped
    expect(normalizeEntry({ id: 'y', recipe: defaultRecipe(), thumbV: v })?.thumbV).toBeUndefined();
    expect(normalizeEntry({ id: 'z', recipe: defaultRecipe(), thumb: PNG, thumbV: 'no válido' })?.thumbV).toBeUndefined();
  });

  it('stores the version with the entry body, so a new one is saved', () => {
    const a = entry('a', { thumb: PNG });
    expect(sameBody(a, { ...a, thumbV: 'abc' })).toBe(false);
    expect('thumb' in entryBody({ ...a, thumbV: 'abc' })).toBe(false);
    expect(entryBody({ ...a, thumbV: 'abc' }).thumbV).toBe('abc');
  });

  it('a session entry that replaces a local one keeps its picture only marked with the local recipe', () => {
    const mine = entry('a', { thumb: PNG, created: 1, updated: 1 });
    mine.thumbV = recipeVersion(mine.recipe);
    const theirs = entry('a', { created: 1, updated: 50 });
    theirs.recipe = cloneRecipe(theirs.recipe);
    theirs.recipe.glyph.cell = 31;
    const m = mergeSession({ entries: [mine], cursor: 0, favorites: [] }, { entries: [theirs], cursor: 0, favorites: [] });
    const got = m.entries[0];
    expect(got.recipe.glyph.cell).toBe(31);
    expect(got.thumb).toBe(PNG);
    // the picture shows the local recipe: marked stale, so it is made again
    expect(thumbState(got)).toBe('stale');
  });
});

describe('transitions (basic engine cells, same rules as the shader)', () => {
  const g = { cols: 40, rows: 24, cw: 8, ch: 12, W: 320, H: 288, n: 10 };
  const run = (kind: TransitionKind, p: number) => {
    const mode = new Uint8Array(g.cols * g.rows), glyph = new Uint16Array(g.cols * g.rows);
    transitionCells({ kind, duration: 1, seed: 1.7, origin: [0.4, 0.6] }, p, g, 3.2, mode, glyph);
    const count = (m: number) => mode.reduce((a, v) => a + (v === m ? 1 : 0), 0);
    return { mode, glyph, old: count(T_OLD), fresh: count(T_NEW), glyphs: count(T_GLYPH) };
  };

  it('every transition starts on the old frame and ends on the new piece', () => {
    for (const { id } of TRANSITIONS) {
      const start = run(id, 0), end = run(id, 0.999);
      // tejido starts its weave just before the first frame, mosaico shows its first blocks at once
      expect(start.old / start.mode.length, id).toBeGreaterThan(id === 'mosaico' ? 0.9 : 0.8);
      expect(end.fresh, id).toBe(end.mode.length);
    }
  });

  it('midway, both pieces and (except Mosaico) glyphs of the ramp show', () => {
    for (const { id } of TRANSITIONS) {
      const mid = run(id, id === 'mosaico' ? 0.1 : 0.4);
      expect(mid.old, id).toBeGreaterThan(0);
      expect(mid.fresh, id).toBeGreaterThan(0);
      if (id !== 'mosaico') {
        expect(mid.glyphs, id).toBeGreaterThan(0);
        for (let i = 0; i < mid.mode.length; i++) if (mid.mode[i] === T_GLYPH) expect(mid.glyph[i]).toBeLessThan(g.n);
      }
    }
  });

  it('an iris opens around its origin', () => {
    const r = run('iris', 0.25);
    const at = (x: number, y: number) => r.mode[Math.floor(y * g.rows) * g.cols + Math.floor(x * g.cols)];
    expect(at(0.4, 0.6)).toBe(T_NEW);
    expect(at(0.02, 0.02)).toBe(T_OLD);
  });

  it('Mosaico goes from big blocks to single cells', () => {
    expect([0, 0.25, 0.45, 0.65, 0.85].map(mosaicBlock)).toEqual([16, 8, 4, 2, 1]);
  });

  it('a spec is sanitised (unknown kind, silly durations)', () => {
    expect(transitionOf(true)?.kind).toBe('tejido');
    expect(transitionOf(false)).toBeNull();
    expect(transitionOf({ kind: 'nada' as TransitionKind, duration: 99 })).toMatchObject({ kind: 'tejido', duration: 3 });
    expect(transitionOf({ kind: 'iris', duration: 0 })?.duration).toBeCloseTo(0.12);
  });
});

describe('transition choice and preview quality', () => {
  it('«Auto» picks by what happened', () => {
    setTransitionChoice('auto'); setTransitionPace('normal'); setQuality('auto');
    expect(pickTransition({ cause: 'back', renderer: 'webgl2' })).toMatchObject({ kind: 'barrido', dir: -1, duration: 0.85 });
    expect(pickTransition({ cause: 'forward', renderer: 'webgl2' })).toMatchObject({ kind: 'barrido', dir: 1 });
    expect(pickTransition({ cause: 'vary', renderer: 'webgl2' })?.kind).toBe('disolucion');
    expect(pickTransition({ cause: 'space', renderer: 'webgl2' })?.kind).toBe('iris');
    expect(pickTransition({ cause: 'open', renderer: 'webgl2' })?.kind).toBe('mosaico');
    // the dice take turns, never the same twice in a row
    const kinds = Array.from({ length: 10 }, () => pickTransition({ cause: 'roll', renderer: 'webgl2', pointer: [0.2, 0.3] })!);
    for (let i = 1; i < kinds.length; i++) expect(kinds[i].kind).not.toBe(kinds[i - 1].kind);
    expect(new Set(kinds.map(k => k.kind)).size).toBeGreaterThanOrEqual(4);
    expect(kinds.find(k => k.kind === 'iris')?.origin).toEqual([0.2, 0.3]);
  });

  it('a chosen style, a short pace, none', () => {
    setTransitionChoice('lluvia'); setTransitionPace('corta');
    expect(pickTransition({ cause: 'back', renderer: 'webgl2' })).toMatchObject({ kind: 'lluvia', duration: 0.45 });
    setTransitionChoice('ninguna');
    expect(pickTransition({ cause: 'roll', renderer: 'webgl2' })).toBeNull();
  });

  it('low load: short, and never the costly one', () => {
    setTransitionChoice('mosaico'); setTransitionPace('normal'); setQuality('ligera');
    expect(lowLoad('webgl2')).toBe(true);
    const t = pickTransition({ cause: 'open', renderer: 'webgl2' })!;
    expect(t.kind).not.toBe('mosaico');
    expect(t.duration).toBeLessThanOrEqual(0.5);
    setQuality('auto');
    expect(lowLoad('basic')).toBe(true);
    expect(lowLoad('webgl2')).toBe(false);
    setQuality('alta');
    expect(lowLoad('basic')).toBe(false);
    setQuality('auto'); setTransitionChoice('auto');
  });

  it('quality only bounds how the preview draws', () => {
    expect(qualityFor('auto', 'webgl2')).toEqual({ maxPixelRatio: 2, adaptive: true });
    expect(qualityFor('alta', 'webgl2')).toEqual({ maxPixelRatio: 2, adaptive: false });
    expect(qualityFor('ligera', 'webgl2')).toMatchObject({ maxPixelRatio: 1, maxFps: 30, simplify: true });
    expect(qualityFor('ligera', 'basic').maxFps).toBe(20);
  });
});
