import { describe, expect, it } from 'vitest';
import { defaultRecipe } from '../../src/engine/recipe';
import {
  LAYER_KINDS, LIMITS, isProjectLike, newLayer, newProject, normLayer, normalizeProject, projectFromImage, projectFromRecipe, projectFromSequence,
  projectFromVideo, uid,
} from '../../src/project/normalize';
import type { Layer, Project } from '../../src/project/types';

/** A small seeded PRNG for the fuzz (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = ['kind', 'v', 'id', 'name', 'canvas', 'w', 'h', 'bg', 'transparent', 'time', 'duration', 'fps', 'loop', 'seed', 'sources', 'media', 'layers',
  'tracks', 'meta', 'source', 'style', 'glyphs', 'mask', 'parts', 'op', 'x', 'y', 'pts', 'keys', 't', 'ease', 'p', 'path', 'layer', 'clips', 'template',
  'finishes', 'amount', 'params', 'opacity', 'blend', 'span', 'in', 'out', 'xf', 'scale', 'rot', 'adjust', 'text', 'shape', 'label', 'fit', 'frames',
  'pressure', 'size', 'hardness', 'soft', 'alpha', 'color', 'tol', 'cutout', 'matte', 'hold', '__proto__', 'constructor'];
const KINDS = [...LAYER_KINDS, 'video', 'mystery', 'image', 'sequence', 'cutout', 'rect', 'ellipse', 'polygon', 'stroke', 'raster', 'color', 'grain', 'dither', 'bezier', 'step', 'glyphos-project', 'below', 'style'];

function garbage(r: () => number, depth = 0): unknown {
  const k = r();
  if (depth > 4 || k < 0.25) {
    const c = r();
    if (c < 0.15) return null;
    if (c < 0.3) return undefined;
    if (c < 0.5) return [NaN, Infinity, -Infinity, -1e308, 1e308, 0, -0, 0.5, 3, -7, 12345.678][Math.floor(r() * 11)];
    if (c < 0.75) return KINDS[Math.floor(r() * KINDS.length)];
    if (c < 0.85) return r() < 0.5;
    if (c < 0.92) return '#' + Math.floor(r() * 0xffffff).toString(16);
    return 'x'.repeat(Math.floor(r() * 50));
  }
  if (k < 0.55) {
    const n = Math.floor(r() * 6);
    return Array.from({ length: n }, () => garbage(r, depth + 1));
  }
  const o: Record<string, unknown> = {};
  const n = Math.floor(r() * 8);
  for (let i = 0; i < n; i++) o[KEYS[Math.floor(r() * KEYS.length)]] = garbage(r, depth + 1);
  if (r() < 0.4) o.kind = KINDS[Math.floor(r() * KINDS.length)];
  return o;
}

/** A plausible project with random damage, so the fuzz reaches deep into layers, masks and tracks. */
function damaged(r: () => number): unknown {
  const p = JSON.parse(JSON.stringify(sampleProject())) as Record<string, unknown>;
  const paths: Array<[Record<string, unknown> | unknown[], string | number]> = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) { paths.push([o as Record<string, unknown>, k]); walk((o as Record<string, unknown>)[k]); }
  };
  walk(p);
  for (let i = 0; i < 12; i++) {
    const [o, k] = paths[Math.floor(r() * paths.length)];
    (o as Record<string | number, unknown>)[k] = garbage(r, 2);
  }
  return p;
}

