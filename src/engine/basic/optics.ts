/**
 * CPU port of ../glsl/optics.ts, line by line: the glass in front of the piece (recipe.optics). Writes into
 * OP: [dx, dy, light, fog]; a glass solid also into OPD (where the red and blue rays land, relative to the
 * green one) and OPX (inside, path inside, lit body, Fresnel's share), as the shader's globals.
 */
import { TAU, V2, hash12, hash22, smoothstep } from './core';
import type { OpticsU } from '../opticsU';

export type { OpticsU };

export const OP = new Float64Array(4);
export const OPD = new Float64Array(4);
export const OPX = new Float64Array(4);
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

/* ---------------------------------------------------------------- */
/* Glass solids (GLSL_OPTICS_SOLID)                                   */
/* ---------------------------------------------------------------- */

const LX = -0.48 / Math.hypot(0.48, 0.62, 0.62), LY = 0.62 / Math.hypot(0.48, 0.62, 0.62), LZ = LY;
/** Scratch vectors: a ray (R3), a normal (N3), what one trace returns (G3). */
const R3 = new Float64Array(3), N3 = new Float64Array(3), G3 = new Float64Array(3);

function opEnv(x: number, y: number, z: number) {
  const dl = x * LX + y * LY + z * LZ;
  return 0.3 + 0.45 * Math.max(y, 0) + 12 * Math.pow(Math.max(dl, 0), 40);
}
function sphereN(x: number, y: number, z: number, zs: number, out: Float64Array) {
  const nz = z / (zs * zs), l = Math.hypot(x, y, nz);
  out[0] = x / l; out[1] = y / l; out[2] = nz / l;
}
/** GLSL refract(I, N, eta) into `out`; false (and zero) when the ray cannot get through. */
function refract(ix: number, iy: number, iz: number, nx: number, ny: number, nz: number, eta: number, out: Float64Array): boolean {
  const d = nx * ix + ny * iy + nz * iz;
  const k = 1 - eta * eta * (1 - d * d);
  if (k < 0) { out[0] = out[1] = out[2] = 0; return false; }
  const m = eta * d + Math.sqrt(k);
  out[0] = eta * ix - m * nx; out[1] = eta * iy - m * ny; out[2] = eta * iz - m * nz;
  return true;
}

/** opTrace: one ray at index eta entering at P with normal n1 → G3 = (landing x, y, path inside). */
function trace(px: number, py: number, pz: number, n1x: number, n1y: number, n1z: number, eta: number, u: OpticsU) {
  const s = u.s!, zs = s.d[1], poly = s.c[3] > 0.5, np = s.d[3], pl = s.n;
  refract(0, 0, -1, n1x, n1y, n1z, 1 / eta, R3);
  let rx = R3[0], ry = R3[1], rz = R3[2], path = 0;
  for (let k = 0; k < 3; k++) {
    let te: number, n2x: number, n2y: number, n2z: number;
    if (poly) {
      te = 1e4; n2x = 0; n2y = 0; n2z = -1;
      for (let i = 0; i < 20; i++) {
        if (i >= np) break;
        const o = i * 4, ax = pl[o], ay = pl[o + 1], az = pl[o + 2];
        const den = ax * rx + ay * ry + az * rz;
        if (den > 1e-5) {
          const tt = (pl[o + 3] - (ax * px + ay * py + az * pz)) / den;
          if (tt < te) { te = tt; n2x = ax; n2y = ay; n2z = az; }
        }
      }
      te = Math.max(te, 0);
    } else {
      const s2 = zs * zs;
      const A = rx * rx + ry * ry + (rz * rz) / s2, B = 2 * (px * rx + py * ry + (pz * rz) / s2);
      te = Math.max(-B / A, 0);
      sphereN(px + rx * te, py + ry * te, pz + rz * te, zs, N3);
      n2x = N3[0]; n2y = N3[1]; n2z = N3[2];
    }
    px += rx * te; py += ry * te; pz += rz * te;
    path += te;
    if (refract(rx, ry, rz, -n2x, -n2y, -n2z, eta, R3)) { rx = R3[0]; ry = R3[1]; rz = R3[2]; break; }
    // it cannot leave here: it bounces back inside (reflect(r, n2))
    const dd = 2 * (n2x * rx + n2y * ry + n2z * rz);
    rx -= dd * n2x; ry -= dd * n2y; rz -= dd * n2z;
  }
  const z = Math.min(rz, -0.08), tt = (-2.7 - pz) / z;
  G3[0] = px + rx * tt; G3[1] = py + ry * tt; G3[2] = path;
}

/** Outside the solid: its soft shadow on the piece behind it, down and to the right (OP[3]). */
function shadow(dx: number, dy: number, u: OpticsU) {
  const rs = u.s!.c[3] > 0.5 ? 0.85 : 1;
  const sh = 1 - smoothstep(0.6 * rs, 1.15 * rs, Math.hypot(dx - 0.42 * rs, dy + 0.5 * rs));
  OP[3] = sh * 0.7 * u.b[2];
}

