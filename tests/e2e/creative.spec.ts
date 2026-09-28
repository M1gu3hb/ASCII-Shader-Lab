import AxeBuilder from '@axe-core/playwright';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { crc32 } from '../../src/shared/zip';
import { colours, contextOf, drawn } from './canvas';
import { openStudio } from './helpers';

/**
 * The creative additions: transformations of the source (Imagen, Tipo), letters that move (Tipo), the
 * ramp editor (Glifos). Through the panel, with the mouse and the keyboard, and what travels in a link.
 */

/** A small photo-like PNG: a diagonal gradient with a bright disc and stripes. */
function photo(w = 320, h = 200): Buffer {
  const row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * row + 1 + x * 3;
    const disc = Math.hypot(x - w * 0.4, y - h * 0.5) < h * 0.28;
    const stripe = x > w * 0.72 && Math.floor(x / 8) % 2 === 0;
    raw[o] = disc ? 250 : stripe ? 40 : (x * 200 / w) | 0;
    raw[o + 1] = disc ? 210 : stripe ? 160 : (y * 180 / h) | 0;
    raw[o + 2] = disc ? 150 : stripe ? 90 : 110;
  }
  const chunk = (t: string, d: Buffer) => { const td = Buffer.concat([Buffer.from(t), d]); const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function dropPhoto(page: Page) {
  await page.evaluate(b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'foto.png', { type: 'image/png' }));
    document.querySelector('.stage')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, photo().toString('base64'));
  await expect(page.locator('.seedline')).toBeVisible();
}

const ART = ['.ansi-pre', '.wl-art', '.comp-demo', '.comp-stage', '.cs-sample', '.gh-pre', '.cv-host'];
async function serious(page: Page, what: string, include?: string) {
  await page.waitForTimeout(500);
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => undefined))));
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  if (include) b = b.include(include);
  for (const a of ART) b = b.exclude(a);
  const r = await b.analyze();
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  const report = bad.map(v => `${what} · ${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 5).map(n => '    ' + n.target.join(' ')).join('\n')}`);
  expect(report, report.join('\n')).toEqual([]);
}
const nested = (page: Page) => page.evaluate(() => {
  const out: string[] = [];
  for (const el of document.querySelectorAll('.panel a[href], .panel button, .panel input, .panel [role="combobox"], .panel [role="switch"]')) {
    const outer = el.parentElement?.closest('a[href], button, [role="button"], [role="combobox"], [role="option"], [role="tab"]');
    if (outer) out.push(`${el.tagName} in ${outer.tagName}`);
  }
  return out;
});

/** What the stage shows (a screenshot: the WebGL canvas keeps no drawing buffer to read). */
const stageShot = (page: Page) => page.locator('.stage canvas').screenshot({ animations: 'disabled' });

