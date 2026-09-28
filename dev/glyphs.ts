/**
 * QA page of the real-character layers (src/glyphs): a picture, a strip of controls built from GLYPH_PARAMS,
 * the canvas render next to the copyable text, and every alphabet rendered on the same picture.
 * Open /dev/glyphs.html in the dev server. window.qa drives it from Playwright (state, renders, timings).
 */
import '../src/shared/fonts.css';
import '@fontsource/jetbrains-mono/latin-300.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/instrument-serif/latin-400.css';
import type { GlyphStyle } from '../src/project/types';
import {
  CHARSET_LIST, GLYPH_PARAMS, copyGridText, defaultGlyphStyle, drawGlyphs, ensureGlyphFont, glyphGrid, gridText, gridToSvgText,
  gridDims, gridFromFine, resolveRamp, sampleFine, sampleOf, toGridSnapshot, type GlyphGrid,
} from '../src/glyphs';
import { drawGrid } from '../src/glyphs/draw';
import { gridToAnsi } from '../src/exporters/text';
import { syntheticPhoto } from '../src/shared/sample';

type Src = HTMLCanvasElement;

/* ------------------------------------------------------------------ sample pictures */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

/** A cut-out still life (transparent background): a pear behind an apple, a stem and a leaf, soft edges. */
function paintFruit(): Src {
  const [c, x] = canvas(800, 1000);
  x.filter = 'blur(1.2px)';
  // pear
  x.save();
  x.translate(300, 470);
  x.rotate(-0.25);
  const pear = new Path2D();
  pear.ellipse(0, 90, 150, 170, 0, 0, Math.PI * 2);
  pear.ellipse(0, -90, 90, 120, 0, 0, Math.PI * 2);
  const pg = x.createRadialGradient(-60, -40, 20, 0, 40, 260);
  pg.addColorStop(0, '#f6f0a0'); pg.addColorStop(0.45, '#c9c040'); pg.addColorStop(0.8, '#7d7a1c'); pg.addColorStop(1, '#3c3a0c');
  x.fillStyle = pg;
  x.fill(pear, 'nonzero');
  x.strokeStyle = '#4a3016'; x.lineWidth = 12; x.lineCap = 'round';
  x.beginPath(); x.moveTo(0, -200); x.quadraticCurveTo(10, -250, 40, -280); x.stroke();
  x.restore();
  // apple
  const ag = x.createRadialGradient(390, 560, 20, 460, 650, 300);
  ag.addColorStop(0, '#ffe2c8'); ag.addColorStop(0.18, '#f0643c'); ag.addColorStop(0.55, '#b8261a'); ag.addColorStop(0.85, '#5a0e0a'); ag.addColorStop(1, '#2a0504');
  x.fillStyle = ag;
  x.beginPath();
  x.moveTo(470, 450);
  x.bezierCurveTo(560, 380, 720, 440, 720, 620);
  x.bezierCurveTo(720, 800, 590, 900, 480, 880);
  x.bezierCurveTo(380, 900, 240, 800, 240, 640);
  x.bezierCurveTo(240, 450, 390, 390, 470, 450);
  x.fill();
  // stem and leaf
  x.strokeStyle = '#3b2412'; x.lineWidth = 14; x.lineCap = 'round';
  x.beginPath(); x.moveTo(470, 470); x.quadraticCurveTo(455, 400, 490, 340); x.stroke();
  const lg = x.createLinearGradient(500, 330, 660, 400);
  lg.addColorStop(0, '#2f6b1f'); lg.addColorStop(1, '#8fc24a');
  x.fillStyle = lg;
  x.beginPath(); x.moveTo(495, 350); x.quadraticCurveTo(570, 270, 680, 330); x.quadraticCurveTo(600, 420, 495, 350); x.fill();
  x.strokeStyle = '#1f4a14'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(500, 350); x.quadraticCurveTo(590, 330, 670, 332); x.stroke();
  // shadow side of the apple as a subtle rim
  x.filter = 'none';
  return c;
}

