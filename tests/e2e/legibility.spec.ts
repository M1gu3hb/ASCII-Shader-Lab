import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { download, openStudio } from './helpers';

/**
 * Legibility of the page previews: the estimate reads the real text regions over several frames and never
 * says «se lee bien» over bright glyphs (the owner's false positive: 8.5:1 «Se lee bien» on Arte › Bermellón
 * with light text while the paragraph was lost); the protected zone fixes it, enters the estimate and
 * goes into the exported code; the previews are pictures, not the studio's own headings.
 */

const bar = (page: Page) => page.getByRole('radiogroup', { name: 'Vista' });
const pick = (page: Page, name: string) => bar(page).getByRole('radio', { name, exact: true }).click();
const line = (page: Page) => page.locator('.vbar .legib-line');
const say = (page: Page) => line(page).locator('.legib-say');
async function openDetails(page: Page) {
  const more = page.locator('.vbar .legib-more');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
}

async function bermellonWithLightText(page: Page, view = 'Fondo web') {
  await page.getByRole('navigation', { name: 'Espacios del estudio' }).getByRole('button', { name: 'Arte', exact: true }).click();
  await page.locator('.panel').getByRole('button', { name: 'Bermellón', exact: true }).first().click();
  await pick(page, view);
  await page.getByRole('group', { name: 'Texto' }).getByRole('button', { name: 'Claro', exact: true }).click();
  await page.mouse.move(1, 1);
}

