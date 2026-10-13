// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeIfSaved, flushSave, installAutosave, unsaved } from '../../src/glifos/autosave';
import { newDoc } from '../../src/glifos/doc';
import { loadDoc, memoryKV, saveDoc, useKV, type KV } from '../../src/glifos/storage';
import { closeDoc, edit, openDoc, useGlifos } from '../../src/glifos/state';
import { readPackage, writePackage } from '../../src/glifos/export/package';

/**
 * A-01 of the PR #10 review: «Proyectos» closed the document even when the save before it failed, losing the
 * edits that only lived in the tab. Now the document closes only after a confirmed save (or a deliberate discard).
 */

const g = globalThis as unknown as Record<string, unknown>;
beforeAll(() => {
  g.window = globalThis;
  g.document = { visibilityState: 'visible', addEventListener() {} };
  g.addEventListener = () => {};
  installAutosave();
});

let kv: KV;
beforeEach(() => { closeDoc(); kv = memoryKV(); useKV(kv); });

async function openSaved(id: string) {
  const doc = newDoc({ mode: 'texto', name: 'Versión guardada', id });
  await saveDoc(doc);
  openDoc(doc);
  return doc;
}

const name = () => useGlifos.getState().doc?.name;
const stored = async (id: string) => { const d = await loadDoc(id); return 'doc' in d ? d.doc.name : null; };

describe('volver a Proyectos con un guardado que falla (A-01)', () => {
  it('sin espacio: el documento sigue abierto con la edición y se puede descargar una copia', async () => {
    await openSaved('gl-a01-cuota');
    useKV({ ...kv, async setManyIf() { const e = new Error('Injected full storage'); e.name = 'QuotaExceededError'; throw e; } });
    edit(d => { d.name = 'Edición local que hay que conservar'; }, 'Nombre');
    const r = await closeIfSaved();
    expect(r).toBe('full');
    expect(name()).toBe('Edición local que hay que conservar');
    expect(unsaved()).toBe(true);
    expect(useGlifos.getState().save).toBe('lleno');
    useKV(kv);
    expect(await stored('gl-a01-cuota')).toBe('Versión guardada');
    // the copy carries what the tab has, not what storage kept
    const pkg = await writePackage(useGlifos.getState().doc!, { images: async () => undefined, sets: [] });
    const back = await readPackage(new Uint8Array(await pkg.blob.arrayBuffer()));
    expect(back.doc.name).toBe('Edición local que hay que conservar');
  });

  it('almacenamiento inaccesible: no cierra', async () => {
    await openSaved('gl-a01-bloqueado');
    useKV({ ...kv, async setManyIf() { throw new Error('bloqueado'); } });
    edit(d => { d.name = 'Cambio sin almacén'; }, 'Nombre');
    expect(await closeIfSaved()).toBe('unavailable');
    expect(name()).toBe('Cambio sin almacén');
    expect(unsaved()).toBe(true);
  });

  it('otra pestaña guardó antes: no cierra, y salir de la página sigue preguntando', async () => {
    const doc = await openSaved('gl-a01-conflicto');
    await saveDoc({ ...structuredClone(doc), rev: doc.rev + 5, name: 'De la otra pestaña' });
    edit(d => { d.name = 'Lo de esta pestaña'; }, 'Nombre');
    expect(await closeIfSaved()).toBe('conflict');
    expect(name()).toBe('Lo de esta pestaña');
    expect(useGlifos.getState().readOnly).toBeTruthy();
    expect(unsaved()).toBe(true);
    expect(await stored('gl-a01-conflicto')).toBe('De la otra pestaña');
  });

  it('con el guardado confirmado sí cierra', async () => {
    await openSaved('gl-a01-ok');
    edit(d => { d.name = 'Guardado de verdad'; }, 'Nombre');
    expect(await closeIfSaved()).toBe('ok');
    expect(useGlifos.getState().doc).toBeNull();
    expect(await stored('gl-a01-ok')).toBe('Guardado de verdad');
  });

  it('flushSave dice el resultado (el atajo Ctrl+S ya no lo da por bueno sin mirar)', async () => {
    await openSaved('gl-a01-flush');
    useKV({ ...kv, async setManyIf() { const e = new Error('x'); e.name = 'QuotaExceededError'; throw e; } });
    edit(d => { d.name = 'x'; }, 'Nombre');
    expect(await flushSave()).toBe('full');
  });
});
