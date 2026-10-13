import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { FAMILIES } from '../../src/families/all';
import type { FamilyMeta } from '../../src/families/types';
import { usesOf } from '../../src/studio/recipes/catalog';
import { familyRecipe } from '../../src/families/recipes';
import { contextOf, drawn } from './canvas';
import { download, openStudio } from './helpers';
import { closeRecipes, hideStageOverlays, openRecipes, recipeCard, stageColours } from './recipes';

/**
 * The visual families in the lab, in both engines: the first preset of every family opens from the recipe
 * browser, draws, and shows its family panel; a simulation runs (Reiniciar / Avanzar change the stage), its
 * PNG exports from a copy, and a piece saved with ★ comes back after a reload with its family.
 */

async function settle(page: Page) {
  await page.waitForFunction(() => { const c = document.querySelector('.stage canvas'); return !!c && !c.hasAttribute('data-busy'); }, undefined, { timeout: 90_000, polling: 100 });
}

const SPACE_NAMES = { arte: 'Arte', fondos: 'Fondos', terminal: 'Terminal' } as const;
type Shown = keyof typeof SPACE_NAMES;
/** The settings group with the layer cards has its own name in each space (src/studio/panels.tsx, TABS). */
const LAYERS_TAB: Record<Shown, string> = { arte: 'Capas', fondos: 'Forma', terminal: 'Forma' };

/**
 * A preset of a family the recipe browser offers without a photo or words of the person (the catalogue lists
 * family presets by use: Arte first, else Fondos, else Terminal), and that space.
 */
function shownPreset(f: FamilyMeta) {
  for (const space of ['arte', 'fondos', 'terminal'] as Shown[]) {
    const preset = f.presets.find(p => usesOf(f, p).some(u => u.startsWith(space + '/')));
    if (preset) return { preset, space };
  }
  throw new Error(`${f.id}: ningún preset en Arte, Fondos o Terminal`);
}

async function toSpace(page: Page, space: Shown) {
  const btn = page.getByRole('navigation', { name: 'Espacios del estudio' }).getByRole('button', { name: SPACE_NAMES[space], exact: true });
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

async function applyPreset(page: Page, name: string, space: Shown) {
  await closeRecipes(page);
  await toSpace(page, space);
  await openRecipes(page);
  const card = recipeCard(page, name);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await settle(page);
  // the family's panel is in the layer card («Capas» in Arte, «Forma» in Fondos and Terminal)
  await closeRecipes(page);
  await page.getByRole('tab', { name: LAYERS_TAB[space], exact: true }).click({ timeout: 15_000 });
}

for (const engine of ['webgl', 'basico'] as const) {
  test.describe(engine === 'webgl' ? 'familias · motor WebGL' : 'familias · motor básico', () => {
    test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });

    test(`las ${FAMILIES.length} familias abren desde Recetas, dibujan y muestran su panel`, async ({ page }) => {
      // (a minute per family at most: SwiftShader on a shared machine compiles every family's shader)
      test.setTimeout(60_000 * FAMILIES.length);
      const errors = await openStudio(page, `${engine === 'basico' ? '?motor=basico' : ''}#space=arte`);
      // the basic stage draws first: asking for a context before its engine took one would create the wrong one
      // (a WebGL stage is not readable outside its frame, and asking for webgl2 first gives it the type it takes)
      if (engine === 'basico') await drawn(page, '.stage canvas');
      expect(await contextOf(page, '.stage canvas')).toBe(engine === 'basico' ? '2d' : 'webgl2');
      await hideStageOverlays(page);
      const bad: string[] = [];
      for (const f of FAMILIES) {
        const { preset, space } = shownPreset(f);
        await applyPreset(page, preset.name, space);
        await expect.poll(() => stageColours(page), { message: `${f.id}: el escenario dibuja`, timeout: 60_000 }).toBeGreaterThan(2);
        // the layer's family panel: its presets and «Cómo funciona»
        await expect(page.getByRole('group', { name: `Presets de ${f.name}` }), f.id).toBeVisible();
        const failed = await page.locator('.toast').filter({ hasText: /no pudo|falló/i }).allTextContents();
        if (failed.length) bad.push(`${f.id}: ${failed.join(' / ')}`);
        if (errors.length) bad.push(`${f.id}: ${errors.splice(0).join(' / ')}`);
      }
      expect(bad, bad.join('\n')).toEqual([]);
    });
  });
}

