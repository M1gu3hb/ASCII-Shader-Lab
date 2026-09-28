import { beforeAll, describe, expect, it } from 'vitest';
import { buildRuntimes } from '../../scripts/runtime-plugin';
import * as core from '../../src/engine/basic/core';
import { BASIC_PATTERNS, evalPattern } from '../../src/engine/basic/patterns';

/**
 * Exported code without WebGL 2 draws with the basic engine and carries only the CPU patterns its piece
 * uses, as separate scripts cut out of src/engine/basic/patterns.ts at build time. A pattern added to the
 * table without a script, or a script that computes something else, would silently draw the wrong piece.
 */
let built: Awaited<ReturnType<typeof buildRuntimes>>;
type Registered = { f: (x: number, y: number, t: number, a: number, b: number) => number; prep?: (t: number, a: number, b: number) => void; px: (v: number) => void };

function load(id: string): Registered {
  const got: Record<string, Registered> = {};
  const window = { Monotrama: { __basic: { core: { ...core }, add: (k: string, p: Registered) => { got[k] = p; }, has: (k: string) => k in got } } };
  // the test runs the script as a page would (the exported code itself never evaluates strings)
  new Function('window', built.patterns[id])(window);
  return got[id];
}

beforeAll(async () => { built = await buildRuntimes(); }, 60_000);

describe('runtime with the basic engine', () => {
  it('has one script per CPU pattern', () => {
    expect(Object.keys(built.patterns).sort()).toEqual(Object.keys(BASIC_PATTERNS).sort());
  });

  it.each(Object.keys(BASIC_PATTERNS))('%s: the exported script computes what the studio computes', id => {
    const p = load(id);
    expect(p, id).toBeTruthy();
    for (const px of [0.019, 0.04]) {
      for (const [t, a, b] of [[0, 0.5, 0.5], [3.7, 0.2, 0.85], [41.3, 1, 0]]) {
        p.px(px);
        p.prep?.(t, a, b);
        for (const [x, y] of [[-0.61, -0.33], [0, 0], [0.21, 0.26], [0.77, -0.05], [0.004, 0.41]]) {
          expect(p.f(x, y, t, a, b), `${id}(${x}, ${y}, t=${t}, px=${px})`).toBe(evalPattern(id, x, y, t, a, b, px));
        }
      }
    }
  });

  it('a pattern script registers once and does nothing on a page without the basic engine', () => {
    const calls: string[] = [];
    const window = { Monotrama: { __basic: { core: { ...core }, add: (k: string) => { calls.push(k); }, has: (k: string) => calls.includes(k) } } };
    new Function('window', built.patterns.marmol)(window);
    new Function('window', built.patterns.marmol)(window);
    expect(calls).toEqual(['marmol']);
    expect(() => new Function('window', built.patterns.marmol)({})).not.toThrow();
    expect(() => new Function('window', built.patterns.marmol)({ Monotrama: { version: 'x' } })).not.toThrow();
  });

  it('stays CSP-friendly and light', () => {
    const all = [built.runtime, built.basic, ...Object.values(built.patterns)];
    for (const code of all) expect(/\beval\(|new Function\(|Function\(\s*["'`]/.test(code)).toBe(false);
    // the basic engine adds tens of KB, not hundreds; a single pattern a few KB
    expect(built.basic.length - built.runtime.length).toBeLessThan(80_000);
    expect(Math.max(...Object.values(built.patterns).map(s => s.length))).toBeLessThan(6_000);
  });
});
