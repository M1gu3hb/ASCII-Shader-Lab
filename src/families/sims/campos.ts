import { Accum, OrbitCamera, clamp01, toBytes } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params } from '../types';

/**
 * Field lines of static sources in 3D. Electric configurations: point charges, E = Σ q (x − xᵢ)/|x − xᵢ|³
 * (Coulomb). Magnetic ones: circular current loops, B by Biot–Savart over LOOP_SEG straight segments
 * (B = I/4π (a × r₁)/|a × r₁|² (a·r₁/|r₁| − a·r₂/|r₂|) per segment a), and point magnetic dipoles,
 * B = (3 (m·r̂) r̂ − m)/r³. Lines are traced once per configuration with RK4 along the field direction from
 * seeds around each source (a number proportional to its strength): from + charges forward to a − charge
 * or out of bounds, from − charges backward (kept only when they come from outside: the others are already
 * drawn), from the north side of each dipole and across the inside of each loop until they close.
 *
 * Each frame draws them through an orbiting camera: anti-aliased lines dimmed with depth, test particles
 * that ride along them (faster where the field is stronger), the sources, and optionally the equipotentials
 * (|B| for loops) on the plane through the centre facing the camera. The run's steps are its construction
 * state: the lines grow from their sources during the first seconds.
 */

const ID = 'campos_em', V = 1;
const LOOP_SEG = 32;
const MAX_LINES = 120;
const MAX_STEPS = 420;
const DS = 0.016;
const BOUND = 2.3;
const GROW = 0.9; // world units of line drawn per second of growth

type Kind = 'e' | 'loop' | 'dip';
interface Source { kind: Kind; x: number; y: number; z: number; s: number }

export interface FieldLine {
  /** Points (x, y, z), every second integration step. */
  p: Float32Array;
  /** Cumulative travel time of a test particle to each point (field-strength dependent). */
  tau: Float32Array;
  /** Arc length at each point. */
  arc: Float32Array;
  n: number;
  /** How it ends: 0 at a sink (a − charge, or closing on itself), 1 out of bounds, 2 out of steps. */
  end: number;
}

export interface FieldConfig { sources: Source[]; kind: 'e' | 'b'; lines: FieldLine[] }

const read = (p: Params) => ({
  config: String(p.config ?? 'dipolo'),
  sep: Number(p.sep ?? 1),
  ratio: Number(p.ratio ?? 1),
  lines: Math.max(2, Math.min(24, Math.round(Number(p.lines ?? 12)))),
  particles: Math.max(0, Math.min(8, Math.round(Number(p.particles ?? 3)))),
  turn: Number(p.turn ?? 0.2),
  tilt: Number(p.tilt ?? 20),
  view: String(p.view ?? 'lineas'),
});

/** The configuration's sources: two of them at `sep`, the second `ratio` times the first. */
export function sourcesOf(config: string, sep: number, ratio: number): Source[] {
  const a = -sep * ratio / (1 + ratio), b = sep / (1 + ratio);
  switch (config) {
    case 'cuadrupolo': {
      const h = sep / 2;
      return [
        { kind: 'e', x: -h, y: -h, z: 0, s: 1 }, { kind: 'e', x: h, y: h, z: 0, s: 1 },
        { kind: 'e', x: h, y: -h, z: 0, s: -ratio }, { kind: 'e', x: -h, y: h, z: 0, s: -ratio },
      ];
    }
    case 'iguales': return [{ kind: 'e', x: a, y: 0, z: 0, s: 1 }, { kind: 'e', x: b, y: 0, z: 0, s: ratio }];
    case 'espira': return [{ kind: 'loop', x: 0, y: a, z: 0, s: 1 }, { kind: 'loop', x: 0, y: b, z: 0, s: ratio }];
    case 'iman': return [{ kind: 'dip', x: a, y: 0, z: 0, s: 1 }, { kind: 'dip', x: b, y: 0, z: 0, s: ratio }];
    default: return [{ kind: 'e', x: a, y: 0, z: 0, s: 1 }, { kind: 'e', x: b, y: 0, z: 0, s: -ratio }];
  }
}

const LOOP_R = 0.45;
const F = new Float64Array(3);

/**
 * The field at (x, y, z): E for charges, B for loops (axis y) and dipoles (moment along y). Returns a
 * shared buffer, overwritten by the next call.
 */
