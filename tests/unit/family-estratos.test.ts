import { describe, expect, it } from 'vitest';
import { depth, faultOf, impl, layerAt } from '../../src/families/analytic/estratos.cpu';
import { META } from '../../src/families/meta/estratos';
import { defaultParams, packParams } from '../../src/families/params';
import type { Palette, Params } from '../../src/families/types';

/** Mechanism checks of «Estratos» (I-23): one colour per layer, folded boundaries, faults that offset them. */

const PX = 14 / 720;
const PAL: Palette = { n: 6, rgb: new Float32Array([0.16, 0.07, 0.04, 0.54, 0.23, 0.11, 0.78, 0.44, 0.23, 0.89, 0.7, 0.48, 0.96, 0.88, 0.74, 0.42, 0.29, 0.21]) };
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const C = new Float64Array(3);
const colour = (k: Float32Array, x: number, y: number, t: number) => { impl.prep!(t, k, PAL, PX); impl.cpuColor!(x, y, t, k, C); return `${C[0].toFixed(4)},${C[1].toFixed(4)},${C[2].toFixed(4)}`; };

describe('estratos', () => {
  it('un color por estrato: todo el estrato del mismo color de la paleta, y los vecinos de otro', () => {
    const k = packParams(META, params('canon'));
    const byLayer = new Map<number, Set<string>>();
    for (let x = -0.88; x <= 0.88; x += 0.031) for (let y = -0.49; y <= 0.49; y += 0.017) {
      const s = layerAt(x, y, 9, k);
      if (!byLayer.has(s)) byLayer.set(s, new Set());
      byLayer.get(s)!.add(colour(k, x, y, 9));
    }
    expect(byLayer.size).toBeGreaterThan(8);
    for (const [s, cs] of byLayer) expect(cs.size, `estrato ${s}`).toBe(1);
    const layers = [...byLayer.keys()].sort((a, b) => a - b);
    let differ = 0, pairs = 0;
    for (let i = 0; i + 1 < layers.length; i++) if (layers[i + 1] === layers[i] + 1) { pairs++; if ([...byLayer.get(layers[i])!][0] !== [...byLayer.get(layers[i + 1])!][0]) differ++; }
    expect(differ / pairs).toBeGreaterThan(0.75);
    // the colours are the palette's (all but the first, left for the ink lines)
    const pal = new Set(Array.from({ length: 5 }, (_, i) => `${PAL.rgb[3 + i * 3].toFixed(4)},${PAL.rgb[4 + i * 3].toFixed(4)},${PAL.rgb[5 + i * 3].toFixed(4)}`));
    for (const cs of byLayer.values()) expect(pal.has([...cs][0])).toBe(true);
  });

  it('una falla corta las capas: la profundidad salta su desplazamiento al cruzarla, y fuera de ella es continua', () => {
    const k = packParams(META, params('fallas'));
    for (let f = 0; f < 4; f++) {
      const F = faultOf(f, 5, k);
      // two points on the fault, crossed along its normal
      for (const s of [-0.15, 0.1]) {
        const px = F.cx - F.ny * s, py = F.cy + F.nx * s;
        const e = 0.012;
        const a = depth(px - F.nx * e, py - F.ny * e, 5, k), b = depth(px + F.nx * e, py + F.ny * e, 5, k);
        // the jump (plus the drag on both sides, which adds to it) is at least the throw
        expect(Math.abs(b - a), `falla ${f}`).toBeGreaterThan(0.9 * F.D);
      }
    }
    // without faults, two points as close have nearly the same depth
    const none = packParams(META, params('fallas', { faults: 0 }));
    for (let x = -0.8; x < 0.8; x += 0.1) expect(Math.abs(depth(x + 0.024, 0.1, 5, none) - depth(x, 0.1, 5, none))).toBeLessThan(0.02);
  });

  it('el plegado dobla las fronteras: sin plegado ni deformación ni fallas las capas son horizontales', () => {
    const flat = packParams(META, params('plegado', { fold: 0, warp: 0, faults: 0 })), folded = packParams(META, params('plegado'));
    const spread = (k: Float32Array) => { const d = Array.from({ length: 40 }, (_, i) => depth(-0.85 + i * 0.044, 0, 7, k)); return Math.max(...d) - Math.min(...d); };
    expect(spread(flat)).toBeLessThan(1e-9);
    expect(spread(folded)).toBeGreaterThan(0.08);
  });

  it('la tectónica y la sedimentación mueven las capas con el tiempo', () => {
    const k = packParams(META, params('canon'));
    let moved = 0;
    for (let x = -0.8; x < 0.8; x += 0.2) if (Math.abs(depth(x, 0, 30, k) - depth(x, 0, 0, k)) > 0.05) moved++;
    expect(moved).toBeGreaterThan(5);
  });
});
