import { describe, expect, it } from 'vitest';
import { columnOf, impl, streamOn, wave } from '../../src/families/analytic/lluvia_agua.cpu';
import { META } from '../../src/families/meta/lluvia_agua';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Lluvia digital sobre agua» (I-15): heads that fall, impacts that start ripples on the water line. */

const PX = 14 / 720;
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const kOf = (p: Params) => packParams(META, p);
const v = (k: Float32Array, x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); };

/** What the shader derives from the parameters (F_lluvia_agua). */
function geom(k: Float32Array) {
  const colW = (k[0] * PX) / 1.4, co = 0.25 / k[0];
  return {
    colW, co, dens: k[1], sp: k[2], yw: -0.5 + k[4],
    amp: 0.035 * k[5], tau: 0.35 + 1.6 * (1 - k[6]), cv: 0.1 + 0.5 * k[7], kw: (2 * Math.PI) / (0.06 + 0.24 * k[11]),
    xOf: (ci: number) => (ci + 0.5 - co) * colW,
  };
}

/** The impacts of column ci in [t0, t1): their times. */
function impacts(ci: number, k: Float32Array, t0: number, t1: number): number[] {
  const g = geom(k);
  const [P, ph] = columnOf(ci, g.sp);
  const out: number[] = [];
  for (let j = Math.floor(t0 / P - ph); (j + ph) * P < t1; j++) {
    const T = (j + ph) * P;
    if (T >= t0 && streamOn(ci, j, g.dens)) out.push(T);
  }
  return out;
}

describe('lluvia digital sobre agua', () => {
  it('cada cabeza cae por su columna a su velocidad y llega a la línea de agua en el instante de su impacto', () => {
    const k = kOf(params('consola'));
    const g = geom(k);
    let checked = 0;
    for (let ci = -30; ci < 30 && checked < 8; ci++) {
      const [, , vel] = columnOf(ci, g.sp);
      for (const T of impacts(ci, k, 20, 40)) {
        // half a second before the impact the head (the brightest glyph) is v·0.5 above the water, then lower
        for (const before of [0.6, 0.3]) {
          const yh = g.yw + vel * before;
          if (yh > 0.48) continue;
          expect(v(k, g.xOf(ci), yh + 0.5 * PX, T - before), `columna ${ci}`).toBeGreaterThan(0.99);
        }
        checked++;
        break;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  it('un impacto levanta la línea de agua donde cae y la onda llega después a los lados', () => {
    const k = kOf(params('estanque'));
    const g = geom(k);
    let pre = 0, post = 0, before = 0, after = 0, n = 0;
    const d = 0.12;
    for (let ci = -40; ci < 40; ci++) for (const T of impacts(ci, k, 30, 60)) {
      const x = g.xOf(ci);
      const h = (xx: number, tt: number) => Math.abs(wave(xx, tt, g.colW, g.co, g.sp, g.dens, g.amp, g.tau, g.cv, g.kw)[0]);
      pre += h(x, T - 0.02); post += h(x, T + 0.15);
      // at distance d the front arrives at T + d / c
      before += h(x + d, T + d / g.cv - 0.3) + h(x - d, T + d / g.cv - 0.3);
      after += h(x + d, T + d / g.cv + 0.12) + h(x - d, T + d / g.cv + 0.12);
      n++;
    }
    expect(n).toBeGreaterThan(30);
    expect(post).toBeGreaterThan(1.5 * pre);
    expect(after).toBeGreaterThan(1.3 * before);
  });

  it('sin ondas la línea de agua es recta; con ondas sube y baja a lo largo y con el tiempo', () => {
    const still = kOf(params('consola', { waves: 0 })), live = kOf(params('consola'));
    const g = geom(live);
    const hs = (k: Float32Array, t: number) => Array.from({ length: 60 }, (_, i) => wave(-0.8 + i * 0.027, t, g.colW, g.co, g.sp, g.dens, 0.035 * k[5], g.tau, g.cv, g.kw)[0]);
    expect(Math.max(...hs(still, 12).map(Math.abs))).toBe(0);
    const a = hs(live, 12), b = hs(live, 12.4);
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(0.01);
    expect(a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0)).toBeGreaterThan(0.05);
  });

  it('la lluvia no cae bajo el agua: allí sólo está su reflejo', () => {
    const dry = kOf(params('espejo', { reflect: 0, waves: 0 })), wet = kOf(params('espejo', { reflect: 1, waves: 0 }));
    const yw = -0.5 + (params('espejo').level as number);
    let sDry = 0, sWet = 0, above = 0, n = 0;
    for (const t of [7, 13, 21]) for (let x = -0.85; x <= 0.85; x += 0.0139) {
      for (let y = yw - 3 * PX; y > yw - 0.2; y -= PX) { sDry += v(dry, x, y, t); sWet += v(wet, x, y, t); n++; }
      for (let y = yw + 3 * PX; y < yw + 0.2; y += PX) above += v(dry, x, y, t);
    }
    // without the mirror the water is dark: none of the rain's glyphs reach it
    expect(sDry / n).toBeLessThan(0.1);
    expect(sWet / n).toBeGreaterThan(2 * (sDry / n));
    expect(above / n).toBeGreaterThan(2 * (sDry / n));
  });
});
