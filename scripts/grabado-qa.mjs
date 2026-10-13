#!/usr/bin/env node
/**
 * Drives dev/grabado.html (npm run dev) in Chromium with WebGL through SwiftShader: the «Grabado láser» recipes as
 * the library gives them (alone, in Texto over several texts, in Terminal), errors, the two engines compared and
 * screenshots.
 *
 *   npx vite --port 5306 &      then      node scripts/grabado-qa.mjs [--url=http://localhost:5306] [--keys=a,b]
 *   [--t=8] [--big] [--motor=webgl|basico] [--compare] [--shot=page.png] [--snap=dir] (one PNG per item and engine)
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const base = arg('url', 'http://localhost:5306');
const keys = arg('keys', '');
const shot = arg('shot', '');
const snap = arg('snap', '');
const t = arg('t', '');
const motor = arg('motor', '');
const big = process.argv.includes('--big');
const doCompare = process.argv.includes('--compare');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1340, height: 900 } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
const q = new URLSearchParams();
if (keys) q.set('keys', keys);
if (t) q.set('t', t);
if (big) q.set('big', '1');
if (motor) q.set('motor', motor);
await page.goto(`${base}/dev/grabado.html?${q}`);
await page.waitForFunction(() => window.__g?.done === true, null, { timeout: 600_000 });
const state = await page.evaluate(() => ({ errors: window.__g.errors, items: window.__g.items, status: document.getElementById('status').textContent }));
console.log(state.status);
for (const e of state.errors) console.log('ERROR', e.slice(0, 600));
for (const l of logs) console.log(l.slice(0, 400));
if (doCompare) {
  for (const it of state.items) {
    const c = await page.evaluate(k => window.__g.compare(k), it.key);
    console.log(`${it.key}: r=${c.r.toFixed(4)} glifos=${(c.glyphs * 100).toFixed(1)}% tinta=${c.ink.toFixed(1)}/${c.inkBasic.toFixed(1)} color r=${c.rgb.toFixed(4)} Δ=${c.drgb.toFixed(1)}`);
  }
}
if (snap) {
  mkdirSync(snap, { recursive: true });
  const engines = motor === 'basico' ? ['basic'] : motor === 'webgl' ? ['gl'] : ['gl', 'basic'];
  for (const it of state.items) for (const e of engines) {
    const url = await page.evaluate(([k, en, tt]) => window.__g.snap(k, { engine: en, ...(tt ? { t: Number(tt) } : {}) }), [it.key, e, t]);
    const file = `${snap}/${it.key.replace(/[^\w-]+/g, '_')}-${e}.png`;
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('captura', file);
  }
}
if (shot) await page.screenshot({ path: shot, fullPage: true });
await browser.close();