/** Test card: grey ramp, hue sweep, circles, lines at several angles and big letters. */
function paintCard(): Src {
  const [c, x] = canvas(1080, 1350);
  x.fillStyle = '#000'; x.fillRect(0, 0, 1080, 1350);
  const g = x.createLinearGradient(40, 0, 1040, 0);
  g.addColorStop(0, '#000'); g.addColorStop(1, '#fff');
  x.fillStyle = g; x.fillRect(40, 40, 1000, 160);
  for (let i = 0; i < 10; i++) { x.fillStyle = `hsl(0 0% ${i * 11}%)`; x.fillRect(40 + i * 100, 210, 100, 60); }
  const h = x.createLinearGradient(40, 0, 1040, 0);
  for (let i = 0; i <= 6; i++) h.addColorStop(i / 6, `hsl(${i * 60} 90% 55%)`);
  x.fillStyle = h; x.fillRect(40, 290, 1000, 110);
  const r = x.createRadialGradient(270, 640, 10, 300, 660, 200);
  r.addColorStop(0, '#fff'); r.addColorStop(0.7, '#777'); r.addColorStop(1, '#111');
  x.fillStyle = r; x.beginPath(); x.arc(300, 660, 200, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = 10;
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI;
    x.beginPath(); x.moveTo(780 - Math.cos(t) * 190, 660 - Math.sin(t) * 190); x.lineTo(780 + Math.cos(t) * 190, 660 + Math.sin(t) * 190); x.stroke();
  }
  x.fillStyle = '#fff';
  x.font = '800 230px "JetBrains Mono", monospace';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('GLYPH', 540, 1010);
  // fine stripes (aliasing check): 1 px lines must read as mid grey, not moiré
  for (let y = 1160; y < 1310; y += 2) { x.fillStyle = '#fff'; x.fillRect(40, y, 1000, 1); }
  return c;
}

const SOURCES: Record<string, { name: string; make: () => Src }> = {
  fruta: { name: 'Recorte (fruta)', make: paintFruit },
  paisaje: { name: 'Foto (paisaje)', make: syntheticPhoto },
  carta: { name: 'Carta de prueba', make: paintCard },
};
const pics = new Map<string, Src>();
const pic = (id: string) => { let p = pics.get(id); if (!p) { p = SOURCES[id].make(); pics.set(id, p); } return p; };

/* ------------------------------------------------------------------ state + controls */

let srcId = 'fruta';
let style: GlyphStyle = { ...defaultGlyphStyle(), cell: 9, color: 'source' };
let wrap: 'char' | 'word' = 'char';
const OUT_W = 1080;

const controls = document.getElementById('controls')!;
function addControl(label: string, el: HTMLElement, row = false) {
  const l = document.createElement('label');
  if (row) { l.className = 'row'; l.append(el, label); } else l.append(label, el);
  controls.append(l);
  return l;
}

const srcSel = document.createElement('select');
for (const [id, s] of Object.entries(SOURCES)) srcSel.add(new Option(s.name, id));
srcSel.value = srcId;
srcSel.onchange = () => { srcId = srcSel.value; render(); };
addControl('Imagen', srcSel);

const shown: Array<{ el: HTMLElement; show?: (s: GlyphStyle) => boolean }> = [];
for (const p of GLYPH_PARAMS) {
  let el: HTMLElement;
  const set = (v: unknown) => { style = { ...style, [p.key]: v }; sync(); render(); };
  if (p.type === 'select') {
    const s = document.createElement('select');
    for (const [v, n] of p.options) s.add(new Option(n, v));
    s.value = String(style[p.key]);
    s.onchange = () => set(s.value);
    el = s;
  } else if (p.type === 'range') {
    const wrapEl = document.createElement('span');
    const r = document.createElement('input');
    r.type = 'range'; r.min = String(p.min); r.max = String(p.max); r.step = String(p.step); r.value = String(style[p.key]);
    const o = document.createElement('output'); o.textContent = r.value;
    r.oninput = () => { o.textContent = r.value; set(Number(r.value)); };
    wrapEl.append(r, ' ', o);
    el = wrapEl;
  } else if (p.type === 'toggle') {
    const c = document.createElement('input');
    c.type = 'checkbox'; c.checked = !!style[p.key];
    c.onchange = () => set(c.checked);
    el = c;
  } else if (p.type === 'color') {
    const c = document.createElement('input');
    c.type = 'color'; c.value = String(style[p.key]);
    c.oninput = () => set(c.value);
    el = c;
  } else if (p.type === 'paper') {
    const s = document.createElement('select');
    s.add(new Option('Tinta', '#0c0b0a')); s.add(new Option('Hueso', '#efe9df')); s.add(new Option('Transparente', ''));
    s.value = style.paper ?? '';
    s.onchange = () => set(s.value || null);
    el = s;
  } else if (p.type === 'text') {
    const t = document.createElement('textarea');
    t.value = String(style[p.key] ?? '');
    t.oninput = () => set(t.value);
    el = t;
  } else {
    const t = document.createElement('input');
    t.value = style.palette.join(',');
    t.onchange = () => set(t.value.split(',').map(v => v.trim()).filter(Boolean));
    el = t;
  }
  el.dataset.key = p.key;
  const l = addControl(p.label, el, p.type === 'toggle');
  l.title = p.help;
  shown.push({ el: l, show: p.show });
}
const wrapSel = document.createElement('select');
wrapSel.add(new Option('Corta en cualquier letra', 'char')); wrapSel.add(new Option('Sólo entre palabras', 'word'));
wrapSel.onchange = () => { wrap = wrapSel.value as 'char' | 'word'; render(); };
const wrapLabel = addControl('Ajuste de palabras', wrapSel);

