import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openStudio } from './helpers';

/**
 * The studio's own colour editor (src/studio/ui/color): palette stops and background, the square of light and
 * intensity, the hue strip, exact codes, ideas, the gallery by mood and «Fijar color» for the dice. Mouse, pen
 * and keyboard here; touch in color-editor-mobile.spec.ts. Recipes are read from what the studio stored.
 */

interface Col { stops: string[]; bg: string }
const current = (page: Page) => page.evaluate(() => new Promise<{ n: number; color: Col; edited: boolean; locks?: unknown } | null>(res => {
  const req = indexedDB.open('keyval-store');
  req.onsuccess = () => {
    const st = req.result.transaction('keyval').objectStore('keyval');
    const g = st.get('mt.v3.history');
    g.onsuccess = () => {
      const id = g.result?.ids?.[g.result.cursor];
      if (!id) { res(null); return; }
      const e = st.get('mt.v3.e:' + id);
      e.onsuccess = () => res({ n: g.result.ids.length, color: { stops: e.result.recipe.color.stops, bg: e.result.recipe.color.bg }, edited: e.result.edited });
    };
  };
  req.onerror = () => res(null);
}));
const colorNow = async (page: Page) => (await current(page))?.color;

async function openColor(page: Page) {
  if (await page.locator('.app.panel-off').count()) await page.getByRole('button', { name: 'Ajustes de la pieza' }).click();
  await page.getByRole('tab', { name: /^Color/ }).click();
  await expect(page.locator('.pe')).toBeVisible();
}