function sampleProject(): Project {
  const ref = { id: '0123456789abcdef', kind: 'image' as const, name: 'foto.jpg', type: 'image/jpeg', size: 1000, w: 1600, h: 1000 };
  const p = projectFromImage(ref, { duration: 4 });
  const src = p.sources[0].id;
  p.layers.push(newLayer('ascii', { source: src, mask: { invert: false, feather: 4, opacity: 1, parts: [{ kind: 'ellipse', op: 'add', x: 0.2, y: 0.2, w: 0.5, h: 0.5, rot: 10, soft: 3, alpha: 1 }] } }));
  p.layers.push(newLayer('glyphs', { source: src, finishes: [{ kind: 'grain', on: true, amount: 0.5, params: { size: 2, futuro: 'x' } }] }));
  p.layers.push(newLayer('text', { path: { kind: 'spiral', cx: 0.5, cy: 0.5, r: 0.3, start: 0, turns: 2 } }));
  p.layers.push(newLayer('shape', { shape: 'callout', pts: [0.1, 0.1, 0.4, 0.4], label: { text: 'FL33', font: 'jetbrains', size: 0.02, color: '#ffffff' } }));
  p.tracks.push({ layer: p.layers[1].id, path: 'opacity', keys: [{ t: 0, v: 0, ease: { kind: 'bezier', p: [0.2, 0, 0.2, 1] } }, { t: 2, v: 1, ease: { kind: 'linear' } }] });
  p.layers[1].clips.push({ id: uid(), template: 'foto-a-ascii', start: 0, dur: 2, params: { modo: 'barrido', otro: 3 }, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false });
  return p;
}

