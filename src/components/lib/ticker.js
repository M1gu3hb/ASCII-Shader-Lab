// Hecho con Monotrama · https://monotrama.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.
/**
 * Separador — una franja de caracteres entre secciones: un letrero que desfila con tu texto, o una
 * onda de densidad que respira. Se pausa al pasar el cursor, al enfocarla y con su botón de pausa.
 * Monotrama · sin dependencias.
 *
 *   ticker(document.querySelector('.separador'), { text: 'NUEVA COLECCIÓN · ENVÍO GRATIS' });
 *
 * - El texto se lee una vez, entero, para los lectores de pantalla; las copias que desfilan están ocultas.
 * - Hay un botón «Pausar» (visible al enfocarlo con el teclado) para detenerlo cuando quieras.
 * - Con «reducir movimiento» no se mueve: queda quieto y completo.
 */
export const tickerDefaults = {
  text: 'TEJE LUZ CON CARACTERES',
  mode: 'letrero',          // 'letrero' (el texto desfila) | 'onda' (una onda de densidad) | 'puntos' (quieto)
  separator: ' ✦ ',         // entre repeticiones del texto
  speed: 50,                // px por segundo (negativo: hacia la derecha)
  ramp: ' .:-=+*#%@',       // para 'onda'
  color: '',                // '' = el color del texto
};

export function ticker(el, options = {}) {
  const o = { ...tickerDefaults, ...options };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prev = el.innerHTML;
  el.style.overflow = 'hidden';
  el.style.whiteSpace = 'nowrap';
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.textContent = '';
  const sr = document.createElement('span');
  sr.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
  sr.textContent = o.mode === 'letrero' ? o.text : '';
  const track = document.createElement('span');
  track.setAttribute('aria-hidden', 'true');
  track.style.cssText = `display:inline-block;will-change:transform;${o.color ? 'color:' + o.color : ''}`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Pausar';
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('aria-label', o.mode === 'letrero' ? 'Pausar el letrero' : 'Pausar la animación del separador');
  // out of sight until it has the keyboard focus
  const hide = 'position:absolute;right:4px;top:50%;transform:translateY(-50%);font:inherit;font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid currentColor;background:inherit;color:inherit;cursor:pointer;';
  btn.style.cssText = hide + 'opacity:0;pointer-events:none';
  btn.addEventListener('focus', () => { btn.style.cssText = hide + 'opacity:1'; });
  btn.addEventListener('blur', () => { btn.style.cssText = hide + 'opacity:0;pointer-events:none'; });
  el.append(sr, track);
  if (!reduced && o.mode !== 'puntos') el.append(btn);

  let raf = 0, x = 0, last = 0, t = 0, hover = false, focus = false, paused = false, visible = true, unit = 1;
  const chars = () => Math.max(8, Math.ceil(el.clientWidth / Math.max(4, charW())) + 4);
  let cw = 0;
  function charW() {
    if (cw) return cw;
    const probe = document.createElement('span');
    probe.textContent = '0000000000';
    probe.style.visibility = 'hidden';
    track.append(probe);
    cw = probe.getBoundingClientRect().width / 10 || 8;
    probe.remove();
    return cw;
  }
  function build() {
    if (o.mode === 'letrero') {
      const one = o.text + o.separator;
      track.textContent = one;
      unit = track.getBoundingClientRect().width || 1;
      const copies = Math.max(2, Math.ceil(el.clientWidth / unit) + 1);
      track.textContent = one.repeat(copies);
    } else draw();
  }
  function draw() {
    const n = chars(), ramp = Array.from(o.ramp);
    let s = '';
    for (let i = 0; i < n; i++) {
      if (o.mode === 'puntos') { s += i % 3 === 1 ? '·' : ' '; continue; }
      const v = 0.5 + 0.5 * Math.sin(i * 0.32 - t * 2.2) * Math.cos(i * 0.07 + t * 0.6);
      s += ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))];
    }
    track.textContent = s;
  }
  function tick(now) {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const still = paused || hover || focus;
    if (!still) {
      t += dt;
      if (o.mode === 'letrero') {
        x -= o.speed * dt;
        x = ((x % unit) - unit) % unit;
        track.style.transform = `translateX(${x.toFixed(2)}px)`;
      } else draw();
    }
    if (visible && !paused) raf = requestAnimationFrame(tick);
    else last = 0;
  }
  const kick = () => { if (!raf && !reduced && o.mode !== 'puntos') raf = requestAnimationFrame(tick); };
  const onEnter = () => { hover = true; };
  const onLeave = () => { hover = false; };
  const onFocusIn = e => { if (e.target !== btn) focus = true; };
  const onFocusOut = () => { focus = false; };
  const onBtn = () => {
    paused = !paused;
    btn.textContent = paused ? 'Seguir' : 'Pausar';
    btn.setAttribute('aria-pressed', String(paused));
    kick();
  };
  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('focusin', onFocusIn);
  el.addEventListener('focusout', onFocusOut);
  btn.addEventListener('click', onBtn);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { cw = 0; build(); }) : null;
  ro?.observe(el);
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible) kick(); }) : null;
  io?.observe(el);
  build();
  kick();

  return {
    get paused() { return paused; },
    pause(v = true) { if (paused !== v) onBtn(); },
    destroy() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      el.innerHTML = prev;
    },
  };
}
