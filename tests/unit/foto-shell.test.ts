import { describe, expect, it } from 'vitest';
import { defaultMirror, mirrorFor } from '../../src/foto/camera';
import { rollComposition, rollLayer, rollGlyphs } from '../../src/foto/dice';
import { orderVersions } from '../../src/foto/tree';
import { maskShown, useFoto } from '../../src/foto/ui';
import { clampPan, frameRect, makeView, panForZoom, zoomValue } from '../../src/foto/view';
import { newLayer, projectFromImage } from '../../src/project/normalize';
import { Rng } from '../../src/random';

const ref = { id: '0123456789abcdef', kind: 'image' as const, name: 'foto.jpg', w: 1200, h: 800 };

describe('viewport geometry', () => {
  const area = { x: 0, y: 0, w: 1000, h: 600 };
  it('fits the frame inside the area with its padding and centres it', () => {
    const k = zoomValue('fit', area, 1200, 800, 20);
    expect(k).toBeCloseTo(Math.min(960 / 1200, 560 / 800), 6);
    const f = frameRect(k, { x: 0, y: 0 }, area, 1200, 800);
    expect(f.x + f.w / 2).toBeCloseTo(500, 6);
    expect(f.y + f.h / 2).toBeCloseTo(300, 6);
  });
  it('an inset area (a phone sheet over the bottom) moves the centre up', () => {
    const f = frameRect(0.5, { x: 0, y: 0 }, { x: 0, y: 0, w: 390, h: 400 }, 600, 400);
    expect(f.y + f.h / 2).toBeCloseTo(200, 6);
  });
  it('zooming around a point keeps that point of the frame under it', () => {
    const k0 = 0.5, k1 = 2, pan = { x: 30, y: -10 };
    const f0 = frameRect(k0, pan, area, 1200, 800);
    const sx = 700, sy = 250;
    const u = (sx - f0.x) / f0.w, v = (sy - f0.y) / f0.h;
    const np = panForZoom(pan, k0, k1, sx, sy, area);
    const f1 = frameRect(k1, np, area, 1200, 800);
    expect(f1.x + u * f1.w).toBeCloseTo(sx, 6);
    expect(f1.y + v * f1.h).toBeCloseTo(sy, 6);
  });
  it('a pan never loses the picture', () => {
    const p = clampPan({ x: 99999, y: -99999 }, 1, area, 400, 300, 48);
    const f = frameRect(1, p, area, 400, 300);
    expect(f.x).toBeLessThanOrEqual(area.w - 48 + 1e-6);
    expect(f.y + f.h).toBeGreaterThanOrEqual(48 - 1e-6);
  });
  it('the tools view converts client px to frame units and back', () => {
    const v = makeView({ x: 100, y: 50, w: 400, h: 200 }, { w: 800, h: 400 }, () => ({ left: 10, top: 20 }));
    expect(v.toFrame(10 + 100 + 200, 20 + 50 + 50)).toEqual({ x: 0.5, y: 0.25 });
    expect(v.toScreen({ x: 1, y: 1 })).toEqual({ x: 500, y: 250 });
    expect(v.zoom).toBe(200);
  });
});

describe('camera mirror', () => {
  it('front (or unknown) cameras mirror by default, the rear one does not', () => {
    expect(defaultMirror('user')).toBe(true);
    expect(defaultMirror('unknown')).toBe(true);
    expect(defaultMirror('environment')).toBe(false);
  });
  it('the person\'s choice wins, per camera', () => {
    expect(mirrorFor('user', { user: false })).toBe(false);
    expect(mirrorFor('environment', { user: false })).toBe(false);
    expect(mirrorFor('environment', { environment: true })).toBe(true);
    expect(mirrorFor('unknown', { user: false })).toBe(false);
  });
});

describe('versions tree', () => {
  it('lists each version followed by its variants; orphans stay', () => {
    const list = [{ id: 'a' }, { id: 'b', parent: 'a' }, { id: 'c' }, { id: 'd', parent: 'a' }, { id: 'e', parent: 'b' }, { id: 'f', parent: 'zz' }];
    const out = orderVersions(list).map(x => `${x.v.id}${x.depth}`);
    expect(out).toEqual(['a0', 'b1', 'e1', 'd1', 'c0', 'f0']);
  });
});

