/**
 * Light: glow (bloom), shadow (drop or long) and vignette.
 * Glow and shadow may add pixels outside the alpha of the layer (a halo, a cast shadow): that is their
 * job. Both work on premultiplied values, so transparent pixels never leak colour into the result.
 */
import { gaussBlur, sample1 } from '../kernels';
import { DEG, luma, rgbOf, smoothstep, type Op } from '../core';

/* ------------------------------------------------------------------ glow */

export const glow: Op = (src, dst, p, run) => {
  const { width: w, height: h } = src;
  const s = src.data, d = dst.data;
  const R = Math.max(0.5, (p.radius as number) * run.scale); // input px
  const th = p.threshold as number, str = p.strength as number;
  const tint = rgbOf(p.tint), screen = p.blend === 'screen';
  // the glow is smooth: compute it on a grid f times coarser (f ≤ R/6), then read it back bilinearly
  const f = Math.max(1, Math.floor(R / 6));
  const lw = Math.ceil(w / f), lh = Math.ceil(h / f), ln = lw * lh;
  const low = run.scratch.f32('glow.low', ln * 4);
  low.fill(0);
  const t0 = th - 0.1, t1 = th + 0.1;
  for (let y = 0; y < h; y++) {
    const row = ((y / f) | 0) * lw;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = s[i + 3];
      if (a === 0) continue;
      const wgt = th <= 0.001 ? 1 : smoothstep(t0, t1, luma(s[i], s[i + 1], s[i + 2]) / 255);
      if (wgt <= 0) continue;
      const k = (row + ((x / f) | 0)) * 4, pa = (a / 255) * wgt;
      low[k] += s[i] * pa; low[k + 1] += s[i + 1] * pa; low[k + 2] += s[i + 2] * pa; low[k + 3] += a * wgt;
    }
  }
  const norm = 1 / (f * f);
  for (let k = 0; k < ln * 4; k++) low[k] *= norm;
  // two octaves: a tight core and a wide halo
  const g2 = run.scratch.f32('glow.g2', ln * 4);
  g2.set(low);
  const tmp = run.scratch.f32('glow.tmp', ln * 4);
  gaussBlur(low, tmp, lw, lh, 4, R / 3.2 / f);
  gaussBlur(g2, tmp, lw, lh, 4, R / 1.3 / f);
  const tr = tint[0] / 255, tg = tint[1] / 255, tb = tint[2] / 255;
  for (let k = 0; k < ln * 4; k += 4) {
    const k0 = 0.6 * str, k1 = 0.55 * str;
    low[k] = (low[k] * k0 + g2[k] * k1) * tr;
    low[k + 1] = (low[k + 1] * k0 + g2[k + 1] * k1) * tg;
    low[k + 2] = (low[k + 2] * k0 + g2[k + 2] * k1) * tb;
    low[k + 3] = low[k + 3] * k0 + g2[k + 3] * k1;
  }
  const gp = new Float32Array(4);
  for (let y = 0; y < h; y++) {
    const ly = (y + 0.5) / f - 0.5;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // bilinear read of the coarse glow
      let lx = (x + 0.5) / f - 0.5, yy = ly;
      if (lx < 0) lx = 0; else if (lx > lw - 1) lx = lw - 1;
      if (yy < 0) yy = 0; else if (yy > lh - 1) yy = lh - 1;
      const x0 = lx | 0, y0 = yy | 0, fx = lx - x0, fy = yy - y0;
      const x1 = x0 + 1 < lw ? x0 + 1 : x0, y1 = y0 + 1 < lh ? y0 + 1 : y0;
      const a00 = (y0 * lw + x0) * 4, a10 = (y0 * lw + x1) * 4, a01 = (y1 * lw + x0) * 4, a11 = (y1 * lw + x1) * 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      for (let c = 0; c < 4; c++) gp[c] = low[a00 + c] * w00 + low[a10 + c] * w10 + low[a01 + c] * w01 + low[a11 + c] * w11;
      const al = s[i + 3] / 255;
      let r = s[i] * al, g = s[i + 1] * al, b = s[i + 2] * al, a = s[i + 3];
      if (screen) { r += gp[0] - (r * gp[0]) / 255; g += gp[1] - (g * gp[1]) / 255; b += gp[2] - (b * gp[2]) / 255; }
      else { r += gp[0]; g += gp[1]; b += gp[2]; }
      // light adds coverage: a halo is as opaque as it is bright
      const ga = Math.max(gp[3], gp[0], gp[1], gp[2]);
      a = a + ga * (1 - al);
      if (a > 255) a = 255;
      if (a < 0.5) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; continue; }
      const k = 255 / a;
      d[i] = r * k; d[i + 1] = g * k; d[i + 2] = b * k; d[i + 3] = a;
    }
  }
};

