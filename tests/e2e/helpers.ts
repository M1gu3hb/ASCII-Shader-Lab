import { expect, type Page } from '@playwright/test';

export async function openStudio(page: Page, hash = '') {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/studio/' + hash);
  await expect(page.locator('.stage canvas').first()).toBeVisible();
  await expect(page.locator('.seedline')).toBeVisible();
  await dismissWelcome(page);
  return errors;
}

/**
 * A first visit opens «¿Qué quieres hacer?» (it opens with the page, so it is there once the studio
 * shows): close it to reach the studio as it is. Nothing happens on later visits.
 */
export async function dismissWelcome(page: Page) {
  const welcome = page.locator('dialog.welcome[open]');
  if (await welcome.count()) {
    await page.keyboard.press('Escape');
    await expect(welcome).toHaveCount(0);
  }
}

export async function seedText(page: Page) {
  return (await page.locator('.seedline .ell').textContent())?.trim() ?? '';
}

export async function download(page: Page, action: () => Promise<unknown>) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), action()]);
  const path = await d.path();
  return { name: d.suggestedFilename(), path: path! };
}
