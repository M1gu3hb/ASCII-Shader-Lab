import { describe, expect, it } from 'vitest';
import { create, polarisation } from '../../src/families/sims/boids';
import { META } from '../../src/families/meta/boids';
import { defaultParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Boids: the three rules do what Reynolds's model says, and the brush scares the flock away. */

const run = (over: Params, steps: number) => {
  const m = create({ seed: 'bandada', params: { ...defaultParams(META), count: 400, vision: 0.12, wCoh: 0.5, predators: 0, obstacles: 0, trail: 0, ...over }, res: 48 });
  m.step(steps);
  return m;
};
const arrays = (m: ReturnType<typeof create>) => {
  const s = m.snapshot();
  return { pos: s.arrays.pos as Float32Array, vel: s.arrays.vel as Float32Array };
};
/** Mean distance to the nearest other boid, on the torus. */
const nearest = (pos: Float32Array) => {
  const n = pos.length / 2;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      let dx = Math.abs(pos[j * 2] - pos[i * 2]), dy = Math.abs(pos[j * 2 + 1] - pos[i * 2 + 1]);
      dx = Math.min(dx, 2 - dx); dy = Math.min(dy, 1 - dy);
      best = Math.min(best, Math.hypot(dx, dy));
    }
    sum += best;
  }
  return sum / n;
};

describe('bandadas (boids)', () => {
  it('la alineación ordena la bandada: el parámetro de polarización sube', () => {
    const aligned = arrays(run({ wAli: 3 }, 300)), free = arrays(run({ wAli: 0 }, 300));
    const pa = polarisation(aligned.vel, 400), pf = polarisation(free.vel, 400);
    expect(pa).toBeGreaterThan(0.8);
    expect(pf).toBeLessThan(0.3);
  });

  it('la separación mantiene la distancia entre vecinos; sin ella, la cohesión los apiña', () => {
    const apart = nearest(arrays(run({ wSep: 3, wCoh: 1.5 }, 240)).pos), packed = nearest(arrays(run({ wSep: 0, wCoh: 1.5 }, 240)).pos);
    expect(apart).toBeGreaterThan(packed * 2);
  });

  it('«Espantar» vacía la zona que se toca', () => {
    const m = run({ wAli: 1, wCoh: 1 }, 120);
    const within = () => { const { pos } = arrays(m); let k = 0; for (let i = 0; i < 400; i++) if (Math.hypot(pos[i * 2], pos[i * 2 + 1]) < 0.15) k++; return k; };
    // a touch held at the centre for a second, as the engines send it (once per frame)
    let before = 0;
    for (let f = 0; f < 6; f++) { m.step(10); before += within(); }
    let after = 0;
    for (let f = 0; f < 6; f++) { m.stroke!({ brush: 'espantar', x0: 0, y0: 0, x1: 0, y1: 0, r: 0.15, strength: 1 }); m.step(5); after += within(); }
    expect(after).toBeLessThan(before * 0.5 + 3);
  });

  it('los depredadores abren hueco: los agentes quedan más lejos de ellos que de un punto cualquiera', () => {
    const m = run({ predators: 2, wAli: 1.5, wCoh: 1 }, 300);
    const s = m.snapshot(), pos = s.arrays.pos as Float32Array, ppos = s.arrays.ppos as Float32Array;
    const meanNearest = (x: number, y: number) => {
      let best = Infinity;
      for (let i = 0; i < 400; i++) {
        let dx = Math.abs(pos[i * 2] - x), dy = Math.abs(pos[i * 2 + 1] - y);
        dx = Math.min(dx, 2 - dx); dy = Math.min(dy, 1 - dy);
        best = Math.min(best, Math.hypot(dx, dy));
      }
      return best;
    };
    const toPred = (meanNearest(ppos[0], ppos[1]) + meanNearest(ppos[2], ppos[3])) / 2;
    // the nearest boid to a predator is farther than the typical spacing of the flock
    expect(toPred).toBeGreaterThan(nearest(pos) * 1.5);
  });
});
