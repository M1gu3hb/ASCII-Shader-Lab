import {
  applyFinishes, defaultFinish, DITHER_ALGOS, finishDef, FINISHES, releaseFinishes, type FinishContext,
} from '../src/fx';
import type { Finish, FinishKind } from '../src/project/types';
import { paintLandscape } from '../src/shared/sample';

/*
 * QA of the finishes (src/fx): every finish with its defaults on a photo and on a cutout, the 17 dither
 * methods, colour modes / palettes / shapes, stacks that reproduce the looks of the references, and a
 * timing table at 1080×1350. Cards simulate a 1080 px wide output rendered at the chosen scale (the studio
 * preview renders at 0.5). window.fx exposes { ready, timings() } for scripts.
 */

const OUT_W = 1080;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (s: string) => { $('status').textContent = s; };
const tick = () => new Promise<void>(r => setTimeout(r, 0));

/* ------------------------------------------------------------------ samples */

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

/** The sample landscape (src/shared/sample.ts) drawn to cover w×h. */
function photo(w: number, h: number): HTMLCanvasElement {
  const src = canvas(960, 600);
  paintLandscape(src.getContext('2d')!);
  const c = canvas(w, h), x = c.getContext('2d')!;
  const k = Math.max(w / 960, h / 600);
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, (w - 960 * k) / 2, (h - 600 * k) / 2, 960 * k, 600 * k);
  return c;
}

/** A cutout-like flower on transparency (soft edges, shading), size s×s. */
function flower(s: number): HTMLCanvasElement {
  const c = canvas(s, s), x = c.getContext('2d')!;
  const k = s / 300;
  x.scale(k, k);
  // stem and leaf
  x.strokeStyle = '#3f6b2a'; x.lineWidth = 7; x.lineCap = 'round';
  x.beginPath(); x.moveTo(150, 170); x.bezierCurveTo(160, 220, 140, 250, 152, 296); x.stroke();
  const leaf = x.createLinearGradient(150, 230, 230, 200);
  leaf.addColorStop(0, '#2f5a22'); leaf.addColorStop(1, '#8fbf4a');
  x.fillStyle = leaf;
  x.beginPath(); x.moveTo(152, 240); x.bezierCurveTo(185, 200, 225, 205, 240, 214); x.bezierCurveTo(215, 245, 185, 252, 152, 240); x.fill();
  // petals
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    x.save(); x.translate(150, 120); x.rotate(a);
    const g = x.createLinearGradient(0, 0, 0, -95);
    g.addColorStop(0, '#b3264b'); g.addColorStop(0.45, '#ff6f7d'); g.addColorStop(1, '#ffd2b8');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(0, -52, 25, 50, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(120,20,40,.35)'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(0, -12); x.lineTo(0, -92); x.stroke();
    x.restore();
  }
  const core = x.createRadialGradient(142, 112, 4, 150, 120, 34);
  core.addColorStop(0, '#ffe38a'); core.addColorStop(0.6, '#e0a21c'); core.addColorStop(1, '#6b3a09');
  x.fillStyle = core; x.beginPath(); x.arc(150, 120, 32, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(60,30,5,.55)';
  for (let i = 0; i < 40; i++) {
    const r = Math.sqrt(i / 40) * 26, a = i * 2.39996;
    x.beginPath(); x.arc(150 + Math.cos(a) * r, 120 + Math.sin(a) * r, 1.6, 0, Math.PI * 2); x.fill();
  }
  return c;
}

/** Real characters on transparency: an ASCII disc (for the glow + trail overlay look). */
function asciiOverlay(w: number, h: number): HTMLCanvasElement {
  const c = canvas(w, h), x = c.getContext('2d')!;
  const cell = Math.max(5, w / 64), ramp = ' .:-=+*#%@';
  x.font = `${cell * 1.25}px ui-monospace, "JetBrains Mono", monospace`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let y = cell; y < h; y += cell * 1.6) for (let X = cell / 2; X < w; X += cell) {
    const d = Math.hypot((X - w * 0.6) / (h * 0.36), (y - h * 0.46) / (h * 0.36));
    if (d > 1) continue;
    const v = Math.max(0, 1 - d) * 0.8 + 0.2 * Math.max(0, 1 - Math.hypot(X / w - 0.5, y / h - 0.3) * 3);
    const ch = ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length * 1.4))];
    if (ch === ' ') continue;
    x.fillStyle = `rgb(255, ${Math.round(200 + v * 50)}, ${Math.round(150 + v * 90)})`;
    x.fillText(ch, X, y);
  }
  return c;
}

