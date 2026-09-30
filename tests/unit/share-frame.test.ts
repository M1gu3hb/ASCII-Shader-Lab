import { describe, expect, it } from 'vitest';
import { defaultRecipe, normalizeRecipe, type Recipe } from '../../src/engine';
import { generate } from '../../src/random';
import {
  DEFAULT_FRAME_CSS, defaultFrame, describeFrame, encodeFrame, fitFrame, frameFor, frameRecipe, gridOf, parseFrame, reduceFrame, type Frame,
} from '../../src/shared/frame';
import {
  decodeRecipe, encodeRecipe, pieceHash, provideShareView, publicRecipe, readPieceHash, shareUrl, studioUrl, viewerUrl,
} from '../../src/shared/share';

const ORIGIN = 'https://glyphos-ascii.vercel.app';

/** Where each cell of a frame reads the pattern (engine.ts field shader: p = ((i + ½)·cw − W/2) / H). */
const cellX = (f: Frame, i: number) => ((i + 0.5) * f.cw - f.w / 2) / f.h;
const cellY = (f: Frame, j: number) => (f.h / 2 - (j + 0.5) * f.ch) / f.h;

/** The engines' resize() arithmetic, written out once more (engine.ts and basic/engine.ts). */
function engineFrame(cssW: number, cssH: number, pr: number, cell: number, aspect: number) {
  const W = Math.max(1, Math.round(cssW * pr)), H = Math.max(1, Math.round(cssH * pr));
  const cw = Math.max(2, Math.round(cell * pr)), ch = Math.max(2, Math.round(cell * aspect * pr));
  return { W, H, cw, ch, cols: Math.max(1, Math.ceil(W / cw)), rows: Math.max(1, Math.ceil(H / ch)) };
}

// screens people share from: CSS size of the stage and the pixel ratio it draws at
const SCREENS: Array<[number, number, number]> = [
  [1096, 848, 1], [1096, 848, 2], [704, 716, 1], [704, 716, 1.25], [820, 1072, 2], [390, 680, 2], [390, 680, 1],
  [360, 576, 2], [844, 282, 2], [1920, 1028, 1], [2560, 1388, 2], [1366, 808, 1.25], [412, 700, 2],
];
const CELLS: Array<[number, number]> = [[10, 1.4], [11, 1.364], [9, 1.4], [7.5, 1.6], [12.3, 1.15], [3, 0.5], [22, 2.1], [96, 3], [14, 1]];

describe('the frame a link carries', () => {
  it('is what the engines compute for that stage', () => {
    for (const [w, h, pr] of SCREENS) {
      for (const [cell, aspect] of CELLS) {
        const f = frameFor(w, h, pr, cell, aspect);
        const e = engineFrame(w, h, pr, cell, aspect);
        expect({ w: f.w, h: f.h, cw: f.cw, ch: f.ch }).toEqual({ w: e.W, h: e.H, cw: e.cw, ch: e.ch });
        expect(gridOf(f)).toEqual({ cols: e.cols, rows: e.rows });
      }
    }
  });

  it('drawn at pixel ratio 1 with the frame recipe, gives the very same grid on any screen', () => {
    for (const [w, h, pr] of SCREENS) {
      for (const [cell, aspect] of CELLS) {
        const f = frameFor(w, h, pr, cell, aspect);
        const r = frameRecipe({ ...defaultRecipe(), glyph: { ...defaultRecipe().glyph, cell, aspect } }, f);
        // the viewer lays its canvas out at f.w × f.h CSS px and draws at pixel ratio 1
        const v = engineFrame(f.w, f.h, 1, r.glyph.cell, r.glyph.aspect);
        expect({ w: v.W, h: v.H, cw: v.cw, ch: v.ch }).toEqual({ w: f.w, h: f.h, cw: f.cw, ch: f.ch });
        expect({ cols: v.cols, rows: v.rows }).toEqual(gridOf(f));
      }
    }
  });

  it('a receiver drawing at its own size would have reflowed the piece (why the frame travels)', () => {
    const cell = 10, aspect = 1.4;
    const sender = frameFor(1096, 848, 1, cell, aspect);
    const phone = frameFor(390, 680, 2, cell, aspect);
    expect(gridOf(sender)).not.toEqual(gridOf(phone));
    // the phone's middle cell reads another point of the pattern than the sender's does at the same place
    expect(cellX(phone, 0)).not.toBeCloseTo(cellX(sender, 0), 3);
  });

  it('only frameRecipe changes the cell: the recipe that travels and opens in the studio stays the same', () => {
    const r = defaultRecipe();
    const f = frameFor(1096, 848, 2, 9, 1.4);
    const fr = frameRecipe(r, f);
    expect(fr.glyph.cell).toBe(f.cw);
    expect(fr.glyph.aspect).toBeCloseTo(f.ch / f.cw, 12);
    expect(r.glyph.cell).toBe(10);
    expect({ ...fr, glyph: r.glyph }).toEqual(r);
  });

  it('keeps huge canvases within what the engines draw', () => {
    const f = frameFor(5120, 2880, 2, 10, 1.4);
    expect(Math.max(f.w, f.h)).toBeLessThanOrEqual(8192);
    expect(f.w / f.h).toBeCloseTo(5120 / 2880, 3);
  });
});

