/**
 * Blurs that move or focus: motion blur (directional, zoom, spin; centred or as a trail), Gaussian blur,
 * unsharp mask and RGB split (chromatic aberration / VHS).
 *
 * Motion blur by recursive doubling: k passes, each averaging the image with a copy moved by an offset
 * that halves every pass, equal the average of 2^k copies spread evenly along the path — O(k) work per
 * pixel instead of O(2^k). The same works for zoom (scales multiply: offsets in log-scale) and spin
 * (angles add). A trail is one-sided with an exponential fade; since e^(−λn) is the product over the
 * binary digits of n of e^(−λ·2^j), the doubling passes reproduce the exponential weights exactly.
 */
import { affineMix4, gaussBlur, shiftMix4 } from '../kernels';
import { DEG, fromPremul, frameOf, hash3, toPremul, type Op } from '../core';

const zoomMap = (cx: number, cy: number, m: number) => [m, 0, cx * (1 - m), 0, m, cy * (1 - m)];
const spinMap = (cx: number, cy: number, phi: number) => {
  const c = Math.cos(phi), s = Math.sin(phi);
  return [c, -s, cx - c * cx + s * cy, s, c, cy - s * cx - c * cy];
};

export const motionblur: Op = (src, dst, p, run) => {
  const { width: w, height: h } = src;
  const n = w * h, scale = run.scale;
  const mode = p.mode as string, trail = p.trail === true;
  let A = toPremul(src, run.scratch.f32('f4.a', n * 4));
  let B = run.scratch.f32('f4.b', n * 4);
  const orig = trail ? run.scratch.f32('f4.c', n * 4) : null;
  if (orig) orig.set(A);
  const cx = (p.cx as number) * w - 0.5, cy = (p.cy as number) * h - 0.5;
  const reach = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));

  // the path in its own units — px (linear), log-scale (zoom), radians (spin) — and its length in px
  let T = 0, len = 0;
  let pass: (ta: number | null, wa: number, tb: number, wb: number) => void;
  if (mode === 'zoom') {
    T = -Math.log(1 - Math.min(0.95, p.amount as number));
    len = T * reach;
    pass = (ta, wa, tb, wb) => affineMix4(A, B, w, h, ta === null ? null : zoomMap(cx, cy, Math.exp(-ta)), wa, zoomMap(cx, cy, Math.exp(-tb)), wb);
  } else if (mode === 'spin') {
    T = (p.amount as number) * Math.PI;
    len = T * reach;
    pass = (ta, wa, tb, wb) => affineMix4(A, B, w, h, ta === null ? null : spinMap(cx, cy, ta), wa, spinMap(cx, cy, tb), wb);
  } else {
    const ang = (p.angle as number) * DEG, ux = Math.cos(ang), uy = Math.sin(ang);
    T = len = (p.distance as number) * scale;
    pass = (ta, wa, tb, wb) => shiftMix4(A, B, w, h, (ta ?? 0) * ux, (ta ?? 0) * uy, wa, tb * ux, tb * uy, wb);
  }

  if (len >= 0.5) {
    // N = 2^k copies at c, c + s, …, c + (N − 1)s: pass 0 reads the taps c and c + s, pass j ≥ 1 the
    // pixel itself and a copy moved by s·2^j. Centred: c = −(N − 1)s/2. Trail: c = 0, weights e^(−λτ).
    const gap = run.quality === 'preview' ? 2.5 : 1.5; // largest distance between copies, input px
    const k = Math.max(1, Math.min(10, Math.ceil(Math.log2(Math.max(2, len / gap)))));
    const N = 2 ** k, sp = T / N;
    const lam = 2.6 / T;
    const c = trail ? 0 : -((N - 1) * sp) / 2;
    for (let j = 0; j < k; j++) {
      const off = sp * 2 ** j;
      const beta = trail ? Math.exp(-lam * off) : 1;
      const wa = 1 / (1 + beta), wb = beta / (1 + beta);
      if (j === 0) pass(c === 0 ? null : c, wa, c + off, wb);
      else pass(null, wa, off, wb);
      const t = A; A = B; B = t;
    }
  }

  if (orig) {
    // the sharp original on top: «over» where it is transparent, «lighten» where it is opaque
    for (let i = 0; i < n * 4; i += 4) {
      const al = orig[i + 3] / 255, inv = 1 - al;
      for (let q = 0; q < 3; q++) {
        const o = orig[i + q], b = A[i + q];
        B[i + q] = o + b * inv + (b > o ? (b - o) * al : 0);
      }
      B[i + 3] = orig[i + 3] + A[i + 3] * inv;
    }
    fromPremul(B, dst);
  } else fromPremul(A, dst);
};

