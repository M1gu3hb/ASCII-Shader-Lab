// Hecho con Monotrama · https://monotrama.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.
/**
 * Separador — una franja de caracteres entre secciones: un letrero que desfila con tu texto, o una
 * onda de densidad que respira. Se pausa al pasar el cursor, al enfocarla y con su botón de pausa.
 * Monotrama · sin dependencias.
 *
 *   ticker(document.querySelector('.separador'), { text: 'NUEVA COLECCIÓN · ENVÍO GRATIS' });
 *
 * - El texto se lee una vez, entero, para los lectores de pantalla; las copias que desfilan están ocultas.
 * - Un botón «Pausar» / «Reanudar» lo detiene cuando quieras: aparece al pasar el cursor, con el foco del
 *   teclado y mientras está en pausa; en pantallas táctiles se ve siempre, y tocar la franja también lo pausa.
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

/** The first colour behind `el` that is not transparent (the button sits on it, over the moving text). */
function backgroundOf(el) {
  for (let e = el; e; e = e.parentElement) {
    const c = getComputedStyle(e).backgroundColor;
    if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)) return c;
  }
  return 'Canvas';
}

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
  // the pause button: what it shows is what it is called («Pausar el letrero» / «Reanudar el letrero»)
  const touch = typeof matchMedia === 'function' && matchMedia('(hover: none), (pointer: coarse)').matches;
  const what = o.mode === 'letrero' ? 'el letrero' : 'la animación del separador';
  const btn = document.createElement('button');
  btn.type = 'button';
  const look = 'position:absolute;right:4px;top:50%;transform:translateY(-50%);font:inherit;font-size:12px;line-height:1.2;padding:4px 10px;border-radius:6px;border:1px solid currentColor;color:inherit;cursor:pointer;'
    + `background:${backgroundOf(el)};` + (touch ? 'min-height:24px;min-width:44px;' : '');
  el.append(sr, track);
  if (!reduced && o.mode !== 'puntos') el.append(btn);

  let raf = 0, x = 0, last = 0, t = 0, hover = false, focus = false, paused = false, visible = true, unit = 1;
  // shown with the cursor over the strip, with the keyboard on it, while paused, and always on touch screens
  function label() {
    const verb = paused ? 'Reanudar' : 'Pausar';
    btn.textContent = verb;
    btn.setAttribute('aria-label', `${verb} ${what}`);
    const shown = touch || hover || paused || document.activeElement === btn;
    btn.style.cssText = look + (shown ? 'opacity:1' : 'opacity:0;pointer-events:none');
  }
  label();
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
  const onEnter = e => { if (e.pointerType === 'mouse') { hover = true; label(); } };
  const onLeave = e => { if (e.pointerType === 'mouse') { hover = false; label(); } };
  const onFocusIn = e => { if (e.target !== btn) focus = true; else label(); };
  const onFocusOut = () => { focus = false; requestAnimationFrame(label); };
  const onBtn = () => {
    paused = !paused;
    label();
    kick();
  };
  // on a touch screen the whole strip is a big target: a tap on it pauses or resumes too
  const onTap = e => { if (touch && e.target !== btn && !reduced && o.mode !== 'puntos') onBtn(); };
  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('focusin', onFocusIn);
  el.addEventListener('focusout', onFocusOut);
  el.addEventListener('click', onTap);
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
      el.removeEventListener('click', onTap);
      el.innerHTML = prev;
    },
  };
}
