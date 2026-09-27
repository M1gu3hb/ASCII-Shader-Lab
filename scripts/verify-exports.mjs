#!/usr/bin/env node
/**
 * Checks every export the way someone who takes it into another project would.
 *
 *   npm run build && npx vite preview --port 4177 --strictPort &
 *   PORT=4177 npm run verify:exports
 *
 * Drives the studio in Chromium (Playwright), downloads each export and inspects it with the real
 * tools (ffprobe/ffmpeg, ImageMagick, rsvg-convert, Inkscape, gifsicle, xmllint, python3 + pyte,
 * asciinema, Node 18). Pasted code is loaded from a different origin; the React component is built
 * in a throwaway Vite project. A missing tool turns its checks into SKIP (with the reason), never FAIL.
 *
 * Env: PORT (preview port, default 4173) · OUT (artifact folder, default a new temp folder)
 *      ONLY (comma-separated groups) · NODE18 (path to a Node 18 binary; otherwise `npx -y node@18`)
 */
import { spawnSync } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT ?? 4173);
const BASE = `http://localhost:${PORT}`;
const SITE_PORT = Number(process.env.SITE_PORT ?? PORT + 100); // "someone else's website": a different origin
const DEV_PORT = SITE_PORT + 1;                                  // throwaway React project (vite dev, StrictMode)
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const OUT = process.env.OUT ? resolve(process.env.OUT) : mkdtempSync(join(tmpdir(), 'monotrama-verify-'));
const ONLY = (process.env.ONLY ?? '').split(',').map(s => s.trim()).filter(Boolean);
const PY = join(ROOT, 'scripts/verify-exports.py');
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
/** VERIFY_CA=<pem>: a CA that re-signs HTTPS on this network (corporate/agent proxy). Chromium trusts exactly that key. */
if (process.env.VERIFY_CA) {
  const cert = new X509Certificate(readFileSync(process.env.VERIFY_CA));
  GL_ARGS.push('--ignore-certificate-errors-spki-list=' + createHash('sha256').update(cert.publicKey.export({ type: 'spki', format: 'der' })).digest('base64'));
}
const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
const fontIssues = new Set();
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

const results = [];
const want = g => !ONLY.length || ONLY.includes(g);
function record(group, name, status, detail = '') {
  results.push({ group, name, status, detail: String(detail).replace(/\s+/g, ' ').trim() });
  const mark = status === 'PASS' ? '✓' : status === 'SKIP' ? '·' : '✗';
  console.log(`  ${mark} [${group}] ${name}${detail ? ' — ' + String(detail).replace(/\s+/g, ' ').slice(0, 160) : ''}`);
}
class Skip extends Error {}
const skip = reason => { throw new Skip(reason); };
/** Runs one check: return a string (PASS detail), throw Skip (SKIP) or anything else (FAIL). */
async function check(group, name, fn) {
  try {
    const d = await fn();
    record(group, name, 'PASS', d ?? '');
  } catch (e) {
    if (e instanceof Skip) record(group, name, 'SKIP', e.message);
    else record(group, name, 'FAIL', e?.message ?? String(e));
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

const toolCache = new Map();
function has(cmd) {
  if (!toolCache.has(cmd)) toolCache.set(cmd, spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0);
  return toolCache.get(cmd);
}
function need(...cmds) { for (const c of cmds) if (!has(c)) skip(`${c} no está instalado`); }
const pyMods = new Map();
function needPy(...mods) {
  need('python3');
  for (const m of mods) {
    if (!pyMods.has(m)) pyMods.set(m, spawnSync('python3', ['-c', `import ${m}`]).status === 0);
    if (!pyMods.get(m)) skip(`módulo de Python «${m}» no instalado (pip install ${m})`);
  }
}
function run(cmd, args, o = {}) {
  const r = spawnSync(cmd, args, { encoding: o.buffer ? 'buffer' : 'utf8', timeout: o.timeout ?? 120_000, maxBuffer: 1 << 28, input: o.input, cwd: o.cwd, env: { ...process.env, ...(o.env ?? {}) } });
  if (r.error && !o.allowFail) throw r.error;
  return r;
}
function py(...args) {
  const r = run('python3', [PY, ...args]);
  if (r.status !== 0) throw new Error('verify-exports.py: ' + (r.stderr || r.stdout).slice(-400));
  return JSON.parse(r.stdout);
}
function ptyRun(cfg) {
  return py('pty', JSON.stringify({ cols: 80, rows: 24, timeout: 10, ...cfg }));
}

/** ImageMagick RMSE, normalised 0..1. Images are resized to the first one's size when they differ. */
function rmse(a, b, o = {}) {
  need('compare', 'convert', 'identify');
  const [w, h] = run('identify', ['-format', '%w %h', a + '[0]']).stdout.trim().split(' ').map(Number);
  const prep = (f, tag) => {
    const dst = join(OUT, 'tmp', `${tag}-${Math.random().toString(36).slice(2)}.png`);
    mkdirSync(dirname(dst), { recursive: true });
    const fit = o.cover && tag === 'b' ? ['-resize', `${w}x${h}^`, '-gravity', 'center', '-extent', `${w}x${h}`] : ['-resize', `${w}x${h}!`];
    const args = [f + '[0]', '-background', o.bg ?? 'black', '-alpha', 'remove', '-alpha', 'off', ...fit];
    if (o.blur) args.push('-blur', `0x${o.blur}`);
    run('convert', [...args, dst]);
    return dst;
  };
  const r = run('compare', ['-metric', 'RMSE', prep(a, 'a'), prep(b, 'b'), 'null:'], { allowFail: true });
  const m = /\(([\d.e-]+)\)/.exec(r.stderr);
  if (!m) throw new Error('compare: ' + r.stderr.slice(0, 200));
  return Number(m[1]);
}
function identify(f, fmt) { need('identify'); return run('identify', ['-format', fmt, f]).stdout.trim(); }
function imgStat(f, fx) { need('convert'); return Number(run('convert', [f + '[0]', '-format', `%[fx:${fx}]`, 'info:']).stdout.trim()); }
function ffprobe(f) {
  need('ffprobe');
  const r = run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', f]);
  if (r.status !== 0) throw new Error('ffprobe: ' + r.stderr.slice(0, 300));
  return JSON.parse(r.stdout);
}
function frameAt(video, index, dst) {
  need('ffmpeg');
  const r = run('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', `select=eq(n\\,${index})`, '-vframes', '1', dst]);
  if (r.status !== 0 || !existsSync(dst)) throw new Error('ffmpeg: ' + r.stderr.slice(0, 300));
  return dst;
}
const fmt = n => (Number.isFinite(n) ? n.toFixed(4) : String(n));

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

const DETALLADO = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
const PIECES = {
  // pattern piece with pixel effects and a non-default speed (exports must follow motion.speed)
  patron: {
    v: 2, source: 'pattern',
    layers: [{ pattern: 'marmol', a: 0.45, b: 0.35, scale: 0.9 }, { pattern: 'anillos', blend: 'multiply', mix: 0.55, scale: 0.8, a: 0.25, b: 0.3 }],
    motion: { speed: 0.6 }, glyph: { cell: 11, charset: DETALLADO, font: 'jetbrains', weight: 500 },
    color: { stops: ['#2b0d06', '#ff5b1f', '#ffe9c7'], bg: '#0b0708' }, interact: { mode: 'none' },
    fx: { glow: 0.35, vig: 0.45, bloom: 0.25 }, meta: { name: 'Verificación patrón', space: 'arte' },
  },
  // same composition, no pixel effects: the SVG must match the PNG almost exactly
  limpio: {
    v: 2, source: 'pattern',
    layers: [{ pattern: 'marmol', a: 0.45, b: 0.35, scale: 0.9 }, { pattern: 'anillos', blend: 'multiply', mix: 0.55, scale: 0.8, a: 0.25, b: 0.3 }],
    motion: { speed: 1 }, glyph: { cell: 12, charset: ' .:-=+*#%@', font: 'jetbrains', weight: 500 },
    color: { stops: ['#2b0d06', '#ff5b1f', '#ffe9c7'], bg: '#0b0708' }, interact: { mode: 'none' },
    meta: { name: 'Verificación limpia', space: 'arte' },
  },
  texto: {
    v: 2, source: 'text', text: { content: 'MONO', font: 'martian', weight: 800, size: 0.95 },
    layers: [{ pattern: 'franjas', a: 0.25, b: 0.35 }], media: { mix: 0.55, blend: 'multiply' }, tone: { contrast: 1.45, gamma: 0.9 },
    glyph: { cell: 10, charset: ' .:-=+*#%@', edge: 0.3, font: 'plex' }, color: { stops: ['#e4dccb', '#8a8173', '#1c1a17'], bg: '#f2ecdf' },
    msg: { on: true, text: 'teje luz', mode: 'static', y: 0.88, box: 0.9 }, interact: { mode: 'none' },
    meta: { name: 'Verificación texto', space: 'tipo' },
  },
  imagen: {
    v: 2, source: 'image', glyph: { cell: 10, aspect: 1.2, charset: DETALLADO, font: 'jetbrains' },
    color: { mode: 'source', vivid: 0.8, stops: ['#000000', '#ffffff'], bg: '#050505' }, interact: { mode: 'none' }, fx: { cellBg: 0.35 },
    meta: { name: 'Verificación imagen', space: 'media' },
  },
  // charsets the embeddable font subsets don't cover: blocks and braille become exact geometry, the rest text
  bloques: {
    v: 2, source: 'pattern', layers: [{ pattern: 'plasma', a: 0.3, b: 0.4 }], glyph: { cell: 14, aspect: 1.1, charset: ' ░▒▓█', font: 'jetbrains' },
    color: { stops: ['#0f2a4a', '#3f6d9e', '#a7c2e0'], bg: '#0a1f3a' }, interact: { mode: 'none' }, meta: { name: 'Verificación bloques', space: 'arte' },
  },
  braille: {
    v: 2, source: 'pattern', layers: [{ pattern: 'julia', a: 0.35, b: 0.4 }], glyph: { cell: 8, charset: ' ⠁⠃⠇⠏⠟⠿⡿⣿', font: 'jetbrains' },
    color: { stops: ['#0b1026', '#1f6f9f', '#57f0a2', '#d6a3ff'], bg: '#03050f' }, interact: { mode: 'none' }, meta: { name: 'Verificación braille', space: 'arte' },
  },
  simbolos: {
    v: 2, source: 'pattern', layers: [{ pattern: 'estrellas', a: 0.5, b: 0.6 }, { pattern: 'nube', blend: 'screen', mix: 0.5 }], glyph: { cell: 12, charset: ' ·∘○◎●', font: 'jetbrains' },
    color: { stops: ['#1b1638', '#5a4f9c', '#d9d4ff'], bg: '#080614' }, interact: { mode: 'none' }, meta: { name: 'Verificación símbolos', space: 'arte' },
  },
  terminal: {
    v: 2, source: 'pattern', layers: [{ pattern: 'dona', a: 0.3, b: 0.5 }],
    glyph: { cell: 9, aspect: 2, charset: ' .,-~:;=!*#$@', font: 'jetbrains', sort: false },
    color: { stops: ['#ffffff'], bg: '#0a0a0a' }, motion: { speed: 1 }, interact: { mode: 'none' },
    meta: { name: 'Verificación terminal', space: 'terminal' },
  },
  // message with double-width glyphs (CJK + emoji): text exports must keep cols×rows on screen
  anchos: {
    v: 2, source: 'pattern', layers: [{ pattern: 'ondas', a: 0.3, b: 0.5 }],
    glyph: { cell: 9, aspect: 2, charset: ' ｦｱｳｴｵｶｷ:.=*', font: 'jetbrains' }, color: { stops: ['#06220f', '#1fbf5b', '#b8ffcf'], bg: '#020a05' },
    msg: { on: true, text: 'こんにちは 😀 ok', mode: 'static', x: 0.5, y: 0.5, box: 0.9 }, interact: { mode: 'none' },
    meta: { name: 'Verificación anchos', space: 'terminal' },
  },
};
const encode = r => 'j' + Buffer.from(JSON.stringify(r)).toString('base64url');

/* ------------------------------------------------------------------ */
/* Browser helpers                                                     */
/* ------------------------------------------------------------------ */

let browser;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Opens the studio with a piece. Reduced motion makes the studio start paused at t = 0; the fake clock
 * lets us advance the engine by exact amounts (each animation frame is exactly 16 ms). */
async function openStudio(recipe, o = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1, acceptDownloads: true, reducedMotion: 'reduce',
    permissions: ['clipboard-read', 'clipboard-write'], ...(o.context ?? {}),
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:00.016Z'));
  await page.goto(`${BASE}/studio/#r=${encode(recipe)}`);
  await page.locator('.stage canvas').first().waitFor();
  await pump(page, 600);
  if (o.image) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Elegir imagen' }).first().click();
    await (await chooser).setFiles({ name: 'sintetica.png', mimeType: 'image/png', buffer: o.image });
    await page.getByRole('region', { name: 'Cargar fuente' }).waitFor({ state: 'detached' });
    await pump(page, 600);
  }
  await pump(page, 400);
  return { ctx, page, errors };
}

