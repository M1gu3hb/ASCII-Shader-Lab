import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { download, openStudio } from './helpers';
import { choose } from './clip';

/** Destination previews: the stage canvas sized to where the piece is going, and the export for it. */

const bar = (page: Page) => page.getByRole('radiogroup', { name: 'Vista' });
const pick = (page: Page, name: string) => bar(page).getByRole('radio', { name, exact: true }).click();
const canvasSize = (page: Page) => page.locator('.stage canvas').first().evaluate(c => [c.clientWidth, c.clientHeight]);

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
}

/** Mean brightness of an image in a cols×rows grid (decoded in the page). */
function lumaGrid(page: Page, png: Buffer, cols: number, rows: number): Promise<number[]> {
  return page.evaluate(async ([b64, c, r]) => {
    const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
    const cv = new OffscreenCanvas(c * 8, r * 8);
    const x = cv.getContext('2d')!;
    x.drawImage(bmp, 0, 0, c * 8, r * 8);
    const d = x.getImageData(0, 0, c * 8, r * 8).data;
    const out = new Array(c * r).fill(0);
    for (let y = 0; y < r * 8; y++) for (let xx = 0; xx < c * 8; xx++) {
      const i = (y * c * 8 + xx) * 4;
      out[Math.floor(y / 8) * c + Math.floor(xx / 8)] += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255 / 64;
    }
    return out;
  }, [png.toString('base64'), cols, rows] as const);
}
/** Pearson correlation: how well two pictures line up, whatever their overall brightness. */
function correlation(a: number[], b: number[]) {
  const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
  let ab = 0, aa = 0, bb = 0;
  a.forEach((v, i) => { ab += (v - ma) * (b[i] - mb); aa += (v - ma) ** 2; bb += (b[i] - mb) ** 2; });
  return ab / Math.sqrt(aa * bb || 1);
}

/** Pauses the piece from the top bar and waits until it is paused. */
async function pause(page: Page) {
  await page.getByRole('button', { name: 'Pausar animación' }).click();
  await expect(page.getByRole('button', { name: 'Reproducir animación' })).toBeVisible();
}

