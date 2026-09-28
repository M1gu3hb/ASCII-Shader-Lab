/**
 * The animation kit: what every template of the library shares. Pure (no DOM, no clock, no Math.random):
 * a template is a function of (progress, params, layer, grid) and nothing else, so the same clip gives the
 * same frames and a reversed clip gives the forward frames backwards (clips.ts).
 *
 *   numbers     clamp, lerp, smoothstep, easing shapes used inside templates
 *   noise       seeded value noise (smooth fields that do not flicker from cell to cell)
 *   grids       cell geometry in output px (CellGrid may come bare in tests: 10×20 cells are assumed)
 *   orders      «when does this cell switch?» fields 0..1: at random, sweeps, radial, spiral, by
 *               brightness, by edges, by reading order, Voronoi regions, bands… (cached per grid)
 *   holds       pauses inside a clip (progress plateaus)
 *   effects     per-cell visibility / movement turned into the right channel for the layer's kind:
 *               glyphs → CellFx (crisp characters), ascii / photo / text / shape → tiles of the picture
 *   params      the ParamDefs templates share (order, softness, zone, pauses…), in Spanish
 */
import type { CellFx } from '../glyphs/index';
import { hashString, rand01, type CellGrid, type ClipContext, type ClipEffect, type TemplateParamDef, type TileFx } from '../project/clips';
import type { LayerKind } from '../project/types';

/* ------------------------------------------------------------------ numbers */

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Smoothstep 0..1. */
export const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Maps x from [a, b] to 0..1 (clamped). */
export const span01 = (x: number, a: number, b: number) => (b > a ? clamp01((x - a) / (b - a)) : x >= b ? 1 : 0);
export const easeOutCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
export const easeInCubic = (x: number) => clamp01(x) ** 3;
export const easeInOutCubic = (x: number) => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
/** Out-back: overshoots a little and settles (k = overshoot). */
export const easeOutBack = (x: number, k = 1.4) => { const t = clamp01(x) - 1; return 1 + (k + 1) * t * t * t + k * t * t; };
/** 0 at both ends, 1 in the middle (sin(πx)); `hold` keeps the top flat over that share of the middle. */
export function bell(x: number, hold = 0): number {
  const t = clamp01(x);
  const h = clamp(hold, 0, 0.9);
  const a = (1 - h) / 2;
  if (t <= a) return a > 0 ? smooth(t / a) : 1;
  if (t >= 1 - a) return a > 0 ? smooth((1 - t) / a) : 1;
  return 1;
}
/** Fraction part (always 0..1, also for negatives). */
export const frac = (x: number) => x - Math.floor(x);
export const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ seeds and noise */

export const seedOfCtx = (ctx: Pick<ClipContext, 'seed'>, salt = '') => hashString(ctx.seed + salt);

