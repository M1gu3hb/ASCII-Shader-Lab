import { describe, expect, it } from 'vitest';
import { BG_GAP, INK_GAP, fitMasked, hexLum, rollLayer } from '../../src/foto/dice';
import { defaultAsciiStyle, newLayer, projectFromImage } from '../../src/project/normalize';
import type { AsciiLayer } from '../../src/project/types';
import { Rng } from '../../src/random';

/** Rolls inside a mask keep contrast with the photo under the mask. */

const ref = { id: '0123456789abcdef', kind: 'image' as const, name: 'foto.jpg', w: 1200, h: 800 };
const zone = { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'ellipse' as const, op: 'add' as const, x: 0.3, y: 0.3, w: 0.4, h: 0.4, rot: 0, soft: 0, alpha: 1 }] };

describe('rolls inside a mask', () => {
  it('a light background on a dark photo becomes one near the photo', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const st = defaultAsciiStyle();
      st.color.bg = '#f2ecdf';
      expect(fitMasked(st, true, 0.12, new Rng(seed))).toBe(true);
      expect(Math.abs(hexLum(st.color.bg) - 0.12)).toBeLessThanOrEqual(BG_GAP);
    }
  });

  it('a background that already sits well is kept', () => {
    const st = defaultAsciiStyle();
    st.color.bg = '#0b0a09';
    const before = JSON.stringify(st.color);
    expect(fitMasked(st, true, 0.2, new Rng('x'))).toBe(false);
    expect(JSON.stringify(st.color)).toBe(before);
  });

  it('characters without a background get ink that stands out from the photo', () => {
    for (const under of [0.1, 0.5, 0.9]) {
      const st = defaultAsciiStyle();
      st.color.mode = 'source';
      fitMasked(st, false, under, new Rng('t' + under));
      const ink = st.color.mode === 'source' ? under : hexLum(st.color.stops[st.color.stops.length - 1]);
      expect(Math.abs(ink - under)).toBeGreaterThanOrEqual(INK_GAP);
    }
  });

  it('rollLayer fits masked layers, and leaves colours alone when «Color» is locked', () => {
    const p = projectFromImage(ref);
    const a = newLayer('ascii', { name: 'Zona', source: p.sources[0].id, opaque: true, mask: zone }) as AsciiLayer;
    p.layers.push(a);
    const under = () => 0.1;
    for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
      const q = rollLayer(p, a.id, { locks: [], keep: [], seed, under });
      const l = q.layers.find(x => x.id === a.id) as AsciiLayer;
      expect(Math.abs(hexLum(l.style.color.bg) - 0.1)).toBeLessThanOrEqual(BG_GAP);
      // the same seed gives the same roll
      expect(JSON.stringify(rollLayer(p, a.id, { locks: [], keep: [], seed, under }).layers)).toBe(JSON.stringify(q.layers));
    }
    const locked = rollLayer(p, a.id, { locks: ['color'], keep: [], seed: 's1', under });
    expect((locked.layers.find(x => x.id === a.id) as AsciiLayer).style.color).toEqual(a.style.color);
  });
});
