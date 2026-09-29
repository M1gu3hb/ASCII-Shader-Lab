import { beforeEach, describe, expect, it } from 'vitest';
import type { MediaRef } from '../../src/engine/recipe';
import { layerKeys, rasterRefsAt } from '../../src/project/compositor';
import { evaluate } from '../../src/project/evaluate';
import { newLayer, projectFromImage, projectFromVideo } from '../../src/project/normalize';
import { openProject, undo, useProject } from '../../src/project/store';
import type { MaskRasterPart, Project } from '../../src/project/types';
import { applyVideoMatte, stretchOfLayer } from '../../src/foto/cutout/VideoCutout';
import { sameState } from '../../src/foto/playback';
import { clipFormat, CLIP_UNSUPPORTED } from '../../src/foto/camera';
import { correctionAt, defaultEnd, trackKeys, trackParts, videoFor } from '../../src/foto/tools/track';

/** The studio's video editing, the pure parts: which video a track follows, its keyframes, the stretch a correction recomputes, the masks a frame needs. */

const ref = (i: number, role = ''): MediaRef => ({ id: `m${String(i).padStart(15, '0')}`, kind: 'image', name: `pista-${String(i).padStart(6, '0')}${role ? '-' + role : ''}.png`, w: 320, h: 180 });

/** A tracked part of 90 frames at 30 fps: keyframes every 15 frames and the last one. */
function tracked(): MaskRasterPart {
  const frames = Array.from({ length: 90 }, (_, i) => ({ t: i / 30, media: ref(i, i % 15 === 0 || i === 89 ? 'clave' : '') }));
  return { kind: 'raster', op: 'add', media: frames[0].media, frames, interp: true, soft: 0.5, alpha: 1, origin: 'track' };
}

function videoProject(): Project {
  const p = projectFromVideo({ id: 'v000000000000001', kind: 'video', name: 'cuadrado.webm', w: 320, h: 180 }, { duration: 3, fps: 30, hasAudio: true });
  p.layers.push(newLayer('ascii', { name: 'ASCII', source: 'below', mask: { invert: false, feather: 0, opacity: 1, parts: [tracked()] } }));
  return p;
}

describe('the masks a frame needs', () => {
  it('a tracked part reads the frame at t and, interpolated, the next one; a still part its own picture', () => {
    const part = tracked();
    expect(rasterRefsAt(part, 0).map(m => m.id)).toEqual([ref(0).id]);
    // between frame 10 and 11: both, blended
    expect(rasterRefsAt(part, 10.5 / 30).map(m => m.id)).toEqual([ref(10).id, ref(11).id]);
    expect(rasterRefsAt({ ...part, interp: false }, 10.5 / 30).map(m => m.id)).toEqual([ref(10).id]);
    const still: MaskRasterPart = { kind: 'raster', op: 'add', media: ref(7), soft: 0, alpha: 1 };
    expect(rasterRefsAt(still, 1.2)).toEqual([ref(7)]);
  });

  it('a picture that a playing video handed out is kept apart from the exact frame at the same time', () => {
    const p = videoProject();
    const st = evaluate(p, 1);
    const r = { rw: 320, rh: 180, scale: 1, quality: 'final' };
    const exact = layerKeys(st.layers[0], st, r, 'x', { image: () => null, frameKey: () => '' });
    const live = layerKeys(st.layers[0], st, r, 'x', { image: () => null, frameKey: () => '~vivo' });
    expect(exact!.content).not.toBe(live!.content);
    // without the optional frameKey the keys are what they were
    expect(layerKeys(st.layers[0], st, r, 'x', { image: () => null })!.content).toBe(exact!.content);
  });
});