test.describe('editor de color propio', () => {
  test.describe.configure({ timeout: 180_000 });

  test('no queda ningún selector de color nativo en el laboratorio', async ({ page }) => {
    await openStudio(page);
    await openColor(page);
    await expect(page.locator('input[type=color]')).toHaveCount(0);
    await page.getByRole('tab', { name: /^Mensaje/ }).click();
    await expect(page.locator('input[type=color]')).toHaveCount(0);
    await page.keyboard.press('6');
    await expect(page.locator('input[type=color]')).toHaveCount(0);
  });

  test('teclado: el cuadro y la tira de tonos cambian el color en vivo, deshacer lo devuelve; el código acepta hex, rgb y hsl', async ({ page }) => {
    const errors = await openStudio(page);
    await openColor(page);
    const before = (await colorNow(page))!;
    await page.getByRole('button', { name: /^Color 2 de \d/ }).click();
    const area = page.getByRole('slider', { name: /^Luz e intensidad de Color 2/ });
    await expect(area).toBeVisible();
    const L0 = Number(await area.getAttribute('aria-valuenow'));
    await area.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(area).toHaveAttribute('aria-valuenow', String(L0 + 6));
    await expect.poll(async () => (await colorNow(page))?.stops[1]).not.toBe(before.stops[1]);
    await expect(page.locator('.seedline')).toContainText('editado');
    const hue = page.getByRole('slider', { name: /^Tono de Color 2/ });
    const h0 = Number(await hue.getAttribute('aria-valuenow'));
    await hue.focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect(hue).toHaveAttribute('aria-valuenow', String((h0 + 10) % 360));
    // undo takes it back (quick runs of keys are one step; on a slow machine the square and the strip may be two)
    await expect(async () => {
      if ((await colorNow(page))?.stops[1] !== before.stops[1]) await page.keyboard.press('Control+z');
      expect((await colorNow(page))?.stops[1]).toBe(before.stops[1]);
    }).toPass({ timeout: 20_000, intervals: [700, 700, 1000] });

    const code = page.getByRole('textbox', { name: /^Código de Color 2/ });
    await code.fill('rgb(0, 128, 255)');
    await code.press('Enter');
    await expect.poll(async () => (await colorNow(page))?.stops[1]).toBe('#0080ff');
    await code.fill('hsl(120, 100%, 50%)');
    await code.press('Enter');
    await expect.poll(async () => (await colorNow(page))?.stops[1]).toBe('#00ff00');
    await code.fill('hola');
    await code.press('Enter');
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.cp-desc')).toContainText('No reconozco ese código');
    // the numbers: light to 30 %
    const luz = page.getByRole('textbox', { name: 'Luz de Color 2 de 3' });
    await luz.fill('');
    await luz.fill('30');
    await luz.press('Enter');
    await expect(area).toHaveAttribute('aria-valuenow', '30');
    expect(errors).toEqual([]);
  });

  test('ratón y lápiz arrastran en el cuadro; el fondo también se edita', async ({ page }) => {
    await openStudio(page);
    await openColor(page);
    await page.getByRole('button', { name: /^Color 3 de \d/ }).click();
    const area = page.getByRole('slider', { name: /^Luz e intensidad de Color 3/ });
    await area.scrollIntoViewIfNeeded();
    const box = (await area.boundingBox())!;
    // mouse: to the dark, grey corner
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + 3, box.y + box.height * 0.8, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => Number(await area.getAttribute('aria-valuenow'))).toBeLessThan(25);
    // pen (a real pen pointer through the browser's input protocol): up to the light
    const cdp = await page.context().newCDPSession(page);
    const pen = (type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', x: number, y: number) =>
      cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen' });
    await pen('mousePressed', box.x + box.width * 0.2, box.y + box.height * 0.6);
    for (let k = 1; k <= 5; k++) await pen('mouseMoved', box.x + box.width * 0.2, box.y + box.height * (0.6 - k * 0.1));
    await pen('mouseReleased', box.x + box.width * 0.2, box.y + box.height * 0.1);
    await expect.poll(async () => Number(await area.getAttribute('aria-valuenow'))).toBeGreaterThan(80);

    await page.getByRole('button', { name: /^Fondo: #/ }).click();
    const code = page.getByRole('textbox', { name: /^Código de Fondo/ });
    await code.fill('#12345a');
    await code.press('Enter');
    await expect.poll(async () => (await colorNow(page))?.bg).toBe('#12345a');
  });

  test('añadir, mover y quitar colores; ideas; la biblioteca por ánimo; «Fijar color» al tirar el dado', async ({ page }) => {
    await openStudio(page);
    await openColor(page);
    const n0 = (await colorNow(page))!.stops.length;
    await page.getByRole('button', { name: 'Añadir un color' }).click();
    await expect.poll(async () => (await colorNow(page))?.stops.length).toBe(n0 + 1);
    await page.getByRole('button', { name: new RegExp(`^Color 1 de ${n0 + 1}`) }).click();
    const first = (await colorNow(page))!.stops[0];
    await page.getByRole('button', { name: `Mover Color 1 de ${n0 + 1} a la derecha` }).click();
    await expect.poll(async () => (await colorNow(page))?.stops[1]).toBe(first);
    await page.getByRole('button', { name: `Quitar Color 2 de ${n0 + 1}` }).click();
    await expect.poll(async () => (await colorNow(page))?.stops.length).toBe(n0);

    // an idea from the palette itself
    const was = (await colorNow(page))!;
    await page.getByRole('button', { name: /^Complementaria:/ }).click();
    await expect.poll(async () => JSON.stringify(await colorNow(page))).not.toBe(JSON.stringify(was));

    // the gallery by mood: a palette of «Energía»
    await page.getByRole('button', { name: 'Energía', exact: true }).click();
    await page.getByRole('button', { name: 'Paleta Voltaje' }).click();
    await expect.poll(async () => colorNow(page)).toEqual({ bg: '#080915', stops: ['#292155', '#b637c7', '#fc6c8c', '#fff4b7'] });
    await expect(page.getByRole('button', { name: 'Paleta Voltaje' })).toHaveAttribute('aria-pressed', 'true');

    // «Fijar color»: the dice change the rest and keep these colours
    await page.getByRole('button', { name: 'Fijar color al tirar el dado' }).click();
    await expect(page.getByRole('button', { name: 'Color fijo al tirar el dado' })).toHaveAttribute('aria-pressed', 'true');
    const n = (await current(page))!.n;
    await page.keyboard.press('r');
    await expect.poll(async () => (await current(page))?.n).toBe(n + 1);
    expect(await colorNow(page)).toEqual({ bg: '#080915', stops: ['#292155', '#b637c7', '#fc6c8c', '#fff4b7'] });
    // the dice's own lock shows it too
    await page.getByRole('button', { name: 'Ajustes del azar' }).click();
    await expect(page.locator('.locks button', { hasText: 'Color' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Color fijo al tirar el dado' }).click();
    await page.keyboard.press('r');
    await expect.poll(async () => (await current(page))?.n).toBe(n + 2);
    expect(await colorNow(page)).not.toEqual({ bg: '#080915', stops: ['#292155', '#b637c7', '#fc6c8c', '#fff4b7'] });
  });

  test('accesible: nombres, estados y sin fallos de axe en la sección de color con el editor abierto', async ({ page }) => {
    await openStudio(page);
    await openColor(page);
    await page.getByRole('button', { name: /^Color 1 de \d/ }).click();
    await page.locator('.cp-help summary').click();
    const res = await new AxeBuilder({ page }).include('.pe').analyze();
    expect(res.violations.map(v => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    // the tutorial explains tone, light and intensity with pictures
    await expect(page.locator('.cp-help dt')).toHaveText(['Tono', 'Luz', 'Intensidad']);
  });
});
