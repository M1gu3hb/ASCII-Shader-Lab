import { expect, test, type Page } from '@playwright/test';
import { defaultRecipe, normalizeRecipe, normOptics, type Recipe } from '../../src/engine/recipe';
import { openStudio } from './helpers';
import { dropPhoto, hideStageOverlays, openRecipes, recipeCard, stageColours } from './recipes';
import { contextOf, drawn } from './canvas';

/**
 * Closing of PR #10, «acabados»: the glass solids (I-36…I-43), the anamorphic flare (I-22), the paper grain
 * (I-27) and the calligraphic brush (I-20) in the studio's Efectos and Interacción panels, and in the exported
 * code (its runtime carries the engines), with WebGL 2 and with the basic engine.
 */

const link = (r: Recipe) => '#r=j' + Buffer.from(JSON.stringify(r)).toString('base64url');

/** A piece with all four: a sphere of glass with a dispersion, the anamorphic halo, paper with folds, and the ink brush. */
function allFour(): Recipe {
  const r = defaultRecipe();
  r.layers = [{ ...r.layers[0], pattern: 'franjas', a: 0.3, b: 0.6 }, { ...r.layers[0], pattern: 'luciernagas', blend: 'screen', mix: 0.6, a: 0.45, b: 0.6 }];
  r.color = { ...r.color, stops: ['#0b1626', '#2c6a96', '#e6c48a', '#fff6e2'], bg: '#050a12' };
  r.interact = { mode: 'paint', strength: 0.85, radius: 0.1, auto: true, decay: 0.85, stroke: 'caligrafia', bleed: 0.6 };
  r.fx = { ...r.fx, bloom: 0.9, grain: 0.6 };
  r.optics = normOptics({ kind: 'esfera', scale: 1.2, disp: 0.6, shine: 0.85 })!;
  r.fxKind = { bloom: 'anamorfico', grain: 'papel', fold: 'carta' };
  r.meta = { space: 'arte' };
  return normalizeRecipe(r);
}

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