test.describe('transformaciones de la fuente', () => {
  test('una foto: se añaden (ratón y teclado), se reordenan, se apagan, viajan en el enlace y se quitan', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const errors = await openStudio(page, '#space=media');
    await dropPhoto(page);
    await page.getByRole('tab', { name: 'Transformar' }).click();
    await expect(page.locator('.xf-card')).toHaveCount(0);
    await expect(page.locator('.pane')).toContainText('Se aplican en orden');
    // paused, the stage only changes when the piece does
    await page.getByRole('button', { name: 'Pausar animación' }).click();
    await page.waitForTimeout(1500);
    const before = await stageShot(page);

    // keyboard: the add list opens with Enter, typing jumps, Enter chooses
    const add = page.getByRole('combobox', { name: 'Añadir una transformación' });
    await add.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox', { name: 'Añadir una transformación' })).toBeVisible();
    await page.keyboard.type('sem');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('combobox', { name: 'Transformación 1' })).toContainText('Semitono');
    await expect.poll(async () => (await stageShot(page)).equals(before), { timeout: 30_000 }).toBe(false);

    // the mouse: a second one; one already in the list cannot be chosen twice
    await add.click();
    await expect(page.getByRole('option', { name: /Semitono/ })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('option', { name: /Bandas/ }).click();
    await expect(page.getByRole('combobox', { name: 'Transformación 2' })).toContainText('Bandas');

    // order: «Bandas» goes first, and the keyboard focus stays on its card
    await page.getByRole('button', { name: 'Subir «Bandas»' }).click();
    await expect(page.getByRole('combobox', { name: 'Transformación 1' })).toContainText('Bandas');
    await expect(page.getByRole('button', { name: 'Bajar «Bandas»' })).toBeFocused();

    // off for a moment (the card says so), and back on
    await page.getByRole('button', { name: 'Apagar «Semitono»' }).click();
    await expect(page.locator('.xf-card.off')).toHaveCount(1);
    await page.getByRole('button', { name: 'Encender «Semitono»' }).click();
    await expect(page.locator('.xf-card.off')).toHaveCount(0);

    // a trail needs movement: on a still photo the card says it
    await add.click();
    await page.getByRole('option', { name: /Estela/ }).click();
    await expect(page.locator('.xf-card').nth(2)).toContainText('Sólo se ve con un video o la cámara');

    await serious(page, 'transformar', '.panel');
    expect(await nested(page)).toEqual([]);

    // the link carries them (the photo does not travel: whoever opens it chooses one)
    await page.getByRole('button', { name: 'Exportar' }).click();
    await page.getByRole('tab', { name: 'Receta' }).click();
    const url = await page.getByRole('textbox', { name: 'Enlace' }).inputValue();
    await page.keyboard.press('Escape');
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.goto(url.replace(/^https?:\/\/[^/]+/, ''));
    await expect(p2.locator('.seedline')).toBeVisible({ timeout: 45_000 });
    if (await p2.locator('dialog.welcome[open]').count()) await p2.keyboard.press('Escape');
    await p2.getByRole('tab', { name: 'Transformar' }).click();
    await expect(p2.getByRole('combobox', { name: 'Transformación 1' })).toContainText('Bandas');
    await expect(p2.getByRole('combobox', { name: 'Transformación 2' })).toContainText('Semitono');
    await expect(p2.getByRole('combobox', { name: 'Transformación 3' })).toContainText('Estela');
    await other.close();

    await page.getByRole('button', { name: 'Quitar las transformaciones' }).click();
    await expect(page.locator('.xf-card')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('el dado de Transformar propone una combinación, y los recetarios de Imagen la traen', async ({ page }) => {
    const errors = await openStudio(page, '#space=media');
    await dropPhoto(page);
    await page.locator('.panel .recipes').getByRole('button', { name: 'Serigrafía' }).click();
    await page.getByRole('tab', { name: 'Transformar' }).click();
    await expect(page.getByRole('combobox', { name: 'Transformación 1' })).toContainText('Bandas');
    await expect(page.getByRole('combobox', { name: 'Transformación 2' })).toContainText('Semitono');
    const kinds = async () => (await page.locator('.xf-card [role="combobox"]').allTextContents()).join('+');
    const was = await kinds();
    // another draw (a different one within a few tries: it may repeat by chance)
    await expect(async () => {
      await page.getByRole('button', { name: 'Otra combinación de transformaciones al azar' }).click();
      expect(await kinds()).not.toBe(was);
    }).toPass({ timeout: 20_000 });
    expect(await page.locator('.xf-card').count()).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('con el motor básico también se transforman (y se dibujan)', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = await openStudio(page, '?motor=basico#space=media');
    await dropPhoto(page);
    expect(await contextOf(page, '.stage canvas')).toBe('2d');
    await page.locator('.panel .recipes').getByRole('button', { name: 'Caleidoscopio' }).click();
    await drawn(page, '.stage canvas');
    const a = await colours(page, '.stage canvas');
    expect(a).toBeGreaterThan(3);
    expect(errors).toEqual([]);
  });
});

test.describe('letras que se mueven', () => {
  test('Tipo: el texto grande y el mensaje eligen su movimiento; «Palabra a palabra»', async ({ page }) => {
    const errors = await openStudio(page, '#space=tipo');
    await page.locator('.panel .recipes').getByRole('button', { name: 'Ola', exact: true }).click();
    await page.getByRole('tab', { name: 'Texto', exact: true }).click();
    const how = page.getByRole('combobox', { name: 'Cómo se mueven las letras' });
    await expect(how).toContainText('Ola');
    await expect(page.getByText('Altura', { exact: true })).toBeVisible();
    // the keyboard: another one
    await how.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.type('exp');
    await page.keyboard.press('Enter');
    await expect(how).toContainText('Explosión');
    await expect(page.getByText('Alcance', { exact: true })).toBeVisible();
    await how.click();
    await page.getByRole('option', { name: /Quietas/ }).click();
    await expect(page.getByText('Alcance', { exact: true })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Mensaje' }).click();
    const on = page.getByRole('switch', { name: 'Mostrar mensaje' });
    if (!(await on.isChecked())) await page.locator('.toggle', { hasText: 'Mostrar mensaje' }).click();
    await page.getByRole('combobox', { name: 'Cómo aparece' }).click();
    await page.getByRole('option', { name: /Palabra a palabra/ }).click();
    await expect(page.getByRole('combobox', { name: 'Cómo aparece' })).toContainText('Palabra a palabra');
    await page.getByRole('combobox', { name: 'Efecto por letra' }).click();
    // only what a message can do
    await expect(page.getByRole('option', { name: /Latido/ })).toHaveCount(0);
    await page.getByRole('option', { name: /Color por letra/ }).click();
    await expect(page.getByRole('combobox', { name: 'Efecto por letra' })).toContainText('Color por letra');
    await serious(page, 'mensaje', '.panel');
    expect(errors).toEqual([]);
  });
});

test.describe('rampa de caracteres', () => {
  test('se escribe, se mide, se ordena, se guarda en este navegador, se reutiliza y se borra', async ({ page }) => {
    const errors = await openStudio(page, '#space=arte');
    await page.getByRole('tab', { name: 'Glifos' }).click();
    const field = page.getByLabel('Tus caracteres (del vacío al lleno)');
    await field.fill(' @.:#');
    const bars = page.locator('.ramp-bars li');
    await expect(bars).toHaveCount(5);
    // measured: sorted from empty to full, the space first and «@» last
    await expect(bars.first()).toContainText('espacio');
    await expect(bars.last()).toContainText('@');
    await expect(page.locator('.ramp-meter')).not.toHaveAttribute('aria-busy', 'true');

    // as typed: the ones out of order are marked, and one button sorts the text
    await page.locator('.ramp-ed .toggle').click();
    await expect(page.locator('.ramp-bars li.bad').first()).toBeVisible();
    await page.getByRole('button', { name: 'Reordenar el texto por tinta' }).click();
    await expect(field).toHaveValue(' .:#@');
    await expect(page.locator('.ramp-bars li.bad')).toHaveCount(0);

    // saved in this browser, and in the characters list under «Tus rampas»
    await page.getByRole('button', { name: 'Guardar esta rampa en este navegador' }).click();
    await page.getByLabel('Nombre de la rampa').fill('Mi trama');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Mi trama/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('combobox', { name: 'Caracteres', exact: true })).toContainText('Mi trama');
    await serious(page, 'rampa', '.panel');
    expect(await nested(page)).toEqual([]);

    // another set, then the saved one again; it survives a reload
    await page.getByRole('combobox', { name: 'Caracteres', exact: true }).click();
    await page.getByRole('option', { name: /^Bloques/ }).click();
    await expect(field).toHaveValue(' ░▒▓█');
    await page.reload();
    await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
    await page.getByRole('tab', { name: 'Glifos' }).click();
    await page.getByRole('button', { name: /^Mi trama/ }).click();
    await expect(field).toHaveValue(' .:#@');

    // deleting says so and can be undone
    await page.getByRole('button', { name: 'Borrar la rampa «Mi trama»' }).click();
    await expect(page.getByRole('button', { name: /^Mi trama/ })).toHaveCount(0);
    await page.locator('.toast').getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByRole('button', { name: /^Mi trama/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
