import { expect, test } from '@playwright/test';

test('la portada carga, muestra el motor y lleva al estudio', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('caracteres');
  await expect(page.locator('.hero-canvas')).toBeVisible();
  const before = await page.locator('[data-hero-seed]').textContent();
  await page.getByRole('button', { name: /Tirar el dado/ }).click();
  await expect(page.locator('[data-hero-seed]')).not.toHaveText(before ?? '');
  await page.getByRole('link', { name: /Abrir el estudio/ }).first().click();
  await expect(page).toHaveURL(/\/studio\/$/);
  await expect(page.locator('.deck')).toBeVisible();
  expect(errors).toEqual([]);
});

test('el espacio de piezas genera código que funciona', async ({ page, context }) => {
  await page.goto('/studio/#space=componentes');
  await page.getByRole('button', { name: /Máquina de escribir/ }).click();
  await expect(page.getByRole('heading', { name: 'Máquina de escribir' })).toBeVisible();
  const code = await page.getByLabel(/Código: HTML/).inputValue();
  const other = await context.newPage();
  const errors: string[] = [];
  other.on('pageerror', e => errors.push(e.message));
  await other.setContent(code);
  await other.waitForTimeout(1200);
  const text = await other.locator('.maquina').textContent();
  expect(text?.length).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

test('movimiento reducido: el estudio empieza en pausa', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/studio/');
  await expect(page.locator('.motion-note')).toBeVisible();
  await ctx.close();
});
