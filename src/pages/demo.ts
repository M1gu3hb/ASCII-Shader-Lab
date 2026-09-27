/**
 * Live demo of a guide page. Loaded on demand by src/pages/main.ts (only near view and with WebGL 2),
 * so the engine never weighs on the first paint: the poster stays underneath until the first live frame.
 */
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/vt323/latin-400.css';
import { AsciiEngine } from '../engine/engine';
import { createFontLoader } from '../engine/fonts';
import { PATTERN_GLSL } from '../engine/glsl/patterns';
import { gridToText } from '../exporters/text';
import { paintLandscape, syntheticPhoto } from '../shared/sample';
import type { Guide } from '../shared/site';
import { EXAMPLES, gridSize, type Example } from './examples';

const fonts = createFontLoader({ google: false });
const frame = () => new Promise(r => requestAnimationFrame(r));

interface Playable { playing: () => boolean; toggle: () => void }

export async function mountDemo(el: HTMLElement, reduced: boolean) {
  const ex = EXAMPLES[el.dataset.demo as Guide['id']];
  if (!ex) return;
  const live = ex.grid ? await mountGrid(el, ex, reduced) : await mountCanvas(el, ex, reduced);
  if (!live) return;
  el.dataset.state = 'live';
  pauseButton(el, live);
}

async function mountCanvas(el: HTMLElement, ex: Example, reduced: boolean): Promise<Playable | null> {
  const box = el.querySelector<HTMLElement>('.ex-frame');
  if (!box) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'ex-live';
  canvas.setAttribute('aria-hidden', 'true');
  box.appendChild(canvas);
  let engine: AsciiEngine;
  try {
    engine = new AsciiEngine(canvas, ex.recipe(), {
      library: PATTERN_GLSL, fonts, observeVisibility: true, reducedMotion: reduced, maxPixelRatio: 1.5, pointerTarget: 'canvas',
    });
  } catch {
    canvas.remove();
    return null;
  }
  engine.time = ex.t;
  let scene: Playable | null = null;
  if (ex.media === 'photo') engine.setMedia('image', syntheticPhoto());
  if (ex.media === 'scene') scene = animateScene(engine, el, ex.t);
  await engine.ready();
  await frame(); await frame();
  return {
    playing: () => engine.isPlaying,
    toggle: () => { if (engine.isPlaying) engine.pause(); else engine.play(); scene?.toggle(); },
  };
}

/** The sample landscape in motion, uploaded as a video source while the demo plays and is on screen. */
function animateScene(engine: AsciiEngine, el: HTMLElement, t0: number): Playable {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 300;
  const x = c.getContext('2d')!;
  x.scale(0.5, 0.5);
  let t = t0, last = 0, drawn = 0, raf = 0, onScreen = true;
  const paint = () => { paintLandscape(x, t); engine.setMedia('video', c); };
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (!engine.isPlaying || !onScreen || document.hidden) return;
    t += dt;
    if (now - drawn > 33) { drawn = now; paint(); }
  };
  paint();
  new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); }).observe(el);
  if (engine.isPlaying) raf = requestAnimationFrame(tick);
  return {
    playing: () => raf !== 0,
    toggle: () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      else { last = 0; raf = requestAnimationFrame(tick); }
    },
  };
}

/** Terminal example: real characters read back from the engine and printed as text, like the TXT export. */
async function mountGrid(el: HTMLElement, ex: Example, reduced: boolean): Promise<Playable | null> {
  const pre = el.querySelector<HTMLElement>('pre');
  if (!pre || !ex.grid) return null;
  const r = ex.recipe();
  const { width, height } = gridSize(r, ex.grid.cols, ex.grid.rows);
  let engine: AsciiEngine;
  try {
    engine = new AsciiEngine(document.createElement('canvas'), r, {
      library: PATTERN_GLSL, fonts, fixedSize: { width, height, pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false,
    });
  } catch {
    return null;
  }
  await engine.ready();
  let t = ex.t, playing = !reduced, onScreen = true;
  const draw = () => { engine.renderAt(t); pre.textContent = gridToText(engine.readGrid()).replace(/\n$/, ''); };
  draw();
  new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); }).observe(pre);
  setInterval(() => {
    if (!playing || !onScreen || document.hidden) return;
    t += 0.08;
    draw();
  }, 80);
  return { playing: () => playing, toggle: () => { playing = !playing; } };
}

function pauseButton(el: HTMLElement, live: Playable) {
  const box = el.querySelector<HTMLElement>('.ex-frame');
  if (!box) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ex-pause';
  const label = () => { b.textContent = live.playing() ? 'Pausar' : 'Animar'; b.setAttribute('aria-label', live.playing() ? 'Pausar la animación del ejemplo' : 'Animar el ejemplo'); };
  b.addEventListener('click', () => { live.toggle(); label(); });
  label();
  box.appendChild(b);
}
