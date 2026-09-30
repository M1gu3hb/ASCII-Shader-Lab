import { describe, expect, it } from 'vitest';
import '../../src/anim/index';
import { applyChoreo, choreograph, CHOREOS, choreosFor } from '../../src/anim/choreo';
import { curveBox, curvePath, dragHandle, easeOfHandles, fromPx, handlesOf, hitHandle, nudgeHandle, reverseHandles, toPx, Y_MAX, Y_MIN } from '../../src/anim/curve';
import { EASE_PRESETS, easeFromPreset, easeLabel, easeSamples, presetOf, sameEase } from '../../src/anim/ease';
import { addClip, clipOverlaps, contentEnd, deleteClip, duplicateClip, moveClip, resizeClip, setClipEase, setClipParam, setClipReverse, setSpan } from '../../src/anim/edit';
import { addKey, animatablePaths, deleteKey, findClip, keyTimes, moveKey, onFrame, pathInfo, setClipLoop, setKeyEase, setKeyValue, setProjectLoop, shiftKeys, valueAt } from '../../src/anim/keys';
import { orderField, withHolds } from '../../src/anim/kit';
import { libraryByGroup, libraryItems, newClip } from '../../src/anim/library';
import { listParam, templateById } from '../../src/project/clips';
import { easeAt } from '../../src/project/ease';
import { evaluate, getPath } from '../../src/project/evaluate';
import { newLayer, newProject, normalizeProject } from '../../src/project/normalize';
import type { Project } from '../../src/project/types';

function project(): Project {
  const p = newProject({ w: 400, h: 300, duration: 5 });
  const g = newLayer('glyphs', { id: 'g' });
  const t = newLayer('text', { id: 't', text: 'hola' });
  const a = newLayer('ascii', { id: 'a', mask: { invert: false, feather: 3, opacity: 1, parts: [{ kind: 'rect', op: 'add', x: 0.1, y: 0.1, w: 0.4, h: 0.4, rot: 0, soft: 0, alpha: 1 }] } });
  const s = newLayer('shape', { id: 's', fill: '#ff0000' });
  p.layers.push(g, t, a, s);
  return p;
}

describe('ease presets', () => {
  it('are named in Spanish, start at 0, end at 1 and round-trip through presetOf', () => {
    expect(EASE_PRESETS.length).toBeGreaterThanOrEqual(12);
    for (const pr of EASE_PRESETS) {
      expect(easeAt(pr.ease, 0)).toBeCloseTo(0, 9);
      expect(easeAt(pr.ease, 1)).toBeCloseTo(1, 9);
      expect(presetOf(pr.ease)?.id).toBe(pr.id);
      expect(sameEase(easeFromPreset(pr.id), pr.ease)).toBe(true);
    }
    expect(easeLabel({ kind: 'bezier', p: [0.1, 0.2, 0.3, 0.4] })).toBe('Curva propia');
  });

  it('behave as named: suave is symmetric, rebote overshoots, anticipación dips, escalón jumps, mantener holds', () => {
    const at = (id: string, x: number) => easeAt(easeFromPreset(id), x);
    expect(at('suave', 0.5)).toBeCloseTo(0.5, 3);
    expect(at('suave', 0.2)).toBeLessThan(0.2);
    expect(Math.max(...easeSamples(easeFromPreset('rebote-contenido'), 64).map(s => s[1]))).toBeGreaterThan(1.02);
    expect(Math.min(...easeSamples(easeFromPreset('anticipacion'), 64).map(s => s[1]))).toBeLessThan(-0.02);
    expect(at('escalon', 0.01)).toBe(1);
    expect(at('mantener', 0.99)).toBe(0);
    expect(at('acelera', 0.3)).toBeLessThan(0.3);
    expect(at('frena', 0.3)).toBeGreaterThan(0.3);
    // normalizeProject keeps them (a project file carries them as they are)
    const p = newProject();
    p.layers.push(newLayer('text', { id: 'x' }));
    p.tracks.push({ layer: 'x', path: 'opacity', keys: [{ t: 0, v: 0, ease: easeFromPreset('anticipa-y-rebota') }, { t: 1, v: 1, ease: { kind: 'linear' } }] });
    expect(presetOf(normalizeProject(JSON.parse(JSON.stringify(p))).tracks[0].keys[0].ease)?.id).toBe('anticipa-y-rebota');
  });
});

