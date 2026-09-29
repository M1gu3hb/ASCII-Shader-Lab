import { describe, expect, it } from 'vitest';
import { newLayer, newProject, sourceFromMedia } from '../../src/project/normalize';
import type { Project } from '../../src/project/types';
import { pickAudioSource, planAudio, videoSourcesInOrder } from '../../src/video/audioplan';

function videoProject(o: { duration: number; videoLen: number; span?: { in: number; out: number } | null; hasAudio?: boolean }): Project {
  const p = newProject({ w: 320, h: 180, duration: o.duration, fps: 10 });
  const s = sourceFromMedia({ id: '0123456789abcdef', kind: 'video', name: 'clip.webm', w: 320, h: 180 }, { duration: o.videoLen, fps: 10, hasAudio: o.hasAudio ?? true });
  p.sources.push(s);
  p.layers.push(newLayer('photo', { source: s.id, span: o.span ?? null }));
  p.layers.push(newLayer('ascii', { source: 'below' }));
  return p;
}

describe('which sound goes out', () => {
  it('the bottom-most video source with sound by default; another one when asked', () => {
    const p = videoProject({ duration: 2, videoLen: 4 });
    const second = sourceFromMedia({ id: 'fedcba9876543210', kind: 'video', name: 'b.webm', w: 320, h: 180 }, { duration: 3, hasAudio: true });
    const silent = sourceFromMedia({ id: 'aaaaaaaaaaaaaaaa', kind: 'video', name: 'mudo.webm', w: 320, h: 180 }, { duration: 3, hasAudio: false });
    p.sources.push(second, silent);
    p.layers.unshift(newLayer('photo', { source: silent.id }));
    p.layers.push(newLayer('photo', { source: second.id }));
    expect(videoSourcesInOrder(p).map(s => s.name)).toEqual(['mudo.webm', 'clip.webm', 'b.webm']);
    expect(pickAudioSource(p)?.name).toBe('clip.webm');
    expect(pickAudioSource(p, second.id)?.name).toBe('b.webm');
    // asking for a source without sound falls back to the default
    expect(pickAudioSource(p, silent.id)?.name).toBe('clip.webm');
  });
});

describe('audio plan', () => {
  it('a straight range of a longer video: one segment, copy possible', () => {
    const p = videoProject({ duration: 4, videoLen: 10 });
    const plan = planAudio(p, { start: 1, end: 3, fps: 10, source: p.sources[0] });
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].out).toBe(0);
    expect(plan.segments[0].src).toBeCloseTo(1, 6);
    expect(plan.segments[0].dur).toBeCloseTo(2, 6);
    expect(plan.straight).toBe(true);
    expect(plan.notes).toEqual([]);
  });

  it('a video shorter than the project loops, and so does its sound', () => {
    const p = videoProject({ duration: 5, videoLen: 2 });
    const plan = planAudio(p, { fps: 10, source: p.sources[0] });
    expect(plan.segments.map(s => [Math.round(s.out * 10) / 10, Math.round(s.src * 10) / 10, Math.round(s.dur * 10) / 10])).toEqual([[0, 0, 2], [2, 0, 2], [4, 0, 1]]);
    expect(plan.straight).toBe(false);
    expect(plan.notes[0]).toMatch(/se repite/);
  });

  it('silence while the layer that shows the video is off', () => {
    const p = videoProject({ duration: 4, videoLen: 10, span: { in: 1, out: 3 } });
    const plan = planAudio(p, { fps: 10, source: p.sources[0] });
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].out).toBeCloseTo(1, 6);
    // the picture there is the file at project time (sourceTime is project time for a video)
    expect(plan.segments[0].src).toBeCloseTo(1, 6);
    expect(plan.segments[0].dur).toBeCloseTo(2, 6);
    expect(plan.gaps.map(g => g.why)).toEqual(['hidden', 'hidden']);
    expect(plan.notes.join(' ')).toMatch(/no se ve/);
  });

  it('speed changes and reverse stretches are left silent, and said so', () => {
    const p = videoProject({ duration: 3, videoLen: 10 });
    // 0–1 s normal, 1–2 s double speed, 2–3 s reverse
    const clock = (t: number) => (t < 1 ? t : t < 2 ? 1 + (t - 1) * 2 : 3 - (t - 2));
    const plan = planAudio(p, { fps: 10, source: p.sources[0], clock });
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].dur).toBeCloseTo(1, 6);
    expect(plan.gaps.map(g => g.why)).toEqual(['speed', 'reverse']);
    expect(plan.notes.join(' ')).toMatch(/reversa/);
    expect(plan.notes.join(' ')).toMatch(/velocidad/);
  });

  it('no source, no sound', () => {
    const p = videoProject({ duration: 2, videoLen: 2, hasAudio: false });
    expect(pickAudioSource(p)).toBeNull();
    expect(planAudio(p, { source: null }).segments).toEqual([]);
  });
});
