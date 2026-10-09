import { beforeAll, describe, expect, it } from 'vitest';
import { FAMILIES, FAMILY_IDS, familyById } from '../../src/families/registry';
import { LOADABLE, loadFamilyNow } from '../../src/families/load';
import { analyticOf, modelOf } from '../../src/families/models';
import { defaultParams, normFam, normParam, packParams } from '../../src/families/params';
import { FAMILY_GLSL } from '../../src/families/analytic/glsl';
import { decodeCheckpoint, encodeCheckpoint } from '../../src/families/checkpoints';
import { FamilyHost } from '../../src/families/host';
import { familyRecipe } from '../../src/families/recipes';
import { PATTERNS, PATTERN_IDS } from '../../src/engine/catalog';
import { normalizeRecipe } from '../../src/engine/recipe';
import type { FamilyMeta, FieldModel, ParamSpec, Params } from '../../src/families/types';

/**
 * What every visual family must hold (docs/cambios/FAMILIAS-Y-GLIFOS.md): honest metadata, real controls,
 * distinct presets, determinism from the seed, exact snapshots, bounded extremes. Family-specific checks
 * live in their own files.
 */

/** Parameters that legitimately do not change a still raster at the probe moment (with the reason). */
const INERT: Record<string, Record<string, string>> = {
  sistema_l: {
    axiom: 'sólo cuenta con «Mi gramática»',
    rules: 'sólo cuenta con «Mi gramática»',
    turn: 'sólo gira los modelos 3D; el helecho por defecto es 2D',
  },
  reaccion_difusion: { edges: 'los bordes sólo cambian lo que cruza el límite; con pocas iteraciones puede no notarse' },
  automata: { custom: 'sólo cuenta con «Regla propia»' },
  crecimiento: { bound: 'el límite sólo actúa cuando la curva llega a él; en la prueba corta todavía no llega' },
  wfc: { hold: 'la espera sólo cuenta con el tablero terminado; en la prueba corta todavía se construye' },
};

const raster = (m: FieldModel, t = 0) => { const o = new Uint8Array(m.w * m.h); m.render(o, t); return o; };
const mad = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const mean = (a: Uint8Array) => { let s = 0; for (const v of a) s += v; return s / a.length; };
const PROBE_T = 5;

/** A small run: test resolution, a short warm-up and about two seconds of steps. */
function run(meta: FamilyMeta, params: Params, seed = 'prueba', steps?: number) {
  const f = modelOf(meta.id)!;
  const res = meta.budget.res ? Math.max(meta.budget.res[0], Math.min(64, meta.budget.res[2])) : 64;
  const m = f({ seed, params, res });
  const n = steps ?? Math.min(2000, (meta.budget.warmup ?? 0) + Math.round(2 * (meta.budget.rate ?? 30)));
  m.step(n);
  return m;
}

const extremes = (s: ParamSpec): Array<number | string | boolean> => {
  switch (s.type) {
    case 'number': case 'int': return [s.min, s.max];
    case 'choice': return s.options.map(o => o.id);
    case 'bool': return [true, false];
    case 'text': return [s.def, ''];
  }
};

beforeAll(async () => { for (const f of FAMILIES) await loadFamilyNow(f.id); });

describe('registro de familias', () => {
  it('ids únicos, distintos de los patrones del catálogo y aceptados por las recetas', () => {
    expect(FAMILY_IDS.size).toBe(FAMILIES.length);
    for (const f of FAMILIES) {
      expect(PATTERNS.some(p => p.id === f.id), f.id).toBe(false);
      expect(PATTERN_IDS.has(f.id), f.id).toBe(true);
      expect(LOADABLE, f.id).toContain(f.id);
    }
  });
});