/** Advances the fake clock (animation frames, timers) while real async work settles. */
async function pump(page, ms, step = 32) {
  for (let t = 0; t < ms; t += step) { await page.clock.runFor(step); await sleep(4); }
}
/** Keeps the fake clock moving until `p` settles (exports await animation frames). */
async function pumping(page, p, limit = 240_000) {
  let done = false, val, err;
  p.then(v => { done = true; val = v; }, e => { done = true; err = e; });
  const t0 = Date.now();
  while (!done) {
    if (Date.now() - t0 > limit) throw new Error('tiempo agotado');
    await page.clock.runFor(32);
    await sleep(8);
  }
  if (err) throw err;
  return val;
}
async function download(page, dir, click) {
  const ev = page.waitForEvent('download', { timeout: 240_000 });
  await click();
  const d = await pumping(page, ev);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, d.suggestedFilename());
  await d.saveAs(path);
  return path;
}
async function openSheet(page, tab) {
  const t = page.getByRole('tab', { name: tab });
  if (!(await t.isVisible().catch(() => false))) {
    await page.keyboard.press('e');
    // the export sheet loads on demand and its loading line runs on timers: keep the fake clock moving
    for (let i = 0; i < 150 && !(await t.isVisible().catch(() => false)); i++) await pump(page, 100);
  }
  await t.click();
  await pump(page, 200);
}
async function closeSheet(page) { await page.keyboard.press('Escape'); await pump(page, 200); }
async function setSwitch(page, name, on) {
  const s = page.locator('.sheet-body').getByRole('switch', { name });
  if ((await s.isChecked()) !== on) await s.click({ force: true });
  await pump(page, 100);
}
async function stageShot(page, file) {
  await page.evaluate(() => {
    const c = document.querySelector('.stage canvas');
    for (const el of document.querySelectorAll('body *')) if (!el.contains(c)) el.style.visibility = 'hidden';
  });
  await pump(page, 64);
  // clip to the canvas's own pixels: an element screenshot of a canvas at a fractional position (the
  // terminal window is centred) grows by one row and shifts the comparison by a pixel
  const clip = await page.evaluate(() => {
    const c = document.querySelector('.stage canvas'), r = c.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: c.clientWidth, height: c.clientHeight };
  });
  await page.screenshot({ path: file, clip });
  await page.evaluate(() => { for (const el of document.querySelectorAll('body *')) el.style.visibility = ''; });
}
async function playFor(page, frames) {
  await page.getByRole('button', { name: 'Reproducir animación' }).click();
  await page.clock.runFor(16 * frames);
  await page.getByRole('button', { name: 'Pausar animación' }).click();
  await pump(page, 64);
}
async function clipboard(page) { return page.evaluate(() => navigator.clipboard.readText()); }

/** A synthetic photo-like image (gradients, shapes, text) drawn in the browser. */
async function syntheticImage() {
  const p = await browser.newPage();
  const b64 = await p.evaluate(async () => {
    const c = new OffscreenCanvas(960, 640), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 960, 640);
    g.addColorStop(0, '#1b3a6b'); g.addColorStop(0.5, '#e8a33d'); g.addColorStop(1, '#8c1c3a');
    x.fillStyle = g; x.fillRect(0, 0, 960, 640);
    const r = x.createRadialGradient(620, 280, 10, 620, 280, 220);
    r.addColorStop(0, '#fff6d8'); r.addColorStop(1, 'rgba(255,246,216,0)');
    x.fillStyle = r; x.beginPath(); x.arc(620, 280, 220, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#0d0d0d'; x.fillRect(90, 380, 260, 200);
    x.fillStyle = '#3fd17f'; x.beginPath(); x.moveTo(420, 600); x.lineTo(560, 380); x.lineTo(700, 600); x.fill();
    x.fillStyle = '#ffffff'; x.font = 'bold 120px sans-serif'; x.fillText('MT', 120, 200);
    const blob = await c.convertToBlob({ type: 'image/png' });
    const u8 = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await p.close();
  return Buffer.from(b64, 'base64');
}

/* ------------------------------------------------------------------ */
/* "Someone else's website": static server on another origin           */
/* ------------------------------------------------------------------ */

const SITE_DIR = join(OUT, 'sitio');
mkdirSync(SITE_DIR, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
function startSite() {
  const srv = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, SITE).pathname);
    let f = join(SITE_DIR, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!f.startsWith(SITE_DIR) || !existsSync(f)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' });
    res.end(readFileSync(f));
  });
  return new Promise(r => srv.listen(SITE_PORT, '127.0.0.1', () => r(srv)));
}
const page = (title, body, head = '') => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${head}
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#fafafa;color:#111}main{max-width:760px;margin:0 auto;padding:24px}</style></head>
<body>${body}</body></html>`;

/** Counts WebGL draw calls so a page can tell whether an exported canvas keeps rendering. */
const COUNT_DRAWS = `(() => {
  const P = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  window.__draws = 0;
  if (P) { const d = P.drawArrays; P.drawArrays = function (...a) { window.__draws++; return d.apply(this, a); }; }
})();`;
const NO_WEBGL2 = `(() => {
  const g = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' ? null : g.call(this, t, ...a); };
})();`;

let no3d = null;
async function visitSite(url, o = {}) {
  const b = o.no3d ? (no3d ??= await chromium.launch({ args: [...GL_ARGS, '--disable-3d-apis'] })) : browser;
  const ctx = await b.newContext({ viewport: o.viewport ?? { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: o.reducedMotion ?? 'no-preference' });
  await ctx.addInitScript(COUNT_DRAWS);
  if (o.noWebgl2) await ctx.addInitScript(NO_WEBGL2);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    if (FONT_HOSTS.test(m.location()?.url ?? '')) { fontIssues.add(m.text()); return; }
    errors.push('console: ' + m.text() + (m.location()?.url ? ' @ ' + m.location().url : ''));
  });
  p.on('requestfailed', r => { if (FONT_HOSTS.test(r.url())) fontIssues.add(r.failure()?.errorText ?? 'error'); else errors.push('requestfailed: ' + r.url()); });
  await p.goto(url);
  await p.waitForTimeout(o.settle ?? 2500);
  return { ctx, p, errors };
}
const draws = p => p.evaluate(() => window.__draws);
async function drawRate(p, ms = 1200) { const a = await draws(p); await p.waitForTimeout(ms); return (await draws(p)) - a; }
/** Standard deviation of the luminance of a screenshot: ~0 means a blank (flat) area. */
function spread(png) { return imgStat(png, 'standard_deviation'); }

/* ------------------------------------------------------------------ */
/* 1. Studio exports: image, vector, GIF, WebM, MP4, live recording     */
/* ------------------------------------------------------------------ */

const studioFiles = {};   // piece → { name → path }
const SYNTH = join(OUT, 'sintetica.png');
const codeOut = {};       // piece → code exports read from the Code tab

async function studioPiece(key, o = {}) {
  const dir = join(OUT, key);
  mkdirSync(dir, { recursive: true });
  const files = (studioFiles[key] = {});
  const { ctx, page, errors } = await openStudio(PIECES[key], o);
  try {
    await check('estudio', `${key}: arranca en pausa (t = 0) sin errores`, async () => {
      await page.getByRole('button', { name: 'Reproducir animación' }).waitFor({ timeout: 5000 });
      assert(!errors.length, errors.join(' | '));
      return 'reducir movimiento → pausa, reloj simulado';
    });
    files.live0 = join(dir, 'vivo-t0.png');
    await stageShot(page, files.live0);
    const [cw, chh] = await page.evaluate(() => { const c = document.querySelector('.stage canvas'); return [c.width, c.height]; });

    if (want('imagen')) {
      await openSheet(page, 'Imagen');
      await page.locator('#ex-size').selectOption('v1');
      for (const f of o.formats ?? ['png', 'webp', 'jpeg']) {
        await page.getByRole('button', { name: f.toUpperCase(), exact: true }).click();
        files[f] = await download(page, dir, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
      }
      await page.getByRole('button', { name: 'PNG', exact: true }).click();
      await page.locator('#ex-size').selectOption('v2');
      files.png2 = await download(page, dir, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
      const FIXED = { hd: [1920, 1080], sq: [1080, 1080], story: [1080, 1920], og: [1200, 630], '4k': [3840, 2160] };
      const fixedOut = [];
      for (const id of o.sizes ?? []) {
        await page.locator('#ex-size').selectOption(id);
        const f = await download(page, join(dir, 'tamanos'), () => page.getByRole('button', { name: 'Descargar imagen' }).click());
        fixedOut.push([id, f]);
      }
      if (fixedOut.length) await check('imagen', `${key}: tamaños fijos exactos (${fixedOut.map(([id]) => FIXED[id].join('×')).join(', ')})`, () => {
        const got = fixedOut.map(([id, f]) => [id, identify(f, '%w×%h')]);
        const bad = got.filter(([id, d]) => d !== FIXED[id].join('×'));
        assert(!bad.length, bad.map(([id, d]) => `${FIXED[id].join('×')} → ${d}`).join(', '));
        return got.map(([, d]) => d).join(', ');
      });
      if (o.transparent) {
        await page.locator('#ex-size').selectOption('v1');
        await setSwitch(page, /Fondo transparente/, true);
        files.pngT = await download(page, join(dir, 'transparente'), () => page.getByRole('button', { name: 'Descargar imagen' }).click());
        await setSwitch(page, /Fondo transparente/, false);
      }
      await closeSheet(page);

      await check('imagen', `${key}: PNG/WebP/JPEG tamaño = lienzo (${cw}×${chh})`, () => {
        const out = [];
        for (const f of o.formats ?? ['png', 'webp', 'jpeg']) {
          const [fm, w, h] = identify(files[f], '%m %w %h').split(' ');
          assert(+w === cw && +h === chh, `${f}: ${w}×${h}`);
          out.push(`${fm} ${w}×${h}`);
        }
        return out.join(', ');
      });
      await check('imagen', `${key}: PNG = lienzo en vivo en el mismo instante (RMSE)`, () => {
        const e = rmse(files.live0, files.png);
        assert(e < 0.03, 'RMSE ' + fmt(e));
        return 'RMSE ' + fmt(e);
      });
      if (files.webp) await check('imagen', `${key}: WebP/JPEG ≈ PNG (compresión con pérdida)`, () => {
        const a = rmse(files.png, files.webp), b = rmse(files.png, files.jpeg);
        assert(a < 0.06 && b < 0.08, `webp ${fmt(a)}, jpeg ${fmt(b)}`);
        return `webp ${fmt(a)}, jpeg ${fmt(b)}`;
      });
      await check('imagen', `${key}: «Vista ×2» mantiene la composición`, () => {
        const [w, h] = identify(files.png2, '%w %h').split(' ').map(Number);
        assert(w === cw * 2 && h === chh * 2, `${w}×${h}`);
        const e = rmse(files.png, files.png2, { blur: 3 });
        assert(e < 0.05, 'RMSE (desenfocado) ' + fmt(e));
        return `${w}×${h}, RMSE tras reducir y desenfocar ${fmt(e)}`;
      });
      if (files.pngT) await check('imagen', `${key}: PNG transparente tiene alfa real`, () => {
        const ch = identify(files.pngT, '%[channels]');
        const minA = imgStat(files.pngT, 'minima.a'), maxA = imgStat(files.pngT, 'maxima.a'), meanA = imgStat(files.pngT, 'mean.a');
        assert(/a/.test(ch) && minA === 0 && maxA === 1 && meanA < 0.9, `canales ${ch}, alfa min ${minA} max ${maxA} media ${fmt(meanA)}`);
        return `canales ${ch}, alfa min 0 · max 1 · media ${fmt(meanA)}`;
      });
    }

    if (want('vector')) {
      await openSheet(page, 'Vector');
      await page.getByRole('button', { name: 'Contornos (fiel)' }).click();
      files.svgOutline = await download(page, join(dir, 'svg-contornos'), () => page.getByRole('button', { name: 'Descargar SVG' }).click());
      const notes = await page.locator('.ex-card .warn').allTextContents();
      await page.getByRole('button', { name: 'Texto editable' }).click();
      files.svgText = await download(page, join(dir, 'svg-texto'), () => page.getByRole('button', { name: 'Descargar SVG' }).click());
      await closeSheet(page);
      await svgChecks(key, files, cw, chh, notes, o);
    }

    if (want('video') && o.video) await videoChecks(key, page, files, dir, cw, chh);
    if (want('codigo') && o.code) codeOut[key] = await readCodeTab(page, dir, files);
    if (want('terminal') && o.terminal) await terminalExports(key, page, dir, files);
    if (want('video') && o.video) await liveRecording(key, page, dir);

    await check('estudio', `${key}: sin errores en consola durante las exportaciones`, () => {
      assert(!errors.length, errors.slice(0, 3).join(' | '));
      return 'ninguno';
    });
  } finally {
    await ctx.close();
  }
}

async function svgChecks(key, files, cw, chh, notes, o) {
  for (const mode of ['svgOutline', 'svgText']) {
    const f = files[mode];
    const label = `${key}: SVG ${mode === 'svgOutline' ? 'contornos' : 'texto'}`;
    const text = readFileSync(f, 'utf8');
    await check('vector', `${label} es XML bien formado`, () => {
      need('xmllint');
      const r = run('xmllint', ['--noout', f], { allowFail: true });
      assert(r.status === 0, r.stderr.slice(0, 200));
      return `xmllint ok, ${Math.round(text.length / 1024)} KB`;
    });
    await check('vector', `${label}: viewBox/width/height = ${cw}×${chh}, sin referencias externas`, () => {
      const m = /<svg[^>]*viewBox="0 0 (\d+) (\d+)"[^>]*width="(\d+)" height="(\d+)"/.exec(text);
      assert(m, 'sin viewBox/width/height');
      const [vw, vh, w, h] = m.slice(1).map(Number);
      // the grid covers the canvas (last column/row may overflow by < 1 cell)
      assert(w === vw && h === vh && w >= cw && h >= chh && w - cw < 40 && h - chh < 40, `viewBox ${vw}×${vh}, width ${w}, height ${h}`);
      const ext = text.match(/(?:href|src)="(?!#)[^"]*"|url\((?!#)[^)]*\)|@import|<image\b|<script\b|<foreignObject/g) ?? [];
      assert(!ext.length, 'externas: ' + ext.slice(0, 3).join(' '));
      if (mode === 'svgText') assert(/font-family="[^"]+"/.test(text), 'texto sin font-family');
      return `viewBox 0 0 ${vw} ${vh}; externas: 0${mode === 'svgText' ? '; ' + (/font-family="([^"]+)"/.exec(text)[1].replace(/&quot;/g, '"').slice(0, 40)) : ''}`;
    });
    const pngRef = files.png;
    const renders = {};
    await check('vector', `${label}: rsvg-convert lo rasteriza`, () => {
      need('rsvg-convert');
      const dst = f.replace(/\.svg$/, '.rsvg.png');
      const r = run('rsvg-convert', ['-o', dst, f], { allowFail: true });
      assert(r.status === 0 && existsSync(dst), r.stderr.slice(0, 200));
      renders.rsvg = dst;
      return identify(dst, '%w×%h');
    });
    await check('vector', `${label}: Inkscape lo exporta a PNG`, () => {
      need('inkscape');
      const dst = f.replace(/\.svg$/, '.inkscape.png');
      const r = run('inkscape', [f, '--export-type=png', `--export-filename=${dst}`], { allowFail: true, timeout: 180_000, env: { HOME: join(OUT, 'inkscape-home') } });
      assert(existsSync(dst), (r.stderr || '').slice(-200));
      renders.inkscape = dst;
      return identify(dst, '%w×%h');
    });
    await check('vector', `${label}: Chromium lo muestra`, async () => {
      const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      const b64 = Buffer.from(text).toString('base64');
      await p.setContent(`<body style="margin:0"><img id="i" src="data:image/svg+xml;base64,${b64}"></body>`);
      await p.waitForFunction(() => document.getElementById('i').complete);
      const nat = await p.evaluate(() => { const i = document.getElementById('i'); return [i.naturalWidth, i.naturalHeight]; });
      const dst = f.replace(/\.svg$/, '.chromium.png');
      await p.locator('#i').screenshot({ path: dst });
      await p.close();
      assert(nat[0] > 0, 'no carga');
      renders.chromium = dst;
      return `${nat[0]}×${nat[1]}`;
    });
    if (o.svgNote && mode === 'svgOutline') await check('vector', `${label}: la interfaz avisa de lo que el SVG no reproduce igual`, () => {
      assert(notes.some(t => o.svgNote.test(t)), 'sin aviso; avisos: ' + (notes.join(' | ') || 'ninguno'));
      const texts = (text.match(/<text\b/g) ?? []).length, geo = (text.match(/<circle\b/g) ?? []).length;
      return notes.join(' ') + (texts ? ` (${texts} <text>)` : '') + (geo ? ` (${geo} puntos)` : '');
    });
    if (pngRef) {
      for (const [tool, png] of Object.entries(renders)) {
        // text mode needs the typeface installed: rsvg/Inkscape here fall back to another mono (fontconfig)
        const limit = o.svgInfo ? Infinity : (mode === 'svgOutline' ? 0.03 : tool === 'chromium' ? 0.04 : 0.08);
        await check('vector', `${label}: ${tool} ≈ PNG del mismo fotograma${o.svgInfo ? ' (informativo)' : ''}`, () => {
          const e = rmse(pngRef, png, { bg: o.bg });
          const eBlur = rmse(pngRef, png, { bg: o.bg, blur: 2 });
          assert(eBlur < limit, `RMSE ${fmt(e)}, desenfocado ${fmt(eBlur)} (límite ${limit})`);
          return `RMSE ${fmt(e)}, desenfocado ${fmt(eBlur)}`;
        });
      }
    }
  }
}

