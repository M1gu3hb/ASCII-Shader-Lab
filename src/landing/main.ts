import '../shared/fonts.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/martian-mono/latin-700.css';
import '@fontsource/martian-mono/latin-800.css';
import './landing.css';
import { luminance } from '../engine/color';
import type { Recipe } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import type { GLStatus } from '../engine/support';
import { generate, archById, freshSeed } from '../random';
import { PRESETS } from '../studio/presets';
import { encodeRecipe } from '../shared/share';
import { syntheticPhoto } from '../shared/sample';
import { scramble } from '../components/lib/scramble.js';
import { typewriter } from '../components/lib/typewriter.js';
import { spinner } from '../components/lib/spinners.js';
import { halo } from '../components/lib/halo.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string) => Array.from(document.querySelectorAll<T>(s));
const preset = (space: keyof typeof PRESETS, id: string) => PRESETS[space].find(p => p.id === id)!.make();

/*
 * The engine is its own chunk, requested right away but never in the way of the first paint. It picks
 * WebGL 2 when it works and the basic engine (Canvas 2D) otherwise, so no canvas stays empty.
 */
const engines = import('./engines');
type Opts = import('./engines').LandingOptions;

/** With «reduce motion», every canvas is a still frame: no autoplay and no wandering pointer. */
function still(r: Recipe): Recipe {
  if (reduced) r.interact.auto = false;
  return r;
}

async function engine(canvas: HTMLCanvasElement, r: Recipe, o: Opts = {}): Promise<Renderer | null> {
  canvas.style.background = r.color.bg;
  const m = await engines;
  const basic = m.basicHere();
  const made = await m.mount(canvas, still(r), {
    observeVisibility: true, reducedMotion: reduced, maxPixelRatio: 1.25, pointerTarget: 'canvas', ...o,
    // the CPU draws every pixel in basic mode: keep the canvases at 1 device pixel per CSS pixel
    ...(basic ? { maxPixelRatio: 1 } : {}),
  });
  if (made?.renderer.kind === 'basic') noteBasic(made.status, m.basicWords);
  return made?.renderer ?? null;
}

/** «modo básico» next to the hero's seed: discreet, and one tap away from the exact reason. */
let noted = false;
function noteBasic(status: GLStatus, words: typeof import('./engines').basicWords) {
  const seed = $('.hero-seed');
  if (noted || !seed) return;
  noted = true;
  const w = words(status);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hero-basic';
  btn.textContent = 'modo básico';
  btn.title = w.title;
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'hero-basic-why');
  const why = document.createElement('p');
  why.id = 'hero-basic-why';
  why.className = 'hero-basic-why';
  why.hidden = true;
  const b = document.createElement('b');
  b.textContent = w.title + '. ';
  why.append(b, w.body);
  btn.addEventListener('click', () => {
    why.hidden = !why.hidden;
    btn.setAttribute('aria-expanded', String(!why.hidden));
  });
  seed.append(' · ', btn);
  seed.after(why);
}

/* ---------- brand & nav ---------- */
const nav = $('.nav')!;
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 40);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- hero ---------- */
function heroize(r: Recipe): Recipe {
  r.interact = { mode: r.interact.mode === 'none' ? 'ripple' : r.interact.mode, strength: Math.max(0.45, r.interact.strength), radius: 0.16, auto: true };
  r.glyph.cell = Math.max(10, Math.min(16, r.glyph.cell));
  r.fx.chroma *= 0.4; r.fx.flicker = 0;
  return r;
}
const heroCanvas = $<HTMLCanvasElement>('.hero-canvas')!;
let heroRecipe = heroize(preset('arte', 'bermellon'));
heroRecipe.glyph.cell = 12;
let hero: Renderer | null = null;
const firstHero = heroRecipe;
void engine(heroCanvas, heroRecipe, { pointerTarget: 'window', maxPixelRatio: 1.5 }).then(e => {
  hero = e;
  // the dice may have been rolled while the engine was on its way
  if (hero && heroRecipe !== firstHero) hero.set(still(heroRecipe));
});
const heroEl = $('.hero')!;
const seedEl = $('[data-hero-seed]')!;
const openEl = $<HTMLAnchorElement>('[data-hero-open]')!;

async function theme(r: Recipe, label: string) {
  const light = luminance(r.color.bg) > 0.35;
  heroEl.style.setProperty('--hero-bg', r.color.bg);
  heroEl.style.setProperty('--hero-ink', light ? '#1c1a17' : '#ede6da');
  heroCanvas.style.background = r.color.bg;
  seedEl.textContent = label;
  openEl.href = '/studio/#r=' + (await encodeRecipe({ ...r, meta: { ...r.meta, space: 'arte' } }));
}
// a ready-made recipe, not a seed: typing «bermellón» as a seed would weave another piece
void theme(heroRecipe, 'receta: Bermellón');

$('[data-hero-roll]')!.addEventListener('click', () => {
  const seed = freshSeed();
  heroRecipe = heroize(generate({ seed, space: 'arte', base: heroRecipe }));
  hero?.set(still(heroRecipe), { transition: true });
  void theme(heroRecipe, `semilla: ${seed} · ${archById(heroRecipe.meta.arch)?.name ?? ''}`);
});

