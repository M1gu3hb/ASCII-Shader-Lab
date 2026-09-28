import { scrambleFrame } from '../../shared/glyphfx';
import { level } from './level';
import '../css/motion.css';

/**
 * A label that changes resolves out of ramp glyphs. The element keeps its real text all along (for
 * screen readers, find-in-page, layout and anything that reads it): while the label resolves, its own
 * glyphs are made transparent and a copy drawn on top (aria-hidden, no pointer events) shows the frames.
 * Nothing waits for it. Under reduced motion nothing happens; under low motion it is half as long.
 */

const GLYPHS = '#%*+=-:.';
const live = new WeakMap<HTMLElement, () => void>();

export interface ScrambleOptions {
  /** ms at full motion (≈220 for a label, ≈320 for a title) */
  duration?: number;
  glyphs?: string;
}

export function scrambleEl(el: HTMLElement | null | undefined, o: ScrambleOptions = {}) {
  if (!el || !el.isConnected) return;
  live.get(el)?.();
  const lv = level();
  if (lv === 'none') return;
  const text = el.textContent ?? '';
  if (!text.trim() || text.length > 120) return;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || +cs.opacity === 0) return;
  // only what is in view: a label scrolled out of its panel (or a list) is left alone
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    const o = getComputedStyle(a);
    if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
    const b = a.getBoundingClientRect();
    if (r.top < b.top - 1 || r.bottom > b.bottom + 1 || r.left < b.left - 1 || r.right > b.right + 1) return;
  }
  const duration = (o.duration ?? 220) * (lv === 'low' ? 0.5 : 1);
  const ov = document.createElement('span');
  ov.setAttribute('aria-hidden', 'true');
  ov.className = 'mt-scr';
  const s = ov.style;
  s.position = 'fixed';
  s.left = r.left + 'px'; s.top = r.top + 'px'; s.width = Math.ceil(r.width + 1) + 'px'; s.height = Math.ceil(r.height) + 'px';
  s.fontFamily = cs.fontFamily; s.fontSize = cs.fontSize; s.fontWeight = cs.fontWeight; s.fontStyle = cs.fontStyle;
  s.lineHeight = cs.lineHeight; s.letterSpacing = cs.letterSpacing; s.textTransform = cs.textTransform;
  s.color = cs.color; s.textAlign = cs.textAlign === 'center' ? 'center' : cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : 'left';
  s.whiteSpace = cs.whiteSpace === 'normal' ? 'normal' : 'pre';
  s.overflow = 'visible'; s.pointerEvents = 'none'; s.zIndex = '2147483000'; s.margin = '0'; s.padding = '0';
  s.fontVariantLigatures = 'none';
  (el.closest('dialog[open]') ?? document.body).appendChild(ov);
  el.setAttribute('data-scr', '');
  const seed = Math.floor(Math.random() * 997);
  let raf = 0, t0 = 0, n = 0;
  const stop = () => {
    cancelAnimationFrame(raf);
    ov.remove();
    el.removeAttribute('data-scr');
    if (live.get(el) === stop) live.delete(el);
  };
  live.set(el, stop);
  const frame = (now: number) => {
    if (!t0) t0 = now;
    const p = (now - t0) / duration;
    if (p >= 1 || !el.isConnected) { stop(); return; }
    // the real text may change again meanwhile: always resolve towards what it says now
    ov.textContent = scrambleFrame(el.textContent ?? text, p, { seed, tick: n++ >> 1, glyphs: o.glyphs ?? GLYPHS });
    raf = requestAnimationFrame(frame);
  };
  frame(performance.now());
}
