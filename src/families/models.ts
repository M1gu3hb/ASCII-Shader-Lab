import type { AnalyticImpl, ModelFactory } from './types';

/**
 * Where the engines find a family's code: models of raster families and CPU twins of analytic ones.
 * The site installs a loader that fetches each one as its own chunk the first time a piece needs it
 * (load.ts); exported code registers the ones its piece uses up front (the runtime has no chunks).
 */
const factories = new Map<string, ModelFactory>();
const analytic = new Map<string, AnalyticImpl>();
const loading = new Map<string, Promise<void>>();
let loader: ((id: string) => Promise<void>) | null = null;
let gen = 0;

export function registerModel(id: string, f: ModelFactory) { factories.set(id, f); gen++; }
export function registerAnalytic(id: string, impl: AnalyticImpl) { analytic.set(id, impl); gen++; }
export const modelOf = (id: string) => factories.get(id);
export const analyticOf = (id: string) => analytic.get(id);
/** Bumped whenever code arrives: engines waiting for a family look again. */
export const modelsGen = () => gen;

export function setFamilyLoader(fn: ((id: string) => Promise<void>) | null) { loader = fn; }
export const hasFamilyLoader = () => !!loader;

/**
 * Loads a family's code (once). `cpu`: analytic families also need their CPU twin (the basic engine).
 * Resolves when it is there, or when it cannot be fetched (the engines then draw that layer empty and say so).
 */
export function ensureFamily(id: string): Promise<void> {
  if (factories.has(id) || analytic.has(id)) return Promise.resolve();
  if (!loader) return Promise.resolve();
  let p = loading.get(id);
  if (!p) {
    p = loader(id).catch(() => { loading.delete(id); });
    loading.set(id, p);
  }
  return p;
}

export function ensureFamilies(ids: Iterable<string>): Promise<void> {
  return Promise.all([...ids].map(ensureFamily)).then(() => undefined);
}