/* ------------------------------------------------------------------ rendering */

const f = (k: FinishKind, params: Finish['params'] = {}, amount = 1): Finish => {
  const d = defaultFinish(k);
  return { ...d, amount, params: { ...d.params, ...params } };
};

let scale = 0.5;
const ctxAt = (s: number, t = 0.5): FinishContext => ({ t, seed: 'qa', scale: s, quality: s < 1 ? 'preview' : 'final' });

/** Applies finishes and returns an independent copy (the pooled canvas is reused by the next call). */
function finished(src: HTMLCanvasElement, list: Finish[], s = scale, t = 0.5): { c: HTMLCanvasElement; ms: number } {
  const t0 = performance.now();
  const out = applyFinishes(src, list, ctxAt(s, t), 'qa');
  const ms = performance.now() - t0;
  const c = canvas(out.width, out.height);
  c.getContext('2d')!.drawImage(out, 0, 0);
  return { c, ms };
}

function card(parent: HTMLElement, title: string, meta: string, canvases: Array<{ c: HTMLCanvasElement; alpha?: boolean; zoom?: boolean }>, note?: string) {
  const fig = document.createElement('figure');
  const pair = document.createElement('div');
  if (canvases.length > 1) pair.className = 'pair';
  for (const { c, alpha, zoom } of canvases) {
    if (alpha) c.classList.add('alpha');
    if (zoom) c.classList.add('zoom');
    pair.append(c);
  }
  const cap = document.createElement('figcaption');
  cap.innerHTML = `<b></b><span class="meta"><span></span><span></span></span>${note ? '<p></p>' : ''}`;
  cap.querySelector('b')!.textContent = title;
  const [m1, m2] = cap.querySelectorAll('.meta span');
  m1.textContent = meta.split('|')[0]; m2.textContent = meta.split('|')[1] ?? '';
  if (note) cap.querySelector('p')!.textContent = note;
  fig.append(pair, cap);
  parent.append(fig);
  return fig;
}

/** Draws layers bottom→top into a new canvas (for the looks that mix a photo and an overlay). */
function stack(w: number, h: number, bg: string | null, layers: HTMLCanvasElement[]): HTMLCanvasElement {
  const c = canvas(w, h), x = c.getContext('2d')!;
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  for (const l of layers) x.drawImage(l, 0, 0, w, h);
  return c;
}

