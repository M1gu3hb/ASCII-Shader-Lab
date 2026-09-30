/**
 * CPU twin of ../glsl/particles.ts, step by step: the positions (and trails) depend only on t and a, so prep
 * computes them once per frame and the cell loop only measures distances. Every export is pure (see
 * scripts/runtime-plugin.ts); `setParticlePX` is called by setPX in patterns.ts.
 */
import { TAU, clamp, hash12, mod, sat, smoothstep } from './core';
import type { BasicPattern } from './patterns';

let PX = 0.02;
export function setParticlePX(v: number) { PX = Math.fround(v); }

/** Points of each motion (index = mode), as in the GLSL chunks. */
const COUNT = [56, 12, 40, 48, 48, 56, 56, 48, 90, 56, 60, 26];
const MAX = 90;

function norm(x: number, y: number): [number, number] {
  const l = Math.sqrt(x * x + y * y) || 1;
  return [x / l, y / l];
}

/** Positions (X, Y), trails (TX, TY), sizes (D) and brightness hash (H) of every point at time t. */
function place(mode: number, t: number, a: number, X: Float64Array, Y: Float64Array, TX: Float64Array, TY: Float64Array, D: Float64Array, H: Float64Array) {
  const N = COUNT[mode];
  for (let i = 0; i < N; i++) {
    const k = i, h = hash12(k, 19), h2 = hash12(k, 37), h3 = hash12(k, 53);
    const pp = h + t * (0.04 + h3 * 0.06), per = pp - Math.floor(pp);
    let cx = 0, cy = 0, tx = 0, ty = 0, depth = 1;
    switch (mode) {
      case 0: {
        const m = 0.5 + 0.5 * Math.sin(t * 0.42), s = clamp((m - 0.15) / 0.7, 0, 1), morph = s * s * (3 - 2 * s);
        const lx = (h2 - 0.5) * 1.35 + 0.04 * Math.sin(t * 0.7 + k), ly = (h3 - 0.5) * 0.85 + 0.04 * Math.cos(t * 0.6 + k * 1.3);
        const an = k / N * TAU + t * 0.25, r = 0.16 + a * 0.2;
        cx = lx * (1 - morph) + Math.cos(an) * r * morph; cy = ly * (1 - morph) + Math.sin(an) * r * morph;
        break;
      }
      case 1: {
        const [dx, dy] = norm(1, -0.3 - h2 * 0.35);
        cx = -0.95 + dx * per * 2.1; cy = 0.55 - h3 * 0.75 + dy * per * 2.1;
        tx = -dx * (0.1 + a * 0.35); ty = -dy * (0.1 + a * 0.35);
        depth = 1.5;
        break;
      }
      case 2: cx = (h2 - 0.5) * 1.6; cy = -0.62 + per * 1.24; tx = 0; ty = -0.03 - a * 0.13; break;
      case 3: {
        const ring = mod(k, 2), an = Math.floor(k * 0.5) / (N * 0.5) * TAU + t * (ring < 0.5 ? 0.36 : -0.27);
        const ex = Math.cos(an) * (ring < 0.5 ? 0.27 : 0.34 + a * 0.22), ey = Math.sin(an) * (ring < 0.5 ? 0.15 : 0.2 + a * 0.12);
        const ro = ring < 0.5 ? -0.35 : 0.4, cr = Math.cos(ro), sr = Math.sin(ro);
        cx = cr * ex - sr * ey; cy = sr * ex + cr * ey;
        break;
      }
      case 4: {
        const u = k / N * TAU + t * 0.13, su = Math.sin(u);
        let beat = 0.5 + 0.5 * Math.sin(t * 2.2);
        beat = beat * beat * beat; beat *= beat;
        const s = (0.9 + (0.03 + a * 0.2) * beat) * 0.021;
        cx = 16 * su * su * su * s;
        cy = (13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u) + 2) * s;
        break;
      }
      case 5: {
        const Cx = 0.42 * Math.sin(t * 0.21), Cy = 0.15 * Math.sin(t * 0.37 + 1);
        const [vx, vy] = norm(0.0882 * Math.cos(t * 0.21) + 1e-4, 0.0555 * Math.cos(t * 0.37 + 1));
        const lg = (h2 - 0.5) * 0.52, ac = (h3 - 0.5) * 0.22 + (0.01 + a * 0.05) * Math.sin(t * 3 + h * 20 + lg * 18);
        cx = Cx + vx * lg - vy * ac; cy = Cy + vy * lg + vx * ac;
        tx = -vx * 0.035; ty = -vy * 0.035;
        break;
      }
      case 6: {
        const r = 0.05 + per * 0.55, th = h * TAU + t * 0.3 + per * TAU * 1.5;
        cx = r * Math.cos(th); cy = r * Math.sin(th);
        const [nx, ny] = norm(-cy + cx * 0.3 + 1e-4, cx + cy * 0.3), l = 0.03 + a * 0.12;
        tx = -nx * l; ty = -ny * l;
        break;
      }
      case 7: {
        const ring = mod(k, 4), an = Math.floor(k * 0.25) / (N * 0.25) * TAU + t * (0.11 + ring * 0.03) * (mod(ring, 2) < 0.5 ? 1 : -1);
        const r = 0.08 + ring * (0.06 + a * 0.08) + 0.012 * Math.sin(t * 0.8 + ring);
        cx = Math.cos(an) * r; cy = Math.sin(an) * r;
        break;
      }
      case 8: {
        const u = k / N * TAU + t * 0.2, rho = Math.exp(Math.cos(u)) - 2 * Math.cos(4 * u);
        cx = Math.sin(u) * rho * (1 - (0.05 + a * 0.5) * (0.5 + 0.5 * Math.sin(t * 2))) * 0.17;
        cy = (Math.cos(u) * rho - 0.66) * 0.17;
        break;
      }
      case 9:
        cx = (h2 - 0.5) * 1.7 + (0.02 + a * 0.14) * Math.sin(t * (0.5 + h3) + h * TAU); cy = 0.6 - per * 1.2;
        depth = 0.6 + 0.6 * h3;
        break;
      case 10: {
        const u = k / N * TAU + t * 0.17, s3 = Math.sin(Math.floor(1.5 + a * 3) * u), rr = 0.12 + 0.28 * s3 * s3;
        cx = rr * Math.cos(u); cy = rr * Math.sin(u);
        break;
      }
      default:
        cx = (h2 - 0.5) * 1.4 + 0.05 * Math.sin(t * 0.4 + h * TAU);
        cy = (h3 - 0.5) * 0.88 + 0.05 * Math.cos(t * 0.35 + h2 * TAU);
    }
    X[i] = cx; Y[i] = cy; TX[i] = tx; TY[i] = ty; D[i] = depth; H[i] = h;
  }
}

