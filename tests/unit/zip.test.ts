import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, looksLikeZip, unzip, zip } from '../../src/shared/zip';
import { inflateRaw } from '../../src/shared/inflate';

const has = (cmd: string) => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };
const bytes = (n: number, seed = 7) => { const b = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = x >>> 24; } return b; };

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
    // incremental == one shot
    const b = bytes(5000);
    expect(crc32(b.subarray(1234), crc32(b.subarray(0, 1234)))).toBe(crc32(b));
  });

  it('round-trips strings, bytes and blobs with UTF-8 names', async () => {
    const big = bytes(300_000);
    const blob = await zip([
      { name: 'receta.monotrama.json', data: '{"hola":"añejo ✓"}' },
      { name: 'medios/fotografía de la sierra.jpg', data: new Blob([big as BlobPart]) },
      { name: 'vacío.txt', data: new Uint8Array() },
    ]);
    expect(await looksLikeZip(blob)).toBe(true);
    const files = await unzip(blob);
    expect(files.map(f => f.name)).toEqual(['receta.monotrama.json', 'medios/fotografía de la sierra.jpg', 'vacío.txt']);
    expect(await files[0].text()).toBe('{"hola":"añejo ✓"}');
    expect(await files[1].read()).toEqual(big);
    expect(files[1].size).toBe(big.length);
    expect((await files[2].read()).length).toBe(0);
  });

  it('detects corruption through the CRC', async () => {
    const blob = await zip([{ name: 'a.txt', data: 'monotrama monotrama' }]);
    const raw = new Uint8Array(await blob.arrayBuffer());
    raw[30 + 'a.txt'.length + 3] ^= 0xff; // flip a byte of the file data
    const [f] = await unzip(raw);
    await expect(f.read()).rejects.toThrow(/CRC/);
    await expect(unzip(new TextEncoder().encode('esto no es un zip, sólo texto suelto'))).rejects.toThrow(/zip/);
  });

  it('inflates up to a size and stops past it', async () => {
    const { deflateRawSync } = await import('node:zlib');
    const data = bytes(200_000);
    expect(await inflateRaw(new Uint8Array(deflateRawSync(data)), 200_000)).toEqual(data);
    expect(await inflateRaw(new Uint8Array(deflateRawSync(data)), 199_999)).toBeNull();
    // 64 MB of spaces (about 64 KB deflated): refused once past the limit
    expect(await inflateRaw(new Uint8Array(deflateRawSync(Buffer.alloc(64 * 1024 * 1024, 0x20), { level: 9 })), 256 * 1024)).toBeNull();
  });

  it('never inflates an entry past the size the archive declares (a crafted .zip)', async () => {
    const { deflateRawSync } = await import('node:zlib');
    const bomb = deflateRawSync(Buffer.alloc(20 * 1024 * 1024, 0x20), { level: 9 }); // 20 MB of spaces, ~20 KB
    const name = new TextEncoder().encode('sesion.json');
    const local = new Uint8Array(30 + name.length), cd = new Uint8Array(46 + name.length), end = new Uint8Array(22);
    const l = new DataView(local.buffer), c = new DataView(cd.buffer), e = new DataView(end.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(8, 8, true); l.setUint32(18, bomb.length, true); l.setUint32(22, 10, true); l.setUint16(26, name.length, true);
    local.set(name, 30);
    c.setUint32(0, 0x02014b50, true); c.setUint16(10, 8, true); c.setUint32(20, bomb.length, true); c.setUint32(24, 10, true); c.setUint16(28, name.length, true);
    cd.set(name, 46);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, 1, true); e.setUint16(10, 1, true); e.setUint32(12, cd.length, true); e.setUint32(16, local.length + bomb.length, true);
    const [f] = await unzip(new Blob([local, bomb, cd, end]));
    expect(f.size).toBe(10);
    await expect(f.read()).rejects.toThrow(/dañado/);
  });

  it.skipIf(!has('unzip'))('writes archives the system unzip accepts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mt-zip-'));
    const file = join(dir, 'pieza.zip');
    writeFileSync(file, new Uint8Array(await (await zip([{ name: 'LEEME.txt', data: 'hola' }, { name: 'medios/ñ.bin', data: bytes(1000) }])).arrayBuffer()));
    const out = execFileSync('unzip', ['-t', file]).toString();
    expect(out).toMatch(/No errors detected/);
    expect(execFileSync('unzip', ['-p', file, 'LEEME.txt']).toString()).toBe('hola');
  });

  it.skipIf(!has('zip'))('reads archives made by the system zip (stored and deflated)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mt-zip-'));
    const text = 'Teje luz con caracteres. '.repeat(400);
    writeFileSync(join(dir, 'texto.txt'), text);
    writeFileSync(join(dir, 'datos.bin'), bytes(20_000, 3));
    for (const level of ['-0', '-9']) {
      const file = join(dir, `x${level}.zip`);
      execFileSync('zip', ['-q', level, '-X', file, 'texto.txt', 'datos.bin'], { cwd: dir });
      const files = await unzip(new Uint8Array(readFileSync(file)));
      const byName = Object.fromEntries(files.map(f => [f.name, f]));
      expect(await byName['texto.txt'].text()).toBe(text);
      expect(await byName['datos.bin'].read()).toEqual(bytes(20_000, 3));
    }
  });
});
