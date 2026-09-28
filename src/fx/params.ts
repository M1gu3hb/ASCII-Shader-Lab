/**
 * Reading finish params safely: every value is checked against its ParamDef (numbers clamped to the
 * range and snapped to nothing — steps are a UI hint —, selects limited to their options, colours
 * normalised to #rrggbb), missing or invalid values take the default. Unknown keys are ignored here but
 * kept in the Finish (a newer catalog may know them).
 */
import type { Finish, FinishKind } from '../project/types';
import type { FinishDef, ParamDef } from './index';
import { clamp, parseHex, toHex, type Values } from './core';

export function resolveParam(d: ParamDef, raw: unknown): number | string | boolean {
  switch (d.type) {
    case 'range': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
      return Number.isFinite(n) ? clamp(n, d.min, d.max) : d.def;
    }
    case 'select':
      return typeof raw === 'string' && d.options.some(o => o[0] === raw) ? raw : d.def;
    case 'toggle':
      return typeof raw === 'boolean' ? raw : raw === 'true' ? true : raw === 'false' ? false : d.def;
    case 'color': {
      const c = parseHex(raw);
      return c ? toHex(c) : d.def;
    }
  }
}

/** Every param of the definition, validated, with defaults for what is missing. */
export function resolveParams(def: FinishDef | undefined, raw: Finish['params'] | undefined): Values {
  const out: Values = {};
  for (const d of def?.params ?? []) out[d.key] = resolveParam(d, raw?.[d.key]);
  return out;
}

/** Whether a param applies with the current values (its `when` rule); the studio hides the rest. */
export function paramVisible(d: ParamDef, values: Record<string, unknown>): boolean {
  if (!d.when) return true;
  for (const [k, allowed] of Object.entries(d.when)) {
    if (!allowed.includes(values[k] as string | boolean)) return false;
  }
  return true;
}

/**
 * A Finish from untrusted input (a project file, an old version): null when the kind is unknown;
 * otherwise on/amount checked and known params validated. Unknown params are kept as they were.
 */
export function normalizeFinishWith(input: unknown, lookup: (k: FinishKind) => FinishDef | undefined): Finish | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const def = typeof o.kind === 'string' ? lookup(o.kind as FinishKind) : undefined;
  if (!def) return null;
  const rawParams = o.params && typeof o.params === 'object' ? (o.params as Record<string, unknown>) : {};
  const params: Finish['params'] = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') params[k] = v;
  }
  for (const d of def.params) params[d.key] = resolveParam(d, rawParams[d.key]);
  const amount = typeof o.amount === 'number' && Number.isFinite(o.amount) ? clamp(o.amount, 0, 1) : 1;
  return { kind: def.kind, on: o.on !== false, amount, params };
}
