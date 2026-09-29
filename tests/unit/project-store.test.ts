import { beforeEach, describe, expect, it } from 'vitest';
import { defaultRecipe } from '../../src/engine/recipe';
import { cssAdjustCpu, cssFilter, fitRect, toneCpu } from '../../src/project/adjust';
import { diceTarget, rollProject, varyProject } from '../../src/project/dice';
import { defaultAdjust, newLayer, projectFromImage } from '../../src/project/normalize';
import {
  addLayer, commitVersion, edit, moveLayer, nextVersion, openProject, prevVersion, redo, removeLayer, restoreVersion, rollDice, setKey, setLocks,
  toggleFavorite, undo, undoDepth, updateLayer, useProject, vary, UNDO_LIMIT,
} from '../../src/project/store';
import type { AsciiLayer, Project } from '../../src/project/types';
import { addVersion, emptyVersions, normalizeVersions, variantsOf } from '../../src/project/versions';

function project(): Project {
  const p = projectFromImage({ id: '0123456789abcdef', kind: 'image', w: 1200, h: 800 });
  const style = defaultRecipe();
  style.source = 'image';
  p.layers.push(newLayer('ascii', { source: p.sources[0].id, style, mask: { invert: false, feather: 2, opacity: 1, parts: [{ kind: 'ellipse', op: 'add', x: 0.2, y: 0.2, w: 0.4, h: 0.4, rot: 0, soft: 0, alpha: 1 }] } }));
  return p;
}
const P = () => useProject.getState().project!;
let seeds = 0;
const fresh = () => `semilla-${seeds++}`;

beforeEach(() => { openProject(project()); seeds = 0; setLocks([], []); });

describe('edits, undo and redo', () => {
  it('every edit is a new project (the old one is never changed) and undo/redo walk them', () => {
    const first = P();
    edit(p => { p.name = 'uno'; });
    const second = P();
    expect(second).not.toBe(first);
    expect(first.name).not.toBe('uno');
    updateLayer(first.layers[0].id, { opacity: 0.5 });
    expect(P().layers[0].opacity).toBe(0.5);
    expect(undo()).toBe(true);
    expect(P()).toBe(second);
    expect(undo()).toBe(true);
    expect(P()).toBe(first);
    expect(undo()).toBe(false);
    expect(redo()).toBe(true);
    expect(P().name).toBe('uno');
    // a new edit drops what could be redone
    edit(p => { p.name = 'dos'; });
    expect(useProject.getState().canRedo).toBe(false);
  });

  it('edits with the same key close together are one step (a slider drag)', () => {
    const id = P().layers[1].id;
    for (let i = 1; i <= 20; i++) updateLayer(id, { opacity: i / 20 }, 'opacity');
    expect(undoDepth().past).toBe(1);
    undo();
    expect(P().layers[1].opacity).toBe(1);
  });

  it('keeps at least 100 steps (UNDO_LIMIT)', () => {
    expect(UNDO_LIMIT).toBeGreaterThanOrEqual(100);
    for (let i = 0; i < UNDO_LIMIT + 30; i++) edit(p => { p.name = `paso ${i}`; });
    expect(undoDepth().past).toBe(UNDO_LIMIT);
    let n = 0;
    while (undo()) n++;
    expect(n).toBe(UNDO_LIMIT);
    expect(P().name).toBe('paso 29');
  });

  it('layers: add (selected), move, remove (its keyframes too); keys are set in place', () => {
    const t = newLayer('text');
    addLayer(t);
    expect(useProject.getState().selection).toEqual([t.id]);
    setKey(t.id, 'opacity', 0, 0);
    setKey(t.id, 'opacity', 2, 1);
    setKey(t.id, 'opacity', 2, 0.8);
    expect(P().tracks[0].keys.map(k => k.v)).toEqual([0, 0.8]);
    moveLayer(t.id, 0);
    expect(P().layers[0].id).toBe(t.id);
    removeLayer(t.id);
    expect(P().layers.some(l => l.id === t.id)).toBe(false);
    expect(P().tracks).toHaveLength(0);
  });
});

