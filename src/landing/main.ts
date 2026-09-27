import '../shared/fonts.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/martian-mono/latin-700.css';
import '@fontsource/martian-mono/latin-800.css';
import './landing.css';
import { AsciiEngine } from '../engine/engine';
import { createFontLoader } from '../engine/fonts';
import { PATTERN_GLSL } from '../engine/glsl/patterns';
import { luminance } from '../engine/color';
import type { Recipe } from '../engine/recipe';
import { generate, archById, freshSeed } from '../random';
import { PRESETS } from '../studio/presets';
import { encodeRecipe } from '../shared/share';
import { logoMark } from '../shared/brand';
import { scramble } from '../components/lib/scramble.js';
import { typewriter } from '../components/lib/typewriter.js';
import { spinner } from '../components/lib/spinners.js';
import { halo } from '../components/lib/halo.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fonts = createFontLoader({ google: false });
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string) => Array.from(document.querySelectorAll<T>(s));
const preset = (space: keyof typeof PRESETS, id: string) => PRESETS[space].find(p => p.id === id)!.make();

function engine(canvas: HTMLCanvasElement, r: Recipe, o: Partial<ConstructorParameters<typeof AsciiEngine>[2]> = {}) {
  try {
    return new AsciiEngine(canvas, r, {
      library: PATTERN_GLSL, fonts, observeVisibility: true, reducedMotion: reduced, maxPixelRatio: 1.25, pointerTarget: 'canvas', ...o,
    });
  } catch {
    canvas.style.background = r.color.bg;
    return null;
  }
}

/* ---------- brand & nav ---------- */
$$('[data-logo]').forEach(el => { el.innerHTML = logoMark(24); });
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
const hero = engine(heroCanvas, heroRecipe, { pointerTarget: 'window', maxPixelRatio: 1.5 });
const heroEl = $('.hero')!;
const seedEl = $('[data-hero-seed]')!;
const openEl = $<HTMLAnchorElement>('[data-hero-open]')!;

async function theme(r: Recipe, label: string) {
  const light = luminance(r.color.bg) > 0.35;
  heroEl.style.setProperty('--hero-bg', r.color.bg);
  heroEl.style.setProperty('--hero-ink', light ? '#1c1a17' : '#ede6da');
  seedEl.textContent = label;
  openEl.href = '/studio/#r=' + (await encodeRecipe({ ...r, meta: { ...r.meta, space: 'arte' } }));
}
void theme(heroRecipe, 'semilla: bermellón');

$('[data-hero-roll]')!.addEventListener('click', () => {
  const seed = freshSeed();
  heroRecipe = heroize(generate({ seed, space: 'arte', base: heroRecipe }));
  hero?.set(heroRecipe, { transition: true });
  void theme(heroRecipe, `semilla: ${seed} · ${archById(heroRecipe.meta.arch)?.name ?? ''}`);
});

$$('[data-scramble]').forEach((el, i) => scramble(el, { trigger: 'load', duration: 1100 + i * 350, chars: '░▒▓█#%*+=-:.', stagger: 'left' }));
$$('[data-scramble-view]').forEach(el => scramble(el, { trigger: 'view', duration: 900, chars: '#%*+=-:.01' }));

/* ---------- lazy demos ---------- */
function lazy(el: Element, start: () => void) {
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '300px' });
  io.observe(el);
}

