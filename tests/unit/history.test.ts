import { describe, expect, it } from 'vitest';
import { defaultRecipe } from '../../src/engine';
import { SPACES } from '../../src/random';
import { HISTORY_LIMIT, historyLabel, mediaIdsOf, allRecipes, mergeSession, normalizeEntry, normalizeFavorite, pruneHistory, type Entry, type Favorite } from '../../src/studio/history';

const entry = (id: string, extra: Partial<Entry> = {}): Entry => ({
  id, recipe: defaultRecipe(), origin: defaultRecipe(), kind: 'azar', space: 'arte', created: 1, edited: false, ...extra,
});
const fav = (id: string): Favorite => ({ id, name: id, recipe: defaultRecipe(), created: 1, updated: 1, space: 'arte' });
const ids = (l: Array<{ id: string }>) => l.map(x => x.id);

describe('history limit', () => {
  it('is a thousand results, and the counter says what is kept', () => {
    expect(HISTORY_LIMIT).toBe(1000);
    expect(historyLabel(812, 1000)).toBe('Historial: 812 de 1000 · lo guardado con ★ no se descarta');
  });

  it('does nothing while under the limit', () => {
    const list = [entry('a'), entry('b')];
    const p = pruneHistory(list, 1, 5, () => false);
    expect(p.entries).toBe(list);
    expect(p.dropped).toEqual([]);
  });

  it('drops the oldest entries first, never favourites nor the current one', () => {
    const list = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => entry(id, id === 'a' ? { favId: 'F' } : {}));
    // cursor on "b" (an old entry the person went back to), limit 3: three must go
    const p = pruneHistory(list, 1, 3, e => e.favId === 'F');
    expect(ids(p.dropped)).toEqual(['c', 'd', 'e']);
    expect(ids(p.entries)).toEqual(['a', 'b', 'f']);
    expect(p.entries[p.cursor].id).toBe('b');
  });

  it('keeps the new current entry when it is the last one', () => {
    const list = ['a', 'b', 'c', 'd'].map(id => entry(id));
    const p = pruneHistory(list, 3, 3, () => false);
    expect(ids(p.entries)).toEqual(['b', 'c', 'd']);
    expect(p.cursor).toBe(2);
  });

  it('may stay over the limit when everything left is kept', () => {
    const list = ['a', 'b', 'c'].map(id => entry(id, { favId: id }));
    const p = pruneHistory(list, 2, 1, () => true);
    expect(p.entries).toHaveLength(3);
    expect(p.dropped).toHaveLength(0);
  });
});

describe('sessions merge into the history', () => {
  it('appends after the current history, skips ids already there and moves to the session cursor', () => {
    const cur = { entries: [entry('a'), entry('b')], cursor: 0, favorites: [fav('F1')] };
    const inc = { entries: [entry('b'), entry('c'), entry('d')], cursor: 1, favorites: [fav('F1'), fav('F2')] };
    const m = mergeSession(cur, inc);
    expect(ids(m.entries)).toEqual(['a', 'b', 'c', 'd']);
    expect(m.entries[m.cursor].id).toBe('c');
    expect([m.added, m.skipped, m.favAdded]).toEqual([2, 1, 1]);
    expect(ids(m.favorites)).toEqual(['F1', 'F2']);
  });

  it('importing the same session twice adds nothing', () => {
    const inc = { entries: [entry('x'), entry('y')], cursor: 1, favorites: [fav('F')] };
    const once = mergeSession({ entries: [entry('a')], cursor: 0, favorites: [] }, inc);
    const twice = mergeSession(once, inc);
    expect(twice.entries).toHaveLength(3);
    expect(twice.added).toBe(0);
    expect(twice.favAdded).toBe(0);
    expect(twice.entries[twice.cursor].id).toBe('y');
  });
});

describe('stored and imported entries', () => {
  it('normalises junk, keeps known fields and drops bad thumbnails', () => {
    expect(normalizeEntry(null)).toBeNull();
    expect(normalizeEntry({ id: 'x' })).toBeNull();
    const e = normalizeEntry({ id: 'e1', recipe: { glyph: { cell: 999 } }, kind: 'raro', space: 'nada', thumb: 'javascript:alert(1)', seed: 'faro', favId: 'F' })!;
    expect(e.id).toBe('e1');
    expect(e.recipe.glyph.cell).toBe(96);
    expect(e.origin.glyph.cell).toBe(96);
    expect(e.kind).toBe('importado');
    expect(SPACES.map(s => s.id)).toContain(e.space);
    expect(e.thumb).toBeUndefined();
    expect(e.seed).toBe('faro');
    expect(e.favId).toBe('F');
    expect(normalizeEntry({ recipe: {}, thumb: 'data:image/webp;base64,AAAA' })!.thumb).toBe('data:image/webp;base64,AAAA');
    expect(normalizeFavorite({ name: 7, recipe: {} })!.name).toBe('Importado');
  });

  it('collects the media ids used by history (current and original) and collection', () => {
    const withRef = (id: string) => { const r = defaultRecipe(); r.source = 'image'; r.media.ref = { id, kind: 'image', w: 10, h: 10 }; return r; };
    const e1 = entry('a', { recipe: withRef('00000000000000a1'), origin: withRef('00000000000000a0') });
    const f = { ...fav('F'), recipe: withRef('00000000000000f1') };
    expect([...mediaIdsOf(allRecipes([e1, entry('b')], [f]))].sort()).toEqual(['00000000000000a0', '00000000000000a1', '00000000000000f1']);
  });
});