describe('versions', () => {
  it('restore gives back exactly the project a version holds', () => {
    const v1 = commitVersion('guardado', { label: 'antes' })!;
    const kept = JSON.stringify(P());
    edit(p => { p.name = 'cambiado'; p.layers[0].opacity = 0.2; });
    commitVersion('edición');
    expect(restoreVersion(v1.id)).toBe(true);
    expect(JSON.stringify(P())).toBe(kept);
    expect(useProject.getState().versions.cursor).toBe(0);
    expect(nextVersion()).toBe(true);
    expect(P().name).toBe('cambiado');
    expect(prevVersion()).toBe(true);
    expect(JSON.stringify(P())).toBe(kept);
    // and restoring is an edit: undo goes back
    undo();
    expect(P().name).toBe('cambiado');
  });

  it('rolls and variations are linked to the version they came from; favourites survive the limit', () => {
    const r1 = rollDice({ fresh })!;
    expect(r1.layer).toBe(P().layers[1].id);
    const vl = useProject.getState().versions;
    expect(vl.list.map(v => v.kind)).toEqual(['inicio', 'azar']);
    expect(vl.list[1].parent).toBe(vl.list[0].id);
    vary({ seed: 'v1' });
    const vl2 = useProject.getState().versions;
    expect(vl2.list[2]).toMatchObject({ kind: 'variación', parent: vl2.list[1].id, seed: 'v1' });
    expect(variantsOf(vl2, vl2.list[1].id)).toHaveLength(1);
    toggleFavorite(vl2.list[0].id);
    let list = useProject.getState().versions;
    for (let i = 0; i < 12; i++) list = addVersion(list, P(), { kind: 'edición', limit: 5 }).vl;
    expect(list.list).toHaveLength(5);
    expect(list.list[0].fav).toBe(true);
    expect(normalizeVersions(JSON.parse(JSON.stringify(list)))).toEqual(list);
    expect(normalizeVersions('basura')).toEqual(emptyVersions());
  });
});

describe('dice', () => {
  it('re-rolls the style of the top ASCII layer; the same seed gives the same style', () => {
    const p = project();
    const before = JSON.stringify(p);
    const a = rollProject(p, { seed: 'uno' }), b = rollProject(p, { seed: 'uno' }), c = rollProject(p, { seed: 'dos' });
    expect(JSON.stringify((a.project.layers[1] as AsciiLayer).style)).toBe(JSON.stringify((b.project.layers[1] as AsciiLayer).style));
    expect(JSON.stringify((a.project.layers[1] as AsciiLayer).style)).not.toBe(JSON.stringify((c.project.layers[1] as AsciiLayer).style));
    // never changes the project given, nor any other layer, nor the mask
    expect(JSON.stringify(p)).toBe(before);
    expect(a.project.layers[0]).toEqual(p.layers[0]);
    expect(a.project.layers[1].mask).toEqual(p.layers[1].mask);
    // the picture keeps feeding it
    expect((a.project.layers[1] as AsciiLayer).style.source).toBe('image');
    expect((a.project.layers[1] as AsciiLayer).style.interact.mode).toBe('none');
  });

  it('honours locks and the keep set (paleta = colours stay)', () => {
    const p = project();
    const base = (p.layers[1] as AsciiLayer).style;
    for (let i = 0; i < 8; i++) {
      const r = rollProject(p, { fresh, locks: ['glifos'], keep: ['paleta', 'seleccion'] });
      const s = (r.project.layers[1] as AsciiLayer).style;
      expect(s.color).toEqual(base.color);
      expect(s.glyph).toEqual(base.glyph);
      expect(s.tone).toEqual(base.tone);
      expect(r.project.layers[1].mask).toEqual(p.layers[1].mask);
    }
    const v = varyProject(p, { seed: 'x', locks: ['color'] });
    expect((v.project.layers[1] as AsciiLayer).style.color).toEqual(base.color);
  });

  it('does nothing without an ASCII layer; picks the asked one', () => {
    const p = projectFromImage({ id: '0123456789abcdef', kind: 'image', w: 10, h: 10 });
    expect(rollProject(p).layer).toBeNull();
    const q = project();
    q.layers.push(newLayer('ascii'));
    expect(diceTarget(q)?.id).toBe(q.layers[2].id);
    expect(diceTarget(q, q.layers[1].id)?.id).toBe(q.layers[1].id);
  });
});

