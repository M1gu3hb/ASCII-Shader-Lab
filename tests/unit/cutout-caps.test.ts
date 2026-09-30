import { describe, expect, it } from 'vitest';
import { gateModels, threadCount, type DeviceEnv } from '../../src/cutout/caps';
import { chooseMask } from '../../src/cutout/choose';
import { suggestFromRGBA } from '../../src/cutout/suggest';

const base: DeviceEnv = { webgpu: false, threads: true, simd: true, storage: true, phone: false };
const byId = (env: DeviceEnv) => Object.fromEntries(gateModels(env).map(m => [m.id, m]));

describe('device gating', () => {
  it('desktop with WebGPU: every model, fp16 files', () => {
    const m = byId({ ...base, webgpu: true });
    for (const id of ['subject', 'subject-hq', 'portrait', 'select']) {
      expect(m[id].available, id).toBe(true);
      expect(m[id].backend).toBe('webgpu');
    }
    expect(m.subject.bytes).toBe(98484532);
    expect(m['subject-hq'].bytes).toBe(114834127);
  });

  it('desktop without WebGPU: no HQ; the general model warns about memory and time', () => {
    const m = byId({ ...base });
    expect(m['subject-hq'].available).toBe(false);
    expect(m['subject-hq'].why).toMatch(/WebGPU/);
    expect(m.subject.available).toBe(true);
    expect(m.subject.backend).toBe('wasm-threads');
    expect(m.subject.bytes).toBe(191877254);
    expect(m.subject.note).toMatch(/3 GB/);
    expect(m.subject.note).toMatch(/4 s/);
    const single = byId({ ...base, threads: false });
    expect(single.subject.backend).toBe('wasm');
    expect(single.subject.note).toMatch(/11 s/);
  });

  it('Chromium reporting less than 8 GB: the general model is not offered without WebGPU', () => {
    const m = byId({ ...base, memoryGB: 4 });
    expect(m.subject.available).toBe(false);
    expect(m.subject.why).toMatch(/4 GB/);
    expect(byId({ ...base, memoryGB: 8 }).subject.available).toBe(true);
    // With WebGPU the memory limit does not apply (the model runs on the GPU).
    expect(byId({ ...base, memoryGB: 4, webgpu: true }).subject.available).toBe(true);
  });

  it('phones without WebGPU get only «Retrato» and «Seleccionar objeto»', () => {
    const m = byId({ ...base, phone: true, threads: false });
    expect(m.portrait.available).toBe(true);
    expect(m.select.available).toBe(true);
    expect(m.subject.available).toBe(false);
    expect(m.subject.why).toMatch(/teléfonos/);
    expect(m['subject-hq'].available).toBe(false);
    expect(m.portrait.bytes).toBe(6627048);
  });

  it('phones with WebGPU get everything', () => {
    const m = byId({ ...base, phone: true, webgpu: true });
    expect(Object.values(m).every(x => x.available)).toBe(true);
  });

  it('without SIMD or without secure storage nothing runs, and says why in Spanish', () => {
    for (const env of [{ ...base, simd: false }, { ...base, storage: false }]) {
      for (const info of gateModels(env)) {
        expect(info.available).toBe(false);
        expect(info.why).toMatch(/navegador|https/);
      }
    }
  });

  it('forcing WASM ignores WebGPU', () => {
    const m = byId({ ...base, webgpu: true, forceWasm: true });
    expect(m.subject.backend).toBe('wasm-threads');
    expect(m['subject-hq'].available).toBe(false);
  });

  it('uses min(4, cores / 2) threads only when isolated', () => {
    expect(threadCount({ threads: true }, 4)).toBe(2);
    expect(threadCount({ threads: true }, 16)).toBe(4);
    expect(threadCount({ threads: false }, 16)).toBe(1);
    expect(threadCount({ threads: true }, 1)).toBe(1);
  });
});

describe('choosing among the decoder masks', () => {
  const S = 8;
  const mask = (fill: (x: number, y: number) => boolean) => Float32Array.from({ length: S * S }, (_, i) => (fill(i % S, Math.floor(i / S)) ? 5 : -5));
  const whole = mask(() => true);
  const left = mask(x => x < 4);
  const dot = mask((x, y) => x === 1 && y === 1);

  it('picks the highest predicted IoU for a first click', () => {
    const c = chooseMask([0.7, 0.9, 0.5], [whole, left, dot], S, S, [{ x: 1, y: 1, positive: true }]);
    expect(c.index).toBe(1);
  });

  it('penalises masks that contradict the clicks', () => {
    // A negative point on the right half: «whole» contradicts it.
    const c = chooseMask([0.95, 0.8, 0.5], [whole, left, dot], S, S, [{ x: 1, y: 1, positive: true }, { x: 6, y: 6, positive: false }]);
    expect(c.index).toBe(1);
  });

  it('prefers the mask consistent with the previous one when points are added', () => {
    const prev = { mask: whole, points: [{ x: 1, y: 1, positive: true }] };
    const pts = [{ x: 1, y: 1, positive: true }, { x: 2, y: 2, positive: true }];
    // Slightly higher score for the half, but the person was refining «whole».
    const c = chooseMask([0.8, 0.9, 0.3], [whole, left, dot], S, S, pts, prev);
    expect(c.index).toBe(0);
    // Without the previous mask the half would win.
    expect(chooseMask([0.8, 0.9, 0.3], [whole, left, dot], S, S, pts).index).toBe(1);
    // A removed point is not «adding»: no consistency bonus.
    expect(chooseMask([0.8, 0.9, 0.3], [whole, left, dot], S, S, [{ x: 2, y: 2, positive: true }], prev).index).toBe(1);
  });
});

describe('suggestCutout heuristic', () => {
  const W = 96, H = 96;
  const image = (px: (x: number, y: number) => [number, number, number]) => {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = px(x, y); const j = (y * W + x) * 4; d[j] = r; d[j + 1] = g; d[j + 2] = b; d[j + 3] = 255; }
    return d;
  };
  const inDisc = (x: number, y: number) => Math.hypot(x - 48, y - 50) < 26;

  it('a centred object on a plain background: likely, «subject»', () => {
    const s = suggestFromRGBA(image((x, y) => (inDisc(x, y) ? [40, 90, 200] : [235, 232, 225])), W, H);
    expect(s.likely).toBe(true);
    expect(s.model).toBe('subject');
    expect(s.text).toMatch(/Quitar fondo/);
  });

  it('a skin-toned figure on a plain background: «portrait»', () => {
    const s = suggestFromRGBA(image((x, y) => (inDisc(x, y) ? [224, 172, 140] : [40, 44, 52])), W, H);
    expect(s.likely).toBe(true);
    expect(s.model).toBe('portrait');
  });

  it('a busy scene: not likely, points to «Seleccionar objeto»', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 255;
    const s = suggestFromRGBA(image(() => [rnd(), rnd(), rnd()]), W, H);
    expect(s.likely).toBe(false);
    expect(s.model).toBe('select');
  });
});
