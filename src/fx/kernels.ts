/**
 * Filters shared by several finishes: a Gaussian blur made of three "extended box" passes per axis
 * (O(1) per pixel whatever the radius, continuous in the radius), a bilinear sampler of premultiplied
 * float buffers and a separable max filter.
 *
 * Float buffers hold `ch` interleaved channels per pixel (1 for masks, 4 for premultiplied RGBA).
 */

/**
 * Radius r and fractional weight α of three equal extended boxes whose convolution has standard
 * deviation `sigma`. An extended box of radius r + α averages 2r + 1 samples plus α of the next one on
 * each side, so the blur grows smoothly with sigma instead of in whole-pixel jumps.
 */
export function boxFor(sigma: number): { r: number; a: number } {
  const target = (sigma * sigma) / 3;
  if (!(target > 0)) return { r: 0, a: 0 };
  // variance of an integer box of radius r: r(r+1)/3
  let r = Math.floor((Math.sqrt(1 + 12 * target) - 1) / 2);
  if (r < 0) r = 0;
  const s2 = (r * (r + 1) * (2 * r + 1)) / 3; // 2 Σ k², k = 1..r
  const n = 2 * r + 1;
  // (s2 + 2α(r+1)²) / (n + 2α) = target
  const denom = 2 * (r + 1) * (r + 1) - 2 * target;
  let a = denom > 1e-9 ? (target * n - s2) / denom : 0;
  if (a < 0) a = 0; if (a > 1) a = 1;
  return { r, a };
}

/**
 * One horizontal extended-box pass, clamp-to-edge. All channels of a pixel advance together (sequential
 * memory); the clamped indices are only computed near the ends of the row.
 */
function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, ch: number, r: number, a: number, sums: Float64Array): void {
  const norm = 1 / (2 * r + 1 + 2 * a);
  const last = w - 1;
  const cl = (x: number) => (x < 0 ? 0 : x > last ? last : x);
  for (let y = 0; y < h; y++) {
    const row = y * w * ch;
    for (let c = 0; c < ch; c++) {
      let t = 0;
      for (let k = -r; k <= r; k++) t += src[row + cl(k) * ch + c];
      sums[c] = t;
    }
    // x in [r + 1, w − r − 2] needs no clamping
    const x0 = Math.min(w, r + 1), x1 = Math.max(x0, w - r - 1);
    for (let x = 0; x < x0; x++) {
      const lo = row + cl(x - r - 1) * ch, hi = row + cl(x + r + 1) * ch, out = row + cl(x - r) * ch, o = row + x * ch;
      for (let c = 0; c < ch; c++) {
        const vhi = src[hi + c];
        dst[o + c] = (sums[c] + a * (src[lo + c] + vhi)) * norm;
        sums[c] += vhi - src[out + c];
      }
    }
    if (ch === 4) {
      let s0 = sums[0], s1 = sums[1], s2 = sums[2], s3 = sums[3];
      let lo = row + (x0 - r - 1) * 4, hi = row + (x0 + r + 1) * 4, out = row + (x0 - r) * 4, o = row + x0 * 4;
      for (let x = x0; x < x1; x++) {
        const h0 = src[hi], h1 = src[hi + 1], h2 = src[hi + 2], h3 = src[hi + 3];
        dst[o] = (s0 + a * (src[lo] + h0)) * norm;
        dst[o + 1] = (s1 + a * (src[lo + 1] + h1)) * norm;
        dst[o + 2] = (s2 + a * (src[lo + 2] + h2)) * norm;
        dst[o + 3] = (s3 + a * (src[lo + 3] + h3)) * norm;
        s0 += h0 - src[out]; s1 += h1 - src[out + 1]; s2 += h2 - src[out + 2]; s3 += h3 - src[out + 3];
        lo += 4; hi += 4; out += 4; o += 4;
      }
      sums[0] = s0; sums[1] = s1; sums[2] = s2; sums[3] = s3;
    } else if (ch === 1) {
      let s0 = sums[0];
      let lo = row + x0 - r - 1, hi = row + x0 + r + 1, out = row + x0 - r;
      for (let x = x0; x < x1; x++) {
        const h0 = src[hi];
        dst[row + x] = (s0 + a * (src[lo] + h0)) * norm;
        s0 += h0 - src[out];
        lo++; hi++; out++;
      }
      sums[0] = s0;
    } else {
      for (let x = x0; x < x1; x++) {
        const lo = row + (x - r - 1) * ch, hi = row + (x + r + 1) * ch, out = row + (x - r) * ch, o = row + x * ch;
        for (let c = 0; c < ch; c++) {
          const vhi = src[hi + c];
          dst[o + c] = (sums[c] + a * (src[lo + c] + vhi)) * norm;
          sums[c] += vhi - src[out + c];
        }
      }
    }
    for (let x = x1; x < w; x++) {
      const lo = row + cl(x - r - 1) * ch, hi = row + cl(x + r + 1) * ch, out = row + cl(x - r) * ch, o = row + x * ch;
      for (let c = 0; c < ch; c++) {
        const vhi = src[hi + c];
        dst[o + c] = (sums[c] + a * (src[lo + c] + vhi)) * norm;
        sums[c] += vhi - src[out + c];
      }
    }
  }
}

