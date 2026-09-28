/**
 * Print screens and line art: halftone (one screen or four CMYK screens), crosshatch, pixelate, edges.
 *
 * Geometry is computed in OUTPUT pixels — X = (x + 0.5) / scale — so the screen of a half-size preview
 * lies exactly where the final render puts it; anti-aliasing uses the true input pixel width (1 / scale
 * output px). The tone that drives a cell is read from a premultiplied Gaussian-blurred copy of the
 * image at the cell centre (an area average), so dots do not shimmer with the fine detail inside a cell.
 */
import { binomial3, coarseTone, expandCoarse2, gaussBlur, maxFilter, readCoarse } from '../kernels';
import { DEG, luma, rgbOf, sat, type Img, type Op, type RGB, type Run } from '../core';

/* ------------------------------------------------------------------ tone → ink */

const lum01 = (c: RGB) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

/**
 * How much ink a tone l (0..1) needs: the share of ink whose mix with the paper has that brightness, so
 * light ink on dark paper draws the lights. With the picture's own colours as ink (`ink` null) the ink is
 * as bright as the tone, and the share grows with the distance from the paper's brightness instead.
 */
export function inkShareFor(ink: RGB | null, paper: RGB): (l: number) => number {
  const lp = lum01(paper);
  if (!ink) { const k = 1 / Math.max(lp, 1 - lp, 0.5); return l => sat(Math.abs(l - lp) * k); }
  const li = lum01(ink);
  if (Math.abs(lp - li) < 0.08) return l => 1 - l;
  return l => sat((lp - l) / (lp - li));
}

/* ------------------------------------------------------------------ halftone */

/** Dot radius (cell units) whose union with its neighbours covers roughly `d` of the cell. */
function dotRadius(d: number, rmax: number): number {
  const knee = Math.PI / 4;
  return d <= knee ? Math.sqrt(d / Math.PI) : 0.5 + ((d - knee) / (1 - knee)) * (rmax - 0.5);
}

interface Screen {
  cos: number; sin: number;
  /** grid of per-cell values (darkness or radius), and its origin in cell indices */
  g: Float32Array; gi0: number; gj0: number; gw: number; gh: number;
  /** per-cell straight colour (colour mode 'fuente') */
  col: Float32Array | null;
}

const CMYK_INKS: RGB[] = [[0, 174, 239], [236, 0, 140], [255, 242, 0], [35, 31, 32]];

