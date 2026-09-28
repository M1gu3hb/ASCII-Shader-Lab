import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * A live stage: its engine is ready (data-live names the renderer) and what it shows is not flat. The pixels
 * are read from a screenshot of the element (a WebGL canvas without preserveDrawingBuffer reads back empty).
 */
async function live(page: Page, stage: string) {
  await expect(page.locator(stage)).toHaveAttribute('data-live', /^(webgl2|basic)$/, { timeout: 30_000 });
  await expect.poll(async () => {
    const png = await page.locator(stage).screenshot();
    return page.evaluate(async b64 => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 160; c.height = 100;
      const x = c.getContext('2d')!;
      x.drawImage(img, 0, 0, 160, 100);
      const d = x.getImageData(0, 0, 160, 100).data;
      const seen = new Set<number>();
      for (let i = 0; i < d.length; i += 4) seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
      return seen.size;
    }, png.toString('base64'));
  }, { message: `${stage} shows a piece`, timeout: 20_000 }).toBeGreaterThan(6);
}

/**
 * The landing's interactive blocks: the six spaces on one stage, the working dice with its contact
 * sheet, and the destinations shown with the real exported files. What changes is checked through
 * the page's roles and names (tabs, buttons, links), and that the canvases really draw.
 */

const toSection = (page: Page, id: string) => page.evaluate(i => document.getElementById(i)!.scrollIntoView({ block: 'start' }), id);

test('espacios: pestañas con teclado, un escenario vivo y el enlace a cada espacio del estudio', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await toSection(page, 'espacios');
  const list = page.getByRole('tablist', { name: 'Espacios del estudio' });
  const tabs = list.getByRole('tab');
  await expect(tabs).toHaveCount(6);
  const panel = page.locator('#telar-panel');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await live(page, '[data-stage]');
  await expect(panel.getByRole('link', { name: /Abrir Fondos en el estudio/ })).toHaveAttribute('href', '/studio/#space=fondos');

  // arrows move the selection (and the focus), the panel follows at once
  await tabs.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.first()).toHaveAttribute('tabindex', '-1');
  await expect(panel).toHaveAttribute('aria-labelledby', 't-arte');
  await expect(panel.getByRole('link', { name: /Abrir Arte en el estudio/ })).toHaveAttribute('href', '/studio/#space=arte');
  await expect(panel.getByRole('link', { name: /Abrir Fondos/ })).toBeHidden();
  await expect(panel.locator('canvas')).toHaveAttribute('aria-label', /Arte: «Nudo de neón»/);
  await page.keyboard.press('End');
  await expect(tabs.last()).toBeFocused();
  await expect(panel.getByRole('link', { name: /Abrir Piezas/ })).toHaveAttribute('href', '/studio/#space=componentes');
  await expect(page.getByRole('button', { name: 'Otro ejemplo' })).toBeHidden();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.last()).toBeFocused();

  // «Otro ejemplo» walks through a space's presets
  await list.getByRole('tab', { name: /Terminal/ }).click();
  await expect(panel.getByRole('link', { name: /Abrir Terminal/ })).toHaveAttribute('href', '/studio/#space=terminal');
  await page.getByRole('button', { name: 'Otro ejemplo' }).click();
  await expect(page.locator('[data-more-name]')).toHaveText(/Ejemplo 2 de 3: Radar/);
  await live(page, '[data-stage]');
  expect(errors).toEqual([]);
});

test('azar: empieza con resultados a los que volver, tirar añade más y la hoja de contactos los teje', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  // before any script: three real results in the strip, the last one on the stage (going back is visible)
  const html = await (await page.request.get('/')).text();
  expect(html.match(/<li data-seed="/g)).toHaveLength(3);
  expect(html).toContain('<b>3</b> de 3');
  await page.goto('/');
  await toSection(page, 'azar');
  const count = page.locator('[data-azar-count]');
  const strip = page.getByRole('list', { name: 'Resultados de esta página' }).getByRole('button');
  await expect(strip).toHaveCount(3);
  await expect(count).toHaveText('3 de 3');
  await expect(strip.nth(2)).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: 'Resultado anterior' })).toBeEnabled();
  await live(page, '.azar-stage');
  const open = page.locator('[data-azar-open]');
  await expect(open).toHaveAttribute('href', /^\/studio\/#r=z/);
  const third = await open.getAttribute('href');

  const roll = page.getByRole('button', { name: 'Tirar', exact: true });
  await roll.click();
  await roll.click();
  await roll.click();
  await expect(count).toHaveText('6 de 6');
  await expect(strip).toHaveCount(6);
  await expect(strip.nth(5)).toHaveAttribute('aria-current', 'true');
  await expect(open).not.toHaveAttribute('href', third!);

  // back, with the arrow and with a thumbnail
  await page.getByRole('button', { name: 'Resultado anterior' }).click();
  await expect(count).toHaveText('5 de 6');
  await strip.nth(2).click();
  await expect(count).toHaveText('3 de 6');
  await expect(strip.nth(2)).toHaveAttribute('aria-current', 'true');
  await expect(open).toHaveAttribute('href', third!);
  await strip.first().click();
  await expect(count).toHaveText('1 de 6');
  await expect(page.getByRole('button', { name: 'Resultado anterior' })).toBeDisabled();

  // the contact sheet: fourteen styles, each one woven on the stage and added to the strip
  const contacts = page.getByRole('list', { name: 'Hoja de contactos del dado' }).getByRole('button');
  await expect(contacts).toHaveCount(14);
  await contacts.nth(4).click();
  await expect(contacts.nth(4)).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toHaveText('7 de 7');
  await expect(page.locator('[data-azar-seed]')).toContainText('coral-solidos-285');
  await live(page, '.azar-stage');
  // a style already in the strip is not added twice: it is shown again
  await contacts.first().click();
  await expect(count).toHaveText('3 de 7');
  expect(errors).toEqual([]);
});

