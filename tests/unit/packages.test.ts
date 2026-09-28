import { describe, expect, it } from 'vitest';
import { defaultRecipe, normalizeRecipe, sameRecipe, type Recipe } from '../../src/engine';
import { generate, fingerprint } from '../../src/random';
import { buildProject, isProject, readProject, safeFileName, PROJECT_README, PROJECT_RECIPE } from '../../src/shared/project';
import { buildSession, collectionFileName, isSession, readSession, sessionFileName } from '../../src/shared/session';
import { decodeRecipe, encodeRecipe, parseRecipe, publicRecipe } from '../../src/shared/share';
import { unzip, zip } from '../../src/shared/zip';

const ID = '0123456789abcdef';
function imagePiece(): Recipe {
  const r = defaultRecipe();
  r.source = 'image';
  r.media.ref = { id: ID, kind: 'image', name: 'foto de mamá.jpg', type: 'image/jpeg', size: 4, w: 1600, h: 1200 };
  r.meta.name = 'Retrato';
  return r;
}
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

describe('links that decompress to too much', () => {
  it('are refused without decompressing them whole', async () => {
    const { deflateRawSync } = await import('node:zlib');
    const b64 = (b: Buffer) => b.toString('base64url');
    // ~20 KB of link that would expand to 20 MB: stops at the recipe size limit
    const bomb = 'z' + b64(deflateRawSync(Buffer.alloc(20 * 1024 * 1024, 0x20), { level: 9 }));
    expect(bomb.length).toBeLessThan(64 * 1024);
    expect(await decodeRecipe(bomb)).toBeNull();
    // and a link longer than any recipe needs is not even read
    expect(await decodeRecipe('j' + 'A'.repeat(70 * 1024))).toBeNull();
  });
});

describe('recipe media reference', () => {
  it('is validated by normalizeRecipe', () => {
    const ok = normalizeRecipe({ media: { ref: { id: ID, kind: 'video', name: 'clip.mp4', type: 'video/mp4', size: 12.4, w: '1920', h: 1080.4 } } });
    expect(ok.media.ref).toEqual({ id: ID, kind: 'video', name: 'clip.mp4', type: 'video/mp4', size: 12, w: 1920, h: 1080 });
    expect(normalizeRecipe({ media: { ref: { kind: 'camera', w: 1, h: 1 } } }).media.ref).toBeUndefined();
    expect(normalizeRecipe({ media: { ref: 'foto.jpg' } }).media.ref).toBeUndefined();
    // a bad id is dropped but the rest still describes what is missing
    expect(normalizeRecipe({ media: { ref: { id: '../../etc', kind: 'image', w: 10, h: 20 } } }).media.ref).toEqual({ kind: 'image', w: 10, h: 20 });
    expect('ref' in normalizeRecipe({}).media).toBe(false);
    // normalising twice changes nothing (stored recipes compare equal to fresh ones)
    const r = imagePiece();
    expect(normalizeRecipe(normalizeRecipe(r))).toEqual(normalizeRecipe(r));
    expect(sameRecipe(normalizeRecipe(JSON.parse(JSON.stringify(r))), r)).toBe(true);
  });

  it('makes a different piece when the media differs', () => {
    const a = imagePiece(), b = imagePiece();
    b.media.ref = { ...b.media.ref!, id: 'fedcba9876543210' };
    expect(sameRecipe(a, b)).toBe(false);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
    // recipes without media keep their fingerprints
    const p = defaultRecipe();
    const q = defaultRecipe(); q.media.ref = { id: ID, kind: 'image', w: 1, h: 1 };
    expect(fingerprint(p)).toBe(fingerprint(q));
  });

  it('is ignored by the generator: the draw is the same with or without it', () => {
    const base = imagePiece();
    for (const space of ['media', 'arte'] as const) {
      const a = generate({ seed: 'faro-lunar-417', space, base });
      const b = generate({ seed: 'faro-lunar-417', space, base: { ...base, media: { ...base.media, ref: undefined } } });
      const { ref: _r, ...am } = a.media;
      expect({ ...a, media: am }).toEqual({ ...b, media: b.media });
    }
    // in the image space the piece keeps using your image
    expect(generate({ seed: 'x', space: 'media', base }).media.ref?.id).toBe(ID);
  });

  it('travels in links without the file name nor the local id', async () => {
    const r = imagePiece();
    expect(publicRecipe(r).media.ref).toEqual({ kind: 'image', type: 'image/jpeg', w: 1600, h: 1200 });
    const back = await decodeRecipe(await encodeRecipe(r));
    expect(back?.media.ref).toEqual({ kind: 'image', type: 'image/jpeg', w: 1600, h: 1200 });
    expect(JSON.stringify(back)).not.toContain('mamá');
    expect(r.media.ref?.name).toBe('foto de mamá.jpg'); // the original is not touched
  });
});

