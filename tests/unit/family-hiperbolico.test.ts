import { describe, expect, it } from 'vitest';
import { FOLD, fold, hyperbolicPQ, hyperbolicTriangle, impl } from '../../src/families/analytic/hiperbolico.cpu';
import { META } from '../../src/families/meta/hiperbolico';
import { defaultParams, packParams, timeContract } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Teselación hiperbólica»: the fundamental triangle, the fold and its symmetry. */

const rnd = (() => { let s = 12345; return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; })();
const PAIRS: Array<[number, number]> = [[7, 3], [3, 7], [4, 5], [6, 4], [5, 4], [8, 3], [12, 12]];

describe('teselación hiperbólica', () => {
  it('sólo dibuja {p,q} hiperbólicos: q sube al primer valor con (p − 2)(q − 2) > 4', () => {
    expect(hyperbolicPQ(7, 3)).toEqual([7, 3]);
    expect(hyperbolicPQ(4, 4)).toEqual([4, 5]);
    expect(hyperbolicPQ(3, 6)).toEqual([3, 7]);
    expect(hyperbolicPQ(6, 3)).toEqual([6, 4]);
    expect(hyperbolicPQ(5, 3)).toEqual([5, 4]);
    for (let p = 3; p <= 12; p++) for (let q = 3; q <= 12; q++) {
      const [P, Q] = hyperbolicPQ(p, q);
      expect((P - 2) * (Q - 2), `${p},${q}`).toBeGreaterThan(4);
    }
  });

  it('el triángulo fundamental tiene ángulos π/p, π/q y π/2, y el espejo corta el borde en ángulo recto', () => {
    for (const [p, q] of PAIRS) {
      const T = hyperbolicTriangle(p, q);
      // the edge mirror is orthogonal to the unit circle: c² = 1 + r²
      expect(T.cx * T.cx - T.cr * T.cr).toBeCloseTo(1, 9);
      // it crosses the real axis at the edge midpoint (right angle there: its centre is on that axis)
      expect(T.cx - T.cr).toBeCloseTo(T.m, 12);
      // the vertex lies on the mirror, and the mirror meets the spoke at angle π/q
      expect(Math.hypot(T.vx - T.cx, T.vy)).toBeCloseTo(T.cr, 9);
      const nx = (T.vx - T.cx) / T.cr, ny = T.vy / T.cr;
      const angle = Math.asin(Math.abs(Math.cos(T.an) * nx + Math.sin(T.an) * ny));
      expect(angle, `${p},${q}`).toBeCloseTo(Math.PI / q, 9);
      // the inradius b in the disk: tanh(b/2)
      expect(Math.tanh(T.b / 2)).toBeCloseTo(T.m, 9);
    }
  });

  it('el pliegue lleva cualquier punto del disco al triángulo fundamental', () => {
    for (const [p, q] of PAIRS) {
      const T = hyperbolicTriangle(p, q);
      for (let i = 0; i < 400; i++) {
        const r = 0.97 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2;
        fold(r * Math.cos(a), r * Math.sin(a), T.an, T.cx, T.cr);
        const ang = Math.atan2(FOLD.y, FOLD.x);
        expect(ang).toBeGreaterThanOrEqual(-1e-9);
        expect(ang).toBeLessThanOrEqual(T.an + 1e-9);
        expect(Math.hypot(FOLD.x - T.cx, FOLD.y)).toBeGreaterThanOrEqual(T.cr - 1e-9);
        expect(Math.hypot(FOLD.x, FOLD.y)).toBeLessThan(1);
        expect(FOLD.n).toBeLessThan(40);
      }
    }
  });

  it('la teselación no cambia al girar 2π/p ni al reflejar en una arista (la paridad sí, con el reflejo)', () => {
    for (const [p, q] of PAIRS) {
      const T = hyperbolicTriangle(p, q);
      const c = Math.cos((2 * Math.PI) / p), s = Math.sin((2 * Math.PI) / p);
      for (let i = 0; i < 200; i++) {
        const r = 0.9 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2, x = r * Math.cos(a), y = r * Math.sin(a);
        fold(x, y, T.an, T.cx, T.cr);
        const A = { ...FOLD };
        fold(c * x - s * y, s * x + c * y, T.an, T.cx, T.cr);
        expect(FOLD.x).toBeCloseTo(A.x, 6); expect(FOLD.y).toBeCloseTo(A.y, 6); expect(FOLD.par).toBe(A.par);
        // reflection in the edge mirror (an inversion in its circle)
        const dx = x - T.cx, dy = y, k = (T.cr * T.cr) / (dx * dx + dy * dy);
        fold(T.cx + dx * k, dy * k, T.an, T.cx, T.cr);
        expect(FOLD.x).toBeCloseTo(A.x, 6); expect(FOLD.y).toBeCloseTo(A.y, 6); expect(FOLD.par).toBe(1 - A.par);
      }
    }
  });

  it('la imagen quieta es simétrica por el giro 2π/p y la deriva vuelve a coincidir tras un polígono', () => {
    // («Relieve» lights every tile from the same side of the screen: its geometry turns, its light does not)
    for (const pr of META.presets.filter(x => x.params.motif !== 'relieve')) {
      const p: Params = { ...defaultParams(META), ...pr.params, drift: 0, turn: 0 };
      const k = packParams(META, p);
      impl.prep!(0, k);
      const P = Math.round(Number(p.p));
      const c = Math.cos((2 * Math.PI) / P), s = Math.sin((2 * Math.PI) / P);
      let bad = 0, n = 0;
      for (let i = 0; i < 600; i++) {
        const r = 0.45 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2, x = r * Math.cos(a), y = r * Math.sin(a);
        const v0 = impl.cpu(x, y, 0, k), v1 = impl.cpu(c * x - s * y, s * x + c * y, 0, k);
        n++;
        if (Math.abs(v0 - v1) > 1e-3) bad++;
      }
      // (points that fall right on an edge can land on either side of it)
      expect(bad / n, pr.id).toBeLessThan(0.01);
    }
    // the drift: 8 s per polygon at speed 1 (one period of u), the turn off
    const p = { ...defaultParams(META), drift: 1, turn: 0 };
    const k = packParams(META, p);
    const img = (t: number) => { impl.prep!(t, k); const o: number[] = []; for (let i = 0; i < 300; i++) { const r = 0.45 * Math.sqrt((i + 0.5) / 300), a = i * 2.39996; o.push(impl.cpu(r * Math.cos(a), r * Math.sin(a), t, k)); } return o; };
    // just before u wraps (the half-turn about an edge midpoint, a symmetry) and just after it (no view)
    const a = img(8 - 1e-6), b = img(8 + 1e-6), mid = img(4);
    const diff = (u: number[], v: number[]) => u.filter((x, i) => Math.abs(x - v[i]) > 1e-3).length / u.length;
    expect(diff(a, b)).toBeLessThan(0.02);
    expect(diff(a, mid)).toBeGreaterThan(0.2);
  });
  /** The CPU twin over the 2:1 domain at time t (scale: the preset's layer scale, as the engines apply it). */
  const frame = (p: Params, t: number, sc = 1, w = 64, h = 32) => {
    const k = packParams(META, { ...defaultParams(META), ...p });
    impl.prep!(t, k);
    const o: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.push(impl.cpu(((x + 0.5) / w - 0.5) * 2 * sc, (0.5 - (y + 0.5) / h) * sc, t, k));
    return o;
  };
  const mad = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
  const lit = (a: number[]) => a.filter(v => v > 24 / 255).length / a.length;

  it('«Relieve»: cada azulejo tiene el bisel claro arriba a la izquierda y oscuro abajo a la derecha, también plegado', () => {
    for (const [P, Q] of [[6, 4], [5, 4], [7, 3], [4, 5]]) {
      const T = hyperbolicTriangle(P, Q);
      const p: Params = { ...defaultParams(META), p: P, q: Q, motif: 'relieve', width: 1, drift: 0, turn: 0, rim: 0, outside: 0 };
      const k = packParams(META, p);
      impl.prep!(0, k);
      const tag = `${P},${Q}`;
      // the central polygon (inradius m in the disk, 0.48 m on the screen): just inside its edges along the diagonals
      const r = 0.48 * T.m * 0.9;
      let lightSide = 0, darkSide = 0;
      for (const f of [0.75, 0.8, 0.85]) lightSide += impl.cpu(r * Math.cos(f * Math.PI), r * Math.sin(f * Math.PI), 0, k);
      for (const f of [-0.25, -0.2, -0.15]) darkSide += impl.cpu(r * Math.cos(f * Math.PI), r * Math.sin(f * Math.PI), 0, k);
      expect(lightSide, tag).toBeGreaterThan(darkSide + 0.6);
    }
  });

  it('el pliegue lleva la dirección de su derivada: la de un desplazamiento pequeño, girada o reflejada', () => {
    for (const [P, Q] of PAIRS) {
      const T = hyperbolicTriangle(P, Q);
      for (let i = 0; i < 300; i++) {
        const r = 0.95 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2, x = r * Math.cos(a), y = r * Math.sin(a);
        const da = rnd() * Math.PI * 2, e = 1e-7, ex = Math.cos(da), ey = Math.sin(da);
        fold(x, y, T.an, T.cx, T.cr, 1, true);
        const F0 = { ...FOLD };
        fold(x + e * ex, y + e * ey, T.an, T.cx, T.cr, 1, true);
        // (a step across a mirror folds differently: skip those)
        if (FOLD.n !== F0.n || FOLD.par !== F0.par) continue;
        let vx = FOLD.x - F0.x, vy = FOLD.y - F0.y;
        const l = Math.hypot(vx, vy); vx /= l; vy /= l;
        // dw = A dz, or A conj(dz)
        const dx = ex, dy = F0.flip > 0.5 ? -ey : ey;
        const px = F0.ax * dx - F0.ay * dy, py = F0.ax * dy + F0.ay * dx;
        expect(Math.hypot(px - vx, py - vy), `${P},${Q}`).toBeLessThan(1e-4);
        expect(F0.flip, `${P},${Q}`).toBe(F0.par);
      }
    }
  });

  it('contrato: sin giro, bucle exacto de 8 / deriva s (el gemelo de CPU en t y t + periodo); con giro, continuo', () => {
    for (const pr of META.presets) {
      const tc = timeContract(META, { ...defaultParams(META), ...pr.params });
      expect(tc, pr.id).toBe(pr.params.turn === 0 ? 'bucle' : 'continuo');
      expect(pr.period !== undefined, pr.id).toBe(tc === 'bucle');
      if (tc !== 'bucle') continue;
      expect(pr.period).toBeCloseTo(8 / Math.abs(pr.params.drift as number), 9);
      const sc = pr.layer?.scale ?? 1;
      for (const t of [0.6, 11.3]) {
        const a = frame(pr.params, t, sc), b = frame(pr.params, t + pr.period!, sc);
        // (a cell right on an edge can land on either side of it)
        expect(a.filter((v, i) => Math.abs(v - b[i]) > 1e-3).length / a.length, `${pr.id} t=${t}`).toBeLessThan(0.01);
        expect(mad(a, frame(pr.params, t + pr.period! / 2, sc)), `${pr.id} medio periodo`).toBeGreaterThan(0.01);
      }
    }
  });

  it('ningún preset se queda quieto ni vacío; «Mosaico que fluye» llena el cuadro', () => {
    for (const pr of META.presets) {
      const sc = pr.layer?.scale ?? 1;
      for (const t of [1, 61, 600]) {
        const a = frame(pr.params, t, sc), b = frame(pr.params, t + 2, sc);
        expect(mad(a, b), `${pr.id} t=${t}`).toBeGreaterThan(0.003);
        expect(lit(b), `${pr.id} t=${t}`).toBeGreaterThan(0.02);
        expect(lit(b), `${pr.id} t=${t}`).toBeLessThan(0.97);
      }
    }
    const fill = META.presets.find(x => x.id === 'mosaico')!;
    // across a 16:9 canvas, every column has ink
    const f = frame(fill.params, 3, (fill.layer?.scale ?? 1) * 0.89, 64, 32);
    for (let x = 0; x < 64; x++) expect(f.filter((v, i) => i % 64 === x && v > 0.1).length, `columna ${x}`).toBeGreaterThan(3);
  });
});
