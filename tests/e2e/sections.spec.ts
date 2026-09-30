import { expect, test, type Page } from '@playwright/test';
import { choose } from './clip';
import { openStudio } from './helpers';

/**
 * The lab's sections have an identity (icon, colour, a line that says what they are for), «Tipo» reads
 * «Texto» (its id, links and recipes unchanged), the recipes fold to one line that names the recipe of the
 * piece, number fields can be emptied while typing, sliders keep their keyboard and mouse, and a character
 * set shows its symbols as text.
 */

const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test('«Texto» en el estudio: la barra, la lista de espacios y el panel; #space=tipo sigue abriéndolo', async ({ page }) => {
  await openStudio(page, '#space=tipo');
  await expect(page.locator('.spaces').getByRole('button', { name: 'Texto', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.panel-title .pt-name')).toHaveText('Texto');
  await expect(page.getByRole('tab', { name: 'Tu texto', exact: true })).toBeVisible();
  // nowhere in the lab's interface does «Tipo» name the space any more
  expect(await page.evaluate(() => /\bTipo\b(?! de)/.test(document.querySelector<HTMLElement>('.topbar')!.innerText + document.querySelector<HTMLElement>('aside.panel')!.innerText))).toBe(false);
  // narrow window: the picker of spaces says it too
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator('.topbar .space-select')).toContainText('Texto');
  await page.locator('.topbar .space-select').click();
  await expect(page.getByRole('listbox', { name: 'Espacio' }).getByRole('option', { name: /^Texto/ })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('cada grupo tiene su color, su icono y una línea que dice para qué es; Color muestra la paleta y Glifos sus caracteres', async ({ page }) => {
  await openStudio(page, '#space=arte');
  const tabs = page.locator('aside.panel [role=tab]');
  const accents = new Set<string>();
  for (const t of await tabs.all()) {
    await t.click();
    const name = (await t.locator('.tab-name').textContent())!.trim();
    await expect(page.locator('.pane-head .pane-t')).toHaveText(name);
    await expect(page.locator('.pane-head .pane-line')).not.toBeEmpty();
    accents.add(await t.evaluate(el => getComputedStyle(el).getPropertyValue('--acc').trim()));
    // selected: its colour tints it and the vermilion thread marks it
    expect(await t.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  }
  // at least as many colours as there are kinds of groups here
  expect(accents.size).toBeGreaterThanOrEqual(6);
  // Color: the piece's own palette as a strip; Glifos: some of its characters
  const stops = await page.evaluate(() => document.querySelectorAll('.tab-color .tab-sw i').length);
  expect(stops).toBeGreaterThan(0);
  await expect(page.locator('.tab-glifos .tab-gl')).toHaveText(/^\S{2,3}$/);
  // they follow the piece: another palette, another strip
  const before = await page.locator('.tab-color .tab-sw').innerHTML();
  await page.getByRole('tab', { name: 'Color' }).click();
  await page.locator('.palettes .pal').nth(5).click();
  await expect.poll(() => page.locator('.tab-color .tab-sw').innerHTML()).not.toBe(before);
  // the space: its icon, name and line head the column
  await expect(page.locator('.panel-title .pt-line')).not.toBeEmpty();
});

test('la línea de recetas nombra la receta de la pieza (y si se editó) y abre las recetas en lugar de los ajustes', async ({ page }) => {
  await openStudio(page, '#space=fondos');
  const line = page.locator('aside.panel .rx-line');
  // closed: the column is the settings'
  await expect(line).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#pane')).toBeVisible();
  await line.click();
  const cards = page.locator('#rx-browser .rx-card');
  expect(await cards.count()).toBeGreaterThan(3);
  const second = (await cards.nth(1).locator('.rx-name').textContent())!.trim();
  await cards.nth(1).click();
  await expect(line).toHaveAccessibleName(`Recetas de Fondos: ${second}`);
  await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
  // the recipe the piece already is: nothing happens (no second copy in the history)
  const n = await page.locator('.seedline').textContent();
  await cards.nth(1).click();
  await expect(page.locator('.seedline')).toHaveText(n!);
  // closed again: the controls come back, the recipe is still named
  await line.click();
  await expect(line).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#rx-browser')).toHaveCount(0);
  await expect(line).toContainText(second);
  // an edit: the line says so
  await page.getByRole('tab', { name: 'Glifos' }).click();
  await page.getByLabel('Tamaño de celda').focus();
  await page.keyboard.press('ArrowUp');
  await expect(line).toHaveAccessibleName(`Recetas de Fondos: ${second}, editada`);
  await expect(line).toContainText('editada');
});

test('los campos de número se pueden vaciar al escribir; al terminar se ajustan a su rango y lo dicen', async ({ page }) => {
  await openStudio(page, '#space=terminal');
  await page.getByRole('tab', { name: 'Terminal', exact: true }).click();
  const cols = page.getByRole('spinbutton', { name: 'Columnas' });
  await expect(cols).toHaveValue('80');
  // emptied: it stays empty (it used to jump back to its minimum), and the terminal keeps its size
  await cols.fill('');
  await expect(cols).toHaveValue('');
  await expect(page.locator('.term-bar')).toContainText('80×24');
  // «3» on the way to «30»: nothing is forced meanwhile
  await cols.pressSequentially('3');
  await expect(cols).toHaveValue('3');
  await cols.pressSequentially('0');
  await expect(page.locator('.term-bar')).toContainText('30×24');
  // past the range, then done: it comes back within it and says so
  await cols.fill('999');
  await cols.press('Enter');
  await expect(cols).toHaveValue('300');
  await expect(page.locator('.nf-hint').filter({ hasText: 'Va de 10 a 300: queda en 300.' })).toBeVisible();
  // left empty: its value stays
  await cols.fill('');
  await blur(page);
  await expect(cols).toHaveValue('300');
  // Escape puts back what it had when the field was entered
  await cols.click();
  await cols.fill('120');
  await expect(page.locator('.term-bar')).toContainText('120×24');
  await cols.press('Escape');
  await expect(cols).toHaveValue('300');
  // ↑ ↓ step it, as a number field
  await cols.press('ArrowDown');
  await expect(cols).toHaveValue('299');

  // the export sheet's durations: the same field
  await blur(page);
  await page.keyboard.press('e');
  await page.getByRole('tab', { name: 'Video y GIF' }).click();
  const secs = page.getByRole('spinbutton', { name: 'Duración (s)' });
  const was = await secs.inputValue();
  await secs.fill('');
  await expect(secs).toHaveValue('');
  await secs.press('Enter');
  await expect(secs).toHaveValue(was);
  await secs.fill('0');
  await secs.press('Enter');
  await expect(secs).toHaveValue('1');
  await expect(page.getByRole('dialog').locator('.nf-hint').filter({ hasText: 'Va de 1 a 60: queda en 1.' })).toBeVisible();
  // Escape in a field that changed restores it and leaves the sheet open
  await secs.fill('12');
  await secs.press('Escape');
  await expect(secs).toHaveValue('1');
  await expect(page.getByRole('dialog', { name: 'Llevar la pieza fuera' })).toBeVisible();
});

test('los deslizadores con teclado y ratón: flechas, Enter para escribir el valor, clic directo en la pista', async ({ page }) => {
  await openStudio(page, '#space=arte');
  await page.getByRole('tab', { name: 'Glifos' }).click();
  const s = page.getByRole('slider', { name: 'Tamaño de celda' });
  const v0 = Number(await s.inputValue());
  await s.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(s).toHaveValue(String(v0 + 2));
  await page.keyboard.press('ArrowLeft');
  await expect(s).toHaveValue(String(v0 + 1));
  await expect(s).toHaveAttribute('aria-valuetext', `${v0 + 1} px`);
  // − + are for touch screens: not on a desktop with a mouse
  const row = page.locator('.panel .ctl.sl').filter({ has: s });
  await expect(row.getByRole('button', { name: 'Más', exact: true })).toBeHidden();
  // (the row's other parts are described by the setting, not named after it: its name finds the slider alone)
  await expect(page.getByLabel('Tamaño de celda')).toHaveCount(1);
  // Enter: the exact value; Enter again goes back to the slider
  await page.keyboard.press('Enter');
  const field = row.getByRole('spinbutton', { name: 'Tamaño de celda', exact: true });
  await expect(field).toBeFocused();
  await field.fill('20');
  await page.keyboard.press('Enter');
  await expect(s).toHaveValue('20');
  await expect(s).toBeFocused();
  // Escape while typing: back to what it was
  await page.keyboard.press('Enter');
  await field.fill('30');
  await expect(s).toHaveValue('30');
  await page.keyboard.press('Escape');
  await expect(s).toHaveValue('20');
  await expect(s).toBeFocused();
  // the value is a button for the mouse too
  await row.getByRole('button', { name: /^Escribir el valor exacto/ }).click();
  await expect(field).toBeFocused();
  await page.keyboard.press('Escape');
  // a click on the track: the native, direct behaviour (the value under the pointer)
  const b = (await s.boundingBox())!;
  await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2);
  await expect.poll(async () => Number(await s.inputValue())).toBeGreaterThan(44);
});

test('los juegos de caracteres se ven como texto: sus símbolos y unos cuantos grandes, sin imágenes', async ({ page }) => {
  await openStudio(page, '#space=arte');
  await page.getByRole('tab', { name: 'Glifos' }).click();
  await choose(page, page.getByRole('combobox', { name: 'Caracteres', exact: true }), /^Bloques/);
  const cs = page.getByRole('combobox', { name: 'Caracteres', exact: true });
  await cs.click();
  const list = page.getByRole('listbox', { name: 'Caracteres', exact: true });
  await expect(list).toBeVisible();
  const prev = page.locator('.pk-preview');
  await expect(prev.locator('.cs-big span').first()).toBeVisible();
  await expect(prev.locator('.pk-preview-img')).toHaveCount(0);
  // the highlighted set's symbols, all of them, as text, in the piece's font
  const chars = await page.getByLabel('Tus caracteres (del vacío al lleno)').inputValue().catch(() => '');
  const shown = await prev.locator('.cs-all').innerText();
  if (chars) for (const ch of new Set([...chars].filter(c => c.trim()))) expect(shown).toContain(ch);
  expect(await prev.locator('.cs-all-h').innerText()).toMatch(/^\d+ SÍMBOLOS?, DEL VACÍO AL LLENO$/i);
  // moving through the list changes it
  const first = await prev.locator('.cs-all').innerText();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => prev.locator('.cs-all').innerText()).not.toBe(first);
  // readable: glyphs over their background at 4.5:1 at least
  const [fg, bg] = await prev.locator('.cs-big').evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  const lum = (c: string) => {
    const [r, g, b] = (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const k = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
  expect(k).toBeGreaterThanOrEqual(4.5);
  await page.keyboard.press('Escape');
});
