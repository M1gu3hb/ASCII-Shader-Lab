import { importChunk } from '../shared/chunks';
import { FAMILY_INDEX } from './index-data';
import type { FamilyIndexEntry, FamilyMeta } from './types';

/*
 * The visual families. What every page needs at once is the index (index-data.ts, generated from the specs:
 * id, name, group, kind, version, loop, colour): enough to tell a family from a pattern, build the field
 * shader and name it. The specs themselves (parameters, presets, budgets) are their own chunk (all.ts), loaded
 * when a piece draws a family (the host waits for them as it waits for a family's code), when the library or
 * a family's panel opens, or when the dice load; so the first view of a page never carries them.
 */

const ENTRY = new Map<string, FamilyIndexEntry>(FAMILY_INDEX.map(e => [e.id, e]));

export const FAMILY_IDS: ReadonlySet<string> = new Set(ENTRY.keys());
/** What the index says of a family (always there, spec loaded or not). */
export const familyEntry = (id: string): FamilyIndexEntry | undefined => ENTRY.get(id);
export const isFamily = (id: string) => ENTRY.has(id);
/** Geometry and simulation families: drawn from a raster their model computes. */
export const isRaster = (id: string) => { const e = ENTRY.get(id); return !!e && e.kind !== 'analytic'; };
export const isAnalytic = (id: string) => ENTRY.get(id)?.kind === 'analytic';
/**
 * Families that may draw their own colour per cell (FamilyMeta.color): analytic ones always, raster ones from
 * the version given in `colorSince` (see layerColours). The field shader reads such a layer as colour.
 */
export const isColorFamily = (id: string) => !!ENTRY.get(id)?.color;
/** Raster families that can give their cells colour: their raster goes up as rgb plus the luminance in alpha (famRasterC). */
export const isColourRaster = (id: string) => { const e = ENTRY.get(id); return !!e && e.kind !== 'analytic' && !!e.color; };
/** Whether a layer gives its cells colour: an analytic colour family, or a raster one made with a version that does. */
export const layerColours = (l: { pattern: string; fam?: { v: number } }) => {
  const e = ENTRY.get(l.pattern);
  if (!e?.color) return false;
  return e.kind === 'analytic' || (l.fam?.v ?? e.v) >= (e.colorSince ?? 1);
};
/** Families whose picture depends on what happened before (no perfect loop, state to copy for exports). */
export const isStateful = isRaster;

/** Every family's spec, in library order, once loaded (empty before: see loadFamilyMetas). */
export let FAMILIES: readonly FamilyMeta[] = [];
const BY_ID = new Map<string, FamilyMeta>();
const listeners = new Set<() => void>();
let gen = 0;

/** A family's spec, once the specs are loaded (undefined before, as for an unknown id). */
export const familyById = (id: string): FamilyMeta | undefined => BY_ID.get(id);
/** Whether the specs are here. */
export const familiesReady = () => FAMILIES.length > 0;
/** Changes when the specs arrive (for caches built from them). */
export const familiesGen = () => gen;

/** all.ts registers the specs when it is imported. */
export function registerFamilies(list: readonly FamilyMeta[]) {
  if (FAMILIES === list) return;
  FAMILIES = list;
  BY_ID.clear();
  for (const f of list) BY_ID.set(f.id, f);
  gen++;
  for (const fn of [...listeners]) fn();
}

/** Calls `fn` whenever the specs arrive; returns the way to stop. */
export function onFamiliesReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let loading: Promise<void> | null = null;
/** Loads the specs (once; a failed load can be asked again). */
export function loadFamilyMetas(): Promise<void> {
  if (familiesReady()) return Promise.resolve();
  return (loading ??= importChunk('familias:fichas', () => import('./all')).then(() => undefined, e => { loading = null; throw e; }));
}