describe('«Seguir objeto»', () => {
  it('follows the layer\'s own video, or the video under the layer; nothing without a video', () => {
    const p = videoProject();
    expect(videoFor(p, p.layers[1])?.id).toBe(p.sources[0].id);
    expect(videoFor(p, p.layers[0])?.id).toBe(p.sources[0].id);
    const photo = projectFromImage({ id: 'i000000000000001', kind: 'image', w: 800, h: 600 });
    expect(videoFor(photo, photo.layers[0])).toBeNull();
  });

  it('the stretch ends where the layer\'s span does, else at the end of the project', () => {
    const p = videoProject();
    expect(defaultEnd(p, p.layers[1])).toBe(3);
    p.layers[1].span = { in: 0.5, out: 2 };
    expect(defaultEnd(p, p.layers[1])).toBe(2);
  });

  it('knows the keyframes of a track (for the timeline) by the names of its frames', () => {
    const k = trackKeys(tracked());
    expect(k.map(x => Math.round(x.t * 30))).toEqual([0, 15, 30, 45, 60, 75, 89]);
    expect(k.every(x => x.role === 'clave')).toBe(true);
    const p = videoProject();
    expect(trackParts(p.layers[1]).map(x => x.index)).toEqual([0]);
    expect(trackParts(p.layers[0])).toEqual([]);
  });

  it('a correction recomputes only the stretch between the keyframes around its frame; none outside the track', () => {
    const p = videoProject();
    const c = correctionAt(p.layers[1], null, 36 / 30)!;
    expect(c.frame).toBe(36);
    expect([Math.round(c.from * 30), Math.round(c.to * 30)]).toEqual([30, 45]);
    // on a keyframe: between the ones before and after it
    const k = correctionAt(p.layers[1], null, 1.5)!;
    expect([Math.round(k.from * 30), Math.round(k.to * 30)]).toEqual([30, 60]);
    expect(correctionAt(p.layers[1], null, 4)).toBeNull();
    expect(correctionAt(p.layers[0], null, 1)).toBeNull();
  });
});

describe('the video clock in React', () => {
  it('a clock that hands out a new object each time is read as the same state until something changes', () => {
    const a = { playing: true, rate: 1, region: { in: 0.5, out: 1.5 } };
    expect(sameState(a, { playing: true, rate: 1, region: { in: 0.5, out: 1.5 } })).toBe(true);
    expect(sameState(a, { playing: false, rate: 1, region: { in: 0.5, out: 1.5 } })).toBe(false);
    expect(sameState(a, { playing: true, rate: -1, region: { in: 0.5, out: 1.5 } })).toBe(false);
    expect(sameState(a, { playing: true, rate: 1, region: null })).toBe(false);
    expect(sameState(null, a)).toBe(false);
  });
});

describe('video background removal, applied', () => {
  const part = (): MaskRasterPart => ({ ...tracked(), origin: 'subject', soft: 0 });
  beforeEach(() => { const p = videoProject(); p.layers[1].mask = null; openProject(p, { select: [p.layers[1].id] }); });
  const P = () => useProject.getState().project!;

  it('the subject as the target\'s mask, the background as the subject taken out of it, each one undo step', () => {
    const target = P().layers[1].id;
    applyVideoMatte(part(), 'subject', P().sources[0], target);
    expect(P().layers[1].mask!.parts[0]).toMatchObject({ kind: 'raster', op: 'add', origin: 'subject' });
    undo();
    expect(P().layers[1].mask).toBeNull();
    applyVideoMatte(part(), 'background', P().sources[0], target);
    expect(P().layers[1].mask!.parts[0]).toMatchObject({ op: 'subtract', origin: 'background' });
  });

  it('a cut-out layer: the same video with the subject\'s mask, just above the target', () => {
    const target = P().layers[0].id;
    applyVideoMatte(part(), 'layer', P().sources[0], target);
    const l = P().layers[1];
    expect(l).toMatchObject({ kind: 'photo', name: 'Video recortado', source: P().sources[0].id });
    expect(l.mask!.parts[0]).toMatchObject({ op: 'add', origin: 'subject' });
    expect(P().layers.length).toBe(3);
    undo();
    expect(P().layers.length).toBe(2);
  });

  it('works on the stretch the layer shows', () => {
    const p = P();
    expect(stretchOfLayer(p, p.layers[1])).toEqual({ start: 0, end: 3 });
    expect(stretchOfLayer(p, { ...p.layers[1], span: { in: 1, out: 2.5 } })).toEqual({ start: 1, end: 2.5 });
  });
});

describe('camera clips', () => {
  it('a browser without MediaRecorder says so, with what to do instead', () => {
    expect(clipFormat()).toBeNull();
    expect(CLIP_UNSUPPORTED).toMatch(/no puede grabar video/);
    expect(CLIP_UNSUPPORTED).toMatch(/Toma una foto/);
  });
});
