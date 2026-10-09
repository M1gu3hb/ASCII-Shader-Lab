import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { FOTO_STUDIO } from './foto-helpers';

/** Public site: crawl files, canonical URLs, share tags, structured data, guides and the brand credit. */
const SITE = 'https://glyphos-ascii.vercel.app';
/** The photo and video studio is listed only when the build makes it public (VITE_FOTO_STUDIO=1). */
const PATHS = ['/', '/studio/', ...(FOTO_STUDIO ? ['/studio/foto/'] : []), '/studio/glifos/', '/imagen-a-ascii/', '/video-a-ascii/', '/fondos-ascii/', '/texto-animado-ascii/', '/arte-ascii-terminal/', '/licencia/'];
const GUIDES: Array<[string, string]> = [
  ['/imagen-a-ascii/', '/studio/?camino=foto'],
  ['/video-a-ascii/', '/studio/#space=media&source=video'],
  ['/fondos-ascii/', '/studio/?camino=fondo'],
  ['/texto-animado-ascii/', '/studio/?camino=palabra'],
  ['/arte-ascii-terminal/', '/studio/#space=terminal'],
];

// The preview server does not send vercel.json headers: apply the production CSP to documents so we
// see anything it would block (inline JSON-LD is data, not script, and must not trip it).
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
const CSP = vercel.headers.find(h => h.source === '/(.*)')!.headers.find(h => h.key === 'Content-Security-Policy')!.value;

async function withCsp(page: Page) {
  const violations: string[] = [];
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await page.route('**/*', async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': CSP } });
  });
  await page.addInitScript(() => {
    addEventListener('securitypolicyviolation', e => console.error(`Content Security Policy: ${e.violatedDirective} ${e.blockedURI}`));
  });
  return violations;
}

const attr = (page: Page, sel: string, name: string) => page.locator(sel).first().getAttribute(name);

test('robots.txt and sitemap.xml point crawlers to absolute canonical URLs that exist', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['content-type']).toContain('text/plain');
  const txt = await robots.text();
  expect(txt).toMatch(/^User-agent: \*$/m);
  expect(txt).toMatch(/^Allow: \/$/m);
  expect(txt).toContain(`Sitemap: ${SITE}/sitemap.xml`);

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toMatch(/xml/);
  const xml = await sitemap.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  expect(locs).toEqual(PATHS.map(p => SITE + p));
  // No trustworthy per-page editing date is available: the build must not invent lastmod.
  expect(xml).not.toContain('<lastmod>');
  for (const loc of locs) {
    const path = new URL(loc).pathname;
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    const html = await res.text();
    expect(html, path).toContain(`<link rel="canonical" href="${loc}">`);
    expect(html.match(/<h1[\s>]/g), `${path} has one h1 in its HTML`).toHaveLength(1);
  }
});

