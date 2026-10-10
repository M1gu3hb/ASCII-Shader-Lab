/**
 * A glyph set made in «Crea tus GLYPHOS» (/studio/glifos/), in the form the engines draw: every character's
 * outline (or bitmap) in font units, the metrics that place it in a cell and, for a set of ASCII symbols, its
 * ramp from empty to full. It is DERIVED from the editable document (src/glifos): compiling a document gives
 * one of these, named by the hash of its bytes (content id), so the same drawing is the same set wherever it
 * goes and a piece names exactly the drawing it was made with.
 *
 * Pure: no DOM. The engines paint it with paint.ts; the studio stores it (src/glifos/storage.ts); projects,
 * sessions and exported code carry it.
 */

export const GLYPHSET_FORMAT = 1 as const;
export const GLYPHSET_KIND = 'glyphos-glifos';

/** What a set is for: letters for words and messages, or symbols for the cells of an ASCII piece. */
export type GlyphSetMode = 'texto' | 'ascii';

export interface GlyphBitmap {
  /** Size in pixels; the alpha bytes, row by row from the top, in base64. */
  w: number; h: number; a: string;
  /** Top-left corner in font units (y up) and the size of one pixel in font units. */
  x: number; y: number; s: number;
}

export interface GlyphShape {
  /** Advance width in font units. */
  a: number;
  /** Outline in font units, y up: absolute M, L, Q, C and Z only (normalised by the compiler). */
  d?: string;
  /** A drawing kept as pixels (an imported picture that was not vectorised). */
  b?: GlyphBitmap;
}

export interface GlyphSet {
  kind: typeof GLYPHSET_KIND;
  v: number;
  name: string;
  /** The document it was compiled from, so a newer revision can be offered. */
  doc?: { id: string; rev: number };
  mode: GlyphSetMode;
  upm: number;
  asc: number;
  desc: number;
  xh: number;
  cap: number;
  /** Keyed by the character (one Unicode code point, never a UTF-16 half). */
  glyphs: Record<string, GlyphShape>;
  /** ASCII sets: their characters from empty to full, as the person left them. */
  ramp?: string;
  /** Kerning of text sets: "AV" → units (negative brings them closer). */
  kern?: Record<string, number>;
}

export const GLYPHSET_LIMITS = {
  glyphs: 1500,
  /** Characters of path data per glyph. */
  path: 120_000,
  /** Commands per glyph. */
  commands: 12_000,
  bitmap: 256,
  bytes: 6 * 1024 * 1024,
  name: 60,
  coord: 20_000,
} as const;

export const GLYPHSET_FUTURE = 'Ese juego de glifos viene de una versión más nueva de GLYPHOS. Conserva el archivo y actualiza el estudio.';

const ARGS: Record<string, number> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

/** One Unicode scalar value that can be drawn: no controls, no surrogate halves, no noncharacters. */
export function drawableCodePoint(cp: number): boolean {
  if (!Number.isInteger(cp) || cp < 0x20 || cp > 0x10ffff) return false;
  if (cp >= 0x7f && cp < 0xa0) return false;
  if (cp >= 0xd800 && cp <= 0xdfff) return false;
  if ((cp & 0xfffe) === 0xfffe || (cp >= 0xfdd0 && cp <= 0xfdef)) return false;
  return true;
}

/** The single code point a key names, or -1 (empty, two characters, a lone surrogate…). */
export function keyCodePoint(key: string): number {
  const cps = Array.from(key);
  if (cps.length !== 1) return -1;
  const cp = cps[0].codePointAt(0)!;
  return drawableCodePoint(cp) ? cp : -1;
}

/**
 * Checks path data written by the compiler: only absolute M L Q C Z with finite numbers in range.
 * Throws a readable error; returns the number of commands.
 */
