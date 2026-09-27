import { expect, test, type Page } from '@playwright/test';
import { choose, clipped, contrastOf, pressedColours } from './clip';
import { openStudio } from './helpers';

/**
 * Controls on desktop screens: no row hides options without saying so (at every width), every option of
 * the rows that changed is reachable with the keyboard, the pickers work like selects, the explanations
 * open inline, and pressed states read.
 */

const WIDTHS: Array<[number, number]> = [[1920, 1080], [1440, 900], [1366, 768], [1280, 800], [1024, 768], [900, 800], [768, 1024]];
const VIEWS = ['Fondo web', 'Pantalla de móvil', 'Tarjeta', 'Historia / Reel 9:16', 'README', 'Terminal', 'Libre'];
const vista = (page: Page) => page.getByRole('radiogroup', { name: 'Vista' });
/** The digit and letter shortcuts need the focus out of any list (a picker takes letters, like a select). */
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
/** On narrow windows the settings open as a sheet: open it when it is closed. */
async function openPanel(page: Page) {
  if (await page.locator('.app.panel-off').count()) await page.getByRole('button', { name: 'Ajustes de la pieza' }).click();
  await expect(page.locator('.panel')).toBeInViewport();
}

/** Walks what a person can open and collects what clips, labelled with where it was seen. */
async function walk(page: Page, w: number, full: boolean) {
  const found: string[] = [];
  const look = async (where: string) => { for (const c of await clipped(page)) found.push(`${w} px · ${where}: ${c}`); };
  const spaces = ['Fondos', 'Arte', 'Imagen', 'Tipo', 'Terminal', 'Componentes'];
  for (const [i, sp] of spaces.entries()) {
    if (!full && sp !== 'Arte') continue;
    await blur(page);
    await page.keyboard.press(String(i + 1));
    await page.waitForTimeout(250);
    await look(sp);
    if (sp === 'Componentes') {
      await page.getByRole('button', { name: /Personalizar y copiar: Halo/ }).click();
      await look('pieza Halo');
      await page.getByRole('button', { name: '← Todas las piezas' }).click();
      await blur(page);
      await page.keyboard.press('2');
      continue;
    }
    await openPanel(page);
    for (const tab of await page.locator('.panel [role=tab]').all()) {
      await tab.click();
      await look(`${sp} · ${(await tab.textContent())?.trim()}`);
    }
  }
  const phone = w <= 900;
  for (const v of VIEWS) {
    if (phone) await choose(page, page.getByRole('combobox', { name: 'Vista' }), new RegExp('^' + v.replace(/[/()]/g, '.')));
    else await vista(page).getByRole('radio', { name: v, exact: true }).click();
    await page.waitForTimeout(200);
    await look('vista ' + v);
  }
  await page.getByRole('button', { name: 'Ajustes del azar' }).click();
  await look('ajustes del azar');
  await page.getByRole('button', { name: 'Ajustes del azar' }).click();
  await blur(page);
  await page.keyboard.press('e');
  const sheet = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
  await expect(sheet).toBeVisible();
  for (const tab of await sheet.getByRole('tab').all()) {
    await tab.click();
    await page.waitForTimeout(150);
    await look('exportar · ' + (await tab.textContent())?.trim());
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  if (full) {
    // (these sheets load on first use: wait until they are open)
    await page.getByRole('button', { name: /^Colección/ }).click();
    await expect(page.getByRole('dialog', { name: 'Colección e historial' })).toBeVisible();
    await look('colección');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Colección e historial' })).toBeHidden();
    // narrow windows: the settings sheet covers the seed line while it is open
    if (phone && !(await page.locator('.app.panel-off').count())) await page.getByRole('button', { name: 'Cerrar ajustes' }).click();
    await page.locator('.seedline').getByRole('button', { name: 'semilla' }).click();
    await expect(page.getByRole('dialog', { name: 'Semilla' })).toBeVisible();
    await look('semilla');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Semilla' })).toBeHidden();
    // the guides: their welcome and the first steps of one
    await blur(page);
    await page.keyboard.press('g');
    await expect(page.locator('dialog.welcome[open]')).toBeVisible();
    await look('bienvenida de las guías');
    await page.getByRole('button', { name: 'Crear un fondo para tu web' }).click();
    await expect(page.locator('#guide-title')).toBeVisible();
    await look('guía · paso 1');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await look('guía · paso 2');
    await page.getByRole('button', { name: 'Cerrar la guía' }).click();
    await expect(page.locator('#guide-title')).toHaveCount(0);
  }
  return found;
}

test.describe('acceso horizontal', () => {
  // every space, tab, view and sheet at 1366 and 768 px; at the other widths one space, its tabs, the views and the export sheet
  for (const [label, widths] of [['1920 a 1280 px', WIDTHS.slice(0, 4)], ['1024 a 768 px', WIDTHS.slice(4)]] as const) {
    test(`de ${label}, ninguna fila recorta opciones sin avisar`, async ({ page }) => {
      test.setTimeout(300_000);
      await openStudio(page);
      const found: string[] = [];
      for (const [w, h] of widths) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(300);
        found.push(...await walk(page, w, w === 1366 || w === 768));
      }
      expect(found, found.join('\n')).toEqual([]);
    });
  }

  test('en pantallas anchas no hay nada que desplazar: recetas y secciones caben enteras', async ({ page }) => {
    await openStudio(page, '#space=arte');
    for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 768]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(200);
      for (const sel of ['.panel .recipes', '.panel .ptabs']) {
        const row = page.locator(sel);
        expect(await row.evaluate(el => el.scrollWidth - el.clientWidth), `${sel} a ${w} px`).toBeLessThanOrEqual(1);
        // every item inside the panel, none cut at its edge
        const panel = (await page.locator('.panel').boundingBox())!;
        for (const b of await row.locator('button:not(.srow-btn)').all()) {
          const r = (await b.boundingBox())!;
          expect(r.x, `${await b.textContent()} a ${w} px`).toBeGreaterThanOrEqual(panel.x);
          expect(r.x + r.width, `${await b.textContent()} a ${w} px`).toBeLessThanOrEqual(panel.x + panel.width);
        }
      }
    }
  });

  test('una fila que no cabe lo dice, se desplaza con la rueda sólo mientras puede y con sus flechas', async ({ page }) => {
    // a narrow window with a mouse: the settings are a sheet whose sections do not fit in one row
    await page.setViewportSize({ width: 440, height: 900 });
    await openStudio(page, '#space=arte');
    await openPanel(page);
    const box = page.locator('.panel .ptabs-box');
    const row = page.locator('.panel .ptabs');
    await expect(row).toBeVisible();
    await page.getByRole('tab', { name: 'Capas' }).click();
    await expect.poll(() => row.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(true);
    // more on the right: a visible «más», nothing on the left
    await expect(box.locator('.srow-next')).toBeVisible();
    await expect(box.locator('.srow-next')).toContainText('más');
    await expect(box.locator('.srow-prev')).toBeHidden();

    // the wheel over the row scrolls it sideways…
    const r = (await row.boundingBox())!;
    await page.mouse.move(r.x + r.width / 3, r.y + r.height / 2);
    await page.evaluate(() => {
      (window as unknown as { wheels: boolean[] }).wheels = [];
      addEventListener('wheel', e => (window as unknown as { wheels: boolean[] }).wheels.push(e.defaultPrevented));
    });
    await page.mouse.wheel(0, 120);
    await expect.poll(() => row.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await expect(box.locator('.srow-prev')).toBeVisible();
    // …until its end: then the wheel is left alone (the panel and the page keep scrolling)
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 200);
    await expect.poll(() => row.evaluate(el => Math.round(el.scrollWidth - el.clientWidth - el.scrollLeft))).toBeLessThanOrEqual(1);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(100);
    const wheels = await page.evaluate(() => (window as unknown as { wheels: boolean[] }).wheels);
    expect(wheels[0]).toBe(true);
    expect(wheels[wheels.length - 1]).toBe(false);
    await expect(box.locator('.srow-next')).toBeHidden();

    // the chevrons page through it
    await box.locator('.srow-prev').click();
    await expect.poll(() => row.evaluate(el => el.scrollLeft < el.scrollWidth - el.clientWidth - 1)).toBe(true);
    await expect(box.locator('.srow-next')).toBeVisible();
  });
});

