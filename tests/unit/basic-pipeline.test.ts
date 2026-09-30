import { describe, expect, it } from 'vitest';
import { defaultRecipe, DEFAULT_LAYER, type Recipe } from '../../src/engine/recipe';
import { bakeGradient } from '../../src/engine/color';
import { layoutMessage } from '../../src/engine/text';
import { FieldBuffers, fieldLayers, heldTime, pulseAt, runField } from '../../src/engine/basic/field';
import { SelectBuffers, runSelect } from '../../src/engine/basic/select';
import { shadePass, type ComposeFrame } from '../../src/engine/basic/compose';
import { BASIC_PATTERNS } from '../../src/engine/basic/patterns';
import { FIGURES, PATTERN_IDS, figureFit } from '../../src/engine/catalog';

const COLS = 40, ROWS = 20, CW = 10, CH = 14, N = 10, EDGE = 10, BLOCK = 14;

/** Field + select for a recipe on a small grid, like BasicEngine.render without the DOM. */
function frame(r: Recipe, t: number, msg?: { text: string }) {
  const n = COLS * ROWS, W = COLS * CW, H = ROWS * CH;
  const F = new FieldBuffers(n), S = new SelectBuffers(n);
  const tq = heldTime(t, r.motion.hold);
  runField({
    W, H, cw: CW, ch: CH, cols: COLS, rows: ROWS, time: tq, loop: r.motion.loop, layers: fieldLayers(r, W, H),
    warp: r.motion.warp, warpScale: r.motion.warpScale, pulse: pulseAt(r.motion, tq, 0),
    src: 'pattern', mediaMix: 0, mediaBlend: 0, morph: 0, media: null, fit: 0, zoom: 1, panX: 0, panY: 0, mirror: false,
    text: null, imode: 0, ptrX: -1e4, ptrY: -1e4, ptrOn: 0, istr: 0, irad: 0.2, sim: null,
  }, F);
  const lay = msg ? layoutMessage(msg.text, COLS, ROWS, 0.5, 0.5, 'center', false, c => 20 + c.charCodeAt(0) % 7) : null;
  runSelect({
    cols: COLS, rows: ROWS, time: tq, r, fa: F.a, fr: F.r, fg: F.g, fb: F.b, isMedia: false,
    grad: bakeGradient(r.color.stops), n: N, edgeBase: EDGE, blockIdx: BLOCK, words: Uint16Array.of(30, 31, 32),
    msg: {
      on: !!lay, mode: 0, prog: 1e9, win: 6, shift: 0, data: lay?.data ?? new Uint8Array(4), width: lay?.width ?? 1,
      cursorX: -9, cursorY: -9, cursorOn: false, color: [1, 0, 0],
    },
    imode: 0, ptrCellX: -1e4, ptrCellY: -1e4, ptrOn: 0, istr: 0, iradCells: 1, aspect: CH / CW,
  }, S);
  return { F, S, lay };
}

