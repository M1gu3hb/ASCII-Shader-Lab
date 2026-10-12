import { describe, expect, it } from 'vitest';
import { FieldBuffers, runField, type FieldFrame, type FieldLayer } from '../../src/engine/basic/field';
import type { BasicPattern } from '../../src/engine/basic/patterns';
import { FAM, famSrc } from '../../src/families/context';
import { PARAM_SLOTS, VERSION_SLOT, famColours, famReads, packParams } from '../../src/families/params';
import { sampleRaster, sampleRasterC } from '../../src/families/sample';
import { mediaSource, textSource } from '../../src/families/source';
import type { FamilyMeta, ParamSpec } from '../../src/families/types';
import { buildFieldShader } from '../../src/engine/glsl/programs';

/**
 * The engine contracts the PR #10 close-out adds for the families (types.ts): sixteen typed parameters and the
 * layer's algorithm version, colour rasters, and what a family reads of the piece (its source, the layers below).
 */

const num = (key: string, def: number): ParamSpec => ({ type: 'number', key, label: key, min: -100, max: 100, def });
const meta = (n: number, extra: Partial<FamilyMeta> = {}): FamilyMeta => ({
  id: 'prueba', name: 'Prueba', group: 'forma', kind: 'analytic', version: 3,
  params: Array.from({ length: n }, (_, i) => num('k' + i, i + 1)),
  presets: [], caps: { loop: true, time: 'continuo', basic: 'full', checkpoint: false }, budget: {}, ...extra,
});

