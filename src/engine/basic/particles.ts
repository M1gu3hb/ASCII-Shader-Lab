import { TAU, clamp, hash12, sat, smoothstep } from './core';
import type { BasicPattern } from './patterns';

const fract = (n: number) => n - Math.floor(n);
const len = Math.hypot;
const seg = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const vx = bx - ax, vy = by - ay, u = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
  return len(x - ax - u * vx, y - ay - u * vy);
};

/** Matches glsl/particles.ts. Prepares 28 trajectories per frame instead of per cell. */
export function particlePattern(mode: number): BasicPattern {
  const x = new Float64Array(28), y = new Float64Array(28), hashes = new Float64Array(28);
  let prepared = false;
  const prep = (t: number, a: number) => {
      prepared = true;
      for (let i = 0; i < 28; i++) {
        const h = hash12(i, 19), ph = i * 2.399963 + h * 0.8, sp = 0.22 + h * 0.45;
        const period = fract(h + t * (0.035 + sp * 0.07));
        hashes[i] = h;
        let cx = 0, cy = 0;
        switch (mode) {
          case 0: {
            const morph = 0.5 + 0.5 * Math.sin(t * 0.42);
            cx = (hash12(i, 51) - 0.5) * 1.25 * (1 - morph) + Math.cos(ph) * (0.23 + a * 0.21) * morph;
            cy = (hash12(i, 91) - 0.5) * 1.25 * (1 - morph) + Math.sin(ph) * (0.23 + a * 0.21) * morph;
            break;
          }
          case 1: cx = -0.75 + period * 1.5; cy = 0.26 * Math.sin(i * 1.7) + 0.14 * Math.sin(t * 0.3 + i); break;
          case 2: cx = (h - 0.5) * 1.45; cy = -0.68 + period * 1.4; break;
          case 3: {
            const ring = i % 2, u = ph + t * (ring ? -0.27 : 0.36);
            cx = Math.cos(u) * (0.25 + ring * 0.23);
            cy = Math.sin(u) * (0.16 + ring * 0.16);
            break;
          }
          case 4: {
            const u = ph + t * 0.13, pulse = (0.86 + 0.12 * Math.sin(t * 0.95)) * 0.022;
            cx = 16 * Math.sin(u) ** 3 * pulse;
            cy = (13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u)) * pulse;
            break;
          }
          case 5:
            cx = -0.7 + period * 1.4;
            cy = 0.24 * Math.sin(ph * 0.8 + t * 0.33) + 0.14 * Math.sin(i * 1.4) + 0.09 * Math.sin(cx * 8 + t * 0.65);
            break;
          case 6: {
            const r = 0.07 + period * 0.62, u = ph + t * 0.3 + period * TAU * 2;
            cx = r * Math.cos(u); cy = r * Math.sin(u); break;
          }
          case 7: {
            const r = (i % 4) * 0.13 + 0.08 + 0.035 * Math.sin(t * 0.5 + ph);
            cx = r * Math.cos(ph + t * 0.11); cy = r * Math.sin(ph + t * 0.11); break;
          }
          case 8: {
            const u = ph + t * 0.16, r = 0.27 + 0.11 * Math.cos(4 * u);
            cx = Math.sin(u) * r * 1.6; cy = Math.cos(u * 2) * r * 0.8; break;
          }
          case 9: cx = (h - 0.5) * 1.4 + 0.08 * Math.sin(t * 0.5 + ph); cy = 0.65 - period * 1.3; break;
          case 10: {
            const u = ph + t * 0.17, r = 0.17 + 0.25 * Math.abs(Math.sin(3 * u)) ** 2;
            cx = r * Math.cos(u); cy = r * Math.sin(u); break;
          }
          default:
            cx = (hash12(i, 31) - 0.5) * 1.25 + 0.05 * Math.sin(t * 0.4 + ph);
            cy = (hash12(i, 71) - 0.5) * 0.9 + 0.05 * Math.cos(t * 0.35 + ph);
        }
        x[i] = cx; y[i] = cy;
      }
    };
  return {
    prep,
    f(px, py, t, a, b) {
      if (!prepared) prep(t, a);
      let v = 0;
      for (let i = 0; i < 28; i++) {
        const dx = px - x[i], dy = py - y[i], d = len(dx, dy), rad = 0.019 + b * 0.027, h = hashes[i];
        const dot = Math.exp(-d * d / (rad * rad)) * (0.55 + 0.45 * h);
        v = Math.max(v, dot + 0.2 * Math.exp(-d * d / (rad * rad * 16)));
        if (mode === 1 || mode === 2 || mode === 6) {
          const qx = mode === 2 ? 0 : mode === 1 ? -0.13 : (x[i] + 0.001) / (len(x[i] + 0.001, y[i] + 0.001) || 1) * (-0.09 - a * 0.11);
          const qy = mode === 2 ? -0.1 : mode === 1 ? 0 : (y[i] + 0.001) / (len(x[i] + 0.001, y[i] + 0.001) || 1) * (-0.09 - a * 0.11);
          const along = clamp((dx * qx + dy * qy) / (qx * qx + qy * qy), 0, 1);
          const trail = len(dx - qx * along, dy - qy * along);
          v = Math.max(v, (1 - smoothstep(0.005, 0.018 + b * 0.012, trail)) * (1 - along) * 0.45);
        }
        if (mode === 11 && i > 0 && len(x[i] - x[i - 1], y[i] - y[i - 1]) < 0.27) {
          v = Math.max(v, (1 - smoothstep(0.002, 0.012, seg(px, py, x[i - 1], y[i - 1], x[i], y[i]))) * 0.35);
        }
      }
      return sat(v);
    },
  };
}
