import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openStudio } from './helpers';

/**
 * Accessibility: automated axe scans (no serious or critical violations), no interactive element
 * inside another one, and the component gallery used with the keyboard and the mouse.
 */

/**
 * Pictures of a piece made of text (the text export preview, the welcome's art, component demos):
 * their colours are the piece's own, so they are left out of the scan (they are images, labelled
 * or hidden as such).
 */
const ART = ['.ansi-pre', '.wl-art', '.comp-demo', '.comp-stage', '.cs-sample', '.gh-pre', '.cv-host'];

async function serious(page: Page, what: string, include?: string) {
  // let entrance animations end: a half-faded text would read as low contrast
  await page.waitForTimeout(450);
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  if (include) b = b.include(include);
  for (const a of ART) b = b.exclude(a);
  const r = await b.analyze();
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  const report = bad.map(v => `${what} · ${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 5).map(n => '    ' + n.target.join(' ') + ' — ' + n.failureSummary?.split('\n').slice(1, 2).join(' ')).join('\n')}`);
  expect(report, report.join('\n')).toEqual([]);
}

/** Interactive elements inside other interactive elements (buttons in buttons, links in buttons…). */
function nestedInteractive(page: Page) {
  return page.evaluate(() => {
    const sel = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="switch"], [role="tab"], [role="checkbox"], [role="radio"], [role="combobox"], [role="option"], [tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const outer = el.parentElement?.closest('a[href], button, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="radio"], [role="option"], [role="combobox"]');
      if (outer && !outer.closest('[inert]')) out.push(`${el.tagName.toLowerCase()}.${el.className} inside ${outer.tagName.toLowerCase()}.${outer.className}`);
    }
    return out;
  });
}

