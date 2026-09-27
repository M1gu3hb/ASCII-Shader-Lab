/**
 * Shared script of the guide pages, /licencia/ and 404: styles, fonts and — only when the example is
 * near view, after the page has loaded, and the browser has WebGL 2 — the live demo (src/pages/demo.ts).
 * The engine is a separate chunk that this file never imports statically.
 */
import '../shared/fonts.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './pages.css';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));

function whenNear(el: Element, run: () => void) {
  const watch = () => {
    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting)) return;
      io.disconnect();
      idle(run);
    }, { rootMargin: '200px 0px' });
    io.observe(el);
  };
  if (document.readyState === 'complete') watch();
  else addEventListener('load', watch, { once: true });
}

const demo = document.querySelector<HTMLElement>('[data-demo]');
if (demo && !saveData) {
  whenNear(demo, () => {
    if (!hasWebGL2()) { demo.dataset.state = 'poster'; return; }
    import('./demo').then(m => m.mountDemo(demo, reduced)).catch(() => { demo.dataset.state = 'poster'; });
  });
}
