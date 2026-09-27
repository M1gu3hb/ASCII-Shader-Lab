/**
 * Halo — un botón o tarjeta cuyo fondo se enciende con caracteres alrededor del cursor.
 * Canvas 2D ligero (sin WebGL): pensado para docenas de elementos en una misma página.
 * Monotrama · sin dependencias.
 *
 *   document.querySelectorAll('.boton').forEach(b => halo(b, { color: '#ff5b1f' }));
 */
export const haloDefaults = {
  ramp: ' .:-=+*#%@',
  cell: 9,                 // px
  radius: 70,              // px
  color: '#ff5b1f',
  idle: 0.12,              // brillo en reposo (0 = invisible)
  font: 'ui-monospace, Menlo, Consolas, monospace',
};

export function halo(el, options = {}) {
  const o = { ...haloDefaults, ...options };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.style.isolation = 'isolate';
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;border-radius:inherit';
  el.prepend(cv);
  const ctx = cv.getContext('2d');
  const ramp = Array.from(o.ramp);
  let px = -1e4, py = -1e4, on = 0, target = 0, raf = 0, t = 0, W = 0, H = 0, k = 1;

  const resize = () => {
    const r = el.getBoundingClientRect();
    k = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    draw();
  };
  const noise = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233 + t) * 43758.5453; return s - Math.floor(s); };
  function draw() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `600 ${o.cell * 1.2}px ${o.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = o.color;
    const cw = o.cell, chh = o.cell * 1.35;
    for (let y = chh / 2; y < H; y += chh) {
      for (let x = cw / 2; x < W; x += cw) {
        const d = Math.hypot(x - px, y - py) / o.radius;
        const v = Math.min(1, o.idle * (0.6 + 0.4 * noise(Math.floor(x / cw), Math.floor(y / chh))) + on * Math.max(0, 1 - d) * (0.75 + 0.25 * noise(x, y)));
        if (v < 0.08) continue;
        ctx.globalAlpha = Math.min(1, v * 1.3);
        ctx.fillText(ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))], x, y);
      }
    }
    ctx.globalAlpha = 1;
  }
  function tick() {
    on += (target - on) * 0.16;
    t += 0.02;
    draw();
    raf = Math.abs(target - on) > 0.01 || target > 0 ? requestAnimationFrame(tick) : 0;
  }
  const onMove = e => { const r = el.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; target = 1; if (!raf && !reduced) raf = requestAnimationFrame(tick); else if (reduced) { on = 1; draw(); } };
  const onLeave = () => { target = 0; if (!raf && !reduced) raf = requestAnimationFrame(tick); else if (reduced) { on = 0; draw(); } };
  el.addEventListener('pointermove', onMove, { passive: true });
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('focus', () => { px = W / 2; py = H / 2; target = 1; if (!raf) raf = requestAnimationFrame(tick); });
  el.addEventListener('blur', onLeave);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(el);
  resize();
  return { destroy() { cancelAnimationFrame(raf); ro?.disconnect(); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave); cv.remove(); } };
}
