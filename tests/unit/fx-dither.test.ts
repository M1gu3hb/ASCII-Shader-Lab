import { describe, expect, it } from 'vitest';
import { defaultFinish, DITHER_ALGOS, runFinishes, PALETTES, type ImageDataLike } from '../../src/fx';
import { bayerMatrix, clusterMatrix, gilbertPath, KERNELS } from '../../src/fx/dither';
import { blueNoise, BLUE_N } from '../../src/fx/bluenoise';
import { colorDist, medianCut, Nearest, resolvePalette } from '../../src/fx/palettes';
import { parseHex } from '../../src/fx/core';
import type { Finish } from '../../src/project/types';
import { clone, cutout, img, meanLuma, photo } from './fx-fixtures';

const ctx = { t: 0, seed: 'd', scale: 1, quality: 'final' as const };
const dither = (params: Finish['params']): Finish => {
  const f = defaultFinish('dither');
  return { ...f, params: { ...f.params, pixel: 1, contrast: 1, bright: 0, ink: '#000000', paper: '#ffffff', ...params } };
};
const run = (i: ImageDataLike, f: Finish) => runFinishes(clone(i), [f], ctx);
const colorsOf = (i: ImageDataLike) => {
  const s = new Set<string>();
  for (let j = 0; j < i.data.length; j += 4) if (i.data[j + 3] > 0) s.add(`${i.data[j]},${i.data[j + 1]},${i.data[j + 2]}`);
  return s;
};
const hexKey = (h: string) => parseHex(h)!.join(',');
/** A horizontal grey ramp. */
const ramp = (w: number, h: number) => img(w, h, x => { const v = Math.round((x / (w - 1)) * 255); return [v, v, v, 255]; });

