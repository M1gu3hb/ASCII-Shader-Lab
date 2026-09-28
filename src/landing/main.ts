import '../shared/fonts.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
// the display face's static cuts: registered from the first paint, so headings never switch face later
import '@fontsource/martian-mono/latin-700.css';
import '@fontsource/martian-mono/latin-800.css';
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
  // the name says what the button does next (visible words first, so voice control finds them)
  onPause(p => {
    pauseBtn.toggleAttribute('data-paused', p);
    // the page's own CSS loops (the blinking dot of the hero) stop too
    document.documentElement.toggleAttribute('data-paused', p);
    pauseBtn.querySelector('.ic')!.textContent = p ? '▶' : '❚❚';
    pauseBtn.querySelector('.lb')!.textContent = p ? 'Animar' : 'Pausar';
    pauseBtn.querySelector('.vh')!.textContent = p ? ' la página' : ' las animaciones de la página';
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

let themeNo = 0;
async function theme(r: Recipe, name: string, label: string) {
  const mine = ++themeNo;
  const light = luminance(r.color.bg) > 0.35;
  heroEl.style.setProperty('--hero-bg', r.color.bg);
  heroEl.style.setProperty('--hero-ink', light ? '#1c1a17' : '#ede6da');
  heroCanvas.style.background = r.color.bg;
  seedEl.textContent = label;
  if (nameEl) swapText(nameEl, name);
  if (noEl) noEl.textContent = `N.º ${heroNo}`;
  const href = '/studio/#r=' + (await encodeRecipe({ ...r, meta: { ...r.meta, space: 'arte' } }));
  // rapid rolls: encodings can finish out of order, and the link must open the piece on screen
  if (mine === themeNo) openEl.href = href;
}
// a ready-made recipe, not a seed: typing «bermellón» as a seed would weave another piece
void theme(heroRecipe, 'Bermellón', 'receta: Bermellón');

const random = () => import('../random');
$('[data-hero-roll]')!.addEventListener('click', async e => {
  const dice = e.currentTarget as HTMLElement;
  const R = await random();
  const seed = R.freshSeed();
  heroRecipe = heroize(R.generate({ seed, space: 'arte', base: heroRecipe }));
  heroNo++;
  // the iris opens where the dice is
  const b = dice.getBoundingClientRect(), c = heroCanvas.getBoundingClientRect();
  hero?.set(heroRecipe, { transition: morph('iris', 0.9, { origin: [(b.left + b.width / 2 - c.left) / c.width, (b.top + b.height / 2 - c.top) / c.height] }) });
  const arch = R.archById(heroRecipe.meta.arch)?.name ?? '';
  void theme(heroRecipe, arch || seed, `semilla: ${seed}${arch ? ' · ' + arch : ''}`);
});

/* ---------- motion: headings resolve, blocks weave in ---------- */
document.querySelector('#guias .guides')?.setAttribute('data-weave', '');
resolveHeadings();
weaveIn();

/*
 * ---------- islands: loaded as their section comes near (or is reached with the keyboard) ----------
 * Only once the page has loaded and gone idle: the first paint and the hero come first.
 */
const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 1200));
const afterLoad = (fn: () => void) => (document.readyState === 'complete' ? idle(fn) : addEventListener('load', () => idle(fn), { once: true }));
function island(sel: string, load: (el: HTMLElement) => Promise<unknown>) {
  const el = $<HTMLElement>(sel);
  if (!el) return;
  let done = false, mounted = false;
  let pending: HTMLElement | null = null;
  const go = () => {
    if (done) return;
    done = true;
    void load(el).then(() => {
      mounted = true;
      // a button pressed while the island was on its way still does what was asked
      (pending?.matches('button') ? pending : pending?.querySelector('button'))?.click();
      pending = null;
    });
  };
  // watched from the start (a section passed on the way down is ready when you come back), loaded once the page is idle
  near(el, () => afterLoad(go), '250px');
  el.addEventListener('focusin', go, { once: true });
  el.addEventListener('pointerenter', go, { once: true });
  el.addEventListener('click', e => {
    if (mounted) return;
    const b = (e.target as Element).closest<HTMLElement>('button, [data-contact]');
    if (b) { pending = b; e.preventDefault(); }
    go();
  }, true);
}
island('[data-telar]', el => import('./telar').then(m => m.mountTelar(el)));
island('#azar', el => import('./azar').then(m => m.mountAzar(el)));
island('[data-salidas]', el => import('./salidas').then(m => m.mountSalidas(el)));

/* ---------- final ---------- */
const finalCv = $<HTMLCanvasElement>('.final-canvas');
if (finalCv) afterLoad(() => near(finalCv, () => {
  const r = still(preset('fondos', 'constelacion'));
  r.interact.auto = !isPaused();
  void live(finalCv, r, { pointerTarget: 'window' }).then(e => { if (e) track(e); });
}));
// set up near view: it measures the button (a forced layout) and draws, which the load does not need
const haloBtn = $('[data-halo]');
if (haloBtn) near(haloBtn, () => halo(haloBtn, { color: '#ff5b1f', cell: 10, radius: 110, idle: 0.1 }), '200px');

// the engine chunk and the dice, fetched once the page has settled (the hero asked for the engine already)
afterLoad(() => { void engines(); void random(); });
