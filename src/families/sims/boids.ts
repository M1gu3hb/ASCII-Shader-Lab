import { Accum, toBytes } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Boids (Reynolds 1987), written from the model: every agent steers by three local rules over the
 * neighbours it sees (a 270° field of view within «Radio de visión»):
 *  - separation: away from neighbours closer than «Radio de separación», harder the closer and the more;
 *  - alignment: towards the mean heading of its neighbours, at full speed;
 *  - cohesion: towards their centre.
 * The rules are weighted and scaled by the maximum force («Agilidad»); speed stays between a floor and
 * the maximum. Predators chase the nearest boid and boids within reach flee from them; circular
 * obstacles push them aside. Neighbours come from a uniform grid rebuilt every step (counting sort); in a
 * crowd a boid reads an even subsample of at most MAX_SCAN candidates, so a step costs O(N). The domain
 * is the 2:1 torus. The picture: each boid as a short stroke along its heading (head brighter) over a
 * fading trail buffer.
 */

const ID = 'boids', V = 1;
const hyp = (x: number, y: number) => Math.sqrt(x * x + y * y);
const RATE = 30, DT = 1 / RATE;
const MAX_BOIDS = 3000, MAX_PRED = 6, MAX_OBS = 6, MAX_SCAN = 80, MAX_CELLS = 128 * 64;
/** Squared cosine of half the blind angle behind (a 270° field of view). */
const FOV2 = 0.5;

interface P { count: number; vision: number; sep: number; wSep: number; wAli: number; wCoh: number; speed: number; force: number; predators: number; obstacles: number; trail: number }
const read = (p: Params): P => ({
  count: Math.max(10, Math.min(MAX_BOIDS, Math.round(Number(p.count ?? 400)))),
  vision: Number(p.vision ?? 0.08), sep: Number(p.sep ?? 0.03),
  wSep: Number(p.wSep ?? 1.5), wAli: Number(p.wAli ?? 1.5), wCoh: Number(p.wCoh ?? 1),
  speed: Number(p.speed ?? 0.3), force: Number(p.force ?? 1),
  predators: Math.max(0, Math.min(MAX_PRED, Math.round(Number(p.predators ?? 0)))),
  obstacles: Math.max(0, Math.min(MAX_OBS, Math.round(Number(p.obstacles ?? 0)))),
  trail: Number(p.trail ?? 0.4),
});

/** Shortest displacement on the torus (x period 2, y period 1). */
const wx = (d: number) => (d > 1 ? d - 2 : d < -1 ? d + 2 : d);
const wy = (d: number) => (d > 0.5 ? d - 1 : d < -0.5 ? d + 1 : d);
const wrapX = (x: number) => (x >= 1 ? x - 2 : x < -1 ? x + 2 : x);
const wrapY = (y: number) => (y >= 0.5 ? y - 1 : y < -0.5 ? y + 1 : y);

