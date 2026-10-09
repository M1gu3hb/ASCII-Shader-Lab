import type { AnalyticImpl } from '../types';
import { FRACTAL3D_GLSL } from './fractal3d';

/**
 * CPU twin of F_fractal_3d for the basic engine, line by line except for its budget: at most CPU_STEPS
 * ray steps (the shader takes 96) and no soft shadow. The family declares it as a
 * reduced implementation; the studio says so in basic mode. Iterations are the same as the shader's.
 */
const CPU_STEPS = 56;
const TAU = Math.PI * 2;

let trap = 1;
function de(x: number, y: number, z: number, form: number, pw: number, iters: number): number {
  trap = 1e9;
  if (form < 0.5) {
    let zx = x, zy = y, zz = z, dr = 1, r = 0;
    for (let i = 0; i < iters; i++) {
      r = Math.sqrt(zx * zx + zy * zy + zz * zz);
      if (r > 2) break;
      const th = Math.acos(Math.max(-1, Math.min(1, zz / Math.max(r, 1e-6)))) * pw;
      const ph = Math.atan2(zy, zx) * pw;
      dr = Math.pow(r, pw - 1) * pw * dr + 1;
      const zr = Math.pow(r, pw);
      const st = Math.sin(th);
      zx = zr * st * Math.cos(ph) + x; zy = zr * Math.sin(ph) * st + y; zz = zr * Math.cos(th) + z;
      trap = Math.min(trap, zx * zx + zy * zy + zz * zz);
    }
    return 0.5 * Math.log(Math.max(r, 1e-6)) * r / dr;
  }
  const sc = 2 + (pw - 2) * 0.1;
  const cx = x * 4, cy = y * 4, cz = z * 4;
  let zx = cx, zy = cy, zz = cz, dr = 1;
  for (let i = 0; i < iters; i++) {
    zx = Math.max(-1, Math.min(1, zx)) * 2 - zx; zy = Math.max(-1, Math.min(1, zy)) * 2 - zy; zz = Math.max(-1, Math.min(1, zz)) * 2 - zz;
    const r2 = zx * zx + zy * zy + zz * zz;
    if (r2 < 0.25) { zx *= 4; zy *= 4; zz *= 4; dr *= 4; } else if (r2 < 1) { zx /= r2; zy /= r2; zz /= r2; dr /= r2; }
    zx = zx * sc + cx; zy = zy * sc + cy; zz = zz * sc + cz; dr = dr * Math.abs(sc) + 1;
    trap = Math.min(trap, r2);
  }
  return Math.sqrt(zx * zx + zy * zy + zz * zz) / Math.abs(dr) / 4;
}

// per frame (prep): camera, power, light
let K: Float32Array = new Float32Array(8);
let pw = 8, iters = 7, R = 1.3, ro = [0, 0, 3], fw = [0, 0, -1], rt = [1, 0, 0], up = [0, 1, 0], ld = [0, 0, 1];

function map(x: number, y: number, z: number): number {
  let d = de(x, y, z, K[0], pw, iters);
  if (K[3] > 0) d = Math.max(d, x - (1.2 - K[3] * 1.6));
  return d;
}

const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export const impl: AnalyticImpl = {
  glsl: FRACTAL3D_GLSL,
  prep(t, k) {
    K = k;
    pw = k[1] + k[6] * 1.5 * Math.sin(t * 0.4);
    iters = Math.round(k[2]);
    const a = t * k[4] * 10 / 60 * TAU, e = 0.35;
    R = k[0] < 0.5 ? 1.3 : 2.6;
    const dist = k[5] * (k[0] < 0.5 ? 1 : 1.75);
    ro = [dist * Math.sin(a) * Math.cos(e), dist * Math.sin(e), dist * Math.cos(a) * Math.cos(e)];
    fw = norm([-ro[0], -ro[1], -ro[2]]);
    rt = norm([fw[1] * 0 - fw[2] * 1, fw[2] * 0 - fw[0] * 0, fw[0] * 1 - fw[1] * 0]);
    up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
    const m = k[7];
    ld = norm([-fw[0] * (1 - m) + rt[0] * m + up[0] * 0.5, -fw[1] * (1 - m) + rt[1] * m + up[1] * 0.5, -fw[2] * (1 - m) + rt[2] * m + up[2] * 0.5]);
  },
  cpu(px, py) {
    let dx = px * rt[0] + py * up[0] + 1.1 * fw[0], dy = px * rt[1] + py * up[1] + 1.1 * fw[1], dz = px * rt[2] + py * up[2] + 1.1 * fw[2];
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const b = ro[0] * dx + ro[1] * dy + ro[2] * dz, cc = ro[0] * ro[0] + ro[1] * ro[1] + ro[2] * ro[2] - R * R, disc = b * b - cc;
    if (disc < 0) return 0;
    const s = Math.sqrt(disc), tf = -b + s;
    let tt = Math.max(0, -b - s), d = 1, used = 0, tr = 1;
    for (let i = 0; i < CPU_STEPS; i++) {
      d = map(ro[0] + dx * tt, ro[1] + dy * tt, ro[2] + dz * tt);
      tr = trap;
      if (d < 0.0015 * tt || tt > tf) break;
      tt += d * 0.9;
      used++;
    }
    if (tt > tf || d >= 0.0015 * tt) return 0;
    const x = ro[0] + dx * tt, y = ro[1] + dy * tt, z = ro[2] + dz * tt, hh = 0.0015 * tt;
    const n = norm([map(x + hh, y, z) - map(x - hh, y, z), map(x, y + hh, z) - map(x, y - hh, z), map(x, y, z + hh) - map(x, y, z - hh)]);
    const dif = Math.max(0, n[0] * ld[0] + n[1] * ld[1] + n[2] * ld[2]);
    const ao = 1 - used / 96;
    const col = 0.7 + 0.3 * Math.max(0, Math.min(1, tr));
    const v = (dif * 0.75 + 0.28 * ao) * col;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  },
};