export function checkPathData(d: string): number {
  if (d.length > GLYPHSET_LIMITS.path) throw new Error('Un glifo tiene un trazo demasiado largo.');
  const tokens = d.match(/[MLQCZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  if (tokens.join('').length !== d.replace(/[\s,]+/g, '').length) throw new Error('Un glifo tiene un trazo con caracteres no válidos.');
  let i = 0, n = 0, open = false;
  while (i < tokens.length) {
    const c = tokens[i++];
    const k = ARGS[c];
    if (k === undefined) throw new Error('Un glifo tiene un trazo con comandos no válidos.');
    if (c !== 'M' && !open) throw new Error('Un glifo tiene un trazo que no empieza con M.');
    for (let j = 0; j < k; j++) {
      const v = Number(tokens[i++]);
      if (!Number.isFinite(v) || Math.abs(v) > GLYPHSET_LIMITS.coord) throw new Error('Un glifo tiene coordenadas fuera de rango.');
    }
    open = c !== 'Z' ? true : open;
    if (++n > GLYPHSET_LIMITS.commands) throw new Error('Un glifo tiene demasiados nodos.');
  }
  return n;
}

const num = (v: unknown, lo: number, hi: number, name: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`El juego de glifos tiene un valor no válido (${name}).`);
  return v;
};

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Validates a set read from anywhere (storage, a project, a session, exported code): throws a readable
 * error on anything malformed or from a newer format; returns a clean copy with only known fields.
 */
export function normalizeGlyphSet(input: unknown): GlyphSet {
  if (!input || typeof input !== 'object') throw new Error('Ese archivo no es un juego de glifos de GLYPHOS.');
  const o = input as Record<string, unknown>;
  if (o.kind !== GLYPHSET_KIND) throw new Error('Ese archivo no es un juego de glifos de GLYPHOS.');
  if (typeof o.v !== 'number' || !Number.isInteger(o.v) || o.v < 1) throw new Error('El juego de glifos está dañado.');
  if (o.v > GLYPHSET_FORMAT) throw new Error(GLYPHSET_FUTURE);
  const mode: GlyphSetMode = o.mode === 'ascii' ? 'ascii' : o.mode === 'texto' ? 'texto' : (() => { throw new Error('El juego de glifos tiene un modo desconocido.'); })();
  const upm = num(o.upm, 16, 16384, 'unidades por eme');
  const set: GlyphSet = {
    kind: GLYPHSET_KIND,
    v: GLYPHSET_FORMAT,
    name: typeof o.name === 'string' ? o.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, GLYPHSET_LIMITS.name) || 'Sin nombre' : 'Sin nombre',
    mode,
    upm,
    asc: num(o.asc, -upm * 4, upm * 4, 'ascendente'),
    desc: num(o.desc, -upm * 4, upm * 4, 'descendente'),
    xh: num(o.xh, 0, upm * 4, 'altura x'),
    cap: num(o.cap, 0, upm * 4, 'altura de mayúsculas'),
    glyphs: {},
  };
  if (o.doc && typeof o.doc === 'object') {
    const dd = o.doc as Record<string, unknown>;
    if (typeof dd.id === 'string' && /^[a-z0-9-]{1,40}$/.test(dd.id) && Number.isInteger(dd.rev) && (dd.rev as number) >= 0) set.doc = { id: dd.id, rev: dd.rev as number };
  }
  const g = o.glyphs && typeof o.glyphs === 'object' ? o.glyphs as Record<string, unknown> : null;
  if (!g) throw new Error('El juego de glifos no tiene glifos.');
  const keys = Object.keys(g);
  if (keys.length > GLYPHSET_LIMITS.glyphs) throw new Error(`El juego de glifos tiene más de ${GLYPHSET_LIMITS.glyphs} caracteres.`);
  for (const k of keys) {
    if (keyCodePoint(k) < 0) throw new Error('El juego de glifos tiene un carácter no válido.');
    const s = g[k] as Record<string, unknown> | null;
    if (!s || typeof s !== 'object') throw new Error('El juego de glifos está dañado.');
    const shape: GlyphShape = { a: num(s.a, 0, upm * 8, 'avance') };
    if (s.d !== undefined) {
      if (typeof s.d !== 'string') throw new Error('El juego de glifos está dañado.');
      checkPathData(s.d);
      if (s.d) shape.d = s.d;
    }
    if (s.b !== undefined) {
      const b = s.b as Record<string, unknown>;
      const L = GLYPHSET_LIMITS.bitmap;
      const w = num(b?.w, 1, L, 'mapa de bits'), h = num(b?.h, 1, L, 'mapa de bits');
      if (!Number.isInteger(w) || !Number.isInteger(h) || typeof b.a !== 'string' || !B64.test(b.a) || Math.floor(b.a.length / 4) * 3 < w * h - 2) throw new Error('Un glifo tiene un mapa de bits dañado.');
      shape.b = { w, h, a: b.a, x: num(b.x, -GLYPHSET_LIMITS.coord, GLYPHSET_LIMITS.coord, 'mapa de bits'), y: num(b.y, -GLYPHSET_LIMITS.coord, GLYPHSET_LIMITS.coord, 'mapa de bits'), s: num(b.s, 0.01, upm, 'mapa de bits') };
    }
    set.glyphs[k] = shape;
  }
  if (typeof o.ramp === 'string' && mode === 'ascii') {
    const seen = new Set<string>();
    set.ramp = Array.from(o.ramp).filter(c => keyCodePoint(c) >= 0 && !seen.has(c) && (seen.add(c), true)).slice(0, 400).join('');
  }
  if (o.kern && typeof o.kern === 'object') {
    const kern: Record<string, number> = {};
    let n = 0;
    for (const [pair, v] of Object.entries(o.kern as Record<string, unknown>)) {
      const cs = Array.from(pair);
      if (cs.length !== 2 || cs.some(c => keyCodePoint(c) < 0) || typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > upm) continue;
      if (++n > 20_000) break;
      if (v) kern[pair] = Math.round(v);
    }
    if (Object.keys(kern).length) set.kern = kern;
  }
  return set;
}

/** The bytes that name a set: its JSON with keys in a fixed order (the same set always hashes the same). */
export function glyphSetBytes(set: GlyphSet): Uint8Array {
  const sorted = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted((v as Record<string, unknown>)[k])]));
    return v;
  };
  const bytes = new TextEncoder().encode(JSON.stringify(sorted(set)));
  if (bytes.length > GLYPHSET_LIMITS.bytes) throw new Error('El juego de glifos es demasiado grande (más de 6 MB).');
  return bytes;
}

/** Reads a set from its bytes (validated). */
export function parseGlyphSet(bytes: Uint8Array | string): GlyphSet {
  const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
  if (text.length > GLYPHSET_LIMITS.bytes) throw new Error('El juego de glifos es demasiado grande (más de 6 MB).');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('El juego de glifos está dañado.'); }
  return normalizeGlyphSet(raw);
}

/** A content id: 16 hex characters. */
export const isGlyphSetId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{16}$/.test(id);

/** The characters a set draws, in code point order. */
export const setChars = (set: GlyphSet): string[] => Object.keys(set.glyphs).sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);

/** The characters an ASCII piece uses from a set: its ramp, or (a text set) its letters as drawn. */
export function setRamp(set: GlyphSet): string {
  if (set.ramp) return set.ramp;
  return setChars(set).filter(c => c !== ' ').join('');
}
