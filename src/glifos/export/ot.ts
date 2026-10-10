/**
 * opentype.js, loaded on demand (as src/exporters/svg.ts does): it is big and only the font export and the font
 * import need it. The repo's ambient declaration (src/vite-env.d.ts) only types `parse`, so the few parts of
 * its API used here are typed locally.
 */

export interface OCmd { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }

export interface OPath {
  commands: OCmd[];
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  quadTo(x1: number, y1: number, x: number, y: number): void;
  close(): void;
  getBoundingBox(): { x1: number; y1: number; x2: number; y2: number; isEmpty(): boolean };
}

export interface OGlyph {
  index: number;
  name: string | null;
  unicode?: number;
  unicodes: number[];
  advanceWidth?: number;
  leftSideBearing?: number;
  path: OPath;
}

export interface OFont {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  numGlyphs?: number;
  names: Record<string, Record<string, string> | undefined>;
  glyphs: { length: number; get(i: number): OGlyph | undefined };
  tables: Record<string, Record<string, unknown> | undefined>;
  kerningPairs?: Record<string, number>;
  charToGlyphIndex(c: string): number | null;
  getKerningValue(left: number, right: number): number;
  getEnglishName(name: string): string | undefined;
  toArrayBuffer(): ArrayBuffer;
}

export interface OpenTypeLib {
  Font: new (o: Record<string, unknown>) => OFont;
  Glyph: new (o: Record<string, unknown>) => OGlyph;
  Path: new () => OPath;
  parse(buf: ArrayBuffer): OFont;
}

let lib: OpenTypeLib | null = null;
let loading: Promise<OpenTypeLib> | null = null;

export function loadOpentype(): Promise<OpenTypeLib> {
  if (lib) return Promise.resolve(lib);
  loading ??= import('opentype.js').then(m => {
    const mod = m as unknown as { default?: OpenTypeLib } & OpenTypeLib;
    lib = mod.default ?? mod;
    return lib;
  }).catch(e => { loading = null; throw e; });
  return loading;
}

/** The library when some earlier call already loaded it (synchronous checks run after a build). */
export const loadedOpentype = (): OpenTypeLib | null => lib;

/** The English (or first) value of a name record, trimmed; opentype.js fills empty names with ' '. */
export function nameOf(font: OFont, key: string): string | undefined {
  const rec = font.names?.[key];
  if (!rec) return undefined;
  const v = (rec.en ?? Object.values(rec)[0] ?? '').trim();
  return v || undefined;
}
