import { describe, expect, it } from 'vitest';
import {
  defaultFinish, finishDef, FINISHES, normalizeFinish, paramVisible, resolveParams, DITHER_ALGOS, PALETTES,
} from '../../src/fx';
import type { FinishKind } from '../../src/project/types';

const KINDS: FinishKind[] = [
  'dither', 'halftone', 'grain', 'glow', 'shadow', 'motionblur', 'blur', 'sharpen',
  'invert', 'threshold', 'posterize', 'levels', 'mono', 'duotone', 'palette',
  'crosshatch', 'scanlines', 'chroma', 'vignette', 'pixelate', 'edges', 'noise',
];

describe('finishes catalog', () => {
  it('describes every finish kind once, in Spanish, with a group and params', () => {
    expect(FINISHES.map(f => f.kind).sort()).toEqual([...KINDS].sort());
    for (const f of FINISHES) {
      expect(f.name.length).toBeGreaterThan(2);
      expect(f.blurb.length).toBeGreaterThan(20);
      expect(['tramado', 'tono', 'luz', 'movimiento', 'textura', 'color']).toContain(f.group);
      expect(f.params.length).toBeGreaterThan(0);
      const keys = f.params.map(p => p.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('has defaults inside their ranges and options, and valid visibility rules', () => {
    for (const f of FINISHES) {
      for (const p of f.params) {
        if (p.type === 'range') {
          expect(p.min).toBeLessThan(p.max);
          expect(p.def).toBeGreaterThanOrEqual(p.min);
          expect(p.def).toBeLessThanOrEqual(p.max);
          expect(p.step).toBeGreaterThan(0);
        }
        if (p.type === 'select') expect(p.options.map(o => o[0])).toContain(p.def);
        if (p.type === 'color') expect(p.def).toMatch(/^#[0-9a-f]{6}$/);
        for (const [k, vals] of Object.entries(p.when ?? {})) {
          const ref = f.params.find(q => q.key === k);
          expect(ref, `${f.kind}.${p.key} depends on ${k}`).toBeTruthy();
          if (ref?.type === 'select') for (const v of vals) expect(ref.options.map(o => o[0])).toContain(v);
        }
      }
    }
  });

  it('defaultFinish gives every param its default and survives validation unchanged', () => {
    for (const k of KINDS) {
      const f = defaultFinish(k);
      expect(f).toMatchObject({ kind: k, on: true, amount: 1 });
      expect(resolveParams(finishDef(k), f.params)).toEqual(f.params);
    }
  });

  it('lists every dither algorithm in the dither select, and every palette in both palette selects', () => {
    const algo = finishDef('dither')!.params.find(p => p.key === 'algo')!;
    expect(algo.type === 'select' && algo.options.map(o => o[0])).toEqual(DITHER_ALGOS.map(a => a.id));
    for (const k of ['dither', 'palette'] as const) {
      const pal = finishDef(k)!.params.find(p => p.key === 'palette')!;
      expect(pal.type === 'select' && pal.options.map(o => o[0])).toEqual(PALETTES.map(p => p.id));
    }
    for (const p of PALETTES) if (p.id !== 'auto' && p.id !== 'custom') expect(p.colors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('finish params', () => {
  const def = finishDef('dither')!;

  it('clamps numbers, rejects unknown options and bad colours, reads numeric strings and booleans', () => {
    const p = resolveParams(def, {
      pixel: 999, bright: -7, contrast: '1.5', levels: Number.NaN, algo: 'nope', ink: 'red', paper: '#ABC', serpentine: 'false', linear: 1,
    });
    expect(p.pixel).toBe(24);
    expect(p.bright).toBe(-1);
    expect(p.contrast).toBe(1.5);
    expect(p.levels).toBe(4);
    expect(p.algo).toBe('atkinson');
    expect(p.ink).toBe('#0c0b0a');
    expect(p.paper).toBe('#aabbcc');
    expect(p.serpentine).toBe(false);
    expect(p.linear).toBe(false);
  });

  it('shows params only when their rule holds', () => {
    const ink = def.params.find(p => p.key === 'ink')!;
    const serp = def.params.find(p => p.key === 'serpentine')!;
    expect(paramVisible(ink, { color: 'bn' })).toBe(true);
    expect(paramVisible(ink, { color: 'paleta' })).toBe(false);
    expect(paramVisible(serp, { algo: 'floyd' })).toBe(true);
    expect(paramVisible(serp, { algo: 'bayer8' })).toBe(false);
    const c1 = def.params.find(p => p.key === 'c1')!;
    expect(paramVisible(c1, { color: 'paleta', palette: 'custom' })).toBe(true);
    expect(paramVisible(c1, { color: 'paleta', palette: 'pico8' })).toBe(false);
  });

  it('normalizes finishes from untrusted input', () => {
    expect(normalizeFinish(null)).toBeNull();
    expect(normalizeFinish({ kind: 'sparkles' })).toBeNull();
    const f = normalizeFinish({ kind: 'grain', amount: 3, params: { amount: -1, future: 'x', bad: { o: 1 } } })!;
    expect(f.on).toBe(true);
    expect(f.amount).toBe(1);
    expect(f.params.amount).toBe(0);
    expect(f.params.future).toBe('x'); // unknown params are kept for newer catalogs
    expect('bad' in f.params).toBe(false);
    expect(normalizeFinish({ kind: 'blur', on: false })!.on).toBe(false);
  });
});
