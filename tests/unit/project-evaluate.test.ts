import { describe, expect, it } from 'vitest';
import { clipTime, hashString, rand01, registerTemplate, templateById, templates } from '../../src/project/clips';
import { cubicBezier, easeAt } from '../../src/project/ease';
import { dependsOnTime, evaluate, frameTimes, getPath, inSpan, sequenceIndex, setPath, sourceTime, trackValue } from '../../src/project/evaluate';
import { newLayer, newProject, uid } from '../../src/project/normalize';
import type { AnimClip, Ease, Key, Project, Source } from '../../src/project/types';

const key = (t: number, v: Key['v'], ease: Ease = { kind: 'linear' }): Key => ({ t, v, ease });
const clip = (o: Partial<AnimClip>): AnimClip => ({ id: uid(), template: 'foto-a-ascii', start: 0, dur: 2, params: {}, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false, ...o });

describe('easing', () => {
  it('named curves are CSS ease-in/out: ends fixed, in slow at first, out fast at first', () => {
    for (const kind of ['in', 'out', 'inOut', 'linear'] as const) {
      expect(easeAt({ kind }, 0)).toBe(0);
      expect(easeAt({ kind }, 1)).toBe(1);
    }
    expect(easeAt({ kind: 'in' }, 0.3)).toBeLessThan(0.3);
    expect(easeAt({ kind: 'out' }, 0.3)).toBeGreaterThan(0.3);
    expect(easeAt({ kind: 'inOut' }, 0.5)).toBeCloseTo(0.5, 5);
    // CSS ease-in at x = 0.5 is 0.3153
    expect(easeAt({ kind: 'in' }, 0.5)).toBeCloseTo(0.3153, 3);
  });

  it('bezier solves x → y (monotonic, linear when the handles are on the diagonal)', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const y = cubicBezier(0.7, 0, 0.3, 1, i / 100);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
    for (const x of [0.1, 0.37, 0.8]) expect(cubicBezier(0.25, 0.25, 0.75, 0.75, x)).toBeCloseTo(x, 5);
    // overshoot (y handles past 1) is allowed
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => cubicBezier(0.3, 1.8, 0.6, 1, i / 49)))).toBeGreaterThan(1);
  });

  it('hold keeps the start until the end; step jumps right away', () => {
    expect(easeAt({ kind: 'hold' }, 0.99)).toBe(0);
    expect(easeAt({ kind: 'hold' }, 1)).toBe(1);
    expect(easeAt({ kind: 'step' }, 0)).toBe(0);
    expect(easeAt({ kind: 'step' }, 0.01)).toBe(1);
  });
});

describe('keyframes', () => {
  it('numbers interpolate with the left key’s easing, hold before the first and after the last key', () => {
    const keys = [key(1, 10), key(3, 20, { kind: 'in' }), key(5, 0)];
    expect(trackValue(keys, 0)).toBe(10);
    expect(trackValue(keys, 2)).toBe(15);
    expect(trackValue(keys, 3)).toBe(20);
    expect(trackValue(keys, 4) as number).toBeGreaterThan(10); // ease-in: still close to 20 at the middle
    expect(trackValue(keys, 9)).toBe(0);
  });

  it('strings and booleans switch at their key (step switches right after the left key)', () => {
    const keys = [key(0, '#ff0000'), key(2, '#00ff00'), key(4, true as never)];
    expect(trackValue(keys, 1.99)).toBe('#ff0000');
    expect(trackValue(keys, 2)).toBe('#00ff00');
    expect(trackValue([key(0, 'a', { kind: 'step' }), key(2, 'b')], 0.5)).toBe('b');
    expect(trackValue([key(0, 1, { kind: 'hold' }), key(2, 5)], 1.9)).toBe(1);
    expect(trackValue([key(0, 1, { kind: 'step' }), key(2, 5)], 0.1)).toBe(5);
  });

  it('keys at the same time: the later one wins from then on', () => {
    expect(trackValue([key(0, 0), key(1, 5), key(1, 9), key(2, 9)], 1)).toBe(9);
  });

  it('evaluate applies tracks by path and brings values back into range', () => {
    const p = newProject({ duration: 4 });
    const t = newLayer('text', { text: 'hola' });
    p.layers.push(t);
    p.tracks.push({ layer: t.id, path: 'opacity', keys: [key(0, 0), key(2, 2)] });
    p.tracks.push({ layer: t.id, path: 'xf.x', keys: [key(0, -0.5), key(4, 0.5)] });
    p.tracks.push({ layer: t.id, path: 'color', keys: [key(0, '#ff0000'), key(3, '#0000ff')] });
    p.tracks.push({ layer: t.id, path: 'no.such.path', keys: [key(0, 1)] });
    const at = (x: number) => evaluate(p, x).layers[0].layer as typeof t;
    expect(at(0.5).opacity).toBeCloseTo(0.5);
    expect(at(1.5).opacity).toBe(1); // 1.5 clamped
    expect(at(2).xf.x).toBeCloseTo(0);
    expect(at(2.9).color).toBe('#ff0000');
    expect(at(3).color).toBe('#0000ff');
    // the project itself is never changed
    expect(p.layers[0]).toEqual(t);
    expect((p.layers[0] as typeof t).opacity).toBe(1);
  });

  it('setPath only replaces a value with one of the same type', () => {
    const o = { a: { b: 1, c: 'x', d: null as string | null, e: [1, 2] } };
    expect(setPath(o, 'a.b', 3)).toBe(true);
    expect(setPath(o, 'a.b', 'tres')).toBe(false);
    expect(setPath(o, 'a.c', 2)).toBe(false);
    expect(setPath(o, 'a.d', '#ffffff')).toBe(true);
    expect(setPath(o, 'a.e.1', 9)).toBe(true);
    expect(setPath(o, 'a.zz', 1)).toBe(false);
    expect(setPath(o, '__proto__.x', 1)).toBe(false);
    expect(setPath(o, 'a.b', NaN)).toBe(false);
    expect(o).toEqual({ a: { b: 3, c: 'x', d: '#ffffff', e: [1, 9] } });
    expect(getPath(o, 'a.e.1')).toBe(9);
  });
});