describe('curve editor model', () => {
  it('handles of named curves and beziers; step and hold have none', () => {
    expect(handlesOf({ kind: 'inOut' })).toEqual([0.42, 0, 0.58, 1]);
    expect(handlesOf({ kind: 'bezier', p: [0.1, 0.2, 0.3, 0.4] })).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(handlesOf({ kind: 'step' })).toBeNull();
    expect(handlesOf({ kind: 'linear' })!.map(v => easeAt({ kind: 'bezier', p: handlesOf({ kind: 'linear' }) as [number, number, number, number] }, v))).toBeTruthy();
  });

  it('dragging keeps x inside 0..1 (time never runs back), clamps y, snaps near 0 and 1', () => {
    const h = dragHandle([0.3, 0.1, 0.7, 0.9], 1, -0.4, 9);
    expect(h[0]).toBe(0);
    expect(h[1]).toBe(Y_MAX);
    expect(dragHandle([0.3, 0.1, 0.7, 0.9], 2, 1.02, 0.985)).toEqual([0.3, 0.1, 1, 1]);
    expect(dragHandle([0.3, 0.1, 0.7, 0.9], 2, 0.5, -9)[3]).toBe(Y_MIN);
    expect(nudgeHandle([0.3, 0.1, 0.7, 0.9], 2, 0.01, -0.1)).toEqual([0.3, 0.1, 0.71, 0.8]);
    const e = easeOfHandles([0.123456, 0.5, 2, 3]);
    expect(e).toEqual({ kind: 'bezier', p: [0.1235, 0.5, 1, Y_MAX] });
  });

  it('px ↔ curve units are inverse; the box makes room for overshoot; hit tests find the nearest handle', () => {
    const e = easeFromPreset('rebote-contenido');
    const b = curveBox(e, 260, 190, 18);
    expect(b.ymax).toBeGreaterThan(1.3);
    for (const [x, y] of [[0, 0], [0.3, 1.2], [1, 1]] as const) {
      const [px, py] = toPx(b, x, y);
      const [x2, y2] = fromPx(b, px, py);
      expect(x2).toBeCloseTo(x, 9); expect(y2).toBeCloseTo(y, 9);
    }
    const h = handlesOf(e)!;
    const [ax, ay] = toPx(b, h[0], h[1]);
    expect(hitHandle(b, h, ax + 3, ay - 2)).toBe(1);
    expect(hitHandle(b, h, ax + 100, ay + 100)).toBeNull();
    expect(curvePath(e, b)).toMatch(/^M [\d.]+ [\d.]+ C /);
    expect(curvePath({ kind: 'hold' }, b)).toMatch(/L/);
  });

  it('reversed handles draw the curve played backwards', () => {
    const h: [number, number, number, number] = [0.6, 0, 0.9, 0.4];
    const r = reverseHandles(h);
    for (const x of [0.1, 0.35, 0.8]) expect(easeAt({ kind: 'bezier', p: r }, x)).toBeCloseTo(1 - easeAt({ kind: 'bezier', p: h }, 1 - x), 3);
  });
});