test.describe('familias · ejecución, exportación y guardado', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('una simulación se reinicia y avanza; su PNG sale de una copia; guardada con ★ vuelve tras recargar', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = await openStudio(page, '#space=arte');
    await hideStageOverlays(page);
    const rd = FAMILIES.find(f => f.id === 'reaccion_difusion')!;
    const shown = shownPreset(rd);
    await applyPreset(page, shown.preset.name, shown.space);
    const run = page.getByRole('group', { name: 'Simulación en el escenario' });
    await expect(run).toBeVisible();
    // pause, then step: the stage changes by a tenth of a second of the model, and restarting changes it back
    await page.getByRole('button', { name: 'Pausar animación' }).click();
    const before = await page.locator('.stage canvas').first().screenshot();
    await run.getByRole('button', { name: 'Avanzar' }).click();
    await expect.poll(async () => Buffer.compare(before, await page.locator('.stage canvas').first().screenshot()) !== 0, { timeout: 20_000 }).toBe(true);
    await run.getByRole('button', { name: 'Reiniciar' }).click();
    await expect(run.locator('.fam-status')).toContainText(/paso|semilla|0/i);

    // PNG of the moment on stage
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Imagen' }).click();
    const png = await download(page, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
    expect(readFileSync(png.path).subarray(1, 4).toString()).toBe('PNG');
    await page.keyboard.press('Escape');

    // saved with ★, the piece (its family layer) comes back after a reload
    // (the deck is hidden for the screenshots: its shortcut, S)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('s');
    await expect(page.locator('.toast').filter({ hasText: /en tu colección/i }).first()).toBeAttached({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.locator('.stage canvas').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('group', { name: `Presets de ${rd.name}` })).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });
});

test.describe('familias · código que no llega (A-03)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('un chunk de familia con 404 deja la capa en error, lo dice, y «Reintentar» la recupera sin recargar', async ({ page }) => {
    test.setTimeout(300_000);
    const boids = FAMILIES.find(f => f.id === 'boids')!;
    // the model's own chunk (not its words) answers 404 until we let it through
    let block = true;
    await page.route(/\/assets\/boids-[\w-]+\.js$/, route => (block ? route.fulfill({ status: 404, body: 'no' }) : route.continue()));
    await openStudio(page, '#space=arte');
    await hideStageOverlays(page);
    const shown = shownPreset(boids);
    await applyPreset(page, shown.preset.name, shown.space);
    const err = page.locator('.fam-error');
    await expect(err).toContainText(`No llegó el código de «${boids.name}»`, { timeout: 30_000 });
    const run = page.getByRole('group', { name: 'Simulación en el escenario' });
    await expect(run.locator('.fam-status')).toContainText('No llegó el código');
    await expect(run.locator('.fam-status')).not.toContainText('Cargando');
    block = false;
    await err.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.locator('.fam-error')).toHaveCount(0, { timeout: 30_000 });
    await expect(run.locator('.fam-status')).toContainText(/Paso \d/, { timeout: 30_000 });
    await expect.poll(() => stageColours(page), { timeout: 30_000 }).toBeGreaterThan(2);
  });
});

/** Colours in a page's first canvas, from a screenshot (a WebGL canvas cannot be read back otherwise). */
async function canvasColours(page: Page): Promise<number> {
  const png = await page.locator('canvas').first().screenshot();
  return page.evaluate(async src => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 160; c.height = 100;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, 160, 100);
    const d = x.getImageData(0, 0, 160, 100).data, seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) seen.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    return seen.size;
  }, 'data:image/png;base64,' + png.toString('base64'));
}

test.describe('familias · código exportado', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // (PR #10 review) exported code mounts its piece without set(): the analytic families' GLSL and every family's
  // spec were never asked for there, so WebGL drew them empty (and, once the specs loaded on demand, the basic
  // engine too). A colour family and a raster one, in a browser with WebGL 2 and in one without it.
  for (const [id, preset] of [['corrientes', 'neon'], ['hiperbolico', 'triangulos'], ['reaccion_difusion', 'coral']] as const) {
    test(`${id}: la página exportada dibuja con WebGL 2 y con el motor básico`, async ({ page, browser }) => {
      test.setTimeout(240_000);
      const code = Buffer.from(JSON.stringify(familyRecipe(id, preset, undefined, 'exportado'))).toString('base64url');
      await openStudio(page, '#r=j' + code);
      await page.keyboard.press('e');
      await page.getByRole('tab', { name: 'Código' }).click();
      const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar página/ }).click()]);
      const file = test.info().outputPath(`${id}.html`);
      await d.saveAs(file);
      const noGl = await browser.browserType().launch({ args: ['--disable-3d-apis'] });
      try {
        for (const [name, b] of [['WebGL 2', browser], ['motor básico', noGl]] as const) {
          const other = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
          const errors: string[] = [];
          other.on('pageerror', e => errors.push(e.message));
          await other.goto('file://' + file);
          await expect.poll(() => canvasColours(other), { message: `${id} · ${name}: la pieza dibuja`, timeout: 30_000 }).toBeGreaterThan(3);
          expect(errors, `${id} · ${name}`).toEqual([]);
          await other.context().close();
        }
      } finally { await noGl.close(); }
    });
  }
});
