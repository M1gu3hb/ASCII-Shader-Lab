#!/usr/bin/env node
/**
 * Checks every export the way someone who takes it into another project would.
 *
 *   npm run build && npx vite preview --port 4177 --strictPort &
 *   PORT=4177 npm run verify:exports
 *
 * Drives the studio in a browser (Playwright), downloads each export and inspects it with the real
 * tools (ffprobe/ffmpeg, ImageMagick, rsvg-convert, Inkscape, gifsicle, xmllint, python3 + pyte,
 * asciinema, Node 18), and opens the final files in the browser engines at hand (video playback, SVG,
 * images). Pasted code is loaded from a different origin; the React component is built in a throwaway
 * Vite project. A missing tool or engine turns its checks into SKIP (with the reason), never FAIL.
 * Every result records the engine it ran in: an automated check in an engine is not a claim about real
 * devices (see docs/compatibilidad.md).
 *
 * Env: PORT (preview port, default 4173) · OUT (artifact folder, default a new temp folder)
 *      ONLY (comma-separated groups: imagen, vector, video — with webm, gif, directo and reproduccion —,
 *      mp4, codigo, react, componentes, texto, terminal, proyectos, camara) · PIECES (only these test
 *      pieces, while developing) · NODE18 (path to a Node 18 binary; otherwise `npx -y node@18`)
 *      BROWSER (engine that drives the studio and visits the pasted code: chromium — Playwright's, the
 *      default —, chrome — Google Chrome stable, which encodes H.264 —, firefox or webkit)
 *      PW_EXTRA (folder with Playwright's firefox-N and webkit-N builds when they are not in the default
 *      browsers folder; default /opt/pw-extra) · PLAY (engines for the playback/decoding checks;
 *      default chromium,chrome,firefox,webkit, those available)
 */
import { spawnSync } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT ?? 4173);
const BASE = `http://localhost:${PORT}`;
const SITE_PORT = Number(process.env.SITE_PORT ?? PORT + 100); // "someone else's website": a different origin
const DEV_PORT = SITE_PORT + 1;                                  // throwaway React project (vite dev, StrictMode)
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const OUT = process.env.OUT ? resolve(process.env.OUT) : mkdtempSync(join(tmpdir(), 'monotrama-verify-'));
const ONLY = (process.env.ONLY ?? '').split(',').map(s => s.trim()).filter(Boolean);
/** PIECES=patron,texto: only those test pieces (while developing; a full run uses all of them). */
const ONLY_PIECES = (process.env.PIECES ?? '').split(',').map(s => s.trim()).filter(Boolean);
const PY = join(ROOT, 'scripts/verify-exports.py');
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const BROWSER = (process.env.BROWSER ?? 'chromium').toLowerCase();
const PW_EXTRA = process.env.PW_EXTRA ?? '/opt/pw-extra';
const CHROMIUMS = new Set(['chromium', 'chrome']);
if (!['chromium', 'chrome', 'firefox', 'webkit'].includes(BROWSER)) { console.error('BROWSER: chromium, chrome, firefox o webkit'); process.exit(2); }
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
/** Engine of the main browser, e.g. «chromium 141.0.7390.37» (set once it is launched). */
let ENGINE = BROWSER;
function record(group, name, status, detail = '', engine = ENGINE) {
  results.push({ group, name, status, detail: String(detail).replace(/\s+/g, ' ').trim(), engine });
  const mark = status === 'PASS' ? '✓' : status === 'SKIP' ? '·' : '✗';
  console.log(`  ${mark} [${group}·${engine.split(' ')[0]}] ${name}${detail ? ' — ' + String(detail).replace(/\s+/g, ' ').slice(0, 160) : ''}`);
}
class Skip extends Error {}
const skip = reason => { throw new Skip(reason); };
/**
 * Runs one check: return a string (PASS detail), throw Skip (SKIP) or anything else (FAIL).
 * `engine`: the engine the check ran in, when it is not the main browser (a file opened in Firefox…).
 */
async function check(group, name, fn, engine = ENGINE) {
  try {
    const d = await fn();
    record(group, name, 'PASS', d ?? '', engine);
  } catch (e) {
    if (e instanceof Skip) record(group, name, 'SKIP', e.message, engine);
    else record(group, name, 'FAIL', e?.message ?? String(e), engine);
  }
}

/* ------------------------------------------------------------------ */
/* Engines                                                             */
/* ------------------------------------------------------------------ */

