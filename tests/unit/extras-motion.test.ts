import { describe, expect, it } from 'vitest';
import '../../src/anim/index';
import type { MediaRef } from '../../src/engine/recipe';
import { applyParallax, cameraAt, hasParallax, PARALLAX_PRESETS, parallaxTracks, removeParallax } from '../../src/anim/parallax';
import { evaluate, sequenceIndex } from '../../src/project/evaluate';
import { newLayer, projectFromImage, uid } from '../../src/project/normalize';
import type { GlyphsLayer, Project, Source } from '../../src/project/types';
import { splitDepth, subjectOf } from '../../src/foto/extras/depth';
import { applySequence, fadeKeys, photoAt, reorder, sequenceDuration, sequenceProject, sequenceSpecOf, type SequenceSpec } from '../../src/foto/extras/sequence';
import { applyWords, DEFAULT_WORDS, wordsProject, wordsSpecOf } from '../../src/foto/extras/words';

const ref = (c: string, w = 1200, h = 900): MediaRef => ({ id: c.repeat(16).slice(0, 16), kind: 'image', name: `${c}.jpg`, w, h });
const photos = [ref('a'), ref('b'), ref('c')];
const spec = (o: Partial<SequenceSpec> = {}): SequenceSpec => ({ photos, hold: 1.5, transition: 'corte', change: 0.5, loop: true, ...o });

function withCutout(p: Project, aspect = true): Source {
  const main = p.sources[0];
  const cut: Source = { id: uid(), kind: 'cutout', name: 'Recorte', media: [ref('k', main.w, main.h)], w: aspect ? main.w : 500, h: aspect ? main.h : 900, cutout: { from: main.id, matte: ref('m', main.w, main.h) } };
  p.sources.push(cut);
  return cut;
}

describe('photo sequences', () => {
  it('orders the photos, holds each one and loops', () => {
    const p = sequenceProject(spec());
    const s = p.sources[0];
    expect(s.kind).toBe('sequence');
    expect(s.media.map(m => m.id)).toEqual(photos.map(m => m.id));
    expect(p.time.duration).toBeCloseTo(4.5);
    for (const t of [0, 1.49, 1.5, 2.9, 3.1, 4.49, 4.5, 6.1]) expect(sequenceIndex(s, t)).toBe(photoAt(spec(), t));
    expect([0, 1.6, 3.2].map(t => photoAt(spec(), t))).toEqual([0, 1, 2]);
    expect(reorder(photos, 2, 0).map(m => m.name)).toEqual(['c.jpg', 'a.jpg', 'b.jpg']);
    expect(reorder(photos, 0, 5).map(m => m.name)).toEqual(['b.jpg', 'c.jpg', 'a.jpg']);
    expect(sequenceDuration({ photos, hold: 99 })).toBe(30);
  });

  it('the cross-fade shows the next photo only over the end of each one', () => {
    const p = sequenceProject(spec({ transition: 'fundido', change: 0.5 }));
    const fade = p.layers.find(l => l.name.startsWith('Fundido'))!;
    const next = p.sources.find(s => s.id === (fade as { source: string }).source)!;
    expect(next.media.map(m => m.id)).toEqual([photos[1].id, photos[2].id, photos[0].id]);
    const op = (t: number) => evaluate(p, t).layers.find(l => l.layer.id === fade.id)?.layer.opacity ?? 0;
    expect(op(0.5)).toBe(0);
    expect(op(1.25)).toBeGreaterThan(0.3);
    expect(op(1.4995)).toBeGreaterThan(0.99);
    expect(op(1.5)).toBe(0);
    expect(op(2.0)).toBe(0);
    expect(fadeKeys(3, 1.5, 0.5, false).length).toBe(1 + 2 * 3);
  });

  it('«Transición entre fotos» covers each change with characters over the sequence', () => {
    const p = sequenceProject(spec({ transition: 'caracteres', change: 0.6 }));
    const tr = p.layers.find(l => l.kind === 'glyphs')!;
    expect(tr.clips[0]).toMatchObject({ template: 'secuencia-fotos', start: 0, dur: 4.5 });
    const vis = (t: number) => evaluate(p, t).layers.find(l => l.layer.id === tr.id)!;
    // mid-photo the characters are gone (opacity 0); near a cut they show through a per-cell reveal
    expect(vis(0.75).layer.opacity).toBe(0);
    const near = vis(1.55);
    expect(near.layer.opacity).toBeGreaterThan(0);
    expect(near.reveal ?? near.cells).not.toBeNull();
    expect(sequenceProject(spec({ transition: 'ascii' })).layers.some(l => l.kind === 'ascii')).toBe(true);
  });

  it('rebuilding keeps the person’s layers, rebinds them and reads the spec back', () => {
    const p = sequenceProject(spec({ transition: 'fundido' }));
    const own = newLayer('glyphs', { name: 'Mía', source: p.sources[0].id });
    p.layers.push(own, newLayer('text', { name: 'Título' }));
    const next = applySequence(p, { ...spec({ transition: 'caracteres', hold: 2 }), photos: reorder(photos, 0, 2) });
    expect(next.layers.map(l => l.name)).toEqual(['Secuencia de fotos', 'Transición entre fotos', 'Mía', 'Título']);
    const src = next.sources.find(s => s.kind === 'sequence' && s.id.startsWith('sqsrc_'))!;
    expect((next.layers[2] as GlyphsLayer).source).toBe(src.id);
    expect(next.sources.filter(s => s.kind === 'sequence')).toHaveLength(1);
    expect(next.time.duration).toBe(6);
    const back = sequenceSpecOf(next)!;
    expect(back.photos.map(m => m.name)).toEqual(['b.jpg', 'c.jpg', 'a.jpg']);
    expect(back).toMatchObject({ hold: 2, transition: 'caracteres' });
    expect(sequenceSpecOf(sequenceProject(spec({ transition: 'fundido', change: 0.7 })))).toMatchObject({ transition: 'fundido', change: 0.7 });
  });
});

