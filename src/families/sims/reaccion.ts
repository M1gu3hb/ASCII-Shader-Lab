import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Gray–Scott reaction–diffusion (Pearson 1993; the explicit scheme of K. Sims's tutorial, written here from
 * the equations): two concentrations A and B on a 2:1 grid,
 *   A' = A + (Da ∇²A − A B² + F (1 − A)) dt
 *   B' = B + (Db ∇²B + A B² − (k + F) B) dt
 * with a 9-point Laplacian (centre −1, sides 0.2, corners 0.05), Da = 1, Db = «Difusión de B», dt = 1.
 * «Escala» multiplies the reaction terms by 1/s², which scales the pattern's wavelength by s while keeping
 * the explicit scheme stable. Boundaries: periodic («Continuos») or zero-flux («Cerrados»).
 */

const ID = 'reaccion_difusion', V = 1;

interface P { feed: number; kill: number; diff: number; scale: number; seedShape: string; edges: string; view: string }
const read = (p: Params): P => ({
  feed: Number(p.feed ?? 0.0545), kill: Number(p.kill ?? 0.062), diff: Number(p.diff ?? 0.5), scale: Number(p.scale ?? 1),
  seedShape: String(p.seedShape ?? 'manchas'), edges: String(p.edges ?? 'toro'), view: String(p.view ?? 'concentracion'),
});

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(8, Math.round(cfg.res)), w = 2 * h, n = w * h;
  let A = new Float32Array(n), B = new Float32Array(n), A2 = new Float32Array(n), B2 = new Float32Array(n);
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  let steps = 0;
  // neighbour tables (periodic and clamped)
  const xl = new Int32Array(w), xr = new Int32Array(w), yu = new Int32Array(h), yd = new Int32Array(h);
  const tables = (wrap: boolean) => {
    for (let x = 0; x < w; x++) { xl[x] = x > 0 ? x - 1 : wrap ? w - 1 : 0; xr[x] = x < w - 1 ? x + 1 : wrap ? 0 : w - 1; }
    for (let y = 0; y < h; y++) { yu[y] = (y > 0 ? y - 1 : wrap ? h - 1 : 0) * w; yd[y] = (y < h - 1 ? y + 1 : wrap ? 0 : h - 1) * w; }
  };
  tables(p.edges !== 'cerrado');

  // ---- seeding (deterministic from the seed)
  A.fill(1); B.fill(0);
  const rect = (cx: number, cy: number, rw: number, rh: number) => {
    for (let y = Math.max(0, Math.floor(cy - rh)); y < Math.min(h, Math.ceil(cy + rh)); y++)
      for (let x = Math.max(0, Math.floor(cx - rw)); x < Math.min(w, Math.ceil(cx + rw)); x++) { B[y * w + x] = 1; A[y * w + x] = 0.5; }
  };
  // (patterns have a size in grid cells, set by the diffusion: a seed smaller than a few cells dies at once)
  const s0 = Math.max(4, h * 0.04);
  switch (p.seedShape) {
    case 'centro': rect(w / 2, h / 2, s0 * 2, s0 * 2); break;
    case 'anillo': {
      const R = h * 0.3;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = Math.abs(Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) - R);
        if (d < s0 * 0.7) { B[y * w + x] = 1; A[y * w + x] = 0.5; }
      }
      break;
    }
    case 'lineas': {
      for (let k = 0; k < 5; k++) {
        const y0 = rng.range(0.1, 0.9) * h, slope = rng.range(-0.4, 0.4);
        for (let x = 0; x < w; x++) rect(x, y0 + slope * (x - w / 2), 0.6, s0 * 0.4);
      }
      break;
    }
    case 'ruido': {
      for (let i = 0; i < n; i++) if (rng.next() < 0.12) { B[i] = 0.25 + 0.5 * rng.next(); A[i] = 0.5; }
      break;
    }
    default: {
      const k = Math.max(6, Math.round((n / 900) * (0.7 + 0.6 * rng.next())));
      for (let i = 0; i < k; i++) rect(rng.next() * w, rng.next() * h, s0 * rng.range(0.6, 1.4), s0 * rng.range(0.6, 1.4));
    }
  }

  const step1 = () => {
    const F = p.feed, K = p.kill, Db = p.diff, r = 1 / (p.scale * p.scale);
    for (let y = 0; y < h; y++) {
      const o = y * w, ou = yu[y], od = yd[y];
      for (let x = 0; x < w; x++) {
        const i = o + x, l = xl[x], rr = xr[x];
        const a = A[i], b = B[i];
        const lapA = 0.2 * (A[o + l] + A[o + rr] + A[ou + x] + A[od + x]) + 0.05 * (A[ou + l] + A[ou + rr] + A[od + l] + A[od + rr]) - a;
        const lapB = 0.2 * (B[o + l] + B[o + rr] + B[ou + x] + B[od + x]) + 0.05 * (B[ou + l] + B[ou + rr] + B[od + l] + B[od + rr]) - b;
        const abb = a * b * b;
        let na = a + lapA + (F * (1 - a) - abb) * r;
        let nb = b + Db * lapB + (abb - (K + F) * b) * r;
        na = na < 0 ? 0 : na > 1 ? 1 : na;
        nb = nb < 0 ? 0 : nb > 1 ? 1 : nb;
        A2[i] = na; B2[i] = nb;
      }
    }
    let t = A; A = A2; A2 = t;
    t = B; B = B2; B2 = t;
    steps++;
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) {
      const q = read(np);
      if (q.edges !== p.edges) tables(q.edges !== 'cerrado');
      p = q;
    },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      if (p.view === 'relieve') {
        for (let y = 0; y < h; y++) {
          const o = y * w, ou = yu[y], od = yd[y];
          for (let x = 0; x < w; x++) {
            const b = B[o + x];
            const gx = B[o + xr[x]] - B[o + xl[x]], gy = B[od + x] - B[ou + x];
            const v = 0.15 + b * 1.6 + (gx * 0.7 - gy * 0.7) * 2.4;
            out[o + x] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
          }
        }
      } else if (p.view === 'contorno') {
        for (let y = 0; y < h; y++) {
          const o = y * w, ou = yu[y], od = yd[y];
          for (let x = 0; x < w; x++) {
            const gx = B[o + xr[x]] - B[o + xl[x]], gy = B[od + x] - B[ou + x];
            const v = Math.sqrt(gx * gx + gy * gy) * 7;
            out[o + x] = v >= 1 ? 255 : (v * 255 + 0.5) | 0;
          }
        }
      } else {
        for (let i = 0; i < n; i++) {
          const v = (B[i] - 0.02) * 3.4;
          out[i] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
        }
      }
    },
    stroke(s: Stroke) {
      // along the segment, in pixels of the grid (the domain wraps like the simulation)
      const ax = (s.x0 * 0.5 + 0.5) * w, ay = (0.5 - s.y0) * h, bx = (s.x1 * 0.5 + 0.5) * w, by = (0.5 - s.y1) * h;
      const R = Math.max(1.5, s.r * h), len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.ceil(len / (R * 0.5)));
      for (let j = 0; j <= k; j++) {
        const cx = ax + ((bx - ax) * j) / k, cy = ay + ((by - ay) * j) / k;
        for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d > R) continue;
          const i = (((y % h) + h) % h) * w + (((x % w) + w) % w);
          if (s.brush === 'borrar') { A[i] = 1; B[i] = 0; }
          else { B[i] = Math.min(1, B[i] + 0.5 * s.strength); A[i] = Math.min(A[i], 0.5); }
        }
      }
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = {};
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { A: A.slice(), B: B.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta simulación.');
      const a = s.arrays.A, b = s.arrays.B;
      if (!(a instanceof Float32Array) || !(b instanceof Float32Array) || a.length !== n || b.length !== n) throw new Error('El estado guardado está incompleto.');
      A.set(a); B.set(b);
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
