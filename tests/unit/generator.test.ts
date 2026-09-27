import { describe, expect, it } from 'vitest';
import { defaultRecipe, normalizeRecipe, PATTERN_IDS, PATTERN_GLSL, PATTERNS, CHARSETS } from '../../src/engine';
import { generate, fingerprint, mutate, roll, SPACES, ARCHETYPES, LOCK_GROUPS } from '../../src/random';

const base = defaultRecipe();

describe('generator', () => {
  it('is reproducible: same seed, same recipe', () => {
    for (const s of SPACES) {
      const a = generate({ seed: 'faro-lunar-417', space: s.id, base });
      const b = generate({ seed: 'faro-lunar-417', space: s.id, base });
      expect(a).toEqual(b);
    }
  });

  it('different seeds give different results', () => {
    const fps = new Set<string>();
    for (let i = 0; i < 300; i++) fps.add(fingerprint(generate({ seed: 'semilla-' + i, space: 'arte', base })));
    expect(fps.size).toBeGreaterThan(290);
  });

  it('produces valid recipes (normalisation is a no-op)', () => {
    for (const s of SPACES) for (let i = 0; i < 40; i++) {
      const r = generate({ seed: `v-${i}`, space: s.id, base });
      const n = normalizeRecipe(r, PATTERN_IDS);
      expect(n.layers).toEqual(r.layers);
      expect(n.color).toEqual(r.color);
      for (const l of r.layers) expect(PATTERN_GLSL[l.pattern]).toBeTruthy();
      expect(r.layers.length).toBeGreaterThanOrEqual(1);
      expect(r.layers.length).toBeLessThanOrEqual(4);
    }
  });

  it('locked groups are copied from the base and do not change other groups', () => {
    const b = generate({ seed: 'base', space: 'arte', base });
    for (const g of LOCK_GROUPS) {
      const free = generate({ seed: 'otra', space: 'arte', base: b });
      const locked = generate({ seed: 'otra', space: 'arte', base: b, locks: [g] });
      if (g === 'color') { expect(locked.color).toEqual(b.color); expect(locked.layers).toEqual(free.layers); }
      if (g === 'forma') { expect(locked.layers).toEqual(b.layers); expect(locked.color).toEqual(free.color); }
      if (g === 'glifos') { expect(locked.glyph).toEqual(b.glyph); expect(locked.fx).toEqual(free.fx); }
      if (g === 'efectos') expect(locked.fx).toEqual(b.fx);
    }
  });

  it('terminal space only uses ASCII-safe charsets', () => {
    const ascii = new Set(CHARSETS.filter(c => c.ascii).map(c => c.chars));
    for (let i = 0; i < 60; i++) expect(ascii.has(generate({ seed: 't' + i, space: 'terminal', base }).glyph.charset)).toBe(true);
  });

  it('roll avoids fingerprints the user has already seen', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const r = roll({ space: 'fondos', base, seen });
      expect(r.repeated).toBe(false);
      seen.add(r.fp);
    }
    expect(seen.size).toBe(120);
  });

  it('explicit seeds reproduce the same result through roll()', () => {
    const a = roll({ space: 'arte', base, seen: new Set(), seed: 'marea-leve-001' });
    const b = roll({ space: 'arte', base, seen: new Set([a.fp]), seed: 'marea-leve-001' });
    expect(b.recipe).toEqual(a.recipe);
    expect(b.repeated).toBe(true);
  });

  it('mutation is deterministic and respects locks', () => {
    const r = generate({ seed: 'x', space: 'arte', base });
    expect(mutate(r, 0.5, 'm1')).toEqual(mutate(r, 0.5, 'm1'));
    const m = mutate(r, 1, 'm2', ['color', 'forma']);
    expect(m.color).toEqual(r.color);
    expect(m.layers).toEqual(r.layers);
  });

  it('every archetype pattern exists in the catalog', () => {
    const ids = new Set(PATTERNS.map(p => p.id));
    for (const a of ARCHETYPES) for (const p of Object.keys({ ...a.patterns, ...(a.overlays ?? {}) })) expect(ids.has(p), `${a.id}:${p}`).toBe(true);
  });
});