describe('parámetros y versión de las analíticas', () => {
  it('se empaquetan dieciséis parámetros y, aparte, la versión con la que se hizo la capa', () => {
    const m = meta(16);
    const p = Object.fromEntries(m.params.map((s, i) => [s.key, (i + 1) * 1.5]));
    const k = packParams(m, p, undefined, 2);
    expect(k.length).toBe(PARAM_SLOTS + 1);
    for (let i = 0; i < 16; i++) expect(k[i]).toBeCloseTo((i + 1) * 1.5, 5);
    expect(k[VERSION_SLOT]).toBe(2);
    // with no version, the family's current one
    expect(packParams(m, p)[VERSION_SLOT]).toBe(3);
  });

  it('un arreglo de ocho (código anterior) sigue recibiendo sólo los ocho primeros, sin desbordar', () => {
    const m = meta(12);
    const k = packParams(m, Object.fromEntries(m.params.map((s, i) => [s.key, i])), new Float32Array(8));
    expect(Array.from(k)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('el shader de campo declara los bloques nuevos y los pasa a cada capa de familia', async () => {
    const { registerFamilies, FAMILIES } = await import('../../src/families/registry');
    expect(FAMILIES.length).toBeGreaterThan(0);
    void registerFamilies;
    const src = buildFieldShader(['cromado', 'reaccion_difusion'], 'media', false, {} as never);
    for (const u of ['uLF2[4]', 'uLF3[4]', 'uniform vec4 uLV[4]', 'vec4 famSrc(vec2 q)', 'float famSrcKind()']) expect(src).toContain(u);
    expect(src).toContain('K2 = uLF2[0]; K3 = uLF3[0]; FV = uLV[0].x; LA = A; VB = 0.;');
    expect(src).toContain('K2 = uLF2[1]; K3 = uLF3[1]; FV = uLV[1].x; LA = A; VB = v;');
  });
});

describe('qué lee una familia de la pieza', () => {
  it('famReads / famColours respetan la versión desde la que lee o da color', () => {
    const m = meta(2, { reads: ['source'], readsSince: 2, color: true, colorSince: 3 });
    expect(famReads(m, 1, 'source')).toBe(false);
    expect(famReads(m, 2, 'source')).toBe(true);
    expect(famReads(m, 2, 'below')).toBe(false);
    expect(famColours(m, 2)).toBe(false);
    expect(famColours(m, 3)).toBe(true);
  });

  it('famSrc deshace la transformación de la capa: el punto de la capa vuelve al punto del lienzo', () => {
    const seen: number[] = [];
    FAM.src = (px, py, out) => { seen.push(px, py); out[0] = px; out[1] = py; out[2] = 0; out[3] = 1; };
    const a = 0.7, sc = 1.8, ox = 0.2, oy = -0.1;
    FAM.c = Math.cos(a); FAM.s = Math.sin(a); FAM.sc = sc; FAM.ox = ox; FAM.oy = oy;
    // a canvas point p goes to the layer as q = rot(p − o)·sc (field pass); famSrc(q) must give p back
    const px = 0.33, py = -0.21, dx = px - ox, dy = py - oy;
    const qx = (Math.cos(a) * dx + Math.sin(a) * dy) * sc, qy = (-Math.sin(a) * dx + Math.cos(a) * dy) * sc;
    const out = new Float64Array(4);
    famSrc(qx, qy, out);
    expect(out[0]).toBeCloseTo(px, 9);
    expect(out[1]).toBeCloseTo(py, 9);
    FAM.src = null;
    famSrc(qx, qy, out);
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });

  const COLS = 24, ROWS = 12, CW = 10, CH = 20, W = COLS * CW, H = ROWS * CH;
  const layer = (pat: BasicPattern, o: Partial<FieldLayer> = {}): FieldLayer => ({ pat, scale: 1, rot: 0, x: 0, y: 0, a: 0.5, b: 0.5, mix: 1, speed: 1, phase: 0, invert: false, blend: 0, ...o });
  const frame = (layers: FieldLayer[], o: Partial<FieldFrame> = {}): FieldFrame => ({
    W, H, cw: CW, ch: CH, cols: COLS, rows: ROWS, time: 1, loop: 0, layers, warp: 0, warpScale: 1, pulse: 0,
    src: 'pattern', mediaMix: 0, mediaBlend: 0, morph: 0, media: null, fit: 0, zoom: 1, panX: 0, panY: 0, mirror: false,
    text: null, imode: 0, ptrX: -1e4, ptrY: -1e4, ptrOn: 0, istr: 0, irad: 0.2, sim: null, ...o,
  });

  it('una capa que lee las de abajo ve, en cada celda, la pila hasta ella', () => {
    const below = { f: (x: number) => (x > 0 ? 0.8 : 0.2) } satisfies BasicPattern;
    // the reading layer draws exactly what is below it
    const reader: BasicPattern = { f: () => FAM.below, reads: true };
    const B = new FieldBuffers(COLS * ROWS), A = new FieldBuffers(COLS * ROWS);
    runField(frame([layer(below)]), A);
    runField(frame([layer(below), layer(reader)]), B);
    expect(Array.from(B.a)).toEqual(Array.from(A.a));
  });

  it('con una foto, la familia lee sus colores en el punto de la capa; con patrones, nada', () => {
    // a 2×1 picture: red on the left, blue on the right, covering the canvas (stretch)
    const media = { data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), w: 2, h: 1, natW: 2, natH: 1 };
    const got: number[][] = [];
    const out = new Float64Array(4);
    const reader: BasicPattern = { f: (x, y) => { famSrc(x, y, out); got.push([x, out[0], out[2]]); return out[3]; }, reads: true };
    const B = new FieldBuffers(COLS * ROWS);
    runField(frame([layer(reader)], { src: 'media', media, fit: 2, mediaMix: 1 }), B);
    const left = got.filter(g => g[0] < -0.4), right = got.filter(g => g[0] > 0.4);
    expect(left.every(g => g[1] > 0.9 && g[2] < 0.1)).toBe(true);
    expect(right.every(g => g[1] < 0.1 && g[2] > 0.9)).toBe(true);
    got.length = 0;
    runField(frame([layer(reader)]), B);
    expect(got.every(g => g[1] === 0 && g[2] === 0)).toBe(true);
  });

  it('una familia de color que lee la foto le da su color a las celdas, según la cantidad de patrón', () => {
    const media = { data: new Uint8ClampedArray([0, 255, 0, 255]), w: 1, h: 1, natW: 1, natH: 1 };
    const tint: BasicPattern = { f: () => 0.5, col: (_x, _y, _t, o) => { o[0] = 1; o[1] = 0; o[2] = 0; }, reads: true, srcColour: true };
    const plain: BasicPattern = { f: () => 0.5, col: (_x, _y, _t, o) => { o[0] = 1; o[1] = 0; o[2] = 0; } };
    const B = new FieldBuffers(COLS * ROWS);
    runField(frame([layer(tint)], { src: 'media', media, fit: 2, mediaMix: 1 }), B);
    expect([B.r[0], B.g[0], B.b[0]]).toEqual([255, 0, 0]);
    runField(frame([layer(tint)], { src: 'media', media, fit: 2, mediaMix: 0.5 }), B);
    expect([B.r[0], B.g[0]]).toEqual([128, 128]);
    // a colour family that does not read the picture leaves its colours as they were (older pieces)
    runField(frame([layer(plain)], { src: 'media', media, fit: 2, mediaMix: 1 }), B);
    expect([B.r[0], B.g[0], B.b[0]]).toEqual([0, 255, 0]);
  });
});

describe('rasters de color', () => {
  it('sampleRasterC lee el color de la celda donde sampleRaster lee su luminancia', () => {
    const R = { data: Uint8Array.of(0, 255), rgb: Uint8Array.of(255, 0, 0, 0, 0, 255), w: 2, h: 1, version: 1, wrap: false, colour: true };
    const out = new Float64Array(3);
    expect(sampleRasterC(R, -0.5, 0, out)).toBeCloseTo(sampleRaster(R, -0.5, 0), 9);
    expect(Array.from(out)).toEqual([1, 0, 0]);
    sampleRasterC(R, 0.5, 0, out);
    expect(Array.from(out)).toEqual([0, 0, 1]);
    // a run that gives no colour reads grey (its luminance)
    const G = { ...R, rgb: null };
    const l = sampleRasterC(G, 0, 0, out);
    expect(out[0]).toBe(l); expect(out[2]).toBe(l);
  });
});

describe('la fuente para las familias raster', () => {
  it('mediaSource aplica encaje, zoom, desplazamiento y espejo como el pase de campo', () => {
    const m = { data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), w: 2, h: 1, natW: 2, natH: 1 };
    const media = { fit: 'stretch', zoom: 1, panX: 0, panY: 0, mirror: false } as never;
    const s = mediaSource(m, 200, 100, media, 1), out = new Float64Array(4);
    s.at(-0.9, 0, out); expect(out[0]).toBeGreaterThan(0.9);
    s.at(0.9, 0, out); expect(out[2]).toBeGreaterThan(0.9);
    const mir = mediaSource(m, 200, 100, { ...(media as object), mirror: true } as never, 1);
    mir.at(-0.9, 0, out); expect(out[2]).toBeGreaterThan(0.9);
    // outside the picture: nothing
    s.at(5, 0, out); expect(out[3]).toBe(0);
  });

  it('textSource da la máscara de las letras en el punto del lienzo', () => {
    const mask = new Uint8Array(4 * 2); mask[1] = 255; // top row, second pixel
    const s = textSource(mask, 4, 2, 400, 200, 'Ñandú', 7);
    const out = new Float64Array(4);
    // the top-row pixel 1 covers u ∈ [0.25, 0.5], v ∈ [0, 0.5]: canvas x ∈ [−0.5, 0], y ∈ [0, 0.5]
    s.at(-0.25 * 2 + 0.0, 0.25, out);
    expect(out[3]).toBeGreaterThan(0.2);
    expect(s.text).toBe('Ñandú');
    expect(s.kind).toBe(2);
  });
});
