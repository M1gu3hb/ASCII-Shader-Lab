import { describe, expect, it } from 'vitest';
import { defaultRecipe, normalizeRecipe, normOptics, syncVersion } from '../../src/engine/recipe';
import { OP, opticsAt, opticsLoop } from '../../src/engine/basic/optics';
import { opticsUniforms } from '../../src/engine/opticsU';
import { fieldKey, buildFieldShader } from '../../src/engine/glsl/programs';
import { PATTERN_GLSL } from '../../src/engine';

/** V-06 «Lluvia sobre vidrio» and V-10 «Vidrio acanalado»: glass in front of the piece (recipe.optics). */

describe('vidrio delante (recipe.optics)', () => {
  it('una receta sin vidrio queda igual; con vidrio pasa al formato 3 y lo conserva al normalizarse', () => {
    const r = defaultRecipe();
    expect(normalizeRecipe(JSON.parse(JSON.stringify(r)))).not.toHaveProperty('optics');
    r.optics = normOptics({ kind: 'lluvia', amount: 2, scale: 0.1 })!;
    syncVersion(r);
    expect(r.v).toBe(3);
    expect(r.optics).toMatchObject({ kind: 'lluvia', amount: 1, scale: 0.4 });
    const back = normalizeRecipe(JSON.parse(JSON.stringify(r)));
    expect(back.optics).toEqual(r.optics);
    expect(back.v).toBe(3);
    expect(Object.keys(back).at(-1)).toBe('optics');
    expect(normOptics({ kind: 'otra' })).toBeUndefined();
    expect(normOptics({ kind: 'acanalado', profile: 7.6 })!.profile).toBe(4);
  });

  it('la clave del programa distingue el vidrio y el sombreador lo incluye sólo cuando está', () => {
    expect(fieldKey(['nube'], 'pattern', false, true)).not.toBe(fieldKey(['nube'], 'pattern', false));
    expect(buildFieldShader(['nube'], 'pattern', false, PATTERN_GLSL, true)).toContain('vec4 optics(vec2 p, float t)');
    expect(buildFieldShader(['nube'], 'pattern', false, PATTERN_GLSL)).not.toContain('optics(');
  });

  for (const kind of ['lluvia', 'acanalado'] as const) {
    it(`${kind}: desplazamiento acotado, sin NaN, y cambia con el tiempo (continuo)`, () => {
      const u = opticsUniforms(normOptics({ kind, amount: 1, scale: 1, speed: 0.8, profile: kind === 'lluvia' ? 0.8 : 1 })!);
      let moved = 0, changed = 0;
      for (let k = 0; k < 400; k++) {
        const x = -0.9 + (k % 40) * 0.045, y = -0.48 + Math.floor(k / 40) * 0.096;
        opticsAt(x, y, 3, u);
        const a = [...OP];
        for (const v of a) expect(Number.isFinite(v)).toBe(true);
        expect(Math.hypot(a[0], a[1])).toBeLessThan(0.3);
        if (Math.hypot(a[0], a[1]) > 1e-3) moved++;
        opticsAt(x, y, 3.7, u);
        if (Math.abs(OP[0] - a[0]) + Math.abs(OP[1] - a[1]) + Math.abs(OP[2] - a[2]) > 1e-4) changed++;
      }
      expect(moved).toBeGreaterThan(20);
      expect(changed).toBeGreaterThan(10);
    });
  }

  it('con «Bucle perfecto» el vidrio empalma: al final del bucle es el del principio', () => {
    const u = opticsUniforms(normOptics({ kind: 'lluvia', amount: 1, speed: 1, profile: 1 })!);
    for (const [x, y] of [[0.1, 0.2], [-0.4, -0.1], [0.55, 0.3]]) {
      opticsLoop(x, y, 0, 8, u);
      const start = [...OP];
      opticsLoop(x, y, 8 - 1e-6, 8, u);
      expect(OP[0]).toBeCloseTo(start[0], 4);
      expect(OP[1]).toBeCloseTo(start[1], 4);
    }
  });
});
