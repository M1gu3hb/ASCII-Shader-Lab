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
  // let entrance animations end: a half-faded text would read as low contrast. On a busy machine the
  // page's clock can lag well behind the wall clock, so wait for the finite animations and the glyph
  // curtains (glyphfx) themselves, not for a fixed time only.
  await page.waitForTimeout(450);
  await page.waitForFunction(() => !document.querySelector('.mt-curtain') && document.getAnimations().every(a => {
    const t = a.effect?.getComputedTiming();
    return a.playState !== 'running' || !t || t.endTime === Infinity;
  }), undefined, { timeout: 8000 }).catch(() => undefined);
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

/**
 * Whether the focused element shows where the keyboard is: its own outline or ring, the studio's range
 * track ring, or the visible part of a switch (the checkbox itself is transparent over it).
 */
const FOCUS_RING = () => {
  const has = (s: CSSStyleDeclaration) => (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow !== 'none' && s.boxShadow !== '');
  (window as unknown as { focusRing: (a: HTMLElement) => boolean }).focusRing = (a: HTMLElement) => {
    if (has(getComputedStyle(a))) return true;
    if (a instanceof HTMLInputElement && a.type === 'range') return has(getComputedStyle(a, '::-webkit-slider-runnable-track'));
    const next = a.nextElementSibling as HTMLElement | null;
    return !!next && a instanceof HTMLInputElement && has(getComputedStyle(next));
  };
};
declare function focusRing(a: HTMLElement): boolean;

/**
 * For focus styles drawn on parts the computed style does not show (a slider's track and thumb): the
 * focused element looks different from the same element unfocused.
 */