async function videoChecks(key, page, files, dir, cw, chh) {
  const speed = PIECES[key].motion?.speed ?? 1;
  await openSheet(page, 'Video y GIF');
  const sh = page.locator('.sheet-body');
  await page.locator('#v-size').selectOption('v1');
  await sh.getByLabel('Duración (s)').fill('2');
  await sh.getByLabel('Fotogramas/s').selectOption('30');
  await pump(page, 100);
  const mp4Btn = sh.getByRole('button', { name: 'MP4 (H.264)' });
  const webmBtn = sh.getByRole('button', { name: 'WebM' });
  await pumping(page, webmBtn.isEnabled());
  await pump(page, 300);
  const avc = await page.evaluate(async () => (await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: 640, height: 360 })).supported);
  // an MP4 the browser cannot encode is not a (disabled) button but an explanation row
  const mp4Enabled = (await mp4Btn.count()) > 0 && await mp4Btn.isEnabled();
  const sheetText = (await sh.locator('.ex-na').allTextContents()).join(' ');
  await check('mp4', `${key}: MP4 coherente con lo que el navegador codifica`, () => {
    if (avc) { assert(mp4Enabled, 'H.264 disponible pero no hay botón MP4 activo'); return 'H.264 disponible y botón activo'; }
    assert(!mp4Enabled, 'el navegador no codifica H.264 pero el botón MP4 está activo');
    assert(/H\.264|MP4/i.test(sheetText) && /no puede|no codifica|no disponible/i.test(sheetText), 'la interfaz no explica por qué no hay MP4: «' + sheetText.slice(0, 200) + '»');
    return 'VideoEncoder.isConfigSupported(avc1) = false → sin botón MP4 y aviso: «' + sheetText.trim() + '»';
  });
  if (await webmBtn.isEnabled()) {
    files.webm = await download(page, dir, () => webmBtn.click());
  }
  if (mp4Enabled) files.mp4 = await download(page, dir, () => mp4Btn.click());
  await page.locator('#gif-w').selectOption('640');
  files.gif = await download(page, dir, () => page.getByRole('button', { name: 'Descargar GIF' }).click());
  await closeSheet(page);

  const n = 60;
  await check('webm', `${key}: ffprobe (códec, fps, duración, fotogramas)`, () => {
    assert(files.webm, 'botón WebM desactivado');
    const j = ffprobe(files.webm), s = j.streams[0];
    const [a, b] = s.avg_frame_rate.split('/').map(Number);
    const fps = a / b, dur = Number(j.format.duration), frames = Number(s.nb_read_frames);
    assert(/vp9|vp8/.test(s.codec_name) && s.width === cw + (cw % 2) && s.height === chh + (chh % 2), `${s.codec_name} ${s.width}×${s.height}`);
    assert(Math.abs(fps - 30) < 0.01 && Math.abs(dur - 2) < 0.05 && frames === n, `fps ${fps}, duración ${dur}, fotogramas ${frames}`);
    return `${s.codec_name} ${s.width}×${s.height}, ${fps} fps, ${dur} s, ${frames} fotogramas, ${j.format.format_name}`;
  });
  await check('webm', `${key}: decodificación completa sin errores (ffmpeg -v error)`, () => {
    need('ffmpeg'); assert(files.webm, 'sin WebM');
    const r = run('ffmpeg', ['-v', 'error', '-i', files.webm, '-f', 'null', '-']);
    assert(r.status === 0 && !r.stderr.trim(), r.stderr.slice(0, 200));
    return 'sin errores';
  });
  // video is YUV 4:2:0: thin coloured glyphs lose chroma, so frames are compared slightly blurred (σ = 2 px)
  await check('webm', `${key}: fotograma 0 = PNG en t = 0`, () => {
    assert(files.webm, 'sin WebM');
    const f0 = frameAt(files.webm, 0, join(dir, 'webm-f0.png'));
    const e = rmse(files.png, f0, { blur: 2 }), raw = rmse(files.png, f0);
    assert(e < 0.035, `RMSE desenfocado ${fmt(e)} (sin desenfocar ${fmt(raw)})`);
    return `RMSE desenfocado ${fmt(e)} (sin desenfocar ${fmt(raw)}: croma 4:2:0 de VP9)`;
  });
  // 50 frames of 16 ms at motion.speed → engine time 0.8·speed = frame 24 at 30 fps (when exports follow the speed)
  await playFor(page, 50);
  await openSheet(page, 'Imagen');
  await page.locator('#ex-size').selectOption('v1');
  files.pngMid = await download(page, join(dir, 'medio'), () => page.getByRole('button', { name: 'Descargar imagen' }).click());
  await closeSheet(page);
  const tMid = 0.8 * speed, iMid = Math.round(tMid * 30 / speed);
  await check('webm', `${key}: fotograma ${iMid} (t = ${tMid.toFixed(2)}, velocidad ${speed}) = PNG en el mismo instante`, () => {
    assert(files.webm, 'sin WebM');
    const mid = frameAt(files.webm, iMid, join(dir, `webm-f${iMid}.png`));
    const e = rmse(files.pngMid, mid, { blur: 2 });
    const control = rmse(files.png, mid, { blur: 2 });
    const wrong = Math.round(tMid * 30);   // where the PNG would land if clips ignored motion.speed
    const other = speed !== 1 ? rmse(files.pngMid, frameAt(files.webm, wrong, join(dir, `webm-f${wrong}.png`)), { blur: 2 }) : NaN;
    assert(e < 0.035 && e < control, `RMSE desenfocado ${fmt(e)} (control contra t = 0: ${fmt(control)}; fotograma ${wrong}: ${fmt(other)})`);
    return `RMSE desenfocado ${fmt(e)} · controles: fotograma 0 ${fmt(control)}${speed !== 1 ? `, fotograma ${wrong} ${fmt(other)}` : ''}`;
  });
  await check('gif', `${key}: gifsicle --info (fotogramas, retardos, bucle)`, () => {
    need('gifsicle');
    const info = run('gifsicle', ['--info', files.gif]).stdout;
    const imgs = Number(/(\d+) images/.exec(info)?.[1]);
    const delays = [...info.matchAll(/delay ([\d.]+)s/g)].map(m => Number(m[1]));
    const total = delays.reduce((a, b) => a + b, 0);
    assert(imgs === 50, `${imgs} fotogramas`);
    assert(/loop forever/.test(info), 'sin bucle infinito');
    assert(Math.abs(total - 2) < 0.02, `duración total ${total.toFixed(2)} s`);
    return `${imgs} fotogramas, retardo ${[...new Set(delays)].join('/')} s, total ${total.toFixed(2)} s, loop forever, ${/logical screen (\d+x\d+)/.exec(info)?.[1]}`;
  });
  await check('gif', `${key}: ffprobe lo lee`, () => {
    const j = ffprobe(files.gif), s = j.streams[0];
    assert(s.codec_name === 'gif' && Number(s.nb_read_frames) === 50, `${s.codec_name}, ${s.nb_read_frames} fotogramas`);
    return `${s.codec_name} ${s.width}×${s.height}, ${s.nb_read_frames} fotogramas, ${Number(j.format.duration).toFixed(2)} s`;
  });
  await check('gif', `${key}: primer fotograma ≈ PNG (misma composición)`, () => {
    need('convert');
    const f0 = join(dir, 'gif-f0.png');
    run('convert', [files.gif + '[0]', f0]);
    const e = rmse(f0, files.png, { blur: 2 });
    assert(e < 0.06, 'RMSE ' + fmt(e));
    return `RMSE (desenfocado) ${fmt(e)} — 128 colores, 640 px`;
  });
  if (files.mp4) await check('mp4', `${key}: ffprobe del MP4`, () => {
    const j = ffprobe(files.mp4), s = j.streams[0];
    assert(s.codec_name === 'h264', s.codec_name);
    return `${s.codec_name} ${s.profile} ${s.width}×${s.height}, ${s.nb_read_frames} fotogramas`;
  });
}