test.describe('legibilidad de las vistas con contenido', () => {
  test('Bermellón con texto claro: nunca «se lee bien»; dice qué falla y por qué; la zona protegida lo arregla', async ({ page }) => {
    const errors = await openStudio(page);
    await bermellonWithLightText(page);
    await expect(say(page)).toHaveText(/^Cuesta leer .*el párrafo/, { timeout: 45_000 });
    // several frames later it still does not read well
    await expect(line(page)).toHaveAttribute('data-level', 'baja');
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(1300);
      await expect(say(page)).not.toHaveText('Se lee bien');
    }
    // the details: each region, the reason in words, what to try
    await openDetails(page);
    const detail = page.locator('.vbar .legib-detail');
    await expect(detail.locator('li.baja').filter({ hasText: 'El párrafo' })).toContainText('caracteres casi tan claros como el texto');
    await expect(detail.getByText(/Activa la zona protegida/)).toBeVisible();
    await expect(detail.getByText(/Es una estimación/)).toBeVisible();
    // the protected zone: «Fuerte», behind the text
    await page.getByRole('group', { name: 'Zona protegida' }).getByRole('button', { name: 'Fuerte', exact: true }).click();
    await expect(page.locator('.preview-content .pc-shield').first()).toBeVisible();
    await expect(say(page)).toHaveText('Se lee bien', { timeout: 45_000 });
    // the fine settings: shape, opacity and blur (moving one makes it «a medida»)
    await page.getByRole('group', { name: 'Forma' }).getByRole('button', { name: 'Degradado', exact: true }).click();
    await expect(page.locator('.vw-scrim-gradient')).toHaveCount(1);
    await page.getByRole('slider', { name: 'Opacidad' }).fill('0.9');
    await expect(page.getByRole('group', { name: 'Zona protegida' }).getByRole('button', { name: 'A medida' })).toHaveAttribute('aria-pressed', 'true');
    // back to none: the estimate follows
    await page.getByRole('group', { name: 'Zona protegida' }).getByRole('button', { name: 'No', exact: true }).click();
    await expect(page.locator('.vw-scrim')).toHaveCount(0);
    await expect(say(page)).toHaveText(/^Cuesta leer/, { timeout: 45_000 });
    expect(errors).toEqual([]);
  });

  test('sin poder leer el lienzo (WebGL perdido) no cuenta fotogramas: «se lee bien» espera a los medidos', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mt.debugLegib', '1'); } catch { /* ignore */ } });
    await openStudio(page);
    await pick(page, 'Fondo web');
    const frames = () => page.evaluate(() => (window as unknown as { __mtLegib?: { n: number } }).__mtLegib?.n ?? 0);
    await expect.poll(frames, { timeout: 45_000 }).toBeGreaterThanOrEqual(1);
    const lost = await page.locator('.stage canvas').first().evaluate(c => {
      const gl = (c as HTMLCanvasElement).getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_lose_context');
      ext?.loseContext();
      return !!ext;
    });
    test.skip(!lost, 'this browser cannot lose a WebGL context on request');
    // (a read already under way when the context went may still land)
    await page.waitForTimeout(300);
    const n = await frames();
    // the studio waits 3 s for the context before it moves to the basic engine: meanwhile nothing is measured
    await page.waitForTimeout(2200);
    expect(await frames()).toBe(n);
  });

  test('Pantalla de móvil: mide su propio contenido y la zona protegida también', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 1200 });
    await openStudio(page);
    await bermellonWithLightText(page, 'Pantalla de móvil');
    await expect(page.locator('.vw-mobile-content [data-legib]')).toHaveCount(5);
    await expect(say(page)).toHaveText(/^Cuesta leer/, { timeout: 45_000 });
    await page.getByRole('group', { name: 'Zona protegida' }).getByRole('button', { name: 'Fuerte', exact: true }).click();
    await expect(say(page)).toHaveText('Se lee bien', { timeout: 45_000 });
  });

  test('las vistas previas son imágenes etiquetadas, no contenido del estudio: sin h1/h2, inertes y ocultas', async ({ page }) => {
    await openStudio(page);
    // the studio has one main heading of its own
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Monotrama, estudio de arte ASCII');
    for (const [view, fig] of [['Fondo web', /^Vista previa: tu pieza como fondo de una página web/], ['Pantalla de móvil', /^Vista previa: tu pieza como fondo de una web en un teléfono/]] as const) {
      await pick(page, view);
      await expect(page.getByRole('figure', { name: fig })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      expect(await page.locator('.vw-area h1, .vw-area h2, .vw-area h3').count()).toBe(0);
      const content = page.locator('.preview-content, .vw-mobile-content').first();
      await expect(content).toHaveAttribute('aria-hidden', 'true');
      expect(await content.evaluate(el => (el as HTMLElement).inert)).toBe(true);
      // the test headline is not a heading of the studio
      expect(await page.getByRole('heading', { name: 'Un titular que se lee sin esfuerzo' }).count()).toBe(0);
    }
    for (const view of ['Tarjeta', 'README']) {
      await pick(page, view);
      expect(await page.locator('.vw-area h1, .vw-area h2, .vw-area h3').count()).toBe(0);
    }
  });

  test('la zona protegida viaja al código: HTML, Web Component y React; el script la dibuja en otra página', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openStudio(page);
    await bermellonWithLightText(page);
    await page.getByRole('group', { name: 'Zona protegida' }).getByRole('button', { name: 'Suave', exact: true }).click();
    await openDetails(page);
    await page.getByRole('group', { name: 'Forma' }).getByRole('button', { name: 'Degradado', exact: true }).click();
    await page.getByRole('button', { name: 'Exportar para este destino' }).click();
    await expect(page.getByRole('tab', { name: 'Código' })).toHaveAttribute('aria-selected', 'true');
    const dlg = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
    await expect(dlg.getByRole('switch', { name: 'Zona protegida' })).toBeChecked();
    await expect(dlg.getByText(/Zona protegida \(suave: 50 % de opacidad, 2 px de desenfoque\), en degradado/)).toBeVisible();
    const code = dlg.getByRole('textbox', { name: 'Código' });
    await expect(code).toHaveValue(/"scrim":\{"color":"#[0-9a-f]{6}","opacity":0.5,"blur":2,"shape":"gradient"\}/);
    const html = await code.inputValue();
    await dlg.getByRole('button', { name: 'Web Component' }).click();
    await expect(code).toHaveValue(/scrim="gradient" scrim-color="#[0-9a-f]{6}" scrim-opacity="0.5" scrim-blur="2"/);
    const usage = await code.inputValue();
    const wcFile = await download(page, () => dlg.getByRole('button', { name: 'Descargar monotrama-field.js' }).click());
    const wcJs = readFileSync(wcFile.path, 'utf8');
    await dlg.getByRole('button', { name: 'React' }).click();
    await expect(code).toHaveValue(/const SCRIM = \{"color":"#[0-9a-f]{6}","opacity":0.5,"blur":2,"shape":"gradient"\}/);
    // block: a class for the person's own blocks
    await page.keyboard.press('Escape');
    await openDetails(page);
    await page.getByRole('group', { name: 'Forma' }).getByRole('button', { name: 'Tras el texto', exact: true }).click();
    await page.getByRole('button', { name: 'Exportar para este destino' }).click();
    await dlg.getByRole('button', { name: 'HTML para pegar' }).click();
    await expect(code).toHaveValue(/<style>\.monotrama-zona\{background:rgba\(/);
    await expect(code).toHaveValue(/pon class="monotrama-zona"/);
    // off: nothing of it in the code
    await dlg.getByRole('switch', { name: 'Zona protegida' }).uncheck({ force: true });
    await expect(code).not.toHaveValue(/<style>\.monotrama-zona|"scrim":\{|class="monotrama-zona"/);

    // the pasted HTML (gradient) draws the layer between the background and the page, in another page
    const other = await context.newPage();
    await other.setContent(`<!doctype html><html><body style="margin:0;height:600px">${html}<main style="position:relative;color:#fff">Hola</main></body></html>`);
    const layer = other.locator('.monotrama > div[aria-hidden="true"]');
    await expect(layer).toHaveCount(1);
    const st = await layer.evaluate(el => { const s = getComputedStyle(el); return { bf: s.backdropFilter || (s as unknown as Record<string, string>).webkitBackdropFilter, mask: s.maskImage || (s as unknown as Record<string, string>).webkitMaskImage, bg: s.backgroundColor, pos: s.position }; });
    expect(st.pos).toBe('absolute');
    expect(st.bf).toContain('blur(2px)');
    expect(st.mask).toContain('linear-gradient');
    expect(st.bg).toMatch(/rgba\(\d+, \d+, \d+, 0\.5\)/);
    await other.close();

    // the Web Component, with its file, in another page: the same layer inside its shadow root
    const wc = await context.newPage();
    await wc.setContent(`<!doctype html><html><body style="margin:0">${usage.replace(/<script src="monotrama-field.js" defer><\/script>/, '')}</body></html>`);
    await wc.addScriptTag({ content: wcJs });
    await expect.poll(() => wc.evaluate(() => {
      const el = document.querySelector('monotrama-field');
      const layer = el?.shadowRoot?.querySelector('div[aria-hidden="true"]') as HTMLElement | null;
      return layer ? getComputedStyle(layer).backdropFilter : null;
    })).toContain('blur(2px)');
    await wc.close();
  });
});

test.describe('regiones en vivo', () => {
  test('al terminar o cerrar una guía, lo que oye un lector de pantalla ya no dice «Paso 1 de 4»', async ({ page }) => {
    await page.goto('/studio/?camino=fondo');
    const live = page.locator('.app > .sr-only[aria-live]');
    await expect(page.locator('#guide-title')).toContainText('Paso 1 de 4');
    await expect(live).toContainText('Paso 1 de 4');
    await page.locator('aside.guide-panel').getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.locator('#guide-title')).toContainText('Paso 2 de 4');
    await expect(live).not.toContainText('Paso 1 de 4');
    await page.getByRole('button', { name: 'Cerrar la guía' }).click();
    await expect(live).toHaveText('Guía cerrada. Tu pieza se queda.');
    // and it empties itself a few seconds later: nothing stale is left to read
    await expect(live).toHaveText('', { timeout: 10_000 });
  });

  test('moverse por el historial anuncia la posición; exportar no anuncia cada porcentaje', async ({ page }) => {
    await openStudio(page);
    const live = page.locator('.app > .sr-only[aria-live]');
    await page.keyboard.press('r');
    await expect(live).toContainText(/^Resultado 2 de 2: /);
    await page.keyboard.press('ArrowLeft');
    await expect(live).toContainText(/^Resultado 1 de 2: /);
    // the progress of an export is a progress bar; only its stage is a status
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Video y GIF' }).click();
    const dlg = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
    await dlg.getByRole('button', { name: 'Descargar GIF' }).click();
    await expect(dlg.getByRole('progressbar')).toBeVisible();
    expect(await dlg.locator('[aria-live] .progress, [aria-live] [role="progressbar"]').count()).toBe(0);
    await dlg.getByRole('button', { name: 'Cancelar' }).first().click();
  });
});