export const halftone: Op = (src, dst, p, run) => {
  const { width: w, height: h } = src;
  const s = src.data, d = dst.data;
  const scale = run.scale;
  const cell = 100 / (p.freq as number); // output px
  const shape = p.shape as string, mode = p.color as string;
  const contrast = p.contrast as number, bright = p.bright as number, clear = p.clear === true;
  const ink = rgbOf(p.ink), paper = rgbOf(p.paper);
  const W = w / scale, H = h / scale, cx = W / 2, cy = H / 2;
  const rgbTone = mode !== 'tinta';

  // the tone of a cell is the average around its centre: a smooth coarse copy, read at the centres
  const tone = coarseTone(s, w, h, cell * scale * 0.38, rgbTone ? 4 : 2, n => run.scratch.f32('ht.c', n), n => run.scratch.f32('ht.t', n));
  const tmp = new Float32Array(4);

  const angles = mode === 'cmyk'
    ? [-30, 30, -45, 0].map(a => (p.angle as number) + a)
    : [p.angle as number];
  const round = shape === 'dot' || shape === 'ellipse';
  const rmax = shape === 'ellipse' ? 0.75 : 0.7072;
  const inkShare = inkShareFor(mode === 'fuente' ? null : ink, paper);

  const screens: Screen[] = angles.map((deg, si) => {
    const cos = Math.cos(deg * DEG), sin = Math.sin(deg * DEG);
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    for (const [X, Y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const u = (X - cx) * cos + (Y - cy) * sin, v = -(X - cx) * sin + (Y - cy) * cos;
      umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
    }
    const gi0 = Math.floor(umin / cell) - 2, gj0 = Math.floor(vmin / cell) - 2;
    const gw = Math.floor(umax / cell) + 3 - gi0, gh = Math.floor(vmax / cell) + 3 - gj0;
    const g = new Float32Array(gw * gh);
    const col = mode === 'fuente' ? new Float32Array(gw * gh * 3) : null;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const uc = (i + gi0 + 0.5) * cell, vc = (j + gj0 + 0.5) * cell;
      const X = cx + uc * cos - vc * sin, Y = cy + uc * sin + vc * cos;
      readCoarse(tone, X * scale - 0.5, Y * scale - 0.5, tmp);
      let dark = 0, a = 0;
      if (rgbTone) {
        a = tmp[3] / 255;
        if (a > 0.004) {
          const r = tmp[0] / tmp[3], gg = tmp[1] / tmp[3], b = tmp[2] / tmp[3]; // 0..1
          if (mode === 'cmyk') {
            const c = 1 - r, m = 1 - gg, y = 1 - b;
            const k = Math.min(c, m, y) * 0.9;
            dark = si === 3 ? k : k < 1 ? ([c, m, y][si] - k) / (1 - k) : 0;
          } else dark = inkShare(0.299 * r + 0.587 * gg + 0.114 * b);
          if (col) { const o = (j * gw + i) * 3; col[o] = r * 255; col[o + 1] = gg * 255; col[o + 2] = b * 255; }
        }
      } else {
        a = tmp[1];
        if (a > 0.004) dark = inkShare(tmp[0] / a);
      }
      if (a > 0.004) dark = sat((dark - 0.5) * contrast + 0.5 - bright) * Math.min(1, a * 1.5);
      g[j * gw + i] = round ? (dark > 0.002 ? dotRadius(dark, rmax) : -1) : dark;
    }
    return { cos, sin, g, gi0, gj0, gw, gh, col };
  });

  const inv = scale * cell; // cell units → input px (coverage ramps over one input pixel)
  let winner = 0; // cell index of the strongest candidate (for colour)

  /** Ink coverage of the screen at cell coordinates (u, v). */
  const coverage = (sc: Screen, u: number, v: number): number => {
    const fi = Math.floor(u), fj = Math.floor(v);
    const lx = u - fi - 0.5, ly = v - fj - 0.5;
    const gw = sc.gw, g = sc.g;
    const own = (fj - sc.gj0) * gw + fi - sc.gi0;
    winner = own;
    if (round) {
      // union of the own disc and the three neighbours towards this corner
      const si = lx < 0 ? -1 : 1, sj = ly < 0 ? -gw : gw;
      const dxa = lx - si, dyb = ly - (sj > 0 ? 1 : -1);
      let best = -1e9, r: number, dist: number, c: number;
      const ell = shape === 'ellipse';
      r = g[own];
      if (r > 0) { dist = ell ? Math.sqrt(lx * lx * 0.64 + ly * ly * 1.5625) : Math.sqrt(lx * lx + ly * ly); c = r - dist; if (c > best) best = c; }
      r = g[own + si];
      if (r > 0) { dist = ell ? Math.sqrt(dxa * dxa * 0.64 + ly * ly * 1.5625) : Math.sqrt(dxa * dxa + ly * ly); c = r - dist; if (c > best) { best = c; winner = own + si; } }
      r = g[own + sj];
      if (r > 0) { dist = ell ? Math.sqrt(lx * lx * 0.64 + dyb * dyb * 1.5625) : Math.sqrt(lx * lx + dyb * dyb); c = r - dist; if (c > best) { best = c; winner = own + sj; } }
      r = g[own + si + sj];
      if (r > 0) { dist = ell ? Math.sqrt(dxa * dxa * 0.64 + dyb * dyb * 1.5625) : Math.sqrt(dxa * dxa + dyb * dyb); c = r - dist; if (c > best) { best = c; winner = own + si + sj; } }
      return best === -1e9 ? 0 : sat(best * inv + 0.5);
    }
    const ax = lx < 0 ? -lx : lx, ay = ly < 0 ? -ly : ly;
    if (shape === 'square') return sat((Math.sqrt(g[own]) * 0.5 - (ax > ay ? ax : ay)) * inv + 0.5);
    if (shape === 'cross') return sat(((1 - Math.sqrt(1 - g[own])) * 0.5 - (ax < ay ? ax : ay)) * inv + 0.5);
    // line: thickness follows the tone along the line (interpolated between cell centres)
    const dk = g[own] * (1 - ax) + g[lx < 0 ? own - 1 : own + 1] * ax;
    return sat((dk * 0.5 - ay) * inv + 0.5);
  };

  const U0 = new Float64Array(screens.length), V0 = new Float64Array(screens.length);
  const DU = screens.map(sc => sc.cos / scale / cell), DV = screens.map(sc => -sc.sin / scale / cell);
  for (let y = 0; y < h; y++) {
    const Y = (y + 0.5) / scale - cy;
    screens.forEach((sc, k) => {
      const X = 0.5 / scale - cx;
      U0[k] = (X * sc.cos + Y * sc.sin) / cell; V0[k] = (-X * sc.sin + Y * sc.cos) / cell;
    });
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = s[i + 3];
      if (a === 0) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; continue; }
      if (mode === 'cmyk') {
        let r = clear ? 255 : paper[0], g = clear ? 255 : paper[1], b = clear ? 255 : paper[2], keep = 1;
        for (let k = 0; k < 4; k++) {
          const c = coverage(screens[k], U0[k] + x * DU[k], V0[k] + x * DV[k]);
          keep *= 1 - c;
          const ik = CMYK_INKS[k];
          r *= 1 - c * (1 - ik[0] / 255); g *= 1 - c * (1 - ik[1] / 255); b *= 1 - c * (1 - ik[2] / 255);
        }
        if (clear) {
          const al = 1 - keep;
          if (al < 1e-3) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; continue; }
          // un-composite from white: the colour whose «over white» gives (r, g, b)
          d[i] = (r - 255 * (1 - al)) / al; d[i + 1] = (g - 255 * (1 - al)) / al; d[i + 2] = (b - 255 * (1 - al)) / al;
          d[i + 3] = a * al;
        } else { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; }
        continue;
      }
      const c = coverage(screens[0], U0[0] + x * DU[0], V0[0] + x * DV[0]);
      let ir = ink[0], ig = ink[1], ib = ink[2];
      if (mode === 'fuente') {
        const col = screens[0].col!;
        ir = col[winner * 3]; ig = col[winner * 3 + 1]; ib = col[winner * 3 + 2];
      }
      if (clear) { d[i] = ir; d[i + 1] = ig; d[i + 2] = ib; d[i + 3] = a * c; }
      else {
        d[i] = paper[0] + (ir - paper[0]) * c; d[i + 1] = paper[1] + (ig - paper[1]) * c; d[i + 2] = paper[2] + (ib - paper[2]) * c;
        d[i + 3] = a;
      }
    }
  }
};

