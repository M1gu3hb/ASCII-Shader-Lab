/**
 * Minimal ZIP support, no dependency.
 * Writer: "store" method only (the media we pack is already compressed and the JSON is small),
 * CRC-32, UTF-8 names (flag bit 11), no ZIP64: every file and the whole archive stay under 4 GB.
 * Reader: store and deflate (DecompressionStream('deflate-raw')), driven by the central directory,
 * so archives re-zipped by the system `zip`, Finder or Windows open too.
 */

export interface ZipInput {
  /** Path inside the archive, forward slashes. */
  name: string;
  data: Uint8Array | Blob | string;
  date?: Date;
}

export interface ZipEntry {
  name: string;
  /** Uncompressed size in bytes. */
  size: number;
  /** Reads, inflates if needed and checks the CRC. */
  read(): Promise<Uint8Array>;
  text(): Promise<string>;
}

const LOCAL = 0x04034b50, CENTRAL = 0x02014b50, END = 0x06054b50;
const UTF8 = 0x0800;
const MAX32 = 0xffffffff;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE), incremental: pass the previous value to continue. */
export function crc32(data: Uint8Array, prev = 0): number {
  let c = (prev ^ MAX32) >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ MAX32) >>> 0;
}

function dosTime(d: Date): [number, number] {
  const y = Math.max(1980, Math.min(2107, d.getFullYear()));
  return [
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  ];
}

async function measure(data: ZipInput['data']): Promise<{ part: Uint8Array | Blob; size: number; crc: number }> {
  if (typeof data === 'string') data = new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return { part: data, size: data.length, crc: crc32(data) };
  // Blobs are read in chunks for the CRC and then referenced, not copied, into the archive
  let crc = 0;
  const reader = data.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    crc = crc32(value, crc);
  }
  return { part: data, size: data.size, crc };
}

const tooBig = () => new Error('El archivo supera 4 GB: es demasiado grande para un .zip.');

/** Builds a ZIP archive (store method). */
export async function zip(files: ZipInput[]): Promise<Blob> {
  if (files.length > 0xffff) throw new Error('Demasiados archivos para un .zip.');
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name.replace(/\\/g, '/').replace(/^\/+/, ''));
    const { part, size, crc } = await measure(f.data);
    if (size >= MAX32 || offset + 30 + name.length + size >= MAX32) throw tooBig();
    const [time, date] = dosTime(f.date ?? new Date());

    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, LOCAL, true);
    l.setUint16(4, 20, true);          // version needed: 2.0
    l.setUint16(6, UTF8, true);
    l.setUint16(8, 0, true);           // method: store
    l.setUint16(10, time, true);
    l.setUint16(12, date, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, size, true);       // compressed = uncompressed
    l.setUint32(22, size, true);
    l.setUint16(26, name.length, true);
    l.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local as BlobPart, part as BlobPart);

    const cd = new Uint8Array(46 + name.length);
    const c = new DataView(cd.buffer);
    c.setUint32(0, CENTRAL, true);
    c.setUint16(4, (3 << 8) | 20, true); // made by: Unix, 2.0 (so permissions below apply)
    c.setUint16(6, 20, true);
    c.setUint16(8, UTF8, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, size, true);
    c.setUint32(24, size, true);
    c.setUint16(28, name.length, true);
    c.setUint32(38, (0o100644 << 16) >>> 0, true); // regular file, rw-r--r--
    c.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);
    offset += local.length + size;
  }
  const cdSize = central.reduce((n, x) => n + x.length, 0);
  if (offset + cdSize >= MAX32) throw tooBig();
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, END, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...(central as BlobPart[]), end as BlobPart], { type: 'application/zip' });
}

/* ------------------------------------------------------------------ */

const damaged = (why: string) => new Error('El .zip está dañado o no es un .zip (' + why + ').');

async function bytesOf(b: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await b.slice(start, end).arrayBuffer());
}

function decodeName(raw: Uint8Array, utf8: boolean): string {
  let s: string;
  try { s = new TextDecoder('utf-8', { fatal: !utf8 }).decode(raw); } catch { s = new TextDecoder('windows-1252').decode(raw); }
  return s.replace(/\\/g, '/');
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede descomprimir ese .zip.');
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** Lists the files of a ZIP archive (folders are skipped). Contents are read lazily. */
export async function unzip(input: Blob | Uint8Array): Promise<ZipEntry[]> {
  const blob = input instanceof Uint8Array ? new Blob([input as BlobPart]) : input;
  if (blob.size < 22) throw damaged('demasiado corto');
  // end of central directory: last 22 bytes plus an optional comment of up to 64 KB
  const tailStart = Math.max(0, blob.size - 22 - 0xffff);
  const tail = await bytesOf(blob, tailStart, blob.size);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === END) { at = i; break; }
  if (at < 0) throw damaged('sin directorio');
  const count = tv.getUint16(at + 10, true);
  const cdSize = tv.getUint32(at + 12, true);
  const cdOffset = tv.getUint32(at + 16, true);
  if (count === 0xffff || cdSize === MAX32 || cdOffset === MAX32) throw new Error('Ese .zip usa ZIP64 (más de 4 GB): no se puede abrir aquí.');
  if (cdOffset + cdSize > blob.size) throw damaged('directorio fuera de rango');
  const cd = await bytesOf(blob, cdOffset, cdOffset + cdSize);
  const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);

  const out: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.length || v.getUint32(p, true) !== CENTRAL) throw damaged('entrada del directorio');
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const csize = v.getUint32(p + 20, true);
    const usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const lho = v.getUint32(p + 42, true);
    const name = decodeName(cd.subarray(p + 46, p + 46 + nlen), !!(flags & UTF8));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    if (csize === MAX32 || usize === MAX32 || lho === MAX32) throw new Error('Ese .zip usa ZIP64 (más de 4 GB): no se puede abrir aquí.');
    const read = async () => {
      if (flags & 1) throw new Error('Ese .zip está cifrado: no se puede abrir.');
      if (method !== 0 && method !== 8) throw new Error('Ese .zip usa una compresión que no se puede abrir aquí.');
      const lh = await bytesOf(blob, lho, lho + 30);
      const lv = new DataView(lh.buffer);
      if (lh.length < 30 || lv.getUint32(0, true) !== LOCAL) throw damaged('cabecera local');
      const start = lho + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
      if (start + csize > blob.size) throw damaged('datos fuera de rango');
      const raw = await bytesOf(blob, start, start + csize);
      const data = method === 8 ? await inflateRaw(raw) : raw;
      if (data.length !== usize || crc32(data) !== crc) throw damaged('CRC');
      return data;
    };
    out.push({ name, size: usize, read, text: async () => new TextDecoder().decode(await read()) });
  }
  return out;
}

/** True when the bytes start like a ZIP archive ("PK\x03\x04", or an empty archive). */
export async function looksLikeZip(b: Blob): Promise<boolean> {
  const h = await bytesOf(b, 0, 4);
  return h.length === 4 && h[0] === 0x50 && h[1] === 0x4b && (h[2] === 3 || h[2] === 5) && (h[3] === 4 || h[3] === 6);
}
