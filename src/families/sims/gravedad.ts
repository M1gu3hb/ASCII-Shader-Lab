import { Accum, toBytes } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Gravitational N-body system in 3D (the model of GPU Gems 3, ch. 31, written here for the CPU): every body
 * pulls every other with Plummer softening,
 *   a_i = G Σ_j m_j (x_j − x_i) / (|x_j − x_i|² + ε²)^{3/2},
 * summed directly over pairs (O(N²), symmetric, so momentum is conserved to rounding) and integrated with
 * kick–drift–kick leapfrog at a fixed step (symplectic: the energy oscillates instead of drifting).
 * Units: total mass 1 and a system about 1 across. Initial conditions are built from the seed: a rotating
 * disc around a central mass (circular velocities from the enclosed mass), two Plummer spheres on a
 * collision course (Aarseth–Hénon–Wielen sampling), a cold uniform cloud that collapses, or a binary star
 * with a ring of light bodies. The picture: an orthographic camera that tilts, turns slowly and follows
 * the bulk of the mass (its yaw and centre are part of the state, so the trail buffer it draws into stays
 * coherent), soft splats and a fading trail.
 */

const ID = 'gravedad', V = 1;
const hyp3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
const RATE = 30;
const MAX_BODIES = 1200, MAX_EXTRA = 12;

interface P { n: number; G: number; soft: number; dt: number; init: string; masses: string; trail: number; zoom: number; tilt: number; spin: number; view: string }
const read = (p: Params): P => ({
  n: Math.max(16, Math.min(MAX_BODIES, Math.round(Number(p.bodies ?? 300)))),
  G: Number(p.G ?? 1), soft: Number(p.soft ?? 0.04), dt: Number(p.dt ?? 0.012),
  init: String(p.init ?? 'disco'), masses: String(p.masses ?? 'iguales'),
  trail: Number(p.trail ?? 0.5), zoom: Number(p.zoom ?? 1), tilt: (Number(p.tilt ?? 35) * Math.PI) / 180,
  spin: Number(p.spin ?? 0.1), view: String(p.view ?? 'masa'),
});

/** Kinetic and (softened) potential energy, and total momentum, of the first n bodies. */
export function energy(pos: Float64Array, vel: Float64Array, mass: Float64Array, n: number, G: number, soft: number) {
  let K = 0, U = 0, px = 0, py = 0, pz = 0;
  const e2 = soft * soft;
  for (let i = 0; i < n; i++) {
    const m = mass[i], vx = vel[i * 3], vy = vel[i * 3 + 1], vz = vel[i * 3 + 2];
    K += 0.5 * m * (vx * vx + vy * vy + vz * vz);
    px += m * vx; py += m * vy; pz += m * vz;
    for (let j = i + 1; j < n; j++) {
      const dx = pos[j * 3] - pos[i * 3], dy = pos[j * 3 + 1] - pos[i * 3 + 1], dz = pos[j * 3 + 2] - pos[i * 3 + 2];
      U -= (G * m * mass[j]) / Math.sqrt(dx * dx + dy * dy + dz * dz + e2);
    }
  }
  return { K, U, E: K + U, p: [px, py, pz] as [number, number, number] };
}