export function field(src: Source[], x: number, y: number, z: number): Float64Array {
  let fx = 0, fy = 0, fz = 0;
  for (const s of src) {
    if (Math.abs(s.s) < 1e-6) continue;
    const rx = x - s.x, ry = y - s.y, rz = z - s.z;
    if (s.kind === 'e') {
      const r2 = rx * rx + ry * ry + rz * rz + 1e-9, k = s.s / (r2 * Math.sqrt(r2));
      fx += rx * k; fy += ry * k; fz += rz * k;
    } else if (s.kind === 'dip') {
      const r2 = rx * rx + ry * ry + rz * rz + 1e-9, r = Math.sqrt(r2), r5 = r2 * r2 * r;
      // m = (0, s, 0): (3 (m·r) r − m r²) / r⁵
      const mr = s.s * ry;
      fx += 3 * mr * rx / r5; fy += (3 * mr * ry - s.s * r2) / r5; fz += 3 * mr * rz / r5;
    } else {
      // Biot–Savart over the loop's segments (current s, counter-clockwise seen from +y)
      for (let i = 0; i < LOOP_SEG; i++) {
        const a0 = (i / LOOP_SEG) * Math.PI * 2, a1 = ((i + 1) / LOOP_SEG) * Math.PI * 2;
        const ax = s.x + LOOP_R * Math.cos(a0), az = s.z - LOOP_R * Math.sin(a0);
        const bx = s.x + LOOP_R * Math.cos(a1), bz = s.z - LOOP_R * Math.sin(a1);
        const sx = bx - ax, sz = bz - az;
        const r1x = x - ax, r1y = y - s.y, r1z = z - az, r2x = x - bx, r2y = y - s.y, r2z = z - bz;
        // a × r1 with a = (sx, 0, sz)
        const cx = -sz * r1y, cy = sz * r1x - sx * r1z, cz = sx * r1y;
        const c2 = cx * cx + cy * cy + cz * cz + 1e-9;
        const l1 = Math.sqrt(r1x * r1x + r1y * r1y + r1z * r1z) + 1e-9, l2 = Math.sqrt(r2x * r2x + r2y * r2y + r2z * r2z) + 1e-9;
        const k = (s.s / (4 * Math.PI)) * ((sx * r1x + sz * r1z) / l1 - (sx * r2x + sz * r2z) / l2) / c2;
        fx += cx * k; fy += cy * k; fz += cz * k;
      }
    }
  }
  F[0] = fx; F[1] = fy; F[2] = fz;
  return F;
}

/** Unit field direction (times dir) into F; returns |field|. */
function dirAt(src: Source[], x: number, y: number, z: number, dir: number): number {
  field(src, x, y, z);
  const m = Math.hypot(F[0], F[1], F[2]);
  const k = m > 1e-12 ? dir / m : 0;
  F[0] *= k; F[1] *= k; F[2] *= k;
  return m;
}

/**
 * Traces one line from (x, y, z) along dir·field with RK4 steps of DS: stops near a sink (a charge of the
 * opposite sign to the line's direction, a dipole or a loop's wire), on closing near `close` (magnetic
 * lines), out of BOUND or out of steps.
 */
function traceLine(src: Source[], x: number, y: number, z: number, dir: number, close: boolean): { pts: number[]; mags: number[]; end: number } {
  const pts = [x, y, z], mags: number[] = [];
  const x0 = x, y0 = y, z0 = z;
  let end = 2, travelled = 0;
  mags.push(dirAt(src, x, y, z, dir));
  for (let i = 0; i < MAX_STEPS; i++) {
    dirAt(src, x, y, z, dir); const k1x = F[0], k1y = F[1], k1z = F[2];
    dirAt(src, x + 0.5 * DS * k1x, y + 0.5 * DS * k1y, z + 0.5 * DS * k1z, dir); const k2x = F[0], k2y = F[1], k2z = F[2];
    dirAt(src, x + 0.5 * DS * k2x, y + 0.5 * DS * k2y, z + 0.5 * DS * k2z, dir); const k3x = F[0], k3y = F[1], k3z = F[2];
    const m = dirAt(src, x + DS * k3x, y + DS * k3y, z + DS * k3z, dir);
    const k4x = F[0], k4y = F[1], k4z = F[2];
    if (m === 0) { end = 0; break; }
    x += (DS / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    y += (DS / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    z += (DS / 6) * (k1z + 2 * k2z + 2 * k3z + k4z);
    travelled += DS;
    if (i % 2 === 1) { pts.push(x, y, z); mags.push(m); }
    if (x * x + y * y + z * z > BOUND * BOUND) { end = 1; pts.push(x, y, z); mags.push(m); break; }
    let stop = false;
    for (const s of src) {
      const rx = x - s.x, ry = y - s.y, rz = z - s.z;
      if (s.kind === 'e') stop ||= s.s * dir < 0 && rx * rx + ry * ry + rz * rz < 0.05 * 0.05;
      else if (s.kind === 'dip') stop ||= Math.abs(s.s) > 1e-6 && travelled > 0.2 && rx * rx + ry * ry + rz * rz < 0.07 * 0.07;
      else if (Math.abs(s.s) > 1e-6) { const rr = Math.hypot(rx, rz) - LOOP_R; stop ||= rr * rr + ry * ry < 0.035 * 0.035; }
    }
    if (close && travelled > 0.3 && (x - x0) ** 2 + (y - y0) ** 2 + (z - z0) ** 2 < (DS * 1.6) ** 2) { stop = true; pts.push(x0, y0, z0); mags.push(m); }
    if (stop) { end = 0; break; }
  }
  return { pts, mags, end };
}

function pack(pts: number[], mags: number[], end: number): FieldLine {
  const n = pts.length / 3;
  const p = new Float32Array(pts), tau = new Float32Array(n), arc = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2], p[i * 3 + 2] - p[i * 3 - 1]);
    arc[i] = arc[i - 1] + d;
    // particles go faster where the field is stronger (compressed: the field spans decades)
    const v = 0.25 + 0.75 * clamp01(Math.log10(1 + (mags[i] ?? mags[mags.length - 1])) / 1.5);
    tau[i] = tau[i - 1] + d / v;
  }
  return { p, tau, arc, n, end };
}

