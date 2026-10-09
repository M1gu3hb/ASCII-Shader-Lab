import { OrbitCamera } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Cloth by XPBD (extended position-based dynamics, Macklin, Müller and Chentanez 2016; "small steps",
 * Macklin et al. 2019), written from the papers: a grid of particles joined by distance constraints —
 * structural (neighbours), shear (one diagonal per quad) and bending (two apart) — each with a compliance
 * α (inverse stiffness). Every step is split into substeps of length h; each substep predicts positions
 * from the velocities (gravity, wind), solves every constraint once (Δλ = −C / (w_i + w_j + α/h²)),
 * resolves the sphere and the floor, and takes the new velocities from the displacement. Wind pushes each
 * particle along its area-weighted normal (relative to its own velocity), with gusts from seeded noise.
 * The picture: shaded triangles (Lambert, both faces) through a perspective camera that orbits slowly
 * (its angle is part of the state, so a touch maps to the cloth as you see it), with a depth buffer.
 * Soft bodies (a closed shape held by pressure) are not modelled yet: only sheets.
 */

const ID = 'tela', V = 1;
const hyp = (x: number, y: number) => Math.sqrt(x * x + y * y);
const hyp3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
const RATE = 30, DT = 1 / RATE;
const MESHES: Record<string, [number, number]> = { baja: [24, 16], media: [36, 24], alta: [48, 32] };
const SIZE_W = 1.6, SIZE_H = 1.0;
const FLOOR = -0.62;
/** Skin drag along the surface, relative to the pressure along the normal. */
const SKIN = 0.3;

interface P { stiff: number; gravity: number; wind: number; anchors: string; mesh: string; substeps: number; damping: number; turn: number; sphere: string; view: string }
const read = (p: Params): P => ({
  stiff: Number(p.stiff ?? 0.6), gravity: Number(p.gravity ?? 1), wind: Number(p.wind ?? 0.5),
  anchors: String(p.anchors ?? 'borde'), mesh: String(p.mesh ?? 'baja'),
  substeps: Math.max(1, Math.min(24, Math.round(Number(p.substeps ?? 6)))), damping: Number(p.damping ?? 0.2),
  turn: Number(p.turn ?? 0.1), sphere: String(p.sphere ?? 'ninguna'), view: String(p.view ?? 'sombreado'),
});