/** A float64 array as int32 words: snapshots carry it bit for bit. */
const words = (a: Float64Array) => new Int32Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  const N0 = p.n, CAP = N0 + MAX_EXTRA;
  const pos = new Float64Array(CAP * 3), vel = new Float64Array(CAP * 3), acc3 = new Float64Array(CAP * 3), mass = new Float64Array(CAP);
  const trail = new Float32Array(w * h);
  let n = N0, steps = 0, yaw = 0, lastAdd = -1e9;
  // camera centre: follows the bulk of the mass (not the escapers), smoothed
  let camX = 0, camY = 0, camZ = 0;

  // ---- initial conditions (deterministic from the seed)
  const massOf = (k: number, total: number, out: Float64Array, from: number) => {
    // equal, or a broad power-law spread (a few heavy bodies among many light ones), normalised to `total`
    let s = 0;
    for (let i = 0; i < k; i++) { const m = p.masses === 'variadas' ? Math.pow(1 - rng.next() * 0.995, -0.9) : 1; out[from + i] = m; s += m; }
    for (let i = 0; i < k; i++) out[from + i] *= total / s;
  };
  const put = (i: number, x: number, y: number, z: number, vx: number, vy: number, vz: number) => {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
  };
  const G0 = p.G, e2 = p.soft * p.soft;
  /** Circular speed at radius r around an enclosed mass M (softened like the force). */
  const vcirc = (M: number, r: number) => Math.sqrt((G0 * M * r * r) / Math.pow(r * r + e2, 1.5));
  /** Plummer sphere of k bodies, total mass M, scale a, centred at c moving at v. */
  const plummer = (from: number, k: number, M: number, a: number, c: number[], v: number[]) => {
    massOf(k, M, mass, from);
    for (let i = 0; i < k; i++) {
      let r = 0;
      do { r = a / Math.sqrt(Math.pow(rng.range(1e-6, 1), -2 / 3) - 1); } while (r > 6 * a);
      const ct = rng.range(-1, 1), st = Math.sqrt(1 - ct * ct), ph = rng.next() * Math.PI * 2;
      // speed: q × escape speed, q drawn from g(q) = q² (1 − q²)^{7/2} by rejection
      let q = 0;
      for (;;) { q = rng.next(); if (rng.next() * 0.1 < q * q * Math.pow(1 - q * q, 3.5)) break; }
      const ve = Math.sqrt((2 * G0 * M) / Math.sqrt(r * r + a * a)) * q;
      const cv = rng.range(-1, 1), sv = Math.sqrt(1 - cv * cv), pv = rng.next() * Math.PI * 2;
      put(from + i, c[0] + r * st * Math.cos(ph), c[1] + r * st * Math.sin(ph), c[2] + r * ct,
        v[0] + ve * sv * Math.cos(pv), v[1] + ve * sv * Math.sin(pv), v[2] + ve * cv);
    }
  };
  /** A thin rotating disc of k bodies (mass Md) between r0 and r1 around a central mass Mc. */
  const disc = (from: number, k: number, Md: number, Mc: number, r0: number, r1: number, scale: number, thick: number, warm: number) => {
    massOf(k, Md, mass, from);
    const rs: number[] = [];
    // exponential surface density Σ ∝ exp(−r / scale): radii drawn from r Σ(r) by rejection on [r0, r1]
    const f = (r: number) => r * Math.exp(-r / scale), fmax = f(Math.min(r1, Math.max(r0, scale)));
    for (let i = 0; i < k; i++) {
      let r = 0;
      do { r = rng.range(r0, r1); } while (rng.next() * fmax > f(r));
      rs.push(r);
    }
    const order = rs.map((_, i) => i).sort((a, b) => rs[a] - rs[b]);
    let enclosed = Mc;
    for (const i of order) {
      const r = rs[i], ph = rng.next() * Math.PI * 2;
      enclosed += mass[from + i] * 0.5;
      const vc = vcirc(enclosed, r);
      enclosed += mass[from + i] * 0.5;
      const sx = rng.gauss() * warm * vc, sy = rng.gauss() * warm * vc;
      put(from + i, r * Math.cos(ph), r * Math.sin(ph), rng.gauss() * thick,
        -Math.sin(ph) * vc + sx, Math.cos(ph) * vc + sy, rng.gauss() * warm * 0.5 * vc);
    }
  };
  switch (p.init) {
    case 'choque': {
      const k = Math.floor(N0 / 2), d = 1.1, b = 0.22, vr = 0.62 * Math.sqrt(G0);
      plummer(0, k, 0.5, 0.16, [-d, -b, 0], [vr, 0, 0]);
      plummer(k, N0 - k, 0.5, 0.16, [d, b, 0], [-vr, 0, 0]);
      break;
    }
    case 'colapso': {
      massOf(N0, 1, mass, 0);
      for (let i = 0; i < N0; i++) {
        let x = 0, y = 0, z = 0;
        do { x = rng.range(-1, 1); y = rng.range(-1, 1); z = rng.range(-1, 1); } while (x * x + y * y + z * z > 1);
        // cold: tiny random motions and a slow spin about z (the remnant ends up flattened)
        const om = 0.25 * Math.sqrt(G0), s = 0.06 * Math.sqrt(G0);
        put(i, x, y, z * 0.85, -y * om + rng.gauss() * s, x * om + rng.gauss() * s, rng.gauss() * s);
      }
      break;
    }
    case 'binario': {
      const ms = 0.4, a = 0.32, vb = Math.sqrt((G0 * ms * a * a) / (2 * Math.pow(a * a + e2, 1.5)));
      mass[0] = ms; mass[1] = ms;
      put(0, a / 2, 0, 0, 0, vb, 0); put(1, -a / 2, 0, 0, 0, -vb, 0);
      disc(2, N0 - 2, 0.06, 2 * ms, 0.72, 1.15, 2, 0.015, 0.02);
      break;
    }
    default: {
      mass[0] = 0.5;
      put(0, 0, 0, 0, 0, 0, 0);
      disc(1, N0 - 1, 0.5, 0.5, 0.1, 1.05, 0.4, 0.02, 0.12);
    }
  }
  // centre of mass at rest at the origin
  {
    let M = 0; const c = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N0; i++) { M += mass[i]; for (let k = 0; k < 3; k++) { c[k] += mass[i] * pos[i * 3 + k]; c[3 + k] += mass[i] * vel[i * 3 + k]; } }
    for (let i = 0; i < N0; i++) for (let k = 0; k < 3; k++) { pos[i * 3 + k] -= c[k] / M; vel[i * 3 + k] -= c[3 + k] / M; }
  }
  // what the camera fits (90 % of the bodies) and the speed that reads as full brightness
  const fit = (() => {
    const r = [];
    for (let i = 0; i < N0; i++) r.push(hyp3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    r.sort((a, b) => a - b);
    return Math.max(0.2, r[Math.floor(N0 * 0.9)]);
  })();
  const vref = (() => {
    let s = 0;
    for (let i = 0; i < N0; i++) s += vel[i * 3] ** 2 + vel[i * 3 + 1] ** 2 + vel[i * 3 + 2] ** 2;
    return Math.max(0.05, Math.sqrt(s / N0));
  })();
  // the typical (median) mass reads as normal brightness
  const mref = Array.from(mass.subarray(0, N0)).sort((a, b) => a - b)[N0 >> 1];

  const accel = () => {
    acc3.fill(0, 0, n * 3);
    const e2 = p.soft * p.soft;
    for (let i = 0; i < n; i++) {
      const xi = pos[i * 3], yi = pos[i * 3 + 1], zi = pos[i * 3 + 2], mi = mass[i];
      let ax = 0, ay = 0, az = 0;
      for (let j = i + 1; j < n; j++) {
        const dx = pos[j * 3] - xi, dy = pos[j * 3 + 1] - yi, dz = pos[j * 3 + 2] - zi;
        const r2 = dx * dx + dy * dy + dz * dz + e2, inv = 1 / (r2 * Math.sqrt(r2));
        const fj = mass[j] * inv, fi = mi * inv;
        ax += dx * fj; ay += dy * fj; az += dz * fj;
        acc3[j * 3] -= dx * fi; acc3[j * 3 + 1] -= dy * fi; acc3[j * 3 + 2] -= dz * fi;
      }
      acc3[i * 3] += ax; acc3[i * 3 + 1] += ay; acc3[i * 3 + 2] += az;
    }
    const G = p.G;
    for (let i = 0; i < n * 3; i++) acc3[i] *= G;
  };
  accel();

  // ---- camera: orthographic, yaw about the system's z axis, then tilt towards the viewer
  const scale = () => (0.42 * p.zoom) / fit;
  const project = (x: number, y: number, z: number, out: number[]) => {
    const c = Math.cos(yaw), s = Math.sin(yaw), ct = Math.cos(p.tilt), st = Math.sin(p.tilt), k = scale();
    x -= camX; y -= camY; z -= camZ;
    const xr = x * c - y * s, yr = x * s + y * c;
    out[0] = xr * k; out[1] = (yr * ct + z * st) * k;
  };
  const P2 = [0, 0];
  const brightness = (i: number) => {
    if (p.view === 'velocidad') {
      const v = hyp3(vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]) / vref;
      return 0.2 + 0.8 * Math.min(1.6, v * v * 0.8);
    }
    return Math.min(3, 0.55 * Math.sqrt(mass[i] / mref));
  };

  const step1 = () => {
    const dt = p.dt;
    for (let i = 0; i < n * 3; i++) vel[i] += acc3[i] * dt * 0.5;
    for (let i = 0; i < n * 3; i++) pos[i] += vel[i] * dt;
    accel();
    for (let i = 0; i < n * 3; i++) vel[i] += acc3[i] * dt * 0.5;
    yaw += ((p.spin * Math.PI * 2) / 60) / RATE;
    {
      // mass-weighted centre of what lies within 1.5 × the fitted radius of the current centre
      let M = 0, sx = 0, sy = 0, sz = 0;
      const R2 = (1.5 * fit) ** 2;
      for (let i = 0; i < n; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const dx = x - camX, dy = y - camY, dz = z - camZ;
        if (dx * dx + dy * dy + dz * dz > R2) continue;
        M += mass[i]; sx += mass[i] * x; sy += mass[i] * y; sz += mass[i] * z;
      }
      if (M > 0) { camX += (sx / M - camX) * 0.05; camY += (sy / M - camY) * 0.05; camZ += (sz / M - camZ) * 0.05; }
    }
    // trail: fades with «Estela»'s time constant, each body leaves its mark where the camera sees it
    if (p.trail > 0.001) {
      const decay = Math.exp(-1 / RATE / (0.05 + 3 * p.trail * p.trail));
      for (let i = 0; i < trail.length; i++) trail[i] *= decay;
      for (let i = 0; i < n; i++) {
        project(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], P2);
        const fx = (P2[0] * 0.5 + 0.5) * w - 0.5, fy = (0.5 - P2[1]) * h - 0.5;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
        const tx = fx - x0, ty = fy - y0, a = 0.08 * Math.min(1.5, brightness(i)), o = y0 * w + x0;
        trail[o] += a * (1 - tx) * (1 - ty); trail[o + 1] += a * tx * (1 - ty);
        trail[o + w] += a * (1 - tx) * ty; trail[o + w + 1] += a * tx * ty;
      }
    } else trail.fill(0);
    steps++;
  };

  const acc = new Accum(w, h);
  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) {
      const q = { ...read(np), n: N0, init: p.init, masses: p.masses };
      const force = q.G !== p.G || q.soft !== p.soft;
      p = q;
      if (force) accel();
    },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      const d = acc.d;
      for (let i = 0; i < d.length; i++) d[i] = 0.55 * (1 - Math.exp(-trail[i] * 1.5));
      const sg = Math.max(0.55, h / 160);
      for (let i = 0; i < n; i++) {
        project(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], P2);
        const b = brightness(i), heavy = mass[i] > mref * 20;
        acc.blob(acc.px(P2[0]), acc.py(P2[1]), heavy ? sg * 2.2 : sg, heavy ? 1.4 : 0.35 * b);
      }
      toBytes(d, out, 1.6, 1, 'log');
    },
    stroke(s: Stroke) {
      // «Añadir masa»: a heavy body at rest where you touch (on the plane through the centre facing you),
      // at most one every half second of the run and MAX_EXTRA in all
      if (n >= CAP || steps - lastAdd < RATE / 2) return;
      const k = scale(), X = s.x1 / k, Y = s.y1 / k;
      const ct = Math.cos(p.tilt), st = Math.sin(p.tilt), c = Math.cos(yaw), sn = Math.sin(yaw);
      const yr = Y * ct, z = Y * st;
      const x = X * c + yr * sn, y = -X * sn + yr * c;
      mass[n] = 0.12 * (0.5 + s.strength);
      put(n, x + camX, y + camY, z + camZ, 0, 0, 0);
      n++;
      lastAdd = steps;
      accel();
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { n, yaw, lastAdd, camX, camY, camZ };
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { pos: words(pos), vel: words(vel), acc: words(acc3), mass: words(mass), trail: trail.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a este sistema.');
      const a = s.arrays;
      const ok = (x: unknown, len: number) => x instanceof Int32Array && x.length === len;
      if (!ok(a.pos, CAP * 6) || !ok(a.vel, CAP * 6) || !ok(a.acc, CAP * 6) || !ok(a.mass, CAP * 2) || !(a.trail instanceof Float32Array) || a.trail.length !== w * h) throw new Error('El estado guardado está incompleto.');
      new Int32Array(pos.buffer).set(a.pos); new Int32Array(vel.buffer).set(a.vel); new Int32Array(acc3.buffer).set(a.acc); new Int32Array(mass.buffer).set(a.mass);
      trail.set(a.trail);
      n = Math.max(1, Math.min(CAP, Math.round(s.scalars.n ?? N0))); yaw = s.scalars.yaw ?? 0; lastAdd = s.scalars.lastAdd ?? -1e9;
      camX = s.scalars.camX ?? 0; camY = s.scalars.camY ?? 0; camZ = s.scalars.camZ ?? 0;
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
