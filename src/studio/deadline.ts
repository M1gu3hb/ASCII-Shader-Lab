/** A stalled operation must not keep the loading screen up forever. Late results are ignored. */
export function within<T>(work: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const fail = (reason: unknown) => { cleanup(); reject(reason); };
    const abort = () => fail(signal?.reason ?? new Error('Arranque interrumpido'));
    const timer = setTimeout(() => fail(new Error('Se agotó el tiempo de espera')), ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    work.then(value => { cleanup(); resolve(value); }, fail);
  });
}