/** Whether a layout hangs from above (vertical cloth) or lies flat (horizontal). */
const hangs = (a: string) => a === 'borde' || a === 'esquinas' || a === 'mastil';

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  const [nx, ny] = MESHES[p.mesh] ?? MESHES.media;
  const np = nx * ny;
  const X = new Float32Array(np * 3), Vel = new Float32Array(np * 3), Prev = new Float32Array(np * 3), W = new Float32Array(np);
  let steps = 0, yaw = 0;
  const vertical = hangs(p.anchors);

  // ---- the grid at rest: vertical (xy) for hanging layouts, horizontal (xz) for the others
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, u = i / (nx - 1) - 0.5, v = j / (ny - 1);
    if (vertical) { X[k * 3] = u * SIZE_W; X[k * 3 + 1] = 0.5 - v * SIZE_H; X[k * 3 + 2] = 0; }
    else { X[k * 3] = u * SIZE_W; X[k * 3 + 1] = p.anchors === 'cuatro' ? 0.12 : 0.32; X[k * 3 + 2] = (v - 0.5) * SIZE_H; }
  }
  const idx = (i: number, j: number) => j * nx + i;
  // inverse masses: total mass 1, pinned particles 0
  W.fill(np);
  const pin = (k: number) => { W[k] = 0; };
  switch (p.anchors) {
    case 'borde': for (let i = 0; i < nx; i++) pin(idx(i, 0)); break;
    case 'esquinas': pin(idx(0, 0)); pin(idx(nx - 1, 0)); break;
    case 'mastil': for (let j = 0; j < ny; j++) pin(idx(0, j)); break;
    case 'cuatro': pin(idx(0, 0)); pin(idx(nx - 1, 0)); pin(idx(0, ny - 1)); pin(idx(nx - 1, ny - 1)); break;
    case 'centro': pin(idx(nx >> 1, ny >> 1)); break;
    default: break;
  }

  // ---- constraints: pairs, rest lengths and kind (0 stretch, 1 shear, 2 bending)
  const cons: number[] = [], kinds: number[] = [];
  const add = (a: number, b: number, kind: number) => { cons.push(a, b); kinds.push(kind); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i + 1 < nx) add(idx(i, j), idx(i + 1, j), 0);
    if (j + 1 < ny) add(idx(i, j), idx(i, j + 1), 0);
    // shear: the diagonal of each quad that its two triangles share (alternating, so the grid has no
    // preferred direction); both diagonals would over-constrain the sheet and make it jitter
    if (i + 1 < nx && j + 1 < ny) { if ((i + j) & 1) add(idx(i + 1, j), idx(i, j + 1), 1); else add(idx(i, j), idx(i + 1, j + 1), 1); }
    if (i + 2 < nx) add(idx(i, j), idx(i + 2, j), 2);
    if (j + 2 < ny) add(idx(i, j), idx(i, j + 2), 2);
  }
  const nc = kinds.length;
  const C = new Int32Array(cons), K = new Uint8Array(kinds), L = new Float32Array(nc);
  for (let c = 0; c < nc; c++) {
    const a = C[c * 2] * 3, b = C[c * 2 + 1] * 3;
    L[c] = hyp3(X[a] - X[b], X[a + 1] - X[b + 1], X[a + 2] - X[b + 2]);
  }
  // rest shape flat; a faint, smooth seeded ripple across the sheet breaks the symmetry (smooth: a
  // particle-by-particle zig-zag is a mode distance constraints barely resist)
  {
    const f1 = rng.range(1, 2.5), f2 = rng.range(1, 2.5), p1 = rng.next() * 6.283, p2 = rng.next() * 6.283;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = idx(i, j);
      if (W[k] > 0) X[k * 3 + (vertical ? 2 : 1)] += 0.006 * Math.sin((i / (nx - 1)) * f1 * 6.283 + p1) * Math.sin((j / (ny - 1)) * f2 * 3.1416 + p2);
    }
  }
  // triangles of the grid (two per quad)
  const ntri = (nx - 1) * (ny - 1) * 2, T = new Int32Array(ntri * 3);
  for (let j = 0, t = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = idx(i, j), b = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1);
    if ((i + j) & 1) { T[t++] = a; T[t++] = b; T[t++] = c; T[t++] = b; T[t++] = d; T[t++] = c; }
    else { T[t++] = a; T[t++] = d; T[t++] = c; T[t++] = a; T[t++] = b; T[t++] = d; }
  }

  // gusts: smooth value noise over time from a seeded table
  const NOISE = new Float32Array(256);
  for (let i = 0; i < 256; i++) NOISE[i] = rng.next() * 2 - 1;
  const noise = (t: number) => {
    const i = Math.floor(t), f = t - i, a = NOISE[i & 255], b = NOISE[(i + 1) & 255];
    return a + (b - a) * f * f * (3 - 2 * f);
  };

  /** Sphere collider at simulated time t: centre and radius (none: r = 0). */
  const sphere = (t: number, out: number[]) => {
    if (p.sphere === 'ninguna') { out[3] = 0; return; }
    const r = 0.28;
    if (vertical) { out[0] = 0.1; out[1] = -0.05; out[2] = 0.32; }
    else { out[0] = 0; out[1] = p.anchors === 'cuatro' ? -0.2 : -0.22; out[2] = 0; }
    if (p.sphere === 'rebota') {
      // up and down every 2.4 s: it pushes the cloth and lets it fall back
      const ph = 0.5 - 0.5 * Math.cos((t * Math.PI * 2) / 2.4);
      if (vertical) out[2] += -0.42 + 0.5 * ph; else out[1] += -0.32 + 0.45 * ph;
    }
    out[3] = r;
  };
  const SP = [0, 0, 0, 0];

  const F = new Float32Array(np * 3), NV = new Float32Array(np * 3);
  /** Area-weighted vertex normals (twice the area of the triangles around each particle). */
  const normals = () => {
    NV.fill(0);
    for (let q = 0; q < ntri; q++) {
      const a = T[q * 3] * 3, b = T[q * 3 + 1] * 3, c = T[q * 3 + 2] * 3;
      const e1x = X[b] - X[a], e1y = X[b + 1] - X[a + 1], e1z = X[b + 2] - X[a + 2];
      const e2x = X[c] - X[a], e2y = X[c + 1] - X[a + 1], e2z = X[c + 2] - X[a + 2];
      const nxv = e1y * e2z - e1z * e2y, nyv = e1z * e2x - e1x * e2z, nzv = e1x * e2y - e1y * e2x;
      NV[a] += nxv; NV[a + 1] += nyv; NV[a + 2] += nzv; NV[b] += nxv; NV[b + 1] += nyv; NV[b + 2] += nzv; NV[c] += nxv; NV[c + 1] += nyv; NV[c + 2] += nzv;
    }
  };
  const step1 = () => {
    const t = steps * DT, S = p.substeps, hs = DT / S;
    // compliance from «Rigidez» (log scale); shear and bending are softer than stretching
    const alpha = Math.pow(10, -1 - 6 * p.stiff), ih2 = 1 / (hs * hs);
    const comp = [alpha * ih2, (alpha * 8 + 1e-6) * ih2, (alpha * 40 + 1e-5) * ih2];
    const g = -9.8 * 0.35 * p.gravity;
    // wind: F = ((w_rel · n) n + c_t w_rel,tangential) · area
    F.fill(0);
    if (p.wind > 0) {
      const gust = 0.65 + 0.35 * noise(t * 0.8) + 0.25 * noise(t * 2.3 + 31);
      const ang = 0.5 * noise(t * 0.25 + 77);
      let dx: number, dz: number;
      if (p.anchors === 'mastil') { dx = Math.cos(ang); dz = Math.sin(ang) * 0.6; }
      else { dx = Math.sin(ang) * 0.6 + 0.25; dz = Math.cos(ang); }
      const s = p.wind * 3.2 * gust, wxv = dx * s, wyv = (vertical ? 0 : 0.6) * s * (0.5 + 0.5 * noise(t * 1.1 + 5)), wzv = dz * s;
      // per particle, with its area-weighted normal (smoother than each triangle's own, so the wind does
      // not feed a zig-zag at the scale of the grid): pressure along the normal plus a little skin drag
      // along the surface (what lifts a flag that lies in the wind)
      normals();
      for (let k = 0; k < np; k++) {
        const o = k * 3, nxv = NV[o], nyv = NV[o + 1], nzv = NV[o + 2], n2 = hyp3(nxv, nyv, nzv);
        if (n2 < 1e-12) continue;
        const ux = nxv / n2, uy = nyv / n2, uz = nzv / n2, area = n2 / 6;
        const rx = wxv - Vel[o], ry = wyv - Vel[o + 1], rz = wzv - Vel[o + 2], rn = rx * ux + ry * uy + rz * uz;
        F[o] = area * (rn * ux + SKIN * (rx - rn * ux)); F[o + 1] = area * (rn * uy + SKIN * (ry - rn * uy)); F[o + 2] = area * (rn * uz + SKIN * (rz - rn * uz));
      }
    }
    const damp = Math.exp(-p.damping * 3 * hs);
    for (let sub = 0; sub < S; sub++) {
      sphere(t + sub * hs, SP);
      for (let k = 0; k < np; k++) {
        const o = k * 3;
        Prev[o] = X[o]; Prev[o + 1] = X[o + 1]; Prev[o + 2] = X[o + 2];
        if (W[k] === 0) continue;
        const wk = W[k];
        Vel[o] += F[o] * wk * hs; Vel[o + 1] += (g + F[o + 1] * wk) * hs; Vel[o + 2] += F[o + 2] * wk * hs;
        X[o] += Vel[o] * hs; X[o + 1] += Vel[o + 1] * hs; X[o + 2] += Vel[o + 2] * hs;
      }
      // one Gauss–Seidel sweep over the constraints, always in the same order (alternating the direction
      // feeds a growing in-plane mode on a stiff, over-constrained grid)
      for (let c = 0; c < nc; c++) {
        const i = C[c * 2], j = C[c * 2 + 1], wi = W[i], wj = W[j];
        const ws = wi + wj;
        if (ws === 0) continue;
        const a = i * 3, b = j * 3;
        const dx = X[a] - X[b], dy = X[a + 1] - X[b + 1], dz = X[a + 2] - X[b + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-9) continue;
        const dl = -(d - L[c]) / (ws + comp[K[c]]) / d;
        X[a] += wi * dl * dx; X[a + 1] += wi * dl * dy; X[a + 2] += wi * dl * dz;
        X[b] -= wj * dl * dx; X[b + 1] -= wj * dl * dy; X[b + 2] -= wj * dl * dz;
      }
      // collisions: the sphere (with a thin skin) and the floor (with friction)
      const R = SP[3] + 0.015;
      for (let k = 0; k < np; k++) {
        if (W[k] === 0) continue;
        const o = k * 3;
        if (SP[3] > 0) {
          const dx = X[o] - SP[0], dy = X[o + 1] - SP[1], dz = X[o + 2] - SP[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < R && d > 1e-9) { const s = R / d; X[o] = SP[0] + dx * s; X[o + 1] = SP[1] + dy * s; X[o + 2] = SP[2] + dz * s; }
        }
        if (X[o + 1] < FLOOR) { X[o + 1] = FLOOR; X[o] = Prev[o] + (X[o] - Prev[o]) * 0.3; X[o + 2] = Prev[o + 2] + (X[o + 2] - Prev[o + 2]) * 0.3; }
      }
      for (let k = 0; k < np; k++) {
        if (W[k] === 0) continue;
        const o = k * 3;
        Vel[o] = ((X[o] - Prev[o]) / hs) * damp; Vel[o + 1] = ((X[o + 1] - Prev[o + 1]) / hs) * damp; Vel[o + 2] = ((X[o + 2] - Prev[o + 2]) / hs) * damp;
      }
    }
    yaw += ((p.turn * Math.PI * 2) / 60) / RATE;
    steps++;
  };

  // ---- camera and raster
  const cam = new OrbitCamera();
  const pitch = () => (vertical ? 0.16 : 0.62);
  const baseYaw = vertical ? (p.anchors === 'mastil' ? 0.3 : 0.35) : 0.4;
  const setCam = () => { cam.fov = 4.6; cam.set(baseYaw + yaw, pitch(), 3.4); };
  const SX = new Float32Array(np), SY = new Float32Array(np), SZ = new Float32Array(np);
  const zbuf = new Float32Array(w * h), img = new Float32Array(w * h);
  const P3 = new Float64Array(3);
  // flat layouts sit low in their box: the view lifts them a little
  const lift = vertical ? 0 : 0.1;
  const projectAll = () => {
    setCam();
    for (let k = 0; k < np; k++) {
      if (cam.project(X[k * 3], X[k * 3 + 1] + lift, X[k * 3 + 2], P3)) { SX[k] = (P3[0] * 0.5 + 0.5) * w; SY[k] = (0.5 - P3[1]) * h; SZ[k] = P3[2]; }
      else { SX[k] = NaN; SY[k] = NaN; SZ[k] = 1e9; }
    }
  };
  // light in camera space: from the upper left and the viewer's side
  const LX = -0.55, LY = 0.55, LZ = 0.63;

  const fillTri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, v: number) => {
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (!(Math.abs(area) > 1e-9)) return;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
    const ia = 1 / area;
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const l0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * ia;
        const l1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * ia;
        const l2 = 1 - l0 - l1;
        if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
        const z = l0 * az + l1 * bz + l2 * cz, i = y * w + x;
        if (z < zbuf[i]) { zbuf[i] = z; img[i] = v; }
      }
    }
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np2: Params) { p = { ...read(np2), anchors: p.anchors, mesh: p.mesh }; },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      projectAll();
      zbuf.fill(1e9); img.fill(0);
      const cyw = Math.cos(baseYaw + yaw), syw = Math.sin(baseYaw + yaw), cp = Math.cos(pitch()), sp = Math.sin(pitch());
      // camera basis in world coordinates
      const Rx = cyw, Rz = syw;
      const Ux = sp * syw, Uy = cp, Uz = -sp * cyw;
      const Tx = -cp * syw, Ty = sp, Tz = cp * cyw;
      const shade = p.view !== 'malla';
      if (shade) {
        normals();
        for (let q = 0; q < ntri; q++) {
          const a = T[q * 3], b = T[q * 3 + 1], c = T[q * 3 + 2];
          if (Number.isNaN(SX[a] + SX[b] + SX[c])) continue;
          // the triangle's shade from its corners' smoothed normals
          const A = a * 3, B = b * 3, Cc = c * 3;
          let nxv = NV[A] + NV[B] + NV[Cc], nyv = NV[A + 1] + NV[B + 1] + NV[Cc + 1], nzv = NV[A + 2] + NV[B + 2] + NV[Cc + 2];
          const nl = hyp3(nxv, nyv, nzv) || 1;
          nxv /= nl; nyv /= nl; nzv /= nl;
          // normal in camera space, turned towards the viewer (both faces lit)
          let cx = nxv * Rx + nzv * Rz, cy = nxv * Ux + nyv * Uy + nzv * Uz, cz = nxv * Tx + nyv * Ty + nzv * Tz;
          const back = cz < 0;
          if (back) { cx = -cx; cy = -cy; cz = -cz; }
          const lam = Math.max(0, cx * LX + cy * LY + cz * LZ);
          const v = (0.14 + 0.86 * Math.pow(lam, 1.4)) * (back ? 0.85 : 1);
          fillTri(SX[a], SY[a], SZ[a], SX[b], SY[b], SZ[b], SX[c], SY[c], SZ[c], v);
        }
      }
      // the sphere: a lit disc in the depth buffer
      sphere(steps * DT, SP);
      if (SP[3] > 0 && cam.project(SP[0], SP[1] + lift, SP[2], P3)) {
        const cxp = (P3[0] * 0.5 + 0.5) * w, cyp = (0.5 - P3[1]) * h, rp = (SP[3] * cam.fov) / P3[2] * 0.5 * h;
        for (let y = Math.max(0, Math.floor(cyp - rp)); y <= Math.min(h - 1, Math.ceil(cyp + rp)); y++) {
          for (let x = Math.max(0, Math.floor(cxp - rp)); x <= Math.min(w - 1, Math.ceil(cxp + rp)); x++) {
            const u = (x + 0.5 - cxp) / rp, v = -(y + 0.5 - cyp) / rp, r2 = u * u + v * v;
            if (r2 > 1) continue;
            const nz = Math.sqrt(1 - r2), z = P3[2] - nz * SP[3], i = y * w + x;
            if (z < zbuf[i]) { zbuf[i] = z; img[i] = 0.08 + 0.42 * Math.max(0, u * LX + v * LY + nz * LZ); }
          }
        }
      }
      if (p.view !== 'sombreado') {
        // the mesh: structural edges, brighter in front (lines drawn over the shading)
        let zmin = Infinity, zmax = -Infinity;
        for (let k = 0; k < np; k++) if (SZ[k] < 1e8) { zmin = Math.min(zmin, SZ[k]); zmax = Math.max(zmax, SZ[k]); }
        const span = Math.max(1e-6, zmax - zmin);
        const lineTo = (a: number, b: number) => {
          if (Number.isNaN(SX[a] + SX[b])) return;
          const ax = SX[a], ay = SY[a], bx = SX[b], by = SY[b], n = Math.max(1, Math.ceil(hyp(bx - ax, by - ay) * 1.5));
          const v = 1 - 0.55 * ((SZ[a] + SZ[b]) * 0.5 - zmin) / span;
          const top = Math.min(1, v * (shade ? 1.1 : 1));
          for (let s = 0; s <= n; s++) {
            // a sample covers about one and a half pixels: its pixel, plus a softer one beside and below
            const t = s / n, fx = ax + (bx - ax) * t, fy = ay + (by - ay) * t, z = SZ[a] + (SZ[b] - SZ[a]) * t;
            for (let q = 0; q < 3; q++) {
              const x = Math.floor(fx) + (q === 1 ? 1 : 0), y = Math.floor(fy) + (q === 2 ? 1 : 0);
              if (x < 0 || y < 0 || x >= w || y >= h) continue;
              const i = y * w + x;
              // hidden by the sphere or by cloth well in front: skipped
              if (z > zbuf[i] + 0.04) continue;
              const val = q ? top * 0.55 : top;
              if (val > img[i]) img[i] = val;
            }
          }
        };
        const step = nx > 30 ? 2 : 1;
        for (let j = 0; j < ny; j += step) for (let i = 0; i + 1 < nx; i++) lineTo(idx(i, j), idx(i + 1, j));
        for (let i = 0; i < nx; i += step) for (let j = 0; j + 1 < ny; j++) lineTo(idx(i, j), idx(i, j + 1));
      }
      for (let i = 0; i < img.length; i++) { const v = img[i]; out[i] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0; }
    },
    stroke(s: Stroke) {
      // «Empujar»: the particles that appear under the touch (as the camera sees them now) move with the
      // stroke, across the screen; a touch that does not move pokes them away from you
      projectAll();
      const cyw = Math.cos(baseYaw + yaw), syw = Math.sin(baseYaw + yaw), cp = Math.cos(pitch()), sp = Math.sin(pitch());
      const mx = s.x1 - s.x0, my = s.y1 - s.y0, ml = hyp(mx, my);
      const R = Math.max(0.05, s.r), k0 = s.strength;
      const px = (s.x1 * 0.5 + 0.5) * w, py = (0.5 - s.y1) * h, Rp = R * h;
      for (let k = 0; k < np; k++) {
        if (W[k] === 0 || Number.isNaN(SX[k])) continue;
        const d = hyp(SX[k] - px, SY[k] - py);
        if (d > Rp) continue;
        const f = (1 - d / Rp) * k0, o = k * 3;
        if (ml > 1e-4) {
          const sc = Math.min(4, ml * 60) / ml * f;
          Vel[o] += (cyw * mx + sp * syw * my) * sc; Vel[o + 1] += cp * my * sc; Vel[o + 2] += (syw * mx - sp * cyw * my) * sc;
        } else {
          Vel[o] += cp * syw * 1.5 * f; Vel[o + 1] += -sp * 1.5 * f; Vel[o + 2] += -cp * cyw * 1.5 * f;
        }
      }
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { yaw };
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { x: X.slice(), v: Vel.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta tela.');
      const a = s.arrays;
      if (!(a.x instanceof Float32Array) || !(a.v instanceof Float32Array) || a.x.length !== np * 3 || a.v.length !== np * 3) throw new Error('El estado guardado está incompleto.');
      X.set(a.x); Vel.set(a.v);
      yaw = s.scalars.yaw ?? 0;
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
