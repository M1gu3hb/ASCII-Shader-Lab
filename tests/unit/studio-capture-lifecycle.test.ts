import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../src/studio/engineBridge', () => ({ getEngine: () => null }));
vi.mock('../../src/studio/toast', () => ({ toast: vi.fn() }));
const stop = vi.fn(), getUserMedia = vi.fn();
const stream = { getTracks: () => [{ stop }], getVideoTracks: () => [{ stop, addEventListener: vi.fn(), getSettings: () => ({ facingMode: 'user' }) }] };
const video = () => ({ style: {}, setAttribute: vi.fn(), play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), remove: vi.fn(), srcObject: null });

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('addEventListener', vi.fn()); vi.stubGlobal('removeEventListener', vi.fn());
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, enumerateDevices: () => Promise.resolve([]) } });
  vi.stubGlobal('document', { createElement: video, body: { appendChild: vi.fn() } });
  vi.stubGlobal('AudioContext', class {
    createAnalyser() { return { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 512, getByteFrequencyData: vi.fn() }; }
    createMediaStreamSource() { return { connect: vi.fn() }; }
    close() { return Promise.resolve(); }
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(['camera', 'mic'] as const)('%s: dos activaciones sólo solicitan un permiso; detener cierra la concesión tardía', async kind => {
  let grant!: (s: typeof stream) => void;
  getUserMedia.mockReturnValue(new Promise(r => { grant = r; }));
  const camera = await import('../../src/studio/media');
  const mic = await import('../../src/studio/live');
  const start = kind === 'camera' ? camera.startCamera : mic.startMic;
  const cancel = kind === 'camera' ? camera.stopCamera : mic.stopMic;
  const pending = start();
  await start();
  expect(getUserMedia).toHaveBeenCalledOnce();
  cancel(); grant(stream); await pending;
  expect(stop).toHaveBeenCalledOnce();
  expect(kind === 'camera' ? camera.useMedia.getState().camera : mic.useLive.getState().mic).toBe('off');
});

it('salir a Componentes detiene una cámara que ya estaba encendida', async () => {
  getUserMedia.mockResolvedValue(stream);
  const media = await import('../../src/studio/media');
  const store = await import('../../src/studio/store');
  const { defaultRecipe } = await import('../../src/engine/recipe');
  const r = defaultRecipe(); r.source = 'camera';
  store.applyRecipe(r, 'importado', 'Cámara');
  media.startMediaSync();
  await media.startCamera();
  expect(media.useMedia.getState().camera).toBe('on');
  store.useStudio.setState({ space: 'componentes' });
  expect(stop).toHaveBeenCalledOnce();
  expect(media.useMedia.getState().camera).toBe('off');
});

it.each(['media', 'componentes'] as const)('salir a %s detiene el micrófono', async space => {
  getUserMedia.mockResolvedValue(stream);
  const mic = await import('../../src/studio/live');
  const store = await import('../../src/studio/store');
  await mic.startMic();
  expect(mic.useLive.getState().mic).toBe('on');
  store.useStudio.setState({ space });
  expect(stop).toHaveBeenCalledOnce();
  expect(mic.useLive.getState().mic).toBe('off');
});

it('detener la cámara mientras el video comienza a reproducirse libera también ese flujo tardío', async () => {
  getUserMedia.mockResolvedValue(stream);
  let play!: () => void;
  const el = { ...video(), play: vi.fn(() => new Promise<void>(r => { play = r; })) };
  vi.stubGlobal('document', { createElement: () => el, body: { appendChild: vi.fn() } });
  const media = await import('../../src/studio/media');
  const pending = media.startCamera();
  await vi.advanceTimersByTimeAsync(0);
  expect(el.play).toHaveBeenCalledOnce();
  media.stopCamera(); play(); await pending;
  expect(stop).toHaveBeenCalledOnce();
  expect(el.remove).toHaveBeenCalledOnce();
  expect(media.useMedia.getState().camera).toBe('off');
});

it('si falla el contexto de audio, el micrófono concedido se libera', async () => {
  getUserMedia.mockResolvedValue(stream);
  vi.stubGlobal('AudioContext', class { constructor() { throw new Error('Audio no disponible'); } });
  const mic = await import('../../src/studio/live');
  await mic.startMic();
  expect(stop).toHaveBeenCalledOnce();
  expect(mic.useLive.getState().mic).toBe('error');
});