/** An executable inside a Playwright build folder of PW_EXTRA (firefox-1495/firefox/firefox…). */
function extraExe(prefix, rel) {
  try {
    const dir = readdirSync(PW_EXTRA).filter(d => d.startsWith(prefix + '-')).sort().at(-1);
    const f = dir && join(PW_EXTRA, dir, rel);
    return f && existsSync(f) ? f : undefined;
  } catch { return undefined; }
}
const CHROME_EXE = ['/opt/google/chrome/chrome', '/usr/bin/google-chrome'].find(f => existsSync(f));
/** Launch options per engine: Chromium and Chrome draw WebGL with SwiftShader; Firefox and WebKit come from PW_EXTRA. */
function launchOptions(name, o = {}) {
  if (name === 'chromium') return [chromium, { args: [...GL_ARGS, ...(o.args ?? [])] }];
  if (name === 'chrome') return [chromium, { channel: 'chrome', args: [...GL_ARGS, ...(o.args ?? [])] }];
  if (name === 'firefox') return [firefox, { executablePath: extraExe('firefox', 'firefox/firefox'), firefoxUserPrefs: o.prefs }];
  return [webkit, { executablePath: extraExe('webkit', 'pw_run.sh') }];
}
/** Why an engine cannot run here ('' when it can be tried). */
function engineGap(name) {
  if (name === 'chrome' && !CHROME_EXE) return 'Google Chrome no está instalado';
  if ((name === 'firefox' || name === 'webkit') && !extraExe(name, name === 'firefox' ? 'firefox/firefox' : 'pw_run.sh')) {
    // the default Playwright folder may still have it
    try { const [t] = launchOptions(name); if (existsSync(t.executablePath())) return ''; } catch { /* not there */ }
    return `${name} de Playwright no está en ${PW_EXTRA} ni en la carpeta de navegadores`;
  }
  return '';
}
async function launch(name, o = {}) {
  const [type, opts] = launchOptions(name, o);
  if (!opts.executablePath) delete opts.executablePath;
  return type.launch(opts);
}
const label = b => `${b.browserType().name() === 'chromium' && b.__channel ? 'chrome' : b.browserType().name()} ${b.version()}`;
/** Other engines, launched once each when a check needs them (null with the reason when not available). */
const others = new Map();
async function engine(name) {
  if (!others.has(name)) {
    others.set(name, (async () => {
      const gap = engineGap(name);
      if (gap) return { gap };
      try {
        const b = await launch(name);
        b.__channel = name === 'chrome';
        return { b, label: label(b) };
      } catch (e) { return { gap: `${name} no arranca: ${String(e.message).split('\n')[0]}` }; }
    })());
  }
  return others.get(name);
}
const PLAY = (process.env.PLAY ?? 'chromium,chrome,firefox,webkit').split(',').map(s => s.trim()).filter(Boolean);
/** Runs `fn(browser)` as a check in each playback engine, recorded under that engine. */
async function inEngines(group, name, fn, list = PLAY) {
  for (const n of list) {
    const e = await engine(n);
    if (!e.b) { record(group, name, 'SKIP', e.gap, n); continue; }
    await check(group, name, () => fn(e.b, n), e.label);
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
/**
 * Firefox and WebKit have no clipboard permissions to grant: there the studio's copy lands in
 * window.__copied (what it wrote to the clipboard, or the selection it copied), read by clipboard().
 */
const CLIP_STUB = `(() => {
  window.__copied = '';
  const write = async t => { window.__copied = String(t); };
  try {
    if (navigator.clipboard) Object.defineProperty(navigator.clipboard, 'writeText', { value: write, configurable: true });
    else Object.defineProperty(navigator, 'clipboard', { value: { writeText: write, readText: async () => window.__copied }, configurable: true });
  } catch {}
  document.addEventListener('copy', () => { const s = String(document.getSelection() || ''); if (s) window.__copied = s; }, true);
})();`;
const studioContext = (o = {}) => browser.newContext({
  viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1, acceptDownloads: true, reducedMotion: 'reduce',
  ...(CHROMIUMS.has(BROWSER) ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}), ...o,
});
async function openStudio(recipe, o = {}) {
  const ctx = await studioContext(o.context ?? {});
  if (!CHROMIUMS.has(BROWSER)) await ctx.addInitScript(CLIP_STUB);
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
const SIZE_NAMES = { v1: 'Como la vista', v2: 'Vista ×2', v4: 'Vista ×3', hd: '1920×1080', '4k': '3840×2160 (4K)', sq: '1080×1080', story: '1080×1920 vertical', og: '1200×630 (redes)' };
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Chooses a size in the sheet's size picker (a combobox with a listbox of presets). */
async function pickSize(page, id, value) {
  const btn = page.locator('#' + id);
  if ((await btn.getAttribute('data-value')) === value) return;
  await btn.click();
  await pump(page, 100);
  await page.getByRole('listbox').getByRole('option', { name: new RegExp('^' + reEsc(SIZE_NAMES[value])) }).first().click();
  for (let i = 0; i < 50 && (await btn.getAttribute('data-value')) !== value; i++) await pump(page, 50);
  assert((await btn.getAttribute('data-value')) === value, `tamaño ${value} no elegido`);
  await pump(page, 100);
}
/** Chooses one of a few values in a radio group (frames per second, GIF width). */
async function pickNumber(page, group, name) {
  await page.locator('.sheet-body').getByRole('radiogroup', { name: group }).getByRole('radio', { name, exact: true }).click();
  await pump(page, 100);
}
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
async function clipboard(page) {
  return CHROMIUMS.has(BROWSER) ? page.evaluate(() => navigator.clipboard.readText()) : page.evaluate(() => window.__copied);
}

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

/**
 * Counts what an exported canvas draws, whichever engine draws it (WebGL draw calls; the basic engine's
 * putImageData on a canvas that is on the page), and the animation frames asked for: after removing a
 * piece, both must stop.
 */
const COUNT_DRAWS = `(() => {
  window.__draws = 0; window.__raf = 0;
  const P = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  if (P) { const d = P.drawArrays; P.drawArrays = function (...a) { window.__draws++; return d.apply(this, a); }; }
  const C = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  if (C) { const p = C.putImageData; C.putImageData = function (...a) { if (this.canvas && this.canvas.isConnected) window.__draws++; return p.apply(this, a); }; }
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb) { window.__raf++; return raf.call(window, cb); };
})();`;
const NO_WEBGL2 = `(() => {
  const g = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' ? null : g.call(this, t, ...a); };
})();`;

let no3d = null;
/** `o.browser`: visit with another engine; `o.no3d`: Chromium/Chrome with --disable-3d-apis (no WebGL at all). */
async function visitSite(url, o = {}) {
  const b = o.no3d ? (no3d ??= await launch(BROWSER, { args: ['--disable-3d-apis'] })) : o.browser ?? browser;
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
async function rafRate(p, ms = 800) { const a = await p.evaluate(() => window.__raf); await p.waitForTimeout(ms); return (await p.evaluate(() => window.__raf)) - a; }
/** Which engine draws a canvas: 'webgl2', '2d' or 'none' (asking a canvas for another kind of context returns null). */
const contextKind = el => el.evaluate(c => (c.getContext('webgl2') ? 'webgl2' : c.getContext('2d') ? '2d' : 'none'));
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
      await pickSize(page, 'ex-size', 'v1');
      for (const f of o.formats ?? ['png', 'webp', 'jpeg']) {
        await page.getByRole('button', { name: f.toUpperCase(), exact: true }).click();
        files[f] = await download(page, dir, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
      }
      await page.getByRole('button', { name: 'PNG', exact: true }).click();
      await pickSize(page, 'ex-size', 'v2');
      files.png2 = await download(page, dir, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
      const FIXED = { hd: [1920, 1080], sq: [1080, 1080], story: [1080, 1920], og: [1200, 630], '4k': [3840, 2160] };
      const fixedOut = [];
      for (const id of o.sizes ?? []) {
        await pickSize(page, 'ex-size', id);
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
        await pickSize(page, 'ex-size', 'v1');
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
      if (PIECES[key].fx && Object.values(PIECES[key].fx).some(v => v > 0.02 && v !== PIECES[key].fx.cellBg)) {
        // pixel effects: before downloading, the tab shows the frame with them and without them, side by side
        await check('vector', `${key}: antes de exportar, la pestaña muestra el SVG sin efectos de píxel junto a la vista`, async () => {
          const imgs = page.locator('.svg-cmp img');
          for (let i = 0; i < 100 && (await imgs.count()) < 2; i++) await pump(page, 100);
          assert((await imgs.count()) === 2, `${await imgs.count()} imágenes en la comparación`);
          const nat = await imgs.evaluateAll(els => els.map(e => e.naturalWidth));
          assert(nat.every(w => w > 0), 'imágenes vacías');
          const said = (await page.locator('.svg-fx').innerText()).replace(/\s+/g, ' ');
          assert(/efectos de píxel que no existen en un SVG/.test(said), 'sin explicación: ' + said.slice(0, 120));
          return said.slice(0, 150);
        });
      }
      await page.getByRole('button', { name: 'Contornos (fiel)' }).click();
      files.svgOutline = await download(page, join(dir, 'svg-contornos'), () => page.getByRole('button', { name: 'Descargar SVG' }).click());
      const notes = await page.locator('.ex-card .warn').allTextContents();
      await page.getByRole('button', { name: 'Texto editable' }).click();
      files.svgText = await download(page, join(dir, 'svg-texto'), () => page.getByRole('button', { name: 'Descargar SVG' }).click());
      await closeSheet(page);
      await svgChecks(key, files, cw, chh, notes, o);
    }

    if (!files.png && ((want('video') && o.video) || (want('codigo') && o.code))) {
      // video frames and pasted code are compared with a PNG of the same instant (the imagen group makes it)
      await openSheet(page, 'Imagen');
      await pickSize(page, 'ex-size', 'v1');
      files.png = await download(page, dir, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
      await closeSheet(page);
    }
    if (want('video') && o.video) await videoChecks(key, page, files, dir, cw, chh);
    if (want('codigo') && o.code) codeOut[key] = await readCodeTab(page, dir, files);
    if (want('terminal') && o.terminal) await terminalExports(key, page, dir, files);
    if (want('video') && o.video) await liveRecording(key, page, dir, files);

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
    }, 'rsvg-convert (herramienta)');
    await check('vector', `${label}: Inkscape lo exporta a PNG`, () => {
      need('inkscape');
      const dst = f.replace(/\.svg$/, '.inkscape.png');
      const r = run('inkscape', [f, '--export-type=png', `--export-filename=${dst}`], { allowFail: true, timeout: 180_000, env: { HOME: join(OUT, 'inkscape-home') } });
      assert(existsSync(dst), (r.stderr || '').slice(-200));
      renders.inkscape = dst;
      return identify(dst, '%w×%h');
    }, 'inkscape (herramienta)');
    // the SVG as an image in each browser engine (<img>, like a web page or a document would show it)
    const showIn = async (b, tag) => {
      const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
      try {
        const b64 = Buffer.from(text).toString('base64');
        await p.setContent(`<body style="margin:0"><img id="i" src="data:image/svg+xml;base64,${b64}"></body>`);
        await p.waitForFunction(() => document.getElementById('i').complete, null, { timeout: 60_000 });
        const nat = await p.evaluate(() => { const i = document.getElementById('i'); return [i.naturalWidth, i.naturalHeight]; });
        assert(nat[0] > 0, 'no carga');
        const dst = f.replace(/\.svg$/, `.${tag}.png`);
        await p.locator('#i').screenshot({ path: dst });
        renders[tag] = dst;
        return `${nat[0]}×${nat[1]}`;
      } finally { await p.close(); }
    };
    await inEngines('vector', `${label}: el navegador lo muestra`, (b, n) => showIn(b, n), [BROWSER, ...PLAY.filter(n => n !== BROWSER)]);
    if (o.svgNote && mode === 'svgOutline') await check('vector', `${label}: la interfaz avisa de lo que el SVG no reproduce igual`, () => {
      assert(notes.some(t => o.svgNote.test(t)), 'sin aviso; avisos: ' + (notes.join(' | ') || 'ninguno'));
      const texts = (text.match(/<text\b/g) ?? []).length, geo = (text.match(/<circle\b/g) ?? []).length;
      return notes.join(' ') + (texts ? ` (${texts} <text>)` : '') + (geo ? ` (${geo} puntos)` : '');
    });
    if (pngRef) {
      for (const [tool, png] of Object.entries(renders)) {
        // text mode needs the typeface installed: rsvg/Inkscape here fall back to another mono (fontconfig)
        const browserEngine = ['chromium', 'chrome', 'firefox', 'webkit'].includes(tool);
        const limit = o.svgInfo ? Infinity : (mode === 'svgOutline' ? 0.03 : CHROMIUMS.has(tool) ? 0.04 : 0.08);
        const eng = browserEngine ? (await engine(tool)).label ?? tool : `${tool === 'rsvg' ? 'rsvg-convert' : tool} (herramienta)`;
        await check('vector', `${label}: ${browserEngine ? 'visto en el navegador' : tool} ≈ PNG del mismo fotograma${o.svgInfo ? ' (informativo)' : ''}`, () => {
          const e = rmse(pngRef, png, { bg: o.bg });
          const eBlur = rmse(pngRef, png, { bg: o.bg, blur: 2 });
          assert(eBlur < limit, `RMSE ${fmt(e)}, desenfocado ${fmt(eBlur)} (límite ${limit})`);
          return `RMSE ${fmt(e)}, desenfocado ${fmt(eBlur)}`;
        }, eng);
      }
    }
  }
}

async function videoChecks(key, page, files, dir, cw, chh) {
  const speed = PIECES[key].motion?.speed ?? 1;

  await openSheet(page, 'Video y GIF');
  const sh = page.locator('.sheet-body');
  await pickSize(page, 'v-size', 'v1');
  await sh.getByLabel('Duración (s)').fill('2');
  await pickNumber(page, 'Fotogramas por segundo', '30');
  await pump(page, 100);
  const mp4Btn = sh.getByRole('button', { name: 'MP4 (H.264)' });
  const webmBtn = sh.getByRole('button', { name: 'WebM' });
  await pumping(page, webmBtn.isEnabled());
  await pump(page, 300);
  const avc = await page.evaluate(async () => typeof VideoEncoder !== 'undefined' && (await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: 640, height: 360 })).supported);
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
  await pickNumber(page, 'Ancho del GIF', '640 px');
  files.gif = await download(page, dir, () => page.getByRole('button', { name: 'Descargar GIF' }).click());
  await closeSheet(page);

  const n = 60;
  const clips = [['webm', files.webm], ['mp4', files.mp4]];
  for (const [kind, f] of clips) {
    const codecRe = kind === 'webm' ? /vp9|vp8/ : /h264/;
    const missing = kind === 'webm' ? 'botón WebM desactivado' : null;
    const gate = () => { if (!f) { if (missing) throw new Error(missing); skip(`${ENGINE} no codifica H.264 (usa BROWSER=chrome para el MP4)`); } };
    await check(kind, `${key}: ffprobe (códec, fps, duración, fotogramas${kind === 'mp4' ? ', perfil, moov al principio' : ''})`, () => {
      gate();
      const j = ffprobe(f), st = j.streams[0];
      const [a, b] = st.avg_frame_rate.split('/').map(Number);
      const fps = a / b, dur = Number(j.format.duration), frames = Number(st.nb_read_frames);
      assert(codecRe.test(st.codec_name) && st.width === cw + (cw % 2) && st.height === chh + (chh % 2), `${st.codec_name} ${st.width}×${st.height}`);
      assert(Math.abs(fps - 30) < 0.01 && Math.abs(dur - 2) < 0.05 && frames === n, `fps ${fps}, duración ${dur}, fotogramas ${frames}`);
      let extra = '';
      if (kind === 'mp4') {
        // fast start: the index (moov) before the data (mdat), so it plays while it downloads
        const buf = readFileSync(f), moov = buf.indexOf('moov'), mdat = buf.indexOf('mdat');
        assert(moov > 0 && moov < mdat, `moov en ${moov}, mdat en ${mdat}: sin fast start`);
        assert(st.pix_fmt === 'yuv420p', 'pix_fmt ' + st.pix_fmt);
        extra = `, perfil ${st.profile} nivel ${st.level}, ${st.pix_fmt}, moov antes que mdat (fast start), marca ${j.format.tags?.major_brand ?? '?'}`;
      }
      return `${st.codec_name} ${st.width}×${st.height}, ${fps} fps, ${dur} s, ${frames} fotogramas, ${j.format.format_name}${extra}`;
    });
    await check(kind, `${key}: decodificación completa sin errores (ffmpeg -v error)`, () => {
      need('ffmpeg'); gate();
      const r = run('ffmpeg', ['-v', 'error', '-i', f, '-f', 'null', '-']);
      assert(r.status === 0 && !r.stderr.trim(), r.stderr.slice(0, 200));
      return 'sin errores';
    });
    // video is YUV 4:2:0: thin coloured glyphs lose chroma, so frames are compared slightly blurred (σ = 2 px)
    await check(kind, `${key}: fotograma 0 = PNG en t = 0`, () => {
      gate();
      const f0 = frameAt(f, 0, join(dir, `${kind}-f0.png`));
      const e = rmse(files.png, f0, { blur: 2 }), raw = rmse(files.png, f0);
      assert(e < 0.035, `RMSE desenfocado ${fmt(e)} (sin desenfocar ${fmt(raw)})`);
      return `RMSE desenfocado ${fmt(e)} (sin desenfocar ${fmt(raw)}: croma 4:2:0)`;
    });
  }
  // 50 frames of 16 ms at motion.speed → engine time 0.8·speed = frame 24 at 30 fps (when exports follow the speed)
  await playFor(page, 50);
  await openSheet(page, 'Imagen');
  await pickSize(page, 'ex-size', 'v1');
  files.pngMid = await download(page, join(dir, 'medio'), () => page.getByRole('button', { name: 'Descargar imagen' }).click());
  await closeSheet(page);
  const tMid = 0.8 * speed, iMid = Math.round(tMid * 30 / speed);
  for (const [kind, f] of clips) {
    await check(kind, `${key}: fotograma ${iMid} (t = ${tMid.toFixed(2)}, velocidad ${speed}) = PNG en el mismo instante`, () => {
      if (!f) { if (kind === 'webm') throw new Error('sin WebM'); skip(`${ENGINE} no codifica H.264`); }
      const mid = frameAt(f, iMid, join(dir, `${kind}-f${iMid}.png`));
      const e = rmse(files.pngMid, mid, { blur: 2 });
      const control = rmse(files.png, mid, { blur: 2 });
      const wrong = Math.round(tMid * 30);   // where the PNG would land if clips ignored motion.speed
      const other = speed !== 1 ? rmse(files.pngMid, frameAt(f, wrong, join(dir, `${kind}-f${wrong}.png`)), { blur: 2 }) : NaN;
      assert(e < 0.035 && e < control, `RMSE desenfocado ${fmt(e)} (control contra t = 0: ${fmt(control)}; fotograma ${wrong}: ${fmt(other)})`);
      return `RMSE desenfocado ${fmt(e)} · controles: fotograma 0 ${fmt(control)}${speed !== 1 ? `, fotograma ${wrong} ${fmt(other)}` : ''}`;
    });
  }
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
}

