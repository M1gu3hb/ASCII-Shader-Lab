import { describe, expect, it } from 'vitest';
import { defaultRecipe, type MediaRef } from '../../src/engine/recipe';
import { newLayer, projectFromImage, projectFromVideo, uid } from '../../src/project/normalize';
import {
  applyPreset, normalizePreset, presetFileName, presetFileText, presetFromLayer, presetFromProject, presetFromRecipe, readPresetText, SLOT_CUT, SLOT_MAIN,
} from '../../src/project/presets';
import { posterProject } from '../../src/project/posters';
import type { GlyphsLayer, Project } from '../../src/project/types';

const ref = (id: string, w = 1200, h = 900, kind: 'image' | 'video' = 'image'): MediaRef => ({ id: id.repeat(16).slice(0, 16), kind, name: 'f', w, h });

/** A photo project with a glyph layer that has a shape mask, a painted mask part, a clip and keyframes. */
function source(): Project {
  const p = projectFromVideo(ref('a', 1920, 1080, 'video'), { duration: 10, fps: 30 });
  const g = newLayer('glyphs', {
    name: 'Letras', source: p.sources[0].id,
    mask: { invert: false, feather: 12, opacity: 1, parts: [
      { kind: 'ellipse', op: 'add', x: 0.2, y: 0.1, w: 0.5, h: 0.6, rot: 0, soft: 4, alpha: 1 },
      { kind: 'raster', op: 'subtract', media: ref('m'), soft: 0, alpha: 1, origin: 'subject' },
      { kind: 'color', op: 'intersect', source: p.sources[0].id, color: '#ff0000', tol: 0.2, soft: 0.1, alpha: 1 },
    ] },
    finishes: [{ kind: 'glow', on: true, amount: 0.8, params: { radius: 20 } }],
    clips: [{ id: uid(), template: 'foto-a-ascii', start: 2, dur: 4, params: {}, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false }],
  });
  g.glyphs = { ...g.glyphs, charset: 'braille', cell: 7 };
  p.layers.push(g);
  p.tracks.push({ layer: g.id, path: 'opacity', keys: [{ t: 0, v: 0, ease: { kind: 'linear' } }, { t: 5, v: 1, ease: { kind: 'linear' } }] });
  return p;
}