/** One vertical extended-box pass, clamp-to-edge; walks rows in order with one accumulator per column. */
function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, ch: number, r: number, a: number, acc: Float64Array): void {
  const norm = 1 / (2 * r + 1 + 2 * a);
  const rowLen = w * ch, last = h - 1;
  acc.fill(0, 0, rowLen);
  for (let k = -r; k <= r; k++) {
    const yy = k < 0 ? 0 : k > last ? last : k;
    const o = yy * rowLen;
    for (let i = 0; i < rowLen; i++) acc[i] += src[o + i];
  }
  for (let y = 0; y < h; y++) {
    const lo = y - r - 1, hi = y + r + 1, out = y - r;
    const olo = (lo < 0 ? 0 : lo > last ? last : lo) * rowLen;
    const ohi = (hi > last ? last : hi) * rowLen;
    const oout = (out < 0 ? 0 : out) * rowLen;
    const od = y * rowLen;
    for (let i = 0; i < rowLen; i++) {
      const vhi = src[ohi + i];
      dst[od + i] = (acc[i] + a * (src[olo + i] + vhi)) * norm;
      acc[i] += vhi - src[oout + i];
    }
  }
}

let accScratch = new Float64Array(0);

/**
 * Gaussian blur (three extended boxes per axis) of a float buffer, in place. `tmp` must have the same
 * length as `buf`. Clamp-to-edge borders. Running sums are kept in float64 so long rows do not drift.
 */
export function gaussBlur(buf: Float32Array, tmp: Float32Array, w: number, h: number, ch: number, sigma: number): void {
  if (!(sigma > 0.05) || w < 1 || h < 1) return;
  const { r, a } = boxFor(sigma);
  if (r === 0 && a < 1e-4) return;
  if (accScratch.length < w * ch) accScratch = new Float64Array(w * ch);
  const acc = accScratch;
  boxH(buf, tmp, w, h, ch, r, a, acc); boxH(tmp, buf, w, h, ch, r, a, acc); boxH(buf, tmp, w, h, ch, r, a, acc);
  boxV(tmp, buf, w, h, ch, r, a, acc); boxV(buf, tmp, w, h, ch, r, a, acc); boxV(tmp, buf, w, h, ch, r, a, acc);
}

/**
 * Bilinear sample of a premultiplied 4-channel float buffer at (x, y) (pixel centres at integer + 0.5
 * are NOT assumed: x, y are in pixel-index space), clamp-to-edge. Writes to out[o..o+3].
 */
export function sample4(buf: Float32Array, w: number, h: number, x: number, y: number, out: Float32Array, o: number): void {
  if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
  if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
  const x0 = x | 0, y0 = y | 0;
  const fx = x - x0, fy = y - y0;
  const x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  out[o] = buf[i00] * w00 + buf[i10] * w10 + buf[i01] * w01 + buf[i11] * w11;
  out[o + 1] = buf[i00 + 1] * w00 + buf[i10 + 1] * w10 + buf[i01 + 1] * w01 + buf[i11 + 1] * w11;
  out[o + 2] = buf[i00 + 2] * w00 + buf[i10 + 2] * w10 + buf[i01 + 2] * w01 + buf[i11 + 2] * w11;
  out[o + 3] = buf[i00 + 3] * w00 + buf[i10 + 3] * w10 + buf[i01 + 3] * w01 + buf[i11 + 3] * w11;
}

