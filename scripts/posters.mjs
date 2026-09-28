#!/usr/bin/env node
/**
 * Regenerates the site's pre-rendered media from real engine renders and writes them to public/ex/.
 * Commit the results. Usage: node scripts/posters.mjs [--guias] [--portada]   (both when no flag is given)
 *
 * --guias   the guide posters (dev/posters.ts):
 *             <slug>.webp (1280×800), <slug>-640.webp (640×400), <slug>-og.jpg (1200×630 share image)
 *             terminal-donut.txt (80×24 text frame, exactly what the studio's TXT export gives)
 * --portada the landing's media (dev/landing.ts):
 *             azar/<seed>.webp: one real draw of the dice per style (the «Azar» contact sheet)
 *             salidas/: one piece exported with the studio's own functions — PNG (+ a WebP copy shown on the
 *             page), SVG, WebM and MP4 loops, the Web Component and a page that uses it, a Node script for
 *             the terminal and the recipe file — plus manifest.json with their sizes (tests/unit/seo.test.ts
 *             checks the landing quotes them right).
 * Needs Playwright's Chromium (npx playwright install chromium); WebGL runs on SwiftShader, like the e2e tests.
 * The MP4 needs a browser that encodes H.264: Google Chrome (channel "chrome") is used when installed;
 * without it the MP4 is left as it was and a warning says so.
 */
import { existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'ex');
mkdirSync(outDir, { recursive: true });
const flags = process.argv.slice(2);
const doGuides = !flags.length || flags.includes('--guias');
const doLanding = !flags.length || flags.includes('--portada');

// node_modules may be a symlink to another checkout: allow its real path so the fonts load.
const allow = [root, realpathSync(join(root, 'node_modules'))];
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 4196, strictPort: false, fs: { allow } } });
await server.listen();
const base = server.resolvedUrls.local[0];
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: GL });

const write = (file, data) => {
  mkdirSync(dirname(join(outDir, file)), { recursive: true });
  writeFileSync(join(outDir, file), data);
  console.log(`public/ex/${file}  ${Math.round(statSync(join(outDir, file)).size / 1024)} KB`);
};
const fromDataUrl = url => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

async function open(b, path) {
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const failed = [];
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('requestfailed', r => failed.push(r.url()));
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto(base + path);
  await page.waitForFunction(() => 'mt' in window, null, { timeout: 60_000 });
  // a missing font would silently change the look of every render
  page.checkFailed = () => { if (failed.length) throw new Error('Fallaron recursos de la página:\n' + failed.join('\n')); };
  return page;
}

async function guides() {
  const page = await open(browser, 'dev/posters.html');
  const list = await page.evaluate(() => window.mt.guides);
  for (const g of list) {
    const slug = g.poster.replace('/ex/', '');
    write(`${slug}.webp`, fromDataUrl(await page.evaluate(id => window.mt.poster(id, 2), g.id)));
    write(`${slug}-640.webp`, fromDataUrl(await page.evaluate(id => window.mt.poster(id, 1), g.id)));
    write(`${slug}-og.jpg`, fromDataUrl(await page.evaluate(id => window.mt.og(id), g.id)));
  }
  write('../og.jpg', fromDataUrl(await page.evaluate(() => window.mt.siteOg())));
  write('terminal-donut.txt', await page.evaluate(() => window.mt.grid('terminal')));
  page.checkFailed();
  await page.close();
}

/** The page that shows the exported Web Component working (framed by the landing's «Web» tab). */
const webPage = (usage, name) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Página de ejemplo con un fondo de GLYPHOS</title>
<style>
  html, body { margin: 0; height: 100%; background: #07060f; color: #f6efe4; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .hero { position: relative; min-height: 100vh; display: grid; align-items: center; overflow: hidden; }
  .hero glyphos-field { position: absolute; inset: 0; }
  .copy { position: relative; max-width: min(48%, 30em); padding: 32px 5vw; }
  @media (max-width: 560px) { .copy { max-width: none; } }
  .copy p:first-child { margin: 0 0 12px; font: 600 11px/1 ui-monospace, Menlo, monospace; letter-spacing: .16em; text-transform: uppercase; opacity: .75; }
  h1 { margin: 0 0 14px; font-size: clamp(24px, 4.2vw, 44px); line-height: 1.04; letter-spacing: -.03em; }
  .copy p { margin: 0 0 20px; max-width: 26em; opacity: .88; }
  a { display: inline-block; padding: 12px 18px; border-radius: 10px; background: #f6efe4; color: #07060f; font-weight: 700; text-decoration: none; }
  code { font: 14px ui-monospace, Menlo, monospace; }
</style>
</head>
<body>
<section class="hero">
${usage}
  <div class="copy">
    <p>Página de ejemplo</p>
    <h1>Tu titular, sobre un fondo que se mueve.</h1>
    <p>El fondo es «${name}» exportado desde el estudio como Web Component: el archivo <code>glyphos-field.js</code> y una etiqueta, sin más código.</p>
    <a href="/studio/" target="_top">Hacer el mío</a>
  </div>
</section>
</body>
</html>
`;

async function landing() {
  const page = await open(browser, 'dev/landing.html');
  const contacts = await page.evaluate(() => window.mt.contacts);
  for (const c of contacts) write(`azar/${c.seed}.webp`, fromDataUrl(await page.evaluate(([s, a]) => window.mt.contact(s, a), [c.seed, c.arch])));
  page.checkFailed();
  await page.close();

  // the exports: Google Chrome when installed (it encodes H.264), else the bundled Chromium (no MP4)
  let chrome = null;
  try { chrome = await chromium.launch({ channel: 'chrome', args: GL }); } catch { console.warn('Google Chrome no está instalado: el MP4 no se regenera.'); }
  const p2 = await open(chrome ?? browser, 'dev/landing.html');
  const s = await p2.evaluate(() => window.mt.salidas());
  p2.checkFailed();
  await p2.close();
  await chrome?.close();

  const b = 'salidas/glyphos-saturno';
  write(`${b}.png`, Buffer.from(s.png, 'base64'));
  write(`${b}.webp`, fromDataUrl(s.pngDisplay));
  write(`${b}.svg`, s.svg);
  write(`${b}.webm`, Buffer.from(s.webm, 'base64'));
  if (s.mp4) write(`${b}.mp4`, Buffer.from(s.mp4, 'base64'));
  else if (!existsSync(join(outDir, `${b}.mp4`))) console.warn('Sin MP4: este navegador no codifica H.264.');
  write(`${b}.mjs`, s.node);
  write('salidas-terminal.txt', s.firstFrame);
  write(`${b}.glyphos.json`, s.recipe);
  write('salidas/web/glyphos-field.js', s.wcFile);
  write('salidas/web/index.html', webPage(s.wcUsage, s.name));
  const size = f => statSync(join(outDir, f)).size;
  const manifest = {
    piece: s.name, loopSeconds: s.loopSeconds, frames: s.frames, svgSize: s.svgSize, svgNotes: s.svgNotes, codecs: s.codecs,
    link: s.link, usage: s.wcUsage, runtime: s.runtime,
    bytes: Object.fromEntries(['png', 'webp', 'svg', 'webm', 'mp4', 'mjs', 'glyphos.json'].map(x => [x, existsSync(join(outDir, `${b}.${x}`)) ? size(`${b}.${x}`) : 0]).concat([['wc', size('salidas/web/glyphos-field.js')]])),
  };
  write('salidas/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
}

try {
  if (doGuides) await guides();
  if (doLanding) await landing();
} finally {
  await browser.close();
  await server.close();
}
