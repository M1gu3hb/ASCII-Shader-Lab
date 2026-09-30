import { readFileSync } from 'node:fs';
import { devices, expect, test, type Page } from '@playwright/test';
import { download, openStudio } from './helpers';

/** Guided paths: the welcome, the three paths to a file, comparisons and «ver original». */

const welcome = (page: Page) => page.getByRole('dialog', { name: '¿Qué quieres hacer?' });
const guide = (page: Page) => page.locator('aside.guide-panel');
const stepTitle = (page: Page) => page.locator('#guide-title');
const next = (page: Page) => guide(page).getByRole('button', { name: 'Siguiente' });

/** Presses Tab until the focused element's accessible text matches (keyboard only, no clicks). */
async function tabTo(page: Page, name: RegExp, max = 40) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a) return '';
      const by = a.getAttribute('aria-labelledby');
      return (a.getAttribute('aria-label') || (by && document.getElementById(by.split(' ')[0])?.textContent) || a.textContent || '').trim();
    });
    if (name.test(label)) return;
  }
  throw new Error(`Tab never reached ${name}`);
}

/** Mean brightness (0..1) of the stage as shown on screen (decoded in the page from a screenshot). */
async function stageLuma(page: Page) {
  const png = await page.locator('.stage canvas').first().screenshot();
  return page.evaluate(async b64 => {
    const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
    const c = new OffscreenCanvas(64, 40);
    const x = c.getContext('2d')!;
    x.drawImage(bmp, 0, 0, 64, 40);
    const d = x.getImageData(0, 0, 64, 40).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    return s / (d.length / 4);
  }, png.toString('base64'));
}

async function noHorizontalOverflow(page: Page) {
  const o = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth }));
  expect(o.doc).toBeLessThanOrEqual(o.vw);
}

