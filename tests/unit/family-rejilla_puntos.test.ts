import { describe, expect, it } from 'vitest';
import { impl, project } from '../../src/families/analytic/rejilla_puntos.cpu';
import { META } from '../../src/families/meta/rejilla_puntos';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Rejilla de puntos» (I-28): a lattice of dots in perspective that undulates, with no sun. */

const PX = 14 / 720;
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const v = (k: Float32Array, x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); };
const O = new Float64Array(4);

describe('rejilla de puntos', () => {
  it('puntos, no líneas: a lo largo de una fila hay picos separados por huecos oscuros', () => {
    const k = packParams(META, params('campo', { amp: 0, ripple: 0, sway: 0, travel: 0 }));
    // the row of the screen through a near lattice row
    project(0, 4, 0, k, O);
    const ys = O[1];
    const row = Array.from({ length: 400 }, (_, i) => v(k, -0.88 + i * 0.0044, ys, 0));
    const dark = row.filter(x => x < 0.05).length / row.length;
    let peaks = 0;
    for (let i = 1; i < row.length - 1; i++) if (row[i] > 0.6 && row[i] >= row[i - 1] && row[i] > row[i + 1]) peaks++;
    expect(dark).toBeGreaterThan(0.5);
    expect(peaks).toBeGreaterThan(3);
  });

  it('perspectiva: los puntos lejanos están más juntos en la pantalla que los cercanos', () => {
    const k = packParams(META, params('campo', { amp: 0, ripple: 0, sway: 0, travel: 0 }));
    const gap = (j: number) => { project(0, j, 0, k, O); const a = O[0], ya = O[1]; project(1, j, 0, k, O); return [O[0] - a, ya]; };
    const [near, yNear] = gap(2), [far, yFar] = gap(12);
    expect(near).toBeGreaterThan(2 * far);
    // and the far rows are higher on the screen (towards the horizon)
    expect(yFar).toBeGreaterThan(yNear);
  });

  it('la rejilla ondula: con ondas los puntos suben y bajan con el tiempo; sin ondas, quietos', () => {
    const still = packParams(META, params('gota', { amp: 0 })), wavy = packParams(META, params('gota'));
    const ys = (k: Float32Array, t: number) => [[0, 3], [2, 5], [-3, 7], [1, 9]].map(([i, j]) => { project(i, j, t, k, O); return O[1]; });
    const a = ys(still, 1), b = ys(still, 4);
    a.forEach((y, i) => expect(y).toBeCloseTo(b[i], 9));
    const c = ys(wavy, 1), d = ys(wavy, 4);
    expect(c.reduce((s, y, i) => s + Math.abs(y - d[i]), 0)).toBeGreaterThan(0.01);
  });

  it('sin sol: por encima del horizonte no hay luz', () => {
    const k = packParams(META, params('marejada', { tilt: 0 }));
    // the horizon of a camera pitched by 10° with focal 1.1
    const hz = 1.1 * Math.tan((10 * Math.PI) / 180);
    let lit = 0;
    for (let x = -0.85; x < 0.85; x += 0.02) for (let y = hz + 0.01; y < 0.5; y += 0.02) lit += v(k, x, y, 6);
    expect(lit).toBe(0);
  });
});
