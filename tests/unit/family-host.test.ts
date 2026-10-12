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

describe('un chunk que falló se vuelve a pedir con otra dirección (A-03)', () => {
  it('lee la dirección del mensaje de Chromium y de Firefox', async () => {
    const { failedChunkUrl } = await import('../../src/shared/chunks');
    expect(failedChunkUrl(new TypeError('Failed to fetch dynamically imported module: https://x.app/assets/boids-CPmh2xft.js'))).toBe('https://x.app/assets/boids-CPmh2xft.js');
    expect(failedChunkUrl(new TypeError('error loading dynamically imported module: http://127.0.0.1:4173/assets/tela-uz.js?reintento=2'))).toBe('http://127.0.0.1:4173/assets/tela-uz.js');
    expect(failedChunkUrl(new TypeError('Importing a module script failed.'))).toBeUndefined();
  });
});

describe('un motor fijo que no llega en un solo cuadro (A-11)', () => {
  beforeAll(async () => { await loadFamilyNow('reaccion_difusion'); });

  it('dice que se quedó corto y, repitiendo el cuadro, llega exactamente al estado de una reconstrucción completa', () => {
    const r = familyRecipe('reaccion_difusion', 'coral', undefined, 'parcial');
    const slow = new FamilyHost({ live: false, catchupBudget: 1 });
    slow.setStart(null, 0);
    slow.update(r, 3);
    const first = slow.info(r)[0];
    expect(first.partial).toBe(true);
    expect(first.debt).toBeGreaterThan(0);
    let k = 0;
    while (slow.info(r)[0].partial && k++ < 10_000) slow.update(r, 3);
    expect(slow.info(r)[0]).toMatchObject({ partial: false, debt: 0 });
    const full = new FamilyHost({ live: false, catchupBudget: 1e9 });
    full.setStart(null, 0);
    full.update(r, 3);
    expect(full.info(r)[0].steps).toBe(slow.info(r)[0].steps);
    expect(Buffer.from(slow.raster(0)!.data).equals(Buffer.from(full.raster(0)!.data))).toBe(true);
  }, 60_000);
});

describe('el presupuesto del cuadro cubre también el dibujo del raster (A-10)', () => {
  it('con un raster caro de dibujar, el cuadro hace menos pasos y no pasa de su presupuesto', async () => {
    const { registerModel } = await import('../../src/families/models');
    let clock = 0;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    try {
      // a model whose step costs 1 ms and whose raster costs 6 ms to draw (fake clock)
      registerModel('erosion', cfg => {
        const h = cfg.res, w = 2 * h;
        let steps = 0;
        return {
          w, h, get steps() { return steps; },
          setParams() {}, step(n: number) { steps += n; clock += n; }, render(out: Uint8Array) { out.fill(steps % 255); clock += 6; },
          snapshot: () => ({ id: 'erosion', v: 1, steps, res: h, scalars: {}, arrays: {} }), restore() {},
        };
      });
      const r = familyRecipe('erosion', 'barrancos');
      r.layers[0].speed = 3;
      const h = new FamilyHost({ live: true, frameBudget: 8 });
      const spent: number[] = [];
      for (let k = 0; k <= 20; k++) { const a = clock; h.update(r, k * 0.25); spent.push(clock - a); }
      // after the first frames measured the raster, a frame stays within its 8 ms (2 steps + a 6 ms raster)
      for (const ms of spent.slice(3)) expect(ms).toBeLessThanOrEqual(8);
      expect(h.info(r)[0].lag).toBe(true);
    } finally { spy.mockRestore(); }
  });
});

describe('recursos: pasar muchas veces de una a cuatro capas no acumula ejecuciones (A-07)', () => {
  beforeAll(async () => { for (const id of ['reaccion_difusion', 'physarum', 'boids', 'fluido']) await loadFamilyNow(id); });

  it('las ejecuciones vivas y las retiradas tienen un tope, digan lo que digan los cambios', () => {
    const h = new FamilyHost({ live: true, frameBudget: 1e9 });
    const ids = ['reaccion_difusion', 'physarum', 'boids', 'fluido'];
    // at their smallest rows: the bound is about how many runs exist, not about their size
    const small = (r: Recipe) => { for (const l of r.layers) if (l.fam) l.fam.res = familyById(l.pattern)!.budget.res[0]; return r; };
    const four = (k: number) => {
      const r = familyRecipe(ids[0], undefined, undefined, `ciclo-${k}-0`);
      for (let i = 1; i < 4; i++) r.layers.push(familyLayer(familyById(ids[i])!, `ciclo-${k}-${i}`));
      return small(r);
    };
    const one = (k: number) => small(familyRecipe(ids[k % 4], undefined, undefined, `uno-${k}`));
    const live = () => (h as unknown as { slots: unknown[] }).slots.filter(Boolean).length;
    const retired = () => (h as unknown as { retired: unknown[] }).retired.length;
    let most = 0;
    for (let k = 0; k < 16; k++) {
      // every cycle new seeds: nothing can be reused, so every run is new and the old ones must go
      h.update(four(k), k); h.stepNow(2, k);
      expect(live()).toBe(4);
      h.update(one(k), k + 0.5);
      expect(live()).toBe(1);
      most = Math.max(most, retired());
    }
    expect(most).toBeLessThanOrEqual(3);
    h.dispose();
    expect(live()).toBe(0);
    expect(retired()).toBe(0);
  }, 180_000);
});
