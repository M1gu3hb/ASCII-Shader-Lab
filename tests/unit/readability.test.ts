import { describe, expect, it } from 'vitest';
import {
  advice, applyScrim, judge, measureRegion, reason, summary, verdict, worstOf,
  type Metrics, type RegionSpec, type Rgb, type Sample,
} from '../../src/studio/views/readability';
import { DEFAULT_SCRIM, gradientCover, normalizeScrim, resolveScrim, scrimColor, scrimCss, withPreset } from '../../src/shared/scrim';

const W: Rgb = [255, 255, 255], K: Rgb = [17, 17, 17];

function solid(w: number, h: number, c: Rgb): Sample {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...c, 255], i * 4);
  return { w, h, data };
}
/** Glyph-like strokes: a 1 px line every `step` px, both ways (a grid of thin bright strokes). */
function strokes(w: number, h: number, bg: Rgb, ink: Rgb, step: number): Sample {
  const s = solid(w, h, bg);
  const d = s.data as Uint8ClampedArray;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x % step === 0 || y % step === 0) d.set([...ink, 255], (y * w + x) * 4);
  return s;
}
const spec = (o: Partial<RegionSpec> = {}): RegionSpec => ({ id: 'p', role: 'body', name: 'el párrafo', text: W, alpha: 1, large: false, ...o });
const level = (sp: RegionSpec, s: Sample) => judge(sp, measureRegion(sp, s)).level;