async function renderAll() {
  releaseFinishes();
  for (const id of ['finishes', 'algos', 'variants', 'looks']) $(id).replaceChildren();
  const W = Math.round(OUT_W * scale), H = Math.round(W * 0.625);
  const P = photo(W, H), F = flower(Math.round(W * 0.56));
  let n = 0;

  // 1. every finish with its defaults
  for (const def of FINISHES) {
    status(`acabados ${++n}/${FINISHES.length}…`);
    const a = finished(P, [defaultFinish(def.kind)]);
    const b = finished(F, [defaultFinish(def.kind)]);
    card($('finishes'), def.name, `${def.kind} · ${def.group}|${a.ms.toFixed(0)} ms`, [{ c: a.c }, { c: b.c, alpha: true }], def.blurb);
    await tick();
  }

  // 2. the dither methods on a crop, pixel 1, shown enlarged
  // a 260×200 detail of the final-size photo (sky gradient, the sun's edge, ridges, water), at scale 1
  const crop = canvas(260, 200);
  crop.getContext('2d')!.drawImage(photo(OUT_W, OUT_W * 0.625), -390, -250);
  for (const a of DITHER_ALGOS) {
    status(`tramado ${a.id}…`);
    const r = finished(crop, [f('dither', { algo: a.id, pixel: 1 })], 1);
    card($('algos'), a.name, `${a.id} · ${a.family}|${r.ms.toFixed(1)} ms`, [{ c: r.c, zoom: true }]);
    await tick();
  }

  // 3. variants
  const V: Array<[string, string, HTMLCanvasElement, Finish[], boolean?]> = [
    ['Tramado · tonos (4)', 'dither color=tonos', P, [f('dither', { color: 'tonos', levels: 4, algo: 'floyd' })]],
    ['Tramado · RGB 2 niveles', 'dither color=rgb', P, [f('dither', { color: 'rgb', levels: 2, algo: 'floyd', pixel: 3 })]],
    ['Tramado · paleta PICO-8', 'dither paleta pico8', P, [f('dither', { color: 'paleta', palette: 'pico8', algo: 'bayer8', pixel: 3 })]],
    ['Tramado · paleta automática (6)', 'dither paleta auto', P, [f('dither', { color: 'paleta', palette: 'auto', count: 6, algo: 'atkinson', pixel: 3 })]],
    ['Tramado · luz lineal', 'dither linear', P, [f('dither', { linear: true })]],
    ['Tramado · bloques grandes', 'dither pixel=8 bayer4', P, [f('dither', { pixel: 8, algo: 'bayer4', color: 'paleta', palette: 'gameboy' })]],
    ['Tramado · papel transparente', 'dither clear', F, [f('dither', { clear: true, pixel: 3, ink: '#1b1446' })], true],
    ['Semitono · elipse', 'halftone ellipse', P, [f('halftone', { shape: 'ellipse' })]],
    ['Semitono · cuadrado', 'halftone square', P, [f('halftone', { shape: 'square', freq: 8 })]],
    ['Semitono · línea', 'halftone line', P, [f('halftone', { shape: 'line', freq: 9, angle: 30 })]],
    ['Semitono · cruz', 'halftone cross', P, [f('halftone', { shape: 'cross', freq: 9 })]],
    ['Semitono · CMYK', 'halftone cmyk', P, [f('halftone', { color: 'cmyk', freq: 9 })]],
    ['Semitono · color de la imagen', 'halftone fuente', P, [f('halftone', { color: 'fuente', paper: '#141210', freq: 8 })]],
    ['Paleta · Game Boy', 'palette gameboy', P, [f('palette', { palette: 'gameboy' })]],
    ['Paleta · CGA', 'palette cga', P, [f('palette', { palette: 'cga', dither: 'bayer8' })]],
    ['Paleta · Commodore 64', 'palette c64', P, [f('palette', { palette: 'c64', dither: 'floyd' })]],
    ['Paleta · riso verde y naranja', 'palette riso', P, [f('palette', { palette: 'riso-verde-naranja', dither: 'bluenoise' })]],
    ['Paleta · sepia sin tramado', 'palette sepia none', P, [f('palette', { palette: 'sepia', dither: 'none' })]],
    ['Paleta · cianotipia', 'palette cianotipo', P, [f('palette', { palette: 'cianotipo', dither: 'atkinson' })]],
    ['Movimiento · zoom', 'motionblur zoom', P, [f('motionblur', { mode: 'zoom', cx: 0.58, cy: 0.5 })]],
    ['Movimiento · giro', 'motionblur spin', P, [f('motionblur', { mode: 'spin', amount: 0.25, cx: 0.58, cy: 0.5 })]],
    ['Movimiento · estela', 'motionblur trail', F, [f('motionblur', { trail: true, distance: 90, angle: 180 })], true],
    ['Sombra larga', 'shadow long', F, [f('shadow', { mode: 'long', distance: 160, angle: 45, blur: 0, opacity: 0.45 })], true],
    ['Umbral local', 'threshold local', P, [f('threshold', { mode: 'local', radius: 24 })]],
    ['Bordes · sobre la imagen', 'edges sobre', P, [f('edges', { mode: 'sobre', color: '#0c0b0a', width: 2 })]],
    ['Bordes · solo líneas', 'edges solo', F, [f('edges', { mode: 'solo', color: '#ff5b1f', width: 2.5, threshold: 0.2 })], true],
    ['Pixelado · LED', 'pixelate circle', P, [f('pixelate', { shape: 'circle', size: 16, gap: 0.12 })]],
    ['Rayado · color de la imagen', 'crosshatch fuente', P, [f('crosshatch', { color: 'fuente', paper: '#f4efe4' })]],
    ['Grano de color', 'grain color', P, [f('grain', { color: true, amount: 0.6, size: 2.4 })]],
  ];
  for (const [title, meta, src, list, alpha] of V) {
    status(`variantes: ${title}…`);
    const r = finished(src, list);
    card($('variants'), title, `${meta}|${r.ms.toFixed(0)} ms`, [{ c: r.c, alpha }]);
    await tick();
  }

  // 4. looks of the references: stacks of finishes (and layers)
  const O = asciiOverlay(W, H);
  const looks: Array<[string, string, () => { c: HTMLCanvasElement; alpha?: boolean }]> = [
    ['Jardín de tramas', 'recorte · tramado Atkinson 1 bit en bloques', () => ({ c: stack(F.width, F.height, '#ede6da', [finished(F, [f('dither', { algo: 'atkinson', pixel: 3, clear: true, contrast: 1.2, bright: -0.3 })]).c]) })],
    ['Figura en semitono', 'recorte · semitono de puntos, papel transparente', () => ({ c: stack(F.width, F.height, '#efe9df', [finished(F, [f('halftone', { clear: true, freq: 10, bright: -0.3 })]).c]) })],
    ['Overlay ASCII brillante', 'foto + caracteres con resplandor y estela (hosqo)', () => {
      const ov = finished(O, [f('motionblur', { trail: true, distance: 70, angle: 200 }), f('glow', { threshold: 0, radius: 26, strength: 1.2, tint: '#ffb27a' })]).c;
      return { c: stack(W, H, null, [finished(P, [f('levels', { gamma: 0.8 }), f('vignette')]).c, ov]) };
    }],
    ['VHS', 'separación con temblor + líneas + ruido + desenfoque', () => ({ c: finished(P, [f('blur', { radius: 1.2 }), f('chroma', { amount: 5, jitter: 0.6 }), f('scanlines', { spacing: 3, intensity: 0.3 }), f('noise', { amount: 0.14 })]).c })],
    ['CRT de fósforo', 'paleta fósforo + barrido con máscara + resplandor + viñeta', () => ({ c: finished(P, [f('palette', { palette: 'fosforo', dither: 'bayer4', pixel: 3 }), f('glow', { threshold: 0.35, radius: 18, strength: 0.9 }), f('scanlines', { mask: true, spacing: 4, intensity: 0.5 }), f('vignette', { amount: 0.7 })]).c })],
    ['Risografía', 'paleta riso + ruido azul + grano', () => ({ c: finished(P, [f('palette', { palette: 'riso-azul-rosa', dither: 'bluenoise', pixel: 2 }), f('grain', { amount: 0.25 })]).c })],
    ['Periódico', 'semitono CMYK + grano', () => ({ c: finished(P, [f('halftone', { color: 'cmyk', freq: 12 }), f('grain', { amount: 0.2 })]).c })],
    ['Grabado', 'rayado cruzado + viñeta', () => ({ c: finished(P, [f('crosshatch', { spacing: 6 }), f('vignette', { amount: 0.35, color: '#3a2a1a' })]).c })],
    ['Película blanco y negro', 'monocromo con filtro rojo + niveles + grano + viñeta', () => ({ c: finished(P, [f('mono', { filter: 'rojo', contrast: 1.25 }), f('levels'), f('grain', { amount: 0.45 }), f('vignette')]).c })],
    ['Recorte con sombra', 'recorte · sombra de caída sobre papel', () => ({ c: stack(F.width, F.height, '#e8e1d4', [finished(F, [f('shadow')]).c]) })],
    ['Contorno neón', 'bordes solos + resplandor sobre tinta', () => ({ c: stack(W, H, '#0c0b0a', [finished(P, [f('edges', { mode: 'solo', color: '#ff5b1f', width: 1.5, threshold: 0.25 }), f('glow', { threshold: 0, radius: 20, strength: 1.4 })]).c]) })],
    ['Game Boy', 'paleta Game Boy en bloques + barrido', () => ({ c: finished(P, [f('palette', { palette: 'gameboy', dither: 'bayer4', pixel: 5 }), f('scanlines', { spacing: 5, intensity: 0.18 })]).c })],
  ];
  for (const [title, meta, make] of looks) {
    status(`looks: ${title}…`);
    const r = make();
    card($('looks'), title, meta, [r]);
    await tick();
  }
  releaseFinishes();
  status(`listo · escala ${scale}`);
}

