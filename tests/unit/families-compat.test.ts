import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FAMILIES, familyById } from '../../src/families/registry';
import { loadFamilyNow } from '../../src/families/load';
import { analyticOf, modelOf } from '../../src/families/models';
import { normFam, packParams } from '../../src/families/params';

/**
 * Compatibility of the families that PR #10 published (86 presets): a recipe saved with one of them keeps
 * drawing exactly what it drew. The fixture freezes, for every original preset, its parameters as they were
 * and a hash of what the model draws from them (raster families: the raster after a warm-up and two seconds
 * from a fixed seed, at the default rows; analytic ones: their CPU twin on a 96 × 48 grid at t = 0 and 3).
 * Presets may change their parameters and new parameters may come (their defaults keep the old output); the
 * code that draws the original parameters may not, unless the family's algorithm version goes up and the
 * recipes made with the earlier one keep their path (ModelConfig.v).
 *
 * Regenerate only to add a family version: FAMILIES_COMPAT_WRITE=1 npx vitest run tests/unit/families-compat.test.ts
 */

interface Case { family: string; preset: string; v: number; seed: string; res: number | null; params: Record<string, unknown>; steps: number; hash: string[] }
const FILE = join(import.meta.dirname, 'fixtures/families-v1.json');
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').slice(0, 16);

function draw(c: Omit<Case, 'hash'>): string[] {
  const meta = familyById(c.family)!;
  const fam = normFam(meta, { v: c.v, seed: c.seed, res: c.res ?? undefined, p: c.params });
  if (meta.kind === 'analytic') {
    const impl = analyticOf(meta.id)!;
    const k = packParams(meta, fam.p);
    const w = 96, h = 48;
    return [0, 3].map(t => {
      const r = new Uint8Array(w * h);
      impl.prep?.(t, k);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) r[y * w + x] = Math.max(0, Math.min(255, Math.round(255 * impl.cpu(((x + 0.5) / w - 0.5) * 2, 0.5 - (y + 0.5) / h, t, k))));
      return hash(r);
    });
  }
  const m = modelOf(meta.id)!({ seed: fam.seed, params: fam.p, res: fam.res ?? meta.budget.res![2], v: fam.v });
  const r = new Uint8Array(m.w * m.h);
  m.step(c.steps);
  m.render(r, 2);
  const a = hash(r);
  m.render(r, 7);
  return [a, hash(r)];
}

beforeAll(async () => { for (const f of FAMILIES) await loadFamilyNow(f.id); });

describe('compatibilidad de las 86 recetas de familia publicadas en el PR #10', () => {
  if (process.env.FAMILIES_COMPAT_WRITE === '1' && !existsSync(FILE)) {
    it('escribe la referencia', () => {
      const cases: Case[] = [];
      for (const meta of FAMILIES) for (const pr of meta.presets) {
        const fam = normFam(meta, { v: meta.version, seed: `${meta.id}-${pr.id}`, res: pr.res, p: pr.params });
        const base = { family: meta.id, preset: pr.id, v: meta.version, seed: fam.seed, res: fam.res ?? null, params: fam.p, steps: (meta.budget.warmup ?? 0) + 2 * (meta.budget.rate ?? 30) };
        cases.push({ ...base, hash: draw(base) });
      }
      writeFileSync(FILE, JSON.stringify({ note: 'Parámetros originales y salida de los 86 presets del PR #10 (algoritmo v1).', cases }, null, 1) + '\n');
      expect(cases.length).toBe(86);
    }, 300_000);
    return;
  }
  const fixture = JSON.parse(readFileSync(FILE, 'utf8')) as { cases: Case[] };
  it('la referencia tiene los 86 presets originales', () => { expect(fixture.cases.length).toBe(86); });
  for (const c of fixture.cases) {
    it(`${c.family}/${c.preset}: sus parámetros originales dibujan lo mismo`, () => {
      expect(familyById(c.family), 'la familia sigue existiendo').toBeTruthy();
      expect(draw(c)).toEqual(c.hash);
    });
  }
});