/** Seeded value noise in 2D (smooth, 0..1): lattice values at integer points, smoothstep between them. */
export function vnoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = rand01(seed, xi, yi), b = rand01(seed, xi + 1, yi), c = rand01(seed, xi, yi + 1), d = rand01(seed, xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Two octaves of value noise (−1..1): turbulence for drifts and wobbles. */
export function noise2(seed: number, x: number, y: number): number {
  return (vnoise(seed, x, y) * 0.66 + vnoise(seed + 7919, x * 2.1, y * 2.1) * 0.34) * 2 - 1;
}

/** Seeded 1D noise (−1..1), smooth in t. */
export const noise1 = (seed: number, t: number) => vnoise(seed, t, 0.5) * 2 - 1;

/* ------------------------------------------------------------------ grids */

/** A grid with its sizes resolved (output px). */
export interface Geo {
  cols: number;
  rows: number;
  n: number;
  cw: number;
  ch: number;
  w: number;
  h: number;
  grid: CellGrid;
}

/** Cell geometry of a grid; a bare grid (tests) gets 10×20 px cells. */
export function geo(g: CellGrid): Geo {
  const cols = Math.max(1, g.cols | 0), rows = Math.max(1, g.rows | 0);
  const cw = g.cw && g.cw > 0 ? g.cw : 10, ch = g.ch && g.ch > 0 ? g.ch : 20;
  return { cols, rows, n: cols * rows, cw, ch, w: g.w && g.w > 0 ? g.w : cols * cw, h: g.h && g.h > 0 ? g.h : rows * ch, grid: g };
}

/** Centre of a cell in output px. */
export const cellX = (G: Geo, c: number) => (c + 0.5) * G.cw;
export const cellY = (G: Geo, r: number) => (r + 0.5) * G.ch;

/** Whether cell i holds a visible character (glyph grids; every cell counts when the grid has no characters). */
export const filled = (g: CellGrid, i: number) => !g.chars || (g.chars[i] ?? ' ') !== ' ';

/** Brightness of cell i (0.5 when the grid has none). */
export const lumAt = (g: CellGrid, i: number) => { const l = g.lum; return l ? (l[i] ?? 0.5) : 0.5; };

/* ------------------------------------------------------------------ memo */

const memo = new Map<string, unknown>();
/** Keeps a computed per-grid table (orders, regions) for frames that ask again; small LRU. */
export function cached<T>(key: string, make: () => T): T {
  const hit = memo.get(key);
  if (hit !== undefined) { memo.delete(key); memo.set(key, hit); return hit as T; }
  const v = make();
  memo.set(key, v);
  if (memo.size > 64) memo.delete(memo.keys().next().value as string);
  return v;
}

/** A short fingerprint of a grid's brightness and characters (a cache key that follows the picture). */
export function gridKey(g: CellGrid): string {
  const G = geo(g);
  let h = 0x811c9dc5;
  const step = Math.max(1, Math.floor(G.n / 256));
  const l = g.lum, ch = g.chars;
  for (let i = 0; i < G.n; i += step) {
    if (l) h = Math.imul(h ^ Math.round((l[i] ?? 0) * 255), 0x01000193);
    if (ch) h = Math.imul(h ^ (ch[i] ?? ' ').charCodeAt(0), 0x01000193);
  }
  return `${G.cols}x${G.rows}:${(h >>> 0).toString(36)}:${l ? 'l' : ''}${ch ? 'c' : ''}`;
}

/* ------------------------------------------------------------------ orders */

/**
 * Orders: a value 0..1 per cell saying when it switches (0 first, 1 last). Every order spans the whole
 * range, so a sweep driven by p ends with every cell switched at p = 1.
 */
export type OrderKind =
  | 'azar' | 'izquierda' | 'derecha' | 'arriba' | 'abajo' | 'centro' | 'bordes' | 'diagonal' | 'reloj' | 'espiral'
  | 'brillo' | 'sombras' | 'contornos' | 'ruido' | 'lectura' | 'columnas' | 'voronoi' | 'bandas';

export const ORDER_OPTIONS: Array<[OrderKind, string]> = [
  ['azar', 'Al azar'], ['izquierda', 'Desde la izquierda'], ['derecha', 'Desde la derecha'], ['arriba', 'Desde arriba'],
  ['abajo', 'Desde abajo'], ['centro', 'Desde el centro'], ['bordes', 'Desde los bordes'], ['diagonal', 'En diagonal'],
  ['reloj', 'Como un reloj'], ['espiral', 'En espiral'], ['brillo', 'Luces primero'], ['sombras', 'Sombras primero'],
  ['contornos', 'Contornos primero'], ['ruido', 'Manchas (ruido)'], ['lectura', 'Orden de lectura'], ['columnas', 'Por columnas al azar'],
  ['voronoi', 'Por regiones (Voronoi)'], ['bandas', 'Por bandas'],
];

export interface OrderOpts {
  /** Mix with random order 0..1 (a ragged edge). */
  irregular?: number;
  /** Degrees of the diagonal (0 = left to right, 90 = top to bottom). */
  angle?: number;
  /** Centre in frame units (radial, clock, spiral). */
  cx?: number;
  cy?: number;
  /** Regions for Voronoi / bands. */
  regions?: number;
  /** Spiral turns. */
  turns?: number;
}

/** Ranks of `key` (ascending) as 0..1: a uniform order whatever the distribution of the key. */
export function rankNormalize(key: Float32Array, seed: number): Float32Array {
  const n = key.length;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  // ties broken by a seeded jitter (flat areas do not switch in reading order)
  const k2 = new Float32Array(n);
  for (let i = 0; i < n; i++) k2[i] = key[i] + rand01(seed, i, 911) * 1e-4;
  idx.sort((a, b) => k2[a] - k2[b]);
  const out = new Float32Array(n);
  const d = Math.max(1, n - 1);
  for (let r = 0; r < n; r++) out[idx[r]] = r / d;
  return out;
}

function minMax(v: Float32Array): Float32Array {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < v.length; i++) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; }
  const d = hi - lo;
  if (!(d > 1e-9)) { v.fill(0); return v; }
  for (let i = 0; i < v.length; i++) v[i] = (v[i] - lo) / d;
  return v;
}

