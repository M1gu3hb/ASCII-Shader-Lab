/**
 * QA page of the animation library (not part of the production build): every template applied to a
 * fitting sample layer (characters, ASCII, photo, text, shape) as a card with play, reverse and scrub and
 * a strip of frames at 0/25/50/75/100 %. window.qa drives it from tests/e2e/anim.spec.ts: renders, pixel
 * checks of reversed clips, timings.
 */
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/martian-mono/latin-400.css';
import '@fontsource/martian-mono/latin-800.css';
import { GROUPS, libraryItems } from '../src/anim/index';
import { templateById, templates } from '../src/project/clips';
import { Compositor } from '../src/project/compositor';
import { evaluate } from '../src/project/evaluate';
import { newLayer, newProject } from '../src/project/normalize';
import type { LayerKind, Project } from '../src/project/types';
import { PHOTO, sampleProject, sampleProvider, bestKind } from '../src/foto/timeline/samples';

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector(s) as T;
const status = (s: string) => { $('#status').textContent = s; };

/* ------------------------------------------------------------------ errors */

const errors: string[] = [];
window.addEventListener('error', e => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => errors.push(String((e.reason as Error)?.message ?? e.reason)));
const origError = console.error.bind(console);
console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); origError(...a); };

/* ------------------------------------------------------------------ rendering */

const params = new URLSearchParams(location.search);
const BASIC = params.get('motor') === 'basico';
const compositor = new Compositor({ provider: sampleProvider(), ...(BASIC ? { force: 'basic' as const } : {}) });

function fnv(d: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}
const pixelsOf = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;

interface RenderOpts { kind?: LayerKind; reverse?: boolean; scale?: number; params?: Record<string, number | string | boolean> }

function projectOf(id: string, o: RenderOpts = {}): Project {
  const kind = o.kind ?? kindFor(id);
  return sampleProject(id, kind, { clip: { reverse: !!o.reverse, ...(o.params ? { params: o.params } : {}) } });
}

async function renderInto(c: HTMLCanvasElement, p: Project, t: number, scale = 1) {
  return compositor.render(evaluate(p, t), c, { scale });
}

let kindChoice: 'auto' | LayerKind = (params.get('kind') as LayerKind | null) ?? 'auto';
function kindFor(id: string): LayerKind {
  const def = templateById(id);
  if (kindChoice !== 'auto' && def?.kinds.includes(kindChoice)) return kindChoice;
  return bestKind(id);
}

/* ------------------------------------------------------------------ cards */

interface Card { id: string; el: HTMLElement; main: HTMLCanvasElement; strip: HTMLCanvasElement[]; range: HTMLInputElement; out: HTMLOutputElement; rev: HTMLButtonElement; play: HTMLButtonElement; stripDone: boolean; dur: number }
const cards = new Map<string, Card>();
let playing: { card: Card; raf: number; t0: number } | null = null;
let queue: Promise<void> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const p = queue.then(job, job);
  queue = p.then(() => undefined, () => undefined);
  return p;
}

function drawMain(card: Card, t: number) {
  card.range.value = String(t);
  card.out.value = `${t.toFixed(2)} s`;
  return enqueue(() => renderInto(card.main, projectOf(card.id, { reverse: card.rev.getAttribute('aria-pressed') === 'true' }), t));
}

function drawStrip(card: Card) {
  if (card.stripDone) return Promise.resolve();
  card.stripDone = true;
  const p = projectOf(card.id, { reverse: card.rev.getAttribute('aria-pressed') === 'true' });
  return Promise.all(card.strip.map((c, k) => enqueue(() => renderInto(c, p, (k / 4) * card.dur, 0.5))));
}

function stop() {
  if (!playing) return;
  cancelAnimationFrame(playing.raf);
  playing.card.play.textContent = '▶';
  playing.card.play.setAttribute('aria-label', 'Reproducir');
  playing = null;
}

function play(card: Card) {
  if (playing?.card === card) { stop(); return; }
  stop();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.play.textContent = '❚❚';
  card.play.setAttribute('aria-label', 'Pausar');
  const t0 = performance.now() - Number(card.range.value) * 1000;
  let busy = false;
  const step = () => {
    if (!playing) return;
    // one render at a time: frames are skipped while the previous one is still being drawn
    if (!busy) {
      busy = true;
      const t = ((performance.now() - t0) / 1000) % card.dur;
      void drawMain(card, reduce ? Math.round(t * 4) / 4 : t).finally(() => { busy = false; });
    }
    playing.raf = requestAnimationFrame(step);
  };
  playing = { card, raf: requestAnimationFrame(step), t0 };
}

const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    const card = cards.get((e.target as HTMLElement).dataset.id!);
    if (!card) continue;
    if (e.isIntersecting) { void drawMain(card, Number(card.range.value)); void drawStrip(card); } else if (playing?.card === card) stop();
  }
}, { rootMargin: '200px' });

