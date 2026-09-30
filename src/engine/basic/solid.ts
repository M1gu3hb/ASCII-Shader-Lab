/**
 * CPU twin of ../glsl/solid.ts: the same camera, bounding sphere, march, tetrahedral normal, light and
 * highlight, so a solid of the library draws the same shape in both engines. The rotation and the light
 * are prepared once per frame (prep); the cell loop only marches.
 */
import { rotXY, sat } from './core';
import type { BasicPattern } from './patterns';

export type Sdf = (x: number, y: number, z: number, t: number, a: number, b: number) => number;
export type Shade = (x: number, y: number, z: number, t: number, a: number, b: number, dif: number, face: number, spec: number) => number;

export interface SolidSpec {
  rot: (t: number, a: number, b: number) => [number, number];
  eye: number;
  focal: number;
  bound: number;
  steps: number;
  k: number;
  light: [number, number, number];
  sdf: Sdf;
  shade: Shade;
}

export function solidPattern(s: SolidSpec): BasicPattern {
  const M = new Float64Array(9);
  let ox = 0, oy = 0, oz = 0, lx = 0, ly = 0, lz = 0;
  const b2 = s.bound * s.bound, sdf = s.sdf;
  return {
    prep(t, a, b) {
      const [rx, ry] = s.rot(t, a, b);
      rotXY(rx, ry, M);
      ox = -s.eye * M[2]; oy = -s.eye * M[5]; oz = -s.eye * M[8];
      const [vx, vy, vz] = s.light;
      const x = M[0] * vx + M[1] * vy + M[2] * vz, y = M[3] * vx + M[4] * vy + M[5] * vz, z = M[6] * vx + M[7] * vy + M[8] * vz;
      const l = Math.sqrt(x * x + y * y + z * z);
      lx = x / l; ly = y / l; lz = z / l;
    },
    f(x, y, t, a, b) {
      const rl = Math.sqrt(x * x + y * y + s.focal * s.focal), cx = x / rl, cy = y / rl, cz = s.focal / rl;
      const dx = M[0] * cx + M[1] * cy + M[2] * cz, dy = M[3] * cx + M[4] * cy + M[5] * cz, dz = M[6] * cx + M[7] * cy + M[8] * cz;
      const bb = ox * dx + oy * dy + oz * dz;
      let h = bb * bb - (ox * ox + oy * oy + oz * oz) + b2;
      if (h < 0) return 0;
      h = Math.sqrt(h);
      let d = -bb - h;
      const dmax = -bb + h;
      let qx = ox, qy = oy, qz = oz, hit = false;
      for (let i = 0; i < s.steps; i++) {
        qx = ox + dx * d; qy = oy + dy * d; qz = oz + dz * d;
        const v = sdf(qx, qy, qz, t, a, b);
        if (v < 0.002) { hit = true; break; }
        d += Math.max(v * s.k, 0.002); if (d > dmax) break;
      }
      if (!hit) return 0;
      const e = 0.002;
      const A = sdf(qx + e, qy - e, qz - e, t, a, b), B = sdf(qx - e, qy - e, qz + e, t, a, b);
      const C = sdf(qx - e, qy + e, qz - e, t, a, b), D = sdf(qx + e, qy + e, qz + e, t, a, b);
      let nx = A - B - C + D, ny = -A - B + C + D, nz = -A + B - C + D;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const ndl = nx * lx + ny * ly + nz * lz;
      const dif = Math.max(ndl, 0), face = Math.max(-(nx * dx + ny * dy + nz * dz), 0);
      // reflect(-L, n) = -L + 2 dot(n, L) n; highlight towards the eye (-rd)
      const rx = -lx + 2 * ndl * nx, ry = -ly + 2 * ndl * ny, rz = -lz + 2 * ndl * nz;
      const spec = Math.pow(Math.max(-(rx * dx + ry * dy + rz * dz), 0), 18);
      return sat(s.shade(qx, qy, qz, t, a, b, dif, face, spec));
    },
  };
}
