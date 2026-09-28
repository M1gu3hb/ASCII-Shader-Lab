/**
 * A 64×64 blue-noise threshold tile made with Ulichney's void-and-cluster method ("The void-and-cluster
 * method for dither array generation", 1993), generated once on first use (~20 ms) and cached.
 *
 *   energy(p) = Σ over set pixels q of exp(−d(p, q)² / 2σ²), toroidal distance, σ = 1.5, radius 6
 *   0. initial pattern: 10 % of the pixels chosen by a fixed seeded hash; then, repeatedly, the pixel of the
 *      tightest cluster (max energy among ones) moves to the largest void (min energy among zeros) until
 *      the move would put it back where it was;
 *   1. ranks below the initial count: remove the tightest cluster one at a time (rank counts down);
 *   2. ranks above it: from the initial pattern, fill the largest void one at a time (rank counts up)
 *      until the tile is full (phase 3 of the paper, "tightest cluster of zeros", picks the same pixel as
 *      the minimum energy of ones when the kernel is toroidal, so one loop does both).
 * Ties go to the lowest index, so the tile is the same on every machine.
 */
import { hash3 } from './core';

export const BLUE_N = 64;
let tile: Float32Array | null = null;

function build(): Float32Array {
  const N = BLUE_N, S = N * N, R = 6, sigma = 1.5;
  const K = new Float32Array((2 * R + 1) * (2 * R + 1));
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    K[(dy + R) * (2 * R + 1) + dx + R] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
  }
  const splat = (E: Float32Array, p: number, sign: number) => {
    const px = p % N, py = (p / N) | 0;
    for (let dy = -R; dy <= R; dy++) {
      const yy = ((py + dy) % N + N) % N;
      for (let dx = -R; dx <= R; dx++) {
        const xx = ((px + dx) % N + N) % N;
        E[yy * N + xx] += sign * K[(dy + R) * (2 * R + 1) + dx + R];
      }
    }
  };
  const argExt = (E: Float32Array, bits: Uint8Array, want: number, max: boolean) => {
    let best = -1, bv = max ? -Infinity : Infinity;
    for (let i = 0; i < S; i++) {
      if (bits[i] !== want) continue;
      const v = E[i];
      if (max ? v > bv : v < bv) { bv = v; best = i; }
    }
    return best;
  };

  // 0. initial binary pattern
  const bits = new Uint8Array(S), E = new Float32Array(S);
  const ones = Math.round(S * 0.1);
  const order = Array.from({ length: S }, (_, i) => i).sort((a, b) => hash3(a, 7, 1993) - hash3(b, 7, 1993) || a - b);
  for (let k = 0; k < ones; k++) { bits[order[k]] = 1; splat(E, order[k], 1); }
  for (let guard = 0; guard < S * 4; guard++) {
    const c = argExt(E, bits, 1, true);
    bits[c] = 0; splat(E, c, -1);
    const v = argExt(E, bits, 0, false);
    bits[v] = 1; splat(E, v, 1);
    if (v === c) break;
  }
  const rank = new Int32Array(S).fill(-1);
  // 1. remove clusters: ranks ones-1 … 0
  {
    const b = bits.slice(), e = E.slice();
    for (let r = ones - 1; r >= 0; r--) {
      const c = argExt(e, b, 1, true);
      b[c] = 0; splat(e, c, -1); rank[c] = r;
    }
  }
  // 2 + 3. fill voids: ranks ones … S-1
  {
    const b = bits.slice(), e = E.slice();
    for (let r = ones; r < S; r++) {
      const v = argExt(e, b, 0, false);
      b[v] = 1; splat(e, v, 1); rank[v] = r;
    }
  }
  const out = new Float32Array(S);
  for (let i = 0; i < S; i++) out[i] = (rank[i] + 0.5) / S;
  return out;
}

/** Thresholds in (0, 1), one per pixel of the 64×64 tile (row-major); every rank appears exactly once. */
export function blueNoise(): Float32Array {
  if (!tile) tile = build();
  return tile;
}