/* ------------------------------------------------------------------ crosshatch */

const HATCH_ANGLES = [0, 90, 45, -45];

export const crosshatch: Op = (src, dst, p, run) => {
  const { width: w, height: h } = src;
  const s = src.data, d = dst.data, scale = run.scale;
  const sp = p.spacing as number, maxW = p.width as number, layers = Math.round(p.layers as number);
  const wob = (p.wobble as number) * sp * 0.22;
  const ink = rgbOf(p.ink), paper = rgbOf(p.paper), clear = p.clear === true, fromSrc = p.color === 'fuente';

  // tone: premultiplied luma + alpha, averaged over about a third of the spacing
  const tone = coarseTone(s, w, h, sp * scale * 0.33, 2, n => run.scratch.f32('hatch.c', n), n => run.scratch.f32('hatch.t', n));
  const darkMap = run.scratch.f32('hatch.d', w * h);
  const share = inkShareFor(fromSrc ? null : ink, paper), bright = p.bright as number;
  expandCoarse2(tone, w, h, darkMap, bright === 0 ? share : l => sat(share(l) - bright));

  const lo = 0.1, band = (1 - lo) / layers;
  const L = layers;
  const cs = HATCH_ANGLES.slice(0, L).map(a => Math.cos(((p.angle as number) + a) * DEG));
  const sn = HATCH_ANGLES.slice(0, L).map(a => Math.sin(((p.angle as number) + a) * DEG));
  const phase = [0, 0.37, 0.71, 0.13];
  const wf = (2 * Math.PI) / (sp * 7.3);
  const invSp = 1 / sp, dx = 1 / scale;
  // the wobble sin((X·cos + Y·sin)·wf + k·1.7) advances by a fixed angle per pixel: rotate (sin, cos)
  const ws = new Float64Array(L), wc = new Float64Array(L), rs = new Float64Array(L), rc = new Float64Array(L);
  for (let k = 0; k < L; k++) { rs[k] = Math.sin(cs[k] * dx * wf); rc[k] = Math.cos(cs[k] * dx * wf); }
  for (let y = 0; y < h; y++) {
    const Y = (y + 0.5) / scale;
    for (let k = 0; k < L; k++) { const a0 = (0.5 * dx * cs[k] + Y * sn[k]) * wf + k * 1.7; ws[k] = Math.sin(a0); wc[k] = Math.cos(a0); }
    for (let x = 0; x < w; x++) {
      if (x > 0 && wob > 0) for (let k = 0; k < L; k++) {
        const sa = ws[k], ca = wc[k];
        ws[k] = sa * rc[k] + ca * rs[k]; wc[k] = ca * rc[k] - sa * rs[k];
      }
      const i = y * w + x, j = i * 4, a = s[j + 3];
      if (a === 0) { d[j] = 0; d[j + 1] = 0; d[j + 2] = 0; d[j + 3] = 0; continue; }
      const X = (x + 0.5) * dx;
      const dark = darkMap[i];
      if (dark <= lo) {
        if (clear) { d[j] = ink[0]; d[j + 1] = ink[1]; d[j + 2] = ink[2]; d[j + 3] = 0; }
        else { d[j] = paper[0]; d[j + 1] = paper[1]; d[j + 2] = paper[2]; d[j + 3] = a; }
        continue;
      }
      let keep = 1;
      for (let k = 0; k < L; k++) {
        const t = (dark - lo - k * band) / (band * 1.35);
        if (t <= 0) continue;
        const half = maxW * sp * 0.5 * (t > 1 ? 1 : t);
        const v = -X * sn[k] + Y * cs[k] + wob * ws[k];
        const q = v * invSp + phase[k];
        const fr = q - Math.floor(q + 0.5);
        const dist = (fr < 0 ? -fr : fr) * sp; // output px to the line centre
        const c = (half - dist) * scale + 0.5;
        if (c > 0) keep *= c >= 1 ? 0 : 1 - c;
      }
      const cov = 1 - keep;
      let ir = ink[0], ig = ink[1], ib = ink[2];
      if (fromSrc) { ir = s[j]; ig = s[j + 1]; ib = s[j + 2]; }
      if (clear) { d[j] = ir; d[j + 1] = ig; d[j + 2] = ib; d[j + 3] = a * cov; }
      else {
        d[j] = paper[0] + (ir - paper[0]) * cov; d[j + 1] = paper[1] + (ig - paper[1]) * cov; d[j + 2] = paper[2] + (ib - paper[2]) * cov;
        d[j + 3] = a;
      }
    }
  }
};

