import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FamilyHost } from '../../src/families/host';
import { familyRecipe, familyLayer } from '../../src/families/recipes';
import { loadFamilyNow } from '../../src/families/load';
import { familyLoadError, modelOf, retryFamily, setFamilyLoader, setFamilyLoadTimeout } from '../../src/families/models';
import { familyById } from '../../src/families/registry';
import { cloneRecipe, type Recipe } from '../../src/engine/recipe';

/**
 * Regressions of the PR #10 review: two layers with the same family and seed keep separate runs (A-02),
 * and a family whose code does not arrive says so and can be tried again (A-03).
 */

const stepsOf = (h: FamilyHost, r: Recipe) => h.info(r).map(i => i.steps);

describe('dos capas con la misma familia y semilla (A-02)', () => {
  beforeAll(async () => { await loadFamilyNow('reaccion_difusion'); });

  const twin = () => {
    const r = familyRecipe('reaccion_difusion', 'coral', undefined, 'duplicate-layer-audit');
    r.layers = [structuredClone(r.layers[0]), structuredClone(r.layers[0])];
    return r;
  };

  it('cada capa conserva su propia ejecución de un cuadro a otro', () => {
    const r = twin();
    const h = new FamilyHost({ live: true, frameBudget: 1e9 });
    h.update(r, 0); h.stepNow(10, 0); h.stepNow(20, 1);
    const first = stepsOf(h, r);
    expect(first[1] - first[0]).toBe(10);
    h.update(r, 0);
    expect(stepsOf(h, r)).toEqual(first);
    h.update(r, 0);
    expect(stepsOf(h, r)).toEqual(first);
  });

  it('un trazo en una capa no aparece en la otra', () => {
    const r = twin();
    const h = new FamilyHost({ live: true, frameBudget: 1e9 });
    h.update(r, 0);
    h.stroke(1, { brush: 'sembrar', x0: 0.3, y0: 0, x1: 0.35, y1: 0.05, r: 0.08, strength: 1 });
    h.update(r, 0); h.update(r, 0);
    const [a, b] = h.info(r);
    expect(a.modified).toBe(false);
    expect(b.modified).toBe(true);
    const ra = h.raster(0)!.data, rb = h.raster(1)!.data;
    expect(Buffer.from(ra).equals(Buffer.from(rb))).toBe(false);
  });

  it('apagar la primera deja a la segunda con su propio estado, y encenderla trae de vuelta el de la primera', () => {
    const r = twin();
    const h = new FamilyHost({ live: true, frameBudget: 1e9 });
    h.update(r, 0); h.stepNow(10, 0); h.stepNow(20, 1);
    const [s0, s1] = stepsOf(h, r);
    const off = cloneRecipe(r); off.layers[0].on = false;
    h.update(off, 0);
    expect(stepsOf(h, off)).toEqual([s1]);
    h.update(r, 0);
    expect(stepsOf(h, r)).toEqual([s0, s1]);
  });

  it('al reordenar dos capas distinguibles, cada estado sigue a su capa', () => {
    const r = twin();
    r.layers[1].scale = 2;
    const h = new FamilyHost({ live: true, frameBudget: 1e9 });
    h.update(r, 0); h.stepNow(10, 0); h.stepNow(20, 1);
    const [s0, s1] = stepsOf(h, r);
    const moved = cloneRecipe(r); moved.layers = [moved.layers[1], moved.layers[0]];
    h.update(moved, 0);
    expect(stepsOf(h, moved)).toEqual([s1, s0]);
  });

  it('cambiar un ajuste en vivo de una capa no le quita el estado a la otra', () => {
    const r = twin();
    const h = new FamilyHost({ live: true, frameBudget: 1e9 });
    h.update(r, 0); h.stepNow(10, 0); h.stepNow(20, 1);
    const [s0, s1] = stepsOf(h, r);
    const edited = cloneRecipe(r); edited.layers[0].fam!.p.feed = 0.05;
    h.update(edited, 0);
    expect(stepsOf(h, edited)).toEqual([s0, s1]);
    const info = h.info(edited);
    expect(info[0].modified).toBe(true);
  });

  it('la copia para exportar lleva el estado de cada capa por separado', () => {
    const r = twin();
    const h = new FamilyHost({ live: true, frameBudget: 1e9 });
    h.update(r, 0); h.stepNow(10, 0); h.stepNow(20, 1);
    h.update(r, 0);
    const b = h.bundle();
    expect(b.slots.map(s => s?.state.steps)).toEqual(stepsOf(h, r).concat([undefined, undefined] as never));
    const exp = new FamilyHost({ live: false, catchupBudget: 1e9 });
    exp.setStart(b, 0);
    exp.update(r, 0);
    expect(stepsOf(exp, r)).toEqual(stepsOf(h, r));
  });
});