/** Edge strength of each cell from its brightness (Sobel on the cell grid). */
export function edgeField(g: CellGrid): Float32Array {
  const G = geo(g);
  const out = new Float32Array(G.n);
  const L = (c: number, r: number) => lumAt(g, clamp(r, 0, G.rows - 1) * G.cols + clamp(c, 0, G.cols - 1));
  for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
    const gx = L(c + 1, r - 1) + 2 * L(c + 1, r) + L(c + 1, r + 1) - L(c - 1, r - 1) - 2 * L(c - 1, r) - L(c - 1, r + 1);
    const gy = L(c - 1, r + 1) + 2 * L(c, r + 1) + L(c + 1, r + 1) - L(c - 1, r - 1) - 2 * L(c, r - 1) - L(c + 1, r - 1);
    out[r * G.cols + c] = Math.hypot(gx, gy);
  }
  return out;
}

/** Region index of each cell: Voronoi cells around `k` seeded points (aspect-correct), or `k` horizontal bands. */
export function regionField(kind: 'voronoi' | 'bandas' | 'brillo' | 'rejilla', g: CellGrid, seed: number, k: number): Int32Array {
  const G = geo(g);
  return cached(`reg:${kind}:${seed}:${k}:${kind === 'brillo' ? gridKey(g) : `${G.cols}x${G.rows}`}`, () => {
    const out = new Int32Array(G.n);
    const K = Math.max(1, Math.round(k));
    if (kind === 'bandas') {
      for (let r = 0; r < G.rows; r++) out.fill(Math.min(K - 1, Math.floor((r / G.rows) * K)), r * G.cols, (r + 1) * G.cols);
    } else if (kind === 'brillo') {
      for (let i = 0; i < G.n; i++) out[i] = Math.min(K - 1, Math.floor(lumAt(g, i) * K));
    } else if (kind === 'rejilla') {
      const side = Math.max(1, Math.round(Math.sqrt(K)));
      for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
        out[r * G.cols + c] = Math.min(side - 1, Math.floor((r / G.rows) * side)) * side + Math.min(side - 1, Math.floor((c / G.cols) * side));
      }
    } else {
      const px: number[] = [], py: number[] = [];
      for (let j = 0; j < K; j++) { px.push(rand01(seed, j, 1) * G.w); py.push(rand01(seed, j, 2) * G.h); }
      for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
        const x = cellX(G, c), y = cellY(G, r);
        let best = 0, bd = Infinity;
        for (let j = 0; j < K; j++) { const d = (x - px[j]) ** 2 + (y - py[j]) ** 2; if (d < bd) { bd = d; best = j; } }
        out[r * G.cols + c] = best;
      }
    }
    return out;
  });
}