describe('fewer pixels, same composition', () => {
  it('divides canvas and cell by a whole number only when every cell keeps its place in the pattern', () => {
    const f = frameFor(1440, 812, 2, 10, 1.4); // a retina desktop: 2880 × 1624, cells 20 × 28
    const { frame: d, divisor } = reduceFrame(f, 390 * 3);
    expect(divisor).toBe(2);
    expect(gridOf(d)).toEqual(gridOf(f));
    const g = gridOf(f);
    for (const i of [0, 1, Math.floor(g.cols / 2), g.cols - 1]) expect(cellX(d, i)).toBe(cellX(f, i));
    for (const j of [0, 1, Math.floor(g.rows / 2), g.rows - 1]) expect(cellY(d, j)).toBe(cellY(f, j));
  });

  it('never below what the screen shows, never an inexact divisor, never a small frame', () => {
    const f = frameFor(1440, 812, 2, 10, 1.4);
    expect(reduceFrame(f, 2000).divisor).toBe(1); // shown 2000 px wide: halving would blur it
    expect(reduceFrame(frameFor(1096, 848, 1, 10, 1.4), 300).divisor).toBe(1); // under the pixel budget
    const odd = frameFor(1441, 813, 2, 9, 1.4); // ch = round(25.2) = 25: not divisible
    expect(odd.ch % 2).toBe(1);
    expect(reduceFrame(odd, 300).divisor).toBe(1);
  });
});

describe('frame text in a link', () => {
  it('round-trips and refuses anything malformed or out of range', () => {
    const f = frameFor(1096, 848, 1, 11, 15 / 11);
    expect(encodeFrame(f)).toBe('1096x848-11x15');
    expect(parseFrame(encodeFrame(f))).toEqual(f);
    for (const bad of ['', null, undefined, '1096x848', '1096x848-1x15', '10x848-11x15', '99999x848-11x15', '1096x848-11x15x', ' 1e3x848-11x15', '-1096x848-11x15', '1096x848-2000x15']) {
      expect(parseFrame(bad as string), String(bad)).toBeNull();
    }
  });

  it('describes its shape in words people use', () => {
    expect(describeFrame({ w: 1920, h: 1080 })).toBe('horizontal, 16:9');
    expect(describeFrame({ w: 1080, h: 1920 })).toBe('vertical, 9:16');
    expect(describeFrame({ w: 390, h: 680 })).toBe('vertical');
    expect(describeFrame({ w: 700, h: 704 })).toBe('cuadrado, 1:1');
    expect(describeFrame({ w: 1096, h: 848 })).toBe('horizontal');
  });

  it('fits whole, centred, uniformly scaled (letterbox), on every screen', () => {
    for (const f of [{ w: 1096, h: 848 }, { w: 390, h: 680 }, { w: 2880, h: 1624 }]) {
      for (const [vw, vh] of [[1440, 900], [1024, 768], [820, 1180], [390, 844], [844, 390], [360, 740]]) {
        const fit = fitFrame(f, vw, vh);
        expect(fit.width).toBeLessThanOrEqual(vw + 1e-6);
        expect(fit.height).toBeLessThanOrEqual(vh + 1e-6);
        expect(Math.min(vw - fit.width, vh - fit.height)).toBeLessThan(1e-6); // touches two sides
        expect(fit.width / fit.height).toBeCloseTo(f.w / f.h, 9);
        expect(fit.x).toBeCloseTo((vw - fit.width) / 2, 9);
        expect(fit.y).toBeCloseTo((vh - fit.height) / 2, 9);
      }
    }
  });

  it('a link without a frame gets the same default frame everywhere', () => {
    const r = defaultRecipe();
    expect(defaultFrame(r)).toEqual(frameFor(DEFAULT_FRAME_CSS.w, DEFAULT_FRAME_CSS.h, 1, r.glyph.cell, r.glyph.aspect));
  });
});

/* ------------------------------------------------------------------ */

function textPiece(): Recipe {
  const r = defaultRecipe();
  r.source = 'text';
  r.text.content = 'GLYPHOS';
  r.msg.on = true;
  r.msg.text = 'Hola, esto se escribe solo';
  r.meta.name = 'Palabra';
  return normalizeRecipe(r);
}