/** Polarisation order parameter |Σ v̂| / N (1: everyone flies the same way; ≈ 0: no common heading). */
export function polarisation(vel: Float32Array, n: number): number {
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const vx = vel[i * 2], vy = vel[i * 2 + 1], l = hyp(vx, vy) || 1;
    sx += vx / l; sy += vy / l;
  }
  return hyp(sx, sy) / Math.max(1, n);
}

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  const N = p.count;
  let steps = 0;
  // state: boids (x, y) and (vx, vy); predators the same; the trail buffer; a scare from the brush
  const pos = new Float32Array(N * 2), vel = new Float32Array(N * 2);
  const ppos = new Float32Array(MAX_PRED * 2), pvel = new Float32Array(MAX_PRED * 2);
  const trail = new Float32Array(w * h);
  let scareX = 0, scareY = 0, scareR = 0, scareT = 0;

  // obstacles: fixed by the seed (the count only says how many are on)
  const obs = new Float32Array(MAX_OBS * 3);
  for (let k = 0; k < MAX_OBS; k++) {
    let x = 0, y = 0, r = 0;
    for (let tries = 0; tries < 30; tries++) {
      x = rng.range(-0.9, 0.9); y = rng.range(-0.38, 0.38); r = rng.range(0.05, 0.1);
      let ok = true;
      for (let j = 0; j < k; j++) if (hyp(wx(x - obs[j * 3]), wy(y - obs[j * 3 + 1])) < r + obs[j * 3 + 2] + 0.12) ok = false;
      if (ok) break;
    }
    obs[k * 3] = x; obs[k * 3 + 1] = y; obs[k * 3 + 2] = r;
  }
  for (let i = 0; i < N; i++) {
    pos[i * 2] = rng.range(-1, 1); pos[i * 2 + 1] = rng.range(-0.5, 0.5);
    const a = rng.next() * Math.PI * 2, s = p.speed * rng.range(0.5, 1);
    vel[i * 2] = Math.cos(a) * s; vel[i * 2 + 1] = Math.sin(a) * s;
  }
  for (let k = 0; k < MAX_PRED; k++) {
    ppos[k * 2] = rng.range(-1, 1); ppos[k * 2 + 1] = rng.range(-0.5, 0.5);
    const a = rng.next() * Math.PI * 2;
    pvel[k * 2] = Math.cos(a) * p.speed * 0.5; pvel[k * 2 + 1] = Math.sin(a) * p.speed * 0.5;
  }

  // neighbour grid (counting sort into cells at least as wide as the vision radius)
  const cellOf = new Int32Array(N), order = new Int32Array(N);
  let start = new Int32Array(64), count = new Int32Array(64);
  let gx = 1, gy = 1;
  const buildGrid = () => {
    const cs = Math.max(p.vision, p.sep);
    gx = Math.max(3, Math.min(128, Math.floor(2 / cs))); gy = Math.max(3, Math.min(64, Math.floor(1 / cs)));
    const nc = Math.min(MAX_CELLS, gx * gy);
    if (start.length < nc + 1) { start = new Int32Array(nc + 1); count = new Int32Array(nc + 1); }
    count.fill(0, 0, nc + 1);
    for (let i = 0; i < N; i++) {
      let cx = Math.floor((pos[i * 2] + 1) * 0.5 * gx), cy = Math.floor((pos[i * 2 + 1] + 0.5) * gy);
      cx = cx < 0 ? 0 : cx >= gx ? gx - 1 : cx; cy = cy < 0 ? 0 : cy >= gy ? gy - 1 : cy;
      const c = cy * gx + cx;
      cellOf[i] = c; count[c]++;
    }
    let acc = 0;
    for (let c = 0; c < nc; c++) { start[c] = acc; acc += count[c]; count[c] = start[c]; }
    start[nc] = acc;
    for (let i = 0; i < N; i++) order[count[cellOf[i]]++] = i;
  };

  const ax = new Float32Array(N * 2), cells = new Int32Array(9);
  /** Steering towards the direction (dx, dy) at full speed, capped at fmax, into (sx, sy). */
  let sx = 0, sy = 0;
  const steer = (dx: number, dy: number, vx: number, vy: number, vmax: number, fmax: number) => {
    const l = hyp(dx, dy);
    if (l < 1e-9) { sx = 0; sy = 0; return; }
    sx = (dx / l) * vmax - vx; sy = (dy / l) * vmax - vy;
    const f = hyp(sx, sy);
    if (f > fmax) { sx *= fmax / f; sy *= fmax / f; }
  };

  const step1 = () => {
    buildGrid();
    const vmax = p.speed, fmax = p.speed * 3 * p.force, R = p.vision, R2 = R * R, S = p.sep, S2 = S * S;
    const flee = Math.max(0.12, R * 2.2), flee2 = flee * flee;
    const np = p.predators, no = p.obstacles;
    for (let i = 0; i < N; i++) {
      const xi = pos[i * 2], yi = pos[i * 2 + 1], vx = vel[i * 2], vy = vel[i * 2 + 1], v2 = vx * vx + vy * vy;
      const cx = cellOf[i] % gx, cy = (cellOf[i] / gx) | 0;
      let sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0, nn = 0, ns = 0;
      // the 3 × 3 cells around; in a crowd, an even subsample of their candidates (every stride-th, from a
      // phase that varies by boid; cells keep boids in index order, which is spatially random)
      let total = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const row = ((cy + oy + gy) % gy) * gx;
        for (let ox = -1; ox <= 1; ox++) { const c = row + (cx + ox + gx) % gx; cells[(oy + 1) * 3 + ox + 1] = c; total += start[c + 1] - start[c]; }
      }
      const stride = total > MAX_SCAN ? Math.ceil(total / MAX_SCAN) : 1;
      let skip = i % stride;
      for (let q = 0; q < 9; q++) {
        const c = cells[q], e = start[c + 1];
        let k = start[c] + skip;
        for (; k < e; k += stride) {
          const j = order[k];
          if (j === i) continue;
          let dx = pos[j * 2] - xi, dy = pos[j * 2 + 1] - yi;
          if (dx > 1) dx -= 2; else if (dx < -1) dx += 2;
          if (dy > 0.5) dy -= 1; else if (dy < -0.5) dy += 1;
          const d2 = dx * dx + dy * dy;
          if (d2 > R2 || d2 < 1e-12) continue;
          // field of view: what is right behind is not seen (cos < FOV, compared squared)
          const dot = dx * vx + dy * vy;
          if (dot < 0 && dot * dot > FOV2 * d2 * v2) continue;
          if (d2 < S2) { const d = Math.sqrt(d2), ks = (S - d) / (S * d); sepX -= dx * ks; sepY -= dy * ks; ns++; }
          aliX += vel[j * 2]; aliY += vel[j * 2 + 1];
          cohX += dx; cohY += dy;
          nn++;
        }
        skip = k - e;
      }
      let fx = 0, fy = 0;
      // separation: a pressure that grows with crowding (Σ (1 − d/S) away from each), so the spacing
      // settles near S; alignment: Reynolds's steering towards the mean heading at full speed (what breaks
      // the symmetry and sets a swarm flying one way); cohesion: a spring towards the neighbours' centre
      if (ns) {
        const sc = stride * fmax, l = hyp(sepX, sepY) * sc, cap = fmax * 4;
        const k = l > cap ? cap / l : 1;
        fx += sepX * sc * k * p.wSep; fy += sepY * sc * k * p.wSep;
      }
      if (nn) {
        steer(aliX, aliY, vx, vy, vmax, fmax); fx += sx * p.wAli; fy += sy * p.wAli;
        const kc = fmax / R;
        fx += (cohX / nn) * kc * p.wCoh; fy += (cohY / nn) * kc * p.wCoh;
      }
      // predators (and the brush) ask for flight, stronger the closer they are
      for (let k = 0; k < np; k++) {
        const dx = wx(xi - ppos[k * 2]), dy = wy(yi - ppos[k * 2 + 1]), d2 = dx * dx + dy * dy;
        if (d2 > flee2) continue;
        steer(dx, dy, vx, vy, vmax, fmax * 2);
        const k2 = 4 * (1 - Math.sqrt(d2) / flee);
        fx += sx * k2; fy += sy * k2;
      }
      if (scareT > 0) {
        const dx = wx(xi - scareX), dy = wy(yi - scareY), d = hyp(dx, dy), rr = scareR + R;
        if (d < rr) { steer(dx, dy, vx, vy, vmax, fmax * 2); const k2 = 5 * (1 - d / rr); fx += sx * k2; fy += sy * k2; }
      }
      for (let k = 0; k < no; k++) {
        const dx = wx(xi - obs[k * 3]), dy = wy(yi - obs[k * 3 + 1]), d = hyp(dx, dy), rr = obs[k * 3 + 2] + R;
        if (d >= rr) continue;
        steer(dx, dy, vx, vy, vmax, fmax * 2);
        const k2 = 3 * (1 - (d - obs[k * 3 + 2]) / R);
        fx += sx * k2; fy += sy * k2;
      }
      // a little restlessness, so a perfectly aligned flock still breathes
      fx += (rng.next() - 0.5) * fmax * 0.4; fy += (rng.next() - 0.5) * fmax * 0.4;
      ax[i * 2] = fx; ax[i * 2 + 1] = fy;
    }
    const vmin = vmax * 0.35;
    for (let i = 0; i < N; i++) {
      let vx = vel[i * 2] + ax[i * 2] * DT, vy = vel[i * 2 + 1] + ax[i * 2 + 1] * DT;
      const s = hyp(vx, vy);
      if (s > vmax) { vx *= vmax / s; vy *= vmax / s; }
      else if (s < vmin) { if (s > 1e-9) { vx *= vmin / s; vy *= vmin / s; } else { vx = vmin; vy = 0; } }
      let x = wrapX(pos[i * 2] + vx * DT), y = wrapY(pos[i * 2 + 1] + vy * DT);
      // never inside an obstacle
      for (let k = 0; k < no; k++) {
        const dx = wx(x - obs[k * 3]), dy = wy(y - obs[k * 3 + 1]), d = hyp(dx, dy), r = obs[k * 3 + 2];
        if (d < r && d > 1e-9) { x = wrapX(obs[k * 3] + (dx / d) * r); y = wrapY(obs[k * 3 + 1] + (dy / d) * r); }
      }
      vel[i * 2] = vx; vel[i * 2 + 1] = vy; pos[i * 2] = x; pos[i * 2 + 1] = y;
    }
    // predators: a little faster than the flock, less agile, after the nearest boid
    for (let k = 0; k < np; k++) {
      const x = ppos[k * 2], y = ppos[k * 2 + 1], vx = pvel[k * 2], vy = pvel[k * 2 + 1];
      let best = Infinity, tx = 0, ty = 0;
      for (let i = 0; i < N; i++) {
        const dx = wx(pos[i * 2] - x), dy = wy(pos[i * 2 + 1] - y), d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; tx = dx; ty = dy; }
      }
      const pv = vmax * 1.15, pf = fmax * 0.6;
      steer(tx, ty, vx, vy, pv, pf);
      let fx = sx, fy = sy;
      for (let j = 0; j < no; j++) {
        const dx = wx(x - obs[j * 3]), dy = wy(y - obs[j * 3 + 1]), d = hyp(dx, dy), rr = obs[j * 3 + 2] + 0.06;
        if (d < rr) { steer(dx, dy, vx, vy, pv, pf * 3); fx += sx; fy += sy; }
      }
      let nvx = vx + fx * DT, nvy = vy + fy * DT;
      const s = hyp(nvx, nvy);
      if (s > pv) { nvx *= pv / s; nvy *= pv / s; }
      pvel[k * 2] = nvx; pvel[k * 2 + 1] = nvy;
      ppos[k * 2] = wrapX(x + nvx * DT); ppos[k * 2 + 1] = wrapY(y + nvy * DT);
    }
    if (scareT > 0) scareT--;
    // trail: decays with a time constant set by «Estela», each boid deposits where it is (bilinear)
    if (p.trail > 0.001) {
      const decay = Math.exp(-DT / (0.08 + 2.4 * p.trail * p.trail));
      for (let i = 0; i < trail.length; i++) trail[i] *= decay;
      const amt = 0.22;
      for (let i = 0; i < N; i++) {
        const fx = (pos[i * 2] * 0.5 + 0.5) * w - 0.5, fy = (0.5 - pos[i * 2 + 1]) * h - 0.5;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const xa = (x0 + w) % w, xb = (x0 + 1 + w) % w, ya = ((y0 + h) % h) * w, yb = ((y0 + 1 + h) % h) * w;
        trail[ya + xa] += amt * (1 - tx) * (1 - ty); trail[ya + xb] += amt * tx * (1 - ty);
        trail[yb + xa] += amt * (1 - tx) * ty; trail[yb + xb] += amt * tx * ty;
      }
    } else trail.fill(0);
    steps++;
  };

  const acc = new Accum(w, h);
  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = { ...read(np), count: N }; },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      const d = acc.d;
      // the trail saturates softly, so a crowd keeps its gradient under the strokes
      for (let i = 0; i < d.length; i++) d[i] = 0.5 * (1 - Math.exp(-trail[i] * 2.2));
      // obstacles: faint rings
      for (let k = 0; k < p.obstacles; k++) {
        const cx = obs[k * 3], cy = obs[k * 3 + 1], r = obs[k * 3 + 2], m = 40;
        for (let s = 0; s < m; s++) {
          const a0 = (s / m) * Math.PI * 2, a1 = ((s + 1) / m) * Math.PI * 2;
          acc.line(acc.px(cx + Math.cos(a0) * r), acc.py(cy + Math.sin(a0) * r), acc.px(cx + Math.cos(a1) * r), acc.py(cy + Math.sin(a1) * r), 1.3, 0.4);
        }
      }
      // boids: a stroke along the heading (about two cells), the head brighter
      const L = Math.max(2.2, h / 40), lw = Math.max(1, h / 90);
      for (let i = 0; i < N; i++) {
        const vx = vel[i * 2], vy = vel[i * 2 + 1], l = hyp(vx, vy) || 1;
        const hx = acc.px(pos[i * 2]), hy = acc.py(pos[i * 2 + 1]);
        acc.line(hx - (vx / l) * L, hy + (vy / l) * L, hx, hy, lw, 0.75);
      }
      for (let i = 0; i < N; i++) acc.splat(acc.px(pos[i * 2]), acc.py(pos[i * 2 + 1]), 0.6, 0.35, true);
      // predators: longer, thicker, brightest
      for (let k = 0; k < p.predators; k++) {
        const vx = pvel[k * 2], vy = pvel[k * 2 + 1], l = hyp(vx, vy) || 1;
        const hx = acc.px(ppos[k * 2]), hy = acc.py(ppos[k * 2 + 1]);
        acc.line(hx - (vx / l) * L * 2.4, hy + (vy / l) * L * 2.4, hx, hy, lw * 2.4, 1);
        acc.splat(hx, hy, lw * 1.6, 1, true);
      }
      toBytes(d, out, 1, 1);
    },
    stroke(s: Stroke) {
      // «Espantar»: the touch acts as a predator for a moment and kicks the boids right under it (folded
      // back into one period of the torus: the layer may show it repeated)
      scareX = ((((s.x1 + 1) % 2) + 2) % 2) - 1; scareY = ((((s.y1 + 0.5) % 1) + 1) % 1) - 0.5;
      scareR = Math.max(0.04, s.r); scareT = Math.round(RATE * 0.35);
      const R = scareR * 1.2, kick = p.speed * s.strength;
      for (let i = 0; i < N; i++) {
        const dx = wx(pos[i * 2] - scareX), dy = wy(pos[i * 2 + 1] - scareY), dd = hyp(dx, dy);
        if (dd >= R || dd < 1e-9) continue;
        const k = (1 - dd / R) * kick / dd;
        vel[i * 2] += dx * k; vel[i * 2 + 1] += dy * k;
      }
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { scareX, scareY, scareR, scareT };
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { pos: pos.slice(), vel: vel.slice(), ppos: ppos.slice(), pvel: pvel.slice(), trail: trail.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta bandada.');
      const a = s.arrays;
      const ok = (x: unknown, n: number) => x instanceof Float32Array && x.length === n;
      if (!ok(a.pos, N * 2) || !ok(a.vel, N * 2) || !ok(a.ppos, MAX_PRED * 2) || !ok(a.pvel, MAX_PRED * 2) || !ok(a.trail, w * h)) throw new Error('El estado guardado está incompleto.');
      pos.set(a.pos); vel.set(a.vel); ppos.set(a.ppos); pvel.set(a.pvel); trail.set(a.trail);
      scareX = s.scalars.scareX ?? 0; scareY = s.scalars.scareY ?? 0; scareR = s.scalars.scareR ?? 0; scareT = s.scalars.scareT ?? 0;
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
