import { expect, type Page } from '@playwright/test';

export async function openStudio(page: Page, hash = '') {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/studio/' + hash);
  // generous: under SwiftShader on a busy machine the first shader compile can take a while
  await expect(page.locator('.stage canvas').first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
  await dismissWelcome(page);
  return errors;
}

/**
 * Presses a shortcut until `target` shows. Shortcuts are attached right after the first paint, so a
 * key pressed the very instant the studio appears can land before them.
 */
export async function pressUntil(page: Page, key: string, target: ReturnType<Page['locator']>) {
  await expect(async () => {
    await page.keyboard.press(key);
    await expect(target).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
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
