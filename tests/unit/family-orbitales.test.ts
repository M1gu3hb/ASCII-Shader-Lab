import { describe, expect, it } from 'vitest';
import { STATES, harmonic, impl, radial } from '../../src/families/analytic/orbitales.cpu';
import { META } from '../../src/families/meta/orbitales';
import { defaultParams, packParams, timeContract } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Orbitales y superposiciones»: hydrogen radial functions, real harmonics, beats. */

const signChanges = (f: (x: number) => number, a: number, b: number, n = 4000) => {
  let c = 0, prev = f(a + (b - a) / (2 * n));
  for (let i = 1; i < n; i++) {
    const v = f(a + ((b - a) * (i + 0.5)) / n);
    if (Math.abs(v) > 1e-12 && Math.abs(prev) > 1e-12 && Math.sign(v) !== Math.sign(prev)) c++;
    if (Math.abs(v) > 1e-12) prev = v;
  }
  return c;
};

/** [l, |m|] of each harmonic number. */
const LM: Record<number, [number, number]> = { 0: [0, 0], 1: [1, 0], 2: [1, 1], 3: [2, 0], 4: [2, 2], 5: [2, 1], 6: [3, 0], 7: [3, 2], 8: [3, 3] };

// (ray marching on the CPU: generous time when the suite shares the machine)
describe('orbitales del hidrógeno', { timeout: 60_000 }, () => {
  it('R_nl está normalizada (∫ R² r² dr = 1) y tiene n − l − 1 nodos radiales', () => {
    for (let n = 1; n <= 4; n++) for (let l = 0; l < n; l++) {
      // Simpson on [0, 120] Bohr radii
      const N = 6000, hmax = 120 / N;
      let s = 0;
      for (let i = 0; i <= N; i++) {
        const r = i * hmax, f = radial(n, l, r) ** 2 * r * r;
        s += f * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2);
      }
      expect(s * hmax / 3, `R${n}${l}`).toBeCloseTo(1, 6);
      expect(signChanges(r => radial(n, l, r), 0, 80), `nodos de R${n}${l}`).toBe(n - l - 1);
    }
  });

  it('valores conocidos: R10 = 2e^−r, R21 = r e^−r/2 / (2√6), R20 se anula en r = 2', () => {
    for (const r of [0, 0.5, 1, 3]) {
      expect(radial(1, 0, r)).toBeCloseTo(2 * Math.exp(-r), 12);
      expect(radial(2, 1, r)).toBeCloseTo(r * Math.exp(-r / 2) / (2 * Math.sqrt(6)), 12);
    }
    expect(radial(2, 0, 2)).toBeCloseTo(0, 12);
    // R30 has its nodes at r = (9 ± 3√3)/2
    expect(radial(3, 0, (9 - 3 * Math.sqrt(3)) / 2)).toBeCloseTo(0, 12);
    expect(radial(3, 0, (9 + 3 * Math.sqrt(3)) / 2)).toBeCloseTo(0, 12);
  });

  it('armónicos reales ortonormales con l superficies nodales (l − |m| conos y |m| planos)', () => {
    const H = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const NT = 120, NP = 240;
    const Y = (h: number, th: number, ph: number) => harmonic(h, Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th));
    for (const a of H) for (const b of H) {
      let s = 0;
      for (let i = 0; i < NT; i++) {
        const th = ((i + 0.5) / NT) * Math.PI, w = Math.sin(th) * (Math.PI / NT) * ((2 * Math.PI) / NP);
        for (let j = 0; j < NP; j++) { const ph = ((j + 0.5) / NP) * 2 * Math.PI; s += Y(a, th, ph) * Y(b, th, ph) * w; }
      }
      expect(s, `<Y${a}|Y${b}>`).toBeCloseTo(a === b ? 1 : 0, 3);
    }
    for (const h of H) {
      const [l, m] = LM[h];
      const cones = signChanges(th => Y(h, th, 0.37), 0, Math.PI);
      const planes = signChanges(ph => Y(h, 1.1, ph), 0, 2 * Math.PI) / 2;
      expect(cones, `conos de Y${h}`).toBe(l - m);
      expect(Math.round(planes), `planos de Y${h}`).toBe(m);
    }
  });

  it('los estados de la lista son los que dicen sus nombres', () => {
    const spec = META.params.find(p => p.key === 'a');
    if (spec?.type !== 'choice') throw new Error('«Estado A» es una elección');
    const ids = spec.options.map(o => o.id);
    expect(ids.length).toBe(STATES.length);
    const L = 'spdf';
    ids.forEach((id, i) => {
      const [n, l, h] = STATES[i];
      expect(id.startsWith(`${n}${L[l]}`), id).toBe(true);
      expect(LM[h][0], id).toBe(l);
    });
  });

  it('la superposición 1s+2p oscila con ω = ΔE (E_n = −1/2n²) y dos estados de igual energía no laten', () => {
    const sample = (p: Params, t: number) => {
      const k = packParams(META, { ...defaultParams(META), ...p, turn: 0 });
      impl.prep!(t, k);
      const o: number[] = [];
      for (let y = -0.3; y <= 0.3; y += 0.02) for (let x = -0.2; x <= 0.2; x += 0.02) o.push(impl.cpu(x, y, t, k));
      return o;
    };
    const mad = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
    const dip = { a: '1s', b: '2pz', mix: 0.5, speed: 1, mode: 'densidad', level: 0.2 };
    // ΔE = 1/2 − 1/8 hartree, drawn at 4 rad per hartree·s: period 2π / 1.5 s
    const T = (2 * Math.PI) / ((0.5 - 0.125) * 4);
    expect(mad(sample(dip, 1), sample(dip, 1 + T))).toBeLessThan(1e-6);
    expect(mad(sample(dip, 1), sample(dip, 1 + T / 2))).toBeGreaterThan(0.01);
    const sp = { a: '2s', b: '2pz', mix: 0.5, speed: 1, mode: 'densidad', level: 0.2 };
    expect(mad(sample(sp, 1), sample(sp, 2.3))).toBeLessThan(1e-9);
  });

  /** The CPU twin over the 2:1 domain at time t (what the time probe and the compatibility fixture read). */
  const frame = (p: Params, t: number, w = 64, h = 32) => {
    const k = packParams(META, { ...defaultParams(META), ...p });
    impl.prep!(t, k);
    const o: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.push(impl.cpu(((x + 0.5) / w - 0.5) * 2, 0.5 - (y + 0.5) / h, t, k));
    return o;
  };
  const lit = (a: number[]) => a.filter(v => v > 24 / 255).length / a.length;
  const mad = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

  it('contrato: cámara quieta, bucle con su periodo exacto (el gemelo de CPU en t y t + periodo); girando, continuo', () => {
    for (const pr of META.presets) {
      const tc = timeContract(META, { ...defaultParams(META), ...pr.params });
      expect(tc, pr.id).toBe(pr.params.turn === 0 ? 'bucle' : 'continuo');
      expect(pr.period !== undefined, pr.id).toBe(tc === 'bucle');
      if (tc !== 'bucle') continue;
      for (const t of [0.7, 13.1]) {
        expect(mad(frame(pr.params, t), frame(pr.params, t + pr.period!)), `${pr.id} t=${t}`).toBeLessThan(1e-4);
        expect(mad(frame(pr.params, t), frame(pr.params, t + pr.period! / 2)), `${pr.id} medio periodo`).toBeGreaterThan(0.0015);
      }
    }
  });

  it('ningún preset se queda quieto ni vacío', () => {
    for (const pr of META.presets) {
      const step = pr.period ? pr.period / 4 : 3;
      for (const t of [1, 61, 600]) {
        const a = frame(pr.params, t), b = frame(pr.params, t + step);
        expect(mad(a, b), `${pr.id} t=${t}`).toBeGreaterThan(0.002);
        expect(lit(b), `${pr.id} t=${t}`).toBeGreaterThan(0.02);
        expect(lit(b), `${pr.id} t=${t}`).toBeLessThan(0.97);
      }
    }
  });

  it('«Capas»: láminas anidadas que brillan en su contorno, distintas de la superficie maciza', () => {
    const base = { a: '3dz2', b: '3dz2', mix: 0, speed: 0, level: 0.45, turn: 0, expo: 1 };
    const shells = frame({ ...base, mode: 'capas' }, 0, 96, 48), solid = frame({ ...base, mode: 'iso' }, 0, 96, 48);
    expect(mad(shells, solid)).toBeGreaterThan(0.03);
    // the brightest cells are the outlines: along the middle row, the peak is not in the figure's centre
    const row = shells.slice(24 * 96, 25 * 96);
    const peak = row.indexOf(Math.max(...row));
    expect(Math.abs(peak - 47.5)).toBeGreaterThan(4);
    expect(Math.max(...row)).toBeGreaterThan(Math.min(...row.filter(v => v > 0.02)) * 2);
  });
});
