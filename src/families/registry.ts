import type { FamilyMeta } from './types';
import { VIDA } from './meta/vida';
import { FISICA } from './meta/fisica';
import { FORMA } from './meta/forma';
import { CIENCIA } from './meta/ciencia';

/**
 * Every visual family, in library order. Metadata only (parameters, presets, texts, budgets): the models
 * and the CPU twins of analytic families load when a piece needs them (load.ts).
 */
export const FAMILIES: readonly FamilyMeta[] = [...VIDA, ...FISICA, ...FORMA, ...CIENCIA];

export const FAMILY_IDS: ReadonlySet<string> = new Set(FAMILIES.map(f => f.id));
const BY_ID = new Map(FAMILIES.map(f => [f.id, f]));

export const familyById = (id: string): FamilyMeta | undefined => BY_ID.get(id);
export const isFamily = (id: string) => BY_ID.has(id);
/** Geometry and simulation families: drawn from a raster their model computes. */
export const isRaster = (id: string) => { const f = BY_ID.get(id); return !!f && f.kind !== 'analytic'; };
export const isAnalytic = (id: string) => BY_ID.get(id)?.kind === 'analytic';
/** Families whose picture depends on what happened before (no perfect loop, state to copy for exports). */
export const isStateful = isRaster;