function sync() {
  for (const s of shown) s.el.style.display = !s.show || s.show(style) ? '' : 'none';
  wrapLabel.style.display = style.fill === 'words' || style.charset === 'palabras' ? '' : 'none';
  for (const el of controls.querySelectorAll<HTMLElement>('[data-key]')) {
    const k = el.dataset.key as keyof GlyphStyle;
    if (el instanceof HTMLSelectElement) el.value = k === 'paper' ? style.paper ?? '' : String(style[k]);
    else if (el instanceof HTMLTextAreaElement) el.value = String(style[k] ?? '');
    else if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = !!style[k];
    else if (el instanceof HTMLInputElement && el.type === 'color') el.value = String(style[k]);
    else if (el.tagName === 'SPAN') {
      const r = el.querySelector('input')!; r.value = String(style[k]);
      el.querySelector('output')!.textContent = r.value;
    }
  }
}

/* ------------------------------------------------------------------ render */

const view = document.getElementById('view') as HTMLCanvasElement;
const pre = document.getElementById('text')!;
const stats = document.getElementById('stats')!;
const dims = document.getElementById('dims')!;
let last: GlyphGrid | null = null;
const full = (): GlyphStyle => Object.assign({ ...style }, wrap === 'word' ? { wrap } : {});

function outSize(src: Src, w = OUT_W) { return { w, h: Math.round((w * src.height) / src.width) }; }

let pending = 0;
async function render() {
  const token = ++pending;
  await ensureGlyphFont(style.font, style.weight, sampleOf(style));
  if (token !== pending) return;
  const src = pic(srcId);
  const out = outSize(src);
  const s = full();
  const t0 = performance.now();
  const grid = glyphGrid(src, s, out);
  const t1 = performance.now();
  view.width = out.w; view.height = out.h;
  const ctx = view.getContext('2d')!;
  ctx.clearRect(0, 0, out.w, out.h);
  drawGlyphs(ctx, grid, s);
  const t2 = performance.now();
  ctx.getImageData(0, 0, 1, 1);
  const t3 = performance.now();
  last = grid;
  const text = gridText(grid);
  pre.textContent = text;
  pre.style.fontSize = Math.max(3, (pre.parentElement!.clientWidth - 16) / (grid.cols * 0.6)).toFixed(2) + 'px';
  pre.style.lineHeight = String(Math.max(0.6, style.aspect * 0.6));
  dims.textContent = `${out.w}×${out.h} · ${grid.cols}×${grid.rows} celdas`;
  stats.textContent = `rejilla ${(t1 - t0).toFixed(1)} ms · dibujo ${(t2 - t1).toFixed(1)} ms (+${(t3 - t2).toFixed(1)} ms raster) · ${text.length} caracteres de texto`;
  renderAll(token);
}