/**
 * What players need from a live recording: a duration, no alpha channel declared (WebKit's player refuses
 * a WebM that declares one) and, for MP4, the index before the data. Throws when one is missing.
 */
function recordingShape(f, j) {
  const st = j.streams[0], dur = Number(j.format.duration);
  assert(Number.isFinite(dur) && dur >= 0, 'sin duración en la cabecera (' + j.format.duration + ')');
  assert(!st.tags?.alpha_mode || st.tags.alpha_mode === '0', 'declara canal alfa (alpha_mode ' + st.tags?.alpha_mode + ')');
  if (extname(f) === '.mp4') {
    const buf = readFileSync(f), moov = buf.indexOf('moov'), mdat = buf.indexOf('mdat');
    assert(moov > 0 && moov < mdat, `moov en ${moov}, mdat en ${mdat}`);
    assert(buf.indexOf('moof') < 0, 'MP4 fragmentado (moof)');
  }
  return `duración ${dur.toFixed(2)} s en la cabecera, sin canal alfa declarado${extname(f) === '.mp4' ? ', MP4 normal con moov al principio' : ''}`;
}

async function liveRecording(key, page, dir, files) {
  const mimes = await page.evaluate(() => typeof MediaRecorder === 'undefined' ? 'sin MediaRecorder' : ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=vp9']
    .map(t => `${t}: ${MediaRecorder.isTypeSupported(t) ? 'sí' : 'no'}`).join(', '));
  await check('directo', `MediaRecorder: tipos admitidos`, () => mimes);
  await page.clock.resume();
  await page.getByRole('button', { name: 'Reproducir animación' }).click();
  await openSheet(page, 'Video y GIF');
  const startBtn = page.getByRole('button', { name: 'Empezar a grabar' });
  if (!(await startBtn.count())) {
    // no recorder here: the sheet must say so, with what to use instead
    const why = (await page.locator('.sheet-body .ex-na').allTextContents()).join(' ');
    await check('directo', `${key}: sin grabación en directo, la interfaz lo explica`, () => {
      assert(/Grabación en directo: no disponible/.test(why), 'sin explicación: ' + why.slice(0, 200));
      return why.replace(/\s+/g, ' ').slice(0, 160);
    });
    await closeSheet(page);
    return;
  }
  await startBtn.click();
  const t0 = Date.now();
  await sleep(3000);
  const ev = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: /Detener y guardar/ }).click();
  const d = await ev;
  const secs = Math.round((Date.now() - t0) / 100) / 10;
  const f = join(dir, d.suggestedFilename());
  await d.saveAs(f);
  files.live = f;
  await check('directo', `${key}: grabación en directo (ffprobe, decodificación, duración)`, () => {
    need('ffprobe', 'ffmpeg');
    const r = run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', f]);
    const j = JSON.parse(r.stdout), st = j.streams[0];
    const ext = extname(f).slice(1), container = j.format.format_name;
    assert(ext === 'webm' ? /webm|matroska/.test(container) : /mp4|mov/.test(container), `extensión .${ext} pero contenedor ${container}`);
    // .mp4 is only honest with H.264 inside (what social networks, Keynote and editors expect)
    assert(ext !== 'mp4' || st.codec_name === 'h264', `.mp4 con ${st.codec_name} dentro: no se abre en QuickTime/Keynote ni en muchas redes`);
    const dec = run('ffmpeg', ['-v', 'error', '-i', f, '-f', 'null', '-']);
    assert(dec.status === 0, dec.stderr.slice(0, 200));
    const frames = Number(st.nb_read_frames);
    // a live recording keeps what the stage drew: with WebGL by software on a busy machine that is a few
    // frames per second, so this checks a valid, decodable video and reports the rate it reached
    assert(frames >= 1, `${frames} fotogramas en unos ${secs} s de grabación`);
    const tidy = recordingShape(f, j);
    return `${d.suggestedFilename()}: ${container}, ${st.codec_name} ${st.width}×${st.height}, ${frames} fotogramas en ${secs} s (≈ ${(frames / secs).toFixed(1)} fps: lo que el lienzo dibujó); ${tidy}${dec.stderr.trim() ? ' (avisos: ' + dec.stderr.trim().slice(0, 80) + ')' : ', decodifica sin errores'}`;
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
  await check('mp4', `${ENGINE.split(' ')[0]}: ¿codifica H.264 con WebCodecs?`, () => {
    return avc ? 'sí' : 'no (VideoEncoder.isConfigSupported(avc1.*) = false): en este navegador el estudio no ofrece MP4 renderizado; el H.264 se verifica con BROWSER=chrome';
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
/* 2b. The final files, opened in each browser engine                  */
/* ------------------------------------------------------------------ */

/**
 * Plays a video file in <video> (served from another origin, muted, as a web page would): it must load,
 * report its size and duration, and its time must advance. Returns a description, or throws.
 */
async function playIn(b, url, o = {}) {
  const ctx = await b.newContext({ viewport: { width: 900, height: 700 } });
  const p = await ctx.newPage();
  try {
    await p.goto(`${SITE}/archivos/blank.html`);
    const r = await p.evaluate(async ({ url, type }) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      const can = v.canPlayType(type);
      document.body.appendChild(v);
      const ev = await new Promise(res => {
        const t = setTimeout(() => res('tiempo agotado'), 10_000);
        v.addEventListener('loadeddata', () => { clearTimeout(t); res('ok'); }, { once: true });
        v.addEventListener('error', () => { clearTimeout(t); res('error ' + (v.error?.code ?? '?') + ' ' + (v.error?.message ?? '')); }, { once: true });
        v.src = url;
      });
      if (ev !== 'ok') return { can, ev };
      const t0 = v.currentTime;
      let played = 'ok';
      try { await v.play(); } catch (e) { played = String(e.name || e); }
      await new Promise(r => setTimeout(r, 1500));
      const t1 = v.currentTime;
      // a frame really arrives: draw it and look at it
      const c = document.createElement('canvas');
      c.width = 64; c.height = 36;
      const x = c.getContext('2d');
      let lum = -1;
      try { x.drawImage(v, 0, 0, 64, 36); const d = x.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; lum = s / (d.length / 4) / 765; } catch { /* tainted or no frame */ }
      return { can, ev, played, w: v.videoWidth, h: v.videoHeight, dur: v.duration, t0, t1, err: v.error?.code ?? 0, lum };
    }, { url, type: o.type });
    return r;
  } finally { await ctx.close(); }
}

/** Where a produced file is served for the playback checks (another origin, like a real site). */
function publish(f) {
  const dir = join(SITE_DIR, 'archivos');
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, 'blank.html'))) writeFileSync(join(dir, 'blank.html'), page('archivos', '<main></main>'));
  const name = basename(f);
  copyFileSync(f, join(dir, name));
  return `${SITE}/archivos/${encodeURIComponent(name)}`;
}

const VIDEO_TYPES = { mp4: 'video/mp4; codecs="avc1.42E01E"', webm: 'video/webm; codecs="vp9"' };