describe('photo adjustments', () => {
  it('the CSS filter string says only what changes', () => {
    expect(cssFilter(defaultAdjust(), 1)).toBe('none');
    expect(cssFilter({ ...defaultAdjust(), bright: -0.2, blur: 4, mono: true }, 0.5)).toBe('brightness(0.8) grayscale(1) blur(2px)');
  });

  it('the CPU versions follow the CSS formulas', () => {
    const px = () => new Uint8ClampedArray([200, 100, 50, 255]);
    let d = px(); cssAdjustCpu(d, 1, 1, { ...defaultAdjust(), bright: -0.5 }, 1);
    expect(Array.from(d)).toEqual([100, 50, 25, 255]);
    d = px(); cssAdjustCpu(d, 1, 1, { ...defaultAdjust(), contrast: 2 }, 1);
    expect(Array.from(d)).toEqual([255, 72, 0, 255]); // (v − 127.5)·2 + 127.5, rounded half to even
    d = px(); cssAdjustCpu(d, 1, 1, { ...defaultAdjust(), invert: true }, 1);
    expect(Array.from(d)).toEqual([55, 155, 205, 255]);
    d = px(); cssAdjustCpu(d, 1, 1, { ...defaultAdjust(), mono: true }, 1);
    expect(d[0]).toBe(d[1]);
    d = px(); cssAdjustCpu(d, 1, 1, { ...defaultAdjust(), sat: 0 }, 1);
    expect(Math.abs(d[0] - d[2])).toBeLessThanOrEqual(1);
    d = px(); toneCpu(d, 1, 1, { ...defaultAdjust(), temp: 0.5 });
    expect(d[0]).toBeGreaterThan(200);
    expect(d[2]).toBeLessThan(50);
  });

  it('sharpening is sized in output px: a smaller render sharpens like the file made smaller, not four times as coarsely', () => {
    // a 64×64 grey picture with detail at every scale
    const N = 64;
    const img = new Uint8ClampedArray(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = 128 + 50 * Math.sin(x * 0.9) * Math.cos(y * 0.35) + 40 * Math.sin(x * 0.2 + y * 0.13);
      const o = (y * N + x) * 4;
      img[o] = img[o + 1] = img[o + 2] = v; img[o + 3] = 255;
    }
    /** Averages k×k blocks (what a preview at 1/k is made of). */
    const shrink = (d: Uint8ClampedArray, n: number, k: number) => {
      const m = n / k, out = new Uint8ClampedArray(m * m * 4);
      for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += d[((y * k + j) * n + x * k + i) * 4 + c];
        out[(y * m + x) * 4 + c] = s / (k * k);
      }
      return out;
    };
    const err = (a: Uint8ClampedArray, b: Uint8ClampedArray, m: number) => {
      let s = 0, n = 0;
      // (the rim of the picture keeps its pixels: leave it out)
      for (let y = 3; y < m - 3; y++) for (let x = 3; x < m - 3; x++) { s += Math.abs(a[(y * m + x) * 4] - b[(y * m + x) * 4]); n++; }
      return s / n;
    };
    const sharp = { ...defaultAdjust(), sharpen: 1 };
    // the file (scale 1), made 4× smaller: what the preview should look like
    const file = img.slice(); toneCpu(file, N, N, sharp, 1);
    const want = shrink(file, N, 4);
    // the preview: the picture drawn 4× smaller, then its adjustments at scale 0.25
    const plain = shrink(img, N, 4);
    const preview = plain.slice(); toneCpu(preview, N / 4, N / 4, sharp, 0.25);
    expect(err(preview, want, N / 4)).toBeLessThanOrEqual(err(plain, want, N / 4) + 0.5);
    // and at scale 1 it is the classic 3×3 unsharp mask: v + 1.5·(v − box)
    const one = img.slice(); toneCpu(one, N, N, sharp);
    const at = (x: number, y: number) => img[(y * N + x) * 4];
    let box = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) box += at(20 + i, 30 + j);
    expect(Math.abs(one[(30 * N + 20) * 4] - Math.min(255, Math.max(0, at(20, 30) + 1.5 * (at(20, 30) - box / 9))))).toBeLessThanOrEqual(1);
  });

  it('fit: cover fills and crops, contain fits inside, fill stretches', () => {
    expect(fitRect(200, 100, 100, 100, 'cover')).toEqual({ x: -50, y: 0, w: 200, h: 100 });
    expect(fitRect(200, 100, 100, 100, 'contain')).toEqual({ x: 0, y: 25, w: 100, h: 50 });
    expect(fitRect(200, 100, 100, 100, 'fill')).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});