/* ------------------------------------------------------------------ shadow */

/** dst(p) = src(p − (ox, oy)), bilinear, clamp-to-edge; 1 channel. `sub` is subtracted from the sample. */
function shiftMax1(src: Float32Array, dst: Float32Array, w: number, h: number, ox: number, oy: number, sub: number): void {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = sample1(src, w, h, x - ox, y - oy) - sub, o = y * w + x;
    dst[o] = src[o] > v ? src[o] : v;
  }
}

export const shadow: Op = (src, dst, p, run) => {
  const { width: w, height: h } = src;
  const s = src.data, d = dst.data, n = w * h, scale = run.scale;
  const ang = (p.angle as number) * DEG, dist = (p.distance as number) * scale;
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const col = rgbOf(p.color), op = p.opacity as number;
  const S = run.scratch.f32('sh.a', n);
  for (let i = 0; i < n; i++) S[i] = s[i * 4 + 3] / 255;
  const T = run.scratch.f32('sh.b', n);
  if (p.mode === 'long') {
    // max over the segment [0, dist] behind each pixel by doubling; with fade, the value drops 1/dist per px
    const fade = p.fade === true && dist > 0 ? 1 / dist : 0;
    const L = Math.max(1, Math.round(dist));
    let step = 1;
    while (step * 2 <= L + 1) {
      shiftMax1(S, T, w, h, ux * step, uy * step, fade * step);
      S.set(T);
      step *= 2;
    }
    const rest = L + 1 - step;
    if (rest > 0) { shiftMax1(S, T, w, h, ux * rest, uy * rest, fade * rest); S.set(T); }
  } else if (dist > 0) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) T[y * w + x] = sample1(S, w, h, x - ux * dist, y - uy * dist);
    S.set(T);
  }
  const sigma = ((p.blur as number) * scale) / 2;
  if (sigma > 0.05) gaussBlur(S, T, w, h, 1, sigma);
  for (let i = 0; i < n; i++) {
    const j = i * 4, a = s[j + 3] / 255;
    let sh = S[i] * op;
    sh = sh < 0 ? 0 : sh > 1 ? 1 : sh;
    const ao = a + sh * (1 - a);
    if (ao <= 0) { d[j] = 0; d[j + 1] = 0; d[j + 2] = 0; d[j + 3] = 0; continue; }
    const ks = (sh * (1 - a)) / ao, ka = a / ao;
    d[j] = s[j] * ka + col[0] * ks; d[j + 1] = s[j + 1] * ka + col[1] * ks; d[j + 2] = s[j + 2] * ka + col[2] * ks;
    d[j + 3] = ao * 255;
  }
};

/* ------------------------------------------------------------------ vignette */

export const vignette: Op = (src, dst, p) => {
  const { width: w, height: h } = src;
  const s = src.data, d = dst.data;
  const amount = p.amount as number, size = p.size as number, soft = p.soft as number, round = p.round as number;
  const col = rgbOf(p.color);
  // normalised radius: 1 at the middle of each edge for a frame-shaped vignette; a circle when round = 1
  const m = Math.max(w, h);
  const sx = 1 + (w / m - 1) * round, sy = 1 + (h / m - 1) * round;
  const e0 = size, e1 = size + soft;
  const fy = new Float32Array(h);
  for (let y = 0; y < h; y++) { const v = ((y + 0.5) / h * 2 - 1) * sy; fy[y] = v * v; }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w * 2 - 1) * sx;
      const r = Math.sqrt(u * u + fy[y]);
      const k = smoothstep(e0, e1, r) * amount;
      const i = (y * w + x) * 4;
      d[i] = s[i] + (col[0] - s[i]) * k; d[i + 1] = s[i + 1] + (col[1] - s[i + 1]) * k; d[i + 2] = s[i + 2] + (col[2] - s[i + 2]) * k;
      d[i + 3] = s[i + 3];
    }
  }
};