async function playbackChecks(key) {
  const files = studioFiles[key];
  if (!files) return;
  const videos = [['WebM renderizado', files.webm, 'webm'], ['MP4 (H.264) renderizado', files.mp4, 'mp4'], ['grabación en directo', files.live, files.live?.endsWith('.mp4') ? 'mp4' : 'webm']];
  for (const [what, f, kind] of videos) {
    if (!f) {
      record('reproduccion', `${key}: ${what} se reproduce en <video>`, 'SKIP', kind === 'mp4' ? `${ENGINE} no produjo MP4 (no codifica H.264: usa BROWSER=chrome)` : `${ENGINE} no produjo este archivo`);
      continue;
    }
    const url = publish(f);
    await inEngines('reproduccion', `${key}: ${what} (${basename(f)}) se reproduce en <video>`, async (b, n) => {
      const r = await playIn(b, url, { type: VIDEO_TYPES[kind] });
      if (r.ev !== 'ok') {
        // an engine without that codec: said as what it is, not as a failure of the file
        if (!r.can && ((kind === 'mp4' && n === 'chromium') || (kind === 'webm' && n === 'webkit'))) skip(`${n} no reproduce ${kind === 'mp4' ? 'H.264 (el Chromium de Playwright no trae códecs propietarios)' : 'WebM'}: canPlayType «${r.can}», ${r.ev}`);
        throw new Error(`no carga: ${r.ev} (canPlayType «${r.can}»)`);
      }
      assert(r.err === 0, 'error de reproducción ' + r.err);
      // a short live recording may end within the 1.5 s: it has to reach (most of) its end
      assert(r.t1 > r.t0 + Math.min(0.3, 0.8 * (Number.isFinite(r.dur) ? r.dur : 1)), `el tiempo no avanza (${fmt(r.t0)} → ${fmt(r.t1)} s; play: ${r.played})`);
      assert(r.w > 0 && r.h > 0, `sin tamaño (${r.w}×${r.h})`);
      return `${r.w}×${r.h}, ${Number.isFinite(r.dur) ? fmt(r.dur) + ' s' : 'duración ' + r.dur}, avanza ${fmt(r.t0)} → ${fmt(r.t1)} s en 1,5 s, fotograma dibujado (luminancia ${fmt(r.lum)}), canPlayType «${r.can}»`;
    });
  }
  const images = [['PNG', files.png], ['WebP', files.webp], ['JPEG', files.jpeg], ['GIF', files.gif], ['PNG transparente', files.pngT]].filter(([, f]) => f);
  for (const [what, f] of images) {
    const url = publish(f);
    const [w, h] = identify(f + '[0]', '%w %h').split(' ').map(Number);
    await inEngines('imagen', `${key}: ${what} se abre en el navegador (${w}×${h})`, async b => {
      const ctx = await b.newContext();
      const p = await ctx.newPage();
      try {
        await p.goto(`${SITE}/archivos/blank.html`);
        const r = await p.evaluate(async u => {
          const i = new Image();
          i.src = u;
          try { await i.decode(); } catch (e) { return { err: String(e) }; }
          return { w: i.naturalWidth, h: i.naturalHeight };
        }, url);
        assert(!r.err, r.err);
        assert(r.w === w && r.h === h, `${r.w}×${r.h}`);
        return `decodifica, ${r.w}×${r.h}`;
      } finally { await ctx.close(); }
    });
  }
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
  const fallback = async which => {
    await page.getByRole('button', { name: which === 'basic' ? /^Motor básico/ : 'Póster o color' }).click();
    await pump(page, 150);
  };
  // what the tab says before copying: the choice without WebGL 2, and the weight of each option
  out.fallbackButton = await page.getByRole('button', { name: /^Motor básico/ }).innerText().catch(() => '');
  out.fallbackPressed = await page.getByRole('button', { name: /^Motor básico/ }).getAttribute('aria-pressed').catch(() => null);
  await page.getByRole('button', { name: 'HTML para pegar' }).click();
  for (const [id, name] of [['fixed', 'Fondo de página'], ['hero', 'Portada'], ['block', 'Bloque']]) {
    await page.getByRole('button', { name, exact: true }).click();
    await pump(page, 100);
    out.html[id] = await code();
  }
  await page.getByRole('button', { name: 'Bloque', exact: true }).click();
  await pump(page, 400);
  out.sizeLine = (await page.locator('.sheet-body .code-size').innerText().catch(() => '')).replace(/\s+/g, ' ');
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
  // the lighter code: poster or background colour without WebGL 2
  await fallback('poster');
  out.posterNote = (await page.locator('.sheet-body .code-fallback').innerText().catch(() => '')).replace(/\s+/g, ' ');
  out.reactPoster = await code();
  await page.getByRole('button', { name: 'Web Component' }).click();
  await pump(page, 100);
  out.wcPosterUsage = await code();
  out.wcPosterPath = await download(page, join(dir, 'sin-basico'), () => page.getByRole('button', { name: /Descargar monotrama-field/ }).click());
  await page.getByRole('button', { name: 'HTML para pegar' }).click();
  await pump(page, 100);
  out.htmlPoster = await code();
  await fallback('basic');
  await closeSheet(page);
  return out;
}

