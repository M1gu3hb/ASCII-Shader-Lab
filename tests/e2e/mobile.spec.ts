import { expect, test } from '@playwright/test';
import { dismissWelcome } from './helpers';

test('en móvil: el dado, el historial y el panel funcionan con el pulgar', async ({ page }) => {
  await page.goto('/studio/');
  await expect(page.locator('.deck')).toBeVisible();
  await dismissWelcome(page);
  await expect(page.locator('.panel')).not.toBeInViewport();
  await page.locator('.act.dice').tap();
  await expect(page.locator('.seedline')).toContainText('2/2');
  await page.locator('.deck .nav button').first().tap();
  await expect(page.locator('.seedline')).toContainText('1/2');
  await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
  await expect(page.locator('.panel')).toBeInViewport();
  await page.getByRole('button', { name: 'Cerrar ajustes' }).tap();
  await expect(page.locator('.deck')).toBeVisible();
});