test.describe('teclado', () => {
  test('secciones, recetas, vistas y formatos: cada opción se alcanza con el teclado y queda a la vista', async ({ page }) => {
    for (const [w, h] of [[1366, 768], [768, 1024]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await openStudio(page, '#space=arte');
      await openPanel(page);
      // sections: one Tab stop; ← → move and choose; Home and End jump; each one comes into view
      const tabs = page.locator('.panel [role=tab]');
      const n = await tabs.count();
      expect(n).toBe(7);
      await page.getByRole('tab', { name: 'Capas' }).click();
      await expect(page.locator('.panel [role=tab][tabindex="0"]')).toHaveCount(1);
      const seen = new Set<string>();
      for (let i = 0; i < n; i++) {
        const cur = page.locator('.panel [role=tab][aria-selected=true]');
        await expect(cur).toBeFocused();
        seen.add((await cur.textContent())!.trim());
        await expect(cur).toBeInViewport({ ratio: 1 });
        const inside = await cur.evaluate(el => { const row = el.closest('.srow-list')!.getBoundingClientRect(), b = el.getBoundingClientRect(); return b.left >= row.left - 1 && b.right <= row.right + 1; });
        expect(inside, `${await cur.textContent()} a ${w} px`).toBe(true);
        await page.keyboard.press('ArrowRight');
      }
      expect(seen.size).toBe(n);
      await expect(page.getByRole('tab', { name: 'Capas' })).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('End');
      await expect(page.getByRole('tab', { name: 'Mensaje' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tab', { name: 'Mensaje' })).toBeInViewport({ ratio: 1 });
      await page.keyboard.press('Home');
      await expect(page.getByRole('tab', { name: 'Capas' })).toHaveAttribute('aria-selected', 'true');
      // ← → inside the row never move the history
      await expect(page.locator('.seedline')).toContainText('1/1');

      // recipes: each one takes focus with Tab, in view
      const chips = page.locator('.panel .recipes .chip');
      await chips.first().focus();
      for (let i = 0; i < await chips.count(); i++) {
        await expect(chips.nth(i)).toBeFocused();
        await expect.poll(() => chips.nth(i).evaluate(el => { const row = el.closest('.srow-list')!.getBoundingClientRect(), b = el.getBoundingClientRect(); return b.left >= row.left - 1 && b.right <= row.right + 1; })).toBe(true);
        await page.keyboard.press('Tab');
      }
    }

    // views (desktop): a radio group; arrows move and choose
    await page.setViewportSize({ width: 1366, height: 768 });
    const libre = vista(page).getByRole('radio', { name: 'Libre' });
    await libre.click();
    await page.keyboard.press('ArrowRight');
    await expect(vista(page).getByRole('radio', { name: 'Fondo web' })).toBeFocused();
    await expect(vista(page).getByRole('radio', { name: 'Fondo web' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('End');
    await expect(vista(page).getByRole('radio', { name: 'Terminal' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Home');
    await expect(libre).toHaveAttribute('aria-checked', 'true');

    // export formats: the same tab keys
    await page.keyboard.press('e');
    const sheet = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
    await sheet.getByRole('tab', { name: 'Imagen' }).click();
    for (const name of ['Video y GIF', 'Vector', 'Texto y terminal', 'Código', 'Receta']) {
      await page.keyboard.press('ArrowRight');
      await expect(sheet.getByRole('tab', { name })).toBeFocused();
      await expect(sheet.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('las listas del estudio: abrir, recorrer, escribir para saltar, elegir, Escape y foco de vuelta', async ({ page }) => {
    await openStudio(page, '#space=arte');
    await page.getByRole('tab', { name: 'Glifos' }).click();
    const cs = page.getByRole('combobox', { name: 'Caracteres', exact: true });
    await expect(cs).toHaveAttribute('aria-expanded', 'false');
    await cs.focus();
    await page.keyboard.press('Enter');
    const list = page.getByRole('listbox', { name: 'Caracteres', exact: true });
    await expect(list).toBeVisible();
    await expect(cs).toHaveAttribute('aria-expanded', 'true');
    // the chosen option is highlighted; ↓ moves; a letter jumps
    const active = async () => page.locator('#' + (await cs.getAttribute('aria-activedescendant')));
    await expect(await active()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(await active()).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.type('bra');
    await expect(await active()).toContainText('Braille');
    // it opens inside the panel, not over the piece
    const [lb, panel] = [(await page.locator('.pk-pop').boundingBox())!, (await page.locator('.panel').boundingBox())!];
    expect(lb.x).toBeGreaterThanOrEqual(panel.x);
    expect(lb.x + lb.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
    // a preview of the piece with the highlighted set
    await expect(page.locator('.pk-preview')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(cs).toBeFocused();
    await expect(cs).toHaveAttribute('data-value', 'braille');
    await expect(page.getByLabel('Tus caracteres (del vacío al lleno)')).toHaveValue(' ⠁⠃⠇⠏⠟⠿⡿⣿');
    // Escape closes without changing; a click outside too
    await page.keyboard.press('ArrowDown');
    await expect(list).toBeVisible();
    await page.keyboard.press('End');
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(cs).toBeFocused();
    await expect(cs).toHaveAttribute('data-value', 'braille');
    await cs.click();
    await expect(list).toBeVisible();
    await page.mouse.click(40, 400);
    await expect(list).toBeHidden();
    // letters typed in a list are not the studio's shortcuts (R would roll the dice)
    await expect(page.locator('.seedline')).toContainText('1/1');

    // inside a sheet, Escape closes the list and the sheet stays
    await blur(page);
    await page.keyboard.press('e');
    const sheet = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
    await sheet.getByRole('tab', { name: 'Imagen' }).click();
    const size = sheet.getByRole('combobox', { name: 'Tamaño', exact: true });
    await size.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await choose(page, size, /^1080×1080/);
    await expect(size).toHaveAttribute('data-value', 'sq');
    await expect(sheet.getByText('Resultado: 1080×1080 px.')).toBeVisible();
  });
});

test.describe('controles que se explican', () => {
  test('la pista aparece con el teclado y «?» abre la explicación y los ejemplos dentro del panel', async ({ page }) => {
    await openStudio(page, '#space=arte');
    await page.getByRole('tab', { name: 'Glifos' }).click();
    const aspect = page.getByRole('slider', { name: 'Forma de la celda (alto ÷ ancho)' });
    // the hint is the control's description (screen readers) and shows near it with the keyboard
    await expect(aspect).toHaveAccessibleDescription(/terminal/);
    await page.getByRole('slider', { name: 'Tamaño de celda' }).focus();
    await page.keyboard.press('Tab'); // its «?»
    await page.keyboard.press('Tab');
    await expect(aspect).toBeFocused();
    const bubble = page.locator('.hint-bubble');
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText('terminal');
    const [b, panel] = [(await bubble.boundingBox())!, (await page.locator('.panel').boundingBox())!];
    expect(b.x).toBeGreaterThanOrEqual(panel.x);
    expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
    await page.keyboard.press('Escape');
    await expect(bubble).toBeHidden();

    // «?»: the fuller explanation inline (it pushes the next controls down, it covers nothing)
    const q = page.getByRole('button', { name: 'Qué es «Forma de la celda (alto ÷ ancho)»' });
    await expect(q).toHaveAttribute('aria-expanded', 'false');
    await q.click();
    await expect(q).toHaveAttribute('aria-expanded', 'true');
    const more = page.locator('#' + (await q.getAttribute('aria-controls')));
    await expect(more).toBeVisible();
    await expect(more).toContainText('1 da celdas cuadradas');
    // visual examples of the current piece, applicable with a click
    const strip = more.getByRole('group', { name: 'Formas de celda' });
    await expect(strip.getByRole('button')).toHaveCount(3);
    await strip.getByRole('button', { name: /^Terminal/ }).click();
    await expect(aspect).toHaveValue('2');
    const mb = (await more.boundingBox())!;
    expect(mb.x).toBeGreaterThanOrEqual(panel.x);
    // and back to the initial value from the explanation (no double click needed)
    await more.getByRole('button', { name: /Volver al valor inicial/ }).click();
    await expect(aspect).toHaveValue('1.4');
    await q.press('Enter');
    await expect(more).toBeHidden();
  });

  test('los estados pulsados y elegidos se leen (también con el ratón encima)', async ({ page }) => {
    await openStudio(page, '#space=arte');
    const bad: string[] = [];
    const check = async (where: string) => {
      for (const c of await pressedColours(page)) {
        const k = contrastOf(c.fg, c.bg);
        if (k < 4.5) bad.push(`${where}: ${c.what} ${c.fg} sobre ${c.bg} = ${k.toFixed(2)}:1`);
      }
    };
    await check('inicio');
    const libre = vista(page).getByRole('radio', { name: 'Libre' });
    await libre.hover();
    await check('«Libre» con el ratón encima');
    await libre.focus();
    await check('«Libre» con el foco');
    for (const v of ['Fondo web', 'Historia / Reel 9:16', 'Tarjeta']) {
      await vista(page).getByRole('radio', { name: v }).click();
      await vista(page).getByRole('radio', { name: v }).hover();
      await check('vista ' + v);
    }
    for (const t of ['Color', 'Glifos', 'Movimiento', 'Fuente']) {
      await page.getByRole('tab', { name: t }).click();
      await page.getByRole('tab', { name: t }).hover();
      await check('pestaña ' + t);
    }
    await page.locator('.panel .recipes .chip').first().click();
    await page.locator('.panel .recipes .chip[aria-pressed=true]').hover();
    await check('receta elegida');
    await page.getByRole('button', { name: 'Ajustes del azar' }).click();
    await check('ajustes del azar');
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

test.describe('vistas', () => {
  test('Pantalla de móvil: una página de 390×844 con su contenido, que se exporta como código o imagen ×3', async ({ page }) => {
    await openStudio(page, '#space=fondos');
    await vista(page).getByRole('radio', { name: 'Pantalla de móvil' }).click();
    await expect(page.getByText('Tu pieza como fondo de una web en un teléfono')).toBeVisible();
    await expect.poll(() => page.locator('.stage canvas').first().evaluate(c => [c.clientWidth, c.clientHeight])).toEqual([390, 844]);
    // the text regions the legibility estimate reads
    await expect(page.locator('.vw-mobile-content [data-legib="headline"]')).toHaveCount(1);
    await expect(page.locator('.vw-mobile-content [data-legib="body"]')).toHaveCount(1);
    await expect(page.locator('.vw-mobile-content [data-legib="button"]')).toHaveCount(2);
    // the whole phone fits the stage (drawn smaller on a short one), once the sizes have settled
    await expect.poll(async () => {
      const [area, phone] = [(await page.locator('.vw-center').boundingBox())!, (await page.locator('.vw-handset').boundingBox())!];
      return phone.y >= area.y - 1 && phone.y + phone.height <= area.y + area.height + 1 && phone.height > 200;
    }).toBe(true);
    await page.getByRole('button', { name: 'Exportar para este destino' }).click();
    await expect(page.getByRole('tab', { name: 'Código' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Imagen 1170×2532' }).click();
    await expect(page.getByRole('tab', { name: 'Imagen' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#ex-size')).toHaveAttribute('data-value', 'v4');
    await expect(page.getByText('Resultado: 1170×2532 px.')).toBeVisible();
  });

  test('Historia / Reel 9:16: limpia por defecto, con las zonas de las apps sólo si las pides', async ({ page }) => {
    await openStudio(page, '#space=fondos');
    await vista(page).getByRole('radio', { name: 'Historia / Reel 9:16' }).click();
    await expect(page.locator('.vw-safe')).toHaveCount(0);
    await page.locator('.vbar-switch').getByText('Zonas de interfaz de Reels/TikTok/Stories (aproximadas)').click();
    await expect(page.getByRole('switch', { name: /Zonas de interfaz/ })).toBeChecked();
    await expect(page.locator('.vw-safe')).toHaveCount(3);
    await expect(page.locator('.vw-safe-top')).toContainText('aprox.');
    await page.getByRole('button', { name: 'Imagen 1080×1920' }).click();
    await expect(page.locator('#ex-size')).toHaveAttribute('data-value', 'story');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Exportar para este destino' }).click();
    await expect(page.getByRole('tab', { name: 'Video y GIF' })).toHaveAttribute('aria-selected', 'true');
  });
});