/* ------------------------------------------------------------------ timings */

interface Row { name: string; final: number; preview: number }

/**
 * Best of `runs` timed calls after one warm-up. The minimum, not the median: on a machine shared with
 * other work it is the closest to the cost of the finish itself.
 */
function measure(src: HTMLCanvasElement, list: Finish[], s: number, runs = 5): number {
  applyFinishes(src, list, ctxAt(s), 'timing'); // warm-up
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    applyFinishes(src, list, ctxAt(s, 0.5 + i / 24), 'timing');
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

/** The canvas round trip every CPU finish pays: draw the input, read its pixels, write them back. */
function roundTrip(src: HTMLCanvasElement, runs = 5): number {
  const c = canvas(src.width, src.height), x = c.getContext('2d', { willReadFrequently: true })!;
  let best = Infinity;
  for (let i = 0; i < runs + 1; i++) {
    const t0 = performance.now();
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(src, 0, 0);
    x.putImageData(x.getImageData(0, 0, c.width, c.height), 0, 0);
    if (i > 0) best = Math.min(best, performance.now() - t0);
  }
  return best;
}

async function timings(): Promise<Row[]> {
  const big = photo(1080, 1350), half = photo(540, 675);
  const rows: Row[] = [];
  const tbl = document.createElement('table');
  tbl.innerHTML = '<thead><tr><th>acabado</th><th>final 1080×1350</th><th>vista previa 540×675</th></tr></thead><tbody></tbody>';
  $('times').replaceChildren(tbl);
  const body = tbl.querySelector('tbody')!;
  const add = (r: Row) => {
    rows.push(r);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td></td><td class="${r.final > 150 ? 'slow' : ''}">${r.final.toFixed(1)} ms</td><td>${r.preview >= 0 ? r.preview.toFixed(1) + ' ms' : '—'}</td>`;
    tr.firstElementChild!.textContent = r.name;
    body.append(tr);
  };
  add({ name: 'lienzo: dibujar + leer + escribir (sin acabado)', final: roundTrip(big), preview: roundTrip(half) });
  for (const def of FINISHES) {
    status(`midiendo ${def.kind}…`);
    await tick();
    add({ name: `${def.kind} (${finishDef(def.kind)!.name})`, final: measure(big, [defaultFinish(def.kind)], 1), preview: measure(half, [defaultFinish(def.kind)], 0.5) });
  }
  for (const [name, list] of [
    ['motionblur zoom', [f('motionblur', { mode: 'zoom' })]],
    ['motionblur spin', [f('motionblur', { mode: 'spin' })]],
    ['halftone cmyk', [f('halftone', { color: 'cmyk' })]],
    ['glow radio 100', [f('glow', { radius: 100 })]],
  ] as Array<[string, Finish[]]>) {
    status(`midiendo ${name}…`);
    await tick();
    add({ name, final: measure(big, list, 1), preview: measure(half, list, 0.5) });
  }
  for (const a of DITHER_ALGOS) {
    status(`midiendo tramado ${a.id}…`);
    await tick();
    const one = [f('dither', { algo: a.id, pixel: 1 })];
    add({ name: `dither ${a.id} (1 bit, píxel 1)`, final: measure(big, one, 1), preview: measure(half, one, 0.5) });
  }
  for (const a of ['floyd', 'jarvis', 'stucki', 'riemersma', 'bayer8']) {
    await tick();
    const pal = [f('dither', { algo: a, pixel: 1, color: 'paleta', palette: 'pico8' })];
    add({ name: `dither ${a} (PICO-8, píxel 1)`, final: measure(big, pal, 1), preview: -1 });
  }
  releaseFinishes();
  status('tiempos listos');
  return rows;
}

/* ------------------------------------------------------------------ wiring */

$('scale').addEventListener('change', e => { scale = Number((e.target as HTMLSelectElement).value); void renderAll(); });
$('time').addEventListener('click', () => { void timings(); });
const params = new URLSearchParams(location.search);
if (params.has('grande')) document.body.classList.add('big');
if (params.has('escala')) { scale = Number(params.get('escala')) || 1; ($('scale') as HTMLSelectElement).value = String(scale); }
const ready = renderAll();
/** A 1:1 crop of the final-size photo (or flower) with finishes, as a PNG data URL (for close inspection). */
function detail(list: Finish[], x: number, y: number, w: number, h: number, sample: 'foto' | 'flor' = 'foto', s = 1): string {
  const src = sample === 'flor' ? flower(Math.round(600 * s)) : photo(OUT_W * s, OUT_W * 0.625 * s);
  const out = applyFinishes(src, list, ctxAt(s), 'detail');
  const c = canvas(w, h), x2 = c.getContext('2d')!;
  if (sample === 'flor') { x2.fillStyle = '#8f877c'; x2.fillRect(0, 0, w, h); }
  x2.drawImage(out, -x, -y);
  releaseFinishes('detail');
  return c.toDataURL('image/png');
}
(window as unknown as { fx: unknown }).fx = { ready, timings, renderAll, detail };