/** The order field of a grid (see OrderKind). Cached per grid, kind, seed and options. */
export function orderField(kind: OrderKind, g: CellGrid, seed: number, o: OrderOpts = {}): Float32Array {
  const G = geo(g);
  const irr = clamp01(o.irregular ?? 0);
  const needsPicture = kind === 'brillo' || kind === 'sombras' || kind === 'contornos' || kind === 'lectura';
  const key = `ord:${kind}:${seed}:${irr}:${o.angle ?? 0}:${o.cx ?? 0.5}:${o.cy ?? 0.5}:${o.regions ?? 0}:${o.turns ?? 0}:${needsPicture ? gridKey(g) : `${G.cols}x${G.rows}:${G.w}x${G.h}`}`;
  return cached(key, () => {
    const v = new Float32Array(G.n);
    const cx0 = (o.cx ?? 0.5) * G.w, cy0 = (o.cy ?? 0.5) * G.h;
    let rank = false;
    switch (kind) {
      case 'brillo': for (let i = 0; i < G.n; i++) v[i] = 1 - lumAt(g, i); rank = true; break;
      case 'sombras': for (let i = 0; i < G.n; i++) v[i] = lumAt(g, i); rank = true; break;
      case 'contornos': { const e = edgeField(g); for (let i = 0; i < G.n; i++) v[i] = -e[i]; rank = true; break; }
      case 'lectura': {
        // non-empty cells in reading order first, then the empty ones
        let k = 0;
        for (let i = 0; i < G.n; i++) if (filled(g, i)) v[i] = k++;
        for (let i = 0; i < G.n; i++) if (!filled(g, i)) v[i] = k++;
        break;
      }
      case 'voronoi': case 'bandas': {
        const reg = regionField(kind, g, seed, o.regions ?? 9);
        const K = Math.max(1, Math.round(o.regions ?? 9));
        // each region its own delay; inside it, a little spread so it does not switch in one frame
        for (let i = 0; i < G.n; i++) v[i] = rand01(seed, reg[i], 77) * 0.85 + rand01(seed, i, 78) * 0.15 / K;
        break;
      }
      default:
        for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
          const i = r * G.cols + c;
          const x = cellX(G, c), y = cellY(G, r);
          const nx = x / G.w, ny = y / G.h;
          switch (kind) {
            case 'izquierda': v[i] = nx; break;
            case 'derecha': v[i] = 1 - nx; break;
            case 'arriba': v[i] = ny; break;
            case 'abajo': v[i] = 1 - ny; break;
            case 'centro': v[i] = Math.hypot(x - cx0, y - cy0); break;
            case 'bordes': v[i] = -Math.min(x, G.w - x, y, G.h - y); break;
            case 'diagonal': { const a = ((o.angle ?? 45) * Math.PI) / 180; v[i] = x * Math.cos(a) + y * Math.sin(a); break; }
            case 'reloj': v[i] = frac(Math.atan2(x - cx0, -(y - cy0)) / TAU); break;
            case 'espiral': {
              // position along an Archimedean spiral r = R·s: the winding a cell sits on, plus its angle
              const R = Math.hypot(Math.max(cx0, G.w - cx0), Math.max(cy0, G.h - cy0));
              const turns = Math.max(1, o.turns ?? 3);
              const u = frac(Math.atan2(x - cx0, -(y - cy0)) / TAU);
              const w = (Math.hypot(x - cx0, y - cy0) / R) * turns;
              v[i] = (Math.floor(w - u + 0.5) + u) / turns;
              break;
            }
            case 'ruido': v[i] = vnoise(seed, nx * 5, ny * 5 * (G.h / G.w)); rank = true; break;
            case 'columnas': v[i] = rand01(seed, c, 5) * 0.9 + ny * 0.1; break;
            default: v[i] = rand01(seed, c, r);
          }
        }
    }
    const base = rank ? rankNormalize(v, seed) : minMax(v);
    if (irr > 0) for (let i = 0; i < G.n; i++) base[i] = base[i] * (1 - irr) + rand01(seed, i, 313) * irr;
    return base;
  });
}

/**
 * Visibility of a cell switching at `order` when the progress is p, with an edge `soft` wide (0..1 of the
 * whole sweep): 0 at p = 0 and 1 at p = 1 for every cell.
 */
export function sweep(order: number, p: number, soft: number): number {
  const s = Math.max(0.001, soft);
  return smooth((p * (1 + s) - order) / s);
}

/** Local progress 0..1 of a cell that starts at `order·(1 − len)` and lasts `len` of the clip. */
export function stagger(order: number, p: number, len: number): number {
  const L = clamp(len, 0.02, 1);
  return clamp01((p - order * (1 - L)) / L);
}

/* ------------------------------------------------------------------ holds */

/**
 * Pauses inside a clip: `n` plateaus evenly spread over the progress (at 1/(n+1), 2/(n+1)…) that take
 * `share` of the time together. Monotonic, 0 → 0 and 1 → 1 (so entries still end untouched).
 */
export function withHolds(p: number, n: number, share: number): number {
  const k = Math.max(0, Math.round(n));
  const sh = clamp(share, 0, 0.9);
  const x = clamp01(p);
  if (!k || sh <= 0) return x;
  const move = (1 - sh) / (k + 1), hold = sh / k, period = move + hold;
  const j = Math.floor(x / period);
  if (j >= k) return clamp01(k / (k + 1) + ((x - k * period) / move) / (k + 1));
  const within = x - j * period;
  if (within < move) return (j + within / move) / (k + 1);
  return (j + 1) / (k + 1);
}

