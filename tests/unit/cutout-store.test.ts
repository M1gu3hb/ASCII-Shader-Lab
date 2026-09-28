import { describe, expect, it } from 'vitest';
import { cacheKey, CutoutError, sha256Hex, verifyBytes } from '../../src/cutout/store';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('model download verification', () => {
  it('hashes with SHA-256', async () => {
    expect(await sha256Hex(bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('accepts the published bytes', async () => {
    await expect(verifyBytes(bytes('abc'), { path: 'onnx/x.onnx', bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' })).resolves.toBeUndefined();
  });

  it('refuses a file of another size', async () => {
    const e = await verifyBytes(bytes('abcd'), { path: 'onnx/x.onnx', bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }).catch(x => x);
    expect(e).toBeInstanceOf(CutoutError);
    expect((e as CutoutError).code).toBe('integrity');
    expect((e as Error).message).toMatch(/tamaño/);
  });

  it('refuses a file whose hash differs (same size, one byte changed)', async () => {
    const e = await verifyBytes(bytes('abd'), { path: 'onnx/x.onnx', bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }).catch(x => x);
    expect((e as CutoutError).code).toBe('integrity');
    expect((e as Error).message).toMatch(/sha256/);
  });

  it('keys the cache by hash, not by URL', () => {
    expect(cacheKey('ab'.repeat(32))).toMatch(/\/__glyphos-modelos\/(ab){32}$/);
  });
});
