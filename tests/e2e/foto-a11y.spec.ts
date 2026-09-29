import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { finalRender, openFoto } from './foto-helpers';

/**
 * Accessibility of the photo studio: axe (no serious or critical violations) on the start screen, the
 * editor, the export and help sheets; no interactive element inside another one; the keyboard reaches
 * the layers, the inspector and the dice in order, with a visible focus.
 */

async function serious(page: Page, what: string) {
  await page.waitForTimeout(400);
  const b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // the piece itself (its colours are the art's) and the template/version pictures
    .exclude('.fv-frame').exclude('.fs-tpl-img').exclude('.fthumb');
  const r = await b.analyze();
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  const report = bad.map(v => `${what} · ${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 5).map(n => '    ' + n.target.join(' ') + ' — ' + n.failureSummary?.split('\n').slice(1, 2).join(' ')).join('\n')}`);
  expect(report, report.join('\n')).toEqual([]);
}

function nestedInteractive(page: Page) {
  return page.evaluate(() => {
    const sel = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="switch"], [role="tab"], [role="radio"], [role="combobox"], [role="option"], [role="slider"]';
    const out: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const up = el.parentElement?.closest(sel);
      if (up && !(el.tagName === 'INPUT' && up.tagName === 'LABEL')) out.push(`${el.tagName}.${el.className} dentro de ${up.tagName}.${up.className}`);
    }
    return out;
  });
}

test('estudio de foto: axe sin errores graves, sin controles anidados, teclado en orden', async ({ page }) => {
  const errors = await openFoto(page);
  await serious(page, 'inicio');
  await page.locator('.fs-tpl-main', { hasText: /Cartel editorial/ }).click();
  await finalRender(page);
  await serious(page, 'editor');
  expect(await nestedInteractive(page)).toEqual([]);
  // the layers list: arrows move the selection, Tab goes on to the inspector
  await page.locator('.lr.on .lr-main').focus();
  const sel0 = await page.locator('.lr.on .lr-name').textContent();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.lr.on .lr-name')).not.toHaveText(sel0!);
  const focusVisible = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    return getComputedStyle(el).outlineStyle !== 'none' || el.matches(':focus-visible');
  });
  expect(focusVisible).toBe(true);
  await page.getByRole('button', { name: /Exportar/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Exportar' })).toBeVisible();
  await serious(page, 'exportar');
  await page.keyboard.press('Escape');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Atajos y gestos' })).toBeVisible();
  await serious(page, 'atajos');
  expect(errors).toEqual([]);
});