describe('dithering', () => {
  const P = photo(64, 48);

  it('outputs only ink and paper in 1 bit, for every method', () => {
    for (const a of DITHER_ALGOS) {
      const out = run(P, dither({ algo: a.id, color: 'bn', ink: '#102030', paper: '#f0e0d0' }));
      const cs = colorsOf(out);
      for (const c of cs) expect([hexKey('#102030'), hexKey('#f0e0d0')], a.id).toContain(c);
      if (a.id !== 'threshold') expect(cs.size, a.id).toBe(2);
    }
  });

  it('outputs only palette colours in palette mode, for every method and several palettes', () => {
    for (const pal of ['gameboy', 'pico8', 'cga', 'riso-azul-rosa']) {
      const allowed = new Set(PALETTES.find(p => p.id === pal)!.colors.map(hexKey));
      for (const a of DITHER_ALGOS) {
        const out = run(P, dither({ algo: a.id, color: 'paleta', palette: pal }));
        for (const c of colorsOf(out)) expect(allowed.has(c), `${pal}/${a.id}: ${c}`).toBe(true);
      }
    }
  });

  it('outputs N levels per channel in RGB mode and N tones in tone mode', () => {
    const lv = new Set([0, 85, 170, 255]);
    const out = run(P, dither({ algo: 'floyd', color: 'rgb', levels: 4 }));
    for (let j = 0; j < out.data.length; j += 4) for (let c = 0; c < 3; c++) expect(lv.has(out.data[j + c])).toBe(true);
    const tones = colorsOf(run(P, dither({ algo: 'bayer4', color: 'tonos', levels: 3 })));
    for (const c of tones) expect(['0,0,0', '128,128,128', '255,255,255']).toContain(c);
  });

  it('preserves the mean brightness of a ramp (error diffusion, Riemersma, ordered, noise)', () => {
    const R = ramp(128, 64), m = meanLuma(R);
    for (const a of DITHER_ALGOS) {
      if (a.id === 'threshold') continue;
      const out = run(R, dither({ algo: a.id, color: 'bn' }));
      expect(Math.abs(meanLuma(out) - m), a.id).toBeLessThan(255 * 0.03);
    }
    // and of a photo, in colour
    for (const a of ['floyd', 'atkinson', 'riemersma', 'bayer8', 'bluenoise']) {
      const out = run(P, dither({ algo: a, color: 'rgb', levels: 2 }));
      expect(Math.abs(meanLuma(out) - meanLuma(P)), a).toBeLessThan(255 * 0.04);
    }
  });

  it('dithers in linear light when asked: a 50 % sRGB grey gets about 21 % paper', () => {
    const grey = img(64, 64, () => [128, 128, 128, 255]);
    const share = (o: ImageDataLike) => { let n = 0; for (let j = 0; j < o.data.length; j += 4) if (o.data[j] === 255) n++; return n / (64 * 64); };
    expect(share(run(grey, dither({ algo: 'floyd', color: 'bn' })))).toBeCloseTo(0.5, 1);
    expect(share(run(grey, dither({ algo: 'floyd', color: 'bn', linear: true })))).toBeCloseTo(0.216, 1);
  });

  it('builds Bayer matrices with the right thresholds', () => {
    expect(Array.from(bayerMatrix(4), v => Math.round(v * 16 - 0.5))).toEqual([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
    for (const n of [2, 4, 8, 16]) {
      const m = Array.from(bayerMatrix(n), v => Math.round(v * n * n - 0.5)).sort((a, b) => a - b);
      expect(m).toEqual(Array.from({ length: n * n }, (_, i) => i));
    }
    // a flat grey of k/n² turns exactly k cells of every n×n tile into paper
    for (const n of [2, 4, 8]) {
      for (const k of [0, 1, Math.floor((n * n) / 3), (n * n) / 2, n * n - 1, n * n]) {
        const v = Math.round((k / (n * n)) * 255);
        const want = Array.from(bayerMatrix(n)).filter(t => v / 255 + t >= 1).length;
        const out = run(img(n * 3, n * 2, () => [v, v, v, 255]), dither({ algo: `bayer${n}`, color: 'bn' }));
        for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 3; tx++) {
          let white = 0;
          for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (out.data[((ty * n + y) * n * 3 + tx * n + x) * 4] === 255) white++;
          expect(white, `bayer${n} k=${k}`).toBe(want);
        }
      }
    }
  });

  it('ranks the clustered-dot and blue-noise tiles as permutations; blue noise spreads its points', () => {
    const c = Array.from(clusterMatrix(), v => Math.round(v * 64 - 0.5)).sort((a, b) => a - b);
    expect(c).toEqual(Array.from({ length: 64 }, (_, i) => i));
    const bn = blueNoise();
    const ranks = Array.from(bn, v => Math.round(v * BLUE_N * BLUE_N - 0.5)).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: BLUE_N * BLUE_N }, (_, i) => i));
    // the darkest 5 % of thresholds: no two of them touch (a white-noise tile would have many neighbours)
    const pts: number[] = [];
    bn.forEach((v, i) => { if (v < 0.05) pts.push(i); });
    let close = 0;
    for (const a of pts) for (const b of pts) if (a < b) {
      const dx = Math.abs((a % BLUE_N) - (b % BLUE_N)), dy = Math.abs(((a / BLUE_N) | 0) - ((b / BLUE_N) | 0));
      if (Math.min(dx, BLUE_N - dx) <= 1 && Math.min(dy, BLUE_N - dy) <= 1) close++;
    }
    expect(close).toBe(0);
    // every 16×16 block of the 50 % pattern is close to half full (low-frequency energy is low)
    for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
      let on = 0;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (bn[(by * 16 + y) * BLUE_N + bx * 16 + x] < 0.5) on++;
      expect(Math.abs(on / 256 - 0.5)).toBeLessThan(0.05);
    }
  });

  it('walks every pixel once along the gilbert curve, one step at a time', () => {
    for (const [w, h] of [[1, 1], [7, 3], [16, 16], [33, 20], [5, 40]]) {
      const p = gilbertPath(w, h);
      expect(new Set(p).size).toBe(w * h);
      for (let i = 1; i < p.length; i++) {
        const d = Math.abs((p[i] % w) - (p[i - 1] % w)) + Math.abs(Math.floor(p[i] / w) - Math.floor(p[i - 1] / w));
        // the generalised curve takes diagonal steps only on odd sizes
        expect(d).toBeLessThanOrEqual(2);
      }
    }
  });

  it('has error-diffusion kernels whose weights add up to the published share', () => {
    const share: Record<string, number> = { atkinson: 6 / 8 };
    for (const [k, v] of Object.entries(KERNELS)) {
      const s = v.taps.reduce((a, t) => a + t[2], 0) / v.div;
      expect(s, k).toBeCloseTo(share[k] ?? 1, 6);
      for (const [dx, dy] of v.taps) expect(dy > 0 || dx > 0, k).toBe(true); // only forward
    }
  });

  it('makes every method look different, and serpentine differ from plain scanning', () => {
    const outs = DITHER_ALGOS.map(a => run(P, dither({ algo: a.id, color: 'bn' })));
    for (let i = 0; i < outs.length; i++) for (let j = i + 1; j < outs.length; j++) {
      expect(Buffer.compare(Buffer.from(outs[i].data), Buffer.from(outs[j].data)), `${DITHER_ALGOS[i].id} vs ${DITHER_ALGOS[j].id}`).not.toBe(0);
    }
    const a = run(P, dither({ algo: 'floyd', serpentine: true })), b = run(P, dither({ algo: 'floyd', serpentine: false }));
    expect(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data))).not.toBe(0);
  });

  it('dithers in blocks of the pixel size, keeping the silhouette of a cutout', () => {
    const out = run(P, dither({ algo: 'atkinson', pixel: 4 }));
    for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4, j = (((y >> 2) << 2) * 64 + ((x >> 2) << 2)) * 4;
      expect(out.data[i]).toBe(out.data[j]);
    }
    const C = cutout(40, 40);
    const oc = run(C, dither({ algo: 'floyd', pixel: 3 }));
    for (let i = 3; i < C.data.length; i += 4) expect(oc.data[i]).toBe(C.data[i]);
  });
});