/** Progress after the template's own «pausas» params (when it has them). */
export function heldP(ctx: ClipContext): number {
  const n = Number(ctx.params.pausas ?? 0), share = Number(ctx.params.pausa ?? 0.3);
  return withHolds(ctx.p, n, share);
}

/* ------------------------------------------------------------------ zones */

export type ZoneKind = 'todo' | 'centro' | 'izquierda' | 'derecha' | 'arriba' | 'abajo' | 'luces' | 'sombras' | 'contornos';
export const ZONE_OPTIONS: Array<[ZoneKind, string]> = [
  ['todo', 'Toda la capa'], ['centro', 'El centro'], ['izquierda', 'La mitad izquierda'], ['derecha', 'La mitad derecha'],
  ['arriba', 'La mitad de arriba'], ['abajo', 'La mitad de abajo'], ['luces', 'Las luces'], ['sombras', 'Las sombras'], ['contornos', 'Los contornos'],
];

/** Which cells a template touches (the rest stay as drawn). null = all. */
export function zoneOf(kind: string, g: CellGrid): ((i: number, c: number, r: number) => boolean) | null {
  if (!kind || kind === 'todo') return null;
  const G = geo(g);
  switch (kind) {
    case 'centro': return (_i, c, r) => ((cellX(G, c) / G.w - 0.5) / 0.32) ** 2 + ((cellY(G, r) / G.h - 0.5) / 0.32) ** 2 <= 1;
    case 'izquierda': return (_i, c) => cellX(G, c) < G.w / 2;
    case 'derecha': return (_i, c) => cellX(G, c) >= G.w / 2;
    case 'arriba': return (_i, _c, r) => cellY(G, r) < G.h / 2;
    case 'abajo': return (_i, _c, r) => cellY(G, r) >= G.h / 2;
    case 'luces': return i => lumAt(g, i) >= 0.5;
    case 'sombras': return i => lumAt(g, i) < 0.5;
    case 'contornos': {
      const e = cached(`edge:${gridKey(g)}`, () => { const f = edgeField(g); const s = Float32Array.from(f).sort(); return { f, cut: s[Math.floor(s.length * 0.7)] ?? 0 }; });
      return i => e.f[i] >= e.cut && e.f[i] > 0;
    }
    default: return null;
  }
}

/* ------------------------------------------------------------------ effects */

/** A per-cell change in CellFx terms (visible, dx, dy, scale, rot, glyph, color): null = untouched. */
export type CellFn = (i: number, c: number, r: number) => CellFx | null;
export type CellMaker = (g: CellGrid) => CellFn;

/** Whether a CellFx changes nothing. */
export function neutralCell(f: CellFx | null, char?: string): boolean {
  if (!f) return true;
  return (f.visible === undefined || f.visible >= 1) && !f.dx && !f.dy && (f.scale === undefined || f.scale === 1) && !f.rot
    && (f.glyph === undefined || f.glyph === char) && f.color === undefined;
}

/** A CellFx as a tile move (characters and colours cannot change on a picture: they are left out). */
export function cellToTile(f: CellFx | null): TileFx | null {
  if (!f) return null;
  const t: TileFx = {};
  if (f.dx) t.dx = f.dx;
  if (f.dy) t.dy = f.dy;
  if (f.scale !== undefined && f.scale !== 1) t.scale = f.scale;
  if (f.rot) t.rot = f.rot;
  if (f.visible !== undefined && f.visible < 1) t.alpha = Math.max(0, f.visible);
  return t.dx || t.dy || t.scale !== undefined || t.rot || t.alpha !== undefined ? t : null;
}

export interface PerCellOptions {
  /** Tile size (output px) on layers without a grid (photo, text, shape). */
  tileCell?: number;
  /** Restrict to a zone (ZoneKind); cells outside stay untouched. */
  zone?: string;
  /** For ascii layers: use the engine's cell reveal for visibility-only changes (crisper, cheaper). */
  revealOnly?: boolean;
  /** Characters the clip may draw (glyph layers load their font). */
  glyphs?: string;
}

/**
 * The effect of a per-cell change on this layer's kind: characters on glyph layers; tiles of the picture on
 * ascii, photo, text and shape layers (and the engine's cell reveal when only visibility changes).
 */