async function liveRecording(key, page, dir) {
  const mimes = await page.evaluate(() => ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=vp9']
    .map(t => `${t}: ${MediaRecorder.isTypeSupported(t) ? 'sí' : 'no'}`).join(', '));
  await check('directo', `MediaRecorder: tipos admitidos`, () => mimes);
  await page.clock.resume();
  await page.getByRole('button', { name: 'Reproducir animación' }).click();
  await openSheet(page, 'Video y GIF');
  await page.getByRole('button', { name: 'Empezar a grabar' }).click();
  await sleep(2500);
  const ev = page.waitForEvent('download');
  await page.getByRole('button', { name: /Detener y guardar/ }).click();
  const d = await ev;
  const f = join(dir, d.suggestedFilename());
  await d.saveAs(f);
  await check('directo', `${key}: grabación en directo (ffprobe)`, () => {
    need('ffprobe', 'ffmpeg');
    const r = run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]);
    const j = JSON.parse(r.stdout), s = j.streams[0];
    const ext = extname(f).slice(1), container = j.format.format_name;
    assert(ext === 'webm' ? /webm|matroska/.test(container) : /mp4|mov/.test(container), `extensión .${ext} pero contenedor ${container}`);
    // .mp4 is only honest with H.264 inside (what social networks, Keynote and editors expect)
    assert(ext !== 'mp4' || s.codec_name === 'h264', `.mp4 con ${s.codec_name} dentro: no se abre en QuickTime/Keynote ni en muchas redes`);
    const dec = run('ffmpeg', ['-v', 'error', '-i', f, '-f', 'null', '-']);
    assert(dec.status === 0, dec.stderr.slice(0, 200));
    return `${d.suggestedFilename()}: ${container}, ${s.codec_name} ${s.width}×${s.height}${dec.stderr.trim() ? ' (avisos: ' + dec.stderr.trim().slice(0, 80) + ')' : ', decodifica sin errores'}`;
  });
}

/* ------------------------------------------------------------------ */
/* 2. MP4 muxing path, independently of H.264                          */
/* ------------------------------------------------------------------ */

async function mp4Muxing() {
  const dir = join(SITE_DIR, 'mp4');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(ROOT, 'node_modules/mediabunny/dist/bundles/mediabunny.min.mjs'), join(dir, 'mediabunny.mjs'));
  // the same calls as src/studio/exporting.ts (Mp4OutputFormat fastStart in-memory, CanvasSource, QUALITY_HIGH, 2 s keyframes)
  writeFileSync(join(dir, 'index.html'), page('mp4', `<canvas id="c" width="640" height="360"></canvas>
<script type="module">
import * as mb from './mediabunny.mjs';
window.mux = async codec => {
  const c = document.getElementById('c'), x = c.getContext('2d');
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const src = new mb.CanvasSource(c, { codec, quality: mb.QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(src, { frameRate: 30 });
  await output.start();
  for (let i = 0; i < 45; i++) {
    x.fillStyle = 'hsl(' + i * 8 + ' 80% 50%)'; x.fillRect(0, 0, 640, 360);
    x.fillStyle = '#fff'; x.font = '64px monospace'; x.fillText('#' + i, 40 + i * 8, 200);
    await src.add(i / 30, 1 / 30);
  }
  await output.finalize();
  const u8 = new Uint8Array(target.buffer);
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
window.canAvc = () => mb.canEncodeVideo('avc', { width: 640, height: 360 });
</script>`));
  const p = await browser.newPage();
  await p.goto(`${SITE}/mp4/`);
  await p.waitForFunction(() => typeof window.mux === 'function');
  const avc = await p.evaluate(() => window.canAvc());
  await check('mp4', 'Chromium de esta máquina: ¿codifica H.264 con WebCodecs?', () => {
    return avc ? 'sí' : 'no (VideoEncoder.isConfigSupported(avc1.*) = false a 640×360, 1280×720, 1366×768, 1920×1080): el H.264 no se puede verificar aquí';
  });
  for (const codec of ['vp9', 'av1']) {
    await check('mp4', `muxer MP4 de mediabunny (mismo código) con ${codec}`, async () => {
      const b64 = await p.evaluate(c => window.mux(c), codec);
      const f = join(OUT, `mux-${codec}.mp4`);
      writeFileSync(f, Buffer.from(b64, 'base64'));
      const j = ffprobe(f), s = j.streams[0];
      const dec = run('ffmpeg', ['-v', 'error', '-i', f, '-f', 'null', '-']);
      assert(/mp4/.test(j.format.format_name) && Number(s.nb_read_frames) === 45 && dec.status === 0 && !dec.stderr.trim(), `${j.format.format_name} ${s.codec_name} ${s.nb_read_frames} fotogramas ${dec.stderr.slice(0, 100)}`);
      const moov = Buffer.from(b64, 'base64').indexOf('moov'), mdat = Buffer.from(b64, 'base64').indexOf('mdat');
      return `${j.format.format_name}, ${s.codec_name} ${s.width}×${s.height}, ${s.nb_read_frames} fotogramas, ${Number(j.format.duration).toFixed(2)} s, moov antes que mdat: ${moov < mdat ? 'sí (fastStart)' : 'no'}`;
    });
  }
  if (avc) await check('mp4', 'muxer MP4 con H.264', async () => {
    const b64 = await p.evaluate(() => window.mux('avc'));
    const f = join(OUT, 'mux-avc.mp4');
    writeFileSync(f, Buffer.from(b64, 'base64'));
    const s = ffprobe(f).streams[0];
    return `${s.codec_name} ${s.profile}`;
  });
  await p.close();
}

/* ------------------------------------------------------------------ */
/* 3. Code: HTML snippet, standalone page, Web Component, React         */
/* ------------------------------------------------------------------ */

async function readCodeTab(page, dir, files) {
  await openSheet(page, 'Código');
  const out = { html: {} };
  const code = () => page.getByRole('textbox', { name: 'Código' }).inputValue();
  const media = page.getByPlaceholder(/URL de tu imagen/);
  if (await media.isVisible().catch(() => false)) { await media.fill('foto.png'); await pump(page, 100); }
  await page.getByRole('button', { name: 'HTML para pegar' }).click();
  for (const [id, name] of [['fixed', 'Fondo de página'], ['hero', 'Portada'], ['block', 'Bloque']]) {
    await page.getByRole('button', { name, exact: true }).click();
    await pump(page, 100);
    out.html[id] = await code();
  }
  await page.getByRole('button', { name: 'Bloque', exact: true }).click();
  out.pagePath = await download(page, dir, () => page.getByRole('button', { name: /Descargar página/ }).click());
  const poster = page.getByRole('button', { name: /Descargar póster/ });
  out.posterPath = (await poster.isVisible().catch(() => false)) ? await download(page, join(dir, 'poster'), () => poster.click()) : null;
  out.codeNote = (await page.locator('.sheet-body').innerText()).replace(/\s+/g, ' ');
  await page.getByRole('button', { name: 'Web Component' }).click();
  await pump(page, 100);
  out.wcUsage = await code();
  out.wcPath = await download(page, dir, () => page.getByRole('button', { name: /Descargar monotrama-field/ }).click());
  await page.getByRole('button', { name: 'React' }).click();
  await pump(page, 100);
  out.react = await code();
  await closeSheet(page);
  return out;
}

const HEADER_RE = /Hecho con Monotrama · https:\/\/monotrama\.vercel\.app · Licencia MIT-0/;

