import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Life-like cellular automata and their «Generations» extension, written from the rule notation: a 2:1 grid
 * of cells that are dead (0), alive (1) or, with C > 2 states, dying (2 … C − 1). Every generation a dead cell
 * is born when its number of live neighbours is in B; a live cell stays alive when it is in S and otherwise
 * starts dying (or dies, with two states); a dying cell ages one state per generation and then dies. Only live
 * cells count as neighbours. Neighbourhood: Moore (8 cells) or von Neumann (4). Edges: a torus, or dead cells
 * beyond the border. The run takes «Velocidad» generations per second: each step adds that many to a counter
 * and a generation runs every `rate` of them, so time stays a whole number of generations.
 */

const ID = 'automata', V = 1;
const RATE = 30;

export interface Rule { birth: boolean[]; survive: boolean[]; states: number }

/** Built-in rules (B/S/C notation). */
export const RULES: Record<string, string> = {
  conway: 'B3/S23', highlife: 'B36/S23', diaynoche: 'B3678/S34678', cerebro: 'B2/S/3',
  starwars: 'B2/S345/4', coral: 'B3/S45678', laberinto: 'B3/S12345',
};

/**
 * Parses «B3/S23», «B2/S/3», «B2/S345/C4», «b3s23» or the older «23/3» and «345/2/4» (S/B/C). Digits above 8
 * are ignored; states are kept in 2 … 16. Null when it is not a rule.
 */
export function parseRule(text: string): Rule | null {
  const t = text.replace(/\s+/g, '').toUpperCase().slice(0, 40);
  if (!t) return null;
  const birth = new Array<boolean>(9).fill(false), survive = new Array<boolean>(9).fill(false);
  let states = 2;
  const digits = (s: string, into: boolean[]) => { for (const c of s) { const d = c.charCodeAt(0) - 48; if (d >= 0 && d <= 8) into[d] = true; } };
  if (/[BS]/.test(t)) {
    const b = /B([0-9]*)/.exec(t), s = /S([0-9]*)/.exec(t);
    if (!b) return null;
    digits(b[1], birth);
    if (s) digits(s[1], survive);
    // the states: «/C4», «C4» or a last «/4» after the S part
    const c = /C([0-9]+)/.exec(t) ?? /S[0-9]*\/([0-9]+)$/.exec(t) ?? /^B[0-9]*\/([0-9]+)$/.exec(t);
    if (c) states = Number(c[1]);
  } else {
    const parts = t.split('/');
    if (parts.length < 2 || parts.length > 3 || parts.some(x => !/^[0-9]*$/.test(x))) return null;
    digits(parts[0], survive);
    digits(parts[1], birth);
    if (parts[2]) states = Number(parts[2]);
  }
  if (!Number.isFinite(states)) states = 2;
  return { birth, survive, states: Math.max(2, Math.min(16, Math.round(states))) };
}

interface P { rule: string; custom: string; neigh: string; density: number; seedShape: string; edges: string; speed: number; trail: string }
const read = (p: Params): P => ({
  rule: String(p.rule ?? 'conway'), custom: String(p.custom ?? 'B3/S23'), neigh: String(p.neigh ?? 'moore'),
  density: Number(p.density ?? 0.3), seedShape: String(p.seedShape ?? 'aleatoria'), edges: String(p.edges ?? 'toro'),
  speed: Math.round(Number(p.speed ?? 10)), trail: String(p.trail ?? 'corta'),
});
const ruleOf = (p: P): Rule => parseRule(p.rule === 'propia' ? p.custom : RULES[p.rule] ?? RULES.conway) ?? parseRule(RULES.conway)!;
const FADE: Record<string, number> = { ninguna: 0, corta: 0.62, larga: 0.88 };
/**
 * Brightness of a live cell: just under white, so a sample half-way between a live and a dead cell is no exact
 * half (the two engines round such ties to different glyphs).
 */
