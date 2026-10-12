import { Accum } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params } from '../types';

/**
 * Differential growth: one or more polylines of nodes (closed curves or open lines) in domain units. Each
 * step every node moves by the sum of
 *  - attraction: a spring toward each neighbour along the curve, beyond a rest length of half the longest edge;
 *  - alignment: a pull toward the midpoint of its two neighbours (smoothing);
 *  - repulsion: a push away from every node closer than «Separación» R (a spatial hash of cell size R),
 *    falling linearly to zero at R;
 * clamped to R / 20 per step, then kept inside the boundary (a circle or the frame); the ends of an open line
 * stay anchored. Edges longer than «Arista máxima» × R are split at their midpoint, and «Brotes» extra edges
 * per step are split at random (from the seed) to break the symmetry. Repulsion stretches the curve,
 * splitting lengthens it, and the crowding folds it. Growth stops when the curve is long enough to cover its
 * container at one separation between folds (at most MAX_NODES nodes); the curve then settles for SETTLE
 * steps and freezes. Every HIST_EVERY steps the outline is added to a fading history (the «Historia» view).
 *
 * «Renovación» (renew = 'si') never freezes: the curves are a population. Once the container is full, the
 * oldest curve that has lived «Vida» seconds is cut at a seeded node and unravels (full: the share of curve
 * the container holds, or no room left for a new ring): it no longer grows, its
 * ends are free, and it loses one node at each end per step until it is gone (removing nodes never crosses
 * a curve). No curve grows beyond SHARE of what the container holds, so a ring is born wherever a space about
 * three folds wide opens (once the first curves are grown), and grows into it with its neighbours. One curve
 * unravels at a time; at most MAX_CURVES curves; sprouts only where the curve is not crowded.
 */

const ID = 'crecimiento', V = 1;
/**
 * 0..1 → a byte in steps of 4 (64 levels): a sample halfway between two or four texels is then a whole level
 * in both engines (the GPU's float32 and the CPU's float64 would otherwise round an exact .5 apart and pick
 * different glyphs).
 */
const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 252 : ((v * 63 + 0.5) | 0) * 4);

const MAX_NODES = 6000;
const MAX_CURVES = 12;
const SETTLE = 240;
const MIN_SEP = 0.03;
const HIST_EVERY = 30;
/** Steps per second of layer time (the family's rate). */
const RATE = 30;
/**
 * Renewal: the share of the container's curve one curve may grow to (so that no single one empties it as it
 * goes); a line, anchored across the frame, keeps a larger one.
 */
const SHARE = 0.22, SHARE_LINE = 0.5;
/** Time step of the relaxation, and the repulsion's strength relative to the other two forces. */
const DT = 0.12, REP = 0.5;

