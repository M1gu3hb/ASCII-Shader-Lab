/**
 * Seeded randomness. Every result of the generator is a pure function of its seed,
 * so a seed string can always reproduce the same creation.
 */

/** 128-bit string hash (cyrb128) → four 32-bit seeds. */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** 53-bit hash, handy for fingerprints. */
export function hash53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export type Weighted<T extends string | number> = Partial<Record<T, number>> | Array<[T, number]>;

export class Rng {
  private a: number; private b: number; private c: number; private d: number;
  readonly key: string;

  constructor(key: string) {
    this.key = key;
    [this.a, this.b, this.c, this.d] = cyrb128(key);
    for (let i = 0; i < 12; i++) this.next();
  }

  /** sfc32 */
  next(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Independent stream derived from this generator's key (stable regardless of call order). */
  fork(name: string): Rng { return new Rng(this.key + '/' + name); }

  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  /** Normal distribution (Box–Muller). */
  gauss(mean = 0, sd = 1): number {
    const u = 1 - this.next(), v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** Biased towards min when k > 1. */
  skew(min: number, max: number, k: number): number { return min + (max - min) * Math.pow(this.next(), k); }

  weighted<T extends string | number>(w: Weighted<T>): T {
    const entries = (Array.isArray(w) ? w : (Object.entries(w) as Array<[T, number]>)).filter(([, v]) => (v ?? 0) > 0);
    const total = entries.reduce((s, [, v]) => s + (v ?? 0), 0);
    let x = this.next() * total;
    for (const [k, v] of entries) { x -= v ?? 0; if (x <= 0) return k; }
    return entries[entries.length - 1][0];
  }

  shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
}

export const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
