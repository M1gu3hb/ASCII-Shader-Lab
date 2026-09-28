import { describe, expect, it } from 'vitest';
import '../../src/anim/index';
import { clipTime, paramsOf, templates, type CellGrid, type ClipEffect, type TemplateDef } from '../../src/project/clips';
import { evaluate, type LayerFrame } from '../../src/project/evaluate';
import { newLayer, newProject, uid } from '../../src/project/normalize';
import type { AnimClip, Layer, LayerKind, Project } from '../../src/project/types';
import { GROUPS, libraryItems, VARIANTS } from '../../src/anim/library';

/**
 * Every registered template, on every kind of layer it supports, with its default params: deterministic,
 * reversible (the reversed clip at τ is the forward clip at dur − τ), entries end untouched, exits start
 * untouched, emphasis starts and ends untouched, loops close (the first frame is the last), params out of
 * range are clamped, nothing is NaN, and no two templates draw the same thing.
 */

const D = 2.4;
const COLS = 24, ROWS = 12, CW = 10, CH = 20;
const W = COLS * CW, H = ROWS * CH;

/** A glyph grid with characters, empty cells, brightness and colours (like one of a photo). */
function grid(): CellGrid {
  const chars: string[] = [], lum: number[] = [], colors: number[] = [];
  const ramp = ' .:-=+*#%@';
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const l = Math.max(0, Math.min(1, 0.5 + 0.45 * Math.sin(c * 0.45) * Math.cos(r * 0.6) + (c > 16 ? 0.2 : 0) - (r > 9 ? 0.4 : 0)));
    lum.push(l);
    chars.push(ramp[Math.min(9, Math.floor(l * 10))]);
    colors.push(((Math.round(l * 255) << 16) | (80 << 8) | (Math.round((1 - l) * 200))) >>> 0);
  }
  return { cols: COLS, rows: ROWS, cw: CW, ch: CH, w: W, h: H, chars, lum: Float32Array.from(lum), colors: Uint32Array.from(colors) };
}
const G = grid();

function layerOf(kind: LayerKind): Layer {
  const mask = { invert: false, feather: 4, opacity: 1, parts: [{ kind: 'ellipse' as const, op: 'add' as const, x: 0.1, y: 0.15, w: 0.45, h: 0.6, rot: 0, soft: 6, alpha: 1 }] };
  switch (kind) {
    case 'glyphs': return newLayer('glyphs', { mask, glyphs: { ...newLayer('glyphs').glyphs, color: 'palette', palette: ['#0c0b0a', '#ff5b1f', '#ede6da'], cell: 10, aspect: 2 } });
    case 'ascii': return newLayer('ascii', { mask, source: 'style' });
    case 'photo': return newLayer('photo', { mask });
    case 'text': return newLayer('text', { mask, text: 'Hola, mundo. Esto es\nGLYPHOS: 2026.' });
    case 'shape': return newLayer('shape', { mask, shape: 'rect', pts: [0.2, 0.2, 0.5, 0.4], stroke: '#ede6da', fill: '#ff5b1f', width: 3 });
  }
}

function projectWith(def: TemplateDef, kind: LayerKind, o: Partial<AnimClip> = {}): Project {
  const p = newProject({ w: W, h: H, duration: 6 });
  p.seed = 'prueba-anim';
  // a second layer above with its own zone («Intercambio de zonas» can look for it)
  const main = layerOf(kind);
  // fixed ids: the seed of a clip is project + layer + clip
  main.id = 'capa1';
  const clip: AnimClip = { id: 'clip1', template: def.id, start: 0, dur: D, params: {}, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false, ...o };
  main.clips = [clip];
  p.layers.push(main);
  const other = newLayer('shape', { mask: { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'rect', op: 'add', x: 0.55, y: 0.1, w: 0.35, h: 0.5, rot: 10, soft: 0, alpha: 1 }] } });
  other.id = 'capa2';
  p.layers.push(other);
  return p;
}

const round = (v: unknown): unknown => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : `NaN:${v}`;
  if (Array.isArray(v)) return v.map(round);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, round(x)]));
  return v;
};