const all = document.getElementById('all')!;
async function renderAll(token: number) {
  all.textContent = '';
  const src = pic(srcId);
  const out = outSize(src, 540);
  for (const cs of CHARSET_LIST) {
    if (token !== pending) return;
    const s: GlyphStyle = { ...full(), charset: cs.id, cell: style.cell / 2, fill: cs.user === 'words' ? 'words' : 'ramp' };
    if (cs.user === 'chars' && !s.chars) s.chars = ' .oO@';
    if (cs.user === 'words') s.chars = s.chars && style.fill === 'words' ? s.chars : 'GLYPHOS escribe con letras reales';
    await ensureGlyphFont(s.font, s.weight, sampleOf(s));
    const grid = glyphGrid(src, s, out);
    const [c, x] = canvas(out.w, out.h);
    drawGlyphs(x, grid, s);
    const f = document.createElement('figure');
    f.dataset.charset = cs.id;
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<b></b> — <span></span><code></code>`;
    cap.querySelector('b')!.textContent = cs.name;
    cap.querySelector('span')!.textContent = cs.blurb;
    cap.querySelector('code')!.textContent = cs.user === 'words' ? s.chars : cs.user === 'chars' ? s.chars : cs.chars;
    f.append(c, cap);
    all.append(f);
    await new Promise(r => setTimeout(r, 0));
  }
  all.dataset.done = String(token);
}

document.getElementById('copy')!.addEventListener('click', async () => {
  if (!last) return;
  const ok = await copyGridText(last);
  (document.getElementById('copy') as HTMLButtonElement).textContent = ok ? 'Copiado' : 'No se pudo copiar';
  setTimeout(() => { (document.getElementById('copy') as HTMLButtonElement).textContent = 'Copiar como texto'; }, 1500);
});

/* ------------------------------------------------------------------ hooks for Playwright */

function median(a: number[]) { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; }

const qa = {
  /** Resolves when the page and the alphabet grid have rendered. */
  async ready() {
    await document.fonts.ready;
    await render();
    for (let i = 0; i < 400 && all.dataset.done !== String(pending); i++) await new Promise(r => setTimeout(r, 50));
    return true;
  },
  async set(next: Partial<GlyphStyle> & { src?: string; wrap?: 'char' | 'word' }) {
    if (next.src) { srcId = next.src; srcSel.value = srcId; }
    if (next.wrap) { wrap = next.wrap; wrapSel.value = wrap; }
    const { src: _s, wrap: _w, ...rest } = next;
    void _s; void _w;
    style = { ...style, ...rest };
    sync();
    return qa.ready();
  },
  pic: (id: string) => pic(id),
  text: () => (last ? gridText(last) : ''),
  ansi: () => (last ? gridToAnsi(toGridSnapshot(last, style.paper ?? '#000000', style), 'truecolor') : ''),
  svg: () => (last ? gridToSvgText(last, full()) : ''),
  style: () => full(),
  /** One charset rendered at full size on a picture, as a PNG data URL. */
  async render(charset: string, extra: Partial<GlyphStyle> = {}, src = srcId, w = OUT_W) {
    const s: GlyphStyle = { ...full(), charset, ...extra };
    await ensureGlyphFont(s.font, s.weight, sampleOf(s));
    const p = pic(src);
    const out = outSize(p, w);
    const grid = glyphGrid(p, s, out);
    const [c, x] = canvas(out.w, out.h);
    drawGlyphs(x, grid, s);
    return { png: c.toDataURL('image/png'), text: gridText(grid), cols: grid.cols, rows: grid.rows };
  },
  /**
   * The fast path (spans: one fillText per run of cells) against one fillText per character, pixel by pixel,
   * for a charset/font on a picture: how many pixels differ by more than 8/255 in any channel.
   */
  async compareSpans(charset: string, extra: Partial<GlyphStyle> = {}, src = srcId, w = OUT_W) {
    const s: GlyphStyle = { ...full(), charset, ...extra };
    await ensureGlyphFont(s.font, s.weight, sampleOf(s));
    const p = pic(src);
    const out = outSize(p, w);
    const grid = glyphGrid(p, s, out);
    const draw = (spans: boolean) => {
      const [c, x] = canvas(out.w, out.h);
      drawGrid(x, grid, s, null, { spans }); // warm: fonts measured, span check done
      const ms: number[] = [];
      for (let k = 0; k < 5; k++) {
        x.clearRect(0, 0, out.w, out.h);
        const t0 = performance.now();
        drawGrid(x, grid, s, null, { spans });
        ms.push(performance.now() - t0);
      }
      return { d: x.getImageData(0, 0, out.w, out.h).data, ms: median(ms) };
    };
    const a = draw(true), b = draw(false);
    let diff = 0, ink = 0;
    for (let i = 0; i < a.d.length; i += 4) {
      if (b.d[i + 3] > 0) ink++;
      if (Math.abs(a.d[i] - b.d[i]) > 8 || Math.abs(a.d[i + 1] - b.d[i + 1]) > 8 || Math.abs(a.d[i + 2] - b.d[i + 2]) > 8 || Math.abs(a.d[i + 3] - b.d[i + 3]) > 8) diff++;
    }
    return { charset, font: s.font, diff, ink, spansMs: +a.ms.toFixed(1), perGlyphMs: +b.ms.toFixed(1) };
  },
  /** Several charsets side by side (2 columns, labelled) as one PNG data URL. */
  async sheet(ids: string[], extra: Partial<GlyphStyle> = {}, src = srcId, w = 720) {
    const p = pic(src);
    const out = outSize(p, w);
    const pad = 24, cols = 2;
    const [c, x] = canvas(cols * out.w + (cols + 1) * 8, Math.ceil(ids.length / cols) * (out.h + pad + 8) + 8);
    x.fillStyle = '#2a2723'; x.fillRect(0, 0, c.width, c.height);
    for (let k = 0; k < ids.length; k++) {
      const s: GlyphStyle = { ...full(), charset: ids[k], ...extra };
      const cs = CHARSET_LIST.find(e => e.id === ids[k]);
      if (cs?.user === 'chars' && !s.chars) s.chars = ' .oO@';
      if (cs?.user === 'words' && !s.chars) s.chars = 'GLYPHOS escribe con letras reales';
      await ensureGlyphFont(s.font, s.weight, sampleOf(s));
      const grid = glyphGrid(p, s, out);
      const ox = 8 + (k % cols) * (out.w + 8), oy = 8 + Math.floor(k / cols) * (out.h + pad + 8);
      x.fillStyle = '#ffb070'; x.font = '600 14px system-ui'; x.textBaseline = 'top';
      x.fillText(`${cs?.name ?? ids[k]} (${ids[k]})`, ox + 2, oy + 4);
      x.save(); x.translate(ox, oy + pad);
      x.fillStyle = '#000'; x.fillRect(0, 0, out.w, out.h);
      drawGlyphs(x, grid, s);
      x.restore();
    }
    return c.toDataURL('image/png');
  },
  /**
   * Lab timing: a 1080×1350 output with 8 px square cells (135×169 = 22 815 cells), median of `runs` after
   * two warm-ups. grid = glyphGrid (sampling + tone + mapping); draw = drawGlyphs; raster = the flush that
   * follows (the first pixel read waits for the canvas to finish drawing).
   */
  async bench(opts: { charset?: string; color?: GlyphStyle['color']; src?: string; runs?: number; edge?: number; paper?: string | null; fill?: GlyphStyle['fill']; chars?: string } = {}) {
    const s: GlyphStyle = {
      ...defaultGlyphStyle(), cell: 8, aspect: 1, charset: opts.charset ?? 'estandar', color: opts.color ?? 'mono',
      edge: opts.edge ?? 0, paper: opts.paper === undefined ? '#0c0b0a' : opts.paper, fill: opts.fill ?? 'ramp', chars: opts.chars ?? '',
    };
    await ensureGlyphFont(s.font, s.weight, sampleOf(s));
    const src = pic(opts.src ?? 'fruta');
    const out = { w: 1080, h: 1350 };
    const [c, x] = canvas(out.w, out.h);
    const g: number[] = [], d: number[] = [], f: number[] = [];
    let grid = glyphGrid(src, s, out);
    const runs = opts.runs ?? 10;
    for (let k = 0; k < runs + 2; k++) {
      const t0 = performance.now();
      grid = glyphGrid(src, s, out);
      const t1 = performance.now();
      x.clearRect(0, 0, out.w, out.h);
      drawGlyphs(x, grid, s);
      const t2 = performance.now();
      x.getImageData(0, 0, 1, 1);
      const t3 = performance.now();
      if (k >= 2) { g.push(t1 - t0); d.push(t2 - t1); f.push(t3 - t2); }
    }
    let glyphs = 0;
    for (let i = 0; i < grid.chars.length; i++) if (grid.alpha[i] > 0 && grid.chars[i] !== ' ') glyphs++;
    const r = (v: number) => +v.toFixed(1);
    // split of the grid time: sampling (canvas reduction + pixel read) and the pure mapping
    const dd = gridDims(s, out), ramp = resolveRamp(s, dd.cw, dd.ch);
    const sm: number[] = [], mp: number[] = [];
    for (let k = 0; k < runs; k++) {
      const t0 = performance.now();
      const fine = sampleFine(src, dd);
      const t1 = performance.now();
      gridFromFine(fine, s, dd, ramp);
      sm.push(t1 - t0); mp.push(performance.now() - t1);
    }
    return { cells: grid.cols * grid.rows, glyphs, grid: r(median(g)), sample: r(median(sm)), map: r(median(mp)), draw: r(median(d)), raster: r(median(f)), total: r(median(g) + median(d) + median(f)) };
  },
};
(window as unknown as { qa: typeof qa }).qa = qa;

sync();
render();
