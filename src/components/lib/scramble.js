/**
 * Descifrar — el texto aparece a partir de caracteres aleatorios que se van «resolviendo».
 * Monotrama · sin dependencias.
 *
 *   scramble(document.querySelector('h1'), { trigger: 'view' });
 *
 * Accesible: el texto real queda disponible para lectores de pantalla.
 * Respeta prefers-reduced-motion (muestra el texto sin animar).
 * Funciona mejor con tipografías monoespaciadas.
 */
export const scrambleDefaults = {
  chars: '!<>-_\\/[]{}=+*^?#01',
  duration: 1200,          // ms hasta que se resuelve la última letra
  stagger: 'left',         // 'left' | 'right' | 'center' | 'random'
  trigger: 'view',         // 'load' | 'view' | 'hover' | 'loop'
  loopDelay: 2600,         // ms de pausa entre repeticiones (trigger 'loop')
  noiseColor: '',          // color de los caracteres aún sin resolver ('' = heredado)
};

export function scramble(el, options = {}) {
  const o = { ...scrambleDefaults, ...options };
  const text = el.dataset.mtText ?? el.textContent ?? '';
  el.dataset.mtText = text;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.textContent = '';
  const sr = document.createElement('span');
  sr.textContent = text;
  sr.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
  const vis = document.createElement('span');
  vis.setAttribute('aria-hidden', 'true');
  el.append(sr, vis);

  const letters = Array.from(text);
  const n = Math.max(1, letters.length - 1);
  const order = letters.map((_, i) => {
    if (o.stagger === 'right') return 1 - i / n;
    if (o.stagger === 'center') return Math.abs(i - n / 2) / (n / 2 || 1);
    if (o.stagger === 'random') return Math.random();
    return i / n;
  });
  const pool = Array.from(o.chars);
  const rnd = () => pool[(Math.random() * pool.length) | 0];
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let raf = 0, timer = 0, t0 = 0, seen = false;

  function frame(now) {
    const p = (now - t0) / o.duration;
    let html = '', noise = '';
    const flush = () => {
      if (noise) html += o.noiseColor ? `<span style="color:${o.noiseColor}">${esc(noise)}</span>` : esc(noise);
      noise = '';
    };
    letters.forEach((c, i) => {
      const start = order[i] * 0.72;
      if (c === ' ' || c === '\n' || p >= start + 0.28) { flush(); html += esc(c); }
      else if (p >= start - 0.2) noise += rnd();
      else noise += ' ';
    });
    flush();
    vis.innerHTML = html;
    if (p < 1) raf = requestAnimationFrame(frame);
    else {
      vis.textContent = text;
      if (o.trigger === 'loop') timer = setTimeout(play, o.loopDelay);
    }
  }

  function play() {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    if (reduced) { vis.textContent = text; return; }
    t0 = performance.now();
    raf = requestAnimationFrame(frame);
  }

  let io = null;
  const onEnter = () => play();
  if (o.trigger === 'hover') {
    vis.textContent = text;
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('focus', onEnter);
  } else if (o.trigger === 'view' && typeof IntersectionObserver !== 'undefined') {
    vis.textContent = '';
    io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !seen) { seen = true; play(); } }), { threshold: 0.4 });
    io.observe(el);
  } else {
    play();
  }

  return {
    play,
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      io?.disconnect();
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('focus', onEnter);
      el.textContent = text;
    },
  };
}