describe('legibility estimate, per region', () => {
  it('white text reads on black and not on white; the whole background too close is «fondo»', () => {
    expect(level(spec(), solid(40, 20, [0, 0, 0]))).toBe('buena');
    const m = measureRegion(spec(), solid(40, 20, [255, 255, 255]));
    expect(m.clash).toBe(1);
    expect(judge(spec(), m)).toEqual({ level: 'baja', why: 'fondo' });
  });

  it('follows the WCAG thresholds on a flat background: 4.5:1 for body text, 3:1 for large text', () => {
    // #767676 on white is 4.54:1, #777777 is 4.48:1
    expect(level(spec(), solid(16, 16, [0x76, 0x76, 0x76]))).toBe('buena');
    expect(level(spec(), solid(16, 16, [0x77, 0x77, 0x77]))).not.toBe('buena');
    expect(level(spec({ large: true }), solid(16, 16, [0x77, 0x77, 0x77]))).toBe('buena');
    expect(measureRegion(spec(), solid(16, 16, [0x76, 0x76, 0x76])).ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('bright glyph strokes on a dark background fail white text, even though their average is dark', () => {
    // 1 px strokes every 4 px: about 44 % of the pixels, the average stays dark (the old block estimate said «buena»)
    const s = strokes(80, 24, [8, 6, 6], [255, 233, 199], 4);
    expect(level(spec(), s)).toBe('baja');
    expect(level(spec({ role: 'headline', large: true, id: 'h' }), s)).toBe('baja');
    // sparser strokes still fail body text
    const sparse = strokes(96, 24, [8, 6, 6], [230, 230, 230], 12);
    expect(level(spec(), sparse)).not.toBe('buena');
    expect(judge(spec(), measureRegion(spec(), sparse)).why).toBe('glifos');
  });

  it('dim glyphs behind white text read well', () => {
    expect(level(spec(), strokes(80, 24, [8, 6, 6], [70, 60, 55], 4))).toBe('buena');
  });

  it('dark text on paper with mid-grey dots is not «buena» for small text', () => {
    const s = strokes(80, 24, [242, 236, 223], [109, 101, 86], 6);
    expect(level(spec({ text: K }), s)).not.toBe('buena');
  });

  it('a translucent paragraph loses contrast over light pixels', () => {
    const grey = solid(20, 10, [0x60, 0x60, 0x60]);
    expect(measureRegion(spec({ alpha: 0.6 }), grey).ratio).toBeLessThan(measureRegion(spec(), grey).ratio);
  });

  it('only the pixels around the letters count (mask)', () => {
    const s = solid(20, 10, [0, 0, 0]);
    const d = s.data as Uint8ClampedArray;
    for (let y = 0; y < 10; y++) for (let x = 10; x < 20; x++) d.set([255, 255, 255, 255], (y * 20 + x) * 4);
    expect(measureRegion(spec(), s).clash).toBeCloseTo(0.5);
    const mask = new Uint8Array(200).map((_, i) => (i % 20 < 10 ? 1 : 0));
    expect(measureRegion(spec(), { ...s, mask }).clash).toBe(0);
  });

  it('a filled button is judged on its own fill', () => {
    const b = spec({ role: 'button', text: K, fill: [255, 255, 255] });
    expect(level(b, solid(10, 10, [255, 255, 255]))).toBe('buena');
    expect(level({ ...b, fill: [40, 40, 40] }, solid(10, 10, [0, 0, 0]))).toBe('baja');
  });
});

describe('legibility estimate, the whole preview', () => {
  const specs = [spec({ id: 'h', role: 'headline', name: 'el titular', large: true }), spec()];
  const ok: Metrics = { clash: 0, texture: 0.05, ratio: 15 };
  const bad: Metrics = { clash: 0.2, texture: 0.3, ratio: 2 };

  it('«se lee bien» only when every region does, and names the ones that fail', () => {
    const v = verdict(specs, new Map([['h', [ok]], ['p', [ok, bad]]]));
    expect(v.level).toBe('baja');
    expect(v.regions.find(r => r.id === 'h')?.level).toBe('buena');
    expect(summary(v)).toBe('Cuesta leer el párrafo');
    expect(verdict(specs, new Map([['h', [ok]], ['p', [ok]]])).level).toBe('buena');
  });

  it('takes the worst frame of each region', () => {
    expect(worstOf([ok, bad, ok])).toEqual({ clash: 0.2, texture: 0.3, ratio: 2 });
  });

  it('explains and suggests in plain words', () => {
    const v = verdict(specs, new Map([['h', [bad]], ['p', [bad]]]));
    expect(summary(v)).toBe('Cuesta leer el titular y el párrafo');
    expect(reason(v.regions[1], true)).toMatch(/caracteres casi tan claros como el texto/);
    const tips = advice(v, { light: true, scrim: 'off', alt: 'buena' });
    expect(tips[0]).toMatch(/texto oscuro/);
    expect(tips.join(' ')).toMatch(/zona protegida/);
    expect(advice(verdict(specs, new Map([['h', [ok]], ['p', [ok]]])), { light: true, scrim: 'off', alt: null })).toEqual([]);
  });
});

describe('zona protegida', () => {
  it('a strong dark zone makes white text over bright strokes readable; the estimate sees it', () => {
    const s = strokes(80, 24, [8, 6, 6], [255, 233, 199], 4);
    const zone = resolveScrim(withPreset(DEFAULT_SCRIM, 'fuerte'), '#ffffff', '#0b0708')!;
    const layer = { color: [0, 0, 0] as Rgb, opacity: zone.opacity, blur: zone.blur };
    layer.color = zone.color.match(/[0-9a-f]{2}/gi)!.map(h => parseInt(h, 16)) as Rgb;
    expect(level(spec(), s)).toBe('baja');
    expect(level(spec(), applyScrim(s, layer, null))).toBe('buena');
    // where the zone is not (cover 0) nothing changes
    const none = applyScrim(s, layer, new Float32Array(80 * 24));
    expect(measureRegion(spec(), none)).toEqual(measureRegion(spec(), s));
  });

  it('blur alone evens out the texture', () => {
    const s = strokes(80, 24, [8, 6, 6], [180, 170, 160], 4);
    const sharp = measureRegion(spec(), s), soft = measureRegion(spec(), applyScrim(s, { color: [0, 0, 0], opacity: 0, blur: 6 }, null));
    expect(soft.texture).toBeLessThan(sharp.texture / 2);
  });

  it('settings from old preferences fall back to off; presets set their values', () => {
    expect(normalizeScrim(undefined)).toEqual(DEFAULT_SCRIM);
    expect(normalizeScrim({ mode: 'weird', opacity: 7, blur: -3, shape: 'x' })).toEqual({ mode: 'off', opacity: 0.95, blur: 0, shape: 'block' });
    expect(withPreset(DEFAULT_SCRIM, 'fuerte')).toMatchObject({ mode: 'fuerte', opacity: 0.78, blur: 6 });
    expect(resolveScrim(DEFAULT_SCRIM, '#fff', '#000')).toBeNull();
  });

  it('the colour keeps the background hue, pushed away from the text; the gradient fades as drawn', () => {
    expect(scrimColor('#ffffff', '#0a1f3a')).toBe('#050e1a');
    expect(scrimColor('#111111', '#f2ecdf')).toBe('#fbf9f5');
    expect([gradientCover(0), gradientCover(0.35), gradientCover(0.575), gradientCover(0.8), gradientCover(1)].map(v => +v.toFixed(6))).toEqual([1, 1, 0.5, 0, 0]);
    const css = scrimCss({ color: '#000000', opacity: 0.5, blur: 4, shape: 'gradient' }, 'bottom');
    expect(css).toContain('backdrop-filter:blur(4px)');
    expect(css).toContain('mask-image:linear-gradient(to top,#000 35%,transparent 80%)');
  });
});