for (const path of PATHS) {
  test(`${path}: canonical, share tags and JSON-LD are absolute and valid, and the CSP allows the page`, async ({ page, request }) => {
    const violations = await withCsp(page);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(path);
    const url = SITE + path;
    expect(await attr(page, 'link[rel="canonical"]', 'href')).toBe(url);
    expect(await attr(page, 'meta[property="og:url"]', 'content')).toBe(url);
    expect(await attr(page, 'meta[property="og:locale"]', 'content')).toBe('es_MX');
    expect(await attr(page, 'meta[property="og:site_name"]', 'content')).toBe('GLYPHOS');
    expect(await attr(page, 'meta[name="twitter:card"]', 'content')).toBe('summary_large_image');
    const title = await page.title();
    expect(title).toMatch(/GLYPHOS/);
    expect(await attr(page, 'meta[property="og:title"]', 'content')).toBe(title);
    const description = (await attr(page, 'meta[name="description"]', 'content')) ?? '';
    expect(description.length).toBeGreaterThan(60);
    expect(description.length).toBeLessThanOrEqual(160);

    const image = (await attr(page, 'meta[property="og:image"]', 'content')) ?? '';
    expect(image.startsWith(SITE + '/')).toBe(true);
    expect(await attr(page, 'meta[name="twitter:image"]', 'content')).toBe(image);
    expect(await attr(page, 'meta[property="og:image:width"]', 'content')).toBe('1200');
    expect(await attr(page, 'meta[property="og:image:height"]', 'content')).toBe('630');
    expect((await attr(page, 'meta[property="og:image:alt"]', 'content'))?.length).toBeGreaterThan(10);
    const img = await request.get(new URL(image).pathname);
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toMatch(/^image\//);

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      const data = JSON.parse(b) as { '@context': string; '@graph': Array<{ '@type': string }> };
      expect(data['@context']).toBe('https://schema.org');
      expect(data['@graph'].length).toBeGreaterThan(0);
      for (const id of JSON.stringify(data).match(/"(url|item|@id|license)":"[^"]+"/g) ?? []) expect(id, id).toMatch(/":"https:\/\//);
    }
    await page.waitForTimeout(500);
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const [path, cta] of GUIDES) {
  test(`${path}: a useful guide with one h1, a studio CTA, a poster, siblings and a lazy live demo`, async ({ page }) => {
    const violations = await withCsp(page);
    const scripts: string[] = [];
    page.on('request', r => { if (r.resourceType() === 'script') scripts.push(r.url()); });
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main a.btn-cta').first()).toHaveAttribute('href', cta);
    await expect(page.locator(`main a[href="${cta}"]`)).toHaveCount(2);
    await expect(page.getByRole('navigation', { name: 'Ruta de navegación' }).getByRole('link', { name: 'GLYPHOS' })).toHaveAttribute('href', '/');
    for (const heading of ['Qué te llevas, y qué no.', 'Antes de empezar.']) await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText('Límite:').first()).toBeVisible();

    // the example: a poster with its own size (or the exported text frame), always there
    const example = page.locator('[data-demo]');
    if (path === '/arte-ascii-terminal/') {
      const lines = ((await example.locator('pre').textContent()) ?? '').split('\n');
      expect(lines).toHaveLength(24);
      expect(Math.max(...lines.map(l => l.length))).toBeLessThanOrEqual(80);
    } else {
      const poster = example.locator('img');
      await expect(poster).toHaveAttribute('width', '1280');
      await expect(poster).toHaveAttribute('height', '800');
      expect(await poster.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    }

    // siblings and the landing
    const others = page.locator('.g-final .guide-card');
    await expect(others).toHaveCount(4);
    for (const [other] of GUIDES) if (other !== path) await expect(page.locator(`.g-final a[href="${other}"]`)).toHaveCount(1);
    await expect(page.locator('.g-final a[href="/"]')).toHaveCount(1);

    // the engine arrives only with the demo, after load, and takes over from the poster
    await example.scrollIntoViewIfNeeded();
    await expect(example).toHaveAttribute('data-state', 'live', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Pausar la animación/ })).toBeVisible();
    const html = await (await page.request.get(path)).text();
    const initial = [...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="([^"]+)"/g)].map(m => m[1]);
    expect(initial.length).toBeGreaterThan(0);
    for (const src of initial) {
      const code = await (await page.request.get(src)).text();
      expect(code, `${src} is loaded up front and must not carry the engine`).not.toContain('precision highp');
    }
    expect(scripts.length).toBeGreaterThan(initial.length);
    expect(violations).toEqual([]);
  });
}

test('the video guide opens the studio asking for a video, with a picker that takes videos', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/video-a-ascii/');
  await page.locator('main a.btn-cta').first().click();
  await expect(page).toHaveURL(/\/studio\/$/);
  const card = page.getByRole('region', { name: 'Cargar fuente' });
  await expect(card.getByRole('heading', { name: 'Suelta aquí un video' })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('dialog.welcome[open]')).toHaveCount(0);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), card.getByRole('button', { name: 'Elegir video' }).click()]);
  expect(await chooser.element().getAttribute('accept')).toBe('video/*');
  expect(errors).toEqual([]);
});

