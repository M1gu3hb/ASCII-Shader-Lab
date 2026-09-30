import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { needsFotoStudio, finalRender, openFoto, project } from './foto-helpers';

/**
 * Accessibility of the photo studio: axe (no serious or critical violations) on the start screen, the
 * editor, the export and help sheets; no interactive element inside another one; the keyboard reaches
 * the layers, the inspector and the dice in order, with a visible focus.
 */
needsFotoStudio();

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
  await page.keyboard.press('Escape');
  // the animation library for the selected layer, then the timeline open
  await page.getByRole('region', { name: /^Ajustes de/ }).getByRole('button', { name: 'Animar…' }).click();
  const lib = page.getByRole('dialog', { name: /^Animar/ });
  await expect(lib.locator('.tl-card').first()).toBeVisible({ timeout: 30_000 });
  await serious(page, 'animar');
  await page.keyboard.press('Escape');
  await expect(lib).toBeHidden();
  await page.locator('.ftl-toggle').click();
  await expect(page.getByRole('region', { name: 'Línea de tiempo' }).locator('.tl-bar')).toBeVisible({ timeout: 30_000 });
  await serious(page, 'línea de tiempo');
  expect(errors).toEqual([]);
});

test('con una herramienta activa, Tab sigue moviendo el foco y cada control conserva sus teclas', async ({ page }) => {
  const errors = await openFoto(page);
  await page.locator('.fs-tpl-main', { hasText: /Zonas circulares/ }).click();
  await finalRender(page);
  const layer = async () => {
    const p = await project(page);
    const sel = await page.evaluate(() => (window as unknown as { __foto: { store(): { selection: string[] } } }).__foto.store().selection[0]);
    return p.layers.find(l => l.id === sel)!;
  };
  const l0 = await layer();
  expect(l0.mask?.parts).toHaveLength(1);
  const part0 = l0.mask!.parts[0] as { x: number; alpha: number };
  await page.locator('.fv-over').hover();
  await page.keyboard.press('v');
  await expect(page.getByRole('region', { name: 'Opciones de Editar partes' })).toBeVisible();
  await page.getByRole('button', { name: 'Elegir la última' }).click();
  // Tab from a button of the top bar goes on through the page (the tool keeps Tab only on the canvas)
  await page.getByRole('button', { name: 'Atajos y ayuda' }).focus();
  const seen = new Set<string>();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    seen.add(await page.evaluate(() => { const a = document.activeElement as HTMLElement; return a.getAttribute('aria-label') ?? a.textContent ?? a.tagName; }));
  }
  expect(seen.size).toBe(4);
  // the options bar's slider takes its arrows: the part's strength changes, the part does not move
  const slider = page.getByRole('region', { name: 'Opciones de Editar partes' }).getByRole('slider', { name: 'Intensidad' });
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => ((await layer()).mask!.parts[0] as { alpha: number }).alpha, { timeout: 5000 }).toBeCloseTo(part0.alpha - 0.1, 5);
  expect(((await layer()).mask!.parts[0] as { x: number }).x).toBe(part0.x);
  // with the rectangle tool, Enter on a focused button presses that button (no rectangle is added)
  await page.keyboard.press('Escape');
  await page.locator('.fv-over').hover();
  await page.keyboard.press('m');
  await page.getByRole('button', { name: 'Atajos y ayuda' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Atajos y gestos' })).toBeVisible();
  expect((await layer()).mask?.parts).toHaveLength(1);
  await page.keyboard.press('Escape');
  // and on the tool's own button in the palette, Enter is the keyboard's way to draw
  await page.getByRole('button', { name: 'Rectángulo (M)' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await layer()).mask?.parts.length).toBe(2);
  expect(errors).toEqual([]);
});

test('las demás hojas: versiones (con comparar), ajustes, estilos, guardar y cámara sin errores graves de axe', async ({ page }) => {
  const errors = await openFoto(page);
  await page.locator('.fs-tpl-main', { hasText: /Foto → ASCII completo/ }).click();
  await finalRender(page);
  // two versions, so that the tree has rows and «Comparar» can open
  await page.locator('.fdeck .act.dice').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __foto: { store(): { versions: { list: unknown[] } } } }).__foto.store().versions.list.length)).toBe(2);
  await page.getByRole('button', { name: 'Versiones', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Versiones' });
  await expect(sheet.getByRole('list', { name: 'Árbol de versiones' }).getByRole('listitem')).toHaveCount(2);
  await serious(page, 'versiones');
  await sheet.getByRole('button', { name: 'Comparar' }).first().click();
  await expect(sheet.getByRole('button', { name: /^Restaurar la versión/ })).toBeVisible();
  await serious(page, 'versiones · comparar');
  await page.keyboard.press('Escape');
  for (const [id, name] of [['settings', 'Ajustes'], ['styles', 'Usar estilo del laboratorio'], ['saveas', 'Guardar'], ['camera', 'Cámara']] as const) {
    await page.evaluate(s => (window as unknown as { __foto: { setUI(p: object): void } }).__foto.setUI({ sheet: s }), id);
    await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
    await serious(page, id);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name, exact: true })).toBeHidden();
  }
  expect(errors).toEqual([]);
});
