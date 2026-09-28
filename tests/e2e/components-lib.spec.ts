import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { crc32 } from '../../src/shared/zip';
import { openStudio } from './helpers';

/**
 * The newer pieces of the component library, taken out of the studio as a person would (the «HTML para
 * pegar», «Módulo ES» and «React» tabs) and run on a page of another origin: what they do with the mouse,
 * with the keyboard and with «reducir movimiento», and that they carry the MIT-0 header.
 */

const SITE = 'http://otra-web.test';
const HEADER = /Hecho con GLYPHOS · https:\/\/glyphos-ascii\.vercel\.app · Licencia MIT-0/;

function png(w = 240, h = 150): Buffer {
  const row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * row + 1 + x * 3;
    const sun = Math.hypot(x - w * 0.6, y - h * 0.5) < h * 0.25;
    raw[o] = sun ? 255 : (x * 120 / w + 40) | 0; raw[o + 1] = sun ? 220 : (y * 100 / h + 30) | 0; raw[o + 2] = sun ? 160 : 90;
  }
  const chunk = (t: string, d: Buffer) => { const td = Buffer.concat([Buffer.from(t), d]); const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const doc = (body: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Otra web</title>
<style>body{margin:0;background:#111;color:#eee;font:16px system-ui,sans-serif} main{padding:24px;min-height:600px}</style></head>
<body><main>${body}</main></body></html>`;

/** The code tabs of a piece, as the studio shows them. */
async function tabsOf(page: Page, name: string): Promise<Record<string, string>> {
  await page.getByRole('button', { name: 'Componentes', exact: true }).click();
  await page.locator('.comp-card', { has: page.getByRole('heading', { name, exact: true }) }).getByRole('button').click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const out: Record<string, string> = {};
  for (const tab of await page.locator('.comp-detail [role="tab"]').all()) {
    await tab.click();
    out[(await tab.innerText()).trim()] = await page.locator('.comp-detail textarea.code').inputValue();
  }
  await page.getByRole('button', { name: '← Todas las piezas' }).click();
  return out;
}

/** A page of another origin serving `files` (path → body). */
async function otherSite(browser: Browser, files: Record<string, string | Buffer>, o: { reducedMotion?: 'reduce'; touch?: boolean } = {}) {
  const ctx = await browser.newContext({
    viewport: o.touch ? { width: 390, height: 800 } : { width: 1100, height: 800 }, reducedMotion: o.reducedMotion ?? 'no-preference',
    ...(o.touch ? { hasTouch: true, isMobile: true } : {}),
  });
  await ctx.route(SITE + '/**', r => {
    const path = new URL(r.request().url()).pathname;
    const body = files[path];
    if (body === undefined) return r.fulfill({ status: 404, body: 'no' });
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.png') ? 'image/png' : 'text/html';
    return r.fulfill({ body, contentType: type + (type.startsWith('text') ? '; charset=utf-8' : '') });
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return { ctx, page, errors };
}

/** Opaque pixels of the first canvas inside `sel` around a point (fraction of its box), 0..1. */
const inkAround = (page: Page, sel: string, fx: number, fy: number, r = 20) => page.evaluate(([sel, fx, fy, r]) => {
  const c = document.querySelector(sel as string)!.parentElement!.querySelector('canvas') as HTMLCanvasElement;
  const x = c.getContext('2d')!;
  const cx = Math.round(c.width * (fx as number)), cy = Math.round(c.height * (fy as number)), k = c.width / c.getBoundingClientRect().width, rr = Math.round((r as number) * k);
  const d = x.getImageData(Math.max(0, cx - rr), Math.max(0, cy - rr), rr * 2, rr * 2).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++;
  return n / (d.length / 4);
}, [sel, fx, fy, r] as const);

test.describe('piezas nuevas en otra web', () => {
  let code: Record<string, Record<string, string>> = {};
  test.beforeAll(async ({ browser }, info) => {
    test.setTimeout(180_000);
    const page = await browser.newPage({ viewport: { width: 1366, height: 860 }, baseURL: info.project.use.baseURL });
    await openStudio(page);
    for (const name of ['Revelar', 'Foco', 'Pantalla de carga', 'Separador', 'Letras de bloque', 'Enlaces con interferencia']) code[name] = await tabsOf(page, name);
    await page.close();
  });
  test.afterAll(() => { code = {}; });

  test('cada pieza lleva la cabecera MIT-0 en su código y su módulo', () => {
    for (const [name, tabs] of Object.entries(code)) {
      for (const t of ['HTML para pegar', 'Módulo ES', 'React']) expect(tabs[t], `${name} · ${t}`).toMatch(HEADER);
    }
    expect(code['Letras de bloque']['Node CLI']).toMatch(HEADER);
    expect(code['Letras de bloque']['Saludo de shell']).toMatch(HEADER);
  });

  test('Revelar: la foto aparece bajo el cursor y entera con el teclado; sin CORS se ve la foto tal cual', async ({ browser }) => {
    const { ctx, page, errors } = await otherSite(browser, { '/': doc(code.Revelar['HTML para pegar']), '/tu-foto.jpg': png() });
    await page.goto(SITE + '/');
    const img = page.locator('.revelar img');
    await expect(img).toBeVisible();
    await expect.poll(() => inkAround(page, '.revelar img', 0.3, 0.5)).toBeGreaterThan(0.9);
    const box = (await img.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5, { steps: 4 });
    await expect.poll(() => inkAround(page, '.revelar img', 0.3, 0.5)).toBeLessThan(0.1);
    // elsewhere the characters stay
    expect(await inkAround(page, '.revelar img', 0.9, 0.1, 6)).toBeGreaterThan(0.9);
    await page.mouse.move(0, 0);
    await page.keyboard.press('Tab');
    await expect(page.locator('.revelar')).toBeFocused();
    await expect.poll(() => inkAround(page, '.revelar img', 0.9, 0.1, 6)).toBeLessThan(0.1);
    expect(await page.getByRole('link', { name: 'Describe aquí tu foto' }).count()).toBe(1);
    expect(errors).toEqual([]);
    await ctx.close();

    // a picture from a third site without CORS: its pixels cannot be read, the page shows it as it is
    const html = code.Revelar['HTML para pegar'].replace('src="tu-foto.jpg"', 'src="http://tercera.test/foto.png"').replace(' crossorigin="anonymous"', '');
    const b = await otherSite(browser, { '/': doc(html) });
    await b.ctx.route('http://tercera.test/**', r => r.fulfill({ body: png(), contentType: 'image/png' }));
    await b.page.goto(SITE + '/');
    await expect(b.page.locator('.revelar img')).toBeVisible();
    await expect.poll(() => b.page.locator('.revelar canvas').evaluate(c => getComputedStyle(c).display)).toBe('none');
    expect(b.errors).toEqual([]);
    await b.ctx.close();

    // (the snippet says what to do with such a picture: with crossorigin a browser does not load it; the
    // routed responses here skip that check, so only the advice is checked)
    expect(code.Revelar['HTML para pegar']).toMatch(/sin esa cabecera, con crossorigin no se carga: quita el atributo/);
  });

  test('Foco: la luz sigue al cursor y al foco del teclado; el contenido no cambia', async ({ browser }) => {
    const { ctx, page, errors } = await otherSite(browser, { '/': doc(code.Foco['HTML para pegar']) });
    await page.goto(SITE + '/');
    const sec = page.locator('.foco');
    await expect(sec.getByRole('heading', { name: 'Tu titular' })).toBeVisible();
    const lit = (fx: number, fy: number) => page.evaluate(([fx, fy]) => {
      const c = document.querySelector('.foco canvas') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(Math.round(c.width * fx) - 30, Math.round(c.height * fy) - 30, 60, 60).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i]; return n / (d.length / 4) / 255;
    }, [fx, fy]);
    const box = (await sec.boundingBox())!;
    const before = await lit(0.2, 0.5);
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 5 });
    await expect.poll(() => lit(0.2, 0.5)).toBeGreaterThan(before + 0.05);
    await page.mouse.move(box.x + box.width + 50, box.y + box.height + 200);
    // the keyboard: the light goes to the focused link
    await page.keyboard.press('Tab');
    const link = sec.getByRole('link', { name: 'Contacto' });
    await expect(link).toBeFocused();
    const lb = (await link.boundingBox())!;
    await expect.poll(() => lit((lb.x + lb.width / 2 - box.x) / box.width, (lb.y + lb.height / 2 - box.y) / box.height)).toBeGreaterThan(before + 0.05);
    expect(await page.locator('.foco canvas').getAttribute('aria-hidden')).toBe('true');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('Pantalla de carga: es una barra de progreso accesible, llega al 100 % y se oculta; quieta con «reducir movimiento»', async ({ browser }) => {
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      const { ctx, page, errors } = await otherSite(browser, { '/': doc(code['Pantalla de carga']['HTML para pegar']) }, { reducedMotion: reducedMotion === 'reduce' ? 'reduce' : undefined });
      await page.goto(SITE + '/');
      const bar = page.getByRole('progressbar', { name: 'Tejiendo la pieza' });
      await expect(bar).toBeVisible();
      await expect(bar).toHaveAttribute('aria-valuenow', /\d+/);
      await expect(page.locator('.carga pre')).toContainText('█');
      await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow')), { timeout: 10_000 }).toBeGreaterThan(50);
      await expect(page.locator('.carga')).toBeHidden({ timeout: 15_000 });
      expect(errors, reducedMotion).toEqual([]);
      await ctx.close();
    }
  });

  test('Separador: desfila, se para con el cursor, con el foco y con su botón (que dice lo que se llama); en un móvil el botón se ve y tocar la franja lo pausa; quieto con «reducir movimiento»', async ({ browser }) => {
    const { ctx, page, errors } = await otherSite(browser, { '/': doc(code.Separador['HTML para pegar']) });
    await page.goto(SITE + '/');
    const track = page.locator('.separador > span[aria-hidden="true"]');
    const x = () => track.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
    const a = await x();
    await expect.poll(x).not.toBe(a);
    // the text is read once
    await expect(page.locator('.separador')).toContainText('NUEVA COLECCIÓN');
    // hover: still
    const box = (await page.locator('.separador').boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + box.height / 2);
    await page.waitForTimeout(150);
    const h1 = await x(); await page.waitForTimeout(400); expect(await x()).toBe(h1);
    await page.mouse.move(0, 0);
    // the keyboard: the pause button shows with focus and stops it
    await page.keyboard.press('Tab');
    const pause = page.getByRole('button', { name: 'Pausar el letrero' });
    await expect(pause).toBeFocused();
    await expect(pause).toHaveText('Pausar');
    await page.keyboard.press('Enter');
    // its name follows what it shows (label in name)
    const resume = page.getByRole('button', { name: 'Reanudar el letrero' });
    await expect(resume).toBeFocused();
    await expect(resume).toHaveText('Reanudar');
    await page.keyboard.press('Tab');
    const p1 = await x(); await page.waitForTimeout(400); expect(await x()).toBe(p1);
    // paused, the button stays in sight (how to resume is visible)
    await expect(resume).toHaveCSS('opacity', '1');
    expect(errors).toEqual([]);
    await ctx.close();

    // a touch screen: no hover, no keyboard; the button is in sight, and the whole strip pauses and resumes
    const m = await otherSite(browser, { '/': doc(code.Separador['HTML para pegar']) }, { touch: true });
    await m.page.goto(SITE + '/');
    const mt = m.page.locator('.separador > span[aria-hidden="true"]');
    const mx = () => mt.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
    const mp = m.page.getByRole('button', { name: 'Pausar el letrero' });
    await expect(mp).toBeVisible();
    await expect(mp).toHaveCSS('opacity', '1');
    await mp.tap();
    await expect(m.page.getByRole('button', { name: 'Reanudar el letrero' })).toBeVisible();
    const m1 = await mx(); await m.page.waitForTimeout(400); expect(await mx()).toBe(m1);
    const bb = (await m.page.locator('.separador').boundingBox())!;
    await m.page.touchscreen.tap(bb.x + 30, bb.y + bb.height / 2);
    await expect(mp).toBeVisible();
    await expect.poll(mx).not.toBe(m1);
    expect(m.errors).toEqual([]);
    await m.ctx.close();

    const r = await otherSite(browser, { '/': doc(code.Separador['HTML para pegar']) }, { reducedMotion: 'reduce' });
    await r.page.goto(SITE + '/');
    const t2 = r.page.locator('.separador > span[aria-hidden="true"]');
    await expect(t2).toContainText('NUEVA COLECCIÓN');
    const s1 = await t2.evaluate(el => getComputedStyle(el).transform);
    await r.page.waitForTimeout(500);
    expect(await t2.evaluate(el => getComputedStyle(el).transform)).toBe(s1);
    await expect(r.page.getByRole('button', { name: 'Pausar el letrero' })).toHaveCount(0);
    await r.ctx.close();
  });

  test('Letras de bloque: el rótulo en la página se lee como su texto; el módulo sirve en Node', async ({ browser }) => {
    const { ctx, page, errors } = await otherSite(browser, { '/': doc(code['Letras de bloque']['HTML para pegar']) });
    await page.goto(SITE + '/');
    const sign = page.getByRole('img', { name: 'AÑO NUEVO' });
    await expect(sign).toBeVisible();
    const t = await sign.innerText();
    expect(t.split('\n').length).toBeGreaterThanOrEqual(6);
    expect(t).toMatch(/█/);
    expect(errors).toEqual([]);
    await ctx.close();
    // the CLI file runs as it is in Node (no canvas, no DOM)
    const dir = test.info().outputPath('letras');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'letras.mjs'), code['Letras de bloque']['Node CLI']);
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync(process.execPath, [join(dir, 'letras.mjs'), 'Ñu 2026'], { encoding: 'utf8' });
    expect(out.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(6);
    expect(out).toMatch(/█/);
  });

  test('Enlaces con interferencia: se revuelven con el cursor y el teclado sin cambiar su nombre; quietos con «reducir movimiento»', async ({ browser }) => {
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      const { ctx, page, errors } = await otherSite(browser, { '/': doc(code['Enlaces con interferencia']['HTML para pegar']) }, { reducedMotion: reducedMotion === 'reduce' ? 'reduce' : undefined });
      await page.goto(SITE + '/');
      const link = page.getByRole('link', { name: 'Proyectos' });
      await expect(link).toBeVisible();
      // what shows, sampled while the pointer arrives (the noise is a hidden layer over the link's own text)
      await page.evaluate(() => {
        const a = [...document.querySelectorAll('a')].find(x => x.textContent === 'Proyectos')!;
        const seen: string[] = [];
        (window as unknown as { seen: string[] }).seen = seen;
        new MutationObserver(() => { const l = a.querySelector('span[aria-hidden="true"]'); if (l) seen.push(l.textContent ?? ''); }).observe(a, { childList: true, subtree: true, characterData: true });
      });
      await link.hover();
      await page.waitForTimeout(600);
      const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
      if (reducedMotion === 'reduce') expect(seen).toEqual([]);
      else expect(seen.some(t => t !== 'Proyectos' && t.length === 'Proyectos'.length)).toBe(true);
      // the name never changes, and the link is back as it was
      await expect(page.getByRole('link', { name: 'Proyectos' })).toHaveCount(1);
      await expect(link.locator('span')).toHaveCount(0);
      await expect(link).toHaveText('Proyectos');
      // the keyboard too
      await page.keyboard.press('Tab');
      expect(errors).toEqual([]);
      await ctx.close();
    }
  });

  test('«Módulo ES» importado desde otra web y «React» compilado, en las seis piezas', async ({ browser }) => {
    test.setTimeout(180_000);
    const dir = test.info().outputPath('react');
    mkdirSync(dir, { recursive: true });
    const files: Record<string, string | Buffer> = { '/tu-foto.jpg': png() };
    const mounts: string[] = [];
    for (const [name, tabs] of Object.entries(code)) {
      const mod = tabs['Módulo ES'];
      const file = /^\/\/ (\S+\.js)/.exec(mod)![1];
      writeFileSync(join(dir, file), mod);
      const react = tabs.React;
      const comp = /export default function (\w+)/.exec(react)![1];
      writeFileSync(join(dir, comp + '.jsx'), react);
      mounts.push(`import ${comp} from './${comp}.jsx';\nparts.push(['${name}', ${comp}]);`);
      files['/' + file] = mod;
    }
    writeFileSync(join(dir, 'entry.jsx'), `import { createRoot } from 'react-dom/client';
import { StrictMode, createElement as h } from 'react';
const parts = [];
${mounts.join('\n')}
const root = document.getElementById('app');
createRoot(root).render(h(StrictMode, null, parts.map(([name, C]) => h('section', { key: name, 'data-part': name, style: { minHeight: 120, padding: 12 } },
  name === 'Revelar' ? h(C, { src: '/tu-foto.jpg', alt: 'Una foto', style: { width: 240 } })
  : name === 'Pantalla de carga' ? h(C, { value: 0.5, label: 'Mitad' })
  : name === 'Enlaces con interferencia' ? h(C, null, h('a', { href: '#a' }, 'Uno'), ' ', h('a', { href: '#b' }, 'Dos'))
  : name === 'Foco' ? h(C, { style: { height: 120 } }, h('a', { href: '#c' }, 'Enlace'))
  : h(C, null)))));
window.__mounted = true;
`);
    const out = await build({ entryPoints: [join(dir, 'entry.jsx')], bundle: true, write: false, format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent', nodePaths: [join(process.cwd(), 'node_modules')] });
    files['/app.js'] = Buffer.from(out.outputFiles[0].contents);
    files['/react.html'] = doc('<div id="app"></div><script type="module" src="/app.js"></script>');
    const { ctx, page, errors } = await otherSite(browser, files);
    await page.goto(SITE + '/react.html');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __mounted?: boolean }).__mounted === true)).toBe(true);
    await expect(page.getByRole('progressbar', { name: 'Tejiendo la pieza' })).toHaveAttribute('aria-valuenow', '50');
    await expect(page.locator('[data-part="Letras de bloque"] pre')).toContainText('█');
    await expect(page.locator('[data-part="Revelar"] canvas')).toHaveCount(1);
    await expect(page.locator('[data-part="Foco"] canvas')).toHaveCount(1);
    await expect(page.locator('[data-part="Separador"] [aria-hidden="true"]').first()).toContainText('NUEVA COLECCIÓN');
    expect(errors).toEqual([]);

    // each ES module, imported from the other site with its own usage example
    for (const [name, tabs] of Object.entries(code)) {
      const mod = tabs['Módulo ES'];
      const usage = /\/\* Uso:\n([\s\S]*?)\n\*\//.exec(mod)?.[1];
      expect(usage, name).toBeTruthy();
      const markup = /^(<[\s\S]*?)\n\n<script/.exec(tabs['HTML para pegar'])?.[1] ?? '';
      const p = `/mod-${encodeURIComponent(name)}.html`;
      files[p] = doc(`${markup}<script type="module">${usage}</script>`);
      await page.goto(SITE + p);
      await page.waitForTimeout(400);
      expect(errors, name).toEqual([]);
    }

    // on plain elements of a page set in a proportional face, the digits, the bar and the blocks still line up
    files['/plain.html'] = doc(`<div id="carga"></div><div id="rotulo"></div><script type="module">
import { loader } from '/loader.js';
import { blockBanner } from '/blocktext.js';
loader(document.getElementById('carga'), { label: 'Cargando' }).set(0.5);
blockBanner(document.getElementById('rotulo'), 'AÑO');
</script>`);
    await page.goto(SITE + '/plain.html');
    await expect(page.locator('#carga pre')).toContainText('█');
    await expect(page.locator('#rotulo')).toContainText('█');
    const even = (sel: string) => page.locator(sel).evaluate(el => {
      const w = (s: string) => { const sp = document.createElement('span'); sp.textContent = s; el.appendChild(sp); const r = sp.getBoundingClientRect().width; sp.remove(); return r; };
      const full = w('█'.repeat(12));
      return full > 0 && Math.abs(full - w(' '.repeat(12))) < 1 && Math.abs(full - w('·'.repeat(12))) < 1;
    });
    expect(await even('#carga pre'), 'la pantalla de carga').toBe(true);
    expect(await even('#rotulo'), 'las letras de bloque').toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

test.describe('Halo en otra web', () => {
  test('el foco del teclado lo enciende (quieto con «reducir movimiento») y destroy() lo suelta del todo', async ({ browser }) => {
    // the module the studio exports (catalog.ts imports this very file)
    const src = readFileSync(join(process.cwd(), 'src/components/lib/halo.js'), 'utf8');
    const page0 = doc(`<button id="antes">Antes</button> <button id="b" style="padding:30px 60px">Abrir</button>
<script>
window.draws = 0;
const clear = CanvasRenderingContext2D.prototype.clearRect;
CanvasRenderingContext2D.prototype.clearRect = function (...a) { window.draws++; return clear.apply(this, a); };
</script>
<script type="module">import { halo } from '/halo.js'; window.ctl = halo(document.getElementById('b'), {});</script>`);
    for (const reducedMotion of ['reduce', 'no-preference'] as const) {
      const { ctx, page, errors } = await otherSite(browser, { '/': page0, '/halo.js': src }, reducedMotion === 'reduce' ? { reducedMotion } : {});
      await page.goto(SITE + '/');
      await expect(page.locator('#b canvas')).toHaveCount(1);
      const draws = async () => {
        await page.evaluate(() => { (window as unknown as { draws: number }).draws = 0; });
        await page.waitForTimeout(600);
        return page.evaluate(() => (window as unknown as { draws: number }).draws);
      };
      await page.locator('#antes').focus();
      await page.keyboard.press('Tab');
      await expect(page.locator('#b')).toBeFocused();
      if (reducedMotion === 'reduce') expect(await draws(), reducedMotion).toBe(0);
      else expect(await draws(), reducedMotion).toBeGreaterThan(10);
      await page.keyboard.press('Shift+Tab');
      // (once it has gone quiet, as when a framework takes it down and puts it up again)
      await expect.poll(draws).toBe(0);
      await page.evaluate(() => (window as unknown as { ctl: { destroy(): void } }).ctl.destroy());
      await expect(page.locator('#b canvas')).toHaveCount(0);
      // gone: the keyboard on the button no longer draws anything
      await page.keyboard.press('Tab');
      await expect(page.locator('#b')).toBeFocused();
      expect(await draws(), reducedMotion).toBe(0);
      expect(await page.locator('#b').evaluate(b => [b.style.position, b.style.isolation].join('|'))).toBe('|');
      expect(errors).toEqual([]);
      await ctx.close();
    }
  });
});

test.describe('Descifrar en otra web', () => {
  test('en bucle se repite unos segundos y se queda quieto; el cursor lo repite una vez', async ({ browser }) => {
    const src = readFileSync(join(process.cwd(), 'src/components/lib/scramble.js'), 'utf8');
    const html = doc(`<h1 id="h" style="font-family:monospace">Teje luz con caracteres</h1>
<script type="module">
import { scramble } from '/scramble.js';
window.changes = 0;
const h = document.getElementById('h');
new MutationObserver(() => { window.changes++; }).observe(h, { childList: true, subtree: true, characterData: true });
window.ctl = scramble(h, { trigger: 'loop', duration: 400, loopDelay: 300, loopFor: 2000 });
</script>`);
    const { ctx, page, errors } = await otherSite(browser, { '/': html, '/scramble.js': src });
    await page.goto(SITE + '/');
    const changes = async (ms: number) => {
      await page.evaluate(() => { (window as unknown as { changes: number }).changes = 0; });
      await page.waitForTimeout(ms);
      return page.evaluate(() => (window as unknown as { changes: number }).changes);
    };
    expect(await changes(1000)).toBeGreaterThan(5);
    await page.waitForTimeout(1300);
    // past loopFor: still, with the whole text in place
    expect(await changes(1500)).toBe(0);
    await expect(page.locator('#h span[aria-hidden="true"]')).toHaveText('Teje luz con caracteres');
    await page.locator('#h').hover();
    expect(await changes(600)).toBeGreaterThan(3);
    expect(await changes(1200)).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

test.describe('Foco en otra web', () => {
  test('sin nadie no dibuja nada; con el cursor la luz y la trama se mueven; al irse se queda quieta', async ({ browser }) => {
    const src = readFileSync(join(process.cwd(), 'src/components/lib/spotlight.js'), 'utf8');
    const html = doc(`<section id="s" style="height:400px;background:#0b0a09"><h2>Tu titular</h2><a href="#c">Contacto</a></section>
<script>
window.draws = 0;
const clear = CanvasRenderingContext2D.prototype.clearRect;
CanvasRenderingContext2D.prototype.clearRect = function (...a) { window.draws++; return clear.apply(this, a); };
</script>
<script type="module">import { spotlight } from '/spotlight.js'; spotlight(document.getElementById('s'), {});</script>`);
    const { ctx, page, errors } = await otherSite(browser, { '/': html, '/spotlight.js': src });
    await page.goto(SITE + '/');
    const draws = async (ms: number) => {
      await page.evaluate(() => { (window as unknown as { draws: number }).draws = 0; });
      await page.waitForTimeout(ms);
      return page.evaluate(() => (window as unknown as { draws: number }).draws);
    };
    await expect(page.locator('#s canvas')).toHaveCount(1);
    await page.waitForTimeout(300);
    expect(await draws(800)).toBe(0);
    const box = (await page.locator('#s').boundingBox())!;
    await page.mouse.move(box.x + 200, box.y + 150);
    expect(await draws(500)).toBeGreaterThan(10);
    await page.mouse.move(box.x + 200, box.y + box.height + 150);
    await expect.poll(() => draws(500)).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
