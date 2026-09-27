/**
 * Raw-deflate decompression that stops at a size. A few KB of deflate can expand to gigabytes (a
 * crafted link or .zip), so the input is fed in small slices and the output is counted as it comes:
 * past `max` bytes, reading stops and nothing more is decompressed. Returns null when over `max`.
 */
export async function inflateRaw(data: Uint8Array, max: number): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede descomprimir.');
  // one slice per pull: deflate expands at most ~1000:1, so a step never makes much more than `max`
  const slice = Math.max(1024, Math.min(1024 * 1024, Math.floor(max / 1024)));
  let at = 0;
  const input = new ReadableStream<BufferSource>({
    pull(c) {
      if (at >= data.length) { c.close(); return; }
      c.enqueue(data.subarray(at, at + slice) as BufferSource);
      at += slice;
    },
  }, { highWaterMark: 0 });
  const reader = input.pipeThrough(new DecompressionStream('deflate-raw')).getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { void reader.cancel().catch(() => undefined); return null; }
    parts.push(value);
  }
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
