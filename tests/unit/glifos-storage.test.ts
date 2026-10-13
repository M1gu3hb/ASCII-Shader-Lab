import { beforeEach, describe, expect, it } from 'vitest';
import { glyphSetBytes, normalizeGlyphSet, type GlyphSet } from '../../src/glyphset/set';
import { hashBytes } from '../../src/studio/mediaStore';
import { compileDoc } from '../../src/glifos/compile';
import { newDoc, normalizeDoc, type GlyphDoc } from '../../src/glifos/doc';
import { readPackage, writePackage } from '../../src/glifos/export/package';
import { encodeAlphaPng } from '../../src/glifos/export/png';
import {
  deleteDoc, discardBroken, gcSets, getImage, getSet, importPackage, listDocs, loadDoc, memoryKV, putImage, putSet,
  saveDoc, setClock, setIds, SET_GRACE_MS, useKV, type KV,
} from '../../src/glifos/storage';

const T0 = Date.UTC(2026, 9, 1);
let kv: KV;
let now = T0;

beforeEach(() => {
  kv = memoryKV();
  useKV(kv);
  now = T0;
  setClock(() => now);
});

function drawnDoc(id: string, o: { name?: string; rev?: number; updated?: number } = {}): GlyphDoc {
  const doc = newDoc({ mode: 'texto', groups: ['mayusculas'], id, now: T0, name: o.name ?? 'Alfabeto' });
  doc.glyphs.A = { ...doc.glyphs.A, status: 'dibujado', contours: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 300, y: 700 }, { x: 600, y: 0 }] }] };
  doc.glyphs.B = { ...doc.glyphs.B, status: 'aceptado', contours: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 0, y: 700 }, { x: 500, y: 350 }] }] };
  doc.rev = o.rev ?? 1;
  doc.updated = o.updated ?? T0 + 1000;
  return doc;
}

/** A small set of its own (its name makes it unique). */
const setNamed = (name: string, docId = 'gl-otro', rev = 1): GlyphSet => normalizeGlyphSet({
  kind: 'glyphos-glifos', v: 1, name, doc: { id: docId, rev }, mode: 'texto', upm: 1000, asc: 800, desc: -200, xh: 500, cap: 700,
  glyphs: { A: { a: 600, d: 'M0 0L300 700L600 0Z' } },
});

