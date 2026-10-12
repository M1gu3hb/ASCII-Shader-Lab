import { describe, expect, it } from 'vitest';
import { buildField, create, field, sourcesAt, sourcesOf } from '../../src/families/sims/campos';
import { META } from '../../src/families/meta/campos_em';
import { defaultParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Líneas de campo»: where the lines start and end, and that they follow the field. */

const P = (p: Params): Params => ({ ...defaultParams(META), ...p });
const at = (l: { p: Float32Array }, i: number) => [l.p[i * 3], l.p[i * 3 + 1], l.p[i * 3 + 2]];
const dist = (a: number[], b: { x: number; y: number; z: number }) => Math.hypot(a[0] - b.x, a[1] - b.y, a[2] - b.z);
/** The field at a point, copied out of the model's shared buffer. */
const fieldAt = (src: ReturnType<typeof sourcesOf>, x: number[]) => Array.from(field(src, x[0], x[1], x[2]));

describe('líneas de campo', () => {
  it('las líneas de E salen de las cargas + y acaban en las − (o se van lejos)', () => {
    for (const ratio of [0.5, 1, 2]) {
      const g = buildField('prueba', P({ config: 'dipolo', ratio, lines: 16 }));
      const [pos, neg] = g.sources;
      expect(pos.s).toBeGreaterThan(0); expect(neg.s).toBeLessThan(0);
      let fromPos = 0, toNeg = 0;
      for (const l of g.lines) {
        const a = at(l, 0), b = at(l, l.n - 1);
        const startsAtPos = dist(a, pos) < 0.07, endsAtNeg = dist(b, neg) < 0.07, far = Math.hypot(...b) > 2.2, fromFar = Math.hypot(...a) > 2.2;
        // every line starts at the + charge or comes from far away, and ends at the − charge or leaves
        expect(startsAtPos || fromFar, `ratio ${ratio}: inicio`).toBe(true);
        expect(endsAtNeg || far, `ratio ${ratio}: final`).toBe(true);
        if (startsAtPos) fromPos++;
        if (startsAtPos && endsAtNeg) toNeg++;
        // lines from far away only end at the − charge (more flux into it than out of the + charge)
        if (fromFar) { expect(endsAtNeg).toBe(true); expect(ratio).toBeGreaterThan(1 - 1e-9); }
      }
      // one line per unit of charge and per «línea»: 16 from the + charge
      expect(fromPos).toBe(16);
      // with the − charge as strong or stronger, most lines from + land on it
      if (ratio >= 1) expect(toNeg / fromPos).toBeGreaterThan(0.7);
      else expect(toNeg).toBeLessThan(fromPos);
    }
  });

  it('cada tramo de línea sigue la dirección del campo', () => {
    for (const config of ['dipolo', 'cuadrupolo', 'espira', 'iman']) {
      const g = buildField('prueba', P({ config, lines: 6 }));
      let checked = 0;
      for (const l of g.lines) for (let i = 2; i < l.n - 2; i += 7) {
        const a = at(l, i), b = at(l, i + 1), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], dl = Math.hypot(dx, dy, dz);
        if (dl < 1e-6) continue;
        const F = fieldAt(g.sources, mid);
        const fl = Math.hypot(F[0], F[1], F[2]);
        if (fl < 1e-6) continue;
        const cos = (dx * F[0] + dy * F[1] + dz * F[2]) / (dl * fl);
        expect(Math.abs(cos), config).toBeGreaterThan(0.995);
        checked++;
      }
      expect(checked, config).toBeGreaterThan(20);
    }
  });

  it('Biot–Savart: en el centro de una espira B = I / 2R, a lo largo del eje', () => {
    const src = sourcesOf('espira', 1, 0);
    const f = fieldAt(src, [src[0].x, src[0].y, src[0].z]);
    expect(f[0]).toBeCloseTo(0, 9); expect(f[2]).toBeCloseTo(0, 9);
    expect(Math.abs(f[1] / (1 / (2 * 0.45)) - 1)).toBeLessThan(0.005);
    // on the axis: B = I R² / 2 (R² + y²)^{3/2}
    const y = 0.3, R = 0.45, g = fieldAt(src, [0, src[0].y + y, 0]);
    expect(Math.abs(g[1] / ((R * R) / (2 * (R * R + y * y) ** 1.5)) - 1)).toBeLessThan(0.005);
  });

  it('las líneas magnéticas se cierran: salen del norte del imán y vuelven a él', () => {
    const g = buildField('prueba', P({ config: 'iman', ratio: 0, lines: 12 }));
    const m = g.sources[0];
    expect(g.lines.length).toBe(12);
    for (const l of g.lines) {
      const a = at(l, 0), b = at(l, l.n - 1);
      expect(dist(a, m)).toBeLessThan(0.09);
      expect(a[1]).toBeGreaterThan(m.y);
      expect(l.end).toBe(0);
      expect(dist(b, m)).toBeLessThan(0.09);
      expect(b[1]).toBeLessThan(m.y);
    }
  });

  it('con movimiento, las fuentes se mueven, las líneas se retrazan y el estado se restaura exacto', () => {
    const raster = (m: ReturnType<typeof create>, t: number) => { const o = new Uint8Array(m.w * m.h); m.render(o, t); return o; };
    const mad = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
    for (const id of ['dipolo_vivo', 'espiras_vivas', 'imanes']) {
      const p = P(META.presets.find(q => q.id === id)!.params);
      const m = create({ seed: 'mueve', res: 48, params: p });
      m.step(30 * 5);
      for (let k = 0; k < 3; k++) {
        // the camera held still: what changes is the field itself
        const a = raster(m, 0);
        m.step(30 * 3);
        expect(mad(a, raster(m, 0)), `${id} ventana ${k}`).toBeGreaterThan(0.3);
      }
      const snap = m.snapshot();
      m.step(23);
      const r = create({ seed: 'mueve', res: 48, params: p });
      r.restore(snap);
      r.step(23);
      expect(mad(raster(m, 4), raster(r, 4)), id).toBe(0);
    }
    // the paths: the charges keep apart as they orbit; the second loop's current reverses on its cycle
    const src = sourcesAt('dipolo', 0.9, 1, 0.6, 7.3);
    expect(Math.hypot(src[0].x - src[1].x, src[0].z - src[1].z)).toBeGreaterThan(0.5);
    expect(sourcesAt('espira', 0.5, 1, 0.5, 0)[1].s).toBeCloseTo(1, 9);
    expect(sourcesAt('espira', 0.5, 1, 0.5, 14)[1].s).toBeCloseTo(Math.cos(Math.PI), 9);
  });

  it('sin movimiento, las líneas sólo crecen al principio y después el campo no cambia', () => {
    const raster = (m: ReturnType<typeof create>) => { const o = new Uint8Array(m.w * m.h); m.render(o, 3); return o; };
    const m = create({ seed: 'quieto', res: 48, params: P({}) });
    m.step(30 * 10);
    const a = raster(m);
    m.step(30 * 10);
    expect(raster(m)).toEqual(a);
  });

  it('la semilla gira los puntos de partida; la misma semilla da las mismas líneas', () => {
    const a = buildField('una', P({})), b = buildField('una', P({})), c = buildField('otra', P({}));
    expect(a.lines.map(l => Array.from(l.p))).toEqual(b.lines.map(l => Array.from(l.p)));
    expect(a.lines.map(l => l.p[3])).not.toEqual(c.lines.map(l => l.p[3]));
  });
});
