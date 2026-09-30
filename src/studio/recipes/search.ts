/**
 * Finding a recipe by what people type, in Spanish: accents, capitals and punctuation do not matter
 * («oceano» finds «Océano», «nino» finds «niño»), every word typed must be found (in any order), a word
 * may be the start of a longer one («figu» finds «Figuras 3D») and a plural finds the singular («fractales»
 * finds «fractal»). The name counts more than the other words an item is found by.
 */

/** Lower case, without accents or punctuation (ñ becomes n), spaces collapsed. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The words of a query, folded. */
export const tokens = (q: string) => fold(q).split(' ').filter(Boolean);

/** Singular forms a Spanish plural may come from («luces» → «luz», «fractales» → «fractal», «ondas» → «onda»). */
function stems(t: string): string[] {
  const out = [t];
  if (t.length > 4 && t.endsWith('ces')) out.push(t.slice(0, -3) + 'z');
  if (t.length > 4 && t.endsWith('es')) out.push(t.slice(0, -2));
  if (t.length > 3 && t.endsWith('s')) out.push(t.slice(0, -1));
  return out;
}

const startsWord = (text: string, t: string) => text.startsWith(t) || text.includes(' ' + t);

/** How well one word of a query matches: 3 the start of a word of the name, 2 inside the name, 1 another word; 0 not at all. */
function wordScore(t: string, name: string, words: string): number {
  let best = 0;
  for (const s of stems(t)) {
    if (startsWord(name, s)) return 3;
    if (name.includes(s)) best = Math.max(best, 2);
    else if (startsWord(words, s)) best = Math.max(best, 1);
    else if (s.length >= 4 && words.includes(s)) best = Math.max(best, 1);
  }
  return best;
}

/**
 * The score of an item for a query (0: not found). `name` and `words` are already folded. A name that
 * starts with the whole query comes first.
 */
export function score(query: string[], name: string, words: string): number {
  if (!query.length) return 0;
  let sum = 0;
  for (const t of query) {
    const s = wordScore(t, name, words);
    if (!s) return 0;
    sum += s;
  }
  const whole = query.join(' ');
  if (name === whole) sum += 6;
  else if (name.startsWith(whole)) sum += 4;
  return sum;
}

/** The items that match a query, best first (ties keep their order). */
export function search<T extends { folded: string; words: string }>(items: T[], q: string): T[] {
  const qs = tokens(q);
  if (!qs.length) return items;
  return items
    .map((it, i) => ({ it, i, s: score(qs, it.folded, it.words) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(x => x.it);
}