describe('spans, sources, frames', () => {
  it('a layer shows from in (included) to out (excluded), and never when hidden', () => {
    const l = { visible: true, span: { in: 1, out: 2 } };
    expect([0.99, 1, 1.5, 2].map(t => inSpan(l, t))).toEqual([false, true, true, false]);
    expect(inSpan({ visible: true, span: null }, 99)).toBe(true);
    expect(inSpan({ visible: false, span: null }, 0)).toBe(false);
    const p = newProject();
    p.layers.push(newLayer('text', { span: { in: 1, out: 2 } }), newLayer('shape', { visible: false }));
    expect(evaluate(p, 0.5).layers).toHaveLength(0);
    expect(evaluate(p, 1.5).layers.map(l => l.layer.kind)).toEqual(['text']);
    expect(evaluate(p, 1.5).layers[0].local).toBeCloseTo(0.5);
  });

  it('video time loops over the file; a sequence picks its photo by hold', () => {
    const v = { id: 'v', kind: 'video', name: '', media: [], w: 1, h: 1, duration: 4 } as Source;
    expect(sourceTime(v, 5)).toBeCloseTo(1);
    expect(sourceTime(v, 3.5)).toBeCloseTo(3.5);
    const s = { media: [{}, {}, {}], hold: 0.5 } as unknown as Source;
    expect([0, 0.49, 0.5, 1.2, 1.5, 3].map(t => sequenceIndex(s, t))).toEqual([0, 0, 1, 2, 0, 0]);
  });

  it('frame times are start + i / fps', () => {
    const p = newProject({ duration: 1, fps: 4 });
    expect(frameTimes(p)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(frameTimes(p, { fps: 2, from: 0.5, to: 1.5 })).toEqual([0.5, 1]);
    expect(frameTimes(newProject())).toEqual([0]);
  });

  it('evaluate is pure: the same project and time give the same state', () => {
    const p = newProject({ duration: 3 });
    const a = newLayer('ascii', { clips: [clip({ start: 0.5, dur: 1 })] });
    p.layers.push(a);
    p.tracks.push({ layer: a.id, path: 'style.glyph.cell', keys: [key(0, 6), key(3, 18)] });
    const before = JSON.stringify(p);
    const s1 = evaluate(p, 1.2), s2 = evaluate(p, 1.2);
    expect(JSON.stringify(s1.layers.map(l => l.layer))).toBe(JSON.stringify(s2.layers.map(l => l.layer)));
    expect(JSON.stringify(p)).toBe(before);
    expect((s1.layers[0].layer as typeof a).style.glyph.cell).toBeCloseTo(10.8);
  });
});

describe('clips', () => {
  it('hold their first state before the start and their last after the end', () => {
    const c = clip({ start: 1, dur: 2 });
    expect(clipTime(c, 0)).toMatchObject({ p: 0, raw: 0, active: false });
    expect(clipTime(c, 2)).toMatchObject({ p: 0.5, active: true });
    expect(clipTime(c, 9)).toMatchObject({ p: 1, raw: 1, active: false });
  });

  it('reverse is the forward clip played backwards in time (easing included)', () => {
    const f = clip({ start: 0, dur: 2, ease: { kind: 'in' } }), r = { ...f, reverse: true };
    for (const t of [0, 0.3, 0.7, 1, 1.6, 2]) expect(clipTime(r, t).p).toBeCloseTo(clipTime(f, 2 - t).p, 9);
    expect(clipTime(r, 0).dir).toBe(-1);
  });

  it('repeat runs n cycles; pingpong returns every other one', () => {
    const c = clip({ dur: 4, repeat: 2 });
    expect(clipTime(c, 1).p).toBeCloseTo(0.5);
    expect(clipTime(c, 3).p).toBeCloseTo(0.5);
    expect(clipTime(c, 4).p).toBe(1);
    const pp = { ...c, pingpong: true };
    expect(clipTime(pp, 1).p).toBeCloseTo(0.5);
    expect(clipTime(pp, 2.5).p).toBeCloseTo(0.75);
    expect(clipTime(pp, 2.5).dir).toBe(-1);
    expect(clipTime(pp, 4).p).toBe(0);
  });

  it('the two first templates are registered, and a catalog can add more', () => {
    expect(templateById('foto-a-ascii')?.kinds).toEqual(['ascii', 'glyphs']);
    expect(templateById('escritura')?.kinds).toContain('text');
    registerTemplate({ id: 'prueba-latido', name: 'Latido', blurb: '', group: 'énfasis', kinds: ['shape'], dur: 1, params: [{ key: 'k', label: 'k', type: 'range', min: 0, max: 1, step: 0.1, def: 0.5 }], apply: ctx => ({ opacity: 1 - ctx.p * Number(ctx.params.k) }) });
    expect(templates('shape').map(t => t.id)).toContain('prueba-latido');
    const p = newProject();
    p.layers.push(newLayer('shape', { clips: [clip({ template: 'prueba-latido', dur: 1 })] }));
    expect(evaluate(p, 1).layers[0].layer.opacity).toBeCloseTo(0.5);
    // a clip of a template this version does not have does nothing (and says so)
    p.layers[0].clips.push(clip({ template: 'de-otra-version' }));
    expect(evaluate(p, 0.5).layers[0].clips[1]).toMatchObject({ unknown: true });
  });

  it('«Foto → ASCII» reveals the cells of an ASCII layer from none to all, and reverse is the same frames backwards', () => {
    const p = newProject({ duration: 2 });
    p.seed = 'fijo';
    const a = newLayer('ascii', { clips: [clip({ start: 0, dur: 2 })] });
    p.layers.push(a);
    const grid = { cols: 40, rows: 25 };
    const shown = (t: number, proj = p) => {
      const lf = evaluate(proj, t).layers[0];
      if (!lf.reveal) return grid.cols * grid.rows;
      const f = lf.reveal(grid);
      let s = 0;
      for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) s += f(c, r);
      return s;
    };
    expect(shown(0)).toBe(0);
    const mid = shown(1);
    expect(mid).toBeGreaterThan(200);
    expect(mid).toBeLessThan(800);
    expect(shown(2)).toBe(1000);
    let prev = -1;
    for (let t = 0; t <= 2; t += 0.1) { const s = shown(t); expect(s).toBeGreaterThanOrEqual(prev - 1e-9); prev = s; }
    const rev = JSON.parse(JSON.stringify(p)) as Project;
    rev.layers[0].clips[0].reverse = true;
    for (const t of [0, 0.4, 1, 1.7, 2]) expect(shown(t, rev)).toBeCloseTo(shown(2 - t), 6);
    // deterministic: the same seed gives the same cells; another seed, others
    const cells = (seed: string) => { const q = { ...p, seed }; const f = evaluate(q, 1).layers[0].reveal!(grid); return Array.from({ length: 50 }, (_, i) => f(i % 40, Math.floor(i / 40))).join(','); };
    expect(cells('fijo')).toBe(cells('fijo'));
    expect(cells('fijo')).not.toBe(cells('otro'));
  });

  it('«Foto → ASCII» in fade mode changes the opacity; on glyph layers it hides cells', () => {
    const p = newProject({ duration: 2 });
    p.layers.push(newLayer('ascii', { clips: [clip({ params: { modo: 'fundido' } })] }));
    p.layers.push(newLayer('glyphs', { clips: [clip({})] }));
    const s = evaluate(p, 0.5);
    expect(s.layers[0].layer.opacity).toBeCloseTo(0.25);
    const fx = s.layers[1].cells!({ cols: 10, rows: 10 });
    let hidden = 0;
    for (let i = 0; i < 100; i++) { const f = fx(i, i % 10, Math.floor(i / 10)); if (f && (f.visible ?? 1) < 1) hidden++; }
    expect(hidden).toBeGreaterThan(50);
  });

  it('«Escritura de terminal» types a text layer letter by letter with a cursor, and reverse erases', () => {
    const p = newProject({ duration: 4 });
    p.layers.push(newLayer('text', { text: 'hola mundo', clips: [clip({ template: 'escritura', start: 0, dur: 2, params: { cursor: true, glifo: '▌', parpadeo: 0 } })] }));
    const text = (t: number, q = p) => (evaluate(q, t).layers[0].layer as { text: string }).text;
    expect(text(0)).toBe('▌');
    expect(text(1)).toBe('hola ▌');
    expect(text(1.99)).toBe('hola mund▌');
    expect(text(3)).toBe('hola mundo');
    const rev = JSON.parse(JSON.stringify(p)) as Project;
    rev.layers[0].clips[0].reverse = true;
    expect(text(0.2, rev)).toBe('hola mund▌');
    expect(text(1, rev)).toBe('hola ▌');
    // after the reversed clip: its last state is the forward clip's first (an empty prompt with its cursor)
    expect(text(3, rev)).toBe('▌');
  });

  it('«Escritura de terminal» on a glyph grid types the visible characters in reading order', () => {
    const p = newProject({ duration: 2 });
    p.layers.push(newLayer('glyphs', { clips: [clip({ template: 'escritura', dur: 2, params: { cursor: true, vacios: true } })] }));
    const chars = ['a', ' ', 'b', 'c', ' ', 'd', 'e', ' ', 'f', 'g'];
    const grid = { cols: 5, rows: 2, chars };
    const at = (t: number) => {
      const fx = evaluate(p, t).layers[0].cells;
      if (!fx) return chars.join('');
      const f = fx(grid);
      return chars.map((ch, i) => { const x = f(i, i % 5, Math.floor(i / 5)); return x?.glyph ?? ((x?.visible ?? 1) > 0 ? ch : '·'); }).join('');
    };
    // 7 visible characters: half-way 3 are typed (a, b, c) and the cursor sits on the 4th (d); spaces stay
    expect(at(1)).toBe('a bc █· ··');
    expect(at(2)).toBe('a bc de fg');
    expect(at(0)[0]).toBe('█');
  });
});