describe('palettes', () => {
  it('maps every palette colour to itself and other colours to the closest entry', () => {
    for (const p of PALETTES) {
      if (!p.colors.length) continue;
      const cols = p.colors.map(c => parseHex(c)!);
      const n = new Nearest(cols);
      cols.forEach((c, i) => {
        const k = n.index(c[0], c[1], c[2]);
        expect(cols[k], `${p.id} ${i}`).toEqual(c);
      });
      // the table agrees with the exact search away from boundaries
      for (let t = 0; t < 200; t++) {
        const r = (t * 97) % 256, g = (t * 57) % 256, b = (t * 31) % 256;
        const k = n.index(r, g, b), e = n.exact(r, g, b);
        const dk = colorDist(r, g, b, ...cols[k]), de = colorDist(r, g, b, ...cols[e]);
        expect(dk - de).toBeLessThanOrEqual(de * 0.25 + 400);
      }
    }
    const bw = new Nearest([[0, 0, 0], [255, 255, 255]]);
    expect(bw.index(100, 100, 100)).toBe(0);
    expect(bw.index(160, 160, 160)).toBe(1);
  });

  it('extracts an automatic palette from the picture', () => {
    const two = img(20, 20, x => (x < 10 ? [200, 30, 40, 255] : [20, 60, 220, 255]));
    expect(medianCut(two, 2)).toEqual([[20, 60, 220], [200, 30, 40]]);
    const cols = resolvePalette('auto', { count: 5 }, photo(50, 40));
    expect(cols.length).toBe(5);
    // custom colours, and a safe fallback
    expect(resolvePalette('custom', { count: 2, c1: '#ff0000', c2: '#00ff00', c3: '#0000ff' }, null)).toEqual([[255, 0, 0], [0, 255, 0]]);
    expect(resolvePalette('custom', { count: 3 }, null)).toEqual([[0, 0, 0], [255, 255, 255]]);
  });

  it('limits a photo to the palette with or without dithering', () => {
    const P = photo(48, 36);
    for (const d of ['none', 'bayer4', 'floyd']) {
      const f = defaultFinish('palette');
      f.params = { ...f.params, palette: 'gameboy', dither: d, pixel: 1 };
      const out = runFinishes(clone(P), [f], ctx);
      const allowed = new Set(PALETTES.find(p => p.id === 'gameboy')!.colors.map(hexKey));
      for (let j = 0; j < out.data.length; j += 4) expect(allowed.has(`${out.data[j]},${out.data[j + 1]},${out.data[j + 2]}`)).toBe(true);
    }
  });
});