test.describe('vistas de destino', () => {
  test('cada vista dimensiona el lienzo real como su destino y lleva a su exportación', async ({ page }) => {
    const errors = await openStudio(page);
    await expect(bar(page).getByRole('radio', { name: 'Libre' })).toHaveAttribute('aria-checked', 'true');
    const free = await canvasSize(page);

    // Fondo web: a page over the piece, and an estimate that says it is one
    await pick(page, 'Fondo web');
    await expect(page.locator('.preview-content .pc-h')).toBeVisible();
    await expect(page.locator('.vbar-what')).toBeVisible();
    await expect(page.locator('.vbar-what')).toContainText('Tu pieza como fondo de una página');
    const est = page.locator('.vbar .legib-line');
    await expect(est).toContainText('Legibilidad (estimación)');
    await expect(est.locator('.legib-say')).toHaveText(/^(Se lee bien|Cuesta leer .+|Se lee con esfuerzo .+)$/, { timeout: 30_000 });
    await page.getByRole('group', { name: 'Texto' }).getByRole('button', { name: 'Oscuro' }).click();
    await expect(page.locator('.preview-content .pc-h')).toHaveCSS('color', 'rgb(17, 17, 17)');
    await page.getByRole('group', { name: 'Texto' }).getByRole('button', { name: 'Claro' }).click();
    await expect(page.locator('.preview-content .pc-h')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await page.getByRole('button', { name: 'Exportar para este destino' }).click();
    await expect(page.getByRole('tab', { name: 'Código' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');

    // Tarjeta: the first card's media slot is the canvas, 360×225
    await pick(page, 'Tarjeta');
    await expect.poll(() => canvasSize(page)).toEqual([360, 225]);
    await expect(page.locator('.vw-card').first().locator('canvas')).toHaveCount(1);
    await expect(page.locator('.vw-card')).toHaveCount(3);
    await page.getByRole('button', { name: 'Exportar para este destino' }).click();
    await expect(page.getByRole('tab', { name: 'Imagen' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#ex-size')).toHaveAttribute('data-value', 'v2');
    await expect(page.getByText('Resultado: 720×450 px.')).toBeVisible();
    await page.keyboard.press('Escape');

    // Historia / Reel 9:16: a clean frame; the bands where app interfaces usually sit only on request
    await pick(page, 'Historia / Reel 9:16');
    await expect.poll(async () => { const [w, h] = await canvasSize(page); return Math.abs(w / h - 9 / 16) < 1e-9 && Number.isInteger(w); }).toBe(true);
    await expect(page.locator('.vw-safe')).toHaveCount(0);
    await page.locator('.vbar-switch').getByText(/Zonas de interfaz/).click();
    await expect(page.locator('.vw-safe')).toHaveCount(3);
    await expect(page.locator('.vw-safe').first()).toContainText('interfaz de la app');
    await page.locator('.vbar-switch').getByText('Pie de texto de ejemplo').click();
    await expect(page.getByRole('switch', { name: 'Pie de texto de ejemplo' })).toBeChecked();
    await expect(page.locator('.vw-cap')).toContainText('@tu_cuenta');
    await page.getByRole('button', { name: 'Exportar para este destino' }).click();
    await expect(page.getByRole('tab', { name: 'Video y GIF' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#v-size').or(page.getByText(/no tiene WebCodecs/))).toBeVisible();
    if (await page.locator('#v-size').count()) await expect(page.locator('#v-size')).toHaveAttribute('data-value', 'story');
    await page.keyboard.press('Escape');

    // README: an image 2:1 at the README's width and a text block of 80 columns
    await pick(page, 'README');
    await expect.poll(async () => { const [w, h] = await canvasSize(page); return w <= 800 && h === Math.round(w / 2); }).toBe(true);
    const code = page.locator('.gh-pre code');
    await expect(code).not.toHaveText(/Tejiendo/, { timeout: 30_000 });
    const lines = ((await code.textContent()) ?? '').split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...lines.map(l => [...l].length))).toBe(80);
    await expect(code).toHaveCSS('font-size', '12px');
    await expect(code).toHaveCSS('font-variant-ligatures', 'none');
    await page.getByRole('button', { name: 'Exportar GIF para README' }).click();
    await expect(page.getByRole('tab', { name: 'Video y GIF' })).toHaveAttribute('aria-selected', 'true');
    const [w] = await canvasSize(page);
    await expect(page.getByRole('radiogroup', { name: 'Ancho del GIF' }).getByRole('radio', { name: `${[320, 480, 640, 800].find(g => g >= w)} px` })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    // Terminal: exactly cols × rows cells of the text export's size
    await pick(page, 'Terminal');
    await expect(page.locator('.term-bar span')).toContainText('80×24');
    const [tw, th] = await canvasSize(page);
    expect(tw % 80).toBe(0);
    expect(th % 24).toBe(0);
    await choose(page, page.getByRole('combobox', { name: 'Tamaño', exact: true }), '100×30');
    await expect(page.locator('.term-bar span')).toContainText('100×30');
    await expect.poll(async () => (await canvasSize(page))[0] % 100).toBe(0);
    await page.getByRole('button', { name: 'Exportar para este destino' }).click();
    await expect(page.getByRole('tab', { name: 'Texto y terminal' })).toHaveAttribute('aria-selected', 'true');
    const sheet = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
    await expect(sheet.getByLabel('Columnas')).toHaveValue('100');
    await expect(sheet.getByLabel('Filas')).toHaveValue('30');
    await page.keyboard.press('Escape');
    await noHorizontalOverflow(page);

    // remembered per space: another space keeps its own, a reload keeps both
    await page.getByRole('button', { name: 'Fondos', exact: true }).click();
    await expect(bar(page).getByRole('radio', { name: 'Libre' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Arte', exact: true }).click();
    await expect(bar(page).getByRole('radio', { name: 'Terminal' })).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(700);
    await page.reload();
    await expect(bar(page).getByRole('radio', { name: 'Terminal' })).toHaveAttribute('aria-checked', 'true');
    await pick(page, 'Libre');
    await expect.poll(() => canvasSize(page)).toEqual(free);
    // «Piezas» has no stage and no view
    await page.getByRole('button', { name: 'Componentes', exact: true }).click();
    await expect(bar(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('README: el bloque de texto es el TXT exportado del mismo fotograma, y se copia como Markdown', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openStudio(page);
    // paused: the frame stays the same (the bar's button, not Space: a key pressed as the studio appears can come
    // before its shortcuts, and then the piece moves between the block and the export)
    await pause(page);
    await pick(page, 'README');
    const code = page.locator('.gh-pre code');
    await expect(code).not.toHaveText(/Tejiendo/, { timeout: 30_000 });
    const text = (await code.textContent()) ?? '';
    const rows = text.split('\n').length;

    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Texto y terminal' }).click();
    const sheet = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
    await sheet.getByLabel('Columnas').fill('80');
    await sheet.getByLabel('Filas').fill(String(rows));
    await expect(page.locator('.ansi-pre')).toBeVisible();
    const txt = await download(page, () => page.getByRole('button', { name: '.txt' }).click());
    expect(readFileSync(txt.path, 'utf8').replace(/\n+$/, '')).toBe(text);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Copiar bloque Markdown' }).click();
    await expect(page.locator('.toast').last()).toContainText('Bloque Markdown copiado');
    const md = await page.evaluate(() => navigator.clipboard.readText());
    // the fence grows when the art itself contains backticks (as markdownBlock does)
    const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map(m => m.length + 1)));
    expect(md).toBe(`${fence}text\n${text}\n${fence}\n`);
  });

  test('README avisa cuando el juego de caracteres no es ASCII', async ({ page }) => {
    await openStudio(page);
    await page.getByRole('tab', { name: 'Glifos' }).click();
    await choose(page, page.getByRole('combobox', { name: 'Caracteres', exact: true }), /^Bloques/);
    await pick(page, 'README');
    await expect(page.getByRole('note').filter({ hasText: 'Caracteres fuera de ASCII' })).toBeVisible();
    await expect(page.locator('.vbar-warn')).toContainText('░');
    await choose(page, page.getByRole('combobox', { name: 'Caracteres', exact: true }), /^Clásico/);
    await expect(page.locator('.vbar-warn')).toHaveCount(0, { timeout: 20_000 });
  });

  test('Historia / Reel 9:16: el marco es exactamente lo que compone la exportación 1080×1920', async ({ page }) => {
    await openStudio(page);
    await pause(page);
    await pick(page, 'Historia / Reel 9:16');
    await expect.poll(async () => { const [w, h] = await canvasSize(page); return w / h; }).toBeCloseTo(9 / 16, 6);
    await page.waitForTimeout(800);
    // the live canvas as shown, without the app-interface bands (or a toast) drawn over it
    await page.addStyleTag({ content: '.vw-safe, .toasts { display: none !important; }' });
    const live = await page.locator('.stage canvas').first().screenshot();

    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Imagen' }).click();
    await choose(page, '#ex-size', /^1080×1920/);
    await expect(page.getByText('Resultado: 1080×1920 px.')).toBeVisible();
    const story = await download(page, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
    const png = readFileSync(story.path);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);
    await choose(page, '#ex-size', /^1080×1080/);
    const square = readFileSync((await download(page, () => page.getByRole('button', { name: 'Descargar imagen' }).click())).path);

    const [a, b, c] = await Promise.all([lumaGrid(page, live, 9, 16), lumaGrid(page, png, 9, 16), lumaGrid(page, square, 9, 16)]);
    const same = correlation(a, b), other = correlation(a, c);
    // same composition: the coarse picture lines up; a square export reframes it and does not
    expect(same).toBeGreaterThan(0.9);
    expect(same).toBeGreaterThan(other + 0.15);
  });

  test('con «reducir movimiento» la pieza empieza en pausa, las vistas funcionan y la interfaz no anima', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 860 } });
    const page = await ctx.newPage();
    await page.goto('/studio/');
    const welcome = page.locator('dialog.welcome[open]');
    await expect(welcome).toBeVisible();
    expect(await welcome.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Movimiento reducido activo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reproducir animación' })).toBeVisible();
    await pick(page, 'Historia / Reel 9:16');
    await expect.poll(async () => { const [w, h] = await canvasSize(page); return w / h; }).toBeCloseTo(9 / 16, 6);
    for (const sel of ['.panel', '.vbar', '.stage-wrap']) {
      expect(await page.locator(sel).first().evaluate(el => getComputedStyle(el).transitionDuration.split(',').every(d => parseFloat(d) === 0))).toBe(true);
    }
    await ctx.close();
  });
});
