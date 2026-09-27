/**
 * Estela — el cursor (o el dedo) deja caracteres que se desvanecen por una rampa de densidad.
 * Monotrama · sin dependencias.
 *
 *   trail(document.body, { color: '#ff5b1f' });
 */
export const trailDefaults = {
  ramp: '@#%*+=-:. ',     // de recién nacido a desvanecido
  size: 16,               // px
  life: 900,              // ms
  spacing: 14,            // px entre caracteres
  spread: 10,             // px de dispersión
  gravity: 0.02,          // px/ms² hacia abajo (negativo = sube)
  color: '#ff5b1f',
  font: 'ui-monospace, Menlo, Consolas, monospace',
};

export function trail(container = document.body, options = {}) {
  const o = { ...trailDefaults, ...options };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fixed = container === document.body || container === document.documentElement;
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = `position:${fixed ? 'fixed' : 'absolute'};inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483000`;
  if (!fixed && getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(cv);
  const ctx = cv.getContext('2d');
  const ramp = Array.from(o.ramp);
  const parts = [];
  let lx = null, ly = null, raf = 0, last = 0;
  const dpr = () => Math.min(2, devicePixelRatio || 1);

  function resize() {
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr());
    cv.height = Math.round(r.height * dpr());
  }
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(cv);

  function spawn(x, y) {
    parts.push({ x: x + (Math.random() - 0.5) * o.spread, y: y + (Math.random() - 0.5) * o.spread, vx: (Math.random() - 0.5) * 0.04, vy: (Math.random() - 0.7) * 0.04, t: 0 });
    if (parts.length > 400) parts.shift();
  }
  function onMove(e) {
    if (reduced) return;
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (lx === null) { lx = x; ly = y; }
    const d = Math.hypot(x - lx, y - ly);
    const n = Math.floor(d / o.spacing);
    for (let i = 1; i <= n; i++) spawn(lx + ((x - lx) * i) / n, ly + ((y - ly) * i) / n);
    if (n) { lx = x; ly = y; }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  const onLeave = () => { lx = ly = null; };
  function tick(now) {
    const dt = Math.min(50, now - last);
    last = now;
    const k = dpr();
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.font = `600 ${o.size * k}px ${o.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = o.color;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= o.life) { parts.splice(i, 1); continue; }
      p.vy += o.gravity * dt * 0.01;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const f = p.t / o.life;
      ctx.globalAlpha = 1 - f * f;
      ctx.fillText(ramp[Math.min(ramp.length - 1, Math.floor(f * ramp.length))], p.x * k, p.y * k);
    }
    ctx.globalAlpha = 1;
    raf = parts.length ? requestAnimationFrame(tick) : 0;
  }
  const target = fixed ? window : container;
  target.addEventListener('pointermove', onMove, { passive: true });
  (fixed ? document : container).addEventListener('pointerleave', onLeave);
  return {
    destroy() {
      cancelAnimationFrame(raf);
      target.removeEventListener('pointermove', onMove);
      (fixed ? document : container).removeEventListener('pointerleave', onLeave);
      ro?.disconnect();
      cv.remove();
    },
  };
}
