import { describe, expect, it } from 'vitest';
import { contrastRatio, luminance } from '../../src/engine/color';
import { defaultRecipe, normalizeRecipe, type Recipe } from '../../src/engine/recipe';
import { PRESETS } from '../../src/studio/presets';
import {
  CONTRAST, DETAIL, PATHS, applyPresence, glyphContrast, inkOf, isLightBg, legibility, loopFor, nearestChoice, normWord, parseCamino,
  photoBackground, presence, presenceWord, previewInk, relevantTab, textGrid, validWord, withSpeed, withWord, withoutCamino,
} from '../../src/studio/guide/paths';

const fondos = () => PRESETS.fondos.map(p => p.make());

/** Solid RGBA block of w×h pixels. */
function solid(w: number, h: number, rgb: [number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set([...rgb, 255], i * 4);
  return d;
}

describe('camino', () => {
  it('reads the path from the query string and ignores anything else', () => {
    expect(parseCamino('?camino=foto')).toBe('foto');
    expect(parseCamino('?motor=basico&camino=Palabra')).toBe('palabra');
    expect(parseCamino('?camino=%20fondo')).toBe('fondo');
    expect(parseCamino('?camino=video')).toBeNull();
    expect(parseCamino('')).toBeNull();
  });
  it('removes only camino from the URL', () => {
    expect(withoutCamino('?camino=foto')).toBe('');
    expect(withoutCamino('?motor=basico&camino=foto')).toBe('?motor=basico');
  });
  it('every path has four steps, a space and a tab for «Ver todos los controles»', () => {
    for (const p of Object.values(PATHS)) {
      expect(p.steps).toHaveLength(4);
      for (let s = 0; s < 4; s++) expect(relevantTab(p.id, s)).toMatch(/^(fuente|glifos|color|forma|mov)$/);
    }
    expect(relevantTab('foto', 2)).toBe('glifos');
    expect(relevantTab('fondo', 99)).toBe('forma');
  });
});

describe('Presencia', () => {
  it('0.5 leaves the style untouched', () => {
    for (const r of fondos()) expect(presence(r, 0.5)).toEqual(r);
  });

  it('toward «sutil» the glyphs sink into the background; toward «protagonista» they stand out', () => {
    for (const r of fondos()) {
      const base = glyphContrast(r);
      const low = presence(r, 0), mid = presence(r, 0.25), high = presence(r, 1);
      expect(glyphContrast(low)).toBeLessThan(glyphContrast(mid));
      expect(glyphContrast(mid)).toBeLessThan(base);
      expect(glyphContrast(high)).toBeGreaterThanOrEqual(base);
      expect(low.tone.contrast).toBeLessThan(r.tone.contrast);
      expect(high.tone.contrast).toBeGreaterThan(r.tone.contrast);
      expect(low.color.bg).toBe(r.color.bg);
    }
  });

  it('«sutil» means less ink everywhere, «protagonista» more (empty areas never fill up)', () => {
    const bases = [...fondos(), normalizeRecipe({ ...defaultRecipe(), tone: { invert: true, contrast: 1.4, bright: 0.1 } })];
    for (const r of bases) {
      const lo = presence(r, 0), hi = presence(r, 1);
      for (let l = 0; l <= 1.0001; l += 0.1) {
        expect(inkOf(lo, l)).toBeLessThanOrEqual(inkOf(r, l) + 1e-6);
        expect(inkOf(hi, l)).toBeGreaterThanOrEqual(inkOf(r, l) - 1e-6);
      }
      expect(inkOf(lo, 0.7)).toBeLessThan(inkOf(r, 0.7) * 0.75);
      expect(inkOf(hi, 0.4)).toBeGreaterThan(inkOf(r, 0.4));
    }
  });

  it('is computed from the base: dragging back and forth never accumulates', () => {
    const r = fondos()[2];
    const there = presence(r, 0.1);
    const back = presence(r, 0.5);
    expect(back).toEqual(r);
    expect(presence(r, 0.1)).toEqual(there);
  });

  it('stays within the recipe limits and removes glow when subtle', () => {
    const r = normalizeRecipe({ ...defaultRecipe(), tone: { contrast: 3.9, bright: 0.95 }, color: { sat: 1.9, stops: ['#000000', '#ffffff'], bg: '#000000' }, fx: { glow: 1, bloom: 1 } });
    const hi = presence(r, 1), lo = presence(r, 0);
    expect(hi.tone.contrast).toBeLessThanOrEqual(4);
    expect(hi.tone.bright).toBeLessThanOrEqual(1);
    expect(hi.color.sat).toBeLessThanOrEqual(2);
    expect(lo.fx.glow).toBe(0);
    expect(lo.fx.bloom).toBe(0);
    expect(normalizeRecipe(hi)).toEqual(hi);
  });

  it('respects inverted tone: «sutil» brightens instead of darkening', () => {
    const r = normalizeRecipe({ ...defaultRecipe(), tone: { invert: true } });
    expect(presence(r, 0).tone.bright).toBeGreaterThan(0);
    expect(presence(normalizeRecipe(defaultRecipe()), 0).tone.bright).toBeLessThan(0);
  });

  it('applyPresence copies only what presence changes', () => {
    const r = fondos()[0];
    const into: Recipe = JSON.parse(JSON.stringify(r));
    into.glyph.cell = 31;
    applyPresence(into, presence(r, 0));
    expect(into.glyph.cell).toBe(31);
    expect(into.color.stops).toEqual(presence(r, 0).color.stops);
  });

  it('names the three zones', () => {
    expect([presenceWord(0.1), presenceWord(0.5), presenceWord(0.9)]).toEqual(['sutil', 'equilibrada', 'protagonista']);
  });
});

describe('legibility estimate', () => {
  it('white text on black is excellent, on white is unreadable', () => {
    expect(legibility(solid(40, 20, [0, 0, 0]), 40, 20, '#ffffff')).toEqual({ ratio: 21, level: 'buena' });
    expect(legibility(solid(40, 20, [255, 255, 255]), 40, 20, '#ffffff').level).toBe('baja');
  });

  it('matches WCAG for a flat background, and never rounds a fail up to a pass', () => {
    const aa = legibility(solid(16, 16, [0x76, 0x76, 0x76]), 16, 16, '#ffffff');
    expect(Math.abs(aa.ratio - contrastRatio('#767676', '#ffffff'))).toBeLessThan(0.1);
    expect(aa.level).toBe('buena');
    const near = legibility(solid(16, 16, [0x77, 0x77, 0x77]), 16, 16, '#ffffff'); // 4.48:1
    expect(near).toEqual({ ratio: 4.4, level: 'justa' });
    expect(legibility(solid(16, 16, [0xa0, 0xa0, 0xa0]), 16, 16, '#ffffff').level).toBe('baja');
  });

  it('counts bright patches behind the text (worst tenth of the blocks)', () => {
    const w = 80, h = 20, d = solid(w, h, [0, 0, 0]);
    // a quarter of the area turns white: the estimate follows the patch, not the average
    for (let y = 0; y < h; y++) for (let x = 0; x < 20; x++) d.set([255, 255, 255, 255], (y * w + x) * 4);
    expect(legibility(d, w, h, '#ffffff').level).toBe('baja');
    // fine glyph texture averages out within a block
    const t = solid(w, h, [0, 0, 0]);
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) t.set([255, 255, 255, 255], (y * w + x) * 4);
    expect(legibility(t, w, h, '#ffffff', 8).level).toBe('buena');
  });

  it('the preview ink is dark on light backgrounds and white on dark ones', () => {
    expect(previewInk('#f2ecdf')).toBe('#111111');
    expect(previewInk('#0b0a09')).toBe('#ffffff');
  });
});