interface P { sep: number; att: number; ali: number; edge: number; sprout: number; shape: string; bound: string; view: string; renew: string; life: number }
const read = (p: Params): P => ({
  sep: Math.max(MIN_SEP, Number(p.sep ?? 0.07)), att: Number(p.att ?? 0.5), ali: Number(p.ali ?? 0.5), edge: Number(p.edge ?? 0.55),
  sprout: Number(p.sprout ?? 0.5), shape: String(p.shape ?? 'circulo'), bound: String(p.bound ?? 'circulo'), view: String(p.view ?? 'trazo'),
  renew: String(p.renew ?? 'no'), life: Number(p.life ?? 30),
});

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  // nodes, curve by curve (each curve's nodes contiguous); double buffers for the rebuild after splits
  let px = new Float32Array(MAX_NODES), py = new Float32Array(MAX_NODES);
  let qx = new Float32Array(MAX_NODES), qy = new Float32Array(MAX_NODES);
  const fx = new Float64Array(MAX_NODES), fy = new Float64Array(MAX_NODES);
  const cStart = new Int32Array(MAX_CURVES), cLen = new Int32Array(MAX_CURVES), cClosed = new Uint8Array(MAX_CURVES);
  let N = 0, nc = 0, steps = 0, settle = 0, frozen = 0;
  // renewal: curves unravelling (they retract and go), each curve's birth step, and the wait before the next event
  const renew = p.renew === 'si';
  const die = new Uint8Array(MAX_CURVES), born = new Int32Array(MAX_CURVES);
  let cool = 0, filled = 0, barren = 0;
  const UNRAVEL_AGE = Math.round(p.life * RATE);
  // older outlines, fading (the «Historia» view; kept up in every view so switching shows it at once)
  const hist = new Accum(w, h);
  const draw = new Accum(w, h);

  const addCurve = (pts: number[], closed: boolean) => {
    if (nc >= MAX_CURVES || N + pts.length / 2 > MAX_NODES) return;
    cStart[nc] = N; cLen[nc] = pts.length / 2; cClosed[nc] = closed ? 1 : 0; nc++;
    for (let i = 0; i < pts.length; i += 2) { px[N] = pts[i]; py[N] = pts[i + 1]; N++; }
  };
  const restLen = () => p.edge * p.sep * 0.5;
  const ring = (cx: number, cy: number, r: number, k = 0, depth = 0) => {
    const pts: number[] = [];
    const m = Math.max(12, Math.ceil((Math.PI * 2 * r * (1 + depth)) / restLen()));
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2, rr = k ? r * (1 + depth * Math.cos(a * k)) : r;
      pts.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    }
    return pts;
  };

  // ---- initial shape (deterministic from the seed)
  switch (p.shape) {
    case 'linea': {
      // anchored at both ends, across the container: it can only grow by buckling
      const L = p.bound === 'rect' ? 1.9 : 0.9, pts: number[] = [], m = Math.ceil(L / restLen());
      for (let i = 0; i <= m; i++) pts.push(-L / 2 + (L * i) / m, 0.004 * Math.sin(i * 0.7));
      addCurve(pts, false);
      break;
    }
    case 'varias': {
      const k = 3 + rng.int(3), c: number[] = [];
      for (let j = 0, tries = 0; j < k && tries < 300; tries++) {
        const x = rng.range(-0.75, 0.75), y = rng.range(-0.3, 0.3);
        let ok = true;
        for (let i = 0; i < c.length; i += 2) if (Math.hypot(x - c[i], y - c[i + 1]) < 0.3) ok = false;
        if (!ok) continue;
        c.push(x, y);
        addCurve(ring(x, y, rng.range(0.025, 0.045)), true);
        j++;
      }
      break;
    }
    case 'estrella': addCurve(ring(0, 0, 0.09, 5 + rng.int(3), 0.45), true); break;
    default: addCurve(ring(0, 0, 0.06), true);
  }
  // a whisper of seeded noise so that symmetric shapes do not stay symmetric
  for (let i = 0; i < N; i++) { px[i] += (rng.next() - 0.5) * 0.002; py[i] += (rng.next() - 0.5) * 0.002; }

  // ---- spatial hash over the domain, cell size = separation (allocated for the smallest one)
  const GW = Math.ceil(2 / MIN_SEP) + 2, GH = Math.ceil(1 / MIN_SEP) + 2;
  const head = new Int32Array(GW * GH), nxt = new Int32Array(MAX_NODES);

  const keepInside = (i: number) => {
    if (p.bound === 'rect') {
      if (px[i] < -0.97) px[i] = -0.97; else if (px[i] > 0.97) px[i] = 0.97;
      if (py[i] < -0.47) py[i] = -0.47; else if (py[i] > 0.47) py[i] = 0.47;
    } else {
      const r = Math.hypot(px[i], py[i]);
      if (r > 0.47) { px[i] *= 0.47 / r; py[i] *= 0.47 / r; }
    }
  };

  const relax = () => {
    const R = p.sep, R2 = R * R, L0 = restLen(), att = p.att * DT, ali = p.ali * DT, rep = REP * DT, maxStep = R * 0.05;
    const gw = Math.ceil(2 / R) + 2, gh = Math.ceil(1 / R) + 2;
    head.fill(-1, 0, gw * gh);
    const cellX = (x: number) => Math.min(gw - 1, Math.max(0, Math.floor((x + 1) / R) + 1));
    const cellY = (y: number) => Math.min(gh - 1, Math.max(0, Math.floor((y + 0.5) / R) + 1));
    for (let i = 0; i < N; i++) { const c = cellY(py[i]) * gw + cellX(px[i]); nxt[i] = head[c]; head[c] = i; }
    for (let c = 0; c < nc; c++) {
      const s = cStart[c], L = cLen[c], closed = cClosed[c] === 1;
      for (let k = 0; k < L; k++) {
        const i = s + k, x = px[i], y = py[i];
        const hasL = closed || k > 0, hasR = closed || k < L - 1;
        const l = s + (k > 0 ? k - 1 : L - 1), r = s + (k < L - 1 ? k + 1 : 0);
        let dx = 0, dy = 0;
        // attraction to the neighbours along the curve
        for (let side = 0; side < 2; side++) {
          if (side === 0 ? !hasL : !hasR) continue;
          const j = side === 0 ? l : r;
          const ex = px[j] - x, ey = py[j] - y, d = Math.sqrt(ex * ex + ey * ey);
          if (d > L0) { const f = (att * (d - L0)) / d; dx += ex * f; dy += ey * f; }
        }
        // alignment toward the neighbours' midpoint
        if (hasL && hasR) { dx += ali * ((px[l] + px[r]) * 0.5 - x); dy += ali * ((py[l] + py[r]) * 0.5 - y); }
        // repulsion from every node within R
        const gx = cellX(x), gy = cellY(y);
        for (let yy = gy - 1; yy <= gy + 1; yy++) {
          if (yy < 0 || yy >= gh) continue;
          for (let xx = gx - 1; xx <= gx + 1; xx++) {
            if (xx < 0 || xx >= gw) continue;
            for (let j = head[yy * gw + xx]; j >= 0; j = nxt[j]) {
              if (j === i) continue;
              const ex = x - px[j], ey = y - py[j], d2 = ex * ex + ey * ey;
              if (d2 >= R2 || d2 < 1e-14) continue;
              const d = Math.sqrt(d2), f = (rep * (R - d)) / d;
              dx += ex * f; dy += ey * f;
            }
          }
        }
        const m = Math.sqrt(dx * dx + dy * dy);
        if (m > maxStep) { dx *= maxStep / m; dy *= maxStep / m; }
        // the ends of an open line are anchored (an unravelling curve's are free)
        if ((!hasL || !hasR) && !die[c]) { dx = 0; dy = 0; }
        fx[i] = x + dx; fy[i] = y + dy;
      }
    }
    for (let i = 0; i < N; i++) { px[i] = fx[i]; py[i] = fy[i]; keepInside(i); }
  };

  /** Splits long edges (and «Brotes» random ones) by rebuilding the node arrays curve by curve. */
  const grow = () => {
    const Lmax = p.edge * p.sep, L0 = restLen(), share = renew ? budget() * shareOf() : Infinity;
    // random sprouts: edge indices (global, by start node) chosen from the seed
    const extra: number[] = [];
    let k = Math.floor(p.sprout);
    if (rng.next() < p.sprout - k) k++;
    for (let j = 0; j < k; j++) extra.push(rng.int(Math.max(1, N)));
    let M = 0;
    for (let c = 0; c < nc; c++) {
      const s = cStart[c], L = cLen[c], closed = cClosed[c] === 1, start = M;
      for (let k2 = 0; k2 < L; k2++) {
        const i = s + k2;
        qx[M] = px[i]; qy[M] = py[i]; M++;
        if (!closed && k2 === L - 1) break;
        const j = s + (k2 < L - 1 ? k2 + 1 : 0);
        const ex = px[j] - px[i], ey = py[j] - py[i], d = Math.sqrt(ex * ex + ey * ey);
        // (renewal: a sprout only where the curve is not crowded already, or crowded stretches end up packed;
        // and no curve beyond its share of the container)
        if (!die[c] && !(renew && L >= share) && (d > Lmax || (extra.includes(i) && (!renew || d > L0))) && M + (N - i) < MAX_NODES) {
          qx[M] = (px[i] + px[j]) * 0.5; qy[M] = (py[i] + py[j]) * 0.5; M++;
        }
      }
      cStart[c] = start; cLen[c] = M - start;
    }
    let t = px; px = qx; qx = t;
    t = py; py = qy; qy = t;
    N = M;
  };

  const strokeInto = (a: Accum, wd: number, amount: number) => {
    for (let c = 0; c < nc; c++) {
      const s = cStart[c], L = cLen[c], closed = cClosed[c] === 1, v = die[c] ? amount * 0.6 : amount;
      for (let k = 0; k < (closed ? L : L - 1); k++) {
        const i = s + k, j = s + (k < L - 1 ? k + 1 : 0);
        a.line(a.px(px[i]), a.py(py[i]), a.px(px[j]), a.py(py[j]), wd, v);
      }
    }
  };
  const lineW = () => Math.max(1, 1.6 * (h / 96));
  const shareOf = () => (p.shape === 'linea' ? SHARE_LINE : SHARE);
  /** Nodes the container holds: enough curve to cover its area at one separation between folds. */
  const budget = () => {
    const area = p.bound === 'rect' ? 1.94 * 0.94 : Math.PI * 0.47 * 0.47;
    return Math.min(MAX_NODES - 2, Math.round((1.1 * area) / (p.sep * restLen())));
  };

  const step1 = () => {
    steps++;
    if (frozen) return;
    relax();
    if (renew) renewStep();
    else if (N < budget()) grow();
    else if (++settle >= SETTLE) frozen = 1;
    if (steps % HIST_EVERY === 0) { hist.scale(0.95); strokeInto(hist, lineW() * 0.7, 0.45); }
  };

  /* ------------------------------------------------------------------ */
  /* Renewal                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Renewal: the curves grow while the container has room; once it is full, the oldest curve (old enough)
   * unravels, and rings are born wherever a wide enough space opens. One curve unravels at a time.
   */
  const renewStep = () => {
    const B = budget();
    if (N < B) grow();
    let dying = false;
    for (let c = 0; c < nc; c++) if (die[c]) dying = true;
    if (dying) retract();
    if (N >= B * 0.97) filled = 1;
    for (let c = 0; c < nc; c++) if (cLen[c] >= B * shareOf()) filled = 1;
    if (cool > 0) { cool--; return; }
    // full: the container's share of curve, or no room for a ring three times running
    if (!dying && (N >= B * 0.97 || barren >= 3)) { barren = 0; unravel(); return; }
    // (new rings only once the first curves are grown: the first growth is the shape's own)
    if (filled) barren = sow() ? 0 : barren + 1;
  };

  /** The node indices of each curve, in order, with its kind (closed, unravelling) and birth step. */
  const curveLists = () => {
    const lists: number[][] = [], closed: number[] = [], dies: number[] = [], borns: number[] = [];
    for (let c = 0; c < nc; c++) {
      const l: number[] = [];
      for (let k = 0; k < cLen[c]; k++) l.push(cStart[c] + k);
      lists.push(l); closed.push(cClosed[c]); dies.push(die[c]); borns.push(born[c]);
    }
    return { lists, closed, dies, borns };
  };
  /** Rebuilds the node arrays from per-curve lists of node indices (a list of fewer than two nodes goes). */
  const relayout = (lists: number[][], closed: number[], dies: number[], borns: number[], extra?: number[]) => {
    let M = 0;
    nc = 0;
    for (let c = 0; c < lists.length && nc < MAX_CURVES; c++) {
      const l = lists[c];
      if (l.length < 2) continue;
      cStart[nc] = M; cLen[nc] = l.length; cClosed[nc] = closed[c]; die[nc] = dies[c]; born[nc] = borns[c];
      for (const i of l) { qx[M] = px[i]; qy[M] = py[i]; M++; }
      nc++;
    }
    // a new ring, from its points
    if (extra && nc < MAX_CURVES && M + extra.length / 2 <= MAX_NODES) {
      cStart[nc] = M; cLen[nc] = extra.length / 2; cClosed[nc] = 1; die[nc] = 0; born[nc] = steps;
      for (let i = 0; i < extra.length; i += 2) { qx[M] = extra[i]; qy[M] = extra[i + 1]; M++; }
      nc++;
    }
    for (let c = nc; c < MAX_CURVES; c++) { cStart[c] = M; cLen[c] = 0; cClosed[c] = 0; die[c] = 0; born[c] = 0; }
    let t = px; px = qx; qx = t;
    t = py; py = qy; qy = t;
    N = M;
  };

  /** Unravelling curves lose a node at each end every step; one of four nodes or fewer goes. */
  const retract = () => {
    const { lists, closed, dies, borns } = curveLists();
    for (let c = 0; c < lists.length; c++) if (dies[c]) lists[c] = lists[c].length > 4 ? lists[c].slice(1, -1) : [];
    relayout(lists, closed, dies, borns);
  };

  /** The oldest curve that has lived UNRAVEL_AGE steps is cut at a seeded node and begins to unravel. */
  const unravel = () => {
    let c = -1;
    for (let k = 0; k < nc; k++) if (!die[k] && steps - born[k] >= UNRAVEL_AGE && (c < 0 || born[k] < born[c])) c = k;
    if (c < 0) { cool = 30; return; }
    const { lists, closed, dies, borns } = curveLists();
    const l = lists[c], k0 = rng.int(l.length);
    // a closed curve opens at the cut; a line is cut there in two
    if (closed[c]) { lists[c] = [...l.slice(k0), ...l.slice(0, k0)]; dies[c] = 1; closed[c] = 0; }
    else { lists[c] = l.slice(0, k0); dies[c] = 1; lists.push(l.slice(k0 + 1)); closed.push(0); dies.push(1); borns.push(borns[c]); }
    relayout(lists, closed, dies, borns);
    cool = 60 + rng.int(90);
  };

  /** A ring is born in the widest empty space, when there is one about three folds wide (true: it was). */
  const sow = (): boolean => {
    cool = 15 + rng.int(30);
    if (nc >= MAX_CURVES - 2) return false;
    const R = p.sep, gw = Math.ceil(2 / R) + 2, gh = Math.ceil(1 / R) + 2;
    head.fill(-1, 0, gw * gh);
    const cellX = (x: number) => Math.min(gw - 1, Math.max(0, Math.floor((x + 1) / R) + 1));
    const cellY = (y: number) => Math.min(gh - 1, Math.max(0, Math.floor((y + 0.5) / R) + 1));
    for (let i = 0; i < N; i++) { const c = cellY(py[i]) * gw + cellX(px[i]); nxt[i] = head[c]; head[c] = i; }
    const need = 1.6 * R;
    let best = 0, bx = 0, by = 0;
    for (let k = 0; k < 16; k++) {
      let x: number, y: number;
      if (p.bound === 'rect') { x = rng.range(-0.9, 0.9); y = rng.range(-0.4, 0.4); }
      else { const a = rng.next() * Math.PI * 2, r = 0.4 * Math.sqrt(rng.next()); x = r * Math.cos(a); y = r * Math.sin(a); }
      // the room around it: the nearest node, looked for within two cells
      let room = 2 * R;
      const gx = cellX(x), gy = cellY(y);
      for (let yy = gy - 2; yy <= gy + 2; yy++) for (let xx = gx - 2; xx <= gx + 2; xx++) {
        if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
        for (let j = head[yy * gw + xx]; j >= 0; j = nxt[j]) room = Math.min(room, Math.hypot(px[j] - x, py[j] - y));
      }
      if (room > best) { best = room; bx = x; by = y; }
    }
    if (best < need) return false;
    const { lists, closed, dies, borns } = curveLists();
    const pts = ring(bx, by, Math.min(0.045, R * 0.55));
    for (let i = 0; i < pts.length; i++) pts[i] += (rng.next() - 0.5) * 0.002;
    relayout(lists, closed, dies, borns, pts);
    return true;
  };

  // even-odd fill of the closed curves (open ones closed by their chord), scanline by scanline
  let xs = new Float32Array(1024);
  const rowN = new Int32Array(h + 1);
  const fill = (a: Accum, amount: number) => {
    const edges = (fn: (x0: number, y0: number, x1: number, y1: number) => void) => {
      for (let c = 0; c < nc; c++) {
        const s = cStart[c], L = cLen[c];
        for (let k = 0; k < L; k++) {
          const i = s + k, j = s + (k < L - 1 ? k + 1 : 0);
          fn(a.px(px[i]), a.py(py[i]), a.px(px[j]), a.py(py[j]));
        }
      }
    };
    rowN.fill(0);
    const rows = (y0: number, y1: number): [number, number] => {
      const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
      return [Math.max(0, Math.ceil(lo - 0.5)), Math.min(h - 1, Math.ceil(hi - 0.5) - 1)];
    };
    edges((_x0, y0, _x1, y1) => { const [r0, r1] = rows(y0, y1); for (let r = r0; r <= r1; r++) rowN[r + 1]++; });
    for (let r = 0; r < h; r++) rowN[r + 1] += rowN[r];
    if (xs.length < rowN[h]) xs = new Float32Array(rowN[h] * 2);
    const fillAt = rowN.slice(0, h);
    edges((x0, y0, x1, y1) => {
      const [r0, r1] = rows(y0, y1);
      for (let r = r0; r <= r1; r++) { const yc = r + 0.5; xs[fillAt[r]++] = x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0); }
    });
    const d = a.d;
    for (let r = 0; r < h; r++) {
      const seg = xs.subarray(rowN[r], rowN[r + 1]).sort();
      for (let e = 0; e + 1 < seg.length; e += 2) {
        const xa = Math.max(0, seg[e]), xb = Math.min(w, seg[e + 1]);
        for (let x = Math.max(0, Math.floor(xa)); x < Math.min(w, Math.ceil(xb)); x++) {
          const cov = Math.min(x + 1, xb) - Math.max(x, xa);
          if (cov > 0) d[r * w + x] = Math.max(d[r * w + x], amount * Math.min(1, cov));
        }
      }
    }
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = { ...read(np), shape: p.shape, renew: p.renew }; },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      draw.clear();
      if (p.view === 'historia') draw.d.set(hist.d);
      else if (p.view === 'relleno') fill(draw, 0.42);
      strokeInto(draw, lineW(), 1);
      const d = draw.d;
      for (let i = 0; i < d.length; i++) out[i] = byte(d[i]);
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { N, nc, settle, frozen };
      rng.save(scalars);
      const arrays: ModelState['arrays'] = { px: px.slice(), py: py.slice(), cStart: cStart.slice(), cLen: cLen.slice(), cClosed: cClosed.slice(), hist: hist.d.slice() };
      if (renew) { Object.assign(scalars, { cool, filled, barren }); arrays.die = die.slice(); arrays.born = born.slice(); }
      return { id: ID, v: V, steps, res: h, scalars, arrays };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a este crecimiento.');
      const A = s.arrays;
      const ok = A.px instanceof Float32Array && A.px.length === MAX_NODES && A.py instanceof Float32Array && A.py.length === MAX_NODES
        && A.cStart instanceof Int32Array && A.cStart.length === MAX_CURVES && A.cLen instanceof Int32Array && A.cLen.length === MAX_CURVES
        && A.cClosed instanceof Uint8Array && A.cClosed.length === MAX_CURVES && A.hist instanceof Float32Array && A.hist.length === w * h
        && (!renew || (A.die instanceof Uint8Array && A.die.length === MAX_CURVES && A.born instanceof Int32Array && A.born.length === MAX_CURVES));
      if (!ok) throw new Error('El estado guardado está incompleto.');
      px.set(A.px); py.set(A.py); cStart.set(A.cStart); cLen.set(A.cLen); cClosed.set(A.cClosed); hist.d.set(A.hist);
      const c = s.scalars;
      N = Math.min(MAX_NODES, c.N ?? 0); nc = Math.min(MAX_CURVES, c.nc ?? 0); settle = c.settle ?? 0; frozen = c.frozen ?? 0;
      if (renew) { die.set(A.die); born.set(A.born); cool = c.cool ?? 0; filled = c.filled ?? 0; barren = c.barren ?? 0; }
      steps = s.steps;
      rng.load(c);
    },
  };
}
