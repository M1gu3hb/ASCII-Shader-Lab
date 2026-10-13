/**
 * A PNG encoder in plain TypeScript, for the bitmaps of glyphs that are pictures inside an SVG export: the
 * SVGs are built without a canvas (and in tests, in Node), and CompressionStream exists only in browsers.
 * The image data goes in stored (uncompressed) deflate blocks: any PNG reader inflates them; the bitmaps are at
 * most 256×256, so the cost is a few hundred KB at worst.
 */
import { crc32 } from '../../shared/zip';

function adler32(b: Uint8Array): number {
  let a = 1, s = 0;
  for (let i = 0; i < b.length; i++) { a = (a + b[i]) % 65521; s = (s + a) % 65521; }
  return ((s << 16) | a) >>> 0;
}

/** A zlib stream (RFC 1950) of stored deflate blocks (RFC 1951 BTYPE 00, at most 65 535 bytes each). */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / 0xffff));
  const out = new Uint8Array(2 + blocks * 5 + raw.length + 4);
  out[0] = 0x78; out[1] = 0x01; // deflate, 32 KB window, no dictionary; (0x7801 % 31 === 0)
  let o = 2;
  for (let i = 0; i < blocks; i++) {
    const start = i * 0xffff, len = Math.min(0xffff, raw.length - start);
    out[o++] = i === blocks - 1 ? 1 : 0;
    out[o++] = len & 0xff; out[o++] = len >>> 8;
    out[o++] = ~len & 0xff; out[o++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, start + len), o);
    o += len;
  }
  const ad = adler32(raw);
  out[o++] = ad >>> 24; out[o++] = (ad >>> 16) & 0xff; out[o++] = (ad >>> 8) & 0xff; out[o++] = ad & 0xff;
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A grey + alpha PNG (colour type 4, 8 bits) of one grey level with the given alpha, row by row from the top. */
export function encodeAlphaPng(w: number, h: number, alpha: Uint8Array, grey = 0): Uint8Array {
  const raw = new Uint8Array(h * (1 + 2 * w));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + 2 * w); // each row starts with filter type 0 (none)
    for (let x = 0; x < w; x++) { raw[row + 1 + 2 * x] = grey; raw[row + 2 + 2 * x] = alpha[y * w + x] ?? 0; }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 4; // bit depth, colour type; compression, filter and interlace stay 0
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlibStored(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
