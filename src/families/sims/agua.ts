import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * A pool seen from above: a height field on a grid that follows the damped wave equation (velocity form,
 * symplectic Euler: v += c²∇²h + ν∇²v, v *= 1 − damping, h += v; stable for c² ≤ 0.5; the small viscous term
 * ν∇²v takes out the short ripples the grid cannot carry), with walls and obstacles that
 * reflect (zero normal slope: a solid neighbour counts as the cell itself). Raindrops are smooth dimples
 * placed from the seed (their volume is given back evenly, so the mean level stays put). The «Oleaje» is a line source near the left wall that makes plane waves; with it,
 * both ends of the channel become beaches (sponge layers) that absorb what reaches them.
 *
 * Drawing (does not touch the state): the surface normal comes from the height gradient. The view ray, refracted
 * by Snell's law (n = 1.33), lands on a procedural tiled floor at the chosen depth. Caustics are computed by
 * forward projection: the light refracted at each cell reaches the floor displaced; 2 × 2 samples per cell
 * (displacements interpolated) splat their light there, so it gathers where the surface focuses it. A specular
 * glint (Blinn) comes from the light's direction. Views: the refracted floor with caustics, the caustics alone,
 * or the lit surface.
 */

const ID = 'agua', V = 1, RATE = 60;
const MAX_DROPS_STEP = 8, MAX_STROKE_DROPS = 48;
const ETA = 1 / 1.33;

