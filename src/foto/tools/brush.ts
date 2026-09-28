/**
 * Brush maths, pure (no DOM): smoothing of the pointer (a «lazy brush»: the brush is pulled by a string of
 * fixed length, so small tremors do not move it), the stroke being built, and «Aplanar trazos» — replacing a run
 * of stroke parts by one or two raster parts with the same result.
 *
 * Flattening exactly. Parts combine in order (masks.ts): add a' = a + c − a·c = a·(1 − c) + c; subtract
 * a' = a·(1 − c); intersect a' = a·c. Each is affine in a (a' = a·M + B), so a run of strokes, whatever their
 * ops, is one affine map per pixel: a' = a·M + B with 0 ≤ B and M + B ≤ 1. That map is exactly
 *   subtract(c1) then add(c2)   with c2 = B, c1 = 1 − M/(1 − B)
 * (two raster parts), or a single add(B) when the run starts the mask (the first part then starts from 0 when it
 * adds, from 1 otherwise: a is a known constant there). The only loss is 8-bit storage of c1 and c2.
 */
import { partCoverage, type MaskInputs } from '../../project/masks';
import type { MaskPart, MaskStrokePart } from '../../project/types';
import type { Pt } from './geom';

/* ------------------------------------------------------------------ smoothing */

/**
 * The lazy brush: the brush point follows the pointer only when the pointer is more than `radius` away, and
 * then moves along the line between them so the string stays taut. radius 0 = no smoothing.
 */
export class LazyBrush {
  brush: Pt;
  constructor(start: Pt, public radius: number) { this.brush = { ...start }; }

  /** Moves the pointer; returns whether the brush moved. Units are whatever the caller uses (screen px). */
  update(p: Pt): boolean {
    const dx = p.x - this.brush.x, dy = p.y - this.brush.y;
    const d = Math.hypot(dx, dy);
    if (d <= this.radius) return false;
    const k = (d - this.radius) / d;
    this.brush = { x: this.brush.x + dx * k, y: this.brush.y + dy * k };
    return true;
  }
}

/**
 * Points of a stroke being painted (frame units), with pressure when the device reports it. A point is kept
 * only when the brush moved at least `spacing` screen px (plenty for capsules between points), so a long stroke
 * stays small in the project file.
 */
export class StrokeBuilder {
  readonly pts: number[] = [];
  readonly pressure: number[] = [];
  private lastS: Pt | null = null;
  constructor(private spacing: number, readonly usePressure: boolean) {}

  add(p: Pt, s: Pt, pressure: number, force = false): boolean {
    if (this.lastS && !force && Math.hypot(s.x - this.lastS.x, s.y - this.lastS.y) < this.spacing) return false;
    this.pts.push(Math.round(p.x * 1e5) / 1e5, Math.round(p.y * 1e5) / 1e5);
    if (this.usePressure) this.pressure.push(Math.round(Math.min(1, Math.max(0.05, pressure)) * 1000) / 1000);
    this.lastS = { ...s };
    return true;
  }

  get length(): number { return this.pts.length >> 1; }

  part(o: { op: MaskStrokePart['op']; size: number; hardness: number; alpha: number }): MaskStrokePart {
    const part: MaskStrokePart = { kind: 'stroke', op: o.op, pts: this.pts.slice(), size: o.size, hardness: o.hardness, alpha: o.alpha };
    if (this.usePressure && this.pressure.length === this.length) part.pressure = this.pressure.slice();
    return part;
  }
}

/** Brush diameter (fraction of the frame's shorter side) one step bigger/smaller: [ and ]. */
export function stepSize(size: number, dir: 1 | -1): number {
  const next = dir > 0 ? size * 1.25 : size / 1.25;
  return Math.round(Math.min(0.5, Math.max(0.004, next)) * 10000) / 10000;
}

/* ------------------------------------------------------------------ flattening */

/** Runs of consecutive stroke parts: [start, end) indices. */
export function strokeRuns(parts: readonly MaskPart[], min = 2): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0;
  while (i < parts.length) {
    if (parts[i].kind !== 'stroke') { i++; continue; }
    let j = i;
    while (j < parts.length && parts[j].kind === 'stroke') j++;
    if (j - i >= min) out.push([i, j]);
    i = j;
  }
  return out;
}

