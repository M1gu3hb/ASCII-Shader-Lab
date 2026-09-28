// Hecho con Monotrama · https://monotrama.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.
/**
 * Revelar — una imagen convertida en caracteres que deja ver la foto original bajo el cursor (o el dedo),
 * y entera cuando el enlace que la contiene recibe el foco del teclado.
 * Monotrama · sin dependencias (Canvas 2D).
 *
 *   reveal(document.querySelector('.foto'), { radius: 120 });
 *
 * - La <img> original se queda en la página: su texto alternativo, su tamaño y su enlace no cambian.
 *   Los caracteres son una capa decorativa encima (aria-hidden).
 * - Para leer sus píxeles, la imagen tiene que venir de tu mismo dominio, o de un servidor que la entregue
 *   con CORS (la cabecera Access-Control-Allow-Origin) y llevar crossorigin="anonymous". Una imagen de otro
 *   sitio que no envía esa cabecera no se carga con ese atributo: quítaselo y se verá la foto tal cual,
 *   sin caracteres (se avisa en la consola).
 * - Con «reducir movimiento» no hay transiciones: la foto aparece o se oculta al instante.
 */
export const revealDefaults = {
  ramp: ' .:-=+*#%@',
  cell: 8,                  // px de ancho de cada carácter (el alto es 1,6 veces)
  radius: 110,              // px del círculo que deja ver la foto
  color: '',                // '' = el color de la propia imagen; o un color fijo
  background: '#0b0a09',    // detrás de los caracteres
  font: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  trigger: 'hover',         // 'hover' (círculo bajo el cursor) | 'focus' (sólo con el foco o al pulsar)
};

export function reveal(img, options = {}) {
  const o = { ...revealDefaults, ...options };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the characters lie over the picture, which keeps its place and size in the layout
  const host = img.parentElement;
  const hostPos = host.style.position;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;pointer-events:none;border-radius:' + getComputedStyle(img).borderRadius;
  img.after(cv);
  const ctx = cv.getContext('2d');
  const ramp = Array.from(o.ramp);
  const focusEl = img.closest('a, button, [tabindex]') || img;
  let W = 0, H = 0, k = 1, cols = 0, rows = 0, cells = null, px = -1e4, py = -1e4, r = 0, target = 0, all = 0, allTarget = 0, raf = 0, ok = true;

  function sample() {
    const cw = o.cell, ch = o.cell * 1.6;
    cols = Math.max(1, Math.round(W / cw)); rows = Math.max(1, Math.round(H / ch));
    const s = document.createElement('canvas');
    s.width = cols; s.height = rows;
    const sx = s.getContext('2d', { willReadFrequently: true });
    // the picture as it is drawn in the page (object-fit: cover, the usual case)
    const iw = img.naturalWidth, ih = img.naturalHeight, sc = Math.max(cols / iw, rows / ih);
    sx.drawImage(img, (cols - iw * sc) / 2, (rows - ih * sc) / 2, iw * sc, ih * sc);
    try {
      cells = sx.getImageData(0, 0, cols, rows).data;
      ok = true;
    } catch {
      // another site's picture without CORS: its pixels cannot be read
      cells = null;
      ok = false;
      console.warn('[reveal] No se pueden leer los píxeles de esta imagen (otro dominio sin CORS): se muestra tal cual.');
    }
  }

  function draw() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!ok || !cells) { cv.style.display = 'none'; return; }
    cv.style.display = '';
    const cw = W / cols, ch = H / rows;
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, W, H);
    ctx.font = `600 ${Math.round(ch * 0.8)}px ${o.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const l = (cells[i] * 0.299 + cells[i + 1] * 0.587 + cells[i + 2] * 0.114) / 255;
        const g = ramp[Math.min(ramp.length - 1, Math.floor(l * ramp.length))];
        if (g === ' ') continue;
        ctx.fillStyle = o.color || `rgb(${cells[i]},${cells[i + 1]},${cells[i + 2]})`;
        ctx.fillText(g, x * cw + cw / 2, y * ch + ch / 2);
      }
    }
    // the photo shows through: a circle under the pointer, or all of it
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    if (all > 0.001) { ctx.globalAlpha = Math.min(1, all); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (r > 0.5) {
      const g = ctx.createRadialGradient(px, py, r * 0.55, px, py, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function tick() {
    raf = 0;
    const step = reduced ? 1 : 0.18;
    r += (target - r) * step;
    all += (allTarget - all) * step;
    if (Math.abs(target - r) < 0.5) r = target;
    if (Math.abs(allTarget - all) < 0.005) all = allTarget;
    draw();
    if (r !== target || all !== allTarget) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  function resize() {
    W = img.offsetWidth; H = img.offsetHeight;
    if (!W || !H || !img.naturalWidth) return;
    k = Math.min(2, devicePixelRatio || 1);
    Object.assign(cv.style, { left: img.offsetLeft + 'px', top: img.offsetTop + 'px', width: W + 'px', height: H + 'px' });
    cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    sample();
    draw();
  }

  const onMove = e => {
    if (o.trigger !== 'hover') return;
    const b = img.getBoundingClientRect();
    px = e.clientX - b.left; py = e.clientY - b.top; target = o.radius;
    kick();
  };
  const onLeave = () => { target = 0; kick(); };
  const onDown = () => { if (o.trigger === 'focus') { allTarget = allTarget ? 0 : 1; kick(); } };
  const onFocus = () => { allTarget = 1; kick(); };
  const onBlur = () => { allTarget = 0; kick(); };
  img.addEventListener('pointermove', onMove, { passive: true });
  img.addEventListener('pointerleave', onLeave);
  img.addEventListener('pointerdown', onDown);
  focusEl.addEventListener('focusin', onFocus);
  focusEl.addEventListener('focusout', onBlur);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(img);
  if (img.complete && img.naturalWidth) resize(); else img.addEventListener('load', resize, { once: true });

  return {
    /** Shows (1) or hides (0) the whole photo, as keyboard focus does. */
    show(v = 1) { allTarget = v; kick(); },
    destroy() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      img.removeEventListener('pointermove', onMove);
      img.removeEventListener('pointerleave', onLeave);
      img.removeEventListener('pointerdown', onDown);
      focusEl.removeEventListener('focusin', onFocus);
      focusEl.removeEventListener('focusout', onBlur);
      cv.remove();
      host.style.position = hostPos;
    },
  };
}
