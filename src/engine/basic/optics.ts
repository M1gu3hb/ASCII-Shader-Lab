/**
 * CPU port of ../glsl/optics.ts, line by line: the glass in front of the piece (recipe.optics). Writes into
 * OP: [dx, dy, light, fog].
 */
import { TAU, V2, hash12, hash22, smoothstep } from './core';

export interface OpticsU { a: [number, number, number, number]; b: [number, number, number, number] }

export const OP = new Float64Array(4);
let best = 0;

// GLSL rot2(p, a) = mat2(c, −s, s, c) · p (column-major): (c·x + s·y, −s·x + c·y)
const rx = (x: number, y: number, a: number) => Math.cos(a) * x + Math.sin(a) * y;
const ry = (x: number, y: number, a: number) => -Math.sin(a) * x + Math.cos(a) * y;

function drop(qx: number, qy: number, cx: number, cy: number, r: number) {
  const dx = (qx - cx) / r, dy = (qy - cy) / (r * 1.2);
  const k = dx * dx + dy * dy;
  if (k >= 1) return;
  const z = Math.sqrt(1 - k);
  if (z <= best) return;
  best = z;
  const rim = smoothstep(0.55, 1, Math.sqrt(k));
  OP[0] = -dx * r * (1.6 + 1.4 * z); OP[1] = -dy * r * (1.6 + 1.4 * z);
  const nx = dx + 1e-4, ny = dy + 1e-4, nl = Math.hypot(nx, ny);
  OP[2] = rim * ((nx / nl) * -0.55 + (ny / nl) * 0.84) + 0.25 * z;
  OP[3] = 0;
}

function rain(px: number, py: number, t: number, u: OpticsU) {
  const S = u.a[2], sp = u.a[3], ang = u.b[0];
  const qx = rx(px, py, ang), qy = ry(px, py, ang);
  OP[0] = 0; OP[1] = 0; OP[2] = 0; OP[3] = 1;
  best = 0;
  const cw = 0.17 * S, top = 0.66, span = 1.32;
  const col = Math.floor(qx / cw);
  for (let j = -1; j <= 1; j++) {
    const cj = col + j;
    const h1 = hash12(cj, 7.31), h2 = hash12(cj, 1.93), h3 = hash12(cj, 5.17), h4 = hash12(cj, 3.71);
    const per = 3 + 5 * h1;
    const ph0 = (t * sp) / per + h3, ph = ph0 - Math.floor(ph0);
    const g = ph + 0.03 * Math.sin(TAU * ph * 5);
    const r = (0.038 + 0.03 * h4) * S;
    const cx = (cj + 0.5 + (h2 - 0.5) * 0.5) * cw, cy = top - span * g;
    drop(qx, qy, cx, cy, r);
    const tsp = 0.055 * S;
    const k0 = Math.floor((top - qy) / tsp);
    for (let m = -1; m <= 1; m++) {
      const k = k0 + m;
      const yk = top - (k + 0.5) * tsp;
      const pk = (top - yk) / span;
      const age = ((ph - pk) * per) / Math.max(sp, 0.05);
      const hk = hash12(cj * 3.1, k);
      if (age > 0 && age < 2.4 && hk < 0.8) {
        const rk = r * (0.32 + 0.22 * hk) * (1 - 0.7 * age / 2.4);
        drop(qx, qy, cx + (hk - 0.5) * r * 0.8, yk, Math.max(rk, 1e-4));
      }
    }
  }
  const gs = 0.075 * S;
  const ix = Math.floor(qx / gs), iy = Math.floor(qy / gs);
  const hp = hash12(ix + 11.7, iy + 11.7);
  if (hp < u.b[1]) {
    hash22(ix + 3.3, iy + 3.3);
    const jx = (ix + 0.25 + 0.5 * V2[0]) * gs, jy = (iy + 0.25 + 0.5 * V2[1]) * gs;
    const life = (4 + 6 * hash12(ix + 9.1, iy + 9.1)) / Math.max(sp, 0.05);
    const p0 = t / life + hash12(ix + 2.2, iy + 2.2), ph = p0 - Math.floor(p0);
    const rs = gs * (0.16 + 0.2 * hash12(ix + 4.4, iy + 4.4)) * smoothstep(0, 0.12, ph) * (1 - smoothstep(0.7, 1, ph));
    if (rs > 1e-4) drop(qx, qy, jx, jy, rs);
  }
  const ox = rx(OP[0], OP[1], -ang), oy = ry(OP[0], OP[1], -ang);
  OP[0] = ox * u.a[1]; OP[1] = oy * u.a[1];
  OP[3] *= u.b[3];
}

function fluted(px: number, py: number, t: number, u: OpticsU) {
  const w = 0.06 * u.a[2], ang = u.b[0];
  const qx = rx(px, py, ang), qy = ry(px, py, ang);
  const uu = qx / w + t * u.a[3] * 0.25;
  const x = uu - Math.floor(uu);
  const pr = Math.floor(u.b[1] + 0.5);
  let off: number;
  if (pr < 0.5) off = 0.9 * (0.5 - x);
  else if (pr < 1.5) off = -(x - 0.5) * (1 - 4 * (x - 0.5) * (x - 0.5)) * 1.6;
  else if (pr < 2.5) off = Math.sign(x - 0.5) * Math.pow(Math.abs(2 * x - 1), 6) * 0.5;
  else if (pr < 3.5) off = 0.35 * Math.sin(TAU * x);
  else off = 0.45 * Math.sin(TAU * (x + qy * 1.5 + t * u.a[3] * 0.2));
  const d = off * w * 2 * u.a[1];
  OP[0] = rx(d, 0, -ang); OP[1] = ry(d, 0, -ang);
  OP[2] = smoothstep(0.9, 1, x) - 0.6 * smoothstep(0.12, 0, x) - 0.25 * x * x * x;
  OP[3] = 0;
}

/** optics(p, t) of the shader: writes OP. */
export function opticsAt(px: number, py: number, t: number, u: OpticsU) {
  if (u.a[0] < 1.5) rain(px, py, t, u); else fluted(px, py, t, u);
}

/** Loop crossfade, as the shader: the glass at tl and one loop earlier, mixed by w. */
export function opticsLoop(px: number, py: number, tl: number, loop: number, u: OpticsU) {
  opticsAt(px, py, tl, u);
  const a0 = OP[0], a1 = OP[1], a2 = OP[2], a3 = OP[3];
  opticsAt(px, py, tl - loop, u);
  const w = tl / loop;
  OP[0] = a0 + (OP[0] - a0) * w; OP[1] = a1 + (OP[1] - a1) * w; OP[2] = a2 + (OP[2] - a2) * w; OP[3] = a3 + (OP[3] - a3) * w;
}
