/**
 * The landing's motion, «descomponer y recomponer», on top of src/shared/glyphfx.ts:
 *  - headings resolve out of the character ramp when they scroll into view (the real text stays in the
 *    DOM the whole time; the scramble is an aria-hidden copy drawn over it);
 *  - blocks weave in (a short rise and fade) as their section arrives;
 *  - labels that change swap through a quick scramble.
 * Everything is decoration over content that is already there: nothing waits for it, it is skipped for
 * content already on screen when the script runs (no flash), and it is off under «reduce motion».
 */
import { motionLevel, scrambleFrame, type MotionLevel } from '../shared/glyphfx';

export const level: MotionLevel = motionLevel();
export const moving = level !== 'none';

const GLYPHS = '#%*+=-:.';
const belowFold = (el: Element) => el.getBoundingClientRect().top > innerHeight * 0.92;

function onceInView(el: Element, run: () => void, threshold = 0.35) {
  const io = new IntersectionObserver(es => {
    if (!es.some(e => e.isIntersecting)) return;
    io.disconnect();
    run();
  }, { threshold });
  io.observe(el);
}

/** Resolves `el`'s text out of the ramp (≈0.8 s, half in low motion). Serif accents (<em>) stay as they are. */
export function resolveText(el: HTMLElement, duration = 820) {
  if (!moving || el.classList.contains('resolving')) return;
  const ghost = document.createElement('span');
  ghost.innerHTML = el.innerHTML;
  ghost.className = 'resolve-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  const ink = getComputedStyle(el).color;
  ghost.style.color = ink;
  ghost.querySelectorAll('em').forEach((em, i) => { (em as HTMLElement).style.color = getComputedStyle(el.querySelectorAll('em')[i]).color; });
  const nodes: Array<{ n: Text; text: string }> = [];
  const walk = document.createTreeWalker(ghost, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if ((n.parentElement?.closest('em'))) continue;
    nodes.push({ n: n as Text, text: n.textContent ?? '' });
  }
  const d = duration * (level === 'low' ? 0.5 : 1);
  // the first frame is already scrambled: the final text never flashes before it resolves
  nodes.forEach(({ n, text }, i) => { n.textContent = scrambleFrame(text, 0, { glyphs: GLYPHS, seed: i + 1 }); });
  el.classList.add('resolving');
  el.appendChild(ghost);
  const t0 = performance.now();
  let tick = 0;
  const frame = (now: number) => {
    const p = Math.max(0, now - t0) / d;
    tick++;
    nodes.forEach(({ n, text }, i) => { n.textContent = scrambleFrame(text, p, { glyphs: GLYPHS, seed: i + 1, tick: tick >> 1 }); });
    if (p < 1) requestAnimationFrame(frame);
    else { ghost.remove(); el.classList.remove('resolving'); }
  };
  requestAnimationFrame(frame);
}

/** Headings marked data-resolve resolve when they come into view (only those not on screen yet). */
export function resolveHeadings(root: ParentNode = document) {
  if (!moving) return;
  root.querySelectorAll<HTMLElement>('[data-resolve]').forEach(el => {
    if (!belowFold(el)) return;
    onceInView(el, () => resolveText(el), 0.6);
  });
}

/** Blocks marked data-weave rise into place as they arrive, one after another. */
export function weaveIn(root: ParentNode = document) {
  if (!moving) return;
  root.querySelectorAll<HTMLElement>('[data-weave]').forEach(group => {
    const items = group.dataset.weave === 'self' ? [group] : Array.from(group.children) as HTMLElement[];
    const pending = items.filter(belowFold);
    if (!pending.length) return;
    pending.forEach((el, i) => {
      el.classList.add('rv', 'pre');
      el.style.transitionDelay = `${Math.min(i, 8) * (level === 'low' ? 30 : 70)}ms`;
    });
    onceInView(group, () => pending.forEach(el => {
      el.classList.remove('pre');
      el.addEventListener('transitionend', () => { el.style.transitionDelay = ''; }, { once: true });
    }), 0.12);
  });
  // section rules draw across as their head arrives
  root.querySelectorAll<HTMLElement>('.sec-head').forEach(h => {
    if (!belowFold(h)) return;
    h.classList.add('rv-rule', 'pre');
    onceInView(h, () => h.classList.remove('pre'), 0.2);
  });
}

/**
 * Replaces a short label's text through a quick scramble (≈0.3 s). Meant for visual labels (aria-hidden or
 * with an accessible name elsewhere); the final text is set at the end, or at once without motion.
 */
const running = new WeakMap<Element, number>();
export function swapText(el: HTMLElement, text: string, duration = 300) {
  cancelAnimationFrame(running.get(el) ?? 0);
  if (!moving || !el.isConnected) { el.textContent = text; return; }
  const d = duration * (level === 'low' ? 0.5 : 1), t0 = performance.now();
  let tick = 0;
  const frame = (now: number) => {
    const p = Math.max(0, now - t0) / d;
    el.textContent = scrambleFrame(text, p, { glyphs: GLYPHS, tick: tick++ >> 1 });
    if (p < 1) running.set(el, requestAnimationFrame(frame));
  };
  running.set(el, requestAnimationFrame(frame));
}
