/**
 * Transformations of the source on the CPU: a line-by-line port of XFORM_FS (../glsl/xform.ts). Grids
 * are 8-bit RGB per cell (row 0 at the top), rounded like the RGBA8 textures the GPU writes, so every
 * stage reads what its WebGL twin reads. The source grid itself (stage -1/-2) is filled by field.ts,
 * which has the picture and text samplers. Pure: no DOM.
 */
import type { XformStage } from '../xform';

const fr = Math.fround;
const TAU = 6.28318530718, PI = 3.14159265359;
const q8 = (v: number) => Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255);
const smooth = (e0: number, e1: number, x: number) => { let t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const gmod = (x: number, y: number) => x - y * Math.floor(x / y);

/** Grids and state of the transformations for one engine (sized for cols × rows). */
export class XformState {
  n = 0;
  grid: Uint8Array[] = [new Uint8Array(3), new Uint8Array(3)];
  pat = new Uint8Array(1);
  trail: Uint8Array[] = [new Uint8Array(3), new Uint8Array(3)];
  prev: Uint8Array[] = [new Uint8Array(3), new Uint8Array(3)];
  /** Which trail and input buffers are current, whether they hold a frame yet, and when it was. */
  i = 0; have = false; t = 0; key = '';
  resize(n: number) {
    if (n === this.n) return;
    this.n = n;
    this.grid = [new Uint8Array(n * 3), new Uint8Array(n * 3)];
    this.pat = new Uint8Array(n);
    this.trail = [new Uint8Array(n * 3), new Uint8Array(n * 3)];
    this.prev = [new Uint8Array(n * 3), new Uint8Array(n * 3)];
    this.have = false;
  }
}

export interface StageEnv {
  cols: number; rows: number;
  /** Cell height / width. */
  aspect: number;
  /** Held time (with a loop, Ondular's first wave's time: see loop.ts). */
  time: number;
  /** Ondular's second wave's time (absent, or without a loop: `time`). */
  timeB?: number;
  /** Pattern values (Desplazar). */
  pat: Uint8Array;
  /** Current trail (Estela), already updated for this frame. */
  trail: Uint8Array;
}

const C = new Float64Array(3), T3 = new Float64Array(3);

/** Reads cell (x, y), clamped to the grid, into T3 (0..1). */
function I(g: Uint8Array, cols: number, rows: number, x: number, y: number) {
  x = x < 0 ? 0 : x >= cols ? cols - 1 : x;
  y = y < 0 ? 0 : y >= rows ? rows - 1 : y;
  const i = (y * cols + x) * 3;
  T3[0] = g[i] / 255; T3[1] = g[i + 1] / 255; T3[2] = g[i + 2] / 255;
  return T3;
}
const luma3 = (c: Float64Array) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
const lumaAt = (g: Uint8Array, cols: number, rows: number, x: number, y: number) => luma3(I(g, cols, rows, x, y));

/** Runs one transformation from `inp` into `out` (both cols × rows × 3). */
export function runStage(s: XformStage, inp: Uint8Array, out: Uint8Array, e: StageEnv) {
  const { cols, rows, aspect: asp } = e;
  const amt = s.amount, K = s.k, P = s.p;
  const put = (i: number, r: number, g: number, b: number) => { out[i] = q8(r); out[i + 1] = q8(g); out[i + 2] = q8(b); };
  const mixPut = (i: number, r: number, g: number, b: number) => put(i, C[0] + (r - C[0]) * amt, C[1] + (g - C[1]) * amt, C[2] + (b - C[2]) * amt);
  // the GPU's rotation (rot2 in core.ts) and its constants, in float32
  const c45 = fr(Math.cos(fr(0.7853982))), s45 = fr(Math.sin(fr(0.7853982)));
  const kf = fr(K);
  const span = s.kind === 'caleido' ? TAU / K : 0;
  const ang = P * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 3;
      C[0] = inp[i] / 255; C[1] = inp[i + 1] / 255; C[2] = inp[i + 2] / 255;
      switch (s.code) {
        case 0: { // semitono
          const px = fr(x + 0.5), py = fr(fr(y + 0.5) * fr(asp));
          const rx = fr(fr(fr(c45 * px) + fr(s45 * py)) / kf), ry = fr(fr(fr(-s45 * px) + fr(c45 * py)) / kf);
          const idx = Math.floor(rx) + 0.5, idy = Math.floor(ry) + 0.5;
          const X = fr(idx * kf), Y = fr(idy * kf);
          const cpx = fr(fr(c45 * X) - fr(s45 * Y)), cpy = fr(fr(s45 * X) + fr(c45 * Y));
          const dc = I(inp, cols, rows, Math.floor(cpx), Math.floor(fr(cpy / fr(asp))));
          const dr = dc[0], dg = dc[1], db = dc[2];
          const rad = Math.sqrt(dr * 0.299 + dg * 0.587 + db * 0.114) * 0.72;
          let cov = (rad - Math.hypot(rx - idx, ry - idy)) * K + 0.5;
          cov = cov < 0 ? 0 : cov > 1 ? 1 : cov;
          const m = Math.max(Math.max(Math.max(dr, dg), db), 0.05);
          const dot = (v: number) => ((v / m) * 0.65 + 0.35) * cov;
          mixPut(i, dot(dr), dot(dg), dot(db));
          break;
        }
        case 1: { // contorno
          const k = Math.floor(K);
          const tl = lumaAt(inp, cols, rows, x - k, y - k), tc = lumaAt(inp, cols, rows, x, y - k), tr = lumaAt(inp, cols, rows, x + k, y - k);
          const ml = lumaAt(inp, cols, rows, x - k, y), mr = lumaAt(inp, cols, rows, x + k, y);
          const bl = lumaAt(inp, cols, rows, x - k, y + k), bc = lumaAt(inp, cols, rows, x, y + k), br = lumaAt(inp, cols, rows, x + k, y + k);
          const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
          const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);
          const ed = smooth(0.1, 0.45, Math.sqrt(gx * gx + gy * gy));
          const m = Math.max(Math.max(Math.max(C[0], C[1]), C[2]), 0.05);
          const nv = (v: number) => ((v / m) * 0.8 + 0.2) * ed + v * 0.1 * (1 - ed);
          mixPut(i, nv(C[0]), nv(C[1]), nv(C[2]));
          break;
        }
        case 2: { // bandas
          const q = (v: number) => Math.floor(v * K * 0.9999) / (K - 1);
          mixPut(i, q(C[0]), q(C[1]), q(C[2]));
          break;
        }
        case 3: { // arrastre
          const th = 0.15 + 0.7 * P, lc = luma3(C), N = Math.floor(K);
          if (lc < th || N <= 0) { put(i, C[0], C[1], C[2]); break; }
          let lr = C[0], lg = C[1], lb = C[2], hr = C[0], hg = C[1], hb = C[2], llo = lc, lhi = lc, up = 0, dn = 0;
          for (let k = 1; k <= 48 && k <= N && y - k >= 0; k++) {
            const sv = I(inp, cols, rows, x, y - k), ls = luma3(sv);
            if (ls < th) break;
            up = k;
            if (ls < llo) { lr = sv[0]; lg = sv[1]; lb = sv[2]; llo = ls; }
            if (ls > lhi) { hr = sv[0]; hg = sv[1]; hb = sv[2]; lhi = ls; }
          }
          for (let k = 1; k <= 48 && k <= N && y + k < rows; k++) {
            const sv = I(inp, cols, rows, x, y + k), ls = luma3(sv);
            if (ls < th) break;
            dn = k;
            if (ls < llo) { lr = sv[0]; lg = sv[1]; lb = sv[2]; llo = ls; }
            if (ls > lhi) { hr = sv[0]; hg = sv[1]; hb = sv[2]; lhi = ls; }
          }
          const f = up / Math.max(up + dn, 1);
          put(i, lr + (hr - lr) * f, lg + (hg - lg) * f, lb + (hb - lb) * f);
          break;
        }
        case 4: { // desplazar
          const v = e.pat[y * cols + x] / 255 - 0.5;
          const d = v * amt * K;
          const sv = I(inp, cols, rows, Math.floor(x + 0.5 + ca * d), Math.floor(y + 0.5 + (sa / asp) * d));
          put(i, sv[0], sv[1], sv[2]);
          break;
        }
        case 5: { // caleido
          const cx = cols * 0.5, cy = rows * 0.5;
          const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * asp;
          const rr = Math.sqrt(dx * dx + dy * dy);
          let a = rr > 1e-4 ? Math.atan2(dy, dx) : 0;
          a = gmod(a, span);
          a = Math.min(a, span - a);
          const sv = I(inp, cols, rows, Math.floor(Math.cos(a) * rr + cx), Math.floor((Math.sin(a) * rr) / asp + cy));
          mixPut(i, sv[0], sv[1], sv[2]);
          break;
        }
        case 6: { // ondular
          const ox = Math.sin(((y + 0.5) / rows) * K * PI + e.time * 2) * amt * 6;
          const oy = Math.cos(((x + 0.5) / cols) * K * 0.7 * PI - (e.timeB ?? e.time) * 1.6) * amt * 3;
          const sv = I(inp, cols, rows, Math.floor(x + 0.5 + ox), Math.floor(y + 0.5 + oy));
          put(i, sv[0], sv[1], sv[2]);
          break;
        }
        case 7: { // estela
          const t = e.trail, sc = (v: number, tv: number) => { const a = Math.min(1, (tv / 255) * amt); return 1 - (1 - v) * (1 - a); };
          put(i, sc(C[0], t[i]), sc(C[1], t[i + 1]), sc(C[2], t[i + 2]));
          break;
        }
        case 8: { // canales
          const ox = ca * amt * K, oy = (sa / asp) * amt * K;
          const red = I(inp, cols, rows, Math.floor(x + 0.5 + ox), Math.floor(y + 0.5 + oy))[0];
          const blue = I(inp, cols, rows, Math.floor(x + 0.5 - ox), Math.floor(y + 0.5 - oy))[2];
          put(i, red, C[1], blue);
          break;
        }
        case 9: { // bloques
          const bw = K, bh = Math.max(1, Math.floor(K / asp + 0.5));
          const sv = I(inp, cols, rows, Math.floor(x / bw) * bw + Math.floor(bw * 0.5), Math.floor(y / bh) * bh + Math.floor(bh * 0.5));
          mixPut(i, sv[0], sv[1], sv[2]);
          break;
        }
        default: put(i, C[0], C[1], C[2]);
      }
    }
  }
}

/** Estela's trail for this frame (pass 20 of XFORM_FS): what moved lights up, the rest fades by `decay`. */
export function updateTrail(inp: Uint8Array, prev: Uint8Array, trail: Uint8Array, out: Uint8Array, decay: number, have: boolean) {
  for (let i = 0; i < inp.length; i += 3) {
    if (!have) { out[i] = out[i + 1] = out[i + 2] = 0; continue; }
    const r = inp[i] / 255, g = inp[i + 1] / 255, b = inp[i + 2] / 255;
    const m = Math.max(Math.abs(r - prev[i] / 255), Math.abs(g - prev[i + 1] / 255), Math.abs(b - prev[i + 2] / 255));
    const k = smooth(0.04, 0.22, m) / Math.max(Math.max(Math.max(r, g), b), 0.05);
    out[i] = q8(Math.max((trail[i] / 255) * decay, r * k));
    out[i + 1] = q8(Math.max((trail[i + 1] / 255) * decay, g * k));
    out[i + 2] = q8(Math.max((trail[i + 2] / 255) * decay, b * k));
  }
}