/** Everything a valid project must satisfy. */
function assertValid(p: Project) {
  expect(p.kind).toBe('glyphos-project');
  expect(p.v).toBe(1);
  expect(p.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  expect(typeof p.name).toBe('string');
  expect(p.canvas.w).toBeGreaterThanOrEqual(LIMITS.canvasMin);
  expect(p.canvas.w).toBeLessThanOrEqual(LIMITS.canvasMax);
  expect(p.canvas.h).toBeGreaterThanOrEqual(LIMITS.canvasMin);
  expect(p.canvas.bg).toMatch(/^#[0-9a-f]{6}$/);
  expect(Number.isFinite(p.time.duration) && p.time.duration >= 0).toBe(true);
  expect(p.time.fps).toBeGreaterThan(0);
  expect(typeof p.seed).toBe('string');
  const ids = new Set<string>();
  for (const l of p.layers) {
    expect(LAYER_KINDS).toContain(l.kind);
    expect(ids.has(l.id)).toBe(false);
    ids.add(l.id);
    expect(l.opacity).toBeGreaterThanOrEqual(0);
    expect(l.opacity).toBeLessThanOrEqual(1);
    expect(Number.isFinite(l.xf.x + l.xf.y + l.xf.scale + l.xf.rot)).toBe(true);
    if (l.span) expect(l.span.out).toBeGreaterThan(l.span.in);
    for (const part of l.mask?.parts ?? []) expect(['add', 'subtract', 'intersect']).toContain(part.op);
    for (const f of l.finishes) for (const v of Object.values(f.params)) expect(['number', 'string', 'boolean']).toContain(typeof v);
    for (const c of l.clips) { expect(c.dur).toBeGreaterThan(0); expect(c.repeat).toBeGreaterThanOrEqual(1); }
  }
  for (const t of p.tracks) {
    expect(ids.has(t.layer)).toBe(true);
    expect(t.keys.length).toBeGreaterThan(0);
    for (let i = 1; i < t.keys.length; i++) expect(t.keys[i].t).toBeGreaterThanOrEqual(t.keys[i - 1].t);
  }
  for (const s of p.sources) expect(s.media.length).toBeGreaterThan(0);
  // plain JSON all the way down (it is saved and packed as JSON)
  expect(JSON.parse(JSON.stringify(p))).toEqual(p);
}

describe('normalizeProject', () => {
  it('never throws, on random garbage and on damaged projects, and always returns a valid project', () => {
    const r = rng(20260928);
    for (let i = 0; i < 400; i++) {
      const input = i % 2 ? garbage(r) : damaged(r);
      let out: Project | undefined;
      expect(() => { out = normalizeProject(input); }).not.toThrow();
      assertValid(out!);
    }
  });

  it('survives hostile inputs: cycles, throwing getters, huge arrays, prototype keys', () => {
    const cyc: Record<string, unknown> = { kind: 'glyphos-project', layers: [] };
    cyc.self = cyc;
    (cyc.layers as unknown[]).push(cyc);
    const trap = { kind: 'glyphos-project', get layers(): unknown { throw new Error('boom'); } };
    const huge = { kind: 'glyphos-project', layers: Array.from({ length: 5000 }, () => ({ kind: 'text' })) };
    const proto = JSON.parse('{"kind":"glyphos-project","__proto__":{"polluted":1},"layers":[{"kind":"shape","__proto__":{"x":1}}],"tracks":[{"layer":"a","path":"__proto__.polluted","keys":[{"t":0,"v":1}]}]}');
    for (const x of [cyc, trap, huge, proto, 'texto', 42, null, undefined, [], new Date(), () => 1]) {
      const p = normalizeProject(x);
      assertValid(p);
    }
    expect(normalizeProject(huge).layers.length).toBe(LIMITS.layers);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('is idempotent and keeps a valid project as it is', () => {
    const p = sampleProject();
    const a = normalizeProject(p);
    // everything but the finish, whose params the finishes module completes with its defaults
    expect({ ...a, layers: a.layers.map(l => ({ ...l, finishes: [] })) }).toEqual({ ...p, layers: p.layers.map(l => ({ ...l, finishes: [] })) });
    expect(a.layers[2].finishes[0]).toMatchObject({ kind: 'grain', amount: 0.5, params: { size: 2, futuro: 'x' } });
    expect(normalizeProject(a)).toEqual(a);
    const r = rng(7);
    for (let i = 0; i < 100; i++) {
      const once = normalizeProject(damaged(r));
      expect(normalizeProject(JSON.parse(JSON.stringify(once)))).toEqual(once);
    }
  });

  it('fills defaults, clamps, drops unknown layer kinds and keeps unknown finish and clip params', () => {
    const p = normalizeProject({
      kind: 'glyphos-project', canvas: { w: 99999, h: 3, bg: 'rojo' }, time: { duration: -3, fps: 0 },
      layers: [
        { kind: 'photo', opacity: 7, blend: 'plasma', xf: { scale: 0 } },
        { kind: 'holograma' },
        { kind: 'ascii', source: 'below', finishes: [{ kind: 'dither', params: { algoritmo: 'nuevo', n: 3, obj: { x: 1 } } }, { kind: 'no-existe' }], clips: [{ template: 'plantilla-futura', dur: 0, params: { a: 1 } }] },
      ],
    });
    expect(p.canvas).toEqual({ w: 8192, h: 16, bg: '#0c0b0a', transparent: false });
    expect(p.time.duration).toBe(0);
    expect(p.time.fps).toBe(1);
    expect(p.layers.map(l => l.kind)).toEqual(['photo', 'ascii']);
    expect(p.layers[0].opacity).toBe(1);
    expect(p.layers[0].blend).toBe('normal');
    expect(p.layers[0].xf.scale).toBe(0.01);
    expect(p.layers[1].finishes).toHaveLength(1);
    expect(p.layers[1].finishes[0]).toMatchObject({ kind: 'dither', on: true, amount: 1, params: { n: 3 } });
    // a param of a newer catalog (a plain value) stays; one that is not a plain value goes
    expect('obj' in p.layers[1].finishes[0].params).toBe(false);
    expect(p.layers[1].clips[0]).toMatchObject({ template: 'plantilla-futura', dur: 0.01, params: { a: 1 }, repeat: 1 });
    // the ascii layer got a full recipe
    expect(p.layers[1].kind === 'ascii' && p.layers[1].style.v).toBe(2);
  });

  it('drops keyframes of layers that do not exist and sorts keys', () => {
    const p = normalizeProject({
      kind: 'glyphos-project', layers: [{ kind: 'text', id: 'titulo' }],
      tracks: [
        { layer: 'titulo', path: 'opacity', keys: [{ t: 2, v: 1 }, { t: 0, v: 0 }, { t: 'x', v: 1 }, { t: 1, v: { no: 1 } }] },
        { layer: 'fantasma', path: 'opacity', keys: [{ t: 0, v: 1 }] },
        { layer: 'titulo', path: 'opacity', keys: [{ t: 5, v: 0 }] },
        { layer: 'titulo', path: 'bad path!', keys: [{ t: 0, v: 1 }] },
      ],
    });
    expect(p.tracks).toHaveLength(1);
    expect(p.tracks[0].keys.map(k => k.t)).toEqual([0, 2]);
  });

  it('gives a second layer with the same id its own id', () => {
    const p = normalizeProject({ kind: 'glyphos-project', layers: [{ kind: 'text', id: 'a' }, { kind: 'shape', id: 'a' }] });
    expect(p.layers[0].id).toBe('a');
    expect(p.layers[1].id).not.toBe('a');
  });

  it('isProjectLike tells projects from other JSON', () => {
    expect(isProjectLike(newProject())).toBe(true);
    expect(isProjectLike(defaultRecipe())).toBe(false);
    expect(isProjectLike({ glyphos: 'recipe' })).toBe(false);
  });
});

describe('new projects and layers', () => {
  const ref = { id: 'aaaaaaaaaaaaaaaa', kind: 'image' as const, name: 'retrato.png', w: 6000, h: 4000 };

  it('every new layer is already normal', () => {
    for (const k of LAYER_KINDS) {
      const l = newLayer(k);
      expect(normLayer(l, l.id)).toEqual(l);
    }
  });

  it('a photo project: one photo layer, frame at the photo aspect, at most 4096 px', () => {
    const p = projectFromImage(ref);
    expect(p.layers).toHaveLength(1);
    expect(p.layers[0].kind).toBe('photo');
    expect(p.canvas.w).toBe(4096);
    expect(p.canvas.h).toBe(2731);
    expect(p.name).toBe('retrato');
    expect(normalizeProject(p)).toEqual(p);
  });

  it('a video project takes its duration and frame rate; a sequence, hold × photos', () => {
    const v = projectFromVideo({ id: 'bbbbbbbbbbbbbbbb', kind: 'video', w: 1920, h: 1080 }, { duration: 7.5, fps: 24, hasAudio: true });
    expect(v.time).toMatchObject({ duration: 7.5, fps: 24 });
    expect(v.sources[0]).toMatchObject({ kind: 'video', duration: 7.5, fps: 24, hasAudio: true });
    const s = projectFromSequence([ref, { ...ref, id: 'cccccccccccccccc' }, { ...ref, id: 'dddddddddddddddd' }], 0.5);
    expect(s.time.duration).toBe(1.5);
    expect(s.sources[0].kind).toBe('sequence');
    expect(s.sources[0].media).toHaveLength(3);
    expect(normalizeProject(s)).toEqual(s);
  });

  it('a lab piece with a photo: the photo, then its recipe as an opaque ASCII layer fed by it', () => {
    const r = defaultRecipe();
    r.source = 'image';
    r.media.ref = ref;
    r.meta.name = 'Retrato';
    const p = projectFromRecipe(r);
    expect(p.layers.map(l => l.kind)).toEqual(['photo', 'ascii']);
    const a = p.layers[1] as Extract<Layer, { kind: 'ascii' }>;
    expect(a.source).toBe(p.sources[0].id);
    expect(a.opaque).toBe(true);
    expect(a.style.media.ref).toBeUndefined();
    expect(a.style.glyph).toEqual(r.glyph);
    expect(p.meta.origin).toBe('lab');
  });

  it('a lab piece without a picture: its own pattern', () => {
    const p = projectFromRecipe(defaultRecipe());
    expect(p.layers).toHaveLength(1);
    expect(p.layers[0]).toMatchObject({ kind: 'ascii', source: 'style' });
  });

  it('ids are distinct', () => {
    const s = new Set(Array.from({ length: 2000 }, uid));
    expect(s.size).toBe(2000);
  });
});
