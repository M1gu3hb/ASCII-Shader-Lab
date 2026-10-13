import type { FamilyIndexEntry, FamilyMeta, ParamSpec, ParamValue, Params, TimeContract } from './types';

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

/** The controls a layer made with algorithm version `v` has (ParamSpec.since). */
export const paramsAt = (meta: FamilyMeta, v = meta.version) => meta.params.filter(s => (s.since ?? 1) <= v);

/** Every parameter of a family (in version `v`), in its declared order (unknown keys are dropped). */
export function normParams(meta: FamilyMeta, v: unknown, ver = meta.version): Params {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: Params = {};
  for (const s of paramsAt(meta, ver)) out[s.key] = normParam(s, o[s.key]);
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
  const made = Number.isFinite(ver) && ver >= 1 ? Math.floor(ver) : meta.version;
  return {
    v: made,
    seed: normSeed(o.seed),
    ...(res !== undefined ? { res } : {}),
    p: normParams(meta, o.p, made),
    ...(brush ? { brush } : {}),
    ...(ck ? { ck } : {}),
  };
}

/**
 * A layer's family settings while the family's spec is not loaded (registry.ts): bounded in shape and size, and
 * refused when newer than this studio knows. normFam finishes the job against the spec: the host does before it
 * builds a run, so no unchecked value ever reaches a model.
 */
export function normFamLoose(e: FamilyIndexEntry, v: unknown): LayerFam {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const ver = numOf(o.v);
  if (Number.isFinite(ver) && ver > e.v) throw new Error(FUTURE_FAMILY);
  const p: Params = {};
  const raw = o.p && typeof o.p === 'object' && !Array.isArray(o.p) ? Object.entries(o.p as Record<string, unknown>).slice(0, 64) : [];
  for (const [k, x] of raw) {
    if (!/^\w{1,40}$/.test(k)) continue;
    if ((typeof x === 'number' && Number.isFinite(x)) || typeof x === 'boolean' || (typeof x === 'string' && x.length <= 2000)) p[k] = x;
  }
  const res = typeof o.res === 'number' && Number.isFinite(o.res) && o.res >= 8 && o.res <= 1024 ? Math.round(o.res) : undefined;
  const brush = typeof o.brush === 'string' && /^\w{1,40}$/.test(o.brush) ? o.brush : undefined;
  const ck = typeof o.ck === 'string' && CK.test(o.ck) ? o.ck : undefined;
  return {
    v: Number.isFinite(ver) && ver >= 1 ? Math.floor(ver) : e.v,
    seed: normSeed(o.seed),
    ...(res !== undefined ? { res } : {}),
    p,
    ...(brush ? { brush } : {}),
    ...(ck ? { ck } : {}),
  };
}

const checked = new WeakMap<LayerFam, LayerFam>();
/**
 * A layer's family settings checked against the family's spec, once per settings object: what the engines hand
 * to a model or a shader (a recipe read before the specs arrived carries them only bounded in shape).
 */
export function checkedFam(meta: FamilyMeta, f: LayerFam): LayerFam {
  let s = checked.get(f);
  if (!s) { s = normFam(meta, f); checked.set(f, s); checked.set(s, s); }
  return s;
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

/**
 * Typed parameters an analytic family reads: sixteen slots, k0…k3 in the shader (k0 and k1 are the chunk's
 * arguments, K2 and K3 globals the field pass sets for each layer) and k[0..15] in its CPU twin. Until the
 * close-out of PR #10 there were eight (k0, k1): chunks written then read only those and stay valid.
 */
export const PARAM_SLOTS = 16;
/** Where the packed array carries the algorithm version the layer was made with (FV in the shader). */
export const VERSION_SLOT = 16;

/**
 * Analytic families: the parameters packed for the shader and its CPU twin, plus the algorithm version the
 * layer was made with (`v`; the family's current one when absent), so a chunk whose drawing changed keeps the
 * earlier path for older pieces.
 */
export function packParams(meta: FamilyMeta, p: Params, out = new Float32Array(PARAM_SLOTS + 1), v = meta.version): Float32Array {
  const n = paramNumbers(meta, p);
  out.fill(0);
  for (let i = 0; i < Math.min(PARAM_SLOTS, n.length, out.length); i++) out[i] = Math.fround(n[i]);
  if (out.length > VERSION_SLOT) out[VERSION_SLOT] = v;
  return out;
}

/** Whether a layer of this family made with algorithm version `v` reads the piece's source or the layers below. */
export const famReads = (meta: FamilyMeta, v: number, what: 'source' | 'below') => !!meta.reads?.includes(what) && v >= (meta.readsSince ?? 1);
/** Whether a raster colour family's run made with version `v` gives its cells colour (FamilyMeta.colorSince). */
export const famColours = (meta: FamilyMeta, v: number) => !!meta.color && v >= (meta.colorSince ?? 1);

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

/** How a layer with these parameters behaves in time (FamilyCaps.time). */
export function timeContract(meta: FamilyMeta, p: Params): TimeContract {
  const rule = meta.caps.time;
  if (typeof rule === 'string') return rule;
  if (typeof rule === 'function') return rule(p);
  const v = p[rule.param];
  return (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') && rule.values[String(v)] ? rule.values[String(v)] : rule.else;
}

/** What each contract promises, in product language (panel and library). */
export const TIME_WORDS: Record<TimeContract, { label: string; mark: string; hint: string }> = {
  continuo: { label: 'Continuo', mark: '∞', hint: 'Sigue cambiando mientras corre, sin reinicio visible. No es periódico.' },
  bucle: { label: 'Bucle', mark: '↻', hint: 'Vuelve exactamente a su inicio: estado, color y cámara empalman.' },
  construccion: { label: 'Construcción', mark: '▣', hint: 'Un proceso que termina: construye y se queda quieto. Para mirarlo crecer, no como fondo.' },
};

/** Whether a family layer with these settings (and layer scale) is a figure drawn around the centre (FamilyMeta.figure). */
export function figureOf(meta: FamilyMeta, p: Params, scale = 1): boolean {
  return typeof meta.figure === 'function' ? meta.figure(p, scale) : !!meta.figure;
}
