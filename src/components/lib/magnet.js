// Hecho con Monotrama · https://monotrama.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.
/**
 * Imán — las letras se fragmentan en caracteres y huyen del cursor; al alejarse, se recomponen.
 * Monotrama · sin dependencias.
 *
 *   magnet(document.querySelector('.titulo'), { radius: 90 });
 */
export const magnetDefaults = {
  radius: 90,           // px de alcance del cursor
  force: 26,            // px de desplazamiento máximo
  chars: '#%&*+=-:.',   // en qué se convierten las letras cercanas
  swap: 0.7,            // probabilidad de cambiar de glifo cerca del cursor (0..1)
  accent: '',           // color de las letras fragmentadas ('' = heredado)
};

export function magnet(el, options = {}) {
  const o = { ...magnetDefaults, ...options };
  const text = el.dataset.mtText ?? el.textContent ?? '';
  el.dataset.mtText = text;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.textContent = '';
  el.setAttribute('aria-label', text);
  const spans = Array.from(text).map(c => {
    const s = document.createElement('span');
    s.textContent = c;
    s.setAttribute('aria-hidden', 'true');
    s.style.cssText = 'display:inline-block;white-space:pre;will-change:transform;transition:color .2s';
    el.appendChild(s);
    return { s, c, x: 0, y: 0, cx: 0, cy: 0 };
  });
  if (reduced) return { destroy() { el.textContent = text; } };
  const pool = Array.from(o.chars);
  let px = -1e4, py = -1e4, raf = 0, active = false;

  const measure = () => spans.forEach(p => {
    const r = p.s.getBoundingClientRect();
    p.cx = r.left + r.width / 2 - p.x;
    p.cy = r.top + r.height / 2 - p.y;
  });
  function tick() {
    let moving = false;
    for (const p of spans) {
      if (p.c === ' ') continue;
      const dx = p.cx + p.x - px, dy = p.cy + p.y - py;
      const d = Math.hypot(dx, dy);
      const k = Math.max(0, 1 - d / o.radius);
      const tx = k > 0 ? (dx / (d || 1)) * o.force * k : 0, ty = k > 0 ? (dy / (d || 1)) * o.force * k : 0;
      p.x += (tx - p.x) * 0.2; p.y += (ty - p.y) * 0.2;
      if (Math.abs(tx - p.x) > 0.2 || Math.abs(ty - p.y) > 0.2) moving = true;
      p.s.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) rotate(${(p.x * 0.6).toFixed(1)}deg)`;
      const frag = k > 0.15 && Math.random() < o.swap * k;
      p.s.textContent = frag ? pool[(Math.random() * pool.length) | 0] : k > 0.15 ? p.s.textContent : p.c;
      p.s.style.color = k > 0.15 && o.accent ? o.accent : '';
    }
    raf = moving || active ? requestAnimationFrame(tick) : 0;
  }
  const onMove = e => { px = e.clientX; py = e.clientY; if (!raf) { measure(); raf = requestAnimationFrame(tick); } };
  const onEnter = () => { active = true; measure(); };
  const onLeave = () => { active = false; px = py = -1e4; if (!raf) raf = requestAnimationFrame(tick); };
  const target = el.parentElement ?? el;
  target.addEventListener('pointermove', onMove, { passive: true });
  target.addEventListener('pointerenter', onEnter);
  target.addEventListener('pointerleave', onLeave);
  addEventListener('scroll', measure, { passive: true });
  addEventListener('resize', measure);
  return {
    destroy() {
      cancelAnimationFrame(raf);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerenter', onEnter);
      target.removeEventListener('pointerleave', onLeave);
      removeEventListener('scroll', measure);
      removeEventListener('resize', measure);
      el.textContent = text;
      el.removeAttribute('aria-label');
    },
  };
}