/** Distance from (x, y) to the segment a–b. */
function seg(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const u = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  const ex = pax - bax * u, ey = pay - bay * u;
  return Math.sqrt(ex * ex + ey * ey);
}

export function particlePattern(mode: number): BasicPattern {
  const N = COUNT[mode];
  const X = new Float64Array(MAX), Y = new Float64Array(MAX), TX = new Float64Array(MAX), TY = new Float64Array(MAX);
  const D = new Float64Array(MAX), H = new Float64Array(MAX);
  const trails = mode === 1 || mode === 2 || mode === 5 || mode === 6;
  return {
    prep(t, a) { place(mode, t, a, X, Y, TX, TY, D, H); },
    f(x, y, _t, a, b) {
      let v = 0;
      const rad0 = Math.max(0.012 + b * 0.024, PX * 0.9);
      const lim = 0.12 + a * 0.3;
      for (let i = 0; i < N; i++) {
        const rad = rad0 * D[i], r2 = rad * rad;
        const qx = x - X[i], qy = y - Y[i], d2 = qx * qx + qy * qy;
        // beyond 8 radii the glow is under 0.0002 (the GPU still adds it: no visible difference)
        if (d2 < r2 * 64) v = Math.max(v, Math.exp(-d2 / r2) * (0.6 + 0.4 * H[i]) + 0.18 * Math.exp(-d2 / (r2 * 9)));
        if (trails) {
          const tx = TX[i], ty = TY[i];
          const along = clamp((qx * tx + qy * ty) / (tx * tx + ty * ty), 0, 1), w = Math.max(rad * 0.5, PX * 0.7);
          const ex = qx - tx * along, ey = qy - ty * along;
          v = Math.max(v, (1 - smoothstep(w, w + PX, Math.sqrt(ex * ex + ey * ey))) * (1 - along) * 0.85);
        }
        if (mode === 11) {
          const w = PX * 0.6;
          if (i > 0) {
            const lx = X[i - 1] - X[i], ly = Y[i - 1] - Y[i];
            if (Math.sqrt(lx * lx + ly * ly) < lim) v = Math.max(v, (1 - smoothstep(w, w + PX, seg(x, y, X[i - 1], Y[i - 1], X[i], Y[i]))) * 0.4);
          }
          if (i > 1) {
            const lx = X[i - 2] - X[i], ly = Y[i - 2] - Y[i];
            if (Math.sqrt(lx * lx + ly * ly) < lim) v = Math.max(v, (1 - smoothstep(w, w + PX, seg(x, y, X[i - 2], Y[i - 2], X[i], Y[i]))) * 0.3);
          }
        }
      }
      return sat(v);
    },
  };
}

export const enjambre_vivo: BasicPattern = /* @__PURE__ */ particlePattern(0);
export const estela_cometas: BasicPattern = /* @__PURE__ */ particlePattern(1);
export const lluvia_ascendente: BasicPattern = /* @__PURE__ */ particlePattern(2);
export const orbitas_gemelas: BasicPattern = /* @__PURE__ */ particlePattern(3);
export const corazon_particulas: BasicPattern = /* @__PURE__ */ particlePattern(4);
export const cardumen_luz: BasicPattern = /* @__PURE__ */ particlePattern(5);
export const vortice_polvo: BasicPattern = /* @__PURE__ */ particlePattern(6);
export const ondas_estelares: BasicPattern = /* @__PURE__ */ particlePattern(7);
export const mariposa_puntos: BasicPattern = /* @__PURE__ */ particlePattern(8);
export const nieve_orbital: BasicPattern = /* @__PURE__ */ particlePattern(9);
export const floracion_luz: BasicPattern = /* @__PURE__ */ particlePattern(10);
export const constelacion_dinamica: BasicPattern = /* @__PURE__ */ particlePattern(11);