function syntheticPhoto(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 600;
  const x = c.getContext('2d')!;
  const sky = x.createLinearGradient(0, 0, 0, 380);
  sky.addColorStop(0, '#0d1b3d'); sky.addColorStop(0.55, '#b34d4d'); sky.addColorStop(1, '#ffb36b');
  x.fillStyle = sky; x.fillRect(0, 0, 960, 380);
  const sun = x.createRadialGradient(560, 300, 10, 560, 300, 160);
  sun.addColorStop(0, '#fff6d6'); sun.addColorStop(0.35, '#ffd27a'); sun.addColorStop(1, 'rgba(255,160,90,0)');
  x.fillStyle = sun; x.beginPath(); x.arc(560, 300, 160, 0, Math.PI * 2); x.fill();
  const ridge = (base: number, amp: number, f: number, col: string) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, 600);
    for (let i = 0; i <= 960; i += 8) x.lineTo(i, base - amp * (Math.sin(i * f) * 0.6 + Math.sin(i * f * 2.7 + 1) * 0.3 + Math.sin(i * f * 6.1) * 0.1));
    x.lineTo(960, 600); x.fill();
  };
  ridge(330, 70, 0.006, '#3b2340'); ridge(365, 45, 0.011, '#231628'); ridge(390, 25, 0.02, '#120c18');
  const lake = x.createLinearGradient(0, 390, 0, 600);
  lake.addColorStop(0, '#6b3a4a'); lake.addColorStop(1, '#0a0d1c');
  x.fillStyle = lake; x.fillRect(0, 390, 960, 210);
  x.fillStyle = 'rgba(255,214,140,.55)';
  for (let y = 400; y < 600; y += 9) { const w = 170 * (1 - (y - 400) / 260); x.fillRect(560 - w / 2 + Math.sin(y) * 8, y, w, 3); }
  return c;
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
  const e = engine(cv, r, { maxPixelRatio: 1 });
  if (e && kind === 'media') e.setMedia('image', syntheticPhoto());
}));

/* terminal: real characters read back from the engine, printed as text */
const pre = $('[data-terminal]');
if (pre) lazy(pre, () => {
  const r = PRESETS.terminal.find(p => p.id === 'donut')!.make();
  const cols = 64, rows = 20, cw = 9, ch = 18;
  const off = document.createElement('canvas');
  let e: AsciiEngine | null = null;
  try {
    e = new AsciiEngine(off, r, { library: PATTERN_GLSL, fonts, fixedSize: { width: cols * cw, height: rows * ch, pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false });
  } catch { return; }
  let visible = false, t = 3;
  new IntersectionObserver(es => { visible = es.some(x => x.isIntersecting); }).observe(pre);
  const draw = () => {
    const g = e!.readGrid();
    const lines: string[] = [];
    for (let y = 0; y < g.rows; y++) lines.push(g.chars.slice(y * g.cols, (y + 1) * g.cols).join(''));
    pre.textContent = lines.join('\n');
  };
  e.renderAt(t);
  draw();
  if (!reduced) setInterval(() => { if (!visible || document.hidden) return; t += 0.08; e!.renderAt(t); draw(); }, 80);
});

/* pieces */
const typeEl = $('[data-type]');
if (typeEl) typewriter(typeEl, { phrases: ['descifrar()', 'maquina_de_escribir()', 'iman()', 'estela()', 'halo()'], typeSpeed: 60, hold: 1100 });
$$('[data-spin]').forEach(el => spinner(el, el.dataset.spin || 'braille'));

/* ---------- azar: a remembered history ---------- */
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
  const live = engine(azarCv, recipes[3], { maxPixelRatio: 1.25 });
  const thumbs = document.createElement('canvas');
  let te: AsciiEngine | null = null;
  try {
    te = new AsciiEngine(thumbs, recipes[0], { library: PATTERN_GLSL, fonts, fixedSize: { width: 640, height: 400, pixelRatio: 0.5 }, autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true });
    await te.ready();
  } catch { te = null; }
  const btns = recipes.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-label', `Resultado ${i + 1}: ${seeds[i].replace(/-/g, ' ')}`);
    b.innerHTML = `<span>${i + 1}</span>`;
    if (te) { te.set(r); te.renderAt(4); b.style.backgroundImage = `url(${thumbs.toDataURL('image/webp', 0.8)})`; }
    b.addEventListener('click', () => select(i));
    strip.appendChild(b);
    return b;
  });
  te?.destroy();
  function select(i: number) {
    btns.forEach((b, j) => b.setAttribute('aria-current', String(i === j)));
    live?.set(recipes[i], { transition: true });
    azarSeed!.textContent = `N.º ${i + 1}/7 · ${seeds[i]} · ${archById(recipes[i].meta.arch)?.name ?? ''}`;
  }
  select(3);
});

/* ---------- final ---------- */
const finalCv = $<HTMLCanvasElement>('.final-canvas');
if (finalCv) lazy(finalCv, () => {
  const r = preset('fondos', 'constelacion');
  r.interact.auto = true;
  engine(finalCv, r, { pointerTarget: 'window' });
});
const haloBtn = $('[data-halo]');
if (haloBtn) halo(haloBtn, { color: '#ff5b1f', cell: 10, radius: 110, idle: 0.1 });