describe('saved settings', () => {
  it('a layer setting keeps style, finishes, clips, keys and geometric mask parts; drops the painted one with a note', () => {
    const p = source();
    const g = p.layers[1] as GlyphsLayer;
    const s = presetFromLayer(p, g.id, 'Mi braille')!;
    expect(s.scope).toBe('layer');
    expect(s.name).toBe('Mi braille');
    const l = s.layers[0] as GlyphsLayer;
    expect(l.source).toBe(SLOT_MAIN);
    expect(l.glyphs.charset).toBe('braille');
    expect(l.finishes[0].kind).toBe('glow');
    expect(l.clips).toHaveLength(1);
    expect(l.mask!.parts.map(x => x.kind)).toEqual(['ellipse', 'color']);
    expect((l.mask!.parts[1] as { source: string }).source).toBe(SLOT_MAIN);
    expect(s.tracks).toHaveLength(1);
    expect(s.notes.join(' ')).toMatch(/pintada o recortada/);
    expect(JSON.stringify(s)).not.toContain(p.sources[0].id);
  });

  it('applies to another photo: sources rebound, new ids, times scaled when asked, a still gets the length', () => {
    const s = (() => { const q = source(); return presetFromLayer(q, q.layers[1].id); })()!;
    const src = source();
    const s2 = presetFromLayer(src, src.layers[1].id)!;
    const other = projectFromVideo(ref('b', 1080, 1920, 'video'), { duration: 5, fps: 30 });
    const r = applyPreset(other, s2, { scaleTime: true });
    const added = r.project.layers[r.project.layers.length - 1] as GlyphsLayer;
    expect(added.source).toBe(other.sources[0].id);
    expect(added.id).not.toBe(src.layers[1].id);
    expect(added.clips[0].start).toBeCloseTo(1);
    expect(added.clips[0].dur).toBeCloseTo(2);
    const tr = r.project.tracks.find(t => t.layer === added.id)!;
    expect(tr.keys.map(k => k.t)).toEqual([0, 2.5]);
    expect((added.mask!.parts[1] as { source: string }).source).toBe(other.sources[0].id);
    // shape parts stay in frame units
    expect(added.mask!.parts[0]).toMatchObject({ kind: 'ellipse', x: 0.2, y: 0.1, w: 0.5, h: 0.6 });
    // not scaled: times kept, and the note says so
    const r2 = applyPreset(other, s2, { scaleTime: false });
    expect((r2.project.layers.at(-1) as GlyphsLayer).clips[0].start).toBe(2);
    expect(r2.notes.join(' ')).toMatch(/conservan sus tiempos/);
    // on a still photo the project takes the setting's length
    const still = projectFromImage(ref('c'));
    const r3 = applyPreset(still, s, {});
    expect(r3.project.time.duration).toBe(10);
    // applying twice makes two layers with their own ids
    const twice = applyPreset(r3.project, s, {});
    const ids = twice.project.layers.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('replacing the selected layer keeps its place and its source', () => {
    const s = (() => { const q = source(); return presetFromLayer(q, q.layers[1].id); })()!;
    const p = projectFromImage(ref('d'));
    const a = newLayer('ascii', { source: p.sources[0].id });
    p.layers.push(a, newLayer('text'));
    const r = applyPreset(p, s, { target: a.id });
    expect(r.project.layers).toHaveLength(3);
    expect(r.project.layers[1].kind).toBe('glyphs');
    expect((r.project.layers[1] as GlyphsLayer).source).toBe(p.sources[0].id);
  });

  it('a project setting replaces the composition; the canvas follows the photo or keeps a designed format', () => {
    const p = source();
    const s = presetFromProject(p, 'Todo');
    expect(s.layers).toHaveLength(2);
    expect(s.from.follows).toBe(true);
    const other = projectFromImage(ref('e', 800, 1200));
    const r = applyPreset(other, s);
    expect(r.project.layers.map(l => l.kind)).toEqual(['photo', 'glyphs']);
    expect(r.project.canvas.w / r.project.canvas.h).toBeCloseTo(800 / 1200, 2);
    // a poster setting keeps its page
    const poster = posterProject('suizo', ref('f'), { format: { size: 'a4' } });
    const ps = presetFromProject(poster);
    expect(ps.from.follows).toBe(false);
    const r2 = applyPreset(other, ps);
    expect([r2.project.canvas.w, r2.project.canvas.h]).toEqual([2480, 3508]);
    expect(r2.project.layers.filter(l => 'source' in l && l.source === other.sources[0].id).length).toBeGreaterThan(0);
  });

  it('a cut-out slot binds to the new cut-out, or to the photo with a note', () => {
    const p = projectFromImage(ref('g'));
    const cut = { id: uid(), kind: 'cutout' as const, name: 'R', media: [ref('h')], w: 1200, h: 900, cutout: { from: p.sources[0].id, matte: ref('i') } };
    p.sources.push(cut);
    p.layers.push(newLayer('glyphs', { source: cut.id }));
    const s = presetFromLayer(p, p.layers[1].id)!;
    expect((s.layers[0] as GlyphsLayer).source).toBe(SLOT_CUT);
    const plain = projectFromImage(ref('j'));
    const r = applyPreset(plain, s);
    expect((r.project.layers[1] as GlyphsLayer).source).toBe(plain.sources[0].id);
    expect(r.notes.join(' ')).toMatch(/Quitar fondo/);
    const withCut = projectFromImage(ref('k'));
    const cut2 = { ...cut, id: uid(), cutout: { ...cut.cutout, from: withCut.sources[0].id } };
    withCut.sources.push(cut2);
    expect((applyPreset(withCut, s).project.layers[1] as GlyphsLayer).source).toBe(cut2.id);
  });

  it('files round-trip and anything else is refused or cleaned, never trusted', () => {
    const s = (() => { const q = source(); return presetFromLayer(q, q.layers[1].id, 'Braille · vídeo'); })()!;
    s.thumb = 'data:image/webp;base64,AAAA';
    const back = readPresetText(presetFileText(s));
    expect(back.ok && back.preset).toEqual(s);
    expect(presetFileName(s)).toBe('braille-video.glyphos-ajuste.json');
    expect(readPresetText('{no json').ok).toBe(false);
    expect(readPresetText(JSON.stringify(source())).ok).toBe(false);
    const project = readPresetText(JSON.stringify(source()));
    expect(!project.ok && project.message).toMatch(/Abrir un proyecto/);
    expect(readPresetText(JSON.stringify({ glyphos: 'ajuste', version: 99, preset: s })).ok).toBe(false);
    expect(readPresetText('x'.repeat(2_000_001)).ok).toBe(false);
    // crafted: foreign sources, raster parts, script thumbnails, prototype keys, absurd numbers
    const evil = JSON.parse(presetFileText(s));
    evil.preset.layers[0].source = 'otra-foto-ajena';
    evil.preset.layers[0].mask.parts.push({ kind: 'raster', op: 'add', media: { id: 'f'.repeat(16), kind: 'image', w: 1, h: 1 }, soft: 0, alpha: 1 });
    evil.preset.layers[0].opacity = 1e9;
    evil.preset.layers[0].glyphs.cell = -5;
    evil.preset.thumb = 'javascript:alert(1)';
    evil.preset.name = 'a\u0000b'.repeat(100);
    evil.preset.__proto__ = { polluted: true };
    evil.preset.tracks.push({ layer: evil.preset.layers[0].id, path: '__proto__.x', keys: [{ t: 0, v: 1 }] });
    const r = readPresetText(JSON.stringify(evil));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const l = r.preset.layers[0] as GlyphsLayer;
    expect(l.source).toBe(SLOT_MAIN);
    expect(l.mask!.parts.some(x => x.kind === 'raster')).toBe(false);
    expect(l.opacity).toBe(1);
    expect(l.glyphs.cell).toBeGreaterThan(0);
    expect(r.preset.thumb).toBeUndefined();
    expect(r.preset.name.length).toBeLessThanOrEqual(80);
    expect(r.preset.name).not.toMatch(/\u0000/);
    expect(r.preset.tracks.every(t => !t.path.includes('__proto__'))).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(normalizePreset({ kind: 'glyphos-preset', scope: 'layer', layers: [] })).toBeNull();
    expect(normalizePreset({ kind: 'glyphos-preset', scope: 'otra', layers: [newLayer('text')] })).toBeNull();
  });

  it('a lab style becomes a setting of one ASCII layer over the photo', () => {
    const r = defaultRecipe();
    const s = presetFromRecipe(r, 'Del laboratorio');
    expect(s.layers[0].kind).toBe('ascii');
    const p = projectFromImage(ref('l'));
    const out = applyPreset(p, s);
    expect(out.project.layers[1]).toMatchObject({ kind: 'ascii', source: p.sources[0].id });
  });
});
