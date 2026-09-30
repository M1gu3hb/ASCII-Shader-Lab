#!/usr/bin/env node
/**
 * Regenerates the examples of «Qué puedes hacer» (the guide cards) from real engine renders and writes them to
 * public/ex/guias/. Commit the results. Usage: node scripts/ejemplos.mjs [imagen video fondos texto terminal]
 *
 * For each guide (dev/ejemplos.ts says what each one shows):
 *   <id>.webp   the first frame, 720 × 450 (the card's picture, twice the largest size it is shown at)
 *   <id>.webm   the loop, VP9          <id>.mp4   the same loop, H.264 (Safari, older browsers)
 * The frames are drawn one by one in the browser (lossless PNG), then encoded with ffmpeg (libvpx-vp9 and
 * libx264 are needed: `ffmpeg -encoders`). Needs Playwright's Chromium; WebGL runs on SwiftShader, like the
 * e2e tests.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'ex', 'guias');
mkdirSync(outDir, { recursive: true });

const ff = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
if (ff.status !== 0 || !/libx264/.test(ff.stdout) || !/libvpx-vp9/.test(ff.stdout)) {
  console.error('Hace falta ffmpeg con libx264 y libvpx-vp9 (por ejemplo: apt install ffmpeg).');
  process.exit(1);
}

// node_modules may be a symlink to another checkout: allow its real path so the fonts load.
const allow = [root, realpathSync(join(root, 'node_modules'))];
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 4197, strictPort: false, fs: { allow } } });
await server.listen();
const base = server.resolvedUrls.local[0];
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: GL });

const kb = f => `${Math.round(statSync(f).size / 1024)} KB`;
const fromDataUrl = url => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
const run = (args, what) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg (${what}): ${r.stderr}`);
};

try {
  const page = await browser.newPage();
  const failed = [];
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto(base + 'dev/ejemplos.html');
  await page.waitForFunction(() => 'mt' in window, null, { timeout: 60_000 });
  const all = await page.evaluate(() => window.mt.ids);
  const ids = process.argv.slice(2).filter(a => all.includes(a));
  for (const id of ids.length ? ids : all) {
    const tmp = mkdtempSync(join(tmpdir(), `glyphos-${id}-`));
    try {
      const n = await page.evaluate(i => window.mt.open(i), id);
      const fps = await page.evaluate(i => window.mt.fps(i), id);
      for (let i = 0; i < n; i++) {
        writeFileSync(join(tmp, `f${String(i).padStart(4, '0')}.png`), fromDataUrl(await page.evaluate(k => window.mt.frame(k), i)));
      }
      const poster = join(outDir, `${id}.webp`);
      writeFileSync(poster, fromDataUrl(await page.evaluate(() => window.mt.frame(0, 'image/webp', 0.84))));
      await page.evaluate(() => window.mt.close());
      if (failed.length) throw new Error('Fallaron recursos de la página:\n' + failed.join('\n'));
      const input = ['-framerate', String(fps), '-i', join(tmp, 'f%04d.png')];
      const mp4 = join(outDir, `${id}.mp4`), webm = join(outDir, `${id}.webm`);
      run([...input, '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '27', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-an', mp4], 'mp4');
      run([...input, '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0', '-deadline', 'good', '-cpu-used', '1', '-row-mt', '1', '-pix_fmt', 'yuv420p', '-an', webm], 'webm');
      console.log(`${id}: ${n} fotogramas a ${fps} fps · ${id}.webp ${kb(poster)} · ${id}.webm ${kb(webm)} · ${id}.mp4 ${kb(mp4)}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
  await server.close();
}