export const blur: Op = (src, dst, p, run) => {
  const { width: w, height: h } = src, n = w * h;
  const buf = toPremul(src, run.scratch.f32('f4.a', n * 4));
  gaussBlur(buf, run.scratch.f32('f4.b', n * 4), w, h, 4, (p.radius as number) * run.scale);
  fromPremul(buf, dst);
};

export const sharpen: Op = (src, dst, p, run) => {
  const { width: w, height: h } = src, n = w * h;
  const s = src.data, d = dst.data;
  const buf = toPremul(src, run.scratch.f32('f4.a', n * 4));
  const bl = run.scratch.f32('f4.b', n * 4);
  bl.set(buf);
  gaussBlur(bl, run.scratch.f32('f4.c', n * 4), w, h, 4, (p.radius as number) * run.scale);
  const amt = p.amount as number, t1 = (p.threshold as number) * 255, t0 = t1 * 0.5;
  for (let i = 0; i < n * 4; i += 4) {
    const a = s[i + 3];
    if (a === 0) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; continue; }
    const k = 255 / a;
    for (let c = 0; c < 3; c++) {
      const diff = buf[i + c] - bl[i + c], ad = diff < 0 ? -diff : diff;
      const g = t1 <= 0 ? 1 : ad >= t1 ? 1 : ad <= t0 ? 0 : ((ad - t0) / (t1 - t0)) ** 2 * (3 - 2 * (ad - t0) / (t1 - t0));
      d[i + c] = (buf[i + c] + amt * diff * g) * k;
    }
    d[i + 3] = a;
  }
};

export const chroma: Op = (src, dst, p, run) => {
  const { width: w, height: h } = src, n = w * h;
  const d = dst.data, scale = run.scale;
  const P = toPremul(src, run.scratch.f32('f4.a', n * 4));
  const amt = (p.amount as number) * scale, radial = p.mode === 'radial';
  const ang = (p.angle as number) * DEG, ux = Math.cos(ang) * amt, uy = Math.sin(ang) * amt;
  const cx = w / 2 - 0.5, cy = h / 2 - 0.5, k = amt / Math.max(1, Math.hypot(w / 2, h / 2));
  // VHS jitter: bands of rows (in output px) shift sideways, new every 1/12 s
  const jit = p.jitter as number;
  const rowShift = run.scratch.f32('chroma.row', h);
  if (jit > 0) {
    const frame = frameOf(run.t, 12);
    for (let y = 0; y < h; y++) {
      const band = Math.floor((y + 0.5) / scale / 3);
      const hv = hash3(band, frame, run.seed ^ 0x5bd1);
      let v = ((hv & 0xffff) / 65535 - 0.5) * 2 * jit * 3;
      if (((hv >>> 16) & 255) < 8 * jit) v += (((hv >>> 24) & 255) / 255 - 0.5) * 60 * jit; // a rare tear
      rowShift[y] = v * scale;
    }
  } else rowShift.fill(0);
  const lx = w - 1, ly = h - 1;
  const sampleCh = (x: number, y: number, c: number, out: Float32Array, o: number) => {
    if (x < 0) x = 0; else if (x > lx) x = lx;
    if (y < 0) y = 0; else if (y > ly) y = ly;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    const x1 = x0 < lx ? x0 + 1 : x0, y1 = y0 < ly ? y0 + 1 : y0;
    const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    out[o] = P[i00 + c] * w00 + P[i10 + c] * w10 + P[i01 + c] * w01 + P[i11 + c] * w11;
    out[o + 1] = P[i00 + 3] * w00 + P[i10 + 3] * w10 + P[i01 + 3] * w01 + P[i11 + 3] * w11;
  };
  const v = new Float32Array(6);
  for (let y = 0; y < h; y++) {
    const js = rowShift[y];
    for (let x = 0; x < w; x++) {
      const xs = x + js;
      if (radial) {
        const dx = xs - cx, dy = y - cy;
        sampleCh(cx + dx * (1 + k), cy + dy * (1 + k), 0, v, 0);
        sampleCh(xs, y, 1, v, 2);
        sampleCh(cx + dx * (1 - k), cy + dy * (1 - k), 2, v, 4);
      } else {
        sampleCh(xs - ux, y - uy, 0, v, 0);
        sampleCh(xs, y, 1, v, 2);
        sampleCh(xs + ux, y + uy, 2, v, 4);
      }
      const a = Math.max(v[1], v[3], v[5]), i = (y * w + x) * 4;
      if (a < 0.5) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; continue; }
      const q = 255 / a;
      d[i] = v[0] * q; d[i + 1] = v[2] * q; d[i + 2] = v[4] * q; d[i + 3] = a;
    }
  }
};