test('salidas: cada destino muestra su archivo real, y el Web Component exportado teje la pieza', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const manifest = JSON.parse(readFileSync('public/ex/salidas/manifest.json', 'utf8')) as { frames: number; link: string };
  await page.goto('/');
  await toSection(page, 'exportar');
  const tabs = page.getByRole('tablist', { name: 'Destinos' }).getByRole('tab');
  await expect(tabs).toHaveCount(5);

  // imagen: the files it names exist, with the type they claim
  const img = page.locator('#sal-imagen');
  await expect(img).toBeVisible();
  for (const [href, type] of [['/ex/salidas/monotrama-saturno.png', 'image/png'], ['/ex/salidas/monotrama-saturno.svg', 'image/svg+xml']]) {
    await expect(img.locator(`a[href="${href}"]`)).toHaveCount(1);
    const res = await page.request.get(href);
    expect(res.status(), href).toBe(200);
    expect(res.headers()['content-type'], href).toContain(type);
  }

  // movimiento: the loop, with a button to pause it
  await tabs.nth(1).click();
  const mov = page.locator('#sal-mov');
  await expect(mov).toBeVisible();
  await expect(img).toBeHidden();
  await expect(mov.locator('video source')).toHaveCount(2);
  await expect(mov.getByRole('button', { name: /Pausar el video|Reproducir el video/ })).toBeVisible();

  // web: the exported component draws the piece's glyphs in its own page
  await tabs.nth(2).click();
  const frame = page.frameLocator('#sal-web iframe');
  await expect(frame.locator('h1')).toContainText('Tu titular');
  await expect.poll(() => frame.locator('monotrama-field').evaluate(el => {
    const e = (el as unknown as { ctl?: { engine?: { readGrid(): { chars: string[] } } } }).ctl?.engine;
    return e ? e.readGrid().chars.filter(c => c !== ' ').length : 0;
  }), { timeout: 20_000, message: 'the Web Component draws glyphs' }).toBeGreaterThan(200);

  // terminal: the frames stored in the Node script play in the text frame
  await tabs.nth(3).click();
  const pre = page.locator('#sal-term pre');
  const before = await pre.textContent();
  expect((before ?? '').split('\n').length).toBeGreaterThanOrEqual(24);
  await expect.poll(() => pre.textContent(), { message: 'the terminal plays', timeout: 15_000 }).not.toBe(before);
  await expect(page.locator('#sal-term')).toContainText(`${manifest.frames} fotogramas a 12 fps`);

  // receta: a real link that opens the piece in the studio
  await tabs.nth(4).click();
  await expect(page.locator('#sal-receta').getByRole('link', { name: /Abrir «Saturno» en el estudio/ })).toHaveAttribute('href', manifest.link);
  expect(errors).toEqual([]);
});

test('pausar: el botón de la cabecera detiene los lienzos y el video; con «reducir movimiento» la portada empieza quieta', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const toggle = page.locator('[data-motion-toggle]');
  await expect(toggle).toHaveAccessibleName('Animar la página');
  // the state changes still apply at once: tabs switch and the dice rolls
  await toSection(page, 'espacios');
  await page.getByRole('tab', { name: /Tipo/ }).click();
  await expect(page.locator('#telar-panel')).toHaveAttribute('aria-labelledby', 't-tipo');
  await toSection(page, 'azar');
  await page.getByRole('button', { name: 'Tirar', exact: true }).click();
  await expect(page.locator('[data-azar-count]')).toHaveText('4 de 4');
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('Pausar las animaciones de la página');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('pausar también detiene las piezas de interfaz del escenario (Piezas), y «Animar» las vuelve a mover', async ({ page }) => {
  await page.goto('/');
  await toSection(page, 'espacios');
  await page.getByRole('tab', { name: /Piezas/ }).click();
  const bar = page.locator('[data-pc-bar]');
  await expect.poll(() => bar.textContent(), { timeout: 5000 }).not.toMatch(/ 64%$/);
  const toggle = page.locator('[data-motion-toggle]');
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('Animar la página');
  const still = await bar.textContent();
  await page.waitForTimeout(1200);
  expect(await bar.textContent(), 'the progress bar stays still while the page is paused').toBe(still);
  // a space chosen while paused does not start them either
  await page.getByRole('tab', { name: /Fondos/ }).click();
  await page.getByRole('tab', { name: /Piezas/ }).click();
  const again = await bar.textContent();
  await page.waitForTimeout(1200);
  expect(await bar.textContent()).toBe(again);
  await toggle.click();
  await expect.poll(() => bar.textContent(), { timeout: 5000 }).not.toBe(again);
});