describe('documents', () => {
  it('save and load round trip, with a summary for the list', async () => {
    const doc = drawnDoc('gl-uno');
    expect(await saveDoc(doc, { thumb: 'data:image/png;base64,AAAA' })).toBe('ok');
    const r = await loadDoc('gl-uno');
    expect('doc' in r && r.doc).toEqual(normalizeDoc(JSON.parse(JSON.stringify(doc))).doc);
    expect('future' in r && r.future).toBe(false);
    expect(await listDocs()).toEqual([{ id: 'gl-uno', name: 'Alfabeto', mode: 'texto', rev: 1, updated: T0 + 1000, glyphs: 2, thumb: 'data:image/png;base64,AAAA', v: 1 }]);
    // a save without a thumbnail keeps the stored one
    expect(await saveDoc({ ...doc, rev: 2, updated: T0 + 2000 }, { expectRev: 1 })).toBe('ok');
    expect((await listDocs())[0]).toMatchObject({ rev: 2, thumb: 'data:image/png;base64,AAAA' });
    // most recently changed first
    await saveDoc(drawnDoc('gl-dos', { updated: T0 + 5000 }));
    expect((await listDocs()).map(d => d.id)).toEqual(['gl-dos', 'gl-uno']);
    expect(await loadDoc('gl-nada')).toEqual({ broken: expect.stringContaining('ya no está'), raw: undefined });
  });

  it('refuses a stale save from another tab', async () => {
    const doc = drawnDoc('gl-uno');
    expect(await saveDoc(doc)).toBe('ok');
    // tab B saves revision 2 over revision 1
    expect(await saveDoc({ ...doc, rev: 2, name: 'B' }, { expectRev: 1 })).toBe('ok');
    // tab A, still on revision 1, tries the same: nothing is written
    expect(await saveDoc({ ...doc, rev: 2, name: 'A' }, { expectRev: 1 })).toBe('conflict');
    const r = await loadDoc('gl-uno');
    expect('doc' in r && r.doc.name).toBe('B');
    expect((await listDocs())[0].name).toBe('B');
  });

  it('refuses a stale save also with a backend that cannot check and write at once', async () => {
    const { setManyIf: _atomic, ...plain } = memoryKV();
    useKV(plain);
    const doc = drawnDoc('gl-uno');
    expect(await saveDoc(doc)).toBe('ok');
    expect(await saveDoc({ ...doc, rev: 2 }, { expectRev: 1 })).toBe('ok');
    expect(await saveDoc({ ...doc, rev: 2, name: 'A' }, { expectRev: 1 })).toBe('conflict');
  });

  it('keeps a document that does not read apart, and never writes over it', async () => {
    const raw = { kind: 'glyphos-glifos-doc', v: 1, id: 'gl-roto', name: 'Roto', glyphs: { A: { contours: [{ nodes: Array.from({ length: 7000 }, (_, i) => ({ x: i, y: i })) }] } } };
    await kv.setMany([['d:gl-roto', raw], ['s:gl-roto', { id: 'gl-roto', name: 'Roto', mode: 'texto', rev: 3, updated: T0, glyphs: 1, v: 1 }]]);
    const r = await loadDoc('gl-roto');
    expect(r).toEqual({ broken: 'Un glifo tiene más de 6000 nodos.', raw });
    expect(await kv.get('x:gl-roto')).toEqual(raw);
    expect(await kv.get('d:gl-roto')).toBeUndefined();
    expect(await listDocs()).toEqual([expect.objectContaining({ id: 'gl-roto', name: 'Roto', broken: 'Un glifo tiene más de 6000 nodos.' })]);
    // a save of the same id (another tab with an old copy open) does not touch it
    expect(await saveDoc(drawnDoc('gl-roto', { rev: 4 }))).toBe('conflict');
    expect(await kv.get('x:gl-roto')).toEqual(raw);
    expect(await kv.get('d:gl-roto')).toBeUndefined();
    // opening it again still says why
    expect(await loadDoc('gl-roto')).toEqual({ broken: 'Un glifo tiene más de 6000 nodos.', raw });
    // until the person discards it
    await discardBroken('gl-roto');
    expect(await listDocs()).toEqual([]);
    expect(await saveDoc(drawnDoc('gl-roto'))).toBe('ok');
    expect('doc' in (await loadDoc('gl-roto'))).toBe(true);
  });

  it('lists a broken copy without a summary, and a document without one', async () => {
    await kv.set('x:gl-solo', 'basura');
    await kv.set('d:gl-sin-resumen', drawnDoc('gl-sin-resumen'));
    const list = await listDocs();
    expect(list.find(d => d.id === 'gl-solo')).toMatchObject({ broken: 'Ese archivo no es un proyecto de glifos de GLYPHOS.' });
    expect(list.find(d => d.id === 'gl-sin-resumen')).toMatchObject({ name: 'Alfabeto', glyphs: 2 });
  });

  it('never writes over a document from a newer format', async () => {
    const future = { ...JSON.parse(JSON.stringify(drawnDoc('gl-futuro'))), v: 2, algoNuevo: [1, 2] };
    await kv.setMany([['d:gl-futuro', future], ['s:gl-futuro', { id: 'gl-futuro', name: 'Alfabeto', mode: 'texto', rev: 1, updated: T0, glyphs: 2, v: 2 }]]);
    const r = await loadDoc('gl-futuro');
    expect('future' in r && r.future).toBe(true);
    expect((await listDocs())[0].future).toBe(true);
    expect(await saveDoc(drawnDoc('gl-futuro', { rev: 2 }))).toBe('future');
    expect(await kv.get('d:gl-futuro')).toEqual(future);
    // judged from the document itself when the summary does not say
    await kv.set('s:gl-futuro', { id: 'gl-futuro', name: 'Alfabeto' });
    expect(await saveDoc(drawnDoc('gl-futuro', { rev: 2 }))).toBe('future');
    // and a document of a newer format is never written by this version
    expect(await saveDoc({ ...drawnDoc('gl-otro'), v: 2 })).toBe('future');
    expect(await kv.get('d:gl-otro')).toBeUndefined();
  });

  it('says when there is no space or no storage', async () => {
    const failing = (name: string): KV => ({
      ...memoryKV(),
      setMany: async () => { throw Object.assign(new Error('x'), { name }); },
      setManyIf: async () => { throw Object.assign(new Error('x'), { name }); },
    });
    useKV(failing('QuotaExceededError'));
    expect(await saveDoc(drawnDoc('gl-uno'))).toBe('full');
    useKV(failing('InvalidStateError'));
    expect(await saveDoc(drawnDoc('gl-uno'))).toBe('unavailable');
    useKV({ ...memoryKV(), get: async () => { throw new Error('bloqueado'); } });
    expect(await saveDoc(drawnDoc('gl-uno'))).toBe('unavailable');
    expect(await listDocs()).toEqual([]);
  });
});