/* ------------------------------------------------------------------ pixelate */

export const pixelate: Op = (src, dst, p, run) => {
  const { width: w, height: h } = src;
  const s = src.data, d = dst.data, scale = run.scale;
  const size = p.size as number; // output px
  const gap = p.gap as number, circle = p.shape === 'circle';
  const cols = Math.ceil(w / scale / size) + 1, rows = Math.ceil(h / scale / size) + 1;
  const colOf = run.scratch.i32('pix.c', w), rowOf = run.scratch.i32('pix.r', h);
  const fxOf = run.scratch.f32('pix.fx', w), fyOf = run.scratch.f32('pix.fy', h);
  for (let x = 0; x < w; x++) { const q = (x + 0.5) / scale / size; colOf[x] = Math.floor(q); fxOf[x] = q - Math.floor(q); }
  for (let y = 0; y < h; y++) { const q = (y + 0.5) / scale / size; rowOf[y] = Math.floor(q); fyOf[y] = q - Math.floor(q); }
  const sums = run.scratch.f32('pix.s', cols * rows * 5);
  sums.fill(0);
  for (let y = 0; y < h; y++) {
    const r = rowOf[y] * cols;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = s[i + 3], k = (r + colOf[x]) * 5;
      sums[k] += s[i] * a; sums[k + 1] += s[i + 1] * a; sums[k + 2] += s[i + 2] * a; sums[k + 3] += a; sums[k + 4] += 1;
    }
  }
  const edge = 0.5 - gap / 2, inv = size * scale; // cell units → input px
  const shaped = gap > 0 || circle;
  for (let y = 0; y < h; y++) {
    const r = rowOf[y] * cols, fy = fyOf[y] - 0.5;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, k = (r + colOf[x]) * 5, a = sums[k + 3];
      let cov = 1;
      if (shaped) {
        const fx = fxOf[x] - 0.5;
        cov = circle
          ? sat((edge - Math.sqrt(fx * fx + fy * fy)) * inv + 0.5)
          : sat((edge - Math.abs(fx)) * inv + 0.5) * sat((edge - Math.abs(fy)) * inv + 0.5);
      }
      if (a <= 0) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; continue; }
      d[i] = sums[k] / a; d[i + 1] = sums[k + 1] / a; d[i + 2] = sums[k + 2] / a;
      d[i + 3] = (a / sums[k + 4]) * cov;
    }
  }
};

