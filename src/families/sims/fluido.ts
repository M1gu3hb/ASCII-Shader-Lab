import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Incompressible "stable fluids" (Stam 1999; the grid scheme of Bridson's notes and GPU Gems ch. 38, written
 * here from the equations) on a staggered MAC grid: u on vertical faces, v on horizontal faces, pressure and
 * dye at cell centres. One fixed step (dt = 1, lengths in cells):
 *   1. forces: seeded jets moving along their paths, buoyancy of the dye, vorticity confinement
 *      (Fedkiw et al. 2001: f = ε (N × ω), N = ∇|ω| / |∇|ω||);
 *   2. semi-Lagrangian advection of the velocity (midpoint backtrace, bilinear sampling);
 *   3. viscosity: implicit diffusion (I − ν∇²) u = u*, a few Gauss–Seidel sweeps;
 *   4. projection: ∇²p = ∇·u by red–black Gauss–Seidel with over-relaxation (warm-started from the last
 *      pressure, bounded iterations), then u −= ∇p. Walls and circular obstacles close their faces;
 *   5. the dye, on a finer grid, is advected by the projected velocity (its total renormalised, as the
 *      semi-Lagrangian step alone does not keep it) and dissipates exponentially.
 * With the jets «Desde la izquierda» the box becomes a channel: a uniform inflow on the left wall and an open
 * outlet on the right (pressure 0 outside). The velocity grid has half the raster's rows (at most SIM_ROWS), the
 * dye three quarters (at most DYE_ROWS); the raster reads them bilinearly.
 */

const ID = 'fluido', V = 1, RATE = 30;
const SIM_ROWS = 80, DYE_ROWS = 128;
const MAX_JETS = 8, MAX_OBST = 6, MAX_ITERS = 40, VISC_SWEEPS = 4;
/** Over-relaxation of the pressure sweeps. */
const SOR = 1.6;
/** Speed limit (cells per step) after the forces: keeps every setting bounded. */
const VMAX = 6;

interface P {
  visc: number; vort: number; force: number; jets: number; layout: string; motion: number; pulse: number; buoy: number;
  obst: number; iters: number; dyeDiss: number; view: string;
}
const read = (p: Params): P => ({
  visc: Number(p.visc ?? 0), vort: Number(p.vort ?? 0.35), force: Number(p.force ?? 2), jets: Math.round(Number(p.jets ?? 4)),
  layout: String(p.layout ?? 'libres'), motion: Number(p.motion ?? 0.4), pulse: Number(p.pulse ?? 0), buoy: Number(p.buoy ?? 0), obst: Math.round(Number(p.obst ?? 0)),
  iters: Math.round(Number(p.iters ?? 14)), dyeDiss: Number(p.dyeDiss ?? 0.25), view: String(p.view ?? 'tinta'),
});

/** Bilinear sample of an nx × ny field at index coordinates (fx, fy), clamped at its edges. */
function bil(f: Float32Array, nx: number, ny: number, fx: number, fy: number): number {
  fx = fx < 0 ? 0 : fx > nx - 1 ? nx - 1 : fx;
  fy = fy < 0 ? 0 : fy > ny - 1 ? ny - 1 : fy;
  const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
  const o = iy * nx + ix, dx = ix < nx - 1 ? 1 : 0, dy = iy < ny - 1 ? nx : 0;
  const a = f[o] + (f[o + dx] - f[o]) * tx, b = f[o + dy] + (f[o + dy + dx] - f[o + dy]) * tx;
  return a + (b - a) * ty;
}