export function perCell(ctx: ClipContext, make: CellMaker, o: PerCellOptions = {}): ClipEffect {
  const kind: LayerKind = ctx.layer.kind;
  const withZone: CellMaker = o.zone && o.zone !== 'todo'
    ? g => {
      const f = make(g);
      const z = zoneOf(o.zone!, g);
      return z ? (i, c, r) => (z(i, c, r) ? f(i, c, r) : null) : f;
    }
    : make;
  if (kind === 'glyphs') return { cells: withZone, ...(o.glyphs ? { glyphs: o.glyphs } : {}) };
  if (kind === 'ascii' && o.revealOnly) {
    return {
      reveal: g => {
        const f = withZone(g);
        const cols = Math.max(1, g.cols);
        return (c, r) => { const x = f(r * cols + c, c, r); return x?.visible ?? 1; };
      },
    };
  }
  const eff: ClipEffect = {
    tiles: g => {
      const f = withZone(g);
      const cols = Math.max(1, g.cols);
      return (c, r) => cellToTile(f(r * cols + c, c, r));
    },
  };
  if (kind !== 'ascii') eff.tileCell = o.tileCell ?? 24;
  return eff;
}

/** Per-cell visibility 0..1 (1 = as drawn) for any kind. */
export function perCellVisibility(ctx: ClipContext, vis: (g: CellGrid) => (i: number, c: number, r: number) => number, o: PerCellOptions = {}): ClipEffect {
  return perCell(ctx, g => {
    const v = vis(g);
    return (i, c, r) => { const a = v(i, c, r); return a >= 1 ? null : { visible: Math.max(0, a) }; };
  }, { revealOnly: true, ...o });
}

/** Layer kinds that have characters or cells worth animating one by one. */
export const CELL_KINDS: LayerKind[] = ['glyphs', 'ascii'];
export const PICTURE_KINDS: LayerKind[] = ['glyphs', 'ascii', 'photo'];
export const ALL_KINDS: LayerKind[] = ['glyphs', 'ascii', 'photo', 'text', 'shape'];

/* ------------------------------------------------------------------ params */

type Def = TemplateParamDef;
export const P = {
  order: (def: OrderKind = 'azar', only?: OrderKind[], key = 'orden', label = 'Orden'): Def => ({
    key, label, type: 'select', options: only ? ORDER_OPTIONS.filter(([k]) => only.includes(k)) : ORDER_OPTIONS, def,
    help: 'Qué celdas cambian primero. «Luces», «Sombras» y «Contornos» siguen la imagen.',
  }),
  soft: (def = 0.2): Def => ({ key: 'suavidad', label: 'Suavidad del borde', type: 'range', min: 0, max: 1, step: 0.05, def, help: 'Cuántas celdas están a medio camino a la vez.' }),
  irregular: (def = 0.15): Def => ({ key: 'irregular', label: 'Borde irregular', type: 'range', min: 0, max: 1, step: 0.05, def, help: 'Mezcla el orden con celdas al azar.' }),
  intensity: (def = 1, label = 'Intensidad'): Def => ({ key: 'intensidad', label, type: 'range', min: 0, max: 2, step: 0.05, def }),
  zone: (): Def => ({ key: 'zona', label: 'Zona', type: 'select', options: ZONE_OPTIONS, def: 'todo', help: 'Solo esas celdas se animan; las demás quedan como están.' }),
  holds: (): Def[] => [
    { key: 'pausas', label: 'Pausas', type: 'range', min: 0, max: 4, step: 1, def: 0, help: 'Momentos quietos repartidos dentro del clip.' },
    { key: 'pausa', label: 'Tiempo en pausa', type: 'range', min: 0.05, max: 0.8, step: 0.05, def: 0.3, help: 'Parte del clip que se va en las pausas (con al menos una pausa).' },
  ],
  cycles: (def = 1, max = 12, label = 'Ciclos'): Def => ({ key: 'ciclos', label, type: 'range', min: 1, max, step: 1, def, help: 'Vueltas completas dentro del clip (enteras: el bucle cierra sin salto).' }),
  center: (): Def[] => [
    { key: 'x', label: 'Centro horizontal', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5 },
    { key: 'y', label: 'Centro vertical', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5 },
  ],
  color: (key: string, label: string, def: string, help?: string): Def => ({ key, label, type: 'color', def, ...(help ? { help } : {}) }),
};

