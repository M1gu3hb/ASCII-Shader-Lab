import { describe, expect, it } from 'vitest';
import { defaultRecipe, DEFAULT_LAYER, type LetterAnim, type Recipe } from '../../src/engine/recipe';
import { bakeGradient } from '../../src/engine/color';
import { fold, loopTime, morphPeriod, ondularTimes, pieceTime, wordsRate } from '../../src/engine/loop';
import { animateMessage, letterPose, msgColorTime } from '../../src/engine/letters';
import { layoutMessage, messageCycle, messageState } from '../../src/engine/text';
import { FieldBuffers, fieldLayers, heldTime, pulseAt, runField } from '../../src/engine/basic/field';
import { SelectBuffers, runSelect } from '../../src/engine/basic/select';
import { runStage } from '../../src/engine/basic/xform';
import { xformStages } from '../../src/engine/xform';

/**
 * «Bucle perfecto»: with a loop of L seconds everything that moves repeats every L seconds (frame(t) =
 * frame(t + L)); without one nothing changes. The engines' shaders follow the same functions (loop.ts);
 * tests/e2e/loop.spec.ts checks both engines' pixels.
 */

const COLS = 40, ROWS = 20, CW = 10, CH = 14, N = 10;

/** Field + select of the basic engine for a recipe, timed as BasicEngine.render times them. */
function frame(r: Recipe, t: number) {
  const n = COLS * ROWS, W = COLS * CW, H = ROWS * CH, loop = r.motion.loop;
  const F = new FieldBuffers(n), S = new SelectBuffers(n);
  const tq = pieceTime(t, r.motion);
  runField({
    W, H, cw: CW, ch: CH, cols: COLS, rows: ROWS, time: tq, loop, layers: fieldLayers(r),
    warp: r.motion.warp, warpScale: r.motion.warpScale, pulse: pulseAt(r.motion, tq, 0),
    src: 'pattern', mediaMix: 0, mediaBlend: 0, morph: morphPeriod(r.text.morph, loop), media: null, fit: 0, zoom: 1, panX: 0, panY: 0, mirror: false,
    text: null, imode: 0, ptrX: -1e4, ptrY: -1e4, ptrOn: 0, istr: 0, irad: 0.2, sim: null,
  }, F);
  runSelect({
    cols: COLS, rows: ROWS, time: tq, loop, r, fa: F.a, fr: F.r, fg: F.g, fb: F.b, isMedia: false,
    grad: bakeGradient(r.color.stops), n: N, edgeBase: 10, blockIdx: 14, words: Uint16Array.of(30, 31, 32, 33, 34),
    msg: { on: false, mode: 0, prog: 0, win: 6, shift: 0, data: new Uint8Array(4), width: 1, cursorX: -9, cursorY: -9, cursorOn: false, color: null },
    imode: 0, ptrCellX: -1e4, ptrCellY: -1e4, ptrOn: 0, istr: 0, iradCells: 1, aspect: CH / CW,
  }, S);
  return [...S.idx, ...S.rgb, ...S.lum].join(',');
}

const piece = (f: (r: Recipe) => void) => {
  const r = defaultRecipe();
  r.layers = [{ ...DEFAULT_LAYER, pattern: 'plasma' }, { ...DEFAULT_LAYER, pattern: 'anillos', blend: 'multiply', mix: 0.5 }];
  r.color.stops = ['#10131a', '#6ee7ff', '#fff4d6'];
  f(r);
  return r;
};