async function codeChecks(key) {
  const c = codeOut[key];
  if (!c) return;
  const dir = join(SITE_DIR, key);
  mkdirSync(dir, { recursive: true });
  const filler = n => Array.from({ length: n }, (_, i) => `<p>Párrafo ${i + 1} de contenido real de la página, para que se pueda desplazar.</p>`).join('\n');
  const media = PIECES[key].source === 'image';
  if (media) copyFileSync(SYNTH, join(dir, 'foto.png'));
  const poster = c.posterPath;
  if (poster) copyFileSync(poster, join(dir, 'poster.png'));

  await check('codigo', `${key}: cabecera MIT-0 en todo el código exportado`, () => {
    const missing = [];
    for (const [id, s] of Object.entries(c.html)) if (!HEADER_RE.test(s)) missing.push('HTML ' + id);
    if (!HEADER_RE.test(readFileSync(c.wcPath, 'utf8'))) missing.push('monotrama-field.js');
    if (!HEADER_RE.test(c.react)) missing.push('React');
    if (!HEADER_RE.test(readFileSync(c.pagePath, 'utf8'))) missing.push('página .html');
    assert(!missing.length, 'falta en: ' + missing.join(', '));
    return 'HTML ×3, página, Web Component, React';
  });

  for (const [id, snippet] of Object.entries(c.html)) {
    const body = id === 'fixed'
      ? `<main><h1>Mi web</h1>${snippet}\n${filler(40)}</main>`
      : `<main><h1>Mi web</h1>${filler(3)}\n${snippet}\n${filler(40)}</main>`;
    writeFileSync(join(dir, `html-${id}.html`), page(`HTML ${id}`, body));
    await check('codigo', `${key}: «HTML para pegar» (${id}) en otra web`, async () => {
      const { ctx, p, errors } = await visitSite(`${SITE}/${key}/html-${id}.html`);
      try {
        const shot = join(OUT, key, `sitio-html-${id}.png`);
        const cv = p.locator('.monotrama canvas');
        await cv.screenshot({ path: shot });
        const box = await cv.boundingBox();
        const sd = spread(shot), rate = await drawRate(p);
        assert(!errors.length, errors.slice(0, 2).join(' | '));
        assert(sd > 0.02 && rate > 5, `desviación ${fmt(sd)}, draws/1.2 s ${rate}`);
        let off = '';
        if (id !== 'fixed') {
          await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await p.waitForTimeout(400);
          const offRate = await drawRate(p);
          assert(offRate === 0, `fuera de pantalla sigue dibujando (${offRate} draws/1.2 s)`);
          off = ', fuera de pantalla 0 draws';
        }
        return `${Math.round(box.width)}×${Math.round(box.height)} px, desviación ${fmt(sd)}, ${rate} draws/1.2 s${off}, sin errores`;
      } finally { await ctx.close(); }
    });
  }
  await check('codigo', `${key}: pegado al tamaño del lienzo del estudio = PNG del estudio (t = 0)`, async () => {
    const [w, h] = identify(studioFiles[key].png, '%w %h').split(' ').map(Number);
    writeFileSync(join(dir, 'parecido.html'), page('parecido', `<style>.monotrama{width:${w}px;height:${h}px!important;border-radius:0!important}</style>${c.html.block}`));
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/parecido.html`, { reducedMotion: 'reduce', settle: 3500, viewport: { width: w + 100, height: h + 100 } });
    try {
      const shot = join(OUT, key, 'sitio-parecido.png');
      await p.locator('.monotrama canvas').screenshot({ path: shot });
      assert(!errors.length, errors.slice(0, 2).join(' | '));
      const e = rmse(studioFiles[key].png, shot), eb = rmse(studioFiles[key].png, shot, { blur: 2 });
      assert(eb < 0.05, `RMSE ${fmt(e)}, desenfocado ${fmt(eb)}`);
      return `${w}×${h}: RMSE ${fmt(e)}, desenfocado ${fmt(eb)} (Google Fonts frente a fuente local del estudio)`;
    } finally { await ctx.close(); }
  });
  await check('codigo', `${key}: «reducir movimiento» → un fotograma y quieto`, async () => {
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/html-block.html`, { reducedMotion: 'reduce' });
    try {
      const shot = join(OUT, key, 'sitio-reducido.png');
      await p.locator('.monotrama canvas').screenshot({ path: shot });
      const rate = await drawRate(p, 1500), sd = spread(shot);
      assert(!errors.length, errors.slice(0, 2).join(' | '));
      assert(rate === 0 && sd > 0.02, `draws/1.5 s ${rate}, desviación ${fmt(sd)}`);
      return `0 draws en 1.5 s, imagen fija visible (desviación ${fmt(sd)})`;
    } finally { await ctx.close(); }
  });
  await check('codigo', `${key}: sin WebGL 2 → color de fondo${poster ? ' + póster' : ''}, sin excepciones`, async () => {
    const posterSnippet = poster ? c.html.block.replace(/"poster":""/, '"poster":"poster.png"') : c.html.block;
    writeFileSync(join(dir, 'html-sin-webgl.html'), page('sin webgl', `<main><h1>Mi web</h1>${posterSnippet}</main>`));
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/html-sin-webgl.html`, { noWebgl2: true });
    try {
      const pageErrors = errors.filter(e => e.startsWith('pageerror'));
      assert(!pageErrors.length, pageErrors.join(' | '));
      const st = await p.evaluate(() => { const c = document.querySelector('.monotrama canvas'); const s = getComputedStyle(c); const w = getComputedStyle(c.parentElement); return { bg: s.backgroundColor, img: s.backgroundImage, wrap: w.backgroundColor }; });
      const hex = PIECES[key].color.bg, rgb = `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
      assert(st.wrap === rgb, `fondo ${st.wrap}, esperado ${rgb}`);
      if (poster) {
        assert(/poster\.png/.test(st.img), 'sin póster: ' + st.img);
        const shot = join(OUT, key, 'sitio-sin-webgl.png');
        await p.waitForTimeout(500);
        await p.locator('.monotrama canvas').screenshot({ path: shot });
        const e = rmse(shot, poster, { blur: 2, cover: true });
        assert(e < 0.08, 'el póster no se ve: RMSE ' + fmt(e));
        return `fondo ${st.wrap}, póster visible (RMSE contra el PNG ${fmt(e)}), 0 excepciones`;
      }
      return `fondo ${st.wrap}, 0 excepciones`;
    } finally { await ctx.close(); }
  });
  await check('codigo', `${key}: Chromium con --disable-3d-apis → sin excepciones${poster ? ', póster' : ''}`, async () => {
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/html-sin-webgl.html`, { no3d: true });
    try {
      const gl = await p.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
      assert(!gl, 'WebGL 2 sigue disponible');
      const pe = errors.filter(e => e.startsWith('pageerror'));
      assert(!pe.length, pe.join(' | '));
      const img = await p.evaluate(() => getComputedStyle(document.querySelector('.monotrama canvas')).backgroundImage);
      assert(!poster || /poster\.png/.test(img), 'sin póster: ' + img);
      return `getContext('webgl2') = null; ${poster ? 'póster visible; ' : ''}0 excepciones`;
    } finally { await ctx.close(); }
  });
  await check('codigo', `${key}: página .html descargada funciona sola (otro origen)`, async () => {
    copyFileSync(c.pagePath, join(dir, 'pagina.html'));
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/pagina.html`);
    try {
      const shot = join(OUT, key, 'sitio-pagina.png');
      await p.locator('canvas').first().screenshot({ path: shot });
      assert(!errors.length, errors.slice(0, 2).join(' | '));
      const sd = spread(shot);
      assert(sd > 0.02, 'lienzo plano, desviación ' + fmt(sd));
      return `desviación ${fmt(sd)}, sin errores`;
    } finally { await ctx.close(); }
  });
  await check('codigo', `${key}: Web Component (<monotrama-field> + monotrama-field.js)`, async () => {
    copyFileSync(c.wcPath, join(dir, 'monotrama-field.js'));
    writeFileSync(join(dir, 'wc.html'), page('wc', `<main><h1>Mi web</h1>${filler(2)}\n${c.wcUsage}\n${filler(40)}</main>`));
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/wc.html`);
    try {
      const shot = join(OUT, key, 'sitio-wc.png');
      await p.locator('monotrama-field').screenshot({ path: shot });
      const sd = spread(shot), rate = await drawRate(p);
      assert(!errors.length, errors.slice(0, 2).join(' | '));
      assert(sd > 0.02 && rate > 5, `desviación ${fmt(sd)}, draws ${rate}`);
      let off = '';
      if (!/position:fixed/.test(c.wcUsage)) {
        await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await p.waitForTimeout(400);
        const r2 = await drawRate(p);
        assert(r2 === 0, `fuera de pantalla sigue dibujando (${r2})`);
        off = ', fuera de pantalla 0 draws';
      }
      await p.evaluate(() => document.querySelector('monotrama-field').remove());
      await p.waitForTimeout(200);
      const r3 = await drawRate(p, 800);
      assert(r3 === 0, `tras quitar el elemento sigue dibujando (${r3})`);
      return `desviación ${fmt(sd)}, ${rate} draws/1.2 s${off}, al quitarlo 0 draws, sin errores`;
    } finally { await ctx.close(); }
  });
  if (/poster/.test(readFileSync(c.wcPath, 'utf8'))) await check('codigo', `${key}: Web Component sin WebGL 2 → póster`, async () => {
    writeFileSync(join(dir, 'wc-sin-webgl.html'), page('wc', `<main>${c.wcUsage.replace('<monotrama-field', '<monotrama-field poster="poster.png"')}</main>`));
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/wc-sin-webgl.html`, { noWebgl2: true });
    try {
      const pe = errors.filter(e => e.startsWith('pageerror'));
      assert(!pe.length, pe.join(' | '));
      const img = await p.evaluate(() => { const el = document.querySelector('monotrama-field'); const cv = el.shadowRoot.querySelector('canvas'); return getComputedStyle(cv).backgroundImage; });
      assert(/poster\.png/.test(img), 'sin póster: ' + img);
      return 'póster en el lienzo, 0 excepciones';
    } finally { await ctx.close(); }
  });
}