$$('[data-scramble]').forEach((el, i) => scramble(el, { trigger: 'load', duration: 1100 + i * 350, chars: '░▒▓█#%*+=-:.', stagger: 'left' }));
$$('[data-scramble-view]').forEach(el => scramble(el, { trigger: 'view', duration: 900, chars: '#%*+=-:.01' }));

/* ---------- lazy demos ---------- */
function lazy(el: Element, start: () => void) {
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '300px' });
  io.observe(el);
}

const demos: Record<string, () => Recipe> = {
  fondos: () => preset('fondos', 'marea'),
  arte: () => preset('arte', 'dona'),
  media: () => { const r = preset('media', 'retrato'); r.glyph.cell = 7; r.interact.mode = 'lens'; r.interact.auto = true; return r; },
  tipo: () => { const r = preset('tipo', 'neon'); r.text.content = 'TIPO'; return r; },
};
$$<HTMLCanvasElement>('[data-demo]').forEach(cv => lazy(cv, () => {
  const kind = cv.dataset.demo!;
  const r = demos[kind]();
  if (kind === 'fondos') r.interact.auto = true;
  void engine(cv, r, { maxPixelRatio: 1 }).then(e => { if (e && kind === 'media') e.setMedia('image', syntheticPhoto()); });
}));

/* terminal: real characters read back from the engine, printed as text */
const pre = $('[data-terminal]');
if (pre) lazy(pre, async () => {
  const r = PRESETS.terminal.find(p => p.id === 'donut')!.make();
  const cols = 64, rows = 20, cw = 9, ch = 18;
  const m = await engines;
  const e = (await m.mount(document.createElement('canvas'), r, { fixedSize: { width: cols * cw, height: rows * ch, pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false }))?.renderer;
  if (!e) return;
  let visible = false, t = 3;
  new IntersectionObserver(es => { visible = es.some(x => x.isIntersecting); }).observe(pre);
  const draw = () => {
    const g = e.readGrid();
    const lines: string[] = [];
    for (let y = 0; y < g.rows; y++) lines.push(g.chars.slice(y * g.cols, (y + 1) * g.cols).join(''));
    pre.textContent = lines.join('\n');
  };
  e.renderAt(t);
  draw();
  if (!reduced) setInterval(() => { if (!visible || document.hidden) return; t += 0.08; e.renderAt(t); draw(); }, 80);
});

/* pieces: their timers start when the tile comes near, not while the page loads */
const typeEl = $('[data-type]');
if (typeEl) lazy(typeEl, () => typewriter(typeEl, { phrases: ['descifrar()', 'maquina_de_escribir()', 'iman()', 'estela()', 'halo()'], typeSpeed: 60, hold: 1100 }));
$$('[data-spin]').forEach(el => lazy(el, () => spinner(el, el.dataset.spin || 'braille')));

/* ---------- azar: a remembered history ---------- */
/** WebP when the browser encodes it, JPEG otherwise (never the much heavier silent PNG). */
function thumb(c: HTMLCanvasElement) {
  const url = c.toDataURL('image/webp', 0.8);
  return url.startsWith('data:image/webp') ? url : c.toDataURL('image/jpeg', 0.82);
}

const azarCv = $<HTMLCanvasElement>('[data-azar]');
const strip = $('[data-azar-strip]');
const azarSeed = $('[data-azar-seed]');
if (azarCv && strip && azarSeed) lazy(azarCv, async () => {
  const seeds = ['faro-lunar-417', 'marea-leve-082', 'glifo-azul-311', 'telar-sutil-004', 'eco-boreal-560', 'coral-feliz-219', 'señal-fugaz-777'];
  const base = preset('arte', 'bermellon');
  const recipes = seeds.map((seed, i) => {
    const r = generate({ seed, space: i % 3 === 1 ? 'fondos' : 'arte', base });
    r.interact.auto = true;
    return r;
  });
  const live = await engine(azarCv, recipes[3], { maxPixelRatio: 1.25 });
  const m = await engines;
  const te = (await m.mount(document.createElement('canvas'), recipes[0], { fixedSize: { width: 640, height: 400, pixelRatio: 0.5 }, autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true }))?.renderer ?? null;
  await te?.ready();
  const btns = recipes.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-label', `Resultado ${i + 1}: ${seeds[i].replace(/-/g, ' ')}`);
    b.innerHTML = `<span>${i + 1}</span>`;
    if (te) { te.set(r); te.renderAt(4); b.style.backgroundImage = `url(${thumb(te.canvas)})`; }
    b.addEventListener('click', () => select(i));
    strip.appendChild(b);
    return b;
  });
  te?.destroy();
  function select(i: number) {
    btns.forEach((b, j) => b.setAttribute('aria-current', String(i === j)));
    live?.set(still(recipes[i]), { transition: true });
    azarSeed!.textContent = `N.º ${i + 1}/7 · ${seeds[i]} · ${archById(recipes[i].meta.arch)?.name ?? ''}`;
  }
  select(3);
});

/* ---------- final ---------- */
const finalCv = $<HTMLCanvasElement>('.final-canvas');
if (finalCv) lazy(finalCv, () => {
  const r = preset('fondos', 'constelacion');
  r.interact.auto = true;
  void engine(finalCv, r, { pointerTarget: 'window' });
});
// set up near view: it measures the button (a forced layout) and draws, which the load does not need
const haloBtn = $('[data-halo]');
if (haloBtn) lazy(haloBtn, () => halo(haloBtn, { color: '#ff5b1f', cell: 10, radius: 110, idle: 0.1 }));
