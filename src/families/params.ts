import type { FamilyMeta, ParamSpec, ParamValue, Params } from './types';

/**
 * A layer's family settings, as the recipe keeps them (layer.fam). Absent on every other layer, so recipes
 * without families stay byte for byte as they were.
 *  - v: algorithm version the piece was made with (a newer one than this studio knows is refused);
 *  - seed: the run's seed (stateful families; analytic ones ignore it);
 *  - res: raster / simulation rows (raster families; columns are twice that);
 *  - p: typed parameters, keyed and ordered as the family declares them;
 *  - brush: what a touch on the stage does to the model (absent: nothing);
 *  - ck: a saved state (checkpoint) the run starts from, by content id (16 hex), when this browser has it.
 */
export interface LayerFam {
  v: number;
  seed: string;
  res?: number;
  p: Params;
  brush?: string;
  ck?: string;
}

export const FUTURE_FAMILY = 'Esta receta usa una versión más nueva de una familia visual de GLYPHOS. Conserva el archivo original y actualiza el estudio.';

const CK = /^[0-9a-f]{16}$/;

function numOf(v: unknown): number {
  return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
}

/** One parameter, validated: in range, of its type, or its default. */
export function normParam(s: ParamSpec, v: unknown): ParamValue {
  switch (s.type) {
    case 'number': {
      const n = numOf(v);
      return Number.isFinite(n) ? Math.min(s.max, Math.max(s.min, n)) : s.def;
    }
    case 'int': {
      const n = numOf(v);
      return Number.isFinite(n) ? Math.min(s.max, Math.max(s.min, Math.round(n))) : s.def;
    }
    case 'choice':
      return typeof v === 'string' && s.options.some(o => o.id === v) ? v : s.def;
    case 'bool':
      return typeof v === 'boolean' ? v : s.def;
    case 'text': {
      if (typeof v !== 'string') return s.def;
      let t = Array.from(v).slice(0, s.max);
      if (s.allowed) t = t.filter(c => s.allowed!.includes(c));
      return t.join('');
    }
  }
}

/** Every parameter of a family, in its declared order (unknown keys are dropped). */
export function normParams(meta: FamilyMeta, v: unknown): Params {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: Params = {};
  for (const s of meta.params) out[s.key] = normParam(s, o[s.key]);
  return out;
}

export function defaultParams(meta: FamilyMeta): Params {
  return normParams(meta, {});
}

/** Raster rows for a family: in its budget, or its default. */
export function normRes(meta: FamilyMeta, v: unknown): number | undefined {
  const b = meta.budget.res;
  if (!b) return undefined;
  const n = numOf(v);
  return Number.isFinite(n) ? Math.min(b[1], Math.max(b[0], Math.round(n))) : b[2];
}

export function normSeed(v: unknown): string {
  if (typeof v !== 'string') return 'glyphos';
  const s = v.trim().slice(0, 60);
  return s || 'glyphos';
}

/**
 * A layer's family settings, validated against the family. Throws on a newer algorithm version: the recipe
 * would be drawn differently here than where it was made, so it is refused instead of reinterpreted.
 */
export function normFam(meta: FamilyMeta, v: unknown): LayerFam {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const ver = numOf(o.v);
  if (Number.isFinite(ver) && ver > meta.version) throw new Error(FUTURE_FAMILY);
  const res = normRes(meta, o.res);
  const brush = typeof o.brush === 'string' && meta.caps.brushes?.some(b => b.id === o.brush) ? o.brush : undefined;
  const ck = meta.caps.checkpoint && typeof o.ck === 'string' && CK.test(o.ck) ? o.ck : undefined;
  return {
    v: Number.isFinite(ver) && ver >= 1 ? Math.floor(ver) : meta.version,
    seed: normSeed(o.seed),
    ...(res !== undefined ? { res } : {}),
    p: normParams(meta, o.p),
    ...(brush ? { brush } : {}),
    ...(ck ? { ck } : {}),
  };
}

/** A new layer's family settings: defaults, or a preset's values. */
export function famFor(meta: FamilyMeta, seed: string, presetId?: string): LayerFam {
  const pr = presetId ? meta.presets.find(p => p.id === presetId) : meta.presets[0];
  return normFam(meta, { v: meta.version, seed, res: pr?.res, p: { ...defaultParams(meta), ...(pr?.params ?? {}) } });
}

/** Parameters as numbers (choice: its index, bool: 0/1, text: its length), in declared order. */
export function paramNumbers(meta: FamilyMeta, p: Params): number[] {
  return meta.params.map(s => {
    const v = p[s.key];
    if (s.type === 'choice') return Math.max(0, s.options.findIndex(o => o.id === v));
    if (s.type === 'bool') return v ? 1 : 0;
    if (s.type === 'text') return typeof v === 'string' ? v.length : 0;
    return typeof v === 'number' ? v : 0;
  });
}

/** Analytic families: the first eight parameters packed for the shader (k0, k1) and its CPU twin. */
export function packParams(meta: FamilyMeta, p: Params, out = new Float32Array(8)): Float32Array {
  const n = paramNumbers(meta, p);
  out.fill(0);
  for (let i = 0; i < Math.min(8, n.length); i++) out[i] = Math.fround(n[i]);
  return out;
}

/** A parameter's value as people read it. */
export function formatParam(s: ParamSpec, v: ParamValue): string {
  if (s.type === 'number') {
    const d = s.digits ?? (s.max - s.min <= 2 ? 2 : s.max - s.min <= 20 ? 1 : 0);
    return (v as number).toFixed(d).replace('.', ',') + (s.unit ? ' ' + s.unit : '');
  }
  if (s.type === 'int') return String(v) + (s.unit ? ' ' + s.unit : '');
  if (s.type === 'choice') return s.options.find(o => o.id === v)?.label ?? String(v);
  if (s.type === 'bool') return v ? 'Sí' : 'No';
  return String(v);
}

/** Whether going from `a` to `b` needs a model built again from its seed (a structural parameter changed). */
export function needsRebuild(meta: FamilyMeta, a: Params, b: Params): boolean {
  return meta.params.some(s => s.rebuild && a[s.key] !== b[s.key]);
}