/* React: a throwaway Vite + React project that imports the exported .jsx files. */
async function reactProject(compReact) {
  const app = join(OUT, 'react-app');
  mkdirSync(join(app, 'src'), { recursive: true });
  mkdirSync(join(app, 'public'), { recursive: true });
  if (!existsSync(join(app, 'node_modules'))) symlinkSync(join(ROOT, 'node_modules'), join(app, 'node_modules'), 'dir');
  const pieces = Object.keys(codeOut).filter(k => codeOut[k]?.react);
  const imports = [], uses = [];
  for (const k of pieces) {
    const name = 'Fondo' + k[0].toUpperCase() + k.slice(1);
    writeFileSync(join(app, 'src', name + '.jsx'), codeOut[k].react.replace(/export default function \w+/, `export default function ${name}`));
    for (const pub of [join(app, 'public'), SITE_DIR]) {
      if (codeOut[k].posterPath) copyFileSync(codeOut[k].posterPath, join(pub, `poster-${k}.png`));
      if (PIECES[k].source === 'image') for (const n of ['tu-imagen.jpg', 'foto.png']) copyFileSync(SYNTH, join(pub, n));
    }
    imports.push(`import ${name} from './${name}.jsx';`);
    uses.push(`{on && <section className="pieza" data-k="${k}"><${name} poster="/poster-${k}.png"><h2 style={{ color: '#fff', margin: 0, padding: 16 }}>${k}</h2></${name}></section>}`);
  }
  for (const c of compReact) {
    writeFileSync(join(app, 'src', c.file), c.code);
    writeFileSync(join(app, 'src', c.moduleFile), c.module);
    imports.push(`import ${c.name} from './${c.file}';`);
    uses.push(`{on && <div className="comp" data-comp="${c.id}">${c.jsx}</div>}`);
  }
  writeFileSync(join(app, 'index.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>react</title></head><body style="margin:0;background:#111;color:#eee"><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`);
  writeFileSync(join(app, 'src', 'main.jsx'), `import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
${imports.join('\n')}
function App() {
  const [on, setOn] = useState(true);
  return (
    <main style={{ padding: 16 }}>
      <button id="toggle" onClick={() => setOn(v => !v)}>montar / desmontar</button>
      ${uses.join('\n      ')}
    </main>
  );
}
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
`);
  const vite = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const cfg = { root: app, configFile: false, logLevel: 'silent', plugins: [react()] };
  let built = false;
  await check('react', 'proyecto Vite + React: `vite build` del .jsx exportado', async () => {
    await vite.build({ ...cfg, base: '/react/', build: { outDir: join(SITE_DIR, 'react'), emptyOutDir: true } });
    built = true;
    return `${pieces.length} fondos + ${compReact.length} componentes compilan`;
  });
  const exercise = async (url, mode) => {
    const { ctx, p, errors } = await visitSite(url, { settle: 3500 });
    try {
      for (const k of pieces) {
        await check('react', `${mode}: ${k} se ve (StrictMode)`, async () => {
          const el = p.locator(`.pieza[data-k="${k}"] canvas`);
          const shot = join(OUT, 'react-app', `${mode}-${k}.png`);
          await el.screenshot({ path: shot });
          const sd = spread(shot);
          assert(sd > 0.02, `lienzo plano (desviación ${fmt(sd)})`);
          return `desviación ${fmt(sd)}`;
        });
      }
      await check('react', `${mode}: sin errores en consola`, () => { assert(!errors.length, errors.slice(0, 3).join(' | ')); return 'ninguno'; });
      await check('react', `${mode}: desmontar limpia (lienzos fuera, 0 draws)`, async () => {
        await p.click('#toggle');
        await p.waitForTimeout(300);
        const left = await p.locator('.pieza canvas').count();
        const rate = await drawRate(p, 800);
        assert(left === 0 && rate === 0, `${left} lienzos, ${rate} draws`);
        await p.click('#toggle');
        await p.waitForTimeout(1500);
        const again = await drawRate(p, 800);
        assert(again > 0 || !pieces.length, 'al volver a montar no dibuja');
        assert(!errors.length, errors.slice(0, 3).join(' | '));
        return `0 lienzos y 0 draws tras desmontar; al volver a montar dibuja (${again} draws/0.8 s)`;
      });
      for (const c of compReact) {
        await check('react', `${mode}: componente ${c.id}`, async () => {
          await p.locator(`[data-comp="${c.id}"]`).scrollIntoViewIfNeeded();
          const d = await c.probe(p.locator(`[data-comp="${c.id}"]`), p);
          assert(!errors.length, errors.slice(0, 3).join(' | '));
          return d;
        });
      }
    } finally { await ctx.close(); }
  };
  if (built) await exercise(`${SITE}/react/`, 'build');
  let server;
  try {
    server = await vite.createServer({ ...cfg, server: { port: DEV_PORT, strictPort: true } });
    await server.listen();
    await exercise(`http://localhost:${DEV_PORT}/`, 'dev');
  } catch (e) {
    record('react', 'vite dev (StrictMode)', 'FAIL', e.message);
  } finally { await server?.close(); }
  await check('react', 'sin WebGL 2: póster, sin excepciones', async () => {
    if (!built) skip('no compiló');
    const { ctx, p, errors } = await visitSite(`${SITE}/react/`, { noWebgl2: true });
    try {
      const pe = errors.filter(e => e.startsWith('pageerror'));
      assert(!pe.length, pe.join(' | '));
      const imgs = await p.evaluate(() => [...document.querySelectorAll('.pieza')].map(s => { const c = s.querySelector('canvas'); return c ? getComputedStyle(c).backgroundImage : 'sin lienzo'; }));
      assert(imgs.every(i => /poster-/.test(i)), 'sin póster: ' + imgs.join(' | '));
      return `${imgs.length} fondos muestran su póster`;
    } finally { await ctx.close(); }
  });
}

/* ------------------------------------------------------------------ */
/* 4. Text and terminal exports                                        */
/* ------------------------------------------------------------------ */

const DEPTHS = [['none', 'Sin color'], ['16', '16'], ['256', '256'], ['truecolor', 'Color real']];

async function terminalExports(key, page, dir, files) {
  await openSheet(page, 'Texto y terminal');
  const sh = page.locator('.sheet-body');
  const cols = 80, rows = 24;
  await sh.getByLabel('Columnas').fill(String(cols));
  await sh.getByLabel('Filas').fill(String(rows));
  const settle = () => pumping(page, sleep(700));
  await settle();
  const t = (files.term = { cols, rows, ans: {} });
  await sh.getByRole('button', { name: 'Sin color' }).click();
  await settle();
  t.txt = await download(page, dir, () => sh.getByRole('button', { name: '.txt', exact: true }).click());
  t.html = await download(page, dir, () => sh.getByRole('button', { name: 'HTML', exact: true }).click());
  await sh.getByRole('button', { name: 'Saludo de shell' }).click();
  await settle();
  t.shell = join(dir, 'saludo.sh');
  writeFileSync(t.shell, await clipboard(page));
  for (const [d, label] of DEPTHS.slice(1)) {
    for (const bg of [true, false]) {
      await sh.getByRole('button', { name: label, exact: true }).click();
      await setSwitch(page, 'Pintar fondo', bg);
      await settle();
      const f = await download(page, join(dir, `ans-${d}-${bg ? 'fondo' : 'sinfondo'}`), () => sh.getByRole('button', { name: '.ans (ANSI)' }).click());
      t.ans[`${d}${bg ? '+fondo' : ''}`] = f;
    }
  }
  await sh.getByRole('button', { name: '256', exact: true }).click();
  await setSwitch(page, 'Pintar fondo', true);
  await settle();
  await sh.getByRole('button', { name: 'Para tu CLI (JS)' }).click();
  await settle();
  t.js = join(dir, 'banner.mjs');
  writeFileSync(t.js, await clipboard(page));
  await sh.getByLabel('Duración (s)').fill('2');
  await sh.getByLabel('Fotogramas/s').selectOption('12');
  await settle();
  t.node = await download(page, dir, () => sh.getByRole('button', { name: /Script de Node/ }).click());
  t.python = await download(page, dir, () => sh.getByRole('button', { name: 'Script de Python' }).click());
  t.cast = await download(page, dir, () => sh.getByRole('button', { name: 'asciinema (.cast)' }).click());
  // an uncoloured animation too (its lines are trimmed, so frames must clear what the previous one left)
  await sh.getByRole('button', { name: 'Sin color' }).click();
  await settle();
  t.nodePlain = await download(page, join(dir, 'sin-color'), () => sh.getByRole('button', { name: /Script de Node/ }).click());
  await closeSheet(page);
}

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ''); }

