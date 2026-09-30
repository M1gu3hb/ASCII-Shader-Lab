/**
 * Shared script of the guide pages, /licencia/ and 404: styles, fonts and — only when the example is
 * near view and after the page has loaded — the live demo (src/pages/demo.ts). It runs on the WebGL 2
 * engine, or on the basic engine (Canvas 2D) when the browser has no WebGL 2; the poster stays until
 * the first frame is drawn. The engine is a separate chunk that this file never imports statically.
 */
import '../shared/fonts.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './pages.css';
import { mountGuides } from '../landing/guias';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

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
    import('./demo').then(m => m.mountDemo(demo, reduced)).catch(() => { demo.dataset.state = 'poster'; });
  });
}

// «Otras guías» (and the 404's list): each guide's example on hover, focus or a first tap
mountGuides();