describe('bucle perfecto', () => {
  it('the loop clock: t and t + L are the same instant (to the bit); without a loop, nothing changes', () => {
    expect(fold(1.7 + 12, 6)).toBe(fold(1.7, 6));
    expect(fold(6, 6)).toBe(0);
    for (const t of [0, 0.3, 2.9, 5.99, 17.25]) {
      expect(pieceTime(t, { hold: 0, loop: 0 })).toBe(t);
      expect(pieceTime(t, { hold: 7, loop: 0 })).toBe(heldTime(t, 7));
      expect(loopTime(t, 0, 2)).toBe(t);
      expect(ondularTimes(t, 0)).toEqual([t, t]);
      for (const hold of [0, 7, 12.5]) expect(pieceTime(t + 6, { hold, loop: 6 })).toBe(pieceTime(t, { hold, loop: 6 }));
    }
    // a whole number of cycles, the nearest to the effect's own speed (at least one)
    expect(loopTime(6, 6, 2.1)).toBe(0);
    expect(loopTime(5.999999, 6, 2.1) / 2.1).toBeCloseTo(3, 4);
    expect(loopTime(3, 6, 20)).toBeCloseTo(10);
    expect(wordsRate(0.4, 5, 0)).toBe(0.4 * 8);
    expect((wordsRate(0.4, 5, 6) * 6) % 5).toBe(0);
    expect(6 / morphPeriod(5, 6)).toBe(1);
    expect(morphPeriod(5, 0)).toBe(5);
  });

  it('the letters of the big text are where they were one loop earlier (every animation)', () => {
    const slot = { k: 3, n: 9, word: 1, words: 3, cx: 40, cy: -10 };
    for (const kind of ['ola', 'rebote', 'latido', 'revolver', 'palabras', 'explosion', 'brillo'] as const) {
      const a: LetterAnim = { kind, amount: 0.8, speed: 1.3 };
      for (const L of [6, 4.5]) for (const t of [0, 0.37, 2.2]) {
        expect(letterPose(a, t + L, slot, 100, 300, L), `${kind} L=${L} t=${t}`).toEqual(letterPose(a, t, slot, 100, 300, L));
      }
      // without a loop, the same pose as before loops existed
      expect(letterPose(a, 1.1, slot, 100, 300, 0)).toEqual(letterPose(a, 1.1, slot, 100, 300));
    }
  });

  it('the message: its letters, its colours and its typing come back each loop (every kind and mode)', () => {
    const lay = layoutMessage('hola mundo antiguo', 40, 12, 0.5, 0.5, 'center', false, c => 1 + (c.charCodeAt(0) % 9));
    for (const kind of ['ola', 'rebote', 'revolver', 'explosion'] as const) {
      const a: LetterAnim = { kind, amount: 1, speed: 1.2 };
      for (const t of [0, 0.8, 3.3]) expect(Array.from(animateMessage(lay, a, t + 6, 12, 10, 6)), `${kind} ${t}`).toEqual(Array.from(animateMessage(lay, a, t, 12, 10, 6)));
    }
    const m = { ...defaultRecipe().msg, on: true, anim: { kind: 'color' as const, amount: 1, speed: 0.8 } };
    // «Color por letra»: its phase (ord·0.07 − time·speed·0.35) moves by a whole number of cycles in a loop
    const d = (msgColorTime(m, 6 - 1e-9, 6) - msgColorTime(m, 0, 6)) * 0.8 * 0.35;
    expect(Math.abs(d - Math.round(d))).toBeLessThan(1e-6);
    expect(msgColorTime(m, 2.5, 0)).toBe(2.5);
    for (const mode of ['type', 'decode', 'marquee', 'static', 'words'] as const) {
      const msg = { ...defaultRecipe().msg, on: true, mode, speed: 9 };
      const at = (t: number) => messageState(msg, lay.count, loopTime(t, 6, messageCycle(msg, lay.count, lay.width)), lay.spans);
      for (const t of [0, 1.3, 4.1]) {
        const a = at(t), b = at(t + 6);
        expect([b.prog, b.cursor, b.cursorOn, Math.floor(b.shift) % lay.width], `${mode} ${t}`).toEqual([a.prog, a.cursor, a.cursorOn, Math.floor(a.shift) % lay.width]);
      }
    }
  });

  it('Ondular comes back each loop (both of its waves)', () => {
    const cols = 24, rows = 12, n = cols * rows;
    const inp = new Uint8Array(n * 3).map((_, i) => (i * 37) % 256);
    const [st] = xformStages([{ kind: 'ondular', on: true, amount: 0.7, p: 0.4 }], cols, rows, 1.4);
    const run = (t: number, L: number) => {
      const out = new Uint8Array(n * 3), [time, timeB] = ondularTimes(t, L);
      runStage(st, inp, out, { cols, rows, aspect: 1.4, time, timeB, pat: new Uint8Array(n), trail: new Uint8Array(n * 3) });
      return Array.from(out);
    };
    for (const t of [0, 1.1, 3.9]) expect(run(t + 6, 6)).toEqual(run(t, 6));
    expect(run(1.1, 0)).not.toEqual(run(7.1, 0));
  });

  it('the basic engine: patterns, warp, colour cycle, noise map, «Palabras», stop motion repeat each loop', () => {
    const cases: Record<string, (r: Recipe) => void> = {
      layers: () => undefined,
      warp: r => { r.motion.warp = 0.8; },
      cycle: r => { r.color.cycle = 0.05; },
      noise: r => { r.color.map = 'noise'; },
      words: r => { r.glyph.mode = 'words'; r.glyph.jitter = 0.4; },
      scramble: r => { r.glyph.mode = 'scramble'; r.glyph.jitter = 0.6; },
      hold: r => { r.motion.hold = 7; },
    };
    for (const [name, f] of Object.entries(cases)) {
      const r = piece(f);
      r.motion.loop = 6;
      for (const t of [0, 1.7, 4.4]) expect(frame(r, t + 6) === frame(r, t), `${name} t=${t}`).toBe(true);
      // and a loop of another length
      r.motion.loop = 4.5;
      expect(frame(r, 4.5) === frame(r, 0), `${name} L=4.5`).toBe(true);
    }
  });
});
