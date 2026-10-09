import type { GlyphSet } from './set';

/**
 * Glyph sets known to this page, shared by every engine on it (stage, thumbnails, exports), keyed by
 * content id. The studio fills it from this browser's storage when an engine asks for one it does not hold;
 * exported code fills it from the sets it carries (Glyphos.registerGlyphSet).
 */

const known = new Map<string, GlyphSet>();
const missing = new Set<string>();
const asked = new Set<string>();
const waiters = new Map<string, Array<() => void>>();
let gen = 0;
let onMissing: ((id: string) => void) | null = null;
const watchers = new Set<() => void>();
const changed = () => { gen++; for (const w of [...watchers]) w(); };

/** Called whenever a set arrives or is declared missing (an engine redraws its atlas). Returns the unsubscribe. */
export function watchGlyphSets(fn: () => void): () => void {
  watchers.add(fn);
  return () => { watchers.delete(fn); };
}

/** Bumped whenever a set arrives or is declared missing: engines drawing with one look again. */
export const glyphSetGen = () => gen;

export function provideGlyphSet(id: string, set: GlyphSet) {
  known.set(id, set);
  missing.delete(id);
  changed();
  for (const w of waiters.get(id) ?? []) w();
  waiters.delete(id);
}

/** The loader looked and this browser does not have it: engines draw with the piece's font, and say so. */
export function declareGlyphSetMissing(id: string) {
  if (known.has(id)) return;
  missing.add(id);
  changed();
  for (const w of waiters.get(id) ?? []) w();
  waiters.delete(id);
}

export function getGlyphSet(id: string): GlyphSet | undefined {
  const s = known.get(id);
  if (!s && onMissing && !asked.has(id)) { asked.add(id); onMissing(id); }
  return s;
}

/** 'ok' when the page holds it; 'missing' when its loader said this browser does not; 'pending' otherwise. */
export function glyphSetStatus(id: string): 'ok' | 'missing' | 'pending' {
  return known.has(id) ? 'ok' : missing.has(id) ? 'missing' : 'pending';
}

/** Resolves when the set is here or known to be missing, or after `ms` (engines wait for it in ready()). */
export function whenGlyphSet(id: string, ms = 4000): Promise<void> {
  getGlyphSet(id);
  if (known.has(id) || missing.has(id) || !onMissing) return Promise.resolve();
  return new Promise(res => {
    const done = () => { clearTimeout(t); res(); };
    const t = setTimeout(() => {
      const a = waiters.get(id);
      if (a) { const i = a.indexOf(done); if (i >= 0) a.splice(i, 1); }
      res();
    }, ms);
    const a = waiters.get(id) ?? [];
    a.push(done);
    waiters.set(id, a);
  });
}

/** The studio fetches sets this page does not hold yet (from this browser's storage). */
export function onMissingGlyphSet(fn: ((id: string) => void) | null) {
  onMissing = fn;
  asked.clear();
}

export function forgetGlyphSets() { known.clear(); missing.clear(); asked.clear(); changed(); }
