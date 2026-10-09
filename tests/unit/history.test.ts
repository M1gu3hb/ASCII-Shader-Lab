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
    expect(historyLabel(812, 1000)).toBe('Historial: 812 de 1000 · lo editado y lo guardado con ★ no se descarta');
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

describe('the limit discards by date, not by place in the list', () => {
  it('an older session opened into a full history loses its own oldest results, not today\'s', () => {
    const day = 86_400_000, now = 1_800_000_000_000;
    const today = Array.from({ length: 10 }, (_, i) => entry('hoy' + i, { created: now - (10 - i) * 1000 }));
    const old = Array.from({ length: 4 }, (_, i) => entry('viejo' + i, { created: now - 30 * day + i }));
    const m = mergeSession({ entries: today, cursor: 9, favorites: [] }, { entries: old, cursor: 3, favorites: [] });
    const p = pruneHistory(m.entries, m.cursor, 10, () => false);
    // the session's current entry stays (the cursor moves there); the other three month-old ones go first
    expect(ids(p.dropped)).toEqual(['hoy0', 'viejo0', 'viejo1', 'viejo2']);
    expect(p.entries[p.cursor].id).toBe('viejo3');
    expect(ids(p.entries).filter(id => id.startsWith('hoy'))).toHaveLength(9);
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

  it('a round trip to another computer brings back the edits and renamed favourites made there', () => {
    const edited = defaultRecipe(); edited.glyph.cell = 22;
    const here = { entries: [entry('e1', { created: 10 }), entry('e2', { created: 11 })], cursor: 1, favorites: [{ ...fav('f1'), name: 'Mi pieza', updated: 10 }] };
    const there = {
      entries: [entry('e1', { created: 10, updated: 99, recipe: edited, edited: true }), entry('e2', { created: 11 })], cursor: 0,
      favorites: [{ ...fav('f1'), name: 'Mi pieza (final)', recipe: edited, updated: 99 }],
    };
    const m = mergeSession(here, there);
    expect(m.entries[0].recipe.glyph.cell).toBe(22);
    expect(m.entries[0].id).toBe('e1');
    expect(m.replaced.map(e => e.recipe.glyph.cell)).toEqual([defaultRecipe().glyph.cell]);
    expect(m.favorites[0].name).toBe('Mi pieza (final)');
    expect([m.added, m.updated, m.skipped, m.favAdded, m.favUpdated]).toEqual([0, 1, 1, 0, 1]);
    // the other way round (an older copy comes back), what is here is newer and stays
    const back = mergeSession(m, here);
    expect(back.entries[0].recipe.glyph.cell).toBe(22);
    expect(back.favorites[0].name).toBe('Mi pieza (final)');
    expect([back.updated, back.favUpdated]).toEqual([0, 0]);
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
    // a crafted thumbnail cannot smuggle another url() into the CSS it is used in
    expect(normalizeFavorite({ recipe: {}, thumb: 'data:image/png;base64,AA), url(https://tracker.example/p' })!.thumb).toBeUndefined();
    expect(normalizeEntry({ recipe: {}, thumb: 'data:image/svg+xml,<svg onload=x>' })!.thumb).toBeUndefined();
  });

  it('collects the media ids used by history (current and original) and collection', () => {
    const withRef = (id: string) => { const r = defaultRecipe(); r.source = 'image'; r.media.ref = { id, kind: 'image', w: 10, h: 10 }; return r; };
    const e1 = entry('a', { recipe: withRef('00000000000000a1'), origin: withRef('00000000000000a0') });
    const f = { ...fav('F'), recipe: withRef('00000000000000f1') };
    expect([...mediaIdsOf(allRecipes([e1, entry('b')], [f]))].sort()).toEqual(['00000000000000a0', '00000000000000a1', '00000000000000f1']);
  });
});


describe('import conflicts preserve local work across reloads', () => {
  it('stores an edited local version as a separate, stable entry and does not duplicate it on reimport', () => {
    const mine = defaultRecipe(); mine.color.bg = '#00ff00';
    const newer = defaultRecipe(); newer.color.bg = '#ff00ff';
    const cur = { entries: [entry('same', { recipe: mine, edited: true, updated: 10 })], cursor: 0, favorites: [] };
    const inc = { entries: [entry('same', { recipe: newer, edited: true, updated: 20 })], cursor: 0, favorites: [] };
    const m = mergeSession(cur, inc);
    expect(m.preserved).toBe(1);
    expect(m.entries[m.cursor].recipe.color.bg).toBe('#ff00ff');
    const copy = m.entries.find(e => e.id !== 'same')!;
    expect(copy.recipe.color.bg).toBe('#00ff00');
    expect(normalizeEntry(JSON.parse(JSON.stringify(copy)))!.recipe.color.bg).toBe('#00ff00');
    const twice = mergeSession(m, inc);
    expect(twice.entries).toHaveLength(2);
    expect(twice.preserved).toBe(0);
  });
});