describe('pictures and sets', () => {
  it('stores a picture once, by its content', async () => {
    const png = encodeAlphaPng(1, 1, new Uint8Array([200]));
    const a = await putImage(new Blob([png as BlobPart]), 'a.png', 1, 1);
    const b = await putImage(new Blob([png as BlobPart], { type: 'image/png' }), 'otra.png', 1, 1);
    expect(a).toEqual({ id: await hashBytes(png), stored: true });
    expect(b.id).toBe(a.id);
    expect((await kv.keys()).filter(k => k.startsWith('i:'))).toHaveLength(1);
    const got = await getImage(a.id);
    expect(got).toMatchObject({ type: 'image/png', name: 'a.png', w: 1, h: 1, added: T0 });
    expect(Array.from(new Uint8Array(await got!.blob.arrayBuffer()))).toEqual(Array.from(png));
    expect(await getImage('0000000000000000')).toBeUndefined();
  });

  it('stores a set under the hash of its canonical bytes and reads it back validated', async () => {
    const s = setNamed('Uno');
    const r = await putSet(s);
    expect(r.id).toBe(await hashBytes(glyphSetBytes(s)));
    expect(r.stored).toBe(true);
    expect(await getSet(r.id)).toEqual(s);
    expect(await setIds()).toEqual([r.id]);
    expect(await kv.get('g:' + r.id)).toMatchObject({ name: 'Uno', doc: 'gl-otro', rev: 1, added: T0 });
    // the same set again: one record, its date refreshed
    now = T0 + 1000;
    expect((await putSet(JSON.parse(JSON.stringify(s)))).id).toBe(r.id);
    expect(await setIds()).toHaveLength(1);
    expect(await kv.get('g:' + r.id)).toMatchObject({ added: T0 + 1000 });
    // damaged bytes, or bytes that do not hash to the id, read as missing
    await kv.set('g:' + r.id, { bytes: new TextEncoder().encode('{roto'), name: 'Uno', added: T0 });
    expect(await getSet(r.id)).toBeUndefined();
    await kv.set('g:' + r.id, { bytes: glyphSetBytes(setNamed('Otro')), name: 'Otro', added: T0 });
    expect(await getSet(r.id)).toBeUndefined();
  });
});

describe('deleting and collecting', () => {
  it('deletes a document but keeps the sets lab pieces use and the pictures other documents use', async () => {
    const shared = encodeAlphaPng(1, 1, new Uint8Array([1]));
    const own = encodeAlphaPng(1, 1, new Uint8Array([2]));
    const sharedId = (await putImage(new Blob([shared as BlobPart]), 's.png', 1, 1)).id;
    const ownId = (await putImage(new Blob([own as BlobPart]), 'o.png', 1, 1)).id;
    const used = await putSet(setNamed('usado', 'gl-a', 1));
    const unused = await putSet(setNamed('sin usar', 'gl-a', 2));
    const draft = await putSet(setNamed('borrador', 'gl-a', 3)); // compiled from A, never published
    const ofB = await putSet(setNamed('de B', 'gl-b', 1));
    const a = drawnDoc('gl-a');
    a.images = { [sharedId]: { name: 's.png', w: 1, h: 1 }, [ownId]: { name: 'o.png', w: 1, h: 1 } };
    a.published = [{ rev: 1, set: used.id, at: T0 }, { rev: 2, set: unused.id, at: T0 + 1 }];
    const b = drawnDoc('gl-b');
    b.images = { [sharedId]: { name: 's.png', w: 1, h: 1 } };
    b.published = [{ rev: 1, set: ofB.id, at: T0 }];
    await saveDoc(a);
    await saveDoc(b);

    expect(await deleteDoc('gl-a', id => id === used.id)).toEqual({ deleted: true, keptSets: [used.id] });
    const ks = await kv.keys();
    expect(ks).not.toContain('d:gl-a');
    expect(ks).not.toContain('s:gl-a');
    expect((await setIds()).sort()).toEqual([used.id, ofB.id].sort());
    expect(ks).not.toContain('g:' + unused.id);
    expect(ks).not.toContain('g:' + draft.id);
    expect(await getImage(sharedId)).toBeDefined();
    expect(await getImage(ownId)).toBeUndefined();
    expect((await listDocs()).map(d => d.id)).toEqual(['gl-b']);
    expect(await deleteDoc('gl-a', () => false)).toEqual({ deleted: false, keptSets: [] });
  });

  it('collects sets nothing needs, after a grace period', async () => {
    const latest = await putSet(setNamed('última', 'gl-b', 2));
    const older = await putSet(setNamed('anterior', 'gl-b', 1));
    const used = await putSet(setNamed('en una pieza'));
    const orphan = await putSet(setNamed('huérfano'));
    const brokenOwn = await putSet(setNamed('de un roto'));
    const b = drawnDoc('gl-b');
    b.published = [{ rev: 2, set: latest.id, at: T0 + 2 }, { rev: 1, set: older.id, at: T0 + 1 }];
    await saveDoc(b);
    // a broken document keeps every set it published
    await kv.set('x:gl-roto', { published: [{ rev: 1, set: brokenOwn.id, at: T0 }] });
    const inUse = (id: string) => id === used.id;

    now = T0 + SET_GRACE_MS - 1;
    expect(await gcSets(inUse)).toEqual([]);
    now = T0 + SET_GRACE_MS + 60_000;
    const fresh = await putSet(setNamed('recién hecho'));
    expect((await gcSets(inUse)).sort()).toEqual([older.id, orphan.id].sort());
    expect((await setIds()).sort()).toEqual([latest.id, used.id, brokenOwn.id, fresh.id].sort());
    now += SET_GRACE_MS;
    expect(await gcSets(inUse)).toEqual([fresh.id]);
  });
});