/* ------------------------------------------------------------------ edges */

/** Edge strength 0..1 per pixel (Sobel on premultiplied luma and on alpha), thickened and anti-aliased. */
export function edgeMap(src: Img, run: Run, threshold: number, width: number): Float32Array {
  const { width: w, height: h } = src;
  const s = src.data, n = w * h, scale = run.scale;
  const Lu = run.scratch.f32('edge.l', n), Al = run.scratch.f32('edge.a', n);
  for (let i = 0; i < n; i++) { const j = i * 4, a = s[j + 3]; Lu[i] = luma(s[j], s[j + 1], s[j + 2]) * (a / 255); Al[i] = a; }
  // a light pre-blur (σ ≈ 0.7 output px) so photo noise does not become edges
  const tmp = run.scratch.f32('edge.t', n);
  const sigma = 0.7 * scale;
  if (sigma > 0.55 && sigma < 0.9) { binomial3(Lu, tmp, w, h); binomial3(Al, tmp, w, h); }
  else if (sigma > 0.35) { gaussBlur(Lu, tmp, w, h, 1, sigma); gaussBlur(Al, tmp, w, h, 1, sigma); }
  const E = run.scratch.f32('edge.e', n);
  const t0 = 0.03 + threshold * 0.55, t1 = t0 + 0.1, span = 1 / (t1 - t0);
  const k = 1 / 1020, ka = 0.8 / 1020;
  for (let y = 0; y < h; y++) {
    const rm = (y > 0 ? y - 1 : 0) * w, r0 = y * w, rp = (y < h - 1 ? y + 1 : h - 1) * w;
    for (let x = 0; x < w; x++) {
      const xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : w - 1;
      let gx = Lu[rm + xp] + 2 * Lu[r0 + xp] + Lu[rp + xp] - Lu[rm + xm] - 2 * Lu[r0 + xm] - Lu[rp + xm];
      let gy = Lu[rp + xm] + 2 * Lu[rp + x] + Lu[rp + xp] - Lu[rm + xm] - 2 * Lu[rm + x] - Lu[rm + xp];
      const ml = (gx * gx + gy * gy) * k * k;
      gx = Al[rm + xp] + 2 * Al[r0 + xp] + Al[rp + xp] - Al[rm + xm] - 2 * Al[r0 + xm] - Al[rp + xm];
      gy = Al[rp + xm] + 2 * Al[rp + x] + Al[rp + xp] - Al[rm + xm] - 2 * Al[rm + x] - Al[rm + xp];
      const ma = (gx * gx + gy * gy) * ka * ka;
      const m = Math.sqrt(ml > ma ? ml : ma);
      let t = (m - t0) * span;
      t = t <= 0 ? 0 : t >= 1 ? 1 : t;
      E[r0 + x] = t * t * (3 - 2 * t);
    }
  }
  const wIn = width * scale;
  if (wIn > 1.5) {
    maxFilter(E, tmp, w, h, Math.round((wIn - 1) / 2));
    gaussBlur(E, tmp, w, h, 1, 0.45);
  } else if (wIn < 1) for (let i = 0; i < n; i++) E[i] *= wIn;
  return E;
}

export const edges: Op = (src, dst, p, run) => {
  const s = src.data, d = dst.data, n = src.width * src.height;
  const E = edgeMap(src, run, p.threshold as number, p.width as number);
  const col = rgbOf(p.color), paper = rgbOf(p.paper), mode = p.mode as string;
  for (let i = 0; i < n; i++) {
    const j = i * 4, e = E[i];
    if (mode === 'solo') { d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = e * 255; continue; }
    // the line over the base (the paper inside the silhouette, or the picture): premultiplied «over»
    const a = s[j + 3] / 255, boceto = mode === 'boceto';
    const ao = e + a * (1 - e);
    if (ao <= 0) { d[j] = 0; d[j + 1] = 0; d[j + 2] = 0; d[j + 3] = 0; continue; }
    const kb = (a * (1 - e)) / ao, kl = e / ao;
    d[j] = (boceto ? paper[0] : s[j]) * kb + col[0] * kl;
    d[j + 1] = (boceto ? paper[1] : s[j + 1]) * kb + col[1] * kl;
    d[j + 2] = (boceto ? paper[2] : s[j + 2]) * kb + col[2] * kl;
    d[j + 3] = ao * 255;
  }
};