test.describe('accesibilidad', () => {
  test('el estudio: vista inicial, pestañas del panel, vistas de destino y hojas, sin fallos graves', async ({ page }) => {
    await openStudio(page);
    await serious(page, 'estudio');
    expect(await nestedInteractive(page)).toEqual([]);
    for (const tab of await page.locator('.panel .tab').all()) {
      await tab.click();
      await serious(page, 'panel ' + (await tab.textContent()), '.panel');
    }
    // a list open (the studio's picker) and an explanation open: no serious issue either
    await page.getByRole('tab', { name: 'Glifos' }).click();
    await page.getByRole('combobox', { name: 'Caracteres', exact: true }).click();
    await expect(page.getByRole('listbox', { name: 'Caracteres', exact: true })).toBeVisible();
    await serious(page, 'lista de caracteres abierta');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Qué es «Forma de la celda (alto ÷ ancho)»' }).click();
    await serious(page, 'explicación abierta', '.panel');
    for (const v of ['Fondo web', 'Pantalla de móvil', 'Tarjeta', 'Historia / Reel 9:16', 'README', 'Terminal']) {
      await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: v, exact: true }).click();
      await serious(page, 'vista ' + v, '.stage-top');
      expect(await nestedInteractive(page)).toEqual([]);
    }
    await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Historia / Reel 9:16', exact: true }).click();
    await page.locator('.vbar-switch').getByText(/Zonas de interfaz/).click();
    await serious(page, 'historia con zonas', '.stage-top');
    await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Libre', exact: true }).click();

    await page.keyboard.press('e');
    const sheet = (name: string) => page.getByRole('dialog', { name });
    await expect(sheet('Llevar la pieza fuera')).toBeVisible();
    for (const tab of await page.locator('dialog[open] .sheet-tabs .tab').all()) {
      await tab.click();
      await page.waitForTimeout(400);
      await serious(page, 'exportar ' + (await tab.textContent()), 'dialog[open]');
    }
    expect(await nestedInteractive(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(sheet('Llevar la pieza fuera')).toBeHidden();

    await page.keyboard.press('s');
    await page.getByRole('button', { name: /^Colección/ }).click();
    await expect(sheet('Colección e historial')).toBeVisible();
    await serious(page, 'colección', 'dialog[open]');
    expect(await nestedInteractive(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(sheet('Colección e historial')).toBeHidden();

    await page.keyboard.press('?');
    await expect(sheet('Atajos de teclado')).toBeVisible();
    await serious(page, 'atajos', 'dialog[open]');
  });

  test('bienvenida, un paso de guía y la hoja de compartir, sin fallos graves', async ({ page }) => {
    await page.goto('/studio/');
    await expect(page.locator('dialog.welcome[open]')).toBeVisible();
    await serious(page, 'bienvenida');
    await page.getByRole('button', { name: 'Convertir una foto en ASCII' }).click();
    await page.getByRole('button', { name: 'Usar una foto de ejemplo' }).click();
    await expect(page.locator('#guide-title')).toContainText('Elige un estilo');
    await serious(page, 'guía foto 2');
    expect(await nestedInteractive(page)).toEqual([]);
    await page.getByRole('button', { name: 'Cerrar la guía' }).click();
    // a piece with a photo asks before sharing its link
    await page.locator('.seedline').getByRole('button', { name: 'enlace' }).click();
    await expect(page.getByRole('dialog', { name: 'Compartir el enlace' })).toBeVisible();
    await serious(page, 'compartir', 'dialog[open]');
  });

  test('galería de piezas: tarjetas con un solo botón, sin controles anidados; teclado y ratón', async ({ page }) => {
    await openStudio(page);
    await page.getByRole('button', { name: 'Componentes', exact: true }).click();
    const cards = page.locator('.comp-card');
    await expect(cards.first()).toBeVisible();
    const n = await cards.count();
    expect(n).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      await expect(card.getByRole('heading')).toHaveCount(1);
      await expect(card.getByRole('button')).toHaveCount(1);
      await expect(card.locator('.comp-demo')).toHaveAttribute('aria-hidden', 'true');
      expect(await card.locator('.comp-demo').evaluate(el => (el as HTMLElement).inert)).toBe(true);
    }
    // the Halo demo mounts a real button: inert and hidden here, never inside the card's own button
    await expect(page.locator('.comp-demo button').first()).toBeAttached();
    expect(await nestedInteractive(page)).toEqual([]);
    await serious(page, 'galería');

    // keyboard: Tab reaches each card's button in order; Enter and Space open it
    const halo = page.getByRole('button', { name: /Personalizar y copiar: Halo/ });
    await halo.focus();
    await expect(halo).toBeFocused();
    const order = await page.evaluate(() => [...document.querySelectorAll('.comp-open')].map(b => b.getAttribute('aria-label')));
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(order[order.findIndex(t => /Halo/.test(t ?? '')) - 1]);
    await page.keyboard.press('Tab');
    await expect(halo).toBeFocused();
    await expect.poll(() => halo.evaluate(el => getComputedStyle(el.closest('.comp-card')!).outlineStyle)).toBe('solid');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Halo' })).toBeVisible();
    await serious(page, 'detalle');
    expect(await nestedInteractive(page)).toEqual([]);
    await page.getByRole('button', { name: '← Todas las piezas' }).click();
    await page.getByRole('button', { name: /Personalizar y copiar: Indicadores/ }).focus();
    await page.keyboard.press(' ');
    await expect(page.getByRole('heading', { level: 1, name: 'Indicadores' })).toBeVisible();
    await page.getByRole('button', { name: '← Todas las piezas' }).click();

    // every component card, alternately with the keyboard and with a click anywhere on the card
    // (the whole card is the button's hit area, the demo included)
    const names = await page.locator('.comp-card h2').allTextContents();
    for (const [i, title] of names.slice(2).entries()) {
      const card = page.locator('.comp-card', { has: page.getByRole('heading', { name: title, exact: true }) });
      if (i % 2) {
        await card.getByRole('button').focus();
        await page.keyboard.press(i % 4 === 1 ? 'Enter' : ' ');
      } else {
        await card.scrollIntoViewIfNeeded();
        const box = (await card.locator('.comp-demo').boundingBox())!;
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await page.getByRole('button', { name: '← Todas las piezas' }).click();
    }
    // the first two lead to a space
    const spaces = page.getByRole('navigation', { name: 'Espacios del estudio' });
    await page.getByRole('button', { name: 'Abrir Imagen: Imagen ASCII' }).click();
    await expect(spaces.getByRole('button', { name: 'Imagen' })).toHaveAttribute('aria-pressed', 'true');
    await spaces.getByRole('button', { name: 'Componentes' }).click();
    await page.getByRole('button', { name: 'Diseñar en Fondos: Fondo animado' }).click();
    await expect(page.getByRole('dialog', { name: 'Llevar la pieza fuera' })).toBeVisible();
    await expect(spaces.getByRole('button', { name: 'Fondos' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('las hojas atrapan el foco, Escape las cierra y el foco vuelve a su botón', async ({ page }) => {
    await openStudio(page);
    const exportBtn = page.locator('.topbar .ib.primary');
    await exportBtn.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
    await expect(sheet).toBeVisible();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'))).toBe(true);
    }
    // focus is visible where the keyboard is
    expect(await page.evaluate(() => { const a = document.activeElement as HTMLElement; const s = getComputedStyle(a); return s.outlineStyle !== 'none' || s.boxShadow !== 'none'; })).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(exportBtn).toBeFocused();

    const coll = page.getByRole('button', { name: /^Colección/ });
    await coll.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Colección e historial' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(coll).toBeFocused();

    // the dice settings: a popover that Escape closes, operable with the keyboard
    const dice = page.getByRole('button', { name: 'Ajustes del azar' });
    await dice.focus();
    await page.keyboard.press('Enter');
    const pop = page.getByRole('dialog', { name: 'Ajustes del azar' });
    await expect(pop).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(pop.getByRole('button', { name: 'Forma' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
  });

  test('portada, una guía y la licencia, sin fallos graves', async ({ page }) => {
    for (const path of ['/', '/imagen-a-ascii/', '/licencia/']) {
      await page.goto(path);
      await page.waitForTimeout(600);
      await serious(page, path);
      expect(await nestedInteractive(page)).toEqual([]);
    }
  });
});