describe('photo background', () => {
  const photo = PRESETS.media.map(p => p.make());

  it('paper inverts the tone and runs colours light → dark; screen does the opposite', () => {
    for (const r of photo) {
      const light = photoBackground(r, true);
      expect(isLightBg(light)).toBe(true);
      expect(light.tone.invert).toBe(true);
      const s = light.color.stops;
      expect(luminance(s[0])).toBeGreaterThanOrEqual(luminance(s[s.length - 1]));
      expect(contrastRatio(s[s.length - 1], light.color.bg)).toBeGreaterThanOrEqual(4.5);

      const dark = photoBackground(light, false);
      expect(isLightBg(dark)).toBe(false);
      expect(dark.tone.invert).toBe(false);
      const d = dark.color.stops;
      expect(luminance(d[0])).toBeLessThanOrEqual(luminance(d[d.length - 1]));
      expect(contrastRatio(d[d.length - 1], dark.color.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('a single white glyph colour turns dark on paper', () => {
    const r = PRESETS.media.find(p => p.id === 'contornos')!.make();
    const light = photoBackground(r, true);
    expect(contrastRatio(light.color.stops[0], light.color.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the photo and everything else', () => {
    const r = PRESETS.media[0].make();
    r.media.ref = { id: '0123456789abcdef', kind: 'image', w: 10, h: 10 };
    const light = photoBackground(r, true);
    expect(light.media).toEqual(r.media);
    expect(light.glyph).toEqual(r.glyph);
  });
});

describe('text copy, word and rhythm', () => {
  it('the text copy keeps the photo proportions with the cell shape', () => {
    // 960×600 photo, 10 px cells, aspect 1.4 → cells of 10×14: 100 columns → 100*10*0.625/14 ≈ 45 rows
    expect(textGrid(960, 600, 10, 1.4)).toEqual({ cols: 100, rows: 45 });
    expect(textGrid(0, 0, 10, 1.4).rows).toBeGreaterThan(8);
    expect(textGrid(100, 5000, 10, 1).rows).toBe(160);
  });

  it('a word has 1 to 24 characters and single spaces', () => {
    expect(normWord('  hola   mundo \n')).toBe('hola mundo');
    expect(normWord('x'.repeat(40))).toHaveLength(24);
    expect(validWord('   ')).toBe(false);
    expect(validWord('a')).toBe(true);
  });

  it('the word becomes the source text, and the fill text when glyphs are words', () => {
    for (const p of PRESETS.tipo) {
      const r = withWord(p.make(), 'Faro');
      expect(r.source).toBe('text');
      expect(r.text.content).toBe('Faro');
      if (r.glyph.mode === 'words') expect(r.glyph.words).toContain('Faro');
    }
    expect(withWord(PRESETS.tipo[0].make(), '   ').text.content).toBe('TRAMA');
  });

  it('a looping clip keeps about four seconds whatever the speed', () => {
    for (const speed of [0.25, 0.5, 1, 1.8, 3]) {
      const r = withSpeed({ ...defaultRecipe(), motion: { ...defaultRecipe().motion, loop: 4 } }, speed);
      expect(r.motion.speed).toBe(speed);
      expect(Math.abs(r.motion.loop / speed - 4)).toBeLessThan(1.1);
    }
    expect(withSpeed(defaultRecipe(), 2).motion.loop).toBe(0);
    expect(loopFor(0.01)).toBeGreaterThan(0);
  });

  it('comparison choices find the closest value, within a tolerance', () => {
    expect(nearestChoice(DETAIL, 10)).toBe(1);
    expect(nearestChoice(DETAIL, 6.4)).toBe(2);
    expect(nearestChoice(DETAIL, 12.5)).toBe(-1);
    expect(nearestChoice(CONTRAST, 1.25)).toBe(1);
  });
});