describe('basic engine pipeline (no DOM)', () => {
  it('is deterministic and stays in range', () => {
    const r = defaultRecipe();
    r.motion.warp = 0.4;
    const a = frame(r, 2.5), b = frame(r, 2.5);
    expect(Array.from(a.S.lum)).toEqual(Array.from(b.S.lum));
    expect(Array.from(a.S.idx)).toEqual(Array.from(b.S.idx));
    expect(Math.max(...a.S.idx)).toBeLessThan(N);
    expect(new Set(a.S.lum).size).toBeGreaterThan(10);
  });

  it('loops seamlessly: the end of the loop crossfades into its start', () => {
    const r = defaultRecipe();
    r.motion.loop = 4;
    r.layers = [{ ...DEFAULT_LAYER, pattern: 'plasma' }, { ...DEFAULT_LAYER, pattern: 'anillos', blend: 'multiply', mix: 0.5 }];
    const end = frame(r, 3.9995).F.a, start = frame(r, 4.0005).F.a;
    let worst = 0;
    for (let i = 0; i < end.length; i++) worst = Math.max(worst, Math.abs(end[i] - start[i]));
    expect(worst).toBeLessThanOrEqual(3);
    // without a loop the same two instants are not the same picture
    r.motion.loop = 0;
    const a = frame(r, 3.9995).F.a, b = frame(r, 0.0005).F.a;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    expect(diff / a.length).toBeGreaterThan(10);
  });

  it('holds time in stop motion and lets live input drive the pulse', () => {
    expect(heldTime(1.26, 10)).toBeCloseTo(1.2);
    expect(heldTime(1.26, 0)).toBe(1.26);
    const m = { ...defaultRecipe().motion, pulse: 0.8, bpm: 120 };
    expect(pulseAt(m, 0.5, 0)).toBeCloseTo(0.8); // on the beat
    expect(pulseAt(m, 0.5, 0.3)).toBe(0.3);
    expect(pulseAt({ ...m, pulse: 0 }, 0.5, 0)).toBe(0);
  });

  it('falls back to nube with layer 0 parameters when every layer is off', () => {
    const r = defaultRecipe();
    r.layers = [{ ...DEFAULT_LAYER, pattern: 'plasma', on: false, scale: 2 }];
    const ls = fieldLayers(r, 400, 280);
    expect(ls).toHaveLength(1);
    expect(ls[0].pat).toBe(BASIC_PATTERNS.nube);
    expect(ls[0].scale).toBe(2);
  });

  it('sizes a centred figure to the width of a canvas taller than wide, and leaves fields and wide canvases alone', () => {
    const r = defaultRecipe();
    r.layers = [{ ...DEFAULT_LAYER, pattern: 'dona', scale: 1.5 }, { ...DEFAULT_LAYER, pattern: 'nube', scale: 1.5 }];
    // wide, square: nothing changes (desktop, tablets and phones on their side draw as before)
    for (const [W, H] of [[1440, 900], [844, 390], [600, 600]]) expect(fieldLayers(r, W, H).map(l => l.scale)).toEqual([1.5, 1.5]);
    // upright: the figure is sized to the width (its scale grows by H/W), the field keeps its scale
    const [fig, field] = fieldLayers(r, 390, 780);
    expect(fig.scale).toBeCloseTo(3, 10);
    expect(field.scale).toBe(1.5);
    // the same rule the WebGL engine binds (engine.ts runField)
    expect(figureFit('dona', 390, 780)).toBe(2);
    expect(figureFit('nube', 390, 780)).toBe(1);
    for (const id of ['esfera', 'medusa', 'forma', 'lemniscata', 'corazon_particulas']) expect(FIGURES.has(id), id).toBe(true);
    for (const id of ['nube', 'mandelbrot', 'julia', 'tunel', 'lluvia_ascendente', 'nieve_orbital']) expect(FIGURES.has(id), id).toBe(false);
    for (const id of FIGURES) expect(PATTERN_IDS.has(id), id).toBe(true);
  });

  it('inverts the tone', () => {
    const r = defaultRecipe();
    const a = frame(r, 3).S.lum;
    r.tone.invert = true;
    const b = frame(r, 3).S.lum;
    for (let i = 0; i < a.length; i += 17) expect(Math.abs(a[i] + b[i] - 255)).toBeLessThanOrEqual(1);
  });

  it('draws the message over the field, in its colour, flagged for the plate', () => {
    const { S, lay } = frame(defaultRecipe(), 3, { text: 'HOLA' });
    const cells = lay!.cells.filter(([c, r]) => c >= 0 && r >= 0).slice(0, 4);
    for (const [c, row] of cells) {
      const i = row * COLS + c;
      expect(S.flags[i]).toBe(1);
      expect(S.idx[i]).toBeGreaterThanOrEqual(20);
      expect([S.rgb[i * 3], S.rgb[i * 3 + 1], S.rgb[i * 3 + 2]]).toEqual([255, 0, 0]);
    }
    expect(S.flags.reduce((s, v) => s + v, 0)).toBe(4);
  });

  it('uses the words sequence in words mode and contour glyphs in lines mode', () => {
    const r = defaultRecipe();
    r.glyph.mode = 'words';
    const w = frame(r, 3).S.idx;
    expect(new Set(w)).toEqual(new Set([30, 31, 32]));
    r.glyph.mode = 'lines';
    r.layers = [{ ...DEFAULT_LAYER, pattern: 'anillos', a: 0.1 }];
    const l = frame(r, 3).S.idx;
    expect([...new Set(l)].every(v => v === 0 || (v >= EDGE && v < EDGE + 4))).toBe(true);
    expect([...l].some(v => v >= EDGE)).toBe(true);
  });
});

describe('basic engine compose', () => {
  function compose(transparent: boolean) {
    const sel = new SelectBuffers(2);
    sel.idx.set([1, 0]); sel.alpha.set([255, 255]); sel.lum.set([200, 200]);
    sel.rgb.set([255, 128, 0, 255, 128, 0]);
    // atlas of two 2×2 glyphs side by side: glyph 0 empty, glyph 1 covers its right column
    const cov = new Uint8Array(2 * 2 * 2);
    cov.set([0, 0, 0, 255], 0); cov.set([0, 0, 0, 255], 4);
    const f: ComposeFrame = {
      W: 4, H: 2, cw: 2, ch: 2, cols: 2, rows: 1, sel, atlas: { cov, w: 4, h: 2, cols: 2, n: 2 },
      bg: [0, 0, 1], accent: [1, 1, 1], fx: defaultRecipe().fx, msgBox: 0, transparent, reveal: 0, eraseReveal: false,
      simTr: null, mediaPx: null, bloom: null, realT: 0,
    };
    const px = new Uint32Array(8);
    shadePass(f, px);
    return Array.from(px, v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24]);
  }

  it('paints ink where the glyph covers the cell and background elsewhere', () => {
    const p = compose(false);
    expect(p[0]).toEqual([0, 0, 255, 255]);   // cell 0, glyph column 0: empty → bg
    expect(p[1]).toEqual([255, 128, 0, 255]); // cell 0, glyph column 1: covered → ink
    expect(p[2]).toEqual([0, 0, 255, 255]);   // cell 1 shows the empty glyph
  });

  it('keeps the background transparent for transparent exports', () => {
    const p = compose(true);
    expect(p[0][3]).toBe(0);
    expect(p[1]).toEqual([255, 128, 0, 255]);
  });
});