function buildCards() {
  stop();
  cards.clear();
  const root = $('#groups');
  root.textContent = '';
  const only = params.get('only')?.split(',').filter(Boolean);
  for (const g of GROUPS) {
    const items = templates().filter(d => d.group === g.id && (!only || only.includes(d.id)));
    if (!items.length) continue;
    const h = document.createElement('h2');
    h.innerHTML = `${g.name}<small></small>`;
    h.querySelector('small')!.textContent = `${items.length} · ${g.blurb}`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    root.append(h, grid);
    for (const def of items) {
      const kind = kindFor(def.id);
      const el = document.createElement('article');
      el.className = 'card';
      el.dataset.id = def.id;
      el.innerHTML = `<header><b></b><code></code><span class="kinds"></span></header>
        <canvas class="main" role="img"></canvas>
        <div class="ctl"><button type="button" class="play" aria-label="Reproducir">▶</button><button type="button" class="rev" aria-pressed="false" title="Invertir el clip">⇆</button><input type="range" min="0" step="0.01" aria-label="Tiempo"><output>0.00 s</output></div>
        <div class="strip">${[0, 25, 50, 75, 100].map(k => `<figure><canvas></canvas><figcaption>${k} %</figcaption></figure>`).join('')}</div>
        <p class="blurb"></p>`;
      $('b', el).textContent = def.name;
      $('code', el).textContent = def.id;
      $('.kinds', el).textContent = `${kind} · ${def.kinds.join(' ')}`;
      $('.blurb', el).textContent = def.blurb;
      const main = $<HTMLCanvasElement>('canvas.main', el);
      main.setAttribute('aria-label', `${def.name} sobre una capa de ${kind}`);
      const range = $<HTMLInputElement>('input', el);
      range.max = String(def.dur);
      range.value = String(Math.round(def.dur * 0.6 * 100) / 100);
      const card: Card = {
        id: def.id, el, main, strip: [...el.querySelectorAll<HTMLCanvasElement>('.strip canvas')], range, out: $<HTMLOutputElement>('output', el),
        rev: $<HTMLButtonElement>('.rev', el), play: $<HTMLButtonElement>('.play', el), stripDone: false, dur: def.dur,
      };
      range.addEventListener('input', () => { if (playing?.card === card) stop(); void drawMain(card, Number(range.value)); });
      card.play.addEventListener('click', () => play(card));
      card.rev.addEventListener('click', () => {
        card.rev.setAttribute('aria-pressed', String(card.rev.getAttribute('aria-pressed') !== 'true'));
        card.stripDone = false;
        void drawMain(card, Number(range.value));
        void drawStrip(card);
      });
      cards.set(def.id, card);
      grid.append(el);
      io.observe(el);
    }
  }
}

/* ------------------------------------------------------------------ window.qa */

