import { describe, expect, it } from 'vitest';
import { compositeKey, layerKeys } from '../../src/project/compositor';
import { evaluate } from '../../src/project/evaluate';
import { cloneProject, newLayer, newProject, sourceFromMedia } from '../../src/project/normalize';
import type { Project } from '../../src/project/types';

/** The compositor's per-layer keys: a layer is drawn again only when what draws it changed. */

const R = { rw: 540, rh: 675, scale: 0.5, quality: 'preview' };

function project(): Project {
  const p = newProject({ name: 'caché', w: 1080, h: 1350 });
  const src = sourceFromMedia({ id: 'a1b2c3d4e5f60718', kind: 'image', w: 1080, h: 1350 });
  p.sources.push(src);
  p.layers.push(newLayer('photo', { name: 'Foto', source: src.id }));
  p.layers.push(newLayer('glyphs', { name: 'Caracteres', source: src.id, mask: { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'rect', op: 'add', x: 0.1, y: 0.1, w: 0.5, h: 0.5, rot: 0, soft: 0, alpha: 1 }] } }));
  p.layers.push(newLayer('ascii', { name: 'ASCII', source: 'below' }));
  return p;
}

const keysAt = (p: Project, t = 0, r = R) => {
  const st = evaluate(p, t);
  let below: string | null = `${st.bg}|${r.rw}x${r.rh}`;
  return st.layers.map(lf => {
    const k = layerKeys(lf, st, r, below);
    below = below !== null && k ? `${below}\n${k.out}|${compositeKey(lf)}` : null;
    return k;
  });
};

describe('layer keys (compositor caches)', () => {
  it('the same project gives the same keys', () => {
    const p = project();
    expect(keysAt(p)).toEqual(keysAt(cloneProject(p)));
  });

  it('opacity, blend, transform and name do not touch a layer’s picture', () => {
    const p = project();
    const q = cloneProject(p);
    Object.assign(q.layers[1], { opacity: 0.4, blend: 'screen', name: 'Otro', locked: true, xf: { x: 0.1, y: 0, scale: 1.2, rot: 5 } });
    const a = keysAt(p), b = keysAt(q);
    expect(b[1]!.out).toBe(a[1]!.out);
    // the layer above reads the composite under it, which did change
    expect(b[2]!.content).not.toBe(a[2]!.content);
  });

  it('a mask change keeps the content and changes the masked picture', () => {
    const p = project();
    const q = cloneProject(p);
    const part = q.layers[1].mask!.parts[0] as { x: number };
    part.x = 0.2;
    const a = keysAt(p), b = keysAt(q);
    expect(b[1]!.content).toBe(a[1]!.content);
    expect(b[1]!.out).not.toBe(a[1]!.out);
    expect(b[0]!.out).toBe(a[0]!.out);
  });

  it('a style change changes the content', () => {
    const p = project();
    const q = cloneProject(p);
    if (q.layers[1].kind === 'glyphs') q.layers[1].glyphs.cell += 2;
    expect(keysAt(q)[1]!.content).not.toBe(keysAt(p)[1]!.content);
  });

  it('time: ASCII layers and their composites depend on it, a photo of an image does not', () => {
    const p = project();
    const a = keysAt(p, 0), b = keysAt(p, 1.5);
    expect(b[0]!.out).toBe(a[0]!.out);
    expect(b[1]!.out).toBe(a[1]!.out);
    expect(b[2]!.out).not.toBe(a[2]!.out);
  });

  it('render size and quality are part of the key', () => {
    const p = project();
    expect(keysAt(p, 0, { ...R, rw: 1080, rh: 1350, scale: 1, quality: 'final' })[0]!.content).not.toBe(keysAt(p)[0]!.content);
  });

  it('a composite that cannot be keyed makes the layers reading it uncacheable', () => {
    const p = project();
    const st = evaluate(p, 0);
    const lf = st.layers[2];
    expect(layerKeys(lf, st, R, null)).toBeNull();
    // per-cell hooks (functions from clips) are never kept
    expect(layerKeys({ ...st.layers[1], reveal: () => () => 1 }, st, R, 'x')).toBeNull();
  });
});
