import { describe, expect, it } from 'vitest';
import { impl } from '../../src/families/analytic/grietas_oro.cpu';
import { META } from '../../src/families/meta/grietas_oro';
import { defaultParams, packParams, timeContract } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/**
 * Mechanism checks of «Grietas de oro» (I-06): cracks that appear and grow outwards from an origin as a front
 * advances, fill with molten metal (hot behind the front, cooling), bleed into the stone, and close at the end of
 * the cycle (an exact loop), or open a new network each cycle (continuous).
 */

const W = 96, H = 48, PX = 1 / 48;
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const at = (x: number, y: number) => [((x + 0.5) / W - 0.5) * 2, 0.5 - (y + 0.5) / H];
function frame(p: Params, t: number) {
  const k = packParams(META, p);
  impl.prep!(t, k, undefined, PX);
  const l = new Float64Array(W * H), c = new Float64Array(W * H * 3), o = new Float64Array(3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [px, py] = at(x, y);
    l[y * W + x] = impl.cpu(px, py, t, k);
    impl.cpuColor!(px, py, t, k, o);
    c.set(o, (y * W + x) * 3);
  }
  return { l, c };
}
/** The open seams: cells bright as molten metal (stone and its glow stay well below). */
const seams = (l: Float64Array) => { const s: number[] = []; for (let i = 0; i < l.length; i++) if (l[i] > 0.62) s.push(i); return s; };
const mad = (a: Float64Array, b: Float64Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

describe('grietas de oro', () => {
  it('las grietas aparecen desde el origen y crecen hacia fuera a medida que avanza el frente', () => {
    const p = params('kintsugi', { dust: 0 }), P = p.period as number;
    let lastCount = -1, lastReach = -1;
    for (const ph of [0.12, 0.2, 0.35, 0.55]) {
      const s = seams(frame(p, ph * P).l);
      let reach = 0;
      for (const i of s) { const [px, py] = at(i % W, Math.floor(i / W)); reach = Math.max(reach, Math.hypot(px, py)); }
      expect(s.length, `fase ${ph}`).toBeGreaterThan(lastCount);
      expect(reach, `fase ${ph}`).toBeGreaterThan(lastReach);
      lastCount = s.length; lastReach = reach;
    }
    // early on, only near the origin (the centre)
    const first = seams(frame(p, 0.12 * P).l);
    expect(first.length).toBeGreaterThan(0);
    for (const i of first) { const [px, py] = at(i % W, Math.floor(i / W)); expect(Math.hypot(px, py)).toBeLessThan(0.5); }
  });

  it('desde la izquierda, el frente avanza de izquierda a derecha', () => {
    const p = params('porcelana', { dust: 0 }), P = p.period as number;
    const s = seams(frame(p, 0.2 * P).l);
    const xs = s.map(i => at(i % W, 0)[0]);
    expect(xs.length).toBeGreaterThan(5);
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeLessThan(-0.4);
  });

  it('el metal recién abierto está más caliente (más blanco) que el que lleva rato abierto', () => {
    const p = params('kintsugi', { dust: 0 }), P = p.period as number;
    const { l, c } = frame(p, 0.4 * P);
    // blue relative to red: white-hot metal has much more of it than cooled gold
    let nearB = 0, nearN = 0, farB = 0, farN = 0;
    for (const i of seams(l)) {
      const [px, py] = at(i % W, Math.floor(i / W)), d = Math.hypot(px, py), w = c[i * 3 + 2] / Math.max(c[i * 3], 1e-3);
      if (d < 0.25) { nearB += w; nearN++; } else if (d > 0.45) { farB += w; farN++; }
    }
    expect(nearN).toBeGreaterThan(3); expect(farN).toBeGreaterThan(3);
    // the front (far from the origin) has just opened: whiter than the seams that opened first
    expect(farB / farN).toBeGreaterThan(1.3 * (nearB / nearN));
  });

  it('el oro sangra en la piedra: junto a las grietas la piedra brilla más con más «Sangrado»', () => {
    const P = 14;
    const a = frame(params('kintsugi', { dust: 0, bleed: 0 }), 0.5 * P).l, b = frame(params('kintsugi', { dust: 0, bleed: 1 }), 0.5 * P).l;
    let more = 0;
    for (let i = 0; i < a.length; i++) if (a[i] < 0.5 && b[i] > a[i] + 0.05) more++;
    expect(more / a.length).toBeGreaterThan(0.05);
  });

  it('al final del ciclo se cierran (sólo queda el golpe que se prepara en el origen) y el bucle es exacto', () => {
    const p = params('kintsugi'), P = p.period as number;
    expect(timeContract(META, p)).toBe('bucle');
    // at the seam only the blow gathering at the origin shines: every crack is closed
    const away = (l: Float64Array) => seams(l).filter(i => { const [px, py] = at(i % W, Math.floor(i / W)); return Math.hypot(px, py) > 0.12; }).length;
    expect(away(frame(p, 0.995 * P).l)).toBe(0);
    expect(away(frame(p, 0.002 * P).l)).toBe(0);
    for (const t of [3.1, 9.4]) {
      expect(mad(frame(p, t).l, frame(p, t + P).l), `t=${t}`).toBeLessThan(1e-6);
      expect(mad(frame(p, t).c, frame(p, t + P).c), `t=${t}`).toBeLessThan(1e-6);
    }
  });

  it('con «Trazado nuevo» cada ciclo abre otra red (continuo), igual de abierta a la misma fase', () => {
    const p = params('kintsugi', { renew: true, dust: 0 }), P = p.period as number;
    expect(timeContract(META, p)).toBe('continuo');
    const a = frame(p, 0.6 * P).l, b = frame(p, 1.6 * P).l;
    expect(mad(a, b)).toBeGreaterThan(0.02);
    const na = seams(a).length, nb = seams(b).length;
    expect(Math.min(na, nb) / Math.max(na, nb)).toBeGreaterThan(0.4);
  });
});