/** Everything a layer frame changes, sampled over the grid, as plain data. */
function signature(lf: LayerFrame | undefined): string {
  if (!lf) return 'none';
  const cells: unknown[] = [], reveal: number[] = [], tiles: unknown[] = [];
  if (lf.cells) { const f = lf.cells(G); for (let i = 0; i < COLS * ROWS; i++) { const x = f(i, i % COLS, Math.floor(i / COLS)); cells.push(neutralCell(x, G.chars![i]) ? null : x); } }
  if (lf.reveal) { const f = lf.reveal(G); for (let i = 0; i < COLS * ROWS; i++) reveal.push(f(i % COLS, Math.floor(i / COLS))); }
  if (lf.tiles) { const f = lf.tiles(G); for (let i = 0; i < COLS * ROWS; i++) { const x = f(i % COLS, Math.floor(i / COLS)); tiles.push(neutralTile(x) ? null : x); } }
  return JSON.stringify(round({
    // the layer as drawn (its clips and id are not part of the picture)
    layer: { ...lf.layer, clips: [], id: '' }, cells: cells.some(x => x) ? cells : [], reveal: reveal.some(v => v < 1) ? reveal : [], tiles: tiles.some(x => x) ? tiles : [],
    within: lf.within, glyphs: '',
  }));
}

function neutralCell(f: Record<string, unknown> | null | undefined, ch: string): boolean {
  if (!f) return true;
  return (f.visible === undefined || (f.visible as number) >= 1) && !f.dx && !f.dy && (f.scale === undefined || f.scale === 1) && !f.rot
    && (f.glyph === undefined || f.glyph === ch) && f.color === undefined;
}
function neutralTile(f: Record<string, unknown> | null | undefined): boolean {
  if (!f) return true;
  return !f.dx && !f.dy && (f.scale ?? 1) === 1 && (f.sy ?? 1) === 1 && !f.rot && ((f.alpha as number | undefined) ?? 1) >= 1;
}

const frame = (p: Project, t: number) => evaluate(p, t).layers.find(l => l.layer.id === p.layers[0].id);
/** The layer with no clip at all (what «untouched» means). */
function untouched(p: Project): string {
  const q: Project = JSON.parse(JSON.stringify(p));
  q.layers[0].clips = [];
  return signature(frame(q, 0));
}

/** Finite numbers only, in everything an effect returns (sampled). */
function assertFinite(eff: ClipEffect | null, where: string) {
  if (!eff) return;
  const bad: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'number' && !Number.isFinite(v)) bad.push(path);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk({ set: eff.set, opacity: eff.opacity, mask: eff.mask, within: eff.within, finishes: eff.finishes, tileCell: eff.tileCell }, where);
  if (eff.cells) { const f = eff.cells(G); for (let i = 0; i < COLS * ROWS; i += 7) walk(f(i, i % COLS, Math.floor(i / COLS)), `${where}.cells[${i}]`); }
  if (eff.reveal) { const f = eff.reveal(G); for (let i = 0; i < COLS * ROWS; i += 7) walk(f(i % COLS, Math.floor(i / COLS)), `${where}.reveal[${i}]`); }
  if (eff.tiles) { const f = eff.tiles(G); for (let i = 0; i < COLS * ROWS; i += 7) walk(f(i % COLS, Math.floor(i / COLS)), `${where}.tiles[${i}]`); }
  expect(bad, where).toEqual([]);
}

/** The template's apply called directly at eased progress p (throws surface here; evaluate swallows them). */
function applyAt(def: TemplateDef, p: Project, t: number): ClipEffect | null {
  const clip = p.layers[0].clips[0];
  const ct = clipTime(clip, t);
  return def.apply({ layer: p.layers[0], clip, params: paramsOf(def, clip), p: ct.p, linear: ct.linear, raw: ct.raw, local: ct.local, pos: ct.pos, t, seed: `${p.seed}|${p.layers[0].id}|${clip.id}`, project: p });
}

const ALL = templates();
const cases: Array<[string, TemplateDef, LayerKind]> = [];
for (const def of ALL) for (const kind of def.kinds) cases.push([`${def.id} · ${kind}`, def, kind]);

describe('the library', () => {
  it('has at least 40 templates, each described in Spanish with a group, kinds, a duration and valid params', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(40);
    const groups = new Set(GROUPS.map(g => g.id));
    const ids = new Set<string>();
    for (const d of ALL) {
      expect(ids.has(d.id), d.id).toBe(false);
      ids.add(d.id);
      expect(d.id).toMatch(/^[a-z0-9-]+$/);
      expect(d.name.length, d.id).toBeGreaterThan(3);
      expect(d.blurb.length, d.id).toBeGreaterThan(30);
      expect(groups.has(d.group), d.id).toBe(true);
      expect(d.kinds.length, d.id).toBeGreaterThan(0);
      expect(d.dur, d.id).toBeGreaterThan(0);
      for (const p of d.params) {
        // keys survive normalizeProject (ASCII only)
        expect(p.key, `${d.id}.${p.key}`).toMatch(/^[A-Za-z0-9_.-]{1,40}$/);
        if (p.type === 'range') { expect(p.def, `${d.id}.${p.key}`).toBeGreaterThanOrEqual(p.min); expect(p.def).toBeLessThanOrEqual(p.max); }
        if (p.type === 'select') expect(p.options.map(o => o[0]), `${d.id}.${p.key}`).toContain(p.def);
        if (p.type === 'list') for (const k of p.def.split(',')) expect(p.options.map(o => o[0]), `${d.id}.${p.key}`).toContain(k);
      }
    }
    // every group has something, and every kind of layer too
    for (const g of groups) expect(ALL.some(d => d.group === g), g).toBe(true);
    for (const k of ['glyphs', 'ascii', 'photo', 'text', 'shape'] as const) expect(ALL.filter(d => d.kinds.includes(k)).length, k).toBeGreaterThanOrEqual(k === 'shape' ? 10 : 18);
  });

  it('variants point at registered templates and keep their kinds', () => {
    for (const v of VARIANTS) expect(ALL.some(d => d.id === v.template), v.id).toBe(true);
    expect(libraryItems('photo').every(i => i.kinds.includes('photo'))).toBe(true);
  });
});