describe('depth and parallax', () => {
  function layered(): Project {
    const p = projectFromImage(ref('p'));
    const near = newLayer('text', { name: 'Cerca' }); near.depth = 2;
    const mid = newLayer('text', { name: 'Plano' }); mid.depth = 0;
    const far = newLayer('photo', { name: 'Lejos', source: p.sources[0].id }); far.depth = -1;
    p.layers[0].depth = 1;
    p.layers.push(near, mid, far);
    return p;
  }

  it('a pan moves each layer by its depth, leaves the plane still, and comes back', () => {
    const p = layered();
    const m = { ...PARALLAX_PRESETS[0].move, amount: 0.03, dur: 4 };
    const plan = parallaxTracks(p, m);
    const byName = (n: string) => p.layers.find(l => l.name === n)!.id;
    expect(plan.moved).not.toContain(byName('Plano'));
    const d = structuredClone(p);
    applyParallax(d, m);
    const x = (t: number, n: string) => evaluate(d, t).layers.find(l => l.layer.name === n)!.layer.xf.x;
    const t = 1; // a quarter of the move: the camera at its right-most point
    expect(x(t, 'Cerca')).toBeCloseTo(-0.06, 3);
    expect(x(t, 'Foto original')).toBeCloseTo(-0.03, 3);
    expect(x(t, 'Lejos')).toBeCloseTo(0.03, 3);
    expect(x(t, 'Plano')).toBe(0);
    for (const n of ['Cerca', 'Lejos']) { expect(x(0, n)).toBeCloseTo(0, 5); expect(x(4, n)).toBeCloseTo(0, 5); }
    // the full-frame photos are drawn larger so their edges never show; text is not
    expect(plan.overscan[byName('Lejos')]).toBeGreaterThan(1 + 2 * 0.03);
    expect(plan.overscan[byName('Cerca')]).toBeUndefined();
    expect(d.time.duration).toBe(4);
    expect(d.time.loop).toBe(true);
    expect(hasParallax(d)).toBe(true);
  });

  it('a zoom grows near layers more than far ones; an orbit is a loop through the rest position', () => {
    const p = layered();
    const d = structuredClone(p);
    applyParallax(d, { kind: 'zoom', amount: 0.2, dur: 3 });
    const s = (n: string) => evaluate(d, 3).layers.find(l => l.layer.name === n)!.layer.xf.scale;
    expect(s('Cerca')).toBeGreaterThan(s('Plano'));
    expect(s('Plano')).toBeGreaterThan(1);
    expect(s('Lejos')).toBeGreaterThanOrEqual(1);
    expect(s('Cerca')).toBeGreaterThan(s('Lejos'));
    const o = PARALLAX_PRESETS.find(x => x.id === 'orbita')!.move;
    expect(cameraAt(o, 0)).toEqual({ x: 0, y: 0, z: 0 });
    const end = cameraAt(o, 1);
    expect(Math.abs(end.x) + Math.abs(end.y)).toBeLessThan(1e-9);
    for (let u = 0; u <= 1; u += 0.05) { const c = cameraAt(o, u); expect(Math.max(Math.abs(c.x), Math.abs(c.y))).toBeLessThanOrEqual(1 + 1e-9); }
  });

  it('applying replaces earlier placement keys; removing takes the move away', () => {
    const p = layered();
    const near = p.layers.find(l => l.name === 'Cerca')!;
    p.tracks.push({ layer: near.id, path: 'xf.x', keys: [{ t: 0, v: 0.5, ease: { kind: 'linear' } }] });
    const d = structuredClone(p);
    const r = applyParallax(d, PARALLAX_PRESETS[2].move);
    expect(r.replaced).toBe(1);
    expect(d.tracks.filter(t => t.layer === near.id && t.path === 'xf.x')).toHaveLength(1);
    expect(removeParallax(d)).toBeGreaterThan(0);
    expect(hasParallax(d)).toBe(false);
  });

  it('splits a cut-out into a subject in front and its background behind, with a hole and a blurred fill', () => {
    const p = projectFromImage(ref('s', 1200, 900));
    expect(splitDepth(p).notes.join(' ')).toMatch(/Quitar fondo/);
    const cut = withCutout(p);
    expect(subjectOf(p)?.cutout?.id).toBe(cut.id);
    const r = splitDepth(p);
    const names = r.project.layers.map(l => [l.name, l.depth]);
    expect(names).toEqual([['Relleno del fondo', -1.2], ['Foto original', -1], ['Sujeto (delante)', 1]]);
    const back = r.project.layers[1];
    expect(back.mask!.parts[0]).toMatchObject({ kind: 'raster', op: 'subtract', media: cut.cutout!.matte });
    expect(r.project.layers[0].kind === 'photo' && r.project.layers[0].adjust.blur).toBeGreaterThan(10);
    // a canvas of another shape: no hole (the matte would not fit), and a note
    const q = projectFromImage(ref('t', 1200, 900));
    withCutout(q);
    q.canvas = { ...q.canvas, w: 1080, h: 1920 };
    const r2 = splitDepth(q);
    expect(r2.project.layers.find(l => l.name === 'Foto original')!.mask).toBeNull();
    expect(r2.notes.join(' ')).toMatch(/forma de la foto/);
    // a subject mask (from «Quitar fondo» as a mask) works too
    const m = projectFromImage(ref('u'));
    m.layers[0].mask = { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'raster', op: 'add', media: ref('v'), soft: 0, alpha: 1, origin: 'subject' }] };
    const r3 = splitDepth(m);
    expect(r3.front).not.toBeNull();
    expect(r3.project.layers.find(l => l.id === r3.front)!.mask!.parts[0].op).toBe('add');
  });
});