const HEADER_RE = /Hecho con Monotrama · https:\/\/monotrama\.vercel\.app · Licencia MIT-0/;
const rgbOf = hex => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;

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
  const bgRgb = rgbOf(PIECES[key].color.bg);

  await check('codigo', `${key}: cabecera MIT-0 en todo el código exportado`, () => {
    const missing = [];
    for (const [id, s] of Object.entries(c.html)) if (!HEADER_RE.test(s)) missing.push('HTML ' + id);
    if (!HEADER_RE.test(c.htmlPoster)) missing.push('HTML sin motor básico');
    for (const [n, f] of [['monotrama-field.js', c.wcPath], ['monotrama-field.js sin motor básico', c.wcPosterPath], ['página .html', c.pagePath]]) if (!HEADER_RE.test(readFileSync(f, 'utf8'))) missing.push(n);
    if (!HEADER_RE.test(c.react)) missing.push('React');
    if (!HEADER_RE.test(c.reactPoster)) missing.push('React sin motor básico');
    assert(!missing.length, 'falta en: ' + missing.join(', '));
    return 'HTML ×3 (+ sin motor básico), página, Web Component ×2, React ×2';
  });
  await check('codigo', `${key}: antes de copiar, la pestaña dice qué pasa sin WebGL 2 y cuánto pesa`, () => {
    assert(c.fallbackPressed === 'true', 'el motor básico no es la opción por defecto');
    assert(/^Motor básico \(\+\d+ KB\)$/.test(c.fallbackButton.trim()), 'botón sin tamaño: «' + c.fallbackButton + '»');
    assert(/Canvas 2D/.test(c.codeNote) && /Si tampoco puede dibujar, se ve tu póster o el color de fondo/.test(c.codeNote), 'no explica el respaldo');
    assert(/Este código: \d+ KB/.test(c.sizeLine), 'sin tamaño del código: «' + c.sizeLine + '»');
    assert(/Sin WebGL 2 la pieza no se mueve/.test(c.posterNote), 'la opción ligera no explica su límite: «' + c.posterNote + '»');
    const kb = s => new Blob([s]).size / 1024;
    const snippet = c.html.block, light = c.htmlPoster;
    const ids = [...new Set(PIECES[key].layers?.map(l => l.pattern) ?? [])];
    // only this piece's CPU patterns travel with it
    const carried = [...snippet.matchAll(/B\.has\("(\w+)"\)/g)].map(m => m[1]);
    assert(!/B\.has\(/.test(light), 'la versión ligera lleva patrones del motor básico');
    assert(carried.length && carried.every(id => ids.includes(id) || id === 'nube'), `patrones incluidos ${carried.join(', ')} (la pieza usa ${ids.join(', ') || 'ninguno'})`);
    return `«${c.fallbackButton.trim()}»; ${c.sizeLine.split('.')[0]}; con motor básico ${kb(snippet).toFixed(0)} KB, sin él ${kb(light).toFixed(0)} KB; patrones incluidos: ${carried.join(', ')}`;
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
        const sd = spread(shot), rate = await drawRate(p), kind = await contextKind(cv);
        assert(!errors.length, errors.slice(0, 2).join(' | '));
        assert(sd > 0.02 && rate > 1, `desviación ${fmt(sd)}, dibujos/1.2 s ${rate}`);
        let off = '';
        if (id !== 'fixed') {
          await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await p.waitForTimeout(400);
          const offRate = await drawRate(p);
          assert(offRate === 0, `fuera de pantalla sigue dibujando (${offRate} dibujos/1.2 s)`);
          await p.evaluate(() => window.scrollTo(0, 0));
          await p.waitForTimeout(400);
          const back = await drawRate(p);
          assert(back > 0, 'al volver a la vista no reanuda');
          off = `, fuera de pantalla 0 dibujos y al volver ${back}`;
        }
        return `${kind === 'webgl2' ? 'WebGL 2' : 'motor básico (2D)'}, ${Math.round(box.width)}×${Math.round(box.height)} px, desviación ${fmt(sd)}, ${rate} dibujos/1.2 s${off}, sin errores`;
      } finally { await ctx.close(); }
    });
  }
  const [w, h] = identify(studioFiles[key].png, '%w %h').split(' ').map(Number);
  writeFileSync(join(dir, 'parecido.html'), page('parecido', `<style>.monotrama{width:${w}px;height:${h}px!important;border-radius:0!important}</style>${c.html.block}`));
  const sameSize = async (label, o) => {
    await check('codigo', `${key}: ${label}`, async () => {
      const { ctx, p, errors } = await visitSite(`${SITE}/${key}/parecido.html`, { reducedMotion: 'reduce', settle: 4000, viewport: { width: w + 100, height: h + 100 }, ...o });
      try {
        const shot = join(OUT, key, `sitio-parecido${o.noWebgl2 ? '-basico' : ''}.png`);
        const cv = p.locator('.monotrama canvas');
        await cv.screenshot({ path: shot });
        const kind = await contextKind(cv);
        assert(!errors.length, errors.slice(0, 2).join(' | '));
        if (o.noWebgl2) assert(kind === '2d', 'no dibuja el motor básico: ' + kind);
        const e = rmse(studioFiles[key].png, shot), eb = rmse(studioFiles[key].png, shot, { blur: 2 });
        assert(eb < 0.05, `RMSE ${fmt(e)}, desenfocado ${fmt(eb)} (${kind})`);
        return `${w}×${h}, ${kind === 'webgl2' ? 'WebGL 2' : 'motor básico (2D)'}: RMSE ${fmt(e)}, desenfocado ${fmt(eb)} (Google Fonts frente a la fuente local del estudio)`;
      } finally { await ctx.close(); }
    });
  };
  await sameSize('pegado al tamaño del lienzo del estudio = PNG del estudio (t = 0)', {});
  await sameSize('sin WebGL 2, el motor básico incluido = PNG del estudio (t = 0)', { noWebgl2: true });
  await check('codigo', `${key}: se adapta al tamaño de su contenedor`, async () => {
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/html-block.html`);
    try {
      const cv = p.locator('.monotrama canvas');
      const size = () => cv.evaluate(c => ({ w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight }));
      const a = await size();
      await p.evaluate(() => { const m = document.querySelector('.monotrama'); m.style.width = '520px'; m.style.height = '300px'; });
      await p.waitForTimeout(900);
      const b = await size();
      const rate = await drawRate(p, 800);
      assert(!errors.length, errors.slice(0, 2).join(' | '));
      assert(b.cw === 520 && b.ch === 300, `caja ${b.cw}×${b.ch}`);
      // the backing store follows the box (its pixel ratio may drop while frames are slow, never its shape)
      assert(Math.abs(b.w / b.h - 520 / 300) < 0.03 && b.w < a.w, `lienzo ${a.w}×${a.h} → ${b.w}×${b.h}`);
      assert(rate > 0, 'deja de dibujar al cambiar de tamaño');
      return `caja ${a.cw}×${a.ch} → 520×300; lienzo ${a.w}×${a.h} → ${b.w}×${b.h}; sigue dibujando (${rate}/0.8 s)`;
    } finally { await ctx.close(); }
  });
  await check('codigo', `${key}: oculto (display:none) no dibuja; al mostrarlo vuelve`, async () => {
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/html-block.html`);
    try {
      await p.evaluate(() => { document.querySelector('.monotrama').style.display = 'none'; });
      await p.waitForTimeout(400);
      const hidden = await drawRate(p);
      await p.evaluate(() => { document.querySelector('.monotrama').style.display = ''; });
      await p.waitForTimeout(600);
      const shown = await drawRate(p);
      assert(!errors.length, errors.slice(0, 2).join(' | '));
      assert(hidden === 0 && shown > 0, `oculto ${hidden}, visible ${shown} dibujos/1.2 s`);
      return `oculto 0 dibujos/1.2 s; visible otra vez ${shown}`;
    } finally { await ctx.close(); }
  });
  await check('codigo', `${key}: quitar el bloque de la página lo detiene y libera el contexto`, async () => {
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/html-block.html`);
    try {
      await p.evaluate(() => { window.__cv = document.querySelector('.monotrama canvas'); document.querySelector('.monotrama').remove(); });
      await p.waitForTimeout(900);
      const d = await drawRate(p, 800), raf = await rafRate(p, 800);
      const lost = await p.evaluate(() => { const g = window.__cv.getContext('webgl2'); return g ? g.isContextLost() : 'sin WebGL'; });
      assert(!errors.length, errors.slice(0, 2).join(' | '));
      assert(d === 0 && raf === 0, `tras quitarlo: ${d} dibujos, ${raf} requestAnimationFrame`);
      assert(lost === true || lost === 'sin WebGL', 'el contexto WebGL sigue vivo');
      return `0 dibujos y 0 requestAnimationFrame tras quitarlo; contexto ${lost === true ? 'liberado' : lost}`;
    } finally { await ctx.close(); }
  });
  await check('codigo', `${key}: «reducir movimiento» → un fotograma y quieto`, async () => {
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/html-block.html`, { reducedMotion: 'reduce' });
    try {
      const shot = join(OUT, key, 'sitio-reducido.png');
      await p.locator('.monotrama canvas').screenshot({ path: shot });
      const rate = await drawRate(p, 1500), sd = spread(shot);
      assert(!errors.length, errors.slice(0, 2).join(' | '));
      assert(rate === 0 && sd > 0.02, `dibujos/1.5 s ${rate}, desviación ${fmt(sd)}`);
      return `0 dibujos en 1.5 s, imagen fija visible (desviación ${fmt(sd)})`;
    } finally { await ctx.close(); }
  });
  const posterSnippet = poster ? c.htmlPoster.replace(/"poster":""/, '"poster":"poster.png"') : c.htmlPoster;
  writeFileSync(join(dir, 'html-sin-webgl.html'), page('sin webgl', `<main><h1>Mi web</h1>${posterSnippet}</main>`));
  writeFileSync(join(dir, 'html-sin-webgl-basico.html'), page('sin webgl', `<main><h1>Mi web</h1>${c.html.block}</main>`));
  await check('codigo', `${key}: sin motor básico y sin WebGL 2 → color de fondo${poster ? ' + póster' : ''}, sin excepciones`, async () => {
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/html-sin-webgl.html`, { noWebgl2: true });
    try {
      const pageErrors = errors.filter(e => e.startsWith('pageerror'));
      assert(!pageErrors.length, pageErrors.join(' | '));
      const st = await p.evaluate(() => { const c = document.querySelector('.monotrama canvas'); const s = getComputedStyle(c); const w = getComputedStyle(c.parentElement); return { bg: s.backgroundColor, img: s.backgroundImage, wrap: w.backgroundColor }; });
      assert(st.wrap === bgRgb, `fondo ${st.wrap}, esperado ${bgRgb}`);
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
  await check('codigo', `${key}: navegador sin WebGL (Chromium --disable-3d-apis): el motor básico dibuja; sin él, póster`, async () => {
    if (!CHROMIUMS.has(BROWSER)) skip(`--disable-3d-apis sólo existe en Chromium y Chrome (${BROWSER} se comprueba con WebGL 2 anulado)`);
    const a = await visitSite(`${SITE}/${key}/html-sin-webgl-basico.html`, { no3d: true });
    let basic;
    try {
      const gl = await a.p.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
      assert(!gl, 'WebGL 2 sigue disponible');
      const pe = a.errors.filter(e => e.startsWith('pageerror'));
      assert(!pe.length, pe.join(' | '));
      const cv = a.p.locator('.monotrama canvas');
      const shot = join(OUT, key, 'sitio-sin-3d.png');
      await cv.screenshot({ path: shot });
      const kind = await contextKind(cv), sd = spread(shot), rate = await drawRate(a.p);
      assert(kind === '2d' && sd > 0.02 && rate > 0, `${kind}, desviación ${fmt(sd)}, ${rate} dibujos`);
      basic = `motor básico: 2D, desviación ${fmt(sd)}, ${rate} dibujos/1.2 s`;
    } finally { await a.ctx.close(); }
    const b = await visitSite(`${SITE}/${key}/html-sin-webgl.html`, { no3d: true });
    try {
      const pe = b.errors.filter(e => e.startsWith('pageerror'));
      assert(!pe.length, pe.join(' | '));
      const img = await b.p.evaluate(() => getComputedStyle(document.querySelector('.monotrama canvas')).backgroundImage);
      assert(!poster || /poster\.png/.test(img), 'sin póster: ' + img);
      return `getContext('webgl2') = null; ${basic}; sin motor básico: ${poster ? 'póster visible' : 'color de fondo'}; 0 excepciones`;
    } finally { await b.ctx.close(); }
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
  copyFileSync(c.wcPath, join(dir, 'monotrama-field.js'));
  mkdirSync(join(dir, 'ligero'), { recursive: true });
  copyFileSync(c.wcPosterPath, join(dir, 'ligero', 'monotrama-field.js'));
  writeFileSync(join(dir, 'wc.html'), page('wc', `<main><h1>Mi web</h1>${filler(2)}\n${c.wcUsage}\n${filler(40)}</main>`));
  const wcShot = join(OUT, key, 'sitio-wc.png');
  await check('codigo', `${key}: Web Component (<monotrama-field> + monotrama-field.js)`, async () => {
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/wc.html`, { settle: 3500 });
    try {
      await p.locator('monotrama-field').screenshot({ path: wcShot });
      const sd = spread(wcShot), rate = await drawRate(p);
      assert(!errors.length, errors.slice(0, 2).join(' | '));
      assert(sd > 0.02 && rate > 1, `desviación ${fmt(sd)}, dibujos ${rate}`);
      let off = '';
      if (!/position:fixed/.test(c.wcUsage)) {
        await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await p.waitForTimeout(400);
        const r2 = await drawRate(p);
        assert(r2 === 0, `fuera de pantalla sigue dibujando (${r2})`);
        await p.evaluate(() => window.scrollTo(0, 0));
        await p.waitForTimeout(400);
        off = ', fuera de pantalla 0 dibujos';
      }
      // removal: no canvas, no drawing, no animation frames left, the WebGL context released
      await p.evaluate(() => { const el = document.querySelector('monotrama-field'); window.__cv = el.shadowRoot.querySelector('canvas'); el.remove(); });
      await p.waitForTimeout(300);
      const r3 = await drawRate(p, 800), raf = await rafRate(p, 800);
      const lost = await p.evaluate(() => { const g = window.__cv.getContext('webgl2'); return g ? g.isContextLost() : 'sin WebGL'; });
      assert(r3 === 0 && raf === 0, `tras quitar el elemento: ${r3} dibujos, ${raf} peticiones de fotograma`);
      assert(lost === true || lost === 'sin WebGL', 'el contexto WebGL sigue vivo');
      return `desviación ${fmt(sd)}, ${rate} dibujos/1.2 s${off}; al quitarlo 0 dibujos, 0 requestAnimationFrame, contexto ${lost === true ? 'liberado' : lost}; sin errores`;
    } finally { await ctx.close(); }
  });
  await check('codigo', `${key}: Web Component = PNG del estudio (misma imagen, no sólo «algo se mueve»)`, async () => {
    // a component started before its patterns were registered drew a blank field with the vignette only
    writeFileSync(join(dir, 'wc-parecido.html'), page('wc', c.wcUsage.replace(/style="[^"]*"/, `style="display:block;width:${w}px;height:${h}px;background:${PIECES[key].color.bg}"`)));
    const { ctx, p, errors } = await visitSite(`${SITE}/${key}/wc-parecido.html`, { reducedMotion: 'reduce', settle: 4000, viewport: { width: w + 100, height: h + 100 } });
    try {
      const shot = join(OUT, key, 'sitio-wc-parecido.png');
      await p.locator('monotrama-field').screenshot({ path: shot });
      assert(!errors.length, errors.slice(0, 2).join(' | '));
      const eb = rmse(studioFiles[key].png, shot, { blur: 2 });
      assert(eb < 0.05, `RMSE desenfocado ${fmt(eb)}`);
      return `${w}×${h}: RMSE desenfocado ${fmt(eb)}`;
    } finally { await ctx.close(); }
  });
  await check('codigo', `${key}: Web Component sin WebGL 2: motor básico; sin él (no-basic), póster`, async () => {
    writeFileSync(join(dir, 'wc-sin-webgl.html'), page('wc', `<main>${c.wcUsage}</main>`));
    writeFileSync(join(dir, 'ligero', 'wc-sin-webgl.html'), page('wc', `<main>${c.wcPosterUsage.replace('<monotrama-field', '<monotrama-field poster="../poster.png"')}</main>`));
    const a = await visitSite(`${SITE}/${key}/wc-sin-webgl.html`, { noWebgl2: true, settle: 3500 });
    let basic;
    try {
      const pe = a.errors.filter(e => e.startsWith('pageerror'));
      assert(!pe.length, pe.join(' | '));
      const shot = join(OUT, key, 'sitio-wc-basico.png');
      await a.p.locator('monotrama-field').screenshot({ path: shot });
      const kind = await a.p.evaluate(() => { const cv = document.querySelector('monotrama-field').shadowRoot.querySelector('canvas'); return cv.getContext('2d') ? '2d' : 'otro'; });
      const sd = spread(shot);
      assert(kind === '2d' && sd > 0.02, `${kind}, desviación ${fmt(sd)}`);
      basic = `motor básico 2D (desviación ${fmt(sd)})`;
    } finally { await a.ctx.close(); }
    const b = await visitSite(`${SITE}/${key}/ligero/wc-sin-webgl.html`, { noWebgl2: true });
    try {
      const pe = b.errors.filter(e => e.startsWith('pageerror'));
      assert(!pe.length, pe.join(' | '));
      const img = await b.p.evaluate(() => { const el = document.querySelector('monotrama-field'); const cv = el.shadowRoot.querySelector('canvas'); return getComputedStyle(cv).backgroundImage; });
      assert(/poster\.png/.test(img), 'sin póster: ' + img);
      return `${basic}; sin él: póster en el lienzo; 0 excepciones`;
    } finally { await b.ctx.close(); }
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
    // the lighter variant (no basic engine): poster or colour without WebGL 2
    writeFileSync(join(app, 'src', name + 'Ligero.jsx'), codeOut[k].reactPoster.replace(/export default function \w+/, `export default function ${name}Ligero`));
    for (const pub of [join(app, 'public'), SITE_DIR]) {
      if (codeOut[k].posterPath) copyFileSync(codeOut[k].posterPath, join(pub, `poster-${k}.png`));
      if (PIECES[k].source === 'image') for (const n of ['tu-imagen.jpg', 'foto.png']) copyFileSync(SYNTH, join(pub, n));
    }
    imports.push(`import ${name} from './${name}.jsx';`, `import ${name}Ligero from './${name}Ligero.jsx';`);
    uses.push(`{on && <section className="pieza" data-k="${k}"><${name} poster="/poster-${k}.png"><h2 style={{ color: '#fff', margin: 0, padding: 16 }}>${k}</h2></${name}></section>}`);
    uses.push(`{on && <section className="pieza ligera" data-k="${k}-ligero"><${name}Ligero poster="/poster-${k}.png"><h2 style={{ color: '#fff', margin: 0, padding: 16 }}>${k} (ligero)</h2></${name}Ligero></section>}`);
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
      for (const k of pieces.flatMap(x => [x, x + '-ligero'])) {
        await check('react', `${mode}: ${k} se ve (StrictMode)`, async () => {
          const el = p.locator(`.pieza[data-k="${k}"] canvas`);
          await el.scrollIntoViewIfNeeded();
          await p.waitForTimeout(600);
          const shot = join(OUT, 'react-app', `${mode}-${k}.png`);
          await el.screenshot({ path: shot });
          const sd = spread(shot);
          assert(sd > 0.02, `lienzo plano (desviación ${fmt(sd)})`);
          return `desviación ${fmt(sd)}`;
        });
      }
      await check('react', `${mode}: sin errores en consola`, () => { assert(!errors.length, errors.slice(0, 3).join(' | ')); return 'ninguno'; });
      await check('react', `${mode}: desmontar limpia (lienzos fuera, 0 dibujos, 0 requestAnimationFrame, contextos liberados)`, async () => {
        await p.evaluate(() => { window.__cvs = [...document.querySelectorAll('.pieza canvas')]; });
        await p.click('#toggle');
        await p.waitForTimeout(300);
        const left = await p.locator('.pieza canvas').count();
        const rate = await drawRate(p, 800);
        const raf = await rafRate(p, 800);
        const alive = await p.evaluate(() => window.__cvs.filter(c => { const g = c.getContext('webgl2'); return g && !g.isContextLost(); }).length);
        assert(left === 0 && rate === 0 && raf === 0, `${left} lienzos, ${rate} dibujos, ${raf} requestAnimationFrame`);
        assert(alive === 0, `${alive} contextos WebGL siguen vivos`);
        await p.click('#toggle');
        await p.waitForTimeout(1500);
        const again = await drawRate(p, 800);
        assert(again > 0 || !pieces.length, 'al volver a montar no dibuja');
        assert(!errors.length, errors.slice(0, 3).join(' | '));
        return `0 lienzos, 0 dibujos, 0 requestAnimationFrame y ${alive} contextos vivos tras desmontar; al volver a montar dibuja (${again} dibujos/0.8 s)`;
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
  await check('react', 'sin WebGL 2: el motor básico dibuja; la versión ligera muestra su póster; sin excepciones', async () => {
    if (!built) skip('no compiló');
    const { ctx, p, errors } = await visitSite(`${SITE}/react/`, { noWebgl2: true, settle: 4000 });
    try {
      const pe = errors.filter(e => e.startsWith('pageerror'));
      assert(!pe.length, pe.join(' | '));
      const st = await p.evaluate(() => [...document.querySelectorAll('.pieza')].map(s => {
        const c = s.querySelector('canvas');
        if (!c) return { k: s.dataset.k, what: 'sin lienzo' };
        const light = s.classList.contains('ligera');
        return { k: s.dataset.k, light, img: getComputedStyle(c).backgroundImage, kind: light ? '' : (c.getContext('2d') ? '2d' : 'otro') };
      }));
      const bad = st.filter(x => (x.light ? !/poster-/.test(x.img) : x.kind !== '2d'));
      assert(!bad.length, 'mal: ' + JSON.stringify(bad).slice(0, 300));
      return `${st.filter(x => !x.light).length} fondos con el motor básico (2D), ${st.filter(x => x.light).length} ligeros con su póster`;
    } finally { await ctx.close(); }
  });
}

/* ------------------------------------------------------------------ */
/* 5b. Projects, sessions and collections with real media               */
/* ------------------------------------------------------------------ */

/** Realistic files made with ffmpeg: a large photo, an H.264 MP4 and a VP9 WebM, both with motion. */
function realMedia() {
  need('ffmpeg');
  const dir = join(OUT, 'medios-reales');
  mkdirSync(dir, { recursive: true });
  const make = (name, args) => {
    const f = join(dir, name);
    if (!existsSync(f)) {
      const r = run('ffmpeg', ['-v', 'error', '-y', ...args, f], { timeout: 180_000 });
      if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr.slice(0, 200));
    }
    return f;
  };
  return {
    photo: (() => {
      // a 12-megapixel photo-like picture (a phone's size): cloudy colour fields with fine texture
      const f = join(dir, 'foto-grande.jpg');
      need('convert');
      if (!existsSync(f)) run('convert', ['-seed', '7', '-size', '4032x3024', 'plasma:#1b3a6b-#e8a33d', '-blur', '0x2', '-quality', '95', f], { timeout: 180_000 });
      return f;
    })(),
    mp4: make('clip-h264.mp4', ['-f', 'lavfi', '-i', 'mandelbrot=s=1280x720:r=30', '-t', '4', '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']),
    webm: make('clip-vp9.webm', ['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30', '-t', '4', '-c:v', 'libvpx-vp9', '-b:v', '1500k', '-deadline', 'realtime', '-cpu-used', '8']),
  };
}
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex');
/** Entry names and SHA-256 of a zip's files (python's zipfile: an independent reader). */
function zipIndex(f) {
  need('python3');
  const r = run('python3', ['-c', 'import zipfile,sys,hashlib,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}))', f]);
  if (r.status !== 0) throw new Error('zip ilegible: ' + r.stderr.slice(0, 200));
  return JSON.parse(r.stdout);
}
function zipJson(f, name) {
  const r = run('python3', ['-c', 'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())', f, name]);
  return JSON.parse(r.stdout);
}

/** A fresh browser profile on the studio, in real time (no fake clock), paused by «reducir movimiento». */
async function freshStudio(recipe) {
  const ctx = await studioContext();
  if (!CHROMIUMS.has(BROWSER)) await ctx.addInitScript(CLIP_STUB);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(recipe ? `${BASE}/studio/#r=${encode(recipe)}` : `${BASE}/studio/`);
  await p.locator('.stage canvas').first().waitFor();
  if (await p.locator('dialog.welcome[open]').count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
  await p.waitForTimeout(800);
  return { ctx, p, errors };
}
const toastText = (p, re) => p.locator('.toast').filter({ hasText: re }).first().waitFor({ timeout: 90_000 });
async function freshDownload(p, dir, click) {
  const ev = p.waitForEvent('download', { timeout: 180_000 });
  await click();
  const d = await ev;
  mkdirSync(dir, { recursive: true });
  const f = join(dir, d.suggestedFilename());
  await d.saveAs(f);
  return f;
}
async function openExportTab(p, tab) {
  if (!(await p.getByRole('tab', { name: tab }).isVisible().catch(() => false))) await p.keyboard.press('e');
  await p.getByRole('tab', { name: tab }).click();
  await p.waitForTimeout(300);
}
/** The piece's recipe as the Receta tab downloads it. */
async function recipeOf(p, dir) {
  await openExportTab(p, 'Receta');
  const f = await freshDownload(p, dir, () => p.getByRole('button', { name: /Descargar receta/ }).click());
  await p.keyboard.press('Escape');
  return JSON.parse(readFileSync(f, 'utf8')).recipe;
}
/** A PNG of the stage as the Imagen tab exports it («Como la vista»). */
async function pngOf(p, dir) {
  await openExportTab(p, 'Imagen');
  const btn = p.locator('#ex-size');
  if ((await btn.getAttribute('data-value')) !== 'v1') {
    await btn.click();
    await p.getByRole('listbox').getByRole('option', { name: /^Como la vista/ }).first().click();
  }
  const f = await freshDownload(p, dir, () => p.getByRole('button', { name: 'Descargar imagen' }).click());
  await p.keyboard.press('Escape');
  return f;
}
/** The piece's video paused at a known instant, so two browsers draw the same frame. */
const holdVideo = (p, t) => p.evaluate(t => new Promise(res => {
  const v = [...document.querySelectorAll('body > video')].find(x => !x.srcObject && x.src);
  if (!v) { res(false); return; }
  v.pause();
  const done = () => res(true);
  v.addEventListener('seeked', done, { once: true });
  v.currentTime = t;
  setTimeout(done, 4000);
}), t);
const panelHas = async (p, name) => {
  await p.getByRole('tab', { name: 'Fuente' }).click().catch(() => undefined);
  return p.locator('.panel').getByText(name).first().isVisible({ timeout: 20_000 }).catch(() => false);
};
const strip = r => { const x = JSON.parse(JSON.stringify(r)); delete x.meta; if (x.media?.ref) delete x.media.ref.id; return x; };

async function projectFlows() {
  let media;
  try { media = realMedia(); } catch (e) { record('proyectos', 'medios de prueba (ffmpeg)', e instanceof Skip ? 'SKIP' : 'FAIL', e.message); return; }
  const dir = join(OUT, 'proyectos');
  await check('proyectos', 'medios de prueba reales (ffmpeg)', () => {
    const d = f => { const j = ffprobe(f), s = j.streams[0]; return `${basename(f)} ${s.codec_name} ${s.width}×${s.height}${j.format.duration ? ', ' + Number(j.format.duration).toFixed(1) + ' s' : ''}, ${(statSync(f).size / 1048576).toFixed(1)} MB`; };
    return [d(media.photo), d(media.mp4), d(media.webm)].join(' · ');
  });
  const base = { ...PIECES.imagen, meta: { name: 'Proyecto real', space: 'media' } };
  const cases = [
    ['foto', media.photo, { ...base, source: 'image' }, 'image/jpeg'],
    ['mp4', media.mp4, { ...base, source: 'video' }, 'video/mp4'],
    ['webm', media.webm, { ...base, source: 'video' }, 'video/webm'],
  ];
  const session = { made: [] };
  for (const [id, file, recipe, type] of cases) {
    const name = basename(file);
    const A = await freshStudio(recipe);
    let zip = null, ref = {};
    try {
      // 1. a person picks the file
      const chooser = A.p.waitForEvent('filechooser');
      await A.p.getByRole('button', { name: recipe.source === 'image' ? 'Elegir imagen' : 'Elegir video' }).first().click();
      await (await chooser).setFiles(file);
      const loaded = await Promise.race([
        A.p.getByRole('region', { name: 'Cargar fuente' }).waitFor({ state: 'detached', timeout: 60_000 }).then(() => 'ok'),
        A.p.locator('.warn').filter({ hasText: /no puede reproducir|No se pudo abrir/ }).first().waitFor({ timeout: 60_000 }).then(async () => 'error: ' + await A.p.locator('.warn').first().innerText()),
      ]).catch(e => 'tiempo agotado: ' + e.message);
      if (loaded !== 'ok') {
        // a browser that cannot decode this format must say so (never a silent blank)
        await check('proyectos', `${id}: ${name} en el estudio`, () => {
          if (/no puede reproducir/.test(loaded) && type === 'video/mp4' && BROWSER === 'chromium') skip(`el Chromium de Playwright no decodifica H.264; el estudio lo dice: «${loaded.slice(7)}»`);
          throw new Error(loaded);
        });
        continue;
      }
      if (recipe.source === 'video') await holdVideo(A.p, 1.0);
      await A.p.waitForTimeout(800);
      const pngA = await pngOf(A.p, join(dir, id, 'a'));
      const rA = await recipeOf(A.p, join(dir, id, 'a'));
      ref = rA.media.ref ?? {};
      // 2. the project .zip
      await openExportTab(A.p, 'Receta');
      const said = await A.p.locator('.ex-card').filter({ hasText: 'Proyecto (.zip)' }).innerText();
      zip = await freshDownload(A.p, join(dir, id, 'a'), () => A.p.getByRole('button', { name: 'Exportar proyecto (.zip)' }).click());
      await A.p.keyboard.press('Escape');
      session.made.push({ id, name });
      await check('proyectos', `${id}: el proyecto .zip lleva el archivo original, byte a byte`, () => {
        const idx = zipIndex(zip);
        const entry = Object.keys(idx).find(n => n.startsWith('medios/'));
        assert(entry, 'sin carpeta medios/: ' + Object.keys(idx).join(', '));
        assert(idx[entry] === sha(file), `SHA-256 distinto (${entry})`);
        const rec = zipJson(zip, Object.keys(idx).find(n => n.endsWith('.json')));
        const r = rec.recipe.media.ref;
        assert(r && r.name === name && r.size === statSync(file).size && r.w > 0 && r.h > 0, 'referencia: ' + JSON.stringify(r));
        assert(new RegExp(reEsc(name)).test(said), 'la pestaña no nombra el archivo: ' + said.slice(0, 160));
        return `${Object.keys(idx).join(', ')}; ${entry} = original (SHA-256), ${r.w}×${r.h}, ${(r.size / 1048576).toFixed(1)} MB; la pestaña lo dice antes`;
      });
      // 3. another browser profile that has never seen the file
      const B = await freshStudio();
      try {
        await B.p.getByRole('button', { name: /Colección/ }).first().click();
        const ch = B.p.waitForEvent('filechooser');
        await B.p.getByRole('button', { name: 'Importar receta, colección o proyecto' }).click();
        await (await ch).setFiles(zip);
        await toastText(B.p, /Proyecto abierto/);
        await B.p.keyboard.press('Escape');
        await check('proyectos', `${id}: abierto en un perfil nuevo, la pieza y su archivo vuelven`, async () => {
          assert(await panelHas(B.p, name), 'el panel no muestra ' + name);
          assert(!(await B.p.getByRole('region', { name: 'Cargar fuente' }).count()), 'pide el archivo otra vez');
          const rB = await recipeOf(B.p, join(dir, id, 'b'));
          assert(JSON.stringify(strip(rA)) === JSON.stringify(strip(rB)), 'la receta cambió');
          assert(!B.errors.length, B.errors.slice(0, 2).join(' | '));
          return `receta idéntica; ${name} en el panel, sin pedir el archivo`;
        });
        // a reload starts both profiles alike (paused at t = 0 by «reducir movimiento»), and proves the file was stored
        await check('proyectos', `${id}: tras recargar sigue en este navegador y dibuja lo mismo que el original`, async () => {
          await B.p.waitForTimeout(1000);
          await B.p.reload();
          await B.p.locator('.stage canvas').first().waitFor();
          assert(await panelHas(B.p, name), 'tras recargar no aparece ' + name);
          assert(!(await B.p.getByRole('region', { name: 'Cargar fuente' }).count()), 'tras recargar pide el archivo');
          if (recipe.source === 'video') await holdVideo(B.p, 1.0);
          await B.p.waitForTimeout(1500);
          const pngB = await pngOf(B.p, join(dir, id, 'b'));
          const e = rmse(pngA, pngB), eb = rmse(pngA, pngB, { blur: 2 });
          assert(e < (recipe.source === 'image' ? 0.01 : 0.05), `imagen distinta: RMSE ${fmt(e)}, desenfocado ${fmt(eb)}`);
          return `${name} restaurado desde IndexedDB; PNG = PNG del perfil original (RMSE ${fmt(e)}${recipe.source === 'video' ? ', mismo instante del video' : ''})`;
        });
      } finally { await B.ctx.close(); }
      // the session carries the history (with this piece) and the collection
      if (id === 'foto') {
        await A.p.keyboard.press('s');
        await A.p.waitForTimeout(400);
        session.foto = A;
      }
    } catch (e) {
      record('proyectos', `${id}: flujo`, 'FAIL', e.message);
    } finally {
      if (!session[id]) await A.ctx.close();
    }
  }
  // 4. a session (history + collection + media) and a collection .zip, opened in a fresh profile
  const A = session.foto;
  if (!A) { record('proyectos', 'sesión y colección', 'SKIP', 'no hay pieza con medios'); return; }
  try {
    // the video pieces join the same history: each opens as a new piece in this profile, with its file
    for (const m of session.made.filter(x => x.id !== 'foto')) {
      const [, f, r] = cases.find(c => c[0] === m.id);
      await A.p.goto('about:blank');
      await A.p.goto(`${BASE}/studio/#r=${encode({ ...r, meta: { name: 'Sesión ' + m.id, space: 'media' } })}`);
      await A.p.locator('.stage canvas').first().waitFor();
      const ch = A.p.waitForEvent('filechooser');
      await A.p.getByRole('region', { name: 'Cargar fuente' }).getByRole('button', { name: 'Elegir video' }).click();
      await (await ch).setFiles(f);
      await A.p.getByRole('region', { name: 'Cargar fuente' }).waitFor({ state: 'detached', timeout: 60_000 });
      await A.p.waitForTimeout(1500);
    }
    await A.p.getByRole('button', { name: /Colección/ }).first().click();
    const sess = await freshDownload(A.p, join(dir, 'sesion'), () => A.p.getByRole('button', { name: 'Guardar sesión' }).first().click());
    const coll = await freshDownload(A.p, join(dir, 'coleccion'), () => A.p.getByRole('button', { name: /Guardar colección/ }).click());
    const count = await A.p.locator('.count-line').innerText();
    await check('proyectos', 'sesión .zip: lleva el historial, la colección y cada archivo original', () => {
      const idx = zipIndex(sess);
      const want = session.made.map(m => m.name);
      const found = want.filter(n => Object.keys(idx).some(k => k.startsWith('medios/') && k.endsWith(n)));
      const orig = session.made.map(m => sha(cases.find(c => c[0] === m.id)[1]));
      const exact = orig.filter(h => Object.values(idx).includes(h)).length;
      assert(found.length === want.length && exact === want.length, `archivos ${found.length}/${want.length}, idénticos ${exact}`);
      return `${Object.keys(idx).length} entradas; ${want.join(', ')} idénticos (SHA-256); ${count}`;
    });
    const C = await freshStudio();
    try {
      await C.p.getByRole('button', { name: /Colección/ }).first().click();
      const ch = C.p.waitForEvent('filechooser');
      await C.p.getByRole('button', { name: 'Abrir sesión' }).click();
      await (await ch).setFiles(sess);
      await toastText(C.p, /Sesión abierta/);
      await check('proyectos', 'sesión abierta en un perfil nuevo: historial, colección y archivos', async () => {
        const favs = await C.p.locator('.fav-card').count();
        const line = await C.p.locator('.count-line').innerText();
        await C.p.keyboard.press('Escape');
        const thumbs = C.p.locator('.thumb');
        const n = await thumbs.count();
        const seen = new Set();
        for (let i = 0; i < n; i++) {
          await thumbs.nth(i).click();
          await C.p.waitForTimeout(1500);
          await C.p.getByRole('tab', { name: 'Fuente' }).click().catch(() => undefined);
          await C.p.waitForTimeout(300);
          for (const m of session.made) if (await C.p.locator('.panel').getByText(m.name).first().isVisible().catch(() => false)) seen.add(m.name);
        }
        assert(favs >= 1, 'la colección llegó vacía');
        assert(seen.size === session.made.length, `archivos vistos ${[...seen].join(', ') || 'ninguno'} de ${session.made.map(m => m.name).join(', ')}`);
        return `${line}; colección ${favs}; ${[...seen].join(', ')} vuelven con su pieza`;
      });
    } finally { await C.ctx.close(); }
    const D = await freshStudio();
    try {
      await D.p.getByRole('button', { name: /Colección/ }).first().click();
      const ch = D.p.waitForEvent('filechooser');
      await D.p.getByRole('button', { name: 'Importar receta, colección o proyecto' }).click();
      await (await ch).setFiles(coll);
      await toastText(D.p, /Colección abierta|pieza/);
      await check('proyectos', 'colección .zip abierta en un perfil nuevo, con su imagen', async () => {
        const cards = D.p.locator('.fav-card');
        const n = await cards.count();
        assert(n >= 1, 'sin piezas');
        await cards.first().locator('.ops').getByRole('button', { name: 'Abrir', exact: true }).click();
        const name = session.made.find(m => m.id === 'foto').name;
        assert(await panelHas(D.p, name), 'la pieza de la colección no trae ' + name);
        assert(!(await D.p.getByRole('region', { name: 'Cargar fuente' }).count()), 'pide el archivo');
        return `${n} pieza(s) en la colección; ${name} vuelve con ella`;
      });
    } finally { await D.ctx.close(); }
  } catch (e) {
    record('proyectos', 'sesión y colección', 'FAIL', e.message);
  } finally {
    for (const k of ['foto', 'mp4', 'webm']) await session[k]?.ctx.close().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* 5c. Camera: a fake device for the working path; denied, missing, busy */
/* ------------------------------------------------------------------ */

const FAKE_DEV = '--use-fake-device-for-media-stream', FAKE_UI = '--use-fake-ui-for-media-stream';
/** How to make the browser answer each case for real (Chromium/Chrome flags, Firefox preferences). */
function cameraLaunch(kind) {
  if (CHROMIUMS.has(BROWSER)) {
    return { ok: { args: [FAKE_DEV, FAKE_UI] }, denied: { args: [FAKE_DEV, FAKE_UI + '=deny'] }, none: { args: [FAKE_UI] } }[kind];
  }
  if (BROWSER === 'firefox') {
    return {
      ok: { prefs: { 'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true } },
      denied: { prefs: { 'media.navigator.streams.fake': true, 'permissions.default.camera': 2 } },
      none: { prefs: { 'media.navigator.permission.disabled': true } },
    }[kind];
  }
  return null;
}
/** A camera another program holds cannot be faked by the browser: this answers like one (NotReadableError). */
const BUSY_CAMERA = `(() => {
  const md = navigator.mediaDevices;
  if (md) md.getUserMedia = () => Promise.reject(new DOMException('Could not start video source', 'NotReadableError'));
})();`;

async function cameraFlows() {
  const recipe = {
    v: 2, source: 'camera', glyph: { cell: 10, charset: DETALLADO, font: 'jetbrains' },
    color: { mode: 'source', vivid: 0.8, stops: ['#000000', '#ffffff'], bg: '#050505' }, interact: { mode: 'none' },
    meta: { name: 'Verificación cámara', space: 'media' },
  };
  const cases = [
    ['ok', 'con permiso y una cámara (dispositivo simulado del navegador)', null],
    ['denied', 'permiso denegado', /permiso de la cámara está denegado/],
    ['none', 'sin ninguna cámara', /No hay ninguna cámara/],
    ['busy', 'cámara ocupada por otra aplicación (respuesta simulada: NotReadableError)', /ocupada/],
  ];
  for (const [kind, what, expect] of cases) {
    const opts = cameraLaunch(kind === 'busy' ? 'ok' : kind);
    if (!opts) { record('camara', `cámara: ${what}`, 'SKIP', `${BROWSER} no tiene cámara simulada en Playwright`); continue; }
    let b;
    try { b = await launch(BROWSER, opts); } catch (e) { record('camara', `cámara: ${what}`, 'SKIP', 'no arranca: ' + e.message.split('\n')[0]); continue; }
    const ctx = await b.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1, acceptDownloads: true });
    if (kind === 'busy') await ctx.addInitScript(BUSY_CAMERA);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    try {
      await p.goto(`${BASE}/studio/#r=${encode(recipe)}`);
      await p.locator('.stage canvas').first().waitFor();
      if (await p.locator('dialog.welcome[open]').count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
      const card = p.getByRole('region', { name: 'Cargar fuente' });
      await card.getByRole('button', { name: 'Activar cámara' }).click();
      if (kind !== 'ok') {
        await check('camara', `cámara: ${what} → el estudio lo explica`, async () => {
          const warn = card.locator('.warn');
          await warn.waitFor({ timeout: 15_000 });
          const t = (await warn.innerText()).trim();
          assert(expect.test(t), '«' + t + '»');
          assert(await card.getByRole('button', { name: 'Activar cámara' }).isVisible(), 'sin botón para volver a intentarlo');
          assert(!errors.length, errors.slice(0, 2).join(' | '));
          return `«${t}»`;
        });
        continue;
      }
      await check('camara', `cámara: ${what} → se ve en el lienzo y se mueve`, async () => {
        await card.waitFor({ state: 'detached', timeout: 20_000 });
        await p.waitForTimeout(1500);
        const cv = p.locator('.stage canvas').first();
        const a = join(OUT, 'camara', 'lienzo-a.png'), c = join(OUT, 'camara', 'lienzo-b.png');
        mkdirSync(join(OUT, 'camara'), { recursive: true });
        await cv.screenshot({ path: a });
        await p.waitForTimeout(1200);
        await cv.screenshot({ path: c });
        const sd = spread(a), moved = rmse(a, c);
        const label = await p.evaluate(() => [...document.querySelectorAll('body > video')].map(v => v.srcObject?.getVideoTracks?.()[0]?.label).find(Boolean) ?? '');
        assert(sd > 0.02, 'lienzo plano: desviación ' + fmt(sd));
        assert(moved > 0.002, 'la imagen no cambia (RMSE entre capturas ' + fmt(moved) + ')');
        assert(!errors.length, errors.slice(0, 2).join(' | '));
        return `«${label}»; desviación ${fmt(sd)}; cambia entre capturas (RMSE ${fmt(moved)})`;
      });
      // the camera only exists live: the sheet says so and offers the live recording
      await p.keyboard.press('e');
      await p.getByRole('tab', { name: 'Video y GIF' }).click();
      await p.waitForTimeout(400);
      const why = (await p.locator('.sheet-body .ex-na').allTextContents()).join(' ').replace(/\s+/g, ' ');
      await check('camara', 'cámara: la hoja explica que no hay render fotograma a fotograma', () => {
        assert(/no con la cámara/.test(why), 'sin explicación: ' + why.slice(0, 200));
        return why.slice(0, 160);
      });
      const startBtn = p.getByRole('button', { name: 'Empezar a grabar' });
      if (!(await startBtn.count())) {
        await check('camara', 'cámara: grabación en directo', () => {
          assert(/Grabación en directo: no disponible/.test(why), 'ni botón ni explicación');
          skip(`${ENGINE} no graba el lienzo (la hoja lo dice)`);
        });
        continue;
      }
      await startBtn.click();
      const t0 = Date.now();
      await p.waitForTimeout(3000);
      const ev = p.waitForEvent('download', { timeout: 60_000 });
      await p.getByRole('button', { name: /Detener y guardar/ }).click();
      const d = await ev;
      const f = join(OUT, 'camara', d.suggestedFilename());
      await d.saveAs(f);
      const secs = Math.round((Date.now() - t0) / 100) / 10;
      await check('camara', 'cámara: la grabación en directo es un video que se abre', () => {
        const j = ffprobe(f), st = j.streams[0];
        const dec = run('ffmpeg', ['-v', 'error', '-i', f, '-f', 'null', '-']);
        assert(dec.status === 0, dec.stderr.slice(0, 200));
        // what the stage drew while recording: with WebGL by software and a busy processor, very few frames
        const frames = Number(st.nb_read_frames);
        assert(frames >= 1, `${frames} fotogramas`);
        assert(extname(f) !== '.mp4' || st.codec_name === 'h264', `.mp4 con ${st.codec_name}`);
        return `${basename(f)}: ${j.format.format_name}, ${st.codec_name} ${st.width}×${st.height}, ${frames} fotogramas en ${secs} s (≈ ${(frames / secs).toFixed(1)} fps: lo que el lienzo dibujó), ${recordingShape(f, j)}, decodifica sin errores`;
      });
      const url = publish(f);
      await inEngines('camara', `cámara: la grabación (${extname(f).slice(1)}) se reproduce en <video>`, async (bb, n) => {
        const r = await playIn(bb, url, { type: VIDEO_TYPES[extname(f).slice(1)] });
        if (r.ev !== 'ok') {
          if (!r.can && ((extname(f) === '.mp4' && n === 'chromium') || (extname(f) === '.webm' && n === 'webkit'))) skip(`${n} no reproduce este formato: canPlayType «${r.can}»`);
          throw new Error(`no carga: ${r.ev}`);
        }
        assert(r.err === 0 && r.w > 0, `error ${r.err}, ${r.w}×${r.h}`);
        return `${r.w}×${r.h}, ${Number.isFinite(r.dur) ? fmt(r.dur) + ' s' : r.dur}, avanza ${fmt(r.t0)} → ${fmt(r.t1)} s`;
      });
    } catch (e) {
      record('camara', `cámara: ${what}`, 'FAIL', e.message);
    } finally {
      await ctx.close();
      await b.close();
    }
  }
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
  await pickNumber(page, 'Fotogramas por segundo', '12');
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
  const gap = engineGap(BROWSER);
  if (gap) { console.error(gap); process.exit(2); }
  browser = await launch(BROWSER);
  browser.__channel = BROWSER === 'chrome';
  ENGINE = label(browser);
  others.set(BROWSER, Promise.resolve({ b: browser, label: ENGINE }));
  console.log(`  navegador principal: ${ENGINE}\n`);
  const site = await startSite();
  try {
    const image = await syntheticImage();
    writeFileSync(SYNTH, image);

    const runPiece = async (key, o) => {
      if (ONLY_PIECES.length && !ONLY_PIECES.includes(key)) return;
      try { await studioPiece(key, o); } catch (e) { record('estudio', `${key}: flujo del estudio`, 'FAIL', e.message); }
    };
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
    if (want('video') || want('imagen')) await playbackChecks('patron').catch(e => record('reproduccion', 'patron', 'FAIL', e.message));
    if (want('codigo')) for (const k of Object.keys(codeOut)) await codeChecks(k).catch(e => record('codigo', k, 'FAIL', e.message));
    let compReact = [];
    if (want('componentes')) compReact = await componentsFlow().catch(e => { record('componentes', 'flujo', 'FAIL', e.message); return []; });
    if (want('react') || want('codigo')) await reactProject(compReact).catch(e => record('react', 'proyecto', 'FAIL', e.message));
    if (want('terminal') || want('texto')) for (const k of ['terminal', 'anchos']) await terminalChecks(k).catch(e => record('terminal', k, 'FAIL', e.message));
    if (want('proyectos')) await projectFlows().catch(e => record('proyectos', 'flujo', 'FAIL', e.message));
    if (want('camara')) await cameraFlows().catch(e => record('camara', 'flujo', 'FAIL', e.message));
  } finally {
    for (const e of others.values()) await (await e).b?.close().catch(() => undefined);
    await no3d?.close();
    site.close();
  }
  if (want('codigo')) record('codigo', 'Google Fonts desde el código exportado', fontIssues.size ? 'SKIP' : 'PASS',
    fontIssues.size ? 'no accesible desde este navegador (' + [...fontIssues][0] + '); define VERIFY_CA si hay un proxy con su propia CA' : 'se carga (o no hizo falta)');
  const pad = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  console.log('\n' + pad('Grupo', 12) + ' ' + pad('Motor', 22) + ' ' + pad('Resultado', 6) + ' ' + pad('Comprobación', 72) + ' Detalle');
  console.log('-'.repeat(180));
  for (const r of results) console.log(`${pad(r.group, 12)} ${pad(r.engine, 22)} ${pad(r.status, 6)} ${pad(r.name, 72)} ${r.detail.slice(0, 140)}`);
  // per group and engine: what an automated check in that engine said (not a claim about real devices)
  const cells = new Map();
  for (const r of results) {
    const k = `${r.group}\u0000${r.engine}`;
    const c = cells.get(k) ?? { group: r.group, engine: r.engine, PASS: 0, FAIL: 0, SKIP: 0 };
    c[r.status]++;
    cells.set(k, c);
  }
  console.log('\n' + pad('Grupo', 12) + ' ' + pad('Motor', 26) + ' PASS  FAIL  SKIP');
  for (const c of [...cells.values()].sort((a, b) => a.group.localeCompare(b.group) || a.engine.localeCompare(b.engine))) {
    console.log(`${pad(c.group, 12)} ${pad(c.engine, 26)} ${String(c.PASS).padStart(4)}  ${String(c.FAIL).padStart(4)}  ${String(c.SKIP).padStart(4)}`);
  }
  const n = s => results.filter(r => r.status === s).length;
  console.log(`\nPASS ${n('PASS')} · FAIL ${n('FAIL')} · SKIP ${n('SKIP')} · navegador principal ${ENGINE} · artefactos en ${OUT}`);
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ browser: ENGINE, only: ONLY, cells: [...cells.values()] }, null, 2));
  process.exit(n('FAIL') ? 1 : 0);
}

await main();