describe('time dependence', () => {
  it('a still project does not change with time; video, keyframes, clips, moving ASCII and animated finishes do', () => {
    const p = newProject();
    p.layers.push(newLayer('text'), newLayer('shape'));
    expect(dependsOnTime(p)).toBe(false);
    const a = newLayer('ascii');
    const still = { ...a, style: { ...a.style, motion: { ...a.style.motion, speed: 0 } } };
    expect(dependsOnTime({ ...p, layers: [still] })).toBe(false);
    expect(dependsOnTime({ ...p, layers: [a] })).toBe(true);
    expect(dependsOnTime({ ...p, tracks: [{ layer: p.layers[0].id, path: 'opacity', keys: [key(0, 1)] }] })).toBe(true);
    expect(dependsOnTime({ ...p, layers: [newLayer('text', { clips: [clip({})] })] })).toBe(true);
    expect(dependsOnTime({ ...p, layers: [newLayer('text', { finishes: [{ kind: 'grain', on: true, amount: 1, params: { anim: true } }] })] })).toBe(true);
    expect(dependsOnTime({ ...p, layers: [newLayer('text', { finishes: [{ kind: 'grain', on: true, amount: 1, params: { anim: false } }] })] })).toBe(false);
    const v = { id: 'v', kind: 'video' as const, name: '', media: [{ id: '0123456789abcdef', kind: 'video' as const, w: 1, h: 1 }], w: 1, h: 1, duration: 2 };
    expect(dependsOnTime({ ...p, sources: [v], layers: [newLayer('photo', { source: 'v' })] })).toBe(true);
  });
});

describe('deterministic noise', () => {
  it('rand01 is uniform enough and fixed for its inputs', () => {
    const s = hashString('semilla');
    expect(rand01(s, 3, 4)).toBe(rand01(s, 3, 4));
    let sum = 0;
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) { const v = rand01(s, i % 200, Math.floor(i / 200)); sum += v; buckets[Math.floor(v * 10)]++; }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
    for (const b of buckets) expect(b).toBeGreaterThan(1700);
  });
});