describe('words forming the figure', () => {
  it('flows the words over the light zones, arrives flying when asked, and is replaced when done again', () => {
    const p = projectFromImage(ref('w'));
    const r = applyWords(p, { ...DEFAULT_WORDS, words: '  hola   mundo ', animate: true, dur: 3 });
    const g = r.project.layers.find(l => l.kind === 'glyphs') as GlyphsLayer;
    expect(g.glyphs).toMatchObject({ charset: 'palabras', fill: 'words', chars: 'hola mundo', invert: false, wrap: 'word' });
    expect(g.source).toBe(p.sources[0].id);
    expect(g.clips[0]).toMatchObject({ template: 'palabras-figura', dur: 3 });
    expect(r.project.time.duration).toBeGreaterThanOrEqual(3.3);
    const again = applyWords(r.project, { ...DEFAULT_WORDS, figure: 'oscuros', animate: false });
    expect(again.project.layers.length).toBe(r.project.layers.length);
    expect((again.project.layers.find(l => l.kind === 'glyphs') as GlyphsLayer).glyphs.invert).toBe(true);
    expect(wordsSpecOf(again.project)).toMatchObject({ figure: 'oscuros', animate: false });
  });

  it('fills only the subject of a cut-out, or says how to get one', () => {
    const p = projectFromImage(ref('x'));
    const none = applyWords(p, { ...DEFAULT_WORDS, figure: 'sujeto' });
    expect(none.notes.join(' ')).toMatch(/Quitar fondo/);
    const cut = withCutout(p);
    const r = applyWords(p, { ...DEFAULT_WORDS, figure: 'sujeto', color: 'foto', background: 'tenue' });
    const g = r.project.layers.find(l => l.kind === 'glyphs') as GlyphsLayer;
    expect(g.source).toBe(cut.id);
    expect(g.glyphs.color).toBe('source');
    expect(r.notes).toEqual([]);
    expect(wordsSpecOf(r.project)).toMatchObject({ figure: 'sujeto', color: 'foto', background: 'tenue' });
    const n = wordsProject(ref('y'), DEFAULT_WORDS).project;
    expect(n.layers.map(l => l.kind)).toEqual(['photo', 'shape', 'glyphs']);
  });
});
