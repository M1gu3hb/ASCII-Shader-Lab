import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { afterVideoSeekPaint } from '../../src/project/sources';

let pending: Map<number, FrameRequestCallback>;
beforeEach(() => {
  vi.useFakeTimers();
  pending = new Map();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => pending.delete(key));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('returns unavailable and releases callbacks when no paint arrives', async () => {
  const result = afterVideoSeekPaint(new AbortController().signal);
  await vi.advanceTimersByTimeAsync(4000);
  expect(await result).toBe(false);
  expect(pending.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('closing while waiting cancels immediately without a late frame or timer', async () => {
  const life = new AbortController();
  const result = afterVideoSeekPaint(life.signal);
  const [id, callback] = [...pending][0]; pending.delete(id); callback(0);
  life.abort();
  expect(await result).toBe(false);
  expect(pending.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