test.describe('acabados · estudio', () => {
  test.use({ viewport: { width: 1366, height: 860 } });

  test('Efectos: el vidrio sólido, la forma del halo y el papel se eligen y se ajustan; Interacción: el pincel caligráfico', async ({ page }) => {
    test.setTimeout(180_000);
    const r = defaultRecipe();
    r.layers = [{ ...r.layers[0], pattern: 'franjas', a: 0.3, b: 0.6 }];
    r.meta = { space: 'arte' };
    const errors = await openStudio(page, link(normalizeRecipe(r)));
    await page.getByRole('tab', { name: 'Efectos' }).click();
    const glass = page.getByRole('radiogroup', { name: 'Vidrio delante' });
    await glass.getByRole('radio', { name: 'Esfera' }).click();
    await expect(glass.getByRole('radio', { name: 'Esfera' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.seedline')).toContainText('editado');
    await page.getByLabel('Índice de refracción').fill('2');
    await page.getByLabel('Dispersión (arcoíris)').fill('0.8');
    await page.getByLabel('Grosor').fill('0.3');
    await glass.getByRole('radio', { name: 'Poliedro' }).click();
    await expect(page.getByText('Sólido', { exact: true })).toBeVisible();
    // the index and the dispersion stay when the sphere becomes a polyhedron
    await expect(page.getByLabel('Índice de refracción')).toHaveValue('2');
    await page.getByLabel('Halo de luz (bloom)').fill('1');
    const halo = page.getByRole('radiogroup', { name: 'Forma del halo' });
    await halo.getByRole('radio', { name: 'Anamórfico' }).click();
    await expect(halo.getByRole('radio', { name: 'Anamórfico' })).toHaveAttribute('aria-checked', 'true');
    await page.getByLabel('Grano', { exact: true }).fill('0.7');
    const grain = page.getByRole('radiogroup', { name: 'Tipo de grano' });
    await grain.getByRole('radio', { name: 'Papel' }).click();
    await expect(page.getByText('Pliegues', { exact: true })).toBeVisible();
    await expect.poll(() => stageColours(page), { timeout: 30_000 }).toBeGreaterThan(3);
    // the brush: Movimiento → Pincel → Caligráfico, and its ink's bleeding
    await page.locator('.panel').getByRole('tab', { name: 'Movimiento' }).click();
    await page.locator('.panel .ctl', { hasText: 'Qué hace el cursor o el dedo' }).locator('button.pk').click();
    await page.getByRole('listbox').getByRole('option', { name: /^Pincel/ }).first().click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    const brush = page.getByRole('radiogroup', { name: 'Pincel' });
    await brush.getByRole('radio', { name: 'Caligráfico' }).click();
    await expect(page.getByLabel('Tinta que se corre')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

/** The new recipes, by space (the checks of recetas-todas.spec.ts, for these only). */
const NEW: Record<'arte' | 'media' | 'tipo', string[]> = {
  arte: ['Esfera de vidrio', 'Prisma de vidrio', 'Gema de vidrio teñido', 'Caligrafía en papel'],
  media: ['Bola de cristal', 'Destello de cine', 'Impreso en papel'],
  tipo: ['Bajo la lupa'],
};
const SPACE_NAME = { arte: 'Arte', media: 'Imagen', tipo: 'Texto' } as const;

for (const engine of ['webgl', 'basico'] as const) {
  test.describe(`acabados · recetas nuevas · ${engine === 'webgl' ? 'motor WebGL' : 'motor básico'}`, () => {
    test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
    for (const space of ['arte', 'media', 'tipo'] as const) {
      test(`${SPACE_NAME[space]}: abren desde Recetas en su espacio y dibujan`, async ({ page }) => {
        test.setTimeout(300_000);
        const errors = await openStudio(page, `${engine === 'basico' ? '?motor=basico' : ''}#space=${space}`);
        // the basic stage draws first: asking for a context before its engine took one would create the wrong one
        // (a WebGL stage is not readable outside its frame, and asking for webgl2 first gives it the type it takes)
        if (engine === 'basico') await drawn(page, '.stage canvas');
        expect(await contextOf(page, '.stage canvas')).toBe(engine === 'basico' ? '2d' : 'webgl2');
        if (space === 'media') { await dropPhoto(page); await settle(page); }
        await hideStageOverlays(page);
        await openRecipes(page);
        for (const name of NEW[space]) {
          const card = recipeCard(page, name);
          await card.scrollIntoViewIfNeeded();
          await card.click();
          await expect(card, name).toHaveAttribute('aria-pressed', 'true');
          await settle(page);
          await expect(page.locator('.panel .rx-line'), name).toHaveAccessibleName(`Recetas de ${SPACE_NAME[space]}: ${name}`);
          await expect(page.locator('.seedline'), name).toContainText(name);
          await expect.poll(() => stageColours(page), { message: `${name}: el escenario dibuja`, timeout: 30_000 }).toBeGreaterThan(3);
          await expect(page.locator('.toast').filter({ hasText: /no pudo/ }), name).toHaveCount(0);
          expect(errors, name).toEqual([]);
        }
      });
    }
  });
}

async function settle(page: Page) {
  await page.waitForFunction(() => { const c = document.querySelector('.stage canvas'); return !!c && !c.hasAttribute('data-busy'); }, undefined, { timeout: 60_000, polling: 100 });
}

test.describe('acabados · código exportado', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('una pieza con los cuatro acabados: la página exportada dibuja con WebGL 2 y con el motor básico', async ({ page, browser }) => {
    test.setTimeout(240_000);
    await openStudio(page, link(allFour()));
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Código' }).click();
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar página/ }).click()]);
    const file = test.info().outputPath('acabados.html');
    await d.saveAs(file);
    const noGl = await browser.browserType().launch({ args: ['--disable-3d-apis'] });
    try {
      for (const [name, b] of [['WebGL 2', browser], ['motor básico', noGl]] as const) {
        const other = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
        const errors: string[] = [];
        other.on('pageerror', e => errors.push(e.message));
        await other.goto('file://' + file);
        await expect.poll(() => canvasColours(other), { message: `acabados · ${name}: la pieza dibuja`, timeout: 30_000 }).toBeGreaterThan(3);
        expect(errors, name).toEqual([]);
        await other.context().close();
      }
    } finally { await noGl.close(); }
  });
});