/** Builds the lines of a configuration (deterministic from the seed: it turns the seed points). */
export function buildField(seed: string, params: Params): FieldConfig {
  const q = read(params);
  const src = sourcesOf(q.config, q.sep, q.ratio);
  const rng = new SimRng(`${ID}|${V}|${seed}`);
  const rot = rng.range(0, Math.PI * 2), tiltS = rng.range(-0.4, 0.4);
  const lines: FieldLine[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const add = (l: FieldLine) => { if (lines.length < MAX_LINES && l.n > 1) lines.push(l); };
  const magnetic = src[0].kind !== 'e';
  for (const s of src) {
    if (Math.abs(s.s) < 0.02) continue;
    const n = Math.min(48, Math.max(1, Math.round(q.lines * Math.abs(s.s))));
    if (s.kind === 'e' || s.kind === 'dip') {
      // seeds on a small sphere, turned by the seed: charges all round it (Fibonacci, equal flux each);
      // dipoles on the north cap, equal flux steps (uniform in sin²θ) among the loops that fit the view
      // (a dipole line is r = C sin²θ: C from 0.3 to BOUND)
      const r0 = s.kind === 'e' ? 0.06 : 0.08;
      for (let j = 0; j < n; j++) {
        let zz: number;
        if (s.kind === 'e') zz = 1 - (2 * (j + 0.5)) / n;
        else { const s2 = r0 / BOUND + (r0 / 0.3 - r0 / BOUND) * (j + 0.5) / n; zz = Math.sqrt(1 - s2); }
        const rr = Math.sqrt(Math.max(0, 1 - zz * zz)), a = j * golden + rot;
        // the sphere's pole along y (the dipole's axis), slightly tipped by the seed for charges
        const ux = rr * Math.cos(a);
        let uy = zz, uz = rr * Math.sin(a);
        if (s.kind === 'e') { const c = Math.cos(tiltS), si = Math.sin(tiltS); const t1 = c * uy - si * uz; uz = si * uy + c * uz; uy = t1; }
        const sx = s.x + ux * r0, sy = s.y + uy * r0 * Math.sign(s.s || 1), sz = s.z + uz * r0;
        if (s.kind === 'e') {
          const dir = s.s > 0 ? 1 : -1;
          const tr = traceLine(src, sx, sy, sz, dir, false);
          if (dir > 0) add(pack(tr.pts, tr.mags, tr.end));
          else if (tr.end !== 0) {
            // from a − charge backward: only lines that come from outside (the rest start at a + charge)
            const pts: number[] = [], mags: number[] = [];
            for (let i = tr.pts.length / 3 - 1; i >= 0; i--) { pts.push(tr.pts[i * 3], tr.pts[i * 3 + 1], tr.pts[i * 3 + 2]); mags.push(tr.mags[i] ?? 0); }
            add(pack(pts, mags, 0));
          }
        } else {
          const tr = traceLine(src, sx, sy, sz, Math.sign(s.s), false);
          add(pack(tr.pts, tr.mags, tr.end));
        }
      }
    } else {
      // loops: seeds across the inside of the loop (sunflower), traced until they close; the open ones
      // (along the axis) also backward, and joined
      for (let j = 0; j < n; j++) {
        const rr = LOOP_R * 0.9 * Math.sqrt((j + 0.5) / n), a = j * golden + rot;
        const sx = s.x + rr * Math.cos(a), sy = s.y, sz = s.z + rr * Math.sin(a);
        const fwd = traceLine(src, sx, sy, sz, Math.sign(s.s), true);
        if (fwd.end === 0) { add(pack(fwd.pts, fwd.mags, 0)); continue; }
        const back = traceLine(src, sx, sy, sz, -Math.sign(s.s), true);
        const pts: number[] = [], mags: number[] = [];
        for (let i = back.pts.length / 3 - 1; i >= 1; i--) { pts.push(back.pts[i * 3], back.pts[i * 3 + 1], back.pts[i * 3 + 2]); mags.push(back.mags[i] ?? 0); }
        for (let i = 0; i < fwd.pts.length / 3; i++) { pts.push(fwd.pts[i * 3], fwd.pts[i * 3 + 1], fwd.pts[i * 3 + 2]); mags.push(fwd.mags[i] ?? 0); }
        add(pack(pts, mags, fwd.end));
      }
    }
  }
  return { sources: src, kind: magnetic ? 'b' : 'e', lines };
}

/** Potential on the drawing's plane: Σ q/r (charges), Σ m·r/r³ (dipoles), log |B| (loops). */
function potential(src: Source[], x: number, y: number, z: number): number {
  let v = 0;
  for (const s of src) {
    const rx = x - s.x, ry = y - s.y, rz = z - s.z, r2 = rx * rx + ry * ry + rz * rz + 1e-4;
    if (s.kind === 'e') v += s.s / Math.sqrt(r2);
    else if (s.kind === 'dip') v += s.s * ry / (r2 * Math.sqrt(r2));
  }
  if (src[0].kind === 'loop') { field(src, x, y, z); v = Math.log(1e-3 + Math.hypot(F[0], F[1], F[2])) * 1.4; }
  return v;
}

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  let p = read(cfg.params);
  const g = buildField(cfg.seed, cfg.params);
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}|fase`);
  const phase = g.lines.map(() => rng.next());
  const acc = new Accum(w, h);
  const cam = new OrbitCamera();
  const P = new Float64Array(3), Q = new Float64Array(3);
  const Z = 2.4, DIST = 3.4;
  // the potential's bands are smooth: a coarse grid (at most 96 × 48) upsampled
  const bw = Math.min(96, Math.ceil(w / 2)), bh = Math.ceil(bw / 2), back = new Float32Array(bw * bh);
  let steps = 0;
  const rate = 30;
  const toPix = (o: Float64Array) => { o[0] = acc.px(o[0] * Z); o[1] = acc.py(o[1] * Z); };
  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = read(np); },
    step(k: number) { steps += k; },
    render(out: Uint8Array, t: number) {
      acc.clear();
      const yaw = (t * p.turn * Math.PI * 2) / 60, pitch = (p.tilt * Math.PI) / 180;
      cam.set(yaw, pitch, DIST);
      const lw = Math.max(1.5, 2.4 * (h / 96));
      const front = (steps / rate) * GROW;
      const view = p.view;
      if (view === 'potencial') {
        // the plane through the centre facing the camera
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
        const kk = (cam.fov / DIST) * 0.5 * Z;
        for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
          const X = (((i + 0.5) / bw) * 2 - 1) / kk, Y = (0.5 - (j + 0.5) / bh) / kk;
          // inverse of the camera's turn: (x1, y2, z2 = 0) back to the world
          const y = cx * Y, z1 = -sx * Y;
          const x = cy * X - sy * z1, z = sy * X + cy * z1;
          const v = potential(g.sources, x, y, z);
          const vs = Math.sign(v) * Math.log(1 + Math.abs(v) * 3);
          back[j * bw + i] = 0.07 + 0.17 * (0.5 + 0.5 * Math.cos(vs * Math.PI * 2 * 1.3));
        }
        const d = acc.d;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const fx = Math.min(bw - 1, Math.max(0, ((x + 0.5) * bw) / w - 0.5)), fy = Math.min(bh - 1, Math.max(0, ((y + 0.5) * bh) / h - 0.5));
          const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(bw - 1, x0 + 1), y1 = Math.min(bh - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
          const top = back[y0 * bw + x0] * (1 - ax) + back[y0 * bw + x1] * ax, bot = back[y1 * bw + x0] * (1 - ax) + back[y1 * bw + x1] * ax;
          d[y * w + x] = top * (1 - ay) + bot * ay;
        }
      }
      const lineAmt = view === 'flujo' ? 0.35 : view === 'potencial' ? 0.6 : 1;
      // lines, dimmed with depth (near 1, far 0.4)
      const depthK = (dd: number) => 1 - 0.6 * clamp01((dd - (DIST - 1.6)) / 3.2);
      for (let li = 0; li < g.lines.length; li++) {
        const L = g.lines[li];
        for (let i = 1; i < L.n; i++) {
          if (L.arc[i - 1] > front) break;
          if (!cam.project(L.p[i * 3 - 3], L.p[i * 3 - 2], L.p[i * 3 - 1], P)) continue;
          if (!cam.project(L.p[i * 3], L.p[i * 3 + 1], L.p[i * 3 + 2], Q)) continue;
          const dk = depthK((P[2] + Q[2]) * 0.5);
          toPix(P); toPix(Q);
          acc.line(P[0], P[1], Q[0], Q[1], lw, lineAmt * dk);
        }
      }
      // test particles riding the grown part of each line
      if (p.particles > 0) {
        const big = view === 'flujo';
        for (let li = 0; li < g.lines.length; li++) {
          const L = g.lines[li];
          const tot = L.tau[L.n - 1];
          if (tot <= 0) continue;
          for (let j = 0; j < p.particles; j++) {
            const ph = (j + phase[li]) / p.particles + (t * 0.35) / Math.max(0.5, tot);
            const target = (ph - Math.floor(ph)) * tot;
            // binary search on tau
            let lo = 0, hi = L.n - 1;
            while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L.tau[m] <= target) lo = m; else hi = m; }
            if (L.arc[lo] > front) continue;
            const f = (target - L.tau[lo]) / Math.max(1e-9, L.tau[hi] - L.tau[lo]);
            const x = L.p[lo * 3] + (L.p[hi * 3] - L.p[lo * 3]) * f, y = L.p[lo * 3 + 1] + (L.p[hi * 3 + 1] - L.p[lo * 3 + 1]) * f, z = L.p[lo * 3 + 2] + (L.p[hi * 3 + 2] - L.p[lo * 3 + 2]) * f;
            if (!cam.project(x, y, z, P)) continue;
            const dk = depthK(P[2]);
            toPix(P);
            acc.blob(P[0], P[1], (big ? 1.9 : 1.4) * (h / 96), (big ? 1.2 : 0.9) * dk);
          }
        }
      }
      // the sources: charges as discs (+ full, − a ring), loops as rings, dipoles as short bars
      for (const s of g.sources) {
        if (Math.abs(s.s) < 0.02) continue;
        if (s.kind === 'e') {
          if (!cam.project(s.x, s.y, s.z, P)) continue;
          toPix(P);
          const r = (2.2 + 1.2 * Math.min(2, Math.abs(s.s))) * (h / 96);
          acc.splat(P[0], P[1], r, s.s > 0 ? 1 : 0.6);
          if (s.s < 0) acc.splat(P[0], P[1], r * 0.45, -0.45);
        } else if (s.kind === 'loop') {
          for (let i = 0; i < 48; i++) {
            const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2;
            if (!cam.project(s.x + LOOP_R * Math.cos(a0), s.y, s.z - LOOP_R * Math.sin(a0), P)) continue;
            if (!cam.project(s.x + LOOP_R * Math.cos(a1), s.y, s.z - LOOP_R * Math.sin(a1), Q)) continue;
            const dk = depthK((P[2] + Q[2]) * 0.5);
            toPix(P); toPix(Q);
            acc.line(P[0], P[1], Q[0], Q[1], lw * 1.8, dk);
          }
        } else {
          if (!cam.project(s.x, s.y - 0.12, s.z, P) || !cam.project(s.x, s.y + 0.12, s.z, Q)) continue;
          toPix(P); toPix(Q);
          acc.line(P[0], P[1], Q[0], Q[1], lw * 2.6, 1);
        }
      }
      toBytes(acc.d, out, 1, 1);
    },
    snapshot(): ModelState { return { id: ID, v: V, steps, res: h, scalars: {}, arrays: {} }; },
    restore(s: ModelState) {
      if (s.id !== ID) throw new Error('El estado guardado no corresponde a estas líneas de campo.');
      steps = s.steps;
    },
  };
}