test.describe('bienvenida', () => {
  test('la primera visita pregunta qué quieres hacer; recargar o abrir un enlace no', async ({ page, browser }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/studio/');
    await expect(welcome(page)).toBeVisible();
    for (const name of ['Convertir una foto en ASCII', 'Crear un fondo para tu web', 'Animar una palabra', 'Explorar libremente']) {
      await expect(welcome(page).getByRole('button', { name })).toBeVisible();
    }
    // focus starts on the first choice and Tab stays inside the dialog
    await expect(welcome(page).getByRole('button', { name: 'Convertir una foto en ASCII' })).toBeFocused();
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('dialog.welcome'))).toBe(true);
    }
    await welcome(page).getByRole('button', { name: 'Cerrar' }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(welcome(page).getByRole('button', { name: 'Explorar libremente' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(welcome(page).getByRole('button', { name: 'Cerrar' })).toBeFocused();
    // the studio behind is inert: the dice key does nothing
    await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('1/1');
    // Escape closes it and leaves the dice hint; nothing was added to the history
    await page.keyboard.press('Escape');
    await expect(welcome(page)).toBeHidden();
    await expect(page.locator('.toast')).toContainText('Azar');
    await expect(page.locator('.seedline')).toContainText('1/1');

    // a second visit goes straight to the studio
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.locator('.seedline')).toBeVisible();
    await expect(page.locator('dialog.welcome[open]')).toHaveCount(0);

    // a shared link opens its piece, not the welcome (a brand-new browser)
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Receta' }).click();
    await expect(page.getByRole('textbox', { name: 'Enlace' })).toHaveValue(/#r=/);
    const link = await page.getByRole('textbox', { name: 'Enlace' }).inputValue();
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await other.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(other.locator('.seedline')).toContainText('Desde un enlace');
    await expect(other.locator('dialog.welcome[open]')).toHaveCount(0);
    await ctx.close();
    expect(errors).toEqual([]);
  });

  test('«Explorar libremente» tira el dado; «Guías», G y la ayuda la vuelven a abrir; Escape devuelve el foco', async ({ page }) => {
    await page.goto('/studio/');
    await welcome(page).getByRole('button', { name: 'Explorar libremente' }).click();
    await expect(welcome(page)).toBeHidden();
    await expect(page.locator('.seedline')).toContainText('2/2');

    const btn = page.getByRole('button', { name: 'Guías' });
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(welcome(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(welcome(page)).toBeHidden();
    await expect(btn).toBeFocused();

    await page.keyboard.press('g');
    await expect(welcome(page)).toBeVisible();
    await welcome(page).getByRole('button', { name: 'Cerrar' }).click();
    await expect(welcome(page)).toBeHidden();

    await page.keyboard.press('?');
    await page.getByRole('dialog', { name: 'Atajos de teclado' }).getByRole('button', { name: 'Abrir las guías' }).click();
    await expect(welcome(page)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Atajos de teclado' })).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('.seedline')).toContainText('2/2');
  });
});

test.describe('caminos', () => {
  test('foto, sólo con el teclado: la foto de ejemplo hasta un PNG y el texto copiado', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/studio/');
    await expect(welcome(page)).toBeVisible();
    await expect(welcome(page).getByRole('button', { name: 'Convertir una foto en ASCII' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(welcome(page)).toBeHidden();
    await expect(stepTitle(page)).toContainText('Paso 1 de 4');
    await expect(stepTitle(page)).toBeFocused();
    await expect(next(page)).toBeDisabled();

    // 1 · the example photo goes through the normal file handling and the guide moves on
    await tabTo(page, /Usar una foto de ejemplo/);
    await page.keyboard.press('Enter');
    await expect(stepTitle(page)).toContainText('Paso 2 de 4');
    await expect(stepTitle(page)).toContainText('Elige un estilo');
    await expect(page.locator('.toast').first()).toContainText('se queda en este navegador');

    // 2 · six looks rendered with the photo; choosing one is a new history entry
    const tiles = guide(page).locator('.gs-tile');
    await expect(tiles).toHaveCount(6);
    await expect(tiles.first()).toHaveAttribute('style', /background-image/, { timeout: 60_000 });
    const before = await page.locator('.thumb').count();
    await tabTo(page, /^Periódico/);
    await page.keyboard.press('Enter');
    await expect(page.locator('.seedline .ell')).toHaveText('Periódico');
    await expect(page.locator('.thumb')).toHaveCount(before + 1);
    await expect(guide(page).getByRole('button', { name: 'Periódico' })).toHaveAttribute('aria-pressed', 'true');
    await tabTo(page, /^Siguiente$/);
    await page.keyboard.press('Enter');

    // 3 · detail, contrast and background: each a normal edit
    await expect(stepTitle(page)).toContainText('Ajusta');
    await tabTo(page, /^Fino/);
    await page.keyboard.press('Enter');
    await expect(guide(page).getByRole('button', { name: /^Fino/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.seedline')).toContainText('editado');
    await tabTo(page, /^Oscuro$/);
    await page.keyboard.press('Enter');
    await expect(guide(page).getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Control+z');
    await expect(guide(page).getByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'true');
    await tabTo(page, /^Siguiente$/);
    await page.keyboard.press('Enter');

    // 4 · a high-resolution PNG named after the photo, and the text on the clipboard
    await expect(stepTitle(page)).toContainText('Llévatela');
    await tabTo(page, /Descargar PNG/);
    const png = await download(page, () => page.keyboard.press('Enter'));
    expect(png.name).toMatch(/^glyphos-paisaje-de-ejemplo-\d+x\d+\.png$/);
    const bytes = readFileSync(png.path);
    expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
    const [w, h] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    const view = await page.locator('.stage canvas').first().boundingBox();
    expect(Math.abs(w - view!.width * 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(h - view!.height * 2)).toBeLessThanOrEqual(2);

    await tabTo(page, /Copiar como texto/);
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast').last()).toContainText('Texto copiado');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    const lines = text.replace(/\n$/, '').split('\n');
    expect(lines.length).toBeGreaterThan(20);
    expect(Math.max(...lines.map(l => l.length))).toBe(100);
    expect(text.trim().length).toBeGreaterThan(500);

    // leaving through «Ver todos los controles» keeps the piece and opens the full panel
    await tabTo(page, /Ver todos los controles/);
    await page.keyboard.press('Enter');
    await expect(guide(page)).toHaveCount(0);
    await expect(page.getByRole('tablist', { name: 'Secciones' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Color' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Color' })).toBeFocused();
    await page.getByRole('tab', { name: 'Origen' }).click();
    await expect(page.locator('.panel').getByText('paisaje-de-ejemplo.png')).toBeVisible();
    await expect(page.locator('.seedline .ell')).toHaveText('Periódico');
    expect(errors).toEqual([]);
  });

  test('fondo desde /studio/?camino=fondo: estilo, presencia legible, movimiento y código copiado', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/studio/?camino=fondo');
    await expect(stepTitle(page)).toContainText('Paso 1 de 4');
    await expect(page).toHaveURL(/\/studio\/$/);
    await expect(page.locator('dialog.welcome[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Fondos', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // 1 · a style, or another one from the dice
    await guide(page).getByRole('button', { name: 'Marea' }).click();
    await expect(page.locator('.seedline .ell')).toHaveText('Marea');
    const n = await page.locator('.thumb').count();
    await guide(page).getByRole('button', { name: 'Otro al azar' }).click();
    await expect(page.locator('.thumb')).toHaveCount(n + 1);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.seedline .ell')).toHaveText('Marea');
    await next(page).click();

    // 2 · Presencia with the test content on and a legibility estimate
    await expect(stepTitle(page)).toContainText('Que se lea el contenido');
    await expect(page.locator('.preview-content .pc-h')).toBeVisible();
    const slider = guide(page).getByRole('slider', { name: 'Presencia' });
    // the estimate samples the moving stage several times: poll the worst share of background too close
    // to the text colour, around the letters (per mille)
    const line = guide(page).locator('.legib-line');
    const clash = async () => { const v = await line.getAttribute('data-clash'); return v == null ? NaN : +v; };
    await expect.poll(clash, { timeout: 30_000 }).toBeGreaterThanOrEqual(0);
    await slider.fill('1');
    await expect(guide(page).locator('output')).toHaveText('protagonista');
    await expect.poll(clash, { timeout: 30_000 }).toBeGreaterThanOrEqual(0);
    await page.waitForTimeout(3000); // fresh samples of the loud version
    const loud = await clash();
    await slider.fill('0');
    await expect(guide(page).locator('output')).toHaveText('sutil');
    await expect.poll(async () => { const c = await clash(); return Number.isNaN(c) ? Infinity : c; }, { timeout: 30_000 }).toBeLessThanOrEqual(loud);
    await expect(guide(page).locator('.legib-say')).toHaveText(/^(Se lee bien|Cuesta leer .+|Se lee con esfuerzo .+)$/);
    await expect(guide(page).getByText(/Es una estimación/)).toBeVisible();
    // each drag is one undoable edit
    await expect(page.locator('.seedline')).toContainText('editado');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect(page.locator('.seedline')).not.toContainText('editado');
    await expect(guide(page).locator('output')).toHaveText('equilibrada');
    await slider.fill('0.2');
    await next(page).click();

    // 3 · speed and the cursor
    await expect(stepTitle(page)).toContainText('Movimiento');
    await guide(page).getByRole('button', { name: 'Lento' }).click();
    await expect(guide(page).getByRole('button', { name: 'Lento' })).toHaveAttribute('aria-pressed', 'true');
    const cursor = guide(page).getByRole('switch', { name: 'Reacciona al cursor' });
    await guide(page).getByText('Reacciona al cursor').click();
    await expect(cursor).not.toBeChecked();
    await next(page).click();

    // 4 · the code, copied; the test page, downloaded
    await expect(stepTitle(page)).toContainText('Llévalo a tu web');
    await expect(guide(page).getByRole('textbox', { name: /Código/ })).toHaveValue(/Glyphos\.mount/);
    await guide(page).getByRole('button', { name: 'Copiar el código' }).click();
    await expect(page.locator('.toast').last()).toContainText('Código copiado');
    const code = await page.evaluate(() => navigator.clipboard.readText());
    expect(code).toContain('class="glyphos"');
    expect(code).toContain('"interactive":false');
    const test1 = await download(page, () => guide(page).getByRole('button', { name: /página de prueba/ }).click());
    expect(test1.name).toMatch(/-prueba\.html$/);
    expect(readFileSync(test1.path, 'utf8')).toContain('Glyphos.mount');
    await guide(page).getByRole('button', { name: 'Terminar' }).click();
    await expect(guide(page)).toHaveCount(0);
    await expect(page.locator('.toast').last()).toContainText('Listo');
    expect(errors).toEqual([]);
  });

  test('palabra desde /studio/?camino=palabra: una palabra propia hasta un GIF en bucle', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/studio/?camino=palabra');
    await expect(stepTitle(page)).toContainText('Escribe tu palabra');
    const field = guide(page).getByRole('textbox', { name: 'Tu palabra' });
    await field.fill('');
    await expect(next(page)).toBeDisabled();
    await expect(guide(page).getByText('Escribe tu palabra para seguir.')).toBeVisible();
    await field.fill('Faro del sur, luz que gira sin parar');
    await expect(field).toHaveValue('Faro del sur, luz que gi');
    await field.fill('FARO');
    await field.press('Enter');

    await expect(stepTitle(page)).toContainText('Estilo');
    await expect(guide(page).locator('.gs-tile')).toHaveCount(5);
    await guide(page).getByRole('button', { name: 'Neón' }).click();
    await expect(page.locator('.seedline .ell')).toHaveText('Neón');
    await next(page).click();

    await expect(stepTitle(page)).toContainText('Ritmo y tamaño');
    await expect(guide(page).getByRole('switch', { name: 'Bucle perfecto' })).toBeChecked();
    await guide(page).getByRole('button', { name: 'Vivo' }).click();
    await expect(guide(page).getByText(/durarán [34]\.\d s/)).toBeVisible();
    await next(page).click();

    await expect(stepTitle(page)).toContainText('Llévatela');
    // video only when this browser can encode it; otherwise it says why
    const video = guide(page).locator('section', { has: page.getByRole('heading', { name: 'Video' }) });
    await expect(video.getByRole('button', { name: /Descargar (MP4|WebM)/ }).or(video.locator('.warn')).first()).toBeVisible();
    const gif = await download(page, () => guide(page).getByRole('button', { name: 'Descargar GIF' }).click());
    expect(gif.name).toBe('glyphos-faro.gif');
    const bytes = readFileSync(gif.path);
    expect(bytes.subarray(0, 6).toString('latin1')).toBe('GIF89a');
    expect(bytes.readUInt16LE(6)).toBe(640);
    expect(bytes.length).toBeGreaterThan(20_000);
    expect(errors).toEqual([]);
  });

  test('«Ver todos los controles» sale de la guía con la pieza y el panel completo abierto', async ({ page }) => {
    await page.goto('/studio/?camino=fondo');
    await expect(stepTitle(page)).toContainText('Paso 1 de 4');
    const piece = await page.locator('.seedline .ell').textContent();
    await guide(page).getByRole('button', { name: 'Ver todos los controles' }).click();
    await expect(guide(page)).toHaveCount(0);
    await expect(page.locator('.panel')).toBeInViewport();
    await expect(page.getByRole('tab', { name: 'Forma' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.seedline .ell')).toHaveText(piece ?? '');
    // and the guide comes back from «Guías»
    await page.getByRole('button', { name: 'Guías' }).click();
    await welcome(page).getByRole('button', { name: 'Animar una palabra' }).click();
    await expect(stepTitle(page)).toContainText('Escribe tu palabra');
    await expect(page.getByRole('button', { name: 'Texto', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // going to another space lets the guide step aside, with the piece and the panel
    await page.getByRole('button', { name: 'Arte', exact: true }).click();
    await expect(guide(page)).toHaveCount(0);
    await expect(page.getByRole('tablist', { name: 'Secciones' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guías' })).not.toHaveAttribute('data-on');
  });
});

test.describe('comparar', () => {
  test('«ver original» muestra la pieza sin editar mientras se mantiene, sin tocar el historial', async ({ page }) => {
    await openStudio(page);
    await page.keyboard.press(' '); // pause: the frame stays still
    await page.waitForTimeout(600);
    const dark = await stageLuma(page);
    await page.getByRole('tab', { name: 'Color' }).click();
    await page.locator('.palettes').getByRole('button', { name: 'Papel' }).click();
    await expect(page.locator('.seedline')).toContainText('editado');
    await page.waitForTimeout(600);
    const light = await stageLuma(page);
    expect(light).toBeGreaterThan(dark + 0.3);

    const hold = page.getByRole('button', { name: 'Ver el original mientras lo mantienes pulsado' });
    await hold.hover();
    await page.mouse.down();
    await expect(hold).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(600);
    expect(await stageLuma(page)).toBeLessThan(dark + 0.1);
    await page.mouse.up();
    await expect(hold).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(600);
    expect(await stageLuma(page)).toBeGreaterThan(light - 0.1);

    // the keyboard: hold Space
    await hold.focus();
    await page.keyboard.down(' ');
    await expect(hold).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(600);
    expect(await stageLuma(page)).toBeLessThan(dark + 0.1);
    await page.keyboard.up(' ');
    await expect(hold).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(600);
    expect(await stageLuma(page)).toBeGreaterThan(light - 0.1);

    // nothing was added to the history, and the edit is still there
    await expect(page.locator('.seedline')).toContainText('1/1');
    await expect(page.locator('.seedline')).toContainText('editado');
  });

  test('«?» en Glifos: tres tamaños de celda y los juegos de caracteres para comparar, aplicables con un clic', async ({ page }) => {
    await openStudio(page);
    await page.getByRole('tab', { name: 'Glifos' }).click();
    const panel = page.locator('.panel');
    await panel.getByRole('button', { name: 'Qué es «Tamaño de celda»' }).click();
    const strip = panel.getByRole('group', { name: 'Tamaños de celda' });
    await expect(strip.getByRole('button')).toHaveCount(3);
    for (const b of await strip.getByRole('button').all()) await expect(b).toHaveAttribute('style', /background-image/, { timeout: 60_000 });
    await strip.getByRole('button', { name: /^Fino/ }).click();
    await expect(panel.getByLabel('Tamaño de celda')).toHaveValue('6');
    await expect(strip.getByRole('button', { name: /^Fino/ })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Control+z');
    await expect(panel.getByLabel('Tamaño de celda')).not.toHaveValue('6');

    await panel.getByRole('button', { name: 'Qué es «Caracteres»' }).click();
    const sets = panel.getByRole('group', { name: 'Juegos de caracteres' });
    await sets.getByRole('button', { name: /Bloques/ }).click();
    await expect(panel.getByRole('combobox', { name: 'Caracteres', exact: true })).toHaveAttribute('data-value', 'bloques');
    await expect(sets.getByRole('button', { name: /Bloques/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('en el teléfono', () => {
  test('la bienvenida y la guía caben en 390 px y se usan con el pulgar', async ({ browser }) => {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await ctx.newPage();
    await page.goto('/studio/');
    await expect(welcome(page)).toBeVisible();
    const box = (await welcome(page).boundingBox())!;
    const vw = page.viewportSize()!.width;
    expect(box.width).toBeGreaterThanOrEqual(vw - 1);
    await noHorizontalOverflow(page);
    await welcome(page).getByRole('button', { name: 'Convertir una foto en ASCII' }).tap();
    await expect(guide(page)).toBeInViewport();
    await expect(stepTitle(page)).toContainText('Paso 1 de 4');
    await guide(page).getByRole('button', { name: 'Usar una foto de ejemplo' }).tap();
    await expect(stepTitle(page)).toContainText('Elige un estilo');
    for (const b of ['Atrás', 'Siguiente']) {
      const r = (await guide(page).getByRole('button', { name: b }).boundingBox())!;
      expect(r.height).toBeGreaterThanOrEqual(40);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(vw);
    }
    const tiles = guide(page).locator('.gs-tile');
    await expect(tiles).toHaveCount(6);
    await tiles.nth(2).tap();
    await expect(tiles.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await next(page).tap();
    await expect(stepTitle(page)).toContainText('Ajusta');
    const over = await guide(page).evaluate(el => [...el.querySelectorAll<HTMLElement>('*')].filter(x => x.scrollWidth > x.clientWidth + 1 && getComputedStyle(x).overflowX === 'visible').length);
    expect(over).toBe(0);
    await noHorizontalOverflow(page);
    await next(page).tap();
    await expect(guide(page).getByRole('button', { name: /Descargar PNG/ })).toBeInViewport();
    await guide(page).getByRole('button', { name: 'Cerrar la guía' }).tap();
    await expect(guide(page)).toHaveCount(0);
    await expect(page.locator('.deck')).toBeInViewport();
    await ctx.close();
  });
});