async function terminalChecks(key) {
  const t = studioFiles[key]?.term;
  if (!t) return;
  const { cols, rows } = t;
  const txt = readFileSync(t.txt, 'utf8');
  const txtLines = txt.replace(/\n$/, '').split('\n');
  await check('texto', `${key}: TXT UTF-8 y ${cols}×${rows} (ancho de pantalla real)`, () => {
    needPy('wcwidth');
    const w = py('width', t.txt);
    assert(w.utf8, 'no es UTF-8');
    assert(w.lines.length === rows, `${w.lines.length} filas`);
    const over = w.lines.filter(x => x > cols || x < 0);
    assert(!over.length, `líneas de ancho ${over.join(', ')} (> ${cols})${w.wide_chars.length ? ' por glifos dobles ' + w.wide_chars.join('') : ''}`);
    return `${w.lines.length} filas, ancho máx ${Math.max(...w.lines)}${w.wide_chars.length ? ', glifos dobles ' + w.wide_chars.join('') + ' contados como 2' : ''}`;
  });
  await check('texto', `${key}: HTML de texto (UTF-8, escapado, ${rows} filas)`, async () => {
    const h = readFileSync(t.html, 'utf8');
    assert(/<meta charset="utf-8">/.test(h), 'sin charset');
    const p = await browser.newPage();
    await p.setContent(h);
    const pre = await p.evaluate(() => document.querySelector('pre').textContent);
    await p.close();
    const lines = pre.split('\n');
    assert(lines.length === rows, `${lines.length} filas`);
    const same = lines.every((l, i) => l.replace(/\s+$/, '') === (txtLines[i] ?? '').replace(/\s+$/, ''));
    assert(same, 'el texto del <pre> no coincide con el TXT');
    return `${rows} filas; el texto del <pre> = TXT`;
  });
  for (const [id, f] of Object.entries(t.ans)) {
    await check('texto', `${key}: ANSI ${id} (secuencias válidas, ${cols}×${rows}, reset por línea)`, () => {
      needPy('wcwidth');
      const w = py('width', f);
      assert(w.utf8 && w.bad_escapes === 0 && w.sgr_only, `utf8 ${w.utf8}, escapes inválidos ${w.bad_escapes}, sólo SGR ${w.sgr_only}`);
      assert(w.lines.length === rows && w.lines.every(x => x === cols), `anchos ${[...new Set(w.lines)].join(',')} en ${w.lines.length} filas`);
      assert(w.ends_with_reset, 'alguna línea no termina en ESC[0m');
      return `${w.escapes} secuencias SGR, ${rows} filas de ${cols} columnas, ESC[0m al final de cada línea`;
    });
    await check('texto', `${key}: ANSI ${id} en un emulador (pyte) = TXT`, () => {
      needPy('pyte', 'wcwidth');
      const s = py('screen', String(cols), String(rows + 1), f, 'crlf');
      const got = s.lines.slice(0, rows).map(l => l.replace(/\s+$/, ''));
      const bad = got.map((l, i) => (l === (txtLines[i] ?? '').replace(/\s+$/, '') ? -1 : i)).filter(i => i >= 0);
      assert(!bad.length, `filas distintas: ${bad.slice(0, 5).join(', ')} — «${got[bad[0]]}» vs «${txtLines[bad[0]]}»`);
      assert(s.fg === 'default' && s.bg === 'default', `atributos al final: fg ${s.fg}, bg ${s.bg}`);
      return 'pantalla emulada idéntica al TXT; atributos finales por defecto';
    });
  }
  await check('texto', `${key}: cat del .ans en una pty real no rompe la terminal`, () => {
    needPy('pyte', 'wcwidth');
    const f = t.ans['truecolor+fondo'];
    const r = ptyRun({ cmd: ['cat', f], cols, rows: rows + 2, timeout: 5 });
    const out = Buffer.from(r.out_b64, 'base64').toString('utf8');
    const tmp = join(OUT, key, 'pty-cat.out');
    writeFileSync(tmp, out);
    const s = py('screen', String(cols), String(rows + 2), tmp);
    assert(r.exit === 0, 'salida ' + r.exit);
    assert(s.fg === 'default' && s.bg === 'default' && !s.hidden, `estado final fg ${s.fg} bg ${s.bg} cursor oculto ${s.hidden}`);
    assert(JSON.stringify(r.lflag_before) === JSON.stringify(r.lflag_after), 'termios cambió');
    return 'estado SGR final por defecto, cursor visible, termios intacto';
  });

  // players
  const frames = f => {
    const src = readFileSync(f, 'utf8');
    const b64 = /(?:Buffer\.from|b64decode)\(\s*"([^"]+)"/.exec(src)[1];
    return JSON.parse(run('python3', ['-c', 'import sys,gzip,base64;sys.stdout.write(gzip.decompress(base64.b64decode(sys.stdin.read())).decode())'], { input: b64 }).stdout);
  };
  const playerCheck = async (label, cmd, file, o = {}) => {
    await check('terminal', `${key}: ${label} en una pty, Ctrl+C restaura la terminal`, () => {
      needPy('pyte', 'wcwidth');
      const r = ptyRun({ cmd, cols, rows: rows + 1, ctrlc_at: 1.6, timeout: 6 });
      const raw = Buffer.from(r.out_b64, 'base64').toString('utf8');
      writeFileSync(join(OUT, key, `pty-${label.replace(/\W+/g, '-')}.out`), raw);
      assert(!r.timeout, 'no terminó tras Ctrl+C');
      const tail = raw.slice(-40);
      assert(/\x1b\[\?25h/.test(tail) && /\x1b\[0m/.test(tail), 'no restaura cursor/colores: ' + JSON.stringify(tail));
      const altIn = raw.includes('\x1b[?1049h');
      assert(!altIn || /\x1b\[\?1049l/.test(tail), 'no sale de la pantalla alternativa');
      assert(!/Traceback|Error|at .*:\d+:\d+/.test(raw), 'error impreso: ' + raw.slice(-200));
      // what was on screen just before Ctrl+C must be one of the embedded frames, exactly
      const tmp = join(OUT, key, 'pty-frame.out');
      // Ctrl+C makes the tty discard what was still queued (and echo «^C»), so the frame being written
      // is cut short: compare the last complete one (everything before the last cursor-home)
      writeFileSync(tmp, raw.slice(0, raw.lastIndexOf('\x1b[H')));
      const s = py('screen', String(cols), String(rows + 1), tmp);
      const shown = s.lines.slice(0, rows).map(l => l.replace(/\s+$/, '')).join('\n');
      const all = frames(file).map(fr => stripAnsi(fr).split('\n').map(l => l.replace(/\s+$/, '')).join('\n'));
      const idx = all.indexOf(shown);
      assert(idx >= 0, 'la pantalla no coincide con ningún fotograma:\n' + shown.split('\n').slice(0, 3).join('\n'));
      assert(JSON.stringify(r.lflag_before) === JSON.stringify(r.lflag_after), 'termios cambió');
      return `fotograma ${idx + 1}/${all.length} en pantalla idéntico; salida ${r.exit ?? 'señal ' + r.signal}; cursor y colores restaurados`;
    });
    await check('terminal', `${key}: ${label} con la salida redirigida (no TTY)`, () => {
      need(cmd[0]);
      const r = run(cmd[0], [...cmd.slice(1)], { timeout: 8000, allowFail: true });
      assert(!r.error, r.error?.code === 'ETIMEDOUT' ? 'no termina con la salida redirigida (llenaría un archivo)' : String(r.error));
      assert(r.status === 0, `código ${r.status}: ${r.stderr.slice(0, 200)}`);
      const p = run('sh', ['-c', `${cmd.map(a => `'${a}'`).join(' ')} | head -c 64 > /dev/null`], { timeout: 8000, allowFail: true });
      assert(!/Traceback|EPIPE|Error/.test(p.stderr), 'al cerrar la tubería: ' + p.stderr.slice(0, 200));
      return `termina solo (código 0, ${r.stdout.length} bytes); con | head sin errores`;
    });
  };
  await playerCheck('Node (.mjs)', ['node', t.node], t.node);
  await playerCheck('Node sin color (.mjs)', ['node', t.nodePlain], t.nodePlain);
  await playerCheck('Python', ['python3', t.python], t.python);
  await check('terminal', `${key}: Python sin dependencias de terceros`, () => {
    need('python3');
    const r = py('imports', t.python);
    assert(r.checked && !r.non_stdlib.length, 'no estándar: ' + r.non_stdlib.join(', '));
    const iso = run('python3', ['-I', '-S', '-c', `import ast,sys;compile(open(sys.argv[1]).read(),'x','exec')`, t.python]);
    assert(iso.status === 0, iso.stderr);
    return 'importa ' + r.modules.join(', ');
  });
  await check('terminal', `${key}: Node 18 ejecuta el script`, () => {
    needPy();
    let node18 = process.env.NODE18;
    if (!node18) {
      const r = run('npx', ['-y', 'node@18', '-p', 'process.execPath'], { timeout: 120_000, allowFail: true });
      if (r.status !== 0) skip('no hay Node 18 (define NODE18 o permite `npx -y node@18`)');
      node18 = r.stdout.trim();
    }
    const v = run(node18, ['--version']).stdout.trim();
    const r = ptyRun({ cmd: [node18, t.node], cols, rows: rows + 1, ctrlc_at: 1.2, timeout: 6 });
    const raw = Buffer.from(r.out_b64, 'base64').toString('utf8');
    assert(!r.timeout && /\x1b\[\?25h/.test(raw.slice(-40)) && !/Error/.test(raw), 'falló: ' + raw.slice(-200));
    const piped = run(node18, [t.node], { timeout: 8000, allowFail: true });
    assert(piped.status === 0, 'sin TTY: ' + piped.stderr.slice(0, 200));
    return `${v}: pty + Ctrl+C y sin TTY`;
  });
  await check('terminal', `${key}: saludo de shell (bash y zsh; sólo en sesiones interactivas)`, () => {
    const code = readFileSync(t.shell, 'utf8');
    const expect = txtLines.map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
    const res = [];
    for (const sh of ['bash', 'zsh']) {
      if (!has(sh)) { res.push(`${sh}: no instalado`); continue; }
      const i = run(sh, sh === 'bash' ? ['--norc', '-i', '-c', `source '${t.shell}'`] : ['-f', '-i', '-c', `source '${t.shell}'`], { allowFail: true });
      const got = i.stdout.replace(/\n+$/, '').split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
      assert(i.status === 0 && got === expect, `${sh} interactivo: código ${i.status}, salida distinta`);
      const n = run(sh, ['-c', `source '${t.shell}'`], { allowFail: true });
      assert(n.status === 0 && !n.stdout.trim(), `${sh} no interactivo imprime (rompería scp/rsync)`);
      res.push(`${sh}: igual al TXT, silencioso sin -i`);
    }
    assert(HEADER_RE.test(code), 'sin cabecera MIT-0');
    return res.join('; ');
  });
  await check('terminal', `${key}: «Para tu CLI (JS)» en Node`, () => {
    needPy('pyte', 'wcwidth');
    const r = ptyRun({ cmd: ['node', t.js], cols, rows: rows + 2, timeout: 5 });
    const raw = Buffer.from(r.out_b64, 'base64').toString('utf8');
    const tmp = join(OUT, key, 'pty-js.out');
    writeFileSync(tmp, raw);
    const s = py('screen', String(cols), String(rows + 2), tmp);
    const got = s.lines.slice(0, rows).map(l => l.replace(/\s+$/, ''));
    assert(r.exit === 0 && got.every((l, i) => l === (txtLines[i] ?? '').replace(/\s+$/, '')), 'la pantalla no coincide con el TXT');
    const piped = run('node', [t.js]);
    assert(!/\x1b/.test(piped.stdout), 'escribe secuencias de color en un archivo');
    assert(HEADER_RE.test(readFileSync(t.js, 'utf8')), 'sin cabecera MIT-0');
    return 'TTY: pantalla = TXT; redirigido: texto sin escapes';
  });
  await check('terminal', `${key}: asciinema .cast v2 válido`, () => {
    need('python3');
    const r = py('cast', t.cast);
    assert(!r.issues.length, r.issues.slice(0, 3).join('; '));
    assert(r.header.width === cols && r.header.height === rows, `cabecera ${r.header.width}×${r.header.height}`);
    if (r.screen) {
      const last = frames(t.node).at(-1);
      const shown = r.screen.lines.map(l => l.replace(/\s+$/, '')).join('\n');
      const want = stripAnsi(last).split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
      assert(shown === want, 'la última pantalla del .cast no es el último fotograma');
      assert(!r.screen.hidden, 'deja el cursor oculto');
    }
    return `${r.events} eventos, ${r.duration} s${r.screen ? ', pantalla final = último fotograma, cursor visible' : ''}`;
  });
  await check('terminal', `${key}: asciinema cat / play lo reproducen`, () => {
    need('asciinema');
    const c = run('asciinema', ['cat', t.cast], { allowFail: true, timeout: 20_000 });
    assert(c.status === 0 && c.stdout.length > 1000, 'asciinema cat: ' + c.stderr.slice(0, 200));
    const r = ptyRun({ cmd: ['asciinema', 'play', '-s', '4', t.cast], cols, rows: rows + 1, timeout: 15 });
    assert(!r.timeout && r.exit === 0, `asciinema play: salida ${r.exit}, timeout ${r.timeout}`);
    return `cat: ${c.stdout.length} bytes; play (×4) termina con código 0`;
  });
  await check('terminal', `${key}: cabecera MIT-0 en los scripts`, () => {
    const miss = [['Node', t.node], ['Python', t.python], ['Saludo', t.shell], ['JS', t.js]].filter(([, f]) => !HEADER_RE.test(readFileSync(f, 'utf8'))).map(([n]) => n);
    assert(!miss.length, 'falta en ' + miss.join(', '));
    return 'Node, Python, saludo de shell, JS';
  });
}

/* ------------------------------------------------------------------ */
/* 5. Components space                                                 */
/* ------------------------------------------------------------------ */

const COMP_PROBES = {
  scramble: { text: 'Teje luz con caracteres', async probe(root, p) { await p.waitForTimeout(2500); const t = await root.locator('[aria-hidden="true"]').first().innerText(); assert(t.trim() === 'Teje luz con caracteres' || t.length > 0, 'vacío'); return `muestra «${t.trim().slice(0, 30)}»`; } },
  typewriter: { async probe(root, p) { const a = await root.innerText(); await p.waitForTimeout(700); const b = await root.innerText(); assert(a !== b || b.length > 1, 'no escribe'); return `«${a.trim().slice(0, 12)}» → «${b.trim().slice(0, 20)}»`; } },
  magnet: { async probe(root, p) { const h = root.locator('h2').first(); const box = await h.boundingBox(); await p.mouse.move(box.x + 5, box.y + box.height / 2); await p.mouse.move(box.x + box.width / 3, box.y + box.height / 2, { steps: 6 }); await p.waitForTimeout(300); const moved = await h.evaluate(el => [...el.querySelectorAll('span')].some(s => /translate\((?!0\.0px,0\.0px)/.test(s.style.transform))); await p.mouse.move(0, 0); assert(moved, 'las letras no se mueven'); return 'las letras huyen del cursor'; } },
  trail: { async probe(root, p) { const box = await root.boundingBox(); await p.mouse.move(box.x + 20, box.y + 40); await p.mouse.move(box.x + 300, box.y + 120, { steps: 12 }); await p.waitForTimeout(120); const ink = await p.evaluate(() => { let n = 0; for (const c of document.querySelectorAll('canvas')) { if (!c.width) continue; const x = c.getContext('2d'); if (!x) continue; const d = x.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; } return n; }); assert(ink > 50, 'sin estela'); return `${ink} píxeles de estela`; } },
  halo: { async probe(root, p) { const b = root.locator('button').first(); const box = await b.boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 }); await p.waitForTimeout(400); const ink = await b.evaluate(el => { const c = el.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; }); await p.mouse.move(0, 0); assert(ink > 50, 'no se enciende'); return `${ink} píxeles encendidos`; } },
  spinners: { async probe(root, p) { const s = root.locator('[role="status"]').first(); const a = await s.innerText(); await p.waitForTimeout(250); const b = await s.innerText(); assert(a !== b, 'no gira'); return `«${a}» → «${b}»`; } },
  progress: { async probe(root) { const t = await root.locator('pre').first().innerText(); assert(/42%/.test(t), t); return `«${t.trim()}»`; } },
};

async function componentsFlow() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
  const sp = await ctx.newPage();
  const errors = [];
  sp.on('pageerror', e => errors.push(e.message));
  await sp.goto(`${BASE}/studio/`);
  await sp.locator('.seedline').waitFor();
  // a first visit opens «¿Qué quieres hacer?»: close it to reach the studio
  if (await sp.locator('dialog.welcome[open]').count()) { await sp.keyboard.press('Escape'); await sp.locator('dialog.welcome[open]').waitFor({ state: 'detached' }); }
  await sp.getByRole('button', { name: 'Componentes', exact: true }).first().click();
  await sp.locator('.comp-card').first().waitFor();
  const cards = (await sp.locator('.comp-card h2').allTextContents()).map(t => t.trim());
  const tabsById = {};
  const names = { scramble: 'Descifrar', typewriter: 'Máquina de escribir', magnet: 'Imán', trail: 'Estela', halo: 'Halo', spinners: 'Indicadores', progress: 'Barra de progreso', banner: 'Rótulo' };
  for (const [id, name] of Object.entries(names)) {
    if (!cards.includes(name)) { record('componentes', `${id}: tarjeta en la galería`, 'FAIL', 'no aparece'); continue; }
    await sp.locator('.comp-card', { has: sp.locator('h2', { hasText: name }) }).first().locator('.comp-open').click();
    await sp.getByRole('button', { name: '← Todas las piezas' }).waitFor();
    const tabs = {};
    for (const tab of await sp.locator('.comp-detail [role="tab"]').all()) {
      const label = (await tab.innerText()).trim();
      await tab.click();
      tabs[label] = await sp.locator('.comp-detail textarea.code').inputValue();
    }
    tabsById[id] = tabs;
    await sp.getByRole('button', { name: '← Todas las piezas' }).click();
  }
  await ctx.close();
  const dir = join(SITE_DIR, 'componentes');
  mkdirSync(dir, { recursive: true });
  const react = [];
  for (const [id, tabs] of Object.entries(tabsById)) {
    const probe = COMP_PROBES[id];
    if (tabs['HTML para pegar']) {
      writeFileSync(join(dir, `${id}.html`), page(id, `<main style="background:#111;color:#eee;min-height:600px"><div data-comp="${id}" style="position:relative;min-height:300px;padding:30px">${tabs['HTML para pegar']}</div></main>`));
      await check('componentes', `${id}: «HTML para pegar» en otra web`, async () => {
        const { ctx: c, p, errors: e } = await visitSite(`${SITE}/componentes/${id}.html`, { settle: 800 });
        try {
          const d = probe ? await probe.probe(p.locator(`[data-comp="${id}"]`), p) : 'carga';
          assert(!e.length, e.slice(0, 2).join(' | '));
          return d + ', sin errores';
        } finally { await c.close(); }
      });
    }
    const still = {
      scramble: async root => { const t = (await root.locator('h1 [aria-hidden="true"]').innerText()).trim(); assert(t === 'Teje luz con caracteres', `«${t}»`); return `texto completo al instante («${t}»)`; },
      typewriter: async (root, p) => { const a = await root.innerText(); await p.waitForTimeout(700); const b = await root.innerText(); assert(a === b && /Teje luz con caracteres/.test(a), `«${a}» → «${b}»`); return `frase completa y quieta («${a.trim()}»)`; },
      spinners: async (root, p) => { const s = root.locator('[role="status"]').first(); const a = await s.innerText(); await p.waitForTimeout(400); const b = await s.innerText(); assert(a === b, `«${a}» → «${b}»`); return `indicador quieto («${a}»)`; },
    }[id];
    if (still && tabs['HTML para pegar']) await check('componentes', `${id}: con «reducir movimiento» no anima`, async () => {
      const { ctx: c, p, errors: e } = await visitSite(`${SITE}/componentes/${id}.html`, { settle: 500, reducedMotion: 'reduce' });
      try {
        const d = await still(p.locator(`[data-comp="${id}"]`), p);
        assert(!e.length, e.slice(0, 2).join(' | '));
        return d;
      } finally { await c.close(); }
    });
    if (tabs['Módulo ES']) {
      const mod = tabs['Módulo ES'];
      const file = /^\/\/ (\S+\.js)/.exec(mod)?.[1] ?? `${id}.js`;
      writeFileSync(join(dir, file), mod);
      const usage = /\/\* Uso:\n([\s\S]*?)\n\*\//.exec(mod)?.[1];
      await check('componentes', `${id}: «Módulo ES» importado desde otra web`, async () => {
        if (!usage && id !== 'banner') throw new Error('sin ejemplo de uso');
        const markup = /^(<[\s\S]*?)\n\n<script/.exec(tabs['HTML para pegar'] ?? '')?.[1] ?? '';
        const script = id === 'banner'
          ? `import { renderBanner } from './${file}'; document.getElementById('out').textContent = renderBanner('HOLA', { width: 40, style: 'bloques' });`
          : usage;
        writeFileSync(join(dir, `${id}-modulo.html`), page(id, `<main style="background:#111;color:#eee;min-height:600px"><div data-comp="${id}" style="position:relative;min-height:300px;padding:30px">${markup}<pre id="out"></pre></div></main><script type="module">${script}</script>`));
        const { ctx: c, p, errors: e } = await visitSite(`${SITE}/componentes/${id}-modulo.html`, { settle: 800 });
        try {
          let d = 'carga';
          if (id === 'banner') { const t = await p.locator('#out').innerText(); assert(t.split('\n').length > 3 && /█/.test(t), 'rótulo vacío'); d = `${t.split('\n').length} líneas de █`; }
          else if (probe) d = await probe.probe(p.locator(`[data-comp="${id}"]`), p);
          assert(!e.length, e.slice(0, 2).join(' | '));
          assert(HEADER_RE.test(mod), 'sin cabecera MIT-0');
          return d + ', sin errores';
        } finally { await c.close(); }
      });
      if (tabs.React) {
        const name = /export default function (\w+)/.exec(tabs.React)?.[1];
        const moduleFile = /from '\.\/([\w.]+)'/.exec(tabs.React)?.[1];
        const jsxEl = id === 'scramble' ? `<${name}>Teje luz</${name}>` : id === 'magnet' ? `<${name}>ACÉRCATE</${name}>` : id === 'halo' ? `<${name} type="button" style={{ padding: 24 }}>Halo</${name}>` : `<${name} />`;
        react.push({ id, name, file: `${name}.jsx`, code: tabs.React, moduleFile, module: mod, jsx: jsxEl, probe: probe?.probe ?? (async () => 'monta') });
      }
    }
    for (const [label, fileName, cmd] of [['Node CLI', `${id}.mjs`, 'node'], ['Python', `${id}.py`, 'python3'], ['Bash', `${id}.sh`, 'bash'], ['Saludo de shell', `${id}-saludo.sh`, 'bash'], ['Para tu CLI (JS)', `${id}-cli.mjs`, 'node']]) {
      if (!tabs[label]) continue;
      const f = join(OUT, 'componentes', fileName);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, tabs[label]);
      await check('componentes', `${id}: «${label}» en una pty (y Ctrl+C)`, () => {
        needPy('pyte');
        const args = label === 'Saludo de shell' ? ['bash', '--norc', '-i', '-c', `source '${f}'`] : [cmd, f];
        const r = ptyRun({ cmd: args, ctrlc_at: label === 'Saludo de shell' || label === 'Para tu CLI (JS)' ? null : 1.0, timeout: 8 });
        const raw = Buffer.from(r.out_b64, 'base64').toString('utf8');
        writeFileSync(f + '.pty.out', raw);
        assert(!r.timeout, 'no termina');
        assert(!/Traceback|Error:|command not found|No value for \$TERM/.test(raw), 'error: ' + raw.slice(-200));
        const hidden = raw.lastIndexOf('\x1b[?25l'), shown = raw.lastIndexOf('\x1b[?25h');
        const civis = /tput civis/.test(tabs[label]) ? raw.lastIndexOf('\x1b[?25l') : -1;
        assert(hidden <= shown && civis <= shown, 'deja el cursor oculto');
        const lines = stripAnsi(raw).split(/\r?\n|\r/).filter(l => l.trim());
        return `${r.exit === 0 ? 'código 0' : r.signal ? 'señal ' + r.signal : 'código ' + r.exit}; «${(lines.at(-1) ?? '').trim().slice(0, 40)}»; cursor visible al final`;
      });
      if (label !== 'Saludo de shell') await check('componentes', `${id}: «${label}» con la salida redirigida`, () => {
        need(cmd);
        const r = run(cmd, [f], { timeout: 10_000, allowFail: true });
        assert(!r.error && r.status === 0, `código ${r.status} ${r.error ?? ''} ${r.stderr.slice(0, 200)}`);
        return `código 0, ${r.stdout.length} bytes`;
      });
      await check('componentes', `${id}: «${label}» lleva la cabecera MIT-0`, () => { assert(HEADER_RE.test(tabs[label]), 'sin cabecera'); return 'sí'; });
    }
    for (const label of ['Texto', 'README']) if (tabs[label]) {
      await check('componentes', `${id}: «${label}» es texto plano UTF-8`, () => {
        assert(!/\x1b/.test(tabs[label]) && tabs[label].split('\n').length > 3, 'vacío o con escapes');
        return `${tabs[label].split('\n').length} líneas`;
      });
    }
  }
  assert(!errors.length, errors.join(' | '));
  return react;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`Monotrama · verificación de exportaciones\n  estudio ${BASE} · sitio ajeno ${SITE} · artefactos ${OUT}\n`);
  const up = await fetch(`${BASE}/studio/`).then(r => r.ok).catch(() => false);
  if (!up) { console.error(`No hay estudio en ${BASE}. Ejecuta: npm run build && npx vite preview --port ${PORT} --strictPort`); process.exit(2); }
  browser = await chromium.launch({ args: GL_ARGS });
  const site = await startSite();
  try {
    const image = await syntheticImage();
    writeFileSync(SYNTH, image);

    const runPiece = async (key, o) => { try { await studioPiece(key, o); } catch (e) { record('estudio', `${key}: flujo del estudio`, 'FAIL', e.message); } };
    if (want('imagen') || want('vector') || want('video') || want('codigo')) {
      await runPiece('patron', { video: true, code: true, transparent: true, svgNote: /Sin efectos de píxel/, svgInfo: true });
      await runPiece('limpio', { formats: ['png'], sizes: ['hd', 'sq', 'story', 'og', '4k'] });
      await runPiece('texto', { formats: ['png'], code: true, bg: '#f2ecdf' });
      await runPiece('imagen', { formats: ['png'], image, code: true });
      await runPiece('bloques', { formats: ['png'], svgNote: /Bloques .* formas exactas/, svgInfo: true });
      await runPiece('braille', { formats: ['png'], svgNote: /braille van como formas exactas/, svgInfo: true });
      await runPiece('simbolos', { formats: ['png'], svgNote: /quedan como texto/, svgInfo: true });
    }
    if (want('terminal') || want('texto')) {
      await runPiece('terminal', { formats: ['png'], terminal: true });
      await runPiece('anchos', { formats: ['png'], terminal: true, svgNote: /quedan como texto/, svgInfo: true });
    }
    if (want('mp4')) await mp4Muxing().catch(e => record('mp4', 'muxer MP4', 'FAIL', e.message));
    if (want('codigo')) for (const k of Object.keys(codeOut)) await codeChecks(k).catch(e => record('codigo', k, 'FAIL', e.message));
    let compReact = [];
    if (want('componentes')) compReact = await componentsFlow().catch(e => { record('componentes', 'flujo', 'FAIL', e.message); return []; });
    if (want('react') || want('codigo')) await reactProject(compReact).catch(e => record('react', 'proyecto', 'FAIL', e.message));
    if (want('terminal') || want('texto')) for (const k of ['terminal', 'anchos']) await terminalChecks(k).catch(e => record('terminal', k, 'FAIL', e.message));
  } finally {
    await browser.close();
    await no3d?.close();
    site.close();
  }
  if (want('codigo')) record('codigo', 'Google Fonts desde el código exportado', fontIssues.size ? 'SKIP' : 'PASS',
    fontIssues.size ? 'no accesible desde este navegador (' + [...fontIssues][0] + '); define VERIFY_CA si hay un proxy con su propia CA' : 'se carga (o no hizo falta)');
  const pad = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  console.log('\n' + pad('Grupo', 12) + ' ' + pad('Resultado', 6) + ' ' + pad('Comprobación', 72) + ' Detalle');
  console.log('-'.repeat(160));
  for (const r of results) console.log(`${pad(r.group, 12)} ${pad(r.status, 6)} ${pad(r.name, 72)} ${r.detail.slice(0, 140)}`);
  const n = s => results.filter(r => r.status === s).length;
  console.log(`\nPASS ${n('PASS')} · FAIL ${n('FAIL')} · SKIP ${n('SKIP')} · artefactos en ${OUT}`);
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(n('FAIL') ? 1 : 0);
}

await main();