/** opSolid(p) of the shader: writes OP, OPD and OPX. */
function solid(px: number, py: number, u: OpticsU) {
  const s = u.s!;
  OP[0] = OP[1] = OP[2] = OP[3] = 0;
  OPD[0] = OPD[1] = OPD[2] = OPD[3] = 0;
  OPX[0] = OPX[1] = OPX[2] = OPX[3] = 0;
  const R = s.c[2];
  const dx = (px - s.c[0]) / R, dy = (py - s.c[1]) / R;
  let pz: number, n1x: number, n1y: number, n1z: number, edge = 0, rim: number;
  if (s.c[3] > 0.5) {
    const np = s.d[3], pl = s.n;
    let tin = -1e4, tin2 = -1e4, tout = 1e4;
    n1x = 0; n1y = 0; n1z = 1;
    for (let i = 0; i < 20; i++) {
      if (i >= np) break;
      const o = i * 4, ax = pl[o], ay = pl[o + 1], az = pl[o + 2];
      const den = -az, num = pl[o + 3] - (ax * dx + ay * dy + az * 3);
      if (Math.abs(den) < 1e-5) { if (num < 0) { shadow(dx, dy, u); return; } continue; }
      const tt = num / den;
      if (den < 0) {
        if (tt > tin) { tin2 = tin; tin = tt; n1x = ax; n1y = ay; n1z = az; }
        else if (tt > tin2) tin2 = tt;
      } else tout = Math.min(tout, tt);
    }
    if (tin >= tout) { shadow(dx, dy, u); return; }
    pz = 3 - tin;
    edge = 1 - smoothstep(0, 0.08, tin - tin2);
    // near the silhouette, where the path inside is short
    rim = 1 - smoothstep(0.05, 0.35, tout - tin);
  } else {
    const k = dx * dx + dy * dy;
    if (k >= 1) { shadow(dx, dy, u); return; }
    pz = s.d[1] * Math.sqrt(1 - k);
    sphereN(dx, dy, pz, s.d[1], N3);
    n1x = N3[0]; n1y = N3[1]; n1z = N3[2];
    rim = smoothstep(0.8, 1, Math.sqrt(k));
  }
  const eta = s.d[0];
  trace(dx, dy, pz, n1x, n1y, n1z, eta, u);
  const gx = G3[0], gy = G3[1], path = G3[2];
  const k = R * u.a[1];
  if (s.d[2] > 0) {
    // dispersion: red bends less, blue more
    const dn = 0.06 * s.d[2];
    trace(dx, dy, pz, n1x, n1y, n1z, eta * (1 - dn), u);
    OPD[0] = (G3[0] - gx) * k; OPD[1] = (G3[1] - gy) * k;
    trace(dx, dy, pz, n1x, n1y, n1z, eta * (1 + dn), u);
    OPD[2] = (G3[0] - gx) * k; OPD[3] = (G3[1] - gy) * k;
  }
  let f0 = (eta - 1) / (eta + 1);
  f0 *= f0;
  const fres = f0 + (1 - f0) * Math.pow(1 - Math.max(n1z, 0), 5);
  // reflect((0, 0, −1), n1)
  const rfx = 2 * n1z * n1x, rfy = 2 * n1z * n1y, rfz = -1 + 2 * n1z * n1z;
  // the rim: more reflected, less let through
  const refl = Math.min(1, fres + 0.4 * rim);
  OPX[0] = 1; OPX[1] = path; OPX[2] = 0.35 + 0.65 * Math.max(n1x * LX + n1y * LY + n1z * LZ, 0); OPX[3] = refl;
  OP[0] = (gx - dx) * k; OP[1] = (gy - dy) * k;
  OP[2] = refl * opEnv(rfx, rfy, rfz) * 1.8 + edge * 0.7;
}

/** optics(p, t) of the shader: writes OP (and, for a solid, OPD and OPX). */
export function opticsAt(px: number, py: number, t: number, u: OpticsU) {
  if (u.a[0] < 1.5) rain(px, py, t, u); else if (u.a[0] < 2.5) fluted(px, py, t, u); else solid(px, py, u);
}

/** Loop crossfade, as the shader: the glass at tl and one loop earlier, mixed by w. */
export function opticsLoop(px: number, py: number, tl: number, loop: number, u: OpticsU) {
  opticsAt(px, py, tl, u);
  const a0 = OP[0], a1 = OP[1], a2 = OP[2], a3 = OP[3];
  opticsAt(px, py, tl - loop, u);
  const w = tl / loop;
  OP[0] = a0 + (OP[0] - a0) * w; OP[1] = a1 + (OP[1] - a1) * w; OP[2] = a2 + (OP[2] - a2) * w; OP[3] = a3 + (OP[3] - a3) * w;
}
