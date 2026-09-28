// Hecho con Monotrama · https://monotrama.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.
/**
 * Foco — el fondo de una sección es una trama de caracteres casi apagada; donde está el cursor (o el
 * elemento que tiene el foco del teclado) se enciende una luz que la revela.
 * Monotrama · sin dependencias (Canvas 2D; dibuja sólo cuando algo cambia: el cursor, el foco, el tamaño,
 * y mientras hay luz, la trama que respira; sin nadie, la trama se queda quieta y no gasta nada).
 *
 *   spotlight(document.querySelector('.hero'), { texture: 'ondas' });
 *
 * - Decorativo: el lienzo va detrás del contenido (z-index -1 dentro de la sección) y está oculto para los
 *   lectores de pantalla. El contenido de la sección no cambia.
 * - Con el teclado, la luz va al elemento enfocado dentro de la sección.
 * - La trama respira sólo mientras la luz está encendida (nada se mueve solo más de unos instantes).
 * - Con «reducir movimiento» la trama no respira y la luz salta sin deslizarse.
 */
export const spotlightDefaults = {
  ramp: ' .:-=+*#%@',
  cell: 12,                 // px de ancho de cada carácter
  radius: 180,              // px del círculo de luz
  color: '#ff5b1f',         // color de los caracteres encendidos
  idle: 0.1,                // brillo de la trama sin luz (0 = invisible)
  texture: 'ondas',         // 'ondas' | 'ruido' | 'puntos' | 'diagonal': el dibujo que revela la luz
  font: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

export function spotlight(section, options = {}) {
  const o = { ...spotlightDefaults, ...options };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pos = section.style.position, iso = section.style.isolation;
  if (getComputedStyle(section).position === 'static') section.style.position = 'relative';
  section.style.isolation = 'isolate';
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1';
  section.prepend(cv);
  const ctx = cv.getContext('2d');
  const ramp = Array.from(o.ramp);
  let W = 0, H = 0, k = 1, x = -1e4, y = -1e4, tx = -1e4, ty = -1e4, on = 0, onT = 0, t = 0, raf = 0, last = 0, visible = true;

  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  function tex(cx, cy) {
    switch (o.texture) {
      case 'ruido': return hash(cx, cy + Math.floor(t * 2));
      case 'puntos': return (cx + cy) % 2 ? 0.25 : 0.9;
      case 'diagonal': return 0.5 + 0.5 * Math.sin((cx + cy * 1.6) * 0.55 - t * 1.2);
      default: return 0.5 + 0.5 * Math.sin(cx * 0.35 + Math.sin(cy * 0.21 + t * 0.6) * 2.2 - t * 0.8);
    }
  }
  function draw() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `600 ${Math.round(o.cell * 1.15)}px ${o.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = o.color;
    const cw = o.cell, ch = o.cell * 1.5, r2 = o.radius * o.radius;
    for (let cy = 0, py = ch / 2; py < H + ch; cy++, py += ch) {
      for (let cx = 0, px = cw / 2; px < W + cw; cx++, px += cw) {
        const d2 = (px - x) * (px - x) + (py - y) * (py - y);
        const light = on * Math.max(0, 1 - d2 / r2);
        const v = tex(cx, cy) * (o.idle + light * (1 - o.idle));
        if (v < 0.06) continue;
        ctx.globalAlpha = Math.min(1, 0.25 + v);
        ctx.fillText(ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))], px, py);
      }
    }
    ctx.globalAlpha = 1;
  }
  function tick(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    const e = reduced ? 1 : 1 - Math.exp(-dt * 9);
    x += (tx - x) * e; y += (ty - y) * e; on += (onT - on) * e;
    if (Math.abs(onT - on) <= 0.01) on = onT;
    // the texture breathes while the light is on (never with reduced motion): with nobody there, nothing moves
    const breathing = !reduced && o.idle > 0 && o.texture !== 'puntos' && on > 0;
    if (breathing) t += dt;
    draw();
    const moving = Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5 || Math.abs(onT - on) > 0.01;
    if (visible && (moving || breathing)) raf = requestAnimationFrame(tick);
    else last = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  const at = (px, py) => { if (on < 0.01 || reduced) { x = px; y = py; } tx = px; ty = py; onT = 1; kick(); };

  function resize() {
    const b = section.getBoundingClientRect();
    k = Math.min(2, devicePixelRatio || 1);
    W = b.width; H = b.height;
    cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    draw();
  }
  const onMove = e => { const b = section.getBoundingClientRect(); at(e.clientX - b.left, e.clientY - b.top); };
  const onLeave = () => { onT = 0; kick(); };
  const onFocus = e => {
    const b = section.getBoundingClientRect(), r = e.target.getBoundingClientRect();
    at(r.left + r.width / 2 - b.left, r.top + r.height / 2 - b.top);
  };
  const onBlur = e => { if (!section.contains(e.relatedTarget)) { onT = 0; kick(); } };
  section.addEventListener('pointermove', onMove, { passive: true });
  section.addEventListener('pointerleave', onLeave);
  section.addEventListener('focusin', onFocus);
  section.addEventListener('focusout', onBlur);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(section);
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible) kick(); }) : null;
  io?.observe(section);
  resize();
  kick();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      section.removeEventListener('pointermove', onMove);
      section.removeEventListener('pointerleave', onLeave);
      section.removeEventListener('focusin', onFocus);
      section.removeEventListener('focusout', onBlur);
      cv.remove();
      section.style.position = pos;
      section.style.isolation = iso;
    },
  };
}
