import { describe, expect, it } from 'vitest';
import { COMPOSE_FS } from '../../src/engine/glsl/programs';

/**
 * The compose pass finds a glyph in the atlas (glyph index → column and row of the atlas) in whole numbers,
 * like the basic engine (g % cols, g / cols). In floats, idx / cols can land just under a whole number on a
 * GPU that divides through a reciprocal (GLSL ES allows 2.5 ULP): with 41, 47, 55 or 61 glyphs per atlas row
 * (big cells: fewer columns fit the texture) the first glyph of each later row was read past the end of its
 * row, where there is no ink. SwiftShader divides exactly, so no render here can show it: this contract keeps
 * the lookup in integers.
 */
const code = COMPOSE_FS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** The body of a GLSL function (from its signature to the closing brace at the start of a line). */
function body(src: string, signature: RegExp): string {
  const m = signature.exec(src);
  if (!m) return '';
  const start = m.index + m[0].length;
  const end = src.indexOf('\n}', start);
  return end < 0 ? '' : src.slice(start, end);
}

describe('compose: the glyph lookup in the atlas', () => {
  const fn = body(code, /float\s+glyphCov\s*\(\s*float\s+idx\s*,\s*ivec2\s+ic\s*\)\s*\{/);

  it('exists and reads the atlas with texelFetch', () => {
    expect(fn).not.toBe('');
    expect(fn).toMatch(/texelFetch\s*\(\s*uAtlas\s*,/);
  });

  it('turns the index into an integer and takes column and row with integer % and /', () => {
    const idxInt = /int\s+(\w+)\s*=\s*int\s*\(\s*idx\b/.exec(fn);
    expect(idxInt, 'an int made from idx').not.toBeNull();
    const i = idxInt![1];
    const colsInt = /(?:int\s+|,\s*)(\w+)\s*=\s*(?:max\s*\(\s*)?int\s*\(\s*uAtlasCols\b/.exec(fn);
    expect(colsInt, 'an int made from uAtlasCols').not.toBeNull();
    const n = colsInt![1];
    expect(fn).toMatch(new RegExp(`\\b${i}\\s*%\\s*${n}\\b`));
    expect(fn).toMatch(new RegExp(`\\b${i}\\s*/\\s*${n}\\b`));
  });

  it('does no float division, mod or floor on the index', () => {
    expect(fn).not.toMatch(/\bmod\s*\(/);
    expect(fn).not.toMatch(/\bfloor\s*\(/);
    expect(fn).not.toMatch(/\bidx\s*\//);
    expect(fn).not.toMatch(/\/\s*uAtlasCols\b/);
  });

  it('is the only place that reads the atlas or its columns', () => {
    const rest = code.replace(fn, '');
    expect(rest.match(/texelFetch\s*\(\s*uAtlas\b/g) ?? []).toHaveLength(0);
    // uAtlasCols: only its declaration outside the lookup
    expect(rest.match(/\buAtlasCols\b/g) ?? []).toHaveLength(1);
  });
});