for (const meta of FAMILIES) {
  // (simulations run thousands of steps here: generous time when the whole suite shares the machine)
  describe(`familia ${meta.id}`, { timeout: 60_000 }, () => {
    it('metadatos completos y coherentes', () => {
      expect(meta.name.length).toBeGreaterThan(2);
      for (const k of ['blurb', 'mechanism', 'time'] as const) expect(meta[k].length, k).toBeGreaterThan(20);
      expect(meta.sources.length).toBeGreaterThan(0);
      expect(meta.budget.limits.length).toBeGreaterThan(10);
      expect(new Set(meta.params.map(p => p.key)).size).toBe(meta.params.length);
      // defaults are valid values of their own spec
      for (const s of meta.params) expect(normParam(s, s.def), s.key).toEqual(s.def);
      // at least three presets, each with valid values for known keys only
      expect(meta.presets.length).toBeGreaterThanOrEqual(3);
      expect(new Set(meta.presets.map(p => p.id)).size).toBe(meta.presets.length);
      for (const pr of meta.presets) {
        expect(pr.desc.length, pr.id).toBeGreaterThan(10);
        for (const [k, v] of Object.entries(pr.params)) {
          const s = meta.params.find(p => p.key === k);
          expect(s, `${pr.id}.${k}`).toBeTruthy();
          expect(normParam(s!, v), `${pr.id}.${k}`).toEqual(v);
        }
      }
      if (meta.kind === 'analytic') {
        expect(meta.caps.loop).toBe(true);
        expect(meta.params.length).toBeLessThanOrEqual(8);
        expect(FAMILY_GLSL[meta.id]).toContain(`float F_${meta.id}(vec2 p, float t, vec4 k0, vec4 k1)`);
        expect(analyticOf(meta.id)).toBeTruthy();
      } else {
        expect(meta.caps.loop).toBe(false);
        expect(meta.budget.res).toBeTruthy();
        expect(meta.budget.rate).toBeGreaterThan(0);
        expect(modelOf(meta.id)).toBeTruthy();
      }
      if (meta.caps.basic === 'reduced') expect(meta.caps.basicNote?.length).toBeGreaterThan(10);
    });

    it('una receta con la familia es v3, se normaliza y rechaza una versión de algoritmo futura', () => {
      const r = familyRecipe(meta.id);
      expect(r.v).toBe(3);
      expect(normalizeRecipe(JSON.parse(JSON.stringify(r)))).toEqual(r);
      const future = JSON.parse(JSON.stringify(r));
      future.layers[0].fam.v = meta.version + 1;
      expect(() => normalizeRecipe(future)).toThrow(/versión más nueva/);
      // out-of-range values come back inside their range
      const wild = JSON.parse(JSON.stringify(r));
      for (const s of meta.params) wild.layers[0].fam.p[s.key] = s.type === 'number' || s.type === 'int' ? 1e9 : 'nada';
      const back = normalizeRecipe(wild).layers[0].fam!;
      for (const s of meta.params) expect(normParam(s, back.p[s.key]), s.key).toEqual(back.p[s.key]);
    });

    if (meta.kind === 'analytic') {
      it('gemelo de CPU: valores finitos en 0..1 en todos los presets y extremos', () => {
        const impl = analyticOf(meta.id)!;
        const sets: Params[] = [...meta.presets.map(p => ({ ...defaultParams(meta), ...p.params }))];
        for (const s of meta.params) for (const v of extremes(s)) sets.push({ ...defaultParams(meta), [s.key]: v });
        for (const p of sets) {
          const k = packParams(meta, p);
          for (const t of [0, 3.3, 40]) {
            impl.prep?.(t, k);
            for (let y = -0.5; y <= 0.5; y += 0.125) for (let x = -0.9; x <= 0.9; x += 0.15) {
              const v = impl.cpu(x, y, t, k);
              expect(Number.isFinite(v), `${JSON.stringify(p)} t=${t}`).toBe(true);
              expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
            }
          }
        }
      });
      it('presets distintos y controles con efecto (gemelo de CPU)', () => {
        const impl = analyticOf(meta.id)!;
        const img = (p: Params, t = PROBE_T) => {
          const k = packParams(meta, p);
          impl.prep?.(t, k);
          const o = new Uint8Array(48 * 24);
          for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) o[y * 48 + x] = Math.round(impl.cpu((x + 0.5) / 24 - 1, 0.5 - (y + 0.5) / 24, t, k) * 255);
          return o;
        };
        const ps = meta.presets.map(p => img({ ...defaultParams(meta), ...p.params }));
        for (let i = 0; i < ps.length; i++) {
          expect(mean(ps[i]), meta.presets[i].id).toBeGreaterThan(1);
          for (let j = i + 1; j < ps.length; j++) expect(mad(ps[i], ps[j]), `${meta.presets[i].id} vs ${meta.presets[j].id}`).toBeGreaterThan(2);
        }
        for (const s of meta.params) {
          if (INERT[meta.id]?.[s.key]) continue;
          const [a, b] = extremes(s);
          const base = defaultParams(meta);
          expect(mad(img({ ...base, [s.key]: a }), img({ ...base, [s.key]: b })), s.key).toBeGreaterThan(0.2);
        }
      });
      return;
    }

    it('determinista desde la semilla; otra semilla da otra corrida', () => {
      const p = defaultParams(meta);
      const a = raster(run(meta, p), PROBE_T), b = raster(run(meta, p), PROBE_T);
      expect(mad(a, b)).toBe(0);
      if (!meta.seedless) expect(mad(a, raster(run(meta, p, 'otra semilla'), PROBE_T))).toBeGreaterThan(0);
    });

    it('guardar y restaurar el estado (también como archivo) continúa exactamente igual', () => {
      const p = defaultParams(meta);
      const a = run(meta, p);
      const snap = a.snapshot();
      const bytes = encodeCheckpoint({ family: meta.id, fv: meta.version, seed: 'prueba', res: a.h, state: snap });
      a.step(37);
      const ra = raster(a, PROBE_T);
      for (const st of [snap, decodeCheckpoint(bytes).state]) {
        const b = modelOf(meta.id)!({ seed: 'prueba', params: p, res: a.h });
        b.restore(st);
        expect(b.steps).toBe(snap.steps);
        b.step(37);
        expect(mad(ra, raster(b, PROBE_T))).toBe(0);
      }
      // a snapshot is a copy: running on does not change it
      expect(snap.steps).toBeLessThan(a.steps);
    });

    it('presets distintos, ni vacíos ni saturados', () => {
      // (six seconds of each, as a preset is first seen; at most 5000 steps)
      const long = Math.min(5000, (meta.budget.warmup ?? 0) + Math.round(6 * (meta.budget.rate ?? 30)));
      const rs = meta.presets.map(pr => raster(run(meta, { ...defaultParams(meta), ...pr.params }, 'prueba', long), 6));
      for (let i = 0; i < rs.length; i++) {
        const m = mean(rs[i]);
        expect(m, meta.presets[i].id).toBeGreaterThan(0.5);
        expect(m, meta.presets[i].id).toBeLessThan(250);
        for (let j = i + 1; j < rs.length; j++) expect(mad(rs[i], rs[j]), `${meta.presets[i].id} vs ${meta.presets[j].id}`).toBeGreaterThan(1);
      }
    });

    it('cada control cambia el resultado y los extremos no rompen nada', () => {
      const base = defaultParams(meta);
      const ref = raster(run(meta, base), PROBE_T);
      for (const s of meta.params) {
        const outs = extremes(s).map(v => {
          const m = run(meta, { ...base, [s.key]: v });
          const o = raster(m, PROBE_T);
          expect(o.length).toBe(m.w * m.h);
          return o;
        });
        if (INERT[meta.id]?.[s.key]) continue;
        // against the default: both extremes of a control may lead to the same rest state (an empty field)
        const diff = Math.max(...outs.map(o => mad(ref, o)));
        expect(diff, `${s.key} no cambia nada`).toBeGreaterThan(0.05);
      }
    });

    it('un cambio de parámetros en vivo no reinicia ni rompe la corrida', () => {
      const m = run(meta, defaultParams(meta));
      const steps = m.steps;
      const live = meta.params.filter(s => !s.rebuild && (s.type === 'number' || s.type === 'int'));
      const p = { ...defaultParams(meta) };
      for (const s of live) p[s.key] = (s as { max: number }).max;
      m.setParams(p);
      m.step(10);
      expect(m.steps).toBe(steps + 10);
      expect(raster(m, PROBE_T).length).toBe(m.w * m.h);
    });

    it('el anfitrión: el mismo momento por pasos o de un salto, y volver atrás empieza de nuevo', () => {
      const r = familyRecipe(meta.id);
      r.layers[0].fam = normFam(meta, { ...r.layers[0].fam, res: meta.budget.res![0] });
      const h1 = new FamilyHost({ live: false, catchupBudget: 1e9 }), h2 = new FamilyHost({ live: false, catchupBudget: 1e9 });
      for (const t of [0.5, 1, 1.5, 2]) h1.update(r, t);
      h2.update(r, 2);
      expect(mad(h1.raster(0)!.data, h2.raster(0)!.data)).toBe(0);
      h1.update(r, 1);
      h2.update(r, 1);
      expect(mad(h1.raster(0)!.data, h2.raster(0)!.data)).toBe(0);
      // a copy of a run, handed to another host at t0, goes on as the original would
      const live = new FamilyHost({ live: false, catchupBudget: 1e9 });
      live.update(r, 1);
      const bundle = live.bundle();
      live.update(r, 1.5);
      const exp = new FamilyHost({ live: false, catchupBudget: 1e9 });
      exp.setStart(bundle, 1);
      exp.update(r, 1.5);
      expect(mad(live.raster(0)!.data, exp.raster(0)!.data)).toBe(0);
    });
  });
}

it('las familias conocidas por la receta son las del registro', () => {
  for (const id of LOADABLE) expect(familyById(id), id).toBeTruthy();
});