describe('keyframes', () => {
  it('every animatable path exists on its layer with the declared type', () => {
    const p = project();
    p.layers[0].finishes.push({ kind: 'glow', on: true, amount: 1, params: { threshold: 0.5, radius: 20, strength: 1, tint: '#ffffff', blend: 'screen' } });
    const n = normalizeProject(JSON.parse(JSON.stringify(p)));
    for (const l of n.layers) {
      const paths = animatablePaths(l);
      expect(paths.length).toBeGreaterThan(5);
      for (const info of paths) {
        const v = getPath(l, info.path);
        const type = info.type === 'color' ? 'string' : info.type;
        expect(typeof v, `${l.kind} ${info.path}`).toBe(type);
      }
    }
    expect(pathInfo(n.layers[0], 'glyphs.cell')?.label).toBe('Tamaño de celda');
    expect(pathInfo(n.layers[0], 'finishes.0.params.radius')?.group).toBe('Acabados');
    expect(pathInfo(n.layers[2], 'mask.parts.0.w')).not.toBeNull();
    expect(pathInfo(n.layers[3], 'fill')?.type).toBe('color');
  });

  it('a key added at the playhead takes the value there, so the picture does not change', () => {
    const p = project();
    p.tracks.push({ layer: 't', path: 'opacity', keys: [{ t: 0, v: 0, ease: { kind: 'linear' } }, { t: 2, v: 1, ease: { kind: 'linear' } }] });
    const before = evaluate(p, 1).layers.find(l => l.layer.id === 't')!.layer.opacity;
    expect(valueAt(p, 't', 'opacity', 1)).toBeCloseTo(0.5);
    expect(addKey(p, 't', 'opacity', 1)).toBe(1);
    expect(p.tracks[0].keys.map(k => k.t)).toEqual([0, 1, 2]);
    expect(evaluate(p, 1).layers.find(l => l.layer.id === 't')!.layer.opacity).toBeCloseTo(before);
    // a path without a track starts from the layer's own value
    expect(addKey(p, 'g', 'glyphs.cell', 0.5)).toBe(0.5);
    expect(p.tracks.find(t => t.path === 'glyphs.cell')!.keys[0].v).toBe(p.layers[0].kind === 'glyphs' ? p.layers[0].glyphs.cell : -1);
    expect(addKey(p, 'g', 'no.such', 1)).toBeNull();
    expect(addKey(p, 'nadie', 'opacity', 1)).toBeNull();
  });

  it('move, shift, delete, ease and value edits', () => {
    const p = project();
    addKey(p, 't', 'opacity', 0, 0); addKey(p, 't', 'opacity', 1, 1); addKey(p, 't', 'opacity', 2, 0.5);
    expect(moveKey(p, 't', 'opacity', 1, 2)).toBe(2);
    // the key already at 2 is replaced
    expect(p.tracks[0].keys.map(k => [k.t, k.v])).toEqual([[0, 0], [2, 1]]);
    const refs = shiftKeys(p, [{ layer: 't', path: 'opacity', t: 0 }, { layer: 't', path: 'opacity', t: 2 }], -0.5);
    // never before 0: the whole selection moves by as much as it can
    expect(refs.map(r => r.t).sort()).toEqual([0, 2]);
    shiftKeys(p, refs, 0.25);
    expect(p.tracks[0].keys.map(k => k.t)).toEqual([0.25, 2.25]);
    expect(setKeyEase(p, 't', 'opacity', 0.25, easeFromPreset('suave'))).toBe(true);
    expect(presetOf(p.tracks[0].keys[0].ease)?.id).toBe('suave');
    expect(setKeyValue(p, 't', 'opacity', 2.25, 0.3)).toBe(true);
    expect(keyTimes(p)).toEqual([0.25, 2.25]);
    expect(deleteKey(p, 't', 'opacity', 0.25)).toBe(true);
    expect(deleteKey(p, 't', 'opacity', 2.25)).toBe(true);
    expect(p.tracks.length).toBe(0);
    expect(onFrame(1.013, 30)).toBeCloseTo(1, 9);
  });

  it('loops: the project, a clip repeated or ping-ponged', () => {
    const p = project();
    const c = newClip('foto-a-ascii', 0.5);
    addClip(p, 'a', c);
    setProjectLoop(p, false);
    expect(p.time.loop).toBe(false);
    expect(setClipLoop(p, c.id, 3.4, true)).toBe(true);
    expect(findClip(p, c.id)!.clip).toMatchObject({ repeat: 3, pingpong: true });
    expect(setClipLoop(p, c.id, 1000, false)).toBe(true);
    expect(findClip(p, c.id)!.clip.repeat).toBe(100);
  });
});