/** A param read as a number with a fallback (params are already clamped by paramsOf). */
export const num = (ctx: ClipContext, key: string, def = 0): number => {
  const v = ctx.params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
};
export const str = (ctx: ClipContext, key: string, def = ''): string => {
  const v = ctx.params[key];
  return typeof v === 'string' ? v : def;
};
export const bool = (ctx: ClipContext, key: string, def = false): boolean => {
  const v = ctx.params[key];
  return typeof v === 'boolean' ? v : def;
};

/* ------------------------------------------------------------------ colours */

export function parseColor(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [237, 230, 218];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
export function mixColor(a: string, b: string, k: number): string {
  const x = parseColor(a), y = parseColor(b);
  return toHex(lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k));
}
/** Rotates the hue of a colour by `deg` degrees (in HSL). */
export function hueRotate(hex: string, deg: number): string {
  const [r, g, b] = parseColor(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return toHex(r * 255, g * 255, b * 255);
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = frac(h / 6 + deg / 360);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = frac(t); return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return toHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}
/** A colour along a list of stops (0..1), interpolated. */
export function gradientAt(stops: readonly string[], x: number): string {
  if (!stops.length) return '#ede6da';
  if (stops.length === 1) return stops[0];
  const t = clamp01(x) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return mixColor(stops[i], stops[i + 1], t - i);
}

/** Palettes offered by colour templates (fx palettes that have colours, plus a few of the brand). */
export const COLOR_SETS: Array<{ id: string; name: string; colors: string[] }> = [
  { id: 'glyphos', name: 'Tinta, hueso y bermellón', colors: ['#0c0b0a', '#ede6da', '#ff5b1f'] },
  { id: 'fosforo', name: 'Fósforo verde', colors: ['#0b3d12', '#1f8a2c', '#4fe36a', '#c6ffc9'] },
  { id: 'ambar', name: 'Terminal ámbar', colors: ['#5a3300', '#b36b00', '#ffb000', '#ffe1a0'] },
  { id: 'cianotipo', name: 'Cianotipia', colors: ['#19376d', '#576cbc', '#a5d7e8', '#f1f6f9'] },
  { id: 'atardecer', name: 'Atardecer', colors: ['#3b2340', '#b34d4d', '#ff9b5e', '#ffd27a'] },
  { id: 'neon', name: 'Neón', colors: ['#ff2bd6', '#7a5cff', '#2bd9ff', '#b8ffcf'] },
  { id: 'riso', name: 'Risografía', colors: ['#3255a4', '#ff48b0', '#ffe800', '#f4efe4'] },
  { id: 'gameboy', name: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  { id: 'cga', name: 'CGA', colors: ['#55ffff', '#ff55ff', '#ffffff', '#000000'] },
  { id: 'sepia', name: 'Sepia', colors: ['#4a3423', '#7a5a3d', '#ad8a62', '#f5e9d0'] },
];
export const COLOR_SET_OPTIONS: Array<[string, string]> = COLOR_SETS.map(s => [s.id, s.name]);
export const colorSet = (id: string) => (COLOR_SETS.find(s => s.id === id) ?? COLOR_SETS[0]).colors;

/* ------------------------------------------------------------------ glyph pools */

/** Characters for scrambles, rains and counters. */
export const GLYPH_POOLS: Record<string, { name: string; chars: string }> = {
  propio: { name: 'Los de la capa', chars: '' },
  binario: { name: 'Binario 0 1', chars: '01' },
  hex: { name: 'Hexadecimal', chars: '0123456789ABCDEF' },
  katakana: { name: 'Katakana', chars: 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ' },
  simbolos: { name: 'Símbolos', chars: '#%&@$*+=/\\|<>?!~^' },
  bloques: { name: 'Bloques', chars: '░▒▓█▀▄▌▐' },
  letras: { name: 'Letras', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
};
export const POOL_OPTIONS: Array<[string, string]> = Object.entries(GLYPH_POOLS).map(([k, v]) => [k, v.name]);

/** The characters of a pool; 'propio' = the distinct characters of the grid (or a default ramp). */
export function poolChars(id: string, g?: CellGrid): string[] {
  const p = GLYPH_POOLS[id];
  if (p && p.chars) return Array.from(p.chars);
  if (g?.chars) {
    const set = new Set<string>();
    for (const c of g.chars) if (c && c !== ' ') { set.add(c); if (set.size > 96) break; }
    if (set.size >= 2) return [...set];
  }
  return Array.from('.:-=+*#%@');
}