describe('the studio dice', () => {
  const base = () => {
    const p = projectFromImage(ref);
    p.layers.push(newLayer('ascii', { source: p.sources[0].id }));
    p.layers.push(newLayer('glyphs', { source: p.sources[0].id, mask: { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'rect', op: 'add', x: 0.2, y: 0.2, w: 0.4, h: 0.4, rot: 0, soft: 0, alpha: 1 }] } }));
    p.layers[0].finishes = [{ kind: 'grain', on: true, amount: 1, params: {} }];
    return p;
  };
  it('the same seed gives the same composition', () => {
    const p = base();
    const a = rollComposition(p, { locks: [], keep: [], seed: 'semilla' });
    const b = rollComposition(p, { locks: [], keep: [], seed: 'semilla' });
    const strip = (x: typeof a) => JSON.stringify({ ...x, updated: 0 });
    expect(strip(a)).toBe(strip(b));
    expect(strip(a)).not.toBe(strip(rollComposition(p, { locks: [], keep: [], seed: 'otra' })));
  });
  it('honours the locks and the keep set', () => {
    const p = base();
    const q = rollComposition(p, { locks: ['efectos', 'glifos'], keep: ['seleccion', 'paleta'], seed: 's1' });
    expect(q.layers[0].finishes).toEqual(p.layers[0].finishes);
    expect(q.layers[2].mask).toEqual(p.layers[2].mask);
    const g0 = p.layers[2].kind === 'glyphs' ? p.layers[2].glyphs : null, g1 = q.layers[2].kind === 'glyphs' ? q.layers[2].glyphs : null;
    expect(g1?.charset).toBe(g0?.charset);
    expect(g1?.palette).toEqual(g0?.palette);
    // without the keep, rectangles move a little
    const r = rollComposition(p, { locks: [], keep: [], seed: 's1' });
    expect(r.layers[2].mask).not.toEqual(p.layers[2].mask);
  });
  it('a locked layer never changes', () => {
    const p = base();
    p.layers[1].locked = true;
    const q = rollLayer(p, p.layers[1].id, { locks: [], keep: [], seed: 'x' });
    expect(q).toBe(p);
    const r = rollComposition(p, { locks: [], keep: [], seed: 'x' });
    expect(r.layers[1]).toEqual(p.layers[1]);
  });
  it('a characters style rolls within its ranges', () => {
    const g = base().layers[2];
    if (g.kind !== 'glyphs') throw new Error();
    for (let i = 0; i < 20; i++) {
      const s = rollGlyphs(g.glyphs, new Rng('g' + i), [], []);
      expect(s.cell).toBeGreaterThanOrEqual(6);
      expect(s.cell).toBeLessThanOrEqual(16);
      expect(['mono', 'source', 'palette']).toContain(s.color);
      expect(s.charset).not.toBe('custom');
    }
  });
});

describe('mask view', () => {
  it('shows like a quick mask: while you work on it, when pinned, never when hidden', () => {
    const s = { ...useFoto.getState(), maskView: 'tint' as const, maskPin: false, maskFocus: false, tool: null, immersive: false, snap: 'closed' as const, mtab: 'capas' as const };
    expect(maskShown(s)).toBe(false);
    expect(maskShown({ ...s, tool: 'rect' })).toBe(true);
    expect(maskShown({ ...s, maskFocus: true })).toBe(true);
    expect(maskShown({ ...s, maskPin: true })).toBe(true);
    expect(maskShown({ ...s, immersive: true, snap: 'half', mtab: 'capa' })).toBe(true);
    expect(maskShown({ ...s, immersive: true, snap: 'closed', mtab: 'capa' })).toBe(false);
    expect(maskShown({ ...s, maskView: 'off', maskPin: true, tool: 'rect' })).toBe(false);
  });
});