async function looksFocused(page: Page): Promise<boolean> {
  const h = (await page.evaluateHandle(() => document.activeElement)).asElement();
  if (!h) return false;
  const on = await h.screenshot();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const off = await h.screenshot();
  await h.focus();
  return !on.equals(off);
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
    await page.locator('.topbar .share-btn').click();
    await expect(page.getByRole('dialog', { name: 'Compartir' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tu imagen no viaja en el enlace' })).toBeVisible();
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

  test('legibilidad y zona protegida: detalles, ajustes finos y guía del fondo, sin fallos graves', async ({ page }) => {
    await openStudio(page);
    await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Fondo web', exact: true }).click();
    await page.getByRole('group', { name: 'Zona protegida' }).getByRole('button', { name: 'Suave', exact: true }).click();
    const more = page.locator('.vbar .legib-more');
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('slider', { name: 'Opacidad' })).toBeVisible();
    await serious(page, 'legibilidad con detalles', '.stage-top');
    expect(await nestedInteractive(page)).toEqual([]);
    await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Pantalla de móvil', exact: true }).click();
    await serious(page, 'pantalla de móvil con zona', '.stage-top');
    // the fondo guide, step 2, with the estimate and the zone in the step
    await page.goto('/studio/?camino=fondo');
    await page.locator('aside.guide-panel').getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.locator('#guide-title')).toContainText('Que se lea el contenido');
    await expect(page.locator('aside.guide-panel .legib-report')).toBeVisible();
    await serious(page, 'guía del fondo, paso 2', 'aside.guide-panel');
    expect(await nestedInteractive(page)).toEqual([]);
  });

  test('con el teclado: cada parada tiene nombre y foco visible, y nunca cae en una vista previa', async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(FOCUS_RING);
    await openStudio(page);
    await page.getByRole('button', { name: 'Pausar animación' }).click();
    await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Fondo web', exact: true }).click();
    await page.locator('body').click({ position: { x: 2, y: 2 } }).catch(() => undefined);
    const seen = new Set<string>();
    const problems: string[] = [];
    for (let i = 0; i < 140; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || a === document.body) return null;
        const by = a.getAttribute('aria-labelledby');
        const name = (a.getAttribute('aria-label') || (by && by.split(' ').map(id => document.getElementById(id)?.textContent ?? '').join(' ')) || (a as HTMLInputElement).labels?.[0]?.textContent || a.getAttribute('title') || a.textContent || '').trim();
        const ring = focusRing(a);
        const inPreview = !!a.closest('[inert], [aria-hidden="true"]');
        return { id: `${a.tagName.toLowerCase()}.${a.className}`, name, ring, inPreview };
      });
      if (!f) continue;
      const key = f.id + '|' + f.name;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!f.name) problems.push(`sin nombre: ${f.id}`);
      if (!f.ring && !(await looksFocused(page))) problems.push(`sin foco visible: ${f.id} «${f.name}»`);
      if (f.inPreview) problems.push(`foco dentro de algo oculto: ${f.id}`);
    }
    expect(seen.size).toBeGreaterThan(25);
    expect(problems).toEqual([]);
  });

  test('con el teclado dentro de las hojas: cada parada tiene nombre y foco visible', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(FOCUS_RING);
    await openStudio(page);
    // a still stage keeps screenshots quick (software GPU)
    await page.getByRole('button', { name: 'Pausar animación' }).click();
    const walk = async (what: string, n: number) => {
      const problems: string[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < n; i++) {
        await page.keyboard.press('Tab');
        const f = await page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          if (!a || a === document.body) return null;
          const by = a.getAttribute('aria-labelledby');
          const name = (a.getAttribute('aria-label') || (by && by.split(' ').map(id => document.getElementById(id)?.textContent ?? '').join(' ')) || (a as HTMLInputElement).labels?.[0]?.textContent || a.getAttribute('title') || a.textContent || '').trim();
          return { id: `${a.tagName.toLowerCase()}.${a.className}`, name, ring: focusRing(a), inDialog: !!a.closest('dialog[open]') };
        });
        if (!f || seen.has(f.id + f.name)) continue;
        seen.add(f.id + f.name);
        if (!f.name) problems.push(`${what}: sin nombre ${f.id}`);
        if (!f.ring && !(await looksFocused(page))) problems.push(`${what}: sin foco visible ${f.id} «${f.name}»`);
        if (!f.inDialog) problems.push(`${what}: el foco salió de la hoja (${f.id})`);
      }
      expect(problems).toEqual([]);
      expect(seen.size).toBeGreaterThan(5);
    };
    await page.keyboard.press('s');
    await page.getByRole('button', { name: /^Colección/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Colección e historial' })).toBeVisible();
    await walk('colección', 30);
    await page.keyboard.press('Escape');
    for (const tab of ['Vector', 'Código', 'Receta']) {
      await page.keyboard.press('e');
      await expect(page.getByRole('dialog', { name: 'Llevar la pieza fuera' })).toBeVisible();
      await page.getByRole('tab', { name: tab }).click();
      await page.getByRole('tab', { name: tab }).focus();
      await walk('exportar ' + tab, 25);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Llevar la pieza fuera' })).toBeHidden();
    }
  });

  test('el texto pequeño sobre la pieza conserva el contraste aunque pase algo blanco detrás', async ({ page }) => {
    await openStudio(page);
    await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Fondo web', exact: true }).click();
    await page.locator('.vbar .legib-more').click();
    // the estimate's detail (its list, with a mark per text) is part of what is measured: wait for it
    await expect(page.locator('.vbar .legib-say')).not.toHaveText('Midiendo…', { timeout: 30_000 });
    // measured between text effects: while a label scrambles, its own text is transparent under the frames
    const measure = () => page.evaluate(() => {
      if (document.querySelector('[data-scr], .mt-scr, .mt-curtain')) return null;
      const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const rgba = (s: string) => { const m = (s.match(/[\d.]+/g) ?? []).map(Number); return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, m.length > 3 ? m[3] : 1]; };
      const out: Array<{ sel: string; ratio: number }> = [];
      for (const sel of ['.seedline', '.vbar-sel', '.vbar-more', '.vbar .legib-detail']) {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) continue;
        // the element's own background over pure white (the worst glyph behind it)
        const [r, g, b, a] = rgba(getComputedStyle(el).backgroundColor);
        const bg = [r * a + 255 * (1 - a), g * a + 255 * (1 - a), b * a + 255 * (1 - a)];
        const yb = lum(bg[0], bg[1], bg[2]);
        let min = 21;
        for (const t of el.querySelectorAll<HTMLElement>('*')) {
          if (!t.childNodes.length || ![...t.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim())) continue;
          const s = getComputedStyle(t);
          if (s.visibility === 'hidden' || s.display === 'none' || t.closest('button')) continue;
          const [tr, tg, tb] = rgba(s.color);
          const yt = lum(tr, tg, tb);
          // text on an opaque fill of its own inside the element (a mark's badge) is read against that fill
          let yf = yb;
          for (let p: HTMLElement | null = t; p && p !== el; p = p.parentElement) {
            const [fr, fg, fb, fa] = rgba(getComputedStyle(p).backgroundColor);
            if (fa >= 0.99) { yf = lum(fr, fg, fb); break; }
          }
          min = Math.min(min, (Math.max(yt, yf) + 0.05) / (Math.min(yt, yf) + 0.05));
        }
        out.push({ sel, ratio: Math.round(min * 10) / 10 });
      }
      return out;
    });
    let worst: Array<{ sel: string; ratio: number }> = [];
    await expect.poll(async () => { const m = await measure(); if (m) worst = m; return m !== null; }, { timeout: 10_000 }).toBe(true);
    expect(worst.length).toBeGreaterThanOrEqual(3);
    for (const w of worst) expect(w.ratio, w.sel).toBeGreaterThanOrEqual(4.5);
  });

  test('portada con sus bloques interactivos cargados (espacios, azar, salidas), sin fallos graves', async ({ page }) => {
    await page.goto('/');
    for (const id of ['espacios', 'azar', 'exportar', 'guias', 'oficio']) {
      await page.evaluate(i => document.getElementById(i)!.scrollIntoView({ block: 'start' }), id);
      await page.waitForTimeout(400);
    }
    await expect(page.getByRole('list', { name: 'Hoja de contactos del dado' }).getByRole('button')).toHaveCount(14);
    await page.getByRole('tablist', { name: 'Espacios del estudio' }).getByRole('tab', { name: /Piezas/ }).click();
    await page.getByRole('button', { name: 'Tirar', exact: true }).click();
    await page.getByRole('tablist', { name: 'Destinos' }).getByRole('tab', { name: 'Web' }).click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(900);
    await serious(page, '/ (interactiva)');
    expect(await nestedInteractive(page)).toEqual([]);
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
