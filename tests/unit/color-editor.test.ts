import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToOklch } from '../../src/engine/color';
import { describe as say, formats, gamutChroma, hexToLch, inGamut, lchToHex, parseColor } from '../../src/studio/ui/color/color-math';
import { mainHue, suggestions } from '../../src/studio/ui/color/harmony';
import { PALETTE_GALLERY } from '../../src/random/palette-gallery';
import { CURATED } from '../../src/random/palettes';

describe('colour editor: reading colours', () => {
  it('reads hex, rgb(), hsl() and oklch(), ignores alpha, refuses the rest', () => {
    expect(parseColor('#FF5B1F')).toBe('#ff5b1f');
    expect(parseColor('ff5b1f')).toBe('#ff5b1f');
    expect(parseColor('#f5a')).toBe('#ff55aa');
    expect(parseColor('rgb(0, 128, 255)')).toBe('#0080ff');
    expect(parseColor('rgba(0 128 255 / .5)')).toBe('#0080ff');
    expect(parseColor('rgb(100%, 0%, 0%)')).toBe('#ff0000');
    expect(parseColor('hsl(120, 100%, 50%)')).toBe('#00ff00');
    expect(parseColor('hsl(240deg 100% 50%)')).toBe('#0000ff');
    const ok = parseColor('oklch(68% 0.2 40)')!;
    const [L, , h] = hexToOklch(ok);
    expect(L).toBeCloseTo(0.68, 1);
    expect(h).toBeGreaterThan(30);
    expect(h).toBeLessThan(50);
    for (const bad of ['', 'hola', '#12', '#12345', 'rgb(1,2)', 'hsl(a, b, c)']) expect(parseColor(bad), bad).toBeNull();
  });

  it('never leaves the screen: every colour it makes is in sRGB, the hue and light kept', () => {
    for (let h = 0; h < 360; h += 15) for (let L = 0.05; L < 1; L += 0.1) {
      const max = gamutChroma(L, h);
      expect(inGamut(L, max, h)).toBe(true);
      expect(inGamut(L, max + 0.01, h)).toBe(false);
      const hex = lchToHex(L, 0.5, h);
      const [l2] = hexToOklch(hex);
      expect(Math.abs(l2 - L), `${L} ${h}`).toBeLessThan(0.02);
    }
    // a grey keeps the hue it had (moving through grey does not lose the hue)
    expect(hexToLch('#808080', 200).h).toBe(200);
  });

  it('writes a colour the ways it can be copied, and says it in words', () => {
    expect(formats('#ff5b1f')).toMatchObject({ hex: '#FF5B1F', rgb: 'rgb(255, 91, 31)' });
    expect(formats('#ff5b1f').hsl).toMatch(/^hsl\(16, 100%, 56%\)$/);
    expect(say('#000000')).toBe('negro');
    expect(say('#ffffff')).toBe('blanco');
    expect(say('#0080ff')).toMatch(/^azul/);
    expect(say('#ff5b1f')).toMatch(/^(rojo|naranja)/);
  });
});

describe('colour editor: ideas from a palette', () => {
  it('eight ideas for every palette of the gallery and the classic ones, each legible and different from the palette', () => {
    for (const p of [...PALETTE_GALLERY, ...CURATED]) {
      const ideas = suggestions(p);
      expect(ideas.map(i => i.id)).toEqual(['analoga', 'complementaria', 'triada', 'monocroma', 'viva', 'suave', 'girar', 'invertir']);
      for (const i of ideas) {
        expect(i.stops).toHaveLength(p.stops.length);
        for (const s of [...i.stops, i.bg]) expect(s).toMatch(/^#[0-9a-f]{6}$/);
        const light = hexToOklch(i.bg)[0] > 0.6;
        expect(contrastRatio(i.stops[i.stops.length - 1], i.bg), `${p.name} ${i.id}`).toBeGreaterThan(light ? 2.9 : 3.4);
      }
      // the inverted one swaps paper and night
      const inv = ideas.find(i => i.id === 'invertir')!;
      expect(hexToOklch(inv.bg)[0] > 0.6).toBe(!(hexToOklch(p.bg)[0] > 0.6));
    }
  });

  it('the complementary idea puts the opposite hue in the dense cells', () => {
    const p = { stops: ['#301000', '#b04010', '#ffb080'], bg: '#100500' };
    const h0 = mainHue(p);
    const c = suggestions(p).find(i => i.id === 'complementaria')!;
    const top = hexToOklch(c.stops[2])[2];
    // angular distance to the palette's own hue: about half the circle
    const d = Math.abs((((top - h0) % 360) + 540) % 360 - 180);
    expect(d).toBeGreaterThan(150);
  });
});