interface Jet { bx: number; by: number; ax: number; ay: number; fx: number; fy: number; px: number; py: number; dir: number; swing: number; fd: number; pd: number }

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  const sh = Math.max(16, Math.min(SIM_ROWS, Math.round(h / 2))), sw = 2 * sh, n = sw * sh;
  const uw = sw + 1, nu = uw * sh, nv = sw * (sh + 1);
  let u = new Float32Array(nu), v = new Float32Array(nv), u2 = new Float32Array(nu), v2 = new Float32Array(nv);
  const pr = new Float32Array(n), div = new Float32Array(n);
  // dye grid: dw × dh, `kd` dye cells per velocity cell
  const dh = Math.max(24, Math.min(DYE_ROWS, Math.round(h * 0.75))), dw = 2 * dh, nd = dw * dh, kd = dh / sh;
  let dye = new Float32Array(nd), dye2 = new Float32Array(nd);
  const dyeSolid = new Uint8Array(nd), overlay = new Float32Array(w * h);
  const cu = new Float32Array(n), cv = new Float32Array(n), curl = new Float32Array(n), fxc = new Float32Array(n), fyc = new Float32Array(n);
  // solid cells; per face 0 free, 1 closed (no flow), 2 inflow; per cell the fluid neighbours (bits L R U D) and 1/count
  const solid = new Uint8Array(n), uFace = new Uint8Array(nu), vFace = new Uint8Array(nv), nb = new Uint8Array(n), nbInv = new Float32Array(n);
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  let steps = 0, phase = 0;

  // ---- seeded jets (their paths) and obstacles (their places), drawn once
  const jets: Jet[] = [];
  for (let k = 0; k < MAX_JETS; k++) {
    jets.push({
      bx: rng.range(0.18, 0.82), by: rng.range(0.22, 0.78), ax: rng.range(0.06, 0.2), ay: rng.range(0.05, 0.16),
      fx: rng.range(0.6, 1.4), fy: rng.range(0.6, 1.4), px: rng.range(0, 6.283), py: rng.range(0, 6.283),
      dir: rng.range(0, 6.283), swing: rng.range(0.5, 1.2), fd: rng.range(0.5, 1.3) * (rng.next() < 0.5 ? -1 : 1), pd: rng.range(0, 6.283),
    });
  }
  const obstacles: Array<[number, number, number]> = [];
  for (let tries = 0; obstacles.length < MAX_OBST && tries < 200; tries++) {
    const ox = rng.range(0.3, 0.86) * sw, oy = rng.range(0.2, 0.8) * sh, or = rng.range(0.07, 0.11) * sh;
    if (tries < 150 && obstacles.some(([x, y, r]) => Math.hypot(x - ox, y - oy) < r + or + sh * 0.08)) continue;
    obstacles.push([ox, oy, or]);
  }

  let nObst = -1, tunnel = false;
  const buildSolids = () => {
    nObst = Math.max(0, Math.min(MAX_OBST, p.obst));
    tunnel = p.layout === 'izquierda';
    solid.fill(0);
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      for (let k = 0; k < nObst; k++) {
        const [ox, oy, or] = obstacles[k];
        if (Math.hypot(i + 0.5 - ox, j + 0.5 - oy) < or) { solid[j * sw + i] = 1; break; }
      }
    }
    // faces on the walls or next to a solid cell carry no flow; the channel's left wall blows, its right one is open
    for (let j = 0; j < sh; j++) for (let i = 0; i <= sw; i++) {
      const next = (i > 0 && solid[j * sw + i - 1]) || (i < sw && solid[j * sw + i]);
      uFace[j * uw + i] = next ? 1 : i === 0 ? (tunnel ? 2 : 1) : i === sw ? (tunnel ? 0 : 1) : 0;
    }
    for (let j = 0; j <= sh; j++) for (let i = 0; i < sw; i++)
      vFace[j * sw + i] = j === 0 || j === sh || solid[(j - 1) * sw + i] || solid[j * sw + i] ? 1 : 0;
    // the dye inside obstacles, and their outline on the raster (−1: none)
    dyeSolid.fill(0); overlay.fill(-1);
    for (let k = 0; k < nObst; k++) {
      const [ox, oy, or] = obstacles[k];
      for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++)
        if (Math.hypot((i + 0.5) / kd - ox, (j + 0.5) / kd - oy) < or) dyeSolid[j * dw + i] = 1;
      const px = w / sw, cx = ox * px, cy = oy * px, R = or * px;
      for (let y = Math.max(0, Math.floor(cy - R - 2)); y < Math.min(h, Math.ceil(cy + R + 2)); y++)
        for (let x = Math.max(0, Math.floor(cx - R - 2)); x < Math.min(w, Math.ceil(cx + R + 2)); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - R;
          if (d < 1) overlay[y * w + x] = Math.max(d < 0 ? 0.16 : 0, 0.85 * (1 - Math.abs(d + 0.1)));
        }
    }
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const k = j * sw + i;
      let m = 0, c = 0;
      if (!solid[k]) {
        if (i > 0 && !solid[k - 1]) { m |= 1; c++; }
        if (i < sw - 1 && !solid[k + 1]) { m |= 2; c++; }
        if (j > 0 && !solid[k - sw]) { m |= 4; c++; }
        if (j < sh - 1 && !solid[k + sw]) { m |= 8; c++; }
        if (tunnel && i === sw - 1) c++; // the outlet: pressure 0 beyond it
      }
      nb[k] = m; nbInv[k] = c ? 1 / c : 0;
    }
  };
  buildSolids();
  const inflow = () => 0.5 * p.force;
  const closeFaces = () => {
    const uin = inflow();
    for (let i = 0; i < nu; i++) { const f = uFace[i]; if (f) u[i] = f === 2 ? uin : 0; }
    for (let i = 0; i < nv; i++) if (vFace[i]) v[i] = 0;
  };
  closeFaces();

  const JP = new Float64Array(4), gx0 = new Float64Array(dw + 1), gx1 = new Float64Array(dw + 1), gy0 = new Float64Array(dh + 1), gy1 = new Float64Array(dh + 1);
  /** Where jet k is now (into JP): centre (cells) and unit direction. */
  const jetAt = (k: number, cnt: number) => {
    const J = jets[k], ph = phase;
    let x: number, y: number, a: number;
    if (p.layout === 'suelo' || p.layout === 'arriba') {
      const up = p.layout === 'suelo';
      x = ((k + 0.5) / cnt + 0.25 * (J.bx - 0.5) / cnt + 0.05 * Math.sin(J.fx * ph + J.px)) * sw;
      y = (up ? 0.93 : 0.07) * sh;
      a = (up ? -Math.PI / 2 : Math.PI / 2) + 0.35 * J.swing * Math.sin(J.fd * ph + J.pd);
    } else if (p.layout === 'izquierda') {
      x = 0.035 * sw;
      y = ((k + 0.5) / cnt + 0.25 * (J.by - 0.5) / cnt + 0.06 * Math.sin(J.fy * ph + J.py)) * sh;
      a = 0.25 * J.swing * Math.sin(J.fd * ph + J.pd);
    } else {
      x = (J.bx + J.ax * Math.sin(J.fx * ph + J.px)) * sw;
      y = (J.by + J.ay * Math.sin(J.fy * ph + J.py)) * sh;
      a = J.dir + J.fd * ph * 0.35 + J.swing * Math.sin(J.fd * ph + J.pd);
    }
    JP[0] = x; JP[1] = y; JP[2] = Math.cos(a); JP[3] = Math.sin(a);
  };

  const clampV = () => {
    for (let i = 0; i < nu; i++) u[i] = u[i] > VMAX ? VMAX : u[i] < -VMAX ? -VMAX : u[i];
    for (let i = 0; i < nv; i++) v[i] = v[i] > VMAX ? VMAX : v[i] < -VMAX ? -VMAX : v[i];
  };

  /** Curl at cell centres from the face velocities (into `curl`). */
  const computeCurl = () => {
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const k = j * sw + i;
      cu[k] = 0.5 * (u[j * uw + i] + u[j * uw + i + 1]);
      cv[k] = 0.5 * (v[k] + v[k + sw]);
    }
    for (let j = 0; j < sh; j++) {
      const ju = j > 0 ? -sw : 0, jd = j < sh - 1 ? sw : 0;
      for (let i = 0; i < sw; i++) {
        const k = j * sw + i, il = i > 0 ? -1 : 0, ir = i < sw - 1 ? 1 : 0;
        curl[k] = 0.5 * (cv[k + ir] - cv[k + il]) - 0.5 * (cu[k + jd] - cu[k + ju]);
      }
    }
  };

  const forces = () => {
    const F = p.force, cnt = Math.max(0, Math.min(MAX_JETS, p.jets));
    const re = Math.max(1.5, sh * 0.055), ir2 = 1 / (re * re), reach = Math.ceil(re * 2.2);
    // «Pulsos»: each jet blows only part of its own cycle (2–4 s), so it lets out puffs instead of a stream
    const duty = 1 - 0.85 * p.pulse, secs = steps / RATE;
    for (let k = 0; k < cnt; k++) {
      let on = 0.6;
      if (duty < 1) {
        const c = secs / (2 + 2 * ((k * 0.618034) % 1)) + jets[k].pd / 6.283, f = c - Math.floor(c);
        on *= f < duty ? Math.min(1, f / 0.05, (duty - f) / 0.05) : 0;
        if (on <= 0) continue;
      }
      jetAt(k, cnt);
      // (in the channel the jets are dye lines at the speed of the current: smoke wires, not jets)
      const sp = tunnel ? inflow() : F, x = JP[0], y = JP[1], tu = sp * JP[2], tv = sp * JP[3];
      const i0 = Math.max(0, Math.floor(x - reach)), i1 = Math.min(sw, Math.ceil(x + reach));
      const j0 = Math.max(0, Math.floor(y - reach)), j1 = Math.min(sh, Math.ceil(y + reach));
      // separable gaussian weights: u faces sit at (i, j + .5), v faces at (i + .5, j)
      for (let i = i0; i <= i1; i++) { gx0[i] = Math.exp(-(i - x) * (i - x) * ir2); gx1[i] = Math.exp(-(i + 0.5 - x) * (i + 0.5 - x) * ir2); }
      for (let j = j0; j <= j1; j++) { gy0[j] = Math.exp(-(j - y) * (j - y) * ir2); gy1[j] = Math.exp(-(j + 0.5 - y) * (j + 0.5 - y) * ir2); }
      for (let j = j0; j <= j1; j++) {
        const a = on * gy1[j], b = on * gy0[j];
        for (let i = i0; i <= i1; i++) {
          if (j < sh) { const q = j * uw + i; u[q] += (tu - u[q]) * a * gx0[i]; }
          if (i < sw) { const q = j * sw + i; v[q] += (tv - v[q]) * b * gx1[i]; }
        }
      }
      // dye, on its own grid, from the jet's core
      const di0 = Math.max(0, Math.floor((x - reach) * kd)), di1 = Math.min(dw - 1, Math.ceil((x + reach) * kd));
      const dj0 = Math.max(0, Math.floor((y - reach) * kd)), dj1 = Math.min(dh - 1, Math.ceil((y + reach) * kd));
      const ird = ir2 * 2.5;
      for (let i = di0; i <= di1; i++) { const d = (i + 0.5) / kd - x; gx0[i] = Math.exp(-d * d * ird); }
      for (let j = dj0; j <= dj1; j++) {
        const d = (j + 0.5) / kd - y, a = on * 0.8 * Math.exp(-d * d * ird);
        for (let i = di0; i <= di1; i++) { const q = j * dw + i; dye[q] += (1 - dye[q]) * a * gx0[i]; }
      }
    }
    // buoyancy: the dye is lighter (> 0) or heavier (< 0) than the fluid around it (rows grow downwards)
    if (p.buoy !== 0) {
      const b = p.buoy * 0.03;
      for (let j = 1; j < sh; j++) for (let i = 0; i < sw; i++) v[j * sw + i] -= 2 * b * bil(dye, dw, dh, (i + 0.5) * kd - 0.5, j * kd - 0.5);
    }
    if (p.vort > 0) {
      computeCurl();
      const eps = p.vort * 0.35;
      fxc.fill(0); fyc.fill(0);
      for (let j = 1; j < sh - 1; j++) for (let i = 1; i < sw - 1; i++) {
        const k = j * sw + i;
        const gx = 0.5 * (Math.abs(curl[k + 1]) - Math.abs(curl[k - 1])), gy = 0.5 * (Math.abs(curl[k + sw]) - Math.abs(curl[k - sw]));
        const len = Math.sqrt(gx * gx + gy * gy) + 1e-6, wv = curl[k];
        fxc[k] = eps * (gy / len) * wv; fyc[k] = -eps * (gx / len) * wv;
      }
      for (let j = 0; j < sh; j++) for (let i = 1; i < sw; i++) u[j * uw + i] += 0.5 * (fxc[j * sw + i - 1] + fxc[j * sw + i]);
      for (let q = sw; q < nv - sw; q++) v[q] += 0.5 * (fyc[q - sw] + fyc[q]);
    }
    clampV();
    closeFaces();
  };

  // (each pass in its own function, so the engine inlines every bilinear sample)
  const advectU = () => {
    for (let j = 0; j < sh; j++) {
      const y = j + 0.5;
      for (let i = 0; i <= sw; i++) {
        const q = j * uw + i;
        if (uFace[q]) { u2[q] = u[q]; continue; }
        const il = i > 0 ? i - 1 : 0, ir = i < sw ? i : sw - 1;
        const vx = u[q], vy = 0.25 * (v[j * sw + il] + v[j * sw + ir] + v[(j + 1) * sw + il] + v[(j + 1) * sw + ir]);
        const mx = i - 0.5 * vx, my = y - 0.5 * vy;
        u2[q] = bil(u, uw, sh, i - bil(u, uw, sh, mx, my - 0.5), y - 0.5 - bil(v, sw, sh + 1, mx - 0.5, my));
      }
    }
  };
  const advectV = () => {
    for (let j = 0; j <= sh; j++) {
      const ju = j > 0 ? j - 1 : 0, jd = j < sh ? j : sh - 1;
      for (let i = 0; i < sw; i++) {
        const q = j * sw + i;
        if (vFace[q]) { v2[q] = v[q]; continue; }
        const x = i + 0.5;
        const vy = v[q], vx = 0.25 * (u[ju * uw + i] + u[ju * uw + i + 1] + u[jd * uw + i] + u[jd * uw + i + 1]);
        const mx = x - 0.5 * vx, my = j - 0.5 * vy;
        v2[q] = bil(v, sw, sh + 1, x - 0.5 - bil(u, uw, sh, mx, my - 0.5), j - bil(v, sw, sh + 1, mx - 0.5, my));
      }
    }
  };
  const advectVelocity = () => {
    advectU(); advectV();
    let t = u; u = u2; u2 = t;
    t = v; v = v2; v2 = t;
  };

  /** Implicit viscous diffusion: Gauss–Seidel sweeps on (1 + 4a) x − a Σ neighbours = x*, a = ν. */
  const diffuse = () => {
    const a = p.visc * 1.5;
    if (a <= 0) return;
    u2.set(u); v2.set(v);
    const c = 1 / (1 + 4 * a);
    for (let s = 0; s < VISC_SWEEPS; s++) {
      for (let j = 0; j < sh; j++) {
        const up = j > 0 ? -uw : 0, dn = j < sh - 1 ? uw : 0;
        for (let i = 1; i < sw; i++) {
          const q = j * uw + i;
          if (!uFace[q]) u[q] = (u2[q] + a * (u[q - 1] + u[q + 1] + u[q + up] + u[q + dn])) * c;
        }
      }
      for (let j = 1; j < sh; j++) {
        for (let i = 0; i < sw; i++) {
          const q = j * sw + i, lf = i > 0 ? -1 : 0, rt = i < sw - 1 ? 1 : 0;
          if (!vFace[q]) v[q] = (v2[q] + a * (v[q + lf] + v[q + rt] + v[q - sw] + v[q + sw])) * c;
        }
      }
    }
  };

  const divergence = (out: Float32Array) => {
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const k = j * sw + i;
      out[k] = solid[k] ? 0 : u[j * uw + i + 1] - u[j * uw + i] + v[k + sw] - v[k];
    }
  };

  const project = () => {
    divergence(div);
    const iters = Math.max(1, Math.min(MAX_ITERS, p.iters));
    for (let it = 0; it < iters; it++) {
      for (let color = 0; color < 2; color++) {
        for (let j = 0; j < sh; j++) {
          for (let i = (j + color) & 1, k = j * sw + i; i < sw; i += 2, k += 2) {
            const m = nb[k], inv = nbInv[k];
            if (!inv) continue;
            let s = 0;
            if (m & 1) s += pr[k - 1];
            if (m & 2) s += pr[k + 1];
            if (m & 4) s += pr[k - sw];
            if (m & 8) s += pr[k + sw];
            pr[k] += SOR * ((s - div[k]) * inv - pr[k]);
          }
        }
      }
    }
    for (let j = 0; j < sh; j++) {
      for (let i = 1; i < sw; i++) { const q = j * uw + i; if (!uFace[q]) u[q] -= pr[j * sw + i] - pr[j * sw + i - 1]; }
      const q = j * uw + sw;
      if (!uFace[q]) u[q] += pr[j * sw + sw - 1];
    }
    for (let q = sw; q < nv - sw; q++) if (!vFace[q]) v[q] -= pr[q] - pr[q - sw];
    closeFaces();
  };

  /** The dye: midpoint backtraces at the velocity grid's cell centres, interpolated onto the finer dye grid. */
  const traceCentres = () => {
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const k = j * sw + i, x = i + 0.5, y = j + 0.5;
      const mx = x - 0.25 * (u[j * uw + i] + u[j * uw + i + 1]), my = y - 0.25 * (v[k] + v[k + sw]);
      cu[k] = bil(u, uw, sh, mx, my - 0.5); cv[k] = bil(v, sw, sh + 1, mx - 0.5, my);
    }
  };
  const advectDye = () => {
    traceCentres();
    let before = 0, after = 0;
    for (let j = 0; j < dh; j++) {
      const y = (j + 0.5) / kd;
      for (let i = 0; i < dw; i++) {
        const k = j * dw + i;
        before += dye[k];
        if (dyeSolid[k]) { dye2[k] = 0; continue; }
        const x = (i + 0.5) / kd;
        const bx = x - bil(cu, sw, sh, x - 0.5, y - 0.5), by = y - bil(cv, sw, sh, x - 0.5, y - 0.5);
        after += dye2[k] = bil(dye, dw, dh, bx * kd - 0.5, by * kd - 0.5);
      }
    }
    // semi-Lagrangian advection does not keep the total by itself: in the closed box it is renormalised, so
    // only the dissipation removes dye (the channel's outlet lets it leave)
    const keep = Math.exp(-p.dyeDiss / RATE) * (!tunnel && after > 1e-6 ? Math.min(1.25, Math.max(0.8, before / after)) : 1);
    for (let k = 0; k < nd; k++) dye2[k] *= keep;
    const t = dye; dye = dye2; dye2 = t;
  };

  const step1 = () => {
    if (p.obst !== nObst || (p.layout === 'izquierda') !== tunnel) buildSolids();
    forces();
    advectVelocity();
    diffuse();
    project();
    advectDye();
    phase += (p.motion * Math.PI * 2) / (10 * RATE);
    steps++;
  };

  // raster: the chosen quantity, bilinear over its grid, with the obstacles outlined
  const field = new Float32Array(Math.max(n, nd));
  const render = (out: Uint8Array) => {
    let fw = sw, fh = sh;
    if (p.view === 'velocidad') {
      for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
        const k = j * sw + i, a = 0.5 * (u[j * uw + i] + u[j * uw + i + 1]), b = 0.5 * (v[k] + v[k + sw]);
        field[k] = 1 - Math.exp(-Math.sqrt(a * a + b * b) * 0.9);
      }
    } else if (p.view === 'vorticidad') {
      computeCurl();
      for (let k = 0; k < n; k++) field[k] = 1 - Math.exp(-Math.abs(curl[k]) * 3.2);
    } else {
      for (let k = 0; k < nd; k++) field[k] = 1 - Math.exp(-dye[k] * 2);
      fw = dw; fh = dh;
    }
    const sx = fw / w, sy = fh / h;
    for (let y = 0; y < h; y++) {
      const gy = (y + 0.5) * sy;
      for (let x = 0; x < w; x++) {
        const o = overlay[y * w + x];
        const val = o >= 0 ? o : bil(field, fw, fh, (x + 0.5) * sx - 0.5, gy - 0.5);
        out[y * w + x] = val <= 0 ? 0 : val >= 1 ? 255 : (val * 255 + 0.5) | 0;
      }
    }
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = read(np); if (p.obst !== nObst || (p.layout === 'izquierda') !== tunnel) buildSolids(); },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) { render(out); },
    stroke(s: Stroke) {
      // dye along the segment, and the fluid there pulled towards the stroke's velocity
      const ax = (s.x0 * 0.5 + 0.5) * sw, ay = (0.5 - s.y0) * sh, bx = (s.x1 * 0.5 + 0.5) * sw, by = (0.5 - s.y1) * sh;
      const R = Math.max(1.5, s.r * sh), ir2 = 1 / (R * R), vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy;
      const len = Math.sqrt(vv), sp = len > 1e-6 ? Math.min(VMAX, len * 0.8) / len : 0;
      const tx = vx * sp, ty = vy * sp, st = Math.max(0, Math.min(1, s.strength));
      const fall = (x: number, y: number) => {
        let t = vv > 1e-9 ? ((x - ax) * vx + (y - ay) * vy) / vv : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - ax - vx * t, dy = y - ay - vy * t;
        return Math.exp(-(dx * dx + dy * dy) * ir2);
      };
      const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - 2 * R)), i1 = Math.min(sw, Math.ceil(Math.max(ax, bx) + 2 * R));
      const j0 = Math.max(0, Math.floor(Math.min(ay, by) - 2 * R)), j1 = Math.min(sh, Math.ceil(Math.max(ay, by) + 2 * R));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (j < sh) { const q = j * uw + i; if (!uFace[q]) u[q] += (tx - u[q]) * 0.8 * st * fall(i, j + 0.5); }
        if (i < sw) { const q = j * sw + i; if (!vFace[q]) v[q] += (ty - v[q]) * 0.8 * st * fall(i + 0.5, j); }
      }
      const di0 = Math.max(0, Math.floor(i0 * kd)), di1 = Math.min(dw - 1, Math.ceil(i1 * kd));
      const dj0 = Math.max(0, Math.floor(j0 * kd)), dj1 = Math.min(dh - 1, Math.ceil(j1 * kd));
      for (let j = dj0; j <= dj1; j++) for (let i = di0; i <= di1; i++) {
        const k = j * dw + i;
        if (!dyeSolid[k]) dye[k] = Math.min(8, dye[k] + 0.9 * st * fall((i + 0.5) / kd, (j + 0.5) / kd));
      }
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { phase };
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { u: u.slice(), v: v.slice(), p: pr.slice(), dye: dye.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a este fluido.');
      const a = s.arrays;
      const ok = (x: unknown, len: number): x is Float32Array => x instanceof Float32Array && x.length === len;
      if (!ok(a.u, nu) || !ok(a.v, nv) || !ok(a.p, n) || !ok(a.dye, nd)) throw new Error('El estado guardado está incompleto.');
      u.set(a.u); v.set(a.v); pr.set(a.p); dye.set(a.dye);
      steps = s.steps; phase = s.scalars.phase ?? 0;
      rng.load(s.scalars);
    },
  };
}
