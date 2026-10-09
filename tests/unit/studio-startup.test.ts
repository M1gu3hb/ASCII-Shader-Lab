import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const parts = vi.hoisted(() => ({ claim: vi.fn(), hydrate: vi.fn(), boot: vi.fn(), protect: vi.fn(), ready: vi.fn(), media: vi.fn() }));
vi.mock('../../src/studio/store', () => ({ hydrate: parts.hydrate, protectStudio: parts.protect }));
vi.mock('../../src/studio/tabs', () => ({ claimStudio: parts.claim, tabsReady: parts.ready }));
vi.mock('../../src/studio/boot', () => ({ bootFromUrl: parts.boot }));
vi.mock('../../src/studio/media', () => ({ startMediaSync: parts.media }));
import { startStudio } from '../../src/studio/startup';

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); parts.claim.mockResolvedValue(undefined); parts.hydrate.mockResolvedValue(false); parts.boot.mockResolvedValue(null); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('un arranque normal conserva el resultado y no entra en recuperación', async () => {
  parts.hydrate.mockResolvedValue(true);
  expect(await startStudio(() => {})).toEqual({ first: true, opened: null, error: null });
  expect(parts.protect).not.toHaveBeenCalled();
});

it.each(['claim', 'hydrate', 'boot'] as const)('%s sin respuesta: termina a los 10 s y cancela el trabajo tardío', async phase => {
  let finish!: () => void;
  parts[phase].mockReturnValue(new Promise<void>(r => { finish = r; }));
  const run = startStudio(() => {});
  await vi.advanceTimersByTimeAsync(10_000);
  expect((await run).error).toBeTruthy();
  expect(parts.protect).toHaveBeenCalledOnce();
  finish();
  await vi.advanceTimersByTimeAsync(100);
  if (phase === 'claim') expect(parts.hydrate).not.toHaveBeenCalled();
  if (phase === 'hydrate') expect(parts.boot).not.toHaveBeenCalled();
  if (phase === 'boot') expect(parts.boot.mock.calls[0][0].aborted).toBe(true);
});

it('un fallo del chunk de entrada también deja una salida recuperable', async () => {
  parts.boot.mockRejectedValue(new Error('chunk unavailable'));
  expect((await startStudio(() => {})).error).toBeTruthy();
  expect(parts.protect).toHaveBeenCalledOnce();
});