describe('una familia cuyo código no llega (A-03)', () => {
  afterEach(() => { setFamilyLoader(null); setFamilyLoadTimeout(20000); vi.useRealTimers(); });

  it('un rechazo deja la capa en error, lo avisa una vez y no se reintenta en cada cuadro', async () => {
    let calls = 0;
    setFamilyLoader(async () => { calls++; throw new Error('chunk 404'); });
    const errors: string[] = [];
    const r = familyRecipe('boids', 'murmuracion');
    const h = new FamilyHost({ live: true, onError: s => errors.push(s) });
    expect(h.update(r, 0)).toBe(true);
    expect(h.info(r)[0]).toMatchObject({ loading: true, failed: false });
    await h.ready(r);
    for (let k = 1; k <= 30; k++) h.update(r, k / 30);
    expect(h.info(r)[0]).toMatchObject({ loading: false, failed: true });
    expect(h.update(r, 2)).toBe(false);
    expect(calls).toBe(1);
    expect(errors.length).toBe(1);
    expect(familyLoadError('boids')).toMatch(/404/);
  });

  it('una respuesta que no llega termina en error tras el tiempo límite', async () => {
    vi.useFakeTimers();
    setFamilyLoadTimeout(5000);
    setFamilyLoader(() => new Promise(() => {}));
    const r = familyRecipe('tela', 'velo');
    const h = new FamilyHost({ live: true });
    h.update(r, 0);
    const ready = h.ready(r);
    await vi.advanceTimersByTimeAsync(5001);
    await ready;
    h.update(r, 0.1);
    expect(h.info(r)[0]).toMatchObject({ loading: false, failed: true });
    expect(familyLoadError('tela')).toMatch(/no llegó|tiempo/i);
  });

  it('«Reintentar» vuelve a pedir el código y la capa se recupera sin recargar la página', async () => {
    let fail = true, calls = 0;
    setFamilyLoader(async id => { calls++; if (fail) throw new Error('sin red'); await loadFamilyNow(id); });
    const r = familyRecipe('chladni', 'placa');
    const h = new FamilyHost({ live: true, frameBudget: 1e9 });
    h.update(r, 0);
    await h.ready(r);
    h.update(r, 0.1);
    expect(h.info(r)[0].failed).toBe(true);
    fail = false;
    await retryFamily('chladni');
    expect(calls).toBe(2);
    h.update(r, 0.2);
    expect(modelOf('chladni')).toBeTruthy();
    expect(h.info(r)[0]).toMatchObject({ loading: false, failed: false });
    expect(h.raster(0)).toBeTruthy();
    expect(familyLoadError('chladni')).toBeUndefined();
  });

  it('las demás capas siguen funcionando mientras una no carga', async () => {
    await loadFamilyNow('reaccion_difusion');
    setFamilyLoader(async () => { throw new Error('chunk 404'); });
    const r = familyRecipe('reaccion_difusion', 'coral');
    r.layers.push(familyLayer(familyById('kuramoto')!, 'k'));
    const h = new FamilyHost({ live: true, frameBudget: 1e9 });
    h.update(r, 0);
    await h.ready(r);
    h.update(r, 0.5);
    const [rd, ku] = h.info(r);
    expect(rd.failed).toBe(false);
    expect(rd.steps).toBeGreaterThan(0);
    expect(ku).toMatchObject({ loading: false, failed: true });
    expect(h.raster(0)).toBeTruthy();
    expect(h.raster(1)).toBeNull();
  });
});
