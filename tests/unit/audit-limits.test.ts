import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { normalizeRecipe } from '../../src/engine/recipe';
import { FONTS, FIGURES, figureFit } from '../../src/engine/catalog';
import { particlePattern, setParticlePX } from '../../src/engine/basic/particles';
import { PARTICLE_IDS } from '../../src/engine/glsl/particles';
import { parseRecipe, decodeRecipe } from '../../src/shared/share';
import { readSession } from '../../src/shared/session';
import { unzip, zip, ZIP_LIMITS } from '../../src/shared/zip';
import { runtimeDataModule } from '../../scripts/runtime-plugin';

it('rejects an oversized but otherwise valid link (a regression for removing MAX_LINK)', async () => {
  const json = JSON.stringify({ v: 2, glyph: { cell: 12 } }) + ' '.repeat(50_000);
  expect(parseRecipe(json)).not.toBeNull();
  const code = 'j' + Buffer.from(json).toString('base64url');
  expect(code.length).toBeGreaterThan(64 * 1024);
  expect(await decodeRecipe(code)).toBeNull();
});

it('refuses future recipes, envelopes and sessions instead of silently dropping unknown fields', async () => {
  expect(() => normalizeRecipe({ v: 3, layers: [], future: true })).toThrow(/versión más nueva/);
  expect(parseRecipe(JSON.stringify({ v: 3, glyph: {} }))).toBeNull();
  expect(parseRecipe(JSON.stringify({ glyphos: 'recipe', version: 3, recipe: { v: 2 } }))).toBeNull();
  const files = await unzip(await zip([{ name: 'sesion.json', data: JSON.stringify({ glyphos: 'session', version: 2, entries: [] }) }]));
  await expect(readSession(files)).rejects.toThrow(/versión más nueva/);
});

it('normalises unknown patterns consistently, while explicit custom libraries can allow their own ids', () => {
  expect(normalizeRecipe({ layers: [{ pattern: 'desconocido' }] }).layers[0].pattern).toBe('nube');
  expect(normalizeRecipe({ layers: [{ pattern: 'propio' }] }, new Set(['propio'])).layers[0].pattern).toBe('propio');
});

it('every offered local font weight has an available face covering it, and the five figures fit portrait canvases', () => {
  const main = readFileSync('src/studio/main.tsx', 'utf8') + readFileSync('src/landing/fonts.ts', 'utf8');
  const viewer = readFileSync('src/landing/fonts.ts', 'utf8');
  const variable = new Set(['jetbrains', 'martian', 'fira']);
  const packages: Record<string, string> = { jetbrains: 'jetbrains-mono', plex: 'ibm-plex-mono', martian: 'martian-mono', space: 'space-mono', fira: 'fira-code', vt: 'vt323', pixel: 'press-start-2p', silk: 'silkscreen', serif: 'instrument-serif' };
  for (const f of FONTS) for (const weight of f.weights) {
    if (!packages[f.id]) continue;
    const sheetPath = variable.has(f.id) ? 'src/landing/fonts-variable.css' : `node_modules/@fontsource/${packages[f.id]}/latin-${weight}.css`;
    const imported = variable.has(f.id) ? './fonts-variable.css' : `@fontsource/${packages[f.id]}/latin-${weight}.css`;
    expect(main, `${f.id}/${weight}`).toContain(imported);
    expect(viewer, `visor ${f.id}/${weight}`).toContain(imported);
    const sheet = readFileSync(sheetPath, 'utf8');
    const face = sheet.match(/@font-face\s*\{[^}]+\}/g)?.find(block => block.includes(`font-family: '${f.family}'`));
    expect(face, `${f.family}/${weight}`).toBeDefined();
    const range = face!.match(/font-weight:\s*(\d+)(?:\s+(\d+))?/)!.slice(1);
    expect(weight).toBeGreaterThanOrEqual(Number(range[0]));
    expect(weight).toBeLessThanOrEqual(Number(range[1] ?? range[0]));
    const url = face!.match(/url\(['"]?([^)'"]+)/)![1];
    const asset = resolve(url.startsWith('@') ? 'node_modules' : dirname(sheetPath), url);
    expect(readFileSync(asset).subarray(0, 4).toString()).toBe('wOF2');
  }
  for (const id of ['lissajous', 'estrella_mar', 'respiracion', 'radar', 'galaxia']) {
    expect(FIGURES.has(id)).toBe(true); expect(figureFit(id, 200, 800)).toBe(4);
  }
});

it.each(PARTICLE_IDS.map((id, i) => [id, i] as const))('%s size responds below the old pixel floor', (_id, mode) => {
  const p = particlePattern(mode); setParticlePX(0.1); p.prep?.(1.3, 0.5, 0);
  let difference = 0;
  for (let y = -0.6; y < 0.6; y += 0.05) for (let x = -0.6; x < 0.6; x += 0.05) difference += Math.abs(p.f(x, y, 1.3, 0.5, 0) - p.f(x, y, 1.3, 0.5, 0.4));
  expect(difference).toBeGreaterThan(1);
});

it('shared runtime strings reconstruct byte for byte without eval in the generated module', async () => {
  const block = 'shared shader source and declarations;'.repeat(100);
  const b = { basic: 'BASIC' + block + 'END', runtime: 'GL' + block + 'END', patterns: { a: 'pattern' } };
  const code = runtimeDataModule(b);
  const data = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  expect(data.runtime).toBe(b.runtime); expect(data.basic).toBe(b.basic); expect(data.patterns).toEqual(b.patterns);
  expect(code.length).toBeLessThan(b.runtime.length + b.basic.length);
  expect(code).not.toMatch(/eval\(|new Function/);
});

describe('ZIP declarations are bounded before contents are read', () => {
  it('rejects the reported 200 MB compressed entry without inflating it', async () => {
    const blob = new Uint8Array(await (await zip([{ name: 'sesion.json', data: '{}' }])).arrayBuffer());
    const view = new DataView(blob.buffer);
    const central = blob.findIndex((_, i) => i + 4 <= blob.length && view.getUint32(i, true) === 0x02014b50);
    view.setUint16(central + 10, 8, true); view.setUint32(central + 24, 200 * 1024 * 1024, true);
    await expect(unzip(blob)).rejects.toThrow(/límite de importación/);
  });
  it('rejects an excessive directory count before traversing the entries', async () => {
    const blob = new Uint8Array(await (await zip([{ name: 'a', data: 'a' }])).arrayBuffer());
    new DataView(blob.buffer).setUint16(blob.length - 22 + 10, ZIP_LIMITS.entries + 1, true);
    await expect(unzip(blob)).rejects.toThrow(/demasiadas entradas/);
  });
});

it('the video persistence limit remains 200 MB and refuses a 201 MB file without reading it', async () => {
  vi.stubGlobal('addEventListener', vi.fn());
  const { put } = await import('../../src/studio/mediaStore');
  const bytes = vi.fn();
  const file = { type: 'video/webm', size: 201 * 1024 * 1024, arrayBuffer: bytes, slice: vi.fn() } as unknown as Blob;
  expect(await put(file, { kind: 'video', name: 'large.webm', w: 1, h: 1 })).toMatchObject({ stored: false, reason: 'too-big' });
  expect(bytes).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
