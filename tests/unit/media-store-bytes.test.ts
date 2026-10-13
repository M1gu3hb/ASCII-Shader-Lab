import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The local media store where the browser keeps no Blob in IndexedDB (WebKit's private windows: the write
 * fails): the file is kept as its bytes, and reads give the same file back. Bigger files than the bytes limit
 * are not read into memory: they work in the tab, unsaved, as before.
 */

const kept = new Map<string, unknown>();
let refuseBlobs = true;
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (k: string) => kept.get(k),
  set: async (k: string, v: { blob?: unknown }) => {
    if (refuseBlobs && v && 'blob' in v) throw new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError');
    kept.set(k, v);
  },
  del: async (k: string) => { kept.delete(k); },
  entries: async () => [...kept.entries()],
  values: async () => [...kept.values()],
}));

const { getMedia, listMedia, put } = await import('../../src/studio/mediaStore');

describe('almacén de medios sin Blob en IndexedDB', () => {
  beforeEach(() => { kept.clear(); refuseBlobs = true; });

  it('guarda los bytes y devuelve el mismo archivo, con su tipo', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
    const res = await put(new Blob([bytes], { type: 'image/png' }), { kind: 'image', name: 'foto.png', w: 2, h: 1 });
    expect(res.stored).toBe(true);
    const got = await getMedia(res.id);
    expect(got?.type).toBe('image/png');
    expect(got?.blob.type).toBe('image/png');
    expect(new Uint8Array(await got!.blob.arrayBuffer())).toEqual(bytes);
    // the list carries no bytes
    const [m] = await listMedia();
    expect(m).toMatchObject({ id: res.id, name: 'foto.png', size: bytes.length });
    expect(m).not.toHaveProperty('bytes');
    expect(m).not.toHaveProperty('blob');
  });

  it('donde sí hay Blob, se guarda el archivo tal cual (sin leerlo a memoria)', async () => {
    refuseBlobs = false;
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const res = await put(file, { kind: 'image', name: 'a.png', w: 1, h: 1 });
    expect((kept.get(res.id) as { blob?: Blob }).blob).toBeInstanceOf(Blob);
    expect(kept.get(res.id)).not.toHaveProperty('bytes');
  });

  it('un archivo mayor que el límite de bytes no se lee entero: funciona en la pestaña, sin guardarse', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(8));
    const slice = vi.fn((a: number, b: number) => new Blob([new Uint8Array(Math.max(0, Math.min(b, 1024) - a))]));
    const file = { type: 'video/webm', size: 32 * 1024 * 1024, arrayBuffer, slice } as unknown as Blob;
    const res = await put(file, { kind: 'video', name: 'v.webm', w: 1, h: 1 });
    expect(res).toMatchObject({ stored: false, reason: 'unavailable' });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
