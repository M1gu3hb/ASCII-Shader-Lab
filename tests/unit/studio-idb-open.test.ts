import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(['blocked', 'timeout'])('openDb: %s rechaza, libera conexiones tardías y permite reintentar', async failure => {
  const close = vi.fn();
  const requests: IDBOpenDBRequest[] = [];
  vi.stubGlobal('indexedDB', { open: vi.fn(() => {
    const request = { result: { close, createObjectStore: vi.fn() } } as unknown as IDBOpenDBRequest;
    requests.push(request); return request;
  }) });
  const { openDb } = await import('../../src/studio/idb');
  const waiting = openDb();
  const rejected = expect(waiting).rejects.toThrow();
  if (failure === 'blocked') requests[0].onblocked!(new Event('blocked') as IDBVersionChangeEvent);
  else await vi.advanceTimersByTimeAsync(8000);
  await rejected;
  const retry = openDb();
  expect(requests).toHaveLength(2);
  requests[0].onupgradeneeded!(new Event('upgradeneeded') as IDBVersionChangeEvent);
  expect(requests[0].result.createObjectStore).not.toHaveBeenCalled();
  requests[0].onsuccess!(new Event('success'));
  expect(close).toHaveBeenCalledOnce();
  requests[1].onsuccess!(new Event('success'));
  await expect(retry).resolves.toBe(requests[1].result);
});
