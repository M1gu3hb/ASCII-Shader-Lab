/**
 * Path data of a compiled glyph set (absolute M, L, Q, C, Z in font units, y up; see src/glyphset/set.ts)
 * read into commands, for the exports that rewrite it: the OTF builder, the SVGs. Pure: no DOM.
 */

export type PathCmd =
  | { t: 'M'; x: number; y: number }
  | { t: 'L'; x: number; y: number }
  | { t: 'Q'; x1: number; y1: number; x: number; y: number }
  | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { t: 'Z' };

const ARGS: Record<string, number> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

/** Reads path data as the compiler writes it. Throws a readable error on anything else. */
export function parsePath(d: string): PathCmd[] {
  const tokens = d.match(/[MLQCZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const out: PathCmd[] = [];
  let i = 0;
  while (i < tokens.length) {
    const c = tokens[i++];
    const k = ARGS[c];
    if (k === undefined) throw new Error('Un glifo tiene un trazo con comandos no válidos.');
    const v: number[] = [];
    for (let j = 0; j < k; j++) {
      const n = Number(tokens[i++]);
      if (!Number.isFinite(n)) throw new Error('Un glifo tiene un trazo con números no válidos.');
      v.push(n);
    }
    if (c !== 'M' && !out.length) throw new Error('Un glifo tiene un trazo que no empieza con M.');
    if (c === 'M' || c === 'L') out.push({ t: c, x: v[0], y: v[1] });
    else if (c === 'Q') out.push({ t: 'Q', x1: v[0], y1: v[1], x: v[2], y: v[3] });
    else if (c === 'C') out.push({ t: 'C', x1: v[0], y1: v[1], x2: v[2], y2: v[3], x: v[4], y: v[5] });
    else out.push({ t: 'Z' });
  }
  return out;
}

const fmt = (v: number) => String(Math.round(v * 100) / 100 || 0);

/** Writes commands back as path data; `fy` maps y (identity, or a flip for SVG's y-down space). */
export function writePath(cmds: PathCmd[], fy: (y: number) => number = y => y): string {
  let d = '';
  for (const c of cmds) {
    if (c.t === 'Z') d += 'Z';
    else if (c.t === 'Q') d += `Q${fmt(c.x1)} ${fmt(fy(c.y1))} ${fmt(c.x)} ${fmt(fy(c.y))}`;
    else if (c.t === 'C') d += `C${fmt(c.x1)} ${fmt(fy(c.y1))} ${fmt(c.x2)} ${fmt(fy(c.y2))} ${fmt(c.x)} ${fmt(fy(c.y))}`;
    else d += `${c.t}${fmt(c.x)} ${fmt(fy(c.y))}`;
  }
  return d;
}

export interface Box { x0: number; y0: number; x1: number; y1: number }

/** Extremes of a cubic's coordinate on [0, 1] (the curve, not its handles). */
function cubicRange(a: number, b: number, c: number, d: number): [number, number] {
  let lo = Math.min(a, d), hi = Math.max(a, d);
  // B'(t)/3 = (b-a)(1-t)² + 2(c-b)(1-t)t + (d-c)t², expanded to qa·t² + qb·t + qc
  const qa = -a + 3 * b - 3 * c + d, qb = 2 * (a - 2 * b + c), qc = b - a;
  const ts: number[] = [];
  if (Math.abs(qa) < 1e-12) { if (Math.abs(qb) > 1e-12) ts.push(-qc / qb); }
  else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc >= 0) { const s = Math.sqrt(disc); ts.push((-qb + s) / (2 * qa), (-qb - s) / (2 * qa)); }
  }
  for (const t of ts) {
    if (t <= 0 || t >= 1) continue;
    const u = 1 - t;
    const v = u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  return [lo, hi];
}

/** Bounds of the drawn outline (curve extremes, not handles); null when there is nothing. */
export function pathBounds(cmds: PathCmd[]): Box | null {
  let box: Box | null = null;
  const add = (x0: number, x1: number, y0: number, y1: number) => {
    box = box ? { x0: Math.min(box.x0, x0), y0: Math.min(box.y0, y0), x1: Math.max(box.x1, x1), y1: Math.max(box.y1, y1) } : { x0, y0, x1, y1 };
  };
  let px = 0, py = 0;
  for (const c of cmds) {
    if (c.t === 'Z') continue;
    if (c.t === 'M' || c.t === 'L') add(c.x, c.x, c.y, c.y);
    else {
      let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
      // a quadratic is the cubic with handles at 2/3 towards its control point
      if (c.t === 'Q') { x1 = px + (2 / 3) * (c.x1 - px); y1 = py + (2 / 3) * (c.y1 - py); x2 = c.x + (2 / 3) * (c.x1 - c.x); y2 = c.y + (2 / 3) * (c.y1 - c.y); }
      else { x1 = c.x1; y1 = c.y1; x2 = c.x2; y2 = c.y2; }
      const [xa, xb] = cubicRange(px, x1, x2, c.x), [ya, yb] = cubicRange(py, y1, y2, c.y);
      add(xa, xb, ya, yb);
    }
    px = c.x; py = c.y;
  }
  return box;
}
