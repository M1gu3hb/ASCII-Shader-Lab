import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { dismissWelcome } from './helpers';
import { FOTO_STUDIO } from './foto-helpers';

/**
 * The lab on a phone held upright (360–430 px wide) and on its side: the piece takes the screen between
 * the top bar and a dock at the bottom, the frequent actions are in that dock (thumb reach), every
 * section of the settings is one tap away, the settings sheet rests at a peek, half or full height and
 * the piece stays whole above it at half, «inmersivo» leaves only the piece and four controls.
 */
const SIZES = {
  '360×740': { width: 360, height: 740 },
  '390×844': { width: 390, height: 844 },
  '430×932': { width: 430, height: 932 },
};

async function phone(browser: Browser, viewport: { width: number; height: number }, path = '/studio/') {
  const { defaultBrowserType: _, ...opts } = devices['Pixel 7'] as typeof devices['Pixel 7'] & { defaultBrowserType?: string };
  const ctx = await browser.newContext({ ...opts, viewport, screen: viewport });
  // the opening animation is not what these tests look at
  await ctx.addInitScript(() => { try { sessionStorage.setItem('mt.intro', '1'); } catch { /* */ } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(path);
  await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
  await dismissWelcome(page);
  return { ctx, page, errors };
}

type Box = { x: number; y: number; width: number; height: number };
const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox()) as Box;
const sheet = (page: Page) => page.locator('aside.panel');

/**
 * The sheet at rest: its transitions (the slide in, the height between rests) are over and its box stops
 * changing. (Box alone is not enough on a busy machine: frames come seconds apart there, so two reads
 * can agree in the middle of a transition.)
 */
async function settled(page: Page) {
  let last = '';
  await expect.poll(async () => {
    const moving = await sheet(page).evaluate(el => el.getAnimations().filter(a => a.playState === 'running').length);
    const b = await sheet(page).boundingBox();
    const now = `${moving}|${Math.round(b?.y ?? 0)}|${Math.round(b?.height ?? 0)}`;
    const same = moving === 0 && now === last;
    last = now;
    return same;
  }, { intervals: [300, 300, 300, 500, 500, 1000] }).toBe(true);
}

for (const [name, vp] of Object.entries(SIZES)) {
  test.describe(name, () => {
    test('la pieza ocupa la pantalla y lo frecuente queda abajo, al alcance del pulgar', async ({ browser }) => {
      const { ctx, page, errors } = await phone(browser, vp);
      const canvas = await box(page, '.stage canvas');
      const top = await box(page, '.topbar');
      const seed = await box(page, '.seedline');
      // nothing of the piece hides behind the dock: it ends where the dock starts
      expect(canvas.y + canvas.height).toBeLessThanOrEqual(seed.y + 1);
      expect(canvas.y).toBeGreaterThanOrEqual(top.y + top.height - 1);
      // three quarters of the screen at least (it was about 62–70 % visible before, behind the deck)
      expect(canvas.width * canvas.height / (vp.width * vp.height)).toBeGreaterThan(0.74);
      // the frequent actions: in the lowest fifth of the screen, 44 px at least, all in view
      for (const label of ['Resultado anterior (←)', 'Guardar en la colección', 'Exportar', 'Ajustes de la pieza']) {
        const b = (await page.getByRole('button', { name: label, exact: true }).boundingBox())!;
        expect(b.y, label).toBeGreaterThan(vp.height * 0.8);
        expect(b.width >= 44 && b.height >= 44, label).toBe(true);
        expect(b.x >= 0 && b.x + b.width <= vp.width, label).toBe(true);
      }
      const dice = (await page.locator('.act.dice').boundingBox())!;
      expect(dice.y).toBeGreaterThan(vp.height * 0.8);
      // the next button (or «Nuevo» at the end of the history)
      await expect(page.locator('.deck .nav button').nth(1)).toBeInViewport();
      // no sideways scrolling; Exportar is not also in the top bar
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await expect(page.locator('.topbar .tb-export')).toBeHidden();
      expect(errors).toEqual([]);
      await ctx.close();
    });

    test('ajustes: una hoja con tres alturas; a media altura la pieza se ve entera encima', async ({ browser }) => {
      const { ctx, page } = await phone(browser, vp);
      await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
      await expect(sheet(page)).toHaveAttribute('data-snap', 'half');
      await settled(page);
      // half: the whole piece above the sheet, and a good part of the screen
      await expect.poll(async () => {
        const [c, s] = await Promise.all([box(page, '.stage canvas'), box(page, 'aside.panel')]);
        return c.y + c.height <= s.y + 1 && c.height / vp.height > 0.28;
      }).toBe(true);
      // every section in view at once, each a 44 px target, one tap
      const tabs = await sheet(page).getByRole('tab').all();
      for (const t of tabs) await expect(t).toBeInViewport({ ratio: 1 });
      await page.getByRole('tab', { name: 'Color' }).tap();
      await expect(page.getByRole('tab', { name: 'Color' })).toHaveAttribute('aria-selected', 'true');
      // the handle: a press goes to full height, another to the peek (only the sections)
      const grab = page.getByRole('button', { name: /^Tamaño de los ajustes/ });
      await grab.tap();
      await expect(sheet(page)).toHaveAttribute('data-snap', 'full');
      await settled(page);
      const full = await box(page, 'aside.panel');
      const top = await box(page, '.topbar');
      expect(full.y).toBeGreaterThanOrEqual(top.y + top.height);
      await grab.tap();
      await expect(sheet(page)).toHaveAttribute('data-snap', 'peek');
      await settled(page);
      // at the peek the controls are out of sight and out of the focus order; the piece nearly whole
      await expect(page.locator('#pane')).toHaveAttribute('inert', '');
      const [c, s] = await Promise.all([box(page, '.stage canvas'), box(page, 'aside.panel')]);
      expect(c.y + c.height).toBeLessThanOrEqual(s.y + 1);
      expect(c.height / vp.height).toBeGreaterThan(0.45);
      // a section chosen at the peek opens its controls
      await page.getByRole('tab', { name: 'Glifos' }).tap();
      await expect(sheet(page)).toHaveAttribute('data-snap', 'half');
      // keys on the handle: ↑ to full, ↓ back; Escape closes the sheet (then the dock keeps the focus in reach)
      await grab.focus();
      await page.keyboard.press('ArrowUp');
      await expect(sheet(page)).toHaveAttribute('data-snap', 'full');
      await page.keyboard.press('ArrowDown');
      await expect(sheet(page)).toHaveAttribute('data-snap', 'half');
      await page.keyboard.press('Escape');
      await expect(page.locator('.app')).toHaveClass(/panel-off/);
      await expect(sheet(page)).not.toBeInViewport();
      // the dice stayed in reach all along; the dock button reopens it at half
      await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
      await expect(sheet(page)).toHaveAttribute('data-snap', 'half');
      await ctx.close();
    });
  });
}

test.describe('390×844', () => {
  test('inmersivo: sólo la pieza, el azar, anterior, siguiente y ajustes; Escape vuelve', async ({ browser }) => {
    const { ctx, page, errors } = await phone(browser, SIZES['390×844']);
    const toggle = page.getByRole('button', { name: 'Modo inmersivo' });
    await toggle.tap();
    await expect(page.locator('.app')).toHaveClass(/imm-on/);
    for (const sel of ['.topbar', '.deck', '.seedline', '.vbar']) await expect(page.locator(sel).first()).toBeHidden();
    const bar = page.getByRole('group', { name: 'Modo inmersivo' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button')).toHaveCount(5);
    // the focus went to the dice
    await expect(bar.getByRole('button', { name: 'Azar' })).toBeFocused();
    // the piece takes the whole screen
    await expect.poll(async () => { const c = await box(page, '.stage canvas'); return Math.round(c.width * c.height); }).toBeGreaterThanOrEqual(390 * 844 - 2);
    const n0 = (await page.locator('.seedline').textContent())?.match(/(\d+)\/(\d+)/)?.[1];
    await bar.getByRole('button', { name: 'Azar' }).tap();
    await expect.poll(async () => (await page.locator('.seedline').textContent())?.match(/(\d+)\/(\d+)/)?.[1]).not.toBe(n0);
    await bar.getByRole('button', { name: 'Resultado anterior' }).tap();
    await expect(page.locator('.seedline')).toContainText(`${n0}/`);
    // «Ajustes» opens the sheet over the bar, the piece above; closing it goes back to the piece alone
    await bar.getByRole('button', { name: 'Ajustes' }).tap();
    await expect(sheet(page)).toBeInViewport();
    await settled(page);
    const [s, b] = await Promise.all([box(page, 'aside.panel'), bar.boundingBox()]);
    expect(s.y + s.height).toBeLessThanOrEqual(b!.y + 1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.app')).toHaveClass(/panel-off/);
    await expect(page.locator('.app')).toHaveClass(/imm-on/);
    // Escape again leaves, and the focus comes back to the toggle
    await page.keyboard.press('Escape');
    await expect(page.locator('.app')).not.toHaveClass(/imm-on/);
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(toggle).toBeFocused();
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('«Más» reúne lo que no cabe en el dock, y el historial en miniaturas se puede mostrar', async ({ browser }) => {
    const { ctx, page } = await phone(browser, SIZES['390×844']);
    await page.getByRole('button', { name: 'Más acciones' }).tap();
    const more = page.getByRole('dialog', { name: 'Más acciones' });
    await expect(more).toBeVisible();
    for (const label of ['Variar', 'Explorar ocho variaciones', 'Ajustes del azar', 'Historial en miniaturas', 'Copiar enlace', 'Escribir una semilla']) {
      await expect(more.getByRole('button', { name: new RegExp('^' + label) })).toBeVisible();
    }
    // above the dock, never over it
    const [m, d] = await Promise.all([more.boundingBox(), page.locator('.seedline').boundingBox()]);
    expect(m!.y + m!.height).toBeLessThanOrEqual(d!.y + 1);
    const n = Number((await page.locator('.seedline').textContent())?.match(/\/(\d+)/)?.[1]);
    await more.getByRole('button', { name: /^Variar/ }).tap();
    await expect(more).toBeHidden();
    await expect(page.locator('.seedline')).toContainText(`/${n + 1}`);
    // the strip: shown above the dock, and the piece gives it room (it does not hide behind it)
    const before = await box(page, '.stage canvas');
    await page.getByRole('button', { name: 'Más acciones' }).tap();
    await page.getByRole('button', { name: /^Historial en miniaturas/ }).tap();
    await expect(page.locator('.ph-strip .thumb')).toHaveCount(n + 1);
    await page.keyboard.press('Escape');
    await expect(more).toBeHidden();
    await expect(page.getByRole('button', { name: 'Más acciones' })).toBeFocused();
    await expect.poll(async () => {
      const [c, s] = await Promise.all([box(page, '.stage canvas'), box(page, '.ph-strip')]);
      return c.y + c.height <= s.y + 1 && c.height < before.height;
    }).toBe(true);
    await page.locator('.ph-strip .thumb').first().tap();
    await expect(page.locator('.seedline')).toContainText(`1/${n + 1}`);
    await ctx.close();
  });

  test('exportar desde el dock: la hoja a pantalla completa, todos los formatos a la vista, y compartir donde se puede', async ({ browser }) => {
    const { ctx, page } = await phone(browser, SIZES['390×844']);
    // a system that shares files (as phones do): the page's share is recorded instead of opening a sheet
    await page.evaluate(() => {
      const w = window as unknown as { shared: string[] };
      w.shared = [];
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d: { files?: File[] }) => !!d.files?.length });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: { files: File[] }) => { w.shared.push(d.files.map(f => `${f.name}:${f.type}:${f.size > 0}`).join()); } });
    });
    await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
    await expect(sheet(page)).toBeInViewport();
    await page.locator('.deck .ph-export').tap();
    const dlg = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
    await expect(dlg).toBeVisible();
    // the settings sheet stepped aside: the sizes «como la vista» are the piece's whole room
    await expect(page.locator('.app')).toHaveClass(/panel-off/);
    for (const t of await dlg.getByRole('tab').all()) await expect(t).toBeInViewport({ ratio: 1 });
    const [d] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Descargar imagen' }).tap()]);
    expect(d.suggestedFilename()).toMatch(/\.png$/);
    // the sheet covers the notices on a phone: what was saved, and «Compartir», are at its foot
    const foot = dlg.locator('.ex-saved');
    await expect(foot).toContainText(d.suggestedFilename());
    const share = foot.getByRole('button', { name: 'Compartir' });
    await expect(share).toBeInViewport();
    expect((await share.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await share.tap();
    await expect.poll(() => page.evaluate(() => (window as unknown as { shared: string[] }).shared)).toEqual([expect.stringMatching(/\.png:image\/png:true$/)]);
    await ctx.close();
  });

  test('accesibilidad con la hoja abierta y en inmersivo: sin fallos graves', async ({ browser }) => {
    const { ctx, page } = await phone(browser, SIZES['390×844']);
    const scan = async (where: string) => {
      const r = await new AxeBuilder({ page }).include('.app').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${where} ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    };
    await scan('dock');
    await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
    await settled(page);
    await scan('hoja');
    await page.getByRole('button', { name: 'Cerrar ajustes' }).tap();
    await page.getByRole('button', { name: 'Modo inmersivo' }).tap();
    // the bar's short entrance (a fade) over: contrast is measured on what stays
    await expect.poll(() => page.locator('.imm-bar').evaluate(el => el.getAnimations().length)).toBe(0);
    await scan('inmersivo');
    await ctx.close();
  });
});

/**
 * The top bar with the «Laboratorio ⇄ Foto y video» switch, down to the narrowest phones (320 px, a
 * folding phone's 344 px cover screen). Under 360 px Colección (collection, sessions, projects: nowhere
 * else on a phone) was pushed past the right edge (12 px of it in view at 320); and the switch's menu, 290 px
 * wide from where the switch sits, ran past the right edge up to 390 px (31 px of it cut at 360).
 */
for (const width of [320, 344, 360, 390]) {
  test(`${width} px de ancho: la barra superior y el menú «Foto y video» caben enteros, Colección incluida`, async ({ browser }) => {
    const { ctx, page, errors } = await phone(browser, { width, height: 700 });
    const controls = await page.locator('.topbar').locator('a, button').evaluateAll(els => els
      .filter(el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map(el => { const r = el.getBoundingClientRect(); return { name: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '', left: r.left, right: r.right, w: r.width, h: r.height }; }));
    expect(controls.length).toBeGreaterThanOrEqual(5);
    for (const c of controls) {
      expect(c.left >= 0 && c.right <= width, `${c.name} [${Math.round(c.left)}–${Math.round(c.right)}]`).toBe(true);
      expect(c.w >= 44 && c.h >= 44, `${c.name} ${Math.round(c.w)}×${Math.round(c.h)}`).toBe(true);
    }
    const coll = page.getByRole('button', { name: /^Colección/ });
    await expect(coll).toBeInViewport({ ratio: 1 });
    await coll.tap();
    await expect(page.locator('dialog.sheet[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.sheet[open]')).toHaveCount(0);
    // while the photo studio is paused (VITE_FOTO_STUDIO unset) the bar has no switch and no menu
    if (!FOTO_STUDIO) { await expect(page.getByRole('button', { name: 'Foto y video' })).toHaveCount(0); expect(errors).toEqual([]); await ctx.close(); return; }
    // the photo studio: its menu opens from the bar, whole on screen (8 px from the edge at least)
    await page.getByRole('button', { name: 'Foto y video' }).tap();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(2);
    for (const item of await menu.getByRole('menuitem').all()) await expect(item).toBeInViewport({ ratio: 1 });
    const m = (await menu.boundingBox())!;
    expect(m.x, 'menu left').toBeGreaterThanOrEqual(0);
    expect(m.x + m.width, 'menu right').toBeLessThanOrEqual(width - 8 + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test.describe('de lado (844×390)', () => {
  test('el dock en una fila, los ajustes en una columna junto a la pieza', async ({ browser }) => {
    const { ctx, page, errors } = await phone(browser, { width: 844, height: 390 });
    const [c, dock, seed] = await Promise.all([box(page, '.stage canvas'), box(page, '.deck'), box(page, '.seedline')]);
    // one row at the bottom: what is on stage beside the actions
    expect(Math.abs(dock.y - seed.y)).toBeLessThanOrEqual(2);
    expect(seed.x + seed.width).toBeLessThanOrEqual(dock.x + 1);
    expect(c.y + c.height).toBeLessThanOrEqual(dock.y + 1);
    // most of the screen is the piece (it was under a third before)
    expect(c.width * c.height / (844 * 390)).toBeGreaterThan(0.65);
    await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
    await expect(sheet(page)).toBeInViewport();
    await expect.poll(async () => {
      const [c2, s] = await Promise.all([box(page, '.stage canvas'), box(page, 'aside.panel')]);
      return c2.x + c2.width <= s.x + 1 && c2.width > 844 * 0.45 && s.y + s.height <= dock.y + 1;
    }).toBe(true);
    for (const t of await sheet(page).getByRole('tab').all()) await expect(t).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    // no section reaches past the column sideways (its headings did, by 2 px, before the section restyle)
    for (const t of await sheet(page).getByRole('tab').all()) {
      await t.tap();
      await expect(t).toHaveAttribute('aria-selected', 'true');
      expect(await page.locator('#pane').evaluate(el => el.scrollWidth - el.clientWidth), await t.textContent() ?? '').toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
