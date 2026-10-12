import { describe, expect, it } from 'vitest';
import { band, filmRGB, impl } from '../../src/families/analytic/membrana.cpu';
import { MEMBRANA_GLSL, MEM_N, MEM_W } from '../../src/families/analytic/membrana';
import { META } from '../../src/families/meta/membrana';
import { defaultParams, packParams } from '../../src/families/params';
import { paletteOf } from '../../src/families/palette';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Membrana iridiscente»: thin-film interference, Newton's colours, the forms. */

const rgb = (opd: number) => Array.from(filmRGB(opd, new Float64Array(3)));
const k = (p: Params) => packParams(META, { ...defaultParams(META), ...p });

describe('membrana iridiscente', () => {
  it('las bandas del espectro suman blanco y el sombreador lleva las mismas constantes', () => {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let i = 0; i < MEM_N; i++) s += MEM_W[i * 3 + c];
      expect(s).toBeCloseTo(1, 5);
    }
    expect(MEMBRANA_GLSL).toContain(`const vec3 MEM_W[${MEM_N}]`);
  });

  it('dos haces con una reflexión invertida: negro sin espesor, máximo a media longitud de onda', () => {
    expect(band(0, 550)).toBeCloseTo(0, 6);
    expect(band(275, 550)).toBeGreaterThan(1.9);
    for (const c of rgb(0)) expect(c).toBeCloseTo(0, 6);
  });

  it('serie de Newton: blanco de primer orden, magenta donde se apaga el verde, pastel al engordar', () => {
    const white = rgb(260);
    expect(Math.min(...white)).toBeGreaterThan(0.55);
    const magenta = rgb(560);
    expect(magenta[1]).toBeLessThan(Math.min(magenta[0], magenta[2]));
    // very thick: the fringes of the bands dephase and the colour washes out towards an even grey
    const thick = rgb(9000);
    expect(Math.max(...thick) - Math.min(...thick)).toBeLessThan(Math.max(...magenta) - Math.min(...magenta));
  });

  it('la lámina drena: arriba película negra, abajo bandas', () => {
    const kk = k({ form: 'lamina', flow: 0, waves: 0 });
    impl.prep!(3, kk);
    let top = 0, bottom = 0;
    for (let i = 0; i < 40; i++) {
      const x = -0.85 + i * 0.044;
      top += impl.cpu(x, 0.47, 3, kk);
      bottom += impl.cpu(x, -0.3, 3, kk);
    }
    expect(top / 40).toBeLessThan(0.15);
    expect(bottom / 40).toBeGreaterThan(0.3);
  });

  it('la burbuja no dibuja fuera de su borde y su centro es más transparente que su anillo', () => {
    const kk = k({ form: 'burbuja', shine: 0 });
    impl.prep!(5, kk);
    expect(impl.cpu(0.8, 0.4, 5, kk)).toBe(0);
    let centre = 0, ring = 0;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      centre += impl.cpu(0.08 * Math.cos(a), 0.08 * Math.sin(a), 5, kk);
      ring += impl.cpu(0.37 * Math.cos(a), 0.37 * Math.sin(a), 5, kk);
    }
    expect(ring).toBeGreaterThan(centre * 1.5);
  });

  it('con «Color de: la paleta» el color sale de la paleta; con «la película», no', () => {
    const a = paletteOf(['#000000', '#ff0000', '#00ff00']), b = paletteOf(['#000000', '#0000ff', '#ffff00']);
    const out = new Float64Array(3);
    const colourAt = (p: Params, pal: ReturnType<typeof paletteOf>) => {
      const kk = k(p);
      impl.prep!(2, kk, pal);
      const acc = [0, 0, 0];
      for (let i = 0; i < 30; i++) { impl.cpuColor!(-0.6 + i * 0.04, -0.2, 2, kk, out); acc[0] += out[0]; acc[1] += out[1]; acc[2] += out[2]; }
      return acc;
    };
    const pa = colourAt({ tint: 'paleta', shine: 0 }, a), pb = colourAt({ tint: 'paleta', shine: 0 }, b);
    expect(pa[2]).toBeLessThan(1e-6);
    expect(pb[2]).toBeGreaterThan(1);
    const fa = colourAt({ tint: 'pelicula' }, a), fb = colourAt({ tint: 'pelicula' }, b);
    for (let c = 0; c < 3; c++) expect(fa[c]).toBeCloseTo(fb[c], 9);
  });
});