describe('links to a piece', () => {
  it('carry the frame, the moment and the pause before the recipe, and read back exactly', async () => {
    const r = textPiece();
    const code = await encodeRecipe(r);
    const frame = frameFor(1096, 848, 1, 11, 15 / 11);
    const hash = pieceHash(code, { frame, t: 12.34567, paused: true });
    expect(hash).toBe(`f=1096x848-11x15&t=12.346&p=1&r=${code}`);
    const back = readPieceHash('#' + hash);
    expect(back).toEqual({ code, view: { frame, t: 12.346, paused: true } });
    expect(await decodeRecipe(back.code!)).toEqual(await decodeRecipe(code));
  });

  it('old links (#r= alone) still read, with no frame; seeds and spaces carry no recipe', async () => {
    const code = await encodeRecipe(textPiece());
    expect(readPieceHash('#r=' + code)).toEqual({ code, view: { frame: null } });
    expect(readPieceHash('#seed=faro-lunar-417&space=arte&gen=2').code).toBeNull();
    expect(readPieceHash('').code).toBeNull();
    // a broken frame or time never breaks the piece
    expect(readPieceHash(`#f=nada&t=-4&p=2&r=${code}`)).toEqual({ code, view: { frame: null } });
    expect(readPieceHash(`#t=Infinity&r=${code}`).view.t).toBeUndefined();
  });

  it('new links open the viewer; «Abrir en el estudio» opens the studio with the same recipe and frame', async () => {
    const r = textPiece();
    const code = await encodeRecipe(r);
    const frame = frameFor(390, 680, 2, 10, 1.4);
    expect(await viewerUrl(r, { frame, t: 3 }, ORIGIN)).toBe(`${ORIGIN}/ver/#f=${encodeFrame(frame)}&t=3&r=${code}`);
    expect(await studioUrl(r, { frame, t: 3, paused: true }, ORIGIN)).toBe(`${ORIGIN}/studio/#f=${encodeFrame(frame)}&r=${code}`);
    expect(await studioUrl(r, null, ORIGIN)).toBe(`${ORIGIN}/studio/#r=${code}`);
  });

  it('shareUrl takes the frame from the page that makes it (the studio registers its stage)', async () => {
    const r = textPiece();
    const frame = frameFor(704, 716, 1, 10, 1.4);
    try {
      provideShareView(() => ({ frame, t: 1.5 }));
      expect(await shareUrl(r, ORIGIN)).toBe(await viewerUrl(r, { frame, t: 1.5 }, ORIGIN));
      provideShareView(() => { throw new Error('no stage'); });
      expect(await shareUrl(r, ORIGIN)).toBe(await viewerUrl(r, null, ORIGIN));
    } finally { provideShareView(null); }
    expect(await shareUrl(r, ORIGIN)).toMatch(/^https:\/\/glyphos-ascii\.vercel\.app\/ver\/#r=z/);
  });

  it('never carry a local image or video, its name or its id', async () => {
    const r = defaultRecipe();
    r.source = 'image';
    r.media.ref = { id: '0123456789abcdef', kind: 'image', name: 'foto de mamá.jpg', type: 'image/jpeg', size: 4, w: 1600, h: 1200 };
    const url = await viewerUrl(r, { frame: frameFor(390, 680, 2, 10, 1.4) }, ORIGIN);
    const back = await decodeRecipe(readPieceHash(new URL(url).hash).code!);
    expect(back?.media.ref).toEqual(publicRecipe(r).media.ref);
    expect(JSON.stringify(back)).not.toContain('mam');
    expect(JSON.stringify(back)).not.toContain('0123456789abcdef');
  });

  it('stay well within what browsers, messengers and mail clients take (measured on real draws)', async () => {
    const lengths: number[] = [];
    const frame = frameFor(2560, 1388, 2, 96, 3); // the longest frame text there is
    for (const space of ['fondos', 'arte', 'media', 'tipo', 'terminal'] as const) {
      for (const gen of [1, 2, 3, 4]) {
        for (let i = 0; i < 12; i++) {
          const r = generate({ seed: `medida-${space}-${i}`, space, gen, base: defaultRecipe() });
          lengths.push((await viewerUrl(r, { frame, t: 123456.789, paused: true }, ORIGIN)).length);
        }
      }
    }
    lengths.sort((a, b) => a - b);
    // under 2 000 characters (the safe limit for links in mail clients, old browsers and some messengers)
    expect(lengths[lengths.length - 1]).toBeLessThan(2000);
    expect(lengths[Math.floor(lengths.length / 2)]).toBeLessThan(1400);
  });
});
