import '../shared/fonts.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './landing.css';
import { luminance } from '../engine/color';
import type { Recipe } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import type { GLStatus } from '../engine/support';
import { PRESETS } from '../studio/presets';
import { encodeRecipe } from '../shared/share';
import { halo } from '../components/lib/halo.js';
import { engines, isPaused, live, morph, near, onPause, setPaused, still, track, whenBasic } from './live';
import { resolveHeadings, swapText, weaveIn } from './motion';

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s);
const preset = (space: keyof typeof PRESETS, id: string) => PRESETS[space].find(p => p.id === id)!.make();

/* ---------- «modo básico»: discreet, next to the hero's readout, and one tap away from the reason ---------- */
let noted = false;
whenBasic((status: GLStatus, words) => {
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
});

/* ---------- header: solid once scrolled, and the section in view ---------- */
const nav = $('.nav')!;
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 40);
addEventListener('scroll', onScroll, { passive: true });
onScroll();
const links = new Map(Array.from(document.querySelectorAll<HTMLAnchorElement>('.nav-links a[href^="#"]')).map(a => [a.hash.slice(1), a]));
const spy = new IntersectionObserver(es => es.forEach(e => links.get(e.target.id)?.classList.toggle('here', e.isIntersecting)), { rootMargin: '-45% 0px -50% 0px' });
links.forEach((_a, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });

/* ---------- «Pausar animaciones»: every canvas, video and text player of the page ---------- */
const pauseBtn = $<HTMLButtonElement>('[data-motion-toggle]');
if (pauseBtn) {
  pauseBtn.hidden = false;
  pauseBtn.addEventListener('click', () => setPaused(!isPaused()));
  onPause(p => {
    pauseBtn.setAttribute('aria-pressed', String(p));
    pauseBtn.querySelector('.ic')!.textContent = p ? '▶' : '❚❚';
    pauseBtn.querySelector('.lb')!.textContent = p ? 'Animar' : 'Pausar';
  });
}

/* ---------- hero ---------- */
function heroize(r: Recipe): Recipe {
  r.interact = { mode: r.interact.mode === 'none' ? 'ripple' : r.interact.mode, strength: Math.max(0.45, r.interact.strength), radius: 0.16, auto: true };
  r.glyph.cell = Math.max(10, Math.min(16, r.glyph.cell));
  r.fx.chroma *= 0.4; r.fx.flicker = 0;
  return still(r);
}
const heroCanvas = $<HTMLCanvasElement>('.hero-canvas')!;
let heroRecipe = heroize(preset('arte', 'bermellon'));
heroRecipe.glyph.cell = 12;
let hero: Renderer | null = null;
let heroNo = 1;
const firstHero = heroRecipe;
void live(heroCanvas, heroRecipe, { pointerTarget: 'window', maxPixelRatio: 1.5 }).then(e => {
  hero = e;
  if (!e) return;
  track(e);
  // the dice may have been rolled while the engine was on its way
  if (heroRecipe !== firstHero) e.set(heroRecipe);
});
const heroEl = $('.hero')!;
const seedEl = $('[data-hero-seed]')!;
const nameEl = $('[data-hero-name]');
const noEl = $('[data-hero-no]');
const openEl = $<HTMLAnchorElement>('[data-hero-open]')!;

async function theme(r: Recipe, name: string, label: string) {
  const light = luminance(r.color.bg) > 0.35;
  heroEl.style.setProperty('--hero-bg', r.color.bg);
  heroEl.style.setProperty('--hero-ink', light ? '#1c1a17' : '#ede6da');
  heroCanvas.style.background = r.color.bg;
  seedEl.textContent = label;
  if (nameEl) swapText(nameEl, name);
  if (noEl) noEl.textContent = `N.º ${heroNo}`;
  openEl.href = '/studio/#r=' + (await encodeRecipe({ ...r, meta: { ...r.meta, space: 'arte' } }));
}
// a ready-made recipe, not a seed: typing «bermellón» as a seed would weave another piece
void theme(heroRecipe, 'Bermellón', 'receta: Bermellón');

const random = () => import('../random');
$('[data-hero-roll]')!.addEventListener('click', async e => {
  const R = await random();
  const seed = R.freshSeed();
  heroRecipe = heroize(R.generate({ seed, space: 'arte', base: heroRecipe }));
  heroNo++;
  // the iris opens where the dice is
  const b = (e.currentTarget as HTMLElement).getBoundingClientRect(), c = heroCanvas.getBoundingClientRect();
  hero?.set(heroRecipe, { transition: morph('iris', 0.9, { origin: [(b.left + b.width / 2 - c.left) / c.width, (b.top + b.height / 2 - c.top) / c.height] }) });
  const arch = R.archById(heroRecipe.meta.arch)?.name ?? '';
  void theme(heroRecipe, arch || seed, `semilla: ${seed}${arch ? ' · ' + arch : ''}`);
});

/* ---------- motion: headings resolve, blocks weave in ---------- */
resolveHeadings();
weaveIn();

/* ---------- islands: loaded as their section comes near (or is reached with the keyboard) ---------- */
function island(sel: string, load: (el: HTMLElement) => Promise<unknown>) {
  const el = $<HTMLElement>(sel);
  if (!el) return;
  let done = false;
  const go = () => { if (!done) { done = true; void load(el); } };
  near(el, go, '700px');
  el.addEventListener('focusin', go, { once: true });
  el.addEventListener('pointerenter', go, { once: true });
}
island('[data-telar]', el => import('./telar').then(m => m.mountTelar(el)));
island('[data-azar-demo]', el => import('./azar').then(m => m.mountAzar(el.closest('section')!)));
island('[data-salidas]', el => import('./salidas').then(m => m.mountSalidas(el)));

/* ---------- final ---------- */
const finalCv = $<HTMLCanvasElement>('.final-canvas');
if (finalCv) near(finalCv, () => {
  const r = still(preset('fondos', 'constelacion'));
  r.interact.auto = !isPaused();
  void live(finalCv, r, { pointerTarget: 'window' }).then(e => { if (e) track(e); });
});
// set up near view: it measures the button (a forced layout) and draws, which the load does not need
const haloBtn = $('[data-halo]');
if (haloBtn) near(haloBtn, () => halo(haloBtn, { color: '#ff5b1f', cell: 10, radius: 110, idle: 0.1 }), '200px');

// the engine chunk and the dice, fetched once the page has settled (the hero asked for the engine already)
addEventListener('load', () => setTimeout(() => { void engines(); void random(); }, 1200), { once: true });
