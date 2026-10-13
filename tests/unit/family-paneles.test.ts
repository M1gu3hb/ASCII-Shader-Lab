import { describe, expect, it } from 'vitest';
import { HITS, hits, impl } from '../../src/families/analytic/paneles.cpu';
import { META } from '../../src/families/meta/paneles';
import { defaultParams, packParams } from '../../src/families/params';
import { paletteOf } from '../../src/families/palette';
import { setPX } from '../../src/engine/basic/patterns';

/** Mechanism checks of «Paneles prismáticos»: back-to-front composition and the exact 60 s loop. */

const pal = paletteOf(['#07060f', '#3b2b8f', '#d6407a', '#f2b33d', '#3fc7d9']);
const out = new Float64Array(3);

describe('paneles prismáticos', () => {
  it('cada celda compone sus capas de la más lejana a la más cercana («over»)', () => {
    setPX(14 / 720);
    const k = packParams(META, { ...defaultParams(META), opacity: 0.6, count: 8 });
    impl.prep!(7, k, pal);
    let layered = 0;
    for (let i = 0; i < 400; i++) {
      const x = -0.85 + (i % 20) * 0.09, y = -0.45 + Math.floor(i / 20) * 0.047;
      const n = hits(x, y, 7, k);
      const ls = Array.from({ length: n }, (_, j) => ({ z: HITS.ZS[j], r: HITS.CR[j], g: HITS.CG[j], b: HITS.CB[j], a: HITS.AS[j], ink: HITS.GS[j] }));
      if (n > 1) layered++;
      ls.sort((p, q) => q.z - p.z);
      let r = pal.rgb[0], g = pal.rgb[1], b = pal.rgb[2], ink = 0;
      for (const l of ls) { r += (l.r - r) * l.a; g += (l.g - g) * l.a; b += (l.b - b) * l.a; ink += (l.ink - ink) * l.a; }
      expect(impl.cpu(x, y, 7, k)).toBeCloseTo(Math.min(1, ink), 9);
      impl.cpuColor!(x, y, 7, k, out);
      expect(out[0]).toBeCloseTo(r, 9); expect(out[1]).toBeCloseTo(g, 9); expect(out[2]).toBeCloseTo(b, 9);
    }
    expect(layered).toBeGreaterThan(40);
  });

  it('el orden importa: la capa cercana manda sobre la lejana', () => {
    setPX(14 / 720);
    const k = packParams(META, { ...defaultParams(META), opacity: 0.95, count: 8 });
    impl.prep!(3, k, pal);
    let checked = 0;
    for (let i = 0; i < 2000 && checked < 20; i++) {
      const x = -0.85 + (i % 40) * 0.044, y = -0.45 + Math.floor(i / 40) * 0.018;
      const n = hits(x, y, 3, k);
      if (n < 2) continue;
      let near = 0;
      for (let j = 1; j < n; j++) if (HITS.ZS[j] < HITS.ZS[near]) near = j;
      if (HITS.AS[near] < 0.94) continue;
      // (the twin reuses HITS: read the nearest layer before asking it)
      const nr = HITS.CR[near], ng = HITS.CG[near], nb = HITS.CB[near];
      impl.cpuColor!(x, y, 3, k, out);
      expect(Math.abs(out[0] - nr) + Math.abs(out[1] - ng) + Math.abs(out[2] - nb)).toBeLessThan(0.15);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('bucle exacto de 60 s en todos los presets (brillo y color)', () => {
    setPX(14 / 720);
    for (const pr of META.presets) {
      expect(pr.period).toBe(60);
      const k = packParams(META, { ...defaultParams(META), ...pr.params });
      for (const t of [0.7, 13.1, 41.9]) {
        const a: number[] = [], b: number[] = [];
        impl.prep!(t, k, pal);
        for (let i = 0; i < 200; i++) { const x = -0.85 + (i % 20) * 0.09, y = -0.45 + Math.floor(i / 20) * 0.1; a.push(impl.cpu(x, y, t, k)); impl.cpuColor!(x, y, t, k, out); a.push(...out); }
        impl.prep!(t + 60, k, pal);
        for (let i = 0; i < 200; i++) { const x = -0.85 + (i % 20) * 0.09, y = -0.45 + Math.floor(i / 20) * 0.1; b.push(impl.cpu(x, y, t + 60, k)); impl.cpuColor!(x, y, t + 60, k, out); b.push(...out); }
        for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i]), `${pr.id} t=${t}`).toBeLessThan(1e-6);
      }
    }
  });
});