/** How many stroke parts and stroke points a mask carries (what makes it slow to draw). */
export function strokeLoad(parts: readonly MaskPart[]): { strokes: number; points: number } {
  let strokes = 0, points = 0;
  for (const p of parts) if (p.kind === 'stroke') { strokes++; points += p.pts.length >> 1; }
  return { strokes, points };
}

/**
 * When to flatten on its own. Measured on this project's 4-vCPU machine (see the lane report): a mask of 12
 * strokes of ~60 points at a 1080 px frame rasterises in ≈40–60 ms at full size, about a frame budget of a
 * preview at half size; past it every redraw of the layer gets noticeably slower, and a mask holds 64 parts at
 * most (normalize.ts), so strokes must not crowd out the other parts.
 */
export const AUTO_FLATTEN = { strokes: 12, points: 1500 } as const;

export const needsFlatten = (parts: readonly MaskPart[]) => {
  const l = strokeLoad(parts);
  return l.strokes >= AUTO_FLATTEN.strokes || l.points >= AUTO_FLATTEN.points;
};

/** The per-pixel affine map (a' = a·M + B) of parts[i..j), at the given size. */
export function affineOfRun(parts: readonly MaskPart[], i: number, j: number, inp: MaskInputs): { M: Float32Array; B: Float32Array } {
  const n = inp.w * inp.h;
  const M = new Float32Array(n).fill(1), B = new Float32Array(n);
  for (let k = i; k < j; k++) {
    const part = parts[k];
    const c = partCoverage(part, inp) ?? new Float32Array(n);
    if (part.op === 'add') for (let q = 0; q < n; q++) { const r = 1 - c[q]; M[q] *= r; B[q] = B[q] * r + c[q]; }
    else if (part.op === 'subtract') for (let q = 0; q < n; q++) { const r = 1 - c[q]; M[q] *= r; B[q] *= r; }
    else for (let q = 0; q < n; q++) { M[q] *= c[q]; B[q] *= c[q]; }
  }
  return { M, B };
}

export interface FlatPiece {
  /** 'add' / 'subtract' raster part with this coverage (0..255, w·h). */
  op: 'add' | 'subtract';
  coverage: Uint8ClampedArray;
}

export interface FlatPlan {
  /** Indices [start, end) of the parts it replaces. */
  start: number;
  end: number;
  /** The raster parts that replace them, in order (one or two). */
  pieces: FlatPiece[];
}

const to8 = (f: Float32Array): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.round(f[i] * 255);
  return out;
};
const anyOn = (a: Uint8ClampedArray) => { for (let i = 0; i < a.length; i++) if (a[i]) return true; return false; };

/**
 * What flattening the run parts[start..end) becomes (see the top of this file). At the start of the mask the
 * whole run is one 'add' picture; elsewhere a 'subtract' picture (omitted when it removes nothing) and an 'add'
 * picture (omitted when it adds nothing).
 */
export function flattenRun(parts: readonly MaskPart[], start: number, end: number, inp: MaskInputs): FlatPlan {
  const { M, B } = affineOfRun(parts, start, end, inp);
  if (start === 0) {
    const a0 = parts[0].op === 'add' ? 0 : 1;
    const P = new Float32Array(M.length);
    for (let q = 0; q < P.length; q++) P[q] = a0 * M[q] + B[q];
    return { start, end, pieces: [{ op: 'add', coverage: to8(P) }] };
  }
  const c1 = new Float32Array(M.length);
  for (let q = 0; q < M.length; q++) {
    const b = B[q];
    c1[q] = b >= 1 - 1e-6 ? 1 : Math.min(1, Math.max(0, 1 - M[q] / (1 - b)));
  }
  const pieces: FlatPiece[] = [];
  const sub = to8(c1), add = to8(B);
  if (anyOn(sub)) pieces.push({ op: 'subtract', coverage: sub });
  if (anyOn(add)) pieces.push({ op: 'add', coverage: add });
  return { start, end, pieces };
}

/**
 * Plans the flattening of every run of at least `min` strokes (the latest run first, so earlier indices stay
 * valid when the plans are applied in the order returned).
 */
export function planFlatten(parts: readonly MaskPart[], inp: MaskInputs, min = 2): FlatPlan[] {
  return strokeRuns(parts, min).reverse().map(([a, b]) => flattenRun(parts, a, b, inp));
}
