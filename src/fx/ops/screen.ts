/**
 * Print screens and line art: halftone (one screen or four CMYK screens), crosshatch, pixelate, edges.
 *
 * Geometry is computed in OUTPUT pixels — X = (x + 0.5) / scale — so the screen of a half-size preview
 * lies exactly where the final render puts it; anti-aliasing uses the true input pixel width (1 / scale
 * output px). The tone that drives a cell is read from a premultiplied Gaussian-blurred copy of the
 * image at the cell centre (an area average), so dots do not shimmer with the fine detail inside a cell.
 */
import { gaussBlur, maxFilter, sample4 } from '../kernels';
import { DEG, luma, rgbOf, sat, smoothstep, toPremul, type Img, type Op, type RGB, type Run } from '../core';

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
  const s = src.data, d = dst.data, n = w * h;
  const scale = run.scale;
  const cell = 100 / (p.freq as number); // output px
  const shape = p.shape as string, mode = p.color as string;
  const contrast = p.contrast as number, clear = p.clear === true;
  const ink = rgbOf(p.ink), paper = rgbOf(p.paper);
  const W = w / scale, H = h / scale, cx = W / 2, cy = H / 2;

  // blurred premultiplied copy: the tone of a cell is the average around its centre
  const buf = toPremul(src, run.scratch.f32('f4.a', n * 4));
  gaussBlur(buf, run.scratch.f32('f4.b', n * 4), w, h, 4, cell * scale * 0.38);
  const tmp = new Float32Array(4);

  const angles = mode === 'cmyk'
    ? [-30, 30, -45, 0].map(a => (p.angle as number) + a)
    : [p.angle as number];
  const rmax = shape === 'ellipse' ? 0.75 : 0.7072;

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
      sample4(buf, w, h, X * scale - 0.5, Y * scale - 0.5, tmp, 0);
      const a = tmp[3];
      let dark = 0;
      if (a > 1) {
        const r = tmp[0] / a, gg = tmp[1] / a, b = tmp[2] / a; // 0..1
        if (mode === 'cmyk') {
          const c = 1 - r, m = 1 - gg, y = 1 - b;
          const k = Math.min(c, m, y) * 0.9;
          const v = si === 3 ? k : k < 1 ? ([c, m, y][si] - k) / (1 - k) : 0;
          dark = v;
        } else dark = 1 - (0.299 * r + 0.587 * gg + 0.114 * b);
        if (col) { col[(j * gw + i) * 3] = r * 255; col[(j * gw + i) * 3 + 1] = gg * 255; col[(j * gw + i) * 3 + 2] = b * 255; }
        dark = sat((dark - 0.5) * contrast + 0.5) * Math.min(1, a / 255 * 1.5);
      }
      g[j * gw + i] = shape === 'dot' || shape === 'ellipse' ? (dark > 0.002 ? dotRadius(dark, rmax) : -1) : dark;
    }
    return { cos, sin, g, gi0, gj0, gw, gh, col };
  });

  const pxc = 1 / (scale * cell); // one input pixel in cell units
  const inv = 1 / pxc;
  let winner = 0; // cell index of the strongest candidate (for colour)

  const coverage = (sc: Screen, X: number, Y: number): number => {
    const u = ((X - cx) * sc.cos + (Y - cy) * sc.sin) / cell, v = (-(X - cx) * sc.sin + (Y - cy) * sc.cos) / cell;
    const fi = Math.floor(u), fj = Math.floor(v);
    const lx = u - fi - 0.5, ly = v - fj - 0.5;
    const i = fi - sc.gi0, j = fj - sc.gj0, gw = sc.gw, g = sc.g;
    const own = j * gw + i;
    winner = own;
    switch (shape) {
      case 'square': {
        const half = Math.sqrt(g[own]) * 0.5;
        return sat((half - Math.max(Math.abs(lx), Math.abs(ly))) * inv + 0.5);
      }
      case 'cross': {
        const wv = (1 - Math.sqrt(1 - g[own])) * 0.5;
        return sat((wv - Math.min(Math.abs(lx), Math.abs(ly))) * inv + 0.5);
      }
      case 'line': {
        // thickness follows the tone along the line (interpolated between cell centres)
        const nb = lx < 0 ? own - 1 : own + 1, t = Math.abs(lx);
        const dk = g[own] * (1 - t) + g[nb] * t;
        return sat((dk * 0.5 - Math.abs(ly)) * inv + 0.5);
      }
      default: {
        // dot / ellipse: union of the own disc and the three neighbours towards this corner
        const si = lx < 0 ? -1 : 1, sj = ly < 0 ? -1 : 1;
        const ell = shape === 'ellipse';
        let best = 0;
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
          const k = own + a * si + b * sj * gw;
          const r = g[k];
          if (r <= 0) continue;
          const dx = lx - a * si, dy = ly - b * sj;
          const dist = ell ? Math.sqrt((dx * dx) / 1.5625 + (dy * dy) / 0.64) : Math.sqrt(dx * dx + dy * dy);
          const c = (r - dist) * inv + 0.5;
          if (c > best) { best = c; winner = k; }
        }
        return best > 1 ? 1 : best;
      }
    }
  };

  const covs = new Float32Array(4);
  for (let y = 0; y < h; y++) {
    const Y = (y + 0.5) / scale;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = s[i + 3];
      if (a === 0) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; continue; }
      const X = (x + 0.5) / scale;
      if (mode === 'cmyk') {
        let r = clear ? 255 : paper[0], g = clear ? 255 : paper[1], b = clear ? 255 : paper[2], keep = 1;
        for (let k = 0; k < 4; k++) {
          const c = coverage(screens[k], X, Y);
          covs[k] = c; keep *= 1 - c;
          const ik = CMYK_INKS[k];
          r *= 1 - c * (1 - ik[0] / 255); g *= 1 - c * (1 - ik[1] / 255); b *= 1 - c * (1 - ik[2] / 255);
        }
        if (clear) {
          const al = 1 - keep;
          if (al < 1e-3) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; continue; }
          // un-composite from white: colour whose "over white" gives (r, g, b)
          d[i] = (r - 255 * (1 - al)) / al; d[i + 1] = (g - 255 * (1 - al)) / al; d[i + 2] = (b - 255 * (1 - al)) / al;
          d[i + 3] = a * al;
        } else { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; }
        continue;
      }
      const c = coverage(screens[0], X, Y);
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
  const s = src.data, d = dst.data, n = w * h, scale = run.scale;
  const sp = p.spacing as number, maxW = p.width as number, layers = Math.round(p.layers as number);
  const wob = (p.wobble as number) * sp * 0.22;
  const ink = rgbOf(p.ink), paper = rgbOf(p.paper), clear = p.clear === true, fromSrc = p.color === 'fuente';

  // tone: premultiplied luma + alpha, blurred over about a third of the spacing
  const tone = run.scratch.f32('hatch.t', n * 2);
  for (let i = 0; i < n; i++) { const j = i * 4, a = s[j + 3] / 255; tone[i * 2] = luma(s[j], s[j + 1], s[j + 2]) / 255 * a; tone[i * 2 + 1] = a; }
  gaussBlur(tone, run.scratch.f32('hatch.b', n * 2), w, h, 2, sp * scale * 0.33);

  const lo = 0.1, band = (1 - lo) / layers;
  const L = layers;
  const cs = HATCH_ANGLES.slice(0, L).map(a => Math.cos(((p.angle as number) + a) * DEG));
  const sn = HATCH_ANGLES.slice(0, L).map(a => Math.sin(((p.angle as number) + a) * DEG));
  const phase = [0, 0.37, 0.71, 0.13];
  const wf = (2 * Math.PI) / (sp * 7.3);
  for (let y = 0; y < h; y++) {
    const Y = (y + 0.5) / scale;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, j = i * 4, a = s[j + 3];
      if (a === 0) { d[j] = 0; d[j + 1] = 0; d[j + 2] = 0; d[j + 3] = 0; continue; }
      const X = (x + 0.5) / scale;
      const ta = tone[i * 2 + 1];
      const dark = ta > 1e-4 ? 1 - tone[i * 2] / ta : 0;
      let keep = 1;
      for (let k = 0; k < L; k++) {
        const t = (dark - lo - k * band) / (band * 1.35);
        if (t <= 0) continue;
        const half = maxW * sp * 0.5 * (t > 1 ? 1 : t);
        const u = X * cs[k] + Y * sn[k];
        let v = -X * sn[k] + Y * cs[k];
        if (wob > 0) v += wob * Math.sin(u * wf + k * 1.7);
        const q = v / sp + phase[k];
        const dist = Math.abs(q - Math.round(q)) * sp; // output px to the line centre
        const c = sat((half - dist) * scale + 0.5);
        keep *= 1 - c;
      }
      const cov = 1 - keep;
      let ir = ink[0], ig = ink[1], ib = ink[2];
      if (fromSrc) { ir = s[j] * 0.7; ig = s[j + 1] * 0.7; ib = s[j + 2] * 0.7; }
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
  const L = run.scratch.f32('edge.l', n * 2);
  for (let i = 0; i < n; i++) { const j = i * 4, a = s[j + 3] / 255; L[i * 2] = luma(s[j], s[j + 1], s[j + 2]) * a; L[i * 2 + 1] = s[j + 3]; }
  // a light pre-blur (in output px) so photo noise does not become edges
  gaussBlur(L, run.scratch.f32('edge.b', n * 2), w, h, 2, 0.7 * scale);
  const E = run.scratch.f32('edge.e', n);
  const t0 = 0.03 + threshold * 0.55, t1 = t0 + 0.1;
  // Sobel responds to a step per pixel: a smooth ramp is steeper at a smaller scale; normalise by it a little
  const k = 1 / 1020;
  for (let y = 0; y < h; y++) {
    const ym = y > 0 ? y - 1 : 0, yp = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : w - 1;
      let m = 0;
      for (let c = 0; c < 2; c++) {
        const tl = L[(ym * w + xm) * 2 + c], tc = L[(ym * w + x) * 2 + c], tr = L[(ym * w + xp) * 2 + c];
        const ml = L[(y * w + xm) * 2 + c], mr = L[(y * w + xp) * 2 + c];
        const bl = L[(yp * w + xm) * 2 + c], bc = L[(yp * w + x) * 2 + c], br = L[(yp * w + xp) * 2 + c];
        const gx = tr + 2 * mr + br - tl - 2 * ml - bl, gy = bl + 2 * bc + br - tl - 2 * tc - tr;
        const v = Math.sqrt(gx * gx + gy * gy) * k * (c === 1 ? 0.8 : 1);
        if (v > m) m = v;
      }
      E[y * w + x] = smoothstep(t0, t1, m);
    }
  }
  const wIn = width * scale;
  if (wIn > 1.5) {
    maxFilter(E, run.scratch.f32('edge.t', n), w, h, Math.round((wIn - 1) / 2));
    gaussBlur(E, run.scratch.f32('edge.t', n), w, h, 1, 0.45);
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