describe('clip edits', () => {
  it('add, move (also to another layer), resize from both edges, duplicate, reverse, params, ease, delete', () => {
    const p = project();
    const c = newClip('dispersar', 1, { dur: 2 });
    addClip(p, 'g', c);
    moveClip(p, c.id, -3);
    expect(findClip(p, c.id)!.clip.start).toBe(0);
    moveClip(p, c.id, 1, 'a');
    expect(findClip(p, c.id)!.layer.id).toBe('a');
    resizeClip(p, c.id, 'start', 2.5);
    expect(findClip(p, c.id)!.clip).toMatchObject({ start: 2.5, dur: 0.5 });
    resizeClip(p, c.id, 'end', 2);
    expect(findClip(p, c.id)!.clip.dur).toBeCloseTo(0.05);
    resizeClip(p, c.id, 'end', 4);
    const d = duplicateClip(p, c.id)!;
    expect(d.id).not.toBe(c.id);
    expect(d.start).toBeCloseTo(4);
    setClipReverse(p, d.id, true); setClipParam(p, d.id, 'modo', 'gravedad'); setClipEase(p, d.id, easeFromPreset('acelera'));
    expect(findClip(p, d.id)!.clip).toMatchObject({ reverse: true, params: { modo: 'gravedad' } });
    expect(clipOverlaps(findClip(p, d.id)!.layer.clips)).toEqual([]);
    moveClip(p, d.id, 3.5);
    expect(clipOverlaps(findClip(p, d.id)!.layer.clips)).toEqual([{ a: c.id, b: d.id, start: 3.5, end: 4 }]);
    expect(contentEnd(p)).toBeCloseTo(5);
    expect(deleteClip(p, c.id)).toBe(true);
    expect(findClip(p, c.id)).toBeNull();
  });

  it('spans stay ordered and at least a moment long', () => {
    const p = project();
    setSpan(p, 'g', { in: 3, out: 1 });
    expect(p.layers[0].span!.out).toBeGreaterThan(p.layers[0].span!.in);
    setSpan(p, 'g', null);
    expect(p.layers[0].span).toBeNull();
  });
});

describe('library and choreographies', () => {
  it('groups the templates per kind, variants included, and makes new clips with suggested durations', () => {
    const glyphs = libraryByGroup('glyphs');
    expect(glyphs.map(g => g.group.id)).toEqual(['entrada', 'salida', 'transformación', 'énfasis', 'bucle']);
    expect(libraryItems('photo').some(i => i.id === 'ascii-a-foto')).toBe(false);
    const v = libraryItems('ascii').find(i => i.id === 'ascii-a-foto')!;
    expect(v).toMatchObject({ template: 'foto-a-ascii', reverse: true, group: 'salida' });
    const c = newClip(v, 1.5);
    expect(c).toMatchObject({ template: 'foto-a-ascii', start: 1.5, reverse: true, dur: templateById('foto-a-ascii')!.dur });
  });

  it('choreograph places entry, centre and exit over the span (overlap as a hand-over)', () => {
    const clips = choreograph(CHOREOS[0], 1, 8, 0.2);
    expect(clips.length).toBe(3);
    const [a, b, c] = clips;
    expect(a.start).toBe(1);
    expect(c.start + c.dur).toBeCloseTo(9);
    expect(b.start).toBeCloseTo(a.start + a.dur - 0.2);
    expect(b.start + b.dur).toBeCloseTo(c.start + 0.2);
    // short spans: entry and exit shrink to leave a third for the centre
    const short = choreograph(CHOREOS[0], 0, 3);
    expect(short[1].dur).toBeGreaterThanOrEqual(0.99);
    for (const ch of CHOREOS) for (const part of [ch.entry, ch.hold, ch.exit]) if (part) {
      const def = templateById(part.template);
      expect(def, `${ch.id} → ${part.template}`).toBeTruthy();
      for (const k of ch.kinds) expect(def!.kinds, `${ch.id}: ${part.template} en ${k}`).toContain(k);
    }
    expect(choreosFor('shape').every(ch => ch.kinds.includes('shape'))).toBe(true);
    const p = project();
    expect(applyChoreo(p, 't', 'terminal', 0, 6).map(x => x.template)).toEqual(['escritura', 'cursor', 'borrado']);
  });
});