const qa = {
  ready: false,
  error: '',
  errors,
  get ids() { return templates().map(d => d.id); },
  items: () => libraryItems().map(i => ({ id: i.id, template: i.template, group: i.group, kinds: i.kinds })),
  kinds: (id: string) => templateById(id)?.kinds ?? [],
  dur: (id: string) => templateById(id)?.dur ?? 2,
  /** Renders a template at t on a sample layer; hash of the pixels, how varied they are, the report. */
  async render(id: string, t: number, o: RenderOpts = {}) {
    const c = document.createElement('canvas');
    const r = await enqueue(() => renderInto(c, projectOf(id, o), t, o.scale ?? 1));
    const d = pixelsOf(c);
    // every pixel (every 4th one reads the same column of each cell when cells are 2 or 4 px wide)
    let s = 0, s2 = 0, n = 0;
    for (let k = 0; k < d.length; k += 4) { const l = d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11; s += l; s2 += l * l; n++; }
    const mean = s / n;
    return { w: c.width, h: c.height, hash: fnv(d), std: Math.sqrt(Math.max(0, s2 / n - mean * mean)), ms: r.ms, warnings: r.warnings, notes: r.layers.filter(l => l.note).map(l => l.note) };
  },
  /**
   * The reversed clip's frames against the forward frames in reverse order, pixel for pixel: frame k of
   * n of the reversed clip must equal frame n − k of the forward one.
   */
  async reverseCheck(id: string, o: { kind?: LayerKind; n?: number } = {}) {
    const n = o.n ?? 6;
    const dur = templateById(id)?.dur ?? 2;
    const fwd = projectOf(id, { kind: o.kind }), rev = projectOf(id, { kind: o.kind, reverse: true });
    const out: Array<{ k: number; same: boolean; differ: number }> = [];
    for (let k = 0; k <= n; k++) {
      const a = document.createElement('canvas'), b = document.createElement('canvas');
      await enqueue(() => renderInto(a, rev, (k / n) * dur));
      await enqueue(() => renderInto(b, fwd, ((n - k) / n) * dur));
      const x = pixelsOf(a), y = pixelsOf(b);
      let differ = 0;
      for (let i = 0; i < x.length; i += 4) if (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2] || x[i + 3] !== y[i + 3]) differ++;
      out.push({ k, same: differ === 0, differ });
    }
    return out;
  },
  /** A frame as a PNG data URL (contact sheets for review). */
  async frameURL(id: string, t: number, o: RenderOpts = {}) {
    const c = document.createElement('canvas');
    await enqueue(() => renderInto(c, projectOf(id, o), t, o.scale ?? 1));
    return c.toDataURL('image/png');
  },
  /** Every card's strip, drawn (for screenshots). */
  async drawAll() { for (const c of cards.values()) { await drawStrip(c); await drawMain(c, Number(c.range.value)); } },
  /**
   * Lab timings: the cost of a template itself on a 1080×1350 glyph grid (8 px square cells: 135×169 =
   * 22 815 cells) — evaluate + every per-cell hook asked for every cell — and a full compositor render at
   * that size with and without the clip. Medians of `n`.
   */
  async bench(id: string, n = 5, want?: LayerKind) {
    const def = templateById(id);
    if (!def) return null;
    const kind: LayerKind = want && def.kinds.includes(want) ? want : def.kinds.includes('glyphs') ? 'glyphs' : def.kinds[0];
    const p = sampleProject(id, kind, { w: 1080, h: 1350 });
    const lay = p.layers[p.layers.length - 1];
    if (lay.kind === 'glyphs') { lay.glyphs.cell = 8; lay.glyphs.aspect = 1; }
    const cols = 135, rows = 169, N = cols * rows;
    const chars: string[] = [], lum = new Float32Array(N), colors = new Uint32Array(N);
    for (let i = 0; i < N; i++) { const l = (Math.sin(i * 0.013) * 0.5 + 0.5) * ((i % cols) / cols); lum[i] = l; chars.push(' .:-=+*#%@'[Math.floor(l * 9.99)]); colors[i] = 0xede6da; }
    const grid = { cols, rows, cw: 8, ch: 8, w: 1080, h: 1350, chars, lum, colors };
    const med = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
    const apply: number[] = [];
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) / n) * def.dur;
      const t0 = performance.now();
      const lf = evaluate(p, t).layers.find(l => l.layer.id === lay.id)!;
      if (lf.cells) { const f = lf.cells(grid); for (let i = 0; i < N; i++) f(i, i % cols, (i / cols) | 0); }
      if (lf.reveal) { const f = lf.reveal(grid); for (let i = 0; i < N; i++) f(i % cols, (i / cols) | 0); }
      if (lf.tiles) { const f = lf.tiles(grid); for (let i = 0; i < N; i++) f(i % cols, (i / cols) | 0); }
      apply.push(performance.now() - t0);
    }
    const c = document.createElement('canvas');
    const withClip: number[] = [], without: number[] = [], total: number[] = [];
    const bare: Project = JSON.parse(JSON.stringify(p));
    bare.layers[bare.layers.length - 1].clips = [];
    // the animated layer's own time in the render report (the layers under it are the same either way)
    const layerMs = (r: { layers: Array<{ id: string; ms: number }> }) => r.layers.find(l => l.id === lay.id)?.ms ?? 0;
    await enqueue(() => renderInto(c, bare, 0));
    for (let k = 0; k < Math.min(3, n); k++) {
      const t = ((k + 0.5) / 3) * def.dur;
      const a = await enqueue(() => renderInto(c, p, t)); withClip.push(layerMs(a)); total.push(a.ms);
      const b = await enqueue(() => renderInto(c, bare, t)); without.push(layerMs(b));
    }
    return { id, kind, cells: N, applyMs: Math.round(med(apply) * 10) / 10, layerMs: Math.round(med(withClip)), baseLayerMs: Math.round(med(without)), frameMs: Math.round(med(total)) };
  },
  sampleProject, compositor, evaluate, newProject, newLayer, PHOTO,
};
(window as unknown as { qa: typeof qa }).qa = qa;

async function main() {
  status('cargando fuentes…');
  await document.fonts.ready;
  const sel = $<HTMLSelectElement>('#kind');
  sel.value = kindChoice;
  sel.addEventListener('change', () => { kindChoice = sel.value as typeof kindChoice; buildCards(); });
  buildCards();
  status(`${templates().length} plantillas · ${libraryItems().length} en la biblioteca con variantes`);
  qa.ready = true;
}

main().catch(e => { qa.error = String((e as Error)?.stack ?? e); status('error: ' + (e as Error).message); console.error(e); });
