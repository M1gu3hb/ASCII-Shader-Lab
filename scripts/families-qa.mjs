#!/usr/bin/env node
/**
 * Drives dev/familias.html (npm run dev) in Chromium with WebGL through SwiftShader: waits for every preset,
 * reports errors, compares the two engines per preset (cell luminance correlation, identical glyphs) and
 * saves a screenshot of the page.
 *
 *   npx vite --port 5191 &      then      node scripts/families-qa.mjs [--url=http://localhost:5191] [--ids=a,b] [--shot=out.png] [--compare]
 *   [--presets=a,b] [--big] (1280 × 720 tiles, to judge the look) [--motor=webgl|basico] [--t=6]
 */
import { chromium } from '@playwright/test';

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const base = arg('url', 'http://localhost:5191');
const ids = arg('ids', '');
const shot = arg('shot', '');
const t = arg('t', '');
const presets = arg('presets', '');
const big = process.argv.includes('--big');
const motor = arg('motor', '');
const vidrio = arg('vidrio', '');
const doCompare = process.argv.includes('--compare');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
const q = new URLSearchParams();
if (ids) q.set('ids', ids);
if (t) q.set('t', t);
if (presets) q.set('presets', presets);
if (big) q.set('big', '1');
if (motor) q.set('motor', motor);
if (vidrio) q.set('vidrio', vidrio);
await page.goto(`${base}/dev/familias.html?${q}`);
await page.waitForFunction(() => window.__fam?.done === true, null, { timeout: 600_000 });
const state = await page.evaluate(() => ({ errors: window.__fam.errors, items: window.__fam.items, status: document.getElementById('status').textContent }));
console.log(state.status);
for (const e of state.errors) console.log('ERROR', e.slice(0, 600));
for (const l of logs) console.log(l.slice(0, 400));
if (doCompare) {
  for (const it of state.items) {
    const c = await page.evaluate(([f, p]) => window.__fam.compare(f, p), [it.family, it.preset]);
    console.log(`${it.family}/${it.preset}: r=${c.r.toFixed(4)} glifos=${(c.glyphs * 100).toFixed(1)}% tinta=${c.ink.toFixed(1)}/${c.inkBasic.toFixed(1)} color r=${c.rgb.toFixed(4)} Δ=${c.drgb.toFixed(1)}`);
  }
}
if (shot) await page.screenshot({ path: shot, fullPage: true });
await browser.close();