describe('kit', () => {
  it('holds keep the ends and are monotonic', () => {
    for (const n of [0, 1, 3]) {
      let prev = -1;
      for (let i = 0; i <= 200; i++) { const v = withHolds(i / 200, n, 0.4); expect(v).toBeGreaterThanOrEqual(prev - 1e-12); prev = v; }
      expect(withHolds(0, n, 0.4)).toBe(0);
      expect(withHolds(1, n, 0.4)).toBeCloseTo(1, 9);
    }
    // two holds: flat at 1/3 and 2/3
    expect(withHolds(0.3, 2, 0.5)).toBeCloseTo(1 / 3, 9);
    expect(withHolds(0.35, 2, 0.5)).toBeCloseTo(1 / 3, 9);
  });

  it('orders span 0..1 for every kind (so sweeps finish at p = 1)', () => {
    const grid = { cols: 30, rows: 20, lum: Float32Array.from({ length: 600 }, (_, i) => (i % 30) / 29), chars: Array.from({ length: 600 }, (_, i) => (i % 7 ? '#' : ' ')) };
    for (const k of ['azar', 'izquierda', 'centro', 'bordes', 'diagonal', 'reloj', 'espiral', 'brillo', 'sombras', 'contornos', 'ruido', 'lectura', 'columnas', 'voronoi', 'bandas'] as const) {
      const o = orderField(k, grid, 7);
      let lo = Infinity, hi = -Infinity;
      for (const v of o) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      expect(lo, k).toBeGreaterThanOrEqual(0);
      expect(hi, k).toBeLessThanOrEqual(1);
      expect(hi - lo, k).toBeGreaterThan(0.5);
    }
    // brightness order: the brightest cells first
    const b = orderField('brillo', grid, 7);
    expect(b[29]).toBeLessThan(b[0]);
  });

  it('list params keep known entries and fall back to the default', () => {
    const opts: Array<[string, string]> = [['a', 'A'], ['b', 'B']];
    expect(listParam('a,x,b,b', opts, 2, 3, 'a,b')).toBe('a,b,b');
    expect(listParam('x', opts, 2, 3, 'a,b')).toBe('a,b');
    expect(listParam(4, opts, 2, 3, 'a,b')).toBe('a,b');
  });
});

describe('typing', () => {
  const typed = (params: Record<string, number | string | boolean>, text: string, k: number) => {
    const p = newProject({ duration: 4 });
    p.seed = 'fijo';
    p.layers.push(newLayer('text', { id: 'x', text, clips: [{ id: 'c', template: 'escritura', start: 0, dur: 2, params: { cursor: false, ...params }, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false }] }));
    return (evaluate(p, k * 2).layers[0].layer as { text: string }).text;
  };

  it('by word and by line: whole units appear at once', () => {
    for (const k of [0.1, 0.3, 0.55, 0.8]) {
      const w = typed({ unidad: 'palabra' }, 'uno dos tres cuatro', k);
      expect(['', 'uno ', 'uno dos ', 'uno dos tres ', 'uno dos tres cuatro']).toContain(w);
      const l = typed({ unidad: 'linea' }, 'a b\nc d\ne f', k);
      expect(['', 'a b\n', 'a b\nc d\n', 'a b\nc d\ne f']).toContain(l);
    }
    expect(typed({ unidad: 'palabra' }, 'uno dos tres cuatro', 1)).toBe('uno dos tres cuatro');
  });

  it('pauses after punctuation: the text waits after a full stop', () => {
    const text = 'Hola. Adiós';
    // with pauses, more of the clip is spent right after «Hola.»
    const at = (pause: number) => Array.from({ length: 40 }, (_, i) => typed({ puntuacion: pause }, text, i / 40)).filter(s => s === 'Hola.').length;
    expect(at(1)).toBeGreaterThan(at(0) + 3);
  });

  it('an irregular rhythm is seeded: the same clip types the same way', () => {
    const a = Array.from({ length: 20 }, (_, i) => typed({ irregular: 0.8 }, 'una frase de prueba', i / 20)).join('|');
    const b = Array.from({ length: 20 }, (_, i) => typed({ irregular: 0.8 }, 'una frase de prueba', i / 20)).join('|');
    expect(a).toBe(b);
    const even = Array.from({ length: 20 }, (_, i) => typed({ irregular: 0 }, 'una frase de prueba', i / 20)).join('|');
    expect(a).not.toBe(even);
  });
});