describe('project package', () => {
  it('round-trips a piece with its image', async () => {
    const r = imagePiece();
    const blob = await buildProject(r, { name: 'foto de mamá.jpg', type: 'image/jpeg', data: bytes });
    const files = await unzip(blob);
    expect(files.map(f => f.name)).toEqual([PROJECT_RECIPE, 'medios/foto de mamá.jpg', PROJECT_README]);
    expect(isProject(files)).toBe(true);
    expect(isSession(files)).toBe(false);
    const readme = await files[2].text();
    expect(readme).toContain('receta.monotrama.json');
    expect(readme).toContain('Arrastra este .zip');
    const p = (await readProject(files))!;
    expect(sameRecipe(p.recipe, r)).toBe(true);
    expect(p.recipe.media.ref?.name).toBe('foto de mamá.jpg');
    expect(p.media?.name).toBe('foto de mamá.jpg');
    expect(p.media?.type).toBe('image/jpeg');
    expect(p.media?.data).toEqual(bytes);
    // the recipe file inside is the ordinary recipe format
    expect(parseRecipe(await files[0].text())?.media.ref?.id).toBe(ID);
  });

  it('without the media, strips the reference like a link and says so', async () => {
    const files = await unzip(await buildProject(imagePiece(), null));
    expect(files.map(f => f.name)).toEqual([PROJECT_RECIPE, PROJECT_README]);
    const p = (await readProject(files))!;
    expect(p.media).toBeNull();
    expect(p.recipe.media.ref).toEqual({ kind: 'image', type: 'image/jpeg', w: 1600, h: 1200 });
    expect(await files[1].text()).toContain('una imagen que no estaba guardada en el navegador al exportar, así que no va incluida');
    // and for a video, in the masculine
    const v = imagePiece(); v.source = 'video'; v.media.ref = { ...v.media.ref!, kind: 'video', type: 'video/mp4' };
    const vf = await unzip(await buildProject(v, null));
    expect(await vf[1].text()).toContain('un video que no estaba guardado en el navegador al exportar, así que no va incluido');
  });

  it('opens projects re-zipped inside a folder, and refuses archives without a recipe', async () => {
    const r = defaultRecipe();
    const inner = await unzip(await buildProject(r));
    const refolded = await zip(await Promise.all(inner.map(async f => ({ name: 'pieza/' + f.name, data: await f.read() }))));
    const files = await unzip(refolded);
    expect(isProject(files)).toBe(true);
    expect(sameRecipe((await readProject(files))!.recipe, r)).toBe(true);
    expect(await readProject(await unzip(await zip([{ name: 'hola.txt', data: 'hola' }])))).toBeNull();
    expect(safeFileName('../../etc/passwd', 'x')).toBe('passwd');
    expect(safeFileName('  ', 'imagen.jpg')).toBe('imagen.jpg');
  });
});