interface P { damp: number; depth: number; rain: number; drop: number; obst: string; light: number; speed: number; paddle: number; view: string }
const read = (p: Params): P => ({
  damp: Number(p.damp ?? 0.25), depth: Number(p.depth ?? 0.5), rain: Number(p.rain ?? 4), drop: Number(p.drop ?? 1.2),
  obst: String(p.obst ?? 'ninguno'), light: Number(p.light ?? 135), speed: Number(p.speed ?? 0.5), paddle: Number(p.paddle ?? 0),
  view: String(p.view ?? 'suelo'),
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

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h, n = w * h;
  const H = new Float32Array(n), Vl = new Float32Array(n);
  const solid = new Uint8Array(n), nb = new Uint8Array(n), sponge = new Float32Array(n);
  const gx = new Float32Array(n), gy = new Float32Array(n), dxA = new Float32Array(n), dyA = new Float32Array(n);
  const caus = new Float32Array(n), tmp = new Float32Array(n), V0 = new Float32Array(n);
  // inside a rock: the offset from its centre over its radius (a dome to shade); 0 on walls
  const rockX = new Float32Array(n), rockY = new Float32Array(n);
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  let steps = 0, rainAcc = 0, phase = 0;

  // ---- obstacles from the seed: rocks (circles) or a wall with two slits
  const rocks: Array<[number, number, number]> = [];
  for (let tries = 0; rocks.length < 5 && tries < 200; tries++) {
    const x = rng.range(0.15, 0.85) * w, y = rng.range(0.2, 0.8) * h, r = rng.range(0.06, 0.1) * h;
    if (tries < 150 && rocks.some(([a, b, c]) => Math.hypot(a - x, b - y) < c + r + h * 0.1)) continue;
    rocks.push([x, y, r]);
  }
  // per tile of the floor, a seeded tone
  const tileSeed = rng.int(1 << 30);
  let built = '';
  const build = () => {
    built = `${p.obst}|${p.paddle > 0}`;
    solid.fill(0); rockX.fill(0); rockY.fill(0);
    if (p.obst === 'rocas') {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
        for (const [cx, cy, r] of rocks) {
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) >= r) continue;
          const k = y * w + x;
          solid[k] = 1; rockX[k] = (x + 0.5 - cx) / r; rockY[k] = (y + 0.5 - cy) / r;
          break;
        }
    } else if (p.obst === 'rendijas') {
      const x0 = Math.round(w * 0.4), th = Math.max(2, Math.round(h * 0.03)), half = Math.max(1.5, h * 0.035), sep = h * 0.14;
      for (let y = 0; y < h; y++) {
        const dy = Math.abs(y + 0.5 - h / 2);
        if (Math.abs(dy - sep) < half) continue;
        for (let x = x0; x < x0 + th; x++) solid[y * w + x] = 1;
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      nb[k] = solid[k] ? 0 : (x > 0 && !solid[k - 1] ? 1 : 0) | (x < w - 1 && !solid[k + 1] ? 2 : 0) | (y > 0 && !solid[k - w] ? 4 : 0) | (y < h - 1 && !solid[k + w] ? 8 : 0);
    }
    // with the paddle, both ends are beaches (a twelfth of the width each) that absorb the waves
    sponge.fill(0);
    if (p.paddle > 0) {
      const bw = w / 12, bh = h / 8;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        // ends of the channel, and its banks past the wall (so the slits' waves fan out without echoes)
        let e = Math.max(0, 1 - x / bw, 1 - (w - 1 - x) / bw);
        if (x > w * 0.4) e = Math.max(e, 1 - y / bh, 1 - (h - 1 - y) / bh);
        sponge[y * w + x] = 0.15 * e * e;
      }
    }
  };
  build();

  /** A smooth dimple of radius r (cells) and depth a at (cx, cy); returns the volume it took. */
  const dropAt = (cx: number, cy: number, r: number, a: number) => {
    const R = Math.max(1, r), x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(h - 1, Math.ceil(cy + R));
    let vol = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = y * w + x, d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
      if (d < 1 && !solid[k]) { const e = a * (0.5 + 0.5 * Math.cos(Math.PI * d)); H[k] -= e; vol += e; }
    }
    return vol;
  };
  /** Gives back a volume evenly (the mean level stays at 0: a flat rise makes no waves). */
  const level = (vol: number) => {
    if (vol === 0) return;
    let nf = 0;
    for (let k = 0; k < n; k++) if (!solid[k]) nf++;
    const e = vol / Math.max(1, nf);
    for (let k = 0; k < n; k++) if (!solid[k]) H[k] += e;
  };
  const dropR = () => Math.max(2, (p.drop * h) / 32);

  const step1 = () => {
    if (built !== `${p.obst}|${p.paddle > 0}`) build();
    // «Amortiguación»: a uniform loss plus a viscous one (ν∇²v), which calms short ripples (∝ k²) far sooner than long waves
    const c2 = p.speed * p.speed, keep = 1 - (0.0005 + 0.02 * p.damp * p.damp), visc = 0.006 + 0.03 * p.damp;
    V0.set(Vl);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) {
        const k = o + x, m = nb[k];
        if (!m && solid[k]) continue;
        const c = H[k], cv = V0[k];
        let lap = 0, lapv = 0;
        if (m & 1) { lap += H[k - 1] - c; lapv += V0[k - 1] - cv; }
        if (m & 2) { lap += H[k + 1] - c; lapv += V0[k + 1] - cv; }
        if (m & 4) { lap += H[k - w] - c; lapv += V0[k - w] - cv; }
        if (m & 8) { lap += H[k + w] - c; lapv += V0[k + w] - cv; }
        Vl[k] = (cv + c2 * lap + visc * lapv) * keep * (1 - sponge[k]);
      }
    }
    // the paddle: a line source just inside the left beach (wavelength a sixth of the height)
    if (p.paddle > 0) {
      const om = (2 * Math.PI * p.speed) / (h / 6);
      phase += om;
      const a = 0.25 * p.paddle * om * Math.cos(phase), x0 = Math.round(w / 12) + 1;
      for (let y = 0; y < h; y++) for (let x = x0; x < x0 + 2; x++) if (!solid[y * w + x]) Vl[y * w + x] += a;
    }
    for (let k = 0; k < n; k++) H[k] += Vl[k];
    // rain from the seed
    rainAcc += p.rain / RATE;
    let vol = 0;
    for (let d = 0; rainAcc >= 1 && d < MAX_DROPS_STEP; d++) {
      rainAcc -= 1;
      const x = rng.next() * w, y = rng.next() * h, s = rng.range(0.6, 1.2);
      vol += dropAt(x, y, dropR() * s, 0.9 * s);
    }
    level(vol);
    if (rainAcc > 1) rainAcc = 1;
    steps++;
  };

  // ---- drawing
  const floorTone = (x: number, y: number) => {
    // square tiles a fifth of the height wide, dark grout between them, a seeded tone per tile
    const T = h / 5, tx = x / T, ty = y / T, ix = Math.floor(tx), iy = Math.floor(ty);
    const fx = tx - ix, fy = ty - iy, e = Math.min(fx, 1 - fx, fy, 1 - fy) * T;
    const grout = e < 0.4 ? 0 : e > 1.8 ? 1 : (e - 0.4) / 1.4;
    let q = Math.imul(ix * 374761393 + iy * 668265263, 1274126177) ^ tileSeed;
    q = Math.imul(q ^ (q >>> 13), 1103515245);
    const tone = 0.78 + 0.22 * (((q >>> 8) & 255) / 255);
    return (0.22 + 0.78 * grout) * tone;
  };

  const render = (out: Uint8Array) => {
    const S = 1.6; // height units to slope
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x, c = H[k];
      const l = x > 0 && !solid[k - 1] ? H[k - 1] : c, r = x < w - 1 && !solid[k + 1] ? H[k + 1] : c;
      const u = y > 0 && !solid[k - w] ? H[k - w] : c, d = y < h - 1 && !solid[k + w] ? H[k + w] : c;
      gx[k] = 0.5 * (r - l) * S; gy[k] = 0.5 * (d - u) * S;
    }
    // light: azimuth on the screen (y grows downwards), 60° over the horizon
    const az = (p.light * Math.PI) / 180, el = Math.PI / 3;
    const Lx = Math.cos(az) * Math.cos(el), Ly = -Math.sin(az) * Math.cos(el), Lz = Math.sin(el);
    const Hn = Math.hypot(Lx, Ly, Lz + 1), Hx = Lx / Hn, Hy = Ly / Hn, Hz = (Lz + 1) / Hn;
    // glints (Blinn, exponent 50) only where the surface tilts: the flat water's share is taken out
    const spec0 = Math.pow(Hz, 50);
    const D = p.depth * h;
    // refraction of the incoming light through a flat surface: the caustics are placed relative to it
    const flat = (nx: number, ny: number, out2: Float64Array) => {
      const il = 1 / Math.sqrt(nx * nx + ny * ny + 1), Nx = nx * il, Ny = ny * il, Nz = il;
      const cos = -(Nx * -Lx + Ny * -Ly + Nz * -Lz), k = 1 - ETA * ETA * (1 - cos * cos);
      const f = ETA * cos - Math.sqrt(Math.max(0, k));
      const tx = ETA * -Lx + f * Nx, ty = ETA * -Ly + f * Ny, tz = ETA * -Lz + f * Nz;
      const s = D / Math.max(0.05, -tz);
      out2[0] = tx * s; out2[1] = ty * s;
    };
    const T2 = new Float64Array(2);
    flat(0, 0, T2);
    const ox = T2[0], oy = T2[1];
    if (p.view !== 'superficie') {
      // where the light refracted at each cell meets the floor, relative to a flat surface
      for (let k = 0; k < n; k++) { flat(-gx[k], -gy[k], T2); dxA[k] = T2[0] - ox; dyA[k] = T2[1] - oy; }
      caus.fill(0);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (solid[k]) continue;
        for (let s = 0; s < 4; s++) {
          // the sample a quarter cell off the centre: bilinear weights 9/16, 3/16, 3/16, 1/16 with the neighbours
          const ex = s & 1 ? (x < w - 1 ? 1 : 0) : x > 0 ? -1 : 0, ey = s >> 1 ? (y < h - 1 ? w : 0) : y > 0 ? -w : 0;
          const sx = x + 0.25 + 0.5 * (s & 1), sy = y + 0.25 + 0.5 * (s >> 1);
          const fx = sx - 0.5 + 0.5625 * dxA[k] + 0.1875 * (dxA[k + ex] + dxA[k + ey]) + 0.0625 * dxA[k + ex + ey];
          const fy = sy - 0.5 + 0.5625 * dyA[k] + 0.1875 * (dyA[k + ex] + dyA[k + ey]) + 0.0625 * dyA[k + ex + ey];
          if (fx < 0 || fy < 0 || fx >= w - 1 || fy >= h - 1) continue;
          const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, o = iy * w + ix;
          caus[o] += 0.25 * (1 - tx) * (1 - ty); caus[o + 1] += 0.25 * tx * (1 - ty);
          caus[o + w] += 0.25 * (1 - tx) * ty; caus[o + w + 1] += 0.25 * tx * ty;
        }
      }
      // one (1 2 1) pass against the splats' aliasing
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = y * w + x;
        tmp[k] = (caus[x > 0 ? k - 1 : k] + 2 * caus[k] + caus[x < w - 1 ? k + 1 : k]) * 0.25;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = y * w + x;
        caus[k] = (tmp[y > 0 ? k - w : k] + 2 * tmp[k] + tmp[y < h - 1 ? k + w : k]) * 0.25;
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      let v: number;
      if (solid[k]) {
        // rock (a dome) or wall above the water, lit by the same light
        const rx = rockX[k], ry = rockY[k], rz = Math.sqrt(Math.max(0, 1 - rx * rx - ry * ry));
        v = 0.12 + 0.6 * Math.max(0, rx * Lx + ry * Ly + rz * Lz);
      } else {
        const nx = -gx[k], ny = -gy[k], il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        const Nx = nx * il, Ny = ny * il, Nz = il;
        const nh = Nx * Hx + Ny * Hy + Nz * Hz, spec = nh > 0.85 ? Math.max(0, Math.pow(nh, 50) - spec0) / (1 - spec0) : 0;
        if (p.view === 'superficie') {
          v = 0.05 + Math.sqrt(Math.max(0, Nx * Lx + Ny * Ly + Nz * Lz - Lz) * 5) + spec;
        } else {
          // the view ray from straight above, refracted to the floor
          const cos = Nz, kk = 1 - ETA * ETA * (1 - cos * cos), f = ETA * cos - Math.sqrt(Math.max(0, kk));
          const tx = f * Nx, ty = f * Ny, tz = -ETA + f * Nz, s = D / Math.max(0.05, -tz);
          const fx = x + 0.5 + tx * s, fy = y + 0.5 + ty * s;
          const C = bil(caus, w, h, fx - 0.5, fy - 0.5);
          if (p.view === 'causticas') v = 1 - Math.exp(-Math.max(0, C - 0.95) * 1.6);
          else v = floorTone(fx, fy) * (0.03 + 0.22 * C + 0.12 * C * C) + 0.8 * spec;
        }
      }
      out[k] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
    }
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = read(np); },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) { render(out); },
    stroke(s: Stroke) {
      // a trail of small drops along the segment
      const ax = (s.x0 * 0.5 + 0.5) * w, ay = (0.5 - s.y0) * h, bx = (s.x1 * 0.5 + 0.5) * w, by = (0.5 - s.y1) * h;
      const r = Math.max(1.2, Math.min(h * 0.08, s.r * h)), len = Math.hypot(bx - ax, by - ay);
      const cnt = Math.min(MAX_STROKE_DROPS, Math.max(1, Math.ceil(len / (r * 1.2))));
      const a = 0.7 * Math.max(0, Math.min(1, s.strength));
      let vol = 0;
      for (let i = 0; i < cnt; i++) {
        const t = cnt === 1 ? 1 : (i + 1) / cnt;
        vol += dropAt(ax + (bx - ax) * t, ay + (by - ay) * t, r, a);
      }
      level(vol);
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { rainAcc, phase };
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { h: H.slice(), v: Vl.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta agua.');
      const a = s.arrays.h, b = s.arrays.v;
      if (!(a instanceof Float32Array) || !(b instanceof Float32Array) || a.length !== n || b.length !== n) throw new Error('El estado guardado está incompleto.');
      H.set(a); Vl.set(b);
      steps = s.steps; rainAcc = s.scalars.rainAcc ?? 0; phase = s.scalars.phase ?? 0;
      rng.load(s.scalars);
    },
  };
}
