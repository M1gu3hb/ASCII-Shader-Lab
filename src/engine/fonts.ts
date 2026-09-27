import { fontById, nearestWeight, type FontInfo } from './catalog';

export interface FontLoader {
  stack(id: string): string;
  /** Resolves when the face (and the unicode subsets needed by `sample`) is usable. */
  ensure(id: string, weight: number, italic?: boolean, sample?: string): Promise<boolean>;
}

const sheets = new Map<string, Promise<void>>();

/**
 * google = true injects a Google Fonts stylesheet when the family is not already
 * registered on the page (used by exported code). The studio self-hosts its fonts.
 */
export function createFontLoader(opts: { google: boolean }): FontLoader {
  return {
    stack: id => fontById(id).stack,
    async ensure(id, weight, italic = false, sample = 'AaMm@#01') {
      const f = fontById(id);
      if (!f.family || typeof document === 'undefined' || !document.fonts) return true;
      if (opts.google && f.google && !hasFamily(f.family)) await ensureSheet(id, f);
      const spec = `${italic ? 'italic ' : ''}${nearestWeight(f, weight)} 32px "${f.family}"`;
      try {
        const faces = await Promise.race([
          document.fonts.load(spec, sample || 'Aa'),
          new Promise<FontFace[]>(res => setTimeout(() => res([]), 5000)),
        ]);
        return faces.length > 0;
      } catch {
        return false;
      }
    },
  };
}

function ensureSheet(id: string, f: FontInfo): Promise<void> {
  let p = sheets.get(id);
  if (!p) {
    p = new Promise<void>(res => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
      l.dataset.mtFont = id;
      l.onload = () => res();
      l.onerror = () => res();
      setTimeout(res, 4000);
      document.head.appendChild(l);
    });
    sheets.set(id, p);
  }
  return p;
}

function hasFamily(family: string): boolean {
  for (const ff of document.fonts as unknown as Iterable<FontFace>) {
    if (ff.family.replace(/["']/g, '') === family) return true;
  }
  return false;
}
