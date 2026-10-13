import { cyrb128 } from '../random/prng';

/**
 * Seeded generator for the models (sfc32, as src/random/prng.ts) whose state can be read and written:
 * a model's snapshot carries it, so a run restored from a snapshot draws exactly what the original run
 * would have drawn next.
 */
export class SimRng {
  a = 0; b = 0; c = 0; d = 0;

  constructor(key: string) {
    [this.a, this.b, this.c, this.d] = cyrb128(key);
    for (let i = 0; i < 12; i++) this.next();
  }

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

  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(n: number): number { return Math.floor(this.next() * n); }
  /** Normal deviate (Box–Muller, one value per call). */
  gauss(): number {
    const u = 1 - this.next(), v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  get state(): [number, number, number, number] { return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0]; }
  set state(s: [number, number, number, number]) { [this.a, this.b, this.c, this.d] = s.map(x => x >>> 0) as [number, number, number, number]; }

  /** Writes the state into a snapshot's scalars under `prefix`. */
  save(into: Record<string, number>, prefix = 'rng') {
    const s = this.state;
    into[prefix + 'A'] = s[0]; into[prefix + 'B'] = s[1]; into[prefix + 'C'] = s[2]; into[prefix + 'D'] = s[3];
  }
  load(from: Record<string, number>, prefix = 'rng') {
    this.state = [from[prefix + 'A'] ?? 0, from[prefix + 'B'] ?? 0, from[prefix + 'C'] ?? 0, from[prefix + 'D'] ?? 0];
  }
}