const ALIVE = 0.96;

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h, n = w * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  let rule = ruleOf(p);
  let steps = 0, acc = 0;
  /** State per cell, and generations since each cell was last alive (255: long ago). */
  let S = new Uint8Array(n), S2 = new Uint8Array(n);
  const age = new Uint8Array(n).fill(255);
  // live cells with a one-cell border (copies of the far side on a torus, dead when closed)
  const pw = w + 2, L = new Uint8Array(pw * (h + 2));

  // ---- seeding (deterministic from the seed)
  const put = (x: number, y: number) => { if (x >= 0 && x < w && y >= 0 && y < h) { S[y * w + x] = 1; age[y * w + x] = 0; } };
  switch (p.seedShape) {
    case 'centro': {
      const s = Math.max(6, Math.round(h / 4)), x0 = Math.floor((w - s) / 2), y0 = Math.floor((h - s) / 2);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if (rng.next() < p.density) put(x0 + x, y0 + y);
      break;
    }
    case 'simetrica': {
      // a random quarter mirrored both ways: the run keeps the symmetry
      const sx = Math.max(4, Math.round(h * 0.45)), sy = Math.max(4, Math.round(h * 0.3)), cx = w / 2, cy = h / 2;
      for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
        if (rng.next() >= p.density) continue;
        put(cx + x, cy + y); put(cx - 1 - x, cy + y); put(cx + x, cy - 1 - y); put(cx - 1 - x, cy - 1 - y);
      }
      break;
    }
    default:
      for (let i = 0; i < n; i++) if (rng.next() < p.density) { S[i] = 1; age[i] = 0; }
  }

  const generation = () => {
    const wrap = p.edges !== 'cerrado', moore = p.neigh !== 'vonneumann', C = rule.states, B = rule.birth, Sv = rule.survive;
    for (let y = 0; y < h; y++) {
      const o = y * w, po = (y + 1) * pw + 1;
      for (let x = 0; x < w; x++) L[po + x] = S[o + x] === 1 ? 1 : 0;
    }
    // border: the far side on a torus, dead otherwise
    for (let y = 1; y <= h; y++) { L[y * pw] = wrap ? L[y * pw + w] : 0; L[y * pw + w + 1] = wrap ? L[y * pw + 1] : 0; }
    for (let x = 0; x < pw; x++) { L[x] = wrap ? L[h * pw + x] : 0; L[(h + 1) * pw + x] = wrap ? L[pw + x] : 0; }
    for (let y = 0; y < h; y++) {
      const o = y * w, c = (y + 1) * pw + 1;
      for (let x = 0; x < w; x++) {
        const k = c + x;
        let nb = L[k - pw] + L[k + pw] + L[k - 1] + L[k + 1];
        if (moore) nb += L[k - pw - 1] + L[k - pw + 1] + L[k + pw - 1] + L[k + pw + 1];
        const s = S[o + x];
        let ns: number;
        if (s === 0) ns = B[nb] ? 1 : 0;
        else if (s === 1) ns = Sv[nb] ? 1 : C > 2 ? 2 : 0;
        else ns = s + 1 >= C ? 0 : s + 1;
        S2[o + x] = ns;
        age[o + x] = ns === 1 ? 0 : age[o + x] < 255 ? age[o + x] + 1 : 255;
      }
    }
    const t = S; S = S2; S2 = t;
  };

  // brightness of a dead cell by its age («Estela»), cached per fade
  const glow = new Float32Array(256);
  let glowFade = -1;

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) {
      p = read(np);
      rule = ruleOf(p);
      // dying states the new rule does not have die now
      for (let i = 0; i < n; i++) if (S[i] >= rule.states) S[i] = 0;
    },
    step(k: number) {
      for (let i = 0; i < k; i++) {
        acc += Math.max(1, Math.min(RATE, p.speed));
        while (acc >= RATE) { acc -= RATE; generation(); }
        steps++;
      }
    },
    render(out: Uint8Array) {
      const C = rule.states, f = FADE[p.trail] ?? 0;
      if (f !== glowFade) {
        glowFade = f;
        glow.fill(0);
        if (f > 0) for (let a = 1; a < 256; a++) glow[a] = 0.42 * Math.pow(f, a - 1);
      }
      for (let i = 0; i < n; i++) {
        const s = S[i];
        let v = s === 1 ? ALIVE : s > 1 ? 0.8 * (C - s) / (C - 1) : 0;
        const g = glow[age[i]];
        if (g > v) v = g;
        out[i] = (v * 255 + 0.5) | 0;
      }
    },
    stroke(s: Stroke) {
      const ax = (s.x0 * 0.5 + 0.5) * w, ay = (0.5 - s.y0) * h, bx = (s.x1 * 0.5 + 0.5) * w, by = (0.5 - s.y1) * h;
      const R = Math.max(1, s.r * h), len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.ceil(len / Math.max(1, R * 0.5)));
      const pAlive = 0.3 + 0.4 * s.strength;
      for (let j = 0; j <= k; j++) {
        const cx = ax + ((bx - ax) * j) / k, cy = ay + ((by - ay) * j) / k;
        for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > R) continue;
          const i = (((y % h) + h) % h) * w + (((x % w) + w) % w);
          if (s.brush === 'borrar') { S[i] = 0; age[i] = 255; }
          else if (rng.next() < pAlive) { S[i] = 1; age[i] = 0; }
        }
      }
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { acc };
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { S: S.slice(), age: age.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a esta simulación.');
      const a = s.arrays.S, g = s.arrays.age;
      if (!(a instanceof Uint8Array) || !(g instanceof Uint8Array) || a.length !== n || g.length !== n) throw new Error('El estado guardado está incompleto.');
      S.set(a); age.set(g);
      for (let i = 0; i < n; i++) if (S[i] >= rule.states) S[i] = 0;
      steps = s.steps; acc = s.scalars.acc ?? 0;
      rng.load(s.scalars);
    },
  };
}