describe.each(cases)('%s', (_name, def, kind) => {
  it('is deterministic and never NaN', () => {
    const p = projectWith(def, kind);
    for (const t of [0, 0.37, 1.13, 1.9, D]) {
      expect(signature(frame(p, t))).toBe(signature(frame(p, t)));
      assertFinite(applyAt(def, p, t), `${def.id}@${t}`);
    }
  });

  it('reversed, it is the forward clip backwards in time', () => {
    const f = projectWith(def, kind), r = projectWith(def, kind, { reverse: true });
    for (const k of [0, 0.1371, 0.4629, 0.7313, 0.9137, 1]) {
      expect(signature(frame(r, k * D)), `τ = ${k}`).toBe(signature(frame(f, D - k * D)));
    }
  });

  it('starts and ends as its group promises', () => {
    const p = projectWith(def, kind);
    const base = untouched(p);
    const first = signature(frame(p, 0)), last = signature(frame(p, D));
    if (def.group === 'entrada') expect(last, 'una entrada termina con la capa tal cual').toBe(base);
    if (def.group === 'salida') expect(first, 'una salida empieza con la capa tal cual').toBe(base);
    if (def.group === 'énfasis') { expect(first).toBe(base); expect(last).toBe(base); }
    if (def.group === 'bucle') expect(last, 'un bucle cierra: su último cuadro es el primero').toBe(first);
    // and something happens in between
    const mids = Array.from({ length: 19 }, (_, i) => signature(frame(p, ((i + 1) / 20) * D)));
    expect(mids.some(s => s !== base), 'hace algo a mitad del clip').toBe(true);
  });

  it('clamps params out of range and ignores garbage', () => {
    const wild: Record<string, number | string | boolean> = {};
    for (const q of def.params) {
      if (q.type === 'range') wild[q.key] = q.max * 1000 + 7;
      else if (q.type === 'select') wild[q.key] = 'no-existe';
      else if (q.type === 'toggle') wild[q.key] = 'sí' as unknown as boolean;
      else if (q.type === 'list') wild[q.key] = 'nada,,x';
      else wild[q.key] = 42 as unknown as string;
    }
    const p = projectWith(def, kind, { params: wild });
    const params = paramsOf(def, p.layers[0].clips[0]);
    for (const q of def.params) {
      if (q.type === 'range') expect(params[q.key]).toBe(q.max);
      else expect(params[q.key]).toBe(q.def);
    }
    for (const t of [0.3, 1.2, 2.1]) assertFinite(applyAt(def, p, t), `${def.id} extremos @${t}`);
    const low: Record<string, number> = {};
    for (const q of def.params) if (q.type === 'range') low[q.key] = q.min - 1e6;
    const p2 = projectWith(def, kind, { params: low });
    for (const t of [0.3, 1.2, 2.1]) assertFinite(applyAt(def, p2, t), `${def.id} mínimos @${t}`);
  });
});

describe('no near-duplicates', () => {
  it('no two templates draw the same thing on the same layer at the same moments', () => {
    const byKind = new Map<LayerKind, Map<string, string>>();
    for (const [, def, kind] of cases) {
      const p = projectWith(def, kind);
      const sig = Array.from({ length: 9 }, (_, i) => signature(frame(p, ((i + 1) / 10) * D))).join('|');
      const seen = byKind.get(kind) ?? new Map<string, string>();
      byKind.set(kind, seen);
      expect(seen.get(sig), `${def.id} dibuja lo mismo que ${seen.get(sig)} en ${kind}`).toBeUndefined();
      seen.set(sig, def.id);
    }
  });
});

describe('ids of generated clips', () => {
  it('uid gives distinct ids', () => { expect(uid()).not.toBe(uid()); });
});