describe('importing a package', () => {
  async function project(rev: number, updated: number, name = 'Proyecto') {
    const doc = drawnDoc('gl-paquete', { rev, updated, name });
    const png = encodeAlphaPng(2, 1, new Uint8Array([255, 0]));
    const img = await hashBytes(png);
    doc.images = { [img]: { name: 'b.png', w: 2, h: 1 } };
    const set = normalizeGlyphSet(compileDoc(doc).set);
    const bytes = glyphSetBytes(set);
    const setId = await hashBytes(bytes);
    doc.published = [{ rev, set: setId, at: updated }];
    const { blob } = await writePackage(doc, { images: async () => new Blob([png as BlobPart], { type: 'image/png' }), sets: [{ id: setId, bytes }] });
    return { pkg: await readPackage(blob), doc, setId, img };
  }

  it('stores everything once: importing twice adds nothing', async () => {
    const p = await project(3, T0 + 3000);
    expect(await importPackage(p.pkg, 'auto')).toEqual({ docId: 'gl-paquete', action: 'nuevo' });
    expect(await importPackage(p.pkg, 'auto')).toEqual({ docId: 'gl-paquete', action: 'igual' });
    expect(await importPackage(p.pkg, 'copia')).toEqual({ docId: 'gl-paquete', action: 'igual' });
    expect(await listDocs()).toHaveLength(1);
    expect(await setIds()).toEqual([p.setId]);
    expect((await kv.keys()).filter(k => k.startsWith('i:'))).toEqual(['i:' + p.img]);
    const r = await loadDoc('gl-paquete');
    expect('doc' in r && r.doc).toEqual(p.doc);
    expect(await getSet(p.setId)).toEqual(p.pkg.sets[0].set);
  });

  it('replaces with a newer revision, copies an older or diverging one', async () => {
    await importPackage((await project(3, T0 + 3000)).pkg, 'auto');
    // newer: replaced in place
    expect(await importPackage((await project(4, T0 + 4000, 'Nuevo')).pkg, 'auto')).toEqual({ docId: 'gl-paquete', action: 'reemplazado' });
    expect((await listDocs()).map(d => [d.id, d.rev, d.name])).toEqual([['gl-paquete', 4, 'Nuevo']]);
    // older: never over the newer one, comes in as a copy
    const old = await importPackage((await project(2, T0 + 2000, 'Viejo')).pkg, 'reemplazar');
    expect(old.action).toBe('copia');
    expect(old.docId).not.toBe('gl-paquete');
    const copy = await loadDoc(old.docId);
    expect('doc' in copy && [copy.doc.name, copy.doc.rev, copy.doc.published]).toEqual(['Viejo (copia)', 0, []]);
    expect((await listDocs()).find(d => d.id === 'gl-paquete')).toMatchObject({ rev: 4, name: 'Nuevo' });
    // same revision, changed apart: a copy unless the person asks to replace
    const diverging = (await project(4, T0 + 4500, 'Aparte')).pkg;
    expect((await importPackage(diverging, 'auto')).action).toBe('copia');
    expect(await importPackage(diverging, 'reemplazar')).toEqual({ docId: 'gl-paquete', action: 'reemplazado' });
    // newer, but the person wants both
    expect((await importPackage((await project(9, T0 + 9000)).pkg, 'copia')).action).toBe('copia');
    expect(await listDocs()).toHaveLength(4);
  });

  it('stores nothing from a newer-format document, and copies over a broken local one', async () => {
    const p = await project(3, T0 + 3000);
    expect(await importPackage({ ...p.pkg, future: true }, 'auto')).toEqual({ docId: 'gl-paquete', action: 'futuro' });
    expect(await kv.keys()).toEqual([]);
    await kv.set('x:gl-paquete', 'roto');
    const r = await importPackage(p.pkg, 'reemplazar');
    expect(r.action).toBe('copia');
    expect(await kv.get('x:gl-paquete')).toBe('roto');
  });
});
