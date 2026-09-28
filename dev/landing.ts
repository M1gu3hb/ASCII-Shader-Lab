/**
 * Media of the landing, made with the real engine and the studio's own export functions (the ones the
 * «Exportar» sheet calls), driven by scripts/posters.mjs:
 *  - the «Azar» contact sheet: one real draw of the dice per style (src/landing/azar-data.ts);
 *  - the «Salidas» block: a PNG and an SVG, a looping WebM/MP4, the Web Component, a Node script for the
 *    terminal and the recipe file of one piece.
 * Open /dev/landing.html?ver in the dev server to look at candidate seeds.
 */
import '../src/shared/fonts.css';
import '../src/landing/fonts';
import { AsciiEngine } from '../src/engine/engine';
import { createFontLoader } from '../src/engine/fonts';
import { PATTERN_GLSL } from '../src/engine/glsl/patterns';
import type { Recipe } from '../src/engine/recipe';
import { DEFAULT_CODE, runtimeSize, webComponent } from '../src/exporters/code';
import { gridToSvg } from '../src/exporters/svg';
import { toNodePlayer } from '../src/exporters/text';
import { archById } from '../src/random';
import { CONTACTS, CONTACT_CSS, CONTACT_PX, woven } from '../src/landing/azar-data';
import { SALIDA } from '../src/landing/salidas-data';
import { encodeRecipe, recipeFile } from '../src/shared/share';
import { captureFrames, captureGrid, exportImage, exportVideo, loopSeconds } from '../src/studio/exporting';
import { codecsAt } from '../src/studio/caps';

const fonts = createFontLoader({ google: false });

async function render(r: Recipe, t: number, css = CONTACT_CSS, px = CONTACT_PX): Promise<AsciiEngine> {
  const e = new AsciiEngine(document.createElement('canvas'), r, {
    library: PATTERN_GLSL, fonts, fixedSize: { width: css.width, height: css.height, pixelRatio: px.width / css.width },
    autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true,
  });
  await e.ready();
  e.renderAt(t);
  return e;
}

const T = 3;

async function still(r: Recipe, type = 'image/webp', q = 0.8): Promise<string> {
  const e = await render(r, T);
  const url = e.canvas.toDataURL(type, q);
  e.destroy();
  return url;
}

/** Small renders of several seeds for one style, to choose from. */
async function candidates(arch: string, seeds: string[]): Promise<Array<{ seed: string; url: string; name: string }>> {
  const out = [];
  for (const seed of seeds) {
    const r = woven({ seed, arch });
    out.push({ seed, url: await still(r, 'image/webp', 0.7), name: archById(r.meta.arch)?.name ?? arch });
  }
  return out;
}

async function contact(seed: string, arch: string): Promise<string> {
  return still(woven({ seed, arch }), 'image/webp', 0.8);
}

const b64 = async (b: Blob) => {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
};
const blobUrl = (b: Blob) => new Promise<string>(res => { const f = new FileReader(); f.onload = () => res(f.result as string); f.readAsDataURL(b); });

/** A lighter copy of an exported image for display on the page (the real file is linked next to it). */
async function displayCopy(png: Blob, width: number): Promise<string> {
  const img = new Image();
  img.src = await blobUrl(png);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = width; c.height = Math.round(width * img.naturalHeight / img.naturalWidth);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', 0.86);
}

const noop = () => undefined;

async function salidas() {
  const r = SALIDA.recipe();
  const size = SALIDA.size;
  const spec = { kind: 'fixed' as const, w: size.w, h: size.h };
  const out: Record<string, unknown> = { name: r.meta.name, loopSeconds: loopSeconds(r) };

  const png = await exportImage(r, spec, { transparent: false, format: 'png' });
  out.png = await b64(png);
  out.pngDisplay = await displayCopy(png, size.w);

  const g = await captureGrid(r);
  const svg = await gridToSvg(g, r, { mode: 'outline' });
  out.svg = svg.svg;
  out.svgNotes = svg.notes;
  out.svgSize = { w: g.width, h: g.height };

  const secs = loopSeconds(r);
  const can = await codecsAt(size.w, size.h);
  out.codecs = can;
  const webm = await exportVideo(r, spec, { fps: SALIDA.fps, seconds: secs, format: 'webm', start: 0 }, noop, { cancelled: false });
  out.webm = await b64(webm);
  if (can.avc) {
    const mp4 = await exportVideo(r, spec, { fps: SALIDA.fps, seconds: secs, format: 'mp4', start: 0 }, noop, { cancelled: false });
    out.mp4 = await b64(mp4);
  }

  const term = SALIDA.terminal();
  const frames = await captureFrames(term, 80, 24, { fps: SALIDA.termFps, seconds: loopSeconds(term), start: 0, depth: SALIDA.termDepth, withBg: false }, noop, { cancelled: false });
  out.node = await toNodePlayer(frames, r.meta.name ?? 'GLYPHOS');
  out.frames = frames.frames.length;
  // the first frame as plain text: what the page shows before (or without) its script
  out.firstFrame = frames.frames[0].replace(/\x1b\[[\d;]*m/g, '').split('\n').map(l => l.replace(/\s+$/, '')).join('\n') + '\n';

  // «Sin dependencias externas» (the site's CSP allows no font host) and the page's poster for browsers without WebGL 2
  const wc = webComponent(r, { ...DEFAULT_CODE, placement: 'hero', systemFont: true, poster: '/ex/salidas/glyphos-saturno.webp' });
  out.wcFile = wc.file;
  out.wcUsage = wc.usage;
  out.wcNotes = wc.notes;
  out.runtime = runtimeSize();

  out.recipe = recipeFile(r);
  out.link = '/studio/#r=' + await encodeRecipe({ ...r, meta: { ...r.meta, space: 'arte' } });
  return out;
}

const api = { candidates, contact, salidas, contacts: CONTACTS };
(window as unknown as { mt: typeof api }).mt = api;

if (location.search.includes('ver')) {
  const words = ['faro', 'marea', 'glifo', 'telar', 'eco', 'coral', 'senal', 'rombo', 'tubo', 'bloque', 'sol', 'vibra', 'rosa', 'tinta', 'nube', 'duna'];
  for (const c of CONTACTS) {
    const seeds = [c.seed, ...words.slice(0, 7).map((w, i) => `${w}-${c.arch}-${100 + i * 37}`)];
    for (const x of await candidates(c.arch, seeds)) {
      const f = document.createElement('figure');
      f.innerHTML = `<img src="${x.url}" width="240" height="150"><figcaption>${x.name} · ${x.seed}</figcaption>`;
      document.body.appendChild(f);
    }
    document.body.appendChild(document.createElement('hr'));
  }
}