/** Bilinear sample of a 1-channel float buffer, clamp-to-edge. */
export function sample1(buf: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
  if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
  const x0 = x | 0, y0 = y | 0;
  const fx = x - x0, fy = y - y0;
  const x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
  const a = buf[y0 * w + x0], b = buf[y0 * w + x1], c = buf[y1 * w + x0], d = buf[y1 * w + x1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

let idxScratch = new Int32Array(0);

/**
 * dst(p) = wa·src(p + a) + wb·src(p + b) for constant offsets a = (ax, ay), b = (bx, by), bilinear,
 * clamp-to-edge; 4-channel float buffers. When a is (0, 0) its tap is read directly. Clamped column
 * indices are computed once per pass, so the inner loop has no branches. The building block of the
 * directional blurs.
 */
export function shiftMix4(src: Float32Array, dst: Float32Array, w: number, h: number, ax: number, ay: number, wa: number, bx: number, by: number, wb: number): void {
  const self = ax === 0 && ay === 0;
  const ix = Math.floor(bx), iy = Math.floor(by), fx = bx - ix, fy = by - iy;
  const jx = Math.floor(ax), jy = Math.floor(ay), gx = ax - jx, gy = ay - jy;
  const b00 = wb * (1 - fx) * (1 - fy), b10 = wb * fx * (1 - fy), b01 = wb * (1 - fx) * fy, b11 = wb * fx * fy;
  const c00 = wa * (1 - gx) * (1 - gy), c10 = wa * gx * (1 - gy), c01 = wa * (1 - gx) * gy, c11 = wa * gx * gy;
  const lx = w - 1, ly = h - 1;
  if (idxScratch.length < w * 4) idxScratch = new Int32Array(w * 4);
  const X = idxScratch;
  const cx = (x: number) => (x < 0 ? 0 : x > lx ? lx : x) * 4;
  const cy = (y: number) => (y < 0 ? 0 : y > ly ? ly : y);
  for (let x = 0; x < w; x++) {
    X[x * 4] = cx(x + ix); X[x * 4 + 1] = cx(x + ix + 1); X[x * 4 + 2] = cx(x + jx); X[x * 4 + 3] = cx(x + jx + 1);
  }
  for (let y = 0; y < h; y++) {
    const ya = cy(y + iy) * w * 4, yb = cy(y + iy + 1) * w * 4;
    let o = y * w * 4;
    if (self) {
      for (let x = 0; x < w; x++, o += 4) {
        const xa = X[x * 4], xb = X[x * 4 + 1];
        const i00 = ya + xa, i10 = ya + xb, i01 = yb + xa, i11 = yb + xb;
        dst[o] = wa * src[o] + b00 * src[i00] + b10 * src[i10] + b01 * src[i01] + b11 * src[i11];
        dst[o + 1] = wa * src[o + 1] + b00 * src[i00 + 1] + b10 * src[i10 + 1] + b01 * src[i01 + 1] + b11 * src[i11 + 1];
        dst[o + 2] = wa * src[o + 2] + b00 * src[i00 + 2] + b10 * src[i10 + 2] + b01 * src[i01 + 2] + b11 * src[i11 + 2];
        dst[o + 3] = wa * src[o + 3] + b00 * src[i00 + 3] + b10 * src[i10 + 3] + b01 * src[i01 + 3] + b11 * src[i11 + 3];
      }
      continue;
    }
    const yc = cy(y + jy) * w * 4, yd = cy(y + jy + 1) * w * 4;
    for (let x = 0; x < w; x++, o += 4) {
      const xa = X[x * 4], xb = X[x * 4 + 1], xc = X[x * 4 + 2], xd = X[x * 4 + 3];
      const i00 = ya + xa, i10 = ya + xb, i01 = yb + xa, i11 = yb + xb;
      const j00 = yc + xc, j10 = yc + xd, j01 = yd + xc, j11 = yd + xd;
      dst[o] = b00 * src[i00] + b10 * src[i10] + b01 * src[i01] + b11 * src[i11] + c00 * src[j00] + c10 * src[j10] + c01 * src[j01] + c11 * src[j11];
      dst[o + 1] = b00 * src[i00 + 1] + b10 * src[i10 + 1] + b01 * src[i01 + 1] + b11 * src[i11 + 1] + c00 * src[j00 + 1] + c10 * src[j10 + 1] + c01 * src[j01 + 1] + c11 * src[j11 + 1];
      dst[o + 2] = b00 * src[i00 + 2] + b10 * src[i10 + 2] + b01 * src[i01 + 2] + b11 * src[i11 + 2] + c00 * src[j00 + 2] + c10 * src[j10 + 2] + c01 * src[j01 + 2] + c11 * src[j11 + 2];
      dst[o + 3] = b00 * src[i00 + 3] + b10 * src[i10 + 3] + b01 * src[i01 + 3] + b11 * src[i11 + 3] + c00 * src[j00 + 3] + c10 * src[j10 + 3] + c01 * src[j01 + 3] + c11 * src[j11 + 3];
    }
  }
}

/**
 * dst(p) = wa·src(A·p) + wb·src(B·p) for affine maps [a, b, c, d, e, f] (x' = a·x + b·y + c,
 * y' = d·x + e·y + f; pixel-index space), bilinear, clamp-to-edge. A = null reads src(p) directly.
 * Coordinates advance incrementally along each row.
 */
export function affineMix4(src: Float32Array, dst: Float32Array, w: number, h: number, A: number[] | null, wa: number, B: number[], wb: number): void {
  const lx = w - 1, ly = h - 1;
  const tap = (sx: number, sy: number, wt: number, o: number, add: boolean) => {
    if (sx < 0) sx = 0; else if (sx > lx) sx = lx;
    if (sy < 0) sy = 0; else if (sy > ly) sy = ly;
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
    const x1 = x0 < lx ? x0 + 1 : x0, y1 = y0 < ly ? y0 + 1 : y0;
    const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
    const w00 = (1 - fx) * (1 - fy) * wt, w10 = fx * (1 - fy) * wt, w01 = (1 - fx) * fy * wt, w11 = fx * fy * wt;
    const r = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
    const g = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
    const b = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
    const a = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
    if (add) { dst[o] += r; dst[o + 1] += g; dst[o + 2] += b; dst[o + 3] += a; }
    else { dst[o] = r; dst[o + 1] = g; dst[o + 2] = b; dst[o + 3] = a; }
  };
  const [b0, b1, b2, b3, b4, b5] = B;
  for (let y = 0; y < h; y++) {
    let sx = b1 * y + b2, sy = b4 * y + b5;
    let o = y * w * 4;
    if (A) {
      let axx = A[1] * y + A[2], ayy = A[4] * y + A[5];
      for (let x = 0; x < w; x++, o += 4) {
        tap(sx, sy, wb, o, false);
        tap(axx, ayy, wa, o, true);
        axx += A[0]; ayy += A[3]; sx += b0; sy += b3;
      }
      continue;
    }
    // the common pass: the pixel itself plus one moved copy, inlined
    for (let x = 0; x < w; x++, o += 4, sx += b0, sy += b3) {
      const qx = sx < 0 ? 0 : sx > lx ? lx : sx, qy = sy < 0 ? 0 : sy > ly ? ly : sy;
      const x0 = qx | 0, y0 = qy | 0, fx = qx - x0, fy = qy - y0;
      const x1 = x0 < lx ? x0 + 1 : x0, y1 = y0 < ly ? y0 + 1 : y0;
      const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
      const w00 = (1 - fx) * (1 - fy) * wb, w10 = fx * (1 - fy) * wb, w01 = (1 - fx) * fy * wb, w11 = fx * fy * wb;
      dst[o] = wa * src[o] + src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
      dst[o + 1] = wa * src[o + 1] + src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
      dst[o + 2] = wa * src[o + 2] + src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
      dst[o + 3] = wa * src[o + 3] + src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
    }
  }
}

/** Separable max filter (square window of radius r) of a 1-channel buffer, in place. */
export function maxFilter(buf: Float32Array, tmp: Float32Array, w: number, h: number, r: number): void {
  if (r < 1) return;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let m = 0;
      const a = x - r < 0 ? 0 : x - r, b = x + r > w - 1 ? w - 1 : x + r;
      for (let k = a; k <= b; k++) if (buf[o + k] > m) m = buf[o + k];
      tmp[o + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    const a = y - r < 0 ? 0 : y - r, b = y + r > h - 1 ? h - 1 : y + r;
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = a; k <= b; k++) { const v = tmp[k * w + x]; if (v > m) m = v; }
      buf[y * w + x] = m;
    }
  }
}
