import type { AnalyticImpl, ModelFactory } from './types';

/**
 * Where the engines find a family's code: models of raster families and CPU twins of analytic ones.
 * The site installs a loader that fetches each one as its own chunk the first time a piece needs it
 * (load.ts); exported code registers the ones its piece uses up front (the runtime has no chunks).
 *
 * A chunk that fails (a rejection, a 404, a response that never comes within the time limit) is recorded
 * once: the engines draw that layer empty and say why, and nothing asks again until `retryFamily` (the
 * panel's «Reintentar»). Never once per frame.
 */
const factories = new Map<string, ModelFactory>();
const analytic = new Map<string, AnalyticImpl>();
const loading = new Map<string, Promise<void>>();
const failures = new Map<string, string>();
let loader: ((id: string) => Promise<void>) | null = null;
let gen = 0;
let timeLimit = 20000;

export function registerModel(id: string, f: ModelFactory) { factories.set(id, f); failures.delete(id); gen++; }
export function registerAnalytic(id: string, impl: AnalyticImpl) { analytic.set(id, impl); failures.delete(id); gen++; }
export const modelOf = (id: string) => factories.get(id);
export const analyticOf = (id: string) => analytic.get(id);
/** Bumped whenever code arrives or fails to: engines waiting for a family look again. */
export const modelsGen = () => gen;

export function setFamilyLoader(fn: ((id: string) => Promise<void>) | null) { loader = fn; loading.clear(); failures.clear(); }
export const hasFamilyLoader = () => !!loader;
/** How long a chunk may take before it counts as failed (ms). */
export function setFamilyLoadTimeout(ms: number) { timeLimit = ms; }

/** Why a family's code (or its GLSL) could not be fetched, while that failure stands. */
export const familyLoadError = (id: string): string | undefined => failures.get(id);

/** Records that a family's code could not be fetched (models and GLSL chunks alike). */
export function markFamilyFailed(id: string, e: unknown) {
  failures.set(id, e instanceof Error ? e.message : String(e));
  gen++;
}

/** Races a chunk against the time limit: a response that never comes is a failure, not an endless wait. */
export function withTimeLimit<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what}: no llegó en ${Math.round(timeLimit / 1000)} s (tiempo límite)`)), timeLimit);
    p.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Loads a family's code (once). Resolves when it is there, or when it cannot be fetched (the failure is
 * then recorded: see `familyLoadError`), so callers never wait forever.
 */
export function ensureFamily(id: string): Promise<void> {
  if (factories.has(id) || analytic.has(id)) return Promise.resolve();
  if (!loader || failures.has(id)) return Promise.resolve();
  let p = loading.get(id);
  if (!p) {
    p = withTimeLimit(loader(id), 'El código de la familia')
      .then(() => { if (!factories.has(id) && !analytic.has(id)) throw new Error('El código de la familia llegó vacío'); })
      .catch(e => { markFamilyFailed(id, e); })
      .finally(() => { loading.delete(id); });
    loading.set(id, p);
  }
  return p;
}

export function ensureFamilies(ids: Iterable<string>): Promise<void> {
  return Promise.all([...ids].map(ensureFamily)).then(() => undefined);
}

const retryHooks: Array<(id: string) => Promise<void>> = [];
/** Other chunks of a family (its GLSL) that a retry must ask for again. */
export function onFamilyRetry(fn: (id: string) => Promise<void>) { retryHooks.push(fn); }

/** «Reintentar»: forgets a failure and asks for the family's code again (and its other chunks). */
export function retryFamily(id: string): Promise<void> {
  failures.delete(id);
  gen++;
  return Promise.all([ensureFamily(id), ...retryHooks.map(fn => fn(id))]).then(() => undefined);
}
