import { expect, test } from '@playwright/test';
import { dismissWelcome } from './helpers';

test('en móvil, el aviso de modo básico se ve sin tapar la barra del dado', async ({ page }) => {
  await page.goto('/studio/?motor=basico');
  const deck = page.locator('.deck');
  await expect(deck).toBeVisible();
  await dismissWelcome(page);
  await expect(page.locator('.panel')).not.toBeInViewport();
  const chip = page.locator('.bm-basic');
  await expect(chip).toBeInViewport();
  const a = (await chip.boundingBox())!, b = (await deck.boundingBox())!;
  expect(a.y + a.height).toBeLessThanOrEqual(b.y);
  // touch targets: 40 px at least
  for (const btn of await chip.getByRole('button').all()) expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await chip.getByRole('button', { name: '¿Por qué?' }).tap();
  await expect(page.getByRole('dialog', { name: 'Modo básico' })).toBeVisible();
});
