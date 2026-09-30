/**
 * Renders the guide posters, share images and the terminal text frame from the real engine.
 * Driven by scripts/posters.mjs (Playwright); open /dev/posters.html?ver in the dev server to look at them.
 */
import '../src/shared/fonts.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/vt323/latin-400.css';
import { AsciiEngine } from '../src/engine/engine';
import { createFontLoader } from '../src/engine/fonts';
import { PATTERN_GLSL } from '../src/engine/glsl/patterns';
import { gridToText } from '../src/exporters/text';
import { EXAMPLES, gridSize } from '../src/pages/examples';
import { lockup } from '../src/shared/brand';
import { paintLandscape, syntheticPhoto } from '../src/shared/sample';
import { GUIDES, SITE_URL, guideById, type Guide } from '../src/shared/site';

type Id = Guide['id'];
const fonts = createFontLoader({ google: false });

async function render(id: Id, width: number, height: number, pixelRatio: number) {
  const ex = EXAMPLES[id];
  const e = new AsciiEngine(document.createElement('canvas'), ex.recipe(), {
    library: PATTERN_GLSL, fonts, fixedSize: { width, height, pixelRatio }, autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true,
  });
  if (ex.media === 'photo') e.setMedia('image', syntheticPhoto());
  if (ex.media === 'scene') {
    // same frame the live demo starts from (src/pages/demo.ts)
    const c = document.createElement('canvas');
    c.width = 480; c.height = 300;
    const x = c.getContext('2d')!;
    x.scale(0.5, 0.5);
    paintLandscape(x, ex.t);
    e.setMedia('video', c);
  }
  await e.ready();
  e.renderAt(ex.t);
  return e;
}

function image(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

function wrap(x: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    const next = line ? line + ' ' + w : w;
    if (x.measureText(next).width > max && line) { lines.push(line); line = w; } else line = next;
  }
  lines.push(line);
  return lines;
}

/** 1200×630 share image: the brand, the guide name and its URL on the left; the real render on the right. */
async function og(id: Id): Promise<string> {
  const g = guideById(id);
  await Promise.all([
    document.fonts.load('800 58px "Martian Mono Variable"', g.name),
    document.fonts.load('500 26px "Inter Tight Variable"', g.blurb),
  ]);
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 630;
  const x = c.getContext('2d')!;
  x.fillStyle = '#0c0b0a';
  x.fillRect(0, 0, 1200, 630);
  // the word needs more cells to stay legible; the rest read better with big glyphs
  const e = id === 'texto' ? await render(id, 640, 630, 1) : await render(id, 320, 315, 2);
  x.drawImage(e.canvas, 560, 0, 640, 630);
  e.destroy();
  const scrim = x.createLinearGradient(560, 0, 780, 0);
  scrim.addColorStop(0, 'rgba(12,11,10,1)'); scrim.addColorStop(1, 'rgba(12,11,10,0)');
  x.fillStyle = scrim; x.fillRect(560, 0, 220, 630);
  // the GLYPHOS lockup, as in the official artwork (cream on black)
  const brand = await image('data:image/svg+xml,' + encodeURIComponent(lockup(40, { dot: '#efe9df', ink: '#efe9df' })));
  x.drawImage(brand, 64, 58, brand.width, brand.height);
  x.fillStyle = '#ede6da';
  x.textBaseline = 'alphabetic';
  x.font = '800 58px "Martian Mono Variable"';
  x.letterSpacing = '-3px';
  const title = wrap(x, g.name, 480);
  const top = 630 / 2 - (title.length * 62) / 2 + 30;
  title.forEach((l, i) => x.fillText(l, 64, top + i * 62));
  x.font = '500 26px "Inter Tight Variable"';
  x.letterSpacing = '0px';
  x.fillStyle = 'rgba(237,230,218,.86)';
  wrap(x, g.blurb, 480).forEach((l, i) => x.fillText(l, 64, top + title.length * 62 + 16 + i * 36));
  x.font = '500 20px "JetBrains Mono"';
  x.fillStyle = '#ff5b1f';
  x.fillText(SITE_URL.replace('https://', '') + g.path.replace(/\/$/, ''), 64, 566);
  return c.toDataURL('image/jpeg', 0.86);
}

/** The exact text the studio's TXT export gives for the terminal example (captureGrid + gridToText). */
async function grid(id: Id, t?: number): Promise<string> {
  const ex = EXAMPLES[id];
  if (!ex.grid) throw new Error(id + ' no es un ejemplo de texto');
  const r = ex.recipe();
  const { width, height } = gridSize(r, ex.grid.cols, ex.grid.rows);
  const e = new AsciiEngine(document.createElement('canvas'), r, {
    library: PATTERN_GLSL, fonts, fixedSize: { width, height, pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true,
  });
  await e.ready();
  e.renderAt(t ?? ex.t);
  const g = e.readGrid();
  e.destroy();
  if (g.cols !== ex.grid.cols || g.rows !== ex.grid.rows) throw new Error(`rejilla ${g.cols}×${g.rows}, se esperaba ${ex.grid.cols}×${ex.grid.rows}`);
  return gridToText(g);
}

async function poster(id: Id, pixelRatio: number, type = 'image/webp', quality = 0.82): Promise<string> {
  const e = await render(id, 640, 400, pixelRatio);
  const url = e.canvas.toDataURL(type, quality);
  e.destroy();
  return url;
}

/**
 * 1200×630 share image of the site (public/og.jpg, also the viewer's): the GLYPHOS lockup and the promise over
 * a real render. No address in the picture: the apps that show it print the link beside it.
 */
async function siteOg(): Promise<string> {
  const line = 'Haz arte ASCII';
  await document.fonts.load('800 64px "Martian Mono Variable"', line);
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 630;
  const x = c.getContext('2d')!;
  x.fillStyle = '#0c0b0a';
  x.fillRect(0, 0, 1200, 630);
  const e = await render('fondos', 400, 315, 2);
  x.globalAlpha = 0.9;
  x.drawImage(e.canvas, 400, 0, 800, 630);
  x.globalAlpha = 1;
  e.destroy();
  const scrim = x.createLinearGradient(400, 0, 820, 0);
  scrim.addColorStop(0, 'rgba(12,11,10,1)'); scrim.addColorStop(1, 'rgba(12,11,10,0)');
  x.fillStyle = scrim; x.fillRect(400, 0, 420, 630);
  const brand = await image('data:image/svg+xml,' + encodeURIComponent(lockup(92, { dot: '#efe9df', ink: '#efe9df' })));
  const top = 630 / 2 - (92 + 34 + 64) / 2;
  x.drawImage(brand, 64, top, brand.width, brand.height);
  x.fillStyle = '#ede6da';
  x.textBaseline = 'alphabetic';
  x.font = '800 64px "Martian Mono Variable"';
  x.letterSpacing = '-3px';
  x.fillText(line, 64, top + 92 + 34 + 52);
  x.letterSpacing = '0px';
  return c.toDataURL('image/jpeg', 0.86);
}

const api = { guides: GUIDES.map(g => ({ id: g.id, poster: g.poster })), poster, og, siteOg, grid };
(window as unknown as { mt: typeof api }).mt = api;

if (location.search.includes('ver')) {
  for (const g of GUIDES) {
    for (const src of [await poster(g.id, 2), await og(g.id)]) {
      const img = document.createElement('img');
      img.src = src;
      document.body.appendChild(img);
    }
  }
}
