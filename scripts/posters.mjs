#!/usr/bin/env node
/**
 * Regenerates the guide posters from real engine renders (dev/posters.ts) and writes them to public/ex/:
 *   <slug>.webp (1280×800), <slug>-640.webp (640×400), <slug>-og.jpg (1200×630 share image)
 *   terminal-donut.txt (80×24 text frame, exactly what the studio's TXT export gives)
 * Commit the results. Usage: node scripts/posters.mjs
 * Needs Playwright's Chromium (npx playwright install chromium); WebGL runs on SwiftShader, like the e2e tests.
 */
import { mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'ex');
mkdirSync(outDir, { recursive: true });

// node_modules may be a symlink to another checkout: allow its real path so the fonts load.
const allow = [root, realpathSync(join(root, 'node_modules'))];
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 4196, strictPort: false, fs: { allow } } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const write = (file, data) => {
  writeFileSync(join(outDir, file), data);
  console.log(`public/ex/${file}  ${Math.round(statSync(join(outDir, file)).size / 1024)} KB`);
};
const fromDataUrl = url => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const failed = [];
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('requestfailed', r => failed.push(r.url()));
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto(base + 'dev/posters.html');
  await page.waitForFunction(() => 'mt' in window, null, { timeout: 60_000 });
  const guides = await page.evaluate(() => window.mt.guides);
  for (const g of guides) {
    const slug = g.poster.replace('/ex/', '');
    write(`${slug}.webp`, fromDataUrl(await page.evaluate(id => window.mt.poster(id, 2), g.id)));
    write(`${slug}-640.webp`, fromDataUrl(await page.evaluate(id => window.mt.poster(id, 1), g.id)));
    write(`${slug}-og.jpg`, fromDataUrl(await page.evaluate(id => window.mt.og(id), g.id)));
  }
  write('terminal-donut.txt', await page.evaluate(() => window.mt.grid('terminal')));
  // a missing font would silently change the look of every render
  if (failed.length) throw new Error('Fallaron recursos de la página:\n' + failed.join('\n'));
} finally {
  await browser.close();
  await server.close();
}
