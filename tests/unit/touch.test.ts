import { describe, expect, it } from 'vitest';
import { INTERACT, defaultRecipe, normInteract, normalizeRecipe, type InteractMode, type Recipe } from '../../src/engine/recipe';
import {
  DISP_MAX, GRID_MODES, TOUCH_MODES, TouchField, dispOf, eraseRate, ghostPoses, paintRate, touchSettings, type TouchInput,
} from '../../src/engine/touch';
import { simSettle } from '../../src/engine/pointer';
import { INTERACT_NAMES } from '../../src/engine/catalog';
import v1 from './fixtures/generator-v1.json';
import v2 from './fixtures/generator-v2.json';

/**
 * The gesture modes' field (src/engine/touch.ts): the recipe keeps older pieces as they were, the field
 * is deterministic (the same gestures give the same bytes at any frame rate), each mode leaves its mark
 * where it is touched and nowhere else, and an idle field costs nothing.
 */

const COLS = 64, ROWS = 40, CW = 10, CH = 14, W = COLS * CW, H = ROWS * CH;

function field(mode: InteractMode, extra: Partial<Recipe['interact']> = {}) {
  const f = new TouchField();
  f.configure(touchSettings({ ...defaultRecipe().interact, mode, ...extra }), COLS, ROWS, CW, CH, W, H);
  return f;
}

/** Runs `script` (events at their times: a replay) for `seconds` at `fps`. */
function run(f: TouchField, script: TouchInput[], seconds: number, fps: number) {
  for (const e of [...script].sort((a, b) => a.t - b.t)) f.input(e);
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) f.step(1 / fps);
  return f;
}

/** A finger that goes down at (x0, y0), moves to (x1, y1) in `dur` seconds and lifts. Pixels. */
function swipe(x0: number, y0: number, x1: number, y1: number, t0: number, dur: number, id = 1, type: TouchInput['type'] = 'touch'): TouchInput[] {
  const out: TouchInput[] = [{ kind: 'down', id, x: x0, y: y0, t: t0, type }];
  const n = Math.max(2, Math.round(dur * 120));
  for (let i = 1; i <= n; i++) out.push({ kind: 'move', id, x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, t: t0 + (dur * i) / n, type });
  out.push({ kind: 'up', id, x: x1, y: y1, t: t0 + dur + 0.001, type });
  return out;
}
const tap = (x: number, y: number, t: number, id = 1): TouchInput[] => [
  { kind: 'down', id, x, y, t, type: 'touch' }, { kind: 'up', id, x, y, t: t + 0.06, type: 'touch' },
];

const R = (f: TouchField, c: number, r: number) => f.data[(r * COLS + c) * 4];
const cellOf = (x: number, y: number) => [Math.floor(x / CW), Math.floor(y / CH)] as const;
const sumR = (f: TouchField) => { let s = 0; for (let i = 0; i < f.data.length; i += 4) s += f.data[i]; return s; };

describe('recipe: the pointer settings', () => {
  it('older recipes come out exactly as they were (no new keys)', () => {
    const cases = (x: unknown) => (x as { cases: Array<{ recipe: unknown }> }).cases.map(c => c.recipe);
    const olds: unknown[] = [defaultRecipe(), ...cases(v1), ...cases(v2)];
    expect(olds.length).toBeGreaterThan(20);
    for (const o of olds) {
      const r = normalizeRecipe(o);
      expect(Object.keys(r.interact)).toEqual(['mode', 'strength', 'radius', 'auto']);
      expect(normalizeRecipe(JSON.parse(JSON.stringify(r)))).toEqual(r);
    }
  });

  it('the new keys are kept when given, clamped, in one order whatever order they came in', () => {
    const a = normInteract({ glyphs: 'random', ink: 3, mode: 'trail', decay: '0.25', strength: 0.7, radius: 0.2, auto: true });
    expect(a).toEqual({ mode: 'trail', strength: 0.7, radius: 0.2, auto: true, decay: 0.25, ink: 1, glyphs: 'random' });
    expect(Object.keys(a)).toEqual(['mode', 'strength', 'radius', 'auto', 'decay', 'ink', 'glyphs']);
    expect(normInteract({ mode: 'rings', decay: 'x', glyphs: 'otra', ink: null })).toEqual({ mode: 'rings', strength: 0.4, radius: 0.18, auto: false, decay: 0.5 });
    expect(normInteract({ mode: 'nope' }).mode).toBe('light');
  });

  it('every mode has a name, and the engines index them in one list', () => {
    for (const m of INTERACT) expect(INTERACT_NAMES[m], m).toBeTruthy();
    expect(INTERACT.slice(0, 9)).toEqual(['none', 'light', 'ripple', 'lens', 'repel', 'swirl', 'erase', 'paint', 'scramble']);
    for (const m of TOUCH_MODES) expect(INTERACT).toContain(m);
  });

  it('«Duración» at 0.5 is exactly what Pincel and Borrador always did', () => {
    expect(paintRate(0.5)).toBeCloseTo(0.9, 12);
    expect(eraseRate(0.5)).toBeCloseTo(0.22, 12);
    expect(paintRate(0)).toBeGreaterThan(paintRate(1));
    expect(simSettle({ ...defaultRecipe().interact, mode: 'ripple' })).toBe(6);
    expect(simSettle({ ...defaultRecipe().interact, mode: 'light' })).toBe(0);
  });
});

