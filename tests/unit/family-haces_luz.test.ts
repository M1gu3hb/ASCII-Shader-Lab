import { describe, expect, it } from 'vitest';
import { hacesBeam, impl } from '../../src/families/analytic/haces.cpu';
import { META } from '../../src/families/meta/haces_luz';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';
import { fbm } from '../../src/engine/basic/core';

/**
 * Mechanism of «Haces de luz» (I-05, I-21): thin beams that enter from the frame and sweep; a beam shows only
 * where there is fog; white flashes only where two beams cross; dust only inside the light; hues that rotate.
 */
const PX = 1 / 51;
// only the beams: no haze, no dust, no flashes, no rays, no fog dependence
const bare = (extra: Params = {}): Params => ({ ...defaultParams(META), haze: 0, dust: 0, flash: 0, rays: 0, fog: 0, ...extra });
const lumOf = (p: Params) => {
  const k = packParams(META, p);
  return (x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); };
};
const grid = (f: (x: number, y: number) => number) => {
  const o: number[] = [];
  for (let y = -0.49; y <= 0.49; y += 0.02) for (let x = -0.88; x <= 0.88; x += 0.02) o.push(f(x, y));
  return o;
};

describe('haces de luz', () => {
  it('los láseres son hilos que entran por el borde del cuadro y barren con el tiempo', () => {
    const f = lumOf(bare());
    for (const t of [1, 7, 23]) {
      const g = grid((x, y) => f(x, y, t));
      const lit = g.filter(v => v > 0.2).length / g.length;
      // thin lines, not a flood
      expect(lit, `t=${t}`).toBeGreaterThan(0.01);
      expect(lit, `t=${t}`).toBeLessThan(0.2);
      // each beam starts on the frame's outline, outside the canvas
      for (let i = 0; i < 5; i++) {
        const [ex, ey] = hacesBeam(i, 5, false, 0.6, 0.35, t);
        expect(Math.abs(Math.abs(ex) - 0.95) < 1e-6 || Math.abs(Math.abs(ey) - 0.54) < 1e-6, `haz ${i}`).toBe(true);
      }
    }
    // the light reaches the edges of the canvas: some cell on the border is lit
    const edge = (t: number) => { let n = 0; for (let x = -0.88; x <= 0.88; x += 0.005) for (const y of [-0.49, 0.49]) if (f(x, y, t) > 0.2) n++; for (let y = -0.49; y <= 0.49; y += 0.005) for (const x of [-0.88, 0.88]) if (f(x, y, t) > 0.2) n++; return n; };
    expect(edge(3)).toBeGreaterThan(0);
    // they sweep: the same cells are not lit a few seconds later
    const a = grid((x, y) => f(x, y, 2)), b = grid((x, y) => f(x, y, 6));
    let same = 0, any = 0;
    for (let i = 0; i < a.length; i++) if (a[i] > 0.2) { any++; if (b[i] > 0.2) same++; }
    expect(same / any).toBeLessThan(0.5);
  });

  it('un haz se ve sólo donde hay niebla: su brillo sigue la densidad del fBm', () => {
    const p = bare({ width: 1 });
    const f0 = lumOf(p), f1 = lumOf({ ...p, fog: 1 });
    const t = 4, drift = p.drift as number;
    const beams = [0, 1, 2, 3, 4].map(i => hacesBeam(i, 5, false, p.sweep as number, p.speed as number, t));
    let thin = 0, thick = 0;
    for (let y = -0.49; y <= 0.49; y += 0.01) for (let x = -0.88; x <= 0.88; x += 0.01) {
      const a = f0(x, y, t);
      if (a < 0.2) continue;
      // away from every beam's bright core line (which shows without fog)
      if (beams.some(([ex, ey, an]) => Math.abs((y - ey) * Math.cos(an) - (x - ex) * Math.sin(an)) < 0.045)) continue;
      const fd = fbm(x * 2.2 + (0.15 + drift) * t * 0.07, y * 2.2 + (0.15 + drift) * t * 0.035);
      const b = f1(x, y, t);
      if (fd < 0.36) { expect(b, `(${x.toFixed(2)}, ${y.toFixed(2)}) niebla ${fd.toFixed(2)}`).toBeLessThan(0.5 * a); thin++; }
      if (fd > 0.55) { expect(b, `(${x.toFixed(2)}, ${y.toFixed(2)}) niebla ${fd.toFixed(2)}`).toBeGreaterThan(a); thick++; }
    }
    expect(thin).toBeGreaterThan(3);
    expect(thick).toBeGreaterThan(3);
  });

  it('el destello blanco sólo aparece donde se cruzan dos haces', () => {
    const p = bare({ beams: 2, width: 0.1 });
    const f0 = lumOf(p), f1 = lumOf({ ...p, flash: 1 });
    for (const t of [2, 9, 15]) {
      const [ax, ay, aa] = hacesBeam(0, 2, false, p.sweep as number, p.speed as number, t);
      const [bx, by, ba] = hacesBeam(1, 2, false, p.sweep as number, p.speed as number, t);
      // where the two centre lines meet
      const det = Math.cos(aa) * Math.sin(ba) - Math.sin(aa) * Math.cos(ba);
      const s = ((bx - ax) * Math.sin(ba) - (by - ay) * Math.cos(ba)) / det;
      const cx = ax + s * Math.cos(aa), cy = ay + s * Math.sin(aa);
      let n = 0;
      for (let y = -0.49; y <= 0.49; y += 0.01) for (let x = -0.88; x <= 0.88; x += 0.01) {
        if (f1(x, y, t) - f0(x, y, t) < 0.03) continue;
        n++;
        expect(Math.hypot(x - cx, y - cy), `t=${t} (${x.toFixed(2)}, ${y.toFixed(2)})`).toBeLessThan(0.35);
      }
      if (Math.abs(cx) < 0.8 && Math.abs(cy) < 0.45) expect(n, `t=${t}`).toBeGreaterThan(0);
    }
  });

  it('el polvo sólo se ve dentro de la luz: las mismas motas fuera quedan a oscuras', () => {
    for (const mode of ['foco', 'laser']) {
      const p = bare({ mode, dust: 0 });
      const f0 = lumOf(p), f1 = lumOf({ ...p, dust: 1 });
      let inside = 0;
      for (const t of [3, 11]) for (let y = -0.49; y <= 0.49; y += 0.004) for (let x = -0.88; x <= 0.88; x += 0.006) {
        const d = f1(x, y, t) - f0(x, y, t);
        const light = f0(x, y, t);
        if (light < 2e-4) expect(d, `${mode} (${x}, ${y})`).toBeLessThan(1e-3);
        else if (d > 0.1) inside++;
      }
      expect(inside, mode).toBeGreaterThan(mode === 'foco' ? 50 : 3);
    }
  });

  it('los tonos de los haces giran con el tiempo', () => {
    const col = (hueTurn: number, t: number) => {
      const p = bare({ sweep: 0, hueTurn });
      const k = packParams(META, p);
      impl.prep!(t, k, undefined, PX);
      // a point on beam 0, a little inside from its emitter
      const [ex, ey, a] = hacesBeam(0, 5, false, 0, 0.35, t);
      const x = ex + 0.4 * Math.cos(a), y = ey + 0.4 * Math.sin(a);
      expect(impl.cpu(x, y, t, k)).toBeGreaterThan(0.2);
      const o = new Float64Array(3);
      impl.cpuColor!(x, y, t, k, o);
      return Array.from(o);
    };
    const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(d(col(1, 0), col(1, 6))).toBeGreaterThan(0.2);
    expect(d(col(0, 0), col(0, 6))).toBeLessThan(1e-6);
  });
});
