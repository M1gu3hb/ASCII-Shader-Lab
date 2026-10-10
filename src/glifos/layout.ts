import type { GlyphSet } from '../glyphset/set';

/**
 * Text set in a glyph set, as a text face does it: proportional advances and the set's kerning (an ASCII
 * set has fixed cells: every advance is the cell, and no kerning). Characters the set does not draw take the
 * advance of a fallback font (`fallback`) and are reported, never hidden. Pure: no DOM.
 */

export interface PlacedChar { ch: string; x: number; line: number; adv: number; missing: boolean }

export interface TextLayout {
  chars: PlacedChar[];
  lines: number;
  width: number;
  /** Characters the set does not draw (each once). */
  missing: string[];
}

export function layoutText(set: GlyphSet, text: string, fs: number, o: { maxWidth?: number; fallback?: (ch: string) => number; tracking?: number } = {}): TextLayout {
  const k = fs / set.upm;
  const fixed = set.mode === 'ascii';
  const cell = fixed ? (Object.values(set.glyphs)[0]?.a ?? set.upm * 0.6) * k : 0;
  const fb = o.fallback ?? (() => fs * 0.6);
  const out: PlacedChar[] = [];
  const missing = new Set<string>();
  let x = 0, line = 0, width = 0;
  let prev = '';
  // words are wrapped whole when a line would run past maxWidth
  const words = text.split(/(\s+)/);
  const advOf = (ch: string) => {
    const g = set.glyphs[ch];
    if (ch === '\n') return 0;
    if (!g) { if (ch !== ' ') missing.add(ch); return fixed ? cell : ch === ' ' ? fs * 0.3 : fb(ch); }
    return fixed ? cell : g.a * k;
  };
  for (const w of words) {
    const cs = Array.from(w);
    const ww = cs.reduce((s, c) => s + advOf(c), 0);
    if (o.maxWidth && x > 0 && x + ww > o.maxWidth && !/^\s+$/.test(w)) { line++; x = 0; prev = ''; }
    for (const ch of cs) {
      if (ch === '\n') { line++; x = 0; prev = ''; continue; }
      if (!fixed && prev && set.kern) x += (set.kern[prev + ch] ?? 0) * k;
      const adv = advOf(ch);
      out.push({ ch, x, line, adv, missing: !set.glyphs[ch] && ch !== ' ' });
      x += adv + (o.tracking ?? 0);
      width = Math.max(width, x);
      prev = ch;
    }
  }
  return { chars: out, lines: line + 1, width, missing: [...missing] };
}