test('every public page credits Morphiq in the footer', async ({ page }) => {
  for (const path of ['/', ...GUIDES.map(g => g[0]), '/licencia/', '/esta-pagina-no-existe/']) {
    await page.goto(path);
    const footer = page.locator('footer.foot');
    await expect(footer, path).toContainText('Desarrollado por');
    const link = footer.locator('a.morphiq');
    await expect(link).toHaveAttribute('href', 'https://morphiq.com.mx');
    const logo = link.locator('img');
    await expect(logo).toHaveAttribute('alt', 'Morphiq — Astral Morphiq Systems');
    await expect(logo).toHaveAttribute('width', '128');
    await expect(logo).toHaveAttribute('height', '37');
    await expect(link).toHaveAccessibleName('Morphiq — Astral Morphiq Systems');
    await logo.scrollIntoViewIfNeeded();
    await expect.poll(() => logo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { message: path }).toBe(true);
    // shown at its true 1536:444 proportions
    const box = (await logo.boundingBox())!;
    expect(Math.abs(box.width / box.height - 1536 / 444)).toBeLessThan(0.05);
    for (const [guide] of GUIDES) await expect(footer.locator(`a[href="${guide}"]`)).toHaveCount(1);
  }
});

test('the landing links the five guides, and unknown pages get a real 404 that leads back', async ({ page }) => {
  await page.goto('/');
  for (const [guide] of GUIDES) await expect(page.locator(`#guias a[href="${guide}"]`)).toHaveCount(1);

  const res = await page.goto('/esta-pagina-no-existe/');
  expect(res?.status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Esta página no existe.');
  await expect(page.locator('main a[href="/"]').first()).toBeVisible();
  await expect(page.locator('main .guide-card')).toHaveCount(5);
});

test('the studio shell summarises the studio for crawlers and gives way to the app', async ({ page, request }) => {
  const html = await (await request.get('/studio/')).text();
  const root = html.slice(html.indexOf('<div id="root">'), html.indexOf('</body>'));
  expect(root).toContain('<h1>');
  for (const [guide] of GUIDES) expect(root).toContain(`href="${guide}"`);
  await page.goto('/studio/');
  await expect(page.locator('.stage canvas').first()).toBeVisible();
  await expect(page.locator('.boot')).toHaveCount(0);
});

test('con el estudio de foto en pausa ninguna página pública lo enlaza, y el sitemap no lo lista', async ({ page, request }) => {
  test.skip(FOTO_STUDIO, 'Con VITE_FOTO_STUDIO=1 el estudio de foto y video es público y se enlaza.');
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/studio/foto');
  const toFoto = (hrefs: string[]) => hrefs.filter(h => new URL(h, SITE).pathname.startsWith('/studio/foto'));
  const hrefs = (p: Page) => p.locator('a[href], area[href]').evaluateAll(els => els.map(e => e.getAttribute('href') ?? ''));
  for (const path of ['/', '/studio/', ...GUIDES.map(g => g[0]), '/licencia/', '/esta-pagina-no-existe/']) {
    // the HTML as served (what a crawler reads first)…
    const html = await (await request.get(path)).text();
    expect(html, path).not.toContain('/studio/foto');
    // …and the page once its scripts ran: the lab's bar and its welcome, the landing's islands (brought into view)
    await page.goto(path);
    if (path === '/studio/') {
      await expect(page.locator('.stage canvas').first()).toBeVisible({ timeout: 45_000 });
      await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
      expect(toFoto(await hrefs(page)), path + ' (con la bienvenida)').toEqual([]);
      await page.keyboard.press('Escape');
    } else {
      await page.waitForLoadState('load');
      for (let y = 0; y < 12; y++) {
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(150);
      }
    }
    await page.waitForTimeout(600);
    expect(toFoto(await hrefs(page)), path).toEqual([]);
  }
});