describe('touch field', () => {
  it('replays: the same gestures give the same bytes at 30, 60 and 144 frames per second', () => {
    for (const mode of GRID_MODES) {
      const script = [...swipe(100, 100, 500, 300, 0.1, 0.25), ...tap(320, 200, 0.6), ...swipe(500, 450, 200, 380, 0.8, 0.12, 2)];
      const a = run(field(mode), script, 1.2, 60).data.slice();
      const b = run(field(mode), script, 1.2, 30).data.slice();
      const c = run(field(mode), script, 1.2, 144).data.slice();
      expect(sumR(field(mode)), mode).toBe(0);
      expect(Buffer.from(b).equals(Buffer.from(a)), mode + ' 30 fps').toBe(true);
      expect(Buffer.from(c).equals(Buffer.from(a)), mode + ' 144 fps').toBe(true);
    }
  });

  it('Rastro leaves a trail where the finger went, and nothing far from it; it fades with «Duración»', () => {
    const f = run(field('trail'), swipe(100, 280, 540, 280, 0, 0.3), 0.35, 60);
    const [c0, r0] = cellOf(300, 280), [c1, r1] = cellOf(300, 60);
    expect(R(f, c0, r0)).toBeGreaterThan(120);
    expect(R(f, c1, r1)).toBe(0);
    // dense glyph hints along the trail
    expect(f.data[(r0 * COLS + c0) * 4 + 1]).toBeGreaterThan(100);
    const short = run(field('trail', { decay: 0 }), swipe(100, 280, 540, 280, 0, 0.3), 1.2, 60);
    const long = run(field('trail', { decay: 1 }), swipe(100, 280, 540, 280, 0, 0.3), 1.2, 60);
    expect(sumR(long)).toBeGreaterThan(sumR(short) * 3);
  });

  it('Anillos opens a ring around each tap, growing then gone', () => {
    const f = field('rings');
    run(f, tap(320, 280, 0), 0.5, 60);
    const [cc, rc] = cellOf(320, 280);
    // the ring has left the centre and is out on a circle
    let ring = 0;
    for (let c = 0; c < COLS; c++) ring = Math.max(ring, R(f, c, rc));
    expect(ring).toBeGreaterThan(80);
    expect(R(f, cc, rc)).toBeLessThan(ring);
    run(f, [], 4, 60);
    expect(sumR(f)).toBe(0);
  });

  it('Chispas: a flick throws sparks along it; a slow drag does not', () => {
    const f = run(field('sparks'), swipe(100, 400, 250, 380, 0, 0.08), 0.5, 60);
    let right = 0, left = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const v = R(f, c, r); if (c > 30) right += v; else if (c < 8) left += v; }
    expect(right).toBeGreaterThan(500);
    expect(right).toBeGreaterThan(left * 3);
    const slow = run(field('sparks'), swipe(100, 400, 250, 380, 0, 1.5), 1.7, 60);
    expect(sumR(slow)).toBe(0);
  });

  it('Florecer grows while held and fades after', () => {
    const f = field('blossom');
    run(f, [{ kind: 'down', id: 1, x: 320, y: 280, t: 0.01, type: 'touch' }], 0.3, 60);
    const early = sumR(f);
    run(f, [], 1.2, 60);
    const later = sumR(f);
    expect(early).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(early * 1.8);
    f.input({ kind: 'up', id: 1, x: 320, y: 280, t: f.now + 0.001, type: 'touch' });
    run(f, [], 8, 60);
    expect(sumR(f)).toBe(0);
  });

  it('Estirar moves the grid with the finger and springs back', () => {
    const f = field('stretch');
    const s = swipe(200, 280, 330, 280, 0, 0.3);
    run(f, s.slice(0, -1), 0.3, 60);
    const [c, r] = cellOf(300, 280);
    const dx = dispOf(f.data[(r * COLS + c) * 4 + 2]);
    expect(dx).toBeGreaterThan(0.05);
    expect(dx).toBeLessThanOrEqual(DISP_MAX);
    run(f, [s[s.length - 1]], 6, 60);
    expect(f.data[(r * COLS + c) * 4 + 2]).toBe(128);
    expect(f.step(1 / 60)).toBe(false);
  });

  it('Revelar opens a window under the pointer (a mouse just passing by too)', () => {
    const f = field('reveal');
    const hover: TouchInput[] = [];
    for (let i = 0; i <= 20; i++) hover.push({ kind: 'move', id: 7, x: 100 + i * 20, y: 200, t: 0.01 + i * 0.01, type: 'mouse' });
    run(f, hover, 0.3, 60);
    const [c, r] = cellOf(400, 200);
    expect(R(f, c, r)).toBeGreaterThan(150);
    expect(f.data[(r * COLS + c) * 4 + 1]).toBe(0);
  });

  it('Zoom con los dedos: two fingers apart zoom in around them; letting go comes back', () => {
    const f = field('zoom');
    const ev: TouchInput[] = [
      { kind: 'down', id: 1, x: 300, y: 280, t: 0.01, type: 'touch' }, { kind: 'down', id: 2, x: 340, y: 280, t: 0.02, type: 'touch' },
    ];
    for (let i = 1; i <= 30; i++) { ev.push({ kind: 'move', id: 1, x: 300 - i * 4, y: 280, t: 0.02 + i / 60, type: 'touch' }); ev.push({ kind: 'move', id: 2, x: 340 + i * 4, y: 280, t: 0.02 + i / 60, type: 'touch' }); }
    run(f, ev, 0.6, 60);
    const [k, ox, oy] = f.view;
    expect(k).toBeLessThan(0.4);
    // the point between the fingers stays put: p·k + o at the middle equals the middle
    const mx = (320 - W / 2) / H, my = (H / 2 - 280) / H;
    expect(mx * k + ox).toBeCloseTo(mx, 3);
    expect(my * k + oy).toBeCloseTo(my, 3);
    run(f, [{ kind: 'up', id: 1, x: 180, y: 280, t: 0.7, type: 'touch' }, { kind: 'up', id: 2, x: 460, y: 280, t: 0.7, type: 'touch' }], 12, 60);
    expect(f.view).toEqual([1, 0, 0]);
    // «Duración» at the top: it stays
    const g = run(field('zoom', { decay: 1 }), ev, 0.6, 60);
    run(g, [{ kind: 'up', id: 1, x: 180, y: 280, t: 0.7, type: 'touch' }, { kind: 'up', id: 2, x: 460, y: 280, t: 0.7, type: 'touch' }], 5, 60);
    expect(g.view[0]).toBeLessThan(0.4);
  });

  it('the wheel zooms around the cursor', () => {
    const f = field('zoom');
    f.wheel(-400, 320, 280);
    expect(f.view[0]).toBeLessThan(1);
    const other = field('trail');
    other.wheel(-400, 320, 280);
    expect(other.view).toEqual([1, 0, 0]);
  });

  it('Seguir leans the whole view toward the pointer, slowly, and back when it leaves', () => {
    const f = field('follow', { strength: 1 });
    run(f, [{ kind: 'move', id: 7, x: W, y: H / 2, t: 0.01, type: 'mouse' }], 0.1, 60);
    const early = -f.view[1];
    run(f, [], 3, 60);
    expect(-f.view[1]).toBeGreaterThan(early * 2);
    expect(-f.view[1]).toBeGreaterThan(0.07);
    run(f, [{ kind: 'leave', id: 7, x: W, y: H / 2, t: f.now + 0.01, type: 'mouse' }], 12, 60);
    expect(Math.abs(f.view[1])).toBeLessThan(1e-4);
  });

  it('costs nothing when idle: no steps, no new bytes', () => {
    const f = run(field('trail'), swipe(100, 280, 540, 280, 0, 0.3), 10, 60);
    const v = f.version;
    expect(f.step(1 / 60)).toBe(false);
    for (let i = 0; i < 30; i++) f.step(1 / 60);
    expect(f.version).toBe(v);
  });

  it('the ghost plays each mode by itself, and a real finger takes over', () => {
    for (const mode of GRID_MODES) {
      const f = field(mode, { auto: true });
      f.demo = true;
      run(f, [], 4, 60);
      if (mode !== 'stretch') expect(sumR(f), mode).toBeGreaterThan(0);
      else expect(f.data.some((v, i) => i % 4 === 2 && v !== 128), mode).toBe(true);
    }
    expect(ghostPoses('zoom', 1)).toHaveLength(2);
    expect(ghostPoses('light', 1)).toHaveLength(0);
    const f = field('rings', { auto: true });
    run(f, [], 3, 60);
    expect(f.step(1 / 60)).toBe(true);
    run(f, tap(10, 10, f.now + 0.01), 0.5, 60);
    expect(f.busy).toBe(true);
  });

  it('a pen presses harder or softer', () => {
    const pen = (p: number) => run(field('trail'), swipe(100, 280, 540, 280, 0, 0.3).map(e => ({ ...e, type: 'pen' as const, pressure: p })), 0.35, 60);
    expect(sumR(pen(1))).toBeGreaterThan(sumR(pen(0.1)) * 1.5);
  });
});