describe('session package', () => {
  it('round-trips entries, cursor, favourites and media', async () => {
    const r = imagePiece();
    const entries = [
      { id: 'e1', recipe: defaultRecipe(), origin: defaultRecipe(), kind: 'inicio', space: 'arte', created: 1, edited: false, thumb: 'data:image/webp;base64,AAAA' },
      { id: 'e2', recipe: r, origin: r, kind: 'azar', space: 'media', created: 2, edited: true, seed: 'faro-lunar-417' },
    ];
    const favorites = [{ id: 'F', name: 'Retrato', recipe: r, created: 3, updated: 4, space: 'media' }];
    const blob = await buildSession({ entries, favorites, cursor: 1 }, [{ id: ID, kind: 'image', name: 'foto de mamá.jpg', type: 'image/jpeg', size: 4, w: 1600, h: 1200, data: bytes }]);
    const files = await unzip(blob);
    expect(isSession(files)).toBe(true);
    expect(files.map(f => f.name)).toContain('sesion.json');
    expect(files.map(f => f.name)).toContain('LEEME.txt');
    const s = (await readSession(files))!;
    expect(s.data.cursor).toBe(1);
    expect(s.data.entries).toEqual(JSON.parse(JSON.stringify(entries)));
    expect(s.data.favorites).toEqual(JSON.parse(JSON.stringify(favorites)));
    expect(s.media).toHaveLength(1);
    expect(s.media[0].meta).toEqual({ id: ID, kind: 'image', name: 'foto de mamá.jpg', type: 'image/jpeg', size: 4, w: 1600, h: 1200 });
    expect(await s.media[0].read()).toEqual(bytes);
    // its LEEME counts in the singular when there is one, and says what the history limit discards
    const leeme = await files.find(f => f.name === 'LEEME.txt')!.text();
    expect(leeme).toContain('2 resultados del historial y 1 pieza de la colección, con 1 archivo de imagen o video.');
    expect(leeme).toContain('se descartan los más antiguos');
    expect(leeme).not.toContain('no se borra nada');
  });

  it('a collection backup is a session archive with only the collection and its media', async () => {
    const r = imagePiece();
    const favorites = [{ id: 'F', name: 'Retrato', recipe: r, created: 3, updated: 4, space: 'media' }];
    const blob = await buildSession({ entries: [], favorites, cursor: -1 }, [{ id: ID, kind: 'image', name: 'foto de mamá.jpg', type: 'image/jpeg', size: 4, w: 1600, h: 1200, data: bytes }], 'collection');
    const files = await unzip(blob);
    expect(isSession(files)).toBe(true);
    const s = (await readSession(files))!;
    expect(s.scope).toBe('collection');
    expect(s.data.entries).toEqual([]);
    expect(s.data.favorites).toEqual(JSON.parse(JSON.stringify(favorites)));
    expect(await s.media[0].read()).toEqual(bytes);
    const leeme = await files.find(f => f.name === 'LEEME.txt')!.text();
    expect(leeme).toContain('1 pieza de tu colección');
    expect(collectionFileName(new Date(2026, 8, 7))).toBe('monotrama-coleccion-2026-09-07.zip');
  });

  it('sessions saved by the previous version (no scope) still open as whole sessions', async () => {
    // the sesion.json the previous version wrote: no «scope» field
    const doc = { monotrama: 'session', version: 1, exported: '2026-09-01T10:00:00.000Z', cursor: 0, entries: [{ id: 'e1', recipe: defaultRecipe(), origin: defaultRecipe(), kind: 'inicio', space: 'arte', created: 1, edited: false }], favorites: [], media: [] };
    const s = (await readSession(await unzip(await zip([{ name: 'sesion.json', data: JSON.stringify(doc) }]))))!;
    expect(s.scope).toBe('all');
    expect(s.data.entries).toHaveLength(1);
    expect(s.data.cursor).toBe(0);
  });

  it('names the file by date and rejects other archives', async () => {
    expect(sessionFileName(new Date(2026, 8, 7))).toBe('monotrama-sesion-2026-09-07.zip');
    expect(await readSession(await unzip(await zip([{ name: 'sesion.json', data: '{"monotrama":"recipe"}' }])))).toBeNull();
    expect(await readSession(await unzip(await buildProject(defaultRecipe())))).toBeNull();
  });
});
